// SF-087 — civilian assistance that carries an actual cost.
//
// The hire is the landed tow-assist machinery: a working mover is leased off its OWN route,
// bills a real fee through the economy writer, physically couples to a loose body, drags it
// to a sink, and hands the route back — bounded by a timeout that reports the load as lost.
// This test pins the whole cost chain on the real runtime, plus the packet's contrary cases:
// repeated hire cannot duplicate the worker, a claimed body cannot be double-towed, and a
// panicking (FLEE) worker refuses — help never silently overwrites the flee reflex.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_PHASE, NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
const ROUTE = [
  { id: 'origin:st_b', pos: { x: -2000, z: 0 } },
  { id: 'dest:st_a', pos: { x: 2000, z: 0 }, label: 'Refinery' },
];
function haulerSpec(o = {}) {
  return { kind: NPC_JOB_KIND.HAULER, route: ROUTE, sectorId: 'sector_a',
    speed: 100, commissionS: 0.5, departS: 0.5, approachS: 0.5, loadS: 0.5, unloadS: 0.5, dwellS: 0.5, ...o };
}
async function boot() {
  const sim = createSimulation({
    seed: 41,
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
function dispose(sim) {
  const p = sim.registry.get('physics');
  if (p && typeof p._disableSg02DynamicAuthority === 'function') p._disableSg02DynamicAuthority();
  sim.dispose();
}
function worker(sim, x = 0, z = 0) {
  const e = sim.spawn({ type: 'ship', team: 2, pos: { x, z }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8, mass: 20, collides: true });
  e.data = {
    worldRecordId: 'wr-hauler', sectorId: 'sector_a', trafficRole: 'tug',
    ai: { passive: true, roe: 'hold_fire' },
    cargoManifest: { lines: [{ commodityId: 'cmdty_scrap_metal', qty: 6 }], totalQty: 6 },
  };
  const jobId = sim.helpers.npcJobs.assign(e, haulerSpec());
  const entry = sim.registry.get('npcJobsRuntime')._byId()[jobId];
  entry.job.phase = NPC_JOB_PHASE.TRANSIT;
  entry.job.routeIndex = 0;
  entry.job.progress = 0.4;
  return { e, jobId, entry };
}
function body(sim, x, z, extra = {}) {
  const e = sim.spawn({ type: 'payload', pos: { x, z }, vel: { x: 0, z: 0 }, hull: 10, hullMax: 10, radius: 4, mass: 80, collides: true });
  e.data = { sectorId: 'sector_a', towable: true, salvagePool: { cmdty_scrap_metal: 3 }, ...extra };
  return e;
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }

test('the hired worker pauses its own route, bills a real fee, tows the load, and resumes', async () => {
  const sim = await boot();
  try {
    const { e, jobId, entry } = worker(sim);
    const rt = sim.registry.get('npcJobsRuntime');
    const charges = [];
    sim.bus.on('economy:chargeCredits', (p) => charges.push(p));
    const done = [];
    sim.bus.on('npcJobs:towAssistComplete', (p) => done.push(p));

    const load = body(sim, 120, 0);
    const dest = { x: 1500, z: 0 };
    const hire = rt.requestTowAssist(e.id, load.id, dest, { holder: 'contactHail', feeCr: 150 });
    assert.equal(hire.granted, true);
    assert.ok(entry.towAssist, 'the bounded task is bound to the job');
    assert.ok(entry.control, 'the helper is genuinely leased off its own route');
    assert.equal(charges.length, 1, 'one real charge — the help is not free labor');
    assert.equal(charges[0].amount, 150);
    assert.equal(charges[0].reason, 'tow_assist');

    // The repeated request cannot duplicate the worker.
    const again = rt.requestTowAssist(e.id, load.id, dest, { holder: 'contactHail', feeCr: 150 });
    assert.equal(again.granted, false);
    assert.equal(again.reason, 'already_hired');

    // Approach: the lease physically couples the load through the combat attachment owner.
    steps(sim, 30);
    assert.equal(entry.towAssist.phase, 'tow', 'the line attached — the hire tows a real body');
    assert.ok(entry.towAttachmentId != null);
    assert.equal(load.data.npcTowedByJobId, `job:${entry.worldRecordId}`, 'custody names this job');

    // Deliver: drag the body inside the settle ring — the job reports, releases, resumes.
    e.pos.x = 1400; load.pos.x = 1450;
    steps(sim, 20);
    assert.equal(done.length, 1, 'delivery is reported once');
    assert.equal(entry.towAssist ?? null, null, 'the task clears');
    assert.equal(entry.control ?? null, null, 'the lease is released');
    assert.equal(entry.job.phase, NPC_JOB_PHASE.TRANSIT, 'the helper returns to its own obligation');
    assert.equal(e.data.cargoManifest.totalQty, 6, 'the helper’s own manifest was never touched');
  } finally {
    dispose(sim);
  }
});

test('a threatened worker refuses the hire — panic is not renegotiable', async () => {
  const sim = await boot();
  try {
    const { e, entry } = worker(sim);
    const rt = sim.registry.get('npcJobsRuntime');
    entry.job.phase = NPC_JOB_PHASE.FLEE;
    entry.job.preInterruptPhase = NPC_JOB_PHASE.TRANSIT;
    const load = body(sim, 120, 0);
    const hire = rt.requestTowAssist(e.id, load.id, { x: 1500, z: 0 }, { feeCr: 150 });
    assert.equal(hire.granted, false);
    assert.equal(hire.reason, 'under_threat');
    assert.equal(entry.control ?? null, null, 'no lease was taken on a fleeing hull');
    assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE, 'the reflex survives the refused hire');
  } finally {
    dispose(sim);
  }
});

test('an already-claimed body cannot be re-hired out from under its owner', async () => {
  const sim = await boot();
  try {
    const { e } = worker(sim);
    const rt = sim.registry.get('npcJobsRuntime');
    const claimed = body(sim, 120, 0, { npcTowedByJobId: 'job:salvor-alpha' });
    const hire = rt.requestTowAssist(e.id, claimed.id, { x: 1500, z: 0 });
    assert.equal(hire.granted, false);
    assert.equal(hire.reason, 'not_towable');
    assert.equal(claimed.data.npcTowedByJobId, 'job:salvor-alpha', 'custody is never stolen');
  } finally {
    dispose(sim);
  }
});

test('an assist that runs too long reports the loss and hands the route back', async () => {
  const sim = await boot();
  try {
    const { e, jobId, entry } = worker(sim);
    const rt = sim.registry.get('npcJobsRuntime');
    const lost = [];
    sim.bus.on('npcJobs:towAssistLost', (p) => lost.push(p));
    const load = body(sim, 120, 0);
    const hire = rt.requestTowAssist(e.id, load.id, { x: 1500, z: 0 }, { timeoutS: 5 });
    assert.equal(hire.granted, true);
    sim.state.simTime += 10; // let the bounded task lapse
    steps(sim, 10);
    assert.equal(lost.length, 1, 'the missed window is reported, not silent');
    assert.equal(lost[0].reason ?? null, 'timeout');
    assert.equal(entry.towAssist ?? null, null);
    assert.equal(entry.control ?? null, null, 'the lease released — the worker goes back to work');
  } finally {
    dispose(sim);
  }
});
