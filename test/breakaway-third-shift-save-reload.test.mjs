// BREAKAWAY BW-03 — the SP-07 is a DURABLE physical obligation across a save.
//
// Unlike the capsule run (transient capsule -> `unresolved_absent` after a reload), the SP-07's body
// carries `flags.persistent`, so the SAVE OWNER itself saves and respawns it; its mission re-adopts
// that exact body on the first drive after the load, and the facility owner re-proves fork custody
// from the body's own mechanical record.
//
// These tests use the save owner's REAL entity capture, clear and persistent-respawn functions, the
// real mission serialize/deserialize, and the real `save:loaded` event, in the save system's own
// restore order (clear mission runtime -> clear entities -> player -> sector re-entry -> persistent
// actors -> missions -> save:loaded). They reload into the SAME world, which is the case the capsule
// suites never exercised: this owner's unsaved schedule from before the load must not survive it.

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
  BREAKAWAY_SP07,
  BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
  PQ019_HEIST_SECTOR_ID,
  heistLaunchVariant,
} from '../src/data/heistFacilities.js';
import {
  BREAKAWAY_HEIST_TUNING,
  BREAKAWAY_RECOVERY_TYPE,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_TYPE,
} from '../src/data/heistMission.js';
import { deliveryQuote } from '../src/physicalCargo/breakaway/payloadMath.js';
import { prepareTerminal } from '../src/missions/heistArbiter.js';

const SYSTEMS = [physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime, missions];

function spawnPlayer(sim) {
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  sim.state.playerId = player.id;
  return player;
}

async function scene({ seed = 40404 } = {}) {
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
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);

  const grants = [];
  const counts = { completed: 0, failed: 0, launches: 0 };
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('mission:completed', () => { counts.completed++; });
  bus.on('mission:failed', () => { counts.failed++; });
  bus.on('heist:capsuleLaunched', () => { counts.launches++; });

  const missionsSys = sim.registry.get('missions');
  const facilities = sim.registry.get('heistFacilities');
  const receiver = facilities._forkReceiver(heistLaunchVariant(BREAKAWAY_THIRD_SHIFT_VARIANT_ID));
  // The save owner's own methods, bound to this world. No saveSystem.init: no storage, no autosave.
  const saveOwner = { state, bus, helpers: sim.registry.ctx.helpers, registry: sim.registry };

  const t = {
    sim, state, bus, grants, counts, missionsSys, facilities, receiver,
    step: (n = 1) => { for (let i = 0; i < n; i++) sim.step(SIM_DT); },
    accept(type) {
      const row = missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID).slots.find((o) => o && o.type === type);
      assert.ok(row, `the Tethys board posts a ${type} row`);
      row.params.launchWindowS = 1;
      bus.emit('ui:acceptMission', { missionId: row.id });
      return t.mission();
    },
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    load: () => {
      const id = state.heistFacilities?.capsuleEntityId;
      return id == null ? null : state.entities.get(id);
    },
    stepToLaunch(max = 400) {
      for (let i = 0; i < max; i++) { t.step(1); if (t.load()) return true; }
      return false;
    },
    place(load, { depth, vIn = 0, lateral = 0 }) {
      const { x, z, nx, nz } = receiver;
      load.pos.x = x + nx * depth - nz * lateral;
      load.pos.z = z + nz * depth + nx * lateral;
      if (load.prevPos) { load.prevPos.x = load.pos.x; load.prevPos.z = load.pos.z; }
      load.vel.x = nx * vIn;
      load.vel.z = nz * vIn;
      load.angVel = 0;
    },
    depth(load) {
      return (load.pos.x - receiver.x) * receiver.nx + (load.pos.z - receiver.z) * receiver.nz;
    },
    stepUntil(done, max) {
      for (let i = 0; i < max; i++) { t.step(1); if (done()) return i + 1; }
      return max;
    },
    payouts: () => grants.filter((g) => String(g?.reason || '').startsWith('mission:')),
    liveLoads: () => state.entityList.filter((e) => e?.alive !== false
      && e.data?.heistFacilityRole === 'cargo_capsule'),

    /** Exactly what a save file would carry for this feature: missions + persistent entities. */
    capture() {
      return JSON.parse(JSON.stringify({
        missions: missionsSys.serialize(),
        entities: save._serializeEntities.call(saveOwner),
      }));
    },
    /** The save owner's restore order, into this same live world. */
    restore(snapshot, { dropPersistent = false } = {}) {
      save._clearMissionRuntimeForRestore.call(saveOwner);
      save._clearEntities.call(saveOwner);
      spawnPlayer(sim);
      sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
      if (!dropPersistent) {
        save._spawnPersistentEntities.call(saveOwner, snapshot.entities.persistent, new Map());
      }
      missionsSys.deserialize(snapshot.missions);
      bus.emit('save:loaded', { slot: 'test' });
    },
  };
  return t;
}

