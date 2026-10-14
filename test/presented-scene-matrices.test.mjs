import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { updatePresentedSceneMatrices } from '../src/render/presentedSceneMatrices.js';

function scene() {
  const root = new THREE.Scene();
  root.matrixAutoUpdate = false;
  root.matrixWorldAutoUpdate = false;
  return root;
}

test('presented matrix refresh skips culled branches and refreshes their latest pose on re-entry', () => {
  const root = scene();
  const hull = new THREE.Group();
  const plate = new THREE.Object3D();
  hull.add(plate);
  root.add(hull);
  updatePresentedSceneMatrices(root);
  let visits = 0;
  const base = plate.updateMatrixWorld.bind(plate);
  plate.updateMatrixWorld = (force) => { visits++; base(force); };
  hull.visible = false;
  hull.userData.sfHiddenFreezeQueued = true;
  hull.position.set(20, 0, 30);
  plate.position.set(4, 0, 7);
  for (let i = 0; i < 60; i++) updatePresentedSceneMatrices(root);
  assert.equal(visits, 0, 'hidden descendants should do no matrix work');
  assert.equal(hull.matrixWorldNeedsUpdate, true);
  hull.visible = true;
  updatePresentedSceneMatrices(root);
  assert.equal(visits, 1);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(plate.matrixWorld).toArray(), [24, 0, 37]);
});

test('a hidden frozen branch retains parent changes and child grafts before re-entry', () => {
  const root = scene();
  const hull = new THREE.Group();
  hull.matrixAutoUpdate = false;
  hull.updateMatrix();
  hull.userData.sfHiddenFrozen = true;
  hull.userData.sfMatrixFrozen = true;
  root.add(hull);
  updatePresentedSceneMatrices(root);
  hull.visible = false;
  root.matrixWorld.makeTranslation(50, 0, 70);
  root.matrixWorldNeedsUpdate = true;
  updatePresentedSceneMatrices(root);
  const plate = new THREE.Object3D();
  plate.position.set(2, 0, 3);
  plate.matrixAutoUpdate = false;
  plate.updateMatrix();
  hull.add(plate);
  hull.visible = true;
  updatePresentedSceneMatrices(root);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(plate.matrixWorld).toArray(), [52, 0, 73]);
});

test('unflagged hidden branches defer presentation but retain native world queries and full updates', () => {
  const root = scene();
  const helper = new THREE.Object3D();
  helper.visible = false;
  helper.position.set(3, 4, 5);
  root.add(helper);
  updatePresentedSceneMatrices(root);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(helper.matrixWorld).toArray(), [0, 0, 0]);
  assert.equal(helper.matrixWorldNeedsUpdate, true);
  assert.deepEqual(helper.getWorldPosition(new THREE.Vector3()).toArray(), [3, 4, 5]);
  helper.position.set(6, 7, 8);
  root.updateMatrixWorld(true);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(helper.matrixWorld).toArray(), [6, 7, 8]);
  helper.position.set(3, 4, 5);
  helper.visible = true;
  updatePresentedSceneMatrices(root);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(helper.matrixWorld).toArray(), [3, 4, 5]);
});

test('ordinary composing scenes keep full native hidden-branch updates', () => {
  const helper = new THREE.Object3D();
  helper.visible = false;
  helper.position.set(3, 4, 5);
  const ordinary = new THREE.Scene();
  ordinary.position.set(8, 9, 10);
  ordinary.add(helper);
  updatePresentedSceneMatrices(ordinary);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(helper.matrixWorld).toArray(), [11, 13, 15]);
});

test('visible static roots still visit newly grafted children on retail Three', () => {
  const root = scene();
  const hull = new THREE.Group();
  hull.matrixAutoUpdate = false;
  hull.userData.sfMatrixFrozen = true;
  root.add(hull);
  updatePresentedSceneMatrices(root);
  const part = new THREE.Object3D();
  part.position.set(3, 0, 5);
  hull.add(part);
  updatePresentedSceneMatrices(root);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(part.matrixWorld).toArray(), [3, 0, 5]);
});

test('dense hidden hulls do no descendant work while visible matrices match a full walk', () => {
  const root = scene();
  const visible = new THREE.Object3D();
  visible.position.set(1, 2, 3);
  root.add(visible);
  let visits = 0;
  for (let i = 0; i < 40; i++) {
    const hull = new THREE.Group();
    hull.visible = false;
    for (let j = 0; j < 100; j++) {
      const part = new THREE.Object3D();
      const base = part.updateMatrixWorld.bind(part);
      part.updateMatrixWorld = (force) => { visits++; base(force); };
      hull.add(part);
    }
    root.add(hull);
  }
  root.updateMatrixWorld();
  assert.equal(visits, 4000);
  const expected = visible.matrixWorld.toArray();
  visits = 0;
  updatePresentedSceneMatrices(root);
  assert.equal(visits, 0);
  assert.deepEqual(visible.matrixWorld.toArray(), expected);
});

test('hidden top-level camera light and bone transforms retain native updates', () => {
  const root = scene();
  for (const object of [new THREE.PerspectiveCamera(), new THREE.PointLight(), new THREE.Bone()]) {
    object.visible = false;
    object.position.set(4, 5, 6);
    root.add(object);
  }
  updatePresentedSceneMatrices(root);
  for (const object of root.children) {
    assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(object.matrixWorld).toArray(), [4, 5, 6]);
  }
});

test('visible lights refresh hidden target paths without walking hidden sibling geometry', () => {
  const root = scene();
  const light = new THREE.DirectionalLight();
  const hidden = new THREE.Group();
  const target = new THREE.Object3D();
  const geometry = new THREE.Mesh();
  hidden.visible = false;
  hidden.position.set(10, 20, 30);
  target.position.set(1, 2, 3);
  hidden.add(target, geometry);
  light.target = target;
  root.add(light, hidden);
  let visits = 0;
  const base = geometry.updateMatrixWorld.bind(geometry);
  geometry.updateMatrixWorld = (force) => { visits++; base(force); };
  updatePresentedSceneMatrices(root);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(target.matrixWorld).toArray(), [11, 22, 33]);
  assert.equal(visits, 0);
  hidden.position.set(40, 50, 60);
  updatePresentedSceneMatrices(root);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(target.matrixWorld).toArray(), [41, 52, 63]);
  assert.equal(visits, 0);
  hidden.visible = true;
  updatePresentedSceneMatrices(root);
  assert.equal(visits, 1);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(geometry.matrixWorld).toArray(), [40, 50, 60]);
});
