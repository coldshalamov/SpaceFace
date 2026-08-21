import assert from 'node:assert/strict';
import test from 'node:test';

import {
  freezeOpeningGraphPublication,
  releaseOpeningMeshDefer,
} from '../src/render/renderer.js';

test('first-playable-paint always clears mesh streaming defer even off the flight mode', () => {
  const owner = {
    _deferNoncriticalMeshStreaming: true,
    _meshReconcileDirty: false,
    _openingFirstPicturePrepared: true,
    _firstPlayablePaintScheduled: true,
  };
  releaseOpeningMeshDefer(owner, 'menu');
  assert.equal(owner._deferNoncriticalMeshStreaming, false);
  assert.equal(owner._meshReconcileDirty, true);
  assert.equal(owner._openingFirstPicturePrepared, false);
  assert.equal(owner._firstPlayablePaintScheduled, false);
});

test('first-playable-paint keeps the scheduled flag only while flight continues', () => {
  const owner = {
    _deferNoncriticalMeshStreaming: true,
    _meshReconcileDirty: false,
    _openingFirstPicturePrepared: true,
    _firstPlayablePaintScheduled: true,
  };
  releaseOpeningMeshDefer(owner, 'flight');
  assert.equal(owner._deferNoncriticalMeshStreaming, false);
  assert.equal(owner._openingFirstPicturePrepared, false);
  assert.equal(owner._firstPlayablePaintScheduled, true);
});

test('first-playable paint releases authored child publications frozen at the exact census', async () => {
  const owner = {
    state: { render: {} },
    _deferNoncriticalMeshStreaming: true,
    _meshReconcileDirty: false,
    _openingFirstPicturePrepared: true,
  };
  assert.equal(freezeOpeningGraphPublication(owner), true);
  assert.equal(owner.state.render.openingGraphPublicationFrozen, true);
  let released = false;
  const waiting = owner.state.render.waitForOpeningGraphPublicationRelease().then(() => { released = true; });
  await Promise.resolve();
  assert.equal(released, false);
  releaseOpeningMeshDefer(owner, 'flight');
  await waiting;
  assert.equal(released, true);
  assert.equal(owner.state.render.openingGraphPublicationFrozen, false);
  assert.equal(owner.state.render.waitForOpeningGraphPublicationRelease, null);
});
