import test from 'node:test';
import assert from 'node:assert/strict';
import { racingOfferFor, raceGateGlobals, startLineFor } from '../src/data/raceLevels.js';
import { gateApproach, circuitPacePoint } from '../src/systems/racingGeometry.js';
import { missions } from '../src/systems/missions.js';
import { save } from '../src/save/saveSystem.js';
import { createGameState } from '../src/core/gameState.js';
import {
  activeSteerLock, raceGridHolding, raceLeaseActive, raceObjectiveUnits, racingAssistIntents,
  racingPaceSpeed, readRaceTape, resolveSteeringView, sampleRacingWake,
} from '../src/systems/racingSteer.js';

function harness(id = 'contract_junction_jam') {
  const offer = racingOfferFor(id);
  const p = offer.params;
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, mass: 10 };
  const m = { ...offer, id: 'section-test', status: 'active', params: p, objectiveProgress: 0,
    objectiveTarget: missions._objectiveTarget('race', p), deadline_s: 1000 };
  const state = { mode: 'flight', simTime: 0, playerId: 1, entities: new Map([[1, player]]),
    player: { tether: { active: false } }, world: { currentSectorId: p.courseSectorId },
    missions: { active: [m] }, nav: { waypoint: null },
    settings: { gameplay: { steeringView: 'overhead' } } };
  const emitted = [];
  let completed = 0, failed = 0, expired = 0, reason = null;
  const host = {
    state, bus: { emit: (...args) => emitted.push(args) },
    registry: { get: (name) => name === 'world' ? { relocatePlayerInSector: () => true } : null },
    _raceGateGlobal(mission, index) { return raceGateGlobals(mission.params)[index] || null; },
    _refreshTrackedMissionNav(mission) { state.nav.waypoint = missions._missionWaypoint.call(this, mission); },
    _completeMission(mission) { completed++; mission.status = 'completed'; },
    _failMission(mission, _index, why) { failed++; reason = why; mission.status = 'failed'; },
    _expireMission(mission) { expired++; mission.status = 'expired'; },
  };
  return { offer, p, player, m, state, host, emitted,
    get completed() { return completed; }, get failed() { return failed; },
    get expired() { return expired; }, get reason() { return reason; } };
}

function attachMissionEvents(h) {
  const listeners = new Map();
  const bus = {
    on(name, listener) {
      const rows = listeners.get(name) || [];
      rows.push(listener);
      listeners.set(name, rows);
    },
    emit(name, payload) {
      h.emitted.push([name, payload]);
      for (const listener of listeners.get(name) || []) listener(payload);
    },
  };
  Object.assign(h.host, {
    _dnfAuthoredRaces(reason) { return missions._dnfAuthoredRaces.call(this, reason); },
    _onDockedAuthoredRaces(stationId) { return missions._onDockedAuthoredRaces.call(this, stationId); },
    _projectMissionTargetDecodes() {},
    ensureBoard() {},
    _onDockedObjectives() {},
    _onContract47aB3Docked() {},
    _storyTrigger() {},
    _refreshNavigation() {},
  });
  missions.init.call(h.host, { state: h.state, bus, helpers: {}, registry: h.host.registry });
  return bus;
}

function finalGate(h) {
  const gates = raceGateGlobals(h.p);
  const i = gates.length - 1, gate = gates[i], approach = gateApproach(gates, i);
  h.p.phase = 'chase';
  h.p.raceStartSimS = 0;
  h.p.gridUntilSimS = 0;
  h.p.nextGate = i;
  h.p.planeSample = { x: gate.x - approach.nx * 10, z: gate.z - approach.nz * 10 };
  h.p.planeSampleSimS = h.state.simTime - 1;
  h.player.pos = { x: gate.x + approach.nx * 10, z: gate.z + approach.nz * 10 };
  h.player.vel = { x: approach.nx * 20, z: approach.nz * 20 };
}

