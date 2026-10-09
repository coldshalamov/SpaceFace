// SF-272 — a rejected save must leave the live campaign intact.
//
// Every rejection class is refused inside _prepareEnvelope (fmt → version → bounds → checksum →
// migrate → normalize) before the destructive restore boundary, so the running game keeps its
// world, screen mode, and input/time ownership. These tests pin that contract on the serialized
// surface itself: serializeData() before and after each rejection must be byte-identical, and
// the restore ownership latches must settle so the player can keep flying or load another save.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import {
  save as saveDefinition,
  SAVE_IMPORT_MAX_BYTES,
  SAVE_IMPORT_MAX_DEPTH,
  SAVE_IMPORT_MAX_PERSISTENT_ENTITIES,
} from '../src/save/saveSystem.js';
import { SAVE_GZIP_FORMAT, isGzippedSaveText } from '../src/save/saveWorker.js';

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

// Same minimal seam surface as save-restore-atomicity: real createGameState + helpers, a
// marker-only economy system so tests can tell which world is live, and an event-capturing bus.
// The deserialize never throws here — these tests exercise rejection and staleness, not rollback.
function makeHarness() {
  const state = createGameState(73);
  state.mode = 'flight';
  state.save.currentSlot = 'original-slot';
  state.meta.playtimeS = 31;
  state.simTime = 31;
  state.tick = 1_860;
  state.world.currentSectorId = 'sector_helios_prime';
  state.economy.marker = 'original';

  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: vec(120, -35),
    vel: vec(8, -2),
    rot: 0.35,
    prevRot: 0.35,
    hull: 88,
    hullMax: 100,
    shield: 42,
    shieldMax: 50,
    cap: 12,
    capMax: 20,
    radius: 6,
    team: 0,
    factionId: 'faction_free',
    flags: {},
    data: {
      defId: 'ship_kestrel',
      weapons: [{ id: 'wpn_pulse_laser_s' }],
      fittings: [],
    },
  };
  state.playerId = player.id;
  state.nextEntityId = 2;
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const events = [];
  const save = Object.create(saveDefinition);
  save.state = state;
  save.bus = { emit(name, payload = {}) { events.push({ name, payload }); } };
  save.registry = {
    get(name) {
      if (name !== 'economy') return null;
      return {
        serialize() { return { marker: state.economy.marker }; },
        deserialize(data) { state.economy.marker = data && data.marker; },
      };
    },
  };
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
        prevRot: Number.isFinite(spec.rot) ? spec.rot : 0,
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

  return { save, state, events };
}

// The SF-272 assertion surface: serialize the live campaign the same way a save would. The only
// per-call wall-clock field is meta.lastSavedAt, which is stamped on capture — normalize it so
// the comparison is exactly "the campaign the player would continue from".
function liveBlob(save) {
  const data = save.serializeData();
  data.meta.lastSavedAt = '<capture-stamp>';
  return JSON.stringify(data);
}

// A structurally valid envelope carrying a distinguishable world marker. Checksum is recomputed
// over the mutated data so prepare sees the stored-bytes contract exactly as a real save would.
function validEnvelope(save, marker, slot = 'candidate-slot') {
  const envelope = save.serialize(slot);
  envelope.data.economy = { marker };
  envelope.checksum = fnv1a(JSON.stringify(envelope.data));
  return envelope;
}

function nestedDataEnvelope(save, depth) {
  const envelope = validEnvelope(save, 'deep');
  let leaf = { end: true };
  for (let i = 0; i < depth; i++) leaf = { branch: leaf };
  envelope.data.deepTrap = leaf;
  envelope.checksum = fnv1a(JSON.stringify(envelope.data));
  return envelope;
}

function assertRunUntouched(harness, blobBefore, context) {
  const { save, state, events } = harness;
  assert.equal(liveBlob(save), blobBefore, `${context}: live campaign must be byte-identical`);
  assert.equal(save._restoring, false, `${context}: restore ownership must settle`);
  assert.equal(save._rollbackInProgress, false, `${context}: rollback guard must settle`);
  assert.equal(state.mode, 'flight', `${context}: the running screen stays flight`);
  assert.equal(state.timeScale, 1, `${context}: no orphan restore freeze may hold the sim`);
  assert.equal(events.filter((e) => e.name === 'save:loaded').length, 0,
    `${context}: a rejected save must not publish a loaded receipt`);
}

