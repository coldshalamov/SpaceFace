import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { core } from '../src/core/coreSystem.js';
import { economy } from '../src/systems/economy.js';
import {
  stationServices,
  stationServiceProfile,
  planYardClients,
  yardOccupancy,
  yardPadsFor,
  yardCrewsFor,
} from '../src/systems/stationServices.js';

// §1.8 transactions edge: the yard charges the full service price at booking and delivers it as
// a timed pump/weld. An abort (undock, station change, sector exit) must hand the undelivered
// share of the paid job back — credits through economy's sole-writer seam, note debt through
// the same owner — because a player who paid for fuel they never received has lost money to
// nothing. Runs the real yard + real economy over the production dock fixture shape.

const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';

function dockedSim({ hull = 100, hullMax = 100, armorMax = 0, credits = 10_000, debt = 0, simTime = 0, fuel = null } = {}) {
  const sim = createSimulation({ seed: 42, systems: [stationServices] });
  const { state, bus } = sim;
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull, hullMax, armorHp: 0, armorMax,
    flags: { docked: true },
  };
  state.playerId = 'player';
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.player.credits = credits;
  state.player.debt = debt;
  if (fuel) state.fuel = fuel;
  state.meta = { ...(state.meta || {}), seed: 42 };
  state.factions = { ...(state.factions || {}), faction_scn: { rep: 0 } };
  state.ui.docked = true;
  state.ui.dockedStationId = STATION;
  state.world = { ...(state.world || {}), currentSectorId: SECTOR };
  state.simTime = simTime;
  state.timeScale = 0;
  bus.emit('dock:docked', { stationId: STATION });
  const ctx = { state, bus, helpers: {}, registry: sim.registry };
  Object.create(core).init(ctx);
  const econ = Object.create(economy);
  econ.init(ctx);
  return { sim, state, bus, econ, player };
}

function abortByUndock(sim, state, player) {
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  player.flags.docked = false;
  sim.bus.emit('dock:undocked', { stationId: STATION });
}

test('undocking mid-refuel refunds the undelivered share of the paid pump', () => {
  const { sim, state, econ, player } = dockedSim({ fuel: { current: 20, max: 100 } });
  econ.handleService({ type: 'refuel' });
  const paid = 10_000 - state.player.credits;
  assert.ok(paid > 0, 'booking a refuel charges the full pump price up front');
  for (let i = 0; i < 60 * 20 && state.fuel.current < 45; i += 1) sim.step();
  assert.ok(state.fuel.current > 20 && state.fuel.current < 100,
    `fixture needs a mid-pump abort point (${state.fuel.current}/100)`);
  const job = state.stationServices.player && state.stationServices.player.jobs[0];
  assert.ok(job, 'the paid job is still queued/active at the abort instant');
  const undelivered = Math.max(0, job.total - job.applied);
  const expectedRefund = Math.round(paid * (undelivered / job.total));

  abortByUndock(sim, state, player);
  assert.equal(state.stationServices.player, null, 'undock releases the yard record');
  assert.equal(state.player.credits, 10_000 - paid + expectedRefund,
    `credits return the undelivered share (${expectedRefund} of ${paid})`);
});

test('an aborted note job (broke-pilot hardship fuel) releases the undelivered debt, not the credits', () => {
  const { sim, state, econ, player } = dockedSim({
    credits: 0,
    fuel: { current: 20, max: 100 },
  });
  econ.handleService({ type: 'refuel' });
  const job = state.stationServices.player && state.stationServices.player.jobs[0];
  assert.ok(job, 'the note job was booked with the yard');
  assert.ok((job.meta && job.meta.debtCr) > 0, 'the hardship job filed its debt on the note');
  assert.equal(state.player.debt, job.meta.debtCr);
  const debtFiled = job.meta.debtCr;

  abortByUndock(sim, state, player);
  assert.equal(state.player.debt, debtFiled - Math.round(debtFiled * (job.total - job.applied) / job.total),
    'the note is released by the undelivered share');
  assert.ok(state.player.debt < debtFiled, 'a broke pilot does not owe for fuel never pumped');
});

test('a queued job that never started refunds in full when the yard releases it', () => {
  // Find a seeded instant where every crew is busy: a job booked there stays 'queued' at the
  // dock instant, so any early abort must return every credited cr.
  const profile = stationServiceProfile({ ui: {} }, STATION) || { size: 'M', sectorId: SECTOR };
  const pads = yardPadsFor(profile.size);
  const crews = yardCrewsFor(profile.size);
  const sectorId = profile.sectorId || SECTOR;
  const visits = planYardClients(42, sectorId, 0, STATION, profile.size);
  let t0 = -1;
  for (let t = 0; t < 600; t += 1) {
    const occ = yardOccupancy(visits, pads, crews, t);
    if (occ.busyCrews >= crews && occ.berthed.length < pads) { t0 = t; break; }
  }
  assert.ok(t0 >= 0, 'the seeded day must contain a crew-saturated instant');

  const { sim, state, econ, player } = dockedSim({ hull: 50, hullMax: 100, simTime: t0 });
  econ.handleService({ type: 'repair' });
  const paid = 10_000 - state.player.credits;
  assert.ok(paid > 0);
  const job = state.stationServices.player.jobs[0];
  for (let i = 0; i < 5; i += 1) sim.step();
  assert.equal(job.status, 'queued', 'fixture must sit before the yard starts the job');
  assert.equal(job.applied, 0, 'no work was delivered');

  abortByUndock(sim, state, player);
  assert.equal(state.player.credits, 10_000,
    'every credited cr returns for a job the yard never touched');
});

test('a fully delivered job refunds nothing when a later job aborts', () => {
  const { sim, state, econ, player } = dockedSim({ fuel: { current: 20, max: 100 } });
  econ.handleService({ type: 'refuel' });
  const paid = 10_000 - state.player.credits;
  for (let i = 0; i < 60 * 120 && state.fuel.current < state.fuel.max - 1e-6; i += 1) sim.step();
  assert.ok(state.fuel.current >= state.fuel.max - 1e-6, 'fixture completes the pump');
  // A second booking whose job is still open when the dock ends: the delivered pump must stay paid.
  state.fuel.current = 20;
  econ.handleService({ type: 'refuel' });
  assert.ok(state.stationServices.player.jobs.length === 1, 'completed job left the queue');
  abortByUndock(sim, state, player);
  assert.equal(state.player.credits, 10_000 - paid,
    'delivered work keeps its price; only the second job\'s undelivered share returns');
  assert.ok(state.player.credits > 10_000 - 2 * paid, 'the undelivered second pump was refunded');
});
