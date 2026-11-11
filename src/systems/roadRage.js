// PL-05 Road Rage — Shove the same civilian twice and it shoves back once, then runs.
//
// If the player shoves (the Shove power, a repulsor field, or a ram that moves it) the
// same civilian ship twice within 30 seconds of sim time, that civilian:
// 1. turns toward the player and accelerates at it for up to 3 seconds — one clumsy ram
//    attempt (it is a civilian: it does not fire weapons);
// 2. whether or not it connects, it then flees directly away from the player at its top speed
//    for 15 seconds, then returns to whatever it was doing.
// It never does this a second time to the same player within 5 minutes. No text and no voice.
//
// Deterministic: uses state.simTime for timing and state.rng for any variance.
// Preserves single intent writer: mixed into traffic.js so traffic owns the civilian's intent.

import { occupantGenerationOf } from '../core/entity.js';
import { HITSTUN_IMPULSE_EVENT } from '../combat/impulseKernel.js';

export const ROAD_RAGE_TUNING = Object.freeze({
  shoveWindowS: 30,           // shove twice within 30 s of sim time
  ramDurationS: 3,            // turns toward player and accelerates at it for up to 3 s
  fleeDurationS: 15,          // flees directly away from player at top speed for 15 s
  cooldownS: 300,             // never does this a second time to the same player within 5 min (300 s)
  shoveDebounceS: 0.25,       // debounce consecutive impulse frames from the same physical contact
  connectDistanceMarginWu: 4, // physical connection clearance margin: dist <= (r1 + r2 + margin)
  memoryCap: 64,              // bounded memory footprint
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const CIVILIAN_ROLES = new Set([
  'hauler', 'courier', 'miner', 'trader', 'tourist', 'tug',
  'ore_carrier', 'prospector', 'civilian', 'fleeing_trader',
]);

/**
 * "Civilian" means a non-hostile, non-police, non-player ship.
 */
export function isCivilianShip(entity) {
  if (!entity || entity.type !== 'ship' || entity.alive === false) return false;
  const data = entity.data || {};
  const ai = data.ai || {};

  // Non-police / non-lawful:
  if (ai.lawful === true) return false;
  const role = String(data.trafficRole || data.role || data.presentationRole || ai.role || ai.archetype || '').toLowerCase();
  if (role.includes('patrol') || role.includes('police') || role.includes('security')) return false;

  // Non-hostile:
  if (entity.team === 1 || ai.hostile === true || data.isHostile === true) return false;

  // Civilian:
  if (entity.team === 2 || ai.spawnContext === 'convoy_civilian') return true;
  for (const word of CIVILIAN_ROLES) {
    if (role.includes(word)) return true;
  }
  return false;
}

function applyIntent(e, moveX, moveZ, boost, fire, fireGroup, aimAngle) {
  const data = e.data || (e.data = {});
  const intent = data.intent || (data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 });
  intent.moveX = moveX;
  intent.moveZ = moveZ;
  intent.boost = boost;
  intent.fire = fire;
  intent.fireGroup = fireGroup;
  intent.aimAngle = aimAngle;
  intent.brake = false;
}

export function getOrCreateRoadRageRow(memory, entity, now = 0) {
  if (!memory || !entity) return null;
  const generation = occupantGenerationOf(entity);
  let row = memory.get(entity.id);
  if (row && (row.generation !== generation || !(now >= row.lastShoveAt))) {
    row = null;
  }
  if (!row) {
    if (memory.size >= ROAD_RAGE_TUNING.memoryCap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastShoveAt) || (now - old.lastShoveAt > ROAD_RAGE_TUNING.cooldownS && !old.rageState)) {
          memory.delete(id);
        }
      }
      while (memory.size >= ROAD_RAGE_TUNING.memoryCap) {
        memory.delete(memory.keys().next().value);
      }
    }
    row = {
      generation,
      shoves: [],
      seenDeployments: new Set(),
      shoveDeployments: [],
      lastShoveAt: -Infinity,
      lastReceiptAt: -Infinity,
      lastAttackerId: null,
      rageState: null,       // null | 'ram' | 'flee'
      rageStartedAt: -Infinity,
      fleeStartedAt: -Infinity,
      cooldownUntil: -Infinity,
      ramConnected: false,
    };
    memory.set(entity.id, row);
  }
  return row;
}

/**
 * Record a shove from attackerId to victim at simTime `now`.
 * Returns true if this shove triggered road rage.
 */
