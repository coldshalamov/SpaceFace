import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { economy } from '../src/systems/economy.js';
import {
  stationServices,
  planYardClients,
  yardOccupancy,
  yardPadsFor,
  yardCrewsFor,
  serviceRatePerS,
  ensureStationServicesState,
} from '../src/systems/stationServices.js';

const STATION = 'station_helios';       // size L, faction_scn, services include repair+refuel
const SECTOR = 'sector_helios_prime';

function makeHarness({
  stationId = STATION,
  seed = 42,
  rep = 0,
  hullMax = 140,
  hull = 100,
  armorMax = 0,
  armorHp = 0,
  fuelCurrent = 20,
  fuelMax = 100,
  credits = 100000,
  simTime = 0,
} = {}) {
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull, hullMax, armorHp, armorMax,
    flags: { docked: false },
  };
  const entities = new Map([[player.id, player]]);
  const state = {
    playerId: 'player',
    player: { credits, flags: { docked: false } },
    entities,
    entityList: [player],
    fuel: { current: fuelCurrent, max: fuelMax },
    meta: { seed },
    factions: { faction_scn: { rep } },
    ui: { docked: false, dockedStationId: null },
    world: { currentSectorId: SECTOR },
    content: {},
    simTime,
    tick: 0,
  };
  const bus = createBus();
  const systems = {};
  const registry = { get: (n) => systems[n] || null };
  const yard = Object.create(stationServices);
  yard.init({ state, bus, registry, helpers: {} });
  systems.stationServices = yard;
  // economy is heavy to init; handleService only needs state/bus/registry on `this`.
  const econ = Object.create(economy);
  econ.state = state;
  econ.bus = bus;
  econ._registry = registry;
  econ._lastDockedStation = null;
  systems.economy = econ;
  const events = [];
  for (const ev of ['service:queued', 'service:started', 'service:progress', 'service:completed',
    'service:aborted', 'station:berthAssigned', 'station:holding', 'station:yardChanged', 'fuel:changed']) {
    bus.on(ev, (p) => events.push({ ev, t: state.simTime, p }));
  }
  return { state, bus, yard, econ, player, events, systems, registry };
}

/** Dock the player at the harness station through the production latch + event. */
function dock(h) {
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = STATION;
  h.player.flags.docked = true;
  h.bus.emit('dock:docked', { stationId: STATION });
}

function undock(h) {
  h.state.ui.docked = false;
  h.state.ui.dockedStationId = null;
  h.player.flags.docked = false;
  h.bus.emit('dock:undocked', {});
}

/** Advance the yard by `seconds` of sim time in `step` increments. */
function step(h, seconds, step = 0.25) {
  for (let t = 0; t < seconds - 1e-9; t += step) {
    h.state.simTime += step;
    h.yard.update(step, h.state);
  }
}

function eventsOf(h, ev) { return h.events.filter((e) => e.ev === ev); }

/** Seconds from job start (or now) until `predicate` holds, stepping the yard. */
function runUntil(h, predicate, capS = 600) {
  let t = 0;
  while (!predicate() && t < capS) { step(h, 1); t += 1; }
  return t;
}

test('dock → repair → undock duration scales with hull damage', () => {
  const durations = [];
  for (const missing of [30, 120]) {
    const h = makeHarness({ hull: 140 - missing, simTime: 0 });
    dock(h);
    step(h, 2); // settle onto the pad
    const creditsBefore = h.state.player.credits;
    h.econ.handleService({ type: 'repair' });
    assert.ok(h.state.player.credits < creditsBefore, 'yard service is paid at booking');
    assert.ok(h.player.hull < h.player.hullMax, 'repair is not instant');
    assert.equal(eventsOf(h, 'service:completed').length, 0, 'no early completion receipt');
    const t = runUntil(h, () => eventsOf(h, 'service:completed').length > 0);
    durations.push(t);
    assert.ok(Math.abs(h.player.hull - h.player.hullMax) < 1e-6,
      `hull reaches max after the job (${h.player.hull}/${h.player.hullMax})`);
    undock(h);
    h.yard.destroy();
  }
  const ratio = durations[1] / durations[0];
  assert.ok(ratio > 2.5 && ratio < 5,
    `4x damage should take roughly 4x time under the same rate (got ${durations[0]}s vs ${durations[1]}s)`);
});

