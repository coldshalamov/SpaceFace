// CRU-010 — pure wave planner. Repeatability, snapshots, and semantic checks.
import test from 'node:test';
import assert from 'node:assert/strict';

import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SURVIVAL_WAVES, validateWaveRecipe } from '../src/data/survivalWaves.js';
import {
  planWave,
  hashSemanticWavePlan as hashSemantic,
} from '../src/systems/survivalWavePlanner.js';

const ENEMY_IDS = new Set(ENEMY_TYPES.map((enemy) => enemy.id));
const ARENA_ID = COMBAT_LAB_ARENAS[0].id;

function isPlan(value) {
  return value && value.ok !== false && Array.isArray(value.packages) && Array.isArray(value.schedule);
}

function deepSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertPlainJson(value, path = '$') {
  if (value === null) return;
  const type = typeof value;
  if (type === 'undefined') assert.fail(`undefined at ${path}`);
  if (type === 'function') assert.fail(`function at ${path}`);
  if (type === 'number') {
    assert.ok(Number.isFinite(value), `non-finite number at ${path}`);
    return;
  }
  if (type === 'string' || type === 'boolean') return;
  if (typeof Map === 'function' && value instanceof Map) assert.fail(`Map at ${path}`);
  if (typeof Set === 'function' && value instanceof Set) assert.fail(`Set at ${path}`);
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertPlainJson(item, `${path}[${i}]`));
    return;
  }
  if (type === 'object') {
    for (const key of Object.keys(value)) {
      assertPlainJson(value[key], `${path}.${key}`);
    }
    return;
  }
  assert.fail(`non-JSON type ${type} at ${path}`);
}

function peakConcurrentDemand(packages) {
  let total = 0;
  for (const pkg of packages) total += pkg.count;
  return total;
}

// Fight content only. The plan id embeds the seed, so comparing whole plans
// cannot prove pickGate (or any other seed-selected field) actually varies.
function fightSemantics(plan) {
  return {
    objective: plan.objective,
    packages: plan.packages,
    schedule: plan.schedule,
    rewards: plan.rewards,
  };
}

const PURITY_INPUTS = [
  { seed: 1, arenaId: 'helios_core', wave: 1 },
  { seed: 47, arenaId: 'helios_core', wave: 5 },
  { seed: 47, arenaId: 'helios_core', wave: 10 },
  { seed: 99, arenaId: 'ceres_belt', wave: 3 },
  {
    seed: 12345,
    arenaId: 'tethys_hub',
    wave: 8,
    act: 1,
    difficulty: 2,
    mutators: ['shutter_alternating'],
    buildSummary: { dominant: 'orbit' },
  },
  {
    seed: 0xffffffff,
    arenaId: 'helios_core',
    wave: 9,
    buildSummary: { dominant: 'chain' },
  },
];

test('Appendix A.7 purity: planWave is deepEqual and hash-stable across structuredClone', () => {
  for (const input of PURITY_INPUTS) {
    const a = planWave(input);
    const b = planWave(structuredClone(input));

    assert.deepEqual(a, b);
    assert.equal(hashSemantic(a), hashSemantic(b));
    assert.ok(isPlan(a), `expected a plan for ${JSON.stringify(input)}`);
  }
});

test('planWave does not mutate its input', () => {
  const input = {
    seed: 47,
    arenaId: 'helios_core',
    wave: 7,
    act: 0,
    difficulty: 1,
    mutators: ['hot'],
    buildSummary: { dominant: 'rail' },
  };
  const before = deepSnapshot(input);
  const plan = planWave(input);
  assert.ok(isPlan(plan));
  assert.deepEqual(input, before);
});

test('planWave output is plain JSON', () => {
  const plan = planWave({ seed: 47, arenaId: ARENA_ID, wave: 6 });
  assert.ok(isPlan(plan));
  assertPlainJson(plan);
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan);
});

test('same seed/arena/wave is deterministic; different seeds differ on fight content, not just plan id', () => {
  const input = { seed: 47, arenaId: 'helios_core', wave: 10 };
  assert.deepEqual(planWave(input), planWave({ ...input }));

  const baseline = fightSemantics(planWave({ seed: 1, arenaId: 'helios_core', wave: 10 }));
  const gates = new Set(baseline.packages.map((pkg) => pkg.gateGroup));
  let foundDifference = false;
  for (let seed = 2; seed <= 64; seed++) {
    const other = fightSemantics(planWave({ seed, arenaId: 'helios_core', wave: 10 }));
    for (const pkg of other.packages) gates.add(pkg.gateGroup);
    if (JSON.stringify(other) !== JSON.stringify(baseline)) foundDifference = true;
  }
  assert.ok(foundDifference, 'planner ignored the seed (or only changed the plan id)');
  // This assertion fails if pickGate is stubbed to a constant: every seed
  // would keep the authored gates and fightSemantics would match.
  assert.ok(gates.size > 1, 'pickGate is stubbed constant — seed must change gate selection');
});

