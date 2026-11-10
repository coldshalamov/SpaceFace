import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { emptyAchievementBag, saveAchievementBag, ACHIEVEMENTS_STORAGE_KEY } from '../src/systems/achievements.js';
import {
  applySharedPlayerStoreCapability, fetchSharedPlayerStore, pushSharedPlayerStore,
  resetSharedPlayerStoreMemoForTests, sharedPlayerStoreCapability,
} from '../src/save/sharedPlayerStore.js';

const ORIGIN = 'https://retail.example';

function setup(t) {
  const values = new Map();
  const storage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  for (const [key, value] of Object.entries({ location: new URL(ORIGIN), localStorage: storage })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
  resetSharedPlayerStoreMemoForTests();
  t.after(resetSharedPlayerStoreMemoForTests);
  return storage;
}

const response = status => ({ ok: status === 200, status, json: async () => ({ keys: {} }) });

for (const status of [404, 405]) {
  test(`known ${status} skips achievement mirrors but retains local achievements and deletion tombstones`, async t => {
    const storage = setup(t);
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => { requests++; return response(status); });
    assert.equal(await fetchSharedPlayerStore(), null);
    const bag = emptyAchievementBag();
    bag.counters.dockCount = 7;
    assert.ok(saveAchievementBag(bag, storage));
    assert.equal(JSON.parse(storage.getItem(ACHIEVEMENTS_STORAGE_KEY)).data.counters.dockCount, 7);
    assert.equal(await pushSharedPlayerStore({ 'sf.save.quick': null }, { keepalive: true }), false);
    assert.ok(storage.getItem('sf.save.deleted.quick'), 'local deletion protection survives skipped transport');
    assert.equal(requests, 1, 'neither normal achievement mirror nor unload-style push reaches absent route');
  });
}

test('queued PUT rechecks a newly discovered absent route before sending', async t => {
  setup(t);
  let finish;
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    return new Promise(resolve => { finish = resolve; });
  });
  const first = pushSharedPlayerStore({ 'sf.save.quick': 'first' });
  const queued = pushSharedPlayerStore({ 'sf.save.quick': 'queued' });
  finish(response(404));
  assert.equal(await first, false);
  assert.equal(await queued, false);
  assert.equal(requests, 1, 'the queued write cannot issue another doomed request');
});

test('transient errors remain retryable; a successful pending pull and a new origin recover capability', async t => {
  setup(t);
  for (const transient of [500, 503, 'offline']) {
    resetSharedPlayerStoreMemoForTests();
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      if (++requests > 1) return response(200);
      if (transient === 'offline') throw new Error('offline');
      return response(transient);
    });
    assert.equal(await fetchSharedPlayerStore(), null);
    assert.equal(await pushSharedPlayerStore({ 'sf.save.quick': 'retry' }), true);
    assert.equal(requests, 2);
    t.mock.restoreAll();
  }
  resetSharedPlayerStoreMemoForTests();
  const pulls = [];
  t.mock.method(globalThis, 'fetch', (_url, options) => options.method === 'PUT'
    ? Promise.resolve(response(200)) : new Promise(resolve => pulls.push(resolve)));
  const absent = fetchSharedPlayerStore();
  const recovery = fetchSharedPlayerStore();
  pulls[0](response(404));
  await absent;
  assert.equal(await pushSharedPlayerStore({ 'sf.save.quick': 'blocked' }), false);
  pulls[1](response(200));
  assert.deepEqual(await recovery, {});
  assert.equal(await pushSharedPlayerStore({ 'sf.save.quick': 'recovered' }), true);
  assert.equal(applySharedPlayerStoreCapability({ origin: ORIGIN, status: 'absent' }), true);
  assert.equal(applySharedPlayerStoreCapability({ origin: ORIGIN, status: 'unknown' }), false,
    'transient/unknown relay status cannot erase definitive absence');
  globalThis.location = new URL('http://127.0.0.1:41788');
  assert.equal(sharedPlayerStoreCapability().status, 'unknown');
  assert.equal(applySharedPlayerStoreCapability({ origin: ORIGIN, status: 'absent' }), false,
    'a stale reply from another origin cannot disable this store');
  assert.equal(await pushSharedPlayerStore({ 'sf.save.quick': 'electron' }), true,
    'a new loopback store can still receive real writes');
});

test('real worker boot capability reaches main before synchronous achievement listeners', async t => {
  const storage = setup(t);
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      globalThis.location = new URL(workerData.origin);
      globalThis.localStorage = { length: 0, key() { return null; }, getItem() { return null; } };
      globalThis.fetch = async () => ({ ok: false, status: 404 });
      const { save } = await import(workerData.module);
      const instance = Object.create(save);
      const events = [];
      instance.state = { save: {} };
      instance.bus = { emit(t, p) { events.push({ t, p }); } };
      instance._sharedStoreReady = false;
      instance._restoreFrameYield = async () => {};
      await instance._syncSharedPlayerStore();
      parentPort.postMessage(events);
    })().catch(error => { throw error; });
  `, { eval: true, workerData: { origin: ORIGIN, module: new URL('../src/save/saveSystem.js', import.meta.url).href } });
  t.after(() => worker.terminate());
  const events = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
  assert.deepEqual(events[0].p.storeCapability, { origin: ORIGIN, status: 'absent' });
  assert.equal(sharedPlayerStoreCapability().status, 'unknown', 'main has its own capability memo');
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return response(404); });
  const bus = createBus();
  let seen = false;
  bus.on('save:store-synced', () => {
    seen = true;
    assert.equal(sharedPlayerStoreCapability().status, 'absent');
    assert.ok(saveAchievementBag(emptyAchievementBag(), storage));
  });
  const state = { entities: new Map(), entityList: [], settings: {}, meta: { seed: 1 },
    tick: 0, simTime: 0, accumulator: 0, timeScale: 0, ui: { screenStack: [] } };
  const posts = [];
  let receive;
  const lane = createSimLaneRuntime({ state, helpers: {}, registry: {}, bus,
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({ post: message => posts.push(message), onMessage: handler => { receive = handler; }, terminate() {} }),
  });
  t.after(() => lane.close());
  receive({ kind: 'ready', seq: posts[0].seq, stateTick: 0, domainUpdates: [] });
  await lane.readyPromise;
  receive({ kind: 'clockTick', stateTick: 0, simTime: 0, domainUpdates: [], events });
  assert.equal(seen, true);
  assert.ok(storage.getItem(ACHIEVEMENTS_STORAGE_KEY), 'local achievement data remains durable');
  assert.equal(requests, 0, 'main listener honors worker absence without an extra GET or PUT');
});
