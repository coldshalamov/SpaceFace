import assert from 'node:assert/strict';
import test from 'node:test';
import { stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { assertEarnedSpeed, measureEarnedSpeed } from '../scripts/lib/feelRegression.mjs';

test('B1: ten seconds of hands-off and forward-held flight keep earned speed', () => {
  const rows = measureEarnedSpeed();
  assertEarnedSpeed(rows);
  console.log('B1 earned speed retained:', JSON.stringify(rows));
});

test('B1: injecting the retired governor counter-thrust makes the same guard fail', () => {
  const rows = measureEarnedSpeed(input => {
    const result = stepPropulsion(input);
    // Old failure: six WU/s² of automatic counter-thrust above the own-drive cap.
    if (Math.hypot(input.body.vel.x, input.body.vel.z) > input.profile.combatSpeed) {
      result.force.x -= 6 * input.body.mass;
    }
    return result;
  });
  assert.throws(() => assertEarnedSpeed(rows), /Only the brake spends it/);
  assert.ok(rows.every(row => row.keptFraction < 0.99));
});

test('B1: a missing arm or non-finite measurement cannot pass', () => {
  assert.throws(() => assertEarnedSpeed([{ throttle: 0, keptFraction: 1 }]));
  assert.throws(() => assertEarnedSpeed([{ throttle: 0, keptFraction: 1 }, { throttle: 1, keptFraction: NaN }]));
});