const simpleCourse = [
  { x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1000 },
  { x: 0, z: 1000 }, { x: 0, z: 0 },
];
function wakeParams(extra = {}) {
  return { sectionMission: true, racingKind: 'draft', paceSpeedWU: 260, raceStartSimS: 0, phase: 'chase',
    draftRequiredS: 2, draftTimeS: 0, nextGate: 1, gateRadiusWU: 90, ...extra };
}
function wakePlayer(time, offset = 80) {
  const pace = circuitPacePoint(simpleCourse, time * 260 + 70);
  return { pos: { x: pace.x - Math.cos(pace.heading) * offset,
    z: pace.z - Math.sin(pace.heading) * offset },
  vel: { x: Math.cos(pace.heading) * 200, z: Math.sin(pace.heading) * 200 },
  rot: pace.heading, mass: 10 };
}

test('section contracts require a stationary aligned approach before the timed grid', () => {
  const h = harness();
  assert.equal(h.p.courseRevision, 4);
  assert.equal(h.p.phase, 'approach');
  assert.equal(h.m.objectiveTarget, raceObjectiveUnits(h.p) + 1);
  h.state.settings.gameplay.steeringView = 'auto';
  assert.equal(resolveSteeringView(h.state), 'overhead');
  assert.equal(activeSteerLock(h.state), null);
  assert.equal(raceLeaseActive(h.state), false);
  h.state.settings.gameplay.steeringView = 'racing';
  assert.equal(resolveSteeringView(h.state), 'racing');
  h.state.settings.gameplay.steeringView = 'overhead';
  const line = startLineFor(h.p);
  h.player.pos = { x: line.x, z: line.z };
  h.player.rot = line.heading;
  h.player.pos.x += Math.cos(line.heading + Math.PI / 2) * 70.1;
  h.player.pos.z += Math.sin(line.heading + Math.PI / 2) * 70.1;
  missions._driveAuthoredRace.call(h.host, h.m, 0, h.state);
  assert.equal(h.p.phase, 'approach');
  h.player.pos = { x: line.x, z: line.z };
  h.player.vel = { x: 9 * Math.cos(line.heading), z: 9 * Math.sin(line.heading) };
  missions._driveAuthoredRace.call(h.host, h.m, 0, h.state, 1 / 60);
  assert.equal(h.p.phase, 'approach');
  h.player.vel = { x: 0, z: 0 };
  h.player.rot = line.heading + Math.PI / 2;
  missions._driveAuthoredRace.call(h.host, h.m, 0, h.state);
  assert.equal(h.p.phase, 'approach');
  h.player.rot = line.heading;
  h.state.player.tether.active = true;
  missions._driveAuthoredRace.call(h.host, h.m, 0, h.state);
  assert.equal(h.p.phase, 'approach');
  h.state.player.tether.active = false;
  const before = { ...h.player.pos };
  h.state.simTime = 12;
  missions._driveAuthoredRace.call(h.host, h.m, 0, h.state);
  assert.equal(h.p.phase, 'grid');
  assert.equal(h.p.gridUntilSimS, 15.2);
  assert.equal(h.p.raceStartSimS, null);
  assert.equal(h.p.planeSample, null);
  assert.deepEqual(h.player.pos, before);
  assert.equal(resolveSteeringView({ ...h.state, settings: { gameplay: { steeringView: 'auto' } } }), 'racing');
  assert.equal(activeSteerLock(h.state), h.m);
  assert.equal(raceLeaseActive(h.state), true);
  assert.equal(raceGridHolding(h.state), true);
  h.state.simTime = h.p.gridUntilSimS;
  missions._driveAuthoredRace.call(h.host, h.m, 0, h.state);
  assert.equal(h.p.phase, 'chase');
  assert.equal(h.p.raceStartSimS, 15.2);
  assert.equal(raceGridHolding(h.state), false);
  h.p.draftTimeS = 1.5;
  h.p.nextGate = 1;
  h.p.raceStartSimS = 15.2;
  missions._resetAuthoredRace.call(h.host);
  assert.equal(h.p.draftTimeS, 0);
  assert.equal(h.p.raceStartSimS, 15.2);
  assert.equal(h.p.resetCount, 1);
  for (const phase of ['approach', 'handoff']) {
    const blocked = harness();
    blocked.p.phase = phase;
    const position = { ...blocked.player.pos };
    missions._resetAuthoredRace.call(blocked.host);
    assert.deepEqual(blocked.player.pos, position);
    assert.equal(blocked.p.resetCount, undefined);
  }
});

