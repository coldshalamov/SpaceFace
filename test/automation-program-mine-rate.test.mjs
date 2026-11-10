import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { automation } from '../src/systems/automation.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { shipmentQty } from '../src/systems/cargoCustody.js';

function bootMiner() {
  const rock = {
    id: 'ast-test-rate',
    type: 'asteroid',
    alive: true,
    pos: { x: 0, z: 0 },
    hull: 140,
    hullMax: 140,
    data: { typeId: 'ast_rock', oreHP: 140, oreHPMax: 140 },
  };
  const state = {
    simTime: 0,
    entityList: [rock],
    player: {
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 },
    },
  };
  const inst = Object.create(automation);
  inst.state = state;
  inst.bus = { emit() {} };
  inst._playerPos = () => ({ x: 0, z: 0 });
  return {
    state,
    inst,
    group: {
      count: 1,
      oreType: 'cmdty_ore_iron',
      bufferCap: 40,
      originPos: { x: 0, z: 0 },
      fuel: 240,
      fuelMax: 240,
    },
    def: { mineRate: 0.8, bufferCap: 40, fuelRate: 1 },
  };
}

test('programmed drones accrue at the authored mineRate, not one unit per sim tick', () => {
  const { state, inst, group, def } = bootMiner();
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) inst._programMineIntoCargo(group, def, dt);
  assert.equal(state.player.cargo.items.cmdty_ore_iron || 0, 0, '0.8u/s cannot mint a whole unit in one second');

  for (let i = 0; i < 60; i++) inst._programMineIntoCargo(group, def, dt);
  assert.equal(shipmentQty(group, 'cmdty_ore_iron'), 1, 'two seconds at 0.8u/s grants one whole unit');
  assert.equal(state.player.cargo.items.cmdty_ore_iron || 0, 0, 'the player hold is not the drone inventory');
  assert.ok(group._programMineCarry > 0.5 && group._programMineCarry < 0.7, 'fractional remainder stays on the carry');
});

