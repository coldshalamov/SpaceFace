import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { traffic as trafficBase, isShipDisabled } from '../src/systems/traffic.js';
import { mining as miningBase } from '../src/systems/mining.js';
import { cargo as cargoBase } from '../src/systems/cargo.js';

function createMockState(seed = 42) {
  let nextId = 100;
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 10,
    meta: { seed },
    playerId: 1,
    entities: new Map(),
    entityList: [],
    world: {
      currentSectorId: 'sector_helios_prime',
      planets: [
        { id: 'planet_helios', name: 'Helios Prime', pos: { x: 500, z: 500 }, radius: 400 },
      ],
      pois: [
        { id: 'poi_beacon', name: 'Nav Beacon', type: 'beacon', pos: { x: 300, z: 300 } },
      ],
      records: { byId: {} },
    },
    traffic: {
      freighters: [],
      rngSeed: 0x12345678,
    },
    player: {
      cargo: {
        items: {},
        capVolume: 500,
        usedVolume: 0,
        usedMass: 0,
        richLots: [],
      },
      moduleInventory: [],
    },
    cargo: {
      goods: {},
      capacity: 100,
    },
  };

  const bus = createBus();

  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: spec.id != null ? spec.id : nextId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
        flags: { ...(spec.flags || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const e = state.entities.get(id);
      if (e) e.alive = false;
    },
  };

  // Player ship
  const player = helpers.spawnEntity({
    id: 1,
    type: 'ship',
    radius: 8,
    mass: 15,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    data: { name: 'Player' },
  });

  // Station
  const station = helpers.spawnEntity({
    id: 10,
    type: 'station',
    radius: 80,
    pos: { x: -600, z: 0 },
    data: { stationId: 'station_helios', name: 'Helios Station' },
  });

  return { state, bus, helpers, player, station };
}

function createTrafficSystem(state, bus, helpers) {
  const trafficSys = Object.create(trafficBase);
  trafficSys.init({ state, bus, helpers });
  return trafficSys;
}

