// Survival wave materialization (PQ-133 / CRU-012).
//
// One seam that turns a PURE plan batch into live hostiles. It is the only place a Survival wave
// creates entities, and it always goes through the two canonical owners:
//   1. ctx.helpers.spawnBudget  — the single live-ship-cap authority (DEFAULT_MAX 24 / HARD_MAX 40).
//      Never setMax, never bypass, never spawn more than the granted count.
//   2. makeEnemySpawnSpec       — the canonical hostile spec builder in src/systems/combat.js.
//      Only live ENEMY_TYPES ids reach it; there is no Survival-only enemy construction path.
//
// Pure except for the two calls above plus helpers.spawnEntity. No bus, no state.run write, no DOM.
// Returns an explicit receipt so the caller can tell "admitted" from "the room was full" without
// counting entities.

import { mulberry32 } from '../core/rng.js';
import { makeEnemySpawnSpec } from './combat.js';

/** Ring radius for a gate. Enemies arrive just off the chase-camera bubble and fly in. */
export const SURVIVAL_SPAWN_DISTANCE = 220;

/** Marker written onto every hostile this module creates. Reward owners branch on it. */
export const SURVIVAL_COHORT_TAG = 'survival';

// Eight distinct bearings, 45 degrees apart, for the eight gate ids in survivalWaves.js.
// Bearings are player-relative at dispatch time: the arena follows the player, so a plan
// reproduces the same fight from the same seed without pinning world coordinates.
const R2 = Math.SQRT1_2;
export const GATE_BEARINGS = Object.freeze({
  front: Object.freeze({ x: 0, z: -1 }),
  ne: Object.freeze({ x: R2, z: -R2 }),
  diagonal_b: Object.freeze({ x: 1, z: 0 }),
  se: Object.freeze({ x: R2, z: R2 }),
  rear: Object.freeze({ x: 0, z: 1 }),
  sw: Object.freeze({ x: -R2, z: R2 }),
  diagonal_a: Object.freeze({ x: -1, z: 0 }),
  nw: Object.freeze({ x: -R2, z: -R2 }),
});

const GATE_FALLBACK = GATE_BEARINGS.front;
// Half of one 45-degree gate sector, so bodies from one gate spread but never wander into the next.
const GATE_SPREAD_RAD = Math.PI / 8;
const RADIUS_JITTER = 0.18;

/** Deterministic per-batch stream. Same run seed + wave + package + batch => same placement. */
export function batchStreamSeed(seed, wave, packageIndex, batchIndex) {
  const label = `survival-wave-batch-v1|w${wave}|p${packageIndex}|b${batchIndex}`;
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0) || 1;
}

/**
 * Enemy level for a wave. Deterministic and monotone; no HP inflation knob beyond the
 * archetype's own level scaling (§33 forbids HP inflation as the difficulty lever).
 */
export function levelForWave(wave) {
  const w = Number.isInteger(wave) && wave > 0 ? wave : 1;
  return 1 + Math.floor((w - 1) / 3);
}

/** Unit bearing for a gate id, falling back to `front` for an unknown id. */
export function gateBearing(gateGroup) {
  const bearing = GATE_BEARINGS[gateGroup];
  return bearing || GATE_FALLBACK;
}

function emptyReceipt(requested) {
  return { requested, granted: 0, admitted: 0, spawnedIds: [], rejected: requested };
}

function playerAnchor(ctx) {
  const state = ctx && ctx.state;
  const player = state && state.entities && state.playerId != null && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const x = player && player.pos && Number.isFinite(player.pos.x) ? player.pos.x : 0;
  const z = player && player.pos && Number.isFinite(player.pos.z) ? player.pos.z : 0;
  return { x, z };
}

function spawnIdOf(spawned) {
  if (spawned == null) return null;
  if (typeof spawned === 'object') return spawned.id != null ? spawned.id : null;
  return spawned;
}

