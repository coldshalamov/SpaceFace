import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import { ensurePerfRuntime } from '../src/core/perfRuntime.js';
import {
  encodeSavePayload,
  handleSaveWorkerRequest,
  SAVE_WORKER_SOURCE,
  validateSaveJson,
} from '../src/save/saveWorker.js';

const PERF_PROBE_SOURCE = fs.readFileSync(
  new URL('../scripts/probe-performance-profile.mjs', import.meta.url),
  'utf8',
);

function largeDataFixture() {
  const data = {
    meta: { seed: 47, playtimeS: 1200 },
    player: { credits: 4200, ownedShips: [{ defId: 'ship_kestrel', fittings: [] }], activeShipIndex: 0 },
    entities: { player: { id: 1, type: 'ship', data: { defId: 'ship_kestrel' } }, persistent: [], tick: 72000 },
    world: { currentSectorId: 'sector_helios_prime', history: [] },
  };
  const buckets = [
    'economy', 'economyContracts', 'factions', 'combat', 'missions', 'careerOrigins',
    'careerLadders', 'scenario', 'automation', 'crafting', 'sectorSim', 'claims',
    'aceMemory', 'lossLedger', 'aftermathWrecks', 'fieldDepletion', 'livingPoiBehaviors',
    'signalInvestigation', 'recoveryEncounters', 'regionalEcology', 'encounterDirector', 'nav', 'settings',
  ];
  for (const key of buckets) data[key] = { history: [] };
  buckets.push('world');
  for (let index = 0; index < 760; index++) {
    data[buckets[index % buckets.length]].history.push({
      id: `receipt-${index}`,
      stationId: `station-${index % 12}`,
      commodityId: `commodity-${index % 18}`,
      detail: `${index}:`.padEnd(560, String(index % 10)),
    });
  }
  return data;
}

function productionStateFixture() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.tick = 72_000;
  state.simTime = 1200;
  state.meta.playtimeS = 1200;
  state.world.currentSectorId = 'sector_helios_prime';
  const player = {
    id: 1, alive: true, type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 9, mass: 18, hull: 100, hullMax: 100,
    flags: { isPlayer: true }, data: { defId: 'ship_kestrel' },
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const buckets = [
    'claims', 'aceMemory', 'lossLedger', 'aftermathWrecks', 'fieldDepletion',
    'livingPoiBehaviors', 'signalInvestigation', 'recoveryEncounters', 'regionalEcology',
  ];
  for (const key of buckets) state[key] = { history: [] };
  state.careers.origins = { history: [] };
  state.careers.ladders = { history: [] };
  state.scenario.history = [];
  state.automation.history = [];
  const destinations = [
    ...buckets.map((key) => state[key].history),
    state.careers.origins.history,
    state.careers.ladders.history,
    state.scenario.history,
    state.automation.history,
  ];
  for (let index = 0; index < 760; index++) {
    destinations[index % destinations.length].push({
      id: `receipt-${index}`,
      stationId: `station-${index % 12}`,
      commodityId: `commodity-${index % 18}`,
      detail: `${index}:`.padEnd(560, String(index % 10)),
    });
  }
  return state;
}

test('worker encoder preserves exact checksum and envelope JSON for the production-sized fixture', () => {
  const data = largeDataFixture();
  const descriptor = {
    fmt: 'spaceface-save', version: CURRENT_VERSION,
    savedAt: '2026-07-12T12:00:00.000Z', playtimeS: 1200, slot: 'auto',
  };
  const result = encodeSavePayload({ descriptor, data });
  assert.ok(result.json.length >= 470_000 && result.json.length <= 500_000,
    `fixture should stay near the observed 473KB envelope, got ${result.json.length}`);
  assert.equal(result.checksum, fnv1a(JSON.stringify(data)));
  const parsed = JSON.parse(result.json);
  assert.deepEqual(parsed, { ...descriptor, checksum: result.checksum, data });
  assert.deepEqual(validateSaveJson(result.json, CURRENT_VERSION), {
    ok: true,
    version: CURRENT_VERSION,
    savedAt: descriptor.savedAt,
    checksum: result.checksum,
  });
});

test('worker validation fails closed on interrupted or checksum-drifted bytes', () => {
  const data = largeDataFixture();
  const descriptor = {
    fmt: 'spaceface-save', version: CURRENT_VERSION,
    savedAt: '2026-07-12T12:00:00.000Z', playtimeS: 1200, slot: 'auto',
  };
  const result = encodeSavePayload({ descriptor, data });
  assert.equal(validateSaveJson(result.json.slice(0, -17), CURRENT_VERSION).ok, false);
  const drifted = result.json.replace('"credits":4200', '"credits":4201');
  assert.deepEqual(validateSaveJson(drifted, CURRENT_VERSION), { ok: false, reason: 'checksum' });
});

test('worker validation accepts a save through bounded string chunks', () => {
  const data = largeDataFixture();
  const descriptor = {
    fmt: 'spaceface-save', version: CURRENT_VERSION,
    savedAt: '2026-07-12T12:00:00.000Z', playtimeS: 1200, slot: 'auto',
  };
  const { json } = encodeSavePayload({ descriptor, data });
  const id = 91;
  assert.equal(handleSaveWorkerRequest({
    id, type: 'validate_begin', payload: { currentVersion: CURRENT_VERSION },
  }), null);
  for (let offset = 0; offset < json.length; offset += 16_384) {
    assert.equal(handleSaveWorkerRequest({
      id, type: 'validate_part', payload: { chunk: json.slice(offset, offset + 16_384) },
    }), null);
  }
  const response = handleSaveWorkerRequest({ id, type: 'validate_finish' });
  assert.equal(response.type, 'validated');
  assert.equal(response.result.ok, true);
  assert.equal(response.result.checksum, fnv1a(JSON.stringify(data)));
});

