import test from 'node:test';
import assert from 'node:assert/strict';

import { COLLISION_PROXY_MANIFESTS, proxyWorldPrimitives } from '../src/data/collisionProxyManifests.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { automation } from '../src/systems/automation.js';
import { flightV3 } from '../src/systems/flightV3.js';

const HELIOS = 'sector_helios_prime';

function entity(id, spec = {}) {
  return {
    id,
    type: 'drone',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 2.4,
    collides: false,
    data: {},
    ...spec,
  };
}

function group(id, entityIds = []) {
  return {
    id,
    defId: 'drone_mk1',
    count: 1,
    sectorId: HELIOS,
    originPos: { x: 0, z: 0 },
    entityIds: [...entityIds],
  };
}

function boot(entries = []) {
  const entities = new Map(entries.map((row) => [row.id, row]));
  const state = {
    simTime: 10,
    playerId: 1,
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 } },
    entities,
    entityList: [...entities.values()],
    world: { currentSectorId: HELIOS },
    automation: { drones: [] },
  };
  const spawned = [];
  const inst = Object.create(automation);
  Object.assign(inst, {
    state,
    bus: { emit() {} },
    helpers: {
      getEntity: (id) => entities.get(id),
      spawnEntity(spec) {
        const fresh = entity(900 + spawned.length, {
          ...spec,
          alive: true,
          pos: { ...spec.pos },
          data: { ...spec.data },
        });
        entities.set(fresh.id, fresh);
        state.entityList.push(fresh);
        spawned.push(fresh);
        return fresh;
      },
    },
    _droneFieldOrigin: () => ({ x: 40, z: 20 }),
    _syncProgrammedOperation() {},
  });
  return { state, inst, spawned };
}

for (const [label, recycled] of [
  ['asteroid', entity(333, { type: 'asteroid', radius: 18, collides: true, data: { oreHP: 100 } })],
  ['another group\'s drone', entity(333, {
    data: {
      kind: 'mining_drone',
      groupId: 'drone-b',
      intent: { moveX: 0.25, moveZ: -0.5, boost: false, brake: false, fire: false, aimAngle: 1 },
    },
  })],
]) {
  test(`recycled ${label} id is not steered, parked, released, or adopted by another group`, () => {
    const { state, inst, spawned } = boot([recycled]);
    const owner = group('drone-a', [333]);
    state.automation.drones.push(owner);
    const before = structuredClone(recycled);

    assert.equal(inst._steerGroupTo(owner, {}, { x: 100, z: 0 }, 1 / 60, HELIOS), false);
    inst._parkDroneEntities(owner);
    assert.deepEqual(recycled, before, 'identity mismatch keeps the recycled live entity untouched');

    inst._onContinuousDroneMembership({ continuous: true, noTeleport: true, sectorId: 'sector_ceres_belt' });
    assert.equal(owner.sectorId, HELIOS, 'a recycled id cannot make its former owner adopt a new sector');
    assert.deepEqual(owner.entityIds, [], 'identity mismatch is pruned before a later live update');

    owner.entityIds = [333];
    inst._runProgrammedGroup(owner, { durabilityMax: 40 }, 1 / 60, HELIOS);
    assert.deepEqual(owner.entityIds, [900], 'the programmed group replaces only its missing visible hull');
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0].data.groupId, owner.id, 'replacement retains the owner identity');
    assert.deepEqual(recycled, before, 'respawn never mutates the recycled entity');

    owner.entityIds = [333];
    inst._releaseDroneEntities(owner);
    assert.equal(recycled.alive, true, 'recalling one group cannot destroy a recycled entity');
    assert.deepEqual(recycled, before, 'release does not mutate another owner or an asteroid');
  });
}

