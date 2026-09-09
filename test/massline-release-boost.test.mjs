import assert from 'node:assert/strict';
import test from 'node:test';

import { selfSlingBonusDv } from '../src/systems/masslineThrow.js';

test('release flourish is a load-scaled percentage of actual speed and never a flat launch', () => {
  assert.equal(selfSlingBonusDv(1, 1, true), 0, 'a near-stationary release gets no kick');
  assert.equal(selfSlingBonusDv(100, 1, false), 0, 'a slack line gets no kick at any speed');
  assert.equal(selfSlingBonusDv(100, 0, true), 0, 'an unloaded line gets no kick at any speed');
  assert.equal(selfSlingBonusDv(24.99, 1, true), 0, 'an accidental low-speed tap gets no kick');
  assert.ok(Math.abs(selfSlingBonusDv(100, 0.55, true) - 8.25) < 1e-12,
    'ordinary loaded tension scales the fifteen-percent ceiling');
  assert.ok(Math.abs(selfSlingBonusDv(100, 1, true) - 15) < 1e-12);
  assert.ok(Math.abs(selfSlingBonusDv(-100, 2, true) - 15) < 1e-12,
    'speed is unsigned and load clamps at the fifteen-percent ceiling');
});
