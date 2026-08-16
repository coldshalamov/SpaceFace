import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { addCargo, cargo as cargoPrototype } from '../src/systems/cargo.js';
import { ships as shipsPrototype } from '../src/systems/ships.js';
import {
  executePauseCargoJettison,
  pauseInventoryModel,
} from '../src/ui/screens/pauseInventory.js';

const IRON = 'cmdty_ore_iron';
const SCANNER = 'mod_cargo_scanner_s';
const MARKET_UPLINK = 'mod_market_data_s';
const UTILITY_SLOT = 5;

function cloneSystem(proto, extra = {}) {
  return Object.assign(Object.create(Object.getPrototypeOf(proto)), proto, extra);
}

function buildHarness({ mode = 'flight', fitted = null, cargoQty = 0 } = {}) {
  const state = createGameState(0x5454);
  state.mode = mode;
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  state.player.credits = 25_000;
  state.player.activeShipIndex = 0;
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: [null, null, null, null, null, fitted],
  }];
  state.player.moduleInventory = [{ instanceId: 'mi_scanner', defId: SCANNER }];
  if (cargoQty > 0) addCargo(state, IRON, cargoQty);

  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));

  const cargo = cloneSystem(cargoPrototype);
  cargo.init({ state, bus, helpers: {} });

  const ships = cloneSystem(shipsPrototype, { _instSeq: 0 });
  ships.init({ state, bus, helpers: {} });

  const registry = new Map([
    ['cargo', cargo],
    ['ships', ships],
  ]);
  return {
    state,
    bus,
    cargo,
    ships,
    toasts,
    ctx: { state, bus, registry },
  };
}

test('pause inventory is registered and reachable from the pause menu', async () => {
  const [pauseSource, rootSource] = await Promise.all([
    readFile(new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8'),
  ]);

  assert.match(pauseSource, /Cargo & Modules/);
  assert.match(pauseSource, /pushScreen', 'pauseInventory'/);
  assert.match(rootSource, /pauseInventoryScreen/);
  assert.match(rootSource, /\.\/screens\/pauseInventory\.js/);
});

test('pause inventory model reads cargo, fitted slots, and stored modules without mutation', () => {
  const h = buildHarness({ mode: 'paused', fitted: MARKET_UPLINK, cargoQty: 6 });
  h.state.missions.active = [{
    id: 'sealed-test',
    type: 'cargo_delivery',
    status: 'active',
    preloadedCargo: true,
    params: { cmdtyId: IRON },
  }];
  const before = JSON.stringify(h.state.player);

  const model = pauseInventoryModel(h.state);

  assert.equal(JSON.stringify(h.state.player), before, 'model must be read-only');
  assert.equal(model.shipName, 'Hitch');
  assert.deepEqual(model.cargoRows.map((row) => [row.id, row.qty, row.locked]), [[IRON, 6, true]]);
  assert.equal(model.slotRows[UTILITY_SLOT].defId, MARKET_UPLINK);
  assert.equal(model.inventoryRows[0].defId, SCANNER);
  assert.ok(model.inventoryRows[0].targets.includes(UTILITY_SLOT));
});

test('pause cargo jettison delegates to Cargo and refuses protected or unpaused freight', () => {
  const h = buildHarness({ mode: 'paused', cargoQty: 5 });

  assert.equal(executePauseCargoJettison(h.ctx, IRON, 2), 2);
  assert.equal(h.state.player.cargo.items[IRON], 3);

  h.state.missions.active = [{
    id: 'sealed-test',
    type: 'cargo_delivery',
    status: 'active',
    preloadedCargo: true,
    params: { cmdtyId: IRON },
  }];
  assert.equal(executePauseCargoJettison(h.ctx, IRON, 2), 0);
  assert.equal(h.state.player.cargo.items[IRON], 3);

  h.state.missions.active = [];
  h.state.mode = 'flight';
  assert.equal(executePauseCargoJettison(h.ctx, IRON, 2), 0);
  assert.equal(h.state.player.cargo.items[IRON], 3);
});

test('pause inventory can fit owned modules only while actually paused', () => {
  const flight = buildHarness({ mode: 'flight' });
  flight.bus.emit('ui:fitModule', {
    slotIndex: UTILITY_SLOT,
    instanceId: 'mi_scanner',
    source: 'pause_inventory',
  });
  assert.equal(flight.state.player.ownedShips[0].fittings[UTILITY_SLOT], null);
  assert.equal(flight.state.player.moduleInventory.length, 1);
  assert.equal(flight.toasts.length, 1);
  assert.match(flight.toasts[0].text, /dock|outfitting|Shipworks/i);

  const paused = buildHarness({ mode: 'paused' });
  paused.bus.emit('ui:fitModule', {
    slotIndex: UTILITY_SLOT,
    instanceId: 'mi_scanner',
    source: 'pause_inventory',
  });
  assert.equal(paused.state.player.ownedShips[0].fittings[UTILITY_SLOT], SCANNER);
  assert.equal(paused.state.player.moduleInventory.length, 0);

  paused.bus.emit('ui:unfitModule', {
    slotIndex: UTILITY_SLOT,
    source: 'pause_inventory',
  });
  assert.equal(paused.state.player.ownedShips[0].fittings[UTILITY_SLOT], null);
  assert.equal(paused.state.player.moduleInventory.length, 1);
  assert.equal(paused.state.player.moduleInventory[0].defId, SCANNER);
});
