import assert from 'node:assert/strict';
import test from 'node:test';

import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { createGameState } from '../src/core/gameState.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';
import {
  decodeSaveEnvelopeText,
  encodeSavePayload,
  encodeSavePayloadFinal,
  handleSaveWorkerRequestAsync,
  isGzippedSaveText,
  restorePrepareSaveJsonAsync,
  SAVE_GZIP_FORMAT,
  SAVE_WORKER_SOURCE,
  SAVE_WRITE_MAX_BYTES,
  validateSaveJsonAsync,
} from '../src/save/saveWorker.js';

// FB-093 — write-side bound + gzip contract:
//  * the worker encode refuses over-limit envelopes with a named reason, never a truncated write;
//  * a production-sized envelope lands on disk at ≤50% of its plain byte count when the platform
//    has CompressionStream, and falls back to valid plain JSON when it does not;
//  * compressed and legacy plain generations both validate, prepare, and restore through the
//    async worker lane while the synchronous lane keeps its bool contract via loadAsync.

function largeDataFixture() {
  const data = {
    meta: { seed: 4242, playtimeS: 10_800 },
    player: { credits: 4200, ownedShips: [{ defId: 'ship_kestrel', fittings: [] }], activeShipIndex: 0 },
    entities: { player: { id: 1, type: 'ship', data: { defId: 'ship_kestrel' } }, persistent: [], tick: 648_000 },
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

function descriptor() {
  return {
    fmt: 'spaceface-save',
    version: CURRENT_VERSION,
    savedAt: '2026-10-02T03:00:00.000Z',
    playtimeS: 10_800,
    slot: 'auto',
  };
}

function evalWorkerSource(overrides = {}) {
  // Bare global names inside the worker source resolve through the Function formals first —
  // passing undefined for CompressionStream/DecompressionStream simulates a platform without
  // the web compression APIs while Blob/btoa keep resolving to Node's real globals.
  const responses = [];
  const self = {
    addEventListener(name, callback) {
      if (name === 'message') self.__listener = callback;
    },
    postMessage(value) { responses.push(value); },
  };
  Function('self', 'performance', 'CompressionStream', 'DecompressionStream', SAVE_WORKER_SOURCE)(
    self,
    globalThis.performance,
    'CompressionStream' in overrides ? overrides.CompressionStream : globalThis.CompressionStream,
    'DecompressionStream' in overrides ? overrides.DecompressionStream : globalThis.DecompressionStream,
  );
  return {
    responses,
    post(request) { self.__listener({ data: request }); },
    async waitFor(predicate = (value) => value !== undefined, limit = 500) {
      for (let turn = 0; turn < limit; turn++) {
        const found = responses.find(predicate);
        if (found) return found;
        await new Promise((resolve) => setImmediate(resolve));
      }
      return responses.find(predicate);
    },
  };
}

test('worker encode compresses a production-sized envelope below half its plain bytes', async () => {
  const data = largeDataFixture();
  const plain = encodeSavePayload({ descriptor: descriptor(), data });
  const encoded = await encodeSavePayloadFinal({ descriptor: descriptor(), data });
  assert.equal(encoded.ok, true);
  if (encoded.gz === true) {
    assert.equal(isGzippedSaveText(encoded.json), true);
    const outer = JSON.parse(encoded.json);
    assert.equal(outer.fmt, SAVE_GZIP_FORMAT);
    assert.equal(outer.version, CURRENT_VERSION);
    assert.equal(outer.checksum, plain.checksum);
    assert.ok(
      encoded.json.length <= plain.json.length * 0.5,
      `compressed ${encoded.json.length} must be ≤50% of plain ${plain.json.length}`,
    );
    const decoded = await decodeSaveEnvelopeText(encoded.json);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.text, plain.json);
  } else {
    // Platform without CompressionStream — the plain JSON write remains valid and loadable.
    assert.equal(encoded.json, plain.json);
  }
});

test('over-limit envelopes are refused with the named bound reason, never a truncated write', async () => {
  const oversized = await encodeSavePayloadFinal({
    descriptor: descriptor(),
    data: { ...largeDataFixture(), blob: 'x'.repeat(SAVE_WRITE_MAX_BYTES + 64) },
  });
  assert.equal(oversized.ok, false);
  assert.equal(oversized.reason, 'save_size_limit');
  assert.equal(oversized.limit, SAVE_WRITE_MAX_BYTES);
  assert.ok(oversized.actual > SAVE_WRITE_MAX_BYTES);

  const tooManyEntities = await encodeSavePayloadFinal({
    descriptor: descriptor(),
    data: {
      ...largeDataFixture(),
      entities: {
        player: { id: 1, type: 'ship' },
        persistent: Array.from({ length: 2049 }, (_, index) => ({ id: index + 2 })),
      },
    },
  });
  assert.equal(tooManyEntities.ok, false);
  assert.equal(tooManyEntities.reason, 'import_persistent_entity_limit');
});

test('bundled worker source encodes gzipped and refuses over-limit with the same reasons', async () => {
  const worker = evalWorkerSource();
  worker.post({ id: 1, type: 'encode', payload: { descriptor: descriptor(), data: largeDataFixture() } });
  const encoded = await worker.waitFor((message) => message && message.id === 1);
  assert.equal(encoded.type, 'encoded');
  assert.equal(encoded.ok, true);
  assert.equal(isGzippedSaveText(encoded.json), true, 'bundled worker should emit the gz wrapper');
  const decoded = await decodeSaveEnvelopeText(encoded.json);
  assert.equal(decoded.ok, true);
  assert.deepEqual(JSON.parse(decoded.text).data.entities.player, { id: 1, type: 'ship', data: { defId: 'ship_kestrel' } });

  worker.post({
    id: 2,
    type: 'encode',
    payload: { descriptor: descriptor(), data: { ...largeDataFixture(), blob: 'x'.repeat(SAVE_WRITE_MAX_BYTES + 64) } },
  });
  const refused = await worker.waitFor((message) => message && message.id === 2);
  assert.equal(refused.type, 'encoded');
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'save_size_limit');
});

