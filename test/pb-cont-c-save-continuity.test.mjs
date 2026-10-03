// PB-CONT-C — save continuity (build-map row 152): SF-280 / SF-281 / SF-284.
//
//   SF-280 — an older envelope gains only valid defaults: player resources and story facts
//     survive, absent feature keys land as truthful empty baselines through the real
//     restore chain (migration → owner deserialize → save:loaded), and a re-serialized
//     current envelope needs no further migration.
//   SF-281 — a failed write stays visible without pretending an autosave succeeded:
//     pending/durable/failed are readable on state.save, superseded is a cancellation
//     (never a failure count), and quota / bound / corrupt-loopback refusals never
//     delete the previous generation.
//   SF-284 — bounded persistence prefers meaningful consequences: world-record retention
//     retires reclaimable "recent" rows first while protected consequences overflow past
//     the cap, and an over-limit write is refused whole rather than truncated.
//
// Harness mirrors fb-save-write-bound-gzip.test.mjs: Object.create(saveDefinition) over a
// real createGameState so save(), _writeSlot(), and the destructive restore run the actual
// production code. The deployable/onboarding/provenance owners are mounted by registry name
// so the restore dispatch exercises the same lookup the live route uses.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { createSaveDirtyJournal } from '../src/save/saveDirtyJournal.js';
import {
  save as saveDefinition,
  SAVE_IMPORT_MAX_PERSISTENT_ENTITIES,
} from '../src/save/saveSystem.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { masslineSnares } from '../src/systems/masslineSnares.js';
import { onboarding } from '../src/systems/onboarding.js';
import { provenanceLedger } from '../src/systems/provenanceLedger.js';
import {
  createEmptyRecordsBag,
  MAX_RECORDS_PER_SECTOR,
  MAX_RETENTION_RECEIPTS,
  normalizeRecordsBag,
  stableRecordId,
} from '../src/world/worldRecords.js';

const SEED = 4242;
const SECTOR = 'sector_helios_prime';
const FMT = 'spaceface-save';

function vec(x = 0, z = 0) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(other) { this.x = other.x || 0; this.y = other.y || 0; this.z = other.z || 0; return this; },
  };
}

function memoryStorage(overrides = {}) {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) {
      if (overrides.setItem) overrides.setItem(String(key), String(value), values);
      else values.set(String(key), String(value));
    },
    removeItem(key) { values.delete(String(key)); },
    __values: values,
  };
}

function makeBus() {
  const events = [];
  const listeners = new Map();
  return {
    events,
    emit(name, payload = {}) {
      events.push({ name, payload });
      const subs = listeners.get(name);
      if (subs) for (const cb of [...subs]) cb(payload);
    },
    on(name, cb) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(cb);
      return () => listeners.get(name).delete(cb);
    },
    off(name, cb) { const subs = listeners.get(name); if (subs) subs.delete(cb); },
  };
}

// Mount a real system by its registry name on a fork (Object.create) so production fields
// stay untouched; the wrapped deserialize records what the restore dispatch delivered.
function mountSystem(definition, ctx, calls) {
  const fork = Object.create(definition);
  const name = definition.name;
  if (calls) {
    const inner = definition.deserialize;
    if (typeof inner === 'function') {
      fork.deserialize = function (data) {
        calls.push({ name, data });
        return inner.call(this, data);
      };
    }
  }
  fork.init(ctx);
  ctx.registry.__systems.set(name, fork);
  return fork;
}

