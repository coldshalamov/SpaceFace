import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import { createPickupMotionTracker } from '../src/render/pickupMotionPresentation.js';

test('credit chip body preserves each authored cylinder while sharing one cached draw', () => {
  const entity = { id: 103, type: 'pickup', radius: 2, pos: { x: 0, z: 0 },
    data: { kind: 'credit_chip', credits: 100, wallet: 'run' } };
  const factory = createVisualFactory(), root = factory.build(entity);
  const second = factory.build({ ...entity, id: 104 });
  const stack = root.getObjectByName('CreditChipStack');
  const body = root.getObjectByName('CreditChipBody');
  assert.equal(stack.children.filter((object) => object.isMesh).length, 4);
  assert.equal(body.geometry, second.getObjectByName('CreditChipBody').geometry);
  assert.equal(body.frustumCulled, true);
  const motion = createPickupMotionTracker();
  motion.updatePickupMotion(entity, root, 3, 0.016, null, {});
  root.updateMatrixWorld(true);
  const source = new THREE.CylinderGeometry(0.78, 0.78, 0.16, 6);
  const offsets = [[-0.14, 0.08, 1], [0.02, -0.18, 0.94], [0.16, 0.12, 0.86]];
  const position = body.geometry.getAttribute('position');
  const normal = body.geometry.getAttribute('normal');
  const originalPosition = source.getAttribute('position');
  const originalNormal = source.getAttribute('normal');
  const originalIndex = source.index;
  const index = body.geometry.index;
  assert.equal(index.count, originalIndex.count * 3, 'triangle count is unchanged');
  body.geometry.computeBoundingSphere();
  let vertex = 0;
  for (let part = 0; part < offsets.length; part++) {
    const [y, rotation, scale] = offsets[part];
    const local = new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
      new THREE.Vector3(scale, scale, scale));
    const originalWorld = new THREE.Matrix4().multiplyMatrices(stack.matrixWorld, local);
    const originalNormalWorld = new THREE.Matrix3().getNormalMatrix(originalWorld);
    const mergedNormalWorld = new THREE.Matrix3().getNormalMatrix(body.matrixWorld);
    for (let i = 0; i < originalPosition.count; i++, vertex++) {
      const expected = new THREE.Vector3().fromBufferAttribute(originalPosition, i).applyMatrix4(originalWorld);
      const actual = new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(body.matrixWorld);
      assert.ok(expected.distanceTo(actual) < 1e-6, 'world positions agree');
      const n0 = new THREE.Vector3().fromBufferAttribute(originalNormal, i).applyMatrix3(originalNormalWorld).normalize();
      const n1 = new THREE.Vector3().fromBufferAttribute(normal, vertex).applyMatrix3(mergedNormalWorld).normalize();
      assert.ok(n0.distanceTo(n1) < 1e-6, 'world normals agree');
      const localPoint = new THREE.Vector3().fromBufferAttribute(position, vertex);
      assert.ok(localPoint.distanceTo(body.geometry.boundingSphere.center) <= body.geometry.boundingSphere.radius + 1e-6);
    }
    for (let i = 0; i < originalIndex.count; i++) {
      assert.equal(index.getX(part * originalIndex.count + i), originalIndex.getX(i) + part * originalPosition.count);
    }
  }
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 200);
  camera.position.set(0, 80, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  root.position.x = 20.05; root.updateMatrixWorld(true);
  assert.ok(frustum.intersectsObject(body), 'edge-visible stack remains drawn');
  root.position.x = 60; root.updateMatrixWorld(true);
  assert.equal(frustum.intersectsObject(body), false);
  root.position.x = 0; root.updateMatrixWorld(true);
  assert.ok(frustum.intersectsObject(body), 'stack returns on re-entry');
  let disposed = false;
  body.geometry.addEventListener('dispose', () => { disposed = true; });
  body.geometry.dispose();
  assert.equal(disposed, false, 'a consumer cannot dispose shared cached geometry');
  invalidateVisualFactoryCaches();
  assert.notEqual(factory.build(entity).getObjectByName('CreditChipBody').geometry, body.geometry,
    'context invalidation rebuilds the cached body');
  source.dispose();
});