const fullQuote = () => deliveryQuote(
  BREAKAWAY_HEIST_TUNING.rewardCr, 1, BREAKAWAY_HEIST_TUNING.qualityBonusFraction,
).totalCredits;

test('the SP-07 body is in the save, and the capsule run capsule is not', async () => {
  const t = await scene();
  t.accept(BREAKAWAY_RECOVERY_TYPE);
  assert.ok(t.stepToLaunch());
  const snapshot = t.capture();
  const saved = snapshot.entities.persistent.filter((e) => e.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId);
  assert.equal(saved.length, 1, 'the save owner persisted exactly one SP-07 body');
  assert.equal(saved[0].flags.persistent, true);
  assert.equal(snapshot.missions.active[0].heist.variantId, BREAKAWAY_THIRD_SHIFT_VARIANT_ID);
});

test('reload while the assembly drifts: the same body is re-adopted, not respawned, and still delivers once', async () => {
  const t = await scene();
  const m = t.accept(BREAKAWAY_RECOVERY_TYPE);
  assert.ok(t.stepToLaunch());
  t.step(30);
  const before = t.load();
  const pose = { x: before.pos.x, z: before.pos.z, vx: before.vel.x, vz: before.vel.z, w: before.angVel };
  const snapshot = t.capture();

  t.restore(snapshot);
  t.step(1);
  const restored = t.mission();
  assert.ok(restored, 'the recovery is still active after the reload');
  assert.equal(restored.heist.reconciled, 'readopted');
  assert.equal(t.liveLoads().length, 1, 'exactly one SP-07 in the world');
  const load = t.load();
  assert.ok(load, 'the facility owner re-adopted the restored body');
  assert.equal(t.counts.launches, 1, 'no second launch');
  assert.ok(Math.hypot(load.pos.x - pose.x, load.pos.z - pose.z) < 3,
    'the body resumed from its saved pose, not the launcher');
  assert.ok(Math.hypot(load.vel.x - pose.vx, load.vel.z - pose.vz) < 1, 'with its saved velocity');
  assert.equal(t.state.heistFacilities.schedule.scheduleId, restored.heist.scheduleId);

  t.place(load, { depth: -40, vIn: 50 }); // test tug straight to the mouth
  t.stepUntil(() => !t.mission(), 900);
  assert.equal(t.mission(), null);
  assert.equal(t.counts.completed, 1);
  assert.deepEqual(t.payouts().map((g) => g.amount), [fullQuote()], 'paid exactly once across the reload');
  void m;
});

test('reload while the fork is braking the load: it settles and pays exactly once', async () => {
  const t = await scene();
  t.accept(BREAKAWAY_RECOVERY_TYPE);
  assert.ok(t.stepToLaunch());
  t.place(t.load(), { depth: -40, vIn: 60 });
  t.stepUntil(() => t.state.heistFacilities.capture?.phase === 'braking', 240);
  assert.equal(t.state.heistFacilities.capture.phase, 'braking');
  const snapshot = t.capture();

  t.restore(snapshot);
  t.stepUntil(() => !t.mission(), 900);
  assert.equal(t.mission(), null, 'the reloaded capture completes');
  assert.equal(t.counts.completed, 1);
  assert.deepEqual(t.payouts().map((g) => g.amount), [fullQuote()]);
});

test('reload in the one-tick window after the fork settled but before arbitration: pays exactly once', async () => {
  const t = await scene();
  t.accept(BREAKAWAY_RECOVERY_TYPE);
  assert.ok(t.stepToLaunch());
  t.place(t.load(), { depth: -40, vIn: 50 });
  // Stop on the exact tick the settled-capture candidate reached the mission, before it is decided.
  t.stepUntil(() => (t.mission()?.heist.arbiter.candidates || []).some((c) => c.kind === 'lawful_arrival_observed'), 900);
  const record = t.mission().heist;
  assert.ok(record.arbiter.candidates.some((c) => c.kind === 'lawful_arrival_observed'));
  assert.equal(record.arbiter.receipt, null, 'not yet decided at the save boundary');
  const snapshot = t.capture();

  t.restore(snapshot);
  t.stepUntil(() => !t.mission(), 120);
  assert.equal(t.mission(), null);
  assert.equal(t.counts.completed, 1, 'custody is re-proven fresh from the restored body');
  assert.deepEqual(t.payouts().map((g) => g.amount), [fullQuote()]);
});

