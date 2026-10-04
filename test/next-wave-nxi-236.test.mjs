// NXI-236 — the shared store result names the actual accepted save generation.
//
// The store route applies per-key last-writer-wins, so two pushes in flight used to be able to
// settle in either order: an older patch landing last wrote the older snapshot over the newer
// one, and every later merge labeled that older envelope the latest successful save. Pinned here:
//   1. two pushes of the same slot settle strictly in request order (no overlapping PUTs) and
//      the store ends holding the NEWER envelope; the module's accepted-generation ledger names
//      the newer stamp, not the one that happened to land last;
//   2. a keepalive-budget push (the dying-page path, still fired immediately) with an older
//      envelope cannot drag the accepted-generation label backwards after a newer queued write;
//   3. neighboring success — an ordinary mirror push still lands byte-for-byte and reports ok,
//      the ledger is null before any write, and the test reset clears it.
//
// Harness: the save-shared-continuation pattern — real writePlayerStoreKeysSync behind a fetch
// stub, so the bytes on "disk" are the bytes the HTTP handler would write.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  SHARED_PLAYER_STORE_PATH,
  pushSharedPlayerStore,
  sharedPlayerStoreLastAcceptedWrite,
  resetSharedPlayerStoreMemoForTests,
} from '../src/save/sharedPlayerStore.js';

const require = createRequire(import.meta.url);
const { writePlayerStoreKeysSync, readPlayerStoreKeysSync } = require('../scripts/lib/playerSaveStore.cjs');

const OLDER = '2026-10-03T10:00:00.000Z';
const NEWER = '2026-10-03T11:00:00.000Z';

function envelope(savedAt, marker) {
  return JSON.stringify({ fmt: 'sf.save.v1', savedAt, updatedAt: savedAt, data: { marker } });
}

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

// Install globalThis localStorage/location/fetch; the fetch stub routes PUTs to the real writer
// and can delay a named marker so an older push is still in flight when the newer one starts.
function withLoopback(storeDir, { delayMarker = null, delayMs = 40, events = [] } = {}) {
  const previous = {
    localStorage: globalThis.localStorage,
    location: globalThis.location,
    fetch: globalThis.fetch,
  };
  globalThis.localStorage = memoryStorage();
  globalThis.location = { protocol: 'http:', host: '127.0.0.1' };
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), SHARED_PLAYER_STORE_PATH, 'the client only ever speaks the store route');
    if ((options.method || 'GET') !== 'PUT') {
      return { ok: true, status: 200, json: async () => ({ keys: readPlayerStoreKeysSync(storeDir) }) };
    }
    const body = JSON.parse(options.body);
    const marker = body.keys && body.keys['sf.save.1']
      ? (JSON.parse(body.keys['sf.save.1']).data || {}).marker
      : null;
    events.push({ phase: 'start', marker });
    if (delayMarker != null && marker === delayMarker) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const keys = writePlayerStoreKeysSync(storeDir, body.keys);
    events.push({ phase: 'end', marker });
    return { ok: true, status: 200, json: async () => ({ ok: true, keys }) };
  };
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
}

test('two writes of one slot settle in order and the accepted generation names the newer snapshot', async () => {
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-nxi236-'));
  const events = [];
  const restore = withLoopback(storeDir, { delayMarker: 'older-write', events });
  try {
    resetSharedPlayerStoreMemoForTests();
    assert.equal(sharedPlayerStoreLastAcceptedWrite(), null, 'nothing accepted before any push');

    const first = pushSharedPlayerStore({ 'sf.save.1': envelope(OLDER, 'older-write') });
    const second = pushSharedPlayerStore({ 'sf.save.1': envelope(NEWER, 'newer-write') });
    assert.equal(await first, true, 'the first push still reports the transport accepted it');
    assert.equal(await second, true);

    const landed = JSON.parse(readPlayerStoreKeysSync(storeDir)['sf.save.1']);
    assert.equal((landed.data || {}).marker, 'newer-write',
      'the store holds the newer snapshot — the older completion did not overwrite it');

    const starts = events.filter((e) => e.phase === 'start').map((e) => e.marker);
    assert.deepEqual(starts, ['older-write', 'newer-write'], 'both PUTs were issued, in request order');
    const firstEnd = events.findIndex((e) => e.phase === 'end' && e.marker === 'older-write');
    const secondStart = events.findIndex((e) => e.phase === 'start' && e.marker === 'newer-write');
    assert.ok(firstEnd < secondStart,
      'the PUTs never overlapped: the newer write starts only after the older one settled');

    const accepted = sharedPlayerStoreLastAcceptedWrite();
    assert.ok(accepted && accepted.ok, 'the acknowledgement exists after success');
    assert.equal(accepted.acceptedAt, Date.parse(NEWER),
      'the accepted generation is the newest envelope the store actually took');
  } finally {
    restore();
    fs.rmSync(storeDir, { recursive: true, force: true });
    resetSharedPlayerStoreMemoForTests();
  }
});

test('a keepalive push with an older snapshot cannot relabel the accepted generation backwards', async () => {
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-nxi236-'));
  const restore = withLoopback(storeDir);
  try {
    resetSharedPlayerStoreMemoForTests();
    // Newer snapshot through the ordered queue.
    await pushSharedPlayerStore({ 'sf.save.1': envelope(NEWER, 'newer-write') });
    // Older snapshot on the immediate keepalive path (small patch, fits the budget).
    await pushSharedPlayerStore({ 'sf.settings.profile.v1': JSON.stringify({ savedAt: OLDER, marker: 'profile' }) });
    const olderSlot = pushSharedPlayerStore({ 'sf.save.1': envelope(OLDER, 'older-keepalive') }, { keepalive: true });
    await olderSlot;
    const accepted = sharedPlayerStoreLastAcceptedWrite();
    assert.equal(accepted.acceptedAt, Date.parse(NEWER),
      'the label stays on the newest accepted envelope, whatever order small pushes land in');
  } finally {
    restore();
    fs.rmSync(storeDir, { recursive: true, force: true });
    resetSharedPlayerStoreMemoForTests();
  }
});

test('neighboring success: a plain mirror push still lands and reports ok', async () => {
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-nxi236-'));
  const restore = withLoopback(storeDir);
  try {
    resetSharedPlayerStoreMemoForTests();
    const payload = envelope(OLDER, 'plain-write');
    const landed = await pushSharedPlayerStore({ 'sf.save.2': payload });
    assert.equal(landed, true);
    assert.equal(readPlayerStoreKeysSync(storeDir)['sf.save.2'], payload,
      'the store file is byte-for-byte the pushed envelope');
    assert.equal(sharedPlayerStoreLastAcceptedWrite().acceptedAt, Date.parse(OLDER));
  } finally {
    restore();
    fs.rmSync(storeDir, { recursive: true, force: true });
    resetSharedPlayerStoreMemoForTests();
  }
});
