/**
 * CLOUD-03 — ordinary npcJobs workers get a truthful work readout on lock and Hail.
 * Drives livingWorkStatusText (panel/lock) and workerStatusText (Hail STATUS) — the shipped
 * consumers — over real npcJobs kernel records joined the way npcJobsRuntime joins them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { livingWorkStatusText, createContactHailResponse } from '../src/data/contactHail.js';
import { createJob, interrupt } from '../src/systems/npcJobs.js';

function worker(id, overrides = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 100, z: 0 },
    vel: { x: 0, z: 0 },
    ...overrides,
    data: { ...(overrides.data || {}) },
  };
}

function stateWith(jobs, entities = []) {
  const byId = {};
  for (const [jobId, entry] of Object.entries(jobs)) byId[jobId] = entry;
  return {
    playerId: 'player',
    world: { currentSectorId: 'sector_helios' },
    npcJobs: { byId },
    entities: new Map(entities.map((e) => [e.id, e])),
  };
}

function jobEntry(job, entity, extra = {}) {
  return { job, entityId: entity.id, worldRecordId: entity.data.worldRecordId, ...extra };
}

function jobFor(kind, route, phase = null, extra = {}) {
  const job = createJob({ id: `job:${kind}`, kind, route }, 4242);
  if (phase) job.phase = phase;
  Object.assign(job, extra);
  return job;
}

const MINER_ROUTE = [
  { id: 'home:st_helios_depot', pos: { x: 0, z: 0 }, label: 'Refinery' },
  { id: 'field:rock9', pos: { x: 900, z: 0 }, label: 'Belt' },
];
const HAULER_ROUTE = [
  { id: 'origin:station_ceres', pos: { x: 0, z: 0 }, label: 'Origin' },
  { id: 'dest:station_ceres', targetRef: 'station:station_ceres', pos: { x: 800, z: 0 }, label: 'Ceres Berth' },
];
const PATROL_ROUTE = [
  { id: 'beat0', pos: { x: 0, z: 0 }, label: 'Beat 1' },
  { id: 'beat1', pos: { x: 100, z: 0 }, label: 'Beat 2' },
  { id: 'beat2', pos: { x: 0, z: 100 }, label: 'Beat 3' },
];

test('CLOUD-03: a mining worker at the face reads its trade and place', () => {
  const miner = worker('npc-m1', { data: { trafficRole: 'miner', jobId: 'job:miner', jobPhase: 'work', worldRecordId: 'wr_m1' } });
  const job = jobFor('miner', MINER_ROUTE, 'work', { routeIndex: 1, materialized: true });
  const state = stateWith({ 'job:miner': jobEntry(job, miner) }, [miner]);
  assert.equal(livingWorkStatusText(miner, { depth: 'lock', state }), 'WORK · MINING');
  assert.equal(livingWorkStatusText(miner, { depth: 'full', state }), 'WORK · MINING · AT BELT');
});

test('CLOUD-03: a hauler in transit names its buyer and its load', () => {
  const hauler = worker('npc-h1', {
    data: {
      trafficRole: 'hauler', jobId: 'job:hauler', jobPhase: 'transit', worldRecordId: 'wr_h1',
      cargoManifest: { lines: [{ commodityId: 'cmdty_ore_iron', qty: 40 }], totalQty: 40 },
    },
  });
  const job = jobFor('hauler', HAULER_ROUTE, 'transit', { routeIndex: 0, materialized: true });
  const state = stateWith({ 'job:hauler': jobEntry(job, hauler) }, [hauler]);
  const lock = livingWorkStatusText(hauler, { depth: 'lock', state });
  const full = livingWorkStatusText(hauler, { depth: 'full', state });
  assert.equal(lock, 'WORK · EN ROUTE');
  assert.match(full, /^WORK · EN ROUTE · FOR /);
  assert.match(full, /CARRYING 40U IRON ORE/);
  assert.doesNotMatch(full, /DELIVERED/);
});

test('CLOUD-03: a patrol on dwell reads on station at its beat', () => {
  const patrol = worker('npc-p1', { data: { trafficRole: 'patrol', jobId: 'job:patrol', jobPhase: 'hold', worldRecordId: 'wr_p1' } });
  const job = jobFor('patrol', PATROL_ROUTE, 'hold', { routeIndex: 1, materialized: true });
  const state = stateWith({ 'job:patrol': jobEntry(job, patrol) }, [patrol]);
  assert.equal(livingWorkStatusText(patrol, { depth: 'lock', state }), 'WORK · ON STATION');
  assert.equal(livingWorkStatusText(patrol, { depth: 'full', state }), 'WORK · ON STATION · AT BEAT 2');
});

test('CLOUD-03: an interrupted worker says what it was doing and that it resumes', () => {
  const miner = worker('npc-m2', { data: { trafficRole: 'miner', jobId: 'job:miner', jobPhase: 'flee', worldRecordId: 'wr_m2' } });
  const job = jobFor('miner', MINER_ROUTE, 'work', { routeIndex: 1, materialized: true });
  interrupt(job, { id: 'raider-9' });
  const state = stateWith({ 'job:miner': jobEntry(job, miner) }, [miner]);
  assert.equal(livingWorkStatusText(miner, { depth: 'lock', state }), 'WORK · INTERRUPTED');
  assert.equal(livingWorkStatusText(miner, { depth: 'full', state }),
    'WORK · INTERRUPTED · WAS MINING · RESUMES WHEN CLEAR');
});

test('CLOUD-03: a completed run says so — and a planned run never claims delivered', () => {
  const done = worker('npc-h2', { data: { trafficRole: 'hauler', jobId: 'job:hauler', jobPhase: 'complete', worldRecordId: 'wr_h2' } });
  const jobDone = jobFor('hauler', HAULER_ROUTE, 'complete', { routeIndex: 1, materialized: true });
  const state = stateWith({ 'job:hauler': jobEntry(jobDone, done) }, [done]);
  assert.match(livingWorkStatusText(done, { depth: 'full', state }), /RUN COMPLETE/);

  const pending = worker('npc-h3', { data: { trafficRole: 'hauler', jobId: 'job:hauler2', jobPhase: 'approach', worldRecordId: 'wr_h3' } });
  const jobPending = jobFor('hauler', HAULER_ROUTE, 'approach', { routeIndex: 1, materialized: true });
  const state2 = stateWith({ 'job:hauler2': jobEntry(jobPending, pending) }, [pending]);
  const text = livingWorkStatusText(pending, { depth: 'full', state: state2 });
  assert.match(text, /ON APPROACH/);
  assert.doesNotMatch(text, /DELIVERED/);
});

test('CLOUD-03: stale, corrupt, controlled, and unmaterialized bindings all read unavailable', () => {
  const miner = worker('npc-x', { data: { trafficRole: 'miner', jobId: 'job:gone', jobPhase: 'work', worldRecordId: 'wr_x' } });
  // missing job record entirely
  assert.equal(livingWorkStatusText(miner, { depth: 'full', state: stateWith({}) }), 'STATUS UNAVAILABLE');
  // corrupt job
  const corrupt = { job: { corrupt: true, id: 'job:gone' }, entityId: miner.id, worldRecordId: 'wr_x' };
  assert.equal(livingWorkStatusText(miner, { depth: 'full', state: stateWith({ 'job:gone': corrupt }) }), 'STATUS UNAVAILABLE');
  // recycled entity id — the job's live body is someone else
  const alien = jobEntry(jobFor('miner', MINER_ROUTE, 'work', { materialized: true }), worker('npc-other'), { worldRecordId: 'wr_x' });
  assert.equal(livingWorkStatusText(miner, { depth: 'full', state: stateWith({ 'job:gone': alien }) }), 'STATUS UNAVAILABLE');
  // Continue remap: worldRecordId mismatch
  const remapped = jobEntry(jobFor('miner', MINER_ROUTE, 'work', { materialized: true }), miner, { worldRecordId: 'wr_other' });
  assert.equal(livingWorkStatusText(miner, { depth: 'full', state: stateWith({ 'job:gone': remapped }) }), 'STATUS UNAVAILABLE');
  // external control (tow assist) — the job record is not the live authority
  const controlled = jobEntry(jobFor('miner', MINER_ROUTE, 'work', { materialized: true }), miner, { control: { kind: 'tow' } });
  assert.equal(livingWorkStatusText(miner, { depth: 'full', state: stateWith({ 'job:gone': controlled }) }), 'STATUS UNAVAILABLE');
  // virtualized job claiming a live hull — entityId cleared means no live body
  const virtual = { job: jobFor('miner', MINER_ROUTE, 'work', { materialized: false }), entityId: null, worldRecordId: 'wr_x' };
  assert.equal(livingWorkStatusText(miner, { depth: 'full', state: stateWith({ 'job:gone': virtual }) }), 'STATUS UNAVAILABLE');
});

test('CLOUD-03: ordinary transits never borrow the Ceres causal vocabulary', () => {
  // The defect this task removes: a plain jobPhase 'transit' used to resolve through
  // CAUSAL_PHASE_LABEL and read UNDER ESCORT.
  const salvor = worker('npc-s1', { data: { trafficRole: 'salvor', jobId: 'job:salvor', jobPhase: 'transit', worldRecordId: 'wr_s1' } });
  const job = jobFor('salvor', MINER_ROUTE, 'transit', { routeIndex: 0, materialized: true });
  const state = stateWith({ 'job:salvor': jobEntry(job, salvor) }, [salvor]);
  const text = livingWorkStatusText(salvor, { depth: 'full', state });
  assert.equal(text, 'WORK · EN ROUTE · FOR BELT');
  assert.doesNotMatch(text, /UNDER ESCORT/);
});

test('CLOUD-03: no job and no mirror means no line; a bare mirror speaks only generically', () => {
  const plain = worker('npc-plain', { data: { trafficRole: 'trader' } });
  assert.equal(livingWorkStatusText(plain, { depth: 'full', state: stateWith({}) }), null);
  // jobPhase without a jobId (runtime mirror residue) reads in its own vocabulary, not causal labels.
  const residual = worker('npc-res', { data: { trafficRole: 'miner', jobPhase: 'transit' } });
  assert.equal(livingWorkStatusText(residual, { depth: 'full', state: stateWith({}) }), 'WORK · EN ROUTE');
});

test('CLOUD-03: Hail STATUS carries the same truth with the STATUS voice', () => {
  const hauler = worker('npc-h9', {
    data: {
      trafficRole: 'hauler', jobId: 'job:hauler9', jobPhase: 'transit', worldRecordId: 'wr_h9',
      cargoManifest: { lines: [{ commodityId: 'cmdty_ore_iron', qty: 12 }], totalQty: 12 },
    },
  });
  const job = jobFor('hauler', HAULER_ROUTE, 'transit', { routeIndex: 0, materialized: true });
  const state = stateWith({ 'job:hauler9': jobEntry(job, hauler) }, [hauler]);
  const hail = createContactHailResponse(state, { kind: 'worker', targetId: hauler.id }, 'status');
  assert.match(hail.lines[0], /^STATUS · EN ROUTE · FOR /);
  assert.match(hail.lines[0], /CARRYING 12U/);

  const stale = worker('npc-h10', { data: { trafficRole: 'hauler', jobId: 'job:nope', jobPhase: 'transit', worldRecordId: 'wr_h10' } });
  const state2 = stateWith({}, [stale]);
  const hail2 = createContactHailResponse(state2, { kind: 'worker', targetId: stale.id }, 'status');
  assert.equal(hail2.lines[0], 'STATUS UNAVAILABLE');
});

test('CLOUD-03: the readout is read-only — job, entity, and state are never mutated', () => {
  const miner = worker('npc-m9', { data: { trafficRole: 'miner', jobId: 'job:miner', jobPhase: 'work', worldRecordId: 'wr_m9' } });
  const job = jobFor('miner', MINER_ROUTE, 'work', { routeIndex: 1, materialized: true });
  const state = stateWith({ 'job:miner': jobEntry(job, miner) }, [miner]);
  const snap = JSON.stringify({ job, data: miner.data, npcJobs: state.npcJobs });
  livingWorkStatusText(miner, { depth: 'full', state });
  createContactHailResponse(state, { kind: 'worker', targetId: miner.id }, 'status');
  assert.equal(JSON.stringify({ job, data: miner.data, npcJobs: state.npcJobs }), snap);
});
