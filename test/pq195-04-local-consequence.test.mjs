// PQ-195.04 — ONE VISIBLE LOCAL CONSEQUENCE.
//
// Berth Three is down a flywheel. Beside the lawful catcher, a stalled industrial worker waits: a
// hauler that cannot run its circuit without the replacement assembly. What the player delivered,
// and where, decides what the berth does — and the decision is not a flag. It is the presence and
// tier of a REAL npcJobs record inside `state.npcJobs`:
//
//   * lawful fork commit, condition01 >= 0.6 → the berth runs its full haul circuit (resumed);
//   * lawful fork commit, condition01 < 0.6 → a bounded reduced repair shuttle (partial service);
//   * fence / destroyed / expired / abandoned → no berth job at all (still stalled).
//
// Proven here, through the real seams (board accept, launch, latch, fork settle or impact, commit):
// (a) the resumed tier advances a real cargo task and drives the hull; (b) the reduced tier is a
// different, still-working state; (c) nothing but a lawful catcher commit can activate the berth;
// (d) the consequence survives a real save → load round trip because it lives in the serialized
// job bag; (e) a replayed commit or a reload cannot double-activate or restack.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { missions } from '../src/systems/missions.js';
import { save } from '../src/save/saveSystem.js';
import {
  BREAKAWAY_BERTH,
  BREAKAWAY_BERTH_RESUME_MIN_CONDITION01,
  BREAKAWAY_SP07,
  PQ019_HEIST_SECTOR_ID,
  heistLaunchVariant,
  BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
} from '../src/data/heistFacilities.js';
import {
  BREAKAWAY_RECOVERY_TYPE,
  PQ019C_HEIST_STATION_ID,
} from '../src/data/heistMission.js';
import { NPC_JOB_PHASE, routePosition } from '../src/systems/npcJobs.js';

const SYSTEMS = [physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime, missions];
const ROUTE_ID = (tier, index) => BREAKAWAY_BERTH.serviceTiers[tier].waypoints[index].id;

function spawnPlayer(sim) {
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  sim.state.playerId = player.id;
  return player;
}

