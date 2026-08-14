import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  materialBatchFingerprint,
  packageBatchPoolKeyFromMaterial,
} from '../src/render/materialBatchKey.js';

test('two cloned standard hull materials share a fingerprint without using uuid', () => {
  const a = new THREE.MeshStandardMaterial({
    color: 0x6a6f76,
    roughness: 0.45,
    metalness: 0.2,
  });
  const b = a.clone();
  assert.notEqual(a.uuid, b.uuid);
  assert.equal(materialBatchFingerprint(a), materialBatchFingerprint(b));
  assert.equal(packageBatchPoolKeyFromMaterial(a), packageBatchPoolKeyFromMaterial(b));
});

test('authored role keys win, and a different albedo does not collapse', () => {
  const a = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const b = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  a.userData.spacefaceMaterialRole = 'SF_Shared_HullPlate';
  b.userData.spacefaceMaterialRole = 'SF_Shared_HullPlate';
  assert.equal(materialBatchFingerprint(a), 'SF_Shared_HullPlate');
  assert.equal(materialBatchFingerprint(b), 'SF_Shared_HullPlate');

  const c = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const d = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.1 });
  assert.notEqual(materialBatchFingerprint(c), materialBatchFingerprint(d));
});