test('repair waits behind yard traffic — queue congestion delays completion', () => {
  // Scan seeds for a day that has both a saturated-crew window and a quiet window after it.
  const pads = yardPadsFor('L');
  const crews = yardCrewsFor('L');
  let seed = null;
  let busyT = null;
  let freeT = null;
  for (let s = 1; s <= 60 && freeT == null; s++) {
    const visits = planYardClients(s, SECTOR, 0, STATION, 'L');
    let sat = null;
    let quiet = null;
    for (let t = 0; t < 600; t += 0.5) {
      const occ = yardOccupancy(visits, pads, crews, t);
      if (sat == null && occ.busyCrews >= crews) sat = t;
      if (sat != null && quiet == null && occ.busyCrews === 0) quiet = t;
    }
    if (sat != null && quiet != null && quiet > sat + 20) {
      seed = s; busyT = sat; freeT = quiet;
    }
  }
  assert.ok(busyT != null, 'some seed needs a saturated-crew window (crews=' + crews + ')');
  assert.ok(freeT != null, `seed ${seed} needs a quiet window after the busy one`);

  const durations = [];
  for (const t0 of [freeT, busyT]) {
    const h = makeHarness({ hull: 20, simTime: t0, seed });
    dock(h);
    h.econ.handleService({ type: 'repair' });
    const t = runUntil(h, () => eventsOf(h, 'service:completed').length > 0, 1200);
    durations.push(t);
    undock(h);
    h.yard.destroy();
  }
  assert.ok(durations[1] > durations[0] + 5,
    `congested yard (${durations[1]}s) should beat the quiet yard (${durations[0]}s) by a real queue delay`);
});

test('a seeded client occupies a service pad the player can read as taken', () => {
  const seed = 42;
  const visits = planYardClients(seed, SECTOR, 0, STATION, 'L');
  assert.ok(visits.length > 0, 'the yard must actually schedule clients');
  const first = visits[0];
  const h = makeHarness({ simTime: first.arriveAt + 1, seed });
  dock(h);
  step(h, 1.5);
  const view = h.state.stationServices.stations[STATION];
  assert.ok(view && Array.isArray(view.pads), 'yard view materializes for the docked station');
  const occupied = view.pads.filter((p) => p.occupant && p.occupant !== 'player');
  assert.ok(occupied.length > 0, 'at least one pad shows an NPC client occupant');
  assert.ok(occupied.every((p) => p.occupant.startsWith(STATION + '#')),
    `client occupant ids identify the yard client (${occupied.map((p) => p.occupant)})`);
  const playerPad = view.pads.find((p) => p.occupant === 'player');
  assert.ok(playerPad, 'player has a visible pad while clients hold theirs');
});

test('refuel is a pump: tank fills over seconds, not on click', () => {
  const h = makeHarness({ fuelCurrent: 20, fuelMax: 100, simTime: 0 });
  dock(h);
  step(h, 2);
  h.econ.handleService({ type: 'refuel' });
  assert.equal(h.state.fuel.current, 20, 'fuel does not jump on click');
  step(h, 5);
  assert.ok(h.state.fuel.current > 20 && h.state.fuel.current < 100,
    `pump mid-transfer (${h.state.fuel.current}u)`);
  runUntil(h, () => h.state.fuel.current >= 100);
  assert.equal(h.state.fuel.current, 100);
  h.yard.destroy();
});

test('bigger hulls service slower; standing tilts the rate', () => {
  assert.ok(serviceRatePerS('repair', 400, 0) < serviceRatePerS('repair', 100, 0),
    'heavy frame takes the crew longer per hull point');
  assert.ok(serviceRatePerS('refuel', 200, 0) < serviceRatePerS('refuel', 50, 0));
  assert.ok(serviceRatePerS('repair', 140, 150) > serviceRatePerS('repair', 140, 0),
    'a friendly yard works quicker');
  assert.ok(serviceRatePerS('repair', 140, -60) < serviceRatePerS('repair', 140, 0),
    'a hostile-market yard drags its feet');
});

