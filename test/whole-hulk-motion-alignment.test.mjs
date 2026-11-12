import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInfrastructureMotionTracker } from '../src/render/infrastructureMotion.js';
import { createShipMicroMotionTracker } from '../src/render/shipMicroMotion.js';
import { isPhysicsBoundWholeHulk } from '../src/data/wholeShipVisualIdentity.js';
import * as sf from '../src/render/snapshotFence.js';

function wreck(id) {
  return { id, type: 'wreck', alive: true, pos: { x: 100, z: 200 }, rot: 0.5, radius: 8,
    data: { parentType: 'ship', hulkOfDefId: 'ship_mule',
      hulkCollisionFile: 'wholeships/mule_production_v1.glb',
      hulkCollisionProfile: 'warm-freighter:mule:packaged-fit-v1' } };
}

test('bound hulk removes legacy child drift but unstamped wreck keeps it', () => {
  const tracker = createInfrastructureMotionTracker();
  const entity = wreck(9);
  const body = { rotation: { x: 0, y: 0, z: 0 } };
  const hull = { rotation: { x: 0.2, y: 0.1, z: 0.3 } };
  const mesh = { rotation: { x: 0, y: -0.5, z: 0 }, children: [body], userData: { hull } };
  const stamp = entity.data.hulkCollisionProfile;
  delete entity.data.hulkCollisionProfile;
  tracker.updateWreckMotion(entity, mesh, 1, 0.05);
  assert.notEqual(body.rotation.y, 0);
  entity.data.hulkCollisionProfile = stamp;
  assert.equal(isPhysicsBoundWholeHulk(entity), true);
  tracker.updateWreckMotion(entity, mesh, 1.05, 0.05);
  assert.deepEqual(body.rotation, { x: 0, y: 0, z: 0 });
  assert.deepEqual(hull.rotation, { x: 0, y: 0, z: 0 });
  assert.equal(mesh.rotation.y, -0.5);
  tracker.updateWreckMotion(entity, mesh, 1.1, 0.05);
  assert.deepEqual(body.rotation, { x: 0, y: 0, z: 0 });
});

test('bound fresh hulk retains death effects without independent pose or scale', () => {
  const tracker = createShipMicroMotionTracker();
  const events = [];
  tracker.bindEvents({ on() {}, emit(name, payload) { events.push({ name, payload }); } });
  tracker.onKilled({ id: 7, type: 'ship', pos: { x: 100, z: 200 }, radius: 8 });
  const entity = wreck(9);
  const mesh = { visible: true, rotation: { x: 0, y: -0.5, z: 0 },
    scale: { x: 2, y: 2, z: 2 }, children: [] };
  for (let i = 0; i < 140; i++) tracker.updateDeathSpiral(entity, mesh, 0.1 + i * 0.016, 0.016);
  assert.deepEqual(mesh.rotation, { x: 0, y: -0.5, z: 0 });
  assert.deepEqual(mesh.scale, { x: 2, y: 2, z: 2 });
  assert.ok(events.some((e) => e.name === 'ship:rcsPulse'));
  assert.equal(events.filter((e) => e.name === 'ship:deathFlash').length, 1);
});

test('late physics binding retires a running scale-in and spiral tilt', () => {
  const tracker = createShipMicroMotionTracker();
  tracker.bindEvents({ on() {}, emit() {} });
  tracker.onKilled({ id: 7, type: 'ship', pos: { x: 100, z: 200 }, radius: 8 });
  const entity = wreck(9);
  const stamp = entity.data.hulkCollisionProfile;
  delete entity.data.hulkCollisionProfile;
  const mesh = { visible: true, rotation: { x: 0, y: -0.5, z: 0 },
    scale: { x: 2, y: 2, z: 2 }, children: [] };
  tracker.updateDeathSpiral(entity, mesh, 0.1, 0.016);
  assert.ok(mesh.scale.x < 2);
  assert.notEqual(mesh.rotation.y, -0.5);
  entity.data.hulkCollisionProfile = stamp;
  tracker.updateDeathSpiral(entity, mesh, 0.116, 0.016);
  assert.deepEqual(mesh.rotation, { x: 0, y: -0.5, z: 0 });
  assert.deepEqual(mesh.scale, { x: 2, y: 2, z: 2 });
});

test('snapshot bank and pitch cannot tilt a physics-bound hulk', () => {
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const method = source.match(/  _applyPresentationPose\([^]*?\n  \},/)[0];
  const ownerMethod = new Function('applySnapshotPoseToMesh', 'snapshotHasEntityGeneration',
    'poseSpanAlpha', 'LOOP_FIXED_DT', 'POSE_JUMP_WU', 'attributePoseJump', 'isPhysicsBoundWholeHulk',
    `return { ${method} };`)(sf.applySnapshotPoseToMesh, sf.snapshotHasEntityGeneration,
    sf.poseSpanAlpha, 1 / 60, Infinity, () => {}, isPhysicsBoundWholeHulk);
  const fence = sf.createSnapshotFence({ capacity: 4 });
  const snapshot = fence.beginPack(1, 0, 0);
  const index = snapshot.write(9, 0, 100, 0, 200, 0, Math.sin(0.25), 0, Math.cos(0.25), 1, 1, 1, 0);
  snapshot.setLean(index, 0.3, 0.2);
  snapshot.setGeneration(index, 1);
  fence.commit();
  const entity = wreck(9);
  const owner = { ...ownerMethod, _presentationWorld: { entityIds: Uint32Array.of(9),
    slotGenerations: Uint32Array.of(1), bank: Float32Array.of(0.3), pitch: Float32Array.of(0.2) },
    _snapshotFence: fence, _frameMembrane: { origin: { x: 0, z: 0 } },
    state: { entities: new Map([[9, entity]]), accumulator: 0, render: {} } };
  const hull = { rotation: { x: 0.1, y: 0, z: 0.2 } };
  const mesh = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, userData: { hull } };
  assert.equal(owner._applyPresentationPose(0, mesh, 1, true), true);
  assert.equal(hull.rotation.x, 0);
  assert.equal(hull.rotation.z, 0);
  assert.ok(Math.abs(mesh.rotation.y + 0.5) < 1e-6);
  delete entity.data.hulkCollisionProfile;
  owner._applyPresentationPose(0, mesh, 1, true);
  assert.notEqual(hull.rotation.x, 0, 'unbound pose retains authored bank');
});
