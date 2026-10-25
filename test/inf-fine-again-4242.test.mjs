// A paid scan fine at Tethys clears the sheet. The next warrant at that desk is a new fine.
// The price, the scan band, and a re-dock of the same warm warrant stay as they are.
import assert from 'node:assert/strict';
import test from 'node:test';

import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function events(bus, name) {
  return bus.emitLog.filter((row) => row.evt === name);
}

test('a new warrant at the same desk offers the scan fine again', () => {
  const entities = new Map();
  const station = {
    id: 'station_tethys', type: 'station', alive: true, factionId: 'faction_scn',
    pos: { x: 0, z: 0 }, data: { stationId: 'station_tethys' },
  };
  entities.set(station.id, station);
  const state = {
    meta: { seed: 4242 },
    simTime: 40,
    tick: 80,
    mode: 'flight',
    playerId: 'player',
    player: { heat: 0.2, credits: 5000, cargo: { items: {} } },
    world: { currentSectorId: 'sector_tethys_junction' },
    entities,
    entityList: [station],
  };
  const bus = makeBus();
  const heatSys = Object.create(heat);
  heatSys.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const law = Object.create(lawSecurity);
  law.init({ state, bus, helpers: {}, registry: { get() { return null; } } });

  bus.emit('dock:docked', { stationId: 'station_tethys' });
  bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });

  assert.equal(events(bus, 'economy:chargeCredits').length, 1);
  assert.equal(events(bus, 'economy:chargeCredits')[0].payload.amount, 250);
  assert.equal(state.player.heat, 0, 'paying clears the sheet');

  bus.emit('faction:aggro', { isAggro: true });
  assert.equal(state.player.heat, 0.2);

  bus.emit('dock:docked', { stationId: 'station_tethys' });
  const offer = events(bus, 'law:fineAssessed').at(-1);
  assert.equal(offer.payload.alreadySettled, undefined);
  assert.equal(offer.payload.offer, true);
  assert.equal(offer.payload.amount, 250);
  assert.equal(offer.payload.paid, false);

  bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });
  assert.equal(events(bus, 'economy:chargeCredits').length, 2);
  assert.equal(events(bus, 'economy:chargeCredits')[1].payload.amount, 250);
  assert.equal(state.player.heat, 0);
  law.destroy?.();
  heatSys.destroy?.();
});