test('handoff is scored once, stays one objective short, and pays only at the destination dock', () => {
  const h = harness();
  h.state.simTime = 100;
  finalGate(h);
  missions._driveAuthoredRace.call(h.host, h.m, 0, h.state);
  assert.equal(h.p.phase, 'handoff');
  assert.equal(h.completed, 0);
  assert.equal(h.m.objectiveProgress, h.m.objectiveTarget - 1);
  assert.equal(raceLeaseActive(h.state), false);
  assert.equal(resolveSteeringView(h.state), 'overhead');
  assert.equal(h.state.nav.waypoint.stationId, h.m.destStationId);
  const reward = h.m.reward_cr, progress = h.m.objectiveProgress;
  missions._driveAuthoredRace.call(h.host, h.m, 0, h.state, 1);
  assert.equal(h.completed, 0);
  assert.equal(h.m.reward_cr, reward);
  assert.equal(h.m.objectiveProgress, progress);
  const bus = attachMissionEvents(h);
  bus.emit('dock:docked', { stationId: h.m.destStationId });
  bus.emit('dock:docked', { stationId: h.m.destStationId });
  assert.equal(h.completed, 1);
  assert.equal(h.m.objectiveProgress, h.m.objectiveTarget);
});

test('premature/wrong docks, jump, abort, lost pilot and deadline cannot settle a section', () => {
  for (const phase of ['approach', 'chase']) {
    const h = harness();
    h.p.phase = phase;
    attachMissionEvents(h).emit('dock:docked', { stationId: h.m.destStationId });
    assert.equal(h.failed, 1);
  }
  const invalid = harness();
  invalid.p.phase = 'corrupt';
  missions._driveAuthoredRace.call(invalid.host, invalid.m, 0, invalid.state);
  assert.equal(invalid.reason, 'race_bad_phase');
  const wrong = harness();
  wrong.p.phase = 'handoff';
  attachMissionEvents(wrong).emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(wrong.failed, 1);
  for (const [event, reason] of [['jump:chargeStart', 'race_left_course'], ['race:abort', 'race_aborted']]) {
    const h = harness();
    attachMissionEvents(h).emit(event, { targetSectorId: 'sector_helios_prime' });
    assert.equal(h.failed, 1);
    assert.equal(h.reason, reason);
  }
  const dead = harness();
  dead.player.alive = false;
  missions._driveAuthoredRace.call(dead.host, dead.m, 0, dead.state);
  assert.equal(dead.reason, 'race_pilot_lost');
  const late = harness();
  late.p.phase = 'handoff';
  late.state.simTime = late.m.deadline_s;
  attachMissionEvents(late).emit('dock:docked', { stationId: late.m.destStationId });
  assert.equal(late.expired, 1);
  assert.equal(late.completed, 0);
});

test('finishing without the required two wake seconds fails before clean-record or payment', () => {
  const h = harness('contract_junction_draft');
  h.state.simTime = 100;
  h.p.draftTimeS = 1;
  finalGate(h);
  const map = new Map();
  const old = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => map.get(key) || null, setItem: (key, value) => map.set(key, value) };
  try {
    missions._driveAuthoredRace.call(h.host, h.m, 0, h.state);
    assert.equal(h.failed, 1);
    assert.equal(h.reason, 'race_wake_incomplete');
    assert.equal(h.completed, 0);
    assert.equal(map.size, 0);
  } finally {
    if (old === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = old;
  }
});

