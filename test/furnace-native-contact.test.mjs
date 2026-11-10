import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { planArenaInstall } from '../src/systems/survivalArena.js';
import { FOUNDRY_ARENA_ID } from '../src/systems/swarmArena.js';
import { domKeyEvent } from '../src/systems/input.js';

const DT = 1 / 60;
const MAX_SURFACE_PENETRATION = 4;

async function prepareProductionNative(runtime) {
  const prior = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime.config.features);
  try {
    const physics = runtime.getSystem('physics');
    const ready = await physics.prepareBackend(runtime.state);
    assert.ok(physics._sg02, 'the production native authority is initialized');
    assert.equal(physics._diag.backend, 'rapier-dynamic');
    return ready;
  } finally {
    restoreFeatureMaps(prior);
  }
}

test('the production flight route cannot pass through the Foundry furnace body', async () => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 588 });
  try {
    const state = runtime.state;
    state.mode = 'flight';
    state.ui.screenStack = [];
    domKeyEvent(runtime.getSystem('input'), { code: 'KeyW', pressed: true });

    const player = runtime.spawn(makeShipEntitySpec('ship_hornet', {
      isPlayer: true,
      player: state.player,
      pos: { x: -120, z: 0 },
      rot: 0,
    }));
    state.playerId = player.id;

    const liveStation = runtime.spawn({
      type: 'station',
      pos: { x: 600, z: 600 },
      vel: { x: 0, z: 0 },
      radius: 72,
      mass: 100000,
      hull: 100000,
      hullMax: 100000,
      collides: true,
      data: {
        stationId: 'station_helios',
        placeId: 'place_station_trade_hub',
        dockRadius: 72,
      },
    });
    assert.ok(liveStation.data.collisionProxy?.startsWith('skin:'),
      'a station with real visual identity still adopts its measured skin');

    const install = planArenaInstall({
      arenaPhase: 'furnace_active',
      arenaId: FOUNDRY_ARENA_ID,
      wave: 2,
      seed: 588,
      anchor: { x: 0, z: 0 },
      laneGate: 'front',
    });
    assert.ok(install.toys.some((toy) => toy.id === 'foundry_furnace'));
    runtime.getSystem('survivalArena')._materializeRoom(install.toys, 2);
    const furnace = state.entityList.find((entity) => entity.alive !== false
      && entity.data?.roomToyId === 'foundry_furnace');
    const plate = state.entityList.find((entity) => entity.alive !== false
      && entity.data?.roomToyId?.startsWith('foundry_plate_'));
    assert.ok(furnace, 'the live survival arena materializes its authored furnace');
    assert.ok(plate, 'the live survival arena materializes an explicitly manifested bank plate');
    assert.equal(furnace.pos.x, 0, 'the pilot starts outside the authored clearance and does not move the furnace');
    assert.equal(furnace.pos.z, 0);
    assert.equal(furnace.physicsBody.radius, 34);
    assert.equal(furnace.physicsBody.dynamic, false);
    assert.equal(furnace.physicsBody.useMeasuredSkin, false,
      'the station-typed toy carries its authored-primitive opt-out into native resolution');
    assert.equal(furnace.data.collisionProxy, undefined,
      'an anonymous arena toy keeps its authored primitive instead of inheriting the default station skin');

    assert.equal(await prepareProductionNative(runtime), true);
    const physics = runtime.getSystem('physics');
    const owner = physics._sg02;
    const pilotRecord = owner.records.get(player.id);
    const furnaceRecord = owner.records.get(furnace.id);
    assert.ok(pilotRecord?.body?.isDynamic(), 'the pilot is a live dynamic Rapier body');
    assert.equal(furnaceRecord?.body?.isDynamic(), false, 'the furnace is the live fixed Rapier body');
    assert.equal(furnaceRecord?.colliders?.[0]?.isSensor(), false, 'the furnace collider is solid');
    assert.equal(furnaceRecord?.proxyId, null, 'the furnace uses its authored ball body');
    assert.equal(furnaceRecord?.colliders?.length, 1, 'the authored furnace is one ball collider');
    assert.equal(furnaceRecord?.colliders?.[0]?.shapeType(), 0, 'the native furnace collider is a Rapier ball');
    assert.equal(furnaceRecord?.colliders?.[0]?.radius(), 34, 'the native furnace ball keeps its authored radius');
    assert.equal(furnaceRecord?.spec?.radius, 34);
    assert.equal(owner.records.get(plate.id)?.proxyId, plate.physicsBody.collisionProxyManifest.id,
      'an explicit arena body manifest remains authoritative');
    assert.equal(owner.records.get(liveStation.id)?.proxyId, liveStation.data.collisionProxy,
      'the identified station keeps its measured native skin');

    let minCenterDistance = Infinity;
    let contactTicks = 0;
    let sawFlightCommand = false;
    for (let i = 0; i < 600; i++) {
      runtime.step(DT);
      const distance = Math.hypot(player.pos.x - furnace.pos.x, player.pos.z - furnace.pos.z);
      minCenterDistance = Math.min(minCenterDistance, distance);
      sawFlightCommand ||= state.input.moveZ > 0.9 && player._flightFrame?.targetVelocity?.x > 0;
      const contacts = owner.sampleSolidContacts(player.id, { targetId: furnace.id });
      if (contacts.length > 0) contactTicks++;
    }

    assert.ok(sawFlightCommand, 'the ordinary keyboard and flightV3 path issued a forward flight command');
    assert.ok(contactTicks > 0,
      `the native player body should contact the furnace (min center distance ${minCenterDistance.toFixed(2)} WU)`);
    assert.ok(minCenterDistance >= furnace.radius - MAX_SURFACE_PENETRATION,
      `the pilot center stayed outside the furnace surface (minimum ${minCenterDistance.toFixed(2)} WU)`);
  } finally {
    runtime.dispose();
  }
});