test('bundled worker falls back to valid plain JSON when compression APIs are missing', async () => {
  const worker = evalWorkerSource({ CompressionStream: undefined, DecompressionStream: undefined });
  worker.post({ id: 3, type: 'encode', payload: { descriptor: descriptor(), data: largeDataFixture() } });
  const encoded = await worker.waitFor((message) => message && message.id === 3);
  assert.equal(encoded.type, 'encoded');
  assert.equal(encoded.ok, true);
  assert.equal(encoded.gz, false);
  assert.equal(isGzippedSaveText(encoded.json), false);
  const validated = await validateSaveJsonAsync(encoded.json, CURRENT_VERSION);
  assert.equal(validated.ok, true);
});

test('compressed and legacy plain generations both validate and restore through the async lane', async () => {
  const data = largeDataFixture();
  const plain = encodeSavePayload({ descriptor: descriptor(), data }).json;
  const compressed = (await encodeSavePayloadFinal({ descriptor: descriptor(), data })).json;

  for (const raw of [plain, compressed]) {
    const validated = await validateSaveJsonAsync(raw, CURRENT_VERSION);
    assert.equal(validated.ok, true, `generation ${isGzippedSaveText(raw) ? 'gz' : 'plain'} must validate`);
    assert.equal(validated.version, CURRENT_VERSION);
    const prepared = await restorePrepareSaveJsonAsync(raw, CURRENT_VERSION);
    assert.equal(prepared.ok, true);
    assert.equal(prepared.env.data.entities.tick, 648_000);
  }

  const worker = evalWorkerSource();
  worker.post({ id: 4, type: 'validate', payload: { raw: compressed, currentVersion: CURRENT_VERSION } });
  const validated = await worker.waitFor((message) => message && message.id === 4);
  assert.equal(validated.result.ok, true);
  worker.post({ id: 5, type: 'restore_prepare', payload: { raw: compressed, currentVersion: CURRENT_VERSION } });
  const prepared = await worker.waitFor((message) => message && message.id === 5);
  assert.equal(prepared.type, 'restored_prepare');
  assert.equal(prepared.result.ok, true);
});

// ── end-to-end load: a compressed primary restores and a compressed recovery promotes ─────────

function vec(x = 0, z = 0) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(other) { this.x = other.x || 0; this.y = other.y || 0; this.z = other.z || 0; return this; },
  };
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

