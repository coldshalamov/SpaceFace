import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildStaticBatchGeometrySteps } from '../src/render/partsLibrary.js';
import { clearStaticBatchGeometryCacheForTests } from '../src/render/staticBatchGeometryCache.js';
import { collectUnresidentInstancedDrawables } from '../src/render/startupGpuResidency.js';
import {
  createPackageDetachManifest, detachPackageGeometry, rehydrateDetachedGeometries,
  resetPackageDetachManifestsForTests, retainPackageGeometryCpu,
} from '../src/render/packageCpuDetach.js';

function fixture() {
  resetPackageDetachManifestsForTests();
  clearStaticBatchGeometryCacheForTests();
  const geometry = new THREE.BoxGeometry(2, 4, 6);
  // Runtime preparation can install the illustrated alias before the detach manifest is built.
  // The raw verified donor decoder does not install that runtime-only shader alias.
  geometry.setAttribute('sfHullPosition', geometry.getAttribute('position'));
  createPackageDetachManifest({ contentHash: 'fixture.lane-beacon', resources: [geometry] }, {
    redecode: async () => new THREE.BoxGeometry(2, 4, 6), collectResources: donor => [donor],
  });
  return geometry;
}

test('GPU retirement preserves the position keep-set through a shader attribute alias', () => {
  const geometry = fixture();
  const position = geometry.attributes.position;
  const positions = [...position.array], index = [...geometry.index.array];
  assert.equal(detachPackageGeometry(geometry, {}), true);
  assert.equal(geometry.attributes.normal.array.length, 0, 'ordinary CPU retirement still works');
  assert.equal(geometry.attributes.sfHullPosition, position);
  assert.deepEqual([...position.array], positions, 'the alias cannot empty the kept position record');
  assert.deepEqual([...geometry.index.array], index);
});

test('registration moves an interleaved hull alias with its kept position record', () => {
  resetPackageDetachManifestsForTests();
  const geometry = new THREE.BufferGeometry();
  const data = new THREE.InterleavedBuffer(new Float32Array([
    0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1,
  ]), 6);
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));
  geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(data, 3, 3));
  geometry.setAttribute('sfHullPosition', geometry.attributes.position);
  createPackageDetachManifest({ contentHash: 'fixture.interleaved-layout', resources: [geometry] }, {
    redecode: async () => geometry, collectResources: donor => [donor],
  });
  detachPackageGeometry(geometry, {});
  assert.equal(data.array.length, 0, 'the obsolete shared buffer still retires');
  assert.equal(geometry.attributes.sfHullPosition, geometry.attributes.position);
  assert.deepEqual([...geometry.attributes.sfHullPosition.array], [0, 0, 0, 1, 0, 0, 0, 1, 0]);
});

test('a later stepped batch refills exact authored attributes under a bounded CPU read lease', async () => {
  const geometry = fixture();
  const positions = [...geometry.attributes.position.array];
  const normals = [...geometry.attributes.normal.array], uv = [...geometry.attributes.uv.array];
  detachPackageGeometry(geometry, {});
  const release = retainPackageGeometryCpu([geometry, geometry]);
  try {
    const refill = await rehydrateDetachedGeometries([geometry]);
    assert.deepEqual(refill.errors, []);
    assert.equal(refill.geometries, 1);
    assert.equal(detachPackageGeometry(geometry, {}), false, 'a residency pass cannot retire an active CPU read');
    const iterator = buildStaticBatchGeometrySteps({ tags: {}, urls: new Set(['lane-beacon.glb']), entries: [{
      record: { url: 'lane-beacon.glb' }, primitive: { name: 'LOD0_Warning', geometry, matrix: new THREE.Matrix4() },
      partMatrix: new THREE.Matrix4().makeTranslation(7, 3, -4),
    }] }, { preserveIndexedGeometry: true });
    let step = iterator.next(); while (!step.done) { await Promise.resolve(); step = iterator.next(); }
    const batch = step.value;
    assert.ok(batch.attributes.position.array.every(Number.isFinite));
    assert.deepEqual([...batch.attributes.position.array], positions.map((value, i) => value + [7, 3, -4][i % 3]));
    assert.deepEqual([...batch.attributes.normal.array], normals, 'authored normals survive the CPU handoff');
    assert.deepEqual([...batch.attributes.uv.array], uv, 'authored texture coordinates survive the CPU handoff');
    assert.deepEqual([...geometry.attributes.position.array], positions, 'source placement remains immutable');
    batch.dispose();
  } finally { release(); release(); }
  assert.equal(detachPackageGeometry(geometry, {}), true, 'retirement resumes when composition releases its lease');
});

test('refill invalidates the old upload stamp before a shared instance admission retries retirement', async () => {
  const geometry = fixture();
  geometry.userData.spacefaceGpuResident = true;
  detachPackageGeometry(geometry, {});
  await rehydrateDetachedGeometries([geometry]);
  const source = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 1);
  const pending = collectUnresidentInstancedDrawables([source]);
  assert.deepEqual(pending, [source], 'the new attribute versions require a real upload');
  assert.ok(geometry.attributes.normal.array.length > 0, 'stamp skip cannot empty refilled normals');
  assert.ok(geometry.attributes.uv.array.length > 0, 'stamp skip cannot empty refilled texture coordinates');
  source.material.dispose();
});
