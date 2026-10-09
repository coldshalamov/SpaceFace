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
import { swarmDoctrineStamp } from '../data/swarmMode.js';
import { CINDER_BOSS_ROLE } from './cinderSluiceArena.js';
import { LAGRANGE_BOSS_ROLE } from './lagrangeCrucible.js';
import { CRYO_BOSS_ROLE } from './cryoDriftArena.js';
import { STORM_BOSS_ROLE } from './stormLatticeArena.js';

/** Ring radius for a gate. C1 engagement scale: enemies arrive inside the frame envelope. */
export const SURVIVAL_SPAWN_DISTANCE = 260;

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
// SWARM-03: clumps, not streams. A Swarm batch lands as ONE throw-shaped group — bodies
// inside SWARM_CLUMP_RADIUS_WU of the pack centre — so a single impulse charge (blast
// radius ~105 wu) or one swung body can honestly take three. The gate bearing still
// decides WHICH side the pack arrives on, and depth jitter keeps the approach read;
// only the fan inside the batch is gone. Adventure/Crucible waves keep the sector fan.
export const SWARM_CLUMP_RADIUS_WU = 44;
const SWARM_CLUMP_DEPTH_JITTER = 0.10;

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
 * Enemy level for a wave. Always 1: §33 forbids HP inflation as the difficulty lever, and
 * FB-026 moved the arc's curve into composeArcWave package counts, bearings and batch gaps
 * (survivalActs.js). A level here would multiply hull/armor/shield/damage through
 * scaleCombatant — the exact knob the arc is not allowed to have.
 */
