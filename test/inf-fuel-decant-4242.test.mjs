// Seed 4242 — a docked decant that cannot take a whole cell says why, and burns nothing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { stationServices } from '../src/systems/stationServices.js';

const SECTOR = 'sector_helios_prime';
const STATION = 'station_beltout';

function dockedYard({ cells, fuel, job = null }) {
  const state = {
    simTime: 12,
    meta: { seed: 4242 },
    playerId: 'player',
    entities: new Map(),
    player: {
      activeShipIndex: 0,
      cargo: {
        usedVolume: cells * 0.8,
        usedMass: cells * 0.6,
        items: { cmdty_fuel_cells: cells },
      },
    },
    ui: { docked: true, dockedStationId: STATION },
    fuel: { ...fuel },
    world: { currentSectorId: SECTOR },
    rng: { next() { return 0.42; } },
  };
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (p) => toasts.push(p));
  const yard = Object.create(stationServices);
  yard.init({ state, bus, helpers: {} });
  if (job) {
    state.stationServices.player = { stationId: STATION, jobs: [job] };
  }
  return { state, bus, yard, toasts };
}

test('a short tank tells the pilot a cell will not fit', () => {
  const { state, yard, toasts } = dockedYard({
    cells: 2,
    fuel: { current: 90, max: 100 },
  });
  const res = yard.decantFuelCells();
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'tank_full');
  assert.equal(state.player.cargo.items.cmdty_fuel_cells, 2);
  assert.equal(state.fuel.current, 90);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'The tank has 10 left — a fuel cell needs 24.');
  assert.equal(toasts[0].kind, 'warn');
});

test('a paid pump that already owns the gap says so before a cell is burned', () => {
  const { state, bus, yard, toasts } = dockedYard({
    cells: 4,
    fuel: { current: 20, max: 100 },
    job: { type: 'refuel', total: 80, applied: 0 },
  });
  bus.emit('service:decantRequest', {});
  assert.equal(state.player.cargo.items.cmdty_fuel_cells, 4);
  assert.equal(state.fuel.current, 20);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'The pump already owns 80 of this tank — no room to decant a cell.');
  assert.equal(yard.pendingPlayerService('refuel').units, 80);
});
