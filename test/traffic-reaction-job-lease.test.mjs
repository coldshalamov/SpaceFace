// FIX-R2: traffic reactions (road rage, tailgater, rubberneckers) on a job-owned hull must
// lease its steering through helpers.npcJobs — interrupt + claimControl while the reaction
// runs, release + resume when it ends — never write intent alongside the job owner.
// Job-less hulls keep the historical direct write. Exercised through the real runtime door
// (interruptJob/resumeJob/claimControl/releaseControl), not re-shaped fakes.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createJob, NPC_JOB_KIND, NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import {
  requestTrafficReaction,
  releaseTrafficReaction,
  TRAFFIC_REACTION_HOLDER,
} from '../src/systems/trafficReactionLease.js';
import { stepRoadRage, ROAD_RAGE_TUNING } from '../src/systems/roadRage.js';
import { tailgaterOps } from '../src/systems/tailgater.js';
import { rubberneckersOps, RUBBERNECKERS_TUNING } from '../src/systems/rubberneckers.js';

function shipAt(x, z, over = {}) {
  return {
    id: over.id || `ship-${Math.round(x)}-${Math.round(z)}`,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    ...over,
    data: { trafficRole: 'hauler', ...(over.data || {}) },
  };
}

function makeJobsRuntime(state, byId) {
  const jobs = Object.create(npcJobsRuntime);
  jobs.state = state;
  jobs.bus = { emit() {}, on() {} };
  jobs._byId = () => byId;
  return jobs;
}

// The production helpers surface (npcJobsRuntime.init → helpers.npcJobs), bound to the harness.
function npcJobsApi(jobs) {
  return {
    interrupt: (jobId, threat) => jobs.interruptJob(jobId, threat),
    resume: (jobId) => jobs.resumeJob(jobId),
    claimControl: (jobId, opts) => jobs.claimControl(jobId, opts),
    releaseControl: (jobId, claimId) => jobs.releaseControl(jobId, claimId),
    controlClaim: (jobId) => jobs.controlClaim(jobId),
    swerve: (jobId, swerve) => jobs.swerveJob(jobId, swerve),
  };
}

// A traffic-shaped host: the reactions run as ops on `this`, the lease lives on the host,
// helpers.npcJobs is the real runtime's own API.
function makeHost(state, jobs) {
  return {
    state,
    bus: { emit() {}, on() {} },
    helpers: { npcJobs: jobs ? npcJobsApi(jobs) : undefined },
    ...tailgaterOps,
    ...rubberneckersOps,
  };
}

function makeJobHull(state, jobId, pos) {
  const hull = shipAt(pos.x, pos.z, {
    id: `hull-${jobId}`,
    data: { trafficRole: 'hauler', jobId },
  });
  const job = createJob({
    id: jobId,
    kind: NPC_JOB_KIND.HAULER,
    route: [
      { pos: { x: pos.x, z: pos.z } },
      { pos: { x: pos.x + 800, z: pos.z } },
    ],
  });
  const entry = { job, entityId: hull.id, sectorId: 'sector_helios_prime' };
  state.entities.set(hull.id, hull);
  return { hull, job, entry };
}

test('a job-less hull keeps the direct intent write and needs no jobs API', () => {
  const state = { mode: 'flight', simTime: 100, tick: 1, entities: new Map() };
  const host = makeHost(state, null);

  const hull = shipAt(0, 0);
  const ok = requestTrafficReaction(host, hull, {
    moveX: 0, moveZ: 1, boost: true, fire: false, fireGroup: null, aimAngle: 0.5, brake: false,
  }, 3);
  assert.equal(ok, true);
  assert.equal(hull.data.intent.moveZ, 1);
  assert.equal(hull.data.intent.boost, true);
  assert.equal(hull.data.intent.aimAngle, 0.5);
});