function makeHarness({ systems = [], storage } = {}) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.meta.playtimeS = 5400;
  state.simTime = 5400;
  state.tick = 648_000;
  state.world.currentSectorId = SECTOR;
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: vec(40, -18),
    vel: vec(0, 0),
    rot: 0.25,
    prevRot: 0.25,
    hull: 64,
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

  const bus = makeBus();
  const deserializeCalls = [];
  const helpers = {
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
  const registry = {
    __systems: new Map(),
    get(name) { return this.__systems.get(name) || null; },
  };
  const ctx = { state, bus, helpers, registry };
  const forks = {};
  for (const def of systems) {
    forks[def.name] = mountSystem(def, ctx, deserializeCalls);
  }

  const save = Object.create(saveDefinition);
  save.state = state;
  save.bus = bus;
  save.helpers = helpers;
  save.registry = registry;
  // The init() fields the exercised save/load paths read.
  save._restoring = false;
  save._pendingRunTransition = null;
  save._lastAutosaveAt = -Infinity;
  save._lastAutosavePlaytime = 0;
  save._playerDead = false;
  save._lastPlayerCombatSimTime = -Infinity;
  save._autosavePending = null;
  save._autosaveInFlight = false;
  save._autosaveGeneration = 0;
  save._runEpoch = 0;
  save._activeAutosaveJob = null;
  save._activeAutosaveTransaction = null;
  save._activeSaveWorkers = new Set();
  save._saveWorkerRequestId = 0;
  save._restoreSequence = 0;
  save._rollbackCaptureActive = false;
  save._rollbackInProgress = false;
  save._sharedStoreReady = true;
  save._sharedStoreMirrorHealthy = true;
  save._sharedStorePatch = null;
  save._sharedStoreFlushTimer = null;
  save._dirtyJournal = createSaveDirtyJournal();
  save._lastSaveSnapshotBoundary = null;
  save._playerCollectionRevision = 0;

  const store = storage || memoryStorage();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = store;

  return {
    save,
    state,
    bus,
    helpers,
    registry,
    forks,
    deserializeCalls,
    storage: store,
    restore() {
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
      for (const fork of Object.values(forks)) {
        if (typeof fork.destroy === 'function') { try { fork.destroy(); } catch (_) { /* test teardown */ } }
      }
    },
  };
}

function sealedEnvelope(data, version = CURRENT_VERSION) {
  const env = {
    fmt: FMT,
    version,
    savedAt: '2026-10-03T01:00:00.000Z',
    playtimeS: data.meta && Number.isFinite(data.meta.playtimeS) ? data.meta.playtimeS : 0,
    slot: 'quick',
    checksum: fnv1a(JSON.stringify(data)),
    data,
  };
  return { env, raw: JSON.stringify(env) };
}

// A representative pre-v11 save: earned resources + story facts, but every feature row the
// newer packets introduced (onboarding rail, deployables, provenance ledger, npc jobs,
// screen memory, durable world records) is absent — exactly what an old envelope looks like.
function legacyData() {
  return {
    meta: { seed: SEED, playtimeS: 5400 },
    player: {
      credits: 7321,
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
      activeShipIndex: 0,
      moduleInventory: ['mod_hull_repair_kit'],
      researchedNodes: ['research_node_nav'],
    },
    entities: {
      player: {
        id: 1, type: 'ship',
        pos: { x: 40, z: -18 }, vel: { x: 0, z: 0 }, rot: 0.25,
        hull: 64, hullMax: 100, radius: 6, team: 0,
        data: { defId: 'ship_kestrel' },
      },
      persistent: [],
      tick: 648_000,
      simTime: 5400,
    },
    world: { currentSectorId: SECTOR, history: [{ t: 120, kind: 'dock', stationId: 'station_dawn' }] },
    missions: {
      boards: {},
      active: [],
      completedLog: [{ id: 'job_legacy_1', title: 'Cleared the belt', outcome: 'completed' }],
      receipts: [],
      story: { beatIndex: 3, flags: { met_ceres_reclaimer: true }, chainProgress: 1 },
    },
  };
}

// ── SF-280 ─────────────────────────────────────────────────────────────────────────────

