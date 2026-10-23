// W2-A / O8 — Continue's recovery promotion must never overwrite newer progress.
//
// Continue picks a valid recovery copy for a damaged primary, restores it (a long await window
// on the worker lane), then self-heals by writing the recovery bytes back over the primary.
// Another tab or the shared-store reconcile can land newer bytes in either key during that
// window; promotion has to re-check both keys immediately before the write and skip when
// either moved, or when a newer load took over.
// Run: node --test test/w2a-recovery-promotion-race.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';
import { resetSharedPlayerStoreMemoForTests } from '../src/save/sharedPlayerStore.js';

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

// Same minimal live campaign the shared-continuation tests use: real createGameState, real
// restore chain, and a marker economy so each restored world is identifiable.
function makeShell({ seed = 73, marker = 'local-world', playtimeS = 31 } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.save.currentSlot = 'quick';
  state.meta.playtimeS = playtimeS;
  state.simTime = 31;
  state.tick = 1_860;
  state.world.currentSectorId = 'sector_helios_prime';
  state.economy.marker = marker;
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: vec(120, -35), vel: vec(8, -2), rot: 0.35, prevRot: 0.35,
    hull: 88, hullMax: 100, shield: 42, shieldMax: 50, cap: 12, capMax: 20, radius: 6,
    team: 0, factionId: 'faction_free', flags: {},
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
        ...spec, id, alive: spec.alive !== false,
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
  save._sharedStoreReady = false;
  save._sharedStoreMirrorHealthy = true;
  save._publishSharedStoreStatus();
  save._sharedStorePatch = null;
  save._sharedStoreFlushTimer = null;
  save._queueSharedStoreMirror = () => {};
  return { save, state, events };
}

function installEnv(storage) {
  const previous = { localStorage: globalThis.localStorage, location: globalThis.location, fetch: globalThis.fetch };
  globalThis.localStorage = storage;
  globalThis.location = { protocol: 'http:', host: '127.0.0.1' };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ keys: {} }) });
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
}

function envelopeRaw(marker, playtimeS) {
  return JSON.stringify(makeShell({ seed: 73, marker, playtimeS }).save.serialize('quick'));
}

// A damaged primary with a playable recovery copy, plus the bytes a second tab would write.
function setup() {
  resetSharedPlayerStoreMemoForTests();
  const storage = memoryStorage();
  const restoreEnv = installEnv(storage);
  const shell = makeShell({ seed: 99, marker: 'local-world' });
  const recoveryRaw = envelopeRaw('older-recovery', 100);
  const newerRaw = envelopeRaw('newer-progress', 900);
  const corruptRaw = '{ corrupt primary';
  storage.setItem('sf.save.quick', corruptRaw);
  storage.setItem('sf.recovery.quick', recoveryRaw);
  return { shell, storage, restoreEnv, recoveryRaw, newerRaw, corruptRaw };
}

// Run a hook inside the restore window: after Continue chose the recovery copy, before it promotes.
function duringRestore(shell, hook) {
  const original = shell.save._restorePreparedEnvelopeAsync.bind(shell.save);
  shell.save._restorePreparedEnvelopeAsync = async (prepared, slot, options) => {
    const result = await original(prepared, slot, options);
    hook(prepared, options);
    return result;
  };
}

const recoveredReceipts = (shell) => shell.events.filter((e) => e.name === 'save:recovered');

test('an undisturbed recovery still heals the damaged primary and says so', async () => {
  const t = setup();
  try {
    assert.equal(await t.shell.save.loadAsync('quick'), true);
    assert.equal(t.shell.state.economy.marker, 'older-recovery');
    assert.equal(t.storage.getItem('sf.save.quick'), t.recoveryRaw, 'control: the primary is promoted');
    const [receipt] = recoveredReceipts(t.shell);
    assert.equal(receipt.payload.promoted, true);
  } finally { t.restoreEnv(); }
});

