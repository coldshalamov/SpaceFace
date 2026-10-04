// SF-081 — a worker that responds to a close call.
//
// A fast hull crossing a working bench braces the crew: the job clock pauses for a beat,
// one restrained line per worker per cooldown, and nothing else — no heat, no flee, no
// violence counters. A distant or gentle pass triggers nothing; an actual hit still runs
// through the damage/protest seam (world-reacts-civilians pins that side).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_PHASE, NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
const ROUTE = [
  { id: 'home:st_a', pos: { x: 0, z: 0 }, label: 'Refinery' },
  { id: 'field:a', pos: { x: 600, z: 0 }, label: 'Belt' },
];
function minerSpec(o = {}) {
  return { kind: NPC_JOB_KIND.MINER, route: ROUTE, sectorId: 'sector_a',
    speed: 100, commissionS: 0.5, departS: 0.5, approachS: 0.5, workS: 8, loadS: 0.5, unloadS: 0.5, dwellS: 0.5, ...o };
}

function boot() {
  const sim = createSimulation({ seed: 7, systems: [npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = 'sector_a';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: -5000, z: -5000 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8 });
  player.data = player.data || {};
  player.data.worldRecordId = 'wr_player';
  sim.state.playerId = player.id;
  sim.state.player = { heat: 0 }; // a clean pilot — wanted players live on the threat seam
  return { sim, player };
}
function workerAtBench(sim, wrId = 'rec-miner') {
  const e = sim.spawn({ type: 'ship', team: 2, pos: { x: 600, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  e.data = e.data || {};
  e.data.worldRecordId = wrId;
  e.data.sectorId = 'sector_a';
  const jobId = sim.helpers.npcJobs.assign(e, minerSpec());
  const jobs = sim.registry.get('npcJobsRuntime');
  const job = jobs._byId()[jobId].job;
  job.phase = NPC_JOB_PHASE.WORK;
  job.routeIndex = 1;
  job.progress = 0.3;
  return { e, jobId };
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }

function buzzPlayer(player, x, z, vx, vz) {
  player.pos.x = x; player.pos.z = z;
  player.vel.x = vx; player.vel.z = vz;
}

test('a fast crossing braces the bench: clock pauses, one line, no crime counters', () => {
  const { sim, player } = boot();
  const { e, jobId } = workerAtBench(sim);
  const jobs = sim.registry.get('npcJobsRuntime');
  const entry = jobs._byId()[jobId];
  const toasts = [];
  sim.bus.on('toast', (p) => toasts.push(p.text || ''));

  buzzPlayer(player, 520, 40, 300, 0); // 84 wu out, 300 wu/s closing — a buzz
  sim.step(DT);
  assert.equal(entry.closeCallUntil > sim.state.simTime, true, 'the crew braces');
  assert.equal(toasts.length, 1, 'exactly one restrained line');
  assert.ok(toasts[0].includes('Miner:'), 'the line is attributed to the worker');
  assert.equal(entry.playerHits ?? 0, 0, 'a buzz never touches the violence counters');
  assert.equal(entry.threatId ?? null, null, 'a buzz is not a threat');

  const prog = entry.job.progress;
  steps(sim, 20);
  assert.equal(entry.job.progress, prog, 'the work clock holds while the crew braces');
  assert.ok(sim.state.simTime < entry.closeCallUntil, 'still inside the braced beat');

  // fly away — the brace lapses and the work resumes
  buzzPlayer(player, -5000, -5000, 0, 0);
  sim.state.simTime = entry.closeCallUntil + 0.1;
  steps(sim, 10);
  assert.ok(entry.job.progress > prog || entry.job.phase !== NPC_JOB_PHASE.WORK,
    'the work clock resumes after the brace');
});

test('a distant fast pass triggers nothing', () => {
  const { sim, player } = boot();
  const { jobId } = workerAtBench(sim);
  const jobs = sim.registry.get('npcJobsRuntime');
  const toasts = [];
  sim.bus.on('toast', (p) => toasts.push(p.text || ''));

  buzzPlayer(player, 600, 400, 300, 0); // fast but 400 wu off the bench
  steps(sim, 10);
  assert.equal(jobs._byId()[jobId].closeCallUntil ?? 0, 0);
  assert.equal(toasts.length, 0, 'no voice for a safe pass');
});

test('a slow drift inside the radius is not a buzz', () => {
  const { sim, player } = boot();
  const { jobId } = workerAtBench(sim);
  const jobs = sim.registry.get('npcJobsRuntime');
  const toasts = [];
  sim.bus.on('toast', (p) => toasts.push(p.text || ''));

  buzzPlayer(player, 520, 30, 5, 0); // close but gentle — a careful pass
  steps(sim, 10);
  assert.equal(jobs._byId()[jobId].closeCallUntil ?? 0, 0);
  assert.equal(toasts.length, 0);
});

test('repeated buzzing cannot spam the voice', () => {
  const { sim, player } = boot();
  const { jobId } = workerAtBench(sim);
  const jobs = sim.registry.get('npcJobsRuntime');
  const entry = jobs._byId()[jobId];
  const toasts = [];
  sim.bus.on('toast', (p) => toasts.push(p.text || ''));

  for (let i = 0; i < 6; i++) {
    buzzPlayer(player, 520 + i * 5, 40, 300, 0);
    sim.state.simTime += 4; // inside the 30 s cooldown each pass
    sim.step(DT);
  }
  assert.equal(toasts.length, 1, 'one line per cooldown — the fifth buzz is silent');
  assert.equal(entry.closeCallUntil > sim.state.simTime - 4, false,
    'the brace itself also throttles — a buzzing player cannot stall the bench forever');
});
