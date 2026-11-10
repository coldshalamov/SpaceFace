import test from 'node:test';
import assert from 'node:assert/strict';
import { ADVENTURE_SPEED_CONTRACTS, adventureSpeedOfferFor,
  adventureSpeedOffersForStation } from '../src/data/adventureSpeedContracts.js';
import { stepAdventureSpeed } from '../src/missions/adventureSpeedRuntime.js';
import { raceGateGlobals } from '../src/data/raceLevels.js';
import { advanceCircuit, gateApproach } from '../src/systems/racingGeometry.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missions } from '../src/systems/missions.js';

const player = { vel: { x: 200, z: 0 } };
const event = (gateIndex, elapsedS, finished = false) => ({ gateIndex, elapsedS, finished, lap: 0 });
function run(params, events, elapsed, pilot = player) {
  const result = stepAdventureSpeed(params, { events, player: pilot, simTime: params.raceStartSimS + elapsed });
  Object.assign(params, result.patch);
  return result;
}
function start(id = 'speed_helios_cut', elapsed = 0) {
  const p = adventureSpeedOfferFor(id).params; p.raceStartSimS = 100;
  run(p, [event(0, elapsed)], elapsed);
  return p;
}

test('each home station gets a real open sprint, and offers never share mutable mission state', () => {
  const ids = new Set();
  for (const row of ADVENTURE_SPEED_CONTRACTS) {
    const offer = adventureSpeedOfferFor(row.id), p = offer.params;
    ids.add(offer.id);
    assert.equal(adventureSpeedOffersForStation(offer.stationId).length,
      ADVENTURE_SPEED_CONTRACTS.filter(other => adventureSpeedOfferFor(other.id).stationId === offer.stationId).length);
    assert.equal(offer.type, 'race'); assert.equal(p.laps, 1); assert.equal(p.closedCircuit, false);
    assert.notDeepEqual(p.gates.at(-1), p.gates[0]);
    assert.equal(p.steerLock, undefined, 'campaign job must leave the view toggle available');
    assert.equal(raceGateGlobals(p).length, p.gates.length);
    p.gates[0].x = NaN; p.adventureSpeed.gateDeadlinesS[1] = -10;
    const fresh = adventureSpeedOfferFor(row.id).params;
    assert.ok(Number.isFinite(fresh.gates[0].x)); assert.ok(fresh.adventureSpeed.gateDeadlinesS[1] > 0);
  }
  assert.equal(ids.size, 6);
  assert.deepEqual(adventureSpeedOffersForStation('station_other'), []);
  assert.equal(adventureSpeedOfferFor('missing'), null);
});

test('the trip from the berth is unscored and pressure starts at the first crossing', () => {
  const p = adventureSpeedOfferFor('speed_helios_cut').params; p.raceStartSimS = 100;
  assert.equal(run(p, [], 250).outcome, 'active');
  assert.equal(p.adventureSpeedState, undefined);
  run(p, [event(0, 250)], 250);
  assert.equal(p.adventureSpeedRemainingS, 14);
  assert.equal(p.adventureSpeedStartSimS, 350);
  assert.equal(run(p, [], 264).outcome, 'active');
  assert.equal(run(p, [], 264.01).reason, 'speed_sweep_caught');
});

test('a closing window rejects late gates before they can buy more time', () => {
  const p = start();
  assert.equal(run(p, [event(1, 14.01)], 14.1).reason, 'speed_sweep_caught');
  assert.equal(p.adventureSpeedState.lastGate, 0);
  assert.equal(run(p, [event(1, 1)], 15).outcome, 'failed', 'late replay cannot resurrect failure');
});

test('escape time can be banked only by ordered gates and has a ceiling', () => {
  const p = start();
  run(p, [event(2, 0.1)], 0.1);
  assert.equal(p.adventureSpeedState.lastGate, 0);
  run(p, [event(1, 0.2)], 0.2);
  const deadline = p.adventureSpeedState.deadlineElapsedS;
  assert.ok(deadline > 14);
  run(p, [event(1, 0.2)], 0.3);
  assert.equal(p.adventureSpeedState.deadlineElapsedS, deadline);
  for (let i = 2; i < p.gates.length - 1; i++) run(p, [event(i, i * 0.2)], i * 0.2);
  assert.ok(p.adventureSpeedRemainingS <= 20);
});

test('recovery and a JSON save round trip cannot replenish the pressure clock', () => {
  const p = start('speed_tethys_window', 35);
  run(p, [event(1, 38)], 38);
  const saved = JSON.parse(JSON.stringify(p)); saved.resetCount = 1;
  const before = JSON.parse(JSON.stringify(saved));
  const a = stepAdventureSpeed(p, { events: [], player, simTime: 146 });
  const b = stepAdventureSpeed(saved, { events: [], player, simTime: 146 });
  assert.deepEqual(a, b);
  assert.deepEqual(saved, before, 'helper must not mutate save input');
  assert.ok(b.patch.adventureSpeedRemainingS < p.adventureSpeedRemainingS);
});