test('high standing squeezes the player job past a saturated crew list', () => {
  const seed = 42;
  const pads = yardPadsFor('L');
  const crews = yardCrewsFor('L');
  const visits = planYardClients(seed, SECTOR, 0, STATION, 'L');
  let busyT = null;
  for (let t = 0; t < 600; t += 0.5) {
    if (yardOccupancy(visits, pads, crews, t).busyCrews >= crews) { busyT = t; break; }
  }
  assert.ok(busyT != null);
  const h = makeHarness({ hull: 20, simTime: busyT, seed, rep: 150 });
  dock(h);
  h.econ.handleService({ type: 'repair' });
  const started = runUntil(h, () => eventsOf(h, 'service:started').length > 0, 30);
  assert.ok(started < 20, 'priority standing gets the job a crew even while the yard is full');
  h.yard.destroy();
});

test('undock aborts the job with partial work kept and service:aborted fired', () => {
  const h = makeHarness({ hull: 20, simTime: 0 });
  dock(h);
  step(h, 2);
  h.econ.handleService({ type: 'repair' });
  runUntil(h, () => h.player.hull > 40);
  const midHull = h.player.hull;
  undock(h);
  const aborted = eventsOf(h, 'service:aborted');
  assert.equal(aborted.length, 1);
  assert.ok(aborted[0].p.applied > 0 && aborted[0].p.applied < aborted[0].p.total);
  step(h, 5);
  assert.ok(Math.abs(h.player.hull - midHull) < 1e-6, 'no yard work continues after undock');
  assert.equal(eventsOf(h, 'service:completed').length, 0);
  h.yard.destroy();
});

test('save/reload mid-repair parks the job, then resumes on re-dock', () => {
  const h = makeHarness({ hull: 20, simTime: 0 });
  dock(h);
  step(h, 2);
  h.econ.handleService({ type: 'repair' });
  runUntil(h, () => h.player.hull > 50);
  const applied = h.player.hull - 20;
  const snapshot = h.yard.serialize();
  assert.ok(snapshot.player && snapshot.player.jobs.length === 1, 'live job serializes');
  assert.ok(snapshot.player.jobs[0].applied > 0);

  // Load semantics: the save layer clears the dock latch WITHOUT emitting dock:undocked — the
  // entity is rebuilt, flags reset, ui.docked nulled. The yard keeps the parked job.
  h.state.ui.docked = false;
  h.state.ui.dockedStationId = null;
  h.player.flags.docked = false;
  h.yard.deserialize(snapshot);
  const parkedApplied = h.state.stationServices.player.jobs[0].applied;
  step(h, 10);
  assert.equal(h.state.stationServices.player.jobs[0].applied, parkedApplied,
    'parked job does not weld a ship nobody is holding');
  const parkedHull = h.player.hull;
  step(h, 3);
  assert.equal(h.player.hull, parkedHull);

  dock(h);  // re-dock at the same yard: the parked job resumes.
  step(h, 2);
  runUntil(h, () => eventsOf(h, 'service:completed').length > 0);
  assert.ok(Math.abs(h.player.hull - h.player.hullMax) < 1e-6,
    'resumed job finishes the full quoted repair');
  h.yard.destroy();
});

test('yard is inert off the dock path — no writes, no client traffic simulation', () => {
  const h = makeHarness({ simTime: 0 });
  step(h, 60);
  const s = h.state.stationServices;
  assert.equal(s.player, null);
  assert.deepEqual(s.stations, {});
  assert.equal(s.seq, 0);
  assert.equal(h.events.length, 0, 'no yard events fire while flying');
  h.yard.destroy();
});

test('harness docks without the production latch keep the instant apply', () => {
  // Career/sandbox callers emit dock:docked + ui:service without uiRoot ever latching ui.docked.
  const h = makeHarness({ hull: 20, simTime: 0 });
  h.bus.emit('dock:docked', { stationId: STATION });   // no ui.docked, no dockedStationId
  h.econ._stationServiceBerth = STATION;               // what economy's own dock listener stamps
  h.econ.handleService({ type: 'repair' });
  assert.equal(h.player.hull, h.player.hullMax, 'instant legacy path still applies');
  assert.equal(eventsOf(h, 'service:queued').length, 0);
  h.yard.destroy();
});
