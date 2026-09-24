// INF-073 — a rescued worker returns to work. A miner that flees a threat resumes its exact
// phase, loop, and progress when the threat dies — the same hull flies back, no duplicate
// spawns, no freight transfer restarts — and the rescue gets one contextual acknowledgment
// (bus event plus a short toast), cooled down per job so threat flicker never spams.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_KIND, NPC_JOB_PHASE } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
const ROUTE = [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 600, z: 0 } }];
const SHORT = { speed: 100, commissionS: 1, departS: 1, approachS: 1, workS: 30, loadS: 1, unloadS: 1, dwellS: 1 };

function boot() {
  const sim = createSimulation({ seed: 73, systems: [npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = 'sector_a';
  return sim;
}
function hull(sim, worldRecordId, pos = { x: 0, z: 0 }, team = 2) {
  const e = sim.spawn({ type: 'ship', team, pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  e.data = e.data || {};
  e.data.worldRecordId = worldRecordId;
  e.data.sectorId = 'sector_a';
  return e;
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }
function stepSeconds(sim, s) { steps(sim, Math.round(s / DT)); }
function jobsOf(sim) { return sim.registry.get('npcJobsRuntime'); }
function hullsWithRecord(sim, recordId) {
  const out = [];
  for (const e of sim.state.entities.values()) {
    if (e && e.data && e.data.worldRecordId === recordId) out.push(e);
  }
  return out;
}

test('a miner flees, then resumes its exact work with one acknowledgment', () => {
  const sim = boot();
  const seen = { resumed: [], toasts: [], posted: [] };
  sim.bus.on('npcjobs:resumed', (p) => seen.resumed.push(p));
  sim.bus.on('toast', (p) => { if (p && /back to work/.test(p.text)) seen.toasts.push(p); });
  sim.bus.on('npcjobs:lotPosted', (p) => seen.posted.push(p));

  const jobId = sim.helpers.npcJobs.assign(hull(sim, 'rec-miner-73'), { kind: NPC_JOB_KIND.MINER, route: ROUTE, sectorId: 'sector_a', ...SHORT });
  stepSeconds(sim, 10);
  const jobs = jobsOf(sim);
  assert.equal(jobs._byId()[jobId].job.phase, NPC_JOB_PHASE.WORK, 'the miner reaches its work');
  const loopBefore = jobs._byId()[jobId].job.loopCount;
  const progressBefore = jobs._byId()[jobId].job.progress;
  const posBefore = { ...sim.state.entities.get(jobs._byId()[jobId].entityId).pos };

  // Threat arrives; the miner flees.
  const hostile = hull(sim, 'rec-pirate-73', { x: 620, z: 20 }, 1);
  jobs.interruptJob(jobId, { entityId: hostile.id });
  stepSeconds(sim, 1);
  assert.equal(jobs._byId()[jobId].job.phase, NPC_JOB_PHASE.FLEE, 'the miner flees the threat');

  // The threat dies (rescue); the worker returns to its exact job.
  sim.bus.emit('entity:destroyed', { id: hostile.id });
  sim.state.entities.delete(hostile.id);
  stepSeconds(sim, 8);
  const after = jobs._byId()[jobId];
  assert.equal(after.job.phase, NPC_JOB_PHASE.WORK, 'the miner resumes work, not a reset');
  assert.equal(after.job.loopCount, loopBefore, 'the same loop continues');
  assert.ok(after.job.progress >= progressBefore, 'progress is kept, never rewound');
  assert.equal(seen.resumed.length, 1, 'one resume event');
  assert.equal(seen.resumed[0].jobId, jobId, 'the event names the rescued job');
  assert.equal(seen.resumed[0].phase, NPC_JOB_PHASE.WORK, 'the event names the resumed phase');
  assert.equal(seen.toasts.length, 1, 'one contextual acknowledgment');
  assert.match(seen.toasts[0].text, /Miner back to work/, 'the acknowledgment names the worker');

  // Physical continuity: the same hull, no teleport, no duplicate, no fresh transfer.
  const hulls = hullsWithRecord(sim, 'rec-miner-73');
  assert.equal(hulls.length, 1, 'no decorative duplicate hull');
  const moved = Math.hypot(hulls[0].pos.x - posBefore.x, hulls[0].pos.z - posBefore.z);
  assert.ok(moved < 2500, `the hull flies back instead of teleporting (moved ${Math.round(moved)}u)`);
  assert.equal(seen.posted.length, 0, 'no freight transfer restarts mid-loop');
});

test('threat flicker cools the acknowledgment down', () => {
  const sim = boot();
  const seen = { resumed: [], toasts: [] };
  sim.bus.on('npcjobs:resumed', (p) => seen.resumed.push(p));
  sim.bus.on('toast', (p) => { if (p && /back to work/.test(p.text)) seen.toasts.push(p); });
  const jobId = sim.helpers.npcJobs.assign(hull(sim, 'rec-miner-73b'), { kind: NPC_JOB_KIND.MINER, route: ROUTE, sectorId: 'sector_a', ...SHORT });
  stepSeconds(sim, 10);
  const jobs = jobsOf(sim);
  const hostile = hull(sim, 'rec-pirate-73b', { x: 620, z: 20 }, 1);
  jobs.interruptJob(jobId, { entityId: hostile.id });
  jobs.resumeJob(jobId);
  jobs.interruptJob(jobId, { entityId: hostile.id });
  jobs.resumeJob(jobId);
  assert.equal(seen.resumed.length, 2, 'both returns are on the record');
  assert.equal(seen.toasts.length, 1, 'the pilot hears it once per minute per job');
});
