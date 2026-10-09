// FB-061 — a parked hull keeps its hold.
//
// Packet law: when the active ship changes, the cargo owner stores the outgoing hold on that
// hull's `ownedShips` record and loads the incoming hull's stored hold, honouring capacity —
// overflow stays parked. Docked at a shipyard with a second hull, the cargo deck exposes
// `ui:transferParkedCargo` verbs; the UI never mutates cargo. Selling a loaded hull needs a
// confirmation naming the units. Conservation holds across three swaps on seed 4242, and the
// parked hold survives save/Continue.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import { addCargo, cargo as cargoSystem } from '../src/systems/cargo.js';
import { ships } from '../src/systems/ships.js';
import { buildParkedHoldModel } from '../src/ui/navigation/cargoDeck.js';

const SEED = 4242;

function playerEntity(overrides = {}) {
  return {
    id: 1, type: 'ship', alive: true, team: 0, factionId: 'faction_free',
    radius: 12, mass: 60, rot: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    hull: 60, hullMax: 100, armorHp: 20, armorMax: 50,
    data: { defId: 'ship_kestrel', fittings: [] },
    ...overrides,
  };
}

function runtime({ stationId = 'station_helios' } = {}) {
  const bus = createBus();
  const player = playerEntity();
  const state = {
    mode: 'flight', tick: 0, simTime: 0, playerId: player.id,
    meta: { seed: SEED },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { docked: true, dockedStationId: stationId },
    player: {
      credits: 50000,
      activeShipIndex: 0,
      moduleInventory: [],
      ownedShips: [
        { defId: 'ship_kestrel', fittings: [] },
        { defId: 'ship_pelican', fittings: [] },
        { defId: 'ship_mule', fittings: [] },
      ],
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 60 },
      missions: [],
    },
  };
  const toasts = [];
  bus.on('toast', (p) => toasts.push(p));
  const shipSystem = Object.create(ships);
  shipSystem.init({ state, bus, helpers: {} });
  const cargo = Object.create(cargoSystem);
  cargo.init({ state, bus, helpers: {} });
  return { bus, state, shipSystem, cargo, toasts };
}

function holdUnits(hold) {
  return hold && hold.items
    ? Object.values(hold.items).reduce((sum, qty) => sum + (Number(qty) || 0), 0)
    : 0;
}

test('the hold parks on the hull record and the new hull’s hold comes aboard', () => {
  const { bus, state } = runtime();
  addCargo(state, 'cmdty_ore_iron', 5);
  addCargo(state, 'cmdty_alloys', 2);
  const liveBefore = holdUnits(state.player.cargo);

  bus.emit('ui:setActiveShip', { index: 1 });

  assert.equal(state.player.activeShipIndex, 1);
  assert.deepEqual(state.player.ownedShips[0].cargo.items, { cmdty_ore_iron: 5, cmdty_alloys: 2 },
    'the Kestrel’s hold stayed with the Kestrel');
  assert.equal(holdUnits(state.player.cargo), 0, 'the Pelican’s hold came aboard empty');
  assert.equal(liveBefore, 7);
  assert.equal(holdUnits(state.player.ownedShips[0].cargo) + holdUnits(state.player.cargo), 7,
    'conservation: nothing vanished in the swap');
});

test('cargo is conserved across three swaps on seed 4242, and the deck model reads the berths', () => {
  const { bus, state } = runtime();
  addCargo(state, 'cmdty_ore_iron', 6);          // Kestrel hold

  bus.emit('ui:setActiveShip', { index: 1 });   // swap 1: ore parks on Kestrel
  addCargo(state, 'cmdty_alloys', 3);                  // Pelican hold
  bus.emit('ui:setActiveShip', { index: 2 });   // swap 2: alloy parks on Pelican
  addCargo(state, 'cmdty_ore_iron', 4);                    // Mule hold
  bus.emit('ui:setActiveShip', { index: 0 });   // swap 3: Mule parks, Kestrel’s ore returns

  const parked = state.player.ownedShips;
  assert.deepEqual(state.player.cargo.items, { cmdty_ore_iron: 6 }, 'the Kestrel brought its ore back');
  assert.equal(holdUnits(parked[0].cargo), 0, 'the active record keeps no parked hold');
  assert.equal(parked[0].cargo, undefined, 'an emptied store is deleted, not persisted as {}');
  assert.deepEqual(parked[1].cargo.items, { cmdty_alloys: 3 });
  assert.deepEqual(parked[2].cargo.items, { cmdty_ore_iron: 4 });
  const conserved = 6 + 3 + 4;
  assert.equal(
    holdUnits(state.player.cargo) + parked.slice(1).reduce((s, h) => s + holdUnits(h.cargo), 0),
    conserved,
    'nothing vanished and nothing duplicated across the three swaps',
  );

  const model = buildParkedHoldModel(state);
  assert.equal(model.dockedAtShipyard, true);
  assert.equal(model.stationId, 'station_helios');
  assert.equal(model.shipCount, 3);
  const pelican = model.holds.find((row) => row.index === 1);
  assert.equal(pelican.units, 3);
  assert.ok(pelican.capVolume > 0);
});

