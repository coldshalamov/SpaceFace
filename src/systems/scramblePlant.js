// PL-04 Scramble plant — When cargo spills in a lane, nearby civilians each grab a pod
// and scatter; the owner hails for help.
// What the player can do: Help the owner, join the scramble, or grab the thieves.
//
// Rebuild of ac34b298 (reverted 8069dd80, review 2026-11-12-9615eb79):
// - A grabbed pod is carried as DATA on the civilian ({commodityId, amount}); the pod
//   entity leaves the world through helpers.removeEntity — never a player's
//   pickup:collected, never a bare alive=false.
// - Killing or Shoving a carrier spawns a FRESH pod through the canonical spawn helper
//   (spawnJettisonedCargoPod → helpers.spawnEntity → allocateEntityId). A stored numeric
//   id is never reused to find or revive an entity; occupantGenerationOf proves an id
//   still names the same body before any stored-id lookup is trusted.
// - This module emits only its own traffic:scramble* events plus bark:triggered; the
//   spoken lines go through helpers.voice.say like every shipped plant.
//
// Invariants:
// - Deterministic: state.simTime only; no Math.random() or Date.now().
// - Single intent writer: mixed into traffic.js as scramblePlantOps; motion rides
//   trafficReactionLease (requestTrafficReaction / releaseTrafficReaction), which routes
//   job hulls through helpers.npcJobs and ambient hulls through data.intent.
// - Voice bounds (plant rule): every line is eight words or fewer.
//   Owner hail:  "Stop them! That's my cargo!"        (5 words)
//   Thief drop:  "Take it! I'm out!"                  (4 words)
//   Owner thanks:"Much obliged! You saved my haul."   (6 words)

import { occupantGenerationOf } from '../core/entity.js';
import { requestTrafficReaction, releaseTrafficReaction } from './trafficReactionLease.js';
import { spawnJettisonedCargoPod } from './lootShards.js';

export const SCRAMBLE_PLANT_ACTIVE_EVENT = 'traffic:scrambleActive';
export const SCRAMBLE_HAIL_EVENT = 'traffic:scrambleHail';
export const SCRAMBLE_POD_GRABBED_EVENT = 'traffic:scramblePodGrabbed';
export const SCRAMBLE_POD_DROPPED_EVENT = 'traffic:scramblePodDropped';
export const SCRAMBLE_THIEF_SCARED_EVENT = 'traffic:scrambleThiefScared';
export const SCRAMBLE_OWNER_THANKS_EVENT = 'traffic:scrambleOwnerThanks';
export const SCRAMBLE_RESOLVED_EVENT = 'traffic:scrambleResolved';

export const SCRAMBLE_TUNING = Object.freeze({
  maxNoticeDistWu: 450,       // civilians within 450 WU notice the spill
  grabDistanceWu: 24,         // distance within which a civilian scoops the pod
  scatterDurationS: 15.0,     // flee duration with the pod (s)
  scaredDurationS: 8.0,       // flee duration after dropping the pod / being hit (s)
  cooldownS: 45.0,            // cooldown between scramble incidents (s)
  maxThieves: 3,              // at most 3 nearby civilians scramble
  spillScanRadiusWu: 350,     // loose pods this far from the spill count as spilled
  dropPodRadius: 6,           // HAULER_SPILL_POD_RADIUS: a dropped pod is an ordinary spill pod
  memoryCap: 48,
});

export const SCRAMBLE_HAIL_LINE = "Stop them! That's my cargo!";
export const SCRAMBLE_THANKS_LINE = 'Much obliged! You saved my haul.';
export const SCRAMBLE_THIEF_DROP_LINE = "Take it! I'm out!";

// entity:destroyed also fires on mass teardown (save restore, run reset); a pod spawn has
// no business mutating a dying roster — the carried cargo goes down with the wreck.
const TEARDOWN_DESTROY_REASONS = new Set(['save_restore', 'run_reset', 'sector_transition']);

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const CIVILIAN_ROLES = new Set([
  'hauler', 'courier', 'miner', 'trader', 'tourist', 'tug',
  'ore_carrier', 'prospector', 'civilian', 'fleeing_trader',
  'shuttle', 'salvor', 'tender', 'sweeper',
]);

