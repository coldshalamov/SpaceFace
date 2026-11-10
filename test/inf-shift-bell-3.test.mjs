// Shift Bell 3 is a buoy on the Helios→Ceres leg. The plate says it rings when third
// watch ends. The berth PA is a different bell and only speaks while docked.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CAL_DAY_S, stationShiftAt } from '../src/data/worldCalendar.js';
import { SECTORS } from '../src/data/sectors.js';
import { worldClock } from '../src/systems/worldClock.js';

const BELL = SECTORS.find((row) => row.id === 'sector_helios_prime')
  .pois.find((row) => row.id === 'poi_helios_shift_bell').pos;

function crossing(fromId, toId) {
  for (let t = 0; t < CAL_DAY_S * 3; t += 1) {
    const now = stationShiftAt('station_helios', t);
    const next = stationShiftAt('station_helios', t + 1);
    if (now.id === fromId && next.id === toId) return t;
  }
  return null;
}

function flightState(simTime, pos) {
  const player = { id: 1, alive: true, pos: { x: pos.x, z: pos.z } };
  return {
    meta: { seed: 4242 },
    simTime,
    ui: { docked: false, dockedStationId: null },
    world: { currentSectorId: 'sector_helios_prime' },
    playerId: 1,
    entities: new Map([[1, player]]),
    player,
  };
}

function bus() {
  return { emitted: [], emit(name, payload) { this.emitted.push({ name, payload }); } };
}

function bells(log) {
  return log.emitted.filter((row) => row.name === 'comms:log' && row.payload.from === 'SHIFT BELL 3');
}

test('seed 4242: third watch ending rings Shift Bell 3 for a hull on the Ceres leg', () => {
  const at = crossing('third', 'first');
  assert.equal(typeof at, 'number');
  const log = bus();
  const state = flightState(at, BELL);
  worldClock.init({ state, bus: log });
  worldClock.update(0.5, state);
  assert.equal(bells(log).length, 0, 'arming the watch does not strike');
  state.simTime = at + 1;
  worldClock.update(0.5, state);
  assert.equal(bells(log).length, 1);
  assert.match(bells(log)[0].payload.text, /Third watch is off the floor/);
  const cue = log.emitted.find((row) => row.name === 'audio:cue');
  assert.equal(cue.payload.id, 'ambient_station_shift_bell');
  assert.equal(cue.payload.position.x, BELL.x);
  assert.equal(cue.payload.position.z, BELL.z);
  worldClock.update(0.5, state);
  assert.equal(bells(log).length, 1, 'the same watch does not strike twice');
});

test('seed 4242: a far hull, a docked hull, and the other boundaries stay quiet', () => {
  const endThird = crossing('third', 'first');
  const endSecond = crossing('second', 'third');
  assert.equal(typeof endSecond, 'number');

  const far = bus();
  const farState = flightState(endThird, { x: BELL.x + 4000, z: BELL.z });
  worldClock.init({ state: farState, bus: far });
  worldClock.update(0.5, farState);
  farState.simTime = endThird + 1;
  worldClock.update(0.5, farState);
  assert.equal(bells(far).length, 0);

  const docked = bus();
  const dockedState = flightState(endThird, BELL);
  dockedState.ui.docked = true;
  dockedState.ui.dockedStationId = 'station_helios';
  worldClock.init({ state: dockedState, bus: docked });
  worldClock.update(0.5, dockedState);
  dockedState.simTime = endThird + 1;
  worldClock.update(0.5, dockedState);
  assert.equal(bells(docked).length, 0, 'the berth PA owns a docked hull');

  const mid = bus();
  const midState = flightState(endSecond, BELL);
  worldClock.init({ state: midState, bus: mid });
  worldClock.update(0.5, midState);
  midState.simTime = endSecond + 1;
  worldClock.update(0.5, midState);
  assert.equal(bells(mid).length, 0, 'only the end of third watch strikes the buoy');
});
