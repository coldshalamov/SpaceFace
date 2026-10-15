import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFootageVideoCodec,
  decodeFootageFrameToBlob,
  footageVideoCodecRuntime,
} from '../src/ui/screens/footageVideoCodec.js';
import { installFlightFootage } from '../src/ui/screens/flightFootage.js';

class CodecWorker {
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.messages = [];
    this.terminated = false;
    CodecWorker.instances.push(this);
  }

  postMessage(data, transfer) {
    this.messages.push({ data, transfer });
    if (data.kind === 'configure') {
      queueMicrotask(() => this.onmessage?.({ data: {
        kind: 'ready',
        config: { codec: 'vp8', width: 640, height: 340, framerate: 10 },
      } }));
    } else if (data.kind === 'encode') {
      queueMicrotask(() => this.onmessage?.({ data: {
        kind: 'chunk',
        id: data.id,
        type: 'key',
        timestamp: 1000,
        data: new Uint8Array([1, 2, 3, 4]).buffer,
        decoderConfig: { codec: 'vp8', codedWidth: 640, codedHeight: 340 },
        codec: 'vp8',
      } }));
    }
  }

  terminate() { this.terminated = true; }
}

function makeScope() {
  const revoked = [];
  return {
    Worker: CodecWorker,
    Blob,
    VideoEncoder: class VideoEncoder {},
    URL: {
      createObjectURL() { return 'blob:footage-codec'; },
      revokeObjectURL(url) { revoked.push(url); },
    },
    revoked,
  };
}

test('the optional codec worker requests a bounded all-keyframe encoder and releases its worker URL', async () => {
  CodecWorker.instances.length = 0;
  const scope = makeScope();
  const codec = createFootageVideoCodec(scope, { width: 640, height: 340, maxPending: 1 });
  assert.ok(codec);
  await codec.ready;
  const frame = { close() {} };
  const encoded = await codec.encode(frame, { tick: 60, width: 640, height: 340 });
  const worker = CodecWorker.instances[0];
  assert.equal(worker.options.name, 'spaceface-footage-video');
  assert.deepEqual(worker.messages[1].transfer, [frame]);
  assert.equal(encoded.codec, 'vp8');
  assert.equal(encoded.byteLength, 4);
  assert.match(footageVideoCodecRuntime.toString(), /keyFrame: true/);
  codec.dispose();
  assert.equal(worker.terminated, true);
  assert.deepEqual(scope.revoked, ['blob:footage-codec']);
});

test('the worker runtime probes candidates, emits transferable bytes and closes each transferred frame', async () => {
  const savedSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  const savedEncoder = Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder');
  const posts = [];
  const frame = { closeCount: 0, close() { this.closeCount += 1; } };
  class FakeEncoder {
    static async isConfigSupported(config) {
      return { supported: config.codec === 'vp8', config };
    }
    constructor({ output }) { this.output = output; }
    configure(config) { this.config = config; }
    encode(source, options) {
      posts.push({ source, options });
      this.output({
        type: 'key', timestamp: 120, duration: 100_000, byteLength: 3,
        copyTo(target) { target.set([4, 5, 6]); },
      }, {});
    }
    close() {}
  }
  Object.defineProperty(globalThis, 'self', { configurable: true, writable: true, value: { postMessage: (data) => posts.push(data) } });
  Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, writable: true, value: FakeEncoder });
  try {
    footageVideoCodecRuntime();
    await globalThis.self.onmessage({ data: { kind: 'configure', configs: [
      { codec: 'avc1.4D401E', width: 640, height: 340 }, { codec: 'vp8', width: 640, height: 340 },
    ] } });
    await globalThis.self.onmessage({ data: { kind: 'encode', id: 9, frame } });
    assert.equal(posts.find((post) => post.kind === 'ready').config.codec, 'vp8');
    assert.equal(posts.find((post) => post.kind === 'chunk').data.byteLength, 3);
    assert.equal(posts.find((post) => post.kind === 'chunk').id, 9);
    assert.equal(posts.find((post) => post.options)?.options.keyFrame, true);
    assert.equal(frame.closeCount, 1);
  } finally {
    if (savedSelf) Object.defineProperty(globalThis, 'self', savedSelf); else delete globalThis.self;
    if (savedEncoder) Object.defineProperty(globalThis, 'VideoEncoder', savedEncoder); else delete globalThis.VideoEncoder;
  }
});

