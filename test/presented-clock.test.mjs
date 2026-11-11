// EC-G11 step 1 — one clock for decor: the ratio follows the fence's presented sim time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { presentedAdvanceRatio, resetPresentedClock, stepPresentedRatio } from '../src/render/presentedClock.js';
import { createSnapshotFence } from '../src/render/snapshotFence.js';
import { createAsteroidMotionTracker } from '../src/render/asteroidMotionPresentation.js';

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

test('representative decoration: asteroid tumble stops advancing when fence holds, advances at 1x in real time', () => {
  const fence = createSnapshotFence();
  let presentedTime = 10;
  Object.defineProperty(fence, 'presentedTimeS', {
    get() { return presentedTime; },
    set(v) { presentedTime = v; },
    configurable: true,
  });
  resetPresentedClock();

  const origNow = performance.now;
  let mockNow = 1000;
  performance.now = () => mockNow;

  try {
    // Prime fence sampling
    presentedAdvanceRatio(mockNow);
    // Hold fence presentation time constant across 60 frames (1 s wall time)
    for (let i = 0; i < 60; i++) {
      mockNow += 16.7;
      presentedAdvanceRatio(mockNow);
    }
    const ratioHeld = presentedAdvanceRatio(mockNow);
    assert.ok(ratioHeld < 0.02, 'ratio drops to ~0 when fence held');

    const tracker = createAsteroidMotionTracker();
    const body = { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } };
    const mesh = { userData: { asteroidBody: body }, children: [body] };
    const asteroid = { id: 'ast_fence_rep', type: 'asteroid', radius: 10 };

    tracker.updateAsteroidMotion(asteroid, mesh, 10, 0.016);
    const rotHeld1 = body.rotation.x;
    mockNow += 16.7;
    tracker.updateAsteroidMotion(asteroid, mesh, 10, 0.016);
    const rotHeld2 = body.rotation.x;
    assert.ok(Math.abs(rotHeld2 - rotHeld1) < 1e-6, 'tumble stops advancing when fence is held');

    // Resume real-time presentation (fence presentedTimeS advances with wall time)
    for (let i = 0; i < 60; i++) {
      mockNow += 16.7;
      fence.presentedTimeS += 0.0167;
      presentedAdvanceRatio(mockNow);
    }
    const ratioLive = presentedAdvanceRatio(mockNow);
    assert.ok(Math.abs(ratioLive - 1) < 0.05, 'ratio returns to ~1x in real time');

    const rotLive1 = body.rotation.x;
    mockNow += 16.7;
    tracker.updateAsteroidMotion(asteroid, mesh, fence.presentedTimeS, 0.016);
    const rotLive2 = body.rotation.x;
    assert.ok(Math.abs(rotLive2 - rotLive1) > 1e-4, 'tumble advances normally at 1x in real time');
  } finally {
    performance.now = origNow;
    resetPresentedClock();
  }
});
