// Survival wave-recipe catalog and pure validator (CRU-009).
// Data only: no runtime writes, no imports from src/systems/**.
// Recipe field names follow design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md Appendix A.2.

import { COMBAT_LAB_ARENAS } from './combatLabSetups.js';
import { ENEMY_TYPES } from './enemies.js';

export const SURVIVAL_WAVE_SCHEMA_VERSION = 1;

// Role slots from §21.3 (lines 2949–2962): Mass, Pressure, Control, Reach,
// Support, Anchor, Disruptor, Elite. Not every wave uses every slot.
export const SURVIVAL_WAVE_ROLES = Object.freeze([
  'mass',
  'pressure',
  'control',
  'reach',
  'support',
  'anchor',
  'disruptor',
  'elite',
]);

// Gate groups a recipe may name. Corner gates from Appendix A.1 spawnGates
// (line 6038: nw, ne, sw, se). diagonal_a / rear from Appendix A.2 packages
// (lines 6063, 6072). front / diagonal_b are the pincer complements implied
// by §21.4 Pincer (lines 2976–2978: two or more spawn directions).
export const SURVIVAL_GATE_GROUPS = Object.freeze([
  'nw',
  'ne',
  'sw',
  'se',
  'front',
  'rear',
  'diagonal_a',
  'diagonal_b',
]);

// DEFAULT_MAX at src/systems/spawnBudget.js:26 — do not import the private constant.
const SPAWN_BUDGET_DEFAULT_MAX = 24;

const ENEMY_IDS = new Set(ENEMY_TYPES.map((enemy) => enemy.id));
const ROLE_SET = new Set(SURVIVAL_WAVE_ROLES);
const GATE_SET = new Set(SURVIVAL_GATE_GROUPS);
const ARENA_IDS = new Set(COMBAT_LAB_ARENAS.map((arena) => arena.id));

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function issue(path, message) {
  return { path, message };
}

/**
 * Peak concurrent demand is the no-death occupancy of the spawn timeline:
 * every scheduled body occupies a slot from its spawn tick through wave
 * completion. A pure planner has no death model, so this equals total
 * package count. Cap is 24 (src/systems/spawnBudget.js:26 DEFAULT_MAX).
 */
export function peakConcurrentDemand(packages) {
  if (!Array.isArray(packages)) return 0;
  let total = 0;
  for (const pkg of packages) {
    if (!pkg || typeof pkg !== 'object') continue;
    if (!Number.isInteger(pkg.count) || pkg.count < 0) continue;
    total += pkg.count;
  }
  return total;
}

// Recipe completion uses Appendix A.2 `blockingRolesResolved`.
// The planner's output `completionRules` uses `blockingRoles` — the fight-instance
// list of roles that actually spawned. The names stay different on purpose:
// the recipe is an authoring record; the plan is a fight instance.

export function validateWaveRecipe(recipe) {
  try {
    return validateWaveRecipeInner(recipe);
  } catch {
    return { ok: false, issues: [issue('', 'invalid recipe')] };
  }
}

