import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  mountPackagePoolCandidateInstancedTwins,
  prepareAuthoredVisualPipelines,
  settlePackagePoolCandidateInstancedTwins,
} from '../src/render/partsLibrary.js';

function fixture() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const direct = new THREE.Mesh(geometry, material);
  direct.userData.spacefacePackagePoolCandidate = true;
  const pooled = new THREE.InstancedMesh(geometry, material, 4);
  pooled.userData.spacefacePackageAdmissionPending = true;
  root.add(direct, pooled);
  const disposed = { geometry: 0, material: 0 };
  geometry.addEventListener('dispose', () => disposed.geometry++);
  material.addEventListener('dispose', () => disposed.material++);
  return { root, geometry, material, direct, pooled, disposed };
}

test('admission compiles both program variants and retires only its own instance buffers once', () => {
  const f = fixture();
  const holder = mountPackagePoolCandidateInstancedTwins(f.root);
  assert.equal(holder.children.length, 2);
  const instanced = holder.children.find((child) => child.isInstancedMesh);
  const plain = holder.children.find((child) => !child.isInstancedMesh);
  assert.ok(instanced && plain);
  assert.equal(plain.geometry, f.geometry);
  assert.equal(plain.material, f.material);
  let instanceDisposals = 0;
  instanced.addEventListener('dispose', () => instanceDisposals++);
  settlePackagePoolCandidateInstancedTwins(f.root, holder);
  settlePackagePoolCandidateInstancedTwins(f.root, holder);
  assert.equal(instanceDisposals, 1);
  assert.equal(holder.children.length, 0, 'retired holder retains no geometry/material owners');
  assert.deepEqual(f.root.children, [f.direct, f.pooled]);
  assert.deepEqual(f.disposed, { geometry: 0, material: 0 });
});

for (const rejects of [false, true]) {
  test(`temporary warm variants leave the live scene after ${rejects ? 'failed' : 'successful'} admission`, async () => {
    const f = fixture();
    for (let turn = 0; turn < 3; turn++) {
      let seen = 0;
      const operation = prepareAuthoredVisualPipelines(f.root, {
        prepareAuthoredPipelines(subject) {
          const holder = subject.getObjectByName('SF_PoolCandidateTwinHolder');
          assert.ok(holder);
          seen = holder.children.length;
          if (rejects) throw new Error('driver unavailable');
          return { skipped: false };
        },
      });
      if (rejects) await assert.rejects(operation, /driver unavailable/);
      else await operation;
      assert.equal(seen, 2);
      assert.deepEqual(f.root.children, [f.direct, f.pooled]);
      assert.equal(f.pooled.children.length, 0, 'pool has no permanent plain-program draw witness');
      assert.deepEqual(f.disposed, { geometry: 0, material: 0 });
    }
  });
}
