import assert from 'node:assert/strict';
import test from 'node:test';
import { createPickupMotionTracker } from '../src/render/pickupMotionPresentation.js';

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