test('finish is arbitrated at swept crossing time, not the end of its observing tick', () => {
  const p = start('speed_veil_wake');
  const deadline = p.adventureSpeedState.deadlineElapsedS;
  const events = p.gates.slice(1).map((_, i) => event(i + 1,
    deadline * (i + 1) / (p.gates.length - 1), i + 1 === p.gates.length - 1));
  const result = run(p, events, deadline + 0.05);
  assert.equal(result.outcome, 'complete');
  assert.equal(result.finishedEvent.elapsedS, Math.round(deadline * 100) / 100);
  assert.equal(run(p, [], deadline + 5).outcome, 'complete');
});

test('the customs final crossing requires a controlled speed, including on loaded data', () => {
  for (const [speed, expected] of [[240, 'complete'], [240.01, 'failed'], [NaN, 'failed']]) {
    const p = start('speed_tethys_window');
    const events = p.gates.slice(1).map((_, i) => event(i + 1, i + 1, i + 1 === p.gates.length - 1));
    const result = run(p, events, p.gates.length, { vel: { x: speed, z: 0 } });
    assert.equal(result.outcome, expected);
    if (expected === 'failed') assert.equal(result.reason, 'speed_handoff_too_fast');
  }
});

test('all three authored routes complete through the real swept gate geometry', () => {
  for (const row of ADVENTURE_SPEED_CONTRACTS.filter(row => ['escape', 'windows', 'wake'].includes(row.kind))) {
    const p = adventureSpeedOfferFor(row.id).params; p.raceStartSimS = 100;
    const gates = raceGateGlobals(p); let result, time = 105;
    for (let index = 0; index < gates.length; index++) {
      const gate = gates[index], approach = gateApproach(gates, index);
      const sample = {
        prev: { x: gate.x - approach.nx * 10, z: gate.z - approach.nz * 10 },
        pos: { x: gate.x + approach.nx * 10, z: gate.z + approach.nz * 10 },
        vel: { x: approach.nx * 200, z: approach.nz * 200 },
        gates, previousTime: time, now: time + 0.1,
      };
      const crossings = advanceCircuit(p, sample);
      assert.equal(crossings.length, 1, `${row.id} gate ${index}`);
      result = stepAdventureSpeed(p, { events: crossings, player: sample, simTime: time + 0.1 });
      Object.assign(p, result.patch); time += 1;
    }
    assert.equal(result.outcome, 'complete', row.id);
    assert.equal(result.finishedEvent.elapsedS, gates.length - 1,
      'final time excludes the journey to the start');
    assert.equal(p.nextGate, gates.length);
  }
});

function missionHarness(id = 'speed_helios_cut') {
  const offer = adventureSpeedOfferFor(id), state = createGameState(312);
  state.mode = 'flight'; state.simTime = 100; state.playerId = 1;
  state.world.currentSectorId = offer.params.courseSectorId;
  state.settings.gameplay.tutorialHints = false;
  state.player.cargo = { items: {}, capVolume: 40, usedVolume: 0, usedMass: 0 };
  state.onboarding = { active: false, finished: true };
  const pilot = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, mass: 26 };
  state.entities.set(1, pilot); state.entityList.push(pilot);
  const bus = createBus(), grants = [], completions = [], failures = [];
  bus.on('economy:grantCredits', payload => grants.push(payload));
  bus.on('mission:completed', payload => completions.push(payload));
  bus.on('mission:failed', payload => failures.push(payload));
  const host = Object.create(missions);
  host.init({ state, bus, helpers: { voice: { say: () => true } }, registry: { get: () => null } });
  return { offer, state, pilot, host, grants, completions, failures };
}

function crossMissionGate(h, m) {
  const p = m.params, gates = raceGateGlobals(p), index = p.nextGate;
  const gate = gates[index], a = gateApproach(gates, index);
  h.state.simTime += 1;
  p.planeSample = { x: gate.x - a.nx * 10, z: gate.z - a.nz * 10 };
  p.planeSampleSimS = h.state.simTime - 0.1;
  h.pilot.pos = { x: gate.x + a.nx * 10, z: gate.z + a.nz * 10 };
  h.pilot.vel = { x: a.nx * 200, z: a.nz * 200 };
  h.host._driveRace(m, h.state.missions.active.indexOf(m), h.state);
}

