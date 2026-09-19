// PQ-195.08 — THE SP-07 STARTS CLAMPED TO A MOVING CARRIER, AND RELEASE IS PHYSICAL.
//
// Slice C of the Third Shift: the assembly does not leave the launcher free-flying. A real yard
// tug (a `ship_hawser` hull with ordinary flight fields and `data.intent`, executed by flightV3)
// hauls it out of the same launch mouth on the same heading, held by the ordinary attachment
// service — `attachment_transport_clamp`, one existing constraint kind, no new physics. Release
// happens three honest ways and never writes momentum: the tug's voluntary cut at the authored
// route point, the clamp subsystem disabled, or the carrier lost (`breakOrphans`).
//
// Proven through the real seams (board accept, launch, flightV3, attachments.cut/breakOrphans):
// (a) the launch produces a real carrier hull with the load clamped to it — one body, one joint,
//     one schedule, one launch event;
// (b) the tug PHYSICALLY tows the load down the breakaway heading — both bodies transit and the
//     joint holds the gap bounded, it is not a scripted carry;
// (c) at the authored route point the carrier's own `cut` releases the load — the joint dies with
//     reason `transport_release`, the SAME body keeps its momentum, and the run stays live;
// (d) losing the carrier mid-run frees the load through `breakOrphans` — the body is free with
//     real momentum, the run never fabricates a release or a payout;
// (e) the released body is still the same physical obligation — destroying it afterwards yields
//     the PQ-195.06 wreck recovery, not an absence;
// (f) a save → load while clamped drops the transient carrier cleanly — one body, no dup joint,
//     the run still decides;
// (g) the Capsule Run is unchanged — no carrier, no clamp, the free arc stays.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { missions } from '../src/systems/missions.js';
import { save } from '../src/save/saveSystem.js';
import {
  BREAKAWAY_CARRIER,
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
  physics, world, heistFacilities, flightV3, combat, lawSecurity, heat, npcJobsRuntime,
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

async function scene({ seed = 19508 } = {}) {
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
  const combatSys = sim.registry.get('combat');
  const saveOwner = { state, bus, helpers: sim.registry.ctx.helpers, registry: sim.registry };
  const launchEvents = [];
  bus.on('heist:capsuleLaunched', (p) => launchEvents.push(p));

  const t = {
    sim, state, bus, missionsSys, combatSys, saveOwner, launchEvents,
    attachments: () => combatSys.kernel.attachments,
    step: (n = 1) => { for (let i = 0; i < n; i++) sim.step(SIM_DT); },
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    load: () => (state.entityList || []).find((e) => e?.alive !== false
      && e.type === 'payload' && e.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId) || null,
    capsule: () => (state.entityList || []).find((e) => e?.alive !== false
      && e.type === 'payload' && e.data?.heistFacilityRole === 'cargo_capsule') || null,
    carrier: () => (state.entityList || []).find((e) => e?.alive !== false
      && e.type === 'ship' && e.data?.heistFacilityRole === 'transport_carrier') || null,
    clamp: () => {
      const id = state.heistFacilities?.clampAttachmentId;
      return id != null ? t.attachments().get(id) : null;
    },
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
    stepUntil(pred, max = 3000) {
      for (let i = 0; i < max; i++) { t.step(1); if (pred()) return true; }
      return false;
    },
  };
  return t;
}

// ── (a) the launch produces a real carrier with the load clamped to it ──────────────────────────

test('(a) the Third Shift launch produces a real carrier hull towing the clamped SP-07', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch(), 'the launcher throws the assembly');
  t.step(10); // the joint binds on the first physics step after the bodies register

  const load = t.load();
  const carrier = t.carrier();
  const clamp = t.clamp();
  assert.ok(load, 'the SP-07 body exists');
  assert.ok(carrier, 'a real ship hull carries it — not a prop');
  assert.equal(carrier.data.defId, BREAKAWAY_CARRIER.shipId, 'the authored yard tug');
  assert.equal(carrier.factionId, BREAKAWAY_CARRIER.factionId, 'MTS logistics runs the shipment');
  assert.ok(clamp, 'the transport clamp exists');
  assert.equal(clamp.state, 'active');
  assert.equal(clamp.defId, 'attachment_transport_clamp', 'the authored clamp, not an ad hoc tether');
  assert.equal(clamp.ownerId, carrier.id, 'the carrier owns the joint');
  assert.equal(clamp.targetId, load.id, 'the joint binds the same SP-07 body');

  const bodies = t.state.entityList.filter((e) => e?.alive !== false
    && e.type === 'payload' && e.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId);
  assert.equal(bodies.length, 1, 'exactly one assembly exists — the launch made no second body');
  assert.equal(t.launchEvents.length, 1, 'one launch event');
  assert.equal(t.launchEvents[0].scheduleId, m.heist.scheduleId, 'the same schedule');
  assert.equal(t.launchEvents[0].capsuleEntityId, load.id, 'the clamped body IS the run\'s load');
  assert.equal(m.heist.capsuleEntityId, load.id, 'the mission tracks the clamped body');
});

