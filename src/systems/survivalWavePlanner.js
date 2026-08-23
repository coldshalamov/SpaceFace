// Pure Survival wave planner (CRU-010).
// Intent only: no bus, registry, state, DOM, I/O, or spawnBudget import.
// Same input → same output. Never mutates the input.

import { mulberry32 } from '../core/rng.js';
import {
  SPAWN_BUDGET_DEFAULT_MAX,
  SPAWN_BUDGET_HARD_MAX,
  SURVIVAL_ARC_LENGTH,
  SURVIVAL_TEMPLATE_BLOCK,
  actIndexForWave,
  composeArcWave,
  difficultyForWave,
  templateWaveOf,
} from '../data/survivalActs.js';
import { COMBAT_LAB_ARENAS } from '../data/combatLabSetups.js';
import {
  SURVIVAL_GATE_GROUPS,
  SURVIVAL_WAVES,
  peakConcurrentDemand,
  validateWaveRecipe,
} from '../data/survivalWaves.js';

// Binding ranges from spaceface.combatLabSetup.v1 (seed 1..0xffffffff, wave 1..999).
// Authored recipes exist for template waves 1–10 per live arena. The thirty-wave
// arc remaps waves 11–30 onto that template. Waves in 31..999 are in-range
// input and return the documented error — they are not silently remapped.
const SEED_MIN = 1;
const SEED_MAX = 0xffffffff;
const WAVE_MIN = 1;
const WAVE_MAX = 999;

const ARENA_IDS = new Set(COMBAT_LAB_ARENAS.map((arena) => arena.id));

const RECIPE_BY_ARENA_WAVE = new Map();
for (const recipe of SURVIVAL_WAVES) {
  RECIPE_BY_ARENA_WAVE.set(`${recipe.arenaId}#${recipe.wave}`, recipe);
}

export const WAVE_PLAN_ERROR = 'invalid_input';

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function issue(path, message) {
  return { path, message };
}

function invalid(issues) {
  return { ok: false, error: WAVE_PLAN_ERROR, issues };
}

function isCombatLabSeed(value) {
  return Number.isInteger(value) && value >= SEED_MIN && value <= SEED_MAX;
}

function isCombatLabWave(value) {
  return Number.isInteger(value) && value >= WAVE_MIN && value <= WAVE_MAX;
}

/**
 * Mix (seed, arenaId, wave, act) into a uint32 stream seed.
 * Wave is mixed independently of the run seed so two waves of the same run
 * never share a mulberry32 stream.
 */
export function wavePlanStreamSeed(seed, arenaId, wave, act) {
  const label = `survival-wave-plan-v1|${arenaId}|w${wave}|a${act}`;
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  h = (h ^ Math.imul(wave, 0x85ebca6b) ^ Math.imul(act, 0xc2b2ae35)) >>> 0;
  return h || 1;
}

function pickGate(rng, authored) {
  if (rng() < 0.5) return authored;
  const index = Math.floor(rng() * SURVIVAL_GATE_GROUPS.length);
  return SURVIVAL_GATE_GROUPS[index] || authored;
}

function clonePackage(pkg, gateGroup) {
  const count = pkg.count;
  const batchSize = Number.isInteger(pkg.batchSize) ? pkg.batchSize : count;
  const batchGapTicks = Number.isInteger(pkg.batchGapTicks) ? pkg.batchGapTicks : 0;
  return {
    atTick: pkg.atTick,
    gateGroup,
    role: pkg.role,
    enemyId: pkg.enemyId,
    count,
    batchSize,
    batchGapTicks,
  };
}

function expandSchedule(packages) {
  const entries = [];
  for (let packageIndex = 0; packageIndex < packages.length; packageIndex++) {
    const pkg = packages[packageIndex];
    let remaining = pkg.count;
    let tick = pkg.atTick;
    const batchSize = pkg.batchSize;
    const gap = pkg.batchGapTicks;
    while (remaining > 0) {
      const n = Math.min(batchSize, remaining);
      entries.push({
        atTick: tick,
        gateGroup: pkg.gateGroup,
        role: pkg.role,
        enemyId: pkg.enemyId,
        count: n,
        packageIndex,
      });
      remaining -= n;
      if (remaining > 0) tick += gap;
    }
  }
  entries.sort((a, b) => {
    if (a.atTick !== b.atTick) return a.atTick - b.atTick;
    return a.packageIndex - b.packageIndex;
  });
  return entries;
}