test('different waves differ on fight content with the plan id excluded', () => {
  const a = fightSemantics(planWave({ seed: 47, arenaId: 'helios_core', wave: 1 }));
  const b = fightSemantics(planWave({ seed: 47, arenaId: 'helios_core', wave: 2 }));
  assert.notDeepEqual(a, b);
});

test('planWave never throws for a recipe the validator accepts', () => {
  for (const recipe of SURVIVAL_WAVES) {
    assert.equal(validateWaveRecipe(recipe).ok, true, recipe.id);
    let plan = null;
    assert.doesNotThrow(() => {
      plan = planWave({ seed: 47, arenaId: recipe.arenaId, wave: recipe.wave });
    });
    assert.ok(isPlan(plan), recipe.id);
  }
});

// Changing these expected objects is a deliberate content decision.
// Do not update them to paper over an accidental planner change.
const SNAPSHOT_SEED = 47;
const SNAPSHOT_ARENA = 'helios_core';
const SNAPSHOTS = {
  1: {
    id: 'helios_core_w01_intro_mass:w1:a0:2f',
    objective: { kind: 'resolve_hostiles' },
    packages: [
      {
        atTick: 0,
        gateGroup: 'nw',
        role: 'mass',
        enemyId: 'wasp_swarmer',
        count: 6,
        batchSize: 6,
        batchGapTicks: 0,
      },
    ],
    schedule: [
      {
        atTick: 0,
        gateGroup: 'nw',
        role: 'mass',
        enemyId: 'wasp_swarmer',
        count: 6,
        packageIndex: 0,
      },
    ],
    arenaPhase: 'idle',
    rewards: { xp: 52, credits: 12 },
    draftExpectation: { kind: 'draft', choices: 3 },
    completionRules: {
      requiredPackagesMaterialized: true,
      blockingRoles: ['mass'],
      cleanupTicks: 180,
    },
  },
  5: {
    id: 'helios_core_w05_elite_hunt:w5:a0:2f',
    objective: { kind: 'elite_hunt' },
    packages: [
      {
        atTick: 0,
        gateGroup: 'nw',
        role: 'mass',
        enemyId: 'wasp_swarmer',
        count: 6,
        batchSize: 6,
        batchGapTicks: 0,
      },
      {
        atTick: 60,
        gateGroup: 'se',
        role: 'elite',
        enemyId: 'corsair_raider',
        count: 1,
        batchSize: 1,
        batchGapTicks: 0,
      },
    ],
    schedule: [
      {
        atTick: 0,
        gateGroup: 'nw',
        role: 'mass',
        enemyId: 'wasp_swarmer',
        count: 6,
        packageIndex: 0,
      },
      {
        atTick: 60,
        gateGroup: 'se',
        role: 'elite',
        enemyId: 'corsair_raider',
        count: 1,
        packageIndex: 1,
      },
    ],
    arenaPhase: 'furnace_active',
    rewards: { xp: 100, credits: 28 },
    draftExpectation: { kind: 'draft', choices: 3 },
    completionRules: {
      requiredPackagesMaterialized: true,
      blockingRoles: ['mass', 'elite'],
      cleanupTicks: 180,
    },
  },
  10: {
    id: 'helios_core_w10_boss:w10:a0:2f',
    objective: { kind: 'boss' },
    packages: [
      {
        atTick: 0,
        gateGroup: 'diagonal_b',
        role: 'elite',
        enemyId: 'dreadnought_boss',
        count: 1,
        batchSize: 1,
        batchGapTicks: 0,
      },
      {
        atTick: 90,
        gateGroup: 'se',
        role: 'mass',
        enemyId: 'wasp_swarmer',
        count: 6,
        batchSize: 3,
        batchGapTicks: 90,
      },
    ],
    schedule: [
      {
        atTick: 0,
        gateGroup: 'diagonal_b',
        role: 'elite',
        enemyId: 'dreadnought_boss',
        count: 1,
        packageIndex: 0,
      },
      {
        atTick: 90,
        gateGroup: 'se',
        role: 'mass',
        enemyId: 'wasp_swarmer',
        count: 3,
        packageIndex: 1,
      },
      {
        atTick: 180,
        gateGroup: 'se',
        role: 'mass',
        enemyId: 'wasp_swarmer',
        count: 3,
        packageIndex: 1,
      },
    ],
    arenaPhase: 'boss',
    rewards: { xp: 160, credits: 48 },
    draftExpectation: { kind: 'refit', choices: null },
    completionRules: {
      requiredPackagesMaterialized: true,
      blockingRoles: ['elite', 'mass'],
      cleanupTicks: 240,
    },
  },
};

