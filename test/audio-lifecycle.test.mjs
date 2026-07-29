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
    _contextEverRan: !!ctx && ctx.state === 'running',
    _contextStateChangeHandler: null,
    _lastWallTime: 12,
    stems: { A: null, B: null, C: null, D: null },
  };
}

function createAudioNode() {
  return {
    gain: { value: 0 },
    frequency: { value: 0 },
    Q: { value: 0 },
    delayTime: { value: 0 },
    connect() {},
    disconnect() {},
    start() {},
    stop() {},
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
    let schedulerPauses = 0;
    let schedulerResumes = 0;
    host.rt.stems.A = {
      pauseScheduler() { schedulerPauses++; },
      resumeScheduler() { schedulerResumes++; },
    };
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
    assert.equal(schedulerPauses, 1);

    await settlePromises();
    host.resumeFromLifecycle('restore-frame-complete');
    await settlePromises();

    assert.equal(host.rt._lifecycleSuspended, false);
    assert.equal(host.rt._lifecycleReason, 'restore-frame-complete');
    assert.equal(resumeCalls, 1);
    assert.equal(pendingFrames.size, 1);
    assert.equal(schedulerResumes, 1);
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

test('lifecycle restores a previously running context that the platform suspended first', async () => {
  let resumeCalls = 0;
  const ctx = {
    state: 'suspended',
    resume() {
      resumeCalls++;
      this.state = 'running';
      return Promise.resolve();
    },
  };
  const host = Object.create(audio);
  host.rt = createRuntime(ctx);
  host.rt._contextEverRan = true;

  host.suspendForLifecycle('system-suspend');
  assert.equal(host.rt._resumeAfterLifecycle, true);
  host.resumeFromLifecycle('restore-frame-complete');
  await settlePromises();

  assert.equal(resumeCalls, 1);
  assert.equal(host.rt._contextEverRan, true);
  assert.equal(host.rt._resumeAfterLifecycle, false);
});

test('lifecycle recovery accepts an interrupted previously running context', async () => {
  let resumeCalls = 0;
  const ctx = {
    state: 'interrupted',
    resume() {
      resumeCalls++;
      this.state = 'running';
      return Promise.resolve();
    },
  };
  const host = Object.create(audio);
  host.rt = createRuntime(ctx);
  host.rt._contextEverRan = true;

  host.suspendForLifecycle('screen-lock');
  host.resumeFromLifecycle('restore-frame-complete');
  await settlePromises();

  assert.equal(resumeCalls, 1);
  assert.equal(host.rt._resumeAfterLifecycle, false);
});

test('context state changes restart exactly one audio frame owner after interruption', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let nextFrameId = 1;
  const pendingFrames = new Map();
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextFrameId++;
    pendingFrames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => pendingFrames.delete(id);

  try {
    let stateListener = null;
    const ctx = {
      state: 'interrupted',
      addEventListener(type, listener) {
        assert.equal(type, 'statechange');
        stateListener = listener;
      },
      removeEventListener() {},
    };
    const host = Object.create(audio);
    host.rt = createRuntime(ctx);
    host.rt._contextEverRan = true;
    host._bindContextState(ctx);

    ctx.state = 'running';
    stateListener();
    stateListener();
    assert.equal(pendingFrames.size, 1);

    ctx.state = 'interrupted';
    stateListener();
    assert.equal(pendingFrames.size, 0);

    ctx.state = 'running';
    stateListener();
    assert.equal(pendingFrames.size, 1);
    host.destroy();
  } finally {
    if (originalRequest === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalRequest;
    if (originalCancel === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('a rejected pending resume never transfers frame ownership or clears retry intent', async () => {
  let rejectResume;
  let resumeCalls = 0;
  const ctx = {
    state: 'suspended',
    resume() {
      resumeCalls++;
      this.state = 'running';
      return new Promise((_resolve, reject) => { rejectResume = reject; });
    },
  };
  const host = Object.create(audio);
  host.rt = createRuntime(ctx);
  host.rt._contextEverRan = true;
  host.rt._resumeAfterLifecycle = true;

  const first = host._resumeAudioContext(false);
  const second = host._resumeAudioContext(false);
  assert.equal(second, first);
  assert.equal(resumeCalls, 1);
  assert.equal(host.rt._rafId, 0);

  rejectResume(new Error('device unavailable'));
  await settlePromises();

  assert.equal(host.rt._resumePromise, null);
  assert.equal(host.rt._resumeAfterLifecycle, true);
  assert.equal(host.rt._rafId, 0);
});

test('music stem schedulers pause without stale rearm and stop idempotently', () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let nextTimerId = 1;
  const pendingTimers = new Map();
  globalThis.setTimeout = (callback) => {
    const id = nextTimerId++;
    pendingTimers.set(id, callback);
    return id;
  };
  globalThis.clearTimeout = (id) => pendingTimers.delete(id);

  try {
    const ctx = {
      currentTime: 1,
      createBiquadFilter: createAudioNode,
      createDelay: createAudioNode,
      createGain: createAudioNode,
      createOscillator: createAudioNode,
    };
    const host = Object.create(audio);
    host._seqCalm = () => {};
    const stem = host._buildStemVoices(ctx, {}, createAudioNode(), 'A');
    assert.equal(pendingTimers.size, 1);
    const staleCallback = pendingTimers.values().next().value;

    stem.pauseScheduler();
    assert.equal(pendingTimers.size, 0);
    staleCallback();
    assert.equal(pendingTimers.size, 0, 'a cleared callback cannot rearm while paused');

    stem.resumeScheduler();
    stem.resumeScheduler();
    assert.equal(pendingTimers.size, 1, 'resume owns exactly one scheduler timer');

    stem.stop();
    stem.stop();
    assert.equal(pendingTimers.size, 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('audio destroy stops every music scheduler and removes context state ownership', () => {
  let stops = 0;
  let removes = 0;
  let closes = 0;
  const handler = () => {};
  const ctx = {
    state: 'running',
    removeEventListener(type, listener) {
      assert.equal(type, 'statechange');
      assert.equal(listener, handler);
      removes++;
    },
    close() {
      closes++;
      this.state = 'closed';
      return Promise.resolve();
    },
  };
  const host = Object.create(audio);
  host.rt = createRuntime(ctx);
  host.rt._contextStateChangeHandler = handler;
  for (const key of ['A', 'B', 'C', 'D']) {
    host.rt.stems[key] = { stop() { stops++; } };
  }

  host.destroy();

  assert.equal(stops, 4);
  assert.equal(removes, 1);
  assert.equal(closes, 1);
  assert.deepEqual(host.rt.stems, { A: null, B: null, C: null, D: null });
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
