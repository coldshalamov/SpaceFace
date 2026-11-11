// PL-03 Rubberneckers — After any wreck, two passing civilians slow down to look;
// a scavenger arrives within a minute. The player can shoo them, or take the wreck first.
//
// When any ship is destroyed in a traffic sector:
// 1. Up to two nearby passing civilians slow down (throttle drops to crawl, nose aims toward wreck)
//    to look at the wreck for up to 20 seconds of sim time.
// 2. If the player approaches within shoo distance (50 WU) or shoves/bumps them, they get shooed:
//    they immediately break out of rubbernecking, bark ("Just looking! Moving along!"), and flee
//    away from the player at top speed for 8 seconds.
// 3. Within a minute (45 seconds of sim time), a scavenger is dispatched / arrives at the wreck
//    to inspect and scavenge it, unless the player took or cleared the wreck first.
// 4. Cooldown between incidents prevents cascading wreck rubbernecking storms.
//
// Deterministic: uses state.simTime and state.rng only. No wall time or ambient randomness.
// Preserves single intent writer: mixed into traffic.js as rubberneckersOps.

import { occupantGenerationOf } from '../core/entity.js';

export const RUBBERNECKERS_ACTIVE_EVENT = 'traffic:rubberneckersActive';
export const RUBBERNECKERS_SHOO_EVENT = 'traffic:rubberneckerShooed';
export const RUBBERNECKERS_SCAVENGER_EVENT = 'traffic:scavengerArrived';

export const RUBBERNECKERS_TUNING = Object.freeze({
  maxViewDistWu: 420,          // passing civilians within 420 WU can notice the wreck
  minViewDistWu: 25,           // not right on top of the explosion
  lookDurationS: 20,           // two passing civilians slow down to look for 20 s
  shooDistanceWu: 50,          // player getting within 50 WU shoos them away
  fleeDurationS: 8,            // shooed civilians flee at speed for 8 s
  scavengerDelayS: 45,         // scavenger arrives within a minute (45 s)
  cooldownS: 60,               // cooldown between rubbernecking incidents
  maxRubberneckers: 2,         // exactly two passing civilians
  slowThrottle: 0.12,          // crawl throttle while looking
  memoryCap: 48,
});

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
  const role = String(data.trafficRole || data.role || data.presentationRole || ai.role || ai.archetype || '').toLowerCase();
  if (role.includes('patrol') || role.includes('police') || role.includes('security') || role.includes('customs')) return false;

  // Non-hostile:
  if (entity.team === 1 || ai.hostile === true || data.isHostile === true) return false;

  // Civilian:
  if (entity.team === 2 || ai.spawnContext === 'convoy_civilian') return true;
  for (const word of CIVILIAN_ROLES) {
    if (role.includes(word)) return true;
  }
  return false;
}

function isEntityDisabled(entity) {
  if (!entity || entity.alive === false) return true;
  const data = entity.data || {};
  if (data.disabled || data.derelict || data.engineDead || data.deadInWater || data.surrendered) return true;
  if (entity.flags && (entity.flags.disabled || entity.flags.derelict)) return true;
  if (data.hp != null && data.maxHp && data.hp <= data.maxHp * 0.25) return true;
  return false;
}

function setRubberneckerIntent(entity, strafe = 0, throttle = 0, boost = false, brake = false, fire = null, aim = null) {
  if (!entity) return;
  if (!entity.data) entity.data = {};
  if (!entity.data.intent) entity.data.intent = {};
  const intent = entity.data.intent;
  intent.moveX = strafe;
  intent.moveZ = throttle;
  intent.boost = boost;
  intent.brake = brake;
  if (fire !== null) intent.fire = fire;
  if (aim !== null) intent.aimAngle = aim;
  intent.strafe = strafe;
  intent.throttle = throttle;
  intent.aim = aim;
}