test('programmed drones publish a flight intent that moves through the Rapier owner to a live rock', async () => {
  const sim = createSimulation({ seed: 17707, systems: [flightV3, physics, automation] });
  const physicsSystem = sim.registry.get('physics');
  const { state } = sim;
  // Fund the live economy owner so this movement proof is bounded by the route, not an unrelated
  // upkeep distress after the longer far-side station detour.
  state.player.credits = 10_000;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';

  // Match the live Helios fixture: the depot is a physical static body and the outbound route
  // starts on its far side, so the programmed pilot must route around it before mining the field.
  const station = sim.spawn({
    type: 'station',
    pos: { x: 0, z: 0 },
    radius: 30,
    mass: 1000,
    collides: true,
    data: { stationId: 'station_helios', isGate: false },
  });
  const drone = sim.spawn({
    type: 'drone',
    pos: { x: -90, z: 0 },
    rot: 0,
    radius: 2.4,
    mass: 6,
    collides: false,
    hull: 40,
    hullMax: 40,
    data: { kind: 'mining_drone', groupId: 'drone-live', targetAstId: null },
  });
  const rock = sim.spawn({
    type: 'asteroid',
    pos: { x: 500, z: 0 },
    radius: 12,
    mass: 500,
    collides: true,
    hull: 140,
    hullMax: 140,
    data: { typeId: 'ast_rock', oreHP: 140, oreHPMax: 140 },
  });
  const group = {
    id: 'drone-live',
    defId: 'drone_mk1',
    count: 1,
    oreType: 'cmdty_ore_iron',
    bufferCap: 60,
    fuel: 240,
    fuelMax: 240,
    sectorId: 'sector_helios_prime',
    status: 'program',
    originPos: { x: 500, z: 0 },
    entityIds: [drone.id],
    program: { templateId: 'mine_to_depot' },
    programState: { pc: 0, waitT: 0, cargoWasFull: false },
    shipment: { items: {}, usedVolume: 0, usedMass: 0 },
  };
  state.automation.drones.push(group);

  try {
    assert.equal(await physicsSystem.prepareBackend(state), true, 'the test uses the default physics owner');
    const initialDistance = Math.hypot(rock.pos.x - drone.pos.x, rock.pos.z - drone.pos.z);
    let minimumStationDistance = Infinity;
    let maximumLateralOffset = 0;
    let maximumStepDistance = 0;
    let previousPosition = { x: drone.pos.x, z: drone.pos.z };
    let mined = false;
    for (let tick = 0; tick < 1_500; tick++) {
      sim.step(SIM_DT);
      maximumStepDistance = Math.max(
        maximumStepDistance,
        Math.hypot(drone.pos.x - previousPosition.x, drone.pos.z - previousPosition.z),
      );
      previousPosition = { x: drone.pos.x, z: drone.pos.z };
      minimumStationDistance = Math.min(
        minimumStationDistance,
        Math.hypot(drone.pos.x - station.pos.x, drone.pos.z - station.pos.z),
      );
      maximumLateralOffset = Math.max(maximumLateralOffset, Math.abs(drone.pos.z - station.pos.z));
      if (shipmentQty(group, 'cmdty_ore_iron') > 0) {
        mined = true;
        break;
      }
    }
    const finalDistance = Math.hypot(rock.pos.x - drone.pos.x, rock.pos.z - drone.pos.z);
    assert.ok(drone.data.intent, 'automation steering leaves a canonical intent for Flight V3');
    assert.ok(initialDistance - finalDistance >= 80,
      `the Rapier-owned drone physically closes on the live rock (${initialDistance} -> ${finalDistance})`);
    assert.ok(maximumLateralOffset > station.radius + drone.radius,
      `the outbound route takes a physical lateral detour around the station (max z=${maximumLateralOffset})`);
    assert.ok(minimumStationDistance > station.radius + drone.radius,
      `the Rapier-owned hull keeps collision clearance from the station (min=${minimumStationDistance})`);
    assert.ok(maximumStepDistance < 8,
      `the route advances through fixed physics steps without teleporting (${maximumStepDistance})`);
    assert.equal(mined, true, 'closing to the live rock reaches finite mining and operation shipment');
    assert.ok(rock.data.oreHP < rock.data.oreHPMax, 'the live rock is chipped only after physical arrival');
  } finally {
    if (physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    sim.dispose();
  }
});

test('fuel-stranded drones brake through Rapier while retaining their live hull and shipment', async () => {
  const sim = createSimulation({ seed: 17707, systems: [flightV3, physics, automation] });
  const physicsSystem = sim.registry.get('physics');
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';

  const drone = sim.spawn({
    type: 'drone',
    pos: { x: 0, z: 0 },
    vel: { x: 80, z: 0 },
    rot: 0,
    radius: 2.4,
    mass: 6,
    collides: false,
    hull: 40,
    hullMax: 40,
    data: { kind: 'mining_drone', groupId: 'drone-stranded' },
  });
  const group = {
    id: 'drone-stranded',
    defId: 'drone_mk1',
    count: 1,
    oreType: 'cmdty_ore_iron',
    bufferCap: 60,
    fuel: 0,
    fuelMax: 240,
    sectorId: 'sector_helios_prime',
    status: 'program',
    originPos: { x: 0, z: 0 },
    entityIds: [drone.id],
    program: { templateId: 'mine_to_depot' },
    programState: { pc: 1, waitT: 0, cargoWasFull: true },
    shipment: { items: { cmdty_ore_iron: 2 }, usedVolume: 2, usedMass: 2 },
  };
  state.automation.drones.push(group);

  try {
    assert.equal(await physicsSystem.prepareBackend(state), true, 'the test uses the default physics owner');
    sim.runTicks(300, SIM_DT);
    assert.equal(group.status, 'stranded');
    assert.equal(drone.alive, true, 'fuel shortage parks the existing hull instead of despawning it');
    assert.ok(group.entityIds.includes(drone.id), 'the stranded group retains ownership of its live hull');
    assert.equal(shipmentQty(group, 'cmdty_ore_iron'), 2, 'stored shipment survives the fuel shortage');
    assert.equal(drone.data.intent.brake, true, 'parking is a canonical brake intent');
    assert.ok(drone.pos.x > 0, 'the hull remains in the world after the initial inertial stop');
    assert.ok(Math.hypot(drone.vel.x, drone.vel.z) < 1,
      `the Rapier owner settles the parked hull (${Math.hypot(drone.vel.x, drone.vel.z)})`);
  } finally {
    if (physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    sim.dispose();
  }
});