function maxProxyRadius(primitives, center) {
  return Math.max(...primitives.map((primitive) => {
    if (primitive.kind === 'circle') return Math.hypot(primitive.x - center.x, primitive.z - center.z) + primitive.r;
    if (primitive.kind === 'capsule') {
      return Math.max(
        Math.hypot(primitive.ax - center.x, primitive.az - center.z),
        Math.hypot(primitive.bx - center.x, primitive.bz - center.z),
      ) + primitive.r;
    }
    return Math.hypot(primitive.x - center.x, primitive.z - center.z)
      + Math.hypot(primitive.hx, primitive.hz);
  }));
}

test('programmed depot arrival physically settles outside the Helios compound collision envelope', async () => {
  const sim = createSimulation({ seed: 333, systems: [flightV3, physics, automation] });
  const physicsSystem = sim.registry.get('physics');
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = HELIOS;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.player.credits = 10_000;

  const helios = sim.spawn({
    type: 'station',
    pos: { x: 0, z: 0 },
    radius: 42,
    mass: 1e6,
    hull: 1e6,
    hullMax: 1e6,
    collides: true,
    data: { stationId: 'station_helios', dockRadius: 90, collisionProxy: 'helios_trade_hub', corridorBearingDeg: 0 },
  });
  const drone = sim.spawn({
    type: 'drone',
    pos: { x: 500, z: 0 },
    vel: { x: 0, z: 0 },
    rot: Math.PI,
    radius: 2.4,
    mass: 6,
    hull: 40,
    hullMax: 40,
    maxSpeed: 130,
    collides: false,
    data: { kind: 'mining_drone', groupId: 'drone-inbound', targetAstId: null },
  });
  const owner = {
    ...group('drone-inbound', [drone.id]),
    status: 'program',
    oreType: 'cmdty_ore_iron',
    bufferCap: 40,
    fuel: 240,
    fuelMax: 240,
    shipment: { items: {}, usedVolume: 0, usedMass: 0 },
    program: { templateId: 'mine_to_depot' },
    programState: { pc: 1, waitT: 0, cargoWasFull: false },
  };
  state.automation.drones.push(owner);
  const manifest = COLLISION_PROXY_MANIFESTS.helios_trade_hub;
  const outerSolidRadius = maxProxyRadius(proxyWorldPrimitives(helios, manifest), helios.pos);
  const impacts = [];
  sim.bus.on('physics:impact', (impact) => {
    if (impact.aId === drone.id || impact.bId === drone.id) impacts.push(impact);
  });

  try {
    assert.equal(await physicsSystem.prepareBackend(state), true, 'the regression uses the production Rapier owner');
    let minimumDistance = Infinity;
    let arrived = false;
    for (let tick = 0; tick < 1_000; tick += 1) {
      sim.step(SIM_DT);
      minimumDistance = Math.min(minimumDistance, Math.hypot(drone.pos.x - helios.pos.x, drone.pos.z - helios.pos.z));
      if (owner.programState.pc !== 1) {
        arrived = true;
        owner.status = 'distressed'; // preserve the reached public handoff and let canonical parking brake settle it.
        break;
      }
    }
    assert.equal(arrived, true, 'the incoming drone reaches the depot handoff from 500 WU out');

    for (let tick = 0; tick < 360; tick += 1) {
      sim.step(SIM_DT);
      minimumDistance = Math.min(minimumDistance, Math.hypot(drone.pos.x - helios.pos.x, drone.pos.z - helios.pos.z));
    }

    assert.equal(drone.data.intent.brake, true, 'the reached group parks through the canonical brake intent');
    assert.equal(drone.alive, true, 'the physical arrival preserves the drone hull');
    assert.equal(drone.hull, drone.hullMax, 'the station never damages the incoming drone');
    assert.equal(impacts.length, 0, 'the incoming flight creates no station contact receipt');
    assert.ok(minimumDistance > outerSolidRadius + drone.radius,
      `the physical path stays outside Helios solids (${minimumDistance.toFixed(1)} WU > ${(outerSolidRadius + drone.radius).toFixed(1)} WU)`);
  } finally {
    if (physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    sim.dispose();
  }
});
