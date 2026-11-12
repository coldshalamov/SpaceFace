import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import {
  decodeSaveEnvelopeText,
  encodeSavePayload,
  handleSaveWorkerRequest,
} from '../src/save/saveWorker.js';
import { gzipSaveEnvelopeSync } from '../src/save/saveSyncGzip.js';

// Regression coverage for the autosave write-lane drift fixes
// (.devshots/finish/lane3/review-save-a defects D1/D2/D5/D7):
//  - D1: the transaction lane must publish a mirrorPatch delta to the shared store
//        instead of falling into the whole-corpus collect+push arm.
//  - D2: the no-worker commit lane must rotate a gzipped previous generation to
//        recovery instead of overwriting it unprotected.
//  - D5: the chunked worker encode must rebuild data.player in the serialized
//        record's own key order so both encode lanes emit identical bytes.
//  - D7: a superseded receipt must not clear the live writer's pending marker.

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

// Deterministic autosave harness — same shape as save-player-bounded-capture's: a
// queued task list replaces _scheduleAutosaveWork and an in-process mock worker
// answers the encode/validate protocol. `worker: null` selects the no-worker lane.
function installHarness({ state = makeState(), storage = createStorage(), worker = 'mock' } = {}) {
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
    warmWorker: save._warmSaveWorker,
    queueMirror: save._queueSharedStoreMirror,
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
  save._createSaveWorker = worker === 'mock'
    ? () => {
      let terminated = false;
      const mock = {
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
              const base = payload.base || {};
              const order = Array.isArray(payload.order) ? payload.order : null;
              const player = {};
              if (order) {
                // Same contract as the production worker's encode_player_begin:
                // rebuild in the serialized record's own key order.
                for (const key of order) {
                  if (key === 'ownedShips') player.ownedShips = new Array(payload.ownedShipsLength || 0);
                  else if (key === 'moduleInventory') player.moduleInventory = new Array(payload.moduleInventoryLength || 0);
                  else if (Object.hasOwn(base, key)) player[key] = base[key];
                }
              } else {
                Object.assign(player, base);
              }
              if (!Object.hasOwn(player, 'ownedShips')) player.ownedShips = new Array(payload.ownedShipsLength || 0);
              if (!Object.hasOwn(player, 'moduleInventory')) player.moduleInventory = new Array(payload.moduleInventoryLength || 0);
              session.data.player = player;
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
              mock.onmessage?.({ data: { id, type: 'encoded', ...encoded, workerCpuMs: 0 } });
              return;
            }
            const response = handleSaveWorkerRequest(message);
            if (response) mock.onmessage?.({ data: response });
          });
        },
        terminate() { terminated = true; },
      };
      return mock;
    }
    : () => null;

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
    // The no-worker commit lane awaits real macrotask yields (_restoreFrameYield
    // falls back to setTimeout(0)), so its drain interleaves the queued-task
    // pump with timer hops until the job reports itself finished.
    async drainAsync(limit = 500) {
      for (let turn = 0; turn < limit; turn += 1) {
        this.drain();
        if (!save._autosaveInFlight && tasks.length === 0 && workerTasks.length === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      throw new Error('autosave did not settle within the drain budget');
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
        _warmSaveWorker: original.warmWorker,
        _queueSharedStoreMirror: original.queueMirror,
      });
      if (priorStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = priorStorage;
    },
  };
}

// ── D1 ───────────────────────────────────────────────────────────────────────

