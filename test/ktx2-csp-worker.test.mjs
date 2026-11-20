import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createKtx2TranscoderWorkerSource } from '../scripts/build-ktx2-transcoder-worker.mjs';
import { RGBAFormat, UnsignedByteType } from 'three';
import { createDefaultContainer, write } from '../vendor/addons/libs/ktx-parse.module.js';
import {
  ASSET_RUNTIME_DECODER_CONTRACT,
  configureCspSafeKtx2Loader,
  createSharedKtx2LoaderOwner,
} from '../src/render/assetLoader.js';

const WORKER_FILE = new URL('../vendor/addons/libs/basis/basis_transcoder.worker.js', import.meta.url);

test('committed Basis worker is the deterministic Three.js worker body', async () => {
  const [actual, expected] = await Promise.all([
    readFile(WORKER_FILE, 'utf8'),
    createKtx2TranscoderWorkerSource(),
  ]);
  assert.equal(actual, expected);
  assert.match(actual, /addEventListener\( 'message'/);
});

test('acquiring the default decoder leaves shared Basis initialization to texture demand', async (t) => {
  const wasmResponse = Promise.withResolvers();
  const fetch = t.mock.method(globalThis, 'fetch', () => wasmResponse.promise);
  const owner = createSharedKtx2LoaderOwner();
  const renderer = { extensions: { has: (name) => name === 'WEBGL_compressed_texture_s3tc' } };
  const loader = await owner.acquire(renderer);
  try {
    assert.equal(loader.workerConfig.dxtSupported, true);
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(loader.transcoderPending, null);

    const pixels = new Uint8Array([42, 65, 99, 255]);
    const container = createDefaultContainer();
    container.pixelWidth = container.pixelHeight = container.levelCount = 1;
    container.levels = [{ levelData: pixels, uncompressedByteLength: pixels.byteLength }];
    const readTexture = () => new Promise((resolve, reject) => loader.parse(write(container).buffer, resolve, reject));
    const postMessage = t.mock.method(loader.workerPool, 'postMessage', async () => ({
      data: {
        type: 'transcode',
        data: {
          faces: [{ mipmaps: [{ data: pixels, width: 1, height: 1 }] }],
          width: 1, height: 1, format: RGBAFormat, type: UnsignedByteType, dfdFlags: 0,
        },
      },
    }));

    const firstTexture = readTexture();
    const pending = loader.transcoderPending;
    const secondTexture = readTexture();
    assert.ok(pending);
    assert.strictEqual(loader.transcoderPending, pending);
    await Promise.resolve();
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(fetch.mock.calls[0].arguments[0], `${ASSET_RUNTIME_DECODER_CONTRACT.ktx2TranscoderPath}basis_transcoder.wasm`);
    assert.equal(postMessage.mock.callCount(), 0);

    wasmResponse.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    for (const texture of await Promise.all([firstTexture, secondTexture])) {
      assert.deepEqual(texture.mipmaps[0].data, pixels);
    }
    assert.equal(postMessage.mock.callCount(), 2);
  } finally {
    owner.release(loader);
  }

  const restored = await owner.acquire({ extensions: { has: () => false } });
  try {
    assert.notStrictEqual(restored, loader);
    assert.equal(restored.workerConfig.dxtSupported, false);
    assert.equal(restored.transcoderPending, null);
    assert.equal(fetch.mock.callCount(), 1);
  } finally {
    owner.release(restored);
  }
});

test('CSP-safe KTX2 loader uses an external worker and drains worker failures', async () => {
  const workerMessages = [];
  let workerCreator = null;
  let poolDisposed = 0;
  const wasm = Uint8Array.from([2, 4, 6, 8]).buffer;
  const fetches = [];

  class FakeMessageEvent {
    constructor(type, init) { this.type = type; this.data = init.data; }
  }
  class FakeWorker {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.posts = [];
      this.terminated = false;
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    dispatchEvent(event) {
      for (const listener of this.listeners.get(event.type) || []) listener(event);
      return true;
    }
    postMessage(message, transfer) { this.posts.push({ message, transfer }); }
    terminate() { this.terminated = true; }
  }

  const loader = {
    transcoderPath: ASSET_RUNTIME_DECODER_CONTRACT.ktx2TranscoderPath,
    workerConfig: Object.freeze({ dxtSupported: true }),
    workerPool: {
      setWorkerCreator(create) { workerCreator = create; },
      dispose() { poolDisposed += 1; },
    },
  };
  configureCspSafeKtx2Loader(loader, {
    fetchImpl: async (url) => {
      fetches.push(url);
      return { ok: true, arrayBuffer: async () => wasm };
    },
    WorkerImpl: FakeWorker,
    MessageEventImpl: FakeMessageEvent,
  });

  assert.equal(loader.transcoderPending, null, 'transcoder fetch stays lazy until first texture');
  const firstInit = loader.init();
  assert.strictEqual(loader.init(), firstInit, 'concurrent texture loads share one transcoder init');
  await firstInit;
  assert.deepEqual(fetches, [`${ASSET_RUNTIME_DECODER_CONTRACT.ktx2TranscoderPath}basis_transcoder.wasm`]);

  const worker = workerCreator();
  assert.equal(worker.url, ASSET_RUNTIME_DECODER_CONTRACT.ktx2WorkerPath);
  assert.equal(worker.posts.length, 1);
  assert.equal(worker.posts[0].message.type, 'init');
  assert.deepEqual(worker.posts[0].message.config, loader.workerConfig);
  assert.notStrictEqual(worker.posts[0].message.transcoderBinary, wasm, 'each worker owns a transferable copy');

  worker.addEventListener('message', (event) => workerMessages.push(event.data));
  let prevented = false;
  worker.dispatchEvent({
    type: 'error',
    message: 'worker CSP failure',
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(worker.terminated, true);
  assert.deepEqual(workerMessages.at(-1), {
    type: 'error',
    error: 'worker CSP failure',
    data: {},
  });

  worker.postMessage({ type: 'transcode' });
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(workerMessages.length, 2, 'queued work rejects after a worker startup failure');

  loader.dispose();
  loader.dispose();
  assert.equal(poolDisposed, 1);
});
