// test/knock-budget.test.mjs — CONTACT/knock-budget-test-01: keeps bar B13's instrument honest.
// Asserts that scripts/lib/bench/scenarios/feel.knock_budget.mjs runs the REAL physics path, cannot
// print a number from an unbuilt arena, and reports the exact quantities B13 is written in.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runKnockBudget } from '../scripts/lib/bench/scenarios/feel.knock_budget.mjs';

const SEEDS = [4242, 8008];
const SIM_SECONDS = 30;
const VISION = 'The owner\'s own ship is never knocked around';

const runCache = new Map();
function knockRun(seed) {
  if (!runCache.has(seed)) {
    runCache.set(seed, runKnockBudget(seed, { simSeconds: SIM_SECONDS }));
  }
  return runCache.get(seed);
}

function assertBar(m, seed) {
  // 1. It is the real path. A stand-in must never be able to print a B13 number.
  assert.equal(m.realPath.backend, 'rapier-dynamic',
    'a stand-in must never be able to print a B13 number: the solver backend must be the live rapier-dynamic authority');
  assert.equal(m.realPath.sg02Ready, true,
    'a stand-in must never be able to print a B13 number: SG-02 must be ready or no body was ever solved');
  assert.equal(m.realPath.contactCaptureEnabled, true,
    'a stand-in must never be able to print a B13 number: with contact capture off the run has real contact physics and zero receipts');
  assert.equal(m.realPath.physicsBackend, 'rapier-dynamic',
    'a stand-in must never be able to print a B13 number: the gameplay physics backend must be the live rapier-dynamic authority');
  assert.equal(m.realPath.flightBackend, 'v3',
    'a stand-in must never be able to print a B13 number: the hull must fly the live v3 flight path');

  // 2. One knock definition: ordinary magnitude is applied; raw stays beside it.
  assert.equal(m.knockSource, 'physics:impact(playerInvolved).appliedPlayerDeltaV',
    'this is the definition shared with the Crucible bench; two definitions is how B13 was fiction for a day');

  // 3. The arena actually built. A hull alone in space reports zero knocks and looks exactly like
  // a pass.
  assert.ok(m.minBodiesDuringWindow > 1,
    `a hull alone in space reports zero knocks and looks exactly like a pass: SG-02 held only ${m.minBodiesDuringWindow} body at some point of the counted window`);
  assert.ok(m.plannedGrazes >= 1,
    `a hull alone in space reports zero knocks and looks exactly like a pass: the corridor planned ${m.plannedGrazes} grazes`);
  assert.ok(m.assertedTrafficBodies >= 1,
    `a hull alone in space reports zero knocks and looks exactly like a pass: ${m.assertedTrafficBodies} traffic bodies were provable at overtaking range`);

  // 4. It measured at cruise. B13 is a statement about ordinary flight, and a hull at three times
  // cruise is not ordinary flight.
  assert.ok(m.cruiseSpeed > 0,
    `B13 is a statement about ordinary flight: cruise must be a positive governed speed, got ${m.cruiseSpeed}`);
  assert.ok(Math.abs(m.meanSpeed - m.cruiseSpeed) <= 0.02 * m.cruiseSpeed,
    `B13 is a statement about ordinary flight, and a hull at three times cruise is not ordinary flight: mean ${m.meanSpeed} vs cruise ${m.cruiseSpeed}`);

  // 5. The two independent measures agree: the physics authority's own receipt and the measured
  // velocity discontinuity must describe the same event.
  assert.ok(m.receiptVsMeasuredMaxGapFractionOfCruise <= 0.01,
    `the physics authority's own receipt and the measured velocity discontinuity must describe the same event: gap ${m.receiptVsMeasuredMaxGapFractionOfCruise}`);

  // 6. The instrument out-resolves the thing it measures: the noise floor must be far below the
  // 0.5 % knock floor or the instrument is reading its own dust.
  assert.ok(m.residualFloorFractionOfCruise < 0.0005,
    `the noise floor must be far below the 0.5 % knock floor or the instrument is reading its own dust: ${m.residualFloorFractionOfCruise}`);

  assert.ok(m.knockEventsPerMinute <= 2,
    `${VISION}: ordinary flight must not knock the player more than twice a minute (seed ${seed}, ${m.knockEventsPerMinute}/min)`);
  assert.ok(m.maxKnockDeltaVFractionOfCruise <= 0.10,
    `${VISION}: ordinary flight must not change the player's velocity by more than 10% of cruise (seed ${seed}, ${m.maxKnockDeltaVFractionOfCruise})`);
  assert.equal(m.headingChangeEvents, 0,
    `${VISION}: ordinary flight must not change the player's heading (seed ${seed})`);
  assert.equal(m.jitterEvents, 0,
    `${VISION}: ordinary flight must not produce visible jitter (seed ${seed})`);
  assert.equal(m.barMet, true, `B13 component clauses must hold on seed ${seed}`);
}

test('feel.knock_budget runs the real physics authority, builds its arena, and reports B13 honestly', { timeout: 300_000 }, async () => {
  for (const seed of SEEDS) {
    const { metrics: m } = await knockRun(seed);
    console.log(`[knock-budget-test-01] seed ${seed} observed metrics:`, JSON.stringify({
      knockEventsPerMinute: m.knockEventsPerMinute,
      maxKnockDeltaVFractionOfCruise: m.maxKnockDeltaVFractionOfCruise,
      headingChangeEvents: m.headingChangeEvents,
      jitterEvents: m.jitterEvents,
      barMet: m.barMet,
      cruiseSpeed: m.cruiseSpeed,
      meanSpeed: m.meanSpeed,
      knockSource: m.knockSource,
      backend: m.realPath.backend,
      sg02Ready: m.realPath.sg02Ready,
      contactCaptureEnabled: m.realPath.contactCaptureEnabled,
      physicsBackend: m.realPath.physicsBackend,
      flightBackend: m.realPath.flightBackend,
      minBodiesDuringWindow: m.minBodiesDuringWindow,
      plannedGrazes: m.plannedGrazes,
      plannedHeadOns: m.plannedHeadOns,
      knockEvents: m.knockEvents,
      assertedTrafficBodies: m.assertedTrafficBodies,
      residualFloorP995: m.residualFloorP995,
      residualFloorFractionOfCruise: m.residualFloorFractionOfCruise,
      measuredMaxKnockDeltaVFractionOfCruise: m.measuredMaxKnockDeltaVFractionOfCruise,
      receiptVsMeasuredMaxGapFractionOfCruise: m.receiptVsMeasuredMaxGapFractionOfCruise,
    }));
    assertBar(m, seed);
  }
});

test('feel.knock_budget is deterministic: the same seed repeats the four bar numbers exactly', { timeout: 300_000 }, async () => {
  const run1 = await knockRun(4242);
  const run2 = await runKnockBudget(4242, { simSeconds: SIM_SECONDS });

  for (const key of [
    'knockEventsPerMinute',
    'maxKnockDeltaVFractionOfCruise',
    'headingChangeEvents',
    'jitterEvents',
  ]) {
    assert.equal(run2.metrics[key], run1.metrics[key],
      `a result without a reproducible seed is an anecdote: ${key} must repeat exactly on seed 4242`);
  }
});
