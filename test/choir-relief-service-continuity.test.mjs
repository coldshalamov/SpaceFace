import assert from 'node:assert/strict';
import test from 'node:test';

import { mulberry32 } from '../src/core/rng.js';
import { createChoirReliefBerth, normalizeChoirRelief }
  from '../src/systems/choirReliefBerth.js';

// Fixture adapted from pb-jobs-b-choir-relief-berth.test.mjs.
// Owner-seam tests use explicit positions, not a physics/tether playthrough.
// PB-JOBS-B (SF-085 + SF-077): the Helios relief berth is one real bed with a human arrival
// rhythm, and every person in the flow stays one durable record. Pins:
//   1. capacity is never exceeded and the full runner cycle is physical (hold → admit → dwell → depart)
//   2. arrivals honor the state.rng rhythm — never early, bounded cast, quiet forever after
//   3. worker↔patient identity survives offscreen/reentry — one world record each, no duplicates
//   4. events fire once per real transition (gratitude, kills, handover news), charges survive
//      a save normalization round-trip

const SEED = 2027;
const ARRIVAL_MIN_S = 40;
const ARRIVAL_SPREAD_S = 30;
const SERVICE_S = 45;
const MERCY_STAY_S = 90;

function mkBus() {
  const events = [];
  return { events, emit: (type, payload) => { events.push({ type, ...(payload || {}) }); } };
}

function berthFixture({ seed = SEED } = {}) {
  const bus = mkBus();
  let nextId = 100;
  const patient = {
    id: 'e_patient', type: 'ship', team: 2, alive: true,
    pos: { x: 115, z: 40 }, vel: { x: 0, z: 0 }, radius: 12, hull: 60, hullMax: 100,
    data: { worldRecordId: `choir-relief:${seed}:patient`, choirReliefRole: 'patient',
      trafficRole: 'shuttle' },
  };
  const attendant = {
    id: 'e_attendant', type: 'ship', team: 2, alive: true,
    pos: { x: 200, z: 40 }, vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100,
    data: { worldRecordId: `choir-relief:${seed}:attendant`, choirReliefRole: 'attendant',
      trafficRole: 'tender' },
  };
  const home = {
    id: 'e_station', type: 'station', alive: true, pos: { x: 900, z: 0 }, radius: 80,
    data: { stationId: 'station_helios' },
  };
  const state = {
    meta: { seed },
    playerId: 'p1',
    simTime: 0,
    rng: mulberry32(seed),
    world: { currentSectorId: 'sector_helios_prime', records: { byId: {} } },
    entities: new Map([[patient.id, patient], [attendant.id, attendant], [home.id, home]]),
    entityList: [patient, attendant, home],
  };
  const wrecks = {
    bearings: { wreck_choir_tender: { fixedPos: { x: 0, z: 0 }, outcome: 'handed_over' } },
    choirRelief: undefined,
  };
  const spawnedSpecs = [];
  const spawnedEntities = [];
  const jobsById = new Map();
  const kernel = {
    inspect: () => ({ entity: { combat: { subsystems: {} } } }),
    routeDamage: () => ({ ok: true }),
    repair: () => ({ ok: true }),
  };
  const owner = {
    state,
    bus,
    _ensureState: () => wrecks,
    registry: { get: () => ({ ensureKernel: () => kernel, kernel }) },
    helpers: {
      spawnEntity: (spec) => {
        spawnedSpecs.push(spec);
        const entity = {
          id: `e_spawn${++nextId}`, type: 'ship', team: spec.team, alive: true,
          pos: { ...spec.pos }, vel: { x: 0, z: 0 }, radius: 12, hull: 100, hullMax: 100,
          data: { ...spec.data },
        };
        state.entities.set(entity.id, entity);
        state.entityList.push(entity);
        spawnedEntities.push(entity);
        return entity;
      },
      npcJobs: {
        assign: (entity, spec) => {
          const jobId = `job:j${jobsById.size + 1}`;
          jobsById.set(jobId, { entity, spec });
          entity.data.jobId = jobId;
          return jobId;
        },
        get: (jobId) => jobsById.get(jobId) || null,
        release: (jobId) => {
          const entry = jobsById.get(jobId);
          if (entry && entry.entity.data.jobId === jobId) delete entry.entity.data.jobId;
          jobsById.delete(jobId);
        },
      },
    },
  };
  // The job runtime owns motion; the fixture flies each live job hull toward its route
  // destination so the berth's proximity gates are exercised honestly.
  const flyJobs = (dt) => {
    for (const entry of jobsById.values()) {
      const target = entry.spec.route[1].pos;
      const dx = target.x - entry.entity.pos.x;
      const dz = target.z - entry.entity.pos.z;
      const d = Math.hypot(dx, dz);
      const step = entry.spec.speed * dt;
      if (d <= step) {
        entry.entity.pos.x = target.x;
        entry.entity.pos.z = target.z;
      } else {
        entry.entity.pos.x += dx / d * step;
        entry.entity.pos.z += dz / d * step;
      }
    }
  };
  return {
    bus, state, wrecks, owner, patient, attendant, home,
    spawnedSpecs, spawnedEntities, jobsById, flyJobs,
  };
}