test('wake eligibility is geometric and the assist accrues only simulation dt', () => {
  const params = wakeParams();
  const player = wakePlayer(0);
  assert.equal(racingPaceSpeed({ paceSpeedWU: 260 }), 260);
  assert.equal(racingPaceSpeed({ paceSpeedWU: 900 }), 640);
  assert.equal(racingPaceSpeed({ paceSpeedWU: 20 }), 80);
  assert.equal(racingPaceSpeed({ paceSpeedWU: NaN }), 640);
  assert.equal(sampleRacingWake(params, player, simpleCourse, 0).active, true);
  const rejects = [
    [{ ...params, phase: 'approach' }, player, 0],
    [{ ...params, phase: 'grid' }, player, 0],
    [{ ...params, phase: 'handoff' }, player, 0],
    [params, { ...player, pos: { x: player.pos.x, z: player.pos.z + 46 } }, 0],
    [params, { ...player, rot: Math.PI / 2 }, 0],
    [params, { ...player, pos: { x: player.pos.x + 200, z: player.pos.z } }, 0],
    [params, { ...player, vel: { x: -200, z: 0 } }, 0],
    [params, { ...player, vel: { x: 0, z: 0 } }, 0],
    [params, { ...player, vel: { x: 50, z: 0 } }, 0],
    [params, { ...player, pos: { x: NaN, z: 0 } }, 0],
    [{ ...params, raceStartSimS: null }, player, 0],
    [{ ...params, gridUntilSimS: 1 }, player, 0],
    [params, player, NaN],
  ];
  for (const [p, pilot, time] of rejects) assert.equal(sampleRacingWake(p, pilot, simpleCourse, time).active, false);
  assert.equal(sampleRacingWake(params, player, [{ x: 0, z: 0 }, { x: NaN, z: 0 }], 0).active, false);
  const tape = readRaceTape(params, { ...player, pos: { x: player.pos.x, z: player.pos.z + 46 } },
    simpleCourse, 0);
  assert.equal(tape.drafting, false);
  assert.equal(tape.phase, 'chase');
  assert.equal(tape.draftRequiredS, 2);

  const run = (steps) => {
    const p = wakeParams();
    let time = 0, impulse = 0;
    for (const dt of steps) {
      time += dt;
      const intents = racingAssistIntents({ params: p, player: wakePlayer(time), simTime: time,
        gatesGlobal: simpleCourse, dt });
      Object.assign(p, intents.patch);
      impulse += intents.impulses.find((row) => row.kind === 'draft')?.impulse.x || 0;
    }
    return { p, impulse };
  };
  const a = run(Array(20).fill(0.05)), b = run(Array(10).fill(0.1));
  assert.ok(Math.abs(a.p.draftTimeS - b.p.draftTimeS) < 1e-9);
  assert.equal(a.impulse, 0, 'a painted coaching light cannot push a physical ship');
  assert.equal(b.impulse, 0);
  const noTime = racingAssistIntents({ params: a.p, player: wakePlayer(1), simTime: 1,
    gatesGlobal: simpleCourse });
  assert.equal(noTime.patch.pacing, true);
  assert.equal(noTime.patch.draftTimeS, a.p.draftTimeS);
  assert.equal(noTime.impulses.length, 0);
});

test('adventure wake follows its start-gate clock instead of the circuit acceptance clock', () => {
  const params = wakeParams({ adventureSpeedId: 'wake', raceStartSimS: 0,
    adventureSpeedStartSimS: 100 });
  assert.equal(sampleRacingWake(params, wakePlayer(1), simpleCourse, 101).active, true);
  assert.equal(sampleRacingWake({ ...params, adventureSpeedStartSimS: null },
    wakePlayer(1), simpleCourse, 101).active, false);
});

test('phase and accumulated wake fields survive mission save/load without replacing camera preference', () => {
  for (const phase of ['approach', 'chase', 'handoff']) {
    const h = harness('contract_junction_draft');
    h.p.phase = phase;
    h.p.draftTimeS = 1.25;
    const saved = save._serializeMissions.call({ state: h.state });
    const restored = createGameState(239);
    restored.settings.gameplay.steeringView = 'overhead';
    save._restoreMissions.call({ state: restored, registry: { get: () => null } }, saved);
    const mission = restored.missions.active[0];
    assert.equal(mission.params.phase, phase);
    assert.equal(mission.params.draftTimeS, 1.25);
    assert.equal(restored.settings.gameplay.steeringView, 'overhead');
    assert.equal(resolveSteeringView(restored), phase === 'chase' ? 'racing' : 'overhead');
  }
});
