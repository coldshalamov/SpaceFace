// PERF-59 — static-subtree prune contract for the vendored updateMatrixWorld override.
// A node marked userData.sfMatrixFrozen (subtree fully matrixAutoUpdate === false, applied by
// src/render/staticChildMatrices.js) is skipped on clean frames; a forced descent (an ancestor
// rewrote), a pending matrixWorldNeedsUpdate (the dirty path), and grafts via add()/attach()
// all still reach it, so world-matrix output is identical to the unpatched walk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VENDOR_URL = new URL('../vendor/three.module.js', import.meta.url);
const SRC = readFileSync(fileURLToPath(VENDOR_URL), 'utf8');
const THREE = await import(VENDOR_URL.href);

test('vendored three overrides updateMatrixWorld with the sfMatrixFrozen prune', () => {
  assert.match(SRC, /Object3D\.prototype\.updateMatrixWorld = function \( force \)/);
  assert.match(SRC, /!force && child\.matrixWorldNeedsUpdate === false/);
  assert.match(SRC, /child\.userData\.sfMatrixFrozen === true \) continue/);
});

test('vendored add()/attach() clear sfMatrixFrozen up the ancestor chain', () => {
  assert.match(SRC, /Object3D\.prototype\.add = function/);
  assert.match(SRC, /Object3D\.prototype\.attach = function/);
  assert.match(SRC, /spacefaceUnfreezeStaticAncestors/);
});

function visitCounts(root) {
  const counts = new Map();
  root.traverse((node) => {
    counts.set(node, 0);
    const base = node.updateMatrixWorld.bind(node);
    node.updateMatrixWorld = (force) => {
      counts.set(node, counts.get(node) + 1);
      base(force);
    };
  });
  return counts;
}

function frozenLeaf(name) {
  const node = new THREE.Object3D();
  node.name = name;
  node.matrixAutoUpdate = false;
  node.updateMatrix();
  return node;
}

test('marked subtrees are skipped on clean frames but still reached under force or dirty', () => {
  const scene = new THREE.Object3D();
  scene.matrixAutoUpdate = false;
  const frozen = frozenLeaf('frozen');
  const frozenChild = frozenLeaf('frozenChild');
  frozen.add(frozenChild);
  // Marks land post-compose (freezeStaticTransformRoot order): flag the fully frozen subtree.
  frozenChild.userData.sfMatrixFrozen = true;
  frozen.userData.sfMatrixFrozen = true;
  const live = new THREE.Object3D();
  live.name = 'live';
  scene.add(frozen);
  scene.add(live);
  const counts = visitCounts(scene);

  // The freeze-time updateMatrix() leaves matrixWorldNeedsUpdate set — pass one is dirty.
  scene.updateMatrixWorld();
  assert.equal(counts.get(frozen), 1);
  scene.updateMatrixWorld();
  assert.equal(counts.get(frozen), 1, 'clean walk must not descend into a marked subtree');
  assert.equal(counts.get(frozenChild), 1);
  assert.equal(counts.get(live), 2);

  // Dirty path: updateMatrix() on a frozen node re-arms the walk for exactly one pass.
  frozen.position.set(3, 0, 4);
  frozen.updateMatrix();
  scene.updateMatrixWorld();
  assert.equal(counts.get(frozen), 2, 'needsUpdate must defeat the skip for one pass');
  assert.equal(counts.get(frozenChild), 2, 'descendants refresh under the re-armed parent');
  scene.updateMatrixWorld();
  assert.equal(counts.get(frozen), 2, 'prune resumes once the dirty flag is consumed');
  assert.equal(counts.get(frozenChild), 2);

  // Forced descent (an ancestor rewrote this frame) still reaches marked subtrees.
  scene.matrixWorldNeedsUpdate = true;
  scene.updateMatrixWorld();
  assert.equal(counts.get(frozen), 3);
  assert.equal(counts.get(frozenChild), 3);
});

test('world matrices stay identical to an unmarked walk after grafts and repose', () => {
  const build = (mark) => {
    const scene = new THREE.Object3D();
    scene.matrixAutoUpdate = false;
    const outer = new THREE.Object3D();
    outer.matrixAutoUpdate = false;
    outer.updateMatrix();
    const inner = new THREE.Object3D();
    inner.matrixAutoUpdate = false;
    inner.updateMatrix();
    outer.add(inner);
    scene.add(outer);
    if (mark) {
      inner.userData.sfMatrixFrozen = true;
      outer.userData.sfMatrixFrozen = true;
    }
    return { scene, outer, inner };
  };

  const run = ({ scene, outer, inner }) => {
    outer.position.set(10, 0, -2);
    outer.updateMatrix();
    inner.position.set(0, 5, 0);
    inner.rotation.y = Math.PI / 4;
    inner.updateMatrix();
    scene.updateMatrixWorld();
    // Second pass is clean: the marked subtree is skipped entirely while the unmarked one
    // recomputes the same values — skipped writes must equal recomputed writes.
    scene.updateMatrixWorld();
    return inner.matrixWorld.elements.slice();
  };

  assert.deepEqual(run(build(true)), run(build(false)));

  // A live node grafted under a frozen parent must keep updating — add() clears the marks.
  const parent = frozenLeaf('parent');
  parent.userData.sfMatrixFrozen = true;
  const graft = new THREE.Object3D();
  parent.add(graft);
  assert.notEqual(parent.userData.sfMatrixFrozen, true);
});