test('newer bytes written to the primary during the restore are kept, not overwritten', async () => {
  const t = setup();
  try {
    duringRestore(t.shell, () => t.storage.setItem('sf.save.quick', t.newerRaw));
    assert.equal(await t.shell.save.loadAsync('quick'), true, 'the recovered session is still playable');
    assert.equal(t.storage.getItem('sf.save.quick'), t.newerRaw, 'newer progress survives');
    assert.equal(t.storage.getItem('sf.recovery.quick'), t.recoveryRaw);
    const [receipt] = recoveredReceipts(t.shell);
    assert.equal(receipt.payload.promoted, false, 'the receipt does not claim a repair that was skipped');
  } finally { t.restoreEnv(); }
});

test('a recovery copy rotated by another tab during the restore is not promoted either', async () => {
  const t = setup();
  try {
    duringRestore(t.shell, () => t.storage.setItem('sf.recovery.quick', t.newerRaw));
    assert.equal(await t.shell.save.loadAsync('quick'), true);
    assert.equal(t.storage.getItem('sf.save.quick'), t.corruptRaw, 'the primary is left alone');
    assert.equal(t.storage.getItem('sf.recovery.quick'), t.newerRaw);
    assert.equal(recoveredReceipts(t.shell)[0].payload.promoted, false);
  } finally { t.restoreEnv(); }
});

test('a primary written and put back to the same bytes inside the window is unchanged, so it heals', async () => {
  const t = setup();
  try {
    duringRestore(t.shell, () => {
      t.storage.setItem('sf.save.quick', t.newerRaw);
      t.storage.setItem('sf.save.quick', t.corruptRaw);
    });
    assert.equal(await t.shell.save.loadAsync('quick'), true);
    assert.equal(t.storage.getItem('sf.save.quick'), t.recoveryRaw);
  } finally { t.restoreEnv(); }
});

test('a restore superseded by a newer load promotes nothing and announces no repair', async () => {
  const t = setup();
  try {
    duringRestore(t.shell, () => { t.shell.save._restoreSequence += 1; });
    assert.equal(await t.shell.save.loadAsync('quick'), true);
    assert.equal(t.storage.getItem('sf.save.quick'), t.corruptRaw, 'no promotion from a superseded restore');
    assert.equal(recoveredReceipts(t.shell).length, 0, 'the newer load owns the story');
  } finally { t.restoreEnv(); }
});

test('a restore the owner reports without running promotes nothing', async () => {
  const t = setup();
  try {
    // The stale-accept / deferral / queued answers: truthy, but no session ran.
    t.shell.save._restorePreparedEnvelopeAsync = async () => true;
    assert.equal(await t.shell.save.loadAsync('quick'), true);
    assert.equal(t.storage.getItem('sf.save.quick'), t.corruptRaw);
    assert.equal(recoveredReceipts(t.shell)[0].payload.promoted, false);
  } finally { t.restoreEnv(); }
});

test('the synchronous Continue lane applies the same guard', () => {
  const t = setup();
  try {
    const original = t.shell.save._restorePreparedEnvelope.bind(t.shell.save);
    t.shell.save._restorePreparedEnvelope = (prepared, slot, options) => {
      const result = original(prepared, slot, options);
      t.storage.setItem('sf.save.quick', t.newerRaw);
      return result;
    };
    assert.equal(t.shell.save.load('quick'), true);
    assert.equal(t.storage.getItem('sf.save.quick'), t.newerRaw, 'newer progress survives the sync lane too');
    assert.equal(recoveredReceipts(t.shell)[0].payload.promoted, false);
  } finally { t.restoreEnv(); }
});

test('the synchronous lane still heals when nothing moved', () => {
  const t = setup();
  try {
    assert.equal(t.shell.save.load('quick'), true);
    assert.equal(t.storage.getItem('sf.save.quick'), t.recoveryRaw);
    assert.equal(recoveredReceipts(t.shell)[0].payload.promoted, true);
  } finally { t.restoreEnv(); }
});
