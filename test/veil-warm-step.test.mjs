import test from 'node:test';
import assert from 'node:assert/strict';
import { VEIL_WARM_STEPS, VEIL_WARM_AFTER_FRAMES } from '../src/core/presentationRunner.js';

test('veil warm-up is bounded and starts after the first picture settles', () => {
  assert.ok(Number.isInteger(VEIL_WARM_STEPS) && VEIL_WARM_STEPS >= 1 && VEIL_WARM_STEPS <= 2);
  assert.ok(Number.isInteger(VEIL_WARM_AFTER_FRAMES) && VEIL_WARM_AFTER_FRAMES >= 1);
});
