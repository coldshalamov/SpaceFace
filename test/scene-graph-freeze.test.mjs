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

test('PERF-138 transform-signature memo: unchanged nodes skip compose, world output identical', () => {
  assert.match(SRC, /sfTransformSignatureClean/);
  assert.match(SRC, /sfTransformSignatureStore/);
  assert.match(SRC, /matrixWorldNeedsUpdate \|\| !sfTransformSignatureClean/);

  const scene = new THREE.Object3D();
  scene.matrixAutoUpdate = false;
  const parent = new THREE.Object3D();
  const child = new THREE.Object3D();
  parent.add(child);
  scene.add(parent);

  // Pass one composes + stores the signature (first-seen fields are never "clean").
  scene.updateMatrixWorld();
  assert.ok(parent.userData.sfTransformSig, 'signature stored at first compose');
  let composed = 0;
  const base = parent.updateMatrix.bind(parent);
  parent.updateMatrix = () => { composed++; return base(); };

  // Pass two on an unmoved subtree: no compose, and no minted force either — the child
  // evaluates its own signature and skips too.
  scene.updateMatrixWorld();
  assert.equal(composed, 0, 'unchanged transform skips the compose');
  assert.equal(parent.matrixWorldNeedsUpdate, false, 'no flag minted on a clean frame');
  const before = child.matrixWorld.elements.slice();

  // A moved parent still recomposes and its child follows through the minted force.
  parent.position.x += 5;
  scene.updateMatrixWorld();
  assert.equal(composed, 1, 'moved node recomposes');
  const moved = child.matrixWorld.elements.slice();
  assert.notDeepEqual(moved, before, 'child world follows the moved parent');
  assert.ok(Math.abs(moved[12] - before[12] - 5) < 1e-10);

  // A manual needsUpdate re-runs compose even when the signature is unchanged —
  // the stomp semantics upstream gave direct .matrix writers are preserved.
  parent.matrixWorldNeedsUpdate = true;
  scene.updateMatrixWorld();
  assert.equal(composed, 2, 'manual needsUpdate re-runs compose');
});

test('PERF-138 F1 captured render-list replay pair exists and gates projectObject', () => {
  assert.match(SRC, /this\.render = function \( scene, camera, capturedList \)/);
  assert.match(SRC, /this\.renderAndCaptureList = function \( scene, camera \)/);
  assert.match(SRC, /this\.renderCapturedList = function \( scene, camera, capturedList \)/);
  // Replay injects finished sorted arrays (zero-count instanced dropped); the live
  // path still projects + finishes + sorts + adds background.
  assert.match(SRC, /if \( capturedList \)/);
  assert.match(SRC, /object\.isInstancedMesh === true && object\.count <= 0 \) continue/);
  assert.match(SRC, /if \( capturedList === undefined \) this\.info\.render\.frame \+\+/);
});

test('W140 F-A renderQuadPass keeps the render-state bookkeeping contract', () => {
  assert.match(SRC, /this\.renderQuadPass = function \( scene, camera \)/);
  // Draws each top-level drawable through the same objects.update → renderObject
  // tail the finished list takes; no projectObject/render-list assembly.
  assert.match(SRC, /function renderQuadObject\( object, scene, camera, overrideMaterial \)/);
  assert.match(SRC, /renderQuadObject\( children\[ i \], scene, camera, overrideMaterial \)/);
  // Bookkeeping kept: stack pushes (a nested render can never satisfy the capture
  // gate inside this pass), textureUnits save, the frame mint, autoReset-aware
  // info.reset, and the renderScene depth/color-mask tail.
  assert.match(SRC, /const renderBackground = xr\.enabled === false/);
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
