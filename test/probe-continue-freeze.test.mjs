import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyContinueFreeze } from '../scripts/lib/continueFreezeDiagnostics.mjs';

function samples(overrides = {}) {
  return Array.from({ length: 10 }, (_, index) => ({
    simTime: index,
    executedFrames: index * 60,
    renderUpdates: index * 60,
    rendererFrame: index * 60,
    pos: { x: index * 4, z: 0 },
    timeScale: 1,
    suspended: false,
    documentHidden: false,
    contextLost: false,
    canvasSignature: `frame-${index}`,
    ...overrides,
  }));
}

test('moving simulation cannot false-green an unchanged WebGL canvas', () => {
  const verdict = classifyContinueFreeze(samples({ canvasSignature: 'stuck-picture' }));
  assert.equal(verdict.frozen, true);
  assert.equal(verdict.kind, 'draw-dead');
  assert.equal(verdict.signal, 'canvas-unchanged');
});

test('renderer frame stalls are draw-dead even when the canvas observer is unavailable', () => {
  const input = samples({ canvasSignature: null, rendererFrame: 12 });
  const verdict = classifyContinueFreeze(input);
  assert.equal(verdict.frozen, true);
  assert.equal(verdict.kind, 'draw-dead');
  assert.equal(verdict.signal, 'renderer-frame-stalled');
});

test('changing canvas plus simulation and body progress is the player-visible green case', () => {
  const verdict = classifyContinueFreeze(samples());
  assert.equal(verdict.frozen, false);
  assert.equal(verdict.kind, 'sim-body-and-canvas-moving');
});

test('UI-hidden screenshot hashes outrank an unreliable in-page canvas readback', () => {
  const verdict = classifyContinueFreeze(
    samples({ canvasSignature: 'stale-readback' }),
    { canvasFrameHashes: ['shot-a', 'shot-b', 'shot-c'] },
  );
  assert.equal(verdict.frozen, false);
  assert.equal(verdict.canvasObserver, 'ui-hidden-screenshot');
  assert.equal(verdict.canvasChanged, true);
});

test('stopped callbacks remain a loop-dead freeze', () => {
  const input = samples({
    simTime: 5,
    executedFrames: 10,
    renderUpdates: 10,
    rendererFrame: 10,
    pos: { x: 2, z: 3 },
    canvasSignature: 'stuck-picture',
  });
  const verdict = classifyContinueFreeze(input);
  assert.equal(verdict.frozen, true);
  assert.equal(verdict.kind, 'loop-dead');
});

test('missing presentation evidence is inconclusive instead of a false green', () => {
  const verdict = classifyContinueFreeze(samples({ canvasSignature: null }));
  assert.equal(verdict.frozen, null);
  assert.equal(verdict.kind, 'inconclusive-canvas-unobserved');
});

test('too few valid samples are inconclusive instead of a false green', () => {
  const verdict = classifyContinueFreeze(samples().slice(0, 5));
  assert.equal(verdict.frozen, null);
  assert.equal(verdict.kind, 'inconclusive-too-few-samples');
});