test('proof, fixed seeds: one scripted threat event produces ≥5 distinct civilian reactions by class', () => {
  const { state, bus, helpers, station } = createMockState(12345);
  const trafficSys = createTrafficSystem(state, bus, helpers);

  // 1. Miner
  const miner = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 100, z: 50 },
    vel: { x: 0, z: 0 },
    data: {
      trafficRole: 'miner',
      carrying: true,
      cargoManifest: {
        manifestId: 'm_miner',
        lines: [{ commodityId: 'cmdty_ore_iron', qty: 12 }],
        totalQty: 12,
      },
    },
  });
  const minerRec = {
    id: miner.id,
    role: 'miner',
    targetId: station.id,
    carrying: true,
    manifest: miner.data.cargoManifest,
  };
  state.traffic.freighters.push(minerRec);

  // 2. Courier
  const courier = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 120, z: 30 },
    vel: { x: 0, z: 0 },
    data: { trafficRole: 'courier' },
  });
  const courierRec = {
    id: courier.id,
    role: 'courier',
    targetId: station.id,
  };
  state.traffic.freighters.push(courierRec);

  // 3. Hauler with cargo
  const hauler = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 80, z: 60 },
    vel: { x: 0, z: 0 },
    data: {
      trafficRole: 'hauler',
      carrying: true,
      cargoManifest: {
        manifestId: 'm_hauler',
        lines: [{ commodityId: 'cmdty_ore_iron', qty: 16 }],
        totalQty: 16,
      },
    },
  });
  const haulerRec = {
    id: hauler.id,
    role: 'hauler',
    targetId: station.id,
    carrying: true,
    manifest: hauler.data.cargoManifest,
  };
  state.traffic.freighters.push(haulerRec);

  // 4. Tug and nearby disabled ship
  const disabledShip = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 140, z: 70 },
    vel: { x: 0, z: 0 },
    data: { disabled: true, trafficRole: 'shuttle' },
  });
  const tug = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 130, z: 70 },
    vel: { x: 0, z: 0 },
    data: { trafficRole: 'tug' },
  });
  const tugRec = {
    id: tug.id,
    role: 'tug',
    targetId: station.id,
  };
  state.traffic.freighters.push(tugRec);

  // 5. Tourist
  const tourist = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 110, z: 90 },
    vel: { x: 0, z: 0 },
    data: { trafficRole: 'tourist' },
  });
  const touristRec = {
    id: tourist.id,
    role: 'tourist',
    targetId: station.id,
  };
  state.traffic.freighters.push(touristRec);

  // Threat entity: Hostile raider attacks
  const attacker = helpers.spawnEntity({
    id: 999,
    type: 'ship',
    pos: { x: 105, z: 55 },
    data: { factionId: 'faction_pirate' },
  });

  // Threat event: combat fire / damage near cluster
  bus.emit('combat:damage', {
    targetId: miner.id,
    attackerId: attacker.id,
    applied: 25,
    pos: { x: 100, z: 50 },
  });

  // Step traffic
  trafficSys.update(0.1, state);

  const reactions = new Set();

  // Miner reaction: flee_with_load
  assert.equal(minerRec.civilianReaction, 'flee_with_load', 'Miner must flee with load');
  assert.equal(minerRec.fleeingWithLoad, true, 'Miner fleeingWithLoad flag must be set');
  assert.equal(miner.data.intent.boost, true, 'Miner must boost to safety');
  assert.equal(minerRec.cargoDumped || false, false, 'Miner must NOT dump cargo');
  reactions.add(minerRec.civilianReaction);

  // Courier reaction: dodge_aggressive
  assert.equal(courierRec.civilianReaction, 'dodge_aggressive', 'Courier must dodge aggressively');
  assert.notEqual(courier.data.intent.moveX, 0, 'Courier must have lateral evasive strafe (moveX != 0)');
  assert.equal(courier.data.intent.boost, true, 'Courier must boost while evading');
  reactions.add(courierRec.civilianReaction);

  // Hauler reaction: dump_cargo
  assert.equal(haulerRec.civilianReaction, 'dump_cargo', 'Hauler must dump cargo when chased');
  assert.equal(haulerRec.cargoDumped, true, 'Hauler cargoDumped must be true');
  assert.equal(hauler.data.violenceCargoSpilled, true, 'Hauler violenceCargoSpilled must be true');
  reactions.add(haulerRec.civilianReaction);

  // Check physical cargo pod was spawned for hauler
  const dumpedPod = state.entityList.find((e) => e.type === 'payload' && e.data && e.data.ownerId === hauler.id);
  assert.ok(dumpedPod, 'Physical cargo pod must be spawned into state.entities');
  assert.equal(dumpedPod.data.commodityId, 'cmdty_ore_iron');
  assert.ok(dumpedPod.data.amount > 0, 'Pod amount must be positive');

  // Tug reaction: assist_disabled
  assert.equal(tugRec.civilianReaction, 'assist_disabled', 'Tug must stop to assist disabled ship');
  assert.equal(tugRec.assistingShipId, disabledShip.id, 'Tug must target the disabled ship');
  reactions.add(tugRec.civilianReaction);

  // Tourist reaction: scenic_loiter
  assert.equal(touristRec.civilianReaction, 'scenic_loiter', 'Tourist must hold scenic loiter standoff');
  assert.equal(tourist.data.intent.brake, true, 'Tourist must brake to hold standoff distance');
  reactions.add(touristRec.civilianReaction);

  // Verify ≥5 distinct civilian reactions observed
  assert.ok(reactions.size >= 5, `Expected ≥5 distinct civilian reactions, got ${reactions.size}: ${[...reactions].join(', ')}`);
});

