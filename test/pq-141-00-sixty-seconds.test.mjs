// PQ-141.00 — B12 sixty-second proof INSTRUMENT.
// Detects the 11 VISION beats from shipping bus receipts at the Ceres reference pocket.
// Does not script NPC behaviour. A red table is a valid NOT DONE.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROOF_HARD_CAP_S,
  PROOF_SCENARIO_ID,
  PROOF_SEEDS,
  SIXTY_SECOND_BEATS,
  classifyReceipt,
  emptyBeatTimes,
  formatBeatTable,
  runProofSixtySecondsSuite,
} from '../src/testing/lab/proofSixtySeconds.js';

const LONG = { timeout: 900_000 };

test('PQ-141.00 names the 11 VISION / B12 beats and their owning packets', () => {
  assert.equal(SIXTY_SECOND_BEATS.length, 11);
  const ids = SIXTY_SECOND_BEATS.map((b) => b.id);
  assert.deepEqual(ids, [
    'op_working',
    'hauler_leaves',
    'pirates_intercept',
    'shove_spins_one',
    'rope_projectile',
    'collateral',
    'cargo_spills',
    'hauler_flees',
    'patrol_arrives',
    'grab_pod',
    'run_wanted',
  ]);
  for (const beat of SIXTY_SECOND_BEATS) {
    assert.ok(beat.owner && beat.owner.length > 0, `${beat.id} must name a packet owner`);
    assert.ok(beat.receipts.length > 0, `${beat.id} must name shipping receipts`);
  }
});

test('PQ-141.00 does not count a player-rock scrape as collateral or a shove-spin', () => {
  const ctx = {
    state: {
      playerId: 1,
      entities: new Map([
        [1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} }],
        [2, { id: 2, type: 'asteroid', pos: { x: 10, z: 0 }, vel: { x: 0, z: 0 }, data: {} }],
        [3, { id: 3, type: 'ship', pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 }, data: { trafficRole: 'hauler' } }],
      ]),
    },
    spunIds: new Set(),
    projectileIds: new Set(),
    latchedIds: new Set(),
  };
  assert.equal(classifyReceipt('combat:collisionConsequence', {
    targetId: 1, otherId: 2, deltaV: 40,
  }, ctx), null, 'player-vs-rock is not collateral');
  assert.equal(classifyReceipt('combat:collisionConsequence', {
    targetId: 2, otherId: 3, deltaV: 40,
  }, ctx), null, 'ambient rock-hauler contact is not collateral without a thrown/spun hull');
  assert.equal(classifyReceipt('combat:tumbled', {
    victimId: 3, attackerId: 1, source: 'massline', durationS: 1.2, spin: 2,
  }, ctx), null, 'a massline tumble is not the shove-spin beat');
  assert.equal(classifyReceipt('traffic:jobActionReceipt', {
    actorSlotId: 'ceres_seam_surveyor', action: 'work', jobKind: 'surveyor',
  }, ctx), null, 'surveyor choreography is not the mining op');
});

test('PQ-141.00 scenario id is proof.sixty_seconds', () => {
  assert.equal(PROOF_SCENARIO_ID, 'proof.sixty_seconds');
  assert.equal(PROOF_SEEDS.length, 5);
  assert.equal(emptyBeatTimes().op_working, null);
});

// Five-seed Rapier suite is the alpha-gate measurement. It is honest and currently
// 2–3/11. Do not assert 9/11 here — that would fail CI for a known world gap.
// Run: PROOF_SIXTY_SECONDS=1 node --test test/pq-141-00-sixty-seconds.test.mjs
test('PQ-141.00 runs five seeds at the Ceres pocket and prints the beat table', {
  ...LONG,
  skip: process.env.PROOF_SIXTY_SECONDS !== '1' && 'set PROOF_SIXTY_SECONDS=1 to measure the alpha gate',
}, async () => {
  const suite = await runProofSixtySecondsSuite(PROOF_SEEDS);
  const table = suite.table || formatBeatTable(suite.runs);
  console.log(`\n${table}\n`);

  assert.equal(suite.runs.length, 5);
  for (const run of suite.runs) {
    assert.equal(run.scenarioId, PROOF_SCENARIO_ID);
    assert.equal(run.sectorId, 'sector_ceres_belt');
    assert.ok(run.simS <= PROOF_HARD_CAP_S + 1e-6, `seed ${run.seed} exceeded 90s (${run.simS})`);
    assert.equal(run.exceededHardCap, false);
    assert.ok(run.realPath && run.realPath.sg02Ready === true, `seed ${run.seed} was not the real path`);
    assert.equal(run.realPath.backend, 'rapier-dynamic');
  }

  if (!suite.gateMet) {
    const missing = suite.runs.flatMap((run) => (run.missing || []).map((m) => (
      `seed ${run.seed}: ${m.label} — ${m.owner}`
    )));
    console.error('PQ-141.00 ALPHA GATE NOT DONE — missing beats:\n' + missing.join('\n'));
  }
});
