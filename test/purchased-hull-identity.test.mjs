import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { defaultShipAppearance, normalizeShipAppearance } from '../src/core/shipAppearance.js';
import { activeHullIdentity, isStarterHull } from '../src/data/hullIdentity.js';
import { buildPaintAppearance } from '../src/data/shipPaints.js';
import { save as savePrototype } from '../src/save/saveSystem.js';
import { ships as shipsPrototype } from '../src/systems/ships.js';

function harness() {
  const state = createGameState(4242);
  state.player.credits = 1_000_000;
  state.player.ownedShips = [{
    defId: 'ship_kestrel', fittings: [], appearance: defaultShipAppearance('ship_kestrel'),
  }];
  state.player.activeShipIndex = 0;
  const bus = createBus();
  const ships = Object.create(shipsPrototype);
  ships.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, ships };
}

test('a fresh Hitch keeps its own identity after the starter is sold', () => {
  const { state, ships } = harness();
  const starter = state.player.ownedShips[0];
  assert.equal(activeHullIdentity(state).name, 'Tessera');
  assert.equal(starter.appearance.decalId, 'borrowed_time');
  assert.equal(ships.buyShip({ defId: 'ship_kestrel' }), true);
  const purchased = state.player.ownedShips[1];
  assert.equal(purchased.starterHull, false);
  assert.deepEqual(purchased.appearance, { ...starter.appearance, decalId: 'none' });
  assert.equal(starter.appearance.decalId, 'borrowed_time', 'the original remains untouched');
  assert.equal(ships.setActiveShip(1), true);
  assert.equal(ships.sellShip(0), true);
  assert.equal(state.player.activeShipIndex, 0);
  assert.equal(isStarterHull(purchased, 0), false);
  assert.notEqual(activeHullIdentity(state).name, 'Tessera');
  assert.equal(activeHullIdentity(state).registration, null);

  const explicit = buildPaintAppearance(purchased.appearance, { decalId: 'borrowed_time' });
  assert.equal(ships.setShipAppearance({ appearance: explicit }), true);
  assert.equal(purchased.appearance.decalId, 'borrowed_time', 'the rack can still choose the mark');
  const saver = Object.create(savePrototype);
  saver.init({ state, bus: createBus(), helpers: {}, registry: { get: () => null } });
  const saveData = JSON.parse(JSON.stringify(saver.serializeData()));
  const restoredState = createGameState(4242);
  const restoreBus = createBus();
  const restoredShips = Object.create(shipsPrototype);
  restoredShips.init({ state: restoredState, bus: restoreBus, helpers: {}, registry: { get: () => null } });
  const loader = Object.create(savePrototype);
  loader.init({ state: restoredState, bus: restoreBus, helpers: {}, registry: { get: () => null } });
  loader._restorePlayer(saveData.player);
  restoreBus.emit('save:loaded', { slot: 'purchased-hull-identity' });
  const restored = restoredState.player.ownedShips[0];
  assert.equal(restored.starterHull, false);
  assert.equal(normalizeShipAppearance(restored.appearance, restored.defId).decalId, 'borrowed_time');
  assert.equal(isStarterHull(restored, 0), false);
});

test('granted and used-lot Hitches also avoid an invented starter identity', () => {
  const { state, ships } = harness();
  assert.equal(ships.buyShip({ defId: 'ship_kestrel', grant: true }), true);
  const granted = state.player.ownedShips[1];
  assert.equal(granted.starterHull, false);
  assert.equal(granted.appearance.decalId, 'none');
  state.lossLedger = { impound: { listingId: 'lot', defId: 'ship_kestrel', price: 100 } };
  assert.equal(ships.buyImpound({ listingId: 'lot' }), true);
  const used = state.player.ownedShips[2];
  assert.equal(used.starterHull, false);
  assert.equal(used.appearance.decalId, 'none');
  assert.equal(isStarterHull(used, 0), false);
});

test('old starter records and other class defaults remain unchanged', () => {
  const legacy = { defId: 'ship_kestrel', fittings: [] };
  assert.equal(isStarterHull(legacy, 0), true);
  assert.equal(normalizeShipAppearance(null, legacy.defId).decalId, 'borrowed_time');
  const { state, ships } = harness();
  assert.equal(ships.buyShip({ defId: 'ship_pelican', grant: true }), true);
  assert.deepEqual(state.player.ownedShips[1].appearance, defaultShipAppearance('ship_pelican'));
});
