// PQ-141.00 — B12 sixty-second proof INSTRUMENT.
// Detects the 11 VISION beats from shipping bus receipts on the Ceres proof pocket set
// (Refinery + Ambush Run). Does not script NPC behaviour. A red table is a valid NOT DONE.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROOF_AMBUSH_POCKET_ID,
  PROOF_HARD_CAP_S,
  PROOF_POCKET_IDS,
  PROOF_REFINERY_POCKET_ID,
  PROOF_SCENARIO_ID,
  PROOF_SEEDS,
  PROOF_SIXTY_SECONDS_BOOT_POCKET_ID,
  SIXTY_SECOND_BEATS,
  aimTargetForTick,
  censusAround,
  classifyReceipt,
  emptyBeatTimes,
  formatBeatTable,
  isCargoPickup,
  isGrabCargoTarget,
  runProofPocketCensus,
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

test('PQ-141.00 default proof pocket set includes Ambush Run', () => {
  assert.equal(PROOF_REFINERY_POCKET_ID, 'ceres_refinery_pocket');
  assert.equal(PROOF_AMBUSH_POCKET_ID, 'ceres_ambush_run');
  assert.equal(PROOF_SIXTY_SECONDS_BOOT_POCKET_ID, PROOF_AMBUSH_POCKET_ID);
  assert.deepEqual([...PROOF_POCKET_IDS], [
    'ceres_refinery_pocket',
    'ceres_ambush_run',
  ]);
});

test('PQ-141.00 grab/aim/census accept payload cargo pods, and a real cargo latch counts', () => {
  const payloadPod = {
    id: 9,
    type: 'payload',
    alive: true,
    pos: { x: 12, z: 0 },
    data: { kind: 'cargo', commodityId: 'cmdty_iron', jettisonedCargo: true },
  };
  const pickupPod = {
    id: 8,
    type: 'pickup',
    alive: true,
    pos: { x: 40, z: 0 },
    data: { kind: 'cargo', commodityId: 'cmdty_ore' },
  };
  const cutPanel = {
    id: 7,
    type: 'payload',
    alive: true,
    pos: { x: 4, z: 0 },
    data: { kind: 'payload', payloadType: 'cut_panel' },
  };
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const state = {
    playerId: 1,
    entityList: [player, cutPanel, payloadPod, pickupPod],
    entities: new Map([
      [1, player],
      [7, cutPanel],
      [8, pickupPod],
      [9, payloadPod],
    ]),
  };

  assert.equal(isCargoPickup(payloadPod), true);
  assert.equal(isGrabCargoTarget(payloadPod), true);
  assert.equal(isGrabCargoTarget(pickupPod), true);
  assert.equal(isGrabCargoTarget(cutPanel), false);
  assert.equal(isGrabCargoTarget(player), false);

  const census = censusAround(state, player.pos);
  assert.equal(census.cargoPods, 2);

  const grabAim = aimTargetForTick(state, player, 2500);
  assert.equal(grabAim && grabAim.id, payloadPod.id, 'grab window must prefer the nearer cargo payload pod');

  const ctx = {
    state,
    spunIds: new Set(),
    projectileIds: new Set(),
    latchedIds: new Set(),
  };
  assert.equal(classifyReceipt('tether:latched', { targetId: 7 }, ctx), null,
    'a cut-panel payload latch is not a cargo grab');
  assert.deepEqual(classifyReceipt('tether:latched', { targetId: 9 }, ctx), {
    beat: 'grab_pod',
    detail: 'tether latch payload#9',
  });
  assert.deepEqual(classifyReceipt('tether:latched', { targetId: 8 }, ctx), {
    beat: 'grab_pod',
    detail: 'tether latch pickup#8',
  });
  assert.deepEqual(classifyReceipt('pickup:collected', {
    collectorId: 1, kind: 'cargo', commodityId: 'cmdty_iron',
  }, ctx), {
    beat: 'grab_pod',
    detail: 'collect cmdty_iron',
  });
});

test('PQ-141.00 census sees pirates when pointed at Ambush Run', { timeout: 120_000 }, async () => {
  const run = await runProofPocketCensus(47, { pocketId: PROOF_AMBUSH_POCKET_ID });
  assert.equal(run.pocketId, PROOF_AMBUSH_POCKET_ID);
  assert.ok(run.realPath && run.realPath.sg02Ready === true, 'census must use the real path');
  assert.equal(run.realPath.backend, 'rapier-dynamic');

  const pointed = run.setup || {};
  const pockets = run.pockets && run.pockets.byPocket || {};
  const refinery = pockets[PROOF_REFINERY_POCKET_ID] || {};
  const ambush = pockets[PROOF_AMBUSH_POCKET_ID] || {};
  const playerLocal = run.playerLocal || {};
  console.log(
    'PQ-141.00 pirate census seed 47: '
    + `before/refinery=${refinery.pirates ?? '?'} `
    + `after/ambush=${pointed.pirates ?? '?'} `
    + `playerLocal=${playerLocal.pirates ?? '?'} `
    + `ambush.haulers=${ambush.haulers ?? '?'} `
    + `combined.pirates=${run.pockets && run.pockets.pirates}`,
  );

  assert.ok(
    pointed.pirates > 0,
    `Ambush Run pirate census must be > 0 when the instrument looks there, got ${pointed.pirates}`,
  );
  assert.equal(ambush.pirates, pointed.pirates);
});

// Five-seed Rapier suite is the alpha-gate measurement. Ambush boot last printed
// 8/11 on seed 47. Do not assert 9/11 here — a red table is a valid NOT DONE.
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
