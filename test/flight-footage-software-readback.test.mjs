import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFootageEncoder,
  footageEncoderRuntime,
  installFlightFootage,
} from '../src/ui/screens/flightFootage.js';

function saveGlobal(name) {
  return Object.getOwnPropertyDescriptor(globalThis, name);
}

function restoreGlobal(name, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete globalThis[name];
}

function makeScope() {
  const workers = [];
  class Worker {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.posted = [];
      this.terminated = false;
      workers.push(this);
    }

    postMessage(data, transfer) {
      this.posted.push({ data, transfer });
      queueMicrotask(() => this.onmessage?.({
        data: { id: data.id, blob: new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }) },
      }));
    }

    terminate() { this.terminated = true; }
  }
  return {
    workers,
    Worker,
    OffscreenCanvas: class {},
    createImageBitmap: async () => ({}),
    Blob,
    URL: {
      createObjectURL() { return 'blob:footage-test'; },
      revokeObjectURL() {},
    },
  };
}

test('the encoder carries the software-readback opt-in through the worker request while defaulting off', async () => {
  const optimizedScope = makeScope();
  const optimized = createFootageEncoder(optimizedScope, { willReadFrequently: true });
  const optimizedBitmap = { close() {} };
  const optimizedBlob = await optimized.encode(optimizedBitmap, 640, 340);
  assert.equal(optimizedBlob.type, 'image/jpeg', 'worker result remains a decodable JPEG');
  assert.equal(optimizedScope.workers[0].posted[0].data.willReadFrequently, true);
  assert.deepEqual(optimizedScope.workers[0].posted[0].transfer, [optimizedBitmap]);
  optimized.dispose();

  const defaultScope = makeScope();
  const normal = createFootageEncoder(defaultScope);
  await normal.encode({ close() {} }, 640, 340);
  assert.equal(defaultScope.workers[0].posted[0].data.willReadFrequently, false,
    'the established route explicitly keeps the default Canvas2D context mode');
  normal.dispose();
});

test('the worker requests willReadFrequently once, with a concrete legacy-context fallback', async () => {
  const saved = {
    self: saveGlobal('self'),
    OffscreenCanvas: saveGlobal('OffscreenCanvas'),
  };
  const calls = [];
  const posts = [];
  const context = {
    drawImage() {},
  };
  const worker = { postMessage(message) { posts.push(message); } };
  class OffscreenCanvas {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext(type, options) {
      calls.push({ type, options });
      if (options) throw new Error('legacy context implementation');
      return context;
    }
    async convertToBlob(options) {
      assert.deepEqual(options, { type: 'image/jpeg', quality: 0.88 });
      return new Blob([new Uint8Array([3])], { type: 'image/jpeg' });
    }
  }
  Object.defineProperty(globalThis, 'self', { configurable: true, writable: true, value: worker });
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, writable: true, value: OffscreenCanvas });
  try {
    footageEncoderRuntime();
    const bitmap = { close() {} };
    await worker.onmessage({ data: { id: 9, bitmap, width: 640, height: 340, willReadFrequently: true } });
    assert.deepEqual(calls, [
      { type: '2d', options: { willReadFrequently: true } },
      { type: '2d', options: undefined },
    ]);
    assert.equal(posts[0].id, 9);
    assert.equal(posts[0].blob.type, 'image/jpeg');
  } finally {
    restoreGlobal('self', saved.self);
    restoreGlobal('OffscreenCanvas', saved.OffscreenCanvas);
  }
});

class HarnessReader {
  constructor() { this.pending = []; this.cancelled = false; }
  read() { return new Promise((resolve) => this.pending.push(resolve)); }
  cancel() {
    this.cancelled = true;
    for (const resolve of this.pending.splice(0)) resolve({ done: true, value: undefined });
    return Promise.resolve();
  }
  push(frame) {
    const resolve = this.pending.shift();
    assert.ok(resolve, 'the track reader keeps one pending frame read');
    resolve({ done: false, value: frame });
  }
}

async function flushMicrotasks() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

