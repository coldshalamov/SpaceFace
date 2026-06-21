import assert from 'node:assert/strict';

import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { Masks } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { physics } from '../src/core/physics.js';
import { snapshotSimState } from '../src/core/simSnapshot.js';
import { flight } from '../src/systems/flight.js';

const DT = 1 / 60;

const state = createGameState(0x4702);
state.mode = 'flight';
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
state.entities.clear();
state.entityList.length = 0;
state.playerId = 1;
state.input = { ...state.input, moveZ: 1, moveX: 0.15, turnIntent: 0.6, boost: false, controlsBlocked: false };

const ship = makeShip(1);
state.entities.set(ship.id, ship);
state.entityList.push(ship);

const helpers = {};
const bus = createBus();
const pickupsCollected = [];
const projectileHits = [];
bus.on('pickup:collected', (payload) => pickupsCollected.push(payload));
bus.on('projectile:hit', (payload) => projectileHits.push(payload));

physics.init({ state, bus, helpers });
assert.equal(typeof helpers.combatPhysics.applyImpulse, 'function', 'physics.init should install a stable SG-03 combat physics port');
assert.equal(helpers.combatPhysics.applyImpulse({ entityId: ship.id, impulse: { x: 5, y: 0, z: 0 } }), false,
  'port should fail closed before the dynamic body owner is ready');

flight.init({ state, bus, helpers });

ship.vel.x = 30;
physics.update(DT, state);
assert.equal(ship.pos.x, 0, 'rapier-dynamic mode should not fall back to legacy integration while Rapier initializes');

await physics._sg02Init;
assert(physics._sg02, 'SG-02 dynamic owner should become ready for explicit rapier-dynamic mode');

ship.pos.x = 0;
ship.pos.z = 0;
ship.vel.x = 0;
ship.vel.z = 0;
ship.rot = 0;
ship.angVel = 0;

flight.update(DT, state);
assert.equal(ship.pos.x, 0, 'flight should not move the entity before the SG-02 owner step');
assert.equal(ship.vel.x, 0, 'flight should not mutate velocity before the SG-02 owner step');

physics.update(DT, state);
assert(ship.pos.x > 0, 'SG-02 production owner should move the craft from flight force commands');
assert(ship.vel.x > 0, 'SG-02 production owner should publish measured body velocity');
assert(ship.rot > 0, 'SG-02 production owner should rotate from flight torque commands');

const telemetry = readPhysicsTelemetry(ship);
assert(telemetry, 'SG-02 production owner should publish physics telemetry');
assert.equal(telemetry.mode, 'rapier-dynamic', 'production telemetry should identify the dynamic backend');
assert.equal(telemetry.dynamic, true, 'production craft should be a dynamic body');
assert.equal(state.physicsRuntime.diagnostics.backend, 'rapier-dynamic', 'physics diagnostics should report rapier-dynamic');
assert.equal(state.physicsRuntime.diagnostics.sg02Ready, true, 'physics diagnostics should report SG-02 readiness');
assert(Array.isArray(state.physicsRuntime.sg02Snapshot), 'physics runtime should publish a quantized SG-02 body snapshot');
assert(state.physicsRuntime.sg02Snapshot.some((body) => body.id === ship.id), 'SG-02 body snapshot should include the live craft');

const simSnapshot = snapshotSimState(state);
assert.equal(simSnapshot.physics.backend, 'rapier-dynamic', 'SG-01 snapshot should identify the dynamic physics backend');
assert.equal(simSnapshot.physics.ready, true, 'SG-01 snapshot should preserve SG-02 readiness');
assert(simSnapshot.physics.bodies.some((body) => body.id === ship.id), 'SG-01 snapshot should fold in quantized SG-02 body state');

assert.equal(helpers.combatPhysics.applyImpulse({ entityId: ship.id, impulse: { x: 3, y: 100, z: 0 } }), true,
  'stable SG-03 port should forward impulses after the dynamic owner is ready');
physics.update(DT, state);
assert(readPhysicsTelemetry(ship).force.x === 0, 'one-shot combat impulse should not masquerade as continuous flight force');

const pickup = makePickup(2, ship.pos.x, ship.pos.z);
state.entities.set(pickup.id, pickup);
state.entityList.push(pickup);

