import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';

const context = {
  createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
  putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {},
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
  beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {},
  quadraticCurveTo() {}, bezierCurveTo() {}, arcTo() {}, ellipse() {}, fillText() {},
  measureText: () => ({ width: 0 }), createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
};
globalThis.document ||= { createElement: () => ({ width: 256, height: 256, getContext: () => context }) };

test('merged mine details retain geometry, culling, arming and shared ownership', () => {
  const entity = { id: 71, type: 'mine', radius: 6, data: { kind: 'mine', armed: true } };
  const factory = createVisualFactory(), root = factory.build(entity);
  const sibling = factory.build({ ...entity, id: 72 });
  root.userData.updateRuntimeState(entity, 1.1);
  root.updateMatrixWorld(true);
  assert.equal(root.children.filter((object) => object.isMesh).length, 19);
  const spike = new THREE.ConeGeometry(0.07, 0.20, 4).rotateX(Math.PI);
  const stud = new THREE.CylinderGeometry(0.026, 0.03, 0.075, 6).rotateZ(Math.PI / 2);
  const cases = [
    ['MineAnchorSpike_1', spike, 3, (i) => {
      const a = i * Math.PI * 2 / 3 + Math.PI / 6;
      return new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.30, -0.30, Math.sin(a) * 0.30);
    }],
    ['MineRingStud_1', stud, 8, (i) => {
      const a = i * Math.PI / 4;
      return new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.478, -0.02, Math.sin(a) * 0.478)
        .multiply(new THREE.Matrix4().makeRotationY(-a));
    }],
  ];
  for (const [name, source, count, transform] of cases) {
    const mesh = root.getObjectByName(name), geometry = mesh.geometry;
    assert.equal(mesh.material, root.getObjectByName('MineDataPanel').material);
    assert.equal(geometry, sibling.getObjectByName(name).geometry);
    const positions = source.getAttribute('position'), normals = source.getAttribute('normal');
    assert.equal(geometry.index.count, source.index.count * count);
    geometry.computeBoundingSphere();
    for (let part = 0; part < count; part++) {
      const world = new THREE.Matrix4().multiplyMatrices(root.matrixWorld, transform(part));
      const n0 = new THREE.Matrix3().getNormalMatrix(world), n1 = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      for (let i = 0; i < positions.count; i++) {
        const index = part * positions.count + i;
        const a = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(world);
        const b = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld);
        assert.ok(a.distanceTo(b) < 1e-6);
        const an = new THREE.Vector3().fromBufferAttribute(normals, i).applyMatrix3(n0).normalize();
        const bn = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, index).applyMatrix3(n1).normalize();
        assert.ok(an.distanceTo(bn) < 1e-6);
        const local = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, index);
        assert.ok(local.distanceTo(geometry.boundingSphere.center) <= geometry.boundingSphere.radius + 1e-6);
      }
      for (let i = 0; i < source.index.count; i++) {
        assert.equal(geometry.index.getX(part * source.index.count + i), source.index.getX(i) + part * positions.count);
      }
    }
    let disposed = false;
    geometry.addEventListener('dispose', () => { disposed = true; });
    geometry.dispose();
    assert.equal(disposed, false, 'one mine cannot dispose the shared geometry');
  }
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 200);
  camera.position.set(0, 80, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const details = cases.map(([name]) => root.getObjectByName(name));
  root.position.x = 20.05; root.updateMatrixWorld(true);
  assert.ok(details.every((mesh) => frustum.intersectsObject(mesh)), 'edge details remain visible');
  root.position.x = 60; root.updateMatrixWorld(true);
  assert.ok(details.every((mesh) => !frustum.intersectsObject(mesh)));
  root.position.x = 0; root.updateMatrixWorld(true);
  assert.ok(details.every((mesh) => frustum.intersectsObject(mesh)), 'details re-enter');
  const vane = root.getObjectByName('MineSensorVane_1'), before = vane.position.clone();
  root.userData.updateRuntimeState(entity, 2);
  assert.ok(before.distanceTo(vane.position) > 0, 'sensor sweep still advances');
  root.userData.updateRuntimeState({ ...entity, data: { ...entity.data, armed: false } }, 3);
  assert.equal(root.userData.visualArmed, false);
  assert.equal(root.getObjectByName('MineArmingLens').material.name, 'MineWarningLensSafe');
  const prior = details[0].geometry;
  invalidateVisualFactoryCaches();
  assert.notEqual(factory.build(entity).getObjectByName('MineAnchorSpike_1').geometry, prior);
  spike.dispose(); stud.dispose();
});
