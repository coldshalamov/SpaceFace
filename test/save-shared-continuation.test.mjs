// SF-282 — Browser and Electron continue the SAME campaign: there is one save path, not two.
//
// Verified convergence (the premise this file pins):
//   * scripts/lib/playerSaveStore.cjs owns one on-disk drawer (SpaceFace/player-saves, or
//     SPACEFACE_PLAYER_STORE_DIR) served on /__spaceface_player_store by attachPlayerStore().
//   * scripts/lib/gameServer.cjs mounts that route through createGameServer({playerStoreDir}),
//     which BOTH shells build their loopback server with — server.js resolves it via
//     resolveMountedPlayerStoreDir(), electron/main.cjs via resolvePlayerSaveDir(process.env);
//     for an unset variable those are literally the same function call.
//   * src/save/sharedPlayerStore.js is the single client adapter: it mirrors sf.save.* /
//     sf.recovery.* / profile keys between this shell's localStorage and whichever loopback
//     origin served the game, merging last-writer-wins with deletion tombstones. No code path
//     in src/save branches on the shell.
//   * Isolation controls exist on purpose and are NOT save divergence: an empty
//     SPACEFACE_PLAYER_STORE_DIR unmounts the store for browser test servers, and Electron
//     evidence runs pass playerStoreDir:null via launchConfig.isolatedEvidence.
//
// These tests simulate the two shells against one real drawer — the fetch stub routes the
// loopback calls to the exact readPlayerStoreKeysSync/writePlayerStoreKeysSync the HTTP
// handler uses — and prove that a save written in one shell is what Continue restores in the
// other, that a stale local copy loses to the shared newer one, and that a failed mirror leaves
// the local save durable and truthful about mirror health.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

import { createGameState } from '../src/core/gameState.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';
import { resetSharedPlayerStoreMemoForTests } from '../src/save/sharedPlayerStore.js';

const require = createRequire(import.meta.url);
const {
  PLAYER_STORE_ROUTE,
  readPlayerStoreKeysSync,
  writePlayerStoreKeysSync,
  resolvePlayerSaveDir,
  resolveMountedPlayerStoreDir,
} = require('../scripts/lib/playerSaveStore.cjs');

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

// A live campaign in one shell: the same minimal seam surface as the save atomicity tests —
// real createGameState, real _restore chain, and a marker economy so each shell's restored
// world is identifiable.
function makeShell({ seed = 73, marker = 'local-world' } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.save.currentSlot = 'quick';
  state.meta.playtimeS = 31;
  state.simTime = 31;
  state.tick = 1_860;
  state.world.currentSectorId = 'sector_helios_prime';
  state.economy.marker = marker;

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
  save._sharedStoreReady = false;
  save._sharedStoreMirrorHealthy = true;
  save._sharedStorePatch = null;
  save._sharedStoreFlushTimer = null;
  return { save, state, events };
}

// Swap the three ambient globals sharedPlayerStore reads (localStorage, http location, fetch)
// for the shell under test, and put them back when the shell's turn ends.
function installEnv({ storage, fetchImpl }) {
  const previous = {
    localStorage: globalThis.localStorage,
    location: globalThis.location,
    fetch: globalThis.fetch,
  };
  globalThis.localStorage = storage;
  globalThis.location = { protocol: 'http:', host: '127.0.0.1' };
  globalThis.fetch = fetchImpl;
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
}

// The loopback route body: identical key surface and disk bytes to handlePlayerStoreRequest,
// which calls these same two functions. A real HTTP round trip is covered by
// player-save-store.test.mjs; here the shells are the unit under test.
function loopbackStore(storeDir) {
  return async (url, options = {}) => {
    assert.equal(String(url), PLAYER_STORE_ROUTE, 'client only ever speaks the store route');
    const method = options.method || 'GET';
    if (method === 'PUT') {
      const body = JSON.parse(options.body);
      const keys = writePlayerStoreKeysSync(storeDir, body.keys);
      return { ok: true, status: 200, json: async () => ({ ok: true, keys }) };
    }
    return { ok: true, status: 200, json: async () => ({ keys: readPlayerStoreKeysSync(storeDir) }) };
  };
}

async function flushMirror() {
  // The mirror flush is a setTimeout(0) hop + one settled fetch round trip.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('a save written in one shell is the save Continue restores in the other', async () => {
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-shared-store-'));
  try {
    resetSharedPlayerStoreMemoForTests();
    const fetchStore = loopbackStore(storeDir);

    // Shell A ("browser" profile): fresh boot against an empty shared drawer, then a save.
    const storageA = memoryStorage();
    let restoreEnv = installEnv({ storage: storageA, fetchImpl: fetchStore });
    const shellA = makeShell({ seed: 73, marker: 'browser-campaign' });
    await shellA.save._syncSharedPlayerStore();
    assert.equal(shellA.save.isSharedStoreSyncPending(), false, 'boot sync settles');
    assert.equal(shellA.save.save('quick'), true, 'the local slot write succeeds');
    await flushMirror();
    restoreEnv();

    // The durable bytes live in the shared drawer both shells mount.
    const onDisk = readPlayerStoreKeysSync(storeDir);
    assert.equal(onDisk['sf.save.quick'], storageA.getItem('sf.save.quick'),
      'the mirrored envelope is byte-identical to the local slot');
    assert.equal(typeof onDisk['sf.save.index'], 'string', 'the slot index mirrors too');

    // Shell B ("electron" profile): a different seed and campaign — the sync must replace it
    // with A's continuation, because 'latest' means the newest save either shell wrote.
    const storageB = memoryStorage();
    restoreEnv = installEnv({ storage: storageB, fetchImpl: fetchStore });
    const shellB = makeShell({ seed: 99, marker: 'electron-campaign' });
    await shellB.save._syncSharedPlayerStore();
    assert.equal(shellB.save.isSharedStoreSyncPending(), false);
    assert.equal(storageB.getItem('sf.save.quick'), onDisk['sf.save.quick'],
      'boot sync pulls the other shell\'s envelope into this shell\'s local mirror');

    assert.equal(shellB.save.load('latest'), true, 'Continue resolves the shared slot');
    assert.equal(shellB.state.economy.marker, 'browser-campaign',
      'Continue restores the campaign the other shell saved');
    assert.equal(shellB.state.meta.seed, 73, 'the restored run is A\'s run, not B\'s fresh one');
    assert.equal(shellB.state.meta.playtimeS, 31);
    assert.equal(shellB.state.save.currentSlot, 'quick');
    restoreEnv();
  } finally {
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
});