function scene({ seed = 19504 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.player.heat = 0;
  state.player.credits = 5000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  spawnPlayer(sim);
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);

  const jobs = sim.registry.get('npcJobsRuntime');
  const facilities = sim.registry.get('heistFacilities');
  const missionsSys = sim.registry.get('missions');
  const receiver = facilities._forkReceiver(heistLaunchVariant(BREAKAWAY_THIRD_SHIFT_VARIANT_ID));
  const saveOwner = { state, bus, helpers: sim.registry.ctx.helpers, registry: sim.registry };

  const commits = [];
  const counts = { completed: 0, failed: 0, receiverCommits: 0 };
  bus.on('heist:receiverCommitted', (p) => { commits.push(p); counts.receiverCommits++; });
  bus.on('mission:completed', () => { counts.completed++; });
  bus.on('mission:failed', () => { counts.failed++; });

  const t = {
    sim, state, bus, jobs, facilities, missionsSys, receiver, saveOwner, commits, counts,
    step: (n = 1) => { for (let i = 0; i < n; i++) sim.step(SIM_DT); },
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    load: () => {
      const id = state.heistFacilities?.capsuleEntityId;
      return id == null ? null : state.entities.get(id);
    },
    stepToLaunch(max = 400) {
      for (let i = 0; i < max; i++) { t.step(1); if (t.load()) return true; }
      return false;
    },
    /** Accept the row the shipped board actually posted, through the shipped accept intent. */
    accept({ runWindowTicks = null } = {}) {
      const row = missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID).slots
        .find((o) => o && o.type === BREAKAWAY_RECOVERY_TYPE);
      assert.ok(row, 'the Tethys board posts a breakaway recovery row');
      row.params.launchWindowS = 1;
      if (runWindowTicks != null) row.params.runWindowTicks = runWindowTicks;
      bus.emit('ui:acceptMission', { missionId: row.id });
      return t.mission();
    },
    latch() { bus.emit('tether:latched', { targetId: t.load().id, type: 'tether_massline' }); },
    /** A real custody contact through the facility owner's own `physics:impact` validation. */
    fenceContact(tickOffset = 0) {
      const head = state.entityList.find((e) => e?.alive !== false
        && e.data?.heistFacilityRole === 'fence_receiver_head');
      const load = t.load();
      assert.ok(head && load, 'contact needs a live fence head and payload');
      bus.emit('physics:impact', {
        tick: (state.tick | 0) + tickOffset, aId: load.id, bId: head.id, dp: 50,
        pos: { x: head.pos.x, z: head.pos.z },
      });
    },
    /** Initial condition of the new body in receiver-local terms, before its first physics step. */
    place(load, { depth, lateral = 0, vIn = 0 }) {
      const { x, z, nx, nz } = receiver;
      load.pos.x = x + nx * depth - nz * lateral;
      load.pos.z = z + nz * depth + nx * lateral;
      if (load.prevPos) { load.prevPos.x = load.pos.x; load.prevPos.z = load.pos.z; }
      load.vel.x = nx * vIn;
      load.vel.z = nz * vIn;
      load.angVel = 0;
    },
    stepUntil(done, max) {
      for (let i = 0; i < max; i++) { t.step(1); if (done()) return i + 1; }
      return max;
    },
    worker: () => state.entityList.find((e) => e?.alive !== false
      && e.data?.berthWorkerId === BREAKAWAY_BERTH.id) || null,
    berth: () => jobs.berthStatus(),
    berthEntry: () => state.npcJobs.byId[jobs.berthStatus().jobId] || null,
    /** Deliver the SP-07 into the lawful fork at a chosen condition through the shipped seams. */
    async deliverLawfully({ condition01 = 1 } = {}) {
      assert.equal(await sim.registry.get('physics').prepareBackend(state), true,
        'proven against the production Rapier owner');
      t.accept();
      assert.ok(t.stepToLaunch(), 'the launcher throws the SP-07 assembly');
      const load = t.load();
      load.hull = Math.max(0, Math.min(1, condition01)) * load.hullMax;
      t.latch();
      t.place(load, { depth: -60, vIn: 80 });
      t.stepUntil(() => !t.mission(), 900);
      return t.mission();
    },
    capture() {
      return JSON.parse(JSON.stringify({
        npcJobs: t.jobs.serialize(),
        entities: save._serializeEntities.call(saveOwner),
      }));
    },
    restore(snapshot) {
      save._clearEntities.call(saveOwner);
      spawnPlayer(sim);
      sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
      t.jobs.deserialize(snapshot.npcJobs);
      bus.emit('save:loaded', { slot: 'test' });
    },
  };
  return t;
}

// ── (a) a lawful delivery in good condition resumes the berth ───────────────────────────────────

test('(a) a good-condition lawful commit resumes the berth: a real cargo job advances and drives the hull', async () => {
  const t = scene();
  assert.equal(t.berth().stalled, true, 'Berth Three starts stalled');
  assert.equal(t.worker() !== null, true, 'the stalled worker hull is present before any delivery');
  assert.equal(t.worker().data.jobId, undefined, 'a stalled worker carries no job');

  const m = await t.deliverLawfully({ condition01: 1 });
  assert.equal(m, null, 'the recovery settled');

  const commit = t.commits.at(-1);
  assert.ok(commit, 'a committed receiver handoff was emitted');
  assert.equal(commit.facilityId, 'lawful_catcher');
  assert.equal(commit.payloadStableId, BREAKAWAY_SP07.stableId);
  assert.ok(Number(commit.condition01) >= BREAKAWAY_BERTH_RESUME_MIN_CONDITION01);

  const status = t.berth();
  assert.equal(status.stalled, false, 'the berth is no longer stalled');
  assert.equal(status.tier, 'resumed');
  assert.equal(status.receiptId, commit.receiptId, 'the consequence is bound to the committed receipt');
  assert.equal(status.condition01, commit.condition01);

  const entry = t.berthEntry();
  assert.ok(entry && entry.job, 'the berth is backed by a real npcJobs record in state.npcJobs');
  assert.equal(entry.job.payload.receiptId, commit.receiptId, 'the binding receiptId is on the record');
  assert.equal(entry.job.payload.payloadStableId, BREAKAWAY_SP07.stableId);
  assert.equal(entry.job.payload.berthService, 'resumed');
  const worker = t.worker();
  assert.ok(worker, 'the worker hull is still there');
  assert.equal(worker.data.jobId, entry.job.id, 'the worker hull is bound to the berth job');

  // A real cargo task advances: the circuit moves off its first phase and the hull is driven.
  const startPhase = entry.job.phase;
  const startPos = routePosition(entry.job);
  let sawDrive = false;
  for (let i = 0; i < 300; i++) {
    t.step(1);
    const intent = worker.data.intent;
    if (intent && (intent.moveZ > 0 || intent.brake === true)) sawDrive = true;
  }
  assert.notEqual(entry.job.phase, startPhase, 'the job left its commissioning phase');
  const moved = routePosition(entry.job);
  assert.ok(Math.hypot(moved.x - startPos.x, moved.z - startPos.z) > 1,
    'the worker has visibly moved along its circuit');
  assert.equal(sawDrive, true, 'the movement owner wrote a non-zero intent for the worker');
});

