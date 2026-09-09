#!/usr/bin/env node
// Shared smuggling authority — deterministic integration gate.
//
// Runs test/economy-smuggling-authority.test.mjs (fixtures only, no goldens).
// Does NOT edit package.json — invoke by path:
//   node scripts/check-economy-smuggling-authority.mjs
//
// Contract covered by the suite:
//   • fitted hiddenCargoPct / scannerCloak are max-not-additive derived values
//   • hidden capacity exposes only overflow illicit quantity
//   • fine projection only counts exposed stacks
//   • mission preflight consumes active entity derived ratings
//   • economyContracts serialize/deserialize preserves station-epoch dedupe

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const TEST_FILE = join(REPO_ROOT, 'test', 'economy-smuggling-authority.test.mjs');

assert.equal(typeof window, 'undefined', 'check-economy-smuggling-authority must run headless');

if (!existsSync(TEST_FILE)) {
  console.error(`[check-economy-smuggling-authority] FAIL missing ${TEST_FILE}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--test', 'test/economy-smuggling-authority.test.mjs'],
  { cwd: REPO_ROOT, encoding: 'utf8' },
);

process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');

if (result.status !== 0) {
  console.error('[check-economy-smuggling-authority] FAIL — unit suite red');
  process.exit(result.status == null ? 1 : result.status);
}

// Thin pure re-check: max-not-additive + serialize round-trip without re-running full node:test.
const {
  getDerivedStats,
  fittingsFromDefaultModules,
} = await import('../src/systems/ships.js');
const {
  economyContracts,
  markStationEpochEvaluated,
  ensureFieldContractState,
} = await import('../src/systems/economyContracts.js');
const {
  hiddenHoldCapacity,
  remainingIllicit,
  estimatedFine,
} = await import('../src/economy/customsRisk.js');

const random = Math.random;
const now = Date.now;
Math.random = () => { throw new Error('Math.random in check-economy-smuggling-authority'); };
Date.now = () => { throw new Error('Date.now in check-economy-smuggling-authority'); };
try {
  const dual = fittingsFromDefaultModules('ship_mule', [
    'mod_smuggler_hold',
    'mod_smuggler_hold',
  ]);
  const derived = getDerivedStats('ship_mule', dual, null);
  assert.equal(derived.hiddenCargoPct, 0.20, 'dual holds max-not-additive');

  const rem = remainingIllicit({
    stacks: [{
      commodityId: 'cmdty_narcotics',
      qty: 20,
      basePrice: 220,
      legality: 'contraband',
      volPerU: 0.6,
    }],
    hiddenCapacity: hiddenHoldCapacity({ capVolume: 10, hiddenCargoPct: 0.20 }),
  });
  assert.equal(rem.exposedStacks[0].qty, 17);
  assert.equal(estimatedFine(rem.exposedStacks), 220 * 17 * 1.5);
  assert.ok(estimatedFine(rem.exposedStacks) < estimatedFine([{
    commodityId: 'cmdty_narcotics',
    qty: 20,
    basePrice: 220,
    legality: 'contraband',
    volPerU: 0.6,
  }]));

  const state = {
    simTime: 0,
    missions: { config: { refreshSec: 600 } },
    economyContracts: { evaluatedEpochByStation: {} },
  };
  const sys = { ...economyContracts };
  sys.state = state;
  const bag = ensureFieldContractState(state);
  markStationEpochEvaluated(bag, 'st_check', 5);
  const blob = sys.serialize();
  markStationEpochEvaluated(bag, 'st_check', 99);
  sys.deserialize(blob);
  assert.equal(sys.hasEvaluated('st_check', 5), true);
  assert.equal(sys.hasEvaluated('st_check', 99), false);
} finally {
  Math.random = random;
  Date.now = now;
}

console.log('[check-economy-smuggling-authority] PASS — suite green + pure re-check');
process.exit(0);