test('bundled Blob worker source executes the same encoder without a separate runtime file', () => {
  let listener = null;
  let response = null;
  const self = {
    addEventListener(name, callback) { if (name === 'message') listener = callback; },
    postMessage(value) { response = value; },
  };
  Function('self', 'performance', SAVE_WORKER_SOURCE)(self, globalThis.performance);
  const data = largeDataFixture();
  listener({ data: {
    id: 7,
    type: 'encode',
    payload: {
      descriptor: { fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt: 'x', playtimeS: 1, slot: 'auto' },
      data,
    },
  } });
  assert.equal(response.type, 'encoded');
  assert.equal(response.checksum, fnv1a(JSON.stringify(data)));
  const parsed = JSON.parse(response.json).data;
  assert.equal(Object.values(parsed).reduce((sum, value) => (
    sum + (value && Array.isArray(value.history) ? value.history.length : 0)
  ), 0), 760);
});

test('production Blob worker lifecycle revokes its URL on terminate and construction error', () => {
  const OriginalWorker = globalThis.Worker;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalWorkers = save._activeSaveWorkers;
  const urls = [];
  const revoked = [];
  try {
    URL.createObjectURL = (blob) => {
      assert.ok(blob instanceof Blob);
      const url = `blob:bounded-save-${urls.length}`;
      urls.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => { revoked.push(url); };
    globalThis.Worker = class {
      constructor(url) { this.url = url; }
      postMessage() {}
      terminate() {}
    };
    save._activeSaveWorkers = new Set();
    const worker = save._createSaveWorker();
    assert.ok(worker);
    assert.equal(save._activeSaveWorkers.size, 1);
    worker.terminate();
    assert.equal(save._activeSaveWorkers.size, 0);
    assert.deepEqual(revoked, ['blob:bounded-save-0']);

    globalThis.Worker = class { constructor() { throw new Error('worker construction failed'); } };
    assert.equal(save._createSaveWorker(), null);
    assert.deepEqual(revoked, ['blob:bounded-save-0', 'blob:bounded-save-1']);
  } finally {
    if (OriginalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = OriginalWorker;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    save._activeSaveWorkers = originalWorkers;
  }
});

function memoryStorage() {
  const values = new Map();
  const operations = [];
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { operations.push(['get', String(key)]); return values.get(String(key)) ?? null; },
    setItem(key, value) { operations.push(['set', String(key)]); values.set(String(key), String(value)); },
    removeItem(key) { operations.push(['remove', String(key)]); values.delete(String(key)); },
    operations,
  };
}

async function waitForCondition(predicate, pump, limit = 200) {
  for (let turn = 0; turn < limit; turn++) {
    if (predicate()) return true;
    if (typeof pump === 'function') pump();
    await new Promise((resolve) => setImmediate(resolve));
  }
  return predicate();
}

function assertCanonicalSaveData(raw, message = 'worker save must match canonical serialization exactly') {
  const restored = JSON.parse(raw);
  const liveTick = save.state.tick;
  save.state.tick = restored.data.entities.tick;
  let canonical;
  try { canonical = save.serializeData(); }
  finally { save.state.tick = liveTick; }
  // Both canonical paths intentionally stamp their own call time. Normalize only that volatile
  // metadata field; every durable gameplay field and key order remains an exact comparison.
  canonical.meta.lastSavedAt = restored.data.meta.lastSavedAt;
  assert.deepEqual(restored.data, canonical, message);
}

function pumpAutosaveUntil(harness, predicate, message, limit = 500) {
  for (let turn = 0; turn < limit; turn++) {
    if (predicate()) return;
    harness.step();
  }
  assert.fail(message);
}

function autosaveHarness({
  interruptFirstWorker = false,
  productionCapture = false,
  workerSetupMs = 0,
  cloneFloorMs = 0,
  advanceTickSerializations = 0,
  advanceTickEveryScheduledTurn = false,
  trackProductionSerializers = false,
  serializerFloorMs = 0,
} = {}) {
  const previousStorage = globalThis.localStorage;
  const originals = {
    state: save.state, bus: save.bus, helpers: save.helpers, registry: save.registry,
    capturePlan: save._saveCapturePlan, schedule: save._scheduleAutosaveWork,
    createWorker: save._createSaveWorker, hasPlayer: save._hasPlayerEntity,
    pending: save._autosavePending, inFlight: save._autosaveInFlight,
    generation: save._autosaveGeneration, requestId: save._saveWorkerRequestId,
    runEpoch: save._runEpoch, activeWorkers: save._activeSaveWorkers,
    activeJob: save._activeAutosaveJob, activeTransaction: save._activeAutosaveTransaction,
    lastAt: save._lastAutosaveAt, lastPlaytime: save._lastAutosavePlaytime,
    restoring: save._restoring, restoreSequence: save._restoreSequence, playerDead: save._playerDead,
  };
  const storage = memoryStorage();
  const tasks = [];
  const workerTasks = [];
  const events = [];
  const fixture = largeDataFixture();
  let workerCount = 0;
  let workerTerminations = 0;
  let tickAdvances = 0;
  let scheduledTurns = 0;
  const serializerCalls = new Map();
  const state = productionCapture ? productionStateFixture() : {
    tick: fixture.entities.tick,
    meta: { playtimeS: 1200, lastSavedAt: '' },
    save: { currentSlot: null, lastAutosaveAt: null },
    player: fixture.player,
    world: { currentSectorId: 'sector_helios_prime', sectors: { sector_helios_prime: { name: 'Helios Prime' } } },
    nav: {}, missions: { active: [] }, story: {}, ui: {}, mode: 'flight', jump: { state: 'IDLE' },
  };
  ensurePerfRuntime(state);
  globalThis.localStorage = storage;
  const handlers = new Map();
  const bus = {
    on(name, callback) {
      const list = handlers.get(name) || [];
      list.push(callback);
      handlers.set(name, list);
      return () => this.off(name, callback);
    },
    off(name, callback) {
      const list = handlers.get(name) || [];
      handlers.set(name, list.filter((entry) => entry !== callback));
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const callback of [...(handlers.get(name) || [])]) callback(payload);
    },
  };
  const registry = {
    get(name) {
      if (name !== 'economy' || advanceTickSerializations <= 0) return null;
      return {
        serialize() {
          if (tickAdvances < advanceTickSerializations) {
            state.tick++;
            tickAdvances++;
          }
          return state.economy;
        },
      };
    },
  };
  save.init({ state, bus, helpers: {}, registry });
  save._hasPlayerEntity = () => true;
  if (productionCapture && trackProductionSerializers) {
    const productionPlan = save._saveCapturePlan.bind(save);
    save._saveCapturePlan = () => productionPlan().map(([key, read]) => [key, () => {
      serializerCalls.set(key, (serializerCalls.get(key) || 0) + 1);
      const value = read();
      const until = performance.now() + serializerFloorMs;
      while (performance.now() < until) { /* deterministic multi-slice starvation fixture */ }
      return value;
    }]);
  }
  if (!productionCapture) {
    save._saveCapturePlan = () => Object.entries(fixture).map(([key, value]) => [key, () => structuredClone(value)]);
  }
  save._scheduleAutosaveWork = (callback) => {
    tasks.push(() => {
      scheduledTurns++;
      if (advanceTickEveryScheduledTurn) {
        state.tick++;
        tickAdvances++;
      }
      callback();
    });
    return tasks.length;
  };
  save._createSaveWorker = () => {
    const setupUntil = performance.now() + workerSetupMs;
    while (performance.now() < setupUntil) { /* measured worker/blob setup stand-in */ }
    const number = ++workerCount;
    let terminated = false;
    return {
      onmessage: null,
      onerror: null,
      postMessage(message) {
        const cloneStarted = performance.now();
        const cloned = structuredClone(message);
        const cloneUntil = cloneStarted + cloneFloorMs;
        while (performance.now() < cloneUntil) { /* measured structured-clone stand-in */ }
        workerTasks.push(() => {
          if (terminated) return;
          if (interruptFirstWorker && number === 1) this.onerror?.(new Error('interrupted'));
          else {
            const response = handleSaveWorkerRequest(cloned);
            if (response) this.onmessage?.({ data: response });
          }
        });
      },
      terminate() { terminated = true; workerTerminations++; },
    };
  };
  save._autosavePending = null;
  save._autosaveInFlight = false;
  save._autosaveGeneration = 0;
  save._saveWorkerRequestId = 0;
  save._lastAutosaveAt = -Infinity;
  save._lastAutosavePlaytime = 0;
  save._restoring = false;
  save._restoreSequence = 0;
  save._playerDead = false;

  return {
    storage, tasks, workerTasks, events, fixture, state, bus,
    get workerTerminations() { return workerTerminations; },
    get workerCount() { return workerCount; },
    get tickAdvances() { return tickAdvances; },
    get scheduledTurns() { return scheduledTurns; },
    serializerCalls,
    drain(limit = 200) {
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
        state: originals.state, bus: originals.bus, helpers: originals.helpers, registry: originals.registry,
        _saveCapturePlan: originals.capturePlan, _scheduleAutosaveWork: originals.schedule,
        _createSaveWorker: originals.createWorker, _hasPlayerEntity: originals.hasPlayer,
        _autosavePending: originals.pending, _autosaveInFlight: originals.inFlight,
        _autosaveGeneration: originals.generation, _saveWorkerRequestId: originals.requestId,
        _runEpoch: originals.runEpoch, _activeSaveWorkers: originals.activeWorkers,
        _activeAutosaveJob: originals.activeJob, _activeAutosaveTransaction: originals.activeTransaction,
        _lastAutosaveAt: originals.lastAt, _lastAutosavePlaytime: originals.lastPlaytime,
        _restoring: originals.restoring, _restoreSequence: originals.restoreSequence,
        _playerDead: originals.playerDead,
      });
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
    },
  };
}

