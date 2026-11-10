import assert from 'node:assert/strict';
import test from 'node:test';

import { yieldToNextPresent } from '../src/render/startupGpuResidency.js';

test('next-present yield waits for one animation frame when rAF exists', async () => {
  let frames = 0;
  const original = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => {
    frames += 1;
    return setTimeout(cb, 0);
  };
  try {
    await yieldToNextPresent();
    assert.equal(frames, 1);
  } finally {
    globalThis.requestAnimationFrame = original;
  }
});
