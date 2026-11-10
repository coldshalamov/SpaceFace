// SF-078 — a surveyor whose measurements matter.
//
// A surveyor's completed WORK stop is a real measurement: the rocks inside the mark's sweep
// are read (field, position, depletion, age) into a bounded per-sector ledger. When a miner's
// field dies and the shift relocates, ground with a fresh mark outranks unsurveyed ground —
// even ground that is live-THINNER — while stale marks, exhausted fields and empty sweeps
// change nothing. Marks persist across save/load.

import test from 'node:test';
import assert from 'node:assert/strict';

import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

const SECTOR = 'sector_survey';

function rock(id, x, z, fieldId) {
  return { id, type: 'asteroid', alive: true, pos: { x, z }, radius: 12, data: { fieldId } };
}

// Each field gets 4+ rocks so the retarget's four-rock spread pool sits entirely inside one
// field and the field-level assertion is deterministic regardless of the spread hash.
function makeState({ simTime = 100 } = {}) {
  const entities = new Map();
  const asteroids = [];
  const add = (r) => { entities.set(r.id, r); asteroids.push(r); };
  for (let i = 0; i < 4; i++) add(rock(`a${i}`, 900 + i * 60, 40 - i * 40, 'f_measured'));
  // Out of sweep range of every measurement stop — this field stays unsurveyed.
  for (let i = 0; i < 4; i++) add(rock(`b${i}`, 9000 + i * 80, 4000 - i * 60, 'f_unsurveyed'));
  add(rock('old1', -3000, -3000, 'f_old')); // the dead home field — never inside a sweep
  const state = {
    simTime,
    meta: { seed: 7 },
    entities,
    entityList: asteroids,
    world: { currentSectorId: SECTOR },
    npcJobs: { byId: {} },
    fieldDepletion: {
      fields: {
        f_measured: { depletion: 0.08 },
        f_unsurveyed: { depletion: 0.02 },
        f_old: { depletion: 0.12 },
      },
    },
  };
  return { state, asteroids };
}

function sysFor(state) {
  const sys = Object.create(npcJobsRuntime);
  sys.state = state;
  return sys;
}

function surveyorEntry(state, jobId = 'job:survey-1') {
  state.npcJobs.byId[jobId] = {
    job: { id: jobId, kind: NPC_JOB_KIND.SURVEYOR, route: [], payload: null, loopCount: 0 },
    kind: NPC_JOB_KIND.SURVEYOR,
    sectorId: SECTOR,
  };
  return jobId;
}

function fireWork(sys, jobId, pos, waypointId = 'mark0') {
  sys._noteHandoffIntent({
    event: 'npcjobs:work', jobId, kind: NPC_JOB_KIND.SURVEYOR,
    pos, waypointId, completed: true, seq: 1, simTime: sys.state.simTime,
  });
}

function retarget(sys) {
  return sys._selectFreshMinerFieldTarget({
    oldFieldId: 'f_old', oldAsteroidId: 'old1', anchor: { x: 0, z: 0 },
    jobId: 'job:miner-1', sectorId: SECTOR,
  });
}

test('a completed measurement stop marks the fields inside its sweep', () => {
  const { state } = makeState();
  const sys = sysFor(state);
  const jobId = surveyorEntry(state);

  fireWork(sys, jobId, { x: 950, z: 0 }); // mark beside the measured field
  const marks = state.npcJobs.surveyMarks[SECTOR];
  assert.ok(Array.isArray(marks) && marks.length === 1);
  assert.equal(marks[0].fieldId, 'f_measured');
  assert.equal(marks[0].depletion, 0.08, 'the mark reads the field as it stood when measured');
  assert.equal(marks[0].measuredAt, 100);
  assert.equal(marks[0].jobId, jobId);
});

test('a stop in empty space records nothing', () => {
  const { state } = makeState();
  const sys = sysFor(state);
  const jobId = surveyorEntry(state);
  fireWork(sys, jobId, { x: 9000, z: 9000 });
  assert.deepEqual(state.npcJobs.surveyMarks[SECTOR] ?? [], []);
});

