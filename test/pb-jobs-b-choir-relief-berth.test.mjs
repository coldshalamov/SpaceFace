import assert from 'node:assert/strict';
import test from 'node:test';

import { mulberry32 } from '../src/core/rng.js';
import { createChoirReliefBerth, normalizeChoirRelief }
  from '../src/systems/choirReliefBerth.js';

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

// One full deterministic play of the berth cycle. Returns the observed timeline.
function playCycle({ seed = SEED } = {}) {
  const f = berthFixture({ seed });
  const berth = createChoirReliefBerth(f.owner);
  const relief = () => f.wrecks.choirRelief;
  const marks = { spawns: [], admissions: [], departures: [], events: null };
  berth.enabled({ subsystemId: 'subsystem_drive', targetId: f.patient.id, repairedBy: 'p1' });
  const firstBeat = relief().nextArrivalAtS;
  handOverMercy(f, berth, 10);
  let admitted = false;
  let departuresSeen = relief().runnersDeparted;
  let lastSpawnCount = 0;
  let prevLoad = null;
  for (let t = 1; t <= 2400; t++) {
    f.flyJobs(1);
    f.state.simTime = t;
    berth.sync();
    const status = berth.berthStatus();
    assert.ok(status.load <= status.capacity, `bed load ${status.load} exceeds capacity at t=${t}`);
    if (runnerSpecs(f).length > lastSpawnCount) {
      lastSpawnCount = runnerSpecs(f).length;
      marks.spawns.push({ t, ordinal: lastSpawnCount });
    }
    if (status.runnerBed && !admitted) {
      admitted = true;
      marks.admissions.push({ t, mercyBed: status.mercyBed });
    }
    if (!status.runnerBed && admitted && relief().runnersDeparted > departuresSeen) {
      admitted = false;
      departuresSeen = relief().runnersDeparted;
      marks.departures.push({ t });
    }
    prevLoad = status.load;
  }
  marks.firstBeat = firstBeat;
  marks.evacuatedAtS = relief().evacuatedAtS;
  marks.runnersSent = relief().runnersSent;
  marks.nextArrivalAtS = relief().nextArrivalAtS;
  marks.recordIds = f.spawnedEntities.map((e) => e.data.worldRecordId).sort();
  marks.eventTypes = f.bus.events.map((e) => e.type).sort();
  return { f, berth, relief, marks };
}

test('the berth takes one bed: runners hold at the ring, are served, and capacity never breaks', () => {
  const { f, berth, relief, marks } = playCycle();

  // Mercy's bed is spoken for from the repair until her treatment stay ends.
  assert.equal(f.wrecks.choirRelief.driveRestored, true);
  assert.ok(marks.firstBeat >= ARRIVAL_MIN_S && marks.firstBeat < ARRIVAL_MIN_S + ARRIVAL_SPREAD_S,
    `first beat ${marks.firstBeat} honors the rhythm window`);
  assert.equal(marks.evacuatedAtS, 10);

  // Exactly the bounded cast: two runners over the site's whole life.
  assert.equal(marks.runnersSent, 2);
  assert.equal(runnerSpecs(f).length, 2);
  assert.deepEqual(marks.recordIds,
    [`choir-relief:${SEED}:runner1`, `choir-relief:${SEED}:runner2`]);

  // Each runner: spawned after its beat, admitted only once the bed is truly free,
  // served for the full dwell, then departed.
  for (let i = 0; i < 2; i++) {
    const spawn = marks.spawns[i];
    const beat = i === 0 ? marks.firstBeat : relief().nextArrivalAtS;
    assert.ok(spawn.t >= beat, `runner${i + 1} spawned at t=${spawn.t} before its beat ${beat}`);
    const admission = marks.admissions[i];
    assert.equal(admission.mercyBed, false, 'admission waits for the bed, never shares it');
    const departure = marks.departures[i];
    assert.equal(departure.t - admission.t, SERVICE_S,
      `runner${i + 1} dwell is the full service stay`);
    if (i === 1) {
      const wait = admission.t - marks.departures[0].t;
      assert.ok(wait >= 0, 'runner2 is admitted after runner1 frees the bed');
    }
  }

  // The capacity moment: runner1 reached the ring before Mercy's stay ended and held there.
  const runner1 = f.spawnedEntities[0];
  const stayEnd = marks.evacuatedAtS + MERCY_STAY_S;
  assert.ok(marks.admissions[0].t >= stayEnd,
    `runner1 admitted at ${marks.admissions[0].t} before Mercy's stay ended at ${stayEnd}`);
  assert.equal(runner1.data.choirReliefLeg, 'outbound', 'the served runner flies home');

  // After the cast is spent the rhythm goes quiet forever.
  assert.equal(relief().nextArrivalAtS, null);
  for (let t = 2401; t <= 4000; t++) {
    f.flyJobs(1);
    f.state.simTime = t;
    berth.sync();
  }
  assert.equal(runnerSpecs(f).length, 2, 'no third runner ever spawns');
});

