import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createDynamicBufferCoordinator,
  disposeDynamicBufferCoordinator,
  registerDynamicBufferOwner,
  releaseDynamicBufferOwner,
} from '../src/render/dynamicBufferRanges.js';
import {
  createAsteroidInstancePool,
  disposeAsteroidInstancePool,
  registerAsteroidBaseLeaf,
  syncAsteroidInstancePool,
} from '../src/render/asteroidInstancePool.js';

function createAsteroidFixture(scene, id = 1) {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial();
  const root = new THREE.Group();
  const leaf = new THREE.Mesh(geometry, material);
  leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
  leaf.userData.asteroidInstanceVariant = 0;
  root.userData.asteroidInstanceBody = leaf;
  root.add(leaf);
  scene.add(root);
  return { entity: { id, type: 'asteroid' }, geometry, material, root, leaf };
}

function createDynamicOwnerFixture(scene) {
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(16), 4);
  geometry.setAttribute('fixture', attribute);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 4);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const owner = registerDynamicBufferOwner(scene, {
    id: 'disposal-fixture',
    mesh,
    attributes: [{ name: 'fixture', attribute }],
  });
  return { attribute, geometry, material, mesh, owner };
}

test('dynamic owner release is exact-once, clears callbacks, and coordinator disposal permits recreation', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const fixture = createDynamicOwnerFixture(scene);
  let attributeDisposals = 0;
  fixture.attribute.addEventListener('dispose', () => { attributeDisposals += 1; });

  assert.ok(fixture.owner);
  assert.equal(typeof fixture.attribute.onUploadCallback, 'function');
  assert.equal(releaseDynamicBufferOwner(fixture.owner), true);
  assert.equal(releaseDynamicBufferOwner(fixture.owner), false);
  assert.equal(Object.hasOwn(fixture.attribute, 'onUploadCallback'), false);
  assert.equal(fixture.owner.bindings.length, 0);
  assert.equal(fixture.owner.mesh, null);
  assert.equal(fixture.owner.disposed, true);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 0);
  assert.equal(attributeDisposals, 0, 'owner release does not dispose an attribute it does not own');

  assert.equal(disposeDynamicBufferCoordinator(coordinator), true);
  assert.equal(coordinator.dispose(), false);
  const recreated = createDynamicBufferCoordinator(scene);
  assert.notEqual(recreated, coordinator, 'disposed scene coordinator must not be reused');
  assert.equal(disposeDynamicBufferCoordinator(recreated), true);

  fixture.geometry.dispose();
  fixture.material.dispose();
  fixture.mesh.dispose();
});

test('asteroid pool disposes only pool-created resources and recreates without stale handles', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const pool = createAsteroidInstancePool(scene);
  const fixture = createAsteroidFixture(scene);
  assert.equal(registerAsteroidBaseLeaf(pool, fixture.entity, fixture.root), true);
  const bucket = pool.variants[0];
  const oldMesh = bucket.mesh;
  const oldAttribute = oldMesh.instanceMatrix;
  let meshDisposals = 0;
  let attributeDisposals = 0;
  let geometryDisposals = 0;
  let materialDisposals = 0;
  oldMesh.addEventListener('dispose', () => { meshDisposals += 1; });
  oldAttribute.addEventListener('dispose', () => { attributeDisposals += 1; });
  fixture.geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
  fixture.material.addEventListener('dispose', () => { materialDisposals += 1; });

  assert.equal(typeof pool.dispose, 'function');
  assert.equal(pool.dispose(), true);
  assert.equal(pool.dispose(), false);
  assert.equal(meshDisposals, 1);
  assert.equal(attributeDisposals, 1);
  assert.equal(geometryDisposals, 0, 'borrowed source geometry remains source-owned');
  assert.equal(materialDisposals, 0, 'borrowed source material remains source-owned');
  assert.equal(oldMesh.parent, null);
  assert.equal(Object.hasOwn(oldAttribute, 'onUploadCallback'), false);
  assert.equal(fixture.leaf.visible, true);
  assert.equal(fixture.leaf.userData.asteroidInstanceAdopted, false);
  assert.equal(pool.byEntity.size, 0);
  assert.equal(pool.variants.every((entry) => (
    entry.mesh === null
      && entry.dynamicBufferOwner === null
      && entry.geometry === null
      && entry.material === null
      && entry.records.length === 0
      && entry.entityIds.length === 0
  )), true);
  assert.equal(syncAsteroidInstancePool(pool), null, 'disposed pool cannot reuse stale arrays or handles');
  assert.equal(registerAsteroidBaseLeaf(pool, fixture.entity, fixture.root), false);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 0);

  const recreated = createAsteroidInstancePool(scene);
  assert.equal(registerAsteroidBaseLeaf(recreated, fixture.entity, fixture.root), true);
  const newMesh = recreated.variants[0].mesh;
  assert.notEqual(newMesh, oldMesh, 'recreated pool allocates a fresh instance mesh');
  assert.equal(newMesh.instanceMatrix, recreated.variants[0].dynamicBufferOwner.bindings[0].attribute);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 1);
  assert.equal(disposeAsteroidInstancePool(recreated), true);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 0);
  assert.equal(disposeDynamicBufferCoordinator(coordinator), true);

  fixture.geometry.dispose();
  fixture.material.dispose();
  fixture.root.remove(fixture.leaf);
});

test('asteroid pool does not detach a mesh after ownership moves to another parent', () => {
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);
  const fixture = createAsteroidFixture(scene);
  assert.equal(registerAsteroidBaseLeaf(pool, fixture.entity, fixture.root), true);
  const foreignParent = new THREE.Group();
  scene.add(foreignParent);
  foreignParent.add(pool.variants[0].mesh);

  assert.equal(disposeAsteroidInstancePool(pool), true);
  assert.equal(foreignParent.children.length, 1, 'pool only detaches roots still parented by its scene');
  assert.equal(foreignParent.children[0].parent, foreignParent);

  foreignParent.remove(foreignParent.children[0]);
  fixture.geometry.dispose();
  fixture.material.dispose();
});