// ── (b) the tug physically tows the load ─────────────────────────────────────────────────────────

test('(b) the carrier physically tows the load down the breakaway heading', async () => {
  const t = await scene();
  t.accept();
  assert.ok(t.stepToLaunch());
  const load = t.load();
  const carrier = t.carrier();
  const startLoad = { x: load.pos.x, z: load.pos.z };
  const startCarrier = { x: carrier.pos.x, z: carrier.pos.z };

  t.step(300); // five seconds of caged transit

  assert.ok(t.clamp() && t.clamp().state === 'active', 'the joint is still live');
  const dCarrier = Math.hypot(carrier.pos.x - startCarrier.x, carrier.pos.z - startCarrier.z);
  const dLoad = Math.hypot(load.pos.x - startLoad.x, load.pos.z - startLoad.z);
  assert.ok(dCarrier > 80, `the tug genuinely transited (${Math.round(dCarrier)} WU)`);
  assert.ok(dLoad > 60, `the load moved WITH it (${Math.round(dLoad)} WU) — towed, not scripted`);
  const gap = Math.hypot(load.pos.x - carrier.pos.x, load.pos.z - carrier.pos.z);
  assert.ok(gap < 120, `the joint holds the cage at standoff (${Math.round(gap)} WU)`);
  const loadSpeed = Math.hypot(load.vel.x, load.vel.z);
  assert.ok(loadSpeed > 5, `the load carries real momentum (${Math.round(loadSpeed)} WU/s)`);
});

// ── (c) voluntary release at the authored route point ───────────────────────────────────────────

test('(c) the carrier cuts the clamp at the route point — same body, kept momentum, live run', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.step(10); // the joint binds on the first physics step after the bodies register
  const load = t.load();
  const loadId = load.id;
  const clampId = t.state.heistFacilities.clampAttachmentId;
  assert.ok(clampId != null, 'the clamp bound');

  assert.ok(t.stepUntil(() => t.state.heistFacilities.carrierReleased === true, 4000),
    'the tug reached the authored route point and let go');
  const released = t.attachments().get(clampId);
  assert.equal(released.state, 'broken', 'the joint is cut');
  assert.equal(released.breakReason, 'transport_release',
    'the voluntary release — not a break, not a script');

  const body = t.load();
  assert.ok(body, 'the released body is still in the world');
  assert.equal(body.id, loadId, 'it is the SAME body — release did not respawn it');
  assert.equal(body.data.launchScheduleId, m.heist.scheduleId, 'the same custody identity');
  const speed = Math.hypot(body.vel.x, body.vel.z);
  assert.ok(speed > 5, `the release preserved momentum (${Math.round(speed)} WU/s) — no impulse trick`);
  assert.ok(t.mission(), 'the run is still live — release is the encounter, not an outcome');
  assert.equal(t.mission().heist.arbiter.receipt, null, 'nothing was settled by the release');
  assert.equal(t.launchEvents.length, 1, 'still one launch — release was not a new launch');

  // The tug is a bounded transient: it flies its departure lane and leaves the world.
  assert.ok(t.stepUntil(() => t.carrier() === null, 4000), 'the carrier departs after release');
  assert.equal(t.state.heistFacilities.carrierEntityId, null, 'its bookkeeping is cleared');
});

// ── (d) losing the carrier frees the load through breakOrphans ──────────────────────────────────