test('a pre-v11 save loads with preserved resources and truthful empty feature defaults', () => {
  const h = makeHarness({ systems: [onboarding, impulseCharges, masslineSnares, provenanceLedger] });
  try {
    const { raw } = sealedEnvelope(legacyData(), 10);
    h.storage.setItem('sf.save.quick', raw);

    // Envelope-level migration proof before the destructive restore runs.
    const prepared = h.save._prepareEnvelopeString(raw);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.equal(prepared.version, 10);
    // Migration seeds only honest empty structures — no invented progress.
    assert.deepEqual(prepared.data.npcJobs, { byId: {} });
    assert.deepEqual(prepared.data.uiScreenMemory, { v: 1, bags: {} });
    assert.deepEqual(prepared.data.provenance, { v: 1, chains: [], openIncidents: {}, nextSeq: 0 });
    assert.deepEqual(prepared.data.world.records.byId, {});
    assert.ok(prepared.data.world.resourceBodies && typeof prepared.data.world.resourceBodies === 'object');
    // Feature rows the ladder never owned stay absent for the owner deserializers.
    assert.equal('onboarding' in prepared.data, false);
    assert.equal('charges' in prepared.data, false);
    assert.equal('snares' in prepared.data, false);

    const ok = h.save.load('quick');
    assert.equal(ok, true, JSON.stringify(h.bus.events.filter((e) => e.name === 'save:error')));

    // Prior resources and story facts survive unchanged.
    assert.equal(h.state.player.credits, 7321);
    assert.deepEqual(h.state.player.moduleInventory, ['mod_hull_repair_kit']);
    assert.deepEqual(h.state.player.researchedNodes, ['research_node_nav']);
    assert.equal(h.state.missions.completedLog[0] && h.state.missions.completedLog[0].id, 'job_legacy_1');
    assert.equal(h.state.story.flags.met_ceres_reclaimer, true);
    assert.equal(h.state.story.beatIndex, 3);
    assert.equal(h.state.meta.version, CURRENT_VERSION);

    // Truthful feature baselines on the restored state — nothing was granted.
    // (The live bag also carries null runtime slots the owner itself seeds; the baseline
    // claim is the absence of progress, not the literal object shape.)
    assert.equal(h.state.onboarding.active, false);
    assert.equal(h.state.onboarding.finished, false);
    assert.equal(h.state.onboarding.rescue, undefined);
    assert.equal(h.state.onboarding.missingThree, undefined);
    assert.equal(h.state.onboarding.currentBeat === -1 || h.state.onboarding.currentBeat === undefined, true);
    assert.ok(h.state.provenance && Array.isArray(h.state.provenance.chains));
    assert.equal(h.state.provenance.chains.length, 0);
    assert.deepEqual(h.state.provenance.openIncidents, {});
    // No deployed hardware rematerializes out of thin air.
    assert.equal([...h.state.entities.values()].some((e) => e.type === 'charge'), false);
    assert.equal(h.forks.masslineSnares._deployment, null);

    // Every owner was actually asked by the restore dispatch — absent rows arrived as such.
    const got = Object.fromEntries(h.deserializeCalls.map((c) => [c.name, c.data]));
    assert.ok('onboarding' in got, 'onboarding.deserialize must run during restore');
    assert.ok('impulseCharges' in got, 'impulseCharges.deserialize must run during restore');
    assert.ok('masslineSnares' in got, 'masslineSnares.deserialize must run during restore');
    assert.ok('provenanceLedger' in got, 'provenanceLedger.deserialize must run during restore');
    assert.equal(got.onboarding, undefined);
    assert.equal(got.impulseCharges, undefined);
    assert.equal(got.masslineSnares, undefined);
    assert.deepEqual(got.provenanceLedger, { v: 1, chains: [], openIncidents: {}, nextSeq: 0 });

    // Second migration pass is a no-op: the re-serialized current envelope's feature rows
    // come through prepare byte-identical.
    const resaved = h.save.serialize('quick');
    const preparedAgain = h.save._prepareEnvelopeString(JSON.stringify(resaved));
    assert.equal(preparedAgain.ok, true);
    for (const key of ['onboarding', 'snares', 'charges', 'provenance', 'npcJobs', 'uiScreenMemory']) {
      assert.deepEqual(preparedAgain.data[key], resaved.data[key],
        `feature row ${key} must survive a second pass unchanged`);
    }
  } finally { h.restore(); }
});

// The dispatch regression this packet actually caught: save rows are data.charges/data.snares
// but the owners register as impulseCharges/masslineSnares — the restore must name the owners.
test('a saved charge network respawns through the real load path', () => {
  const h = makeHarness({ systems: [impulseCharges, masslineSnares] });
  try {
    const env = h.save.serialize('quick');
    env.data.charges = {
      version: 1,
      charges: [{
        pos: { x: 55, z: -7 },
        vel: { x: 0, z: 0 },
        data: { chargeId: 'impulse_web_plate', ownerId: null, hostId: null },
      }],
      primed: [],
    };
    env.data.snares = { version: 1, deployment: null, webs: [] };
    env.checksum = fnv1a(JSON.stringify(env.data));
    h.storage.setItem('sf.save.quick', JSON.stringify(env));

    const ok = h.save.load('quick');
    assert.equal(ok, true, JSON.stringify(h.bus.events.filter((e) => e.name === 'save:error')));

    const got = Object.fromEntries(h.deserializeCalls.map((c) => [c.name, c.data]));
    assert.deepEqual(got.impulseCharges, env.data.charges);
    assert.deepEqual(got.masslineSnares, env.data.snares);
    // The staged chain applied at save:loaded — the plate is back in the world.
    const plate = [...h.state.entities.values()].find((e) => e.type === 'charge');
    assert.ok(plate, 'the saved impulse charge must respawn');
    assert.equal(plate.pos.x, 55);
    assert.equal(plate.pos.z, -7);
    assert.equal(plate.data.chargeId, 'impulse_web_plate');
  } finally { h.restore(); }
});

