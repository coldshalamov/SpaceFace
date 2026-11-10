import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createWorldObjectPicker } from '../src/render/worldObjectPicking.js';

function fixture() {
  const camera = new THREE.OrthographicCamera(-100, 100, 80, -80, 0.1, 1000);
  camera.position.set(0, 200, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshBasicMaterial());
  root.add(leaf);
  scene.add(root);
  scene.updateMatrixWorld(true);
  const entity = { id: 1, type: 'ship', alive: true, radius: 1, data: {} };
  const state = { entities: new Map([[1, entity]]), entityList: [entity], render: { scene } };
  const picker = createWorldObjectPicker({
    state,
    getCamera: () => camera,
    getMeshes: () => new Map([[1, root]]),
    getViewport: () => ({ width: 1000, height: 800 }),
  });
  let traversals = 0;
  const traverse = root.traverse;
  root.traverse = function (visit) { traversals += 1; return traverse.call(this, visit); };
  function pickLeaf() {
    scene.updateMatrixWorld(true);
    const point = leaf.getWorldPosition(new THREE.Vector3()).project(camera);
    return picker.pick((point.x + 1) * 500, (1 - point.y) * 400);
  }
  return { scene, root, leaf, picker, pickLeaf, traversals: () => traversals };
}

test('moving a rigid ship reuses local bounds while picking its current surface', () => {
  const h = fixture();
  assert.equal(h.pickLeaf()?.leaf, h.leaf);
  for (let i = 1; i <= 12; i += 1) {
    h.root.position.set(i * 3, 0, i);
    h.root.rotation.y = i * 0.15;
    h.root.scale.set(1 + i * 0.02, 1, 1);
    assert.equal(h.pickLeaf()?.leaf, h.leaf, 'root pose changes must still update the ray hit');
  }
  assert.equal(h.traversals(), 1,
    'rigid root motion must not remeasure every leaf on every cursor frame');
  assert.equal(h.picker.pick(500, 400), null, 'the old screen point must not ghost-pick');
});

test('animated child motion refreshes the reachable envelope', () => {
  const h = fixture();
  assert.equal(h.pickLeaf()?.leaf, h.leaf);
  h.leaf.position.x = 70;
  assert.equal(h.pickLeaf()?.leaf, h.leaf,
    'an animated limb outside the original radius must remain pickable');
  assert.equal(h.traversals(), 2, 'a child pose change still requires a local-envelope rebuild');
});

test('same-count body replacement refreshes the pick leaves', () => {
  const h = fixture();
  assert.equal(h.pickLeaf()?.leaf, h.leaf);
  const replacement = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshBasicMaterial());
  replacement.position.x = 60;
  h.root.remove(h.leaf);
  h.root.add(replacement);
  h.scene.updateMatrixWorld(true);
  assert.equal(h.picker.pick(800, 400)?.leaf, replacement);
  assert.equal(h.picker.pick(500, 400), null, 'removed body leaves must not retain cursor hits');
  assert.equal(h.traversals(), 2);
});
