// PQ-195.07 — LEAVING TETHYS SUSPENDS THE JOB, RETURNING RESUMES IT.
//
// The Third Shift fiction promises a suspension at the sector boundary: flying out mid-recovery
// parks the run instead of paying it or silently failing it. The durable mission record carries
// the body snapshot (no facility save key, no second writer); the facility owner re-embodies the
// SAME body when the run's sector comes back.
//
// Proven through the real seams (board accept, launch, world.enterSector, missions.serialize):
// (a) exit after launch suspends — the contract stays active, pays nothing, settles nothing;
// (b) returning re-embodies the same run and the same body at the suspended position/velocity;
// (c) the resumed run still decides for real — destroying the body afterwards yields the
//     PQ-195.06 wreck recovery, not an absence;
// (d) duplicate boundary events and a return while already back stay idempotent — one run, one body;
// (e) a save → load taken while suspended out-of-sector resumes on return through the durable
//     record alone;
// (f) an unlaunched run keeps its existing "pending window preserved" semantics — it neither
//     suspends nor fabricates a body, and the schedule still fires on return;
// (g) the Capsule Run keeps its historical absence semantics — suspension is Third Shift only.

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
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { missions } from '../src/systems/missions.js';
import { save } from '../src/save/saveSystem.js';
import {
  BREAKAWAY_SP07,
  HEIST_CAPSULE_RUN_VARIANT_ID,
  PQ019_HEIST_SECTOR_ID,
  heistLaunchVariant,
} from '../src/data/heistFacilities.js';
import {
  BREAKAWAY_RECOVERY_TYPE,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_TYPE,
} from '../src/data/heistMission.js';

const AWAY_SECTOR_ID = 'sector_helios_prime';

const SYSTEMS = [
  physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime,
  aftermathWrecks, spawnBudget, missions,
];

function spawnPlayer(sim) {
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  sim.state.playerId = player.id;
  return player;
}

async function scene({ seed = 19507 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true,
    'proven against the production Rapier owner');
  state.player.heat = 0;
  state.player.credits = 5000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  spawnPlayer(sim);
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);

  const missionsSys = sim.registry.get('missions');
  const saveOwner = { state, bus, helpers: sim.registry.ctx.helpers, registry: sim.registry };

  const t = {
    sim, state, bus, missionsSys, saveOwner,
    step: (n = 1) => { for (let i = 0; i < n; i++) sim.step(SIM_DT); },
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    load: () => (state.entityList || []).find((e) => e?.alive !== false
      && e.type === 'payload' && e.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId) || null,
    capsule: () => (state.entityList || []).find((e) => e?.alive !== false
      && e.type === 'payload' && e.data?.heistFacilityRole === 'cargo_capsule') || null,
    sector: () => state.world.currentSectorId,
    accept({ type = BREAKAWAY_RECOVERY_TYPE } = {}) {
      const row = missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID).slots
        .find((o) => o && o.type === type);
      assert.ok(row, `the Tethys board posts a ${type} row`);
      row.params.launchWindowS = 1;
      bus.emit('ui:acceptMission', { missionId: row.id });
      return t.mission();
    },
    stepToLaunch(max = 400, find = () => t.load()) {
      for (let i = 0; i < max; i++) { t.step(1); if (find()) return true; }
      return false;
    },
    leave() {
      sim.registry.get('world').enterSector(AWAY_SECTOR_ID);
      assert.equal(t.sector(), AWAY_SECTOR_ID, 'the player left Tethys');
    },
    comeBack() {
      sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
      assert.equal(t.sector(), PQ019_HEIST_SECTOR_ID, 'the player returned to Tethys');
    },
  };
  return t;
}

// ── (a) exit after launch suspends: active contract, no payout, no settlement ───────────────────

test('(a) leaving Tethys mid-recovery suspends the run instead of settling it', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch(), 'the launcher throws the SP-07 assembly');
  assert.ok(t.load(), 'the assembly is physically loose');
  const creditsBefore = t.state.player.credits;

  t.leave();
  t.step(120);

  assert.ok(t.mission(), 'the contract is still active — it did not silently fail at the boundary');
  assert.equal(t.mission().id, m.id, 'it is the SAME contract');
  assert.equal(t.mission().heist.suspended, true, 'the record is parked as suspended');
  assert.equal(t.mission().heist.arbiter.receipt, null, 'no terminal receipt was decided');
  assert.equal(t.state.player.credits, creditsBefore, 'nothing paid at the boundary');
  assert.equal(t.load(), null, 'the body dematerialized with the sector');
});