// ── SF-281 ─────────────────────────────────────────────────────────────────────────────

test('successful and failed writes leave a readable receipt; previous slot survives failures', () => {
  const h = makeHarness();
  try {
    // 1. A durable write records a success receipt and no failure is pending.
    assert.equal(h.save.save('quick'), true);
    const goodJson = h.storage.getItem('sf.save.quick');
    assert.ok(goodJson, 'primary must be written');
    assert.equal(h.state.save.pendingWrite, null);
    assert.equal(h.state.save.lastWriteOk.slot, 'quick');
    assert.equal(h.state.save.lastWriteOk.trigger, 'manual');
    assert.equal(h.state.save.lastWriteOk.autosave, false);
    assert.ok(h.state.save.lastWriteOk.bytes > 0);
    assert.equal(h.state.save.lastWriteFailure, null);
    assert.equal(h.state.save.consecutiveWriteFailures, 0);
    assert.equal(h.bus.events.some((e) => e.name === 'save:completed'), true);
    assert.equal(h.bus.events.some((e) => e.name === 'save:error'), false);

    // 2. Corrupt loopback: the stored bytes come back damaged → verify fails → rollback.
    const corrupted = memoryStorage({
      setItem(key, value, values) {
        // Only the fresh payload is mangled; rotation/rollback writes store faithfully.
        if (key === 'sf.save.quick' && value !== goodJson) {
          values.set(key, value.slice(0, -2));
          return;
        }
        values.set(key, value);
      },
    });
    corrupted.setItem('sf.save.quick', goodJson);
    globalThis.localStorage = corrupted;

    assert.equal(h.save.save('quick'), false);
    assert.equal(h.state.save.pendingWrite, null, 'settled failure must clear the pending row');
    assert.equal(h.state.save.lastWriteFailure.slot, 'quick');
    assert.match(h.state.save.lastWriteFailure.reason, /^write_verify_(parse|failed)/);
    assert.equal(h.state.save.consecutiveWriteFailures, 1);
    const verifyError = h.bus.events.findLast((e) => e.name === 'save:error');
    assert.ok(verifyError, 'the failed write must emit save:error');
    assert.match(verifyError.payload.failure, /^write_verify_(parse|failed)/);
    assert.equal(verifyError.payload.trigger, 'manual');
    // The previous generation was rolled back, not deleted.
    assert.equal(corrupted.getItem('sf.save.quick'), goodJson);
    // And the live game still flies: the slot loads and its payload restores intact.
    globalThis.localStorage = h.storage;
    h.storage.setItem('sf.save.quick', goodJson);
    const creditsBefore = h.state.player.credits;
    assert.equal(h.save.load('quick'), true);
    assert.equal(h.state.player.credits, creditsBefore);
  } finally { h.restore(); }
});

test('quota refusal and unavailable storage are named failures, not silent loss', () => {
  const h = makeHarness();
  try {
    assert.equal(h.save.save('quick'), true);
    const goodJson = h.storage.getItem('sf.save.quick');

    // Every write refuses with QuotaExceededError; reads still work so the previous
    // generation stays readable the whole time.
    const quotaStore = memoryStorage({
      setItem() {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      },
    });
    quotaStore.__values.set('sf.save.quick', goodJson);
    globalThis.localStorage = quotaStore;

    assert.equal(h.save.save('quick'), false);
    assert.equal(h.state.save.lastWriteFailure.reason, 'quota');
    assert.equal(h.state.save.consecutiveWriteFailures, 1);
    assert.equal(quotaStore.getItem('sf.save.quick'), goodJson,
      'a refused write must not delete the previous generation');

    delete globalThis.localStorage;
    assert.equal(h.save.save('quick'), false);
    assert.equal(h.state.save.lastWriteFailure.reason, 'no_storage');
    assert.equal(h.state.save.consecutiveWriteFailures, 2);

    // Live state is untouched by either refusal and the next good write clears the slate.
    const creditsBefore = h.state.player.credits;
    globalThis.localStorage = h.storage;
    assert.equal(h.state.player.credits, creditsBefore);
    assert.equal(h.save.save('quick'), true);
    assert.equal(h.state.save.pendingWrite, null);
    assert.equal(h.state.save.lastWriteFailure, null);
    assert.equal(h.state.save.consecutiveWriteFailures, 0);
    assert.equal(h.state.save.lastWriteOk.slot, 'quick');
  } finally { h.restore(); }
});

