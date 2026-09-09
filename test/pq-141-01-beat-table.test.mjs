// PQ-141.01 — printed B12 beat table + leftover routing.
// Does not loosen classifyReceipt. Does not claim 11/11 while cells stay dark.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROOF_HARD_CAP_S,
  PROOF_SCENARIO_ID,
  PROOF_SEEDS,
  PROOF_WINDOW_S,
  SIXTY_SECOND_BEATS,
  classifyReceipt,
  elevenOfElevenClaim,
  formatBeatMarkdownTable,
  formatBeatTable,
  formatLeftoverRoutes,
  leftoverRoutes,
  listedBeatsOutsideWindow,
  runProofSixtySecondsSuite,
} from '../src/testing/lab/proofSixtySeconds.js';

const LONG = { timeout: 900_000 };

function fixtureTimes(overrides = {}) {
  return {
    op_working: 0.20,
    hauler_leaves: 1.10,
    pirates_intercept: 2.40,
    shove_spins_one: 8.10,
    rope_projectile: 17.52,
    collateral: 17.78,
    cargo_spills: 3.10,
    hauler_flees: 3.40,
    patrol_arrives: 4.20,
    grab_pod: 5.50,
    run_wanted: 6.00,
    ...overrides,
  };
}

function fixtureRun(seed, times, extras = {}) {
  const detected = SIXTY_SECOND_BEATS.reduce((n, beat) => n + (times[beat.id] != null ? 1 : 0), 0);
  const missing = SIXTY_SECOND_BEATS
    .filter((beat) => times[beat.id] == null)
    .map((beat) => ({
      id: beat.id,
      label: beat.label,
      owner: beat.owner,
      receipts: beat.receipts.slice(),
    }));
  return {
    scenarioId: PROOF_SCENARIO_ID,
    seed,
    times,
    detected,
    missing,
    simS: extras.simS ?? 60,
    gateMet: detected >= 9 && (extras.simS ?? 60) <= PROOF_HARD_CAP_S,
    exceededHardCap: false,
    details: extras.details || {},
    setup: extras.setup || {},
    realPath: { backend: 'rapier-dynamic', sg02Ready: true },
    bootPocketId: 'ceres_ambush_run',
    pocketId: 'ceres_ambush_run',
    pocketIds: ['ceres_refinery_pocket', 'ceres_ambush_run'],
  };
}

/** ALPHA leftover pattern from PQ-141.00: collateral dark on 4242/1337/2026; rope+collateral on 2026. */
function alphaLeftoverRuns() {
  return [
    fixtureRun(47, fixtureTimes()),
    fixtureRun(4242, fixtureTimes({ rope_projectile: 13.02, collateral: null })),
    fixtureRun(8008, fixtureTimes({ rope_projectile: 13.68, collateral: 50.22 })),
    fixtureRun(1337, fixtureTimes({ rope_projectile: 18.22, collateral: null })),
    fixtureRun(2026, fixtureTimes({ rope_projectile: null, collateral: null })),
  ];
}

test('PQ-141.01 leftover routes name the owning packet and refuse an 11/11 claim', () => {
  const runs = alphaLeftoverRuns();
  const leftover = leftoverRoutes(runs);
  assert.equal(leftover.dark, 4);
  assert.deepEqual(leftover.cells.map((c) => `${c.seed}:${c.id}`), [
    '4242:collateral',
    '1337:collateral',
    '2026:rope_projectile',
    '2026:collateral',
  ]);

  const byOwner = Object.fromEntries(leftover.routes.map((r) => [r.owner, r]));
  assert.ok(byOwner['PQ-137.07'], 'dark rope routes to PQ-137.07');
  assert.deepEqual(byOwner['PQ-137.07'].beats[0].seeds, [2026]);
  assert.ok(byOwner['PQ-137.09 / PQ-140'], 'dark collateral routes to PQ-137.09 / PQ-140');
  assert.deepEqual(byOwner['PQ-137.09 / PQ-140'].beats[0].seeds, [4242, 1337, 2026]);

  const ropeDarkCollateral = leftover.cells.find((c) => c.seed === 2026 && c.id === 'collateral');
  assert.match(ropeDarkCollateral.note, /downstream of dark rope_projectile/);

  const claim = elevenOfElevenClaim(runs);
  assert.equal(claim.allowed, false);
  assert.equal(claim.dark, 4);

  const late = listedBeatsOutsideWindow(runs);
  assert.equal(late.length, 0, 'listed (detected) beats stay inside 60s');
  assert.ok(runs.every((run) => run.simS <= PROOF_WINDOW_S + 1e-6));

  const table = formatBeatTable(runs);
  assert.match(table, /PQ-141\.01 leftover routes/);
  assert.match(table, /collateral \(collateral\) dark on seeds 4242, 1337, 2026 → PQ-137\.09 \/ PQ-140/);
  assert.match(table, /rope-swing-release projectile \(rope_projectile\) dark on seeds 2026 → PQ-137\.07/);
  assert.match(table, /Do not claim 11\/11: 4 cells remain dark/);
  assert.match(table, /Listed \(detected\) beats are all inside 60 seconds/);
  assert.match(table, /PQ-141\.01 RESULT: DONE/);
  assert.match(table, /ALPHA RESULT: DONE/);

  const routes = formatLeftoverRoutes(runs);
  assert.match(routes, /PQ-137\.07/);
  assert.match(routes, /PQ-137\.09 \/ PQ-140/);

  const md = formatBeatMarkdownTable(runs);
  assert.match(md, /47 \| 0\.20/);
  assert.match(md, /2026 \|[\s\S]*— \| —/);
});

