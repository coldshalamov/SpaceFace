// PR95 Plan 19 — physical Scavenger Swarm acceptance.
//
// This harness drives the real production chain: entity:killed -> Aftermath marker -> Mining's
// immediate wreck -> aftermathWreck:spawned -> anomalyRuntime wildlife. Motion is then stepped by
// the production Rapier owner; no test-only velocity or swarm spawn stands in for gameplay.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { Masks } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { save } from '../src/save/saveSystem.js';
import { SCAVENGER_SWARM } from '../src/data/anomalySites.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import {
  anomalyRuntime,
  scavengerSwarmAdmitted,
} from '../src/systems/anomalyRuntime.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { mining } from '../src/systems/mining.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';

const SECTOR_ID = 'sector_ceres_belt';

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function admittedSeed() {
  for (let seed = 1; seed < 10_000; seed++) {
    if (scavengerSwarmAdmitted(seed, SECTOR_ID)) return seed;
  }
  throw new Error('expected one admitted deterministic Ceres seed');
}

function zoneCenter() {
  const zone = (SECTOR_ZONES[SECTOR_ID] || []).find((candidate) => candidate.id === 'zone_ceres_belt');
  assert.ok(zone, 'canonical Ceres belt zone exists');
  return sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
}

function liveDrones(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'drone' && entity.data
    && entity.data.scavengerSwarmId === SCAVENGER_SWARM.id);
}

function liveAftermathWrecks(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data && entity.data.markerId
    && entity.data.provenance && entity.data.provenance.source === 'battle-aftermath');
}

function relativeFingerprint(state) {
  const anchor = liveAftermathWrecks(state)[0];
  assert.ok(anchor, 'fresh aftermath anchor is live');
  return liveDrones(state)
    .map((drone) => ({
      slot: drone.data.scavengerSlot,
      markerId: drone.data.scavengerMarkerId,
      x: drone.pos.x - anchor.pos.x,
      z: drone.pos.z - anchor.pos.z,
    }))
    .sort((a, b) => a.slot - b.slot);
}

function averageDistanceToHomes(drones, homes) {
  return drones.reduce((sum, drone) => {
    const home = homes.get(drone.data.scavengerSlot);
    return sum + Math.hypot(drone.pos.x - home.x, drone.pos.z - home.z);
  }, 0) / Math.max(1, drones.length);
}

