// EC-G11 step 1 — one clock for decor: the ratio follows the fence's presented sim time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { presentedAdvanceRatio, resetPresentedClock, stepPresentedRatio } from '../src/render/presentedClock.js';

test('no presented clock reads as the world advancing with the wall', () => {
  resetPresentedClock();
  assert.equal(presentedAdvanceRatio(1000, null), 1);
  assert.equal(presentedAdvanceRatio(1016, { presentedTimeS: NaN }), 1);
});

test('a held presented pose drives the ratio to zero; a live one back to one', () => {
  resetPresentedClock();
  const fence = { presentedTimeS: 10 };
  let t = 0;
  presentedAdvanceRatio(t, fence);
  for (let i = 0; i < 60; i++) { t += 16.7; presentedAdvanceRatio(t, fence); } // world holds 1 s
  assert.ok(presentedAdvanceRatio(t + 16.7, fence) < 0.02, 'a stall stops decor');
  for (let i = 0; i < 60; i++) { t += 16.7; fence.presentedTimeS += 0.0167; presentedAdvanceRatio(t, fence); }
  assert.ok(Math.abs(presentedAdvanceRatio(t, fence) - 1) < 0.05, 'real-time play runs decor at 1x');
});

test('several callers in one frame share one sample, and a backwards clock does not spike', () => {
  resetPresentedClock();
  const fence = { presentedTimeS: 5 };
  presentedAdvanceRatio(0, fence);
  fence.presentedTimeS = 5.0167;
  const a = presentedAdvanceRatio(16.7, fence);
  assert.equal(presentedAdvanceRatio(17.5, fence), a);
  fence.presentedTimeS = 1; // gap reset / load
  const after = presentedAdvanceRatio(33.4, fence);
  assert.ok(after <= a + 1e-9 && after >= 0);
  assert.equal(stepPresentedRatio(0.5, 0, 1), 0.5, 'zero wall time leaves the ratio alone');
  assert.ok(stepPresentedRatio(0, 1, 10) <= 1.5, 'bounded at the fence ceiling');
});
