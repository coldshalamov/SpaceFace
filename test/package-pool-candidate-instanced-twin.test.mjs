// D130 / frame-solid 2026-10-18T11-08-44-814Z: a parked render-package pool candidate stays
// a direct draw until a second same-key owner promotes it; the deferred chunk then linked
// the USE_INSTANCING variant in flight (both Yard Tug GLTFKit_InstancePool links differed
// from their nearest program only at cache-key index 51 — the instancing bit). The admission
// now mounts a count-0 instanced twin per parked (geometry, material) pair inside the same
// paced compile, so a later promotion is a program-cache hit.
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  mountPackagePoolCandidateInstancedTwins,
  prepareAuthoredVisualPipelines,
  settlePackagePoolCandidateInstancedTwins,
} from '../src/render/partsLibrary.js';

function geometryWith() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  return geometry;
}

function poolCandidate(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.spacefacePackagePoolCandidate = true;
  mesh.userData.spacefaceInstancePoolKey = `${geometry.uuid}:${material.uuid}`;
  return mesh;
}

test('mounts one count-0 instanced twin per unique parked (geometry, material) pair', () => {
  const geometry = geometryWith();
  const material = new THREE.MeshStandardMaterial({ name: 'SF_PoolTwinTest' });
  const root = new THREE.Group();
  root.add(poolCandidate(geometry, material));
  // A second mesh over the same pair shares the pool key — one twin covers both.
  root.add(poolCandidate(geometry, material));
  // Unmarked meshes are not poolable and must not produce twins.
  root.add(new THREE.Mesh(geometryWith(), new THREE.MeshStandardMaterial()));

  const holder = mountPackagePoolCandidateInstancedTwins(root);
  assert.ok(holder, 'a parked candidate produces a twin holder');
  assert.equal(root.children.includes(holder), true);
  assert.equal(holder.children.length, 1, 'same (geometry, material) pair dedupes');
  const twin = holder.children[0];
  assert.equal(twin.isInstancedMesh, true);
  assert.equal(twin.count, 0, 'the twin draws nothing');
  assert.equal(twin.visible, true);
  assert.equal(twin.frustumCulled, false);
  assert.equal(twin.geometry, geometry);
  assert.equal(twin.material, material, 'same shared material — the exact pool program key');

  settlePackagePoolCandidateInstancedTwins(root, holder);
  assert.equal(root.children.includes(holder), false, 'the holder detaches after compile');
});

test('skips promoted proxies and mounts nothing on a candidate-free root', () => {
  const geometry = geometryWith();
  const material = new THREE.MeshStandardMaterial();
  const promoted = poolCandidate(geometry, material);
  promoted.isMesh = false; // promoteRenderPackageMeshToPoolProxy suppresses direct submission
  delete promoted.userData.spacefacePackagePoolCandidate;
  const root = new THREE.Group();
  root.add(promoted);
  assert.equal(mountPackagePoolCandidateInstancedTwins(root), null);
  assert.equal(mountPackagePoolCandidateInstancedTwins(new THREE.Group()), null);
  assert.equal(mountPackagePoolCandidateInstancedTwins(null), null);
});

test('the twin rides the boundary admission compile and detaches when it settles', async () => {
  const geometry = geometryWith();
  const material = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  root.add(poolCandidate(geometry, material));

  let twinsSeenAtCompile = 0;
  const result = await prepareAuthoredVisualPipelines(root, {
    prepareAuthoredPipelines: (subject) => {
      subject.traverse((object) => {
        if (object.name === 'SF_PoolCandidate_InstanceTwin') {
          assert.equal(object.isInstancedMesh, true);
          assert.equal(object.count, 0);
          assert.equal(object.material, material);
          twinsSeenAtCompile += 1;
        }
      });
      return { skipped: false };
    },
  });
  assert.equal(twinsSeenAtCompile, 1, 'the instanced variant compiled inside this admission');
  assert.equal(result.skipped, false);
  root.traverse((object) => {
    assert.notEqual(object.name, 'SF_PoolCandidate_InstanceTwin',
      'twins must not survive into the presented boundary');
  });
});
