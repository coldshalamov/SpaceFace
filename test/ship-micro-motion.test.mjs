import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contactYieldImpulse,
  createShipMicroMotionTracker,
  hullYieldPose,
  lineHaulPose,
} from '../src/render/shipMicroMotion.js';

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

function createScaledHullMesh() {
  const scale = {
    x: 1,
    y: 1,
    z: 1,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; },
  };
  return {
    userData: {
      hull: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale,
      },
    },
  };
}

function ship(id, mass, x, z, rot = 0) {
  return {
    id,
    mass,
    pos: { x, z },
    rot,
    radius: 12,
    vel: { x: 0, z: 0 },
    flags: {},
  };
}

test('contact yield: the same momentum crumples a light hull and leaves a hauler square', () => {
  const dp = 280 * 48;
  assert.ok(contactYieldImpulse(48, 280) > 1, 'a fighter past the full-crumple speed yields hard');
  assert.equal(contactYieldImpulse(dp / 2200, 2200), 0, 'that same momentum is a scrape on a hauler');

  const pose = hullYieldPose(0.1, -1, 0);
  assert.ok(pose.x < 0.92, 'shortens along the push');
  assert.ok(pose.z > 1.03, 'bulges across the push');
  assert.ok(pose.shiftX < 0, 'the struck nose stays and the body yields aft');

  function shortest(mass) {
    const tracker = createShipMicroMotionTracker();
    const mesh = createScaledHullMesh();
    const entity = ship(5, mass, 0, 0);
    tracker.updateCraftMicroMotion(entity, mesh, 1, 0.016);
    tracker.onImpact({
      aId: 5,
      bId: 8,
      dp,
      normal: { x: 1, z: 0 },
      pos: { x: 12, z: 0 },
    });
    let minX = 1;
    for (let i = 0; i < 14; i++) {
      tracker.updateCraftMicroMotion(entity, mesh, 1.016 + i * 0.016, 0.016);
      minX = Math.min(minX, mesh.userData.hull.scale.x);
    }
    return minX;
  }

  const light = shortest(280);
  const heavy = shortest(2200);
  assert.ok(light < 0.92, `light hull compresses: ${light}`);
  assert.ok(heavy > 0.99, `hauler stays square: ${heavy}`);
});

test('contact yield: a hard hit compresses, then rebounds instead of staying dented', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createScaledHullMesh();
  const entity = ship(6, 280, 0, 0);
  tracker.updateCraftMicroMotion(entity, mesh, 1, 0.016);
  tracker.onImpact({
    aId: 6,
    bId: 8,
    dp: 280 * 40,
    normal: { x: 1, z: 0 },
    pos: { x: 12, z: 0 },
  });
  let minX = 1;
  for (let i = 0; i < 80; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 1.016 + i * 0.016, 0.016);
    minX = Math.min(minX, mesh.userData.hull.scale.x);
  }
  const settled = mesh.userData.hull.scale.x;
  assert.ok(minX < 0.93, `peak compression: ${minX}`);
  assert.ok(settled > minX + 0.04, `rebounds toward shape: ${settled} from ${minX}`);
});

test('contact yield: a weapon hit dents along the shot, a collision damage packet does not dent twice', () => {
  function dent(normal) {
    const tracker = createShipMicroMotionTracker();
    const mesh = createScaledHullMesh();
    const entity = ship(3, 280, 0, 0);
    tracker.updateCraftMicroMotion(entity, mesh, 1, 0.016);
    tracker.onDamage({
      targetId: 3,
      damage: 55,
      hullHit: true,
      hitNormal: normal,
    });
    tracker.updateCraftMicroMotion(entity, mesh, 1.016, 0.016);
    return mesh.userData.hull.position.x;
  }
  assert.ok(dent({ x: 1, z: 0 }) > 0, 'a hit from ahead shoves the hull forward');
  assert.ok(dent({ x: -1, z: 0 }) < 0, 'a hit from behind shoves the hull back');

  const quiet = createShipMicroMotionTracker();
  const meshA = createScaledHullMesh();
  const meshB = createScaledHullMesh();
  const entityA = ship(4, 280, 0, 0);
  const echoed = createShipMicroMotionTracker();
  const entityB = ship(4, 280, 0, 0);
  quiet.updateCraftMicroMotion(entityA, meshA, 1, 0.016);
  echoed.updateCraftMicroMotion(entityB, meshB, 1, 0.016);
  const impact = {
    aId: 4,
    bId: 9,
    dp: 280 * 36,
    normal: { x: 1, z: 0 },
    pos: { x: 12, z: 0 },
  };
  quiet.onImpact(impact);
  echoed.onImpact(impact);
  echoed.onDamage({
    targetId: 4,
    damage: 90,
    hullHit: true,
    hitNormal: { x: -1, z: 0 },
    origin: { kind: 'collision' },
  });
  quiet.updateCraftMicroMotion(entityA, meshA, 1.016, 0.016);
  echoed.updateCraftMicroMotion(entityB, meshB, 1.016, 0.016);
  assert.equal(echoed.getRecord(4).yieldAmt, quiet.getRecord(4).yieldAmt,
    'collision damage must not add a second crumple on top of the contact');
});