test('ordinary station boards expose the new jobs once and accept them through the mission owner', () => {
  for (const row of ADVENTURE_SPEED_CONTRACTS) {
    const h = missionHarness(row.id);
    const board = h.host.ensureBoard(h.offer.stationId);
    assert.ok(board.slots.some(offer => offer.id === h.offer.id));
    h.host.ensureBoard(h.offer.stationId);
    assert.equal(board.slots.filter(offer => offer.id === h.offer.id).length, 1);
    assert.equal(h.host.acceptMission(h.offer.id), true);
    assert.equal(h.state.missions.active.filter(m => m.params.adventureSpeedId === row.id).length, 1);
    assert.equal(h.host.ensureBoard(h.offer.stationId).slots.some(offer => offer.id === h.offer.id), false);
  }
});

test('live mission completion grants once, persists its first clear, and cannot be farmed after refresh', () => {
  const h = missionHarness();
  h.host.ensureBoard(h.offer.stationId); assert.equal(h.host.acceptMission(h.offer.id), true);
  const m = h.state.missions.active.find(m => m.params.adventureSpeedId);
  m.params.raceStartSimS = 100; m.params.gridUntilSimS = 100;
  for (let i = 0; i < m.params.gates.length; i++) crossMissionGate(h, m);
  assert.equal(m.status, 'completed'); assert.equal(h.completions.length, 1);
  assert.equal(h.grants.filter(grant => grant.reason === `mission:${m.id}`).length, 1);
  assert.ok(h.grants[0].amount > 0);
  h.host._completeMission(m, -1);
  assert.equal(h.completions.length, 1); assert.equal(h.grants.length, 1);
  h.host.deserialize(JSON.parse(JSON.stringify(h.host.serialize())));
  h.state.simTime += 1000;
  assert.equal(h.host.ensureBoard(h.offer.stationId).slots.some(offer => offer.id === h.offer.id), false);
  assert.equal(h.state.missions.adventureSpeedCompleted[h.offer.params.adventureSpeedId], true);
  assert.equal(h.host.postAndAcceptAuthoredOffer(h.offer).ok, false);
});

test('expiry removes the active job without payout and its station can issue a fresh retry after load', () => {
  const h = missionHarness();
  h.host.ensureBoard(h.offer.stationId); assert.equal(h.host.acceptMission(h.offer.id), true);
  const m = h.state.missions.active.find(m => m.params.adventureSpeedId);
  m.params.raceStartSimS = 100; m.params.gridUntilSimS = 100;
  crossMissionGate(h, m);
  h.state.simTime += 15;
  h.host._driveRace(m, 0, h.state);
  assert.equal(m.status, 'failed'); assert.equal(h.failures[0].reason, 'speed_sweep_caught');
  assert.equal(h.grants.length, 0); assert.equal(h.state.missions.active.includes(m), false);
  h.host.deserialize(JSON.parse(JSON.stringify(h.host.serialize())));
  const board = h.host.ensureBoard(h.offer.stationId), retry = board.slots.find(offer => offer.id === h.offer.id);
  assert.ok(retry); assert.equal(retry.params.adventureSpeedState, undefined);
  assert.equal(h.host.acceptMission(retry.id), true);
  const fresh = h.state.missions.active.find(m => m.params.adventureSpeedId);
  assert.notEqual(fresh.id, m.id); assert.equal(fresh.params.nextGate, 0);
});

test('the public acceptance seam refuses another race while an adventure speed contract is active', () => {
  const h = missionHarness();
  assert.equal(h.host.postAndAcceptAuthoredOffer(h.offer).ok, true);
  const other = adventureSpeedOfferFor('speed_tethys_window');
  assert.equal(h.host.postAndAcceptAuthoredOffer(other).ok, false);
  assert.equal(h.state.missions.active.filter(m => m.type === 'race').length, 1);
});

test('the mission save owner preserves an active escape margin and its start across reload', () => {
  const h = missionHarness();
  assert.equal(h.host.postAndAcceptAuthoredOffer(h.offer).ok, true);
  const m = h.state.missions.active.find(m => m.params.adventureSpeedId);
  m.params.raceStartSimS = 100; m.params.gridUntilSimS = 100;
  crossMissionGate(h, m); crossMissionGate(h, m);
  const pressure = { ...m.params.adventureSpeedState };
  h.host.deserialize(JSON.parse(JSON.stringify(h.host.serialize())));
  const loaded = h.state.missions.active.find(m => m.params.adventureSpeedId);
  assert.deepEqual(loaded.params.adventureSpeedState, pressure);
  assert.equal(loaded.params.adventureSpeedStartSimS, m.params.adventureSpeedStartSimS);
  h.state.simTime = loaded.params.raceStartSimS + pressure.deadlineElapsedS + 0.1;
  h.host._driveRace(loaded, 0, h.state);
  assert.equal(loaded.status, 'failed'); assert.equal(h.grants.length, 0);
});
