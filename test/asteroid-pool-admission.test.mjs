import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  createAsteroidInstancePool,
  registerAsteroidBaseLeaf,
  syncAsteroidInstancePool,
} from '../src/render/asteroidInstancePool.js';

const RENDERER_SOURCE = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

function makeCommonRock(id, variant, geometry, material) {
  const root = new THREE.Group();
  const leaf = new THREE.Mesh(geometry, material);
  leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
  leaf.userData.asteroidInstanceVariant = variant;
  root.userData.asteroidInstanceBody = leaf;
  root.add(leaf);
  return { entity: { id, type: 'asteroid' }, root };
}

// The 771 ms bloomScene brick: a new variant InstancedMesh carries a never-linked instanced
// program. Without admission its first live draw links it inside the presented pass.
test('a newly created variant pool mesh is offered to pipeline admission', () => {
  const scene = new THREE.Scene();
  const created = [];
  const pool = createAsteroidInstancePool(scene, {
    onMeshCreated: (mesh) => created.push(mesh),
  });
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const material = new THREE.MeshStandardMaterial();

  const first = makeCommonRock(1, 0, geometry, material);
  assert.equal(registerAsteroidBaseLeaf(pool, first.entity, first.root), true);
  assert.equal(created.length, 1, 'the first leaf for a variant creates and admits one mesh');
  assert.equal(created[0].userData.asteroidInstancePool, true);
  assert.equal(created[0].parent, scene, 'the admitted mesh is the published pool mesh');

  const second = makeCommonRock(2, 0, geometry, material);
  assert.equal(registerAsteroidBaseLeaf(pool, second.entity, second.root), true);
  assert.equal(created.length, 1, 'registering under existing capacity does not re-admit');

  // Growing past capacity publishes a replacement mesh — it must be admitted too, because the
  // old owner is disposed and its instances would otherwise draw unlinked.
  pool.variants[0].capacity = 1;
  const third = makeCommonRock(3, 0, geometry, material);
  assert.equal(registerAsteroidBaseLeaf(pool, third.entity, third.root), true);
  assert.equal(created.length, 2, 'a capacity-grown replacement mesh is admitted as well');

  const quiet = createAsteroidInstancePool(new THREE.Scene());
  const quietLeaf = makeCommonRock(9, 1, geometry, material);
  assert.equal(registerAsteroidBaseLeaf(quiet, quietLeaf.entity, quietLeaf.root), true,
    'pools without the hook still work');
});

// OWNER 2026-09-29 "asteroids on screen blip gone and come back": growing a bucket must not blank
// every rock of that kind while the replacement batch waits behind the admission latch. The
// outgoing batch keeps drawing its last matrices until the replacement's pipelinesPending clears.
test('a grown bucket keeps its outgoing batch drawing until the replacement clears the latch', () => {
  const scene = new THREE.Scene();
  const created = [];
  const pool = createAsteroidInstancePool(scene, {
    // The renderer's latch: a created mesh is hidden (pipelinesPending) until compile+upload settle.
    onMeshCreated: (mesh) => { mesh.userData.pipelinesPending = true; created.push(mesh); },
  });
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const material = new THREE.MeshStandardMaterial();

  const first = makeCommonRock(1, 0, geometry, material);
  scene.add(first.root);
  assert.equal(registerAsteroidBaseLeaf(pool, first.entity, first.root), true);
  const original = created[0];
  original.userData.pipelinesPending = false; // its admission settled
  syncAsteroidInstancePool(pool);
  assert.equal(original.visible, true);
  assert.equal(original.count, 1, 'the first batch draws the first rock');

  // Force a growth: the replacement is created pending, the original must keep drawing.
  pool.variants[0].capacity = 1;
  const second = makeCommonRock(2, 0, geometry, material);
  scene.add(second.root);
  assert.equal(registerAsteroidBaseLeaf(pool, second.entity, second.root), true);
  assert.equal(created.length, 2, 'growth publishes a replacement batch');
  const replacement = created[1];
  assert.notEqual(replacement, original);
  assert.equal(pool.variants[0].mesh, replacement);
  assert.equal(pool.variants[0].retiring && pool.variants[0].retiring.mesh, original,
    'the outgoing batch is retained as the bridge');
  assert.equal(original.parent, scene, 'the outgoing batch is NOT removed from the scene');
  assert.equal(original.visible, true);
  assert.equal(original.count, 1, 'it keeps its last committed instance count');

  syncAsteroidInstancePool(pool);
  assert.equal(original.parent, scene, 'still bridging while the replacement is pending');
  assert.equal(original.count, 1);
  assert.equal(pool.dirty, true, 'a bridging bucket stays off the static fast path');
  assert.ok(replacement.count >= 2, 'the replacement carries both rocks the moment it can draw');

  replacement.userData.pipelinesPending = false; // the latch clears
  syncAsteroidInstancePool(pool);
  assert.equal(pool.variants[0].retiring, null, 'the bridge is released once the replacement is drawable');
  assert.equal(original.parent, null, 'the outgoing batch leaves the scene');
  assert.equal(original.count, 0);
  assert.equal(pool.dirty, false);
  assert.equal(replacement.visible, true);
  assert.equal(replacement.count, 2);

  // Without the latch there is nothing to bridge: growth replaces the batch immediately.
  const plain = createAsteroidInstancePool(new THREE.Scene());
  const a = makeCommonRock(11, 1, geometry, material);
  plain.scene.add(a.root);
  registerAsteroidBaseLeaf(plain, a.entity, a.root);
  syncAsteroidInstancePool(plain);
  const plainOriginal = plain.variants[1].mesh;
  plain.variants[1].capacity = 1;
  const b = makeCommonRock(12, 1, geometry, material);
  plain.scene.add(b.root);
  registerAsteroidBaseLeaf(plain, b.entity, b.root);
  assert.equal(plain.variants[1].retiring, null, 'no latch, no bridge');
  assert.equal(plainOriginal.parent, null, 'the old batch is disposed on the spot as before');
});

test('the renderer routes created pool meshes through the admission latch', () => {
  const poolStart = RENDERER_SOURCE.indexOf('createAsteroidInstancePool(scene, {');
  assert.ok(poolStart >= 0, 'the renderer must pass an admission hook to the pool');
  const block = RENDERER_SOURCE.slice(poolStart, poolStart + 400);
  assert.match(block, /onMeshCreated:\s*\(mesh\)\s*=>\s*\{\s*void admitSubjectPipelines\(mesh\)/,
    'created pool meshes must compile+upload behind the pending latch');
});