function runnerSpecs(f) {
  return f.spawnedSpecs.filter((s) => Number.isInteger(s.data.choirReliefRunner));
}

function handOverMercy(f, berth, t) {
  f.state.simTime = t;
  f.patient.pos = { x: f.home.pos.x + 100, z: f.home.pos.z };
  f.patient.vel = { x: 0, z: 0 };
  berth.complete({ jobId: `job:choir-relief:${f.state.meta.seed}:patient` });
}


import { save } from '../src/save/saveSystem.js';

function admittedRunner() {
  const f = berthFixture();
  const berth = createChoirReliefBerth(f.owner);
  berth.enabled({ subsystemId: 'subsystem_drive', targetId: f.patient.id, repairedBy: 'p1' });
  handOverMercy(f, berth, 5);
  for (let t = 6; t < 200 && !berth.berthStatus().runnerBed; t++) {
    f.flyJobs(1); f.state.simTime = t; berth.sync();
  }
  const runner = f.spawnedEntities[0];
  assert.ok(runner);
  assert.equal(f.wrecks.choirRelief.runnerBedOrdinal, 1);
  return { ...f, berth, runner, admittedAt: f.wrecks.choirRelief.runnerAdmittedAtS };
}
const relief = (f) => f.wrecks.choirRelief;
const tickAt = (f, t) => { f.state.simTime = t; f.berth.sync(); };
const displace = (f) => { f.runner.pos = { x: f.home.pos.x + 2000, z: f.home.pos.z }; };
const returnToBerth = (f) => { f.runner.pos = { x: f.home.pos.x + f.home.radius + 240, z: f.home.pos.z }; };
function assertReserved(f) {
  assert.equal(relief(f).runnerBedOrdinal, 1);
  assert.equal(relief(f).runnersDeparted, 0);
  assert.equal(relief(f).nextArrivalAtS, null);
  assert.equal(f.berth.berthStatus().load, 1);
  assert.equal(f.spawnedEntities.length, 1);
}

test('local displacement interrupts service, reserves the bed, and repeated sync cannot credit departure', () => {
  const f = admittedRunner();
  const id = f.runner.data.worldRecordId;
  displace(f); tickAt(f, f.admittedAt + 20);
  assert.equal(relief(f).runnerAdmittedAtS, null);
  assertReserved(f);
  tickAt(f, f.admittedAt + SERVICE_S);
  tickAt(f, f.admittedAt + 1000);
  assertReserved(f);
  assert.equal(f.runner.data.worldRecordId, id);
  assert.notEqual(f.runner.data.choirReliefLeg, 'outbound');
});

test('the same runner restarts a full service stay at the existing reach boundary and departs once', () => {
  const f = admittedRunner();
  displace(f); tickAt(f, f.admittedAt + 20);
  returnToBerth(f); tickAt(f, 200);
  assert.equal(relief(f).runnerAdmittedAtS, 200);
  tickAt(f, 244.999); assertReserved(f);
  tickAt(f, 245);
  assert.equal(relief(f).runnersDeparted, 1);
  assert.equal(relief(f).runnerBedOrdinal, 0);
  assert.equal(f.runner.data.choirReliefLeg, 'outbound');
  const next = relief(f).nextArrivalAtS;
  assert.ok(next >= 285 && next < 315);
  tickAt(f, 245); tickAt(f, 246);
  assert.equal(relief(f).nextArrivalAtS, next);
  assert.equal(relief(f).runnersDeparted, 1);
  assert.equal(f.spawnedEntities.length, 1);
});