test('autosave transaction publishes a mirrorPatch delta, not a whole-corpus collect', () => {
  const state = makeState();
  const harness = installHarness({ state });
  const mirrorCalls = [];
  save._queueSharedStoreMirror = (patch) => { mirrorCalls.push(patch); };
  try {
    // A valid previous generation so the transaction rotates a recovery copy —
    // the patch must carry both the new primary and the rotated bytes.
    const previousJson = JSON.stringify(save.serialize('auto'));
    harness.storage.values.set('sf.save.auto', previousJson);

    assert.equal(save.requestAutosave('mirror_patch_regression', { force: true }), true);
    harness.drain();
    const completed = harness.bus.events.find((entry) => entry.name === 'save:completed');
    assert.ok(completed, 'the autosave transaction must complete');

    assert.equal(mirrorCalls.length, 1,
      'exactly one mirror push — undefined would have fallen into the whole-corpus arm');
    const patch = mirrorCalls[0];
    assert.ok(patch && typeof patch === 'object');
    const storedPrimary = harness.storage.getItem('sf.save.auto');
    assert.ok(storedPrimary && storedPrimary !== previousJson, 'the new generation landed');
    assert.equal(patch['sf.save.auto'], storedPrimary,
      'the patch ships the exact primary bytes this write landed');
    assert.equal(patch['sf.recovery.auto'], previousJson,
      'the patch ships the rotated recovery copy');
    assert.equal(typeof patch['sf.save.index'], 'string',
      'the patch ships the index row _updateIndex just wrote');
    const index = JSON.parse(patch['sf.save.index']);
    assert.ok(index && typeof index === 'object' && index.auto,
      'the mirrored index row carries this slot\'s card');
    assert.equal(harness.storage.getItem('sf.recovery.auto'), previousJson);
  } finally {
    harness.restore();
  }
});

// ── D2 ───────────────────────────────────────────────────────────────────────

test('no-worker autosave rotates a gzipped previous generation to recovery', async () => {
  const state = makeState();
  const harness = installHarness({ state, worker: null });
  try {
    // Gzip is the normal stored form wherever CompressionStream exists. Without the
    // writer-prepare fallback the async lane returns 'compressed_envelope', _writeSlot
    // trusted the failed verdict, and the previous generation was overwritten with
    // no recovery copy.
    const previousEnvelope = save.serialize('auto');
    const previousJson = JSON.stringify(previousEnvelope);
    const gzipped = gzipSaveEnvelopeSync(previousJson, previousEnvelope);
    harness.storage.values.set('sf.save.auto', gzipped);

    assert.equal(save.requestAutosave('gzip_rotation_regression', { force: true }), true);
    await harness.drainAsync();
    const completed = harness.bus.events.find((entry) => entry.name === 'save:completed');
    assert.ok(completed, 'the no-worker autosave must complete');

    const storedPrimary = harness.storage.getItem('sf.save.auto');
    assert.ok(storedPrimary && storedPrimary !== gzipped, 'the new generation landed');
    assert.equal(harness.storage.getItem('sf.recovery.auto'), gzipped,
      'the gzipped previous generation must rotate into the recovery slot');
    const decoded = await decodeSaveEnvelopeText(harness.storage.getItem('sf.recovery.auto'));
    assert.equal(decoded.ok, true);
    assert.equal(JSON.parse(decoded.text).checksum, previousEnvelope.checksum,
      'the recovery copy is the intact previous envelope');
  } finally {
    harness.restore();
  }
});

// ── D5 ───────────────────────────────────────────────────────────────────────

