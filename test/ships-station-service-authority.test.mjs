import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  shipworksAccessForServices,
  shipworksStationAccess,
  ships as shipsPrototype,
} from '../src/systems/ships.js';
import { shipworksActionAvailability } from '../src/ui/station/screens/shipworks.js';

const UTILITY_SLOT = 5;

function buildHarness({ docked = true, stationId = 'station_helios', fitted = false } = {}) {
  const state = createGameState(0x5a17);
  state.player.credits = 250_000;
  state.player.ownedShips = [
    {
      defId: 'ship_kestrel',
      fittings: [null, null, null, null, null, fitted ? 'mod_market_data_s' : null],
    },
    { defId: 'ship_pelican', fittings: [] },
  ];
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = [{ instanceId: 'mi_fixture', defId: 'mod_cargo_scanner_s' }];
  state.ui.docked = docked;
  state.ui.dockedStationId = stationId;

  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  bus.on('economy:chargeCredits', ({ amount }) => { state.player.credits -= amount; });
  const ships = Object.assign({}, shipsPrototype, { _instSeq: 0 });
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships, toasts };
}

function mutationSnapshot(state) {
  return JSON.stringify({
    credits: state.player.credits,
    ownedShips: state.player.ownedShips,
    activeShipIndex: state.player.activeShipIndex,
    moduleInventory: state.player.moduleInventory,
  });
}

const BLOCKED_INTENTS = [
  ['ui:buyShip', { defId: 'ship_drifter' }, false],
  ['ui:setActiveShip', { index: 1 }, false],
  ['ui:buyModule', { defId: 'mod_shield_booster_s' }, false],
  ['ui:fitModule', { slotIndex: UTILITY_SLOT, instanceId: 'mi_fixture' }, false],
  ['ui:unfitModule', { slotIndex: UTILITY_SLOT }, true],
];

for (const [label, docked, stationId] of [
  ['refuel-only Depot', true, 'station_depot3'],
  ['undocked flight', false, null],
  ['unknown berth', true, 'station_not_real'],
]) {
  test(`${label} rejects every raw Shipworks UI mutation`, () => {
    for (const [event, payload, fitted] of BLOCKED_INTENTS) {
      const h = buildHarness({ docked, stationId, fitted });
      const before = mutationSnapshot(h.state);
      h.bus.emit(event, payload);
      assert.equal(mutationSnapshot(h.state), before, `${event} must not mutate at ${label}`);
      assert.equal(h.toasts.length, 1, `${event} emits one truthful refusal`);
      assert.equal(h.toasts[0].kind, 'error');
      assert.match(h.toasts[0].text, /dock|shipyard|outfitting|Shipworks/i);
    }
  });
}

test('a real shipyard permits hull and outfitting UI intents', () => {
  const hull = buildHarness({ stationId: 'station_helios' });
  const fleetBefore = hull.state.player.ownedShips.length;
  hull.bus.emit('ui:buyShip', { defId: 'ship_drifter' });
  assert.equal(hull.state.player.ownedShips.length, fleetBefore + 1);
  hull.bus.emit('ui:setActiveShip', { index: 1 });
  assert.equal(hull.state.player.activeShipIndex, 1);

  const outfit = buildHarness({ stationId: 'station_helios' });
  outfit.bus.emit('ui:fitModule', { slotIndex: UTILITY_SLOT, instanceId: 'mi_fixture' });
  assert.equal(outfit.state.player.ownedShips[0].fittings[UTILITY_SLOT], 'mod_cargo_scanner_s');
  outfit.bus.emit('ui:unfitModule', { slotIndex: UTILITY_SLOT });
  assert.equal(outfit.state.player.ownedShips[0].fittings[UTILITY_SLOT], null);
  const inventoryBefore = outfit.state.player.moduleInventory.length;
  outfit.bus.emit('ui:buyModule', { defId: 'mod_shield_booster_s' });
  assert.equal(outfit.state.player.moduleInventory.length, inventoryBefore + 1);
});

test('module fabrication grants outfitting access without granting hull access', () => {
  assert.deepEqual(shipworksAccessForServices(['module_craft']), {
    hull: false,
    outfit: true,
    hullReason: 'No shipyard service at this station',
    outfitReason: null,
  });
  assert.deepEqual(shipworksAccessForServices(['shipyard']), {
    hull: true,
    outfit: true,
    hullReason: null,
    outfitReason: null,
  });
  assert.equal(shipworksAccessForServices(null).outfit, false);
});

test('direct ships-owner methods remain available away from a station', () => {
  const h = buildHarness({ docked: false, stationId: null });
  const fleetBefore = h.state.player.ownedShips.length;
  assert.equal(h.ships.buyShip({ defId: 'ship_drifter', grant: true }), true);
  assert.equal(h.state.player.ownedShips.length, fleetBefore + 1);
  assert.equal(h.ships.fitModule({ slotIndex: UTILITY_SLOT, instanceId: 'mi_fixture' }), true);
  assert.equal(h.state.player.ownedShips[0].fittings[UTILITY_SLOT], 'mod_cargo_scanner_s');
});

test('Shipworks remains inspectable while presenting truthful disabled action labels', () => {
  const depot = buildHarness({ stationId: 'station_depot3' });
  const access = shipworksStationAccess(depot.state);
  const view = shipworksActionAvailability(depot.state);
  assert.equal(access.hull, false);
  assert.equal(access.outfit, false);
  assert.equal(view.hullEnabled, false);
  assert.equal(view.outfitEnabled, false);
  assert.match(view.hullLabel, /No shipyard/);
  assert.match(view.outfitLabel, /No outfitting bay/);

  const helios = buildHarness({ stationId: 'station_helios' });
  assert.deepEqual(shipworksActionAvailability(helios.state), {
    hullEnabled: true,
    outfitEnabled: true,
    hullLabel: 'Shipyard service available',
    outfitLabel: 'Outfitting service available',
  });
});
