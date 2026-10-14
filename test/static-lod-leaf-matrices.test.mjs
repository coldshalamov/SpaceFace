import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import {
  installStaticLodLeafMatrixUpdate,
  updatePresentedObjectMatrices,
} from '../src/render/staticChildMatrices.js';

function lodLeaf(level = 'lod1', data = {}) {
  const leaf = new THREE.Mesh();
  leaf.userData = { ...data, spacefaceTags: { lod: level, ...data.spacefaceTags } };
  leaf.visible = level === 'lod0';
  return leaf;
}

function assertMatrixEqual(actual, expected) {
  for (let i = 0; i < 16; i++) {
    assert.ok(Math.abs(actual.elements[i] - expected.elements[i]) < 1e-10,
      `matrix element ${i}: ${actual.elements[i]} !== ${expected.elements[i]}`);
  }
}

function fixture(optimized) {
  const root = new THREE.Group();
  const leaves = [];
  const operations = { compose: 0, product: 0 };
  for (let i = 0; i < 90; i++) {
    const level = `lod${i % 3}`;
    const leaf = lodLeaf(level);
    leaf.position.set(i % 7, i % 5, i % 11);
    leaf.rotation.set(i / 90, i / 60, i / 30);
    leaf.scale.set(1 + i / 100, 1, 2);
    if (optimized) assert.equal(installStaticLodLeafMatrixUpdate(leaf), true);
    const compose = leaf.updateMatrix;
    leaf.updateMatrix = function () {
      operations.compose++;
      return compose.call(this);
    };
    const multiply = leaf.matrixWorld.multiplyMatrices;
    leaf.matrixWorld.multiplyMatrices = function (a, b) {
      operations.product++;
      return multiply.call(this, a, b);
    };
    root.add(leaf);
    leaves.push(leaf);
  }
  return { root, leaves, operations };
}

test('presentation skips inactive LOD leaf work while visible matrices match native Three', () => {
  const candidate = fixture(true);
  const reference = fixture(false);
  for (let frame = 0; frame < 60; frame++) {
    for (const tree of [candidate, reference]) {
      tree.root.position.set(frame * 0.75, -frame / 2, frame * 2);
      tree.root.rotation.set(frame / 30, frame / 60, frame / 20);
      tree.root.scale.set(1 + frame / 100, 1.25, 0.75);
      for (let i = 0; i < tree.leaves.length; i++) {
        tree.leaves[i].visible = (i % 3) === (Math.floor(frame / 10) % 3);
      }
    }
    updatePresentedObjectMatrices(candidate.root);
    reference.root.updateMatrixWorld();
    for (let i = 0; i < candidate.leaves.length; i++) {
      if (candidate.leaves[i].visible) {
        assertMatrixEqual(candidate.leaves[i].matrixWorld, reference.leaves[i].matrixWorld);
      } else {
        assert.equal(candidate.leaves[i].matrixWorldNeedsUpdate, true);
      }
    }
  }
  assert.deepEqual(reference.operations, { compose: 5400, product: 5400 });
  assert.deepEqual(candidate.operations, { compose: 1800, product: 1800 });
  assert.equal(candidate.leaves.length, reference.leaves.length, 'every authored LOD remains mounted');
});

test('explicit matrix updates and world queries still refresh inactive LOD geometry', () => {
  const root = new THREE.Group();
  const leaf = lodLeaf();
  root.add(leaf);
  installStaticLodLeafMatrixUpdate(leaf);
  root.position.set(12, 13, 14);
  leaf.position.set(2, 3, 4);
  updatePresentedObjectMatrices(root);
  assert.equal(leaf.matrixWorldNeedsUpdate, true);
  root.updateMatrixWorld(true);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(leaf.matrixWorld).toArray(), [14, 16, 18]);
  root.position.set(22, 23, 24);
  leaf.position.set(5, 6, 7);
  updatePresentedObjectMatrices(root);
  assert.deepEqual(leaf.getWorldPosition(new THREE.Vector3()).toArray(), [27, 29, 31]);
});

test('a frozen leaf refreshes its parent pose on first visible presentation', () => {
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  const leaf = lodLeaf();
  leaf.matrixAutoUpdate = false;
  leaf.position.set(4, 5, 6);
  leaf.updateMatrix();
  root.add(leaf);
  installStaticLodLeafMatrixUpdate(leaf);
  root.position.set(30, 40, 50);
  root.updateMatrix();
  updatePresentedObjectMatrices(root);
  leaf.visible = true;
  updatePresentedObjectMatrices(root);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(leaf.matrixWorld).toArray(), [34, 45, 56]);
});