test('production capture plan is fixed-tick, worker-encoded, phased, and reports every sync-wall observation', () => {
  const h = autosaveHarness({ productionCapture: true });
  try {
    const old = encodeSavePayload({
      descriptor: { fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt: '2026-07-12T11:00:00.000Z', playtimeS: 1100, slot: 'auto' },
      data: largeDataFixture(),
    }).json;
    h.storage.setItem('sf.save.auto', old);
    h.storage.operations.length = 0;
    assert.equal(save.requestAutosave('bounded', { force: true }), true);
    h.drain();

    const complete = h.events.find((event) => event.name === 'save:completed');
    assert.ok(complete, `worker path must publish one completed receipt; receipts=${JSON.stringify(h.events.filter((event) => event.name.startsWith('save:')))}`);
    assert.equal(h.events.some((event) => event.name === 'save:error'), false);
    assert.equal(typeof complete.payload.maxBlockingPhase, 'string');
    assert.equal(complete.payload.blockingClock, 'high_resolution_sync_wall');
    assert.equal(complete.payload.totalBlockingMs, complete.payload.totalCpuMs,
      'legacy totalCpuMs must remain an exact alias for synchronous wall/block observations');
    assert.equal(complete.payload.observedTargetMet, true,
      `raw receipt must meet the 8ms packet target; ${JSON.stringify(complete.payload.blockingSamples)}`);
    assert.equal(complete.payload.observedHardLimitMet, true,
      'raw receipt must meet the unchanged 12ms hard limit');
    assert.ok(Number.isFinite(complete.payload.captureStartedAtMs)
      && Number.isFinite(complete.payload.captureEndedAtMs)
      && complete.payload.captureEndedAtMs >= complete.payload.captureStartedAtMs,
    'receipt must expose the exact browser-clock capture interval for long-task attribution');
    assert.ok(complete.payload.workerSetupMs >= 0
      && complete.payload.blockingSamples.some(({ phase }) => phase === 'encode_worker_setup'),
    'worker/blob construction must be included in measured main-thread timing even below clock resolution');
    assert.ok(complete.payload.workerDispatchMs > 0,
      'structured-clone dispatch must be included in measured main-thread timing');
    assert.ok(complete.payload.workerRoundtripMs >= complete.payload.workerDispatchMs,
      'worker roundtrip wall latency must be reported separately from synchronous dispatch CPU');
    assert.equal(complete.payload.serializerTimings.length >= 29, true,
      'every production serializer must carry an individual timing sample');
    assert.deepEqual(
      [...new Set(complete.payload.serializerTimings.map(({ key }) => key))],
      save._saveCapturePlan().map(([key]) => key),
    );
    if (complete.payload.maxSerializerMs > complete.payload.hardSliceMs) {
      assert.equal(typeof complete.payload.slowSerializer, 'string',
        'a raw serializer wall observation over 12ms must remain attributed in telemetry');
    }
    if (process.env.SF_AUTOSAVE_DIAGNOSTICS === '1') {
      const phases = {};
      for (const sample of complete.payload.blockingSamples) {
        const phase = phases[sample.phase] || { count: 0, totalMs: 0, maxMs: 0 };
        phase.count++;
        phase.totalMs += sample.ms;
        phase.maxMs = Math.max(phase.maxMs, sample.ms);
        phases[sample.phase] = phase;
      }
      console.log('[autosave-distribution]', JSON.stringify({
        bytes: complete.payload.bytes,
        totalCpuMs: complete.payload.totalCpuMs,
        workerCpuMs: complete.payload.stringifyMs,
        maxBlockingSliceMs: complete.payload.maxBlockingSliceMs,
        maxBlockingPhase: complete.payload.maxBlockingPhase,
        maxSerializerMs: complete.payload.maxSerializerMs,
        phases,
      }));
    }
    const raw = h.storage.getItem('sf.save.auto');
    const restored = JSON.parse(raw);
    assertCanonicalSaveData(raw, 'incremental worker path must preserve exact canonical save data');
    assert.ok(raw.length >= 430_000 && raw.length <= 520_000,
      `production serializer fixture should remain near the observed 473KB envelope, got ${raw.length}`);
    assert.equal(restored.checksum, fnv1a(JSON.stringify(restored.data)));
    assert.equal(restored.data.entities.tick, 72000);
    assert.deepEqual(Object.keys(restored.data), save._saveCapturePlan().map(([key]) => key));
    const durableHistories = [
      restored.data.claims, restored.data.aceMemory, restored.data.lossLedger,
      restored.data.aftermathWrecks, restored.data.fieldDepletion,
      restored.data.livingPoiBehaviors, restored.data.signalInvestigation,
      restored.data.recoveryEncounters, restored.data.regionalEcology,
      restored.data.careerOrigins, restored.data.careerLadders,
      restored.data.scenario, restored.data.automation,
    ];
    assert.equal(durableHistories.reduce((sum, item) => sum + (item.history?.length || 0), 0), 760);
    assert.equal(h.storage.getItem('sf.recovery.auto'), old);
    const writes = h.storage.operations.filter(([kind]) => kind === 'set').map(([, key]) => key);
    assert.deepEqual(writes.slice(0, 3), ['sf.recovery.auto', 'sf.save.auto', 'sf.save.index']);
    assert.equal(h.state.tick, 72000, 'autosave must not mutate simulation tick/state');
    const saves = h.state.perfRuntime.getReport().saves;
    assert.equal(saves.autosaveCount, 1);
    assert.equal(saves.backup.samples, 1);
    assert.equal(saves.readback.samples, 1);
    assert.equal(saves.verify.samples, 1);
    assert.equal(saves.workerSetup.samples, 1);
    assert.equal(saves.workerDispatch.samples, 1);
    assert.equal(saves.workerRoundtrip.samples, 1);
    assert.equal(saves.maxSerializer.samples, 1);
    assert.equal(saves.totalBlocking.samples, 1);
    assert.equal(saves.targetMissCount, 0);
    assert.equal(saves.hardLimitMissCount, 0);
  } finally { h.restore(); }
});

