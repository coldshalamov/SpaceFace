import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { stationServices, serviceRatePerS } from '../src/systems/stationServices.js';

test('a parked paid repair resumes at the current yard rate after a strike has ended', () => {
  const stationId = 'station_helios', ship = { id: 1, type: 'ship', alive: true,
    hull: 20, hullMax: 140, armorHp: 0, armorMax: 0, flags: { docked: true } };
  const state = { simTime: 0, timeScale: 1, meta: { seed: 4242 },
    playerId: 1, entities: new Map([[1, ship]]), player: {},
    factions: { faction_scn: { rep: 0 } },
    economy: { stationConditions: { [stationId]: { strikeUntil: 10 } } },
    ui: { docked: true, dockedStationId: stationId } };
  const bus = createBus(), yard = Object.create(stationServices), completions = [];
  bus.on('service:completed', row => completions.push(row));
  yard.init({ state, bus, helpers: {} });
  try {
    bus.emit('dock:docked', { stationId });
    assert.equal(yard.enqueuePlayerJob({ stationId, type: 'repair', units: 120, meta: { cost: 108 } }), true);
    yard.update(1, state);
    assert.ok(Math.abs(state.stationServices.player.jobs[0].ratePerS - 3.6) < 1e-6);
    const saved = JSON.parse(JSON.stringify(yard.serialize()));
    state.ui.docked = false; state.ui.dockedStationId = null; ship.flags.docked = false;
    yard.deserialize(saved);
    // Continue parks a paid job; the pilot flies until the strike expires, then returns.
    state.simTime = 100;
    state.ui.docked = true; state.ui.dockedStationId = stationId; ship.flags.docked = true;
    bus.emit('dock:docked', { stationId });
    const before = ship.hull;
    yard.update(1, state);
    assert.ok(Math.abs(ship.hull - before - serviceRatePerS('repair', 140, 0)) < 1e-6,
      'an expired strike cannot keep slowing the paid job after return');
    assert.equal(completions.length, 0, 'resuming is not another purchase or a premature completion');
  } finally { yard.destroy(); }
});