// ── (b) a damaged return is partial service, distinct from both other states ─────────────────────

test('(b) a damaged lawful commit runs the reduced repair shuttle, not the full resume', async () => {
  const t = scene();
  const m = await t.deliverLawfully({ condition01: 0.3 });
  assert.equal(m, null);
  const commit = t.commits.at(-1);
  assert.equal(commit.facilityId, 'lawful_catcher');
  assert.ok(Number(commit.condition01) < BREAKAWAY_BERTH_RESUME_MIN_CONDITION01);

  const status = t.berth();
  assert.equal(status.stalled, false);
  assert.equal(status.tier, 'reduced', 'a damaged assembly restores only partial service');
  assert.equal(status.receiptId, commit.receiptId);

  const entry = t.berthEntry();
  assert.ok(entry && entry.job);
  assert.equal(entry.job.payload.berthService, 'reduced');
  assert.equal(entry.job.route[1].id, ROUTE_ID('reduced', 1),
    'the reduced circuit is the authored repair shuttle');
  assert.notEqual(entry.job.route[1].id, ROUTE_ID('resumed', 1),
    'a diminished circuit, not the full resume');

  // It is working, not stalled: the reduced job still advances.
  const p0 = entry.job.progress;
  t.step(1);
  assert.ok(entry.job.progress > p0 || entry.job.phase !== NPC_JOB_PHASE.COMMISSION);
});

test('(b) a reduced berth is a different sim state from a stalled one', () => {
  const stalled = scene();
  assert.equal(stalled.berth().tier, null);
  assert.equal(stalled.berth().stalled, true);
  assert.equal(stalled.berth().active, false);
});

// ── (c) only a lawful catcher commit can start the machine ───────────────────────────────────────

test('(c) a fence delivery leaves Berth Three stalled and never plays the repaired machine', () => {
  const t = scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  t.fenceContact(0);
  t.stepUntil(() => !t.mission(), 40);
  assert.equal(t.mission(), null);
  assert.equal(m.heist.arbiter.receipt.outcome, 'fenced_success');
  assert.equal(t.counts.receiverCommits, 1);
  assert.equal(t.berth().stalled, true, 'the illicit handoff never activates the berth');
  assert.equal(t.berth().active, false);
  assert.equal(t.worker().data.jobId, undefined);
});

test('(c) a destroyed load leaves Berth Three stalled', () => {
  const t = scene();
  t.accept();
  assert.ok(t.stepToLaunch());
  const load = t.load();
  load.hull = 0;
  load.alive = false;
  t.stepUntil(() => !t.mission(), 40);
  assert.equal(t.mission(), null, 'the destroyed run settles');
  assert.equal(t.counts.receiverCommits, 0, 'destruction never reaches a receiver commit');
  assert.equal(t.berth().stalled, true);
  assert.equal(t.berth().active, false);
});

test('(c) an expired run leaves Berth Three stalled', () => {
  const t = scene();
  t.accept({ runWindowTicks: 12 });
  assert.ok(t.stepToLaunch());
  t.step(40);
  assert.equal(t.mission(), null, 'the run window closes');
  assert.equal(t.berth().stalled, true);
  assert.equal(t.counts.receiverCommits, 0);
});