test('three serial production autosaves each preserve exact data and meet the raw 8/12ms receipt limits', () => {
  const h = autosaveHarness({ productionCapture: true });
  try {
    const receipts = [];
    for (let run = 0; run < 3; run++) {
      const eventStart = h.events.length;
      assert.equal(save.requestAutosave(`serial_${run}`, { force: true }), true);
      h.drain();
      const completed = h.events.slice(eventStart).find((event) => event.name === 'save:completed');
      assert.ok(completed, `serial autosave ${run + 1} must complete`);
      receipts.push(completed.payload);
      assert.equal(completed.payload.observedTargetMet, true,
        `serial autosave ${run + 1} must meet the raw 8ms target`);
      assert.equal(completed.payload.observedHardLimitMet, true,
        `serial autosave ${run + 1} must meet the raw 12ms hard limit`);
      assertCanonicalSaveData(h.storage.getItem('sf.save.auto'),
        `serial autosave ${run + 1} must match canonical serialization exactly`);
    }
    assert.equal(receipts.length, 3);
  } finally { h.restore(); }
});

test('six simultaneous autosave requests coalesce into one exact production save', () => {
  const h = autosaveHarness({ productionCapture: true });
  try {
    const accepted = Array.from({ length: 6 }, (_, index) => (
      save.requestAutosave(`simultaneous_${index}`, { force: true })
    ));
    assert.deepEqual(accepted, [true, false, false, false, false, false]);
    h.drain();
    const completed = h.events.filter((event) => event.name === 'save:completed');
    assert.equal(completed.length, 1);
    assert.equal(h.events.some((event) => event.name === 'save:error'), false);
    assertCanonicalSaveData(h.storage.getItem('sf.save.auto'));
  } finally { h.restore(); }
});

