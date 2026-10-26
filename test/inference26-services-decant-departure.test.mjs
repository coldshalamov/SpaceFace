import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { stationServices } from '../src/systems/stationServices.js';

test('the undock fade cannot consume fuel cells; a real redock permits decant again', () => {
  const state = { simTime: 0, meta: { seed: 4242 }, playerId: 1, entities: new Map(),
    player: { cargo: { items: { cmdty_fuel_cells: 2 }, usedVolume: 1.6, usedMass: 1.2 } },
    ui: { docked: true, dockedStationId: 'station_beltout' }, fuel: { current: 0, max: 100 } };
  const bus = createBus(), yard = Object.create(stationServices), receipts = [];
  bus.on('service:decanted', row => receipts.push(row));
  yard.init({ state, bus, helpers: {} });
  try {
    bus.emit('dock:docked', { stationId: 'station_beltout' });
    bus.emit('dock:undocked', {});
    // Production uiRoot keeps its dock latch up until the departure fade finishes.
    assert.equal(state.ui.docked, true);
    bus.emit('service:decantRequest', {});
    assert.equal(state.player.cargo.items.cmdty_fuel_cells, 2, 'a stale dock action must not consume cargo');
    assert.equal(state.fuel.current, 0);
    assert.equal(receipts.length, 0);
    assert.equal(yard.decantFuelCells().reason, 'not_docked');
    bus.emit('dock:docked', { stationId: 'station_beltout' });
    bus.emit('service:decantRequest', {});
    assert.equal(state.player.cargo.items.cmdty_fuel_cells || 0, 0);
    assert.equal(state.fuel.current, 48);
    assert.equal(receipts.length, 1);
  } finally { yard.destroy(); }
});
