import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  ASTEROID_INSTANCE_VARIANT_COUNT,
  asteroidInstanceMembership,
  clearAsteroidInstancePool,
  createAsteroidInstancePool,
  disposeAsteroidInstancePool,
  isBorrowedAsteroidInstanceResource,
  registerAsteroidBaseLeaf,
  releaseAsteroidInstancesForEntity,
  resolveAsteroidInstanceEntityId,
  syncAsteroidInstancePool,
} from '../src/render/asteroidInstancePool.js';

const scene = new THREE.Scene();
const pool = createAsteroidInstancePool(scene);
const geometries = Array.from({ length: ASTEROID_INSTANCE_VARIANT_COUNT }, () => new THREE.IcosahedronGeometry(1, 2));
const material = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.98, metalness: 0.04 });
const roots = [];
const leaves = [];
let geometryDisposals = 0;
let materialDisposals = 0;
for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
material.addEventListener('dispose', () => materialDisposals++);

for (let id = 1; id <= 70; id++) {
  const variant = id % ASTEROID_INSTANCE_VARIANT_COUNT;
  const root = new THREE.Group();
  root.position.set(id * 3, 0, -id * 2);
  root.rotation.y = id * 0.01;
  const leaf = new THREE.Mesh(geometries[variant], material);
  leaf.scale.setScalar(8 + (id % 4));
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
  leaf.userData.asteroidInstanceVariant = variant;
  root.userData.asteroidInstanceBody = leaf;
  root.add(leaf);
  scene.add(root);
  roots.push(root);
  leaves.push(leaf);
  assert.equal(registerAsteroidBaseLeaf(pool, { id, type: 'asteroid' }, root), true);
}

const first = syncAsteroidInstancePool(pool);
assert.equal(first.registered, 70);
assert.equal(first.submitted, 70, 'every eligible common rock remains visibly submitted');
assert.equal(first.visibleBatches, 5, '70 exact bodies collapse into five geometry variants');
assert.equal(leaves.every((leaf) => leaf.visible === false), true, 'only duplicate source submissions are hidden');
const firstMembership = asteroidInstanceMembership(pool, 1);
assert.deepEqual({
  registered: firstMembership.registered,
  variant: firstMembership.variant,
  adopted: firstMembership.adopted,
  submitted: firstMembership.submitted,
}, { registered: true, variant: 1, adopted: true, submitted: true });
assert.equal(firstMembership.sourceRootUuid, roots[0].uuid);
assert.equal(firstMembership.sourceLeafUuid, leaves[0].uuid);
assert.equal(firstMembership.sourceGeometryUuid, leaves[0].geometry.uuid);
assert.equal(firstMembership.sourceMaterialUuid, leaves[0].material.uuid);
assert.equal(typeof firstMembership.poolMeshUuid, 'string');
assert(firstMembership.submittedIndex >= 0);

const pools = scene.children.filter((object) => object.userData && object.userData.asteroidInstancePool);
assert.equal(pools.length, 5);
for (const mesh of pools) {
  const variant = mesh.userData.asteroidInstanceVariant;
  assert.equal(mesh.geometry, geometries[variant], 'instance batch borrows the exact source geometry');
  assert.equal(mesh.material, material, 'instance batch borrows the exact source PBR material');
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
}

const stable = syncAsteroidInstancePool(pool);
assert.equal(stable.matrixUploads, 0, 'unchanged common rocks do not upload instance matrices again');
assert.equal(stable.matrixReuses, 5);

roots[0].position.set(1234.56789, 0.123456, -987.654321);
roots[0].scale.setScalar(0.9876543);
assert.ok(syncAsteroidInstancePool(pool).matrixUploads > 0, 'fractional transform change uploads once');
assert.equal(syncAsteroidInstancePool(pool).matrixUploads, 0,
  'large fractional transforms compare at GPU float32 precision and remain stable');
roots[0].position.set(3, 0, -2);
roots[0].scale.setScalar(1);
syncAsteroidInstancePool(pool);

for (let index = 10; index < roots.length; index++) roots[index].userData.asteroidInstanceViewCulled = true;
const culled = syncAsteroidInstancePool(pool);
assert.equal(culled.submitted, 10, 'renderer view culling compacts the field before GPU submission');
assert.equal(culled.visibleBatches, 5);

const viewCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
viewCamera.position.set(0, 0, -500);
viewCamera.lookAt(0, 0, -1000);
const shadowCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
shadowCamera.position.set(0, 0, 0);
shadowCamera.lookAt(0, 0, -100);
for (const root of roots) root.userData.asteroidInstanceViewCulled = true;
const shadowUnion = syncAsteroidInstancePool(pool, { camera: viewCamera, shadowCamera });
assert.ok(shadowUnion.submitted > 0,
  'exact active shadow frustum retains casters even when coarse player-view bounds reject them');
const shadowSubmitted = shadowUnion.submitted;

const hitMesh = pools.find((mesh) => mesh.count > 0);
const hitId = resolveAsteroidInstanceEntityId(pool, hitMesh, 0);
assert.ok(Number.isInteger(hitId) && hitId >= 1 && hitId <= 10, 'instance hit resolves to a live entity id');
assert.equal(releaseAsteroidInstancesForEntity(pool, hitId), true);
assert.deepEqual(asteroidInstanceMembership(pool, hitId), {
  entityId: hitId,
  registered: false,
  adopted: false,
  submitted: false,
  submittedIndex: -1,
});
assert.equal(
  syncAsteroidInstancePool(pool, { camera: viewCamera, shadowCamera }).submitted,
  shadowSubmitted - 1,
  'destroyed asteroid leaves no ghost instance',
);

const releasedRoot = roots[hitId - 1];
assert.equal(isBorrowedAsteroidInstanceResource(leaves[hitId - 1]), true);
releasedRoot.traverse((child) => {
  if (isBorrowedAsteroidInstanceResource(child)) return;
  if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
  if (child.material && typeof child.material.dispose === 'function') child.material.dispose();
});
assert.equal(geometryDisposals, 0, 'destroying one rock must not dispose the pooled variant geometry');
assert.equal(materialDisposals, 0, 'destroying one rock must not dispose the pooled variant material');
assert.equal(
  syncAsteroidInstancePool(pool, { camera: viewCamera, shadowCamera }).submitted,
  shadowSubmitted - 1,
  'remaining common rocks still submit after a destroyed source root is disposed',
);

const liveLeaf = leaves.find((leaf, index) => index !== hitId - 1 && leaf.userData.asteroidInstanceAdopted);
assert.ok(liveLeaf, 'at least one remaining adopted rock');
const savedGeometry = liveLeaf.geometry;
liveLeaf.geometry = null;
pool.dirty = true;
assert.doesNotThrow(() => syncAsteroidInstancePool(pool, { camera: viewCamera, shadowCamera }));
liveLeaf.geometry = savedGeometry;
const liveBucket = pool.variants.find((bucket) => bucket.mesh && bucket.records.length);
assert.ok(liveBucket, 'at least one remaining instance batch');
const previousOwner = liveBucket.dynamicBufferOwner;
liveBucket.dynamicBufferOwner = { invalid: true, diagnostics: { lastError: 'test-invalid' } };
pool.dirty = true;
assert.doesNotThrow(() => syncAsteroidInstancePool(pool, { camera: viewCamera, shadowCamera }));
liveBucket.dynamicBufferOwner = previousOwner;
pool.dirty = true;
syncAsteroidInstancePool(pool, { camera: viewCamera, shadowCamera });

const visualFactorySource = readFileSync(new URL('../src/render/visualFactory.js', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const poolSource = readFileSync(new URL('../src/render/asteroidInstancePool.js', import.meta.url), 'utf8');
assert.match(visualFactorySource, /asteroidInstanceBody = mesh/);
assert.match(rendererSource, /syncAsteroidInstancePool\(this\._asteroidInstancePool,/);
assert.match(rendererSource, /isBorrowedAsteroidInstanceResource/);
for (const forbidden of ['renderScale', 'pixelRatioCap', 'particleQuality', 'bloomStrength']) {
  assert.equal(poolSource.includes(forbidden), false, `pool must not alter ${forbidden}`);
}

clearAsteroidInstancePool(pool);
assert.equal(leaves.every((leaf) => leaf.visible === true), true, 'clear restores exact source leaves');
assert.equal(pools.every((mesh) => mesh.count === 0 && mesh.visible === false), true);
disposeAsteroidInstancePool(pool);
assert.equal(scene.children.some((object) => object.userData && object.userData.asteroidInstancePool), false);
assert.equal(geometryDisposals, 0, 'pool disposal does not own shared source geometry');
assert.equal(materialDisposals, 0, 'pool disposal does not own shared source material');

console.log('asteroid-instance-structure: ok');
