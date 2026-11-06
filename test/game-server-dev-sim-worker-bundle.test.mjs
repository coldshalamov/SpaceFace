import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createGameServer, sourceOverlayDigest } = require('../scripts/lib/gameServer.cjs');
const WORKER_PATH = '/src/core/wholeSimBrowserWorker.js';

async function listenServer(t, opts) {
  const server = createGameServer(opts);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-game-server-dev-sim-worker-'));
  await mkdir(join(root, 'src', 'core'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>SpaceFace</title>');
  await writeFile(join(root, 'src', 'core', 'wholeSimBrowserWorker.js'), 'raw-source-worker');
  return root;
}

function sourceOverlay(content) {
  const bytes = Buffer.from(content);
  const file = {
    path: 'src/core/wholeSimBrowserWorker.js',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  return {
    schema: 'spaceface.sourceBaseline.v1',
    sourceCommit: 'a'.repeat(40),
    files: [{ ...file, contentBase64: bytes.toString('base64') }],
    sourceOverlayDigest: sourceOverlayDigest([file]),
  };
}

test('opt-in worker URL serves the current bundle for GET and HEAD with exact identity', async (t) => {
  const root = await fixtureRoot();
  const bundle = Buffer.from('bundled-source-worker-bytes');
  const digest = createHash('sha256').update(bundle).digest('hex');
  let calls = 0;
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = await listenServer(t, {
    root,
    async: true,
    devDiagnostics: false,
    devSimWorkerBundleProvider: {
      async getBundle() {
        calls += 1;
        return { bytes: bundle, digest };
      },
    },
  });

  const get = await fetch(`${base}${WORKER_PATH}?worker=module`);
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('cache-control'), 'no-store');
  assert.equal(get.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(get.headers.get('content-length'), String(bundle.length));
  assert.equal(get.headers.get('etag'), `"sf-dev-sim-${digest}"`);
  assert.equal(get.headers.get('x-spaceface-dev-sim-worker-digest'), digest);
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), bundle);

  const head = await fetch(`${base}${WORKER_PATH}`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('cache-control'), 'no-store');
  assert.equal(head.headers.get('content-length'), String(bundle.length));
  assert.equal(head.headers.get('x-spaceface-dev-sim-worker-digest'), digest);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(calls, 2);
});

test('default, source-overlay, and immutable routes bypass the dev bundle provider', async (t) => {
  const root = await fixtureRoot();
  let calls = 0;
  t.after(() => rm(root, { recursive: true, force: true }));
  const provider = { async getBundle() { calls += 1; return { bytes: Buffer.from('must-not-serve'), digest: 'b'.repeat(64) }; } };

  const defaultBase = await listenServer(t, { root, async: true, devDiagnostics: false });
  const defaultSource = await fetch(`${defaultBase}${WORKER_PATH}`);
  assert.equal(defaultSource.status, 200);
  assert.equal(await defaultSource.text(), 'raw-source-worker');

  const overlayBase = await listenServer(t, {
    root,
    async: true,
    devDiagnostics: false,
    sourceOverlay: sourceOverlay('pinned-overlay-worker'),
    devSimWorkerBundleProvider: provider,
  });
  const overlay = await fetch(`${overlayBase}${WORKER_PATH}`);
  assert.equal(overlay.status, 200);
  assert.equal(await overlay.text(), 'pinned-overlay-worker');

  const immutableBase = await listenServer(t, {
    root,
    async: true,
    devDiagnostics: false,
    appSourceImmutable: true,
    devSimWorkerBundleProvider: provider,
  });
  const immutable = await fetch(`${immutableBase}${WORKER_PATH}`);
  assert.equal(immutable.status, 200);
  assert.equal(await immutable.text(), 'raw-source-worker');
  assert.equal(calls, 0);
});

test('failed current bundle request returns explicit 503 without raw-source fallback', async (t) => {
  const root = await fixtureRoot();
  const originalConsoleError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalConsoleError;
    return rm(root, { recursive: true, force: true });
  });
  const base = await listenServer(t, {
    root,
    async: true,
    devDiagnostics: false,
    devSimWorkerBundleProvider: {
      async getBundle() { throw new Error('current build failed'); },
    },
  });
  const response = await fetch(`${base}${WORKER_PATH}`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /Dev sim worker bundle unavailable/);
});