test('a runner arriving while the bed is spoken for holds at the ring on the hold leg', () => {
  const f = berthFixture();
  const berth = createChoirReliefBerth(f.owner);
  berth.enabled({ subsystemId: 'subsystem_drive', targetId: f.patient.id, repairedBy: 'p1' });
  handOverMercy(f, berth, 5);
  const stayEnd = 5 + MERCY_STAY_S;
  let heldTicks = 0;
  for (let t = 1; t <= stayEnd + 2; t++) {
    f.flyJobs(1);
    f.state.simTime = t;
    berth.sync();
    const runner = f.spawnedEntities[0];
    const status = berth.berthStatus();
    assert.ok(!(status.mercyBed && status.runnerBed),
      `t=${t}: the bed is shared — capacity law broken`);
    if (runner && status.mercyBed) {
      assert.notEqual(runner.data.choirReliefLeg, 'service',
        'no runner takes the service approach while Mercy holds the bed');
      heldTicks++;
    }
  }
  assert.ok(heldTicks > 0, 'the hold window was actually exercised');
  // The moment the stay ends, the waiting runner is waved in — the hold was the only gate.
  assert.equal(berth.berthStatus().runnerBed, true,
    'the freed bed is taken by the waiting runner');
});

test('a runner off the near table is found again by its record — never duplicated', () => {
  const f = berthFixture();
  const berth = createChoirReliefBerth(f.owner);
  berth.enabled({ subsystemId: 'subsystem_drive', targetId: f.patient.id, repairedBy: 'p1' });
  const beat = f.wrecks.choirRelief.nextArrivalAtS;
  f.state.simTime = Math.ceil(beat) + 1;
  berth.sync();
  const runner = f.spawnedEntities[0];
  assert.ok(runner, 'runner1 spawned');
  const recordId = runner.data.worldRecordId;

  // Leave: the near table loses her, but the world record keeps her.
  f.state.entities.delete(runner.id);
  f.state.entityList = f.state.entityList.filter((e) => e !== runner);
  f.state.world.records.byId[recordId] = { id: recordId };
  f.state.simTime += 1;
  berth.sync();
  assert.equal(runnerSpecs(f).length, 1, 'no duplicate spawn while she is off the near table');
  assert.equal(f.wrecks.choirRelief.runnersSent, 1, 'her beat stays consumed');

  // Return: the same record resolves to the same entity and her job law still stands.
  f.state.entities.set(runner.id, runner);
  f.state.entityList.push(runner);
  f.state.simTime += 1;
  berth.sync();
  assert.equal(runnerSpecs(f).length, 1);
  const occurrences = f.state.entityList
    .filter((e) => e.data.worldRecordId === recordId).length;
  assert.equal(occurrences, 1, 'exactly one entity carries the runner record');
  assert.equal(berth.berthStatus().runnersSent, 1);

  // The named patient obeys the same law: absent copy is found, never re-created.
  f.state.entities.delete(f.patient.id);
  f.state.entityList = f.state.entityList.filter((e) => e !== f.patient);
  f.state.world.records.byId[f.patient.data.worldRecordId] = { id: recordId };
  f.state.simTime += 1;
  berth.sync();
  assert.equal(f.spawnedSpecs.filter((s) => s.data.choirReliefRole === 'patient').length, 0,
    'no patient is ever re-created while her record persists');
});

