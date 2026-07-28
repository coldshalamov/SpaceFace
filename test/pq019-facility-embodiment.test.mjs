import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { Masks } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import {
  PQ019_CAPSULE,
  PQ019_FACILITIES,
  PQ019_FACILITY_POIS,
  PQ019_HEIST_SECTOR_ID,
} from '../src/data/heistFacilities.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { buildSystemModel, resolveCourseTarget } from '../src/ui/galaxyMap.js';
import {
  PRODUCTION_FEATURES,
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';

// Canonical authored projection: root + rotate((socket - visualCenter) * scale).
// Pinning these independently keeps the physical custody envelope from agreeing
// with an incorrectly implemented helper by construction.
const EXPECTED_HEAD_LOCAL = Object.freeze({
  heist_launcher: Object.freeze({
    x: 1509.2701024392563,
    z: -2009.4793777491086,
  }),
  lawful_catcher: Object.freeze({
    x: -393.58684663122847,
    z: -1272.82828201166,
  }),
  fence_receiver: Object.freeze({
    x: -1315.6454373542344,
    z: 411.96793739926636,
  }),
});

const EXPECTED_ROUTE_LEGS = Object.freeze([
  Object.freeze({
    from: 'heist_launcher',
    to: 'lawful_catcher',
    distance: 2040.470388287225,
  }),
  Object.freeze({
    from: 'lawful_catcher',
    to: 'fence_receiver',
    distance: 1920.606764974925,
  }),
]);

function boot(seed = 19019) {
  const bus = createBus();
  const sim = createSimulation({
    seed,
    bus,
    systems: [physics, world, heistFacilities],
  });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    radius: 12,
    mass: 24,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  const events = [];
  for (const name of [
    'heist:launchScheduleReceipt',
    'heist:capsuleLaunched',
    'heist:facilityCandidate',
  ]) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  return { sim, state, bus, player, events, system: sim.registry.get('heistFacilities') };
}

function roleEntities(state, role) {
  return state.entityList.filter((entity) => (
    entity?.alive !== false && entity.data?.heistFacilityRole === role
  ));
}

function spawnCapsuleImpostor(t, launchScheduleId) {
  return t.sim.spawn({
    type: 'payload',
    pos: { x: 0, z: 0 },
    radius: PQ019_CAPSULE.radius,
    mass: PQ019_CAPSULE.mass,
    hull: PQ019_CAPSULE.hull,
    hullMax: PQ019_CAPSULE.hull,
    collides: false,
    data: {
      heistFacilityRole: 'cargo_capsule',
      heistPayloadStableId: PQ019_CAPSULE.stableId,
      authoredPayloadAssetId: PQ019_CAPSULE.authoredPayloadAssetId,
      launchScheduleId,
      runtimeOwner: 'heistFacilities',
    },
  });
}

test('Tethys exposes three ordinary delegated Atlas POIs and materializes their authored facilities once', () => {
  const sector = SECTORS.find((entry) => entry.id === PQ019_HEIST_SECTOR_ID);
  assert.ok(sector);
  for (const poi of PQ019_FACILITY_POIS) {
    const live = sector.pois.find((entry) => entry.id === poi.id);
    assert.ok(live, `${poi.id} is in the ordinary sector POI catalog`);
    assert.equal(live.runtimeOwner, 'heistFacilities');
    assert.equal(live.hidden, false);
    assert.deepEqual(live.pos, PQ019_FACILITIES[poi.id].localPos);
  }

  const t = boot();
  assert.equal(
    t.state.world.activeSector.pois.some((entry) => PQ019_FACILITY_POIS.some((poi) => poi.id === entry.poiId)),
    false,
    'world does not fork a second marker beside delegated physical facilities',
  );

  for (const facility of Object.values(PQ019_FACILITIES)) {
    const visuals = roleEntities(t.state, `${facility.role}_visual`);
    const heads = roleEntities(t.state, `${facility.role}_head`);
    assert.equal(visuals.length, 1, `${facility.id} has one visible authored root`);
    assert.equal(heads.length, 1, `${facility.id} has one physical socket head`);

    const visual = visuals[0];
    assert.equal(visual.type, 'fx');
    assert.equal(visual.collides, false);
    assert.equal(visual.data.placeId, facility.placeId);
    assert.equal(visual.data.placeScale, facility.placeScale);

    const head = heads[0];
    const localHead = EXPECTED_HEAD_LOCAL[facility.id];
    const origin = sectorGlobalOrigin(PQ019_HEIST_SECTOR_ID);
    assert.ok(Math.abs(head.pos.x - (origin.x + localHead.x)) < 1e-9);
    assert.ok(Math.abs(head.pos.z - (origin.z + localHead.z)) < 1e-9);
    assert.equal(head.type, 'fx', 'receiver head is not a station/docking target');
    assert.equal(head._noMesh, true);
    assert.equal(head.collides, true);
    assert.equal(head.collisionMask, Masks.PAYLOAD, 'head declares PAYLOAD-only custody filtering');
    assert.equal(head.data.payloadCustodyOnly, true);
    assert.equal(head.physicsBody.dynamic, false);
  }

  for (const leg of EXPECTED_ROUTE_LEGS) {
    const start = EXPECTED_HEAD_LOCAL[leg.from];
    const end = EXPECTED_HEAD_LOCAL[leg.to];
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    assert.ok(Number.isFinite(distance) && distance > 0, `${leg.from} -> ${leg.to} is non-degenerate`);
    assert.ok(Math.abs(distance - leg.distance) < 1e-9, `${leg.from} -> ${leg.to} remains at its pinned length`);
  }

  const owned = t.state.entityList.filter((entity) => (
    entity?.alive !== false && entity.data?.runtimeOwner === 'heistFacilities'
  ));
  assert.equal(owned.length, 6, 'the idle route is bounded to three visual roots and three socket heads');
  assert.equal(owned.filter((entity) => entity.collides).length, 3, 'only the three socket heads collide while idle');

  t.system.materializeForSector(PQ019_HEIST_SECTOR_ID);
  for (const facility of Object.values(PQ019_FACILITIES)) {
    assert.equal(roleEntities(t.state, `${facility.role}_visual`).length, 1);
    assert.equal(roleEntities(t.state, `${facility.role}_head`).length, 1);
  }
});

test('schedule intent is deterministic, idempotent, competing-safe, and launches at most one foreign physical capsule', () => {
  const t = boot(19020);
  const cargoBefore = structuredClone(t.state.player.cargo);
  const request = {
    scheduleId: 'pq019a-fixed-route',
    launchAtSimT: t.state.simTime + SIM_DT * 2,
  };

  t.system.init(t.sim.registry.ctx);
  t.bus.emit('heist:requestLaunchSchedule', request);
  const publicReceipts = t.events.filter((entry) => entry.name === 'heist:launchScheduleReceipt');
  assert.equal(publicReceipts.length, 1, 'one public intent produces exactly one normalized receipt');
  const accepted = publicReceipts[0].payload;
  assert.equal(t.state.heistFacilities.schedule.scheduleId, request.scheduleId);
  assert.equal(t.state.heistFacilities.schedule.status, 'scheduled');
  const replay = t.system.requestLaunchSchedule(request);
  const competing = t.system.requestLaunchSchedule({
    scheduleId: 'pq019a-competing-route',
    launchAtSimT: request.launchAtSimT,
  });
  assert.equal(accepted.accepted, true);
  assert.deepEqual(replay, accepted, 'identical retry returns the same receipt');
  assert.equal(competing.accepted, false);
  assert.equal(competing.reason, 'active_schedule');

  for (let index = 0; index < 5; index++) t.sim.step(SIM_DT);
  const capsules = roleEntities(t.state, 'cargo_capsule');
  assert.equal(capsules.length, 1);
  const capsule = capsules[0];
  assert.equal(capsule.type, 'payload');
  assert.equal(capsule.radius, PQ019_CAPSULE.radius);
  assert.equal(capsule.mass, PQ019_CAPSULE.mass);
  assert.equal(capsule.collides, true);
  assert.equal(capsule.physicsBody.dynamic, true);
  assert.equal(capsule.physicsBody.ccd, true);
  assert.equal(capsule.data.authoredPayloadAssetId, 'pod_cargo_container');
  assert.equal(capsule.data.legalOwnerFactionId, 'faction_mts');
  assert.notEqual(capsule.data.ownerId, t.state.playerId);
  assert.deepEqual(t.state.player.cargo, cargoBefore, 'capsule never enters hidden player cargo');
  assert.equal(t.state.heistFacilities.schedule.status, 'launched');
  assert.equal(t.events.filter((entry) => entry.name === 'heist:capsuleLaunched').length, 1);
  const ownedAfterLaunch = t.state.entityList.filter((entity) => (
    entity?.alive !== false && entity.data?.runtimeOwner === 'heistFacilities'
  ));
  assert.equal(ownedAfterLaunch.length, 7, 'one active schedule adds exactly one capsule');
  assert.equal(ownedAfterLaunch.filter((entity) => entity.collides).length, 4);

  for (let index = 0; index < 30; index++) t.sim.step(SIM_DT);
  assert.equal(roleEntities(t.state, 'cargo_capsule').length, 1);
  assert.equal(t.events.filter((entry) => entry.name === 'heist:capsuleLaunched').length, 1);
});

test('facility envelopes clear Anvil, stay in their authored zones, and expose public map courses', () => {
  const anvil = zonesForSector(PQ019_HEIST_SECTOR_ID)
    .find((zone) => zone.id === PLANET_SITE.zoneId);
  const checkpoint = zonesForSector(PQ019_HEIST_SECTOR_ID)
    .find((zone) => zone.id === 'zone_tethys_checkpoint');
  const blackMarket = zonesForSector(PQ019_HEIST_SECTOR_ID)
    .find((zone) => zone.id === 'zone_tethys_blackmkt');
  assert.ok(anvil && checkpoint && blackMarket);

  const launcher = EXPECTED_HEAD_LOCAL.heist_launcher;
  const catcher = EXPECTED_HEAD_LOCAL.lawful_catcher;
  const fence = EXPECTED_HEAD_LOCAL.fence_receiver;
  const anvilOutward = {
    x: launcher.x - anvil.center.x,
    z: launcher.z - anvil.center.z,
  };
  const launcherClearance = Math.hypot(anvilOutward.x, anvilOutward.z)
    - PLANET_SITE.bodyRadius;
  assert.ok(Math.abs(launcherClearance - 56.416128042107744) < 1e-9);
  assert.ok(
    launcherClearance
      > PQ019_FACILITIES.heist_launcher.headRadius + PQ019_CAPSULE.radius + 2,
    'launcher socket and capsule clear the Anvil body envelope',
  );
  const launchDirection = {
    x: catcher.x - launcher.x,
    z: catcher.z - launcher.z,
  };
  assert.ok(
    launchDirection.x * anvilOutward.x + launchDirection.z * anvilOutward.z > 0,
    'launcher-to-catcher route initially departs the Anvil body',
  );

  assert.ok(
    Math.hypot(catcher.x - checkpoint.center.x, catcher.z - checkpoint.center.z)
      + PQ019_FACILITIES.lawful_catcher.headRadius <= checkpoint.radius,
    'catcher custody envelope remains inside the Customs Checkpoint zone',
  );
  assert.ok(
    Math.hypot(fence.x - blackMarket.center.x, fence.z - blackMarket.center.z)
      + PQ019_FACILITIES.fence_receiver.headRadius <= blackMarket.radius,
    'fence custody envelope remains inside the Quiet Cache zone',
  );

  const t = boot(19025);
  const model = buildSystemModel(t.state, PQ019_HEIST_SECTOR_ID);
  for (const facility of Object.values(PQ019_FACILITIES)) {
    const matches = model.points.filter((point) => point.id === facility.id);
    assert.equal(matches.length, 1, `${facility.id} has one public system-map marker`);
    assert.deepEqual(matches[0].drawPos, facility.localPos);
    const course = resolveCourseTarget(matches[0]);
    assert.equal(course?.type, 'poi');
    assert.equal(course?.autopilot, true);
    assert.ok(Number.isFinite(course?.pos?.x) && Number.isFinite(course?.pos?.z));
  }
});

test('forged and stale capsule identities cannot bind a schedule or emit custody candidates', () => {
  const t = boot(19022);
  const scheduleId = 'pq019a-identity';
  const forged = spawnCapsuleImpostor(t, 'forged-schedule');

  t.system.requestLaunchSchedule({
    scheduleId,
    launchAtSimT: t.state.simTime,
  });
  t.sim.step(SIM_DT);

  const owned = t.state.heistFacilities;
  const active = t.state.entities.get(owned.capsuleEntityId);
  assert.ok(active);
  assert.notEqual(active.id, forged.id, 'role + stable id cannot impersonate the active capsule');
  assert.equal(owned.schedule.capsuleEntityId, active.id);
  assert.equal(active.data.launchScheduleId, scheduleId);

  const catcher = roleEntities(t.state, 'lawful_catcher_head')[0];
  const metadataTwin = spawnCapsuleImpostor(t, scheduleId);
  for (const impostor of [forged, metadataTwin]) {
    t.bus.emit('physics:impact', {
      tick: t.state.tick + impostor.id,
      aId: impostor.id,
      bId: catcher.id,
      dp: 50,
      pos: { x: catcher.pos.x, z: catcher.pos.z },
    });
  }
  assert.equal(
    t.events.filter((entry) => entry.name === 'heist:facilityCandidate').length,
    0,
    'non-active capsules cannot produce custody candidates even with matching metadata',
  );

  t.bus.emit('physics:impact', {
    tick: t.state.tick + 100,
    aId: active.id,
    bId: catcher.id,
    dp: 50,
    pos: { x: catcher.pos.x, z: catcher.pos.z },
  });
  assert.equal(
    t.events.filter((entry) => entry.name === 'heist:facilityCandidate').length,
    1,
    'the active schedule-bound capsule remains eligible',
  );

  t.sim.registry.ctx.helpers.removeEntity(active.id);
  t.sim.step(SIM_DT);
  assert.equal(t.state.heistFacilities.capsuleEntityId, null);
  assert.equal(t.state.heistFacilities.schedule.capsuleEntityId, null);
  const stale = spawnCapsuleImpostor(t, scheduleId);
  t.bus.emit('physics:impact', {
    tick: t.state.tick + 200,
    aId: stale.id,
    bId: catcher.id,
    dp: 50,
    pos: { x: catcher.pos.x, z: catcher.pos.z },
  });
  assert.equal(
    t.events.filter((entry) => entry.name === 'heist:facilityCandidate').length,
    1,
    'a former schedule identity cannot be revived after the active capsule is gone',
  );
});

test('sector exit preserves a pending schedule and deterministically cleans an active transient capsule', () => {
  const pending = boot(19023);
  pending.system.requestLaunchSchedule({
    scheduleId: 'pq019a-exit-before-launch',
    launchAtSimT: pending.state.simTime + 10,
  });
  pending.sim.registry.get('world').enterSector('sector_helios_prime', { placePlayer: false });
  assert.equal(pending.state.heistFacilities.schedule.status, 'scheduled');
  assert.equal(pending.state.heistFacilities.schedule.capsuleEntityId, null);
  assert.equal(pending.state.heistFacilities.capsuleEntityId, null);
  assert.equal(roleEntities(pending.state, 'cargo_capsule').length, 0);
  assert.equal(pending.events.filter((entry) => entry.name === 'heist:capsuleLaunched').length, 0);

  const launched = boot(19024);
  const cargoBefore = structuredClone(launched.state.player.cargo);
  launched.system.requestLaunchSchedule({
    scheduleId: 'pq019a-exit-after-launch',
    launchAtSimT: launched.state.simTime,
  });
  launched.sim.step(SIM_DT);
  const capsuleId = launched.state.heistFacilities.capsuleEntityId;
  const capsule = launched.state.entities.get(capsuleId);
  assert.ok(capsule?.alive);

  launched.sim.registry.get('world').enterSector('sector_helios_prime', { placePlayer: false });
  assert.equal(capsule.alive, false, 'the active transient capsule is removed on Tethys exit');
  assert.equal(launched.state.heistFacilities.capsuleEntityId, null);
  assert.equal(launched.state.heistFacilities.schedule.capsuleEntityId, null);
  assert.equal(
    launched.state.heistFacilities.schedule.status,
    'launched',
    'cleanup does not fabricate completion, settlement, or failure',
  );
  assert.equal(roleEntities(launched.state, 'cargo_capsule').length, 0);
  assert.equal(launched.events.filter((entry) => entry.name === 'heist:facilityCandidate').length, 0);
  assert.deepEqual(launched.state.player.cargo, cargoBefore);
});

test('only real payload contacts emit idempotent catcher and fence candidate receipts', async () => {
  const priorFlags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  try {
    const t = boot(19021);
    assert.equal(t.state.settings.gameplay.physicsBackend, 'rapier-dynamic');
    const backendReady = await t.sim.registry.get('physics').prepareBackend(t.state);
    assert.equal(backendReady, true);
    assert.equal(t.state.physicsRuntime.diagnostics.sg02Ready, true);

    t.system.requestLaunchSchedule({
      scheduleId: 'pq019a-contact',
      launchAtSimT: t.state.simTime,
    });
    t.sim.step(SIM_DT);
    const capsule = roleEntities(t.state, 'cargo_capsule')[0];
    const catcher = roleEntities(t.state, 'lawful_catcher_head')[0];
    assert.ok(capsule && catcher);

    capsule.pos.set(
      catcher.pos.x - catcher.radius - capsule.radius + 1,
      0,
      catcher.pos.z,
    );
    capsule.vel.set(12, 0, 0);
    t.sim.step(SIM_DT);
    const candidates = t.events.filter((entry) => entry.name === 'heist:facilityCandidate');
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].payload.kind, 'lawful_catch_contact');
    assert.equal(candidates[0].payload.payloadStableId, PQ019_CAPSULE.stableId);
    assert.equal(candidates[0].payload.facilityId, 'lawful_catcher');
    assert.ok(candidates[0].payload.physicsImpactDp > 0);

    t.bus.emit('physics:impact', {
      tick: candidates[0].payload.tick,
      aId: capsule.id,
      bId: catcher.id,
      dp: 12,
      pos: { x: catcher.pos.x, z: catcher.pos.z },
    });
    assert.equal(
      t.events.filter((entry) => entry.name === 'heist:facilityCandidate').length,
      1,
      'duplicate same-tick contact is receipt-idempotent',
    );

    t.bus.emit('physics:impact', {
      tick: t.state.tick + 1,
      aId: t.player.id,
      bId: catcher.id,
      dp: 99,
      pos: { x: catcher.pos.x, z: catcher.pos.z },
    });
    assert.equal(
      t.events.filter((entry) => entry.name === 'heist:facilityCandidate').length,
      1,
      'ship overlap cannot satisfy the PAYLOAD-filtered receiver',
    );

    const fence = roleEntities(t.state, 'fence_receiver_head')[0];
    assert.ok(fence);
    capsule.pos.set(
      fence.pos.x - fence.radius - capsule.radius + 1,
      0,
      fence.pos.z,
    );
    capsule.vel.set(12, 0, 0);
    for (let tick = 0; tick < 6; tick++) {
      t.sim.step(SIM_DT);
      if (t.events.filter((entry) => entry.name === 'heist:facilityCandidate').length >= 2) break;
    }
    const afterFence = t.events.filter((entry) => entry.name === 'heist:facilityCandidate');
    assert.equal(afterFence.length, 2);
    assert.equal(afterFence[1].payload.kind, 'fence_contact');
    assert.equal(afterFence[1].payload.facilityId, 'fence_receiver');
    assert.equal(afterFence[1].payload.payloadStableId, PQ019_CAPSULE.stableId);
  } finally {
    restoreFeatureMaps(priorFlags);
  }
});