test('dumped cargo pod is physically scoopable', () => {
  const { state, bus, helpers, player, station } = createMockState(42);
  const trafficSys = createTrafficSystem(state, bus, helpers);

  const cargoSys = Object.create(cargoBase);
  cargoSys.init({ state, bus, helpers });

  const registry = { get: (name) => (name === 'cargo' ? cargoSys : null) };
  const miningSys = Object.create(miningBase);
  miningSys.init({ state, bus, helpers, registry });

  // Hauler with manifest
  const hauler = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 50, z: 50 },
    vel: { x: 0, z: 0 },
    data: {
      trafficRole: 'hauler',
      carrying: true,
      cargoManifest: {
        manifestId: 'm_test',
        lines: [{ commodityId: 'cmdty_ore_iron', qty: 20 }],
        totalQty: 20,
      },
    },
  });
  const haulerRec = {
    id: hauler.id,
    role: 'hauler',
    targetId: station.id,
    carrying: true,
    manifest: hauler.data.cargoManifest,
  };
  state.traffic.freighters.push(haulerRec);

  // Threat causes hauler to dump cargo
  bus.emit('combat:damage', {
    targetId: hauler.id,
    attackerId: 999,
    applied: 10,
    pos: { x: 50, z: 50 },
  });
  trafficSys.update(0.1, state);

  // Find dumped pod
  const pod = state.entityList.find((e) => e.type === 'payload' && e.data && e.data.ownerId === hauler.id);
  assert.ok(pod, 'Cargo pod entity must exist');
  assert.equal(pod.type, 'payload', 'Pod must be type: payload');
  assert.ok(pod.data.salvagePool && pod.data.salvagePool['cmdty_ore_iron'] > 0, 'Pod must have salvagePool');

  const dumpedQty = pod.data.salvagePool['cmdty_ore_iron'];

  // Position player directly at the pod to scoop it
  player.pos.x = pod.pos.x;
  player.pos.z = pod.pos.z;

  const collected = miningSys._collectPayload(pod, player);
  assert.equal(collected, true, 'Payload must be collected by player');

  // Verify cargo transferred into player cargo hold
  assert.equal(state.player.cargo.items['cmdty_ore_iron'], dumpedQty, 'Commodity must be transferred into player hold');

  // Verify pod entity is consumed
  assert.equal(pod.alive, false, 'Pod must be marked dead after being scooped');
});

