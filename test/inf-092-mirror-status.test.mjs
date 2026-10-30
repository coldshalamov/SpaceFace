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

test('a local save receipt waits for the shared mirror and failure preserves local bytes', async () => {
  const previous = { location: globalThis.location, fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  const storage = makeStorage();
  globalThis.location = { protocol: 'http:', origin: 'http://test-save' };
  globalThis.localStorage = storage;
  const events = [];
  const owner = { ...save, state: { save: {}, meta: {}, simTime: 1 }, bus: { emit: (name, payload) => events.push({ name, payload }) },
    _sharedStoreMirrorHealthy: true, _sharedStorePatch: null, _sharedStoreFlushTimer: null,
    _sharedStoreMirrorWaiters: [], _sharedStoreMirrorPending: new Set() };
  let release;
  globalThis.fetch = () => new Promise((resolve) => { release = resolve; });
  try {
    storage.setItem('sf.save.quick', 'local bytes');
    assert.equal(owner._publishSaveResult('quick', { savedAt: 'now' }, { ok: true, mirrorPatch: { 'sf.save.quick': 'local bytes' } }, { ok: true, slot: 'quick' }), true);
    await tick();
    assert.equal(events.some((e) => e.name === 'save:completed'), false);
    const drain = owner.drainSharedStoreWrites();
    release({ ok: true });
    assert.equal((await drain).ok, true);
    await owner._lastSaveDurability;
    assert.equal(events.filter((e) => e.name === 'save:completed').length, 1);
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    owner._publishSaveResult('quick', { savedAt: 'later' }, { ok: true, mirrorPatch: { 'sf.save.quick': 'local bytes' } }, { ok: true, slot: 'quick' });
    assert.equal(await owner._lastSaveDurability, false);
    assert.equal(storage.getItem('sf.save.quick'), 'local bytes');
    assert.ok(events.some((e) => e.name === 'save:error' && e.payload.localSaved === true));
    assert.equal(events.filter((e) => e.name === 'save:completed').length, 1);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('normal quit waits for the existing exit save and pending mirror before suppressing unload', async () => {
  let finishSave, finishMirror;
  const calls = [];
  const owner = {
    ...save, state: { mode: 'flight', jump: null }, _playerDead: false, _restoring: false,
    _campaignSaveSuppressed: () => false,
    requestExitAutosave(options) { calls.push(options); return new Promise((resolve) => { finishSave = resolve; }); },
    _sharedStoreMirrorPending: new Set(),
  };
  owner._sharedStoreMirrorPending.add(new Promise((resolve) => { finishMirror = resolve; }));
  const quit = owner.prepareForQuit();
  assert.deepEqual(calls, [{ paced: true }]);
  assert.notEqual(owner._suppressUnloadExitSave, true);
  finishSave(true);
  await Promise.resolve();
  assert.notEqual(owner._suppressUnloadExitSave, true, 'mirror is still pending');
  finishMirror(true);
  assert.equal((await quit).ok, true);
  assert.equal(owner._suppressUnloadExitSave, true);
});

test('fallback collection returns the actual mirror result and shares an in-flight collection', async () => {
  const storage = makeStorage(), globals = installGlobals({ storage });
  let finishCollect;
  const owner = { ...save, state: { save: {} }, bus: { emit() {} },
    _sharedStoreMirrorHealthy: true, _sharedStorePatch: null, _sharedStoreFlushTimer: null,
    _sharedStoreMirrorWaiters: [], _sharedStoreMirrorPending: new Set(),
    _sharedStoreMirrorGeneration: 1, _sharedStoreCollectQueued: false,
    _collectSharedStoreKeysChunked: () => new Promise((resolve) => { finishCollect = resolve; }) };
  try {
    const first = owner._queueSharedStoreMirror(null);
    assert.equal(first, owner._queueSharedStoreMirror(null));
    await Promise.resolve();
    finishCollect({ 'sf.save.quick': 'local bytes' });
    assert.equal(await first, true);
    assert.equal(globals.puts.length, 1);
  } finally { globals.restore(); }
});

test('destroy cancels an unsent mirror and settles its waiter', async () => {
  const storage = makeStorage(), globals = installGlobals({ storage });
  const owner = { ...save, state: { save: {} }, bus: { emit() {} },
    _sharedStoreMirrorHealthy: true, _sharedStorePatch: null, _sharedStoreFlushTimer: null,
    _sharedStoreMirrorWaiters: [], _sharedStoreMirrorPending: new Set(), _sharedStoreMirrorGeneration: 1,
    _removeUnloadExitSave() {}, _cancelCeresAttachmentRestore() {}, _cancelCeresEntityReferenceRestore() {} };
  try {
    const pending = owner._queueSharedStoreMirror({ 'sf.save.quick': 'local bytes' });
    owner.destroy();
    assert.equal(await pending, false);
    assert.equal(globals.puts.length, 0);
  } finally { globals.restore(); }
});

test('old-run mirror settlement stays truthful without changing the new run or emitting its receipt', async () => {
  let finish;
  const events = [];
  const state = { save: {}, meta: {}, simTime: 1 };
  const owner = { ...save, state, bus: { emit: (name) => events.push(name) },
    _runEpoch: 1, _restoreSequence: 1, _sharedStoreMirrorGeneration: 1,
    _queueSharedStoreMirror: () => new Promise((resolve) => { finish = resolve; }) };
  owner._publishSaveResult('auto', { savedAt: 'old' }, { ok: true, mirrorPatch: {} }, { ok: true, slot: 'auto' });
  const original = owner._lastSaveDurability;
  owner._runEpoch += 1;
  state.meta.lastSavedAt = 'new';
  finish(true);
  assert.equal(await original, true);
  assert.equal(state.meta.lastSavedAt, 'new');
  assert.deepEqual(events, []);
});

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
      { ok: false, durableStore: 'local', mirror: 'shared', error: 'mirror_unreachable',
        storeCapability: { origin: 'http://', status: 'available' } });
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

test('INF-092 a hung mirror PUT cannot pin Continue at Checking saves', async () => {
  // Boot mirror sync against a store that answers GET but never finishes the PUT: the mirror
  // PUT must carry the shared deadline so pending clears, health reports false once, and the
  // durable local save is untouched.
  const storage = makeStorage();
  storage.setItem('sf.save.quick', '{"fmt":"x"}');
  const prev = {
    location: globalThis.location,
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage,
  };
  const realTimeout = AbortSignal.timeout;
  const controller = new AbortController();
  const deadlines = [];
  let putSignal = null;
  globalThis.location = { protocol: 'http:' };
  globalThis.localStorage = storage;
  AbortSignal.timeout = (ms) => { deadlines.push(ms); return controller.signal; };
  globalThis.fetch = async (url, opts = {}) => {
    if ((opts.method || 'GET') === 'PUT') {
      putSignal = opts.signal || null;
      return new Promise((_, reject) => {
        if (!putSignal) return; // the unbounded PUT: never settles
        const fail = () => reject(new Error('store mirror timed out'));
        if (putSignal.aborted) fail();
        else putSignal.addEventListener('abort', fail, { once: true });
      });
    }
    return { ok: true, json: async () => ({ keys: {} }) };
  };
  const h = installSave();
  try {
    const done = save._syncSharedPlayerStore();
    await tick();
    assert.ok(putSignal, 'the mirror PUT must carry an abort deadline');
    assert.deepEqual(deadlines, [10000, 10000], 'GET and PUT share the finite deadline');
    controller.abort();
    const settled = await Promise.race([done.then(() => 'done'), tick(500).then(() => 'hung')]);
    assert.equal(settled, 'done', 'sync must settle once the PUT deadline fires');
    assert.equal(save.isSharedStoreSyncPending(), false, 'pending clears for the title screen');
    assert.equal(save.isSharedStoreMirrorHealthy(), false);
    const synced = h.events.filter((e) => e.name === 'save:store-synced');
    assert.equal(synced.length, 1, 'exactly one failure status');
    assert.equal(synced[0].payload.ok, false);
    assert.equal(synced[0].payload.mirror, 'shared');
    assert.equal(storage.getItem('sf.save.quick'), '{"fmt":"x"}', 'the durable local save is untouched');
  } finally {
    AbortSignal.timeout = realTimeout;
    h.restore();
    if (prev.location === undefined) delete globalThis.location; else globalThis.location = prev.location;
    if (prev.fetch === undefined) delete globalThis.fetch; else globalThis.fetch = prev.fetch;
    if (prev.localStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev.localStorage;
  }
});

test('INF-092 background mirrors retain the long PUT deadline', async () => {
  const storage = makeStorage();
  const prev = {
    location: globalThis.location,
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage,
  };
  const realTimeout = AbortSignal.timeout;
  const deadlines = [];
  globalThis.location = { protocol: 'http:' };
  globalThis.localStorage = storage;
  AbortSignal.timeout = (ms) => {
    deadlines.push(ms);
    return new AbortController().signal;
  };
  globalThis.fetch = async (url, opts = {}) => {
    if ((opts.method || 'GET') === 'PUT') return { ok: true, status: 200 };
    return { ok: true, json: async () => ({ keys: {} }) };
  };
  const h = installSave();
  try {
    save._sharedStoreReady = true;
    save._queueSharedStoreMirror({ 'sf.save.quick': '{"fmt":"x"}' });
    await tick();
    assert.deepEqual(deadlines, [150000], 'background mirror writes retain the long queue budget');
    assert.equal(save.isSharedStoreMirrorHealthy(), true);
  } finally {
    h.restore();
    AbortSignal.timeout = realTimeout;
    if (prev.location === undefined) delete globalThis.location; else globalThis.location = prev.location;
    if (prev.fetch === undefined) delete globalThis.fetch; else globalThis.fetch = prev.fetch;
    if (prev.localStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev.localStorage;
  }
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
