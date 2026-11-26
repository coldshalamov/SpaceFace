import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  collectAsteroidInstancePoolLeafResources,
  createAsteroidInstancePool,
  disposeAsteroidInstancePool,
  warmAsteroidInstanceKeys,
} from '../src/render/asteroidInstancePool.js';

const scene = new THREE.Scene();
const pool = createAsteroidInstancePool(scene);

const bodyGeometry = new THREE.IcosahedronGeometry(1, 1);
const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 0.9 });
const detailGeometry = new THREE.OctahedronGeometry(0.18, 0);
const detailMaterial = new THREE.MeshStandardMaterial({ color: 0xc878ff, emissive: 0x38104a });
const ghostGeometry = new THREE.BoxGeometry(1, 1, 1);
const ghostMaterial = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 });

// Authored/prepared root shape: body leaf on root.userData, stamped detail children.
const authoredRoot = new THREE.Group();
const bodyLeaf = new THREE.Mesh(bodyGeometry, bodyMaterial);
bodyLeaf.castShadow = true;
bodyLeaf.receiveShadow = false;
authoredRoot.userData.asteroidInstanceBody = bodyLeaf;
authoredRoot.add(bodyLeaf);
const shard = new THREE.Mesh(detailGeometry, detailMaterial);
shard.userData.asteroidInstanceDetail = true;
authoredRoot.add(shard);
// A second root sharing the same body pair must dedupe to one resource.
const siblingRoot = new THREE.Group();
siblingRoot.userData.asteroidInstanceBody = bodyLeaf;
// A transparent detail child mirrors the pool's own adopt gate and must be skipped.
const ghost = new THREE.Mesh(ghostGeometry, ghostMaterial);
ghost.userData.asteroidInstanceDetail = true;
siblingRoot.add(ghost);

const resources = collectAsteroidInstancePoolLeafResources([authoredRoot, siblingRoot, null]);
assert.equal(resources.length, 2, 'unique opaque (geometry, material) pairs only');
const bodyRes = resources.find((res) => res.geometry === bodyGeometry);
assert.ok(bodyRes, 'body leaf pair collected');
assert.equal(bodyRes.material, bodyMaterial);
assert.equal(bodyRes.castShadow, true);
assert.equal(bodyRes.receiveShadow, false);
assert.equal(bodyRes.key, `${bodyGeometry.uuid}|${bodyMaterial.uuid}`);
const detailRes = resources.find((res) => res.geometry === detailGeometry);
assert.ok(detailRes, 'stamped detail child pair collected');
assert.equal(resources.some((res) => res.geometry === ghostGeometry), false,
  'transparent leaf stays out of the keyed warm the same way adoptPoolLeaf refuses it');

// Feeding the census into the keyed warm mints the same bucket a live registration would key.
const warmed = warmAsteroidInstanceKeys(pool, resources);
assert.equal(warmed, 2);
const bucket = pool.keyed.get(`${bodyGeometry.uuid}|${bodyMaterial.uuid}`);
assert.ok(bucket, 'keyed bucket exists for the authored leaf pair');
assert.ok(bucket.mesh, 'bucket mesh published behind the shell');
assert.equal(bucket.mesh.userData.asteroidInstancePool, true);
assert.equal(bucket.mesh.geometry, bodyGeometry, 'bucket binds the exact leaf geometry');
assert.equal(bucket.mesh.material, bodyMaterial, 'bucket binds the exact leaf material');
assert.equal(bucket.mesh.castShadow, true);
assert.equal(bucket.mesh.receiveShadow, false);

// An identical re-warm is a no-op, not a rebuild.
assert.equal(warmAsteroidInstanceKeys(pool, resources), 0);
assert.equal(pool.keyed.get(`${bodyGeometry.uuid}|${bodyMaterial.uuid}`).mesh, bucket.mesh);

disposeAsteroidInstancePool(pool);
console.log('asteroid-keyed-leaf-warm: all assertions passed');