test('interrupted encode worker falls back safely and keeps generation recovery playable', () => {
  const h = autosaveHarness({ interruptFirstWorker: true });
  try {
    const old = encodeSavePayload({
      descriptor: { fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt: '2026-07-12T11:00:00.000Z', playtimeS: 1100, slot: 'auto' },
      data: largeDataFixture(),
    }).json;
    h.storage.setItem('sf.save.auto', old);
    assert.equal(save.requestAutosave('worker_interrupt', { force: true }), true);
    h.drain();
    assert.ok(h.events.some((event) => event.name === 'save:completed'),
      `retry should complete; receipts=${JSON.stringify(h.events.filter((event) => event.name.startsWith('save:')))}`);
    assert.ok(h.workerCount >= 2, 'an interrupted encoder must retry in a fresh worker before sync fallback');
    assert.equal(validateSaveJson(h.storage.getItem('sf.save.auto'), CURRENT_VERSION).ok, true);
    assert.equal(h.storage.getItem('sf.recovery.auto'), old);
    assert.equal(save._autosaveInFlight, false);
  } finally { h.restore(); }
});

test('restore generation supersedes an in-flight worker result exactly once without overwriting the prior save', async () => {
  const h = autosaveHarness();
  try {
    const old = encodeSavePayload({
      descriptor: { fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt: '2026-07-12T11:00:00.000Z', playtimeS: 1100, slot: 'auto' },
      data: largeDataFixture(),
    }).json;
    h.storage.setItem('sf.save.auto', old);
    assert.equal(save.requestAutosave('superseded', { force: true }), true);
    h.tasks.shift()();
    save._beginRestoreSequence();
    assert.equal(await waitForCondition(
      () => h.events.some((event) => event.name === 'save:error' && event.payload.failure === 'superseded'),
      () => h.step(),
    ), true, 'restore supersession receipt must arrive by condition, not an arbitrary delay');
    h.drain();
    assert.equal(h.storage.getItem('sf.save.auto'), old);
    assert.equal(h.events.filter((event) => (
      event.name === 'save:error' && event.payload.failure === 'superseded'
    )).length, 1, 'restore supersession must publish exactly one terminal receipt');
    assert.equal(save._autosaveInFlight, false);
  } finally { h.restore(); }
});

test('new-game and restore cancellation roll back every transaction phase with one terminal receipt', () => {
  const phaseCases = [
    {
      name: 'encode_worker', transition: 'restore', previous: true,
      reached: (h) => save._activeSaveWorkers.size > 0 && !save._activeAutosaveTransaction,
    },
    {
      name: 'read_previous', transition: 'new_game', previous: true,
      reached: () => !!save._activeAutosaveTransaction?.tx?.previousRaw,
    },
    {
      name: 'backup_written', transition: 'restore', previous: true,
      reached: (h) => h.storage.operations.some(([kind, key]) => kind === 'set' && key === 'sf.recovery.auto'),
    },
    {
      name: 'primary_written_new_game', transition: 'new_game', previous: true,
      reached: (h) => h.storage.operations.some(([kind, key]) => kind === 'set' && key === 'sf.save.auto'),
    },
    {
      name: 'primary_written_restore', transition: 'restore', previous: true,
      reached: (h) => h.storage.operations.some(([kind, key]) => kind === 'set' && key === 'sf.save.auto'),
    },
    {
      name: 'readback_started', transition: 'new_game', previous: true,
      reached: (h) => h.storage.operations.filter(([kind, key]) => kind === 'get' && key === 'sf.save.auto').length >= 2,
    },
    {
      name: 'primary_without_previous', transition: 'restore', previous: false,
      reached: (h) => h.storage.operations.some(([kind, key]) => kind === 'set' && key === 'sf.save.auto'),
    },
  ];

  for (const phase of phaseCases) {
    const h = autosaveHarness({ productionCapture: true });
    try {
      const old = phase.previous ? encodeSavePayload({
        descriptor: { fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt: '2026-07-12T11:00:00.000Z', playtimeS: 1100, slot: 'auto' },
        data: largeDataFixture(),
      }).json : null;
      if (old) h.storage.setItem('sf.save.auto', old);
      h.storage.operations.length = 0;
      assert.equal(save.requestAutosave(`cancel_${phase.name}`, { force: true }), true);
      pumpAutosaveUntil(h, () => phase.reached(h), `never reached ${phase.name}`);

      if (phase.transition === 'new_game') h.bus.emit('game:new');
      else save._beginRestoreSequence();
      h.drain(500);

      assert.equal(h.storage.getItem('sf.save.auto'), old,
        `${phase.name} cancellation must restore the prior primary or remove a newly-created slot`);
      const cancellations = h.events.filter((event) => (
        event.name === 'save:error' && event.payload.failure === 'superseded'
      ));
      assert.equal(cancellations.length, 1, `${phase.name} must publish exactly one terminal cancellation`);
      assert.equal(h.events.some((event) => event.name === 'save:completed'), false);
      assert.equal(save._autosaveInFlight, false);
      assert.equal(save._activeAutosaveJob, null);
      assert.equal(save._activeAutosaveTransaction, null);
      assert.equal(h.tasks.length, 0);
      assert.equal(h.workerTasks.length, 0);
    } finally { h.restore(); }
  }
});