function loadHarness() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.meta.playtimeS = 10_800;
  state.simTime = 10_800;
  state.tick = 648_000;
  state.world.currentSectorId = 'sector_helios_prime';
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: vec(12, -4),
    vel: vec(3, 1),
    rot: 0.2,
    prevRot: 0.2,
    hull: 90,
    hullMax: 100,
    radius: 6,
    team: 0,
    factionId: 'faction_free',
    flags: {},
    data: { defId: 'ship_kestrel', weapons: [{ id: 'wpn_pulse_laser_s' }], fittings: [] },
  };
  state.playerId = player.id;
  state.nextEntityId = 2;
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const events = [];
  const save = Object.create(saveDefinition);
  save.state = state;
  save.bus = { emit(name, payload = {}) { events.push({ name, payload }); } };
  save.registry = { get() { return null; } };
  save.helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const spawned = {
        ...spec,
        id,
        alive: spec.alive !== false,
        pos: vec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        vel: vec(spec.vel && spec.vel.x, spec.vel && spec.vel.z),
        prevPos: vec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        flags: { ...(spec.flags || {}) },
        data: spec.data || {},
      };
      state.entities.set(id, spawned);
      state.entityList.push(spawned);
      return spawned;
    },
    getEntity(id) { return state.entities.get(id); },
    player() { return state.entities.get(state.playerId); },
  };
  save._restoring = false;
  save._pendingRunTransition = null;
  save._restoreSequence = 0;
  save._lastAutosaveAt = 0;
  save._lastAutosavePlaytime = 0;
  save._rollbackCaptureActive = false;
  save._rollbackInProgress = false;

  // The async restore lane runs the real worker protocol in-process.
  const OriginalWorker = globalThis.Worker;
  globalThis.Worker = class {};
  let requestId = 0;
  save._requestSaveWorker = (type, payload, onResult) => {
    const id = ++requestId;
    Promise.resolve()
      .then(() => handleSaveWorkerRequestAsync({ id, type, payload }))
      .then((response) => { if (response) onResult(response); });
    return true;
  };

  const storage = memoryStorage();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = storage;

  return {
    save,
    state,
    events,
    storage,
    restore() {
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
      if (OriginalWorker === undefined) delete globalThis.Worker;
      else globalThis.Worker = OriginalWorker;
    },
  };
}

test('a compressed primary generation restores through load() via the async lane', async () => {
  const h = loadHarness();
  try {
    h.state.player.credits = 7331;
    const envelope = h.save.serialize('gzslot');
    const encoded = await encodeSavePayloadFinal({ descriptor: envelope, data: envelope.data });
    assert.equal(encoded.ok, true);
    assert.equal(isGzippedSaveText(encoded.json), true, 'fixture expects CompressionStream in Node');
    h.storage.setItem('sf.save.gzslot', encoded.json);

    h.state.tick = 999_999;
    h.state.simTime = 999_999;
    h.state.meta.playtimeS = 1;
    h.state.player.credits = 1;
    const result = h.save.load('gzslot');
    assert.equal(typeof result.then === 'function' || result === true, true,
      'compressed load returns the async lane promise');
    const ok = await result;
    assert.equal(ok, true, JSON.stringify(h.events.filter((e) => e.name === 'save:error')));
    assert.equal(h.state.tick, 648_000, 'the sim clock restores from the decoded envelope');
    assert.equal(h.state.meta.playtimeS, 10_800);
    assert.equal(h.state.player.credits, 7331);
    assert.equal(h.state.save.currentSlot, 'gzslot');
    assert.equal(h.events.some((event) => event.name === 'save:loaded'), true);
    // The decoded envelope is cached so the sync lane can read the proven generation afterwards.
    assert.equal(h.save._prepareEnvelopeString(encoded.json).ok, true);
  } finally { h.restore(); }
});

test('a compressed recovery generation restores and promotes when the primary is corrupt', async () => {
  const h = loadHarness();
  try {
    const envelope = h.save.serialize('gzslot');
    const encoded = await encodeSavePayloadFinal({ descriptor: envelope, data: envelope.data });
    assert.equal(encoded.ok, true);
    h.storage.setItem('sf.save.gzslot', '{"fmt":"spaceface-save","version":1,"data":'); // torn write
    h.storage.setItem('sf.recovery.gzslot', encoded.json);

    const ok = await h.save.load('gzslot');
    assert.equal(ok, true);
    const recovered = h.events.find((event) => event.name === 'save:recovered');
    assert.ok(recovered, 'corrupt primary must recover from the compressed backup');
    assert.equal(recovered.payload.promoted, true);
    assert.equal(h.state.save.currentSlot, 'gzslot');
    assert.equal(h.storage.getItem('sf.save.gzslot'), encoded.json,
      'promotion carries the compressed bytes forward as the new primary');
  } finally { h.restore(); }
});