test('snapshot pins the full plan for seed 47 / helios_core waves 1, 5, and 10', () => {
  for (const wave of [1, 5, 10]) {
    const plan = planWave({ seed: SNAPSHOT_SEED, arenaId: SNAPSHOT_ARENA, wave });
    assert.deepEqual(plan, SNAPSHOTS[wave]);
  }
});

test('semantic plan constraints: live ids, peak 24, blocking roles, schedule, batch sums', () => {
  const cases = [];
  for (const arena of COMBAT_LAB_ARENAS) {
    for (let wave = 1; wave <= 10; wave++) {
      cases.push({ seed: 47, arenaId: arena.id, wave });
      cases.push({ seed: 1, arenaId: arena.id, wave, act: 2, difficulty: 1.0, mutators: [] });
    }
  }
  cases.push({ seed: 9, arenaId: 'helios_core', wave: 9, buildSummary: { dominant: 'orbit' } });
  cases.push({ seed: 9, arenaId: 'helios_core', wave: 9, buildSummary: { dominant: 'collision' } });

  for (const input of cases) {
    const plan = planWave(input);
    assert.ok(isPlan(plan), JSON.stringify(input));

    const spawnedRoles = new Set(plan.packages.map((pkg) => pkg.role));
    for (const pkg of plan.packages) {
      assert.ok(ENEMY_IDS.has(pkg.enemyId), `invented enemyId ${pkg.enemyId}`);
      assert.ok(Number.isInteger(pkg.count) && pkg.count >= 1);
    }
    // 24 is DEFAULT_MAX at src/systems/spawnBudget.js:26 — do not import the private constant.
    assert.ok(peakConcurrentDemand(plan.packages) <= 24);

    for (const role of plan.completionRules.blockingRoles) {
      assert.ok(spawnedRoles.has(role), `blocking role ${role} not spawned`);
    }

    let previousTick = -1;
    let scheduleCount = 0;
    for (const entry of plan.schedule) {
      assert.ok(Number.isInteger(entry.atTick) && entry.atTick >= 0);
      assert.ok(entry.atTick >= previousTick, 'schedule is not ordered by atTick');
      previousTick = entry.atTick;
      scheduleCount += entry.count;
    }
    let packageCount = 0;
    for (const pkg of plan.packages) packageCount += pkg.count;
    assert.equal(packageCount, scheduleCount);
  }
});

test('planWave does not consult Math.random', () => {
  const original = Math.random;
  Math.random = () => {
    throw new Error('ambient Math.random');
  };
  try {
    const a = planWave({ seed: 7, arenaId: 'helios_core', wave: 1 });
    const b = planWave({ seed: 7, arenaId: 'ceres_belt', wave: 8, act: 1, mutators: ['shutter_alternating'] });
    assert.ok(isPlan(a));
    assert.ok(isPlan(b));
  } finally {
    Math.random = original;
  }
});

test('planWave rejects out-of-range input without throwing or clamping', () => {
  const cases = [
    { input: { seed: 1, arenaId: 'helios_core', wave: 0 }, path: 'wave' },
    { input: { seed: 1, arenaId: 'helios_core', wave: 1000 }, path: 'wave' },
    { input: { seed: 0, arenaId: 'helios_core', wave: 1 }, path: 'seed' },
    { input: { seed: 1.5, arenaId: 'helios_core', wave: 1 }, path: 'seed' },
    { input: { seed: 0x100000000, arenaId: 'helios_core', wave: 1 }, path: 'seed' },
    { input: { seed: -3, arenaId: 'helios_core', wave: 1 }, path: 'seed' },
    { input: { seed: 1, arenaId: 'arena_does_not_exist', wave: 1 }, path: 'arenaId' },
    { input: { seed: 1, arenaId: 'helios_core', wave: 31 }, path: 'wave' },
    { input: { seed: 0xffffffff, arenaId: 'helios_core', wave: 999 }, path: 'wave' },
  ];
  for (const { input, path } of cases) {
    let result = null;
    assert.doesNotThrow(() => {
      result = planWave(input);
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid_input');
    assert.ok(
      (result.issues || []).some((entry) => entry && entry.path === path),
      `expected issue path ${path} for ${JSON.stringify(input)}, got ${JSON.stringify(result.issues)}`,
    );
    assert.equal(isPlan(result), false);
  }

  const validLow = planWave({ seed: 1, arenaId: 'helios_core', wave: 1 });
  const validHigh = planWave({ seed: 0xffffffff, arenaId: 'helios_core', wave: 10 });
  assert.ok(isPlan(validLow));
  assert.ok(isPlan(validHigh));
});
