import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  asteroidInstanceMembership,
  collectAsteroidInstancePoolRoots,
  createAsteroidInstancePool,
  disposeAsteroidInstancePool,
  drainAsteroidInstancePoolAdmissions,
  registerAsteroidBaseLeaf,
  resolveAsteroidInstanceEntityId,
  syncAsteroidInstancePool,
} from '../src/render/asteroidInstancePool.js';
import { LOD_THRESHOLDS } from '../src/render/lod.js';

const scene = new THREE.Scene();
const pool = createAsteroidInstancePool(scene);

const baseGeometry = new THREE.IcosahedronGeometry(1, 2);
const lod1Geometry = new THREE.IcosahedronGeometry(1, 1);
const lod2Geometry = new THREE.IcosahedronGeometry(1, 0);
const material = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.98, metalness: 0.04 });
let geometryDisposals = 0;
for (const geometry of [baseGeometry, lod1Geometry, lod2Geometry]) {
  geometry.addEventListener('dispose', () => geometryDisposals++);
}

function makeRock(id, x, scale) {
  const root = new THREE.Group();
  root.position.set(x, 0, 0);
  const leaf = new THREE.Mesh(baseGeometry, material);
  leaf.scale.setScalar(scale);
  leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
  leaf.userData.asteroidInstanceVariant = 2;
  leaf.userData.asteroidInstanceLodGeometries = [lod1Geometry, lod2Geometry];
  root.userData.asteroidInstanceBody = leaf;
  root.add(leaf);
  scene.add(root);
  assert.equal(registerAsteroidBaseLeaf(pool, { id, type: 'asteroid' }, root), true);
  return { root, leaf };
}

// Camera 800 units above the plane, fov 30, viewport 900 px tall.
// projectedPx ≈ radius / (tan(15°) * dist) * 450 ≈ radius * 2.1 at dist 800.
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 4000);
camera.position.set(0, 800, 0);
camera.lookAt(0, 0, 0);

const near = makeRock(1, 0, 55);   // ~115 px radius — above the lod0 demote band
const mid = makeRock(2, 40, 40);   // ~84 px — clearly below 120-25
const far = makeRock(3, 90, 9);    // ~19 px — below 45-25

const admitted = drainAsteroidInstancePoolAdmissions(pool);
assert.equal(admitted.length, 3, 'one instanced mesh per submitted tier gets admission');
assert.equal(admitted[0].geometry, baseGeometry);
assert.equal(admitted[1].geometry, lod1Geometry);
assert.equal(admitted[2].geometry, lod2Geometry);

const first = syncAsteroidInstancePool(pool, { camera, viewportHeight: 900 });
assert.equal(first.submitted, 3, 'all three rocks submit through the tiered variant');
assert.equal(first.visibleBatches, 3, 'three populated tier draws replace the five-variant view');

const bucket = pool.variants[2];
assert.equal(bucket.entityIds[0], 1, 'near rock keeps full-detail slot');
assert.equal(bucket.lodTiers[0].entityIds[0], 2, 'mid rock submits through the lod1 tier');
assert.equal(bucket.lodTiers[1].entityIds[0], 3, 'far rock submits through the lod2 tier');
assert.equal(bucket.lodTiers[0].mesh.geometry, lod1Geometry);
assert.equal(bucket.lodTiers[1].mesh.geometry, lod2Geometry);

// Per-slot shadow gating: with the player at the origin and cast radius 50, the far tier's
// only rock (x=90) drops out of the depth pass while the near and mid slots still cast.
const gated = syncAsteroidInstancePool(pool, {
  camera, viewportHeight: 900, playerX: 0, playerZ: 0, castRadius: 50,
});
assert.equal(gated.submitted, 3);
assert.equal(bucket.mesh.castShadow, true, 'near slot still casts');
assert.equal(bucket.lodTiers[0].mesh.castShadow, true, 'mid-distance slot still casts');
assert.equal(bucket.lodTiers[1].mesh.castShadow, false, 'all-far slot leaves the shadow map');

// Move the player next to the far rock — the nearest-instance rule flips the slots.
const shifted = syncAsteroidInstancePool(pool, {
  camera, viewportHeight: 900, playerX: 85, playerZ: 0, castRadius: 50,
});
assert.equal(shifted.submitted, 3);
assert.equal(bucket.mesh.castShadow, false, 'near slot drops out once nothing is in radius');
assert.equal(bucket.lodTiers[1].mesh.castShadow, true, 'far slot casts when the player closes');

// Ungated options keep the authored default (cast) so preview/test paths never regress.
syncAsteroidInstancePool(pool, { camera, viewportHeight: 900 });
assert.equal(bucket.mesh.castShadow, true, 'no gate fields → authored default restores');

const roots = collectAsteroidInstancePoolRoots(pool);
assert.equal(roots.length, 3, 'roots include every populated tier mesh');

const farMembership = asteroidInstanceMembership(pool, 3);
assert.equal(farMembership.submitted, true);
assert.equal(farMembership.submittedTier, 2);
assert.equal(farMembership.poolMeshUuid, bucket.lodTiers[1].mesh.uuid);

assert.equal(
  resolveAsteroidInstanceEntityId(pool, bucket.lodTiers[1].mesh, 0),
  3,
  'tier-mesh raycast hits resolve through the tier slot map',
);

// Hysteresis: move the far rock closer so its projected size sits inside the 45±25 px
// band — the tier must hold lod2 instead of oscillating each sync.
far.root.position.set(0, 0, 0);
far.root.position.x = 200; // dist ≈ 824 → scale 24 ≈ 50 px: inside the hysteresis band
far.leaf.scale.setScalar(24);
pool.dirty = true;
const held = syncAsteroidInstancePool(pool, { camera, viewportHeight: 900 });
assert.equal(held.submitted, 3);
assert.equal(bucket.lodTiers[1].entityIds[0], 3, 'hysteresis keeps a boundary rock on lod2');

// Clearly inside the promote band now (huge rock at the same distance) → back to lod0.
far.leaf.scale.setScalar(90);
pool.dirty = true;
syncAsteroidInstancePool(pool, { camera, viewportHeight: 900 });
assert.equal(bucket.entityIds.includes(3), true, 'a large near rock promotes back to lod0');

// No camera/viewport → conservative full detail (cannot measure projected size).
mid.leaf.scale.setScalar(9);
pool.dirty = true;
const blind = syncAsteroidInstancePool(pool, {});
assert.equal(bucket.entityIds.includes(2), true, 'unmeasurable projected size keeps lod0');

// Threshold constants stay aligned with the shared §12.4 selector.
assert.equal(LOD_THRESHOLDS.LOD1_BELOW, 120);
assert.equal(LOD_THRESHOLDS.LOD2_BELOW, 45);

disposeAsteroidInstancePool(pool);
assert.equal(geometryDisposals, 0, 'pool disposal never owns the borrowed variant geometries');
assert.equal(scene.children.some((o) => o.userData && o.userData.asteroidInstancePool), false);

console.log('asteroid-instance-lod: ok');