test('a job hull is steered through the job owner: interrupt, lease, resume', () => {
  const state = {
    mode: 'flight', simTime: 100, tick: 1,
    playerId: 'player-1', player: { heat: 0 }, entities: new Map(),
  };
  const byId = {};
  const jobs = makeJobsRuntime(state, byId);
  const { hull, job, entry } = makeJobHull(state, 'job-haul-1', { x: 0, z: 0 });
  byId['job-haul-1'] = entry;
  const host = makeHost(state, jobs);

  const phaseBefore = job.phase;
  assert.notEqual(phaseBefore, NPC_JOB_PHASE.FLEE);

  const ok = requestTrafficReaction(host, hull, {
    moveX: 0, moveZ: 1, boost: true, aimAngle: 0.5, brake: false,
  }, 8);
  assert.equal(ok, true);
  // The kernel is parked in FLEE so its progress froze where the reaction found it...
  assert.equal(job.phase, NPC_JOB_PHASE.FLEE);
  // ...the reaction holds the hull through the job owner's control lease...
  assert.equal(entry.control.holder, TRAFFIC_REACTION_HOLDER);
  // ...and that lease is what writes the intent this tick — one writer.
  assert.equal(hull.data.intent.moveZ, 1);
  assert.equal(hull.data.intent.boost, true);

  // Subsequent ticks steer through the same live claim, not a second lease.
  state.simTime += 1;
  assert.equal(requestTrafficReaction(host, hull, { moveZ: 1, aimAngle: 0.9 }, 7), true);
  assert.equal(hull.data.intent.aimAngle, 0.9);
  assert.equal(job.phase, NPC_JOB_PHASE.FLEE);

  // The reaction ends by releasing the lease; the job resumes its exact prior shift.
  releaseTrafficReaction(host, hull);
  assert.equal(entry.control, null);
  assert.equal(job.phase, phaseBefore);
  assert.equal(job.interrupted, false);
});

test('a job hull already claimed by another owner answers nothing', () => {
  const state = { mode: 'flight', simTime: 50, tick: 1, entities: new Map() };
  const byId = {};
  const jobs = makeJobsRuntime(state, byId);
  const { hull, job, entry } = makeJobHull(state, 'job-claimed', { x: 10, z: 10 });
  byId['job-claimed'] = entry;
  const host = makeHost(state, jobs);

  const foreign = jobs.claimControl('job-claimed', { claimId: 'heist:alpha', holder: 'heist' });
  assert.equal(foreign.granted, true);

  const ok = requestTrafficReaction(host, hull, { moveX: 0, moveZ: 1, aimAngle: 1 }, 5);
  assert.equal(ok, false);
  assert.equal(hull.data.intent, undefined, 'no write alongside the live owner');
  assert.notEqual(job.phase, NPC_JOB_PHASE.FLEE, 'the job was not interrupted either');
  assert.equal(entry.control.claimId, 'heist:alpha', 'the foreign claim survives');
});

test('a lease whose reaction went silent hands the hull back at its declared bound', () => {
  const state = {
    mode: 'flight', simTime: 10, tick: 1,
    playerId: 'player-1', player: { heat: 0 }, entities: new Map(),
  };
  const byId = {};
  const jobs = makeJobsRuntime(state, byId);
  const { hull, job, entry } = makeJobHull(state, 'job-silent', { x: 0, z: 0 });
  byId['job-silent'] = entry;
  const host = makeHost(state, jobs);

  assert.equal(requestTrafficReaction(host, hull, { moveZ: 1 }, 2), true);
  assert.ok(entry.control);

  // The reaction's row died without releasing (despawn, respawn, sector churn): the next
  // request on this host past the declared bound sweeps the stale lease and resumes the job.
  state.simTime = 20;
  const ambient = shipAt(100, 100, { id: 'ambient-2' });
  assert.equal(requestTrafficReaction(host, ambient, { moveZ: 1 }, 1), true);
  assert.equal(entry.control, null, 'the stale claim was released, not leaked');
  assert.notEqual(job.phase, NPC_JOB_PHASE.FLEE, 'and the job resumed');
});

