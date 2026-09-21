import test from 'node:test';
import assert from 'node:assert/strict';

import { save } from '../src/save/saveSystem.js';

// INF-092: only say Saved/synced after the relevant write succeeds. The boot mirror sync must
// report a missed shared-store write truthfully (pending stays pending, failure names the
// durable local store), and a later landed write clears the warning — with no duplicate save
// or transition effects riding the status path.
function makeStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) { key = String(key); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
  };
}

function installGlobals({ storage, putBehavior = 'ok', getKeys = {} }) {
  const prev = {
    location: globalThis.location,
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage,
  };
  const puts = [];
  globalThis.location = { protocol: 'http:' };
  globalThis.localStorage = storage;
  globalThis.fetch = async (url, opts = {}) => {
    const method = (opts && opts.method) || 'GET';
    if (method === 'PUT') {
      puts.push({ url });
      if (putBehavior === 'throw') throw new Error('net down');
      return { ok: putBehavior === 'ok' };
    }
    return { ok: true, json: async () => ({ keys: getKeys }) };
  };
  return {
    puts,
    restore() {
      if (prev.location === undefined) delete globalThis.location; else globalThis.location = prev.location;
      if (prev.fetch === undefined) delete globalThis.fetch; else globalThis.fetch = prev.fetch;
      if (prev.localStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev.localStorage;
    },
  };
}

function installSave() {
  const original = {
    bus: save.bus,
    ready: save._sharedStoreReady,
    healthy: save._sharedStoreMirrorHealthy,
    patch: save._sharedStorePatch,
    timer: save._sharedStoreFlushTimer,
  };
  const events = [];
  save.bus = { emit(name, payload) { events.push({ name, payload }); } };
  save._sharedStoreReady = false;
  save._sharedStoreMirrorHealthy = true;
  save._sharedStorePatch = null;
  save._sharedStoreFlushTimer = null;
  return {
    events,
    restore() {
      if (save._sharedStoreFlushTimer != null) clearTimeout(save._sharedStoreFlushTimer);
      save.bus = original.bus;
      save._sharedStoreReady = original.ready;
      save._sharedStoreMirrorHealthy = original.healthy;
      save._sharedStorePatch = original.patch;
      save._sharedStoreFlushTimer = original.timer;
    },
  };
}

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

test('INF-092 missed mirror write reports failure and names the durable local store', async () => {
  const storage = makeStorage();
  storage.setItem('sf.save.quick', '{"fmt":"x"}');
  const g = installGlobals({ storage, putBehavior: 'throw' });
  const h = installSave();
  try {
    await save._syncSharedPlayerStore();
    assert.equal(save._sharedStoreReady, true, 'title unblocks even when the mirror is down');
    assert.equal(save.isSharedStoreMirrorHealthy(), false);
    const synced = h.events.filter((e) => e.name === 'save:store-synced');
    assert.equal(synced.length, 1, 'one status event, no duplicate save or transition');
    assert.deepEqual(synced[0].payload,
      { ok: false, durableStore: 'local', mirror: 'shared', error: 'mirror_unreachable' });
    assert.ok(!h.events.some((e) => e.name === 'toast'), 'no save write rides the status path');
  } finally { h.restore(); g.restore(); }
});

test('INF-092 store-less shell stays healthy with mirror none', async () => {
  const storage = makeStorage();
  const g = installGlobals({ storage });
  delete globalThis.location;
  const h = installSave();
  try {
    await save._syncSharedPlayerStore();
    assert.equal(save.isSharedStoreMirrorHealthy(), true);
    const synced = h.events.find((e) => e.name === 'save:store-synced');
    assert.deepEqual(synced.payload, { ok: true, durableStore: 'local', mirror: 'none' });
  } finally { h.restore(); g.restore(); }
});

test('INF-092 a later landed write clears the warning exactly once', async () => {
  const storage = makeStorage();
  const g = installGlobals({ storage, putBehavior: 'throw' });
  const h = installSave();
  try {
    save._sharedStoreMirrorHealthy = false; // as left by a failed sync
    save._sharedStoreReady = true;
    // a missed background mirror write stays silent (the flag is the status) …
    save._queueSharedStoreMirror({ 'sf.save.quick': '{"fmt":"x"}' });
    await tick();
    assert.equal(save.isSharedStoreMirrorHealthy(), false);
    assert.ok(!h.events.some((e) => e.name === 'save:store-synced'));
    // … until a write lands, which clears it with one recovery notice …
    g.restore();
    const g2 = installGlobals({ storage, putBehavior: 'ok' });
    try {
      save._queueSharedStoreMirror({ 'sf.save.quick': '{"fmt":"x"}' });
      await tick();
      assert.equal(save.isSharedStoreMirrorHealthy(), true);
      const recovered = h.events.filter((e) => e.name === 'save:store-synced');
      assert.equal(recovered.length, 1);
      assert.equal(recovered[0].payload.mirrorRecovered, true);
      assert.equal(recovered[0].payload.ok, true);
      // … and steady-state mirrors stay silent.
      save._queueSharedStoreMirror({ 'sf.save.quick': '{"fmt":"x"}' });
      await tick();
      assert.equal(h.events.filter((e) => e.name === 'save:store-synced').length, 1);
    } finally { g2.restore(); }
  } finally { h.restore(); }
});