export function recordRoadRageShove(state, victim, attackerId, now, memory, options = {}) {
  if (!state || !victim || !memory) return false;
  const playerId = state.playerId;
  if (!playerId || attackerId !== playerId) return false;
  if (victim.id === playerId) return false;
  if (!isCivilianShip(victim)) return false;

  const row = getOrCreateRoadRageRow(memory, victim, now);
  if (!row) return false;

  // Cooldown check: never does this a second time within 5 minutes (300 s)
  if (now < row.cooldownUntil) return false;

  // Already raging: do not retrigger
  if (row.rageState) return false;

  let deploymentId = null;
  if (typeof options === 'string' || typeof options === 'number') {
    deploymentId = options;
  } else if (options && typeof options === 'object') {
    deploymentId = options.deploymentId ?? options.fieldId ?? options.provenance?.deploymentId ?? options.provenance?.fieldId ?? null;
  }

  if (!row.seenDeployments) row.seenDeployments = new Set();
  if (!Array.isArray(row.shoveDeployments)) row.shoveDeployments = [];
  if (row.lastReceiptAt == null) row.lastReceiptAt = -Infinity;

  // Filter out expired shoves (> 30s ago)
  row.shoves = row.shoves.filter((t) => now - t <= ROAD_RAGE_TUNING.shoveWindowS);
  row.shoveDeployments = row.shoveDeployments.filter((entry) => now - entry.t <= ROAD_RAGE_TUNING.shoveWindowS);
  row.seenDeployments = new Set(row.shoveDeployments.map((entry) => entry.id));

  // Count one shove per distinct field deployment;
  // if it has none, treat receipts from the same attacker within 1.0 s as one shove.
  if (deploymentId != null) {
    if (row.seenDeployments.has(deploymentId)) {
      row.lastReceiptAt = now;
      return false;
    }
    row.seenDeployments.add(deploymentId);
    row.shoveDeployments.push({ id: deploymentId, t: now });
  } else {
    const shoveGroupingWindowS = 1.0;
    if (row.lastAttackerId === attackerId && (now - row.lastReceiptAt) <= shoveGroupingWindowS) {
      row.lastReceiptAt = now;
      return false;
    }
  }

  row.lastReceiptAt = now;
  row.lastAttackerId = attackerId;
  row.shoves.push(now);
  row.lastShoveAt = now;

  if (row.shoves.length >= 2) {
    // Shoved twice within 30 seconds of sim time! Trigger Road Rage.
    row.shoves.length = 0;
    if (row.seenDeployments) row.seenDeployments.clear();
    if (row.shoveDeployments) row.shoveDeployments.length = 0;
    row.lastReceiptAt = -Infinity;
    row.rageState = 'ram';
    row.rageStartedAt = now;
    row.fleeStartedAt = -Infinity;
    row.ramConnected = false;
    row.cooldownUntil = now + ROAD_RAGE_TUNING.cooldownS;
    return true;
  }

  return false;
}

/**
 * Step road rage behavior for one civilian entity.
 * Returns true while road rage is actively driving the civilian.
 */
export function stepRoadRage(e, state, player, dt, memory, rec = null) {
  if (!e || !state || !memory) return false;
  const row = memory.get(e.id);
  if (!row || !row.rageState) return false;

  const now = finite(state.simTime, 0);

  if (!player || player.alive === false || !player.pos || !e.pos) {
    row.rageState = null;
    if (rec) rec.civilianReaction = null;
    if (e.data) e.data.civilianReaction = null;
    return false;
  }

  // Phase 1: Ram attempt (up to 3 seconds)
  if (row.rageState === 'ram') {
    // Check timeout
    if (now - row.rageStartedAt >= ROAD_RAGE_TUNING.ramDurationS) {
      row.rageState = 'flee';
      row.fleeStartedAt = now;
    } else {
      // Check physical connection / overlap
      const dx = player.pos.x - e.pos.x;
      const dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const reach = finite(e.radius, 6) + finite(player.radius, 6) + ROAD_RAGE_TUNING.connectDistanceMarginWu;
      if (dist <= reach) {
        row.ramConnected = true;
        row.rageState = 'flee';
        row.fleeStartedAt = now;
      }
    }
  }

  // Phase 2: Flee directly away from player at top speed (15 seconds)
  if (row.rageState === 'flee') {
    if (now - row.fleeStartedAt >= ROAD_RAGE_TUNING.fleeDurationS) {
      // Finished fleeing: return to whatever it was doing
      row.rageState = null;
      if (rec) rec.civilianReaction = null;
      if (e.data) e.data.civilianReaction = null;
      return false;
    }

    const awayX = e.pos.x - player.pos.x;
    const awayZ = e.pos.z - player.pos.z;
    const aim = Math.atan2(awayZ, awayX);
    // At top speed: moveZ = 1, boost = true, weapons cold
    applyIntent(e, 0, 1, true, false, null, aim);
    if (rec) rec.civilianReaction = 'road_rage_flee';
    if (e.data) e.data.civilianReaction = 'road_rage_flee';
    return true;
  }

  // Still in Phase 1 (Ram)
  if (row.rageState === 'ram') {
    const towardX = player.pos.x - e.pos.x;
    const towardZ = player.pos.z - e.pos.z;
    const aim = Math.atan2(towardZ, towardX);
    // Accelerates toward player, no weapons fired
    applyIntent(e, 0, 1, false, false, null, aim);
    if (rec) rec.civilianReaction = 'road_rage_ram';
    if (e.data) e.data.civilianReaction = 'road_rage_ram';
    return true;
  }

  return false;
}