test('the worker resizes a full-size transferred VideoFrame before the configured 640-wide encode', async () => {
  const saved = {
    self: Object.getOwnPropertyDescriptor(globalThis, 'self'),
    encoder: Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder'),
    canvas: Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas'),
    frame: Object.getOwnPropertyDescriptor(globalThis, 'VideoFrame'),
  };
  const posts = [];
  let encodedSource = null;
  class Canvas {
    constructor(width, height) { this.width = width; this.height = height; this.context = { drawImage: (...args) => { this.draw = args; } }; }
    getContext() { return this.context; }
  }
  class ResizedFrame {
    constructor(source, init) { this.source = source; this.timestamp = init.timestamp; this.displayWidth = source.width; this.displayHeight = source.height; }
    close() { this.closed = true; }
  }
  class FakeEncoder {
    static async isConfigSupported(config) { return { supported: true, config }; }
    constructor({ output }) { this.output = output; }
    configure(config) { this.config = config; }
    encode(source, options) {
      encodedSource = { source, options };
      this.output({ type: 'key', timestamp: 0, byteLength: 1, copyTo(target) { target[0] = 1; } }, {});
    }
    close() {}
  }
  const source = { displayWidth: 1466, displayHeight: 779, timestamp: 4, closeCount: 0, close() { this.closeCount += 1; } };
  Object.defineProperty(globalThis, 'self', { configurable: true, writable: true, value: { postMessage: (data) => posts.push(data) } });
  Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, writable: true, value: FakeEncoder });
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, writable: true, value: Canvas });
  Object.defineProperty(globalThis, 'VideoFrame', { configurable: true, writable: true, value: ResizedFrame });
  try {
    footageVideoCodecRuntime();
    await self.onmessage({ data: { kind: 'configure', configs: [{ codec: 'vp8', width: 640, height: 340 }] } });
    await self.onmessage({ data: { kind: 'encode', id: 2, frame: source } });
    assert.equal(encodedSource.source.displayWidth, 640);
    assert.equal(encodedSource.source.displayHeight, 340);
    assert.equal(encodedSource.source.source.width, 640);
    assert.equal(encodedSource.source.source.height, 340);
    assert.deepEqual(encodedSource.source.source.draw.slice(1), [0, 0, 640, 340]);
    assert.deepEqual(posts.find((post) => post.kind === 'chunk').data.byteLength, 1);
    assert.equal(source.closeCount, 1);
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('encoded ring entries decode lazily to a genuine JPEG blob for exports', async () => {
  class FakeDecodedFrame {
    close() { this.closed = true; }
  }
  class FakeDecoder {
    static last = null;
    constructor({ output, error }) { this.output = output; this.error = error; FakeDecoder.last = this; }
    configure(config) { this.config = config; }
    decode(chunk) { this.chunk = chunk; this.output(new FakeDecodedFrame()); }
    flush() { return Promise.resolve(); }
    close() { this.closed = true; }
  }
  class FakeChunk { constructor(init) { Object.assign(this, init); } }
  class FakeCanvas {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { return { drawImage() {} }; }
    convertToBlob() { return Promise.resolve(new Blob([new Uint8Array([8])], { type: 'image/jpeg' })); }
  }
  const frame = {
    width: 640,
    height: 340,
    encoded: { data: new ArrayBuffer(4), type: 'key', timestamp: 0, codec: 'vp8' },
  };
  const blob = await decodeFootageFrameToBlob(frame, {
    scope: { VideoDecoder: FakeDecoder, EncodedVideoChunk: FakeChunk, OffscreenCanvas: FakeCanvas },
  });
  assert.equal(blob.type, 'image/jpeg');
  assert.equal(blob.size, 1);
  assert.equal(frame.decodedBlob, undefined, 'encoded decode must not retain a second JPEG in the ring');
  assert.equal(FakeDecoder.last.config.codec, 'vp8');
});

test('installFlightFootage keeps WebCodecs opt-in and transfers presented frames without ImageBitmap/JPEG work', async () => {
  CodecWorker.instances.length = 0;
  const saved = new Map();
  for (const name of ['document', 'performance', 'Worker', 'Blob', 'VideoEncoder', 'VideoFrame', 'URL', 'createImageBitmap']) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  const calls = { bitmaps: 0 };
  let poll;
  const source = {
    width: 1466,
    height: 779,
    captureStream() { throw new Error('presented codec must not need a stream'); },
  };
  class Frame {
    constructor(canvas, { timestamp }) { this.canvas = canvas; this.timestamp = timestamp; this.displayWidth = 1466; this.displayHeight = 779; }
    close() { this.closed = true; }
  }
  const state = {
    mode: 'flight', paused: false, tick: 6,
    render: { renderer: { domElement: source }, canvas: source, firstPlayableFrameAt: 0 },
    replay: { latestPoseSample: { tick: 6, poses: [], events: [] } },
  };
  const document = {
    hidden: false,
    addEventListener() {}, removeEventListener() {},
    createElement() { return { getContext() { return {}; } }; },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 5000 } });
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: CodecWorker });
  Object.defineProperty(globalThis, 'Blob', { configurable: true, writable: true, value: Blob });
  Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, writable: true, value: class {} });
  Object.defineProperty(globalThis, 'VideoFrame', { configurable: true, writable: true, value: Frame });
  Object.defineProperty(globalThis, 'URL', { configurable: true, writable: true, value: makeScope().URL });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true, writable: true,
    value: () => { calls.bitmaps += 1; throw new Error('WebCodecs path must not use ImageBitmap'); },
  });
  globalThis.setInterval = (fn) => { poll = fn; return 1; };
  globalThis.clearInterval = () => {};
  try {
    const footage = installFlightFootage({ on: () => () => {} }, {
      stateOf: () => state, startDelayMs: 0, captureSource: 'presented', captureBackend: 'webcodecs',
    });
    poll();
    const hook = state.render.flightFootagePresentHook;
    assert.equal(typeof hook, 'function');
    hook(source);
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    assert.equal(calls.bitmaps, 0);
    assert.equal(CodecWorker.instances[0].messages.filter(({ data }) => data.kind === 'encode').length, 1);
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    assert.equal(footage.ring.frames.length, 1);
    assert.ok(footage.ring.frames[0].encoded);
    assert.equal(footage.ring.frames[0].blob, undefined);
    assert.equal(footage.status().captureBackend, 'webcodecs');
    footage.dispose();
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('requested WebCodecs cleanly falls back to the existing presented JPEG path when unavailable', () => {
  const saved = new Map();
  for (const name of ['document', 'performance', 'Worker', 'OffscreenCanvas', 'URL', 'createImageBitmap', 'VideoEncoder']) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  let poll;
  const source = { width: 640, height: 360, captureStream() { throw new Error('not reached'); } };
  const state = {
    mode: 'flight', paused: false, tick: 6,
    render: { renderer: { domElement: source }, canvas: source, firstPlayableFrameAt: 0 },
    replay: { latestPoseSample: { tick: 6, poses: [], events: [] } },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    hidden: false, addEventListener() {}, removeEventListener() {},
    createElement() { return { getContext() { return {}; } }; },
  } });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 5000 } });
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: CodecWorker });
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, writable: true, value: class {} });
  Object.defineProperty(globalThis, 'URL', { configurable: true, writable: true, value: makeScope().URL });
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, writable: true,
    value: () => Promise.resolve({ close() {} }) });
  delete globalThis.VideoEncoder;
  globalThis.setInterval = (fn) => { poll = fn; return 1; };
  globalThis.clearInterval = () => {};
  try {
    const footage = installFlightFootage({ on: () => () => {} }, {
      stateOf: () => state, startDelayMs: 0, captureSource: 'presented', captureBackend: 'webcodecs',
    });
    poll();
    assert.equal(footage.status().requestedCaptureBackend, 'webcodecs');
    assert.equal(footage.status().captureBackend, 'jpeg');
    assert.equal(typeof state.render.flightFootagePresentHook, 'function');
    footage.dispose();
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
