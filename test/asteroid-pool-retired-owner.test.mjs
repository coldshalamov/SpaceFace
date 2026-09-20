// OWNER, 2026-09-20: "asteroids pop out of existence all the time."
//
// Common rocks are drawn as five instanced batches; each rock's own leaf is hidden in favour of its
// batch. A batch's dynamic-buffer owner retires itself — permanently — on any upload it did not
// ask for, and the pool used to answer a retired owner by drawing NOTHING for that batch for the
// rest of the session: one fifth of every common rock on screen gone at once, never to return.
// The law: a rock the sim still has is a rock the player still sees.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  ASTEROID_INSTANCE_VARIANT_COUNT,
  createAsteroidInstancePool,
  invalidateAsteroidInstancePool,
  registerAsteroidBaseLeaf,
  syncAsteroidInstancePool,
} from '../src/render/asteroidInstancePool.js';
import { createDynamicBufferCoordinator } from '../src/render/dynamicBufferRanges.js';

function buildField(count = 40) {
  const scene = new THREE.Scene();
  // The live renderer gives its scene a coordinator, so every batch carries a tracked owner.
  createDynamicBufferCoordinator(scene);
  const pool = createAsteroidInstancePool(scene);
  const geometries = Array.from({ length: ASTEROID_INSTANCE_VARIANT_COUNT },
    () => new THREE.IcosahedronGeometry(1, 1));
  const material = new THREE.MeshStandardMaterial({ color: 0x4a4540 });
  const leaves = [];
  for (let id = 1; id <= count; id++) {
    const variant = id % ASTEROID_INSTANCE_VARIANT_COUNT;
    const root = new THREE.Group();
    root.position.set(id * 3, 0, -id * 2);
    const leaf = new THREE.Mesh(geometries[variant], material);
    leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
    leaf.userData.asteroidInstanceVariant = variant;
    root.userData.asteroidInstanceBody = leaf;
    root.add(leaf);
    scene.add(root);
    leaves.push(leaf);
    assert.equal(registerAsteroidBaseLeaf(pool, { id, type: 'asteroid' }, root), true);
  }
  return { scene, pool, leaves };
}

function rocksOnScreen(pool, leaves) {
  // A rock is drawn either by its batch (leaf hidden, batch visible and counting it) or directly.
  let drawn = 0;
  for (const bucket of pool.variants) {
    if (bucket.mesh && bucket.mesh.visible) drawn += bucket.mesh.count;
  }
  for (const leaf of leaves) if (leaf.visible) drawn++;
  return drawn;
}

function retire(owner, message) {
  owner.invalid = true;
  owner.diagnostics.invalid = true;
  owner.diagnostics.lastError = message;
}

test('a retired batch owner rebuilds its batch: every rock is still drawn on the very next sync', () => {
  const { pool, leaves } = buildField(40);
  const warn = console.warn;
  const warnings = [];
  console.warn = (line) => warnings.push(String(line));
  try {
    assert.equal(syncAsteroidInstancePool(pool).submitted, 40);
    assert.equal(rocksOnScreen(pool, leaves), 40);

    const bucket = pool.variants[2];
    const retiredMesh = bucket.mesh;
    retire(bucket.dynamicBufferOwner, 'unsolicited upload');
    invalidateAsteroidInstancePool(pool);
    const healed = syncAsteroidInstancePool(pool);

    assert.equal(healed.submitted, 40, 'no rock leaves the picture because a buffer owner retired');
    assert.equal(rocksOnScreen(pool, leaves), 40);
    assert.notEqual(bucket.mesh, retiredMesh, 'the retired batch was replaced, not kept dark');
    assert.equal(bucket.dynamicBufferOwner.invalid, false);
    assert.equal(healed.variants[2].retiredOwners, 1, 'the fault is counted where diagnostics can see it');
    assert.ok(warnings.some((line) => line.includes('unsolicited upload')),
      'and named once in the console, so it can never again be silent');
  } finally {
    console.warn = warn;
  }
});

test('a batch that keeps retiring falls back to drawing its rocks one by one, never to nothing', () => {
  const { pool, leaves } = buildField(40);
  const warn = console.warn;
  console.warn = () => {};
  try {
    syncAsteroidInstancePool(pool);
    const bucket = pool.variants[1];
    const inBucket = bucket.records.length;
    assert.ok(inBucket > 0);
    for (let attempt = 0; attempt < 5; attempt++) {
      retire(bucket.dynamicBufferOwner, 'version drift');
      invalidateAsteroidInstancePool(pool);
      syncAsteroidInstancePool(pool);
      assert.equal(rocksOnScreen(pool, leaves), 40,
        `attempt ${attempt + 1}: all forty rocks are on screen by one path or the other`);
    }
    assert.equal(bucket.mesh.visible, false, 'the batch is out of rebuilds');
    assert.equal(bucket.records.filter((record) => record.leaf.visible).length, inBucket,
      'so each of its rocks draws itself');
  } finally {
    console.warn = warn;
  }
});