function validateWaveRecipeInner(recipe) {
  const issues = [];
  if (!isPlainObject(recipe)) {
    return { ok: false, issues: [issue('', 'recipe must be an object')] };
  }

  if (typeof recipe.id !== 'string' || recipe.id.length === 0) {
    issues.push(issue('id', 'id must be a non-empty string'));
  }

  if (recipe.schemaVersion !== SURVIVAL_WAVE_SCHEMA_VERSION) {
    issues.push(issue('schemaVersion', `schemaVersion must be ${SURVIVAL_WAVE_SCHEMA_VERSION}`));
  }

  if (typeof recipe.arenaId !== 'string' || !ARENA_IDS.has(recipe.arenaId)) {
    issues.push(issue('arenaId', 'unknown arenaId'));
  }

  if (!Number.isInteger(recipe.wave) || recipe.wave < 1) {
    issues.push(issue('wave', 'wave must be an integer >= 1'));
  }

  if (!isPlainObject(recipe.objective) || typeof recipe.objective.kind !== 'string' || recipe.objective.kind.length === 0) {
    issues.push(issue('objective', 'missing objective'));
  }

  if (!Number.isFinite(recipe.threatBudget) || recipe.threatBudget < 0) {
    issues.push(issue('threatBudget', 'threatBudget must be a non-negative finite number'));
  }

  if (typeof recipe.arenaPhase !== 'string' || recipe.arenaPhase.length === 0) {
    issues.push(issue('arenaPhase', 'arenaPhase must be a non-empty string'));
  }

  const packages = recipe.packages;
  const providedRoles = new Set();
  if (!Array.isArray(packages)) {
    issues.push(issue('packages', 'packages must be an array'));
  } else {
    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];
      const path = `packages[${i}]`;
      if (!isPlainObject(pkg)) {
        issues.push(issue(path, 'package must be an object'));
        continue;
      }
      if (!Number.isInteger(pkg.atTick) || pkg.atTick < 0) {
        issues.push(issue(`${path}.atTick`, 'atTick must be a non-negative integer'));
      }
      if (typeof pkg.gateGroup !== 'string' || !GATE_SET.has(pkg.gateGroup)) {
        issues.push(issue(`${path}.gateGroup`, 'unknown gateGroup'));
      }
      if (typeof pkg.role !== 'string' || !ROLE_SET.has(pkg.role)) {
        issues.push(issue(`${path}.role`, 'unknown role'));
      } else {
        providedRoles.add(pkg.role);
      }
      if (typeof pkg.enemyId !== 'string' || !ENEMY_IDS.has(pkg.enemyId)) {
        issues.push(issue(`${path}.enemyId`, 'unknown enemyId'));
      }
      if (!Number.isInteger(pkg.count) || pkg.count < 1) {
        issues.push(issue(`${path}.count`, 'count must be an integer >= 1'));
      }
      if (pkg.batchSize != null) {
        if (!Number.isInteger(pkg.batchSize) || pkg.batchSize < 1) {
          issues.push(issue(`${path}.batchSize`, 'batchSize must be an integer >= 1'));
        } else if (Number.isInteger(pkg.count) && pkg.batchSize > pkg.count) {
          issues.push(issue(`${path}.batchSize`, 'batchSize must not exceed count'));
        }
      }
      if (pkg.batchGapTicks != null && (!Number.isInteger(pkg.batchGapTicks) || pkg.batchGapTicks < 0)) {
        issues.push(issue(`${path}.batchGapTicks`, 'batchGapTicks must be a non-negative integer'));
      }
    }

    const peak = peakConcurrentDemand(packages);
    // 24 is DEFAULT_MAX at src/systems/spawnBudget.js:26 — do not import the private constant.
    if (peak > 24) {
      issues.push(issue('packages', `peak concurrent demand ${peak} exceeds 24`));
    }
  }

  if (!isPlainObject(recipe.completion)) {
    issues.push(issue('completion', 'completion must be an object'));
  } else {
    const completion = recipe.completion;
    if (typeof completion.requiredPackagesMaterialized !== 'boolean') {
      issues.push(issue('completion.requiredPackagesMaterialized', 'requiredPackagesMaterialized must be a boolean'));
    }
    if (!Number.isInteger(completion.cleanupTicks) || completion.cleanupTicks < 0) {
      issues.push(issue('completion.cleanupTicks', 'cleanupTicks must be a non-negative integer'));
    }
    if (!Array.isArray(completion.blockingRolesResolved)) {
      issues.push(issue('completion.blockingRolesResolved', 'blockingRolesResolved must be an array'));
    } else {
      for (let i = 0; i < completion.blockingRolesResolved.length; i++) {
        const role = completion.blockingRolesResolved[i];
        const path = `completion.blockingRolesResolved[${i}]`;
        if (typeof role !== 'string' || !ROLE_SET.has(role)) {
          issues.push(issue(path, 'unknown role'));
        } else if (Array.isArray(packages) && !providedRoles.has(role)) {
          issues.push(issue(path, 'blockingRoles entry that no package provides'));
        }
      }
    }
  }

  if (!isPlainObject(recipe.rewards)) {
    issues.push(issue('rewards', 'rewards must be an object'));
  } else {
    if (!Number.isInteger(recipe.rewards.xp) || recipe.rewards.xp < 0) {
      issues.push(issue('rewards.xp', 'xp must be a non-negative integer'));
    }
    if (!Number.isInteger(recipe.rewards.credits) || recipe.rewards.credits < 0) {
      issues.push(issue('rewards.credits', 'credits must be a non-negative integer'));
    }
  }

  return { ok: issues.length === 0, issues };
}

function pkg(atTick, gateGroup, role, enemyId, count, batchSize, batchGapTicks) {
  const size = batchSize == null ? count : batchSize;
  const gap = batchGapTicks == null ? 0 : batchGapTicks;
  return {
    atTick,
    gateGroup,
    role,
    enemyId,
    count,
    batchSize: size,
    batchGapTicks: gap,
  };
}

function waveRecipe({
  arenaId,
  wave,
  shape,
  objectiveKind,
  threatBudget,
  packages,
  arenaPhase,
  blockingRoles,
  cleanupTicks,
  xp,
  credits,
}) {
  return {
    id: `${arenaId}_w${String(wave).padStart(2, '0')}_${shape}`,
    schemaVersion: SURVIVAL_WAVE_SCHEMA_VERSION,
    arenaId,
    wave,
    objective: { kind: objectiveKind },
    threatBudget,
    packages,
    arenaPhase,
    completion: {
      requiredPackagesMaterialized: true,
      blockingRolesResolved: blockingRoles,
      cleanupTicks,
    },
    rewards: { xp, credits },
  };
}

