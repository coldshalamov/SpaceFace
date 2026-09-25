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

// 2026-09-25 live walk: one common rock compounded its body scale to ±2e8 — releaseEntityMesh
// nulls rec.scaleBodyRef, so the next frame re-captured the already-swollen scale as the new
// base and every release/reacquire cycle multiplied again. The camera-clearance box then read
// that rock's ~1.4e8 roof and the chase camera went to orbit. The swell base must be the
// body's pristine scale no matter how many times the mesh is released and reacquired.
test('strain swell never compounds the base scale across release/reacquire cycles', () => {
  const tracker = createAsteroidMotionTracker();
  const handlers = {};
  tracker.bindEvents({ on: (event, fn) => { handlers[event] = fn; return () => {}; } });

  const makeBody = (pristine) => {
    const body = {
      rotation: { x: 0, y: 0, z: 0 },
      position: { x: 0, y: 0, z: 0 },
      scale: {
        x: pristine, y: pristine, z: pristine,
        set(x, y, z) { this.x = x; this.y = y; this.z = z; },
      },
    };
    return body;
  };

  for (const pristine of [1, -1]) {
    const id = `ast_swell_${pristine < 0 ? 'mirror' : 'plain'}`;
    const body = makeBody(pristine);
    const mesh = { userData: {}, children: [body] };
    body.parent = mesh; // releaseMesh finds bodies through the parent chain
    const asteroid = {
      id, type: 'asteroid', radius: 12,
      data: { oreHP: 50, oreHPMax: 100 }, // fracture 0.5 → strain swell writes every frame
    };
    tracker.updateAsteroidMotion(asteroid, mesh, 0, 0.016);
    handlers['entity:spawned']({ id, type: 'asteroid' }); // materialize envelope
    handlers['mining:richCoreExposed']({ asteroidId: id }); // breach envelope
    for (let i = 0; i < 1000; i += 1) {
      tracker.updateAsteroidMotion(asteroid, mesh, 0.4, 0.016);
      if (i % 2 === 0) tracker.releaseEntityMesh(id);
      else tracker.releaseMesh(mesh);
    }
    for (const axis of ['x', 'y', 'z']) {
      const ratio = Math.abs(body.scale[axis] / pristine);
      assert.ok(
        ratio >= 0.5 && ratio <= 1.2,
        `pristine ${pristine}: scale.${axis} ${body.scale[axis]} drifted to ${ratio.toExponential(2)}x base`,
      );
    }
  }
});

// 2026-09-25 live walk: an adopted common-rock leaf arrived at the tracker already corrupted
// (local scale −1.5e8 while the factory wrote 12). The pristine-WeakMap trusted that first
// sighting and the swell then re-applied the corrupt base every frame — permanent, screen-filling
// rocks. A captured "pristine" beyond plausible authored range must recover entity.radius —
// the value buildAsteroid wrote with setScalar(R) — never perpetuate the corruption.
test('strain swell recovers authored radius when first-seen body scale is already corrupt', () => {
  const tracker = createAsteroidMotionTracker();
  tracker.bindEvents({ on: () => () => {} });

  const body = {
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    scale: {
      x: -1.5e8, y: -1.5e8, z: -1.5e8,
      set(x, y, z) { this.x = x; this.y = y; this.z = z; },
    },
  };
  const mesh = { userData: { asteroidInstanceBody: body }, children: [body] };
  const asteroid = { id: 'ast_corrupt_1', type: 'asteroid', radius: 44, data: {} };

  for (let i = 0; i < 10; i += 1) tracker.updateAsteroidMotion(asteroid, mesh, 0.4 + i * 0.016, 0.016);

  for (const axis of ['x', 'y', 'z']) {
    const ratio = Math.abs(body.scale[axis] / 44);
    assert.ok(
      ratio >= 0.5 && ratio <= 1.2,
      `corrupt-seeded body: scale.${axis} stayed at ${body.scale[axis]} (should recover ~radius 44)`,
    );
  }
});

// 2026-09-25 live walk, the actual originator: Asteroid_331's tracker rec survived the
// Crucible→adventure transition with materializeT0/breachT0 armed at the old game's simTime
// (~165 s). The new game's simTime restarts near zero, so k = (0.2 − 165)/0.45 ≈ −366 and
// e = 1 − (1−k)³ ≈ −4.9e7 → scaleMul ≈ −2e7 → the swell stamped 12 × −2e7 = −2.4e8 onto the
// body every frame (tallRoofs, camera to orbit, the dark disc at belt arrival). A retrograde
// T0 belongs to a dead epoch and must expire like a finished envelope, never evaluate.
test('stale T0 from a previous sim epoch cannot inflate body scale', () => {
  const tracker = createAsteroidMotionTracker();
  const handlers = {};
  tracker.bindEvents({ on: (event, fn) => { handlers[event] = fn; return () => {}; } });

  const body = {
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 12, y: 12, z: 12, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
  };
  const mesh = { userData: { asteroidInstanceBody: body }, children: [body] };
  body.parent = mesh;
  const asteroid = { id: 'ast_epoch_1', type: 'asteroid', radius: 12, data: {} };

  // Epoch 1 (the Crucible): the rec is created and its envelopes armed at simTime ≈ 165.
  tracker.updateAsteroidMotion(asteroid, mesh, 165, 0.016);
  handlers['entity:spawned']({ id: 'ast_epoch_1', type: 'asteroid' });
  handlers['mining:richCoreExposed']({ asteroidId: 'ast_epoch_1' });
  tracker.updateAsteroidMotion(asteroid, mesh, 165.2, 0.016);

  // Epoch 2 (the new adventure): simTime restarts near zero — rec and armed T0s persist.
  for (let i = 0; i < 120; i += 1) {
    tracker.updateAsteroidMotion(asteroid, mesh, 0.2 + i * 0.016, 0.016);
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(
        Math.abs(body.scale[axis]) <= 2000,
        `frame ${i}: scale.${axis} = ${body.scale[axis]} — retrograde T0 inflated the body`,
      );
    }
  }
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