test('worker encode rebuilds data.player in serialized key order (sync-lane byte parity)', async () => {
  const state = makeState();
  // Cross the incremental-capture threshold (256) and put collections mid-record:
  // the sync serializer keeps their in-place positions, so any scalar key after
  // them exposes an end-of-record rebuild.
  state.player.moduleInventory = Array.from({ length: 300 }, (_, index) => ({
    instanceId: `module-${index}`,
    defId: index % 2 ? 'weapon_pulse_laser' : 'module_shield_booster_s',
  }));

  const original = { state: save.state };
  save.state = state;
  let record;
  try {
    record = save._serializePlayer();
  } finally {
    save.state = original.state;
  }
  // Deliberately seat the collections mid-record — serializePlayerRecord's
  // captured-collections arm stamps the same layout on the live path.
  const player = {};
  const scalars = Object.keys(record).filter((key) => key !== 'ownedShips' && key !== 'moduleInventory');
  scalars.forEach((key, index) => {
    player[key] = record[key];
    if (index === 2) player.ownedShips = record.ownedShips;
    if (index === 5) player.moduleInventory = record.moduleInventory;
  });
  const playerKeys = Object.keys(player);
  assert.ok(playerKeys.indexOf('ownedShips') >= 0
    && playerKeys.indexOf('ownedShips') < playerKeys.length - 1,
    'the test needs ownedShips seated ahead of trailing scalar keys');
  assert.ok(playerKeys.indexOf('moduleInventory') >= 0
    && playerKeys.indexOf('moduleInventory') < playerKeys.length - 1,
    'the test needs moduleInventory seated ahead of trailing scalar keys');
  const data = { player };

  const entries = save._autosaveEncoderEntries(data);
  const begin = entries.find((entry) => entry && entry.type === 'encode_player_begin');
  assert.ok(begin, 'incremental player capture must emit encode_player_begin');
  const parts = entries.filter((entry) => entry && entry.type === 'encode_player_part');
  const moduleParts = parts.filter((entry) => entry.collection === 'moduleInventory');
  const shipParts = parts.filter((entry) => entry.collection === 'ownedShips');
  assert.equal(moduleParts.length, 1, '300 modules ride one 512-item encode_player_part post');
  assert.equal(shipParts.length, 1, 'the single owned ship rides one encode_player_part post');

  // Drive the production bundled worker source so the assertion covers the real
  // encode_player_begin assembly, not a re-implementation of it.
  const OriginalWorker = globalThis.Worker;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let workerBlob = null;
  try {
    URL.createObjectURL = (blob) => {
      workerBlob = blob;
      return 'blob:player-order-parity';
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
    const send = (input) => listener({ data: input });

    const id = 91;
    send({ id, type: 'encode_begin', payload: { descriptor: { fmt: 'spaceface-save', version: 22 } } });
    send({ id, type: 'encode_player_begin', payload: begin.payload });
    for (const part of parts) {
      send({
        id,
        type: 'encode_player_part',
        payload: {
          collection: part.collection,
          start: part.start,
          items: part.source.slice(part.start, part.end),
        },
      });
    }
    send({ id, type: 'encode_finish' });
    for (let turn = 0; turn < 500 && response === null; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(response, 'the worker must answer encode_finish');
    assert.equal(response.type, 'encoded');
    assert.notEqual(response.ok, false, `worker refused the envelope: ${response.reason}`);
    const decoded = await decodeSaveEnvelopeText(response.json);
    assert.equal(decoded.ok, true);
    const workerPlayer = JSON.parse(decoded.text).data.player;

    // Byte parity: identical state must serialize to identical bytes on both lanes —
    // the collections keep their mid-record positions, not end-of-record placement.
    assert.equal(JSON.stringify(workerPlayer), JSON.stringify(player));
    assert.deepEqual(Object.keys(workerPlayer), Object.keys(player));
    assert.equal(workerPlayer.moduleInventory.length, 300);
    assert.equal(workerPlayer.ownedShips.length, 1);
  } finally {
    if (OriginalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = OriginalWorker;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

// ── D7 ───────────────────────────────────────────────────────────────────────

test('a superseded receipt does not clear the live writer\'s pending marker', () => {
  const state = makeState();
  const harness = installHarness({ state });
  try {
    // The dead autosave's superseded receipt races the superseding paced save that
    // just re-pended the same slot — clearing here would tell the UI "no write
    // pending" while a write is still in flight.
    state.save.pendingWrite = { slot: 'auto', trigger: 'exit', autosave: false, at: 1, simTime: 1 };
    save._noteWriteOutcome('auto', { slot: 'auto', ok: false, failure: 'superseded' });
    assert.equal(state.save.pendingWrite && state.save.pendingWrite.slot, 'auto',
      'the live writer\'s pending row survives the dead writer\'s receipt');
    assert.equal(state.save.lastWriteFailure, null,
      'a cancellation must not stamp a failure row');

    // …while a real failure on the same slot still settles the marker and ledger.
    save._noteWriteOutcome('auto', { slot: 'auto', ok: false, failure: 'quota', trigger: 'x', autosave: true });
    assert.equal(state.save.pendingWrite, null);
    assert.equal(state.save.lastWriteFailure.reason, 'quota');
    assert.equal(state.save.consecutiveWriteFailures, 1);
  } finally {
    harness.restore();
  }
});