physics.update(DT, state);
assert.equal(pickup.alive, false, 'rapier-dynamic mode should emit pickup collection contacts');
assert.equal(pickupsCollected.length, 1, 'rapier-dynamic mode should collect a pickup exactly once');
assert.deepEqual(pickupsCollected[0], {
  pickupId: pickup.id,
  collectorId: ship.id,
  kind: 'cargo',
  amount: 2,
  commodityId: 'cmdty_scrap_metal',
  pos: { x: pickup.pos.x, z: pickup.pos.z },
});
assert.equal(state.physicsRuntime.diagnostics.pickupCollections, 1, 'physics diagnostics should count dynamic pickup contact events');

const projectile = makeProjectile(3, ship.pos.x - 24, ship.pos.z);
state.entities.set(projectile.id, projectile);
state.entityList.push(projectile);

physics.update(DT, state);
assert.equal(projectile.alive, false, 'rapier-dynamic mode should advance and consume projectile contacts');
assert.equal(projectileHits.length, 1, 'rapier-dynamic mode should emit exactly one projectile hit');
assert.equal(projectileHits[0].targetId, ship.id, 'dynamic projectile hit should target the live ship');
assert.equal(projectileHits[0].ownerId, projectile.ownerId, 'dynamic projectile hit should preserve owner id');
assert.equal(projectileHits[0].damage, 11, 'dynamic projectile hit should preserve scalar compatibility damage');
assert.equal(projectileHits[0].damageType, 'ion', 'dynamic projectile hit should preserve scalar compatibility damage type');
assert.equal(projectileHits[0].weaponId, 'wpn_sg02_dynamic_probe', 'dynamic projectile hit should preserve weapon id');
assert.equal(projectileHits[0].damagePacket.source.weaponId, 'wpn_sg02_dynamic_probe', 'dynamic projectile hit should preserve authored packet source');
assert.equal(projectileHits[0].damagePacket.hit.pos.x, projectileHits[0].pos.x, 'dynamic projectile packet should carry deterministic impact X');
assert.equal(projectileHits[0].damagePacket.hit.pos.z, projectileHits[0].pos.z, 'dynamic projectile packet should carry deterministic impact Z');
assert.equal(state.physicsRuntime.diagnostics.sweptProjectileHits, 1, 'physics diagnostics should count dynamic projectile contacts');
assert(!state.physicsRuntime.sg02Snapshot.some((body) => body.id === projectile.id), 'consumed projectiles should be filtered out of the published SG-02 snapshot');

physics._disableSg02DynamicAuthority();

console.log('SG-02 production authority checks OK');

function makeShip(id) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 10,
    mass: 32,
    thrust: 80,
    turnRate: 3,
    drag: 1.2,
    maxSpeed: 140,
    pos: { x: 0, z: 0 },
    prevPos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    prevRot: 0,
    angVel: 0,
    bank: 0,
    flags: {},
    collisionMask: Masks.ASTEROID | Masks.STATION | Masks.SHIP,
    data: {},
  };
}

function makePickup(id, x, z) {
  return {
    id,
    type: 'pickup',
    alive: true,
    collides: true,
    radius: 6,
    mass: 1,
    pos: { x, z },
    prevPos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    collisionMask: Masks.SHIP | Masks.DRONE,
    data: { kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 2 },
  };
}

function makeProjectile(id, x, z) {
  return {
    id,
    type: 'projectile',
    alive: true,
    collides: true,
    radius: 1,
    mass: 0.1,
    ownerId: 999,
    team: 1,
    pos: { x, z },
    prevPos: { x, z },
    vel: { x: 1200, z: 0 },
    rot: 0,
    collisionMask: Masks.SHIP,
    data: {
      damage: 11,
      damageType: 'ion',
      weaponId: 'wpn_sg02_dynamic_probe',
      damagePacket: scalarHitToDamagePacket({
        damage: 11,
        damageType: 'ion',
        source: { kind: 'weapon', weaponId: 'wpn_sg02_dynamic_probe' },
      }),
    },
  };
}

function createBus() {
  const listeners = new Map();
  return {
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, set = new Set());
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(event, payload) {
      for (const fn of [...(listeners.get(event) || [])]) fn(payload, event);
    },
  };
}
