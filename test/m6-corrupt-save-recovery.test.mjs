// M6 corrupted-save recovery: transactional previous generation + Continue failover.
// Run: node --test test/m6-corrupt-save-recovery.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { save } from '../src/save/saveSystem.js';
import { slotBadges } from '../src/ui/screens/saveLoad.js';

function makeEnvelope({ slot = 'quick', savedAt, playtimeS = 60, version = CURRENT_VERSION } = {}) {
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
        id: 'saved-player',
        type: 'ship',
        defId: 'ship_kestrel',
        pos: { x: 10, z: 20 },
        vel: { x: 0, z: 0 },
        rot: 0,
        angVel: 0,
        hull: 100,
        shield: 100,
        cap: 100,
        flags: {},
        data: {},
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
    fmt: 'spaceface-save',
    version,
    savedAt: when,
    playtimeS,
    slot,
    checksum: fnv1a(JSON.stringify(data)),
    data,
  };
}

function makeStorage() {
  const values = new Map();
  let corruptNextPrimary = false;
  let failNextRecovery = false;
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) { key = String(key); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      key = String(key);
      value = String(value);
      if (failNextRecovery && key.startsWith('sf.recovery.')) {
        failNextRecovery = false;
        const error = new Error('quota');
        error.name = 'QuotaExceededError';
        throw error;
      }
      if (corruptNextPrimary && key === 'sf.save.quick') {
        corruptNextPrimary = false;
        values.set(key, value.slice(0, Math.max(1, value.length >> 1)));
        return;
      }
      values.set(key, value);
    },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
    corruptNextPrimaryWrite() { corruptNextPrimary = true; },
    failNextRecoveryWrite() { failNextRecovery = true; },
  };
}

function installHarness(storage) {
  const previousStorage = globalThis.localStorage;
  const original = {
    state: save.state,
    bus: save.bus,
    restore: save._restore,
    serialize: save.serialize,
    hasPlayer: save._hasPlayerEntity,
  };
  const events = [];
  globalThis.localStorage = storage;
  save.state = {
    meta: { playtimeS: 900, lastSavedAt: '' },
    save: { currentSlot: null },
    player: { credits: 1200, activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }] },
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: { sector_helios_prime: { id: 'sector_helios_prime', name: 'Helios Prime' } },
    },
    nav: {},
    missions: { active: [] },
    story: { beatIndex: 0 },
    ui: {},
  };
  save.bus = { emit(name, payload) { events.push({ name, payload }); } };
  return {
    events,
    restore() {
      save.state = original.state;
      save.bus = original.bus;
      save._restore = original.restore;
      save.serialize = original.serialize;
      save._hasPlayerEntity = original.hasPlayer;
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
    },
  };
}

test('successful overwrite rotates the valid previous generation and emits a backup receipt', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    const oldEnvelope = makeEnvelope({ savedAt: '2026-07-12T00:00:00.000Z', playtimeS: 100 });
    const newEnvelope = makeEnvelope({ savedAt: '2026-07-12T00:10:00.000Z', playtimeS: 700 });
    const oldRaw = JSON.stringify(oldEnvelope);
    storage.setItem('sf.save.quick', oldRaw);
    save.serialize = () => newEnvelope;
    save._hasPlayerEntity = () => true;

    assert.equal(save.save('quick', { reason: 'manual' }), true);
    assert.equal(storage.getItem('sf.recovery.quick'), oldRaw);
    assert.deepEqual(JSON.parse(storage.getItem('sf.save.quick')), newEnvelope);
    const receipt = h.events.find((event) => event.name === 'save:backup');
    assert.equal(receipt?.payload.source, 'previous_generation');
    assert.equal(receipt?.payload.savedAt, oldEnvelope.savedAt);
    assert.ok(h.events.some((event) => event.name === 'save:completed'));
  } finally { h.restore(); }
});

test('corrupt current bytes never rotate over the last known-good recovery generation', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    const recovery = JSON.stringify(makeEnvelope({ savedAt: '2026-07-12T00:00:00.000Z' }));
    storage.setItem('sf.save.quick', '{corrupt');
    storage.setItem('sf.recovery.quick', recovery);
    const result = save._writeSlot('quick', makeEnvelope({ savedAt: '2026-07-12T00:20:00.000Z' }));
    assert.equal(result.ok, true);
    assert.equal(result.backupCreated, false);
    assert.equal(storage.getItem('sf.recovery.quick'), recovery);
  } finally { h.restore(); }
});

test('read-back verification rolls a truncated primary write back to the previous bytes', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    const oldRaw = JSON.stringify(makeEnvelope({ savedAt: '2026-07-12T00:00:00.000Z' }));
    storage.setItem('sf.save.quick', oldRaw);
    storage.corruptNextPrimaryWrite();
    const result = save._writeSlot('quick', makeEnvelope({ savedAt: '2026-07-12T00:20:00.000Z' }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'write_verify_parse');
    assert.equal(storage.getItem('sf.save.quick'), oldRaw);
    assert.equal(storage.getItem('sf.recovery.quick'), oldRaw);
  } finally { h.restore(); }
});

test('backup quota failure refuses to overwrite the current playable generation', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    const oldRaw = JSON.stringify(makeEnvelope({ savedAt: '2026-07-12T00:00:00.000Z' }));
    storage.setItem('sf.save.quick', oldRaw);
    storage.failNextRecoveryWrite();
    const result = save._writeSlot('quick', makeEnvelope({ savedAt: '2026-07-12T00:20:00.000Z' }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'backup_quota');
    assert.equal(storage.getItem('sf.save.quick'), oldRaw);
  } finally { h.restore(); }
});

