import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createKtx2TranscoderWorkerSource } from '../scripts/build-ktx2-transcoder-worker.mjs';
import {
  ASSET_RUNTIME_DECODER_CONTRACT,
  configureCspSafeKtx2Loader,
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
