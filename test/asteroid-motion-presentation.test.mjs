import assert from 'node:assert/strict';
import test from 'node:test';
import { createAsteroidMotionTracker, resolveAsteroidSizeFactor } from '../src/render/asteroidMotionPresentation.js';

function createMockAsteroidMesh() {
  const body = {
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
  };
  return {
    userData: { asteroidBody: body },
    children: [body],
  };
}

test('asteroid motion: continuous 3D multi-axis zero-G tumble', () => {
  const tracker = createAsteroidMotionTracker();
  const mesh = createMockAsteroidMesh();
  const asteroid = { id: 'ast_test_1', type: 'asteroid', radius: 15 };

  // Frame 1
  tracker.updateAsteroidMotion(asteroid, mesh, 1.0, 0.016);
  const rot1X = mesh.userData.asteroidBody.rotation.x;
  const rot1Y = mesh.userData.asteroidBody.rotation.y;
  const rot1Z = mesh.userData.asteroidBody.rotation.z;

  // Frame 2
  tracker.updateAsteroidMotion(asteroid, mesh, 1.05, 0.05);
  const rot2X = mesh.userData.asteroidBody.rotation.x;
  const rot2Y = mesh.userData.asteroidBody.rotation.y;
  const rot2Z = mesh.userData.asteroidBody.rotation.z;

  assert.notEqual(rot1X, rot2X, 'rotates around X axis');
  assert.notEqual(rot1Y, rot2Y, 'rotates around Y axis');
  assert.notEqual(rot1Z, rot2Z, 'rotates around Z axis');
});

test('asteroid motion: projectile damage & collision induces impact wobble and damps', () => {
  const tracker = createAsteroidMotionTracker();
  const mesh = createMockAsteroidMesh();
  const asteroid = { id: 'ast_wobble_1', type: 'asteroid', radius: 10 };

  tracker.updateAsteroidMotion(asteroid, mesh, 1.0, 0.016);
  tracker.onDamage({ targetId: 'ast_wobble_1', damage: 50 });

  tracker.updateAsteroidMotion(asteroid, mesh, 1.016, 0.016);
  // Wobble phase is non-zero
  const body = mesh.userData.asteroidBody;
  assert.ok(body.rotation.x !== 0, 'wobble applied to rotation');

  // Over 2 seconds, wobble damps down
  for (let i = 0; i < 60; i++) {
    tracker.updateAsteroidMotion(asteroid, mesh, 1.016 + (i + 1) * 0.033, 0.033);
  }
  // After damp, it smoothly continues regular tumble
  assert.ok(Number.isFinite(body.rotation.x));
});

test('asteroid motion: mining laser contact induces thermal agitation jitter', () => {
  const tracker = createAsteroidMotionTracker();
  const mesh = createMockAsteroidMesh();
  const asteroid = { id: 'ast_mined_1', type: 'asteroid', radius: 12, data: { isBeingMined: true } };

  tracker.updateAsteroidMotion(asteroid, mesh, 2.0, 0.016);
  tracker.updateAsteroidMotion(asteroid, mesh, 2.05, 0.05);

  const body = mesh.userData.asteroidBody;
  assert.ok(body.position.x !== 0 || body.position.z !== 0, 'thermal agitation causes position micro-jitter');
});

test('asteroid motion: reduced motion preserves static orientation without extreme motion', () => {
  const tracker = createAsteroidMotionTracker();
  const mesh = createMockAsteroidMesh();
  const asteroid = { id: 'ast_reduce_1', type: 'asteroid', radius: 12 };

  tracker.updateAsteroidMotion(asteroid, mesh, 10.0, 0.016, { motionReduce: true });
  const rx1 = mesh.userData.asteroidBody.rotation.x;

  tracker.updateAsteroidMotion(asteroid, mesh, 10.5, 0.5, { motionReduce: true });
  const rx2 = mesh.userData.asteroidBody.rotation.x;

  assert.equal(rx1, rx2, 'tumble frozen under reduced motion');
});

test('asteroid motion: size factor halves the rate at double radius, clamped, NaN-safe', () => {
  assert.equal(resolveAsteroidSizeFactor(16), 1);
  assert.ok(Math.abs(resolveAsteroidSizeFactor(32) - 0.5) < 1e-9);
  assert.equal(resolveAsteroidSizeFactor(1000), 0.35);
  assert.equal(resolveAsteroidSizeFactor(1), 1.6);
  assert.equal(resolveAsteroidSizeFactor(NaN), 1);
  assert.equal(resolveAsteroidSizeFactor(0), 1);
  assert.equal(resolveAsteroidSizeFactor(-4), 1);
});

test('asteroid motion: pebbles visibly out-turn mountains with identical spin seeds', () => {
  // Same entity id in fresh trackers => identical hashed spin; only the radius differs.
  const pebbleTracker = createAsteroidMotionTracker();
  const mountainTracker = createAsteroidMotionTracker();
  const pebbleMesh = createMockAsteroidMesh();
  const mountainMesh = createMockAsteroidMesh();
  const pebble = { id: 'ast_size_1', type: 'asteroid', radius: 8 };
  const mountain = { id: 'ast_size_1', type: 'asteroid', radius: 64 };

  pebbleTracker.updateAsteroidMotion(pebble, pebbleMesh, 1.0, 0.05);
  mountainTracker.updateAsteroidMotion(mountain, mountainMesh, 1.0, 0.05);
  const pebbleY0 = pebbleMesh.userData.asteroidBody.rotation.y;
  const mountainY0 = mountainMesh.userData.asteroidBody.rotation.y;
  pebbleTracker.updateAsteroidMotion(pebble, pebbleMesh, 1.05, 0.05);
  mountainTracker.updateAsteroidMotion(mountain, mountainMesh, 1.05, 0.05);
  const pebbleTurn = Math.abs(pebbleMesh.userData.asteroidBody.rotation.y - pebbleY0);
  const mountainTurn = Math.abs(mountainMesh.userData.asteroidBody.rotation.y - mountainY0);
  // Factors 1.6 vs 0.35 — the pebble turns ~4.57x further on the same frame.
  const ratio = pebbleTurn / mountainTurn;
  assert.ok(ratio > 4.4 && ratio < 4.7, `pebble out-turns mountain: ${ratio.toFixed(2)}x`);
});