test('save/reload preserves civilian state', () => {
  const { state, bus, helpers, station } = createMockState(999);
  const trafficSys = createTrafficSystem(state, bus, helpers);

  // Create civilians with active states
  const miner = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 10, z: 10 },
    data: { trafficRole: 'miner' },
  });
  const minerRec = {
    id: miner.id,
    role: 'miner',
    targetId: station.id,
    carrying: true,
    fleeingWithLoad: true,
    civilianReaction: 'flee_with_load',
  };
  trafficSys._syncTrafficRecordToData(miner, minerRec);
  state.traffic.freighters.push(minerRec);

  const tourist = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 20, z: 20 },
    data: { trafficRole: 'tourist' },
  });
  const touristRec = {
    id: tourist.id,
    role: 'tourist',
    targetId: station.id,
    scenicBodyId: 'planet_helios',
    civilianReaction: 'scenic_loiter',
  };
  trafficSys._syncTrafficRecordToData(tourist, touristRec);
  state.traffic.freighters.push(touristRec);

  const tug = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 30, z: 30 },
    data: { trafficRole: 'tug' },
  });
  const tugRec = {
    id: tug.id,
    role: 'tug',
    targetId: station.id,
    assistingShipId: 555,
    civilianReaction: 'assist_disabled',
  };
  trafficSys._syncTrafficRecordToData(tug, tugRec);
  state.traffic.freighters.push(tugRec);

  const hauler = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 40, z: 40 },
    data: { trafficRole: 'hauler' },
  });
  const haulerRec = {
    id: hauler.id,
    role: 'hauler',
    targetId: station.id,
    cargoDumped: true,
    carrying: false,
    civilianReaction: 'dump_cargo',
  };
  trafficSys._syncTrafficRecordToData(hauler, haulerRec);
  state.traffic.freighters.push(haulerRec);

  // Simulate rematerialize / reload:
  // Reset state.traffic.freighters, then adopt persistent entities
  state.traffic.freighters = [];
  const entitiesToAdopt = [miner, tourist, tug, hauler];
  trafficSys._adoptRematerializedTraffic(entitiesToAdopt, 'sector_helios_prime', [station]);

  // Check restored records
  const restoredMiner = state.traffic.freighters.find((r) => r.id === miner.id);
  assert.ok(restoredMiner, 'Miner record must be restored');
  assert.equal(restoredMiner.carrying, true, 'Miner carrying must be preserved');
  assert.equal(restoredMiner.fleeingWithLoad, true, 'Miner fleeingWithLoad must be preserved');
  assert.equal(restoredMiner.civilianReaction, 'flee_with_load', 'Miner civilianReaction must be preserved');

  const restoredTourist = state.traffic.freighters.find((r) => r.id === tourist.id);
  assert.ok(restoredTourist, 'Tourist record must be restored');
  assert.equal(restoredTourist.scenicBodyId, 'planet_helios', 'Tourist scenicBodyId must be preserved');
  assert.equal(restoredTourist.civilianReaction, 'scenic_loiter', 'Tourist civilianReaction must be preserved');

  const restoredTug = state.traffic.freighters.find((r) => r.id === tug.id);
  assert.ok(restoredTug, 'Tug record must be restored');
  assert.equal(restoredTug.assistingShipId, 555, 'Tug assistingShipId must be preserved');
  assert.equal(restoredTug.civilianReaction, 'assist_disabled', 'Tug civilianReaction must be preserved');

  const restoredHauler = state.traffic.freighters.find((r) => r.id === hauler.id);
  assert.ok(restoredHauler, 'Hauler record must be restored');
  assert.equal(restoredHauler.cargoDumped, true, 'Hauler cargoDumped must be preserved');
  assert.equal(restoredHauler.carrying, false, 'Hauler carrying must be preserved');
  assert.equal(restoredHauler.civilianReaction, 'dump_cargo', 'Hauler civilianReaction must be preserved');
});

test('distress calls route to whoever is near, including the player', () => {
  const { state, bus, helpers, player } = createMockState(777);
  const trafficSys = createTrafficSystem(state, bus, helpers);

  // Player at (100, 100)
  player.pos.x = 100;
  player.pos.z = 100;

  // Caller civilian at (200, 200) -> distance ~141 WU (within 1800 WU radius)
  const caller = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 200, z: 200 },
    data: { trafficRole: 'hauler', trafficLabel: 'Free Trader' },
  });

  // Nearby ship at (300, 300) -> distance ~141 WU (within 1800 WU radius)
  const nearShip = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 300, z: 300 },
    data: { trafficRole: 'tug' },
  });

  // Far ship at (5000, 5000) -> distance > 6000 WU (outside 1800 WU radius)
  const farShip = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 5000, z: 5000 },
    data: { trafficRole: 'patrol' },
  });

  const distressEvents = [];
  bus.on('distress:call', (payload) => {
    distressEvents.push(payload);
  });

  const commsEvents = [];
  bus.on('comms:message', (payload) => {
    commsEvents.push(payload);
  });

  // Threat attacks caller
  const threat = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 210, z: 210 },
  });

  const distress = trafficSys._broadcastCivilianDistress(caller, threat, 'combat_damage');

  assert.ok(distress, 'Distress call must be generated');
  assert.equal(distress.routedToPlayer, true, 'Distress call must be routed to player in range');
  assert.ok(distress.recipients.includes(player.id), 'Player must be in recipients');
  assert.ok(distress.recipients.includes(nearShip.id), 'Nearby ship must be in recipients');
  assert.equal(distress.recipients.includes(farShip.id), false, 'Far ship must NOT be in recipients');

  assert.equal(distressEvents.length, 1, 'distress:call event must be emitted');
  assert.equal(distressEvents[0].callerId, caller.id);

  assert.equal(commsEvents.length, 1, 'comms:message must be emitted for player');
  assert.equal(commsEvents[0].channel, 'distress');
});