test('every rejected import class fails before the restore boundary with live state byte-identical', () => {
  const harness = makeHarness();
  const { save, events } = harness;
  const blobBefore = liveBlob(save);

  const checksumless = validEnvelope(save, 'x');
  delete checksumless.checksum;

  const tooNew = validEnvelope(save, 'x');
  tooNew.version = CURRENT_VERSION + 1;
  tooNew.checksum = fnv1a(JSON.stringify(tooNew.data));

  const fractional = validEnvelope(save, 'x');
  fractional.version = CURRENT_VERSION - 0.5;
  fractional.checksum = fnv1a(JSON.stringify(fractional.data));

  const badChecksum = validEnvelope(save, 'x');
  badChecksum.checksum = 'deadbeef';

  const missingPlayer = validEnvelope(save, 'x');
  missingPlayer.data.entities.player = null;
  missingPlayer.checksum = fnv1a(JSON.stringify(missingPlayer.data));

  const wrongPlayerType = validEnvelope(save, 'x');
  wrongPlayerType.data.entities.player = { ...wrongPlayerType.data.entities.player, type: 'station' };
  wrongPlayerType.checksum = fnv1a(JSON.stringify(wrongPlayerType.data));

  const persistentOverflow = validEnvelope(save, 'x');
  persistentOverflow.data.entities.persistent = new Array(SAVE_IMPORT_MAX_PERSISTENT_ENTITIES + 1)
    .fill({ type: 'wreck', pos: { x: 0, z: 0 } });
  persistentOverflow.checksum = fnv1a(JSON.stringify(persistentOverflow.data));

  const cases = [
    ['malformed JSON', '{definitely not json', 'parse_failed'],
    ['foreign fmt marker', JSON.stringify({ fmt: 'other-save', version: 1, data: {} }), 'bad_format'],
    ['missing data payload', JSON.stringify({ fmt: 'spaceface-save', version: CURRENT_VERSION }), 'no_data'],
    ['too-new version', JSON.stringify(tooNew), 'newer_version'],
    ['non-integer version', JSON.stringify(fractional), 'bad_format'],
    ['checksum mismatch', JSON.stringify(badChecksum), 'checksum'],
    ['oversized import', 'x'.repeat(SAVE_IMPORT_MAX_BYTES + 1), 'import_too_large'],
    ['depth limit', JSON.stringify(nestedDataEnvelope(save, SAVE_IMPORT_MAX_DEPTH + 8)), 'import_depth_limit'],
    ['persistent-entity limit', JSON.stringify(persistentOverflow), 'import_persistent_entity_limit'],
    ['missing player record', JSON.stringify(missingPlayer), 'no_player'],
    ['non-ship player record', JSON.stringify(wrongPlayerType), 'invalid_player'],
    ['non-string candidate', null, 'no_save'],
  ];

  for (const [label, raw, reason] of cases) {
    events.length = 0;
    const accepted = save.importString(raw, 'import-slot');
    assert.equal(accepted, false, `${label}: must be rejected`);
    const errors = events.filter((e) => e.name === 'save:error');
    assert.equal(errors.length, 1, `${label}: exactly one error receipt`);
    assert.equal(errors[0].payload.slot, 'import-slot', `${label}: receipt names the import slot`);
    assert.equal(errors[0].payload.reason, reason, `${label}: named rejection reason`);
    assertRunUntouched(harness, blobBefore, label);
  }
});

test('a corrupt stored slot and its corrupt recovery both reject without touching live state', () => {
  const harness = makeHarness();
  const { save, events } = harness;
  const blobBefore = liveBlob(save);

  const storage = memoryStorage();
  storage.setItem('sf.save.quick', '{corrupt primary');
  storage.setItem('sf.recovery.quick', '{corrupt recovery');
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = storage;
  try {
    assert.equal(save.load('quick'), false);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }

  const errors = events.filter((e) => e.name === 'save:error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].payload.slot, 'quick');
  assert.equal(errors[0].payload.reason, 'parse_failed');
  assert.equal(errors[0].payload.recoveryReason, 'parse_failed',
    'the recovery candidate must be named too — it is never silently skipped');
  assertRunUntouched(harness, blobBefore, 'double-corrupt load');
});

test('a refusing storage layer reports read_failed without touching live state', () => {
  const harness = makeHarness();
  const { save, events } = harness;
  const blobBefore = liveBlob(save);

  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error('storage denied'); },
    setItem() { throw new Error('storage denied'); },
    removeItem() { throw new Error('storage denied'); },
    key() { return null; },
    get length() { return 0; },
  };
  try {
    assert.equal(save.load('quick'), false, 'the read refusal fails closed, not destructively');
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }

  const errors = events.filter((e) => e.name === 'save:error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].payload.reason, 'read_failed');
  assertRunUntouched(harness, blobBefore, 'refusing storage');
});

