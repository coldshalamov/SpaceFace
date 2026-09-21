import test from 'node:test';
import assert from 'node:assert/strict';

import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { save } from '../src/save/saveSystem.js';

// INF-091: Continue resolving past a dead newest slot must say so explicitly. The downgrade to
// the newest playable slot recovers the valid state; the receipt names the dead slot instead of
// silently downgrading — and never starts a fresh campaign under the old slot name, never
// overwrites (or deletes) the dead bytes, and preserves migrations on the loaded data.
function makeEnvelope({ slot = 'quick', savedAt, playtimeS = 60 } = {}) {
  const when = savedAt || '2026-07-12T00:00:00.000Z';
  const data = {
    meta: { seed: 47, playtimeS, createdAt: when, lastSavedAt: when },
    player: {
      credits: 1200,
      activeShipIndex: 0,
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
    },
    cargo: { items: {}, capVolume: 40, capMass: 40 },
    economy: {},
    factions: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: { sector_helios_prime: { id: 'sector_helios_prime', name: 'Helios Prime' } },
    },
    entities: {
      player: {
        id: 'saved-player', type: 'ship', defId: 'ship_kestrel',
        pos: { x: 10, z: 20 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
        hull: 100, shield: 100, cap: 100, flags: {}, data: {},
      },
      persistent: [],
      simTime: playtimeS,
      tick: playtimeS * 60,
    },
    missions: { active: [], completed: [], story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 } },
    automation: {},
    settings: { gameplay: {}, video: {}, audio: {}, controls: {} },
  };
  return {
    fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt: when, playtimeS, slot,
    checksum: fnv1a(JSON.stringify(data)), data,
  };
}

function makeStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) { key = String(key); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
  };
}

function installHarness(storage) {
  const previousStorage = globalThis.localStorage;
  const original = {
    state: save.state, bus: save.bus, restore: save._restore, hasPlayer: save._hasPlayerEntity,
  };
  const events = [];
  const restores = [];
  globalThis.localStorage = storage;
  save.state = { ui: {}, mode: 'menu' };
  save.bus = { emit(name, payload) { events.push({ name, payload }); } };
  save._hasPlayerEntity = () => false;
  save._restore = (data, slot, options) => {
    restores.push({ data, slot, options });
    return { restored: true, slot };
  };
  return {
    events,
    restores,
    restore() {
      save.state = original.state;
      save.bus = original.bus;
      save._restore = original.restore;
      save._hasPlayerEntity = original.hasPlayer;
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
    },
  };
}

function seedIndex(storage, entries) {
  storage.setItem('sf.save.index', JSON.stringify(entries));
}

test('INF-091 Continue past a dead newest slot loads the playable one and names the skip', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    const quickRaw = JSON.stringify(makeEnvelope({ slot: 'quick', savedAt: '2026-07-12T00:10:00.000Z', playtimeS: 600 }));
    storage.setItem('sf.save.quick', quickRaw);
    storage.setItem('sf.save.auto', '{newest-but-truncated');
    storage.setItem('sf.recovery.auto', '{"fmt":"spaceface-save","data":');
    seedIndex(storage, {
      quick: { slot: 'quick', savedAt: '2026-07-12T00:10:00.000Z', playtimeS: 600 },
      auto: { slot: 'auto', savedAt: '2026-07-12T00:20:00.000Z', playtimeS: 1200 },
    });
    assert.equal(save.load('latest'), true);
    assert.equal(h.restores.length, 1);
    assert.equal(h.restores[0].slot, 'quick');
    // the valid state arrives with migrations applied, under its own slot — never a fresh
    // campaign masquerading as the dead newest slot.
    assert.equal(h.restores[0].data.meta.playtimeS, 600);
    const skip = h.restores[0].options && h.restores[0].options.skippedNewer;
    assert.deepEqual(skip, { slot: 'auto', reason: 'parse_failed', recoveryReason: 'parse_failed' });
    // dead bytes are quarantined in place, valid bytes untouched.
    assert.equal(storage.getItem('sf.save.auto'), '{newest-but-truncated');
    assert.equal(storage.getItem('sf.recovery.auto'), '{"fmt":"spaceface-save","data":');
    assert.equal(storage.getItem('sf.save.quick'), quickRaw);
  } finally { h.restore(); }
});

test('INF-091 no skip is claimed when the newest slot is healthy', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    storage.setItem('sf.save.quick', JSON.stringify(makeEnvelope({ slot: 'quick', savedAt: '2026-07-12T00:10:00.000Z', playtimeS: 600 })));
    storage.setItem('sf.save.auto', JSON.stringify(makeEnvelope({ slot: 'auto', savedAt: '2026-07-12T00:20:00.000Z', playtimeS: 1200 })));
    seedIndex(storage, {
      quick: { slot: 'quick', savedAt: '2026-07-12T00:10:00.000Z', playtimeS: 600 },
      auto: { slot: 'auto', savedAt: '2026-07-12T00:20:00.000Z', playtimeS: 1200 },
    });
    assert.equal(save.load('latest'), true);
    assert.equal(h.restores[0].slot, 'auto');
    assert.equal(h.restores[0].options && h.restores[0].options.skippedNewer, undefined);
  } finally { h.restore(); }
});

test('INF-091 named loads never carry a skip verdict', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    storage.setItem('sf.save.quick', JSON.stringify(makeEnvelope({ slot: 'quick', playtimeS: 600 })));
    storage.setItem('sf.save.auto', '{newest-but-truncated');
    storage.setItem('sf.recovery.auto', '{also-corrupt');
    assert.equal(save.load('quick'), true);
    assert.equal(h.restores[0].options && h.restores[0].options.skippedNewer, undefined);
  } finally { h.restore(); }
});

test('INF-091 total failure names the dead newest slot and touches nothing live', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    storage.setItem('sf.save.quick', '{corrupt');
    storage.setItem('sf.recovery.quick', '{also-corrupt');
    storage.setItem('sf.save.auto', '{newest-but-truncated');
    storage.setItem('sf.recovery.auto', '{also-corrupt');
    seedIndex(storage, {
      quick: { slot: 'quick', savedAt: '2026-07-12T00:10:00.000Z', playtimeS: 600 },
      auto: { slot: 'auto', savedAt: '2026-07-12T00:20:00.000Z', playtimeS: 1200 },
    });
    assert.equal(save.load('latest'), false);
    assert.equal(h.restores.length, 0, 'no restore starts, so the running world is untouched');
    const error = h.events.find((event) => event.name === 'save:error');
    assert.deepEqual(error && error.payload.skippedNewer,
      { slot: 'auto', reason: 'parse_failed', recoveryReason: 'parse_failed' });
    assert.equal(storage.getItem('sf.save.auto'), '{newest-but-truncated');
  } finally { h.restore(); }
});

test('INF-091 transient storage failure yields no skip verdict', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  const throwing = {
    ...storage,
    getItem() { throw new Error('transient read failure'); },
  };
  globalThis.localStorage = throwing;
  try {
    assert.equal(save._newerUnplayableSkip(), null);
  } finally { h.restore(); }
});