test('a superseded autosave is a cancellation, not a failure and not a success', () => {
  const h = makeHarness();
  try {
    assert.equal(h.save.save('quick'), true);
    assert.equal(h.state.save.lastWriteOk.slot, 'quick');

    // One real failure first, so the test can prove superseded neither clears nor increments it.
    const quotaStore = memoryStorage({
      setItem() {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      },
    });
    quotaStore.__values.set('sf.save.quick', h.storage.getItem('sf.save.quick'));
    globalThis.localStorage = quotaStore;
    assert.equal(h.save.save('quick'), false);
    assert.equal(h.state.save.lastWriteFailure.reason, 'quota');
    assert.equal(h.state.save.consecutiveWriteFailures, 1);
    globalThis.localStorage = h.storage;

    // A stale autosave job reaches its commit after a restore boundary: the write is
    // deliberately abandoned — the canonical "superseded" outcome of _commitAutosaveSnapshot.
    const job = { reason: 'autosave', requestedAt: Date.now(), restoreSequence: 999, capture: null };
    h.save._autosaveInFlight = true;
    h.save._activeAutosaveJob = job;
    const ok = h.save._commitAutosaveSnapshot(job, {
      serializeMs: 1,
      stringifyMs: 1,
      blockingSlices: [1],
      envelope: null,
    });
    assert.equal(ok, false);

    const err = h.bus.events.findLast((e) => e.name === 'save:error');
    assert.ok(err, 'a superseded write still leaves a bus receipt');
    assert.equal(err.payload.failure, 'superseded');
    assert.equal(err.payload.trigger, 'autosave');
    // …but nothing about the durable record moves: not a failure, not a success.
    assert.equal(h.state.save.consecutiveWriteFailures, 1,
      'a cancelled autosave must not inflate the real failure count');
    assert.equal(h.state.save.lastWriteFailure.reason, 'quota',
      'the last REAL failure must still be the one the player needs to see');
    assert.equal(h.state.save.lastWriteOk.slot, 'quick',
      'a cancelled write must not pretend anything was persisted');
    assert.equal(h.state.save.pendingWrite, null);
    assert.equal(h.save._autosaveInFlight, false);
  } finally { h.restore(); }
});

test('load-path errors never land on the write receipt', async () => {
  const h = makeHarness();
  try {
    // A genuinely broken load: torn primary, no recovery generation.
    h.storage.setItem('sf.save.quick', '{"fmt":"spaceface-save","version":1,"data":');
    const ok = await Promise.resolve(h.save.load('quick'));
    assert.equal(ok, false);

    const err = h.bus.events.findLast((e) => e.name === 'save:error');
    assert.ok(err, 'a failed load still emits save:error for the UI');
    // Load receipts are classified by the absence of write fields — the UI reads
    // payload.trigger to tell "write failed" apart from "load failed".
    assert.equal(err.payload.trigger, undefined);
    assert.equal(err.payload.failure, undefined);
    assert.notEqual(err.payload.reason, undefined);

    // The write ledger is untouched by something that never wrote.
    assert.equal(h.state.save.pendingWrite, null);
    assert.equal(h.state.save.lastWriteFailure, null);
    assert.equal(h.state.save.consecutiveWriteFailures, 0);

    // And a subsequent good write still lands and records cleanly.
    assert.equal(h.save.save('quick'), true);
    assert.equal(h.state.save.lastWriteOk.slot, 'quick');
    assert.equal(h.state.save.consecutiveWriteFailures, 0);
  } finally { h.restore(); }
});

// ── SF-284 ─────────────────────────────────────────────────────────────────────────────

