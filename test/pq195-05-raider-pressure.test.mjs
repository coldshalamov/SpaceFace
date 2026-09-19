// PQ-195.05 — SOMEONE ELSE WANTS IT.
//
// While a Third Shift run is live, raiders want the assembly. ONE bounded pressure element per
// run — at most two light hulls plus ONE optional tether-control specialist — through the ordinary
// spawn-budget arbiter, driven by the existing tactical owner with reused archetypes.
//
// Proven here through the real seams (board accept, launch, live run, settle/exit):
// (a) raiders spawn under the heist requester and bind their slots, never more than 2+1;
// (b) each raider carries an authoritative ATTACK_RUN assignment on the tug anchored on the
//     assembly, and a live tactical owner actually closes the distance;
// (c) a settled run spawns nothing new and returns its budget slots;
// (d) a Capsule Run — same arbiter, different variant — draws no pressure at all;
// (e) an unlaunched run draws none either: pressure is bound to the live assembly, not the row;
// (f) leaving the sector hands the slots back.

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
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { missions } from '../src/systems/missions.js';
import {
  BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
  HEIST_CAPSULE_RUN_VARIANT_ID,
  PQ019_HEIST_SECTOR_ID,
  heistLaunchVariant,
} from '../src/data/heistFacilities.js';
import {
  BREAKAWAY_PRESSURE,
  BREAKAWAY_RECOVERY_TYPE,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_TYPE,
} from '../src/data/heistMission.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const SYSTEMS = [
  physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime,
  spawnBudget, createTacticalAISystem(), aiPorts, missions,
];

function spawnPlayer(sim) {
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  sim.state.playerId = player.id;
  return player;
}

async function scene({ seed = 19505 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  // aiPorts drops every maneuver while the dynamic authority is not ready — NPC motion is only
  // honest proof against the production Rapier backend, so prepare it up front like the
  // pq195-04 delivery seam does.
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true,
    'proven against the production Rapier owner');
  state.player.heat = 0;
  state.player.credits = 5000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  spawnPlayer(sim);
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);

  const missionsSys = sim.registry.get('missions');
  const counts = { completed: 0, failed: 0, receiverCommits: 0 };
  bus.on('heist:receiverCommitted', () => { counts.receiverCommits++; });
  bus.on('mission:completed', () => { counts.completed++; });
  bus.on('mission:failed', () => { counts.failed++; });

  const t = {
    sim, state, bus, missionsSys, counts,
    budget: () => state.spawnBudget,
    step: (n = 1) => { for (let i = 0; i < n; i++) sim.step(SIM_DT); },
    stepUntil: (done, max) => { for (let i = 0; i < max; i++) { t.step(1); if (done()) return i + 1; } return max; },
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    load: () => {
      const id = state.heistFacilities?.capsuleEntityId;
      return id == null ? null : state.entities.get(id);
    },
    raiders: () => (state.entityList || []).filter((e) => e?.alive !== false
      && e.data?.missionTag && String(e.data.missionTag).length
      && e.type === 'ship' && e.team === 1),
    boundRaiderSlots: (missionId) => {
      const rec = state.spawnBudget?.reservations?.get(`heist:${missionId}`);
      return rec ? rec.count : 0;
    },
    stepToLaunch(max = 400) {
      for (let i = 0; i < max; i++) { t.step(1); if (t.load()) return true; }
      return false;
    },
    accept({ type = BREAKAWAY_RECOVERY_TYPE } = {}) {
      const row = missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID).slots
        .find((o) => o && o.type === type);
      assert.ok(row, `the Tethys board posts a ${type} row`);
      row.params.launchWindowS = 1;
      bus.emit('ui:acceptMission', { missionId: row.id });
      return t.mission();
    },
  };
  return t;
}

// ── (a) one bounded element through the ordinary arbiter ────────────────────────────────────────

test('(a) a live run spawns at most two light hulls plus one specialist, bound to the heist requester', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch(), 'the launcher throws the SP-07 assembly');

  const raiders = t.raiders();
  assert.ok(raiders.length >= 1, 'raiders spawned for the live run');
  assert.ok(raiders.length <= BREAKAWAY_PRESSURE.lightCount + 1,
    `never more than ${BREAKAWAY_PRESSURE.lightCount}+1 hulls`);
  const lights = raiders.filter((e) => BREAKAWAY_PRESSURE.lightPool.includes(e.data?.lootTableId));
  const specialists = raiders.filter((e) => e.data?.lootTableId === BREAKAWAY_PRESSURE.specialistTypeId);
  assert.ok(lights.length <= BREAKAWAY_PRESSURE.lightCount, 'at most two light hulls');
  assert.ok(specialists.length <= 1, 'at most one specialist');
  assert.equal(t.boundRaiderSlots(m.id) >= raiders.length, true,
    'the heist requester holds the raiders\' budget slots');
  for (const e of raiders) {
    assert.equal(t.budget().entityOwners.get(String(e.id)), `heist:${m.id}`,
      'each raider is bound to the run\'s requester id');
  }
  assert.equal(m.heist.pressureSpawned, true);
});

