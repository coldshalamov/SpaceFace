import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPickupMotionTracker,
  resolvePickupHaloPose,
} from '../src/render/pickupMotionPresentation.js';

function createMockPickupMesh() {
  const gem = {
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    scale: {
      setScalar(s) { this.val = s; },
      val: 1,
    },
  };
  return {
    userData: { gem },
    children: [gem],
  };
}

test('pickup motion: 3D multi-axis tumble and vertical levitation bobbing', () => {
  const tracker = createPickupMotionTracker();
  const mesh = createMockPickupMesh();
  const pickup = { id: 501, pos: { x: 1000, z: 1000 } };

  // Frame 1
  tracker.updatePickupMotion(pickup, mesh, 1.0, 0.016, null);
  const rot1X = mesh.userData.gem.rotation.x;
  const rot1Y = mesh.userData.gem.rotation.y;
  const pos1Y = mesh.userData.gem.position.y;

  // Frame 2
  tracker.updatePickupMotion(pickup, mesh, 1.05, 0.05, null);
  const rot2X = mesh.userData.gem.rotation.x;
  const rot2Y = mesh.userData.gem.rotation.y;
  const pos2Y = mesh.userData.gem.position.y;

  assert.notEqual(rot1X, rot2X, 'tumbles around X');
  assert.notEqual(rot1Y, rot2Y, 'tumbles around Y');
  assert.notEqual(pos1Y, pos2Y, 'bobs vertically in zero-G');
});

test('pickup motion: magnetic attractor suction accelerates tumble and creates spiral vortex', () => {
  const tracker = createPickupMotionTracker();
  const mesh = createMockPickupMesh();
  const player = { pos: { x: 100, z: 100 } };
  const pickupFar = { id: 502, pos: { x: 900, z: 900 } };
  const pickupNear = { id: 503, pos: { x: 150, z: 150 } }; // distance ~70.7 WU

  // Far pickup: normal tumble
  tracker.updatePickupMotion(pickupFar, mesh, 1.0, 0.016, player);
  assert.equal(mesh.userData.gem.position.x, 0, 'no vortex when far');

  // Near pickup: magnetic suction vortex activated
  const meshNear = createMockPickupMesh();
  tracker.updatePickupMotion(pickupNear, meshNear, 1.0, 0.016, player);
  assert.ok(meshNear.userData.gem.position.x !== 0 || meshNear.userData.gem.position.z !== 0, 'spiral vortex offset applied');
});

test('pickup motion: final scoop compression scales down into cargo bay', () => {
  const tracker = createPickupMotionTracker();
  const mesh = createMockPickupMesh();
  const player = { pos: { x: 0, z: 0 } };
  const pickupScooped = { id: 504, pos: { x: 5, z: 5 } }; // distance ~7.07 WU

  for (let i = 0; i < 20; i++) {
    tracker.updatePickupMotion(pickupScooped, mesh, 2.0 + i * 0.016, 0.016, player);
  }

  assert.ok(mesh.userData.gem.scale.val < 0.6, `compresses into intake scoop: ${mesh.userData.gem.scale.val}`);
});

test('pickup motion: reduced motion keeps stable non-spinning presentation', () => {
  const tracker = createPickupMotionTracker();
  const mesh = createMockPickupMesh();
  const pickup = { id: 505, pos: { x: 100, z: 100 } };

  tracker.updatePickupMotion(pickup, mesh, 3.0, 0.016, null, { motionReduce: true });
  const rot1 = mesh.userData.gem.rotation.x;

  tracker.updatePickupMotion(pickup, mesh, 3.5, 0.5, null, { motionReduce: true });
  const rot2 = mesh.userData.gem.rotation.x;

  assert.equal(rot1, rot2, 'rotations frozen under motionReduce');
  assert.equal(mesh.userData.gem.position.y, 0, 'vertical bobbing suppressed under motionReduce');
});