test('(d) destroying the carrier frees the load — real momentum, live run, no fabrication', async () => {
  const t = await scene();
  t.accept();
  assert.ok(t.stepToLaunch());
  const load = t.load();
  const carrier = t.carrier();
  const loadId = load.id;
  const clampId = t.state.heistFacilities.clampAttachmentId;
  const creditsBefore = t.state.player.credits;

  carrier.hull = 0;
  carrier.alive = false;
  t.step(30);

  const clamp = t.attachments().get(clampId);
  assert.ok(!clamp || clamp.state !== 'active', 'the orphan sweep removed the joint');
  const body = t.load();
  assert.ok(body, 'the load survived the carrier loss');
  assert.equal(body.id, loadId, 'the SAME body — no respawn');
  const speed = Math.hypot(body.vel.x, body.vel.z);
  assert.ok(speed > 3, `it kept the tow\'s momentum (${Math.round(speed)} WU/s)`);
  assert.ok(t.mission(), 'the run is still live — the load is the obligation, not the tug');
  assert.equal(t.mission().heist.arbiter.receipt, null, 'the loss decided nothing by itself');
  assert.equal(t.state.player.credits, creditsBefore, 'no payout was fabricated');
});

// ── (e) the released body is still the same physical obligation ─────────────────────────────────

test('(e) destroying the released body yields the wreck recovery — the same obligation', async () => {
  const t = await scene();
  t.accept();
  assert.ok(t.stepToLaunch());
  assert.ok(t.stepUntil(() => t.state.heistFacilities.carrierReleased === true, 4000),
    'the carrier let go');
  const body = t.load();
  assert.ok(body, 'the released body is loose');

  body.hull = 0;
  body.alive = false;
  for (let i = 0; i < 200 && t.mission(); i++) t.step(1);
  assert.equal(t.mission(), null, 'the run settled on a real outcome');

  const markers = (t.state.aftermathWrecks?.bySector?.[PQ019_HEIST_SECTOR_ID] || [])
    .filter((mk) => mk && mk.victimId === BREAKAWAY_SP07.stableId);
  assert.equal(markers.length, 1,
    'the released body was genuinely destroyed — the PQ-195.06 recovery was offered');
});

// ── (f) a save while clamped drops the transient carrier cleanly ────────────────────────────────

test('(f) a save taken while clamped drops the carrier — one body, no dup joint, live run', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  const scheduleId = m.heist.scheduleId;
  const savedPos = { x: t.load().pos.x, z: t.load().pos.z };
  t.step(30);
  const savedMissions = JSON.parse(JSON.stringify(t.missionsSys.serialize()));
  const savedEntities = JSON.parse(JSON.stringify(save._serializeEntities.call(t.saveOwner)));

  t.bus.emit('save:restoring', {});
  save._clearEntities.call(t.saveOwner);
  spawnPlayer(t.sim);
  t.missionsSys.deserialize(savedMissions);
  save._spawnPersistentEntities.call(t.saveOwner, savedEntities && savedEntities.persistent, null);
  t.bus.emit('save:loaded', { slot: 'test' });
  t.step(30);

  const bodies = t.state.entityList.filter((e) => e?.alive !== false
    && e.type === 'payload' && e.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId);
  assert.equal(bodies.length, 1, 'exactly one assembly survives the reload');
  assert.equal(bodies[0].data.launchScheduleId, scheduleId, 'the same durable body — recycled id, same custody identity');
  const dPos = Math.hypot(bodies[0].pos.x - savedPos.x, bodies[0].pos.z - savedPos.z);
  assert.ok(dPos < 200, `it restored near where it was saved — the drift since is real motion (${Math.round(dPos)} WU)`);
  assert.equal(t.carrier(), null, 'the transient carrier did not reload');
  const stale = t.state.heistFacilities.clampAttachmentId;
  const clamp = stale != null ? t.attachments().get(stale) : null;
  assert.ok(!clamp || clamp.state !== 'active', 'no live joint pretends the tug is still there');
  assert.ok(t.mission(), 'the run is still live');
  assert.equal(t.mission().heist.arbiter.receipt, null, 'nothing was fabricated across the load');
});

// ── (g) the Capsule Run is unchanged ────────────────────────────────────────────────────────────

test('(g) the Capsule Run still launches free — no carrier, no clamp', async () => {
  const t = await scene();
  const m = t.accept({ type: PQ019C_HEIST_TYPE });
  assert.equal(heistLaunchVariant(m.heist.variantId).id, HEIST_CAPSULE_RUN_VARIANT_ID);
  assert.ok(t.stepToLaunch(400, () => t.capsule()), 'the capsule launches');

  const capsule = t.capsule();
  assert.ok(capsule, 'the capsule is loose');
  assert.equal(t.carrier(), null, 'no carrier was spawned for the historical variant');
  assert.equal(t.state.heistFacilities.clampAttachmentId, null, 'no clamp was created');
  const speed = Math.hypot(capsule.vel.x, capsule.vel.z);
  assert.ok(speed > 40, `the free ballistic arc is unchanged (${Math.round(speed)} WU/s)`);
});
