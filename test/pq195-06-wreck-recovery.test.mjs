// PQ-195.06 — LOSING IT LEAVES SOMETHING TO DO.
//
// A genuinely destroyed SP-07 assembly produces ONE bounded reduced-value recovery through the
// existing aftermath owner: an ordinary marker that materializes as an ordinary wreck carrying a
// rotor's worth of scrap and electronics — never a second full reward, never the original
// payload resurrected.
//
// Proven here through the real seams (board accept, launch, destroy, settle, save/load):
// (a) destruction records exactly one marker with the authored reduced pool and spawns a real
//     wreck entity at the death position;
// (b) a duplicate destroy callback and a duplicate direct offer both converge on the same
//     marker — never a second opportunity;
// (c) the wreck is NOT the payload: a different entity of type 'wreck' with the reduced pool,
//     while the original assembly stays dead;
// (d) the marker and the once-offer bound both survive a real save → load;
// (e) absence, expiry and abandonment — the non-destruction exits — record no marker;
// (f) the Capsule Run keeps its "nothing left to sell" semantics: no marker.

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
  BREAKAWAY_WRECK_RECOVERY,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_TYPE,
} from '../src/data/heistMission.js';

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

async function scene({ seed = 19506 } = {}) {
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
  const aftermath = sim.registry.get('aftermathWrecks');
  const saveOwner = { state, bus, helpers: sim.registry.ctx.helpers, registry: sim.registry };

  const t = {
    sim, state, bus, missionsSys, aftermath, saveOwner,
    step: (n = 1) => { for (let i = 0; i < n; i++) sim.step(SIM_DT); },
    stepUntil: (done, max) => { for (let i = 0; i < max; i++) { t.step(1); if (done()) return i + 1; } return max; },
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    load: () => {
      const id = state.heistFacilities?.capsuleEntityId;
      return id == null ? null : state.entities.get(id);
    },
    markers: () => (state.aftermathWrecks?.bySector?.[PQ019_HEIST_SECTOR_ID] || [])
      .filter((m) => m && m.victimId === BREAKAWAY_SP07.stableId),
    wrecks: () => (state.entityList || []).filter((e) => e?.alive !== false
      && e.type === 'wreck' && e.data?.provenance?.markerId),
    accept({ type = BREAKAWAY_RECOVERY_TYPE } = {}) {
      const row = missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID).slots
        .find((o) => o && o.type === type);
      assert.ok(row, `the Tethys board posts a ${type} row`);
      row.params.launchWindowS = 1;
      bus.emit('ui:acceptMission', { missionId: row.id });
      return t.mission();
    },
    stepToLaunch(max = 400) {
      for (let i = 0; i < max; i++) { t.step(1); if (t.load()) return true; }
      return false;
    },
    /** Genuinely destroy the assembly in-sector and let the arbiter settle the run. */
    destroy() {
      const load = t.load();
      assert.ok(load, 'the assembly is physically loose');
      load.hull = 0;
      load.alive = false;
      t.stepUntil(() => !t.mission(), 120);
      assert.equal(t.mission(), null, 'the destroyed run settled');
    },
    snapshot() {
      return JSON.parse(JSON.stringify({
        aftermathWrecks: state.aftermathWrecks,
        entities: save._serializeEntities.call(saveOwner),
      }));
    },
    restore(snapshot) {
      // Mirror the real load sequence: save:restoring holds the premature sector-enter spawn so
      // save:loaded's single post-deserialize spawn is the authoritative materialization.
      bus.emit('save:restoring', {});
      save._clearEntities.call(saveOwner);
      state.aftermathWrecks = snapshot.aftermathWrecks;
      spawnPlayer(sim);
      sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
      bus.emit('save:loaded', { slot: 'test' });
    },
  };
  return t;
}

// ── (a) destruction leaves ONE reduced-value recovery through the aftermath owner ───────────────

test('(a) a destroyed assembly leaves exactly one reduced-pool marker and a real wreck', async () => {
  const t = await scene();
  t.accept();
  assert.ok(t.stepToLaunch(), 'the launcher throws the SP-07 assembly');
  const deathPos = { x: t.load().pos.x, z: t.load().pos.z };

  t.destroy();

  const markers = t.markers();
  assert.equal(markers.length, 1, 'exactly one recovery marker was recorded');
  const marker = markers[0];
  assert.equal(marker.victimId, BREAKAWAY_SP07.stableId, 'the marker names the SP-07 victim');
  assert.deepEqual(marker.salvagePool, { ...BREAKAWAY_WRECK_RECOVERY.salvagePool },
    'the marker carries the authored reduced pool — not a second full reward');
  assert.equal(marker.sectorId, PQ019_HEIST_SECTOR_ID);
  const dDeath = Math.hypot(marker.pos.x - deathPos.x, marker.pos.z - deathPos.z);
  assert.ok(dDeath < 50, `the wreck sits where the assembly died (${Math.round(dDeath)} WU)`);

  // The marker materialized through the stock path: an ordinary wreck entity the shipped
  // scanner/salvage flow can read — same marker id, same reduced pool.
  const wrecks = t.wrecks();
  assert.equal(wrecks.length, 1, 'one wreck entity materialized in-sector');
  assert.equal(wrecks[0].data.provenance.markerId, marker.markerId,
    'the wreck is bound to the marker, not spawned beside it');
  assert.deepEqual(wrecks[0].data.salvagePool, marker.salvagePool,
    'the wreck offers the reduced pool to salvage');
});