// The collectible beacon ring: the take/collide disambiguator. A rock, wreck or tow crate
// answers no light this way — the halo must precess, flash on the transponder beat, compose
// with the drop's own scale, and calm down under reduced motion.
function createMockHalo(baseScale) {
  return {
    rotation: { x: 0, y: 0, z: 0 },
    scale: { setScalar(s) { this.val = s; }, val: 0 },
    material: { opacity: 0 },
    userData: { baseScale },
  };
}

test('pickup halo: precesses with sim time and kicks on the double-flash beat', () => {
  const a = resolvePickupHaloPose(10, 0.3, false);
  const b = resolvePickupHaloPose(10.5, 0.3, false);
  assert.notEqual(a.spinX, b.spinX, 'ring precesses around X');
  assert.notEqual(a.spinY, b.spinY, 'ring precesses around Y');
  // Deterministic: the same inputs produce the same pose (no wall clock, no Math.random).
  assert.deepEqual(resolvePickupHaloPose(10, 0.3, false), a, 'pose is pure');
  // Somewhere on the 1.613 s beat cycle the flash fires, and the glow always carries the kick
  // (the sine breath modulates around it, it never cancels it).
  let sawKick = false;
  for (let t = 0; t < 4; t += 1 / 120) {
    const pose = resolvePickupHaloPose(t, 0.3, false);
    if (pose.kick > 0.5) sawKick = true;
    assert.ok(pose.glow >= 0.55 - 0.18 + pose.kick * 0.45 - 1e-9, 'flash drives the glow');
    assert.ok(pose.glow > 0 && pose.glow <= 1.2, `glow stays bounded: ${pose.glow}`);
  }
  assert.ok(sawKick, 'the double-flash beat fires inside one cycle window');
});

test('pickup halo: reduced motion holds the plane and softens the flash', () => {
  const still1 = resolvePickupHaloPose(10, 0.3, true);
  const still2 = resolvePickupHaloPose(14, 0.3, true);
  assert.equal(still1.spinX, still2.spinX, 'ring plane frozen under motionReduce');
  assert.equal(still1.spinY, still2.spinY, 'ring plane frozen under motionReduce');
  const moving = resolvePickupHaloPose(10, 0.3, false);
  const calm = resolvePickupHaloPose(10, 0.3, true);
  assert.ok(calm.kick <= moving.kick, 'flash softened under motionReduce');
});

test('pickup halo: tracker poses the ring and composes its base scale', () => {
  const tracker = createPickupMotionTracker();
  const halo = createMockHalo(2.2);
  const mesh = createMockPickupMesh();
  mesh.userData.pickupHalo = halo;
  const pickup = { id: 506, pos: { x: 500, z: 500 } };

  tracker.updatePickupMotion(pickup, mesh, 1.0, 0.016, null);
  assert.ok(Number.isFinite(halo.rotation.x) && Number.isFinite(halo.rotation.y), 'precession pose applied');
  assert.ok(halo.scale.val > 2.19 && halo.scale.val < 2.21, `idle scale composes baseScale: ${halo.scale.val}`);
  assert.ok(halo.material.opacity > 0 && halo.material.opacity <= 1, `glow applied: ${halo.material.opacity}`);

  // Inside the scoop the ring rides the body's compression instead of staying behind.
  const player = { pos: { x: 0, z: 0 } };
  const close = { id: 507, pos: { x: 5, z: 5 } };
  const meshClose = createMockPickupMesh();
  const haloClose = createMockHalo(2.2);
  meshClose.userData.pickupHalo = haloClose;
  for (let i = 0; i < 20; i++) {
    tracker.updatePickupMotion(close, meshClose, 2.0 + i * 0.016, 0.016, player);
  }
  assert.ok(haloClose.scale.val < 2.2, `ring compresses into the scoop: ${haloClose.scale.val}`);
});

test('pickup halo: meshes without a ring keep the old pose path', () => {
  const tracker = createPickupMotionTracker();
  const mesh = createMockPickupMesh();
  const pickup = { id: 508, pos: { x: 300, z: 300 } };
  assert.doesNotThrow(() => tracker.updatePickupMotion(pickup, mesh, 1.0, 0.016, null));
});
