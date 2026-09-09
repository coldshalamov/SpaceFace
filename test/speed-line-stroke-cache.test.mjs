import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearSpeedLineRgbaCacheForTests,
  fillSpeedLineStreak,
  quantizeSpeedLineAlpha,
  speedLineRgba,
} from '../src/render/speedLineStrokeCache.js';

test('rgba strings are reused for the same quantized color', () => {
  clearSpeedLineRgbaCacheForTests();
  const a = speedLineRgba(160, 205, 255, 0.4196);
  const b = speedLineRgba(160, 205, 255, 0.4205);
  assert.equal(a, b);
  assert.equal(speedLineRgba(160, 205, 255, 107 / 255), a);
  assert.equal(a.startsWith('rgba(160,205,255,'), true);
  assert.notEqual(speedLineRgba(160, 205, 255, 0.8), a);
});

test('alpha quantization is stable at the 0/1 edges', () => {
  assert.equal(quantizeSpeedLineAlpha(0), 0);
  assert.equal(quantizeSpeedLineAlpha(-1), 0);
  assert.equal(quantizeSpeedLineAlpha(1), 255);
  assert.equal(quantizeSpeedLineAlpha(2), 255);
});

test('recycle mutates the same streak object instead of allocating a replacement', () => {
  const streak = { uv: 1, spawnU: 1, p: 2, v: 3, len: 4, b: 5, w: 6 };
  let n = 0;
  const rng = () => {
    n += 1;
    return 0.25;
  };
  const recycled = fillSpeedLineStreak(streak, true, 400, 1280, 800, rng);
  assert.equal(recycled, streak);
  assert.equal(streak.uv, streak.spawnU);
  assert.ok(streak.uv < 0);
  assert.ok(n >= 5);
});
