// The flight-footage recorder encodes its JPEGs in a worker, not with canvas.toBlob on the main thread.
//
// canvas.toBlob reads the frame back from the GPU synchronously. On an integrated GPU that read waits for the
// whole queued render: the 2026-10-13 Crucible profile spent 2.5 s of a 21.9 s window (11.3% of the main
// thread, ~11 ms a capture) inside toBlob. The recorder now hands each presented frame to a worker as a
// transferred ImageBitmap and the worker draws, encodes and returns the blob. Without Worker/OffscreenCanvas
// it keeps the old main-thread path, and any worker failure retires the worker so the ring keeps filling.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFootageEncoder,
  footageEncoderRuntime,
  installFlightFootage,
} from '../src/ui/screens/flightFootage.js';

class FakeWorker {
  static instances = [];
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.posted = [];
    this.terminated = false;
    this.mode = 'echo'; // echo | hold | fail
    FakeWorker.instances.push(this);
  }
  postMessage(data, transfer) {
    this.posted.push({ data, transfer });
    if (this.mode === 'hold') return;
    queueMicrotask(() => {
      if (this.mode === 'fail') this.onmessage({ data: { id: data.id, failed: 'boom' } });
      else this.onmessage({ data: { id: data.id, blob: new Blob([new Uint8Array(8)]) } });
    });
  }
  reply(id) { this.onmessage({ data: { id, blob: new Blob([new Uint8Array(8)]) } }); }
  terminate() { this.terminated = true; }
}

function fakeScope(overrides = {}) {
  const revoked = [];
  const created = [];
  const scope = {
    Worker: FakeWorker,
    OffscreenCanvas: class {},
    createImageBitmap: async () => ({ close() {} }),
    Blob,
    URL: {
      createObjectURL: (blob) => { created.push(blob); return `blob:fake/${created.length}`; },
      revokeObjectURL: (url) => { revoked.push(url); },
    },
    ...overrides,
  };
  return { scope, revoked, created };
}

test('no encoder where Worker, OffscreenCanvas or createImageBitmap is missing', () => {
  for (const missing of ['Worker', 'OffscreenCanvas', 'createImageBitmap', 'Blob']) {
    const { scope } = fakeScope({ [missing]: undefined });
    assert.equal(createFootageEncoder(scope), null, `${missing} missing`);
  }
  const { scope } = fakeScope({ URL: {} });
  assert.equal(createFootageEncoder(scope), null, 'no createObjectURL');
});

test('the encoder worker is named, built from the runtime source, and its URL is revoked on dispose', async () => {
  FakeWorker.instances.length = 0;
  const { scope, revoked, created } = fakeScope();
  const encoder = createFootageEncoder(scope);
  assert.ok(encoder?.usable);
  const worker = FakeWorker.instances[0];
  assert.equal(worker.options.name, 'spaceface-footage');
  const source = await created[0].text();
  assert.match(source, /convertToBlob/);
  assert.match(source, /image\/jpeg/);
  assert.match(source, /^\(.*\)\(\);$/s, 'an immediately-invoked runtime');
  encoder.dispose();
  assert.equal(worker.terminated, true);
  assert.deepEqual(revoked, ['blob:fake/1']);
  assert.equal(encoder.usable, false);
});

test('encode transfers the bitmap and resolves with the blob the worker returns', async () => {
  FakeWorker.instances.length = 0;
  const { scope } = fakeScope();
  const encoder = createFootageEncoder(scope);
  const bitmap = { close() {} };
  const blob = await encoder.encode(bitmap, 640, 340);
  const sent = FakeWorker.instances[0].posted[0];
  assert.deepEqual(sent.transfer, [bitmap], 'the bitmap is transferred, not copied');
  assert.equal(sent.data.width, 640);
  assert.equal(sent.data.height, 340);
  assert.ok(blob.size === 8);
  encoder.dispose();
});

test('a worker failure rejects the request, retires the encoder, and rejects what was in flight', async () => {
  FakeWorker.instances.length = 0;
  const { scope } = fakeScope();
  const encoder = createFootageEncoder(scope);
  const worker = FakeWorker.instances[0];
  worker.mode = 'fail';
  await assert.rejects(encoder.encode({ close() {} }, 640, 340), /boom/);
  assert.equal(encoder.usable, true, 'a single bad frame does not retire the worker');
  worker.mode = 'hold';
  const stuck = encoder.encode({ close() {} }, 640, 340);
  worker.onerror({ message: 'crashed', preventDefault() {} });
  await assert.rejects(stuck, /crashed/);
  assert.equal(encoder.usable, false, 'a worker-level error retires it');
  let closed = false;
  await assert.rejects(encoder.encode({ close() { closed = true; } }, 640, 340), /retired/);
  assert.equal(closed, true, 'a refused bitmap is still released');
  encoder.dispose();
});

