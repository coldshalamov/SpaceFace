// SFQ-I036 — cancelling a paid yard job returns the charge once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { stationServices } from '../src/systems/stationServices.js';

const STATION = 'station_helios';

function docked() {
  const sim = createSimulation({ seed: 4242, systems: [economy, cargo, stationServices] });
  const { state, bus } = sim;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, hull: 40, hullMax: 100,
    armorHp: 0, armorMax: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    flags: { docked: true }, data: { defId: 'ship_kestrel' },
  };
  const station = {
    id: 2, type: 'station', alive: true, factionId: 'faction_scn',
    pos: { x: 0, z: 0 }, data: { stationId: STATION },
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entities.set(station.id, station);
  state.entityList.push(player, station);
  state.player.credits = 5000;
  state.ui.docked = true;
  state.ui.dockedStationId = STATION;
  state.ui.productionDock = true;
  state.timeScale = 0;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.fuel = { current: 10, max: 100 };
  bus.emit('dock:docked', { stationId: STATION });
  return {
    state,
    bus,
    econ: sim.registry.get('economy'),
    yard: sim.registry.get('stationServices'),
  };
}

function bookRefuel(h) {
  const before = h.state.player.credits;
  h.econ.handleService({ type: 'refuel', amount: 20 });
  const booked = h.state.player.credits;
  assert.ok(booked < before, 'the berth holds the refuel charge');
  assert.equal(h.state.stationServices.player.jobs.length, 1);
  return { before, booked };
}

test('cancelling once and twice returns the refuel charge exactly once', () => {
  const h = docked();
  const { before } = bookRefuel(h);
  h.yard._abortJobs(h.state.stationServices.player, 'undock');
  assert.equal(h.state.player.credits, before);
  assert.equal(h.state.stationServices.player.jobs.length, 0);
  h.yard._abortJobs(h.state.stationServices.player, 'undock');
  assert.equal(h.state.player.credits, before);
});

test('a refund that re-enters the cancel does not pay the escrow twice', () => {
  const h = docked();
  const { before } = bookRefuel(h);
  let entered = false;
  h.bus.on('economy:grantCredits', () => {
    if (entered) return;
    entered = true;
    h.yard._abortJobs(h.state.stationServices.player, 'undock');
  });
  h.yard._abortJobs(h.state.stationServices.player, 'undock');
  h.yard._abortJobs(h.state.stationServices.player, 'undock');
  assert.equal(entered, true);
  assert.equal(h.state.player.credits, before);
  assert.equal(h.state.stationServices.player.jobs.length, 0);
});
