// The optional track-source arm keeps the recorder's existing 640x340 JPEG contract while avoiding
// the detached <video> + main-thread createImageBitmap boundary. It is opt-in so native A/B cells can
// compare browser readback cost before the normal route changes.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  footageEncoderRuntime,
  installFlightFootage,
} from '../src/ui/screens/flightFootage.js';

class FakeWorker {
  static instances = [];
  constructor() {
    this.posted = [];
    this.terminated = false;
    this.hold = false;
    FakeWorker.instances.push(this);
  }
  postMessage(data, transfer) {
    this.posted.push({ data, transfer });
    if (!this.hold) queueMicrotask(() => this.onmessage?.({ data: { id: data.id, blob: new Blob([new Uint8Array(8)]) } }));
  }
  reply(id) { this.onmessage?.({ data: { id, blob: new Blob([new Uint8Array(8)]) } }); }
  terminate() { this.terminated = true; }
}

function saveGlobal(name) {
  return Object.getOwnPropertyDescriptor(globalThis, name);
}

function restoreGlobal(name, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete globalThis[name];
}

test('the worker resizes a transferred VideoFrame beside the JPEG encode', async () => {
  const saved = {
    self: saveGlobal('self'),
    OffscreenCanvas: saveGlobal('OffscreenCanvas'),
    createImageBitmap: saveGlobal('createImageBitmap'),
  };
  const draws = [], resizes = [], posts = [];
  const frame = { closeCount: 0, close() { this.closeCount += 1; } };
  const resized = { closeCount: 0, close() { this.closeCount += 1; } };
  const worker = { postMessage(message) { posts.push(message); } };
  Object.defineProperty(globalThis, 'self', { configurable: true, writable: true, value: worker });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    writable: true,
    value: async (source, options) => { resizes.push({ source, options }); return resized; },
  });
  Object.defineProperty(globalThis, 'OffscreenCanvas', {
    configurable: true,
    writable: true,
    value: class {
      constructor(width, height) { this.width = width; this.height = height; }
      getContext() { return { drawImage: (...args) => draws.push(args) }; }
      async convertToBlob(options) { posts.push({ options }); return new Blob([new Uint8Array(4)]); }
    },
  });
  try {
    footageEncoderRuntime();
    await worker.onmessage({ data: { id: 4, bitmap: frame, width: 640, height: 340, sourceKind: 'video-frame' } });
    assert.equal(resizes.length, 1);
    assert.equal(resizes[0].source, frame);
    assert.deepEqual(resizes[0].options, { resizeWidth: 640, resizeHeight: 340, resizeQuality: 'medium' });
    assert.equal(frame.closeCount, 1);
    assert.equal(resized.closeCount, 1);
    assert.deepEqual(draws[0].slice(1), [0, 0, 640, 340]);
    assert.deepEqual(posts[0].options, { type: 'image/jpeg', quality: 0.88 });
    assert.equal(posts.at(-1).id, 4, 'the encoded blob keeps the request id');
    assert.ok(posts.at(-1).blob, 'runtime returned a JPEG blob by id');
  } finally {
    restoreGlobal('self', saved.self);
    restoreGlobal('OffscreenCanvas', saved.OffscreenCanvas);
    restoreGlobal('createImageBitmap', saved.createImageBitmap);
  }
});

class TrackReader {
  constructor() { this.pending = []; this.cancelled = false; }
  read() { return new Promise((resolve) => this.pending.push(resolve)); }
  cancel() {
    this.cancelled = true;
    for (const resolve of this.pending.splice(0)) resolve({ done: true, value: undefined });
    return Promise.resolve();
  }
  push(frame) {
    const resolve = this.pending.shift();
    assert.ok(resolve, 'the processor keeps one bounded read pending');
    resolve({ done: false, value: frame });
  }
}

