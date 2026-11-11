// SWARM-07 B3 — the Brood champions used to land at waves 70 and 80.
//
// C01-01: the Swarm course ends at wave 30 — the Brood Queen and the Tendril are
// unreachable inside a run, so their fights are retired; see
// test/RETIRED_SWARM_ENDLESS.md. What survives here: the prewarm seam that lets the
// launch/dwell lane see single-enemy boss rows — the course's champions owe it too.

import test from 'node:test';
import assert from 'node:assert/strict';

import { swarmEligibleEnemyIds } from '../src/data/swarmMode.js';

test('the prewarm seam sees single-enemy boss rows — the eligible-ids fix', () => {
  // Reading boss.packages directly made every capital champion invisible to the launch/dwell
  // prewarm. bossPackagesFor is the seam; the ids the wave actually fields must appear.
  assert.ok(swarmEligibleEnemyIds(5).has('dreadnought_boss'), 'the Iron Maw prewarms');
  assert.ok(swarmEligibleEnemyIds(15).has('mirrorjaw_foreman'), 'the Foreman prewarms');
  assert.ok(swarmEligibleEnemyIds(30).has('forge_regent'), 'the Regent prewarms');
});