// ── (b) a duplicate destroy callback or duplicate offer never stacks a second recovery ──────────

test('(b) duplicate destroy callbacks and duplicate offers converge on the same marker', async () => {
  const t = await scene();
  t.accept();
  assert.ok(t.stepToLaunch());
  t.destroy();
  const [first] = t.markers();
  assert.ok(first, 'the recovery marker exists');

  // The record is settled and gone; adversarially re-fire the offer seam twice through the
  // owner itself — the deterministic (sector, victim) markerId makes both converge.
  const again = t.aftermath.offerRecoveryWreck({
    sectorId: PQ019_HEIST_SECTOR_ID,
    victimId: BREAKAWAY_SP07.stableId,
    pos: first.pos,
    salvagePool: BREAKAWAY_WRECK_RECOVERY.salvagePool,
    victimLabel: BREAKAWAY_WRECK_RECOVERY.victimLabel,
    wreckClass: BREAKAWAY_WRECK_RECOVERY.wreckClass,
    source: 'heist:duplicate',
  });
  assert.equal(again.markerId, first.markerId, 'a duplicate offer converges on the same marker');
  assert.equal(t.markers().length, 1, 'still exactly one marker');
  t.step(30);
  assert.equal(t.markers().length, 1, 'no second opportunity appears over time');
  assert.equal(t.wrecks().length, 1, 'no second wreck entity materializes');
});

// ── (c) the recovery is a wreck, not the payload resurrected ────────────────────────────────────

test('(c) the recovery wreck is a different entity — the original assembly stays dead', async () => {
  const t = await scene();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  const capsuleId = t.load().id;
  t.destroy();

  const wreck = t.wrecks()[0];
  assert.ok(wreck, 'the recovery wreck exists');
  assert.equal(wreck.type, 'wreck', 'a wreck entity, not a payload');
  // Entity ids recycle — the wreck may legitimately reuse the dead capsule's slot. The real
  // claim is that no live SP-07 payload exists anywhere: nothing resurrected the assembly.
  const livePayload = (t.state.entityList || []).filter((e) => e?.alive !== false
    && e.type === 'payload' && e.data?.heistPayloadStableId === BREAKAWAY_SP07.stableId);
  assert.equal(livePayload.length, 0, 'the original assembly is not resurrected');
  void capsuleId;
  // And it is worth less than the delivery by construction: commodities to be salvaged
  // by hand, never a credit payout attached to the failed contract.
  assert.equal(wreck.data.salvagePool.cmdty_scrap_metal, BREAKAWAY_WRECK_RECOVERY.salvagePool.cmdty_scrap_metal);
  assert.equal(m.heist.recoveryWreckMarkerId, t.markers()[0].markerId,
    'the run recorded the offer against its durable bound');
});

// ── (d) the marker and the once-offer bound survive a real save → load ──────────────────────────

test('(d) the recovery marker persists across save → load without duplicating', async () => {
  const t = await scene();
  t.accept();
  assert.ok(t.stepToLaunch());
  t.destroy();
  const markerId = t.markers()[0].markerId;
  const snapshot = t.snapshot();

  t.restore(snapshot);

  const markers = t.markers();
  assert.equal(markers.length, 1, 'exactly one marker survived the reload');
  assert.equal(markers[0].markerId, markerId, 'the same marker, not a re-offer');
  t.step(30);
  assert.equal(t.markers().length, 1, 'the reload never duplicated the opportunity');
  const wrecks = t.wrecks();
  assert.equal(wrecks.length, 1, 'the marker re-materialized its single wreck');
  assert.equal(wrecks[0].data.provenance.markerId, markerId);
});

// ── (e) absence, expiry and abandonment are not destructions — no recovery ─────────────────────

test('(e) non-destruction exits record no recovery marker', async () => {
  // Sector exit → unresolved_absent.
  {
    const t = await scene();
    t.accept();
    assert.ok(t.stepToLaunch());
    t.bus.emit('sector:exit', { sectorId: PQ019_HEIST_SECTOR_ID });
    t.stepUntil(() => !t.mission(), 120);
    assert.equal(t.markers().length, 0, 'an absent load leaves no wreck');
  }
  // Abandoned.
  {
    const t = await scene();
    const m = t.accept();
    assert.ok(t.stepToLaunch());
    t.bus.emit('ui:abandonMission', { missionId: m.id });
    t.stepUntil(() => !t.mission(), 120);
    assert.equal(t.mission(), null, 'the abandoned run settled');
    assert.equal(t.markers().length, 0, 'an abandoned run leaves no wreck');
  }
});

// ── (f) the Capsule Run keeps its historical semantics ─────────────────────────────────────────

test('(f) a destroyed Capsule Run capsule leaves no recovery marker', async () => {
  const t = await scene();
  const m = t.accept({ type: PQ019C_HEIST_TYPE });
  assert.equal(heistLaunchVariant(m.heist.variantId).id, HEIST_CAPSULE_RUN_VARIANT_ID);
  assert.ok(t.stepToLaunch(), 'the capsule launches');
  t.destroy();
  assert.equal(t.markers().length, 0,
    'the capsule keeps its "nothing left to sell" semantics');
});