async function boot(seed = admittedSeed()) {
  const bus = createBus();
  const sim = createSimulation({
    seed,
    bus,
    systems: [anomalyRuntime, aftermathWrecks, mining, physics, save],
    updateOrder: [anomalyRuntime, physics, aftermathWrecks, mining, save],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';

  const center = zoneCenter();
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    factionId: 'player',
    pos: { x: center.x + 480, z: center.z + 480 },
    vel: { x: 0, z: 0 },
    radius: 7,
    mass: 90,
    hull: 300,
    hullMax: 300,
    collides: true,
    collisionMask: Masks.WRECK | Masks.DRONE,
    flags: { persistent: true },
    physicsBody: {
      schemaVersion: 1,
      radius: 7,
      mass: 90,
      inertiaY: 2205,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: { kind: 'player', isPlayer: true },
  });
  state.playerId = player.id;

  const events = { recorded: [], spawned: [], ordinaryRewards: [] };
  bus.on('aftermathWreck:recorded', (payload) => events.recorded.push(deepCopy(payload)));
  bus.on('aftermathWreck:spawned', (payload) => events.spawned.push(deepCopy(payload)));
  for (const event of ['loot:drop', 'economy:grantCredits', 'lootShards:spawn']) {
    bus.on(event, (payload) => events.ordinaryRewards.push({ event, payload: deepCopy(payload) }));
  }

  const physicsOwner = sim.registry.get('physics');
  assert.equal(await physicsOwner.prepareBackend(state, { reset: true }), true,
    'real rapier-dynamic authority starts');
  sim.runTicks(2);
  return { sim, bus, state, player, events, physicsOwner };
}

function destroyFreshShip(route) {
  const center = zoneCenter();
  const victim = route.sim.spawn({
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    pos: { x: center.x, z: center.z },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 180,
    hull: 0,
    hullMax: 180,
    collides: true,
    data: { defId: 'ship_jackal', name: 'Unlucky Cutter' },
  });
  victim.alive = false;
  route.bus.emit('entity:killed', {
    id: victim.id,
    type: 'ship',
    victimClass: 'ship_jackal',
    label: 'Unlucky Cutter',
    factionId: victim.factionId,
    killerId: route.state.playerId,
    sectorId: SECTOR_ID,
    pos: { x: center.x, z: center.z },
  });
  const anchor = liveAftermathWrecks(route.state)[0];
  assert.ok(anchor, 'Mining creates the real immediate aftermath wreck');
  return anchor;
}

function dispose(route) {
  if (route.physicsOwner && typeof route.physicsOwner._disableSg02DynamicAuthority === 'function') {
    route.physicsOwner._disableSg02DynamicAuthority();
  }
  route.sim.dispose();
}

test('seeded minority admission binds one neutral five-drone swarm to the real fresh-wreck receipt', async () => {
  const seed = admittedSeed();
  const admitted = SECTORS.filter((sector) => scavengerSwarmAdmitted(seed, sector.id));
  assert.ok(admitted.some((sector) => sector.id === SECTOR_ID));
  assert.ok(admitted.length > 0 && admitted.length < SECTORS.length / 2,
    'seeded wildlife appears in a minority of the authored graph');
  assert.ok(admitted.every((sector) => SCAVENGER_SWARM.sectorIds.includes(sector.id)),
    'admission never escapes the three authored rough-space candidates');

  const route = await boot(seed);
  try {
    const anchor = destroyFreshShip(route);
    assert.equal(route.events.recorded.length, 1, 'Aftermath records the production kill');
    assert.equal(route.events.spawned.length, 1, 'Mining bind publishes the real fresh-wreck receipt');
    assert.equal(route.events.spawned[0].entityId, anchor.id);

    const drones = liveDrones(route.state);
    assert.equal(drones.length, SCAVENGER_SWARM.count, 'one bounded five-drone swarm materializes');
    assert.equal(new Set(drones.map((drone) => drone.data.scavengerSlot)).size,
      SCAVENGER_SWARM.count, 'one physical drone per deterministic slot');
    assert.ok(drones.every((drone) => drone.data.scavengerMarkerId === anchor.data.markerId
      && drone.data.scavengerWreckId === anchor.id), 'every drone is bound to the same real wreck');
    assert.ok(drones.every((drone) => drone.physicsBody && drone.physicsBody.dynamic === true
      && drone.team === 2 && drone.data.ai == null),
    'all scavengers are neutral dynamic Rapier bodies');
    assert.ok(drones.every((drone) => drone.data.worldSiteTargetable === false
      && drone.data.ordinaryRewardsSuppressed === true
      && drone.data.bountyCr === 0 && drone.data.loot.length === 0
      && isHostileToPlayer(drone, route.player.team, route.state) === false),
    'swarm has no hostile target, HP-bar route, bounty, loot, or reward identity');
    assert.equal(route.state.player.targetId, null);
    assert.deepEqual(route.events.ordinaryRewards, []);
  } finally {
    dispose(route);
  }
});

test('queued physics impulses scatter near the player and return the same drones to the wreck', async () => {
  const route = await boot();
  try {
    const anchor = destroyFreshShip(route);
    const homes = new Map(liveDrones(route.state).map((drone) => [
      drone.data.scavengerSlot,
      { x: drone.pos.x, z: drone.pos.z },
    ]));

    route.player.pos.x = anchor.pos.x + 42;
    route.player.pos.z = anchor.pos.z;
    route.player.prevPos.copy(route.player.pos);
    route.player.vel.set(0, 0, 0);
    assert.equal(await route.physicsOwner.prepareBackend(route.state, { reset: true }), true);
    route.sim.runTicks(120);

    const scattered = liveDrones(route.state);
    const scatteredDistance = averageDistanceToHomes(scattered, homes);
    assert.ok(scatteredDistance > 12,
      `Rapier consumes queued scatter impulses (mean home displacement ${scatteredDistance})`);
    assert.ok(scattered.some((drone) => drone.data.scavengerPhase === 'scatter'));

    route.player.pos.x = anchor.pos.x + 520;
    route.player.pos.z = anchor.pos.z + 520;
    route.player.prevPos.copy(route.player.pos);
    route.player.vel.set(0, 0, 0);
    assert.equal(await route.physicsOwner.prepareBackend(route.state, { reset: true }), true);
    route.sim.runTicks(360);

    const returned = liveDrones(route.state);
    const returnedDistance = averageDistanceToHomes(returned, homes);
    assert.ok(returnedDistance < scatteredDistance * 0.55,
      `bounded return impulses bring drones back to their wreck slots (${returnedDistance} < ${scatteredDistance})`);
    assert.ok(returned.every((drone) => drone.data.scavengerMarkerId === anchor.data.markerId),
      'return does not replace or rebind the swarm');
    assert.equal(returned.length, SCAVENGER_SWARM.count);
  } finally {
    dispose(route);
  }
});

test('same seed and fresh wreck identity repeat the exact initial formation', async () => {
  const first = await boot();
  const repeat = await boot();
  try {
    destroyFreshShip(first);
    destroyFreshShip(repeat);
    assert.deepEqual(relativeFingerprint(first.state), relativeFingerprint(repeat.state));
  } finally {
    dispose(first);
    dispose(repeat);
  }
});

test('Continue and re-entry reform one fresh swarm; removed or cold wrecks carry none', async () => {
  const route = await boot();
  try {
    let anchor = destroyFreshShip(route);
    const initial = relativeFingerprint(route.state);
    const saveOwner = route.sim.registry.get('save');
    const envelope = saveOwner.serialize('plan19-scavenger-swarm');
    assert.equal(saveOwner.loadEnvelope(deepCopy(envelope), 'plan19-scavenger-swarm'), true,
      'real Continue succeeds with the durable aftermath marker');
    assert.equal(await route.physicsOwner.prepareBackend(route.state), true,
      'Continue re-establishes Rapier authority');

    assert.equal(liveAftermathWrecks(route.state).length, 1);
    assert.equal(liveDrones(route.state).length, SCAVENGER_SWARM.count,
      'Continue reforms exactly one transient swarm');
    assert.deepEqual(relativeFingerprint(route.state), initial,
      'same saved fresh marker deterministically reforms the same slots');
    assert.equal(new Set(liveDrones(route.state).map((drone) => drone.data.scavengerSlot)).size,
      SCAVENGER_SWARM.count, 'Continue creates no duplicate slot');

    anchor = liveAftermathWrecks(route.state)[0];
    route.sim.helpers.removeEntity(anchor.id);
    route.sim.step(SIM_DT);
    assert.equal(liveDrones(route.state).length, 0, 'removed wreck immediately loses its swarm');

    route.state.world.currentSectorId = 'sector_helios_prime';
    route.bus.emit('sector:exit', { sectorId: SECTOR_ID });
    route.sim.step(SIM_DT);
    route.state.world.currentSectorId = SECTOR_ID;
    route.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    assert.equal(liveAftermathWrecks(route.state).length, 1, 'Aftermath rematerializes the same marker');
    assert.equal(liveDrones(route.state).length, SCAVENGER_SWARM.count,
      'fresh re-entry reforms one swarm');
    assert.equal(new Set(liveDrones(route.state).map((drone) => drone.data.scavengerSlot)).size,
      SCAVENGER_SWARM.count);

    anchor = liveAftermathWrecks(route.state)[0];
    route.state.simTime = anchor.data.freshUntil + 1;
    route.sim.step(SIM_DT);
    assert.equal(liveDrones(route.state).length, 0, 'cold wreck carries no scavenger wildlife');

    route.state.world.currentSectorId = 'sector_helios_prime';
    route.bus.emit('sector:exit', { sectorId: SECTOR_ID });
    route.sim.helpers.removeEntity(anchor.id);
    route.sim.step(SIM_DT);
    route.state.world.currentSectorId = SECTOR_ID;
    route.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    assert.equal(liveAftermathWrecks(route.state).length, 1, 'cold aftermath marker still rematerializes');
    assert.equal(liveDrones(route.state).length, 0,
      'cold re-entry does not pretend the old battle is fresh again');
  } finally {
    dispose(route);
  }
});