function draftExpectationFor(wave) {
  const blockPos = templateWaveOf(wave);
  if (blockPos === SURVIVAL_TEMPLATE_BLOCK) return { kind: 'refit', choices: null };
  return { kind: 'draft', choices: 3 };
}

function uniqueRoles(packages) {
  const roles = [];
  const seen = new Set();
  for (const pkg of packages) {
    if (seen.has(pkg.role)) continue;
    seen.add(pkg.role);
    roles.push(pkg.role);
  }
  return roles;
}

function applyBuildPressure(packages, blockingRoles, buildSummary, blockPos) {
  if (blockPos !== 9 || !isPlainObject(buildSummary)) {
    return { packages, blockingRoles };
  }
  const dominant = buildSummary.dominant;
  if (typeof dominant !== 'string') return { packages, blockingRoles };
  const next = packages.map((pkg) => ({
    atTick: pkg.atTick,
    gateGroup: pkg.gateGroup,
    role: pkg.role,
    enemyId: pkg.enemyId,
    count: pkg.count,
    batchSize: pkg.batchSize,
    batchGapTicks: pkg.batchGapTicks,
  }));
  if (dominant === 'orbit') {
    for (const pkg of next) {
      if (pkg.role === 'reach') pkg.enemyId = 'quiet_ghost';
    }
  } else if (dominant === 'collision') {
    for (const pkg of next) {
      if (pkg.role === 'support') {
        pkg.role = 'anchor';
        pkg.enemyId = 'field_anchor_controller';
      }
    }
  } else if (dominant === 'chain') {
    for (const pkg of next) {
      if (pkg.role === 'reach') pkg.enemyId = 'pd_screen_escort';
    }
  }
  const spawned = new Set(next.map((pkg) => pkg.role));
  const roles = [];
  for (const role of blockingRoles) {
    if (spawned.has(role) && !roles.includes(role)) roles.push(role);
  }
  for (const role of spawned) {
    if (!roles.includes(role)) roles.push(role);
  }
  return { packages: next, blockingRoles: roles };
}

function applyDifficulty(packages, difficulty) {
  const steps = Number.isFinite(difficulty) ? Math.max(0, Math.floor(difficulty - 1)) : 0;
  if (steps === 0) return packages;
  return packages.map((pkg) => ({
    atTick: pkg.atTick,
    gateGroup: pkg.gateGroup,
    role: pkg.role,
    enemyId: pkg.enemyId,
    count: pkg.count,
    batchSize: pkg.batchSize,
    batchGapTicks: Math.max(0, pkg.batchGapTicks - steps * 15),
  }));
}

function applyMutators(arenaPhase, mutators) {
  if (!Array.isArray(mutators)) return arenaPhase;
  for (const mutator of mutators) {
    if (mutator === 'shutter_alternating') return 'shutter_alternating';
  }
  return arenaPhase;
}

function stableStringify(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'number') {
    if (!Number.isFinite(value)) return 'null';
    return JSON.stringify(value);
  }
  if (type === 'boolean' || type === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out += ',';
      out += stableStringify(value[i]);
    }
    return `${out}]`;
  }
  if (type === 'object') {
    const keys = Object.keys(value).sort();
    let out = '{';
    for (let i = 0; i < keys.length; i++) {
      if (i > 0) out += ',';
      const key = keys[i];
      out += JSON.stringify(key);
      out += ':';
      out += stableStringify(value[key]);
    }
    return `${out}}`;
  }
  return 'null';
}

