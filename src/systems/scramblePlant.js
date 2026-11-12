// PL-04 Scramble plant — When cargo spills in a lane, nearby civilians each grab a pod
// and scatter; the owner hails for help.
// What the player can do: Help the owner, join the scramble, or grab the thieves.
//
// Invariants:
// - Deterministic: uses state.simTime and state.rng only; no Math.random() or Date.now().
// - Preserves single intent writer: mixed into traffic.js as scramblePlantOps
//   and leases motion via trafficReactionLease (requestTrafficReaction / releaseTrafficReaction).
// - Physical: civilian ships alter trajectory to steer toward loose cargo pods, scoop them,
//   and scatter away at top speed.
// - Voice / dialogue bounds: 8 words or fewer per plant rule (§0.0):
//   Owner hail: "Stop them! That's my cargo!" (5 words)
//   Thief drop: "Take it! I'm out!" (4 words)
//   Owner thanks: "Much obliged! You saved my haul." (6 words)
// - Player agency:
//   1. Grab the thieves / help the owner: hitting or destroying a thief causes them to drop
//      the pod and flee; stopping all thieves earns the owner's thanks.
//   2. Join the scramble: scooping pods before civilians reach them leaves thieves empty-handed.
// - Clean resolution: bounded timers, generation checks, and cooldowns prevent cascading storms.

import { occupantGenerationOf } from '../core/entity.js';
import { requestTrafficReaction, releaseTrafficReaction } from './trafficReactionLease.js';

export const SCRAMBLE_PLANT_ACTIVE_EVENT = 'traffic:scrambleActive';
export const SCRAMBLE_HAIL_EVENT = 'traffic:scrambleHail';
export const SCRAMBLE_POD_GRABBED_EVENT = 'traffic:scramblePodGrabbed';
export const SCRAMBLE_POD_DROPPED_EVENT = 'traffic:scramblePodDropped';
export const SCRAMBLE_OWNER_THANKS_EVENT = 'traffic:scrambleOwnerThanks';
export const SCRAMBLE_THIEF_SCARED_EVENT = 'traffic:scrambleThiefScared';

export const SCRAMBLE_TUNING = Object.freeze({
  maxNoticeDistWu: 450,       // civilians within 450 WU notice the spill
  grabDistanceWu: 24,         // distance within which civilian grabs the pod
  scatterDurationS: 15.0,     // flee duration with the pod (s)
  scaredDurationS: 8.0,       // flee duration after dropping pod / being hit (s)
  cooldownS: 45.0,            // cooldown between scramble incidents (s)
  maxThieves: 3,              // at most 3 nearby civilians scramble
  memoryCap: 48,              // bounded memory cap
});

export const SCRAMBLE_HAIL_LINE = "Stop them! That's my cargo!";
export const SCRAMBLE_THANKS_LINE = "Much obliged! You saved my haul.";
export const SCRAMBLE_THIEF_DROP_LINE = "Take it! I'm out!";

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const CIVILIAN_ROLES = new Set([
  'hauler', 'courier', 'miner', 'trader', 'tourist', 'tug',
  'ore_carrier', 'prospector', 'civilian', 'fleeing_trader',
  'shuttle', 'salvor', 'tender', 'sweeper',
]);

/**
 * Returns true if the entity is an eligible civilian ship.
 */
