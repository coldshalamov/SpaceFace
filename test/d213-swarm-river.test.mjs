import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MOTION_LAB_SEED, runM11 } from '../src/testing/motionScenarios.js';

// D213: after the tick-150 repulsor shove the river cohorts must stay collision-free.
// The defect signature was a grind between the thrown body and the lane above it
// (s5↔s6 around ticks 182–184): the dodging member's escape basis rotated onto a
// steering flow-mate at the scrape and the maneuver planner's formation gains
// delivered only a fraction of the hull envelope. These assertions pin both halves
// of the contract — zero watched contacts AND the shove still lands as a real
// ballistic throw with a visible coast-and-rejoin.
test('D213: swarm river holds spacing through the repulsor shove', { timeout: 120000 }, async () => {
  const { metrics } = await runM11({ seed: MOTION_LAB_SEED });
  const c12 = metrics.cohort12;
  const c24 = metrics.cohort24;
  const crescent = metrics.crescent12;

  // The core defect signature: no contact receipts involving any watched member.
  assert.equal(c12.collisions, 0, 'twelve-body river must record zero contacts after the shove');
  assert.equal(c24.collisions, 0, 'twenty-four-body river must record zero contacts after the shove');
  assert.equal(crescent.collisions, 0, 'crescent cohort must record zero contacts after the shove');

  // The fix must not quietly delete the shove: thrown bodies still ride the impulse
  // ballistically and the cohort visibly re-forms afterward.
  assert.ok(c12.throwDisplacementWu >= 8, 'the shove still throws bodies out of the river');
  assert.ok(c12.impulseRetention >= 0.5, 'cohort steering must not cancel the player impulse');
  assert.ok(c24.impulseRetention >= 0.5);
  assert.equal(c12.reacquired, true, 'the thrown member must be reacquired');
  assert.equal(c24.reacquired, true);
  assert.ok(c12.disruptionResponseS >= 0.7 && c12.disruptionResponseS <= 3.5,
    'the coast-and-rejoin window stays visible');
  assert.ok(c24.disruptionResponseS >= 0.7 && c24.disruptionResponseS <= 3.5);

  // Spacing contract: the dodge opens the lane instead of compressing the river.
  assert.ok(c12.nnMin >= 20, 'twelve-body river keeps the min-separation floor');
  assert.ok(c24.nnMin >= 20, 'twenty-four-body river keeps the min-separation floor');
  assert.ok(c12.flowCoherence >= 0.9, 'the river still reads as one flow');
});
