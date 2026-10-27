// SWARM-05 §4.2 — the hangar hull rack. Bounty buys a hull ONCE and it rides the manifest of
// every later swarm run: buyCrucibleHangarHull is the profile seam the door's rack buttons
// press, hangarHullRack/View is what they paint, and applyHangarToPlayer is the run-side
// grant that makes the purchase permanent. Seed 4242.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { SHIPS } from '../src/data/ships.js';
import {
  emptyHangar,
  HANGAR_HULL_PRICES,
  hangarHullPrice,
  hangarHullRack,
  hangarHullRackView,
  migrateHangar,
} from '../src/data/swarmHangar.js';
import { applyHangarToPlayer } from '../src/systems/swarmHangar.js';
import {
  buyCrucibleHangarHull,
  emptyCrucibleProfile,
  loadCrucibleMeta,
  resetCrucibleMetaForTests,
  saveCrucibleMeta,
  useCrucibleMetaClock,
} from '../src/systems/survivalRecords.js';

const SEED = 4242;

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

function resetMeta() {
  resetCrucibleMetaForTests();
  useCrucibleMetaClock(() => '2026-10-03T00:00:00.000Z');
}

// (a) The rack renders priced hulls — every door hull with name + bounty price, tier order.
test('the rack lists every saleable hull priced by tier, earn-only hulls excepted', () => {
  const rack = hangarHullRack();
  const saleable = SHIPS.filter((ship) => ship && !ship.swarmEarned);
  assert.equal(rack.length, saleable.length);
  assert.equal(rack.some((row) => /saucer/i.test(row.hullId)), false,
    'the Saucer is the crossover ledger\'s proof, never rack stock');
  for (const row of rack) {
    assert.equal(typeof row.hullId, 'string');
    assert.equal(typeof row.name, 'string');
    assert.equal(Number.isInteger(row.price) && row.price > 0, true, row.hullId);
    assert.equal(row.price, hangarHullPrice(SHIPS.find((ship) => ship.id === row.hullId)));
  }
  // Cheapest first — the same order the door's own hull list takes.
  const tiers = rack.map((row) => row.tier);
  assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b));
  const hitch = rack.find((row) => row.hullId === 'ship_kestrel');
  const leviathan = rack.find((row) => row.hullId === 'ship_leviathan');
  assert.equal(hitch.price, HANGAR_HULL_PRICES[0]);
  assert.ok(leviathan.price > hitch.price, 'a permanent grant prices by tier');
});

// (b) The buy intent lands: the profile's ownedHulls grows, the bounty drops, and the rack
// view the door paints flips the row to owned — the same ownedHulls the bay counter reads.
test('buyCrucibleHangarHull grows ownedHulls, drops the bounty, flips the rack row', () => {
  resetMeta();
  const storage = memoryStorage();
  const profile = emptyCrucibleProfile();
  profile.hangar = migrateHangar({ bounty: 1000 });
  assert.equal(saveCrucibleMeta(profile, storage), true);

  const res = buyCrucibleHangarHull('ship_kestrel', HANGAR_HULL_PRICES[0], storage);
  assert.equal(res.ok, true);
  assert.equal(res.hangar.bounty, 1000 - HANGAR_HULL_PRICES[0]);
  assert.deepEqual(res.hangar.ownedHulls, ['ship_kestrel']);

  // The door's next paint reads the saved bag: the bay counter's source grew by one.
  const reloaded = loadCrucibleMeta(storage);
  assert.deepEqual(reloaded.hangar.ownedHulls, ['ship_kestrel']);
  assert.equal(reloaded.hangar.bounty, 1000 - HANGAR_HULL_PRICES[0]);
  const view = hangarHullRackView(reloaded.hangar);
  const row = view.find((entry) => entry.hullId === 'ship_kestrel');
  assert.equal(row.owned, true);
  assert.equal(row.buyable, false, 'owned rows never offer a second sale');
  assert.equal(view.filter((entry) => entry.owned).length, reloaded.hangar.ownedHulls.length,
    'the rack\'s owned count is the bay counter\'s count');
});

// (c) Honest refusals: short bounty, already owned, and the earn-only hull buyHull refuses.
test('short bounty, an owned hull, and the Saucer all refuse honestly', () => {
  resetMeta();
  const storage = memoryStorage();
  const profile = emptyCrucibleProfile();
  profile.hangar = migrateHangar({ bounty: 100, ownedHulls: ['ship_wasp'] });
  assert.equal(saveCrucibleMeta(profile, storage), true);

  const short = buyCrucibleHangarHull('ship_kestrel', HANGAR_HULL_PRICES[0], storage);
  assert.equal(short.ok, false);
  assert.equal(short.reason, 'short');

  const owned = buyCrucibleHangarHull('ship_wasp', hangarHullPrice({ tier: 1 }), storage);
  assert.equal(owned.ok, false);
  assert.equal(owned.reason, 'owned');

  const saucer = buyCrucibleHangarHull('ship_saucer', 1, storage);
  assert.equal(saucer.ok, false);
  assert.equal(saucer.reason, 'refused');

  // Nothing moved: the bag the next paint reads still shows one hull and the full bounty.
  const reloaded = loadCrucibleMeta(storage);
  assert.equal(reloaded.hangar.bounty, 100);
  assert.deepEqual(reloaded.hangar.ownedHulls, ['ship_wasp']);
  const view = hangarHullRackView(reloaded.hangar);
  assert.equal(view.find((entry) => entry.hullId === 'ship_kestrel').buyable, false,
    'a hull the bounty cannot stand stays disabled');
});

// (d) The purchase survives into the next run: the saved bag's ownedHulls becomes a manifest
// entry — a real player.ownedShips row the armory cradle can switch to for free.
test('a bought hull rides the next run\'s manifest through applyHangarToPlayer', () => {
  resetMeta();
  const storage = memoryStorage();
  const profile = emptyCrucibleProfile();
  profile.hangar = migrateHangar({ bounty: 5000 });
  assert.equal(saveCrucibleMeta(profile, storage), true);
  assert.equal(buyCrucibleHangarHull('ship_wasp', hangarHullPrice({ tier: 1 }), storage).ok, true);

  const state = createGameState(SEED);
  const before = state.player.ownedShips.length;
  applyHangarToPlayer(state, loadCrucibleMeta(storage).hangar);
  assert.equal(state.player.ownedShips.length, before + 1);
  const granted = state.player.ownedShips.find((row) => row && row.defId === 'ship_wasp');
  assert.ok(granted, 'the bought hull is on the run manifest');
  assert.ok(Array.isArray(granted.fittings), 'the grant arrives as a real owned hull');

  // Idempotent: re-applying the same bag never double-parks the hull.
  applyHangarToPlayer(state, loadCrucibleMeta(storage).hangar);
  assert.equal(state.player.ownedShips.filter((row) => row && row.defId === 'ship_wasp').length, 1);
});

// The empty hangar's rack still renders: every row offered, nothing buyable on zero bounty.
test('a fresh bay shows the whole rack disabled until bounty lands', () => {
  const view = hangarHullRackView(emptyHangar());
  assert.equal(view.length, SHIPS.filter((ship) => ship && !ship.swarmEarned).length);
  assert.equal(view.every((row) => row.owned === false && row.buyable === false), true);
});
