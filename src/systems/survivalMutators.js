// Challenge compiler for Crucible mutators and trials (PQ-133.10a).
//
// Mutators fold into the existing seed discipline: the launch seed is kept, the mutator
// list is a second deterministic input (sorted unique ids). Nothing here rolls a fresh
// seed or reads the wall clock. Same seed + same mutators => same compiled challenge
// and the same planner input.
//
// Not a registered tick. survivalRun stamps the compiled list onto run.arenaMutators.

import { MODULES } from '../data/modules.js';
import { SHIPS } from '../data/ships.js';
import {
  CRUCIBLE_REEF_LAYOUT_ID,
  CRUCIBLE_SLALOM_WELL_COUNT,
  CRUCIBLE_WEEKLY_ROTATION,
  CRUCIBLE_WEEKLY_STRATEGIES,
  SURVIVAL_MUTATOR_BY_ID,
  SURVIVAL_PHYSICS_VERBS,
  SURVIVAL_PLANNER_MUTATORS,
  SURVIVAL_TRIAL_BY_ID,
  SURVIVAL_TRIAL_BY_RULESET,
} from '../data/survivalMutators.js';
import { WEAPONS } from '../data/weapons.js';
import { offerDraft } from '../data/survivalDraft.js';
import { buildSlotList, fits, outfitBudgetForFittings } from './ships.js';
import { planWave } from './survivalWavePlanner.js';

const PLANNER_SET = new Set(SURVIVAL_PLANNER_MUTATORS);
const PHYSICS_SET = new Set(SURVIVAL_PHYSICS_VERBS);

let queued = null;
let queuedDailyDateKey = null;
let queuedGhostHash = null;
let queuedWeeklyMutatorId = null;