test('ui:transferParkedCargo moves units both ways and never touches a sealed rider', () => {
  const { bus, state, toasts } = runtime();
  addCargo(state, 'cmdty_ore_iron', 5);
  bus.emit('ui:setActiveShip', { index: 1 });

  // Load: parked Kestrel → live Pelican hold.
  bus.emit('ui:transferParkedCargo', { shipIndex: 0, direction: 'load', commodityId: 'cmdty_ore_iron', qty: 2 });
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 2);
  assert.equal(state.player.ownedShips[0].cargo.items.cmdty_ore_iron, 3);

  // Stow: live → parked Kestrel.
  bus.emit('ui:transferParkedCargo', { shipIndex: 0, direction: 'stow', commodityId: 'cmdty_ore_iron', qty: 2 });
  assert.equal(state.player.cargo.items.cmdty_ore_iron, undefined);
  assert.equal(state.player.ownedShips[0].cargo.items.cmdty_ore_iron, 5);

  // Not a shipyard berth: the verb refuses and does not move a unit.
  state.ui.dockedStationId = 'station_customs';
  bus.emit('ui:transferParkedCargo', { shipIndex: 0, direction: 'load', commodityId: 'cmdty_ore_iron', qty: 1 });
  assert.equal(state.player.ownedShips[0].cargo.items.cmdty_ore_iron, 5);
  assert.equal(state.player.cargo.items.cmdty_ore_iron || 0, 0);
  assert.ok(toasts.some((t) => t.kind === 'error'));
});

test('a parked hold survives save/Continue on the hull record', () => {
  const { bus, state } = runtime();
  addCargo(state, 'cmdty_ore_iron', 5);
  addCargo(state, 'cmdty_alloys', 2);
  bus.emit('ui:setActiveShip', { index: 1 });

  save.init({ state, bus: { emit() {}, on() { return () => {}; } }, helpers: {}, registry: { get() { return null; } } });
  const data = JSON.parse(JSON.stringify(save.serializeData()));
  assert.deepEqual(data.player.ownedShips[0].cargo.items, { cmdty_ore_iron: 5, cmdty_alloys: 2 });

  const reloaded = createGameState(SEED);
  reloaded.mode = 'flight';
  reloaded.playerId = 1;
  const reloadedPlayer = playerEntity();
  reloaded.entities.set(reloadedPlayer.id, reloadedPlayer);
  reloaded.entityList.push(reloadedPlayer);
  const reloadBus = createBus();
  Object.create(ships).init({ state: reloaded, bus: reloadBus, helpers: {} });
  const loader = Object.create(save);
  loader.init({ state: reloaded, bus: reloadBus, helpers: {}, registry: { get() { return null; } } });
  loader._restorePlayer(data.player);
  reloadBus.emit('save:loaded', { slot: 'fb-061-fixture' });

  assert.deepEqual(reloaded.player.ownedShips[0].cargo.items, { cmdty_ore_iron: 5, cmdty_alloys: 2 },
    'the parked hold crossed Continue on the Kestrel');
  assert.equal(reloaded.player.activeShipIndex, 1);
});

test('selling a hull with cargo demands a confirmation naming the units', () => {
  const { bus, state, shipSystem, toasts } = runtime();
  addCargo(state, 'cmdty_ore_iron', 5);
  bus.emit('ui:setActiveShip', { index: 1 });

  const sold = shipSystem.sellShip(0);
  assert.equal(sold, false, 'the sale refused');
  assert.equal(state.player.ownedShips.length, 3, 'the hull is still in the berths');
  const refusal = toasts.find((t) => t.kind === 'error');
  assert.match(refusal.text, /5 units/, 'the refusal names what the hold carries');

  // A stale quote is refused too — the caller must pass the units it actually showed.
  assert.equal(shipSystem.sellShip(0, { confirmedCargoUnits: 2 }), false);

  // An informed confirmation is honoured, and the hold goes with the hull.
  assert.equal(shipSystem.sellShip(0, { confirmedCargoUnits: 5 }), true);
  assert.equal(state.player.ownedShips.length, 2);
});