// Ten-wave block from §21.5 (lines 3014–3027) filled with the C.3 paper
// encounter counts, using only live ENEMY_TYPES ids.
function tenWaveBlock(arenaId, gateA, gateB) {
  return [
    waveRecipe({
      arenaId, wave: 1, shape: 'intro_mass',
      objectiveKind: 'resolve_hostiles', threatBudget: 8,
      packages: [pkg(0, gateA, 'mass', 'wasp_swarmer', 6)],
      arenaPhase: 'idle', blockingRoles: ['mass'], cleanupTicks: 180,
      xp: 52, credits: 12,
    }),
    waveRecipe({
      arenaId, wave: 2, shape: 'density',
      objectiveKind: 'resolve_hostiles', threatBudget: 10,
      packages: [
        pkg(0, gateA, 'mass', 'wasp_swarmer', 4),
        pkg(90, gateB, 'mass', 'wasp_swarmer', 4),
      ],
      arenaPhase: 'idle', blockingRoles: ['mass'], cleanupTicks: 180,
      xp: 64, credits: 16,
    }),
    waveRecipe({
      arenaId, wave: 3, shape: 'specialist',
      objectiveKind: 'resolve_hostiles', threatBudget: 12,
      packages: [
        pkg(0, gateA, 'mass', 'wasp_swarmer', 6),
        pkg(120, gateB, 'reach', 'lancer_sniper', 1),
      ],
      arenaPhase: 'shutter_slow', blockingRoles: ['mass', 'reach'], cleanupTicks: 180,
      xp: 76, credits: 20,
    }),
    waveRecipe({
      arenaId, wave: 4, shape: 'pincer',
      objectiveKind: 'resolve_hostiles', threatBudget: 14,
      packages: [
        pkg(0, gateA, 'mass', 'wasp_swarmer', 5),
        pkg(90, gateB, 'mass', 'wasp_swarmer', 5),
      ],
      arenaPhase: 'shutter_slow', blockingRoles: ['mass'], cleanupTicks: 180,
      xp: 88, credits: 24,
    }),
    waveRecipe({
      arenaId, wave: 5, shape: 'elite_hunt',
      objectiveKind: 'elite_hunt', threatBudget: 16,
      packages: [
        pkg(0, gateA, 'mass', 'wasp_swarmer', 6),
        pkg(60, gateB, 'elite', 'corsair_raider', 1),
      ],
      arenaPhase: 'furnace_active', blockingRoles: ['mass', 'elite'], cleanupTicks: 180,
      xp: 100, credits: 28,
    }),
    waveRecipe({
      arenaId, wave: 6, shape: 'two_role',
      objectiveKind: 'resolve_hostiles', threatBudget: 18,
      packages: [
        pkg(0, gateA, 'mass', 'wasp_swarmer', 8, 4, 90),
        pkg(150, gateB, 'pressure', 'reaver_pirate', 1),
      ],
      arenaPhase: 'loose_plate', blockingRoles: ['mass', 'pressure'], cleanupTicks: 180,
      xp: 112, credits: 32,
    }),
    waveRecipe({
      arenaId, wave: 7, shape: 'control_lane',
      objectiveKind: 'resolve_hostiles', threatBudget: 20,
      packages: [
        pkg(0, gateB, 'control', 'mine_layer_jackal', 1),
        pkg(90, gateA, 'mass', 'wasp_swarmer', 8, 4, 90),
      ],
      arenaPhase: 'shutter_alternating', blockingRoles: ['control', 'mass'], cleanupTicks: 180,
      xp: 124, credits: 36,
    }),
    waveRecipe({
      arenaId, wave: 8, shape: 'flood',
      objectiveKind: 'resolve_hostiles', threatBudget: 22,
      packages: [pkg(0, gateA, 'mass', 'wasp_swarmer', 14, 7, 90)],
      arenaPhase: 'shutter_lane_close', blockingRoles: ['mass'], cleanupTicks: 180,
      xp: 136, credits: 40,
    }),
    waveRecipe({
      arenaId, wave: 9, shape: 'counter_lane',
      objectiveKind: 'resolve_hostiles', threatBudget: 24,
      packages: [
        pkg(0, gateA, 'support', 'pd_screen_escort', 2),
        pkg(60, gateB, 'mass', 'wasp_swarmer', 6),
        pkg(120, gateA, 'reach', 'lancer_sniper', 1),
      ],
      arenaPhase: 'absorbent_screen', blockingRoles: ['support', 'mass', 'reach'], cleanupTicks: 180,
      xp: 148, credits: 44,
    }),
    waveRecipe({
      arenaId, wave: 10, shape: 'boss',
      objectiveKind: 'boss', threatBudget: 28,
      packages: [
        pkg(0, gateA, 'elite', 'dreadnought_boss', 1),
        pkg(90, gateB, 'mass', 'wasp_swarmer', 6, 3, 90),
      ],
      arenaPhase: 'boss', blockingRoles: ['elite', 'mass'], cleanupTicks: 240,
      xp: 160, credits: 48,
    }),
  ];
}

export const SURVIVAL_WAVES = freezeDeep([
  ...tenWaveBlock('helios_core', 'nw', 'se'),
  ...tenWaveBlock('ceres_belt', 'ne', 'sw'),
  ...tenWaveBlock('tethys_hub', 'diagonal_a', 'rear'),
]);