test('just outside the admission boundary interrupts even on the departure deadline', () => {
  const f = admittedRunner();
  f.runner.pos = { x: f.home.pos.x + f.home.radius + 240 + 0.001, z: f.home.pos.z };
  tickAt(f, f.admittedAt + SERVICE_S);
  assert.equal(relief(f).runnerAdmittedAtS, null);
  assertReserved(f);
});

test('actual player Save serialization preserves interruption; Continue does not treat null as service already done', () => {
  const f = admittedRunner();
  displace(f); tickAt(f, f.admittedAt + 20);
  f.state.player = { uniqueWrecks: f.wrecks };
  const payload = JSON.parse(JSON.stringify(save._serializePlayer.call({ state: f.state })));
  assert.equal(payload.uniqueWrecks.choirRelief.runnerAdmittedAtS, null);
  f.state.player = {};
  save._restorePlayer.call({ state: f.state }, payload);
  f.wrecks.choirRelief = normalizeChoirRelief(f.state.player.uniqueWrecks.choirRelief);
  f.berth.clear();
  tickAt(f, 1000); assertReserved(f);
  assert.equal(relief(f).runnerAdmittedAtS, null);
  returnToBerth(f); tickAt(f, 1001);
  assert.equal(relief(f).runnerAdmittedAtS, 1001);
  tickAt(f, 1045.999); assertReserved(f);
  tickAt(f, 1046); assert.equal(relief(f).runnersDeparted, 1);
  assert.equal(f.state.entityList.filter(e => e.data?.worldRecordId === f.runner.data.worldRecordId).length, 1);
});

for (const hidden of ['runner', 'station', 'sector']) {
  test(`unobserved ${hidden} absence preserves the existing service clock, not a displacement`, () => {
    const f = admittedRunner();
    if (hidden === 'runner') {
      f.state.entities.delete(f.runner.id);
      f.state.entityList = f.state.entityList.filter(e => e !== f.runner);
      f.state.world.records.byId[f.runner.data.worldRecordId] = { id: f.runner.data.worldRecordId };
    } else if (hidden === 'station') {
      f.state.entities.delete(f.home.id);
      f.state.entityList = f.state.entityList.filter(e => e !== f.home);
    } else f.state.world.currentSectorId = 'sector_ceres_belt';
    tickAt(f, f.admittedAt + 100);
    assert.equal(relief(f).runnerAdmittedAtS, f.admittedAt);
    assertReserved(f);
    if (hidden === 'runner') { f.state.entities.set(f.runner.id, f.runner); f.state.entityList.push(f.runner); }
    else if (hidden === 'station') { f.state.entities.set(f.home.id, f.home); f.state.entityList.push(f.home); }
    else f.state.world.currentSectorId = 'sector_helios_prime';
    f.berth.sync();
    assert.equal(relief(f).runnersDeparted, 1);
  });
}

test('death during interrupted service frees capacity once and sends only the remaining finite runner', () => {
  const f = admittedRunner();
  displace(f); tickAt(f, f.admittedAt + 20);
  f.runner.alive = false;
  f.berth.killed({ id: f.runner.id, killerId: 'p1' });
  f.berth.killed({ id: f.runner.id, killerId: 'p1' });
  assert.equal(relief(f).runnerBedOrdinal, 0);
  assert.equal(relief(f).runnerAdmittedAtS, null);
  assert.equal(relief(f).runnersLostMask, 1);
  assert.equal(f.bus.events.filter(e => e.reason === 'choir_relief:runner1_killed').length, 1);
  const next = relief(f).nextArrivalAtS;
  assert.ok(next >= f.state.simTime + 40);
  tickAt(f, next);
  assert.equal(relief(f).runnersSent, 2);
  assert.equal(f.spawnedEntities.length, 2);
  const other = f.spawnedEntities[1]; other.alive = false;
  f.berth.killed({ id: other.id, killerId: 'p1' });
  tickAt(f, next + 1000);
  assert.equal(f.spawnedEntities.length, 2);
  assert.equal(relief(f).nextArrivalAtS, null);
});


