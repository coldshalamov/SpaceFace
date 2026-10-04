// SF-084 — two occupations competing for one real resource (equivalence pin + custody proof).
//
// The packet wants a readable contention between a miner and a hauler (or salvor) over one
// actual berth/output, resolved through existing custody — never duplicated goods.
//
// The contention machinery already exists; this test pins it across KINDS end to end:
//
//   • berth: a miner physically unloading on a berth owns it; a hauler in the same apron on a
//     TRANSIT leg to that same berth queues at a lane-side hold point — the job clock pauses,
//     the dock is never double-booked, and when the miner's single unload completes the berth
//     frees and the hauler resumes (SF-080 machinery, now proven cross-kind);
//   • body: a wreck already under another job's tow (`npcTowedByJobId`) is refused by a tug's
//     occupational scan — custody is authoritative, the loser takes the next free body, and
//     the claimed body's stamp is never overwritten or duplicated.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_PHASE, NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }

// ── berth contention: miner owns the dock, hauler waits in line ────────────────────────────

function bootPlain() {
  const sim = createSimulation({ seed: 31, systems: [npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world = { currentSectorId: 'sector_a', sectors: {} };
  sim.state.player = { heat: 0 };
  return sim;
}
function spawnWorker(sim, wrId, x, z) {
  const e = sim.spawn({ type: 'ship', team: 2, pos: { x, z }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8 });
  e.data = { worldRecordId: wrId, sectorId: 'sector_a' };
  return e;
}
function minerSpec() {
  return { kind: NPC_JOB_KIND.MINER, sectorId: 'sector_a', speed: 100,
    commissionS: 0.5, departS: 0.5, approachS: 0.5, workS: 8, loadS: 0.5, unloadS: 0.5, dwellS: 0.5,
    route: [{ id: 'home:st_a', pos: { x: 0, z: 0 }, label: 'Refinery' }, { id: 'field:a', pos: { x: 600, z: 0 }, label: 'Belt' }] };
}
function haulerSpec() {
  return { kind: NPC_JOB_KIND.HAULER, sectorId: 'sector_a', speed: 100,
    commissionS: 0.5, departS: 0.5, approachS: 0.5, loadS: 0.5, unloadS: 0.5, dwellS: 0.5,
    route: [{ id: 'origin:st_b', pos: { x: -2000, z: 0 } }, { id: 'home:st_a', pos: { x: 0, z: 0 }, label: 'Refinery' }] };
}

test('a miner on the berth makes a hauler wait — one dock, one unload, then the line moves', () => {
  const sim = bootPlain();
  const unloads = [];
  sim.bus.on('npcjobs:unload', (p) => unloads.push(p));

  // the miner is physically ON the berth, mid-unload
  const m = spawnWorker(sim, 'wr-miner', 0, 0);
  const mJob = sim.helpers.npcJobs.assign(m, minerSpec());
  const rt = sim.registry.get('npcJobsRuntime');
  const mEntry = rt._byId()[mJob];
  mEntry.job.phase = NPC_JOB_PHASE.UNLOAD;
  mEntry.job.routeIndex = 0;
  mEntry.job.progress = 0.1;

  // the hauler is inside the same apron, leg-bound for the SAME berth
  const h = spawnWorker(sim, 'wr-hauler', -350, 0);
  const hJob = sim.helpers.npcJobs.assign(h, haulerSpec());
  const hEntry = rt._byId()[hJob];
  hEntry.job.phase = NPC_JOB_PHASE.TRANSIT;
  hEntry.job.routeIndex = 0;
  hEntry.job.progress = 0.5;

  steps(sim, 12);
  assert.equal(hEntry.berthHold, true, 'the hauler queues — the berth belongs to the miner');
  assert.ok(hEntry.berthHoldPoint, 'the wait is a physical lane-side point, not a stance');
  assert.equal(mEntry.job.phase, NPC_JOB_PHASE.UNLOAD, 'the winner finishes its unload undisturbed');

  // the miner's clock keeps running — its single unload completes, the dock frees
  steps(sim, 60 * 2);
  const minerUnloads = unloads.filter((p) => p && p.jobId === mJob);
  assert.equal(minerUnloads.length, 1, 'exactly one unload — the shared stock moved once');
  assert.notEqual(mEntry.job.phase, NPC_JOB_PHASE.UNLOAD);

  steps(sim, 30);
  assert.equal(hEntry.berthHold, false, 'the berth freed — the loser continues its leg');
  assert.equal(hEntry.job.phase, NPC_JOB_PHASE.TRANSIT, 'the hauler is back on approach');
});

// ── body custody: a claimed wreck is refused, the loser takes the free one ─────────────────

async function bootFull() {
  const sim = createSimulation({
    seed: 32,
    systems: [physics, combat, npcJobsRuntime],
    updateOrder: [npcJobsRuntime, physics, combat],
  });
  sim.state.mode = 'flight';
  sim.state.world = { currentSectorId: 'sector_a', sectors: {} };
  sim.state.player = { heat: 0 };
  sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  await sim.registry.get('physics').prepareBackend(sim.state);
  return sim;
}
function disposeFull(sim) {
  const p = sim.registry.get('physics');
  if (p && typeof p._disableSg02DynamicAuthority === 'function') p._disableSg02DynamicAuthority();
  sim.dispose();
}
function body(sim, x, z, extra = {}) {
  const e = sim.spawn({ type: 'payload', pos: { x, z }, vel: { x: 0, z: 0 }, hull: 10, hullMax: 10, radius: 4, mass: 80, collides: true });
  e.data = { sectorId: 'sector_a', towable: true, salvagePool: { cmdty_scrap_metal: 3 }, ...extra };
  return e;
}
function whipOn(sim, target) {
  return Object.values(sim.state.combat.attachments.byId)
    .find((a) => a && a.state === 'active' && a.targetId === target.id) || null;
}

test('a wreck under another job’s custody is refused — the tug takes the free body instead', async () => {
  const sim = await bootFull();
  try {
    const tug = sim.spawn({ type: 'ship', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8, mass: 20, collides: true });
    tug.data = {
      worldRecordId: 'wr-tug', sectorId: 'sector_a', trafficRole: 'tug',
      ai: { passive: true, roe: 'hold_fire' },
      cargoManifest: { lines: [{ commodityId: 'cmdty_scrap_metal', qty: 4 }], totalQty: 4 },
    };
    const jobId = sim.helpers.npcJobs.assign(tug, {
      kind: NPC_JOB_KIND.HAULER, sectorId: 'sector_a', speed: 90,
      commissionS: 0.5, departS: 0.5, approachS: 0.5, loadS: 0.5, unloadS: 0.5, dwellS: 0.5,
      route: [{ id: 'tow:a', pos: { x: 0, z: 0 } }, { id: 'tow:b', pos: { x: 900, z: 0 } }],
    });
    const entry = sim.registry.get('npcJobsRuntime')._byId()[jobId];
    entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    entry.job.routeIndex = 0;
    entry.job.progress = 0.4;

    // two bodies equidistant: one already under a salvor's job custody, one free
    const claimed = body(sim, 200, 0, { npcTowedByJobId: 'job:salvor-alpha' });
    const free = body(sim, -200, 0);

    steps(sim, 60 * 6);
    assert.equal(whipOn(sim, claimed), null, 'custody is authoritative — no second line on the claimed wreck');
    assert.equal(claimed.data.npcTowedByJobId, 'job:salvor-alpha', 'the loser never overwrites the winner’s claim');
    const whip = whipOn(sim, free);
    assert.ok(whip, 'the loser gets a valid continuation — the next free body');
    assert.equal(whip.ownerId, tug.id);
    assert.equal(free.data.npcTowedByJobId, 'job:wr-tug', 'the free body is claimed once, to this job');
  } finally {
    disposeFull(sim);
  }
});
