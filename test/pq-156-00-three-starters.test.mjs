// PQ-156.00 — three starters (Hitch/Skater, Pelican/Tug, Wasp/Brawler).
// Behavioral regression, no snapshots: the catalog holds exactly three distinct legal
// packages, a pick lands on the real new-game owned-ship record through the same seam
// main.js uses, and no pick writes a class or verb lock into player state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  DEFAULT_STARTER_ID,
  NEW_GAME,
  NEW_GAME_STARTERS,
  resolveNewGameStarter,
  starterById,
} from '../src/data/newGameDefaults.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  buildSlotList,
  fittingsFromDefaultModules,
  fits,
  outfitBudgetForFittings,
  ships as shipsPrototype,
} from '../src/systems/ships.js';

const FITTABLE = new Map([...WEAPONS, ...MODULES].map((def) => [def.id, def]));

// A real ships system on a real seeded state — the same objects startNewGame drives.
function newGameShips(seed = 11) {
  const state = createGameState(seed);
  const bus = createBus();
  const shipSystem = { ...shipsPrototype };
  shipSystem.init({ state, bus, helpers: {} });
  return { state, bus, shipSystem };
}

// The same overlay main.js applyStarterPick performs: ships.newGame() installs the legacy
// hull first, then a picked starter rewrites the active owned ship before the scene spawns.
function applyPick(state, shipSystem, opts) {
  const starter = resolveNewGameStarter(opts);
  if (!starter || starter.shipId === NEW_GAME.shipId) return null;
  const owned = state.player.ownedShips[state.player.activeShipIndex || 0];
  owned.defId = starter.shipId;
  owned.fittings = shipSystem.fittingsFromDefaults(starter.shipId, starter.fittedModules || []);
  return starter;
}

test('the catalog holds exactly three visibly distinct starters', () => {
  assert.equal(NEW_GAME_STARTERS.length, 3, 'exactly three starter packages');
  assert.deepEqual(
    NEW_GAME_STARTERS.map((s) => [s.name, s.tag]),
    [['Hitch', 'Skater'], ['Pelican', 'Tug'], ['Wasp', 'Brawler']],
    'the roadmap starters: skater, tug, brawler',
  );
  const ids = new Set();
  const shipIds = new Set();
  for (const starter of NEW_GAME_STARTERS) {
    for (const key of ['id', 'shipId', 'name', 'tag', 'blurb', 'line']) {
      assert.ok(typeof starter[key] === 'string' && starter[key].length > 0,
        `starter ${starter.id} needs player-facing ${key}`);
    }
    assert.ok(Array.isArray(starter.fittedModules) && starter.fittedModules.length > 0,
      `starter ${starter.id} needs a fitted loadout`);
    assert.ok(SHIPS.some((def) => def.id === starter.shipId),
      `starter ${starter.id} must map to a real hull def`);
    ids.add(starter.id);
    shipIds.add(starter.shipId);
  }
  assert.equal(ids.size, 3, 'starter ids are unique');
  assert.equal(shipIds.size, 3, 'starters fly three different hulls');
});

test('every starter fit is legal, T0-available, and inside the hull budgets', () => {
  for (const starter of NEW_GAME_STARTERS) {
    for (const id of starter.fittedModules) {
      const def = FITTABLE.get(id);
      assert.ok(def, `${starter.id}: ${id} must be a real module/weapon id`);
      assert.ok(!def.requiresTech, `${starter.id}: ${id} must not need research`);
    }
    const resolved = fittingsFromDefaultModules(starter.shipId, starter.fittedModules);
    // The resolver silently drops unknown/illegal ids — every listed id must survive.
    for (const id of starter.fittedModules) {
      assert.ok(resolved.includes(id), `${starter.id}: ${id} must land in a legal slot`);
    }
    const slots = buildSlotList(SHIPS.find((s) => s.id === starter.shipId));
    assert.equal(resolved.length, slots.length,
      `${starter.id}: fittings stay slot-parallel to the hull layout`);
    const budget = outfitBudgetForFittings(starter.shipId, resolved);
    assert.ok(budget && budget.fits,
      `${starter.id}: fit must sit inside outfit/weapon/engine budgets`);
  }
});

test('no pick resolves to the legacy Hitch default; picks resolve to their hulls', () => {
  assert.equal(resolveNewGameStarter(undefined), null);
  assert.equal(resolveNewGameStarter(null), null);
  assert.equal(resolveNewGameStarter({}), null);
  assert.equal(resolveNewGameStarter({ starter: 'no-such-starter' }), null);
  const fallback = starterById(DEFAULT_STARTER_ID);
  assert.equal(fallback.shipId, NEW_GAME.shipId, 'default starter is the legacy hull');
  assert.equal(fallback.shipId, 'ship_kestrel');
  assert.equal(fallback.name, 'Hitch');
  assert.deepEqual([...fallback.fittedModules], NEW_GAME.fittedModules,
    'the Hitch starter carries the untouched legacy fit');
  assert.equal(resolveNewGameStarter({ starter: 'starter_pelican' }).shipId, 'ship_pelican');
  assert.equal(resolveNewGameStarter({ starter: 'starter_wasp' }).shipId, 'ship_wasp');
});