test('PQ-141.01 flags a listed beat after 60s and still will not claim 11/11', () => {
  const runs = [
    fixtureRun(47, fixtureTimes({ collateral: 61.2 }), { simS: 62 }),
  ];
  const late = listedBeatsOutsideWindow(runs);
  assert.equal(late.length, 1);
  assert.equal(late[0].id, 'collateral');
  assert.equal(elevenOfElevenClaim(runs).allowed, true);
  const text = formatLeftoverRoutes(runs);
  assert.match(text, /LISTED BEATS AFTER 60s/);
  assert.match(text, /PQ-141\.01 RESULT: NOT DONE/);
});

test('PQ-141.01 does not loosen classifyReceipt', () => {
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
  assert.equal(classifyReceipt('combat:collisionConsequence', {
    targetId: 3, otherId: 2, deltaV: 40,
  }, ctx), null, 'ship-vs-rock is not collateral');
  assert.equal(classifyReceipt('combat:tumbled', {
    victimId: 3, attackerId: 1, source: 'massline', durationS: 1.2, spin: 2,
  }, ctx), null, 'a massline tumble is not the shove-spin beat');
});

test('PQ-141.01 prints the five-seed beat table and routes leftovers', {
  ...LONG,
  skip: process.env.PROOF_SIXTY_SECONDS !== '1' && 'set PROOF_SIXTY_SECONDS=1 to print the five-seed table',
}, async () => {
  const suite = await runProofSixtySecondsSuite(PROOF_SEEDS);
  const table = suite.table || formatBeatTable(suite.runs);
  console.log(`\n${table}\n`);
  if (suite.markdownTable) console.log(`\n${suite.markdownTable}\n`);

  assert.equal(suite.runs.length, 5);
  assert.deepEqual(suite.runs.map((r) => r.seed), [...PROOF_SEEDS]);
  for (const run of suite.runs) {
    assert.equal(run.scenarioId, PROOF_SCENARIO_ID);
    assert.ok(run.simS <= PROOF_HARD_CAP_S + 1e-6, `seed ${run.seed} exceeded 90s (${run.simS})`);
    assert.equal(run.exceededHardCap, false);
    assert.ok(run.realPath && run.realPath.sg02Ready === true, `seed ${run.seed} was not the real path`);
    assert.equal(run.realPath.backend, 'rapier-dynamic');
    for (const beat of SIXTY_SECOND_BEATS) {
      const t = run.times[beat.id];
      if (t != null) {
        assert.ok(t <= PROOF_WINDOW_S + 1e-6, `seed ${run.seed} ${beat.id} at ${t}s is not inside 60s`);
      }
    }
  }

  assert.equal(listedBeatsOutsideWindow(suite.runs).length, 0);
  for (const cell of suite.leftover.cells) {
    assert.ok(cell.owner && cell.owner.length > 0, `${cell.id} on seed ${cell.seed} has no owner`);
  }
  if (suite.leftover.dark > 0) {
    assert.equal(suite.claimElevenOfEleven, false, 'do not claim 11/11 while cells stay dark');
    assert.match(table, /Do not claim 11\/11/);
  }
  assert.equal(suite.leafDone, true);
});