test('a save whose SP-07 body is gone reaches a bounded failure with no payout and no phantom load', async () => {
  const t = await scene();
  t.accept(BREAKAWAY_RECOVERY_TYPE);
  assert.ok(t.stepToLaunch());
  const snapshot = t.capture();

  t.restore(snapshot, { dropPersistent: true });
  t.stepUntil(() => !t.mission(), 30);
  assert.equal(t.mission(), null, 'the run settles instead of hanging');
  assert.equal(t.counts.failed, 1);
  assert.equal(t.payouts().length, 0);
  assert.equal(t.liveLoads().length, 0, 'nothing is fabricated');
});

test('same-session reload of a never-launched capsule run is no longer blocked by a stale launcher schedule', async () => {
  const t = await scene();
  const m = t.accept(PQ019C_HEIST_TYPE);
  t.step(2);
  assert.equal(m.heist.launchTick, null, 'nothing launched yet');
  assert.ok(t.state.heistFacilities.schedule, 'the live world holds this run\'s schedule at the save');
  const snapshot = t.capture();

  t.restore(snapshot);
  const restored = t.mission();
  assert.equal(restored.heist.reconciled, 'reschedule');
  assert.ok(t.stepToLaunch(600), 'the reloaded contract launches instead of being denied active_schedule');
  assert.equal(t.mission()?.heist.scheduleDenied ?? null, null);
  assert.equal(t.liveLoads().length, 1);
});

test('reload after the delivery was decided but before the fork consumed the load: re-adopted and paid once', async () => {
  const t = await scene();
  t.accept(BREAKAWAY_RECOVERY_TYPE);
  assert.ok(t.stepToLaunch());
  t.place(t.load(), { depth: -40, vIn: 50 });
  t.stepUntil(() => (t.mission()?.heist.arbiter.candidates || []).some((c) => c.kind === 'lawful_arrival_observed'), 900);
  const record = t.mission().heist;
  // The decided-but-unconsumed cut point, exactly as the arbiter prepares it on the next tick.
  prepareTerminal(record.arbiter, (t.state.tick | 0) + 1);
  assert.equal(record.arbiter.receipt.outcome, 'lawful_arrival_observed');
  const snapshot = t.capture();

  t.restore(snapshot);
  assert.equal(t.mission().heist.reconciled, 'resumed_receipt');
  t.stepUntil(() => !t.mission(), 60);
  assert.equal(t.mission(), null);
  assert.equal(t.counts.completed, 1, 'the durable body is re-adopted and handed over, not excused');
  assert.deepEqual(t.payouts().map((g) => g.amount), [fullQuote()]);
  t.step(1);
  assert.equal(t.liveLoads().length, 0, 'the load was consumed by the fork');
});

test('a corrupt saved run with its SP-07 body present pays nothing and leaves no orphan body behind', async () => {
  const t = await scene();
  t.accept(BREAKAWAY_RECOVERY_TYPE);
  assert.ok(t.stepToLaunch());
  t.step(5);
  const snapshot = t.capture();
  // A phase that claims a decision with no readable receipt: the arbiter refuses the whole record.
  snapshot.missions.active[0].heist.arbiter.phase = 'resolution_pending';
  snapshot.missions.active[0].heist.arbiter.receipt = null;

  t.restore(snapshot);
  assert.equal(t.mission().heist.reconciled, 'arbiter_refused');
  assert.equal(t.liveLoads().length, 1, 'the save owner did restore the body');
  t.stepUntil(() => !t.mission(), 30);
  assert.equal(t.mission(), null, 'the run settles instead of hanging');
  assert.equal(t.payouts().length, 0);
  t.step(1);
  assert.equal(t.liveLoads().length, 0, 'the unadopted body is removed with its finished run');
  const stillSaved = t.capture().entities.persistent
    .filter((e) => e.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId);
  assert.equal(stillSaved.length, 0, 'no later save carries an orphan SP-07');
});
