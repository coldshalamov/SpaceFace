import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import {
  geometryBatchIdentity,
  instancePoolIdentity,
  materialBatchFingerprint,
  materialBatchProgramKey,
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
  assert.equal(materialBatchProgramKey(c), materialBatchProgramKey(c.clone()));
  const red = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.45, metalness: 0.2 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2244ff, roughness: 0.45, metalness: 0.2 });
  assert.equal(materialBatchProgramKey(red), materialBatchProgramKey(blue));
  assert.notEqual(materialBatchFingerprint(red), materialBatchFingerprint(blue));

  const image = { width: 64, height: 64, uuid: 'shared-ktx2' };
  const texA = new THREE.Texture(image);
  const texB = new THREE.Texture(image);
  const mappedA = new THREE.MeshStandardMaterial({ map: texA, color: 0xff0000 });
  const mappedB = new THREE.MeshStandardMaterial({ map: texB, color: 0x00ff00 });
  assert.notEqual(texA.uuid, texB.uuid);
  assert.equal(materialBatchProgramKey(mappedA), materialBatchProgramKey(mappedB));
  assert.equal(materialBatchProgramKey(mappedA).includes(texA.uuid), false);
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
  assert.match(source, /deferNewChunkPublication = [^;\n]*liveSectorGpuAdmission/);
});

// NXI-232: the batch key is a semantic identity — a re-issued material after context restore
// keys identically instead of multiplying an equivalent variant, and the batch keeps the
// authored program binding (customProgramCacheKey/onBeforeCompile) rather than a stale or
// duplicated compile.
test('a re-issued material after context restore keeps one semantic key and program binding', async () => {
  const original = new THREE.MeshStandardMaterial({ color: 0x6a6f76, roughness: 0.45, metalness: 0.2 });
  const reissued = new THREE.MeshStandardMaterial({ color: 0x6a6f76, roughness: 0.45, metalness: 0.2 });
  assert.notEqual(original.uuid, reissued.uuid);
  assert.equal(materialBatchFingerprint(original), materialBatchFingerprint(reissued));
  assert.equal(materialBatchProgramKey(original), materialBatchProgramKey(reissued));
  // Context churn bumps material.version on re-upload — the key must not read it.
  original.version += 1;
  assert.equal(materialBatchProgramKey(original), materialBatchProgramKey(reissued),
    'a GL-side re-upload must not spawn a second material variant');

  const batchSrc = await readFile(new URL('../src/render/opaqueMaterialBatch.js', import.meta.url), 'utf8');
  assert.match(batchSrc, /batchMaterial\.onBeforeCompile = material\.onBeforeCompile/,
    'a cloned batch material keeps the authored shader patch');
  assert.match(batchSrc, /batchMaterial\.customProgramCacheKey = material\.customProgramCacheKey/,
    'a cloned batch material keeps the authored program binding');
});