test('production snapshot completes during 120+ continuously advancing scheduled turns without rerunning serializers', () => {
  const h = autosaveHarness({
    productionCapture: true,
    advanceTickEveryScheduledTurn: true,
    trackProductionSerializers: true,
    serializerFloorMs: 0.12,
    cloneFloorMs: 4.2,
  });
  try {
    const old = encodeSavePayload({
      descriptor: { fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt: '2026-07-12T11:00:00.000Z', playtimeS: 1100, slot: 'auto' },
      data: largeDataFixture(),
    }).json;
    h.storage.setItem('sf.save.auto', old);
    h.storage.operations.length = 0;
    assert.equal(save.requestAutosave('live_tick_churn', { force: true }), true);
    for (let turn = 0; turn < 400 && !h.events.some((event) => (
      event.name === 'save:completed' || event.name === 'save:error'
    )); turn++) h.step();

    assert.ok(h.scheduledTurns >= 120,
      `fixture must exercise at least 120 tick-advancing task boundaries, got ${h.scheduledTurns}`);
    assert.ok(h.tickAdvances >= 120,
      `ticks must advance across scheduled hops, got ${h.tickAdvances}`);
    const completed = h.events.find((event) => event.name === 'save:completed');
    assert.ok(completed,
      `live-tick autosave must terminate; events=${JSON.stringify(h.events.filter((event) => event.name.startsWith('save:')))}`);
    const raw = h.storage.getItem('sf.save.auto');
    const restored = JSON.parse(raw);
    assertCanonicalSaveData(raw, 'live-tick capture must equal the canonical 29-key snapshot at its captured tick');
    assert.deepEqual(Object.keys(restored.data), save._saveCapturePlan().map(([key]) => key));
    assert.equal(h.serializerCalls.size, 29);
    for (const [key, calls] of h.serializerCalls) {
      assert.equal(calls, 1, `${key} serializer must run exactly once`);
    }
    assert.equal(completed.payload.serializerTimings.length, 29);
    h.drain(400);
    assert.equal(h.tasks.length, 0);
    assert.equal(h.workerTasks.length, 0);
    assert.equal(save._autosaveInFlight, false);
    assert.equal(save._activeAutosaveJob, null);
    assert.equal(save._activeAutosaveTransaction, null);
  } finally { h.restore(); }
});

test('raw blocking observations are never rounded below the 8/12ms receipt thresholds', () => {
  const targetOverage = 8.000_001;
  const hardOverage = 12.000_001;
  const timing = save._saveTiming({
    slot: 'auto', reason: 'threshold_truth', autosave: true, started: performance.now(),
    blockingSamples: [
      { phase: 'target_boundary', ms: targetOverage },
      { phase: 'hard_boundary', ms: hardOverage },
    ],
  });
  assert.deepEqual(timing.blockingSamples, [
    { phase: 'target_boundary', ms: targetOverage },
    { phase: 'hard_boundary', ms: hardOverage },
  ]);
  assert.equal(timing.maxBlockingSliceMs, hardOverage);
  assert.equal(timing.observedTargetMet, false);
  assert.equal(timing.observedHardLimitMet, false,
    'every raw observation above 12ms must fail the hard flag, even below display rounding precision');
});

test('an indivisible 14ms serializer trips the unchanged hard-budget telemetry without losing the save', () => {
  const h = autosaveHarness();
  const originalPlan = save._saveCapturePlan;
  try {
    save._saveCapturePlan = () => {
      const plan = originalPlan.call(save);
      plan[0] = ['heavy-real-serializer', () => {
        const until = performance.now() + 14;
        while (performance.now() < until) { /* intentional test load */ }
        return { captured: true };
      }];
      return plan;
    };
    assert.equal(save.requestAutosave('heavy_serializer', { force: true }), true);
    h.drain();
    const completed = h.events.find((event) => event.name === 'save:completed');
    assert.ok(completed, 'timing contention must never turn a valid snapshot into data loss');
    assert.equal(completed.payload.targetSliceMs, 8);
    assert.equal(completed.payload.hardSliceMs, 12);
    assert.equal(completed.payload.observedHardLimitMet, false);
    assert.ok(completed.payload.maxSerializerMs >= 12);
    assert.equal(completed.payload.slowSerializer, 'heavy-real-serializer');
    assert.equal(validateSaveJson(h.storage.getItem('sf.save.auto'), CURRENT_VERSION).ok, true);
    const saves = h.state.perfRuntime.getReport().saves;
    assert.equal(saves.targetMissCount, 1);
    assert.equal(saves.hardLimitMissCount, 1);
  } finally { h.restore(); }
});

