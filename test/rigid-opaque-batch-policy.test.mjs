import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  canBatchRenderPackageOwner,
  countBatchableOpaqueSurfaces,
  isRigidOpaqueBatchableSurface,
} from '../src/render/rigidOpaqueBatchPolicy.js';

function mesh(overrides = {}, tags = {}) {
  const geometry = overrides.geometry || new THREE.BoxGeometry(1, 1, 1);
  const material = overrides.material || new THREE.MeshStandardMaterial({ color: 0x808080 });
  const object = new THREE.Mesh(geometry, material);
  object.userData.spacefaceTags = tags;
  Object.assign(object, overrides);
  return object;
}

test('ships stations and places may enter the rigid opaque package pool', () => {
  assert.equal(canBatchRenderPackageOwner('ship'), true);
  assert.equal(canBatchRenderPackageOwner('station'), true);
  assert.equal(canBatchRenderPackageOwner('place'), true);
  assert.equal(canBatchRenderPackageOwner('asteroid'), false);
  assert.equal(canBatchRenderPackageOwner('fx'), false);
});

test('rigid opaque hulls batch; canopies plumes and damage stay out', () => {
  const hull = mesh();
  assert.equal(isRigidOpaqueBatchableSurface(hull, {}), true);

  const canopy = mesh({
    material: new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.4, transmission: 0.8 }),
  }, { canopy: true });
  assert.equal(isRigidOpaqueBatchableSurface(canopy, { canopy: true }), false);

  const plume = mesh({
    material: new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending }),
  }, { plume: true });
  assert.equal(isRigidOpaqueBatchableSurface(plume, { plume: true }), false);

  const damaged = mesh({}, { damageRole: 'scorch' });
  assert.equal(isRigidOpaqueBatchableSurface(damaged, { damageRole: 'scorch' }), false);
});

test('a mixed ship group reports only the opaque rigid subset', () => {
  const root = new THREE.Group();
  root.add(mesh());
  root.add(mesh({
    material: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }),
  }, { canopy: true }));
  const counts = countBatchableOpaqueSurfaces(root);
  assert.equal(counts.total, 2);
  assert.equal(counts.batchable, 1);
});