test('killing a runner charges standing once, frees her bed, and the next runner is a new person', () => {
  const f = berthFixture();
  const berth = createChoirReliefBerth(f.owner);
  const relief = () => f.wrecks.choirRelief;
  berth.enabled({ subsystemId: 'subsystem_drive', targetId: f.patient.id, repairedBy: 'p1' });
  handOverMercy(f, berth, 5);
  // Fly runner1 in and let her take the bed once Mercy's stay ends.
  for (let t = 1; t <= 5 + MERCY_STAY_S + 60 && !berth.berthStatus().runnerBed; t++) {
    f.flyJobs(1);
    f.state.simTime = t;
    berth.sync();
  }
  assert.equal(berth.berthStatus().runnerBed, true, 'runner1 holds the bed');
  const runner1 = f.spawnedEntities[0];
  runner1.alive = false;
  berth.killed({ id: runner1.id, killerId: 'p1' });
  assert.equal(relief().runnerBedOrdinal, 0, 'her death frees the bed');
  let rep = f.bus.events.filter((e) => e.type === 'faction:repDelta'
    && e.reason === 'choir_relief:runner1_killed');
  assert.equal(rep.length, 1);
  assert.equal(rep[0].delta, -6);
  // Numeric ids recycle: a stale second kill must not re-charge.
  berth.killed({ id: runner1.id, killerId: 'p1' });
  rep = f.bus.events.filter((e) => e.type === 'faction:repDelta'
    && e.reason === 'choir_relief:runner1_killed');
  assert.equal(rep.length, 1);

  // The congregation sends the next runner — a new durable record, not a resurrection.
  const beat2 = relief().nextArrivalAtS;
  assert.ok(beat2 != null && beat2 >= f.state.simTime + ARRIVAL_MIN_S - 1e-9,
    'the replacement honors the rhythm floor');
  for (let t = f.state.simTime + 1; t <= Math.ceil(beat2) + 200; t++) {
    f.flyJobs(1);
    f.state.simTime = t;
    berth.sync();
  }
  const runner2 = f.spawnedEntities[1];
  assert.ok(runner2, 'runner2 spawned');
  assert.equal(runner2.data.worldRecordId, `choir-relief:${SEED}:runner2`);
  assert.notEqual(runner2.data.worldRecordId, runner1.data.worldRecordId);
  runner2.alive = false;
  berth.killed({ id: runner2.id, killerId: 'p1' });
  rep = f.bus.events.filter((e) => e.type === 'faction:repDelta'
    && e.reason === 'choir_relief:runner2_killed');
  assert.equal(rep.length, 1);
  assert.equal(relief().nextArrivalAtS, null, 'the cast is spent — quiet');
  const quietStart = f.state.simTime;
  for (let t = quietStart + 1; t <= quietStart + 3000; t++) {
    f.state.simTime = t;
    berth.sync();
  }
  assert.equal(runnerSpecs(f).length, 2, 'no third runner after two losses');

  // A save/load normalization round-trip preserves the lost-mask: no charge can recur.
  f.wrecks.choirRelief = normalizeChoirRelief(relief());
  berth.killed({ id: runner1.id, killerId: 'p1' });
  berth.killed({ id: runner2.id, killerId: 'p1' });
  assert.equal(f.bus.events.filter((e) => e.type === 'faction:repDelta'
    && /runner\d_killed/.test(e.reason)).length, 2, 'normalized state cannot re-charge a loss');
});

test('berth events fire once per real transition and consequences stay intents', () => {
  const f = berthFixture();
  const berth = createChoirReliefBerth(f.owner);
  berth.enabled({ subsystemId: 'subsystem_drive', targetId: f.patient.id, repairedBy: 'p1' });
  handOverMercy(f, berth, 8);
  assert.equal(f.wrecks.choirRelief.evacuated, true);
  // A repeated completion payload is not a second handover.
  berth.complete({ jobId: `job:choir-relief:${SEED}:patient` });
  const news = f.bus.events.filter((e) => e.type === 'news:publish');
  assert.equal(news.length, 1, 'the handover news publishes exactly once');
  const gratitude = f.bus.events.filter((e) => e.type === 'faction:repDelta'
    && e.reason === 'choir_relief:mercy_hand_repair');
  assert.equal(gratitude.length, 1, 'gratitude is once per site');
  // The berth emits no economy/credit writes: consequences travel as intents only.
  for (const event of f.bus.events) {
    assert.ok(['toast', 'faction:repDelta', 'news:publish'].includes(event.type),
      `unexpected berth event type ${event.type}`);
  }
});

test('the rhythm is deterministic under a fixed seed', () => {
  const a = playCycle();
  const b = playCycle();
  assert.deepEqual(b.marks, a.marks,
    'same seed replays identical beats, admissions and departures');
});