test('a stale local copy loses to the shared drawer so a failed earlier mirror cannot fork the save', async () => {
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-shared-store-'));
  try {
    resetSharedPlayerStoreMemoForTests();
    const fetchStore = loopbackStore(storeDir);

    // Seed the shared drawer with shell A's newer campaign (as if A's own mirror had landed).
    const storageA = memoryStorage();
    let restoreEnv = installEnv({ storage: storageA, fetchImpl: fetchStore });
    const shellA = makeShell({ seed: 73, marker: 'browser-campaign' });
    shellA.state.meta.playtimeS = 400;
    const newerEnvelope = shellA.save.serialize('quick');
    writePlayerStoreKeysSync(storeDir, {
      'sf.save.quick': JSON.stringify(newerEnvelope),
      'sf.save.index': JSON.stringify({ quick: { savedAt: newerEnvelope.savedAt } }),
    });
    restoreEnv();

    // Shell B still holds an older local copy — the leftover of a session whose mirror never
    // landed (store unreachable, power loss). Boot sync must converge it to the newer shared
    // bytes instead of resurrecting the stale envelope into the drawer.
    const storageB = memoryStorage();
    restoreEnv = installEnv({ storage: storageB, fetchImpl: fetchStore });
    const shellB = makeShell({ seed: 99, marker: 'electron-campaign' });
    const staleEnvelope = shellB.save.serialize('quick');
    staleEnvelope.savedAt = '2000-01-01T00:00:00.000Z';
    storageB.setItem('sf.save.quick', JSON.stringify(staleEnvelope));
    storageB.setItem('sf.save.index', JSON.stringify({ quick: { savedAt: staleEnvelope.savedAt } }));

    await shellB.save._syncSharedPlayerStore();
    assert.equal(storageB.getItem('sf.save.quick'), JSON.stringify(newerEnvelope),
      'the newer shared envelope replaces the stale local copy');
    assert.equal(readPlayerStoreKeysSync(storeDir)['sf.save.quick'], JSON.stringify(newerEnvelope),
      'the stale copy is not pushed back over the drawer');

    assert.equal(shellB.save.load('latest'), true);
    assert.equal(shellB.state.economy.marker, 'browser-campaign');
    assert.equal(shellB.state.meta.playtimeS, 400,
      'Continue normalizes the newer save, not the local remnant');
    restoreEnv();
  } finally {
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
});

test('a failed mirror still leaves the local save durable and the mirror health truthful', async () => {
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-shared-store-'));
  try {
    resetSharedPlayerStoreMemoForTests();
    // The store route exists in the game but its fetch keeps failing (server down mid-save).
    const fetchFails = async (url, options = {}) => {
      assert.equal(String(url), PLAYER_STORE_ROUTE);
      if ((options.method || 'GET') === 'PUT') throw new Error('connection refused');
      return { ok: true, status: 200, json: async () => ({ keys: readPlayerStoreKeysSync(storeDir) }) };
    };

    const storageA = memoryStorage();
    const restoreEnv = installEnv({ storage: storageA, fetchImpl: fetchFails });
    const shellA = makeShell({ seed: 73, marker: 'browser-campaign' });
    shellA.save._sharedStoreReady = true; // boot sync already settled; this is a mid-session save
    assert.equal(shellA.save.save('quick'), true, 'local durability never waits on the mirror');
    await flushMirror();
    assert.equal(shellA.save.isSharedStoreMirrorHealthy(), false,
      'a missed mirror reports unhealthy instead of pretending sync');
    assert.equal(typeof storageA.getItem('sf.save.quick'), 'string',
      'the durable copy lives in this shell\'s storage either way');

    // The same slot still continues in this shell — local storage remains the durable store.
    assert.equal(shellA.save.load('quick'), true);
    assert.equal(shellA.state.economy.marker, 'browser-campaign');
    restoreEnv();
  } finally {
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
});

test('both shells resolve the same default player drawer', () => {
  // Electron launches the store with resolvePlayerSaveDir(process.env); browser game servers
  // mount via resolveMountedPlayerStoreDir(env). With the variable unset both must resolve the
  // one drawer — a drift here would silently fork Continue between the shells.
  assert.equal(resolveMountedPlayerStoreDir({}), resolvePlayerSaveDir({}));
  assert.equal(
    resolveMountedPlayerStoreDir({ SPACEFACE_PLAYER_STORE_DIR: '  shared-drawer  ' }),
    resolvePlayerSaveDir({ SPACEFACE_PLAYER_STORE_DIR: 'shared-drawer' }),
    'an explicit override lands in the same place for both shells',
  );
  // The deliberate asymmetry: an EMPTY override unmounts the store for isolated browser test
  // servers (Electron's equivalent isolation is playerStoreDir:null via isolatedEvidence).
  assert.equal(resolveMountedPlayerStoreDir({ SPACEFACE_PLAYER_STORE_DIR: '' }), '');
});
