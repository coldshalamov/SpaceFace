import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import {
  geometryBatchIdentity,
  instancePoolIdentity,
  materialBatchFingerprint,
  packageBatchPoolKeyFromMaterial,
  stampGeometryBatchKey,
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

test('cloned hull geometries share a pool key after they are stamped', () => {
  const geoA = new THREE.BoxGeometry(1, 1, 1);
  const geoB = geoA.clone();
  const mat = new THREE.MeshStandardMaterial({ color: 0x808080 });
  mat.userData.spacefaceBatchKey = 'hull-shared';
  assert.notEqual(geoA.uuid, geoB.uuid);
  assert.notEqual(instancePoolIdentity(geoA, mat), instancePoolIdentity(geoB, mat));
  stampGeometryBatchKey(geoA, 'wasp.glb|hull');
  stampGeometryBatchKey(geoB, 'wasp.glb|hull');
  assert.equal(geometryBatchIdentity(geoA), 'wasp.glb|hull');
  assert.equal(instancePoolIdentity(geoA, mat), instancePoolIdentity(geoB, mat));
});

test('live instance pools use stamped geometry identity, not clone uuid', async () => {
  const source = await readFile(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(source, /instancePoolIdentity\(geometry,\s*material\)/);
  assert.match(source, /stampGeometryBatchKey\(object\.geometry/);
  assert.match(source, /deferNewChunkPublication = !live \|\| live\.mode === 'loading'/);
});