async function makeTrackHarness({
  readbackConcurrency = 1,
  willReadFrequently,
  captureSource = 'video-frame',
} = {}) {
  const saved = {
    document: saveGlobal('document'),
    performance: saveGlobal('performance'),
    Worker: saveGlobal('Worker'),
    OffscreenCanvas: saveGlobal('OffscreenCanvas'),
    createImageBitmap: saveGlobal('createImageBitmap'),
    MediaStreamTrackProcessor: saveGlobal('MediaStreamTrackProcessor'),
    URL: saveGlobal('URL'),
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  const workers = [];
  const readers = [];
  const tracks = [];
  const videoCallbacks = [];
  let poll = null;
  let visibility = null;
  class Worker {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.posted = [];
      this.terminated = false;
      workers.push(this);
    }
    postMessage(data, transfer) { this.posted.push({ data, transfer }); }
    reply(id) {
      this.onmessage?.({ data: { id, blob: new Blob([new Uint8Array([7])], { type: 'image/jpeg' }) } });
    }
    terminate() { this.terminated = true; }
  }
  class Processor {
    constructor() {
      const reader = new HarnessReader();
      readers.push(reader);
      this.readable = { getReader: () => reader };
    }
  }
  const makeSource = (name) => ({
    name,
    width: 1832,
    height: 973,
    captureStream(fps) {
      assert.equal(fps, 10, 'the candidate keeps the production stream hint');
      const track = { stopped: false, stop() { this.stopped = true; } };
      tracks.push(track);
      return { getVideoTracks: () => [track], getTracks: () => [track] };
    },
  });
  const sourceA = makeSource('A');
  const sourceB = makeSource('B');
  const state = {
    mode: 'flight', paused: false, tick: 6,
    render: { canvas: sourceA, firstPlayableFrameAt: 0 },
    replay: { latestPoseSample: { tick: 6, poses: [], events: [] } },
  };
  const video = {
    readyState: 2,
    width: 1832,
    height: 973,
    muted: false,
    playsInline: false,
    srcObject: null,
    play: () => Promise.resolve(),
    requestVideoFrameCallback(callback) { videoCallbacks.push(callback); return callback; },
    cancelVideoFrameCallback() {},
    pause() {},
    removeAttribute() {},
    load() {},
  };
  const document = {
    hidden: false,
    addEventListener(type, listener) { if (type === 'visibilitychange') visibility = listener; },
    removeEventListener() {},
    createElement(tag) {
      if (tag === 'video' && captureSource === 'video') return video;
      assert.equal(tag, 'canvas', 'the track-source harness must not create a detached video');
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toBlob(done) { done(new Blob([new Uint8Array([8])], { type: 'image/jpeg' })); },
      };
    },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 0 } });
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: Worker });
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, writable: true, value: class {} });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    writable: true,
    value: captureSource === 'video'
      ? async () => ({ close() {} })
      : async () => { throw new Error('main createImageBitmap is not used by the track arm'); },
  });
  Object.defineProperty(globalThis, 'MediaStreamTrackProcessor', {
    configurable: true,
    writable: true,
    value: Processor,
  });
  Object.defineProperty(globalThis, 'URL', {
    configurable: true,
    writable: true,
    value: { createObjectURL: () => 'blob:pool-test', revokeObjectURL() {} },
  });
  globalThis.setInterval = (fn) => { poll = fn; return 1; };
  globalThis.clearInterval = () => {};
  const options = { stateOf: () => state, startDelayMs: 0, captureSource, readbackConcurrency };
  if (willReadFrequently !== undefined) options.willReadFrequently = willReadFrequently;
  const footage = installFlightFootage({ on: () => () => {} }, options);
  poll();
  await flushMicrotasks();
  return {
    footage,
    state,
    sourceA,
    sourceB,
    readers,
    workers,
    tracks,
    videoCallbacks,
    poll,
    setHidden(value) { document.hidden = value; visibility?.(); },
    async cleanup() {
      footage?.dispose?.();
      await flushMicrotasks();
      restoreGlobal('document', saved.document);
      restoreGlobal('performance', saved.performance);
      restoreGlobal('Worker', saved.Worker);
      restoreGlobal('OffscreenCanvas', saved.OffscreenCanvas);
      restoreGlobal('createImageBitmap', saved.createImageBitmap);
      restoreGlobal('MediaStreamTrackProcessor', saved.MediaStreamTrackProcessor);
      restoreGlobal('URL', saved.URL);
      globalThis.setInterval = saved.setInterval;
      globalThis.clearInterval = saved.clearInterval;
    },
  };
}

test('the opt-in two-slot pool commits out-of-order worker completions in capture order', async () => {
  const harness = await makeTrackHarness({ readbackConcurrency: 2 });
  try {
    const first = { displayWidth: 1832, displayHeight: 973, close() {} };
    const second = { displayWidth: 1832, displayHeight: 973, close() {} };
    harness.readers[0].push(first);
    await flushMicrotasks();
    harness.state.tick = 12;
    harness.state.replay.latestPoseSample.tick = 12;
    harness.readers[0].push(second);
    await flushMicrotasks();
    assert.equal(harness.workers.length, 2, 'the opt-in creates an independent second worker/context');
    assert.equal(harness.workers[0].posted[0].data.sourceKind, 'video-frame');
    assert.equal(harness.workers[1].posted[0].data.sourceKind, 'video-frame');
    assert.equal(harness.footage.status().activeReadbackJobs, 2);
    assert.equal(harness.footage.status().maxReadbackJobs, 2);

    const secondId = harness.workers[1].posted[0].data.id;
    harness.workers[1].reply(secondId);
    await flushMicrotasks();
    assert.equal(harness.footage.ring.frames.length, 0, 'a later completion waits for the earlier capture');
    const firstId = harness.workers[0].posted[0].data.id;
    harness.workers[0].reply(firstId);
    await flushMicrotasks();
    assert.deepEqual(harness.footage.ring.frames.map((frame) => frame.tick), [6, 12]);
    assert.equal(harness.footage.status().committedReadbackFrames, 2);
  } finally {
    await harness.cleanup();
  }
});

