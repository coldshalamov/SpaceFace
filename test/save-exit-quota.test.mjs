import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';
import { decodeSaveEnvelopeText, isGzippedSaveText } from '../src/save/saveWorker.js';

function harness(t, { large = false } = {}) {
  const oldStorage = globalThis.localStorage;
  const oldWindow = globalThis.window;
  const values = new Map();
  const listeners = new Map();
  let quota = 5 * 1024 * 1024;
  const storage = {
    get length() { return values.size; },
    key: i => [...values.keys()][i] ?? null,
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
    setItem(key, value) {
      value = String(value);
      let bytes = 2 * (key.length + value.length);
      for (const [other, raw] of values) if (other !== key) bytes += 2 * (other.length + raw.length);
      if (bytes > quota) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      values.set(key, value);
    },
  };
  const window = {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    fire(name) { for (const fn of listeners.get(name) || []) fn(); },
  };
  globalThis.localStorage = storage;
  globalThis.window = window;
  const state = createGameState(181);
  state.mode = 'flight';
  state.tick = 60;
  state.simTime = 1;
  state.world.currentSectorId = 'sector_helios_prime';
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, hull: 100, hullMax: 100, radius: 9, flags: {}, data: { defId: 'ship_kestrel' } };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const world = { currentSectorId: state.world.currentSectorId, history: large
    ? Array.from({ length: 3000 }, (_, i) => ({ id: `event-${i}`, detail: 'ore recovered from asteroid field; '.repeat(20) })) : [] };
  const owner = Object.create(saveDefinition);
  const bus = createBus();
  owner.state = state;
  owner.bus = bus;
  owner.helpers = {};
  owner.registry = { get: id => id === 'world' ? { serialize: () => world } : null };
  owner._runEpoch = 1;
  const completed = [];
  bus.on('save:completed', p => completed.push(p));
  owner._installUnloadExitSave();
  t.after(() => {
    owner.destroy();
    if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  });
  return { owner, state, storage, window, completed, setQuota: bytes => { quota = bytes; } };
}

test('exit gzip fallback fits beside a large quick save and preserves every saved fact', async t => {
  const h = harness(t, { large: true });
  assert.equal(h.owner.save('quick'), true);
  const quick = h.storage.getItem('sf.save.quick');
  assert.ok(quick.length > 2_000_000, 'one production-sized plaintext save fits; two do not');
  h.state.player.credits = 18181;
  assert.equal(h.owner.requestExitAutosave(), true, 'exit must fit without evicting the quick primary');
  assert.equal(h.storage.getItem('sf.save.quick'), quick);
  const raw = h.storage.getItem('sf.save.auto');
  assert.equal(isGzippedSaveText(raw), true);
  const decoded = await decodeSaveEnvelopeText(raw);
  assert.equal(decoded.ok, true);
  const prepared = h.owner._prepareEnvelopeString(decoded.text);
  assert.equal(prepared.ok, true, 'the normal Continue decoder/checksum accepts the exit save');
  assert.equal(prepared.env.data.player.credits, 18181);
  assert.equal(prepared.env.data.world.history.length, 3000);
  assert.equal(prepared.env.data.world.history[2999].id, 'event-2999');
});

test('both unload doors save once and pageshow or resumed simulation re-arms the exit', t => {
  const h = harness(t);
  h.window.fire('beforeunload');
  h.window.fire('pagehide');
  assert.equal(h.completed.length, 1);
  h.window.fire('pageshow');
  h.window.fire('beforeunload');
  h.window.fire('pagehide');
  assert.equal(h.completed.length, 2, 'bfcache return gets a new exit');
  h.state.tick++;
  h.window.fire('beforeunload');
  h.window.fire('pagehide');
  assert.equal(h.completed.length, 3, 'cancelled unload then resumed flight gets a new exit');
});

test('total storage rejection leaves the previous loadable primary intact', t => {
  const h = harness(t);
  assert.equal(h.owner.save('quick'), true);
  const quick = h.storage.getItem('sf.save.quick');
  h.setQuota(0);
  const error = console.error;
  console.error = () => {};
  try { assert.equal(h.owner.save('quick'), false); }
  finally { console.error = error; }
  assert.equal(h.storage.getItem('sf.save.quick'), quick);
  assert.equal(h.owner._prepareEnvelopeString(quick).ok, true);
});

test('a platform without the gzip decoder never stores an unreadable exit generation', t => {
  const h = harness(t, { large: true });
  assert.equal(h.owner.save('quick'), true);
  const quick = h.storage.getItem('sf.save.quick');
  const decoder = globalThis.DecompressionStream;
  const error = console.error;
  globalThis.DecompressionStream = undefined;
  console.error = () => {};
  try { assert.equal(h.owner.requestExitAutosave(), false); }
  finally { globalThis.DecompressionStream = decoder; console.error = error; }
  assert.equal(h.storage.getItem('sf.save.auto'), null);
  assert.equal(h.storage.getItem('sf.save.quick'), quick);
});