export function isCivilianShip(entity) {
  if (!entity || entity.type !== 'ship' || entity.alive === false) return false;
  const data = entity.data || {};
  const ai = data.ai || {};

  // Non-police / non-lawful:
  if (ai.lawful === true) return false;
  const role = String(
    data.trafficRole || data.role || data.presentationRole || ai.role || ai.archetype || ''
  ).toLowerCase();
  if (role.includes('patrol') || role.includes('police') || role.includes('security') || role.includes('customs')) {
    return false;
  }

  // Non-hostile:
  if (entity.team === 1 || ai.hostile === true || data.isHostile === true) return false;

  // Civilian:
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

function addEntityToState(state, entity) {
  if (!state || !entity) return;
  if (state.entities instanceof Map) {
    state.entities.set(entity.id, entity);
  } else if (typeof state.entities?.set === 'function') {
    state.entities.set(entity.id, entity);
  } else if (Array.isArray(state.entityList)) {
    state.entityList.push(entity);
  }
}

function dropPodEntity(state, stolenPod, pos) {
  if (!state || !stolenPod || !pos) return null;
  // If the original pod entity is still in state.entities, revive and reposition it:
  let pod = (state.entities && typeof state.entities.get === 'function')
    ? state.entities.get(stolenPod.id)
    : null;
  if (pod) {
    pod.alive = true;
    pod.grabbed = false;
    pod.pos = { x: pos.x, z: pos.z };
    pod.vel = { x: 0, z: 0 };
    if (pod.data) pod.data.grabbed = false;
    return pod;
  }
  // Otherwise create a restored pickup entity:
  const newPod = {
    id: stolenPod.id || `pod_recovered_${stolenPod.commodityId || 'cargo'}`,
    type: 'pickup',
    alive: true,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 3,
    data: {
      kind: 'cargo',
      commodityId: stolenPod.commodityId || 'cargo_scrap',
      amount: stolenPod.amount || 1,
      freightCustodyPod: true,
    },
  };
  addEntityToState(state, newPod);
  return newPod;
}

export const scramblePlantOps = {
  _initScramblePlant(ctx = {}) {
    this._scrambleMemory = new Map();
    this._activeScrambleIncident = null;
    this._scrambleCooldownUntil = -Infinity;

    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('freight:cargoSpilled', (p) => this._onScrambleCargoSpilled(p));
      this.bus.on('combat:hitstunImpulse', (p) => this._onScrambleThiefHit(p));
      this.bus.on('entity:killed', (p) => this._onScrambleEntityKilled(p));
      this.bus.on('entity:destroyed', (p) => this._onScrambleEntityDestroyed(p));
      this.bus.on('pickup:collected', (p) => this._onScramblePickupCollected(p));
      this.bus.on('sector:exit', () => this._resetScramblePlant());
      this.bus.on('save:loaded', () => this._resetScramblePlant());
    }
  },

  _resetScramblePlant() {
    if (this._scrambleMemory instanceof Map) {
      this._scrambleMemory.clear();
    }
    this._activeScrambleIncident = null;
    this._scrambleCooldownUntil = -Infinity;
  },

  _getScrambleMemory() {
    if (!(this._scrambleMemory instanceof Map)) {
      this._scrambleMemory = new Map();
    }
    return this._scrambleMemory;
  },

  _onScrambleCargoSpilled(payload) {
    if (!payload) return;
    const state = this.state;
    if (!state || (state.mode && state.mode !== 'flight')) return;

    const now = finite(state.simTime, 0);
    if (now < this._scrambleCooldownUntil) return;

    const carrierId = payload.carrierId ?? payload.ownerId ?? payload.entityId;
    let carrier = (carrierId != null && state.entities && typeof state.entities.get === 'function')
      ? state.entities.get(carrierId)
      : null;

    let spillPos = null;
    if (payload.pos && Number.isFinite(payload.pos.x) && Number.isFinite(payload.pos.z)) {
      spillPos = { x: payload.pos.x, z: payload.pos.z };
    } else if (carrier && carrier.pos) {
      spillPos = { x: carrier.pos.x, z: carrier.pos.z };
    }

    // Collect available loose cargo pods:
    const availablePods = [];
    if (Array.isArray(payload.podIds)) {
      if (payload.podIds.length === 0) return;
      if (state.entities && typeof state.entities.get === 'function') {
        for (const id of payload.podIds) {
          const pod = state.entities.get(id);
          if (pod && pod.alive !== false && pod.pos) {
            availablePods.push(pod);
          }
        }
      }
    } else if (Array.isArray(payload.pods)) {
      if (payload.pods.length === 0) return;
      for (const p of payload.pods) {
        if (p && p.alive !== false && p.pos) availablePods.push(p);
      }
    } else if (spillPos && state.entities) {
      const iter = typeof state.entities.values === 'function'
        ? state.entities.values()
        : (Array.isArray(state.entityList) ? state.entityList : []);
      for (const ent of iter) {
        if (!ent || ent.alive === false || ent.type !== 'pickup' || !ent.pos) continue;
        const d = Math.hypot(ent.pos.x - spillPos.x, ent.pos.z - spillPos.z);
        if (d <= 350) availablePods.push(ent);
      }
    }

    if (availablePods.length === 0) return;
    if (!spillPos && availablePods.length > 0) {
      spillPos = { x: availablePods[0].pos.x, z: availablePods[0].pos.z };
    }

    // Find nearby eligible civilian ships:
    const candidates = [];
    const memory = this._getScrambleMemory();

    const checkEntity = (e) => {
      if (!e || e.alive === false) return;
      if (carrierId != null && e.id === carrierId) return;
      if (state.playerId != null && e.id === state.playerId) return;
      if (!isCivilianShip(e) || isEntityDisabled(e)) return;
      if (!e.pos || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) return;
      if (memory.has(e.id)) return;

      const dx = e.pos.x - spillPos.x;
      const dz = e.pos.z - spillPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= SCRAMBLE_TUNING.maxNoticeDistWu) {
        candidates.push({ entity: e, dist });
      }
    };

    if (state.entities && typeof state.entities.values === 'function') {
      for (const e of state.entities.values()) checkEntity(e);
    } else if (Array.isArray(state.entityList)) {
      for (const e of state.entityList) checkEntity(e);
    }

    if (candidates.length === 0) return;

    candidates.sort((a, b) => a.dist - b.dist);

    const numThieves = Math.min(candidates.length, availablePods.length, SCRAMBLE_TUNING.maxThieves);
    const incidentId = `scramble_${carrierId || 'spill'}_${Math.round(now * 10)}`;
    const chosenThiefIds = [];
    const podClaims = new Map();

    for (let i = 0; i < numThieves; i++) {
      const e = candidates[i].entity;
      const pod = availablePods[i];
      const gen = occupantGenerationOf(e);
      const row = {
        entityId: e.id,
        generation: gen,
        status: 'seeking_pod',
        incidentId,
        carrierId: carrierId || null,
        targetPodId: pod.id,
        targetPodPos: { x: pod.pos.x, z: pod.pos.z },
        stolenPod: null,
        startedAt: now,
        scatterUntil: 0,
        scatterAngle: 0,
        scaredUntil: 0,
      };
      memory.set(e.id, row);
      if (e.data) e.data.civilianReaction = 'scramble_seeking';
      chosenThiefIds.push(e.id);
      podClaims.set(pod.id, e.id);
    }

    const ownerName = (carrier && carrier.data && carrier.data.name) || payload.ownerName || 'Hauler';
    this._activeScrambleIncident = {
      incidentId,
      carrierId: carrierId || null,
      ownerName,
      spillPos,
      podIds: availablePods.map((p) => p.id),
      thiefIds: chosenThiefIds,
      podClaims,
      startedAt: now,
      resolved: false,
    };

    this._scrambleCooldownUntil = now + SCRAMBLE_TUNING.cooldownS;

    const hailText = SCRAMBLE_HAIL_LINE;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(SCRAMBLE_HAIL_EVENT, {
        incidentId,
        ownerId: carrierId || null,
        ownerName,
        text: hailText,
        pos: spillPos,
        t: now,
      });
      this.bus.emit(SCRAMBLE_PLANT_ACTIVE_EVENT, {
        incidentId,
        ownerId: carrierId || null,
        spillPos,
        thiefIds: [...chosenThiefIds],
        podCount: availablePods.length,
        t: now,
      });
    }

    if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
      this.helpers.voice.say({
        channel: 'bark',
        text: hailText,
        kind: 'traffic',
        ttl: 4,
        id: `scramble:${incidentId}:hail`,
      });
    }
  },

  _onScrambleThiefHit(payload) {
    if (!payload) return;
    const victimId = payload.victimId ?? payload.id;
    if (victimId == null) return;

    const memory = this._getScrambleMemory();
    const row = memory.get(victimId);
    if (!row) return;

    const state = this.state;
    const now = finite(state && state.simTime, 0);

    const victim = (state && state.entities && typeof state.entities.get === 'function')
      ? state.entities.get(victimId)
      : null;
    const pos = victim && victim.pos ? { x: victim.pos.x, z: victim.pos.z } : { x: 0, z: 0 };

    if (row.stolenPod) {
      dropPodEntity(state, row.stolenPod, pos);
      const podId = row.stolenPod.id;
      row.stolenPod = null;
      if (victim && victim.data) delete victim.data.stolenPod;

      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(SCRAMBLE_POD_DROPPED_EVENT, {
          thiefId: victimId,
          podId,
          pos,
          t: now,
        });
      }
    }

    row.status = 'scared';
    row.scaredUntil = now + SCRAMBLE_TUNING.scaredDurationS;
    if (victim && victim.data) victim.data.civilianReaction = 'scramble_scared';

    const barkText = SCRAMBLE_THIEF_DROP_LINE;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(SCRAMBLE_THIEF_SCARED_EVENT, {
        thiefId: victimId,
        text: barkText,
        pos,
        t: now,
      });
    }
    if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
      this.helpers.voice.say({
        channel: 'bark',
        text: barkText,
        kind: 'traffic',
        ttl: 3,
        id: `scramble:${victimId}:scared`,
      });
    }

    this._checkScrambleIncidentResolution(now);
  },

  _onScrambleEntityKilled(payload) {
    this._handleScrambleEntityDeath(payload);
  },

  _onScrambleEntityDestroyed(payload) {
    this._handleScrambleEntityDeath(payload);
  },

  _handleScrambleEntityDeath(payload) {
    if (!payload) return;
    const victimId = payload.victimId ?? payload.id ?? payload.entityId;
    if (victimId == null) return;

    const memory = this._getScrambleMemory();
    const row = memory.get(victimId);
    if (!row) return;

    const state = this.state;
    const now = finite(state && state.simTime, 0);
    const pos = (payload.pos) || (payload.victim && payload.victim.pos) || { x: 0, z: 0 };

    if (row.stolenPod) {
      dropPodEntity(state, row.stolenPod, pos);
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(SCRAMBLE_POD_DROPPED_EVENT, {
          thiefId: victimId,
          podId: row.stolenPod.id,
          pos,
          t: now,
        });
      }
      row.stolenPod = null;
    }

    memory.delete(victimId);
    this._checkScrambleIncidentResolution(now);
  },

  _onScramblePickupCollected(payload) {
    if (!payload) return;
    const collectorId = payload.collectorId;
    const pickupId = payload.pickupId;
    const state = this.state;
    const now = finite(state && state.simTime, 0);

    // If player collected a pod that a thief was seeking:
    const incident = this._activeScrambleIncident;
    if (incident && incident.podClaims.has(pickupId)) {
      const thiefId = incident.podClaims.get(pickupId);
      incident.podClaims.delete(pickupId);
      const memory = this._getScrambleMemory();
      const row = memory.get(thiefId);
      if (row && row.status === 'seeking_pod') {
        // Thief realizes pod was taken
        let newTarget = null;
        if (Array.isArray(incident.podIds)) {
          for (const pid of incident.podIds) {
            const p = typeof state.entities?.get === 'function' ? state.entities.get(pid) : null;
            if (p && p.alive !== false && !p.grabbed && !incident.podClaims.has(pid)) {
              row.targetPodId = pid;
              incident.podClaims.set(pid, thiefId);
              newTarget = p;
              break;
            }
          }
        }
        if (!newTarget) {
          row.status = 'done';
          memory.delete(thiefId);
          const thief = typeof state.entities?.get === 'function' ? state.entities.get(thiefId) : null;
          if (thief && thief.data && thief.data.civilianReaction) delete thief.data.civilianReaction;
          releaseTrafficReaction(this, thief);
        }
      }
    }

    this._checkScrambleIncidentResolution(now);
  },

  _checkScrambleIncidentResolution(now) {
    const incident = this._activeScrambleIncident;
    if (!incident || incident.resolved) return;

    const memory = this._getScrambleMemory();
    let anyThiefStillActive = false;
    for (const tid of incident.thiefIds) {
      const row = memory.get(tid);
      if (row && (row.status === 'seeking_pod' || (row.status === 'scattering' && row.stolenPod))) {
        anyThiefStillActive = true;
        break;
      }
    }

    if (!anyThiefStillActive) {
      incident.resolved = true;
      const thanksText = SCRAMBLE_THANKS_LINE;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(SCRAMBLE_OWNER_THANKS_EVENT, {
          incidentId: incident.incidentId,
          ownerId: incident.carrierId,
          ownerName: incident.ownerName,
          text: thanksText,
          t: now,
        });
      }
      if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
        this.helpers.voice.say({
          channel: 'bark',
          text: thanksText,
          kind: 'traffic',
          ttl: 4,
          id: `scramble:${incident.incidentId}:thanks`,
        });
      }
    }
  },

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
    const spillPos = (incident && incident.spillPos) || (e.pos ? { x: e.pos.x, z: e.pos.z } : { x: 0, z: 0 });

    const endReaction = (statusName) => {
      row.status = 'done';
      memory.delete(e.id);
      if (e.data && e.data.civilianReaction && e.data.civilianReaction.startsWith('scramble')) {
        delete e.data.civilianReaction;
      }
      if (rec && rec.civilianReaction && rec.civilianReaction.startsWith('scramble')) {
        delete rec.civilianReaction;
      }
      releaseTrafficReaction(this, e);
      return false;
    };

    // 1. Seeking a pod
    if (row.status === 'seeking_pod') {
      let targetPod = (state.entities && typeof state.entities.get === 'function')
        ? state.entities.get(row.targetPodId)
        : null;

      if (!targetPod || targetPod.alive === false || targetPod.grabbed) {
        targetPod = null;
        if (incident && Array.isArray(incident.podIds)) {
          for (const pid of incident.podIds) {
            const p = typeof state.entities.get === 'function' ? state.entities.get(pid) : null;
            if (p && p.alive !== false && !p.grabbed && !incident.podClaims.has(pid)) {
              incident.podClaims.delete(row.targetPodId);
              row.targetPodId = pid;
              incident.podClaims.set(pid, e.id);
              targetPod = p;
              break;
            }
          }
        }
        if (!targetPod) {
          return endReaction('scramble_seeking');
        }
      }

      const dx = targetPod.pos.x - e.pos.x;
      const dz = targetPod.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= SCRAMBLE_TUNING.grabDistanceWu) {
        // Grab pod!
        targetPod.alive = false;
        targetPod.grabbed = true;
        if (targetPod.data) targetPod.data.grabbed = true;

        const podData = {
          id: targetPod.id,
          commodityId: (targetPod.data && targetPod.data.commodityId) || 'cargo_scrap',
          amount: (targetPod.data && targetPod.data.amount) || 1,
          name: (targetPod.data && targetPod.data.name) || 'Cargo Pod',
        };

        row.stolenPod = podData;
        if (e.data) {
          e.data.stolenPod = podData;
          e.data.civilianReaction = 'scramble_scattering';
        }
        if (rec) rec.civilianReaction = 'scramble_scattering';

        row.status = 'scattering';
        row.scatterUntil = now + SCRAMBLE_TUNING.scatterDurationS;

        const awayX = e.pos.x - spillPos.x;
        const awayZ = e.pos.z - spillPos.z;
        row.scatterAngle = Math.atan2(awayZ, awayX);

        if (this.bus && typeof this.bus.emit === 'function') {
          // Not pickup:collected: missions, mining, economy, onboarding and the save owner read that as the
          // PLAYER collecting. The civilian's grab is this plant's own event below.
          this.bus.emit(SCRAMBLE_POD_GRABBED_EVENT, {
            thiefId: e.id,
            podId: targetPod.id,
            incidentId: row.incidentId,
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

    // 2. Scattering with pod
    if (row.status === 'scattering') {
      if (now >= row.scatterUntil) {
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

    // 3. Scared flee
    if (row.status === 'scared') {
      if (now >= row.scaredUntil) {
        return endReaction('scramble_scared');
      }

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
 * Standalone system implementation for testing or modular lifecycle.
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
    const player = (state.playerId && state.entities?.get) ? state.entities.get(state.playerId) : null;
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
