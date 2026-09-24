import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import {
  shouldSkipFullTickSystems,
  HIDDEN_KEEPALIVE_SYSTEM_NAMES,
} from '../src/core/presentationFreeze.js';
import { economy } from '../src/systems/economy.js';
import {
  stationServices,
  stationServiceProfile,
  planYardClients,
  yardOccupancy,
  yardPadsFor,
  yardCrewsFor,
} from '../src/systems/stationServices.js';

// D33 review fixture: the production dock freezes the whole fixed-step world (ui.docked →
// timeScale 0 + shouldSkipFullTickSystems), yet the yard can only take a job while docked and
// aborts it on undock. If the yard is not in the frozen-world keepalive set, a paid repair can
// never deliver — and if the queue gates read only the frozen simTime, a congested dock instant
// never drains and a paid job queues forever. These tests run the REAL freeze predicate against
// a real registry step — no poking at yard internals — so they fail the moment the keepalive
// wiring or the yard wall clock is lost again.

const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function dockedSim({ hull = 50, hullMax = 100, credits = 10_000, rep = 0, simTime = 0 } = {}) {
  const sim = createSimulation({ seed: 42, systems: [stationServices] });
  const { state, bus } = sim;
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull, hullMax, armorHp: 0, armorMax: 0,
    flags: { docked: false },
  };
  state.playerId = 'player';
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.player.credits = credits;
  state.fuel = { current: 20, max: 100 };
  state.meta = { ...(state.meta || {}), seed: 42 };
  state.factions = { ...(state.factions || {}), faction_scn: { rep } };
  state.ui.docked = true;
  state.ui.dockedStationId = STATION;
  state.world = { ...(state.world || {}), currentSectorId: SECTOR };
  state.simTime = simTime;
  // The production dock pins the world clock at scale 0; the fixture must model that or the
  // yard's frozen-time accumulation never engages and the schedule gates sit on a still frame.
  state.timeScale = 0;
  player.flags.docked = true;
  bus.emit('dock:docked', { stationId: STATION });
  const econ = Object.create(economy);
  econ.state = state;
  econ.bus = bus;
  econ._registry = sim.registry;
  econ._lastDockedStation = null;
  return { sim, state, bus, econ, player };
}

test('a paid repair delivers while the docked world is frozen', () => {
  const { sim, state, econ, player } = dockedSim({ hull: 50, hullMax: 100 });
  assert.equal(shouldSkipFullTickSystems(state), true,
    'fixture must sit under the real production freeze predicate');
  const creditsBefore = state.player.credits;
  econ.handleService({ type: 'repair' });
  assert.ok(state.player.credits < creditsBefore, 'yard service is paid at booking');
  assert.equal(player.hull, 50, 'repair is a timed job, not an instant fill');
  for (let i = 0; i < 60 * 60 && player.hull < player.hullMax; i += 1) sim.step();
  assert.equal(player.hull, player.hullMax,
    'a berthed paid job must reach full hull while still docked');
});

test('a paid refuel delivers while the docked world is frozen', () => {
  const { sim, state, econ } = dockedSim();
  econ.handleService({ type: 'refuel' });
  assert.equal(state.fuel.current, 20, 'refuel is a pump, not an instant fill');
  for (let i = 0; i < 60 * 60 && state.fuel.current < state.fuel.max; i += 1) sim.step();
  assert.ok(state.fuel.current >= state.fuel.max - 1e-6,
    `pump completes the tank (${state.fuel.current}/${state.fuel.max})`);
});

test('an undock still aborts the paid job and freezes delivered work', () => {
  const { sim, state, econ, player } = dockedSim({ hull: 10, hullMax: 100 });
  econ.handleService({ type: 'repair' });
  for (let i = 0; i < 60 * 60 && player.hull <= 10; i += 1) sim.step();
  const midHull = player.hull;
  assert.ok(midHull > 10, 'job delivered partial work before undock');
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  player.flags.docked = false;
  sim.bus.emit('dock:undocked', { stationId: STATION });
  assert.equal(state.stationServices.player, null, 'undock releases the berthed job record');
  // The keepalive path is the only driver while docked; off the dock the yard must stay inert.
  const yard = sim.registry.get('stationServices');
  yard.update(0.25, state);
  yard.update(0.25, state);
  assert.equal(player.hull, midHull, 'no yard work continues after undock');
});

test('a congested dock instant drains on the yard wall clock — the paid job still starts', () => {
  // Find a seeded instant where every crew is on a client hull but a service pad is free:
  // exactly the dock that used to freeze a paid job in 'queued' until undock destroyed it.
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
  assert.ok(t0 >= 0, 'the seeded day must contain a crew-saturated instant with a free pad');

  const { sim, state, econ, player } = dockedSim({ hull: 50, hullMax: 100, simTime: t0 });
  econ.handleService({ type: 'repair' });
  const job = state.stationServices.player.jobs[0];
  assert.ok(job, 'paid job was booked');
  for (let i = 0; i < 5; i += 1) sim.step();
  assert.equal(job.status, 'queued',
    'a saturated yard holds the paid job queued at the dock instant');
  assert.ok(state.stationServices.player.padIdx >= 0,
    'the free pad still berths the player');

  // NPC service windows are bounded (<= ~110 s of schedule), so on the yard's wall clock the
  // congestion must drain and the job must start and finish inside a sane bound.
  for (let i = 0; i < 60 * 300 && job.status !== 'active'; i += 1) sim.step();
  assert.equal(job.status, 'active',
    'queued paid job must start once the seeded schedule frees a crew');
  for (let i = 0; i < 60 * 60 && player.hull < player.hullMax; i += 1) sim.step();
  assert.equal(player.hull, player.hullMax);
});

test('the frozen-dock delivery path is the real keepalive wiring, not a fixture shortcut', () => {
  assert.ok(HIDDEN_KEEPALIVE_SYSTEM_NAMES.includes('stationServices'),
    'the yard must be a named hidden keepalive system');
  const registrySrc = readFileSync(join(ROOT, 'src/core/registry.js'), 'utf8');
  const runnerSrc = readFileSync(join(ROOT, 'src/core/presentationRunner.js'), 'utf8');
  // Production delivery runs through registry.keepalive's yard call fed by the runner's
  // wall-frame dt — sim.js's own frozen loop is a parallel harness path, not this one.
  assert.match(registrySrc, /keepalive\(dt = 0, wallDt = dt\)[\s\S]*stationServices/,
    'registry.keepalive must tick the yard');
  assert.match(runnerSrc, /registry\.keepalive\(0, \w+\)/,
    'the frozen presentation frame must feed keepalive a wall-clock dt');
});
