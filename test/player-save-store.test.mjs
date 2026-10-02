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
  fetchSharedPlayerStore,
  isSharedPlayerStoreKey,
  mergeSharedStoreKeys,
  pushSharedPlayerStore,
  resetSharedPlayerStoreMemoForTests,
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

function tombstone(slot, deletedAt, prefix = 'sf.save.deleted.') {
  return { key: prefix + slot, value: JSON.stringify({ slot, deletedAt }) };
}

test('a deletion tombstone keeps a stale remote save from resurrecting the slot', () => {
  // The deleting shell removed sf.save.1 + the index row and recorded a tombstone; the store
  // still holds the old envelope and index (offline delete or a second shell that never saw it).
  const del = tombstone('1', '2026-08-15T00:00:00.000Z');
  const rec = tombstone('1', '2026-08-15T00:00:00.000Z', 'sf.recovery.deleted.');
  const local = {
    [del.key]: del.value,
    [rec.key]: rec.value,
    'sf.save.index': JSON.stringify({ quick: { savedAt: '2026-08-01T00:00:00.000Z' } }),
  };
  const remote = {
    'sf.save.1': envelope('1', '2026-08-10T00:00:00.000Z', 60),
    'sf.recovery.1': envelope('1', '2026-08-09T00:00:00.000Z', 55),
    'sf.save.index': JSON.stringify({
      '1': { savedAt: '2026-08-10T00:00:00.000Z' },
      quick: { savedAt: '2026-08-01T00:00:00.000Z' },
    }),
  };
  const merged = mergeSharedStoreKeys(local, remote);
  assert.equal(merged['sf.save.1'], undefined, 'stale primary must not be resurrected');
  assert.equal(merged['sf.recovery.1'], undefined, 'stale recovery must not be resurrected');
  assert.equal(merged[del.key], del.value, 'the tombstone itself must propagate');
  const index = JSON.parse(merged['sf.save.index']);
  assert.equal(index['1'], undefined, 'the index row must be scrubbed');
  assert.ok(index.quick, 'untouched slots stay');
});

