// Shipworks UI intents must stay narrower than the internal ships authority. A station click can
// buy a priced hull and consume an owned module instance, while drafts/rewards/sandbox callers
// retain the direct grant/defId forms on the ships owner.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { buildSlotList, ships as shipsPrototype } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const UTILITY_SLOT = 5;
const UTILITY_DEF = 'mod_cargo_scanner_s';

function boot({ credits = 0, inventory = [], docked = true, stationId = 'station_helios' } = {}) {
  const state = createGameState(0x51a7);
  const kestrel = SHIP_BY_ID.get('ship_kestrel');
  state.player.credits = credits;
  state.player.ownedShips = [{
    defId: kestrel.id,
    fittings: Array(buildSlotList(kestrel).length).fill(null),
  }];
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = inventory.map((item) => ({ ...item }));
  state.ui.docked = docked;
  state.ui.dockedStationId = stationId;

  const bus = createBus();
  const charges = [];
  const purchases = [];
  const equipped = [];
  const refusals = [];
  bus.on('economy:chargeCredits', (payload) => {
    charges.push(payload);
    state.player.credits -= payload.amount;
  });
  bus.on('ship:purchased', (payload) => purchases.push(payload));
  bus.on('module:equipped', (payload) => equipped.push(payload));
  bus.on('module:fitRefused', (payload) => refusals.push(payload));

  const ships = Object.assign({}, shipsPrototype, { _instSeq: 0 });
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships, charges, purchases, equipped, refusals };
}

function ownershipSnapshot(state) {
  return JSON.stringify({
    credits: state.player.credits,
    ownedShips: state.player.ownedShips,
    moduleInventory: state.player.moduleInventory,
    activeShipIndex: state.player.activeShipIndex,
  });
}

test('forged grant and defId UI requests refuse repeatedly without minting ownership', () => {
  const h = boot();
  const before = ownershipSnapshot(h.state);

  for (let i = 0; i < 3; i += 1) {
    h.bus.emit('ui:buyShip', {
      defId: 'ship_pelican', grant: true, setActive: true,
    });
  }
  assert.equal(ownershipSnapshot(h.state), before, 'grant cannot turn a UI click into a free hull');
  assert.equal(h.purchases.length, 0);
  assert.equal(h.charges.length, 0);

  for (let i = 0; i < 2; i += 1) {
    h.bus.emit('ui:fitModule', {
      shipIndex: 0,
      slotIndex: UTILITY_SLOT,
      defId: UTILITY_DEF,
    });
  }
  assert.equal(h.state.player.ownedShips[0].fittings[UTILITY_SLOT], null,
    'a catalog definition cannot mint a station fit');
  assert.equal(h.state.player.moduleInventory.length, 0);
  assert.equal(h.refusals.length, 2);
  assert.ok(h.refusals.every((payload) => payload.reason === 'missing_identity'));
});

test('a UI hull purchase uses the paid station path exactly once and ignores grant flags', () => {
  const h = boot({ credits: 20_000 });
  const fleetBefore = h.state.player.ownedShips.length;

  h.bus.emit('ui:buyShip', { defId: 'ship_pelican', grant: true, setActive: true });

  assert.equal(h.state.player.ownedShips.length, fleetBefore + 1);
  assert.equal(h.state.player.ownedShips.at(-1).defId, 'ship_pelican');
  assert.equal(h.state.player.credits, 8_000, 'Helios charges the paid Pelican offer');
  assert.deepEqual(h.charges, [{ amount: 12_000, reason: 'buyShip:ship_pelican' }]);
  assert.deepEqual(h.purchases, [{ defId: 'ship_pelican', price: 12_000 }]);
  assert.equal(h.state.player.activeShipIndex, 0, 'UI buy cannot smuggle setActive');
});

test('UI fitting consumes the named inventory identity and refuses its replay', () => {
  const h = boot({
    inventory: [
      { instanceId: 'mi-cargo-owned', defId: UTILITY_DEF },
      { instanceId: 'mi-other', defId: 'mod_market_data_s' },
    ],
  });

  h.bus.emit('ui:fitModule', {
    shipIndex: 0,
    slotIndex: UTILITY_SLOT,
    instanceId: 'mi-cargo-owned',
    defId: 'mod_market_data_s',
  });
  assert.equal(h.state.player.ownedShips[0].fittings[UTILITY_SLOT], UTILITY_DEF,
    'inventory identity determines the fitted definition');
  assert.equal(h.state.player.ownedShips[0].fittedInstances[UTILITY_SLOT].instanceId, 'mi-cargo-owned');
  assert.equal(h.state.player.moduleInventory.some((item) => item.instanceId === 'mi-cargo-owned'), false);
  assert.equal(h.state.player.moduleInventory.length, 1);
  assert.equal(h.equipped.length, 1);

  // The same click can arrive again after the first commit. It has no inventory identity now,
  // so it must refuse instead of minting a second scanner (even when a defId is supplied).
  h.bus.emit('ui:fitModule', {
    shipIndex: 0,
    slotIndex: UTILITY_SLOT,
    instanceId: 'mi-cargo-owned',
    defId: UTILITY_DEF,
  });
  assert.equal(h.state.player.ownedShips[0].fittedInstances[UTILITY_SLOT].instanceId, 'mi-cargo-owned');
  assert.equal(h.state.player.moduleInventory.length, 1);
  assert.equal(h.refusals.length, 1);
  assert.equal(h.refusals[0].reason, 'missing_module');
  assert.equal(h.equipped.length, 1, 'replay emits no second success');
});

test('direct internal grant and defId APIs remain available away from Shipworks', () => {
  const h = boot({ credits: 0, docked: false, stationId: null });

  assert.equal(h.ships.buyShip({ defId: 'ship_pelican', grant: true, setActive: true }), true);
  assert.equal(h.state.player.ownedShips.length, 2);
  assert.equal(h.state.player.ownedShips.at(-1).defId, 'ship_pelican');
  assert.equal(h.state.player.activeShipIndex, 1);
  assert.equal(h.charges.length, 0, 'internal grant is still free');

  assert.equal(h.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, defId: UTILITY_DEF }), true);
  assert.equal(h.state.player.ownedShips[0].fittings[UTILITY_SLOT], UTILITY_DEF);
  assert.ok(h.state.player.ownedShips[0].fittedInstances[UTILITY_SLOT].instanceId,
    'direct defId fitting still mints its internal instance');
});
