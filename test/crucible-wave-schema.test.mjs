// CRU-009 — wave-recipe schema: live ids, frozen catalog, validator issues.
import test from 'node:test';
import assert from 'node:assert/strict';

import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  SURVIVAL_GATE_GROUPS,
  SURVIVAL_WAVE_ROLES,
  SURVIVAL_WAVES,
  validateWaveRecipe,
} from '../src/data/survivalWaves.js';

const ENEMY_IDS = new Set(ENEMY_TYPES.map((enemy) => enemy.id));
const ARENA_IDS = COMBAT_LAB_ARENAS.map((arena) => arena.id);

function issuePaths(result) {
  return (result.issues || []).map((entry) => entry && entry.path);
}

function assertIssuePath(result, path) {
  assert.equal(result.ok, false, `expected rejection for ${path}`);
  assert.ok(
    issuePaths(result).includes(path),
    `expected issue path ${path}, got ${JSON.stringify(result.issues)}`,
  );
}

function cloneRecipe(overrides = {}) {
  const base = SURVIVAL_WAVES[0];
  return {
    id: base.id,
    schemaVersion: base.schemaVersion,
    arenaId: base.arenaId,
    wave: base.wave,
    objective: { ...base.objective },
    threatBudget: base.threatBudget,
    packages: base.packages.map((pkg) => ({ ...pkg })),
    arenaPhase: base.arenaPhase,
    completion: {
      ...base.completion,
      blockingRolesResolved: [...base.completion.blockingRolesResolved],
    },
    rewards: { ...base.rewards },
    ...overrides,
  };
}

function assertDeepFrozen(value, path = '$') {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value), `expected frozen at ${path}`);
    if (Array.isArray(value)) {
      value.forEach((item, i) => assertDeepFrozen(item, `${path}[${i}]`));
      return;
    }
    for (const key of Object.keys(value)) {
      assertDeepFrozen(value[key], `${path}.${key}`);
    }
  }
}

test('validateWaveRecipe accepts every authored recipe in SURVIVAL_WAVES', () => {
  assert.ok(SURVIVAL_WAVES.length > 0);
  for (const recipe of SURVIVAL_WAVES) {
    const result = validateWaveRecipe(recipe);
    assert.equal(result.ok, true, `${recipe.id}: ${JSON.stringify(result.issues)}`);
    assert.deepEqual(result.issues, []);
  }
});

test('validateWaveRecipe rejects illegal fields with the exact issue path', () => {
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], enemyId: 'not_a_real_enemy' }],
    })),
    'packages[0].enemyId',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], count: 0 }],
    })),
    'packages[0].count',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], count: 1.5 }],
    })),
    'packages[0].count',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], count: 4, batchSize: 5 }],
    })),
    'packages[0].batchSize',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], atTick: -1 }],
    })),
    'packages[0].atTick',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], role: 'minion' }],
    })),
    'packages[0].role',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], gateGroup: 'northwest_portal' }],
    })),
    'packages[0].gateGroup',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({ objective: null })),
    'objective',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      completion: {
        requiredPackagesMaterialized: true,
        blockingRolesResolved: ['elite'],
        cleanupTicks: 180,
      },
    })),
    'completion.blockingRolesResolved[0]',
  );

  const overCap = cloneRecipe({
    packages: [{
      atTick: 0,
      gateGroup: 'nw',
      role: 'mass',
      enemyId: 'wasp_swarmer',
      count: 25,
      batchSize: 25,
      batchGapTicks: 0,
    }],
  });
  // 24 is DEFAULT_MAX at src/systems/spawnBudget.js:26 — do not import the private constant.
  assertIssuePath(validateWaveRecipe(overCap), 'packages');

  const emptyCompletion = validateWaveRecipe(cloneRecipe({ completion: {} }));
  assertIssuePath(emptyCompletion, 'completion.requiredPackagesMaterialized');
  assertIssuePath(emptyCompletion, 'completion.blockingRolesResolved');
  assertIssuePath(emptyCompletion, 'completion.cleanupTicks');

  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      completion: {
        requiredPackagesMaterialized: true,
        blockingRolesResolved: 'mass',
        cleanupTicks: 180,
      },
    })),
    'completion.blockingRolesResolved',
  );
});

test('validateWaveRecipe never throws', () => {
  const samples = [null, undefined, 1, 'recipe', [], { packages: null }, { packages: [null] }];
  for (const sample of samples) {
    assert.doesNotThrow(() => validateWaveRecipe(sample));
    const result = validateWaveRecipe(sample);
    assert.equal(result.ok, false);
    assert.ok(Array.isArray(result.issues));
  }
});

test('every authored recipe is deeply frozen and names only live enemy ids', () => {
  assertDeepFrozen(SURVIVAL_WAVES);
  assert.ok(Object.isFrozen(SURVIVAL_WAVE_ROLES));
  assert.ok(Object.isFrozen(SURVIVAL_GATE_GROUPS));
  for (const recipe of SURVIVAL_WAVES) {
    for (const pkg of recipe.packages) {
      assert.ok(ENEMY_IDS.has(pkg.enemyId), `invented enemyId ${pkg.enemyId} on ${recipe.id}`);
    }
  }
});

test('authored set covers waves 1-10 for every Combat Lab arena with non-decreasing threatBudget', () => {
  for (const arenaId of ARENA_IDS) {
    const block = SURVIVAL_WAVES
      .filter((recipe) => recipe.arenaId === arenaId)
      .sort((a, b) => a.wave - b.wave);
    const waves = block.map((recipe) => recipe.wave);
    assert.deepEqual(waves, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], `waves 1-10 for ${arenaId}`);
    for (let i = 1; i < block.length; i++) {
      assert.ok(
        block[i].threatBudget >= block[i - 1].threatBudget,
        `${arenaId} wave ${block[i].wave} threatBudget dipped below wave ${block[i - 1].wave}`,
      );
    }
  }
});