test('the worker body draws, closes the bitmap, encodes a 0.88 JPEG and replies by id; failures reply failed', async () => {
  const posts = [];
  const saved = { self: Object.getOwnPropertyDescriptor(globalThis, 'self'), OffscreenCanvas: globalThis.OffscreenCanvas };
  const draws = [];
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { return { drawImage: (...args) => draws.push(args) }; }
    async convertToBlob(options) { posts.push(['encode', options]); return new Blob([new Uint8Array(4)]); }
  };
  const worker = { postMessage: (message) => posts.push(['post', message]) };
  Object.defineProperty(globalThis, 'self', { configurable: true, writable: true, value: worker });
  try {
    footageEncoderRuntime();
    let closed = 0;
    await worker.onmessage({ data: { id: 7, bitmap: { close() { closed += 1; } }, width: 640, height: 340 } });
    assert.equal(closed, 1);
    assert.equal(draws.length, 1);
    assert.deepEqual(draws[0].slice(1), [0, 0, 640, 340]);
    assert.deepEqual(posts[0], ['encode', { type: 'image/jpeg', quality: 0.88 }]);
    assert.equal(posts[1][1].id, 7);
    assert.ok(posts[1][1].blob);

    // A bitmap the worker cannot draw is closed and reported, not left to leak.
    globalThis.OffscreenCanvas = class { constructor() { throw new Error('no canvas'); } };
    const failing = { postMessage: (message) => posts.push(['post', message]) };
    Object.defineProperty(globalThis, 'self', { configurable: true, writable: true, value: failing });
    footageEncoderRuntime();
    let closedAfterFailure = 0;
    await failing.onmessage({ data: { id: 9, bitmap: { close() { closedAfterFailure += 1; } }, width: 640, height: 340 } });
    const failure = posts.at(-1)[1];
    assert.equal(failure.id, 9);
    assert.match(failure.failed, /no canvas/);
    assert.equal(closedAfterFailure, 1);
  } finally {
    globalThis.OffscreenCanvas = saved.OffscreenCanvas;
    if (saved.self) Object.defineProperty(globalThis, 'self', saved.self); else delete globalThis.self;
  }
});

function fakeBrowser() {
  const calls = { streams: 0, toBlob: 0, draws: 0, bitmaps: [], bitmapsClosed: 0 };
  let poll = null;
  const frameCallbacks = [];
  const saved = {};
  const globals = ['document', 'performance', 'Worker', 'OffscreenCanvas', 'createImageBitmap'];
  for (const key of globals) saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  const savedTimers = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
  FakeWorker.instances.length = 0;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 0 } });
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: FakeWorker });
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, writable: true, value: class {} });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    writable: true,
    value: async (_video, options) => {
      calls.bitmaps.push(options);
      return { close() { calls.bitmapsClosed += 1; } };
    },
  });
  globalThis.setInterval = (fn) => { poll = fn; return 1; };
  globalThis.clearInterval = () => {};
  const video = {
    readyState: 2,
    play: () => Promise.resolve(),
    pause() {}, load() {}, removeAttribute() {},
    requestVideoFrameCallback(fn) { frameCallbacks.push(fn); return frameCallbacks.length; },
    cancelVideoFrameCallback() {},
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      hidden: false,
      addEventListener() {},
      removeEventListener() {},
      createElement(tag) {
        if (tag === 'video') return video;
        return {
          width: 300,
          height: 150,
          getContext: () => ({ drawImage() { calls.draws += 1; } }),
          toBlob(done) { calls.toBlob += 1; done(new Blob([new Uint8Array(8)])); },
        };
      },
    },
  });
  const source = {
    width: 1832,
    height: 973,
    captureStream() { calls.streams += 1; return { getTracks: () => [{ stop() {} }] }; },
  };
  const state = {
    mode: 'flight',
    paused: false,
    tick: 6,
    render: { canvas: source, firstPlayableFrameAt: 0 },
    replay: { latestPoseSample: { tick: 6, poses: [], events: [] } },
  };
  return {
    calls,
    state,
    poll: async () => { poll(); await Promise.resolve(); },
    async captureFrame() {
      const callback = frameCallbacks.shift();
      assert.ok(callback, 'a video-frame callback is waiting');
      state.tick += 6;
      state.replay.latestPoseSample.tick = state.tick;
      callback();
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    },
    pendingCallbacks: () => frameCallbacks.length,
    restore() {
      for (const key of globals) {
        if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
        else delete globalThis[key];
      }
      globalThis.setInterval = savedTimers.setInterval;
      globalThis.clearInterval = savedTimers.clearInterval;
    },
  };
}