export function hashSemanticWavePlan(plan) {
  const semantic = plan && plan.ok === false
    ? { error: plan.error, issues: plan.issues, ok: false }
    : {
        arenaPhase: plan && plan.arenaPhase,
        completionRules: plan && plan.completionRules,
        draftExpectation: plan && plan.draftExpectation,
        id: plan && plan.id,
        objective: plan && plan.objective,
        packages: plan && plan.packages,
        rewards: plan && plan.rewards,
        schedule: plan && plan.schedule,
      };
  const str = stableStringify(semantic);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function lookupRecipe(arenaId, wave) {
  if (!Number.isInteger(wave) || wave < 1 || wave > SURVIVAL_ARC_LENGTH) return null;
  return RECIPE_BY_ARENA_WAVE.get(`${arenaId}#${templateWaveOf(wave)}`) || null;
}

function planFromRecipe({ recipe, seed, wave, act, difficulty, mutators, buildSummary, rng }) {
  const blockPos = templateWaveOf(wave);
  const rawPackages = recipe.packages.map((pkg) => clonePackage(pkg, pickGate(rng, pkg.gateGroup)));
  const pressured = applyBuildPressure(
    rawPackages,
    recipe.completion.blockingRolesResolved.slice(),
    buildSummary,
    blockPos,
  );
  const composed = composeArcWave({
    packages: pressured.packages,
    blockingRoles: pressured.blockingRoles,
    arenaPhase: recipe.arenaPhase,
    objective: recipe.objective,
    wave,
  });
  const packages = applyDifficulty(composed.packages, difficulty);
  const schedule = expandSchedule(packages);
  const peak = peakConcurrentDemand(packages);
  if (peak > SPAWN_BUDGET_DEFAULT_MAX) {
    return invalid([issue('packages', `peak concurrent demand ${peak} exceeds 24`)]);
  }
  if (peak > SPAWN_BUDGET_HARD_MAX) {
    return invalid([issue('packages', `peak concurrent demand ${peak} exceeds 40`)]);
  }
  const spawnedRoles = new Set(packages.map((pkg) => pkg.role));
  // Plan field is `blockingRoles`. Recipe field is `blockingRolesResolved`
  // (Appendix A.2). See the comment in survivalWaves.js.
  const blockingRoles = composed.blockingRoles.filter((role) => spawnedRoles.has(role));
  const plan = {
    id: `${recipe.id}:w${wave}:a${act}:${seed.toString(16)}`,
    objective: { kind: composed.objective.kind },
    packages,
    schedule,
    arenaPhase: applyMutators(composed.arenaPhase, mutators),
    rewards: {
      xp: recipe.rewards.xp + act * 20 + (Number.isFinite(difficulty) ? Math.max(0, Math.floor(difficulty - 1)) * 10 : 0),
      credits: recipe.rewards.credits + act * 6,
    },
    draftExpectation: draftExpectationFor(wave),
    completionRules: {
      requiredPackagesMaterialized: recipe.completion.requiredPackagesMaterialized === true,
      blockingRoles: blockingRoles.length > 0 ? blockingRoles : uniqueRoles(packages),
      cleanupTicks: Number.isInteger(recipe.completion.cleanupTicks) ? recipe.completion.cleanupTicks : 0,
    },
  };
  if (composed.systemEvent) plan.systemEvent = composed.systemEvent;
  return plan;
}

export function planWave(input) {
  try {
    return planWaveInner(input);
  } catch {
    return invalid([issue('', 'invalid planWave input')]);
  }
}

function planWaveInner(input) {
  if (!isPlainObject(input)) {
    return invalid([issue('', 'planWave input must be an object')]);
  }

  const issues = [];
  const seed = input.seed;
  const arenaId = input.arenaId;
  const wave = input.wave;

  if (!isCombatLabSeed(seed)) {
    issues.push(issue('seed', 'seed must be an integer in 1..0xffffffff'));
  }
  if (typeof arenaId !== 'string' || !ARENA_IDS.has(arenaId)) {
    issues.push(issue('arenaId', 'unknown arenaId'));
  }
  if (!isCombatLabWave(wave)) {
    issues.push(issue('wave', 'wave must be an integer in 1..999'));
  }
  if (issues.length > 0) return invalid(issues);

  const act = Number.isInteger(input.act) ? input.act : actIndexForWave(wave);
  const difficulty = Number.isFinite(input.difficulty) ? input.difficulty : difficultyForWave(wave);
  const mutators = Array.isArray(input.mutators) ? input.mutators : [];
  const buildSummary = input.buildSummary == null ? null : input.buildSummary;

  const recipe = lookupRecipe(arenaId, wave);
  if (!recipe) {
    return invalid([issue('wave', 'no authored recipe for this arena and wave')]);
  }
  const checked = validateWaveRecipe(recipe);
  if (!checked.ok) return invalid(checked.issues);

  const rng = mulberry32(wavePlanStreamSeed(seed, arenaId, wave, act));
  return planFromRecipe({
    recipe,
    seed,
    wave,
    act,
    difficulty,
    mutators,
    buildSummary,
    rng,
  });
}
