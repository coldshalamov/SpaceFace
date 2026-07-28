import assert from 'node:assert/strict';
import test from 'node:test';

import { audio } from '../src/audio/audioSystem.js';

async function settlePromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createRuntime(ctx) {
  return {
    ctx,
    _rafId: 0,
    _lifecycleSuspended: false,
    _lifecycleReason: null,
    _resumeAfterLifecycle: false,
    _lifecycleSuspendPromise: null,
    _resumePromise: null,
    _lastWallTime: 12,
  };
}

test('audio lifecycle stops its owned frame loop and resumes only after restore', async () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrameId = 1;
  const pendingFrames = new Map();
  const cancelledFrames = [];
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextFrameId++;
    pendingFrames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    cancelledFrames.push(id);
    pendingFrames.delete(id);
  };

  try {
    let suspendCalls = 0;
    let resumeCalls = 0;
    let audioFrames = 0;
    const ctx = {
      state: 'running',
      suspend() {
        suspendCalls++;
        this.state = 'suspended';
        return Promise.resolve();
      },
      resume() {
        resumeCalls++;
        this.state = 'running';
        return Promise.resolve();
      },
    };
    const host = Object.create(audio);
    host.rt = createRuntime(ctx);
    host._frame = () => { audioFrames++; };

    host._startFrameLoop();
    assert.equal(pendingFrames.size, 1);
    const originalFrameId = host.rt._rafId;

    host.suspendForLifecycle('document-visibility');
    assert.equal(host.rt._lifecycleSuspended, true);
    assert.equal(host.rt._lifecycleReason, 'document-visibility');
    assert.equal(host.rt._lastWallTime, undefined);
    assert.equal(host.rt._rafId, 0);
    assert.deepEqual(cancelledFrames, [originalFrameId]);
    assert.equal(pendingFrames.size, 0);
    assert.equal(suspendCalls, 1);

    await settlePromises();
    host.resumeFromLifecycle('restore-frame-complete');
    await settlePromises();

    assert.equal(host.rt._lifecycleSuspended, false);
    assert.equal(host.rt._lifecycleReason, 'restore-frame-complete');
    assert.equal(resumeCalls, 1);
    assert.equal(pendingFrames.size, 1);
    assert.equal(host.rt._lastWallTime, undefined);

    const [frameId, callback] = pendingFrames.entries().next().value;
    pendingFrames.delete(frameId);
    callback();
    assert.equal(audioFrames, 1);
    assert.equal(pendingFrames.size, 1);

    host.suspendForLifecycle('test-cleanup');
    await settlePromises();
  } finally {
    if (originalRequest === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalRequest;
    if (originalCancel === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('audio never resumes an autoplay-suspended context from hidden frame work', async () => {
  let resumeCalls = 0;
  const ctx = {
    state: 'suspended',
    resume() {
      resumeCalls++;
      return Promise.resolve();
    },
  };
  const host = Object.create(audio);
  host.rt = createRuntime(ctx);

  host._frame();
  assert.equal(resumeCalls, 0);

  host.suspendForLifecycle('hidden');
  host.resumeFromLifecycle('restore-frame-complete');
  await settlePromises();
  assert.equal(resumeCalls, 0, 'restore must not bypass autoplay for a context lifecycle did not suspend');
  assert.equal(host.rt._rafId, 0);
});

test('gesture context access stays inert while lifecycle is suspended', () => {
  let resumeCalls = 0;
  const ctx = {
    state: 'suspended',
    resume() { resumeCalls++; },
  };
  const host = Object.create(audio);
  host.rt = createRuntime(ctx);
  host.rt._lifecycleSuspended = true;

  assert.equal(host._ensureContext(), null);
  assert.equal(host.play('sfx_ui_click', {}), null);
  assert.equal(host._startLoopVoice('sfx_wpn_beam_laser', null, 1), null);
  assert.equal(resumeCalls, 0);
});