test('ordinary ships obey the same physics everyone else does (no teleporting out of danger)', () => {
  const { state, bus, helpers, station } = createMockState(888);
  const trafficSys = createTrafficSystem(state, bus, helpers);

  const civilian = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 50, z: 50 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: { trafficRole: 'courier' },
  });
  const rec = {
    id: civilian.id,
    role: 'courier',
    targetId: station.id,
  };
  state.traffic.freighters.push(rec);

  const initialX = civilian.pos.x;
  const initialZ = civilian.pos.z;

  // Attacker fires near civilian
  const attacker = helpers.spawnEntity({
    id: 999,
    type: 'ship',
    pos: { x: 55, z: 55 },
  });

  bus.emit('combat:damage', {
    targetId: civilian.id,
    attackerId: attacker.id,
    applied: 10,
    pos: { x: 50, z: 50 },
  });

  // Traffic updates intents only — it NEVER teleports entities or snaps coordinates
  trafficSys.update(0.1, state);

  // Position must not have teleported
  assert.equal(civilian.pos.x, initialX, 'Position X must not change during traffic intent step');
  assert.equal(civilian.pos.z, initialZ, 'Position Z must not change during traffic intent step');

  // Instead, physics intent must be set
  assert.ok(civilian.data.intent, 'Ship must have physics intent');
  assert.notEqual(civilian.data.intent.moveX, 0, 'Courier evasive moveX set');
  assert.equal(civilian.data.intent.moveZ, 1, 'Forward thrust set');
  assert.equal(civilian.data.intent.boost, true, 'Boost set');
  assert.ok(Number.isFinite(civilian.data.intent.aimAngle), 'Steering aimAngle set');
});

test('isShipDisabled detects disabled, derelict, and low health ships', () => {
  const { state, helpers } = createMockState(111);

  const healthy = helpers.spawnEntity({
    type: 'ship',
    hull: 100,
    hullMax: 100,
    data: { hp: 100, maxHp: 100 },
  });
  assert.equal(isShipDisabled(healthy, state), false, 'Healthy ship is not disabled');

  const disabledFlag = helpers.spawnEntity({
    type: 'ship',
    data: { disabled: true },
  });
  assert.equal(isShipDisabled(disabledFlag, state), true, 'Ship with data.disabled is disabled');

  const derelict = helpers.spawnEntity({
    type: 'ship',
    data: { derelict: true },
  });
  assert.equal(isShipDisabled(derelict, state), true, 'Ship with data.derelict is disabled');

  const lowHull = helpers.spawnEntity({
    type: 'ship',
    hull: 15,
    hullMax: 100,
    data: { hp: 15, maxHp: 100 },
  });
  assert.equal(isShipDisabled(lowHull, state), true, 'Ship with <= 25% hull is disabled');
});

test('tourists loiter at scenic bodies during ordinary flight', () => {
  const { state, bus, helpers, station } = createMockState(555);
  const trafficSys = createTrafficSystem(state, bus, helpers);

  // Position player near scenic zone so tourist is within exact simulation tier
  state.entities.get(state.playerId).pos = { x: 400, z: 400 };

  const tourist = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 450, z: 450 },
    vel: { x: 0, z: 0 },
    data: { trafficRole: 'tourist' },
  });
  const touristRec = {
    id: tourist.id,
    role: 'tourist',
    targetId: station.id,
  };
  state.traffic.freighters.push(touristRec);

  // Step traffic in peaceful conditions
  trafficSys.update(0.1, state);

  // Tourist should resolve or pick scenic body (planet_helios) and enter loiter cruise
  assert.ok(touristRec.scenicBodyId || tourist.data.scenicBodyId, 'Tourist should pick scenic body');
  assert.ok(tourist.data.intent, 'Tourist should have flight intent');
  assert.ok(tourist.data.intent.moveZ > 0, 'Tourist moves forward along scenic loiter track');
});