/** True when the entity is an eligible civilian ship (not law, not hostile). */
export function isCivilianShip(entity) {
  if (!entity || entity.type !== 'ship' || entity.alive === false) return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  if (ai.lawful === true) return false;
  const role = String(
    data.trafficRole || data.role || data.presentationRole || ai.role || ai.archetype || '',
  ).toLowerCase();
  if (role.includes('patrol') || role.includes('police') || role.includes('security') || role.includes('customs')) {
    return false;
  }
  if (entity.team === 1 || ai.hostile === true || data.isHostile === true) return false;
  if (entity.team === 2 || ai.spawnContext === 'convoy_civilian') return true;
  for (const word of CIVILIAN_ROLES) {
    if (role.includes(word)) return true;
  }
  return false;
}

export function isEntityDisabled(entity) {
  if (!entity || entity.alive === false) return true;
  const data = entity.data || {};
  if (data.disabled || data.derelict || data.engineDead || data.deadInWater || data.surrendered) return true;
  if (entity.flags && (entity.flags.disabled || entity.flags.derelict)) return true;
  if (data.hp != null && data.maxHp && data.hp <= data.maxHp * 0.25) return true;
  return false;
}

/**
 * True when the entity is a loose scoopable cargo pod — both real spill shapes:
 * jettisoned payload pods (trafficRoleOps, cargo.js) and freight-custody pickups
 * (encounterDirector.spawnFreightPickup). Payloads that are not cargo (cut panels,
 * salvage) are not scramble targets.
 */
export function isLooseCargoPod(entity) {
  if (!entity || entity.alive === false || !entity.pos) return false;
  if (entity.type !== 'pickup' && entity.type !== 'payload') return false;
  const data = entity.data;
  return !!(data && (data.kind === 'cargo' || data.jettisonedCargo === true));
}