export const rubberneckersOps = {
  _initRubberneckers(ctx = {}) {
    this._rubberneckersMemory = new Map();
    this._activeWreckIncident = null;
    this._incidentCooldownUntil = -Infinity;

    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('entity:killed', (p) => this._onRubberneckersEntityKilled(p));
      this.bus.on('sector:exit', () => this._resetRubberneckers());
      this.bus.on('combat:hitstunImpulse', (p) => this._onRubberneckerShoved(p));
    }
  },

  _resetRubberneckers() {
    if (this._rubberneckersMemory instanceof Map) {
      this._rubberneckersMemory.clear();
    }
    this._activeWreckIncident = null;
    this._incidentCooldownUntil = -Infinity;
  },

  _getRubberneckersMemory() {
    if (!(this._rubberneckersMemory instanceof Map)) {
      this._rubberneckersMemory = new Map();
    }
    return this._rubberneckersMemory;
  },

  _onRubberneckersEntityKilled(payload) {
    if (!payload) return;
    const victimId = payload.id ?? payload.victimId ?? payload.entityId ?? payload.victim?.id;
    let victim = (victimId != null && this.state && this.state.entities && this.state.entities.get)
      ? this.state.entities.get(victimId)
      : null;
    if (!victim) {
      victim = payload.victim || null;
    }
    if (!victim || !victim.pos) {
      if (victimId != null && (payload.pos || payload.victim?.pos)) {
        victim = {
          id: victimId,
          type: payload.type || payload.victim?.type || (victim && victim.type),
          pos: payload.pos || payload.victim?.pos,
        };
      }
    }

    // Only wrecks of ships trigger rubbernecking (not asteroids, projectiles, or debris):
    if (!victim || victim.type !== 'ship' || !victim.pos) return;
    const state = this.state;
    if (!state || (state.mode && state.mode !== 'flight')) return;

    const now = finite(state.simTime, 0);
    if (now < this._incidentCooldownUntil) return;

    const wreckPos = { x: finite(victim.pos.x), z: finite(victim.pos.z) };
    const wreckId = victim.id;

    // Search for eligible passing civilians:
    const candidates = [];
    const memory = this._getRubberneckersMemory();

    const checkEntity = (e) => {
      if (!e || e.id === wreckId) return;
      if (state.playerId != null && e.id === state.playerId) return;
      if (!isCivilianShip(e) || isEntityDisabled(e)) return;
      if (!e.pos || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) return;

      const dx = e.pos.x - wreckPos.x;
      const dz = e.pos.z - wreckPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= RUBBERNECKERS_TUNING.minViewDistWu && dist <= RUBBERNECKERS_TUNING.maxViewDistWu) {
        candidates.push({ entity: e, dist });
      }
    };

    if (state.entities && typeof state.entities.values === 'function') {
      for (const e of state.entities.values()) checkEntity(e);
    } else if (Array.isArray(state.entityList)) {
      for (const e of state.entityList) checkEntity(e);
    }

    if (candidates.length === 0) return;

    // Pick up to 2 closest passing civilians:
    candidates.sort((a, b) => a.dist - b.dist);
    const chosen = candidates.slice(0, RUBBERNECKERS_TUNING.maxRubberneckers);
    const chosenIds = [];

    for (const item of chosen) {
      const e = item.entity;
      const generation = occupantGenerationOf(e);
      const row = {
        entityId: e.id,
        generation,
        status: 'looking',
        targetWreckPos: { x: wreckPos.x, z: wreckPos.z },
        wreckId,
        startedAt: now,
        until: now + RUBBERNECKERS_TUNING.lookDurationS,
      };
      memory.set(e.id, row);
      if (e.data) e.data.civilianReaction = 'rubbernecking';
      chosenIds.push(e.id);
    }

    this._activeWreckIncident = {
      wreckId,
      wreckPos,
      at: now,
      scavengerAt: now + RUBBERNECKERS_TUNING.scavengerDelayS,
      scavengerDispatched: false,
      rubberneckerIds: chosenIds,
    };
    this._incidentCooldownUntil = now + RUBBERNECKERS_TUNING.cooldownS;

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(RUBBERNECKERS_ACTIVE_EVENT, {
        wreckId,
        wreckPos,
        rubberneckerIds: [...chosenIds],
        scavengerDueAt: this._activeWreckIncident.scavengerAt,
        t: now,
      });
    }
  },

  _onRubberneckerShoved(payload) {
    if (!payload || payload.victimId == null) return;
    const memory = this._getRubberneckersMemory();
    const row = memory.get(payload.victimId);
    if (!row || row.status !== 'looking') return;

    const state = this.state;
    const now = finite(state && state.simTime, 0);
    this._shooRubbernecker(payload.victimId, row, now, 'shoved');
  },

  _shooRubbernecker(entityId, row, now, reason = 'approach') {
    row.status = 'shooed';
    row.until = now + RUBBERNECKERS_TUNING.fleeDurationS;

    const e = this.state && this.state.entities && this.state.entities.get
      ? this.state.entities.get(entityId) : null;
    if (e && e.data) e.data.civilianReaction = 'shooed';

    const barkText = 'Just looking! Moving along!';
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(RUBBERNECKERS_SHOO_EVENT, {
        entityId,
        wreckId: row.wreckId,
        reason,
        barkText,
        pos: e && e.pos ? { x: e.pos.x, z: e.pos.z } : null,
        t: now,
      });
    }

    if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
      this.helpers.voice.say({
        channel: 'bark',
        text: barkText,
        kind: 'traffic',
        ttl: 3,
        id: `rubbernecker:${entityId}:shoo`,
      });
    }
  },

  /**
   * Called per-hull inside traffic update loop.
   * Returns true while this hull is controlled by rubbernecking or shooed flee.
   */
  _reactRubberneckers(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!e || e.alive === false) return false;

    const memory = this._getRubberneckersMemory();
    const row = memory.get(e.id);
    if (!row) return false;

    const now = finite(state.simTime, 0);
    const gen = occupantGenerationOf(e);
    if (gen != null && row.generation != null && row.generation !== gen) {
      memory.delete(e.id);
      return false;
    }

    // 1. If currently in looking state:
    if (row.status === 'looking') {
      if (now >= row.until) {
        row.status = 'idle';
        memory.delete(e.id);
        if (e.data && e.data.civilianReaction === 'rubbernecking') delete e.data.civilianReaction;
        if (rec && rec.civilianReaction === 'rubbernecking') delete rec.civilianReaction;
        return false;
      }

      // Check if player approaches close enough to shoo them:
      if (player && player.alive !== false && player.pos && e.pos) {
        const pdx = player.pos.x - e.pos.x;
        const pdz = player.pos.z - e.pos.z;
        const pdist = Math.hypot(pdx, pdz);
        if (pdist <= RUBBERNECKERS_TUNING.shooDistanceWu) {
          this._shooRubbernecker(e.id, row, now, 'player_proximity');
        }
      }

      // If shooed on this tick, fall through to shooed behavior below:
      if (row.status === 'looking') {
        // Slow down and aim nose toward wreck:
        const dx = row.targetWreckPos.x - e.pos.x;
        const dz = row.targetWreckPos.z - e.pos.z;
        const aim = Math.atan2(dz, dx);
        setRubberneckerIntent(e, 0, RUBBERNECKERS_TUNING.slowThrottle, false, true, null, aim);
        if (e.data && e.data.intent) e.data.intent.brake = true;
        if (e.data) e.data.civilianReaction = 'rubbernecking';
        if (rec) rec.civilianReaction = 'rubbernecking';
        return true;
      }
    }

    // 2. If shooed, flee away from player / wreck at full boost:
    if (row.status === 'shooed') {
      if (now >= row.until) {
        row.status = 'idle';
        memory.delete(e.id);
        if (e.data && e.data.civilianReaction === 'shooed') delete e.data.civilianReaction;
        if (rec && rec.civilianReaction === 'shooed') delete rec.civilianReaction;
        return false;
      }

      const awayX = player && player.pos ? player.pos.x : row.targetWreckPos.x;
      const awayZ = player && player.pos ? player.pos.z : row.targetWreckPos.z;
      const fx = e.pos.x - awayX;
      const fz = e.pos.z - awayZ;
      const fleeAim = Math.atan2(fz, fx);
      setRubberneckerIntent(e, 0, 1.0, true, false, null, fleeAim);
      if (e.data && e.data.intent) e.data.intent.brake = false;
      if (e.data) e.data.civilianReaction = 'shooed';
      if (rec) rec.civilianReaction = 'shooed';
      return true;
    }

    return false;
  },

  /**
   * Stepper called each traffic update tick to handle scavenger timing.
   */
  _stepRubberneckers(state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    const incident = this._activeWreckIncident;
    if (!incident || incident.scavengerDispatched) return;

    const now = finite(state.simTime, 0);
    if (now >= incident.scavengerAt) {
      incident.scavengerDispatched = true;
      const player = state.entities && state.playerId != null
        ? state.entities.get(state.playerId) : null;

      // Did the player take or approach the wreck first?
      let playerAtWreck = false;
      if (player && player.alive !== false && player.pos) {
        const dx = player.pos.x - incident.wreckPos.x;
        const dz = player.pos.z - incident.wreckPos.z;
        if (Math.hypot(dx, dz) <= 45) {
          playerAtWreck = true;
        }
      }

      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(RUBBERNECKERS_SCAVENGER_EVENT, {
          wreckId: incident.wreckId,
          wreckPos: incident.wreckPos,
          scavengerRole: 'salvor',
          playerAtWreck,
          t: now,
        });
      }
    }
  },
};