test('tugs stop to assist disabled ships during ordinary flight', () => {
  const { state, bus, helpers, station } = createMockState(666);
  const trafficSys = createTrafficSystem(state, bus, helpers);

  // Disabled ship at (200, 200)
  const disabledShip = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 200, z: 200 },
    data: { disabled: true },
  });

  // Tug far from disabled ship (e.g. at 200, 100 -> distance 100 WU > 60 WU)
  const tug = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 200, z: 100 },
    vel: { x: 0, z: 0 },
    data: { trafficRole: 'tug' },
  });
  const tugRec = {
    id: tug.id,
    role: 'tug',
    targetId: station.id,
  };
  state.traffic.freighters.push(tugRec);

  // Step 1: Tug approaches disabled ship
  trafficSys.update(0.1, state);
  assert.equal(tugRec.assistingShipId, disabledShip.id, 'Tug targets disabled ship');
  assert.equal(tug.data.intent.moveZ > 0, true, 'Tug cruises toward disabled ship');

  // Step 2: Tug moves into close assistance range (< 60 WU)
  tug.pos.x = 200;
  tug.pos.z = 180; // distance 20 WU
  trafficSys.update(0.1, state);

  // Tug stops / brakes to assist!
  assert.equal(tug.data.intent.moveZ, 0, 'Tug cuts thrust when in assistance range');
  assert.equal(tug.data.intent.brake, true, 'Tug brakes to assist disabled ship');
});

test('no frame-budget regression on crowded sector probe', () => {
  const { state, bus, helpers, station } = createMockState(999);
  const trafficSys = createTrafficSystem(state, bus, helpers);

  // Spawn disabled ship for tugs
  helpers.spawnEntity({
    type: 'ship',
    pos: { x: 100, z: 100 },
    data: { disabled: true },
  });

  // Spawn 60 diverse civilian ships across all roles
  const roles = ['miner', 'courier', 'hauler', 'tug', 'tourist'];
  for (let i = 0; i < 60; i++) {
    const role = roles[i % roles.length];
    const ship = helpers.spawnEntity({
      type: 'ship',
      pos: { x: (i % 10) * 80 - 400, z: Math.floor(i / 10) * 80 - 240 },
      data: { trafficRole: role },
    });
    state.traffic.freighters.push({
      id: ship.id,
      role,
      targetId: station.id,
    });
  }

  // Warmup (30 ticks)
  for (let i = 0; i < 30; i++) {
    state.tick++;
    state.simTime += 0.016;
    trafficSys.update(0.016, state);
  }

  // Measure 300 ticks (5 seconds of 60 Hz simulation)
  const t0 = performance.now();
  const ticks = 300;
  for (let i = 0; i < ticks; i++) {
    state.tick++;
    state.simTime += 0.016;
    trafficSys.update(0.016, state);
  }
  const elapsedMs = performance.now() - t0;
  const avgMsPerTick = elapsedMs / ticks;

  // Frame budget: at 60 Hz, total frame budget is 16.67ms.
  // Traffic system update for 60 ships must stay comfortably under 2.5ms per tick (< 15% of frame budget).
  assert.ok(
    avgMsPerTick < 2.5,
    `Crowded traffic must not exceed 2.5ms/tick (got ${avgMsPerTick.toFixed(4)}ms/tick over ${ticks} ticks with 60 ships)`
  );
});


