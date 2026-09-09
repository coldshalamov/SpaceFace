import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVENESS_CLASS,
  classifyFrameLiveness,
  mustRescheduleAfterFrame,
  summarizeLivenessWindow,
} from '../src/core/frameLiveness.js';

function sample(overrides = {}) {
  return {
    simTime: 10,
    tick: 600,
    rendererFrame: 60,
    renderUpdates: 60,
    timeScale: 1,
    mode: 'flight',
    contextLost: false,
    lastFrameError: null,
    frameErrorCount: 0,
    frameDtMs: 16.6,
    canvasChanged: true,
    ...overrides,
  };
}

test('live flight keeps sim and renderer moving together', () => {
  const a = sample();
  const b = sample({ simTime: 10.5, tick: 630, rendererFrame: 90, renderUpdates: 90 });
  const verdict = classifyFrameLiveness(a, b);
  assert.equal(verdict.class, LIVENESS_CLASS.LIVE);
  assert.equal(verdict.live, true);
});

test('frozen 3D picture is a latch even when the HUD clock still moves', () => {
  const a = sample();
  const b = sample({ simTime: 12, tick: 720, rendererFrame: 60, renderUpdates: 60 });
  const verdict = classifyFrameLiveness(a, b);
  assert.equal(verdict.class, LIVENESS_CLASS.FROZEN_PICTURE);
  assert.equal(verdict.live, false);
});

test('repeating draw errors and context loss fail closed', () => {
  const a = sample({ frameErrorCount: 1 });
  const b = sample({
    simTime: 11,
    tick: 660,
    rendererFrame: 70,
    frameErrorCount: 5,
    lastFrameError: 'Cannot read properties of null',
  });
  assert.equal(classifyFrameLiveness(a, b).class, LIVENESS_CLASS.REPEATING_FRAME_ERROR);
  assert.equal(classifyFrameLiveness(a, sample({ contextLost: true })).class, LIVENESS_CLASS.CONTEXT_LOST);
});

test('window summary counts hitches without treating them as permanent freezes', () => {
  const rows = [
    sample(),
    sample({ simTime: 10.02, tick: 601, rendererFrame: 61, renderUpdates: 61, frameDtMs: 40 }),
    sample({ simTime: 10.04, tick: 602, rendererFrame: 62, renderUpdates: 62, frameDtMs: 16 }),
  ];
  const summary = summarizeLivenessWindow(rows);
  assert.equal(summary.hitchCount, 1);
  assert.equal(summary.ok, true);
  assert.equal(mustRescheduleAfterFrame({ destroyed: false }), true);
  assert.equal(mustRescheduleAfterFrame({ destroyed: true }), false);
});
