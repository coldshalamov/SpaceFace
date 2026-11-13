// PL-243 Perspective — Boost past a patrol while wanted for something small: it does not even turn. Someone worse is in the lane.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: Boost past a patrol, wanted for something small, and it does not even turn —
//   someone worse is in the lane today
//   What the player can do: Enjoy the relativity; or go and find out who
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via PERSPECTIVE_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; the patrol explicitly
//   does NOT turn (this plant never claims it), and the worse-one spawns as its own hull.
// - Cooldowns per patrol key. All session state lives on `this`, never module-level.

import { hash32 } from '../../core/rng.js';
import { isPlayerWanted } from '../heat.js';
import { isMistakenPatrol } from './mistaken.js';

export const PLANTS_PERSPECTIVE_EVENT = 'plants:perspectivePass';
export const PLANTS_PERSPECTIVE_FOUND_EVENT = 'plants:perspectiveFound';

export const PERSPECTIVE_TUNING = Object.freeze({
  patrolRangeWu: 240,         // the pass happens inside this of the patrol
  boostRelSpeedWu: 140,       // "boost past": closing speed at or above this
  passCooldownS: 45,          // per-patrol cooldown between perspective passes
  worseOneAheadWu: 340,       // the worse-one waits this far ahead in the lane
  findRangeWu: 120,           // going this close to the worse-one = finding out who
  worseOneRadius: 10,
  worseOneHull: 140,
  smallHeatMax: 0.45,         // "wanted for something small": heat above the wanted bar, below this
  memoryCap: 16,              // bounded patrol rows + worse-one row
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): is the player wanted for something small? The only live wanted state
 * is the heat ledger — `isPlayerWanted(state)` reads state.player.heat (src/systems/heat.js).
 * "Small" is above the wanted bar but under smallHeatMax; a heavy hunt is not this row.
 */
export function wantedSmallOf(state, tuning = PERSPECTIVE_TUNING) {
  if (!isPlayerWanted(state)) return false;
  const heat = state && state.player && Number(state.player.heat);
  if (!Number.isFinite(heat)) return false;
  return heat < tuning.smallHeatMax;
}

/**
 * Geometry helper (pure): is the player boosting past this hull — fast, close, head-on or
 * crossing? Returns pass geometry or null.
 */
export function perspectivePass(player, patrol, tuning = PERSPECTIVE_TUNING) {
  if (!player || !patrol || !player.pos || !patrol.pos || !player.vel) return null;
  const d = Math.hypot(finite(player.pos.x) - finite(patrol.pos.x), finite(player.pos.z) - finite(patrol.pos.z));
  if (!(d <= tuning.patrolRangeWu)) return null;
  const rvx = finite(player.vel.x) - finite(patrol.vel && patrol.vel.x);
  const rvz = finite(player.vel.z) - finite(patrol.vel && patrol.vel.z);
  const relSpeed = Math.hypot(rvx, rvz);
  if (!(relSpeed >= tuning.boostRelSpeedWu)) return null;
  return { dist: d, relSpeed };
}

/**
 * Memory-row builder (pure): perspective bookkeeping, FIFO + stale eviction at the cap.
 */
export function perspectiveRowFor(memory, key, now, cap = PERSPECTIVE_TUNING.memoryCap) {
  if (!memory || !key) return null;
  let row = memory.get(key);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > PERSPECTIVE_TUNING.passCooldownS * 4) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { lastPassAt: -Infinity, worseOneId: null, worseOneAt: -Infinity, foundAt: -Infinity, lastAt: now };
    memory.set(key, row);
  }
  return row;
}

export const perspectiveOps = {
  _initPerspective(ctx = {}) {
    this._perspectiveMemory = new Map();
  },

  _perspectiveMemoryMap() {
    if (!(this._perspectiveMemory instanceof Map)) this._perspectiveMemory = new Map();
    return this._perspectiveMemory;
  },

  _perspectiveEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  /**
   * Per-hull hook from the traffic dispatch (patrol hulls). The patrol does not even turn:
   * this NEVER claims the hull — it answers false after registering the pass and, once per
   * window, marking that someone worse is in the lane today.
   */
  _reactPerspective(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!isMistakenPatrol(e, rec, state)) return false;
    if (!player || player.alive === false || !player.pos) return false;
    if (!wantedSmallOf(state)) return false;

    const now = finite(state.simTime, 0);
    const row = perspectiveRowFor(this._perspectiveMemoryMap(), 'lane', now);
    if (!row) return false;
    row.lastAt = now;

    const pass = perspectivePass(player, e);
    if (!pass) return false;
    if (now - row.lastPassAt < PERSPECTIVE_TUNING.passCooldownS) return false;
    row.lastPassAt = now;

    // Someone worse is in the lane today: mark them once, ahead in the lane.
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (!row.worseOneId && typeof spawnEntity === 'function') {
      const speed = Math.hypot(finite(player.vel.x), finite(player.vel.z)) || 1;
      const worseOne = spawnEntity({
        type: 'ship',
        pos: {
          x: finite(player.pos.x) + (finite(player.vel.x) / speed) * PERSPECTIVE_TUNING.worseOneAheadWu,
          z: finite(player.pos.z) + (finite(player.vel.z) / speed) * PERSPECTIVE_TUNING.worseOneAheadWu,
        },
        vel: { x: 0, z: 0 },
        radius: PERSPECTIVE_TUNING.worseOneRadius,
        hull: PERSPECTIVE_TUNING.worseOneHull,
        hullMax: PERSPECTIVE_TUNING.worseOneHull,
        team: 1,
        data: {
          trafficRole: 'hauler',
          plantsWorseOne: true,
          scanLabel: 'Hard case',
          tetherable: true,
          masslineTetherable: true,
        },
      });
      row.worseOneId = worseOne && worseOne.id != null ? worseOne.id : null;
      row.worseOneAt = now;
    }

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_PERSPECTIVE_EVENT, {
        patrolId: e.id,
        playerId: player.id,
        worseOneId: row.worseOneId,
        relSpeed: Math.round(pass.relSpeed),
        t: now,
      });
    }
    // The patrol does not even turn: no claim, no intent write, no bark — the row promises
    // the patrol does not react to you at all.
    return false;
  },

  /**
   * Go and find out who: called per-hull for the worse-one (or any hull tick). When the player
   * closes inside find range, the worse-one turns. Returns false always.
   */
  _stepPerspectiveFind(state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!player || player.alive === false || !player.pos) return false;
    const now = finite(state.simTime, 0);
    const row = this._perspectiveMemoryMap().get('lane');
    if (!row || !row.worseOneId || row.foundAt >= 0) return false;
    const worseOne = this._perspectiveEntityById(row.worseOneId);
    if (!worseOne || worseOne.alive === false || !worseOne.pos) return false;
    const d = Math.hypot(finite(player.pos.x) - finite(worseOne.pos.x), finite(player.pos.z) - finite(worseOne.pos.z));
    if (d > PERSPECTIVE_TUNING.findRangeWu) return false;
    row.foundAt = now;
    const data = worseOne.data || (worseOne.data = {});
    data.ai = data.ai || {};
    data.ai.hostile = true;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_PERSPECTIVE_FOUND_EVENT, { worseOneId: row.worseOneId, t: now });
      this.bus.emit('audio:cue', { id: 'warning', position: { x: worseOne.pos.x, z: worseOne.pos.z }, gain: 0.8, rate: 0.9 });
    }
    return false;
  },
};