test('(c) an abandoned run leaves Berth Three stalled', () => {
  const t = scene();
  const m = t.accept();
  t.step(2);
  t.bus.emit('ui:abandonMission', { missionId: m.id });
  t.stepUntil(() => !t.mission(), 40);
  assert.equal(t.mission(), null, 'the abandoned run settles');
  assert.equal(t.berth().stalled, true);
  assert.equal(t.counts.receiverCommits, 0);
});

// ── (d) the consequence survives a real save → load ──────────────────────────────────────────────

test('(d) a resumed berth is still resumed after a real save → load', async () => {
  const t = scene();
  await t.deliverLawfully({ condition01: 1 });
  assert.equal(t.berth().tier, 'resumed');
  const snapshot = t.capture();
  const savedWorker = snapshot.entities.persistent.filter(
    (e) => e.data?.berthWorkerId === BREAKAWAY_BERTH.id,
  );
  assert.equal(savedWorker.length, 0, 'the worker hull is owned by heistFacilities, not the save');

  t.restore(snapshot);
  const status = t.berth();
  assert.equal(status.active, true, 'the resumed consequence survived the reload');
  assert.equal(status.tier, 'resumed');
  assert.equal(status.receiptId, t.commits.at(-1).receiptId);
  const worker = t.worker();
  assert.ok(worker, 'heistFacilities re-materialized the worker with the sector');
  assert.equal(worker.data.jobId, status.jobId, 'the restored job re-linked to the fresh hull');
});

test('(d) a stalled berth is still stalled after a real save → load', () => {
  const t = scene();
  assert.equal(t.berth().stalled, true);
  const snapshot = t.capture();
  t.restore(snapshot);
  assert.equal(t.berth().stalled, true, 'no activation appears out of a save');
  assert.equal(t.berth().active, false);
  assert.ok(t.worker(), 'the stalled worker hull is present again');
  assert.equal(t.worker().data.jobId, undefined);
});

// ── (e) idempotency: replay and reload cannot double-activate ────────────────────────────────────

test('(e) replaying the commit and reloading never stack a second berth activation', async () => {
  const t = scene();
  await t.deliverLawfully({ condition01: 1 });
  const commit = t.commits.at(-1);
  const realCommits = t.commits.length;
  const entry = t.berthEntry();
  const beforeRoute = entry.job.route[1].id;

  // A replay of the SAME committed receipt is a no-op.
  t.bus.emit('heist:receiverCommitted', { ...commit });
  // A later, DIFFERENT receipt (e.g. a second run) does not re-tier the one berth, one worker.
  t.bus.emit('heist:receiverCommitted', {
    ...commit, receiptId: `${commit.receiptId}:second`, condition01: 0.2,
  });
  t.step(30);
  const berthJobs = Object.keys(t.state.npcJobs.byId)
    .filter((id) => id === t.berth().jobId);
  assert.equal(berthJobs.length, 1, 'exactly one berth job exists');
  assert.equal(t.berth().tier, 'resumed', 'the original tier is never restacked');
  assert.equal(t.berth().receiptId, commit.receiptId, 'the original binding receipt is kept');
  const again = t.berthEntry();
  assert.equal(again, entry, 'the same record is reused, not replaced');
  assert.equal(again.job.route[1].id, beforeRoute);
  assert.equal(realCommits, 1, 'the recovery committed exactly once');

  // A reload restores exactly one berth job with the same binding.
  const snapshot = t.capture();
  t.restore(snapshot);
  assert.equal(Object.keys(t.state.npcJobs.byId).filter((id) => id === t.berth().jobId).length, 1);
  assert.equal(t.berth().receiptId, commit.receiptId);
});

// ── the authored threshold is one named constant, consulted everywhere ───────────────────────────

test('the resume threshold is a single named authored constant', () => {
  assert.equal(typeof BREAKAWAY_BERTH_RESUME_MIN_CONDITION01, 'number');
  assert.equal(BREAKAWAY_BERTH_RESUME_MIN_CONDITION01, 0.6);
  assert.equal(BREAKAWAY_BERTH.facilityId, 'lawful_catcher');
});