// ── (b) returning re-embodies the same run and the same body ─────────────────────────────────────

test('(b) returning to Tethys resumes the same run with the same body', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  const body = t.load();
  const stableId = body.data.heistPayloadStableId;
  const scheduleId = m.heist.scheduleId;
  const launchTick = m.heist.launchTick;

  // Let the assembly drift so the snapshot is meaningfully non-zero.
  t.step(30);
  const suspendedPos = { x: body.pos.x, z: body.pos.z };
  const suspendedVel = { x: body.vel.x, z: body.vel.z };

  t.leave();
  t.step(60); // the run is parked — none of this counts against its window
  const awayTicks = 60;

  t.comeBack();
  t.step(3);

  const run = t.mission();
  assert.ok(run, 'the contract is still active after the return');
  assert.equal(run.id, m.id, 'the SAME run resumed — no new contract was fabricated');
  assert.equal(run.heist.suspended, false, 'the record is live again');
  assert.equal(run.heist.scheduleId, scheduleId, 'the same launch schedule still owns the run');
  assert.equal(run.heist.arbiter.receipt, null, 'no terminal outcome was invented while away');

  const resumed = t.load();
  assert.ok(resumed, 'the body is physically back in the sector');
  assert.equal(resumed.data.heistPayloadStableId, stableId, 'the same SP-07 assembly');
  assert.equal(resumed.data.launchScheduleId, scheduleId, 'the same custody identity');
  const dPos = Math.hypot(resumed.pos.x - suspendedPos.x, resumed.pos.z - suspendedPos.z);
  assert.ok(dPos < 200, `the body came back where it was parked (${Math.round(dPos)} WU)`);
  const dVel = Math.hypot(resumed.vel.x - suspendedVel.x, resumed.vel.z - suspendedVel.z);
  assert.ok(dVel < 50, `the body kept its drift, not a fresh launch arc (${Math.round(dVel)} WU/s)`);
  assert.ok(run.heist.launchTick > launchTick,
    'the away stretch never counted against the run window');
  assert.ok(run.heist.launchTick - launchTick >= awayTicks,
    'the boundary suspension shifted the window by at least the away time');
});

// ── (c) the resumed run still decides for real ──────────────────────────────────────────────────

test('(c) destroying the resumed body yields the wreck recovery — not an absence', async () => {
  const t = await scene();
  t.accept();
  assert.ok(t.stepToLaunch());
  t.leave();
  t.step(30);
  t.comeBack();
  t.step(3);
  const resumed = t.load();
  assert.ok(resumed, 'the body came back');

  resumed.hull = 0;
  resumed.alive = false;
  for (let i = 0; i < 120 && t.mission(); i++) t.step(1);
  assert.equal(t.mission(), null, 'the resumed run settled on a real outcome');

  const markers = (t.state.aftermathWrecks?.bySector?.[PQ019_HEIST_SECTOR_ID] || [])
    .filter((mk) => mk && mk.victimId === BREAKAWAY_SP07.stableId);
  assert.equal(markers.length, 1,
    'the resumed body was genuinely destroyed — the PQ-195.06 recovery was offered, never an absence lie');
});

// ── (d) duplicate boundary events stay idempotent ────────────────────────────────────────────────

test('(d) repeated exits and entries never duplicate the run or the body', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  const scheduleId = m.heist.scheduleId;

  t.leave();
  // A second exit emission against an already-suspended run must be a no-op.
  t.bus.emit('sector:exit', { sectorId: PQ019_HEIST_SECTOR_ID });
  t.step(30);
  t.comeBack();
  t.step(2);
  // A second enter emission while already resumed must not spawn a second body.
  t.bus.emit('sector:enter', { sectorId: PQ019_HEIST_SECTOR_ID });
  t.step(10);

  const bodies = (t.state.entityList || []).filter((e) => e?.alive !== false
    && e.type === 'payload' && e.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId);
  assert.equal(bodies.length, 1, 'exactly one assembly exists — no duplicate body');
  assert.equal(bodies[0].data.launchScheduleId, scheduleId);
  assert.equal(t.mission()?.heist.suspended, false, 'the run is live');
  assert.equal(t.mission()?.heist.arbiter.receipt, null, 'nothing was decided by the duplicates');
});

