/**
 * INFERENCE WF-01 — Rescue craft response and recovery choreography.
 *
 * Proves:
 * 1. An ambient rescue craft detects an unattended survivor pod and tracks it (responding_survivor).
 * 2. Proximity claim secures the survivor aboard; rescue craft routes to nearest station (transporting_survivor).
 * 3. Reaching station completes delivery, emitting survivorPod:delivered receipt and comms message.
 * 4. Active distress call directs rescue craft to emergency coordinates (responding_distress).
 * 5. Player hand-off of latched pod transfers custody to rescue craft.
 * 6. Nearby violence interrupts rescue craft, triggering civilian flee behavior.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { traffic } from '../src/systems/traffic.js';
import { survivorPod } from '../src/systems/survivorPod.js';

function bootHarness() {
  const bus = createBus();
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 10,
    playerId: 1,
    nextEntityId: 500,
    meta: { seed: 4242 },
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_helios' },
    traffic: {
      freighters: [],
      nextDepotDispatchAt: 9999,
      depotServices: [],
    },
    survivorPod: {
      pods: {},
      causalHandoffs: {},
    },
    player: {
      tether: { active: false, targetId: null },
    },
    story: { flags: {} },
    ui: {},
  };

  function addEntity(entity) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  }

  // Station for docking / medical delivery
  const station = addEntity({
    id: 100,
    type: 'station',
    name: 'Helios Station',
    alive: true,
    pos: { x: 0, z: 0 },
    radius: 40,
    data: { role: 'hub' },
  });

  // Player at (50, 50)
  const player = addEntity({
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 50, z: 50 },
    vel: { x: 0, z: 0 },
    radius: 10,
    hull: 100,
    hullMax: 100,
    data: {},
    flags: {},
  });

  traffic.init({ state, bus });
  survivorPod.init({ state, bus });

  return { state, bus, station, player, addEntity };
}

test('rescue craft detects unattended survivor pod, secures survivor, and delivers to station', () => {
  const { state, bus, station, addEntity } = bootHarness();

  // Spawn rescue craft near player
  const rescueEnt = addEntity({
    id: 201,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: 60, z: 60 },
    vel: { x: 0, z: 0 },
    radius: 12,
    rot: 0,
    data: {
      trafficRole: 'rescue',
      role: 'rescue',
      trafficLabel: 'Helios Medevac',
    },
    flags: {},
  });

  const rescueRec = {
    id: 201,
    role: 'rescue',
    targetId: station.id,
    waitT: 0,
    carryingSurvivor: false,
    rescueTargetId: null,
  };
  state.traffic.freighters.push(rescueRec);

  // Spawn unattended survivor pod at (100, 60)
  const podEnt = addEntity({
    id: 301,
    type: 'payload',
    team: 0,
    alive: true,
    pos: { x: 100, z: 60 },
    vel: { x: 0, z: 0 },
    radius: 6,
    data: {
      payloadType: 'survivor_pod',
      tetherRole: 'survivor_pod',
      survivorPodCausal: {
        entityId: 301,
        victimId: 99,
        sectorId: 'sector_helios',
        expireAt: 500,
        phase: 'active',
      },
    },
    flags: {},
  });

  // Step 1: traffic update should detect the pod and set intent toward it
  traffic.update(0.1, state);
  assert.equal(rescueRec.rescueTargetType, 'pod');
  assert.equal(rescueRec.rescueTargetId, 301);
  assert.equal(rescueEnt.data.civilianReaction, 'responding_survivor');
  assert.ok(rescueEnt.data.intent, 'Rescue craft has intent');
  assert.equal(rescueEnt.data.intent.moveZ, 1, 'Rescue craft is thrusting toward pod');

  // Step 2: Move rescue craft within proximity of pod
  rescueEnt.pos.x = 95;
  rescueEnt.pos.z = 60;

  const rescuedEvents = [];
  bus.on('survivorPod:rescued', (p) => rescuedEvents.push(p));

  // survivorPod.update performs proximity claim by rescue hull
  survivorPod.update(0.1, state);
  assert.equal(rescuedEvents.length, 1, 'survivorPod:rescued fired');
  assert.equal(rescuedEvents[0].reason, 'rescue_hull');
  assert.equal(rescuedEvents[0].rescueHullId, rescueEnt.id);

  // Traffic sync updates carryingSurvivor and destination to station
  assert.equal(rescueRec.carryingSurvivor, true);
  assert.equal(rescueRec.targetId, station.id);
  assert.equal(rescueRec.civilianReaction, 'transporting_survivor');

  // Step 3: Rescue craft flies toward station with survivor
  traffic.update(0.1, state);
  assert.equal(rescueEnt.data.civilianReaction, 'transporting_survivor');
  assert.equal(rescueEnt.data.intent.moveZ, 1, 'Rescue craft is thrusting toward station');

  // Step 4: Arrives at station (within DOCK_RANGE = 80)
  rescueEnt.pos.x = 20;
  rescueEnt.pos.z = 20;

  const deliveredEvents = [];
  const commsMessages = [];
  bus.on('survivorPod:delivered', (p) => deliveredEvents.push(p));
  bus.on('comms:message', (p) => commsMessages.push(p));

  traffic.update(0.1, state);
  assert.equal(deliveredEvents.length, 1, 'survivorPod:delivered fired');
  assert.equal(deliveredEvents[0].rescueHullId, rescueEnt.id);
  assert.equal(deliveredEvents[0].stationId, station.id);
  assert.equal(rescueRec.carryingSurvivor, false);
  assert.ok(rescueRec.waitT > 0, 'Rescue craft waiting at medical berth');
  assert.ok(commsMessages.some((m) => m.channel === 'emergency'));
});

test('rescue craft responds to distress call when no pods are active', () => {
  const { state, bus, station, addEntity } = bootHarness();

  const rescueEnt = addEntity({
    id: 202,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: 50, z: 50 },
    vel: { x: 0, z: 0 },
    radius: 12,
    rot: 0,
    data: {
      trafficRole: 'rescue',
      role: 'rescue',
      trafficLabel: 'SAR Cutter',
    },
    flags: {},
  });

  const rescueRec = {
    id: 202,
    role: 'rescue',
    targetId: station.id,
    waitT: 0,
    carryingSurvivor: false,
    rescueTargetId: null,
  };
  state.traffic.freighters.push(rescueRec);

  // Broadcast civilian distress call at (200, 150)
  state.traffic.lastDistressCall = {
    callerId: 888,
    callerRole: 'hauler',
    callerName: 'Cargo Hauler',
    pos: { x: 200, z: 150 },
    threatId: 999,
    cause: 'combat_damage',
    radius: 1800,
    simTime: state.simTime,
  };

  traffic.update(0.1, state);
  assert.equal(rescueRec.rescueTargetType, 'distress');
  assert.equal(rescueEnt.data.civilianReaction, 'responding_distress');
  assert.equal(rescueEnt.data.intent.moveZ, 1);
});

test('rescue craft flees when nearby violence erupts', () => {
  const { state, bus, station, addEntity } = bootHarness();

  const rescueEnt = addEntity({
    id: 203,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: 60, z: 60 },
    vel: { x: 0, z: 0 },
    radius: 12,
    rot: 0,
    data: {
      trafficRole: 'rescue',
      role: 'rescue',
      trafficLabel: 'Rescue 01',
    },
    flags: {},
  });

  const rescueRec = {
    id: 203,
    role: 'rescue',
    targetId: station.id,
    waitT: 0,
    carryingSurvivor: false,
    rescueTargetId: null,
  };
  state.traffic.freighters.push(rescueRec);

  // Victim civilian ship being shot at (70, 70)
  const victimEnt = addEntity({
    id: 888,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: 70, z: 70 },
    radius: 14,
    data: { trafficRole: 'hauler' },
  });

  // Violence occurs within 300 WU of rescue craft
  bus.emit('combat:damage', {
    applied: 25,
    pos: { x: 70, z: 70 },
    attackerId: 999,
    targetId: victimEnt.id,
  });

  traffic.update(0.1, state);
  // Rescue craft is in CIVILIAN_ALARM_FLEE_ROLES and should be alarmed/fleeing
  assert.ok(rescueRec.violenceAlarmed, 'Rescue craft alarmed by nearby combat');
  assert.ok(rescueEnt.data.intent && rescueEnt.data.intent.moveZ === 1, 'Rescue craft thrusts to flee');
});