export function levelForWave(wave) {
  void wave;
  return 1;
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

// PQ-133.08: a law arena's boss wave fields a ROLE over the shared dreadnought hull — the
// arena module's `bossRole` is the contract (`hullId` + `role` identify the package exactly;
// neither alone does — `elite` chaff exists and the hull is arena-agnostic). The dressing kind
// rides on `data.bossDressing` so the render layer can hang its machinery without the shared
// enemy def gaining arena logic. Presentation-only; the boss fights identically without it.
const LAW_ARENA_BOSS_ROLES = Object.freeze({
  [LAGRANGE_BOSS_ROLE.law]: LAGRANGE_BOSS_ROLE,
  [CINDER_BOSS_ROLE.law]: CINDER_BOSS_ROLE,
  [CRYO_BOSS_ROLE.law]: CRYO_BOSS_ROLE,
  [STORM_BOSS_ROLE.law]: STORM_BOSS_ROLE,
});

export function lawArenaBossDressing(arenaId, enemyId, role) {
  const bossRole = typeof arenaId === 'string' ? LAW_ARENA_BOSS_ROLES[arenaId] : null;
  if (!bossRole || enemyId !== bossRole.hullId || role !== bossRole.role) return null;
  return { kind: bossRole.id, law: bossRole.law };
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
  // SWARM-03: a swarm batch of 2+ arrives as one clump — same gate, same distance band,
  // one tight pack instead of the sector fan. Deterministic: the same batch stream draws
  // the clump centre first, then each body's offset inside it.
  const clumped = req.swarm === true && granted > 1;
  let clumpX = 0;
  let clumpZ = 0;
  if (clumped) {
    const clumpAngle = baseAngle + (rng() - 0.5) * GATE_SPREAD_RAD;
    const clumpDist = distance * (1 + (rng() - 0.5) * 2 * SWARM_CLUMP_DEPTH_JITTER);
    clumpX = anchor.x + Math.cos(clumpAngle) * clumpDist;
    clumpZ = anchor.z + Math.sin(clumpAngle) * clumpDist;
  }
  try {
    for (let i = 0; i < granted; i++) {
      let pos;
      if (clumped) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * SWARM_CLUMP_RADIUS_WU;
        pos = { x: clumpX + Math.cos(a) * r, z: clumpZ + Math.sin(a) * r };
      } else {
        // Spread deterministically across the gate sector so a six-body batch is an arriving
        // formation, not a stack of coincident hulls at one point.
        const lane = granted === 1 ? 0 : (i / (granted - 1)) * 2 - 1;
        const angle = baseAngle + lane * GATE_SPREAD_RAD + (rng() - 0.5) * GATE_SPREAD_RAD * 0.5;
        const radius = distance * (1 + (rng() - 0.5) * 2 * RADIUS_JITTER);
        pos = {
          x: anchor.x + Math.cos(angle) * radius,
          z: anchor.z + Math.sin(angle) * radius,
        };
      }
      const spec = makeEnemySpawnSpec(req.enemyId, level, pos);
      if (!spec) continue;
      spec.data = spec.data || {};
      spec.data.ai = spec.data.ai || {};
      spec.data.ai.spawnContext = 'encounter';
      // A run cohort hunts the pilot until the round resolves. Adventure surrender,
      // pirate morale and a spawn-point leash otherwise strand the final few enemies.
      const playerId = ctx.state?.playerId;
      spec.data.ai.forcePlayerTarget = true;
      spec.data.ai.huntPlayer = true;
      spec.data.ai.moraleImmune = true;
      spec.data.ai.surrenderImmune = true;
      spec.data.ai.activity = { ...spec.data.ai.activity, kind: 'attack_run',
        reason: 'survival_pursuit', targetId: playerId ?? null, anchor: null };
      spec.data.combat = { ...spec.data.combat, targetId: playerId ?? null };
      // Cohort stamp travels with the body. Reward owners read it off the victim rather than
      // asking a global "is a run live?" question that would also capture ambient traffic.
      spec.data.runCohort = SURVIVAL_COHORT_TAG;
      // Adventure's opening wasps use a softened teaching gun. Arena packs get a
      // readable pulse burst that can threaten a stationary pilot, without hidden damage.
      if (req.enemyId === 'wasp_swarmer') {
        for (const weapon of spec.data.weapons || []) {
          if (weapon.id === 'wpn_pulse_laser_s') {
            weapon.dmg = 8;
            weapon.rof = 3.6;
            weapon.dps = weapon.dmg * weapon.rof;
          }
        }
      }
      const doctrine = swarmDoctrineStamp(req.enemyId, {
        swarm: req.swarm === true,
        champion: req.champion === true,
      });
      if (doctrine) spec.data.ai.combatDoctrineId = doctrine;
      // FB-023 — a hull that patrols lawful space under `lawful_wanted_only` is an ARENA
      // combatant here: the Crucible has no WANTED axis, so the lawful latch would spawn it
      // inert. Restamped on the COHORT copy only — the open-route def and its wanted-status
      // policing are untouched, and engagementAuthority still validates the fight end to end
      // (motive, trigger, telegraph, response window all still required).
      if (req.swarm === true && spec.data.ai.lawful === true) {
        spec.data.ai.lawful = false;
        spec.data.ai.roe = 'weapons_free';
        spec.data.ai.motive = 'arena_contract';
        spec.data.ai.engagementTrigger = 'authorized_hostile_spawn';
      }
      // FB-024 — a capital champion's body enters the `capital_boss` doctrine family so the
      // score's committed-bearing choreography is what it flies if orders ever lapse.
      if (req.capitalBoss === true) spec.data.missionTag = 'capital_boss';
      // FB-027 — the champion is a bounty hunter under the crucible's own contract. The stamp
      // routes it through the SAME trick path a bounty mark runs (bountyHunt's normalize +
      // startHunterTrickTelegraph): telegraph, counter window, activation, cooldown.
      if (typeof req.trickId === 'string' && req.trickId) {
        spec.data.bountyHunt = {
          role: 'hunter',
          contractId: typeof req.trickContractId === 'string' && req.trickContractId
            ? req.trickContractId
            : `swarm:champion:w${Number.isInteger(req.wave) ? req.wave : 0}`,
          trickId: req.trickId,
        };
        spec.data.contractTargetId = playerId ?? null;
      }
      spec.data.runWave = Number.isInteger(req.wave) ? req.wave : 0;
      if (typeof req.role === 'string') spec.data.runRole = req.role;
      // The champion mark travels with the body (SWARM-02): the arcade juice layer and any
      // later boss surface find the round's boss bodies without re-deriving the wave owner's
      // requireBoss ledger, exactly like runRole/runWave above.
      if (req.champion === true) spec.data.swarmChampion = true;
      const bossDressing = lawArenaBossDressing(req.arenaId, req.enemyId, req.role);
      if (bossDressing) spec.data.bossDressing = bossDressing;
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