// ── (e) suspension survives save → load while out-of-sector ─────────────────────────────────────

test('(e) a save taken while suspended resumes on return through the durable record alone', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.step(30);
  const suspendedPos = { x: t.load().pos.x, z: t.load().pos.z };
  const scheduleId = m.heist.scheduleId;

  t.leave();
  t.step(10);
  assert.equal(t.mission().heist.suspended, true, 'parked before the save');

  // Serialize exactly what the save owner carries: missions (holding the nested heist record)
  // and entities. state.heistFacilities is deliberately NOT captured — the record is the authority.
  const savedMissions = JSON.parse(JSON.stringify(t.missionsSys.serialize()));
  const savedEntities = JSON.parse(JSON.stringify(
    save._serializeEntities.call(t.saveOwner)));

  // Load still out-of-sector: the record must stay parked, not reconcile to absent.
  t.bus.emit('save:restoring', {});
  save._clearEntities.call(t.saveOwner);
  spawnPlayer(t.sim);
  t.missionsSys.deserialize(savedMissions);
  void savedEntities;
  t.bus.emit('save:loaded', { slot: 'test' });
  t.step(10);

  const parked = t.mission();
  assert.ok(parked, 'the contract survived the reload');
  assert.equal(parked.heist.suspended, true, 'still suspended — no absent-after-reload lie');
  assert.equal(parked.heist.arbiter.receipt, null, 'nothing decided while parked');
  assert.equal(parked.heist.suspendedLoad?.pos?.x, suspendedPos.x,
    'the parked body snapshot rode the durable record');

  t.comeBack();
  t.step(3);

  const run = t.mission();
  assert.ok(run && run.heist.suspended === false, 'the run resumed on return');
  const resumed = t.load();
  assert.ok(resumed, 'the facility re-embodied the body from the record alone');
  assert.equal(resumed.data.launchScheduleId, scheduleId, 'the same custody identity');
  const dPos = Math.hypot(resumed.pos.x - suspendedPos.x, resumed.pos.z - suspendedPos.z);
  assert.ok(dPos < 200, `the body came back near its parked position (${Math.round(dPos)} WU)`);
});

// ── (f) an unlaunched run keeps its pending-window semantics ────────────────────────────────────

test('(f) leaving before launch keeps the pending window — no suspension, no fabricated body', async () => {
  const t = await scene();
  const m = t.accept();
  t.step(5);
  assert.equal(t.load(), null, 'nothing launched yet');

  t.leave();
  t.step(30);
  const parked = t.mission();
  assert.ok(parked, 'the contract is still active');
  assert.notEqual(parked.heist.suspended, true,
    'an unlaunched run has no body to park — it is not suspended');
  assert.equal(parked.heist.suspendedLoad, null, 'no body snapshot was fabricated');
  assert.equal(parked.heist.arbiter.receipt, null, 'the boundary decided nothing');

  t.comeBack();
  assert.ok(t.stepToLaunch(), 'the preserved schedule still throws the assembly on return');
  assert.equal(t.mission()?.id, m.id, 'the same run, now launched');
});

// ── (g) the Capsule Run keeps its historical absence semantics ──────────────────────────────────

test('(g) a Capsule Run exit still resolves absent — suspension is Third Shift only', async () => {
  const t = await scene();
  const m = t.accept({ type: PQ019C_HEIST_TYPE });
  assert.equal(heistLaunchVariant(m.heist.variantId).id, HEIST_CAPSULE_RUN_VARIANT_ID);
  assert.ok(t.stepToLaunch(400, () => t.capsule()), 'the capsule launches');

  t.leave();
  for (let i = 0; i < 120 && t.mission(); i++) t.step(1);
  assert.equal(t.mission(), null, 'the capsule run still settles on the boundary');
  assert.notEqual(m.heist.suspended, true, 'the capsule run never suspends');
});
