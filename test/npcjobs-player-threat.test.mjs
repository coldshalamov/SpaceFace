// Workers see the player as a threat when shot (INF-U6, WF-01).
// The proximity query only fears team-1 and the wanted, so clean-player damage
// interrupts through the combat:damage seam: protest, flee, escalate, scatter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_KIND, NPC_JOB_PHASE } from '../src/systems/npcJobs.js';

function scene() {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [npcJobsRuntime] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8, mass: 10,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  const runtime = sim.registry.get('npcJobsRuntime');
  const toasts = [];
  const threatened = [];
  bus.on('toast', (p) => toasts.push(p));
  bus.on('npcjobs:threatened', (p) => threatened.push(p));
  return { sim, state, bus, player, runtime, toasts, threatened };
}

function worker(ctx, recordId, x, z, kind = NPC_JOB_KIND.MINER) {
  const e = ctx.sim.spawn({
    type: 'ship', team: 0, pos: { x, z }, radius: 8, mass: 10,
    hull: 100, hullMax: 100, collides: true, data: { worldRecordId: recordId },
  });
  const jobId = ctx.runtime.assign(e, {
    kind,
    sectorId: 'sector_helios_prime',
    route: [
      { id: 'home', pos: { x: x + 500, z }, label: 'Home' },
      { id: 'face', pos: { x, z }, label: 'Face' },
    ],
  });
  assert.ok(jobId, 'worker takes the job');
  return { e, jobId };
}

function shoot(ctx, target, attackerId) {
  ctx.bus.emit('combat:damage', {
    targetId: target.id,
    attackerId: attackerId != null ? attackerId : ctx.player.id,
    amount: 5, rawTotal: 5, applied: 5,
  });
}

test('a worker shot by the clean player protests and flees', () => {
  const ctx = scene();
  const { e, jobId } = worker(ctx, 'u6-miner-1', 300, 0);
  shoot(ctx, e);
  const entry = ctx.state.npcJobs.byId[jobId];
  assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE, 'the shot worker suspends');
  assert.equal(entry.threatId, ctx.player.id, 'the player is the recorded threat');
  assert.ok(ctx.toasts.some((t) => /working here/.test(t.text)), 'the worker protests');
  assert.equal(ctx.threatened.length, 1, 'one npcjobs:threatened receipt');
  assert.equal(ctx.threatened[0].jobId, jobId);
});

test('a third hit inside the window escalates and scatters the site', () => {
  const ctx = scene();
  const victim = worker(ctx, 'u6-miner-2', 300, 0);
  const mate = worker(ctx, 'u6-miner-3', 500, 0);
  const far = worker(ctx, 'u6-miner-4', 5000, 0);
  shoot(ctx, victim.e);
  shoot(ctx, victim.e);
  assert.equal(ctx.state.npcJobs.byId[mate.jobId].job.phase !== NPC_JOB_PHASE.FLEE, true,
    'the site holds through two hits');
  shoot(ctx, victim.e);
  assert.equal(ctx.state.npcJobs.byId[mate.jobId].job.phase, NPC_JOB_PHASE.FLEE,
    'the nearby mate suspends on the escalation');
  assert.equal(ctx.state.npcJobs.byId[far.jobId].job.phase !== NPC_JOB_PHASE.FLEE, true,
    'the distant crew keeps working');
  assert.ok(ctx.toasts.some((t) => /call it in/.test(t.text)), 'the protest escalates');
});

test('a worker shot by your wingman blames the wingman', () => {
  const ctx = scene();
  const { e } = worker(ctx, 'u6-miner-5', 300, 0);
  const wing = ctx.sim.spawn({
    type: 'ship', team: 0, pos: { x: 50, z: 0 }, radius: 8, mass: 10,
    hull: 100, hullMax: 100, collides: true, data: { isWingman: true },
  });
  shoot(ctx, e, wing.id);
  assert.ok(ctx.toasts.some((t) => /wingman/.test(t.text)), 'the protest names the wingman');
});

test('a worker the player scattered does not thank the player for cover', () => {
  const ctx = scene();
  const { e, jobId } = worker(ctx, 'u6-miner-6', 300, 0);
  shoot(ctx, e);
  ctx.toasts.length = 0;
  ctx.runtime.resumeJob(jobId);
  assert.ok(ctx.toasts.some((t) => /Watch your fire/.test(t.text)),
    'the resume line fits the shooter');
  assert.ok(!ctx.toasts.some((t) => /thanks for the cover/.test(t.text)),
    'no misplaced gratitude');
});

test('non-player damage and jobless hulls stay silent', () => {
  const ctx = scene();
  const { e } = worker(ctx, 'u6-miner-7', 300, 0);
  const pirate = ctx.sim.spawn({
    type: 'ship', team: 1, pos: { x: 60, z: 0 }, radius: 8, mass: 10,
    hull: 100, hullMax: 100, collides: true, data: {},
  });
  shoot(ctx, e, pirate.id);
  assert.equal(ctx.threatened.length, 0, 'pirate damage is not the player seam');
  const stray = ctx.sim.spawn({
    type: 'ship', team: 0, pos: { x: 400, z: 0 }, radius: 8, mass: 10,
    hull: 100, hullMax: 100, collides: true, data: {},
  });
  shoot(ctx, stray);
  assert.equal(ctx.threatened.length, 0, 'a jobless hull draws no protest');
});