// ── (b) an intelligible committed run at the tug anchored on the assembly ───────────────────────

test('(b) each raider is committed to an approach on the tug anchored at the load — and closes', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  const load = t.load();
  const player = state => state.entities.get(state.playerId);

  const raiders = t.raiders();
  assert.ok(raiders.length >= 1);
  for (const e of raiders) {
    const activity = e.data?.ai?.activity;
    assert.equal(activity?.kind, 'attack_run', 'a concrete committed approach, not loiter');
    assert.equal(activity?.targetId, t.state.playerId,
      'the assignment names the tug (engagement authority is ship-to-ship)');
    assert.ok(Number.isFinite(activity?.anchor?.x) && Number.isFinite(activity?.anchor?.z),
      'the run is anchored on the assembly');
    const dAnchor = Math.hypot(activity.anchor.x - load.pos.x, activity.anchor.z - load.pos.z);
    assert.ok(dAnchor < 1e-6, 'the anchor IS the assembly position');
  }

  // The existing tactical owner flies the assignment: at least one raider measurably closes on
  // the tug over a few seconds of sim.
  const dist = () => Math.min(...t.raiders().map((e) => {
    const p = player(t.state);
    return Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
  }));
  const before = dist();
  t.step(360);
  const moving = t.raiders().some((e) => e.vel && Math.hypot(e.vel.x, e.vel.z) > 1);
  assert.equal(moving, true, 'the tactical owner is driving at least one raider');
  assert.ok(dist() < before, `raiders closed on the tug (${Math.round(before)} -> ${Math.round(dist())} WU)`);
  void m;
});

// ── (c) a settled run spawns nothing new and hands its slots back ───────────────────────────────

test('(c) settling the run releases the requester\'s slots and spawns nothing further', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  const spawned = t.raiders().length;
  assert.ok(spawned >= 1);

  // Destroy the load — a non-paying terminal outcome reached through the real arbiter.
  const load = t.load();
  load.hull = 0;
  load.alive = false;
  t.stepUntil(() => !t.mission(), 60);
  assert.equal(t.mission(), null, 'the destroyed run settled');
  assert.equal(t.boundRaiderSlots(m.id), 0, 'the requester\'s slots are released');

  // No reinforcement wave: more sim time produces no further pressure for the settled run.
  const after = t.raiders().length;
  t.step(120);
  assert.equal(t.raiders().length, after, 'nothing respawns after the run settles');
  void spawned;
});

// ── (d) a Capsule Run draws no breakaway pressure ───────────────────────────────────────────────

test('(d) the Capsule Run spawns no pressure element', async () => {
  const t = await scene();
  const m = t.accept({ type: PQ019C_HEIST_TYPE });
  assert.ok(m, 'the capsule recovery row is accepted');
  assert.equal(heistLaunchVariant(m.heist.variantId).id, HEIST_CAPSULE_RUN_VARIANT_ID);
  assert.ok(t.stepToLaunch(), 'the capsule launches');
  t.step(30);
  assert.equal(t.raiders().length, 0, 'no raiders for the ordinary capsule run');
  assert.equal(m.heist.pressureSpawned, undefined,
    'the capsule record does not even carry the pressure fields');
});

// ── (e) an unlaunched run draws no pressure ─────────────────────────────────────────────────────

test('(e) accepting the row without a launch spawns nothing', async () => {
  const t = await scene();
  const m = t.accept();
  t.step(60);
  assert.equal(t.raiders().length, 0, 'no assembly loose, no raiders');
  assert.equal(m.heist.pressureSpawned, false);
});

// ── (f) leaving the sector hands the slots back ─────────────────────────────────────────────────

test('(f) sector exit releases the pressure element\'s budget slots', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  assert.ok(t.raiders().length >= 1);
  assert.ok(t.boundRaiderSlots(m.id) >= 1);

  // A continuous membership handoff keeps the entities but still reaches the heist exit hook —
  // the slot handback is the claim under test.
  t.bus.emit('sector:exit', { sectorId: PQ019_HEIST_SECTOR_ID, continuous: true });
  assert.equal(t.boundRaiderSlots(m.id), 0, 'the run\'s slots are returned on the way out');
});