test('with a worker, captures never touch canvas.toBlob and the ring fills from the worker', async () => {
  const browser = fakeBrowser();
  try {
    const footage = installFlightFootage({ on: () => () => {} }, { stateOf: () => browser.state, startDelayMs: 0 });
    await browser.poll();
    assert.equal(FakeWorker.instances.length, 1, 'one encoder worker for the recorder');
    await browser.captureFrame();
    await browser.captureFrame();
    assert.equal(browser.calls.toBlob, 0, 'no main-thread readback');
    assert.equal(browser.calls.draws, 0, 'no main-thread 2D draw either');
    assert.equal(footage.ring.frames.length, 2);
    assert.deepEqual(footage.ring.frames.map((frame) => [frame.width, frame.height]), [[640, 340], [640, 340]]);
    assert.deepEqual(browser.calls.bitmaps[0], { resizeWidth: 640, resizeHeight: 340, resizeQuality: 'medium' });
    footage.dispose();
    assert.equal(FakeWorker.instances[0].terminated, true, 'dispose terminates the worker');
  } finally {
    browser.restore();
  }
});

test('one frame is in flight at a time: a held encode blocks the next capture until it lands', async () => {
  const browser = fakeBrowser();
  try {
    const footage = installFlightFootage({ on: () => () => {} }, { stateOf: () => browser.state, startDelayMs: 0 });
    await browser.poll();
    FakeWorker.instances[0].mode = 'hold';
    await browser.captureFrame();
    await browser.captureFrame();
    assert.equal(FakeWorker.instances[0].posted.length, 1, 'the second capture did not queue another encode');
    assert.equal(footage.ring.frames.length, 0);
    FakeWorker.instances[0].reply(FakeWorker.instances[0].posted[0].data.id);
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    assert.equal(footage.ring.frames.length, 1);
    await browser.captureFrame();
    assert.equal(FakeWorker.instances[0].posted.length, 2, 'the next capture goes once the first landed');
    footage.dispose();
  } finally {
    browser.restore();
  }
});

test('a worker failure falls back to the main-thread encode and the ring keeps filling', async () => {
  const browser = fakeBrowser();
  try {
    const footage = installFlightFootage({ on: () => () => {} }, { stateOf: () => browser.state, startDelayMs: 0 });
    await browser.poll();
    FakeWorker.instances[0].mode = 'hold';
    await browser.captureFrame();
    FakeWorker.instances[0].onerror({ message: 'gpu process crashed', preventDefault() {} });
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    assert.equal(footage.ring.frames.length, 0, 'the lost frame is simply dropped');
    await browser.captureFrame();
    assert.equal(browser.calls.toBlob, 1, 'the next capture used the main-thread path');
    assert.equal(footage.ring.frames.length, 1);
    footage.dispose();
  } finally {
    browser.restore();
  }
});

test('a frame that lands after clear() is dropped, not pushed into the new game\'s ring', async () => {
  const browser = fakeBrowser();
  try {
    const handlers = new Map();
    const footage = installFlightFootage(
      { on(event, fn) { handlers.set(event, fn); return () => handlers.delete(event); } },
      { stateOf: () => browser.state, startDelayMs: 0 },
    );
    await browser.poll();
    FakeWorker.instances[0].mode = 'hold';
    await browser.captureFrame();
    handlers.get('game:new')();
    FakeWorker.instances[0].reply(FakeWorker.instances[0].posted[0].data.id);
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    assert.equal(footage.ring.frames.length, 0);
    footage.dispose();
  } finally {
    browser.restore();
  }
});

test('three failed frames in a row retire the worker path, and the main-thread path keeps the ring filling', async () => {
  const browser = fakeBrowser();
  try {
    const footage = installFlightFootage({ on: () => () => {} }, { stateOf: () => browser.state, startDelayMs: 0 });
    await browser.poll();
    globalThis.createImageBitmap = async () => { throw new Error('InvalidStateError'); };
    await browser.captureFrame();
    await browser.captureFrame();
    await browser.captureFrame();
    assert.equal(footage.ring.frames.length, 0, 'three frames were lost');
    assert.equal(browser.calls.toBlob, 0, 'no fallback yet: a single bad frame is only dropped');
    assert.equal(FakeWorker.instances[0].terminated, true, 'the third consecutive failure retired the worker');
    await browser.captureFrame();
    assert.equal(browser.calls.toBlob, 1, 'the next capture uses the main-thread path');
    assert.equal(footage.ring.frames.length, 1);
    footage.dispose();
  } finally {
    browser.restore();
  }
});

test('a good frame between failures resets the count: two failures, a success, two failures never retire the worker', async () => {
  const browser = fakeBrowser();
  try {
    const footage = installFlightFootage({ on: () => () => {} }, { stateOf: () => browser.state, startDelayMs: 0 });
    await browser.poll();
    const good = globalThis.createImageBitmap;
    const bad = async () => { throw new Error('InvalidStateError'); };
    for (const bitmap of [bad, bad, good, bad, bad]) {
      globalThis.createImageBitmap = bitmap;
      await browser.captureFrame();
    }
    assert.equal(FakeWorker.instances[0].terminated, false);
    assert.equal(footage.ring.frames.length, 1);
    assert.equal(browser.calls.toBlob, 0);
    footage.dispose();
  } finally {
    browser.restore();
  }
});