test('vendored frozen ancestors cannot conceal a deferred dirty leaf on LOD re-entry', async () => {
  const vendorUrl = new URL('../vendor/three.module.js', import.meta.url).href;
  const helperUrl = new URL('../src/render/staticChildMatrices.js?vendor-lod-leaf-fixture', import.meta.url).href;
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'three' && context.parentURL === helperUrl) {
        return { url: vendorUrl, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  let helpers;
  try {
    helpers = await import(helperUrl);
  } finally {
    hook.deregister();
  }
  const vendor = await import(vendorUrl);
  const root = new vendor.Group();
  const middle = new vendor.Group();
  const inner = new vendor.Group();
  const leaf = new vendor.Mesh();
  leaf.userData.spacefaceTags = { lod: 'lod1' };
  leaf.position.set(2, 0, 3);
  root.add(middle);
  middle.add(inner);
  inner.add(leaf);
  helpers.freezeStaticChildMatrices(root);
  assert.equal(middle.userData.sfMatrixFrozen, true);
  assert.equal(inner.userData.sfMatrixFrozen, true);
  helpers.installStaticLodLeafMatrixUpdate(leaf);
  root.updateMatrixWorld(true);
  leaf.visible = false;
  root.position.set(20, 0, 30);
  helpers.updatePresentedObjectMatrices(root);
  assert.equal(leaf.matrixWorldNeedsUpdate, true);
  // Motion has stopped. The vendor's frozen-ancestor fast path must not trap
  // the deferred dirty leaf when visibility changes without another parent pose.
  helpers.updatePresentedObjectMatrices(root);
  leaf.visible = true;
  helpers.updatePresentedObjectMatrices(root);
  assert.deepEqual(new vendor.Vector3().setFromMatrixPosition(leaf.matrixWorld).toArray(), [22, 0, 33]);
});

test('new children or runtime tags immediately defeat a registered hidden leaf skip', () => {
  const root = new THREE.Group();
  const leaf = lodLeaf();
  installStaticLodLeafMatrixUpdate(leaf);
  root.add(leaf);
  updatePresentedObjectMatrices(root);
  const socket = new THREE.Object3D();
  socket.userData.spacefaceSocket = true;
  socket.position.set(2, 3, 4);
  leaf.add(socket);
  root.position.set(7, 8, 9);
  updatePresentedObjectMatrices(root);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(socket.matrixWorld).toArray(), [9, 11, 13]);
  leaf.remove(socket);
  leaf.userData.animated = true;
  leaf.position.set(11, 12, 13);
  updatePresentedObjectMatrices(root);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(leaf.matrixWorld).toArray(), [18, 20, 22]);
});

test('required runtime transforms and custom updaters are never registered', () => {
  for (const data of [
    { animated: true }, { hlod: true }, { spacefaceSocket: true },
    { updateRuntimeState() {} }, { updateDriveState() {} }, { updateLod() {} },
    { spacefaceTags: { drive: 'fan' } }, { spacefaceTags: { motionGroup: true } },
    { spacefaceTags: { socket: true } },
  ]) {
    assert.equal(installStaticLodLeafMatrixUpdate(lodLeaf('lod1', data)), false);
  }
  for (const object of [
    new THREE.Bone(), new THREE.PointLight(), new THREE.PerspectiveCamera(),
    new THREE.SkinnedMesh(), new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1),
  ]) {
    object.userData.spacefaceTags = { lod: 'lod1' };
    assert.equal(installStaticLodLeafMatrixUpdate(object), false);
  }
  const leaf = lodLeaf();
  const custom = () => {};
  leaf.updateMatrixWorld = custom;
  assert.equal(installStaticLodLeafMatrixUpdate(leaf), false);
  assert.equal(leaf.updateMatrixWorld, custom);
});

test('repeat installation is idempotent and clones acquire no presentation ownership', () => {
  const source = lodLeaf();
  assert.equal(installStaticLodLeafMatrixUpdate(source), true);
  const updater = source.updateMatrixWorld;
  assert.equal(installStaticLodLeafMatrixUpdate(source), true);
  assert.equal(source.updateMatrixWorld, updater);
  const clone = source.clone();
  assert.equal(clone.updateMatrixWorld, THREE.Object3D.prototype.updateMatrixWorld);
  clone.position.set(6, 7, 8);
  updatePresentedObjectMatrices(clone);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(clone.matrixWorld).toArray(), [6, 7, 8]);
  assert.equal(installStaticLodLeafMatrixUpdate(clone), true);
  updatePresentedObjectMatrices(clone);
  assert.equal(clone.matrixWorldNeedsUpdate, true);
});

test('throwing custom traversals do not leave the presentation skip enabled', () => {
  const root = new THREE.Group();
  root.updateMatrixWorld = () => { throw new Error('fixture'); };
  assert.throws(() => updatePresentedObjectMatrices(root), /fixture/);
  const leaf = lodLeaf();
  installStaticLodLeafMatrixUpdate(leaf);
  leaf.position.set(3, 4, 5);
  leaf.updateMatrixWorld();
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(leaf.matrixWorld).toArray(), [3, 4, 5]);
});