export const scramblePlantOps = {
  _initScramblePlant(ctx = {}) {
    this._scrambleMemory = new Map();
    this._activeScrambleIncident = null;
    this._scrambleCooldownUntil = -Infinity;

    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('freight:cargoSpilled', (p) => this._onScrambleCargoSpilled(p));
      this.bus.on('combat:hitstunImpulse', (p) => this._onScrambleThiefHit(p));
      this.bus.on('entity:killed', (p) => this._handleScrambleEntityDeath(p));
      this.bus.on('entity:destroyed', (p) => this._handleScrambleEntityDeath(p));
      this.bus.on('pickup:collected', (p) => this._onScramblePickupCollected(p));
      this.bus.on('sector:exit', () => this._resetScramblePlant());
      this.bus.on('save:loaded', () => this._resetScramblePlant());
    }
  },

  _resetScramblePlant() {
    if (this._scrambleMemory instanceof Map) this._scrambleMemory.clear();
    this._activeScrambleIncident = null;
    this._scrambleCooldownUntil = -Infinity;
  },

  _getScrambleMemory() {
    if (!(this._scrambleMemory instanceof Map)) this._scrambleMemory = new Map();
    return this._scrambleMemory;
  },

  _scrambleBark(entityId, voiceId, text, ttl) {
    if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
      this.helpers.voice.say({ channel: 'bark', text, kind: 'traffic', ttl, id: voiceId });
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('bark:triggered', {
        entityId,
        situation: 'scramble',
        text,
        reason: 'plant:PL-04',
        t: finite(this.state && this.state.simTime, 0),
      });
    }
  },

  /**
   * Resolve a remembered pod id to the live pod ONLY while it still names the same
   * occupant. Numeric ids recycle through freeIds; a stale id can silently alias an
   * unrelated body one sweep later — this is the check the reverted build skipped.
   */
  _scrambleLivePod(incident, podId) {
    if (podId == null || !incident) return null;
    const state = this.state;
    const pod = (state && state.entities && typeof state.entities.get === 'function')
      ? state.entities.get(podId)
      : null;
    if (!pod || !isLooseCargoPod(pod)) return null;
    const recordedGen = incident.podGens && incident.podGens.get(podId);
    const liveGen = occupantGenerationOf(pod);
    if (recordedGen != null && liveGen != null && recordedGen !== liveGen) return null;
    return pod;
  },

  /** Pick the next unclaimed live pod in the incident, or null. Generation-checked. */
  _scrambleRetarget(incident, row) {
    if (!incident || !Array.isArray(incident.podIds)) return null;
    for (const podId of incident.podIds) {
      if (podId === row.targetPodId) continue;
      if (incident.podClaims.has(podId)) continue;
      const pod = this._scrambleLivePod(incident, podId);
      if (!pod) continue;
      incident.podClaims.delete(row.targetPodId);
      row.targetPodId = podId;
      incident.podClaims.set(podId, row.entityId);
      return pod;
    }
    return null;
  },

  /**
   * Put a carried pod back in the world as a FRESH entity: the canonical spawn helper
   * allocates a new id, stamps a new occupant generation, indexes and publishes the body.
   * Returns the spawned pod or null when the spawn helper could not place it.
   */
  _dropScrambleCargo(thief, row, pos, now, cause) {
    const cargo = row.stolenCargo;
    if (!cargo) return null;
    const state = this.state;
    const pod = spawnJettisonedCargoPod(state, {
      pos: { x: finite(pos && pos.x), z: finite(pos && pos.z) },
      vel: { x: 0, z: 0 },
      radius: cargo.radius || SCRAMBLE_TUNING.dropPodRadius,
      commodityId: cargo.commodityId,
      amount: cargo.amount,
      factionId: row.factionId || (thief && thief.factionId) || 'faction_free',
      ownerId: row.ownerId != null ? row.ownerId : row.carrierId,
      ownerName: row.ownerName || null,
    }, this.helpers);
    row.stolenCargo = null;
    if (thief && thief.data && thief.data.stolenCargo) delete thief.data.stolenCargo;
    if (!pod) return null;

    const incident = this._activeScrambleIncident;
    if (incident && !incident.resolved) {
      incident.droppedCount = (incident.droppedCount || 0) + 1;
      // The dropped pod is loose spilled cargo again: other still-seeking thieves can
      // scramble for it like any pod of the original spill.
      incident.podIds.push(pod.id);
      if (incident.podGens) incident.podGens.set(pod.id, occupantGenerationOf(pod));
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(SCRAMBLE_POD_DROPPED_EVENT, {
        thiefId: row.entityId,
        podId: pod.id,
        incidentId: row.incidentId,
        commodityId: cargo.commodityId,
        amount: cargo.amount,
        cause,
        pos: { x: pod.pos.x, z: pod.pos.z },
        t: now,
      });
    }
    return pod;
  },

  _onScrambleCargoSpilled(payload) {
    if (!payload) return;
    const state = this.state;
    if (!state || (state.mode && state.mode !== 'flight')) return;

    const now = finite(state.simTime, 0);
    if (now < this._scrambleCooldownUntil) return;

    const carrierId = payload.carrierId ?? payload.ownerId ?? payload.entityId ?? null;
    const carrier = (carrierId != null && state.entities && typeof state.entities.get === 'function')
      ? state.entities.get(carrierId)
      : null;

    let spillPos = null;
    if (payload.pos && Number.isFinite(payload.pos.x) && Number.isFinite(payload.pos.z)) {
      spillPos = { x: payload.pos.x, z: payload.pos.z };
    } else if (carrier && carrier.pos) {
      spillPos = { x: carrier.pos.x, z: carrier.pos.z };
    }

    // Collect the spilled pods. Real producers send podIds (trafficRoleOps) or nothing
    // (encounterScripts) — the fallback scans for loose cargo pods around the carrier.
    const availablePods = [];
    if (Array.isArray(payload.podIds) && state.entities && typeof state.entities.get === 'function') {
      for (const id of payload.podIds) {
        const pod = state.entities.get(id);
        if (pod && pod.alive !== false && pod.pos) availablePods.push(pod);
      }
    } else if (Array.isArray(payload.pods)) {
      for (const p of payload.pods) {
        if (p && p.alive !== false && p.pos) availablePods.push(p);
      }
    } else if (spillPos && state.entities) {
      const iter = typeof state.entities.values === 'function'
        ? state.entities.values()
        : (Array.isArray(state.entityList) ? state.entityList : []);
      for (const ent of iter) {
        if (!isLooseCargoPod(ent)) continue;
        const d = Math.hypot(ent.pos.x - spillPos.x, ent.pos.z - spillPos.z);
        if (d <= SCRAMBLE_TUNING.spillScanRadiusWu) availablePods.push(ent);
      }
    }
    if (availablePods.length === 0) return;
    if (!spillPos) spillPos = { x: availablePods[0].pos.x, z: availablePods[0].pos.z };

    const memory = this._getScrambleMemory();
    if (memory.size >= SCRAMBLE_TUNING.memoryCap) return;

    const candidates = [];
    const checkEntity = (e) => {
      if (!e || e.alive === false) return;
      if (carrierId != null && e.id === carrierId) return;
      if (state.playerId != null && e.id === state.playerId) return;
      if (!isCivilianShip(e) || isEntityDisabled(e)) return;
      if (!e.pos || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) return;
      if (memory.has(e.id)) return;
      const dist = Math.hypot(e.pos.x - spillPos.x, e.pos.z - spillPos.z);
      if (dist <= SCRAMBLE_TUNING.maxNoticeDistWu) candidates.push({ entity: e, dist });
    };
    if (state.entities && typeof state.entities.values === 'function') {
      for (const e of state.entities.values()) checkEntity(e);
    } else if (Array.isArray(state.entityList)) {
      for (const e of state.entityList) checkEntity(e);
    }
    if (candidates.length === 0) return;
    candidates.sort((a, b) => a.dist - b.dist);

    const numThieves = Math.min(
      candidates.length,
      availablePods.length,
      SCRAMBLE_TUNING.maxThieves,
      Math.max(0, SCRAMBLE_TUNING.memoryCap - memory.size),
    );
    if (numThieves <= 0) return;

    const incidentId = `scramble_${carrierId != null ? carrierId : 'spill'}_${Math.round(now * 10)}`;
    const ownerName = (carrier && carrier.data && carrier.data.name) || payload.ownerName || 'Hauler';
    const ownerFaction = (carrier && carrier.factionId) || payload.factionId || 'faction_free';
    const chosenThiefIds = [];
    const podClaims = new Map();
    const podGens = new Map();
    for (const pod of availablePods) podGens.set(pod.id, occupantGenerationOf(pod));

    for (let i = 0; i < numThieves; i++) {
      const e = candidates[i].entity;
      const pod = availablePods[i];
      memory.set(e.id, {
        entityId: e.id,
        generation: occupantGenerationOf(e),
        status: 'seeking_pod',
        incidentId,
        carrierId,
        ownerId: payload.ownerId != null ? payload.ownerId : carrierId,
        ownerName,
        factionId: ownerFaction,
        targetPodId: pod.id,
        stolenCargo: null,
        startedAt: now,
        scatterUntil: 0,
        scatterAngle: 0,
        scaredUntil: 0,
      });
      if (e.data) e.data.civilianReaction = 'scramble_seeking';
      chosenThiefIds.push(e.id);
      podClaims.set(pod.id, e.id);
    }

    this._activeScrambleIncident = {
      incidentId,
      carrierId,
      ownerName,
      spillPos,
      podIds: availablePods.map((p) => p.id),
      podGens,
      thiefIds: chosenThiefIds,
      podClaims,
      startedAt: now,
      droppedCount: 0,
      escapedCount: 0,
      resolved: false,
    };
    this._scrambleCooldownUntil = now + SCRAMBLE_TUNING.cooldownS;

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(SCRAMBLE_HAIL_EVENT, {
        incidentId,
        ownerId: carrierId,
        ownerName,
        text: SCRAMBLE_HAIL_LINE,
        pos: spillPos,
        t: now,
      });
      this.bus.emit(SCRAMBLE_PLANT_ACTIVE_EVENT, {
        incidentId,
        ownerId: carrierId,
        spillPos,
        thiefIds: [...chosenThiefIds],
        podCount: availablePods.length,
        t: now,
      });
    }
    this._scrambleBark(carrierId, `scramble:${incidentId}:hail`, SCRAMBLE_HAIL_LINE, 4);
  },

  _onScrambleThiefHit(payload) {
    if (!payload) return;
    const victimId = payload.victimId ?? payload.id ?? payload.entityId;
    if (victimId == null) return;

    const memory = this._getScrambleMemory();
    const row = memory.get(victimId);
    if (!row) return;

    const state = this.state;
    if (!state || (state.mode && state.mode !== 'flight')) return;
    const now = finite(state.simTime, 0);

    const victim = (state.entities && typeof state.entities.get === 'function')
      ? state.entities.get(victimId)
      : null;
    // A recycled id is somebody else's hull now: drop the stale row, take no action.
    if (victim && row.generation != null) {
      const gen = occupantGenerationOf(victim);
      if (gen != null && gen !== row.generation) {
        memory.delete(victimId);
        return;
      }
    }
    const pos = victim && victim.pos ? { x: victim.pos.x, z: victim.pos.z } : { x: 0, z: 0 };

    this._dropScrambleCargo(victim, row, pos, now, 'shoved');

    row.status = 'scared';
    row.scaredUntil = now + SCRAMBLE_TUNING.scaredDurationS;
    if (victim && victim.data) victim.data.civilianReaction = 'scramble_scared';

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(SCRAMBLE_THIEF_SCARED_EVENT, {
        thiefId: victimId,
        text: SCRAMBLE_THIEF_DROP_LINE,
        pos,
        t: now,
      });
    }
    this._scrambleBark(victimId, `scramble:${victimId}:scared`, SCRAMBLE_THIEF_DROP_LINE, 3);
    this._checkScrambleIncidentResolution(now);
  },

  _handleScrambleEntityDeath(payload) {
    if (!payload) return;
    const victimId = payload.id ?? payload.victimId ?? payload.entityId
      ?? (payload.victim && payload.victim.id) ?? (payload.entity && payload.entity.id);
    if (victimId == null) return;

    const memory = this._getScrambleMemory();
    const row = memory.get(victimId);
    if (!row) return;

    // Mass teardown is not a death in the lane — just forget the thief.
    if (TEARDOWN_DESTROY_REASONS.has(payload.reason)) {
      memory.delete(victimId);
      return;
    }

    const state = this.state;
    if (!state || (state.mode && state.mode !== 'flight')) {
      memory.delete(victimId);
      return;
    }
    const now = finite(state.simTime, 0);

    // Generation check before trusting anything keyed to this id: a recycled id means the
    // row belongs to a corpse; the live occupant is not our thief.
    const corpse = payload.victim || payload.entity
      || (state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(victimId)
        : null);
    if (corpse && row.generation != null) {
      const gen = occupantGenerationOf(corpse);
      if (gen != null && gen !== row.generation) {
        memory.delete(victimId);
        return;
      }
    }

    const pos = payload.pos
      || (corpse && corpse.pos)
      || { x: 0, z: 0 };
    this._dropScrambleCargo(corpse && corpse.pos ? corpse : null, row, pos, now, 'destroyed');

    if (corpse && corpse.data && corpse.data.stolenCargo) delete corpse.data.stolenCargo;
    memory.delete(victimId);
    this._checkScrambleIncidentResolution(now);
  },

  _onScramblePickupCollected(payload) {
    if (!payload) return;
    const pickupId = payload.pickupId ?? payload.id;
    if (pickupId == null) return;
    const incident = this._activeScrambleIncident;
    if (!incident || incident.resolved) return;

    const thiefId = incident.podClaims.get(pickupId);
    if (thiefId == null) return;
    incident.podClaims.delete(pickupId);

    const memory = this._getScrambleMemory();
    const row = memory.get(thiefId);
    const state = this.state;
    const now = finite(state && state.simTime, 0);
    if (row && row.status === 'seeking_pod') {
      const next = this._scrambleRetarget(incident, row);
      if (!next) {
        // Nothing left to steal — the thief gives up and goes back to their route.
        row.status = 'done';
        memory.delete(thiefId);
        const thief = (state && state.entities && typeof state.entities.get === 'function')
          ? state.entities.get(thiefId)
          : null;
        if (thief && thief.data && thief.data.civilianReaction === 'scramble_seeking') {
          delete thief.data.civilianReaction;
        }
        releaseTrafficReaction(this, thief);
      }
    }
    this._checkScrambleIncidentResolution(now);
  },

  _checkScrambleIncidentResolution(now) {
    const incident = this._activeScrambleIncident;
    if (!incident || incident.resolved) return;

    const memory = this._getScrambleMemory();
    let anyThiefStillActive = false;
    for (const thiefId of incident.thiefIds) {
      const row = memory.get(thiefId);
      if (row && (row.status === 'seeking_pod' || (row.status === 'scattering' && row.stolenCargo))) {
        anyThiefStillActive = true;
        break;
      }
    }
    if (anyThiefStillActive) return;

    incident.resolved = true;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(SCRAMBLE_RESOLVED_EVENT, {
        incidentId: incident.incidentId,
        ownerId: incident.carrierId,
        thiefIds: [...incident.thiefIds],
        droppedCount: incident.droppedCount || 0,
        escapedCount: incident.escapedCount || 0,
        t: now,
      });
      // The owner thanks the lane only when cargo actually came back to be scooped —
      // thieves escaping with the haul earns silence, not gratitude.
      if ((incident.droppedCount || 0) > 0) {
        this.bus.emit(SCRAMBLE_OWNER_THANKS_EVENT, {
          incidentId: incident.incidentId,
          ownerId: incident.carrierId,
          ownerName: incident.ownerName,
          text: SCRAMBLE_THANKS_LINE,
          t: now,
        });
        this._scrambleBark(incident.carrierId, `scramble:${incident.incidentId}:thanks`, SCRAMBLE_THANKS_LINE, 4);
      }
    }
  },

  /**
   * Called per-hull inside the traffic update loop. Returns true while this hull's
   * steering belongs to the scramble reaction.
   */
  _reactScramblePlant(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!e || e.alive === false) return false;

    const memory = this._getScrambleMemory();
    const row = memory.get(e.id);
    if (!row) return false;

    const now = finite(state.simTime, 0);
    const gen = occupantGenerationOf(e);
    if (gen != null && row.generation != null && row.generation !== gen) {
      memory.delete(e.id);
      releaseTrafficReaction(this, e);
      return false;
    }

    const incident = this._activeScrambleIncident;
    const spillPos = (incident && incident.spillPos)
      || (e.pos ? { x: e.pos.x, z: e.pos.z } : { x: 0, z: 0 });

    const endReaction = (reactionName) => {
      row.status = 'done';
      memory.delete(e.id);
      if (e.data && e.data.civilianReaction === reactionName) delete e.data.civilianReaction;
      if (rec && rec.civilianReaction === reactionName) delete rec.civilianReaction;
      releaseTrafficReaction(this, e);
      this._checkScrambleIncidentResolution(now);
      return false;
    };

    // 1. Seeking a pod: close on it and scoop it.
    if (row.status === 'seeking_pod') {
      let targetPod = this._scrambleLivePod(incident, row.targetPodId);
      if (!targetPod) {
        incident && incident.podClaims.delete(row.targetPodId);
        targetPod = this._scrambleRetarget(incident, row);
        if (!targetPod) return endReaction('scramble_seeking');
      }

      const dx = targetPod.pos.x - e.pos.x;
      const dz = targetPod.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= SCRAMBLE_TUNING.grabDistanceWu) {
        // Grab: the pod is carried as data; its body leaves through the canonical
        // removal helper, so the world/index/presentation lifecycle stays whole.
        const podData = targetPod.data || {};
        row.stolenCargo = {
          commodityId: podData.commodityId || 'cargo_scrap',
          amount: Math.max(1, Math.floor(Number(podData.amount) || 1)),
          name: podData.name || 'Cargo Pod',
          radius: targetPod.radius,
        };
        if (incident) {
          incident.podClaims.delete(targetPod.id);
          const idx = incident.podIds.indexOf(targetPod.id);
          if (idx >= 0) incident.podIds.splice(idx, 1);
        }

        const removeEntity = this.helpers && this.helpers.removeEntity;
        if (typeof removeEntity === 'function') {
          removeEntity(targetPod.id, { immediate: true, reason: 'scramble_grab' });
        } else {
          targetPod.alive = false;
        }
        if (e.data) {
          e.data.stolenCargo = row.stolenCargo;
          e.data.civilianReaction = 'scramble_scattering';
        }
        if (rec) rec.civilianReaction = 'scramble_scattering';

        row.status = 'scattering';
        row.scatterUntil = now + SCRAMBLE_TUNING.scatterDurationS;
        row.scatterAngle = Math.atan2(e.pos.z - spillPos.z, e.pos.x - spillPos.x);

        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(SCRAMBLE_POD_GRABBED_EVENT, {
            thiefId: e.id,
            podId: targetPod.id,
            incidentId: row.incidentId,
            commodityId: row.stolenCargo.commodityId,
            amount: row.stolenCargo.amount,
            t: now,
          });
        }
      } else {
        const aim = Math.atan2(dz, dx);
        const owned = requestTrafficReaction(this, e, {
          moveX: 0, moveZ: 1.0, boost: true, brake: false, aimAngle: aim,
          strafe: 0, throttle: 1.0, aim,
        }, 1.0);
        if (!owned) return endReaction('scramble_seeking');
        if (e.data) e.data.civilianReaction = 'scramble_seeking';
        if (rec) rec.civilianReaction = 'scramble_seeking';
        return true;
      }
    }

    // 2. Scattering with the pod: sprint away from the spill; out of time means they
    //    got away with it.
    if (row.status === 'scattering') {
      if (now >= row.scatterUntil) {
        if (row.stolenCargo && incident) incident.escapedCount = (incident.escapedCount || 0) + 1;
        return endReaction('scramble_scattering');
      }
      const aim = row.scatterAngle;
      const owned = requestTrafficReaction(this, e, {
        moveX: 0, moveZ: 1.0, boost: true, brake: false, aimAngle: aim,
        strafe: 0, throttle: 1.0, aim,
      }, row.scatterUntil - now);
      if (!owned) return endReaction('scramble_scattering');
      if (e.data) e.data.civilianReaction = 'scramble_scattering';
      if (rec) rec.civilianReaction = 'scramble_scattering';
      return true;
    }

    // 3. Scared flee: pod already dropped, just get away from the player.
    if (row.status === 'scared') {
      if (now >= row.scaredUntil) return endReaction('scramble_scared');
      const awayX = player && player.pos ? (e.pos.x - player.pos.x) : Math.cos(row.scatterAngle);
      const awayZ = player && player.pos ? (e.pos.z - player.pos.z) : Math.sin(row.scatterAngle);
      const aim = Math.atan2(awayZ, awayX);
      const owned = requestTrafficReaction(this, e, {
        moveX: 0, moveZ: 1.0, boost: true, brake: false, aimAngle: aim,
        strafe: 0, throttle: 1.0, aim,
      }, row.scaredUntil - now);
      if (!owned) return endReaction('scramble_scared');
      if (e.data) e.data.civilianReaction = 'scramble_scared';
      if (rec) rec.civilianReaction = 'scramble_scared';
      return true;
    }

    return false;
  },
};

/**
 * Standalone wrapper for tests and modular lifecycle; production wiring is the
 * scramblePlantOps mixin inside traffic (single intent writer).
 */
export const scramblePlant = {
  name: 'scramblePlant',
  init(ctx) {
    this.bus = ctx.bus;
    this.state = ctx.state;
    this.helpers = ctx.helpers;
    this._initScramblePlant(ctx);
  },
  update(dt, state) {
    this.state = state;
    if (!state || (state.mode && state.mode !== 'flight')) return;
    const player = (state.playerId != null && state.entities && state.entities.get)
      ? state.entities.get(state.playerId)
      : null;
    const stations = state.stations || [];
    if (state.entities && typeof state.entities.values === 'function') {
      for (const e of state.entities.values()) {
        this._reactScramblePlant(e, null, stations, state, player);
      }
    }
  },
  destroy() {
    this._resetScramblePlant();
  },
  ...scramblePlantOps,
};