test('a completed service approach is recommissioned once after displacement, with bounded guidance', () => {
  const f = admittedRunner();
  f.owner.helpers.npcJobs.release(f.runner.data.jobId);
  assert.equal(f.runner.data.jobId, undefined);
  displace(f); tickAt(f, 115);
  const job = f.runner.data.jobId;
  assert.ok(job);
  const count = f.jobsById.size;
  tickAt(f, 115); tickAt(f, 116);
  assert.equal(f.runner.data.jobId, job);
  assert.equal(f.jobsById.size, count);
  const interruptions = () => f.bus.events.filter(e => e.type === 'toast' && /Treatment interrupted/.test(e.text));
  assert.equal(interruptions().length, 1);
  returnToBerth(f); tickAt(f, 120); tickAt(f, 120); tickAt(f, 121);
  assert.equal(f.bus.events.filter(e => e.type === 'toast' && /Treatment starts again/.test(e.text)).length, 1);
  assert.equal(interruptions().length, 1);
});

for (const bad of ['stale runner index', 'stale station index', 'runner coordinate', 'station coordinate']) {
  test(`unobservable ${bad} cannot interrupt or finish service`, () => {
    const f = admittedRunner();
    f.berth.clear();
    if (bad.startsWith('stale')) {
      f.state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
        byWorldRecordId: new Map([[f.runner.data.worldRecordId, f.runner]]),
        byStationId: new Map([['station_helios', f.home]]) };
      const absent = bad.includes('runner') ? f.runner : f.home;
      f.state.entities.delete(absent.id);
      f.state.entityList = f.state.entityList.filter(e => e !== absent);
    } else if (bad.startsWith('runner')) f.runner.pos.x = NaN;
    else f.home.pos.z = NaN;
    tickAt(f, f.admittedAt + 100);
    assert.equal(relief(f).runnerAdmittedAtS, f.admittedAt);
    assertReserved(f);
  });
}


for (const bad of ['runner coordinate', 'station coordinate', 'stale runner index', 'stale station index']) {
  test(`first admission rejects unobservable ${bad} without reserving the bed`, () => {
    const f = berthFixture();
    f.berth = createChoirReliefBerth(f.owner);
    f.berth.enabled({ subsystemId: 'subsystem_drive', targetId: f.patient.id, repairedBy: 'p1' });
    handOverMercy(f, f.berth, 5);
    tickAt(f, relief(f).nextArrivalAtS);
    f.runner = f.spawnedEntities[0];
    assert.ok(f.runner);
    returnToBerth(f);
    const originalRunnerPos = { ...f.runner.pos }, originalHomePos = { ...f.home.pos };
    f.berth.clear();
    if (bad.startsWith('stale')) {
      f.state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
        byWorldRecordId: new Map([[f.runner.data.worldRecordId, f.runner]]),
        byStationId: new Map([['station_helios', f.home]]) };
      const absent = bad.includes('runner') ? f.runner : f.home;
      f.state.entities.delete(absent.id);
      f.state.entityList = f.state.entityList.filter(e => e !== absent);
    } else if (bad.startsWith('runner')) f.runner.pos.x = NaN;
    else f.home.pos.z = NaN;
    tickAt(f, 100); tickAt(f, 100);
    assert.equal(relief(f).runnerBedOrdinal, 0);
    assert.equal(relief(f).runnerAdmittedAtS, null);
    assert.equal(relief(f).runnersDeparted, 0);
    assert.equal(f.berth.berthStatus().load, 0);
    assert.equal(f.spawnedEntities.length, 1);
    assert.equal(f.runner.data.choirReliefLeg, 'hold');
    // Restoring actual observation admits the same runner normally, not a replacement.
    f.runner.pos = originalRunnerPos; f.home.pos = originalHomePos;
    for (const e of [f.runner, f.home]) {
      if (!f.state.entities.has(e.id)) { f.state.entities.set(e.id, e); f.state.entityList.push(e); }
    }
    tickAt(f, 101);
    assert.equal(relief(f).runnerBedOrdinal, 1);
    assert.equal(relief(f).runnerAdmittedAtS, 101);
    assert.equal(f.spawnedEntities.length, 1);
  });
}
