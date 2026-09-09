import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import { encodeSavePayload, handleSaveWorkerRequest } from '../src/save/saveWorker.js';

const HARD_SLICE_MS = 12;

function createBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(name, callback) {
      const list = handlers.get(name) || [];
      list.push(callback);
      handlers.set(name, list);
      return () => this.off(name, callback);
    },
    off(name, callback) {
      handlers.set(name, (handlers.get(name) || []).filter((entry) => entry !== callback));
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const callback of [...(handlers.get(name) || [])]) callback(payload);
    },
  };
}

function createStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    values,
  };
}

function playerEntity() {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 18,
    hull: 100,
    hullMax: 100,
    shield: 40,
    shieldMax: 40,
    cap: 30,
    capMax: 30,
    flags: { isPlayer: true },
    data: {
      defId: 'ship_kestrel',
      fittings: ['weapon_pulse_laser', null],
      weapons: [{ id: 'weapon_pulse_laser' }],
    },
  };
}

function makeState() {
  const state = createGameState(47);
  const entity = playerEntity();
  state.mode = 'flight';
  state.jump.state = 'IDLE';
  state.tick = 72_000;
  state.simTime = 1200;
  state.meta.playtimeS = 1200;
  state.playerId = entity.id;
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: ['weapon_pulse_laser', null],
    appearance: { paintId: 'factory_ochre', wear: 0.2 },
    livingHull: { kills: 4, lastWashAt: 800, marks: ['ceres'] },
  }];
  state.player.activeShipIndex = 0;
  return state;
}

function costlyModule(index) {
  const defId = index % 2 ? 'weapon_pulse_laser' : 'module_shield_booster_s';
  const entry = { instanceId: `module-${index}` };
  Object.defineProperty(entry, 'defId', {
    enumerable: true,
    get() {
      const until = performance.now() + 0.006;
      while (performance.now() < until) { /* deterministic clone cost */ }
      return defId;
    },
  });
  return entry;
}

