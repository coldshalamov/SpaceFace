import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { stationServices, planYardClients } from '../src/systems/stationServices.js';

const STATION = 'station_helios', SECTOR = 'sector_helios_prime';
function harness() {
  const ship = { id: 1, type: 'ship', hull: 100, hullMax: 140, flags: { docked: true } };
  const state = { simTime: 1000, timeScale: 1, meta: { seed: 4242 },
    playerId: 1, entities: new Map([[1, ship]]), player: {},
    world: { currentSectorId: SECTOR }, ui: { docked: true, dockedStationId: STATION } };
  const bus = createBus(), yard = Object.create(stationServices);
  yard.init({ state, bus, helpers: {} });
  bus.emit('dock:docked', { stationId: STATION });
  yard.update(1 / 60, state);
  return { state, bus, yard };
}

test('Continue from an earlier save refreshes the visible yard when its next client arrives', () => {
  const h = harness();
  try {
    const first = planYardClients(4242, SECTOR, 0, STATION, 'L')[0];
    h.state.simTime = first.arriveAt - 2;
    h.yard.deserialize({ dockedElapsed: 0 });
    h.bus.emit('dock:docked', { stationId: STATION });
    assert.ok(!h.state.stationServices.stations[STATION].pads.some(p => p.occupant === first.id));
    h.state.simTime = first.arriveAt + 2;
    h.yard.update(1 / 60, h.state);
    assert.ok(h.state.stationServices.stations[STATION].pads.some(p => p.occupant === first.id),
      'a future session refresh deadline must not hide newly arrived clients after Continue');
  } finally { h.yard.destroy(); }
});

test('a legacy save without a yard clock starts at its own time rather than the later session', () => {
  const h = harness();
  try {
    h.state.timeScale = 0;
    h.yard.update(40, h.state);
    assert.equal(h.state.stationServices.dockedElapsed, 40);
    h.state.simTime = 20;
    h.yard.deserialize({});
    h.bus.emit('dock:docked', { stationId: STATION });
    assert.equal(h.state.stationServices.stations[STATION].updatedAt, 20,
      'an older valid save cannot inherit docked seconds earned after it was written');
    h.yard.deserialize({ dockedElapsed: 12 });
    h.bus.emit('dock:docked', { stationId: STATION });
    assert.equal(h.state.stationServices.stations[STATION].updatedAt, 32, 'a saved clock is retained');
  } finally { h.yard.destroy(); }
});
