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
