import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { createPickupMotionTracker } from '../src/render/pickupMotionPresentation.js';

test('merged repair shell and bands preserve indexed geometry through pickup motion', () => {
  const entity = { id: 42, type: 'pickup', radius: 2, pos: { x: 0, z: 0 }, data: { swarmRepair: true } };
  const factory = createVisualFactory(), root = factory.build(entity);
  const sibling = factory.build({ ...entity, id: 43 });
  createPickupMotionTracker().updatePickupMotion(entity, root, 1, 0.016, null, {});
  root.updateMatrixWorld(true);
  const pairs = [
    ['SwarmRepairBarrel', [
      [new THREE.CylinderGeometry(0.46, 0.54, 0.66, 10), -0.02],
      [new THREE.CylinderGeometry(0.5, 0.45, 0.18, 10), 0.37],
    ]],
    ['SwarmRepairClampBandLo', [
      [new THREE.TorusGeometry(0.52, 0.05, 6, 18).rotateX(Math.PI / 2), -0.16],
      [new THREE.TorusGeometry(0.52, 0.05, 6, 18).rotateX(Math.PI / 2), 0.14],
    ]],
  ];
  for (const [name, pieces] of pairs) {
    const mesh = root.getObjectByName(name), geometry = mesh.geometry;
    assert.equal(geometry, sibling.getObjectByName(name).geometry, 'geometry remains shared across cells');
    geometry.computeBoundingSphere();
    let vertexOffset = 0, indexOffset = 0;
    for (const [source, y] of pieces) {
      const world = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, new THREE.Matrix4().makeTranslation(0, y, 0));
      const oldNormal = new THREE.Matrix3().getNormalMatrix(world);
      const mergedNormal = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      const positions = source.getAttribute('position'), normals = source.getAttribute('normal');
      for (let i = 0; i < positions.count; i++) {
        const before = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(world);
        const after = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('position'), vertexOffset + i).applyMatrix4(mesh.matrixWorld);
        assert.ok(before.distanceTo(after) < 1e-6);
        const n0 = new THREE.Vector3().fromBufferAttribute(normals, i).applyMatrix3(oldNormal).normalize();
        const n1 = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('normal'), vertexOffset + i).applyMatrix3(mergedNormal).normalize();
        assert.ok(n0.distanceTo(n1) < 1e-6);
        const point = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('position'), vertexOffset + i);
        assert.ok(point.distanceTo(geometry.boundingSphere.center) <= geometry.boundingSphere.radius + 1e-6);
      }
      for (let i = 0; i < source.index.count; i++) {
        assert.equal(geometry.index.getX(indexOffset + i), source.index.getX(i) + vertexOffset);
      }
      vertexOffset += positions.count;
      indexOffset += source.index.count;
      source.dispose();
    }
    assert.equal(geometry.index.count, indexOffset, 'triangle count is unchanged');
  }
});