test('road rage on a job hull leases the flee and resumes the job when it ends', () => {
  const state = {
    mode: 'flight', simTime: 300, tick: 1,
    playerId: 'player-1', player: { heat: 0 }, entities: new Map(),
  };
  const byId = {};
  const jobs = makeJobsRuntime(state, byId);
  const { hull, job, entry } = makeJobHull(state, 'job-rage', { x: 0, z: 0 });
  byId['job-rage'] = entry;
  const host = makeHost(state, jobs);
  const player = shipAt(60, 0, { id: 'player-1', team: 2 });

  // A hull already shoved twice is mid-rage, fleeing the player.
  const memory = new Map();
  memory.set(hull.id, {
    generation: null, lastShoveAt: state.simTime, shoveCount: 2,
    rageState: 'flee', rageStartedAt: state.simTime - 4, fleeStartedAt: state.simTime,
    lastAt: state.simTime,
  });

  assert.equal(stepRoadRage(hull, state, player, 1 / 60, memory, null, host), true);
  assert.equal(job.phase, NPC_JOB_PHASE.FLEE, 'the job was interrupted through its owner');
  assert.ok(entry.control, 'the rage leases the hull');
  assert.equal(hull.data.intent.moveZ, 1, 'the flee steers through the lease');
  assert.equal(hull.data.intent.boost, true);

  // The flee times out; the reaction ends by releasing the lease and resuming the job.
  state.simTime += ROAD_RAGE_TUNING.fleeDurationS + 1;
  assert.equal(stepRoadRage(hull, state, player, 1 / 60, memory, null, host), false);
  assert.equal(entry.control, null);
  assert.notEqual(job.phase, NPC_JOB_PHASE.FLEE, 'the job resumed after the rage');
  assert.equal(job.interrupted, false);
});

test('tailgater on a job hull leases the pursuit and resumes the job at the end', () => {
  const state = {
    mode: 'flight', simTime: 500, tick: 1,
    playerId: 'player-1', player: { heat: 0 }, entities: new Map(),
  };
  const byId = {};
  const jobs = makeJobsRuntime(state, byId);
  const { hull, job, entry } = makeJobHull(state, 'job-tail', { x: 0, z: 0 });
  byId['job-tail'] = entry;
  const host = makeHost(state, jobs);
  const player = shipAt(60, 0, { id: 'player-1', team: 2 });

  // The hauler was already cut off and is mid-pursuit.
  const row = host._tailgaterMemoryFor(hull, state.simTime);
  row.tailgating = true;
  row.startedAt = state.simTime;
  row.expiresAt = state.simTime + 20;
  row.lastHornAt = state.simTime;

  assert.equal(host._reactTailgater(hull, { role: 'hauler' }, [], state, player), true);
  assert.equal(job.phase, NPC_JOB_PHASE.FLEE);
  assert.ok(entry.control);
  assert.equal(hull.data.intent.moveZ, 1, 'the pursuit steers through the lease');

  // The pursuit times out; the hauler goes back to its route.
  state.simTime = row.expiresAt + 0.1;
  assert.equal(host._reactTailgater(hull, { role: 'hauler' }, [], state, player), false);
  assert.equal(entry.control, null);
  assert.notEqual(job.phase, NPC_JOB_PHASE.FLEE);
});

test('rubberneckers on a job hull leases the look and resumes the job at the end', () => {
  const state = {
    mode: 'flight', simTime: 700, tick: 1,
    playerId: 'player-1', player: { heat: 0 }, entities: new Map(),
  };
  const byId = {};
  const jobs = makeJobsRuntime(state, byId);
  const { hull, job, entry } = makeJobHull(state, 'job-look', { x: 0, z: 0 });
  byId['job-look'] = entry;
  const host = makeHost(state, jobs);
  // Far enough away that the look is not shooed.
  const player = shipAt(300, 0, { id: 'player-1', team: 2 });

  const memory = host._getRubberneckersMemory();
  memory.set(hull.id, {
    entityId: hull.id,
    generation: null,
    status: 'looking',
    targetWreckPos: { x: 120, z: 0 },
    wreckId: 'wreck-1',
    startedAt: state.simTime,
    until: state.simTime + RUBBERNECKERS_TUNING.lookDurationS,
  });

  assert.equal(host._reactRubberneckers(hull, { role: 'hauler' }, [], state, player), true);
  assert.equal(job.phase, NPC_JOB_PHASE.FLEE);
  assert.ok(entry.control);
  assert.equal(hull.data.intent.throttle, RUBBERNECKERS_TUNING.slowThrottle,
    'the gawking crawl is leased, not overwritten');

  state.simTime += RUBBERNECKERS_TUNING.lookDurationS + 1;
  assert.equal(host._reactRubberneckers(hull, { role: 'hauler' }, [], state, player), false);
  assert.equal(entry.control, null);
  assert.notEqual(job.phase, NPC_JOB_PHASE.FLEE);
});