export const roadRageOps = {
  _roadRageMemory() {
    if (!(this._roadRageMem instanceof Map)) this._roadRageMem = new Map();
    return this._roadRageMem;
  },

  _initRoadRage(ctx) {
    if (!ctx || !ctx.bus || typeof ctx.bus.on !== 'function') return;
    ctx.bus.on(HITSTUN_IMPULSE_EVENT, (payload) => this._onRoadRageHitstun(payload || {}));
    ctx.bus.on('physics:impact', (payload) => this._onRoadRageImpact(payload || {}));
  },

  _onRoadRageHitstun(payload) {
    if (!payload) return;
    const attackerId = payload.attackerId;
    const victimId = payload.victimId;
    const deltaV = finite(payload.deltaV, 0);
    if (!(deltaV > 0) || !victimId) return;

    const state = this.state;
    if (!state || !state.entities || typeof state.entities.get !== 'function') return;
    const victim = state.entities.get(victimId);
    if (!victim) return;

    const now = finite(state.simTime, 0);
    const memory = this._roadRageMemory();
    recordRoadRageShove(state, victim, attackerId, now, memory, payload);
  },

  _onRoadRageImpact(payload) {
    if (!payload) return;
    const state = this.state;
    const playerId = state && state.playerId;
    if (!playerId) return;

    const aId = payload.aId;
    const bId = payload.bId;
    const memory = this._roadRageMemory();

    let civId = null;
    if (aId === playerId && bId != null) civId = bId;
    else if (bId === playerId && aId != null) civId = aId;

    if (civId != null && memory.has(civId)) {
      const row = memory.get(civId);
      if (row && row.rageState === 'ram') {
        row.ramConnected = true;
        row.rageState = 'flee';
        row.fleeStartedAt = finite(state.simTime, 0);
      }
    }
  },

  _reactRoadRage(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    const memory = this._roadRageMemory();
    return stepRoadRage(e, state, player, 1 / 60, memory, rec);
  },
};

/** Standalone system implementation for testing or modular lifecycle registration. */
export const roadRage = {
  id: 'roadRage',
  name: 'roadRage',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._mem = new Map();
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on(HITSTUN_IMPULSE_EVENT, (p) => this._onHitstun(p || {}));
      this.bus.on('physics:impact', (p) => this._onImpact(p || {}));
    }
  },

  _onHitstun(p) {
    if (!p || !this.state) return;
    const deltaV = finite(p.deltaV, 0);
    if (!(deltaV > 0) || !p.victimId) return;
    const victim = this.state.entities?.get?.(p.victimId);
    if (!victim) return;
    const now = finite(this.state.simTime, 0);
    recordRoadRageShove(this.state, victim, p.attackerId, now, this._mem, p);
  },

  _onImpact(p) {
    if (!p || !this.state) return;
    const playerId = this.state.playerId;
    if (!playerId) return;
    let civId = null;
    if (p.aId === playerId && p.bId != null) civId = p.bId;
    else if (p.bId === playerId && p.aId != null) civId = p.aId;
    if (civId != null && this._mem.has(civId)) {
      const row = this._mem.get(civId);
      if (row && row.rageState === 'ram') {
        row.ramConnected = true;
        row.rageState = 'flee';
        row.fleeStartedAt = finite(this.state.simTime, 0);
      }
    }
  },

  update(dt, state) {
    if (!state || state.mode !== 'flight') return;
    const player = state.playerId ? state.entities?.get?.(state.playerId) : null;
    if (!player) return;
    for (const [id, row] of this._mem) {
      if (!row || !row.rageState) continue;
      const entity = state.entities?.get?.(id);
      if (!entity || entity.alive === false) {
        row.rageState = null;
        continue;
      }
      stepRoadRage(entity, state, player, dt, this._mem, null);
    }
  },
};