/**
 * Materialize ONE scheduled batch.
 *
 * request: { ownerId, enemyId, level, count, gateGroup, distance, seed, wave, packageIndex,
 *            batchIndex, role }
 * receipt: { requested, granted, admitted, spawnedIds, rejected }
 *
 * `granted < requested` is the normal, expected outcome when ambient traffic already holds slots.
 * The caller must treat a partly-admitted (or fully rejected) batch as DISPATCHED — a Survival wave
 * that waits for bodies the cap will never allow strands the player in `active` forever.
 */
export function materializeWaveBatch(ctx, request) {
  const req = request || {};
  const requested = Number.isInteger(req.count) && req.count > 0 ? req.count : 0;
  if (requested <= 0) return { requested: 0, granted: 0, admitted: 0, spawnedIds: [], rejected: 0 };

  const budget = ctx && ctx.helpers && ctx.helpers.spawnBudget;
  if (!budget || typeof budget.request !== 'function') return emptyReceipt(requested);
  const helpers = ctx && ctx.helpers;
  if (!helpers || typeof helpers.spawnEntity !== 'function') return emptyReceipt(requested);

  const ownerId = req.ownerId != null ? String(req.ownerId) : 'survival-wave';
  const granted = Math.max(0, budget.request(requested, ownerId) | 0);
  if (granted <= 0) return emptyReceipt(requested);

  const anchor = playerAnchor(ctx);
  const distance = Number.isFinite(req.distance) && req.distance > 0
    ? req.distance
    : SURVIVAL_SPAWN_DISTANCE;
  const bearing = gateBearing(req.gateGroup);
  const baseAngle = Math.atan2(bearing.z, bearing.x);
  const level = Number.isInteger(req.level) && req.level >= 1 ? req.level : levelForWave(req.wave);
  const rng = mulberry32(batchStreamSeed(
    Number.isInteger(req.seed) ? req.seed : 1,
    Number.isInteger(req.wave) ? req.wave : 1,
    Number.isInteger(req.packageIndex) ? req.packageIndex : 0,
    Number.isInteger(req.batchIndex) ? req.batchIndex : 0,
  ));

  const spawnedIds = [];
  try {
    for (let i = 0; i < granted; i++) {
      // Spread deterministically across the gate sector so a six-body batch is an arriving
      // formation, not a stack of coincident hulls at one point.
      const lane = granted === 1 ? 0 : (i / (granted - 1)) * 2 - 1;
      const angle = baseAngle + lane * GATE_SPREAD_RAD + (rng() - 0.5) * GATE_SPREAD_RAD * 0.5;
      const radius = distance * (1 + (rng() - 0.5) * 2 * RADIUS_JITTER);
      const pos = {
        x: anchor.x + Math.cos(angle) * radius,
        z: anchor.z + Math.sin(angle) * radius,
      };
      const spec = makeEnemySpawnSpec(req.enemyId, level, pos);
      if (!spec) continue;
      spec.data = spec.data || {};
      spec.data.ai = spec.data.ai || {};
      spec.data.ai.spawnContext = 'encounter';
      // Cohort stamp travels with the body. Reward owners read it off the victim rather than
      // asking a global "is a run live?" question that would also capture ambient traffic.
      spec.data.runCohort = SURVIVAL_COHORT_TAG;
      spec.data.runWave = Number.isInteger(req.wave) ? req.wave : 0;
      if (typeof req.role === 'string') spec.data.runRole = req.role;
      const spawned = helpers.spawnEntity(spec);
      const id = spawnIdOf(spawned);
      if (id == null) continue;
      const bound = typeof budget.bindEntity === 'function' && !!budget.bindEntity(id, ownerId);
      // Spawned-but-unbound is not admitted. The reserved slot is released below; the body is
      // left alone because this module is not the entity lifecycle owner.
      if (!bound) continue;
      spawnedIds.push(id);
    }
  } finally {
    const unbound = granted - spawnedIds.length;
    if (unbound > 0 && typeof budget.releaseSome === 'function') {
      budget.releaseSome(ownerId, unbound);
    }
  }

  return {
    requested,
    granted,
    admitted: spawnedIds.length,
    spawnedIds,
    rejected: requested - spawnedIds.length,
  };
}
