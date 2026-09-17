import assert from 'node:assert/strict';
import test from 'node:test';
import { createShipMicroMotionTracker } from '../src/render/shipMicroMotion.js';

function createMockMesh() {
  const hull = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  };
  const barrel = { position: { x: 0.5, y: 0, z: 0 } };
  const wProp = {
    userData: {
      barrel,
      barrelBaseX: 0.5,
      barrelRecoilX: 0,
    },
  };
  const drillBit = { rotation: { x: 0, y: 0, z: 0 } };
  const drill = {
    userData: {
      drillBit,
    },
  };

  return {
    userData: {
      hull,
      weapons: [wProp],
      drill,
    },
  };
}

test('ship micro-motion: weapon fire induces recoil kick and spring-damped recovery', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockMesh();
  const entity = { id: 42, vel: { x: 50, z: 0 }, flags: {} };

  // Initial update
  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);
  assert.equal(mesh.userData.hull.position.x, 0, 'starts at rest');

  // Trigger weapon fire (heavy railgun)
  tracker.onFire({ ownerId: 42, weaponId: 'railgun_heavy', hardpointIdx: 0 });

  // Update next frame: recoil kick should displace hull along -X
  tracker.updateCraftMicroMotion(entity, mesh, 1.016, 0.016);
  assert.ok(mesh.userData.hull.position.x < -0.05, `hull kicked backward: ${mesh.userData.hull.position.x}`);
  assert.ok(mesh.userData.weapons[0].userData.barrel.position.x < 0.5, 'barrel stroked backward');

  // Over several frames, spring returns hull and barrel back toward base
  for (let i = 0; i < 30; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 1.016 + (i + 1) * 0.016, 0.016);
  }

  assert.ok(Math.abs(mesh.userData.hull.position.x) < 0.05, `recoil settled back to near zero: ${mesh.userData.hull.position.x}`);
  assert.ok(Math.abs(mesh.userData.weapons[0].userData.barrel.position.x - 0.5) < 0.02, 'barrel returned to rest');
});

test('ship micro-motion: combat damage induces impact flinch and shudder', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockMesh();
  const entity = { id: 10, vel: { x: 20, z: 0 }, flags: {} };

  // Initial update
  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);

  // Trigger damage from starboard hit normal
  tracker.onDamage({ targetId: 10, damage: 45, hitNormal: { x: 0.5, z: 0.8 } });

  tracker.updateCraftMicroMotion(entity, mesh, 1.016, 0.016);
  assert.ok(mesh.userData.hull.rotation.x !== 0, 'hull flinched in roll');
  assert.ok(mesh.userData.hull.rotation.z !== 0, 'hull flinched in pitch');
  assert.ok(mesh.userData.hull.position.z !== 0, 'hull received lateral impact displacement');
});

test('ship micro-motion: boost throttle surge squats and idle breathing activates when stopped', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockMesh();

  // Boosting craft
  const boostingEntity = { id: 101, vel: { x: 120, z: 0 }, flags: { boosting: true } };
  tracker.updateCraftMicroMotion(boostingEntity, mesh, 2.0, 0.016);
  tracker.updateCraftMicroMotion(boostingEntity, mesh, 2.05, 0.05);

  // Squat pitch and powerplant vibration
  assert.ok(mesh.userData.hull.rotation.z < 0, `boosting squats nose-up/tail-down: ${mesh.userData.hull.rotation.z}`);

  // Stopped craft: zero-G spatial breathing
  const stoppedEntity = { id: 102, vel: { x: 0, z: 0 }, flags: {} };
  const meshStopped = createMockMesh();
  tracker.updateCraftMicroMotion(stoppedEntity, meshStopped, 5.0, 0.016);
  assert.ok(meshStopped.userData.hull.position.y !== 0, 'idle breathing produces subtle vertical heave');
  assert.ok(meshStopped.userData.hull.rotation.x !== 0, 'idle breathing produces subtle roll oscillation');
});

test('ship micro-motion: mining drill bit rotates during active extraction', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockMesh();
  const miner = { id: 7, vel: { x: 0, z: 0 }, flags: {}, data: { miningBeamActive: true } };

  tracker.updateCraftMicroMotion(miner, mesh, 10.0, 0.016, { playerMiningActive: true, playerId: 7 });
  assert.ok(mesh.userData.drill.userData.drillBit.rotation.x > 0.4, 'drill bit spun during mining');
});

test('ship micro-motion: reduced motion suppresses high-frequency shudder', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockMesh();
  const entity = { id: 99, vel: { x: 120, z: 0 }, flags: { boosting: true } };

  tracker.updateCraftMicroMotion(entity, mesh, 20.0, 0.016, { motionReduce: true });
  assert.equal(mesh.userData.hull.position.y, 0, 'reduced motion zeroes out idle heave and boost jitter Y');
  assert.equal(mesh.userData.hull.position.z, 0, 'reduced motion zeroes out lateral shudder Z');
});