test('one mark per field; the latest reading wins', () => {
  const { state } = makeState();
  const sys = sysFor(state);
  const jobId = surveyorEntry(state);
  fireWork(sys, jobId, { x: 950, z: 0 });
  state.fieldDepletion.fields.f_measured.depletion = 0.10;
  state.simTime = 160;
  fireWork(sys, jobId, { x: 1030, z: -50 }, 'mark2');
  const marks = state.npcJobs.surveyMarks[SECTOR];
  assert.equal(marks.filter((m) => m.fieldId === 'f_measured').length, 1);
  assert.equal(marks[0].depletion, 0.10);
  assert.equal(marks[0].measuredAt, 160);
});

test('the ledger is bounded', () => {
  const { state, asteroids } = makeState();
  const sys = sysFor(state);
  const jobId = surveyorEntry(state);
  for (let i = 0; i < 30; i++) {
    const r = rock(`z${i}`, 3000 + i * 30, 800, `f_z${i}`);
    asteroids.push(r); state.entities.set(r.id, r);
    state.fieldDepletion.fields[`f_z${i}`] = { depletion: 0.0 };
    state.simTime = 100 + i;
    fireWork(sys, jobId, { x: r.pos.x, z: r.pos.z }); // one stop per field
  }
  assert.equal(state.npcJobs.surveyMarks[SECTOR].length, 24,
    'the ledger evicts the oldest readings once bound is hit');
  assert.equal(state.npcJobs.surveyMarks[SECTOR][0].fieldId, 'f_z6');
});

test('a fresh mark steers a relocating shift onto measured ground', () => {
  const { state } = makeState();
  const sys = sysFor(state);
  const jobId = surveyorEntry(state);
  fireWork(sys, jobId, { x: 950, z: 0 });

  const target = retarget(sys);
  assert.equal(target.data.fieldId, 'f_measured',
    'surveyed ground beats the live-thinner unsurveyed field');
});

test('no marks → the shift picks by live depletion exactly as before', () => {
  const { state } = makeState();
  const sys = sysFor(state);
  surveyorEntry(state);
  const target = retarget(sys);
  assert.equal(target.data.fieldId, 'f_unsurveyed', 'untouched field keeps winning unsupervised');
});

test('a stale mark no longer steers anything', () => {
  const { state } = makeState({ simTime: 100 });
  const sys = sysFor(state);
  const jobId = surveyorEntry(state);
  fireWork(sys, jobId, { x: 950, z: 0 });   // measured at t=100
  state.simTime = 600;                    // the reading is 500 s old — past the fresh window
  const target = retarget(sys);
  assert.equal(target.data.fieldId, 'f_unsurveyed');
});

test('a field live-exhausted after its mark is refused anyway', () => {
  const { state } = makeState();
  const sys = sysFor(state);
  const jobId = surveyorEntry(state);
  fireWork(sys, jobId, { x: 950, z: 0 });
  state.fieldDepletion.fields.f_measured.depletion = 0.15; // worked out after the sweep
  const target = retarget(sys);
  assert.equal(target.data.fieldId, 'f_unsurveyed',
    'the mark said rich; the field is dead; the honest reading loses');
});

test('marks survive a save/load round-trip; malformed rows are dropped', () => {
  const { state } = makeState();
  const sys = sysFor(state);
  const jobId = surveyorEntry(state);
  fireWork(sys, jobId, { x: 950, z: 0 });
  const saved = sys.serialize();
  assert.ok(saved.surveyMarks && saved.surveyMarks[SECTOR].length === 1);

  const { state: state2 } = makeState();
  const sys2 = sysFor(state2);
  sys2.deserialize(saved);
  assert.equal(state2.npcJobs.surveyMarks[SECTOR][0].fieldId, 'f_measured');
  // ...and the restored mark steers identically.
  assert.equal(sys2._selectFreshMinerFieldTarget({
    oldFieldId: 'f_old', oldAsteroidId: 'old1', anchor: { x: 0, z: 0 },
    jobId: 'job:miner-1', sectorId: SECTOR,
  }).data.fieldId, 'f_measured');

  const sys3 = sysFor(makeState().state);
  sys3.deserialize({ byId: {}, surveyMarks: { [SECTOR]: [null, { fieldId: '' }, { fieldId: 'x', pos: null }, 42] } });
  assert.deepEqual(sys3.state.npcJobs.surveyMarks[SECTOR] ?? [], []);
});
