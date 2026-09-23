import assert from 'node:assert/strict';
import test from 'node:test';
import { clampSlideAgainstHulls, deathSlideOffset, DEATH_SLIDE_CAP_WU } from '../src/render/deathSlide.js';

test('a death slide follows the copied velocity and stops at the cap', () => {
  const slow = deathSlideOffset({ x: 10, z: 0 }, 0.2);
  assert.ok(slow.x > 0 && slow.x < DEATH_SLIDE_CAP_WU);
  assert.equal(slow.done, false);
  const fast = deathSlideOffset({ x: 4000, z: 0 }, 0.4);
  assert.ok(Math.abs(fast.x) <= DEATH_SLIDE_CAP_WU + 1e-6);
  assert.equal(fast.done, true);
  const parked = deathSlideOffset({ x: 0, z: 0 }, 0.2);
  assert.equal(parked.x, 0);
  assert.equal(parked.z, 0);
});

test('a slide shortens before it enters another hull', () => {
  const offset = { x: 30, z: 0 };
  clampSlideAgainstHulls({ x: 0, z: 0 }, offset, [
    { id: 2, x: 20, z: 0, r: 8 },
  ], 1);
  assert.ok(offset.x < 20);
  const end = 0 + offset.x;
  const clear = (end - 20) ** 2 >= (8 + 4) ** 2 - 1;
  assert.equal(clear, true);
});