test('a remote tombstone prunes the stale copy this shell still holds', () => {
  // Second shell still has the slot locally; the deleting shell's tombstone arrives via the store.
  const del = tombstone('2', '2026-08-15T00:00:00.000Z');
  const local = {
    'sf.save.2': envelope('2', '2026-08-10T00:00:00.000Z', 30),
  };
  const remote = { [del.key]: del.value };
  const merged = mergeSharedStoreKeys(local, remote);
  assert.equal(merged['sf.save.2'], undefined);

  const storage = new Map(Object.entries(local));
  const fake = {
    get length() { return storage.size; },
    key(i) { return [...storage.keys()][i] ?? null; },
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  applySharedStoreKeys(merged, fake);
  assert.equal(storage.has('sf.save.2'), false, 'apply must remove the tombstone-covered local copy');
  assert.equal(storage.get(del.key), del.value, 'the tombstone is stored locally');
});

test('a save newer than the tombstone survives — deleting then re-using a slot stays clean', () => {
  const del = tombstone('3', '2026-08-15T00:00:00.000Z');
  const local = { [del.key]: del.value };
  const remote = { 'sf.save.3': envelope('3', '2026-08-20T00:00:00.000Z', 90) };
  const merged = mergeSharedStoreKeys(local, remote);
  assert.equal(merged['sf.save.3'], remote['sf.save.3'], 'post-delete save wins the tombstone');
});

test('a recovery-only eviction tombstone never touches the live primary', () => {
  // Quota pressure evicts sf.recovery.* insurance copies while primaries stay live. The tombstone
  // must scope to the recovery key only.
  const rec = tombstone('4', '2026-08-15T00:00:00.000Z', 'sf.recovery.deleted.');
  const local = {
    'sf.save.4': envelope('4', '2026-08-01T00:00:00.000Z', 10),
    [rec.key]: rec.value,
    'sf.save.index': JSON.stringify({ '4': { savedAt: '2026-08-01T00:00:00.000Z' } }),
  };
  const remote = { 'sf.recovery.4': envelope('4', '2026-07-01T00:00:00.000Z', 5) };
  const merged = mergeSharedStoreKeys(local, remote);
  assert.equal(merged['sf.recovery.4'], undefined, 'evicted recovery stays deleted');
  assert.equal(merged['sf.save.4'], local['sf.save.4'], 'the primary is not covered');
  assert.ok(JSON.parse(merged['sf.save.index'])['4'], 'the index row survives a recovery-only tombstone');
});

test('a null patch records a tombstone locally and in the PUT body', async (t) => {
  const realFetch = globalThis.fetch;
  const hadLocation = Object.hasOwn(globalThis, 'location');
  const realLocation = globalThis.location;
  const hadStorage = Object.hasOwn(globalThis, 'localStorage');
  const realStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.location = { protocol: 'http:' };
  globalThis.localStorage = {
    get length() { return storage.size; },
    key(i) { return [...storage.keys()][i] ?? null; },
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  t.after(() => {
    globalThis.fetch = realFetch;
    if (hadLocation) globalThis.location = realLocation;
    else delete globalThis.location;
    if (hadStorage) globalThis.localStorage = realStorage;
    else delete globalThis.localStorage;
    resetSharedPlayerStoreMemoForTests();
  });
  resetSharedPlayerStoreMemoForTests();

  let body = null;
  globalThis.fetch = async (url, opts) => {
    body = JSON.parse(opts.body);
    return { ok: true, status: 200 };
  };
  // This is exactly the patch saveSystem.deleteSlot queues for the mirror.
  const ok = await pushSharedPlayerStore({
    'sf.save.1': null,
    'sf.recovery.1': null,
    'sf.save.index': '{}',
  });
  assert.equal(ok, true);
  assert.equal(body.keys['sf.save.1'], null, 'the deletion still goes to the store');
  assert.equal(body.keys['sf.recovery.1'], null);
  assert.ok(envelopeTime(body.keys['sf.save.deleted.1']) > 0, 'PUT carries the primary tombstone');
  assert.ok(envelopeTime(body.keys['sf.recovery.deleted.1']) > 0, 'PUT carries the recovery tombstone');
  assert.equal(storage.has('sf.save.deleted.1'), true, 'tombstone is durable locally even if the PUT had failed');
  assert.equal(storage.has('sf.recovery.deleted.1'), true);
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

test('a 404 store route is memoized for the session; other failures retry', async (t) => {
  // PQ-033.02: every save/load on a store-less server paid a doomed round trip (and a
  // console error) per call — ~4 per soak cycle. A 404 is definitive; anything else
  // (500, network drop) must keep retrying.
  const realFetch = globalThis.fetch;
  const hadLocation = Object.hasOwn(globalThis, 'location');
  const realLocation = globalThis.location;
  globalThis.location = { protocol: 'http:' };
  t.after(() => {
    globalThis.fetch = realFetch;
    if (hadLocation) globalThis.location = realLocation;
    else delete globalThis.location;
    resetSharedPlayerStoreMemoForTests();
  });
  resetSharedPlayerStoreMemoForTests();

  let calls = 0;
  let status = 404;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: status >= 200 && status < 300, status, json: async () => ({ keys: {} }) };
  };
  assert.equal(await fetchSharedPlayerStore(), null);
  assert.equal(await fetchSharedPlayerStore(), null);
  assert.equal(await pushSharedPlayerStore({ 'sf.save.auto': 'x' }), false);
  assert.equal(calls, 1, 'one 404 memoizes the absent route for fetch and push');

  resetSharedPlayerStoreMemoForTests();
  calls = 0;
  assert.equal(await pushSharedPlayerStore({ 'sf.save.auto': 'x' }), false);
  assert.equal(await fetchSharedPlayerStore(), null);
  assert.equal(calls, 1, 'a push-side 404 memoizes the route for fetch too');

  resetSharedPlayerStoreMemoForTests();
  status = 500;
  calls = 0;
  assert.equal(await fetchSharedPlayerStore(), null);
  assert.equal(await fetchSharedPlayerStore(), null);
  assert.equal(calls, 2, 'a 500 is transient: every call retries');

  resetSharedPlayerStoreMemoForTests();
  calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('offline'); };
  assert.equal(await fetchSharedPlayerStore(), null);
  assert.equal(await fetchSharedPlayerStore(), null);
  assert.equal(calls, 2, 'a network failure is transient: every call retries');
});

test('a hung mirror PUT carries its own deadline and settles false on abort', async (t) => {
  // The PUT had no abort signal at all: a store route that accepts the connection but never
  // answers kept isSharedStoreSyncPending() true forever, pinning Continue at "Checking saves…"
  // despite durable local saves. Both store calls must run under the same finite deadline.
  const realFetch = globalThis.fetch;
  const realTimeout = AbortSignal.timeout;
  const hadLocation = Object.hasOwn(globalThis, 'location');
  const realLocation = globalThis.location;
  globalThis.location = { protocol: 'http:' };
  t.after(() => {
    globalThis.fetch = realFetch;
    AbortSignal.timeout = realTimeout;
    if (hadLocation) globalThis.location = realLocation;
    else delete globalThis.location;
    resetSharedPlayerStoreMemoForTests();
  });
  resetSharedPlayerStoreMemoForTests();

  const controller = new AbortController();
  const deadlines = [];
  AbortSignal.timeout = (ms) => { deadlines.push(ms); return controller.signal; };
  globalThis.fetch = (url, opts = {}) => new Promise((_, reject) => {
    const fail = () => reject(new Error('store mirror timed out'));
    if (opts.signal && opts.signal.aborted) fail();
    else if (opts.signal) opts.signal.addEventListener('abort', fail, { once: true });
    // No signal → the request hangs forever, exactly like the unbounded PUT this fixes.
  });

  const put = pushSharedPlayerStore({ 'sf.save.auto': envelope('auto', '2026-08-14T00:00:00.000Z') });
  // fetch is invoked before push's first await suspends, so the deadline request is visible now.
  assert.deepEqual(deadlines, [10000], 'the mirror PUT must request the finite 10s deadline');
  controller.abort();
  assert.equal(await put, false, 'an aborted PUT reports failure instead of hanging forever');
});

test('keepalive is only requested when the UTF-8 body fits the Chromium budget', async (t) => {
  const realFetch = globalThis.fetch;
  const hadLocation = Object.hasOwn(globalThis, 'location');
  const realLocation = globalThis.location;
  globalThis.location = { protocol: 'http:' };
  t.after(() => {
    globalThis.fetch = realFetch;
    if (hadLocation) globalThis.location = realLocation;
    else delete globalThis.location;
    resetSharedPlayerStoreMemoForTests();
  });
  resetSharedPlayerStoreMemoForTests();

  const seen = [];
  globalThis.fetch = async (url, opts) => {
    seen.push(opts.keepalive);
    return { ok: true, status: 200 };
  };

  assert.equal(await pushSharedPlayerStore({ 'sf.save.auto': 'x' }, { keepalive: true }), true);
  assert.equal(seen.at(-1), true, 'a small ASCII body still earns keepalive');

  await pushSharedPlayerStore({ 'sf.save.auto': 'x'.repeat(60100) }, { keepalive: true });
  assert.equal(seen.at(-1), false, 'an oversized body goes as a plain PUT');

  // A serialized string's .length counts UTF-16 units; the quota counts UTF-8 bytes. é is one
  // unit but two bytes, so a body whose length admits keepalive can still exceed the cap.
  const nonAscii = { 'sf.save.auto': 'é'.repeat(59900) };
  const bodyLength = JSON.stringify({ keys: nonAscii }).length;
  assert(bodyLength < 60000 && new TextEncoder().encode(JSON.stringify({ keys: nonAscii })).byteLength > 60000,
    'fixture must sit below the budget in code units but above it in bytes');
  await pushSharedPlayerStore(nonAscii, { keepalive: true });
  assert.equal(seen.at(-1), false, 'non-ASCII save names must be measured in UTF-8 bytes');
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
