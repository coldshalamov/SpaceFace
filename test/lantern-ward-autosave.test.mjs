import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { Worker as NodeWorker } from 'node:worker_threads';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import {
  freshCounterweightCircuitState,
  installCounterweightCircuitSaveAdapter,
} from '../src/features/counterweightCircuit/persistence.js';
import { save } from '../src/save/saveSystem.js';
import { decodeSaveEnvelopeText, restorePrepareSaveJsonAsync } from '../src/save/saveWorker.js';

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

// Execute the exact Blob source minted by save._createSaveWorker, including the player/bag
// protocol extensions, in a real asynchronous worker. The synchronous module-handler fixture
// cannot reproduce the production encode/compress/response boundary used by interval saves.
function browserWorkerHost(requests, workers) {
  return class BrowserWorker {
    constructor(url) {
      this.pending = [];
      this.closed = false;
      workers.add(this);
      this.ready = resolveObjectURL(url).text().then((source) => {
        if (this.closed) return;
        const prelude = `
          const { parentPort } = require('node:worker_threads');
          const self = {
            addEventListener(name, listener) {
              if (name === 'message') parentPort.on('message', data => listener({ data }));
            },
            postMessage(value) { parentPort.postMessage(value); },
          };
        `;
        this.worker = new NodeWorker(prelude + source, { eval: true });
        this.worker.on('message', (data) => this.onmessage?.({ data }));
        this.worker.on('error', (error) => this.onerror?.(error));
        for (const message of this.pending) this.worker.postMessage(message);
        this.pending.length = 0;
      }).catch((error) => this.onerror?.(error));
    }
    postMessage(message) {
      const detached = structuredClone(message);
      requests.push(detached);
      if (this.worker) this.worker.postMessage(detached);
      else this.pending.push(detached);
    }
    terminate() {
      this.closed = true;
      this.pending.length = 0;
      return this.worker?.terminate();
    }
  };
}

