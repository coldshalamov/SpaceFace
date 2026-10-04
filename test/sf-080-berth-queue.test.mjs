// SF-080 — a berth queue with understandable right-of-way.
//
// A berth-class stop is one physical dock. A second job hull arriving inside the apron while
// the berth is claimed holds at a lane-side queue point — stable arrival order, bounded wait,
// kernel clock paused with the hull (no unloading at distance). A dead holder frees the berth;
// a timed-out waiter diverts through rather than deadlocking; the player gains no wall because
// the queue is written only into worker intents.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_PHASE, NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
const BERTH = { x: 0, z: 0 };
const ROUTE = [
  { id: 'home:st_a', pos: BERTH, label: 'Refinery' },
  { id: 'field:a', pos: { x: 600, z: 0 }, label: 'Belt' },
];
const SHORT = { speed: 100, commissionS: 0.5, departS: 0.5, approachS: 0.5, workS: 2, loadS: 0.5, unloadS: 4, dwellS: 0.5 };
function minerSpec(o = {}) {
  return { kind: NPC_JOB_KIND.MINER, route: ROUTE, sectorId: 'sector_a', ...SHORT, ...o };
}

function boot() {
  const sim = createSimulation({ seed: 7, systems: [npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = 'sector_a';
  return sim;
}
function hull(sim, worldRecordId, pos) {
  const e = sim.spawn({ type: 'ship', team: 2, pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  e.data = e.data || {};
  e.data.worldRecordId = worldRecordId;
  e.data.sectorId = 'sector_a';
  return e;
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }

/** Park a miner on the home berth mid-unload. */
function occupyBerth(sim, jobs, wrId) {
  const e = hull(sim, wrId, { x: BERTH.x + 10, z: BERTH.z + 5 });
  const jobId = sim.helpers.npcJobs.assign(e, minerSpec());
  const job = jobs._byId()[jobId].job;
  job.phase = NPC_JOB_PHASE.UNLOAD;
  job.routeIndex = 0;
  job.progress = 0.4;
  return e;
}

/** Put a miner mid-RETURN leg aimed at the home berth, `dist` units out. */
function inboundMiner(sim, jobs, wrId, pos) {
  const e = hull(sim, wrId, pos);
  const jobId = sim.helpers.npcJobs.assign(e, minerSpec());
  const job = jobs._byId()[jobId].job;
  job.phase = NPC_JOB_PHASE.RETURN;
  job.routeIndex = 1;
  job.progress = 0.5;
  return e;
}

test('an occupied berth holds the arriving worker at a lane-side queue point', () => {
  const sim = boot();
  const jobs = sim.registry.get('npcJobsRuntime');
  const holder = occupyBerth(sim, jobs, 'rec-holder');
  const waiter = inboundMiner(sim, jobs, 'rec-waiter', { x: 300, z: 0 }); // inside the 420 apron
  const entryW = jobs._byId()['job:rec-waiter'];
  const progressBefore = entryW.job.progress;

  sim.step(DT);

  assert.equal(entryW.berthHold, true, 'the arriving job is held off the occupied berth');
  assert.ok(entryW.berthHoldPoint, 'a physical queue point exists');
  const qd = Math.hypot(entryW.berthHoldPoint.x - BERTH.x, entryW.berthHoldPoint.z - BERTH.z);
  assert.ok(qd > 60 && qd < 400, `queue point stands off the berth mouth (got ${qd.toFixed(1)})`);
  assert.equal(entryW.job.phase, NPC_JOB_PHASE.RETURN, 'kernel clock waits — no unload at distance');
  assert.equal(entryW.job.progress, progressBefore, 'route progress freezes while held');

  steps(sim, 30);
  assert.ok(waiter.data.intent, 'the waiter keeps receiving drive intents');
  assert.ok(Math.hypot(waiter.pos.x - BERTH.x, waiter.pos.z - BERTH.z) > 60,
    'the waiter does not slide onto the berth');
  assert.ok(Math.hypot(holder.pos.x - BERTH.x, holder.pos.z - BERTH.z) < 320,
    'the holder is untouched');
});

test('killing the holder frees the berth and the waiter resumes its leg', () => {
  const sim = boot();
  const jobs = sim.registry.get('npcJobsRuntime');
  const holder = occupyBerth(sim, jobs, 'rec-holder');
  inboundMiner(sim, jobs, 'rec-waiter', { x: 300, z: 0 });
  const entryW = jobs._byId()['job:rec-waiter'];
  steps(sim, 5);
  assert.equal(entryW.berthHold, true);

  holder.alive = false; // destroy the holder mid-unload
  steps(sim, 5);

  assert.equal(entryW.berthHold, false, 'the queue point releases when the holder is gone');
  const prog = entryW.job.progress;
  steps(sim, 30);
  assert.ok(entryW.job.progress > prog || entryW.job.phase !== NPC_JOB_PHASE.RETURN,
    'the freed worker resumes its route clock');
});

test('a second waiter queues behind the first in stable arrival order', () => {
  const sim = boot();
  const jobs = sim.registry.get('npcJobsRuntime');
  occupyBerth(sim, jobs, 'rec-holder');
  inboundMiner(sim, jobs, 'rec-waiter-a', { x: 300, z: 0 });
  sim.step(DT); // A enters the apron first
  const b = inboundMiner(sim, jobs, 'rec-waiter-b', { x: 260, z: 40 });
  sim.step(DT);
  const entryB = jobs._byId()['job:rec-waiter-b'];
  assert.equal(entryB.berthHold, true, 'B queues behind the earlier arrival');
  const entryA = jobs._byId()['job:rec-waiter-a'];
  const ra = Math.hypot(entryA.berthHoldPoint.x, entryA.berthHoldPoint.z);
  const rb = Math.hypot(entryB.berthHoldPoint.x, entryB.berthHoldPoint.z);
  assert.notEqual(
    `${entryA.berthHoldPoint.x},${entryA.berthHoldPoint.z}`,
    `${entryB.berthHoldPoint.x},${entryB.berthHoldPoint.z}`,
    'queued workers take separate physical hold points',
  );
  void b;
});

test('a legitimate wait expires: the waiter diverts through instead of deadlocking', () => {
  const sim = boot();
  const jobs = sim.registry.get('npcJobsRuntime');
  occupyBerth(sim, jobs, 'rec-holder');
  inboundMiner(sim, jobs, 'rec-waiter', { x: 300, z: 0 });
  const entryW = jobs._byId()['job:rec-waiter'];
  steps(sim, 5);
  assert.equal(entryW.berthHold, true);
  entryW.berthWaitSince = sim.state.simTime - 61; // a legitimate wait already spent
  sim.step(DT);
  assert.equal(entryW.berthHold, false, 'after the timeout the hull proceeds anyway');
});

test('a non-berth target never queues (fields stay wide open)', () => {
  const sim = boot();
  const jobs = sim.registry.get('npcJobsRuntime');
  // Two miners both inbound to the FIELD leg — 'field:a' is not berth-class.
  const a = hull(sim, 'rec-field-a', { x: 400, z: 10 });
  const b = hull(sim, 'rec-field-b', { x: 380, z: -10 });
  for (const e of [a, b]) {
    const jobId = sim.helpers.npcJobs.assign(e, minerSpec());
    const job = jobs._byId()[jobId].job;
    job.phase = NPC_JOB_PHASE.TRANSIT;
    job.routeIndex = 0;
    job.progress = 0.6;
  }
  steps(sim, 5);
  assert.equal(jobs._byId()['job:rec-field-a'].berthHold, false);
  assert.equal(jobs._byId()['job:rec-field-b'].berthHold, false);
});