const WEEKLY_SET = new Set(CRUCIBLE_WEEKLY_ROTATION);
const HEAVY_ROLES = new Set(['anchor', 'elite']);
const FODDER_ROLES = new Set(['mass']);
const FODDER_ENEMIES = new Set(['wasp_swarmer', 'choir_zealot']);
const DEFAULT_CRUCIBLE_ARENA_ID = 'helios_core';
const SHIP_BY_ID = new Map(SHIPS.map((def) => [def.id, def]));
const FITTING_BY_ID = new Map([
  ...WEAPONS.map((def) => [def.id, def]),
  ...MODULES.map((def) => [def.id, def]),
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function readDailyDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function readGhostHash(value) {
  if (Number.isInteger(value) && value >= 0) return value >>> 0;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value) >>> 0;
  return null;
}

function readWeeklyMutatorId(value) {
  return typeof value === 'string' && WEEKLY_SET.has(value) ? value : null;
}

/** Sorted unique mutator ids. Unknown ids are kept (the planner ignores them; records still label them). */
export function normalizeMutators(mutators) {
  if (!Array.isArray(mutators)) return [];
  const seen = new Set();
  const out = [];
  for (const item of mutators) {
    const id = typeof item === 'string' ? item : (item && isNonEmptyString(item.id) ? item.id : null);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  out.sort();
  return out;
}

/**
 * Mix mutators into a derived uint32 without replacing the run seed.
 * Same idiom as draftStreamSeed / wavePlanStreamSeed.
 */
export function foldMutatorsIntoSeed(seed, mutators) {
  const n = Number.isInteger(seed) ? seed : 0;
  const label = `survival-mutator-v1|${normalizeMutators(mutators).join(',')}`;
  let h = (n >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0) || 1;
}

function trialFromRuleset(ruleset) {
  if (!isNonEmptyString(ruleset)) return null;
  return SURVIVAL_TRIAL_BY_RULESET[ruleset] || SURVIVAL_TRIAL_BY_ID[ruleset] || null;
}

/**
 * Compile a launch challenge. Pure. The fingerprint is the only identity a record needs
 * besides the run seed; it does not become a new seed for the wave planner.
 */
export function compileChallenge(seed, mutators, ruleset = 'scored') {
  const trial = trialFromRuleset(ruleset);
  const implied = trial && Array.isArray(trial.impliedMutators) ? trial.impliedMutators : [];
  const all = normalizeMutators([...(Array.isArray(mutators) ? mutators : []), ...implied]);
  let skipDraft = trial ? trial.skipDraft === true : false;
  let skipReroll = false;
  let hullLocked = trial ? trial.hullLocked === true : false;
  let weaponLock = trial && trial.weaponLock ? trial.weaponLock : null;
  let physicsOnly = false;
  let wellCount = 0;
  let reefLayoutId = null;
  let arenaId = DEFAULT_CRUCIBLE_ARENA_ID;
  for (const id of all) {
    const def = SURVIVAL_MUTATOR_BY_ID[id];
    if (!def) continue;
    if (def.skipDraft) skipDraft = true;
    if (def.skipReroll) skipReroll = true;
    if (def.hullLocked) hullLocked = true;
    if (def.physicsOnly) physicsOnly = true;
    if (def.weaponLock && !weaponLock) weaponLock = def.weaponLock;
    if (Number.isInteger(def.wellCount) && def.wellCount > wellCount) wellCount = def.wellCount;
    if (typeof def.reefLayoutId === 'string' && def.reefLayoutId && !reefLayoutId) {
      reefLayoutId = def.reefLayoutId;
    }
    if (typeof def.arenaId === 'string' && def.arenaId) arenaId = def.arenaId;
  }
  if (all.includes('gravity_slalom') && wellCount < CRUCIBLE_SLALOM_WELL_COUNT) {
    wellCount = CRUCIBLE_SLALOM_WELL_COUNT;
  }
  if (all.includes('reef') && !reefLayoutId) reefLayoutId = CRUCIBLE_REEF_LAYOUT_ID;
  const plannerMutators = all.filter((id) => PLANNER_SET.has(id));
  const resolvedRuleset = isNonEmptyString(ruleset) ? ruleset : 'scored';
  const trialId = trial ? trial.id : null;
  const folded = foldMutatorsIntoSeed(seed, all);
  const compiled = {
    seed: (Number.isInteger(seed) ? seed : 0) >>> 0,
    ruleset: resolvedRuleset,
    trialId,
    mutators: Object.freeze(all.slice()),
    plannerMutators: Object.freeze(plannerMutators),
    skipDraft,
    skipReroll,
    hullLocked,
    weaponLock,
    physicsOnly,
    wellCount,
    arenaId,
    reefLayoutId,
    hullId: trial && trial.hullId ? trial.hullId : null,
    fingerprint: `${(Number.isInteger(seed) ? seed : 0) >>> 0}:${all.join(',')}:${resolvedRuleset}:${folded.toString(16)}`,
  };
  const top = rankTopStrategy(compiled);
  return Object.freeze({
    ...compiled,
    strategyId: top.strategyId,
    strategyVerb: top.verb,
    strategyHullId: top.hullId,
    strategySignature: top.signature,
  });
}

export function challengeFromRun(run) {
  if (!run || typeof run !== 'object') return compileChallenge(0, [], 'scored');
  return compileChallenge(
    Number.isInteger(run.seed) ? run.seed : 0,
    run.arenaMutators,
    run.ruleset || 'scored',
  );
}

export function queueSurvivalChallenge(spec) {
  const src = spec && typeof spec === 'object' ? spec : {};
  queuedWeeklyMutatorId = readWeeklyMutatorId(src.weeklyMutatorId);
  const incoming = Array.isArray(src.mutators) ? src.mutators.slice() : [];
  if (queuedWeeklyMutatorId) incoming.push(queuedWeeklyMutatorId);
  const compiled = compileChallenge(src.seed, incoming, src.ruleset || src.trialId || 'scored');
  queuedDailyDateKey = readDailyDateKey(src.dailyDateKey);
  queuedGhostHash = readGhostHash(src.ghostHash);
  queued = {
    mutators: compiled.mutators.slice(),
    ruleset: compiled.ruleset,
    trialId: compiled.trialId,
    dailyDateKey: queuedDailyDateKey,
    ghostHash: queuedGhostHash,
    weeklyMutatorId: queuedWeeklyMutatorId,
  };
  return compiled;
}

export function peekQueuedChallenge() {
  if (!queued) return null;
  const out = {
    mutators: queued.mutators.slice(),
    ruleset: queued.ruleset,
    trialId: queued.trialId,
  };
  if (queued.dailyDateKey) out.dailyDateKey = queued.dailyDateKey;
  if (queued.ghostHash != null) out.ghostHash = queued.ghostHash;
  if (queued.weeklyMutatorId) out.weeklyMutatorId = queued.weeklyMutatorId;
  return out;
}

export function takeQueuedChallenge() {
  const next = queued;
  queued = null;
  return next;
}

/** Day the live daily run started. Survives takeQueuedChallenge so midnight cannot re-label it. */
export function lastQueuedDailyDateKey() {
  return queuedDailyDateKey;
}

/** Settlement consumes the stamp so a later free run cannot inherit today's board. */
export function consumeQueuedDailyDateKey() {
  const key = queuedDailyDateKey;
  queuedDailyDateKey = null;
  return key;
}

/** Ghost hash to load for pose playback. Survives takeQueuedChallenge the way the daily stamp does. */
export function lastQueuedGhostHash() {
  return queuedGhostHash;
}

/** Consume after the run has armed playback so a later free run cannot inherit the ghost. */
export function consumeQueuedGhostHash() {
  const hash = queuedGhostHash;
  queuedGhostHash = null;
  return hash;
}

/** Week-locked mutator id. Survives takeQueuedChallenge the way the daily stamp does. */
export function lastQueuedWeeklyMutatorId() {
  return queuedWeeklyMutatorId;
}

/** Consume on survival start so a later free run cannot inherit this week's twist. */
export function consumeQueuedWeeklyMutatorId() {
  const id = queuedWeeklyMutatorId;
  queuedWeeklyMutatorId = null;
  return id;
}

/** Queue a ghost without stamping mutators onto the next run. */
export function queueGhostPlayback(hash) {
  queuedGhostHash = readGhostHash(hash);
  return queuedGhostHash;
}

export function clearQueuedChallenge() {
  queued = null;
  queuedDailyDateKey = null;
  queuedGhostHash = null;
  queuedWeeklyMutatorId = null;
}

export function filterDraftOffers(offers, challenge) {
  if (!Array.isArray(offers)) return [];
  if (!challenge) return offers.slice();
  if (challenge.skipDraft || challenge.weaponLock === 'starting') return [];
  let out = offers.slice();
  if (challenge.physicsOnly) {
    out = out.filter((entry) => entry && PHYSICS_SET.has(entry.verb));
  }
  if (isNonEmptyString(challenge.weaponLock) && challenge.weaponLock !== 'starting') {
    out = out.filter((entry) => entry && entry.defId === challenge.weaponLock);
  }
  return out;
}

/** Same seed, hull, fittings, and challenge always yield the same three (or fewer) cards. */
export function offerDraftForChallenge(input, challenge) {
  const result = offerDraft(input);
  if (!result || result.ok === false) return result;
  return {
    ...result,
    offers: filterDraftOffers(result.offers, challenge),
  };
}

export function allowsReroll(challenge) {
  return !(challenge && challenge.skipReroll);
}

/** Weapons cold: guns stay in the rack. Utilities and massline heads remain. */
export function applyWeaponsColdLoadout(loadout) {
  if (!Array.isArray(loadout)) return [];
  const out = [];
  for (const slot of loadout) {
    if (!slot || typeof slot !== 'object') continue;
    const id = typeof slot.defId === 'string' ? slot.defId : '';
    if (!id || id.startsWith('wpn_')) continue;
    out.push({ ...slot });
  }
  return out;
}

export function allowedHullIds(challenge, fallback = 'ship_kestrel') {
  if (challenge && isNonEmptyString(challenge.hullId)) return [challenge.hullId];
  return [fallback];
}

/** Live fitting rule: every named fitting must land on the hull and stay inside budget. */
export function strategyFitsHull(strategy) {
  if (!strategy || typeof strategy.hullId !== 'string') return false;
  const ship = SHIP_BY_ID.get(strategy.hullId);
  if (!ship) return false;
  const slots = buildSlotList(ship);
  const fittings = new Array(slots.length).fill(null);
  const ids = Array.isArray(strategy.fittings) ? strategy.fittings : [];
  for (const defId of ids) {
    const def = FITTING_BY_ID.get(defId);
    if (!def) return false;
    let placed = false;
    for (let i = 0; i < slots.length; i += 1) {
      if (fittings[i]) continue;
      if (!fits(slots[i], def)) continue;
      const next = fittings.slice();
      next[i] = defId;
      const budget = outfitBudgetForFittings(strategy.hullId, next);
      if (budget && !budget.fits) continue;
      fittings[i] = defId;
      placed = true;
      break;
    }
    if (!placed) return false;
  }
  return true;
}

/** Hitch cannot carry M concussion; weapons-cold rejects any gun kit. */
export function strategyIsLegal(strategy, challenge = null) {
  if (!strategyFitsHull(strategy)) return false;
  const ids = Array.isArray(strategy.fittings) ? strategy.fittings : [];
  const hasGun = ids.some((id) => typeof id === 'string' && id.startsWith('wpn_'));
  if (challenge && (challenge.physicsOnly === true || challenge.weaponLock === 'starting') && hasGun) {
    return false;
  }
  return true;
}

function strategyHas(strategy, defId) {
  return Array.isArray(strategy.fittings) && strategy.fittings.includes(defId);
}

/** Compile-time score. The compiled challenge picks the build; the seed does not shuffle it. */
export function scoreWeeklyStrategy(strategy, challenge) {
  if (!strategyIsLegal(strategy, challenge)) return 0;
  let score = 1;
  if (challenge && challenge.wellCount > 0 && strategyHas(strategy, 'wpn_gravity_marker_s')) {
    score += challenge.wellCount * 10;
  }
  if (
    challenge
    && Array.isArray(challenge.plannerMutators)
    && challenge.plannerMutators.includes('heavies_only')
    && strategyHas(strategy, 'wpn_concussion_cannon_m')
  ) {
    score += 40;
  }
  if (challenge && challenge.physicsOnly && strategyHas(strategy, 'mod_elastic_whip_m')) {
    score += 40;
  }
  if (challenge && challenge.reefLayoutId && strategyHas(strategy, 'mod_bank_shot')) {
    score += 40;
  }
  if (challenge && challenge.wellCount > 0 && strategyHas(strategy, 'wpn_concussion_cannon_m')
    && !strategyHas(strategy, 'wpn_gravity_marker_s')) {
    score += 2;
  }
  return score;
}

function emptyStrategyRank() {
  return Object.freeze({
    strategyId: null,
    verb: null,
    hullId: null,
    fittings: Object.freeze([]),
    score: 0,
    signature: 'none',
    ranked: Object.freeze([]),
  });
}

function rankTopStrategy(challenge) {
  const ranked = CRUCIBLE_WEEKLY_STRATEGIES.map((strategy) => {
    const legal = strategyIsLegal(strategy, challenge);
    return {
      strategy,
      score: legal ? scoreWeeklyStrategy(strategy, challenge) : 0,
      legal,
    };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.strategy.id.localeCompare(b.strategy.id);
  });
  const top = ranked[0] && ranked[0].score > 0 ? ranked[0] : null;
  const strategy = top ? top.strategy : null;
  if (!strategy) return emptyStrategyRank();
  return Object.freeze({
    strategyId: strategy.id,
    verb: strategy.verb,
    hullId: strategy.hullId,
    fittings: Object.freeze(strategy.fittings.slice()),
    score: top.score,
    signature: `${strategy.id}|${strategy.verb}|${strategy.hullId}|${strategy.fittings.join(',')}`,
    ranked: Object.freeze(ranked.map((row) => Object.freeze({
      id: row.strategy.id,
      score: row.score,
      legal: row.legal,
    }))),
  });
}

/** Best build for one weekly mutator on a named seed. Compile-time only. */
export function topWeeklyStrategy(mutatorId, seed = 0) {
  const id = typeof mutatorId === 'string' ? mutatorId : '';
  const challenge = compileChallenge(seed, id ? [id] : [], 'swarm');
  const ranked = rankTopStrategy(challenge);
  return Object.freeze({
    mutatorId: id,
    seed: (Number.isInteger(seed) ? seed : 0) >>> 0,
    strategyId: ranked.strategyId,
    verb: ranked.verb,
    hullId: ranked.hullId,
    fittings: ranked.fittings,
    score: ranked.score,
    signature: ranked.signature,
    ranked: ranked.ranked,
  });
}

/**
 * Strategy signature for one weekly mutator on a fixed seed/wave.
 * Named fields must move; identical telemetry means the mutator is not live.
 */
export function weeklyTelemetry(mutatorId, seed, wave) {
  const id = typeof mutatorId === 'string' ? mutatorId : '';
  const challenge = compileChallenge(seed, id ? [id] : [], 'swarm');
  const arenaId = challenge.arenaId || DEFAULT_CRUCIBLE_ARENA_ID;
  const plan = planWave({
    seed,
    wave,
    arenaId,
    mutators: challenge.mutators,
    ruleset: 'swarm',
  });
  const packages = plan && Array.isArray(plan.packages) ? plan.packages : [];
  let heavyCount = 0;
  let fodder = 0;
  const roles = [];
  for (const pkg of packages) {
    if (!pkg) continue;
    const n = Number.isInteger(pkg.count) ? pkg.count : 0;
    roles.push(pkg.role);
    if (HEAVY_ROLES.has(pkg.role)) heavyCount += n;
    if (FODDER_ROLES.has(pkg.role) || FODDER_ENEMIES.has(pkg.enemyId)) fodder += n;
  }
  return Object.freeze({
    mutatorId: id,
    wellCount: challenge.wellCount,
    physicsOnly: challenge.physicsOnly === true,
    skipDraft: challenge.skipDraft === true,
    weaponLock: challenge.weaponLock,
    arenaId: challenge.arenaId,
    reefLayoutId: challenge.reefLayoutId || (plan && plan.reefLayoutId) || null,
    plannerMutators: challenge.plannerMutators,
    heavyCount,
    fodder,
    roles: Object.freeze(roles.slice()),
    strategyId: challenge.strategyId,
    strategyVerb: challenge.strategyVerb,
    strategyHullId: challenge.strategyHullId,
    strategySignature: challenge.strategySignature,
  });
}
