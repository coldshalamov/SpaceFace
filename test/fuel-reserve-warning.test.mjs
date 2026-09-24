import assert from 'node:assert/strict';
import test from 'node:test';

import { FUEL_LOW_FRACTION, fuelReserveWarning } from '../src/ui/fuelReserveWarning.js';

function step(state, fraction) {
  const warning = fuelReserveWarning(state, fraction, state.armed);
  return {
    warning,
    state: { low: warning.low, armed: warning.nextArmed },
  };
}

test('fuel warns once on the way down, stays quiet while low, and speaks again after a refill', () => {
  assert.equal(FUEL_LOW_FRACTION, 0.25);
  let state = { low: false, armed: false };

  // A save that loads already low lights the lamp and does not speak.
  let loaded = step(state, 0.2);
  assert.equal(loaded.warning.raise, true);
  assert.equal(loaded.warning.speak, false);
  assert.equal(loaded.warning.low, true);
  state = loaded.state;

  let held = step(state, 0.1);
  assert.equal(held.warning.raise, false);
  assert.equal(held.warning.speak, false);
  assert.equal(held.warning.clear, false);
  state = held.state;

  let empty = step(state, 0);
  assert.equal(empty.warning.clear, true);
  assert.equal(empty.warning.low, false);
  assert.equal(empty.warning.speak, false);
  state = empty.state;

  let refilled = step(state, 0.8);
  assert.equal(refilled.warning.raise, false);
  state = refilled.state;

  let again = step(state, 0.24);
  assert.equal(again.warning.raise, true);
  assert.equal(again.warning.speak, true);
  state = again.state;

  let edge = step({ low: false, armed: true }, 0.25);
  assert.equal(edge.warning.low, false, 'the gauge hot band and the warning share a strict less-than');
});