test('named load recovers a corrupt primary without publishing a false load error', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    const backup = makeEnvelope({ savedAt: '2026-07-12T00:05:00.000Z', playtimeS: 300 });
    const backupRaw = JSON.stringify(backup);
    storage.setItem('sf.save.quick', '{corrupt');
    storage.setItem('sf.recovery.quick', backupRaw);
    let restored = null;
    save._restore = (data, slot) => { restored = { data, slot }; };

    assert.equal(save.load('quick'), true);
    assert.equal(restored?.slot, 'quick');
    assert.equal(restored?.data.meta.playtimeS, 300);
    assert.equal(storage.getItem('sf.save.quick'), backupRaw, 'valid backup self-heals the primary');
    assert.equal(h.events.some((event) => event.name === 'save:error'), false);
    const receipt = h.events.find((event) => event.name === 'save:recovered');
    assert.equal(receipt?.payload.failedReason, 'parse_failed');
    assert.equal(receipt?.payload.promoted, true);
  } finally { h.restore(); }
});

test('Continue resolver skips an unrecoverable newest slot and selects the newest playable save', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    storage.setItem('sf.save.quick', JSON.stringify(makeEnvelope({
      slot: 'quick', savedAt: '2026-07-12T00:10:00.000Z', playtimeS: 600,
    })));
    storage.setItem('sf.save.auto', '{newest-but-corrupt');
    storage.setItem('sf.save.index', JSON.stringify({
      quick: { slot: 'quick', savedAt: '2026-07-12T00:10:00.000Z', playtimeS: 600 },
      auto: { slot: 'auto', savedAt: '2026-07-12T00:20:00.000Z', playtimeS: 1200 },
    }));
    assert.equal(save._latestSlot(), 'quick');
    assert.deepEqual(Object.keys(save.listSlots()), ['quick']);
  } finally { h.restore(); }
});

test('Continue uses full restore preparation, not checksum-only slot metadata', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    const oldGood = makeEnvelope({ slot: 'quick', savedAt: '2026-07-12T00:10:00.000Z', playtimeS: 600 });
    const deadNewest = makeEnvelope({ slot: 'auto', savedAt: '2026-07-12T00:20:00.000Z', playtimeS: 1200 });
    delete deadNewest.data.entities.player;
    deadNewest.checksum = fnv1a(JSON.stringify(deadNewest.data));
    storage.setItem('sf.save.quick', JSON.stringify(oldGood));
    storage.setItem('sf.save.auto', JSON.stringify(deadNewest));
    storage.setItem('sf.save.index', JSON.stringify({
      quick: { slot: 'quick', savedAt: oldGood.savedAt, playtimeS: oldGood.playtimeS },
      auto: { slot: 'auto', savedAt: deadNewest.savedAt, playtimeS: deadNewest.playtimeS },
    }));
    assert.equal(save._latestSlot(), 'quick');
    assert.equal(save.listSlots().auto, undefined, 'checksum-valid but non-restorable primary stays hidden');

    const autoRecovery = makeEnvelope({ slot: 'auto', savedAt: '2026-07-12T00:15:00.000Z', playtimeS: 900 });
    storage.setItem('sf.recovery.auto', JSON.stringify(autoRecovery));
    assert.equal(save._latestSlot(), 'auto', 'same slot becomes playable through its prepared recovery');
    assert.equal(save.listSlots().auto.recoveryAvailable, true);
  } finally { h.restore(); }
});

test('backup-only slots remain discoverable, identify recovery status, and delete atomically', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    storage.setItem('sf.recovery.auto', JSON.stringify(makeEnvelope({ slot: 'auto', playtimeS: 480 })));
    const slots = save.listSlots();
    assert.equal(slots.auto.recoveryAvailable, true);
    assert.equal(slots.auto.integrity, 'recovery');
    assert.deepEqual(slotBadges('auto', slots.auto, null, 'auto'), ['Recovery', 'Latest', 'v' + CURRENT_VERSION]);
    assert.equal(save._latestSlot(), 'auto');
    save.deleteSlot('auto');
    assert.equal(storage.getItem('sf.save.auto'), null);
    assert.equal(storage.getItem('sf.recovery.auto'), null);
    assert.equal(save._latestSlot(), null);
  } finally { h.restore(); }
});

test('double corruption fails closed without touching the running world', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    storage.setItem('sf.save.quick', '{corrupt');
    storage.setItem('sf.recovery.quick', '{also-corrupt');
    let restoreCalls = 0;
    save._restore = () => { restoreCalls += 1; };
    assert.equal(save.load('quick'), false);
    assert.equal(restoreCalls, 0);
    const error = h.events.find((event) => event.name === 'save:error');
    assert.equal(error?.payload.reason, 'parse_failed');
    assert.equal(error?.payload.recoveryReason, 'parse_failed');
  } finally { h.restore(); }
});

test('export never returns a corrupt primary when a validated recovery generation exists', () => {
  const storage = makeStorage();
  const h = installHarness(storage);
  try {
    const backupRaw = JSON.stringify(makeEnvelope({ savedAt: '2026-07-12T00:05:00.000Z' }));
    storage.setItem('sf.save.quick', '{corrupt');
    storage.setItem('sf.recovery.quick', backupRaw);
    assert.equal(save.exportSlot('quick'), backupRaw);
    assert.ok(h.events.some((event) => event.name === 'save:exportRecovery'));
  } finally { h.restore(); }
});