test('a late-completing compressed import cannot overwrite a newer committed run', async () => {
  const harness = makeHarness();
  const { save, state, events } = harness;

  // The stale candidate: an import whose (worker) decode started before the newer load.
  const imported = validEnvelope(save, 'imported-world', 'import-slot');
  const preparedImport = save._prepareEnvelope(imported);
  assert.equal(preparedImport.ok, true);

  // A gzipped string always routes to the async decode lane — hold its resolution so the newer
  // restore lands first, exactly the window the NXI-234 stamp exists to close.
  const gzRaw = JSON.stringify({
    fmt: SAVE_GZIP_FORMAT,
    version: CURRENT_VERSION,
    savedAt: '2026-01-01T00:00:00.000Z',
    payload: 'e30',
  });
  assert.equal(isGzippedSaveText(gzRaw), true, 'fixture must route through the async lane');
  let releasePrepare = null;
  save._prepareEnvelopeStringAsync = () => new Promise((resolve) => { releasePrepare = resolve; });

  const pending = save.loadEnvelopeFromString(gzRaw, 'import-slot');
  assert.equal(typeof pending.then, 'function', 'compressed imports resolve asynchronously');

  // A newer load commits while the decode is still in flight.
  const newer = validEnvelope(save, 'newer-world', 'newer-slot');
  assert.equal(save.loadEnvelope(newer, 'newer-slot'), true);
  assert.equal(state.economy.marker, 'newer-world');

  releasePrepare(preparedImport);
  assert.equal(await pending, true, 'a superseded import reports handled, not failed');
  assert.equal(state.economy.marker, 'newer-world',
    'the stale candidate must not restore over the newer committed run');
  assert.equal(state.save.currentSlot, 'newer-slot');
  assert.equal(events.filter((e) => e.name === 'save:error').length, 0,
    'supersession emits no error receipt');
});

test('a compressed import resolving inside an active restore defers and wins as the latest request', async () => {
  const harness = makeHarness();
  const { save, state } = harness;

  const imported = validEnvelope(save, 'imported-world', 'import-slot');
  const preparedImport = save._prepareEnvelope(imported);
  assert.equal(preparedImport.ok, true);
  const gzRaw = JSON.stringify({
    fmt: SAVE_GZIP_FORMAT, version: CURRENT_VERSION, savedAt: '2026-01-01T00:00:00.000Z', payload: 'e30',
  });
  let releasePrepare = null;
  save._prepareEnvelopeStringAsync = () => new Promise((resolve) => { releasePrepare = resolve; });

  // A restore is already in flight when the import's decode resolves.
  save._restoring = true;
  const pending = save.loadEnvelopeFromString(gzRaw, 'import-slot');
  releasePrepare(preparedImport);
  assert.equal(await pending, true, 'the deferred import is accepted, not lost');
  assert.equal(state.economy.marker, 'original', 'nothing may restore mid-session');
  assert.equal(typeof save._pendingRunTransition, 'function',
    'the import must queue behind the active restore');

  // The in-flight session closes and drains the queue: the import is the latest request and
  // becomes the next run (its stamp still matches — it arrived after that session began).
  save._restoring = false;
  const deferred = save._pendingRunTransition;
  save._pendingRunTransition = null;
  deferred();
  assert.equal(state.economy.marker, 'imported-world');
  assert.equal(state.save.currentSlot, 'import-slot');
});

test('a current-generation compressed import restores the imported campaign', async () => {
  const harness = makeHarness();
  const { save, state, events } = harness;

  const imported = validEnvelope(save, 'imported-world', 'import-slot');
  const preparedImport = save._prepareEnvelope(imported);
  const gzRaw = JSON.stringify({
    fmt: SAVE_GZIP_FORMAT, version: CURRENT_VERSION, savedAt: '2026-01-01T00:00:00.000Z', payload: 'e30',
  });
  save._prepareEnvelopeStringAsync = async () => preparedImport;

  assert.equal(await save.loadEnvelopeFromString(gzRaw, 'import-slot'), true);
  assert.equal(state.economy.marker, 'imported-world');
  assert.equal(state.save.currentSlot, 'import-slot');
  assert.equal(events.filter((e) => e.name === 'save:loaded' && e.payload.slot === 'import-slot').length, 1);
});

test('after rejected imports the campaign continues and a valid older save still loads', () => {
  const harness = makeHarness();
  const { save, state, events } = harness;

  // The player is mid-campaign; a bad file lands.
  const blobBefore = liveBlob(save);
  assert.equal(save.importString('{trash', 'import-slot'), false);
  assertRunUntouched(harness, blobBefore, 'mid-campaign rejection');

  // And then chooses a valid save from an older schema generation instead — it migrates on the
  // candidate copy and restores normally.
  const older = validEnvelope(save, 'older-world', 'older-slot');
  older.version = CURRENT_VERSION - 1;
  older.checksum = fnv1a(JSON.stringify(older.data));
  events.length = 0;
  assert.equal(save.loadEnvelope(older, 'older-slot'), true);
  assert.equal(state.economy.marker, 'older-world');
  assert.equal(state.meta.version, CURRENT_VERSION, 'migrated saves land on the current schema');
  assert.equal(state.save.currentSlot, 'older-slot');
  assert.equal(events.filter((e) => e.name === 'save:loaded' && e.payload.slot === 'older-slot').length, 1);
});
