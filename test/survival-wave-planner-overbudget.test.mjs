// NXI-066: Reject a recipe whose scheduled population exceeds its budget
// An intentionally over-budget composed recipe returns a useful authoring error rather than silently dropping opponents.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWaveRecipe,
  peakConcurrentDemand,
  SURVIVAL_WAVE_SCHEMA_VERSION,
} from '../src/data/survivalWaves.js';

test('NXI-066: peakConcurrentDemand accurately computes concurrent spawn load', () => {
  const pkgs = [
    { atTick: 0, count: 10, batchSize: 10, batchGapTicks: 0 },
    { atTick: 0, count: 10, batchSize: 10, batchGapTicks: 0 },
  ];
  // Peak concurrent demand is total package count (20).
  assert.equal(peakConcurrentDemand(pkgs), 20);

  const overPkgs = [
    { atTick: 0, count: 15, batchSize: 15, batchGapTicks: 0 },
    { atTick: 0, count: 15, batchSize: 15, batchGapTicks: 0 },
  ];
  // Peak concurrent demand is 30.
  assert.equal(peakConcurrentDemand(overPkgs), 30);
});

test('NXI-066: validateWaveRecipe rejects recipes exceeding peak concurrent demand of 24', () => {
  const overBudgetRecipe = {
    id: 'test_overbudget',
    schemaVersion: SURVIVAL_WAVE_SCHEMA_VERSION,
    arenaId: 'helios_core',
    wave: 1,
    threatBudget: 100,
    packages: [
      {
        atTick: 0,
        gateGroup: 'nw',
        role: 'mass',
        enemyId: 'wasp_swarmer',
        count: 15,
        batchSize: 15,
        batchGapTicks: 0,
      },
      {
        atTick: 0,
        gateGroup: 'se',
        role: 'pressure',
        enemyId: 'wasp_swarmer',
        count: 15,
        batchSize: 15,
        batchGapTicks: 0,
      },
    ],
    objective: { kind: 'survive_duration', durationS: 60 },
    arenaPhase: 'idle',
    completion: {
      requiredPackagesMaterialized: true,
      cleanupTicks: 60,
      blockingRolesResolved: ['mass', 'pressure'],
    },
    rewards: { credits: 100, xp: 50 },
  };

  const res = validateWaveRecipe(overBudgetRecipe);
  assert.equal(res.ok, false, 'over-budget recipe must fail validation');
  assert.ok(
    res.issues.some((issue) => issue.path === 'packages' && issue.message.includes('exceeds 24')),
    'issue must explicitly name peak concurrent demand exceeding 24',
  );
});

test('NXI-066: validateWaveRecipe accepts valid recipes within budget (<= 24)', () => {
  const validRecipe = {
    id: 'test_valid',
    schemaVersion: SURVIVAL_WAVE_SCHEMA_VERSION,
    arenaId: 'helios_core',
    wave: 1,
    threatBudget: 50,
    packages: [
      {
        atTick: 0,
        gateGroup: 'nw',
        role: 'mass',
        enemyId: 'wasp_swarmer',
        count: 10,
        batchSize: 10,
        batchGapTicks: 0,
      },
      {
        atTick: 600,
        gateGroup: 'se',
        role: 'pressure',
        enemyId: 'wasp_swarmer',
        count: 8,
        batchSize: 8,
        batchGapTicks: 0,
      },
    ],
    objective: { kind: 'survive_duration', durationS: 60 },
    arenaPhase: 'idle',
    completion: {
      requiredPackagesMaterialized: true,
      cleanupTicks: 60,
      blockingRolesResolved: ['mass', 'pressure'],
    },
    rewards: { credits: 100, xp: 50 },
  };

  const res = validateWaveRecipe(validRecipe);
  assert.equal(res.ok, true, `valid recipe must pass validation: ${JSON.stringify(res.issues)}`);
  assert.equal(res.issues.length, 0);
});