test('the opt-in track source transfers VideoFrames directly and keeps the 640x340 ring contract', async () => {
  FakeWorker.instances.length = 0;
  const saved = {
    document: saveGlobal('document'),
    performance: saveGlobal('performance'),
    Worker: saveGlobal('Worker'),
    OffscreenCanvas: saveGlobal('OffscreenCanvas'),
    createImageBitmap: saveGlobal('createImageBitmap'),
    MediaStreamTrackProcessor: saveGlobal('MediaStreamTrackProcessor'),
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  let poll = null;
  let sourceFrameCallback = null;
  const reader = new TrackReader();
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  class Processor {
    constructor({ track }) { assert.equal(track, tracks[0]); this.readable = { getReader: () => reader }; }
  }
  const source = {
    width: 1832,
    height: 973,
    captureStream(fps) {
      assert.equal(fps, 10);
      return { getVideoTracks: () => tracks, getTracks: () => tracks };
    },
  };
  const state = {
    mode: 'flight', paused: false, tick: 6,
    render: { canvas: source, firstPlayableFrameAt: 0 },
    replay: { latestPoseSample: { tick: 6, poses: [], events: [] } },
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      hidden: false,
      addEventListener() {},
      removeEventListener() {},
      createElement(tag) {
        assert.notEqual(tag, 'video', 'the track arm does not construct a detached video');
        return { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob(done) {
          done(new Blob([new Uint8Array(8)]));
        } };
      },
    },
  });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 0 } });
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: FakeWorker });
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, writable: true, value: class {} });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    writable: true,
    value: async () => { throw new Error('main createImageBitmap must not run for track frames'); },
  });
  Object.defineProperty(globalThis, 'MediaStreamTrackProcessor', {
    configurable: true,
    writable: true,
    value: Processor,
  });
  globalThis.setInterval = (fn) => { poll = fn; return 1; };
  globalThis.clearInterval = () => {};
  try {
    const footage = installFlightFootage(
      { on: () => () => {} },
      { stateOf: () => state, startDelayMs: 0, captureSource: 'video-frame' },
    );
    poll();
    await Promise.resolve();
    assert.equal(footage.status().captureSource, 'video-frame');
    assert.equal(footage.status().requestedCaptureSource, 'video-frame');

    const frame = { displayWidth: 1832, displayHeight: 973, close() { sourceFrameCallback = true; } };
    FakeWorker.instances[0].hold = true;
    reader.push(frame);
    await Promise.resolve();
    assert.equal(FakeWorker.instances.length, 1);
    const posted = FakeWorker.instances[0].posted[0];
    assert.equal(posted.data.sourceKind, 'video-frame');
    assert.equal(posted.data.width, 640);
    assert.equal(posted.data.height, 340);
    assert.deepEqual(posted.transfer, [frame]);
    state.tick += 6;
    state.replay.latestPoseSample.tick = state.tick;
    FakeWorker.instances[0].hold = false;
    reader.push({ displayWidth: 1832, displayHeight: 973, close() {} });
    await Promise.resolve();
    assert.equal(FakeWorker.instances[0].posted.length, 1, 'a held worker keeps the single in-flight bound');
    FakeWorker.instances[0].reply(posted.data.id);
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    assert.equal(footage.ring.frames.length, 1);
    assert.deepEqual([footage.ring.frames[0].width, footage.ring.frames[0].height], [640, 340]);
    assert.equal(sourceFrameCallback, null, 'ownership moved to the worker on transfer');

    state.tick += 6;
    state.replay.latestPoseSample.tick = state.tick;
    reader.push({ displayWidth: 1832, displayHeight: 973, close() {} });
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    assert.equal(footage.ring.frames.length, 2);
    footage.dispose();
    assert.equal(reader.cancelled, true);
    assert.equal(tracks[0].stopped, true);
  } finally {
    restoreGlobal('document', saved.document);
    restoreGlobal('performance', saved.performance);
    restoreGlobal('Worker', saved.Worker);
    restoreGlobal('OffscreenCanvas', saved.OffscreenCanvas);
    restoreGlobal('createImageBitmap', saved.createImageBitmap);
    restoreGlobal('MediaStreamTrackProcessor', saved.MediaStreamTrackProcessor);
    globalThis.setInterval = saved.setInterval;
    globalThis.clearInterval = saved.clearInterval;
  }
});