test('new-game run epoch supersedes an in-flight autosave before any old-run write', () => {
  const h = autosaveHarness();
  try {
    const old = encodeSavePayload({
      descriptor: { fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt: '2026-07-12T11:00:00.000Z', playtimeS: 1100, slot: 'auto' },
      data: largeDataFixture(),
    }).json;
    h.storage.setItem('sf.save.auto', old);
    // This case proves lifecycle cancellation, not production-size capture (covered above). Keep
    // capture tiny so controller CPU contention cannot finish/fail the snapshot before the route event.
    save._saveCapturePlan = () => [['lifecycle', () => ({ run: 'old' })]];
    assert.equal(save.requestAutosave('old_run', { force: true }), true);
    while (h.tasks.length && h.workerTasks.length === 0) h.tasks.shift()();
    assert.equal(save._activeSaveWorkers.size, 1, 'encode worker should be live before route transition');
    h.bus.emit('game:new');
    assert.equal(save._activeSaveWorkers.size, 0, 'new run must terminate live save workers immediately');
    assert.equal(h.workerTerminations, 1);
    h.drain();
    assert.equal(h.storage.getItem('sf.save.auto'), old);
    assert.equal(save._autosaveInFlight, false);
    const epoch = save._runEpoch;
    h.bus.emit('game:newGame');
    assert.equal(save._runEpoch, epoch + 1, 'secondary newGame lifecycle event also advances the run epoch');
  } finally { h.restore(); }
});

