// JULES-0392: Continue / latest-slot arbitration must not follow object insertion order.
// Run: node --test test/save-arbitration-insertion-order.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { save } from '../src/save/saveSystem.js';
import { latestOccupiedSlot } from '../src/ui/screens/saveLoad.js';

const TIED_AT = '2026-07-12T00:10:00.000Z';

function meta(slot, extras = {}) {
  return {
    slot,
    savedAt: TIED_AT,
    playtimeS: 100,
    version: CURRENT_VERSION,
    ...extras,
  };
}

function insertOrder(keys, build) {
  const slots = {};
  for (const key of keys) slots[key] = build(key);
  return slots;
}

/**
 * Compare semantic latest-slot results. On mismatch, name the first slot id
 * (UTF-16 order) that any permutation selected.
 */
function assertSameLatest(label, permutations, pick) {
  const results = permutations.map((slots) => pick(slots));
  const winner = results[0];
  const mismatch = results.findIndex((slot) => slot !== winner);
  if (mismatch === -1) return winner;
  const divergent = [...new Set(results.filter((slot) => slot != null))].sort()[0] ?? '(none)';
  assert.fail(
    `${label}: permutation ${mismatch} selected ${results[mismatch]} but permutation 0 selected ${winner}; first divergent key: ${divergent}`,
  );
}

test('tied slot maps agree across three insertion orders', () => {
  const keys = ['alpha', 'mid', 'zebra'];
  const orders = [
    ['alpha', 'mid', 'zebra'],
    ['zebra', 'mid', 'alpha'],
    ['mid', 'zebra', 'alpha'],
  ];
  const permutations = orders.map((order) => insertOrder(order, (key) => meta(key)));
  const winner = assertSameLatest('equal timestamp', permutations, latestOccupiedSlot);
  assert.equal(winner, 'zebra', 'equal timestamps and playtime break ties by descending slot id');
});

test('integer-index slot ids do not outrank string ids by enumeration order', () => {
  const orders = [
    ['auto', '2', '10', 'quick'],
    ['10', '2', 'quick', 'auto'],
    ['quick', 'auto', '10', '2'],
  ];
  const permutations = orders.map((order) => insertOrder(order, (key) => meta(key)));
  const winner = assertSameLatest('integer and string slot ids', permutations, latestOccupiedSlot);
  assert.equal(winner, 'quick');
});

test('a newer timestamp wins in every insertion order', () => {
  const orders = [
    ['alpha', 'mid', 'zebra'],
    ['zebra', 'alpha', 'mid'],
    ['mid', 'zebra', 'alpha'],
  ];
  const permutations = orders.map((order) => insertOrder(order, (key) => meta(key, {
    savedAt: key === 'alpha' ? '2026-07-12T00:40:00.000Z' : TIED_AT,
    playtimeS: key === 'zebra' ? 9000 : 10,
  })));
  const winner = assertSameLatest('newer timestamp', permutations, latestOccupiedSlot);
  assert.equal(winner, 'alpha');
});

test('equal timestamps use playtime, not key order', () => {
  const orders = [
    ['zebra', 'mid', 'alpha'],
    ['alpha', 'zebra', 'mid'],
    ['mid', 'alpha', 'zebra'],
  ];
  const permutations = orders.map((order) => insertOrder(order, (key) => meta(key, {
    playtimeS: key === 'mid' ? 500 : 10,
  })));
  const winner = assertSameLatest('playtime tie-break', permutations, latestOccupiedSlot);
  assert.equal(winner, 'mid');
});

test('missing timestamps still prefer higher playtime in every insertion order', () => {
  const orders = [
    ['quick', 'auto', 'manual'],
    ['auto', 'manual', 'quick'],
    ['manual', 'quick', 'auto'],
  ];
  const permutations = orders.map((order) => insertOrder(order, (key) => ({
    slot: key,
    playtimeS: key === 'auto' ? 420 : 120,
    version: CURRENT_VERSION,
  })));
  const winner = assertSameLatest('playtime fallback', permutations, latestOccupiedSlot);
  assert.equal(winner, 'auto');
});

function envelope(slot, { savedAt = TIED_AT, playtimeS = 100 } = {}) {
  const data = {
    meta: { seed: 47, playtimeS, createdAt: savedAt, lastSavedAt: savedAt },
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
    version: CURRENT_VERSION,
    savedAt,
    playtimeS,
    slot,
    checksum: fnv1a(JSON.stringify(data)),
    data,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
  };
}

test('live latest-slot resolution ignores storage insertion order', () => {
  const previous = globalThis.localStorage;
  const orders = [
    ['alpha', 'mid', 'zebra'],
    ['zebra', 'mid', 'alpha'],
    ['mid', 'zebra', 'alpha'],
  ];
  try {
    const selected = orders.map((order) => {
      const storage = memoryStorage();
      globalThis.localStorage = storage;
      for (const slot of order) {
        storage.setItem('sf.save.' + slot, JSON.stringify(envelope(slot)));
      }
      return save._latestSlot();
    });
    const winner = selected[0];
    const mismatch = selected.findIndex((slot) => slot !== winner);
    if (mismatch !== -1) {
      const divergent = [...new Set(selected.filter((slot) => slot != null))].sort()[0];
      assert.fail(
        `storage scan: permutation ${mismatch} selected ${selected[mismatch]} but permutation 0 selected ${winner}; first divergent key: ${divergent}`,
      );
    }
    assert.equal(winner, 'zebra');
  } finally {
    globalThis.localStorage = previous;
  }
});

test('menu and save/load both call the save-system latest-slot authority', () => {
  const menu = readFileSync(new URL('../src/ui/screens/mainMenu.js', import.meta.url), 'utf8');
  const saveLoad = readFileSync(new URL('../src/ui/screens/saveLoad.js', import.meta.url), 'utf8');
  const owner = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.match(menu, /selectLatestOccupiedSlot\(slots\)/);
  assert.doesNotMatch(menu, /score >= bestScore/);
  assert.match(saveLoad, /selectLatestOccupiedSlot\(slots\)/);
  assert.match(owner, /export function selectLatestOccupiedSlot\(slots\)/);
  assert.match(owner, /return selectLatestOccupiedSlot\(idx\)/);
  assert.match(owner, /selectLatestOccupiedSlot\(raw\)/);
});