test('line haul: a taut tether stretches both hulls toward the line, and letting go snaps them back', () => {
  const ahead = lineHaulPose(1, 1, 1, 0);
  assert.ok(ahead.x > 1.1, 'full haul elongates along the line');
  assert.ok(ahead.y < 1, 'the cross-section pinches');
  const aside = lineHaulPose(0, 1, 0, 1);
  assert.ok(aside.bank > 0.05, 'a line off the bow banks the hull');
  assert.ok(aside.yaw > 0.02, 'the nose yaws toward the line');

  const tracker = createShipMicroMotionTracker();
  const playerMesh = createScaledHullMesh();
  const targetMesh = createScaledHullMesh();
  const player = ship(1, 280, 0, 0, 0);
  const target = ship(2, 260, 80, 0, Math.PI);
  const entities = new Map([[1, player], [2, target]]);
  const options = {
    playerId: 1,
    tetherActive: true,
    tetherTargetId: 2,
    tetherLoad: 0.9,
    tetherPhase: 'loaded',
    entities,
  };
  let playerPeak = 1;
  let targetPeak = 1;
  for (let i = 0; i < 28; i++) {
    const t = 2 + i * 0.016;
    tracker.updateCraftMicroMotion(player, playerMesh, t, 0.016, options);
    tracker.updateCraftMicroMotion(target, targetMesh, t, 0.016, options);
    playerPeak = Math.max(playerPeak, playerMesh.userData.hull.scale.x);
    targetPeak = Math.max(targetPeak, targetMesh.userData.hull.scale.x);
  }
  assert.ok(playerPeak > 1.07, `player hull hauls: ${playerPeak}`);
  assert.ok(targetPeak > 1.07, `towed hull hauls back: ${targetPeak}`);

  const sideMesh = createScaledHullMesh();
  const sideTracker = createShipMicroMotionTracker();
  const sidePlayer = ship(11, 400, 0, 0, 0);
  const sideTarget = ship(12, 400, 0, 90, 0);
  const sideOptions = {
    playerId: 11,
    tetherActive: true,
    tetherTargetId: 12,
    tetherLoad: 0.85,
    tetherPhase: 'loaded',
    entities: new Map([[11, sidePlayer], [12, sideTarget]]),
  };
  for (let i = 0; i < 28; i++) {
    sideTracker.updateCraftMicroMotion(sidePlayer, sideMesh, 3 + i * 0.016, 0.016, sideOptions);
  }
  assert.ok(sideMesh.userData.hull.rotation.x > 0.015, 'a line to starboard banks the hull that way');

  options.tetherActive = false;
  options.tetherLoad = 0;
  options.tetherPhase = 'slack';
  tracker.onTetherLetGo({ targetId: 2 });
  for (let i = 0; i < 10; i++) {
    const t = 4 + i * 0.016;
    tracker.updateCraftMicroMotion(player, playerMesh, t, 0.016, options);
    tracker.updateCraftMicroMotion(target, targetMesh, t, 0.016, options);
  }
  assert.ok(playerMesh.userData.hull.scale.x < playerPeak - 0.04,
    `release collapses the haul: ${playerMesh.userData.hull.scale.x} from ${playerPeak}`);
  assert.ok(tracker.getRecord(1).yieldAmt > 0.02, 'the body thumps as the line lets go');
  assert.ok(tracker.getRecord(2).yieldAmt > 0.02, 'the other end thumps too');
});

test('contact yield: reduced motion keeps a smaller dent and drops the scrape', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createScaledHullMesh();
  const entity = ship(7, 280, 0, 0);
  tracker.updateCraftMicroMotion(entity, mesh, 1, 0.016, { motionReduce: true });
  tracker.onImpact({
    aId: 7,
    bId: 8,
    dp: 280 * 6,
    normal: { x: 1, z: 0 },
    pos: { x: 12, z: 0 },
  });
  tracker.updateCraftMicroMotion(entity, mesh, 1.016, 0.016, { motionReduce: true });
  assert.equal(mesh.userData.hull.scale.x, 1, 'a scrape does not flex the hull');

  tracker.onImpact({
    aId: 7,
    bId: 8,
    dp: 280 * 48,
    normal: { x: 1, z: 0 },
    pos: { x: 12, z: 0 },
  });
  let minX = 1;
  for (let i = 0; i < 14; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 1.032 + i * 0.016, 0.016, { motionReduce: true });
    minX = Math.min(minX, mesh.userData.hull.scale.x);
  }
  assert.ok(minX < 0.97 && minX > 0.9, `reduced motion keeps a readable smaller dent: ${minX}`);
});

test('ship micro-motion: reduced motion suppresses high-frequency shudder', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockMesh();
  const entity = { id: 99, vel: { x: 120, z: 0 }, flags: { boosting: true } };

  tracker.updateCraftMicroMotion(entity, mesh, 20.0, 0.016, { motionReduce: true });
  assert.equal(mesh.userData.hull.position.y, 0, 'reduced motion zeroes out idle heave and boost jitter Y');
  assert.equal(mesh.userData.hull.position.z, 0, 'reduced motion zeroes out lateral shudder Z');
});
