import test from 'node:test';
import assert from 'node:assert/strict';
import {
  postLiftStepCap, POST_LIFT_CATCHUP_STEPS, POST_LIFT_WINDOW_MS, MAX_CATCHUP_STEPS,
  advanceFixedTimestep, LOOP_FIXED_DT,
} from '../src/core/simulationRunner.js';

test('no lift seen or window over: cap unchanged', () => {
  assert.equal(postLiftStepCap(MAX_CATCHUP_STEPS, NaN), MAX_CATCHUP_STEPS);
  assert.equal(postLiftStepCap(MAX_CATCHUP_STEPS, -1), MAX_CATCHUP_STEPS);
  assert.equal(postLiftStepCap(MAX_CATCHUP_STEPS, POST_LIFT_WINDOW_MS), MAX_CATCHUP_STEPS);
  assert.equal(postLiftStepCap(MAX_CATCHUP_STEPS, 60000), MAX_CATCHUP_STEPS);
});

test('inside the window the cap drops, never rises', () => {
  assert.equal(postLiftStepCap(MAX_CATCHUP_STEPS, 0), POST_LIFT_CATCHUP_STEPS);
  assert.equal(postLiftStepCap(MAX_CATCHUP_STEPS, POST_LIFT_WINDOW_MS - 1), POST_LIFT_CATCHUP_STEPS);
  assert.equal(postLiftStepCap(1, 10), 1);
  assert.equal(postLiftStepCap(undefined, 10), POST_LIFT_CATCHUP_STEPS);
});

test('capped frame sheds surplus whole ticks and keeps sub-tick phase', () => {
  let n = 0;
  const r = advanceFixedTimestep(0, LOOP_FIXED_DT * 5.5, 1, () => { n++; }, null, LOOP_FIXED_DT,
    postLiftStepCap(MAX_CATCHUP_STEPS, 100));
  assert.equal(n, POST_LIFT_CATCHUP_STEPS);
  assert.equal(r.shedBacklog, true);
  assert.equal(r.shedSteps, 3);
  assert.ok(Math.abs(r.accumulator - LOOP_FIXED_DT * 0.5) < 1e-9);
});