test('world-record retention retires expendable recents and keeps protected consequences', () => {
  const sector = SECTOR;
  const bag = createEmptyRecordsBag();
  // More records than the per-sector cap: a flooded recent-memory tail plus consequences
  // that must survive — a defeated named target, a mission hull, a player-owned wreck.
  const protectedIds = [];
  for (let i = 0; i < 6; i++) {
    const id = `wr_protected_${i}`;
    bag.byId[id] = {
      recordId: id,
      kind: i % 2 === 0 ? 'mission_target' : 'wreck',
      sectorId: sector,
      pos: { x: i, z: i },
      lastSeenTick: 100 + i,
      lastObservedT: 10 + i,
      outcome: i % 2 === 0 ? 'defeated' : null,
      named: i === 5,
      alive: i % 3 === 0,
    };
    protectedIds.push(id);
  }
  const reclaimableIds = [];
  for (let i = 0; i < MAX_RECORDS_PER_SECTOR + 8; i++) {
    const id = stableRecordId(SEED, sector, 'npc', `ambient-${i}`);
    bag.byId[id] = {
      recordId: id,
      kind: 'npc',
      sectorId: sector,
      pos: { x: i * 2, z: -i },
      lastSeenTick: 1000 + i,        // oldest first → the oldest recents retire first
      lastObservedT: 500 + i,
      alive: true,
    };
    reclaimableIds.push(id);
  }

  const normalized = normalizeRecordsBag(bag);
  const sectorRows = Object.values(normalized.byId)
    .filter((rec) => rec.sectorId === sector || rec.homeSectorId === sector);
  // Protected consequences are never cap-dropped; the expendable recent tail retires
  // oldest-first until the sector lands exactly on the cap.
  for (const id of protectedIds) assert.ok(normalized.byId[id], `protected record ${id} must survive`);
  assert.equal(sectorRows.length, MAX_RECORDS_PER_SECTOR);
  const retired = MAX_RECORDS_PER_SECTOR + 8 + protectedIds.length - MAX_RECORDS_PER_SECTOR;
  for (const id of reclaimableIds.slice(0, retired)) {
    assert.equal(normalized.byId[id], undefined, `oldest recent ${id} retires first`);
  }
  for (const id of reclaimableIds.slice(retired)) {
    assert.ok(normalized.byId[id], `newest recent ${id} is kept`);
  }
  // The eviction is receipted, honestly, and the receipt log itself is bounded.
  assert.ok(Array.isArray(normalized.retentionReceipts));
  assert.ok(normalized.retentionReceipts.length <= MAX_RETENTION_RECEIPTS);
  const receipt = normalized.retentionReceipts.find((r) => r && r.event === 'world_records_cap');
  assert.ok(receipt, 'a cap decision must leave a durable receipt');
  assert.equal(receipt.sectorId, sector);
  assert.equal(receipt.retiredRecordIds.length, retired,
    'the receipt names exactly the retired recent rows');
});

test('an over-limit write is refused whole — no truncation, previous slot intact', () => {
  const h = makeHarness();
  try {
    assert.equal(h.save.save('quick'), true);
    const goodJson = h.storage.getItem('sf.save.quick');
    const eventsBefore = h.bus.events.length;

    // One write whose persistent graph is over the bound: refuse, never truncate.
    const canonicalSerialize = saveDefinition.serialize;
    h.save.serialize = function (slot) {
      const env = canonicalSerialize.call(this, slot);
      env.data.entities.persistent = Array.from(
        { length: SAVE_IMPORT_MAX_PERSISTENT_ENTITIES + 1 },
        (_, index) => ({ id: index + 2, type: 'ship' }),
      );
      env.checksum = fnv1a(JSON.stringify(env.data));
      return env;
    };
    assert.equal(h.save.save('quick'), false);
    delete h.save.serialize;

    assert.equal(h.state.save.lastWriteFailure.reason, 'import_persistent_entity_limit');
    assert.equal(h.state.save.consecutiveWriteFailures, 1);
    const err = h.bus.events.slice(eventsBefore).find((e) => e.name === 'save:error');
    assert.ok(err, 'the refused write emits a failure receipt');
    assert.equal(err.payload.failure, 'import_persistent_entity_limit');
    // Not truncated, not partially written — the previous generation is byte-identical.
    assert.equal(h.storage.getItem('sf.save.quick'), goodJson);
    // Live game untouched: entities are still just the player.
    assert.equal(h.state.entities.size, 1);
    // The slot still loads.
    assert.equal(h.save.load('quick'), true);
  } finally { h.restore(); }
});
