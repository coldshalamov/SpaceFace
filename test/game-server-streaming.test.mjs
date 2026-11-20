import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { createGameServer } = require('../scripts/lib/gameServer.cjs');

const ELECTRON_MAIN = new URL('../electron/main.cjs', import.meta.url);

test('Electron serves packaged assets without synchronous filesystem admission', async () => {
  const source = await readFile(ELECTRON_MAIN, 'utf8');
  const serverOptions = source.match(/createGameServer\s*\(\s*\{[\s\S]*?\}\s*\)/)?.[0] || '';

  assert.match(serverOptions, /async\s*:\s*true\b/, 'packaged Electron must use asynchronous filesystem metadata reads');
  assert.doesNotMatch(serverOptions, /async\s*:\s*false\b/);
});

test('game server streams a large runtime asset without whole-file readFile staging', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-game-server-stream-'));
  const asset = join(root, 'render.glb');
  const payload = Buffer.allocUnsafe(2 * 1024 * 1024 + 37);
  for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
  await writeFile(asset, payload);
  t.after(() => rm(root, { recursive: true, force: true }));

  const target = resolve(asset);
  const originalReadFileSync = fs.readFileSync;
  const originalReadFile = fsp.readFile;
  fs.readFileSync = function guardedReadFileSync(file, ...args) {
    if (resolve(String(file)) === target) throw new Error('whole-file sync staging forbidden');
    return originalReadFileSync.call(this, file, ...args);
  };
  fsp.readFile = async function guardedReadFile(file, ...args) {
    if (resolve(String(file)) === target) throw new Error('whole-file async staging forbidden');
    return originalReadFile.call(this, file, ...args);
  };
  t.after(() => {
    fs.readFileSync = originalReadFileSync;
    fsp.readFile = originalReadFile;
  });

  const server = createGameServer({ root, async: false, devDiagnostics: false });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/render.glb`);
  const received = Buffer.from(await response.arrayBuffer());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(response.headers.get('content-length'), String(payload.length));
  assert.deepEqual(received, payload);
});

test('game server answers single video GET byte ranges and preserves full GET and HEAD', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-game-server-range-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = '0123456789';
  await Promise.all(['movie.mp4', 'movie.webm', 'payload.glb'].map((file) => writeFile(join(root, file), payload)));
  const server = createGameServer({ root, async: true, devDiagnostics: false });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  const url = `http://127.0.0.1:${server.address().port}`;

  for (const [file, range, body, contentRange] of [
    ['movie.mp4', 'bytes=0-', payload, 'bytes 0-9/10'],
    ['movie.mp4', 'bytes=3-6', '3456', 'bytes 3-6/10'],
    ['movie.webm', 'bytes=-3', '789', 'bytes 7-9/10'],
    ['movie.webm', 'bytes=8-99', '89', 'bytes 8-9/10'],
  ]) {
    const response = await fetch(`${url}/${file}`, { headers: { range } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('content-range'), contentRange);
    assert.equal(response.headers.get('content-length'), String(body.length));
    assert.equal(await response.text(), body);
  }

  const missing = await fetch(`${url}/movie.mp4`, { headers: { range: 'bytes=10-' } });
  assert.equal(missing.status, 416);
  assert.equal(missing.headers.get('content-range'), 'bytes */10');
  assert.equal(await missing.text(), '');

  for (const [file, options, body] of [
    ['movie.mp4', {}, payload],
    ['movie.mp4', { method: 'HEAD', headers: { range: 'bytes=3-6' } }, ''],
    ['movie.mp4', { headers: { range: 'bytes=3-6', 'if-range': '"unmatched"' } }, payload],
    ['movie.mp4', { headers: { range: 'bytes=0-1,4-6' } }, payload],
    ['payload.glb', { headers: { range: 'bytes=3-6' } }, payload],
  ]) {
    const response = await fetch(`${url}/${file}`, options);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-range'), null);
    assert.equal(response.headers.get('content-length'), String(payload.length));
    assert.equal(await response.text(), body);
  }
});

test('game server can isolate a worker CSP without widening the game document', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-game-server-csp-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>SpaceFace</title>');
  await writeFile(join(root, 'basis.worker.js'), 'self.onmessage = () => {};');
  t.after(() => rm(root, { recursive: true, force: true }));

  const pageCsp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';";
  const workerCsp = "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval';";
  const server = createGameServer({
    root,
    async: true,
    devDiagnostics: false,
    staticHeaders: { 'Content-Security-Policy': pageCsp },
    staticHeadersByPath: {
      'basis.worker.js': { 'Content-Security-Policy': workerCsp },
    },
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const [page, worker] = await Promise.all([fetch(`${baseUrl}/`), fetch(`${baseUrl}/basis.worker.js`)]);
  assert.equal(page.headers.get('content-security-policy'), pageCsp);
  assert.equal(worker.headers.get('content-security-policy'), workerCsp);
  assert.doesNotMatch(page.headers.get('content-security-policy'), /'unsafe-eval'/);
});