function installHarness({ state = makeState(), storage = createStorage() } = {}) {
  const priorStorage = globalThis.localStorage;
  const original = {
    state: save.state,
    bus: save.bus,
    helpers: save.helpers,
    registry: save.registry,
    schedule: save._scheduleAutosaveWork,
    createWorker: save._createSaveWorker,
    pending: save._autosavePending,
    inFlight: save._autosaveInFlight,
    generation: save._autosaveGeneration,
    requestId: save._saveWorkerRequestId,
    runEpoch: save._runEpoch,
    activeWorkers: save._activeSaveWorkers,
    activeJob: save._activeAutosaveJob,
    activeTransaction: save._activeAutosaveTransaction,
    lastAt: save._lastAutosaveAt,
    lastPlaytime: save._lastAutosavePlaytime,
    restoring: save._restoring,
    restoreSequence: save._restoreSequence,
    playerDead: save._playerDead,
    playerCollectionRevision: save._playerCollectionRevision,
  };
  const bus = createBus();
  const tasks = [];
  const workerTasks = [];
  const encodeSessions = new Map();
  globalThis.localStorage = storage;
  save.init({ state, bus, helpers: {}, registry: { get: () => null } });
  save._scheduleAutosaveWork = (callback) => {
    tasks.push(callback);
    return tasks.length;
  };
  save._createSaveWorker = () => {
    let terminated = false;
    const worker = {
      onmessage: null,
      onerror: null,
      postMessage(input) {
        const message = structuredClone(input);
        workerTasks.push(() => {
          if (terminated) return;
          const { id, type, payload = {} } = message;
          if (type === 'encode_begin') {
            encodeSessions.set(id, { descriptor: payload.descriptor || {}, data: {} });
            return;
          }
          if (type === 'encode_player_begin') {
            const session = encodeSessions.get(id);
            session.data.player = {
              ...(payload.base || {}),
              ownedShips: new Array(payload.ownedShipsLength || 0),
              moduleInventory: new Array(payload.moduleInventoryLength || 0),
            };
            return;
          }
          if (type === 'encode_player_part') {
            const session = encodeSessions.get(id);
            const target = session.data.player[payload.collection];
            for (let offset = 0; offset < payload.items.length; offset += 1) {
              target[payload.start + offset] = payload.items[offset];
            }
            return;
          }
          if (type === 'encode_part') {
            encodeSessions.get(id).data[payload.key] = payload.value;
            return;
          }
          if (type === 'encode_finish') {
            const session = encodeSessions.get(id);
            encodeSessions.delete(id);
            const encoded = encodeSavePayload(session);
            worker.onmessage?.({ data: { id, type: 'encoded', ...encoded, workerCpuMs: 0 } });
            return;
          }
          const response = handleSaveWorkerRequest(message);
          if (response) worker.onmessage?.({ data: response });
        });
      },
      terminate() { terminated = true; },
    };
    return worker;
  };

  return {
    state,
    bus,
    storage,
    drain(limit = 5000) {
      let turns = 0;
      while ((tasks.length || workerTasks.length) && turns++ < limit) {
        if (tasks.length) tasks.shift()();
        if (workerTasks.length) workerTasks.shift()();
      }
      assert.ok(turns < limit, 'autosave task graph must settle');
    },
    step() {
      if (tasks.length) tasks.shift()();
      if (workerTasks.length) workerTasks.shift()();
    },
    restore() {
      Object.assign(save, {
        state: original.state,
        bus: original.bus,
        helpers: original.helpers,
        registry: original.registry,
        _scheduleAutosaveWork: original.schedule,
        _createSaveWorker: original.createWorker,
        _autosavePending: original.pending,
        _autosaveInFlight: original.inFlight,
        _autosaveGeneration: original.generation,
        _saveWorkerRequestId: original.requestId,
        _runEpoch: original.runEpoch,
        _activeSaveWorkers: original.activeWorkers,
        _activeAutosaveJob: original.activeJob,
        _activeAutosaveTransaction: original.activeTransaction,
        _lastAutosaveAt: original.lastAt,
        _lastAutosavePlaytime: original.lastPlaytime,
        _restoring: original.restoring,
        _restoreSequence: original.restoreSequence,
        _playerDead: original.playerDead,
        _playerCollectionRevision: original.playerCollectionRevision,
      });
      if (priorStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = priorStorage;
    },
  };
}

test('large player collections are captured and posted in bounded autosave slices', () => {
  const state = makeState();
  state.player.moduleInventory = Array.from({ length: 5000 }, (_, index) => costlyModule(index));
  const harness = installHarness({ state });
  try {
    assert.equal(save.requestAutosave('player_budget_regression', { force: true }), true);
    harness.drain();
    const completed = harness.bus.events.find((entry) => entry.name === 'save:completed');
    assert.ok(completed, 'the rich autosave must complete');
    const playerSlices = completed.payload.blockingSamples.filter(({ phase }) => (
      phase === 'capture_player' || phase === 'encode_player_dispatch'
    ));
    assert.ok(playerSlices.length > 2,
      `the rich player must span multiple bounded tasks, got ${JSON.stringify(playerSlices)}`);
    assert.ok(playerSlices.every(({ ms }) => ms <= HARD_SLICE_MS),
      `every player capture/dispatch slice must stay within ${HARD_SLICE_MS}ms: ${JSON.stringify(playerSlices)}`);
    assert.equal(completed.payload.observedHardLimitMet, true,
      `autosave exceeded its hard slice: ${JSON.stringify(completed.payload.blockingSamples)}`);
    const stored = JSON.parse(harness.storage.getItem('sf.save.auto'));
    assert.equal(stored.data.player.moduleInventory.length, 5000);
    assert.equal(stored.data.player.ownedShips.length, 1);
  } finally {
    harness.restore();
  }
});

test('a collection mutation between player batches restarts to one coherent latest snapshot', () => {
  const state = makeState();
  state.player.moduleInventory = Array.from({ length: 1000 }, (_, index) => costlyModule(index));
  const harness = installHarness({ state });
  try {
    assert.equal(save.requestAutosave('player_mutation_regression', { force: true }), true);
    harness.step();
    harness.step();
    const granted = { instanceId: 'module-after-capture-start', defId: 'module_targeting_computer' };
    state.player.moduleInventory.push(granted);
    harness.bus.emit('module:granted', { defId: granted.defId, instanceId: granted.instanceId });
    harness.drain();
    const completed = harness.bus.events.find((entry) => entry.name === 'save:completed');
    assert.ok(completed, 'a revised player capture must still complete');
    const stored = JSON.parse(harness.storage.getItem('sf.save.auto'));
    assert.equal(stored.data.player.moduleInventory.length, 1001);
    assert.deepEqual(stored.data.player.moduleInventory.at(-1), granted);
  } finally {
    harness.restore();
  }
});

test('production Blob worker source reconstructs chunked player arrays in the v14 shape', async () => {
  const OriginalWorker = globalThis.Worker;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let workerBlob = null;
  try {
    URL.createObjectURL = (blob) => {
      workerBlob = blob;
      return 'blob:player-chunk-protocol';
    };
    URL.revokeObjectURL = () => {};
    globalThis.Worker = class {
      postMessage() {}
      terminate() {}
    };
    const worker = save._createSaveWorker();
    assert.ok(workerBlob instanceof Blob);
    worker.terminate();

    let listener = null;
    let response = null;
    const workerSelf = {
      addEventListener(name, callback) { if (name === 'message') listener = callback; },
      postMessage(value) { response = value; },
    };
    Function('self', 'performance', await workerBlob.text())(workerSelf, globalThis.performance);
    const send = (data) => listener({ data });
    send({ id: 81, type: 'encode_begin', payload: { descriptor: { fmt: 'spaceface-save', version: 14 } } });
    send({
      id: 81,
      type: 'encode_player_begin',
      payload: { base: { credits: 44 }, ownedShipsLength: 2, moduleInventoryLength: 3 },
    });
    send({
      id: 81,
      type: 'encode_player_part',
      payload: { collection: 'ownedShips', start: 0, items: [{ defId: 'ship_kestrel' }, { defId: 'ship_bastion' }] },
    });
    send({
      id: 81,
      type: 'encode_player_part',
      payload: { collection: 'moduleInventory', start: 0, items: [
        { instanceId: 'm1', defId: 'module_a' },
        { instanceId: 'm2', defId: 'module_b' },
        { instanceId: 'm3', defId: 'module_c' },
      ] },
    });
    send({ id: 81, type: 'encode_finish' });
    assert.equal(response.type, 'encoded');
    const player = JSON.parse(response.json).data.player;
    assert.deepEqual(player, {
      credits: 44,
      ownedShips: [{ defId: 'ship_kestrel' }, { defId: 'ship_bastion' }],
      moduleInventory: [
        { instanceId: 'm1', defId: 'module_a' },
        { instanceId: 'm2', defId: 'module_b' },
        { instanceId: 'm3', defId: 'module_c' },
      ],
    });
  } finally {
    if (OriginalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = OriginalWorker;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

test('rich player data round-trips through the v14 player serializer without shape drift', () => {
  const state = makeState();
  state.player.ownedShips.push({
    defId: 'ship_bastion',
    fittings: ['weapon_heavy_beam', 'module_targeting_computer', null],
    appearance: { paintId: 'ash_black', decals: ['47-A', 'CERES'] },
    livingHull: { kills: 19, lastWashAt: 111, graffiti: ['NO KINGS'] },
  });
  state.player.moduleInventory = Array.from({ length: 32 }, (_, index) => ({
    instanceId: `roundtrip-${index}`,
    defId: index % 2 ? 'weapon_pulse_laser' : 'module_shield_booster_s',
  }));
  state.player.researchedNodes = ['tech_basic_weapons', 'tech_shields'];
  state.player.loadoutPresets = [{
    id: 'preset-rich',
    hullDefId: 'ship_bastion',
    fittings: ['weapon_heavy_beam', 'module_targeting_computer', null],
  }];
  const original = { state: save.state };
  save.state = state;
  try {
    const serialized = save._serializePlayer();
    state.player.ownedShips = [];
    state.player.moduleInventory = [];
    state.player.researchedNodes = [];
    state.player.loadoutPresets = [];
    save._restorePlayer(structuredClone(serialized));
    assert.deepEqual(save._serializePlayer(), serialized);
    assert.ok(Array.isArray(serialized.ownedShips));
    assert.ok(Array.isArray(serialized.moduleInventory));
  } finally {
    save.state = original.state;
  }
});

test('quota rejection preserves the last good slot and emits an observable warning payload', () => {
  const state = makeState();
  const storage = createStorage();
  const harness = installHarness({ state, storage });
  try {
    const previous = JSON.stringify(save.serialize('quick'));
    storage.values.set('sf.save.quick', previous);
    const normalSetItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === 'sf.save.quick') {
        const error = new Error('synthetic quota');
        error.name = 'QuotaExceededError';
        throw error;
      }
      normalSetItem(key, value);
    };
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      assert.equal(save.save('quick', { reason: 'quota_regression' }), false);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(storage.getItem('sf.save.quick'), previous);
    const warning = harness.bus.events.find((entry) => (
      entry.name === 'save:error' && entry.payload.reason === 'quota'
    ));
    assert.ok(warning, 'quota failure must be emitted for the UI warning route');
    assert.equal(harness.bus.events.some((entry) => entry.name === 'save:completed'), false);
  } finally {
    harness.restore();
  }
});
