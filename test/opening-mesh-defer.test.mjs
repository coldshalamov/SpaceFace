import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyFirstPlayablePaintRelease,
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

test('a failed opening submission validation still releases the mesh streaming defer', () => {
  // Live seed-47 regression: a first-visible geometry delta failed the opening validation and the
  // old latch skipped releaseOpeningMeshDefer, so no ship spawned or promoted after the first
  // picture ever gained a mesh for the rest of the session.
  let admissionsResumed = 0;
  const owner = {
    state: {
      mode: 'flight',
      render: {
        openingSubmissionValidation: { ok: false, reason: 'first-visible-geometry-delta' },
        resumeDeferredPipelineAdmissions: () => { admissionsResumed++; },
      },
    },
    _deferNoncriticalMeshStreaming: true,
    _meshReconcileDirty: false,
    _openingFirstPicturePrepared: true,
    _firstPlayablePaintScheduled: true,
  };
  applyFirstPlayablePaintRelease(owner);
  assert.equal(owner.state.render.firstPlayableFrameAt, undefined,
    'a failed validation is evidence only; it must not fake a first-playable frame');
  assert.equal(owner._deferNoncriticalMeshStreaming, false,
    'mesh streaming must resume even when the opening diagnostic failed');
  assert.equal(owner._openingFirstPicturePrepared, false,
    'the first-picture hold must end so syncEntityViews and camera follow resume');
  assert.equal(owner._meshReconcileDirty, true, 'a recovery scan must be requested');
  assert.equal(admissionsResumed, 1, 'deferred pipeline admissions must resume');
});

test('a passing opening validation stamps firstPlayableFrameAt and releases the defer', () => {
  const owner = {
    state: {
      mode: 'flight',
      render: {
        openingSubmissionValidation: { ok: true },
      },
    },
    _deferNoncriticalMeshStreaming: true,
    _meshReconcileDirty: false,
    _openingFirstPicturePrepared: true,
    _firstPlayablePaintScheduled: true,
  };
  applyFirstPlayablePaintRelease(owner);
  assert.equal(Number.isFinite(owner.state.render.firstPlayableFrameAt), true);
  assert.equal(owner._deferNoncriticalMeshStreaming, false);
  assert.equal(owner._openingFirstPicturePrepared, false);
});

test('the paint release keeps working when the first painted frame is no longer flight', () => {
  const owner = {
    state: {
      mode: 'menu',
      render: {},
    },
    _deferNoncriticalMeshStreaming: true,
    _meshReconcileDirty: false,
    _openingFirstPicturePrepared: true,
    _firstPlayablePaintScheduled: true,
  };
  applyFirstPlayablePaintRelease(owner);
  assert.equal(owner.state.render.firstPlayableFrameAt, undefined);
  assert.equal(owner._deferNoncriticalMeshStreaming, false);
  assert.equal(owner._firstPlayablePaintScheduled, false);
});