test('a pick lands on the new-game owned-ship record; no pick stays byte-for-byte legacy', () => {
  const { state: legacyState, shipSystem: legacyShips } = newGameShips(11);
  legacyShips.newGame();
  const legacyShip = legacyState.player.ownedShips[legacyState.player.activeShipIndex];
  assert.equal(applyPick(legacyState, legacyShips, {}), null, 'absent starter applies nothing');
  assert.equal(applyPick(legacyState, legacyShips, { starter: 'bogus' }), null);
  assert.equal(legacyShip.defId, NEW_GAME.shipId);
  assert.deepEqual(legacyShip.fittings,
    fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules));

  for (const starter of NEW_GAME_STARTERS) {
    const { state, shipSystem } = newGameShips(11);
    shipSystem.newGame();
    const creditsBefore = state.player.credits;
    const picked = applyPick(state, shipSystem, { starter: starter.id });
    const owned = state.player.ownedShips[state.player.activeShipIndex];
    if (starter.shipId === NEW_GAME.shipId) {
      assert.equal(picked, null, 'the Hitch pick keeps the untouched legacy record');
    }
    assert.equal(owned.defId, starter.shipId, `${starter.id} must fly its own hull`);
    assert.deepEqual(owned.fittings,
      fittingsFromDefaultModules(starter.shipId, starter.fittedModules),
      `${starter.id} must fly its own resolved fit`);
    assert.equal(state.player.credits, creditsBefore, 'a pick never touches credits');
  }
});

test('no starter adds a permanent restriction — the record stays an ordinary owned ship', () => {
  const { state: legacyState, shipSystem: legacyShips } = newGameShips(11);
  legacyShips.newGame();
  const legacyKeys = Object.keys(legacyState.player.ownedShips[0]).sort();
  const playerKeys = Object.keys(legacyState.player).sort();

  for (const starter of NEW_GAME_STARTERS) {
    // The catalog itself carries no lock/class/verb gate.
    assert.deepEqual(Object.keys(starter).sort(),
      ['blurb', 'fittedModules', 'id', 'line', 'name', 'shipId', 'tag'],
      `${starter.id} carries presentation + fit data only`);

    const { state, shipSystem } = newGameShips(11);
    shipSystem.newGame();
    applyPick(state, shipSystem, { starter: starter.id });
    const owned = state.player.ownedShips[state.player.activeShipIndex];
    assert.deepEqual(Object.keys(owned).sort(), legacyKeys,
      `${starter.id}: owned-ship record keeps the legacy shape`);
    assert.deepEqual(Object.keys(state.player).sort(), playerKeys,
      `${starter.id}: player state grows no class/starter field`);

    // Refit path stays open: some ordinary module still fits an empty slot on this hull.
    const shipDef = SHIPS.find((s) => s.id === starter.shipId);
    const slots = buildSlotList(shipDef);
    const empty = slots.map((slot, i) => ({ slot, i })).filter(({ i }) => owned.fittings[i] == null);
    const fitsAny = empty.some(({ slot }) =>
      [...FITTABLE.values()].some((def) => def.slotType === slot.type && fits(slot, def)));
    assert.ok(fitsAny, `${starter.id}: the hull still accepts normal post-purchase modules`);
  }
});

test('a starter pick consumes no sim randomness and moves no clocks', () => {
  const { state: a, shipSystem: shipsA } = newGameShips(23);
  const { state: b, shipSystem: shipsB } = newGameShips(23);
  shipsA.newGame();
  shipsB.newGame();
  applyPick(a, shipsA, { starter: 'starter_wasp' });
  // Same seed + same call count ⇒ the pick drew nothing from the deterministic stream.
  assert.equal(a.rng(), b.rng(), 'applying a starter must not consume state.rng');
  assert.equal(a.simTime, b.simTime);
  assert.equal(a.tick, b.tick);
});

test('startNewGame applies the pick after ships.newGame and before the scene bootstrap', () => {
  // main.js cannot be imported under node (it boots on load), so pin the wiring in source:
  // the starter overlay must sit between the legacy populate and the entity spawn.
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(src, /resolveNewGameStarter/, 'main.js must resolve the starter pick');
  const populate = src.indexOf('ships.newGame()');
  const apply = src.indexOf('applyStarterPick(state, ships, opts);');
  const spawn = src.indexOf('bootstrapScene(state, helpers, bus, registry);');
  assert.ok(populate > -1 && apply > populate && spawn > apply,
    'starter pick must be applied between ships.newGame() and bootstrapScene()');
});
