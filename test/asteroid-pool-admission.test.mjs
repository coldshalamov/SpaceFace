import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  createAsteroidInstancePool,
  registerAsteroidBaseLeaf,
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

test('the renderer routes created pool meshes through the admission latch', () => {
  const poolStart = RENDERER_SOURCE.indexOf('createAsteroidInstancePool(scene, {');
  assert.ok(poolStart >= 0, 'the renderer must pass an admission hook to the pool');
  const block = RENDERER_SOURCE.slice(poolStart, poolStart + 400);
  assert.match(block, /onMeshCreated:\s*\(mesh\)\s*=>\s*\{\s*void admitSubjectPipelines\(mesh\)/,
    'created pool meshes must compile+upload behind the pending latch');
});
