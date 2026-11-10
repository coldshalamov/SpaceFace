// U5: carried fuel cells decant into the tank at any berth — the pilot is the crew.
// The play attaches to the "no refuel on site" notice: a fuel-less outpost plus a hold
// of cells is no longer a dead end, and the rate (~4 cr/unit at base cell price against
// the pump's 3) keeps decant the emergency path, never the deal.
import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { stationServices } from '../src/systems/stationServices.js';

const SECTOR = 'sector_helios_prime';
const NO_SERVICE_STATION = 'station_beltout'; // [trade, missions, ore_buy] — the chart says so

function dockedYard(stationId, { cells = 0, fuel = null } = {}) {
  const state = {
    simTime: 0,
    playerId: 'player',
    entities: new Map(),
    player: {
      activeShipIndex: 0,
      cargo: { usedVolume: cells * 0.8, usedMass: cells * 0.6, items: cells > 0 ? { cmdty_fuel_cells: cells } : {} },
    },
    ui: { docked: true, dockedStationId: stationId },
    fuel: fuel ? { ...fuel } : { current: 0, max: 100 },
    world: { currentSectorId: SECTOR },
  };
  const bus = createBus();
  const yard = Object.create(stationServices);
  yard.init({ state, bus, helpers: {} });
  return { state, bus, yard };
}

test('decant burns whole cells into the tank at a berth with no refuel service', () => {
  const sim = dockedYard(NO_SERVICE_STATION, { cells: 3, fuel: { current: 40, max: 100 } });
  const { state, bus, yard } = sim;
  const decanted = [];
  bus.on('service:decanted', (p) => decanted.push(p));
  const res = yard.decantFuelCells();
  assert.equal(res.ok, true, `decant succeeds: ${JSON.stringify(res)}`);
  // Room 60 takes two whole cells (48 units), never a partial third.
  assert.equal(res.cells, 2);
  assert.equal(res.units, 48);
  assert.equal(state.fuel.current, 88);
  assert.equal(state.player.cargo.items.cmdty_fuel_cells, 1);
  assert.equal(decanted.length, 1, 'one receipt event');
});

test('a tank that cannot take a whole cell refuses without burning cargo', () => {
  const sim = dockedYard(NO_SERVICE_STATION, { cells: 2, fuel: { current: 90, max: 100 } });
  const { state, yard } = sim;
  const res = yard.decantFuelCells();
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'tank_full');
  assert.equal(state.player.cargo.items.cmdty_fuel_cells, 2, 'hold untouched');
  assert.equal(state.fuel.current, 90);
});

test('an empty hold refuses honestly and the yard gate stays shut', () => {
  const sim = dockedYard(NO_SERVICE_STATION, { fuel: { current: 10, max: 100 } });
  const { yard } = sim;
  const res = yard.decantFuelCells();
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_cells');
  // The no-refuel berth still refuses the PUMP job — decant never re-opens the service gate.
  const enqueued = sim.yard.enqueuePlayerJob({ type: 'refuel', units: 30, stationId: NO_SERVICE_STATION });
  assert.equal(enqueued, false);
});

test('undocked, there is no berth to decant at', () => {
  const sim = dockedYard(NO_SERVICE_STATION, { cells: 2, fuel: { current: 10, max: 100 } });
  const { state, yard } = sim;
  state.ui.docked = false;
  const res = yard.decantFuelCells();
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_docked');
  assert.equal(state.player.cargo.items.cmdty_fuel_cells, 2);
});

test('repeated passes drain the hold up to the per-pass cap and the room', () => {
  const sim = dockedYard(NO_SERVICE_STATION, { cells: 9, fuel: { current: 0, max: 300 } });
  const { state, yard } = sim;
  const first = yard.decantFuelCells();
  assert.equal(first.cells, 8, 'per-pass cap');
  assert.equal(state.fuel.current, 192);
  const second = yard.decantFuelCells();
  assert.equal(second.cells, 1);
  assert.equal(state.fuel.current, 216);
  const third = yard.decantFuelCells();
  assert.equal(third.ok, false);
  assert.equal(third.reason, 'no_cells');
});

test('the fuel vital offers the verb only when the hold has cells and the tank has room', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/ui/station/stationApp.js', import.meta.url)), 'utf8');
  assert.ok(source.includes("data-vital-act=\"decant\""), 'the fuel vital renders the decant verb');
  assert.ok(source.includes("bus.emit('service:decantRequest'"), 'the verb asks the yard owner');
  assert.ok(source.includes("decantActHtml(s, fuel)"), 'the verb is gated on hold cells and tank room');
  const services = readFileSync(fileURLToPath(new URL('../src/systems/stationServices.js', import.meta.url)), 'utf8');
  assert.ok(services.includes("this.bus.on('service:decantRequest'"), 'the yard owner answers the request');
});