test('the video-frame callback caller can use the second context while the first encode is pending', async () => {
  const harness = await makeTrackHarness({ captureSource: 'video', readbackConcurrency: 2 });
  try {
    assert.ok(harness.videoCallbacks.length >= 1, 'video capture arms a presented-frame callback');
    harness.videoCallbacks.at(-1)();
    await flushMicrotasks();
    assert.equal(harness.workers.length, 1);
    harness.state.tick = 12;
    harness.state.replay.latestPoseSample.tick = 12;
    harness.videoCallbacks.at(-1)();
    await flushMicrotasks();
    assert.equal(harness.workers.length, 2, 'a second delivered video frame gets an independent worker');
    assert.equal(harness.workers[0].posted[0].data.sourceKind, undefined, 'video keeps the bitmap source contract');
    assert.equal(harness.workers[0].posted[0].data.width, 640);
    assert.equal(harness.workers[0].posted[0].data.height, 340);
    assert.equal(harness.footage.status().maxReadbackJobs, 2);
    harness.workers[1].reply(harness.workers[1].posted[0].data.id);
    await flushMicrotasks();
    assert.equal(harness.footage.ring.frames.length, 0);
    harness.workers[0].reply(harness.workers[0].posted[0].data.id);
    await flushMicrotasks();
    assert.deepEqual(harness.footage.ring.frames.map((frame) => frame.tick), [6, 12]);
  } finally {
    await harness.cleanup();
  }
});

test('the installed production recorder defaults to software readback while the encoder factory stays opt-in', async () => {
  const harness = await makeTrackHarness({ captureSource: 'video' });
  try {
    assert.equal(harness.footage.status().willReadFrequently, true);
    harness.videoCallbacks.at(-1)();
    await flushMicrotasks();
    assert.equal(harness.workers[0].posted[0].data.willReadFrequently, true,
      'the installed recorder reaches the worker flag without mirroring it in the fixture');
  } finally {
    await harness.cleanup();
  }
});

test('the default one-slot recorder keeps source ownership and drops a second in-flight frame', async () => {
  const harness = await makeTrackHarness({ readbackConcurrency: 1, willReadFrequently: false });
  try {
    const first = { displayWidth: 1832, displayHeight: 973, close() {} };
    const second = { displayWidth: 1832, displayHeight: 973, closeCount: 0, close() { this.closeCount += 1; } };
    harness.readers[0].push(first);
    await flushMicrotasks();
    harness.state.tick = 12;
    harness.state.replay.latestPoseSample.tick = 12;
    harness.readers[0].push(second);
    await flushMicrotasks();
    assert.equal(harness.workers.length, 1);
    assert.equal(harness.workers[0].posted.length, 1);
    assert.equal(harness.workers[0].posted[0].data.sourceKind, 'video-frame');
    assert.equal(second.closeCount, 1, 'the untransferred frame is released when the only slot is busy');
    assert.equal(harness.footage.status().readbackConcurrency, 1);
    assert.equal(harness.footage.status().droppedReadbackFrames, 1);
    harness.workers[0].reply(harness.workers[0].posted[0].data.id);
    await flushMicrotasks();
    assert.deepEqual(harness.footage.ring.frames.map((frame) => frame.tick), [6]);
  } finally {
    await harness.cleanup();
  }
});

test('stream replacement and visibility stop terminate every pool worker and track', async () => {
  const harness = await makeTrackHarness({ readbackConcurrency: 2 });
  try {
    harness.readers[0].push({ displayWidth: 1832, displayHeight: 973, close() {} });
    await flushMicrotasks();
    const oldWorkers = [...harness.workers];
    const oldTrack = harness.tracks[0];
    harness.state.render.canvas = harness.sourceB;
    harness.poll();
    await flushMicrotasks();
    assert.ok(oldWorkers.every((worker) => worker.terminated), 'replacing the stream terminates old workers');
    assert.equal(oldTrack.stopped, true, 'replacing the stream stops the old track');
    assert.ok(harness.workers.length > oldWorkers.length, 'replacement creates a fresh worker');
    const replacementWorkers = harness.workers.slice(oldWorkers.length);
    const replacementTrack = harness.tracks.at(-1);
    harness.setHidden(true);
    assert.ok(replacementWorkers.every((worker) => worker.terminated), 'visibility cleanup terminates replacement workers');
    assert.equal(replacementTrack.stopped, true, 'visibility cleanup stops the replacement track');
  } finally {
    await harness.cleanup();
  }
});
