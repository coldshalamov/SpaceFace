import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyFirstPlayablePaintRelease,
  freezeOpeningGraphPublication,
  releaseOpeningMeshDefer,
  shouldScheduleFirstPlayablePaintRelease,
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

test('first-playable paint keeps leftover authored publications frozen through first flight', async () => {
  const owner = {
    state: {
      mode: 'flight',
      simTime: 0,
      render: {
        resumeDeferredPipelineAdmissions: () => ({ skipped: true }),
      },
    },
    _deferNoncriticalMeshStreaming: true,
    _meshReconcileDirty: false,
    _openingFirstPicturePrepared: true,
  };
  assert.equal(freezeOpeningGraphPublication(owner), true);
  let released = false;
  const waiting = owner.state.render.waitForOpeningGraphPublicationRelease().then(() => { released = true; });
  await Promise.resolve();
  assert.equal(owner.state.render.openingVfxFrozen, true, 'VFX hold the exact census until first paint');
  applyFirstPlayablePaintRelease(owner);
  await Promise.resolve();
  assert.equal(released, false, 'leftover FX must not publish on first paint');
  assert.equal(owner.state.render.openingGraphPublicationFrozen, true);
  assert.equal(owner.state.render.openingVfxFrozen, false,
    'exhaust, weapon fire and particles resume at first paint while authored publication stays held');
  releaseOpeningMeshDefer(owner, 'flight');
  await waiting;
  assert.equal(released, true);
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
  assert.equal(owner.state.render.openingVfxFrozen, false);
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
  assert.equal(Number.isFinite(owner.state.render.firstPlayableFrameAt), true,
    'the streaming latch must stamp even when the opening diagnostic failed');
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

test('a same-sector recook flight still schedules the paint release for its re-armed defer', () => {
  // F9/Continue in the cooked sector keeps the first-playable receipt finite but
  // mode:changed -> 'flight' re-arms the streaming defer. Gating the latch on the
  // receipt alone parked streaming for the whole post-reload flight: the reconcile
  // flag never cleared and no new entity gained a mesh.
  const owner = {
    state: { mode: 'flight', render: { firstPlayableFrameAt: 1234 } },
    _firstPlayablePaintScheduled: false,
    _deferNoncriticalMeshStreaming: true,
  };
  assert.equal(shouldScheduleFirstPlayablePaintRelease(owner), true);
});

test('the paint latch stays armed for the opening flight and does not refire after release', () => {
  const opening = {
    state: { mode: 'flight', render: {} },
    _firstPlayablePaintScheduled: false,
    _deferNoncriticalMeshStreaming: true,
  };
  assert.equal(shouldScheduleFirstPlayablePaintRelease(opening), true);
  opening._firstPlayablePaintScheduled = true;
  opening._firstPlayablePaintScheduledAtMs = performance.now();
  assert.equal(shouldScheduleFirstPlayablePaintRelease(opening), false);
  const steady = {
    state: { mode: 'flight', render: { firstPlayableFrameAt: 1234 } },
    _firstPlayablePaintScheduled: false,
    _deferNoncriticalMeshStreaming: false,
  };
  assert.equal(shouldScheduleFirstPlayablePaintRelease(steady), false);
  const docked = {
    state: { mode: 'station', render: {} },
    _firstPlayablePaintScheduled: false,
    _deferNoncriticalMeshStreaming: true,
  };
  assert.equal(shouldScheduleFirstPlayablePaintRelease(docked), false);
});

test('a stale armed paint latch re-arms while the first-playable stamp is still missing', () => {
  // Live regression: the armed afterBrowserPaint chain (rAF -> timer -> rAF) can drop its
  // callback without a trace; _firstPlayablePaintScheduled then stayed true forever and
  // firstPlayableFrameAt never stamped — streaming, the residency hold, and the probe's
  // flight wait all wedged behind a frame that had already submitted. The release is
  // idempotent, so once the arm outlives the rearm grace the latch must schedule again.
  const wedged = {
    state: { mode: 'flight', render: {} },
    _firstPlayablePaintScheduled: true,
    _firstPlayablePaintScheduledAtMs: performance.now() - 60000,
    _deferNoncriticalMeshStreaming: true,
  };
  assert.equal(shouldScheduleFirstPlayablePaintRelease(wedged), true);
  assert.equal(wedged._firstPlayablePaintRearms, 1);
  wedged.state.render.firstPlayableFrameAt = 4321;
  assert.equal(shouldScheduleFirstPlayablePaintRelease(wedged), false,
    'a stamped receipt never re-arms even with a stale scheduled flag');
});

test('a flag armed without a timestamp re-arms immediately while the stamp is missing', () => {
  // releaseOpeningMeshDefer sets _firstPlayablePaintScheduled = true during flight without a
  // timestamp — the opening-picture failsafe calls it directly. That state means "released, no
  // chain pending": if firstPlayableFrameAt is still missing the next frame must re-arm at once
  // rather than waiting out a grace measured from nothing.
  const released = {
    state: { mode: 'flight', render: {} },
    _firstPlayablePaintScheduled: true,
    _deferNoncriticalMeshStreaming: true,
  };
  assert.equal(shouldScheduleFirstPlayablePaintRelease(released), true);
  assert.equal(released._firstPlayablePaintRearms, 1);
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
