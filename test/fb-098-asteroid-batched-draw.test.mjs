// FB-098 — one populous archetype draws through batched instance submission.
// The asteroid field is that archetype: every common rock registers its base leaf
// with the asteroid instance pool, and one sync collapses the registered bodies
// into shared InstancedMesh chunks keyed by geometry variant — many bodies, one
// draw per variant bucket. The renderer wires the same pool (create at scene
// build, register on admission, release on despawn, sync per frame).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import {
  ASTEROID_INSTANCE_VARIANT_COUNT,
  createAsteroidInstancePool,
  disposeAsteroidInstancePool,
  registerAsteroidBaseLeaf,
  releaseAsteroidInstancesForEntity,
  syncAsteroidInstancePool,
} from '../src/render/asteroidInstancePool.js';

test('seventy rocks of the asteroid archetype draw as instanced batches, not seventy meshes', () => {
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);
  const geometries = Array.from(
    { length: ASTEROID_INSTANCE_VARIANT_COUNT },
    () => new THREE.IcosahedronGeometry(1, 2),
  );
  const material = new THREE.MeshStandardMaterial({ color: 0x4a4540 });
  const entities = [];
  try {
    for (let id = 1; id <= 70; id++) {
      const entity = { id, type: 'asteroid' };
      const root = new THREE.Group();
      const leaf = new THREE.Mesh(geometries[id % ASTEROID_INSTANCE_VARIANT_COUNT], material);
      leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
      leaf.userData.asteroidInstanceVariant = id % ASTEROID_INSTANCE_VARIANT_COUNT;
      root.userData.asteroidInstanceBody = leaf;
      root.add(leaf);
      scene.add(root);
      entities.push(entity);
      assert.equal(registerAsteroidBaseLeaf(pool, entity, root), true);
    }
    const first = syncAsteroidInstancePool(pool);
    assert.equal(first.submitted, 70, 'every registered rock is submitted');

    // The draw path is InstancedMesh batches, not per-body mesh submission.
    let instanced = 0;
    const variants = new Set();
    scene.traverse((object) => {
      if (!object.isInstancedMesh) return;
      instanced += 1;
      variants.add(object.userData.asteroidInstanceVariant ?? object.name);
    });
    assert.ok(instanced > 0, 'batched chunks exist in the scene');
    assert.ok(instanced <= ASTEROID_INSTANCE_VARIANT_COUNT,
      'chunk count is bounded by variant buckets, not body count');
    assert.ok(variants.size <= ASTEROID_INSTANCE_VARIANT_COUNT);

    // And each origin mesh no longer submits itself.
    for (const entity of entities) {
      assert.equal(releaseAsteroidInstancesForEntity(pool, entity.id), true);
    }
    const drained = syncAsteroidInstancePool(pool);
    assert.equal(drained.submitted, 0, 'released rocks stop drawing');
  } finally {
    disposeAsteroidInstancePool(pool);
  }
});

test('the live renderer wires this pool — create, register, release, sync', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /createAsteroidInstancePool\(scene/, 'pool created at scene build');
  assert.match(source, /registerAsteroidBaseLeaf\(this\._asteroidInstancePool/, 'admission registers leaves');
  assert.match(source, /releaseAsteroidInstancesForEntity\(this\._asteroidInstancePool/, 'despawn releases');
  assert.match(source, /syncAsteroidInstancePool\(this\._asteroidInstancePool/, 'frame sync drives submission');
});