function fixture(t) {
  const previousStorage = globalThis.localStorage;
  const previousWorker = globalThis.Worker;
  const storage = memoryStorage();
  const requests = [];
  const workers = new Set();
  globalThis.localStorage = storage;
  globalThis.Worker = browserWorkerHost(requests, workers);
  const state = createGameState(47);
  state.mode = 'flight';
  state.tick = 7200;
  state.simTime = 120;
  state.meta.playtimeS = 120;
  state.settings.gameplay.autosaveIntervalS = 120;
  state.world.currentSectorId = 'sector_helios_prime';
  state.world.counterweightCircuit = freshCounterweightCircuitState();
  state.world.counterweightCircuit.discovered = true;
  state.world.counterweightCircuit.attemptCounter = 3;
  state.player.credits = 4180;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  state.player.activeShipIndex = 0;
  const player = {
    id: 1, alive: true, type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: 12, z: 45 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 9, mass: 18, hull: 100, hullMax: 100,
    flags: { isPlayer: true }, data: { defId: 'ship_kestrel' },
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const ward = { version: 1, lampSerial: 'venn-family-lamp:01', history: { installations: 1 } };
  const reward = { version: 1, status: 'settled', credited: 180 };
  const owners = {
    world: { serialize: () => ({ currentSectorId: state.world.currentSectorId, sectors: {} }) },
    npcJobsRuntime: { serialize: () => ({ lanternWard: structuredClone(ward) }) },
    missions: { serialize: () => ({ lanternWardReward: structuredClone(reward) }) },
  };
  const bus = createBus();
  const system = { ...save };
  system._scheduleAutosaveWork = (callback) => setImmediate(callback);
  system.init({ state, bus, helpers: {}, registry: { get: (name) => owners[name] ?? null } });
  t.after(async () => {
    system._beginRunEpoch('test_cleanup');
    await Promise.all([...workers].map((worker) => worker.terminate()));
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
  });
  return { system, state, bus, storage, requests, ward, reward };
}

function terminalReceipt(bus) {
  return new Promise((resolve) => {
    const offComplete = bus.on('save:completed', (payload) => {
      offComplete(); offError(); resolve({ event: 'save:completed', payload });
    });
    const offError = bus.on('save:error', (payload) => {
      offComplete(); offError(); resolve({ event: 'save:error', payload });
    });
  });
}

test('interval autosave with the installed production adapter retains a playable ship and ward memory through the async Blob worker', { timeout: 10000 }, async (t) => {
  const h = fixture(t);
  // No system serializer: exercises the adapter's owner-bound state fallback exactly as the
  // capture loop calls readers (without binding `this` at the call site).
  const release = installCounterweightCircuitSaveAdapter(h.system);
  t.after(release);
  const done = terminalReceipt(h.bus);
  h.system.update(1 / 60, h.state);
  const result = await done;
  assert.equal(result.event, 'save:completed', JSON.stringify(result.payload));
  const raw = h.storage.getItem('sf.save.auto');
  assert.equal(typeof raw, 'string');
  const decoded = await decodeSaveEnvelopeText(raw);
  assert.equal(decoded.ok, true);
  const envelope = JSON.parse(decoded.text);
  assert.equal(envelope.version, CURRENT_VERSION);
  assert.equal(envelope.data.entities.player.type, 'ship');
  assert.equal(envelope.data.player.credits, 4180);
  assert.equal(envelope.data.world.currentSectorId, 'sector_helios_prime');
  assert.equal(envelope.data.world.counterweightCircuit.discovered, true);
  assert.equal(envelope.data.world.counterweightCircuit.attemptCounter, 3);
  assert.deepEqual(envelope.data.npcJobs.lanternWard, h.ward);
  assert.deepEqual(envelope.data.missions.lanternWardReward, h.reward);
  assert.equal((await restorePrepareSaveJsonAsync(raw, CURRENT_VERSION)).ok, true,
    'stored autosave must pass the production Continue preparation gate');
  assert.ok(h.requests.some((request) => request.type === 'encode_begin'));
  assert.ok(h.requests.some((request) => request.type === 'encode_part' && request.payload.key === 'entities'));
  assert.ok(h.requests.some((request) => request.type === 'encode_finish'));
  assert.equal(h.system._autosaveInFlight, false);
  assert.equal(h.system._lastAutosavePlaytime, 120);
});

for (const [name, plan] of [
  ['generator', function* () { yield ['player', () => ({})]; }],
  ['empty array', () => []],
  ['malformed reader', () => [['player', null]]],
  ['throwing factory', () => { throw new Error('adapter failed'); }],
]) {
  test(`invalid ${name} capture plan reports failure and preserves the previous slot`, { timeout: 10000 }, async (t) => {
    const h = fixture(t);
    const previous = h.system.serialize('auto');
    const raw = JSON.stringify(previous);
    h.storage.setItem('sf.save.auto', raw);
    h.system._saveCapturePlan = plan;
    const done = terminalReceipt(h.bus);
    h.system.update(1 / 60, h.state);
    const result = await done;
    assert.equal(result.event, 'save:error');
    assert.equal(result.payload.failure, 'invalid_capture_plan');
    assert.equal(h.storage.getItem('sf.save.auto'), raw);
    assert.equal(h.requests.some((request) => request.type === 'encode_begin'), false);
    assert.equal(h.system._autosaveInFlight, false);
    assert.equal(h.system._lastAutosavePlaytime, 0, 'failed capture must remain retryable');
    h.system._saveCapturePlan = save._saveCapturePlan;
    const retry = terminalReceipt(h.bus);
    h.system.update(1 / 60, h.state);
    assert.equal((await retry).event, 'save:completed');
    assert.equal((await restorePrepareSaveJsonAsync(h.storage.getItem('sf.save.auto'), CURRENT_VERSION)).ok, true);
  });
}
