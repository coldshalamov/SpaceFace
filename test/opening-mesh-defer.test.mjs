import assert from 'node:assert/strict';
import test from 'node:test';

import { releaseOpeningMeshDefer } from '../src/render/renderer.js';

test('first-playable-paint always clears mesh streaming defer even off the flight mode', () => {
  const owner = {
    _deferNoncriticalMeshStreaming: true,
    _meshReconcileDirty: false,
    _firstPlayablePaintScheduled: true,
  };
  releaseOpeningMeshDefer(owner, 'menu');
  assert.equal(owner._deferNoncriticalMeshStreaming, false);
  assert.equal(owner._meshReconcileDirty, true);
  assert.equal(owner._firstPlayablePaintScheduled, false);
});

test('first-playable-paint keeps the scheduled flag only while flight continues', () => {
  const owner = {
    _deferNoncriticalMeshStreaming: true,
    _meshReconcileDirty: false,
    _firstPlayablePaintScheduled: true,
  };
  releaseOpeningMeshDefer(owner, 'flight');
  assert.equal(owner._deferNoncriticalMeshStreaming, false);
  assert.equal(owner._firstPlayablePaintScheduled, true);
});
