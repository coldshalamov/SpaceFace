import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  collectUnstagedShadowCasters,
  collectUnstagedShadowCastersBulkSteps,
} from '../src/render/shadowDepthAdmission.js';

function collect(scene, pending, { budget = 64, renderer = {} } = {}) {
  const nodeBudget = { remaining: budget };
  const iter = collectUnstagedShadowCastersBulkSteps(
    [scene], new Set(pending), renderer, 'fixture-light-census', nodeBudget, 2);
  let step;
  do { step = iter.next(); } while (!step.done);
  return step.value;
}

function casterRoot(parent) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh());
  parent?.add(root);
  return root;
}

test('bulk collection spends its budget only on pending roots, not the unrelated scene prefix', () => {
  const scene = new THREE.Scene();
  const unrelated = new THREE.Group();
  scene.add(unrelated);
  for (let i = 0; i < 128; i += 1) unrelated.add(new THREE.Object3D());
  const pending = Array.from({ length: 4 }, () => casterRoot(scene));

  const result = collect(scene, pending, { budget: 16 });
  assert.equal(result.partial, false, 'four small pending roots fit even in a large scene');
  assert.deepEqual(result.completedRoots, new Set(pending));
  for (const root of pending) assert.deepEqual(result.unstagedByRoot.get(root), root.children);
});

test('nested pending roots share one walk and retain the per-root caster verdict', () => {
  const scene = new THREE.Scene();
  const outer = casterRoot(scene);
  const inner = casterRoot(outer);
  const translucent = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ transparent: true }));
  const contact = new THREE.Mesh();
  contact.userData.sharedContactShadow = true;
  inner.add(translucent, contact);
  const renderer = {};
  // Reverse pending order to ensure the forest does not depend on queue order.
  const result = collect(scene, [inner, outer], { budget: 6, renderer });

  assert.equal(result.partial, false, 'the nested subtree is visited once');
  assert.deepEqual(result.completedRoots, new Set([inner, outer]));
  for (const root of [inner, outer]) {
    assert.deepEqual(result.unstagedByRoot.get(root),
      collectUnstagedShadowCasters(renderer, [root], scene, 'fixture-light-census'));
  }
});

test('budget exhaustion proves completed roots only, leaving a torn subtree untrusted', () => {
  const scene = new THREE.Scene();
  const complete = casterRoot(scene);
  const incomplete = casterRoot(scene);
  incomplete.add(new THREE.Mesh());
  const result = collect(scene, [complete, incomplete], { budget: 3 });

  assert.equal(result.partial, true);
  assert.deepEqual(result.completedRoots, new Set([complete]));
  assert.deepEqual(result.unstagedByRoot.get(complete), complete.children);
  assert.equal(result.completedRoots.has(incomplete), false);
});

test('pending roots outside the supplied scene never receive a completion proof', () => {
  const scene = new THREE.Scene();
  const mounted = casterRoot(scene);
  const detached = casterRoot();
  const otherScene = new THREE.Scene();
  const foreign = casterRoot(otherScene);
  const result = collect(scene, [detached, foreign, mounted], { budget: 4 });

  assert.equal(result.partial, false);
  assert.deepEqual(result.completedRoots, new Set([mounted]));
  assert.equal(result.unstagedByRoot.has(detached), false);
  assert.equal(result.unstagedByRoot.has(foreign), false);
});