test('crowded-flight probe enforces the save system 12ms serializer and capture-task contract', () => {
  assert.match(
    PERF_PROBE_SOURCE,
    /const AUTOSAVE_DURATION_BUDGET_MS\s*=\s*Number\([^;]+\|\|\s*12\s*\)/,
    'the live perf probe must default to the save system hard 12ms observation threshold',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /budget\('autosave\.maxSerializer\.max',[\s\S]{0,240}AUTOSAVE_DURATION_BUDGET_MS/,
    'crowded flight must fail when an individual production serializer exceeds 12ms',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /budget\('autosave\.maxBlockingSlice\.max',[\s\S]{0,240}AUTOSAVE_DURATION_BUDGET_MS/,
    'crowded flight must fail when any autosave browser task exceeds 12ms',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /budget\('autosave\.requestCall\.max',[\s\S]{0,240}AUTOSAVE_DURATION_BUDGET_MS/,
    'crowded flight must fail when requestAutosave blocks past 12ms',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /budget\('autosave\.captureLongTasks\.max',[\s\S]{0,240}'<=',\s*0/,
    'crowded flight must reject a main-thread long task overlapping autosave capture',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /budget\('autosave\.errors\.max',[\s\S]{0,240}'<=',\s*0/,
    'crowded flight must reject every save:error receipt',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /new PerformanceObserver\([\s\S]{0,500}entryTypes:\s*\['longtask'\]/,
    'the browser sample must observe real main-thread long tasks instead of inferring them from wall time',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /maxSerializerMs:\s*seriesStats\(maxSerializers\)/,
    'autosave summary must retain the completed receipt serializer maximum',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /captureLongTaskCount:\s*autosaveCaptureLongTasks\.length/,
    'autosave summary must expose capture-overlapping long-task count',
  );
});

test('production scheduler prefers prompt hops and never arms a 250ms idle deadline per work item', () => {
  const source = fs.readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /_scheduleAutosaveWork\s*\(\s*callback\s*,\s*retry\s*=\s*false\s*\)\s*\{[\s\S]*?return setTimeout\(callback,\s*retry \? 120 : 0\);/,
    'production autosave hops must use prompt setTimeout(0) scheduling (retry keeps 120ms backoff)',
  );
  assert.doesNotMatch(
    source,
    /requestIdleCallback\s*\(\s*callback\s*,\s*\{\s*timeout:\s*250\s*\}\s*\)/,
    'per-hop requestIdleCallback({timeout:250}) starves encode under crowded-flight pressure and is forbidden',
  );
  assert.match(
    source,
    /AUTOSAVE_TARGET_SLICE_MS\s*=\s*8/,
    'target slice budget must remain 8ms',
  );
  assert.match(
    source,
    /AUTOSAVE_HARD_SLICE_MS\s*=\s*12/,
    'hard slice budget must remain 12ms and must never be relaxed',
  );
  assert.match(
    source,
    /while \(encoder\.index < encoder\.entries\.length\)[\s\S]{0,400}AUTOSAVE_TARGET_SLICE_MS/,
    'encode_part dispatch must batch multiple keys per scheduled callback under the 8ms target',
  );
  assert.match(
    source,
    /while \(offset < payload\.raw\.length\)[\s\S]{0,400}AUTOSAVE_TARGET_SLICE_MS/,
    'validation dispatch must batch multiple chunks per scheduled callback under the 8ms target',
  );
});

test('batched encode_part dispatch uses far fewer schedule turns than save keys while still completing', () => {
  const h = autosaveHarness({ productionCapture: true });
  try {
    assert.equal(save.requestAutosave('batched_encode', { force: true }), true);
    // Pump only through encode scheduling: stop once worker encode finishes (transaction begins
    // or terminal receipt). Count encode-phase scheduled turns separately from full drain.
    let encodeScheduleTurns = 0;
    const encodePhaseLimit = 200;
    for (let turn = 0; turn < encodePhaseLimit; turn++) {
      if (save._activeAutosaveTransaction || h.events.some((event) => (
        event.name === 'save:completed' || event.name === 'save:error'
      ))) break;
      if (h.tasks.length) {
        encodeScheduleTurns++;
        h.tasks.shift()();
      }
      if (h.workerTasks.length) h.workerTasks.shift()();
      if (!h.tasks.length && !h.workerTasks.length
        && !save._activeAutosaveTransaction
        && !h.events.some((event) => event.name === 'save:completed' || event.name === 'save:error')) {
        // allow microtask/timeout-driven progress in harness via drain step
        h.step();
      }
    }
    h.drain();
    const completed = h.events.find((event) => event.name === 'save:completed');
    assert.ok(completed, 'batched encode path must complete');
    const keyCount = completed.payload.serializerTimings.length;
    assert.ok(keyCount >= 29, `production capture should expose many keys, got ${keyCount}`);
    // Pre-repair: one hop per key plus setup ≈ keyCount+. Batched path must stay well under that.
    assert.ok(
      h.scheduledTurns < keyCount,
      `total scheduled turns (${h.scheduledTurns}) must be below capture key count (${keyCount}) after batching`,
    );
    assert.ok(
      encodeScheduleTurns < keyCount,
      `encode-phase schedule turns (${encodeScheduleTurns}) must be below key count (${keyCount})`,
    );
    assert.ok(
      encodeScheduleTurns <= Math.ceil(keyCount / 2) + 4,
      `encode-phase schedule turns should be a small batch count, got ${encodeScheduleTurns} for ${keyCount} keys`,
    );
    assert.equal(completed.payload.observedHardLimitMet, true,
      'batched encode must still meet the raw 12ms hard limit when posts are cheap');
    assert.equal(completed.payload.hardSliceMs, 12);
    assert.equal(completed.payload.targetSliceMs, 8);
    assertCanonicalSaveData(h.storage.getItem('sf.save.auto'));
  } finally { h.restore(); }
});

test('batched worker dispatch yields before repeated clone posts can cross the 12ms hard slice', () => {
  const h = autosaveHarness({ productionCapture: true, cloneFloorMs: 6.2 });
  try {
    assert.equal(save.requestAutosave('bounded_clone_headroom', { force: true }), true);
    h.drain(500);
    const completed = h.events.find((event) => event.name === 'save:completed');
    assert.ok(completed, 'cost-aware encode and validation batches must still complete');
    const batchedDispatches = completed.payload.blockingSamples.filter(({ phase }) => (
      phase === 'encode_part_dispatch'
      || phase.endsWith('validate_chunk_dispatch')
      || phase.endsWith('validate_finish_dispatch')
    ));
    assert.ok(batchedDispatches.length > 4,
      `fixture must exercise repeated worker dispatch tasks; got ${JSON.stringify(batchedDispatches)}`);
    assert.equal(completed.payload.observedHardLimitMet, true,
      `repeated clone posts must yield before crossing 12ms; ${JSON.stringify(batchedDispatches)}`);
    assert.ok(batchedDispatches.every(({ ms }) => ms <= completed.payload.hardSliceMs),
      `every batched worker dispatch must remain within the raw hard slice; ${JSON.stringify(batchedDispatches)}`);
    assertCanonicalSaveData(h.storage.getItem('sf.save.auto'));
  } finally { h.restore(); }
});

test('crowded-flight probe keeps listeners and records settle wait for in-flight autosave', () => {
  assert.match(
    PERF_PROBE_SOURCE,
    /AUTOSAVE_SETTLE_TIMEOUT_MS\s*=\s*5000/,
    'probe must arm a hard settle timeout after the sample window',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /settled:\s*null/,
    'autosaveProbe must expose a settled field',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /settleWaitMs:\s*null/,
    'autosaveProbe must expose settleWaitMs',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /settled:\s*probe \? probe\.settled : null/,
    'autosaveSummary must surface settled from the probe',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /settleWaitMs:\s*round\(probe && probe\.settleWaitMs\)/,
    'autosaveSummary must surface settleWaitMs from the probe',
  );
  // Sample end must not immediately unsubscribe when a requested autosave is still in flight.
  assert.match(
    PERF_PROBE_SOURCE,
    /autosaveStillInFlight[\s\S]{0,1200}hardSettleTimerId\s*=\s*setTimeout/,
    'endSample must wait on an in-flight autosave with a hard settle timer before tearing down',
  );
  assert.match(
    PERF_PROBE_SOURCE,
    /if \(sampleEnded\) tryResolveAfterAutosave\(\)/,
    'terminal save bus listeners must remain active after the sample window to capture completion',
  );
  assert.doesNotMatch(
    PERF_PROBE_SOURCE,
    /const finish = \(\) => \{\s*if \(settled\) return;\s*settled = true;[\s\S]{0,200}unsubSaveCompleted/,
    'legacy finish-that-unsubscribes-immediately-at-window-end must not remain',
  );
});

test('a raw wall observation above 12ms fails the hard budget flag (adversarial)', () => {
  const timing = save._saveTiming({
    slot: 'auto', reason: 'hard_fail_contract', autosave: true, started: performance.now(),
    blockingSamples: [{ phase: 'encode_part_dispatch', ms: 12.5 }],
  });
  assert.equal(timing.hardSliceMs, 12);
  assert.equal(timing.maxBlockingSliceMs, 12.5);
  assert.equal(timing.observedHardLimitMet, false,
    'any raw slice >12ms must fail observedHardLimitMet; batching must not relax this gate');
  assert.equal(timing.observedTargetMet, false);
});
