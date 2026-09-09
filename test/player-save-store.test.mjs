import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applySharedStoreKeys,
  envelopeTime,
  isSharedPlayerStoreKey,
  mergeSharedStoreKeys,
  sharedPlayerStoreAvailable,
} from '../src/save/sharedPlayerStore.js';

const require = createRequire(import.meta.url);
const {
  PLAYER_STORE_ROUTE,
  isAllowedPlayerStoreKey,
  playerStoreHasSaves,
  readPlayerStoreKeysSync,
  resolveMountedPlayerStoreDir,
  resolvePlayerSaveDir,
  writePlayerStoreKeysSync,
} = require('../scripts/lib/playerSaveStore.cjs');
const { createGameServer } = require('../scripts/lib/gameServer.cjs');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function envelope(slot, savedAt, playtimeS = 10) {
  return JSON.stringify({
    fmt: 'spaceface-save',
    version: 11,
    savedAt,
    playtimeS,
    slot,
    checksum: 'abc',
    data: {},
  });
}

test('player store directory honors the launcher override', () => {
  const override = path.join(tmpdir(), 'spaceface-player-store-override');
  const dir = resolvePlayerSaveDir({ SPACEFACE_PLAYER_STORE_DIR: override });
  assert.equal(dir, path.resolve(override));
});

test('an explicit empty player-store override unmounts instead of falling through to AppData', () => {
  assert.equal(resolveMountedPlayerStoreDir({ SPACEFACE_PLAYER_STORE_DIR: '' }), '');
  assert.equal(resolveMountedPlayerStoreDir({ SPACEFACE_PLAYER_STORE_DIR: '   ' }), '');
  const override = path.join(tmpdir(), 'spaceface-player-store-mounted');
  assert.equal(
    resolveMountedPlayerStoreDir({ SPACEFACE_PLAYER_STORE_DIR: override }),
    path.resolve(override),
  );
  const fallback = resolveMountedPlayerStoreDir({ APPDATA: path.join(tmpdir(), 'appdata') });
  assert.match(fallback.replace(/\\/g, '/'), /SpaceFace\/player-saves$/);
});

test('allowed keys are the live save, recovery, and profile slots', () => {
  assert.equal(isAllowedPlayerStoreKey('sf.save.auto'), true);
  assert.equal(isAllowedPlayerStoreKey('sf.save.index'), true);
  assert.equal(isAllowedPlayerStoreKey('sf.recovery.quick'), true);
  assert.equal(isAllowedPlayerStoreKey('sf.settings.profile.v1'), true);
  assert.equal(isSharedPlayerStoreKey('sf.save.quick'), true);
  assert.equal(isAllowedPlayerStoreKey('sf.save../etc/passwd'), false);
  assert.equal(isAllowedPlayerStoreKey('evil'), false);
});

test('disk store round-trips and deletes slots', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'spaceface-player-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const older = envelope('auto', '2026-01-01T00:00:00.000Z', 8);
  const newer = envelope('auto', '2026-08-14T00:00:00.000Z', 40);
  writePlayerStoreKeysSync(dir, { 'sf.save.auto': older, 'sf.save.index': '{"auto":{}}' });
  assert.equal(playerStoreHasSaves(dir), true);
  writePlayerStoreKeysSync(dir, { 'sf.save.auto': newer });
  assert.equal(readPlayerStoreKeysSync(dir)['sf.save.auto'], newer);
  writePlayerStoreKeysSync(dir, { 'sf.save.auto': null });
  assert.equal(readPlayerStoreKeysSync(dir)['sf.save.auto'], undefined);
  assert.equal(playerStoreHasSaves(dir), false);
});

test('newer envelopes win when merging shell copies', () => {
  const local = {
    'sf.save.auto': envelope('auto', '2026-08-01T00:00:00.000Z', 20),
    'sf.save.index': JSON.stringify({ auto: { savedAt: '2026-08-01T00:00:00.000Z' } }),
  };
  const remote = {
    'sf.save.auto': envelope('auto', '2026-08-14T00:00:00.000Z', 90),
    'sf.save.quick': envelope('quick', '2026-07-01T00:00:00.000Z', 5),
    'sf.save.index': JSON.stringify({
      auto: { savedAt: '2026-08-14T00:00:00.000Z' },
      quick: { savedAt: '2026-07-01T00:00:00.000Z' },
    }),
  };
  const merged = mergeSharedStoreKeys(local, remote);
  assert.equal(envelopeTime(merged['sf.save.auto']), Date.parse('2026-08-14T00:00:00.000Z'));
  assert.ok(merged['sf.save.quick']);
  const index = JSON.parse(merged['sf.save.index']);
  assert.equal(index.auto.savedAt, '2026-08-14T00:00:00.000Z');
  assert.equal(index.quick.savedAt, '2026-07-01T00:00:00.000Z');
});

test('applying merged keys writes only allowed slots', () => {
  const storage = new Map();
  const fake = {
    length: 0,
    key() { return null; },
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  };
  applySharedStoreKeys({
    'sf.save.auto': envelope('auto', '2026-08-14T00:00:00.000Z'),
    nope: 'ignore',
  }, fake);
  assert.equal(storage.has('sf.save.auto'), true);
  assert.equal(storage.has('nope'), false);
});

test('the shared store client stays inert without a page origin', () => {
  assert.equal(sharedPlayerStoreAvailable(), false);
});

test('two game servers sharing a store directory see the same slots', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'spaceface-player-store-http-'));
  const web = await mkdtemp(path.join(tmpdir(), 'spaceface-player-store-web-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  t.after(() => rm(web, { recursive: true, force: true }));

  const payload = envelope('quick', '2026-08-14T12:00:00.000Z', 120);
  const servers = [0, 1].map(() => createGameServer({
    root: web,
    async: true,
    devDiagnostics: false,
    playerStoreDir: dir,
  }));
  const ports = [];
  for (const server of servers) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    ports.push(server.address().port);
  }

  const put = await fetch(`http://127.0.0.1:${ports[0]}${PLAYER_STORE_ROUTE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: { 'sf.save.quick': payload } }),
  });
  assert.equal(put.status, 200);

  const get = await fetch(`http://127.0.0.1:${ports[1]}${PLAYER_STORE_ROUTE}`);
  assert.equal(get.status, 200);
  const body = await get.json();
  assert.equal(body.keys['sf.save.quick'], payload);
});

test('a store-less server does not expose player saves', async (t) => {
  const web = path.join(ROOT, 'index.html');
  const server = createGameServer({
    root: path.dirname(web),
    async: true,
    devDiagnostics: false,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}${PLAYER_STORE_ROUTE}`);
  assert.equal(response.status, 404);
});
