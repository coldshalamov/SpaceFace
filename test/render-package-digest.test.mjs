import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createRenderPackageDigester, sha256HexOnCallingThread } from '../src/render/renderPackageDigest.js';

const sample = (length = 4096, seed = 31) => Uint8Array.from({ length }, (_, i) => (i * seed) & 0xff);
const expectedHex = (bytes) => createHash('sha256').update(bytes).digest('hex');

function spyCrypto() {
  const spy = { calls: 0 };
  spy.subtle = {
    digest: (...args) => {
      spy.calls += 1;
      return globalThis.crypto.subtle.digest(...args);
    },
  };
  return spy;
}

class EventTargetWorker {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.listeners = new Map();
    this.terminated = false;
    EventTargetWorker.created += 1;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  terminate() { this.terminated = true; }
}
EventTargetWorker.created = 0;

// Runs the real worker file against Node's Web Crypto, delivering messages asynchronously as a Worker does.
class FileWorker extends EventTargetWorker {
  constructor(url, options) {
    super(url, options);
    const source = readFileSync(new URL('../src/render/renderPackageDigestWorker.js', import.meta.url), 'utf8');
    const scope = {
      crypto: globalThis.crypto,
      addEventListener: (type, listener) => { if (type === 'message') this.onWorkerMessage = listener; },
      postMessage: (data) => queueMicrotask(() => this.emit('message', { data })),
    };
    new Function('self', source)(scope);
    this.transfers = [];
  }

  postMessage(data, transfer) {
    this.transfers.push(transfer);
    queueMicrotask(() => this.onWorkerMessage({ data }));
  }
}

test('the worker hashes render packages to the same digest, and the caller keeps its bytes', async () => {
  const crypto = spyCrypto();
  const digester = createRenderPackageDigester({ WorkerImpl: FileWorker, workerUrl: 'digest-worker.js', cryptoImpl: crypto });
  const first = sample();
  const second = sample(70_000, 7);

  const [firstHex, secondHex] = await Promise.all([digester.sha256Hex(first), digester.sha256Hex(second)]);

  assert.equal(firstHex, expectedHex(first));
  assert.equal(secondHex, expectedHex(second));
  assert.equal(crypto.calls, 0, 'no hashing on the calling thread');
  assert.equal(first.byteLength, 4096, 'the caller\'s buffer is not transferred away');
  assert.equal(second.byteLength, 70_000);
  assert.equal(digester.usingWorker, true);
  digester.dispose();
});

test('a failing worker hands every waiting hash back to the calling thread and is not used again', async () => {
  class FailingWorker extends EventTargetWorker {
    postMessage() {
      queueMicrotask(() => this.emit('error', { message: 'blocked by policy', preventDefault() {} }));
    }
  }
  EventTargetWorker.created = 0;
  const crypto = spyCrypto();
  const digester = createRenderPackageDigester({ WorkerImpl: FailingWorker, workerUrl: 'digest-worker.js', cryptoImpl: crypto });
  const a = sample(1000, 3);
  const b = sample(2000, 5);

  const hashes = await Promise.all([digester.sha256Hex(a), digester.sha256Hex(b)]);
  assert.deepEqual(hashes, [expectedHex(a), expectedHex(b)]);
  assert.equal(crypto.calls, 2);

  const c = sample(3000, 9);
  assert.equal(await digester.sha256Hex(c), expectedHex(c));
  assert.equal(crypto.calls, 3);
  assert.equal(EventTargetWorker.created, 1, 'a failed worker is not recreated');
  assert.equal(digester.usingWorker, false);
});

test('a worker that reports an error or never answers falls back to the calling thread', async () => {
  class ErrorReplyWorker extends EventTargetWorker {
    postMessage(data) {
      queueMicrotask(() => this.emit('message', { data: { id: data.id, error: 'digest unsupported' } }));
    }
  }
  class SilentWorker extends EventTargetWorker {
    postMessage() {}
  }
  const bytes = sample(512, 11);

  const replied = createRenderPackageDigester({ WorkerImpl: ErrorReplyWorker, workerUrl: 'w.js', cryptoImpl: spyCrypto() });
  assert.equal(await replied.sha256Hex(bytes), expectedHex(bytes));

  const silent = createRenderPackageDigester({ WorkerImpl: SilentWorker, workerUrl: 'w.js', cryptoImpl: spyCrypto(), timeoutMs: 20 });
  assert.equal(await silent.sha256Hex(bytes), expectedHex(bytes));
  silent.dispose();
});

test('without Web Workers the calling thread hashes, with the loader\'s error when Web Crypto is missing', async () => {
  const bytes = sample(256, 13);
  const digester = createRenderPackageDigester({ WorkerImpl: undefined });
  assert.equal(await digester.sha256Hex(bytes), expectedHex(bytes));
  assert.equal(digester.usingWorker, false);
  await assert.rejects(() => sha256HexOnCallingThread(bytes, {}), /Web Crypto SHA-256 is required to verify render packages/);
});

test('the render package loader verifies GLB bytes through the worker digester', () => {
  const source = readFileSync(new URL('../src/render/renderPackageLoader.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ createRenderPackageDigester \} from '\.\/renderPackageDigest\.js';/);
  assert.match(source, /renderPackageDigester \|\|= createRenderPackageDigester\(\);\s*return renderPackageDigester\.sha256Hex\(bytes\);/);
  assert.doesNotMatch(source, /globalThis\.crypto\.subtle\.digest\('SHA-256'/, 'no direct main-thread GLB digest left');
});
