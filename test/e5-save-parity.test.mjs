// §22 E5 — browser and Electron read and write the same save.
//
// Both shells share one loopback player store: the browser client
// (src/save/sharedPlayerStore.js, over HTTP) and the Electron shell
// (scripts/lib/playerSaveStore.cjs, direct to the same directory) must see
// each other's writes byte-identical, in both directions.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  fetchSharedPlayerStore,
  pushSharedPlayerStore,
  resetSharedPlayerStoreMemoForTests,
} from '../src/save/sharedPlayerStore.js';

const require = createRequire(import.meta.url);
const {
  readPlayerStoreKeysSync,
  writePlayerStoreKeysSync,
} = require('../scripts/lib/playerSaveStore.cjs');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('game server never came up');
    await new Promise((r) => setTimeout(r, 150));
  }
}

test('browser client and Electron lib share one save through the loopback store', { timeout: 120_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-e5-parity-'));
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: 'ignore',
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: dir },
  });
  // The browser resolves the store path against the page origin; give node fetch
  // the same base. Both are restored in the finally below.
  const realFetch = globalThis.fetch;
  const realLocation = globalThis.location;
  const origin = `http://127.0.0.1:${port}/`;
  globalThis.fetch = (url, init) => realFetch(new URL(String(url), origin), init);
  globalThis.location = { protocol: 'http:' };
  resetSharedPlayerStoreMemoForTests();
  try {
    await waitForServer(port);
    const fromBrowser = JSON.stringify({ fmt: 'spaceface-save', v: 1, shell: 'browser', credits: 4242 });
    const fromElectron = JSON.stringify({ fmt: 'spaceface-save', v: 1, shell: 'electron', credits: 8008 });

    // Browser writes over HTTP; Electron reads the same directory direct.
    assert.equal(await pushSharedPlayerStore({ 'sf.save.e5slot': fromBrowser }), true);
    const electronRead = readPlayerStoreKeysSync(dir);
    assert.equal(electronRead['sf.save.e5slot'], fromBrowser);

    // Electron writes direct; the browser reads it back over HTTP.
    writePlayerStoreKeysSync(dir, { 'sf.save.e5slot': fromElectron });
    const browserRead = await fetchSharedPlayerStore();
    assert.ok(browserRead, 'browser fetch returned no keys');
    assert.equal(browserRead['sf.save.e5slot'], fromElectron);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.location = realLocation;
    resetSharedPlayerStoreMemoForTests();
    server.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
