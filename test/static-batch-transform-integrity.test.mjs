import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildStaticBatchGeometrySteps } from '../src/render/partsLibrary.js';
import { clearStaticBatchGeometryCacheForTests } from '../src/render/staticBatchGeometryCache.js';
import {
  createPackageDetachManifest, detachPackageGeometry, rehydrateDetachedGeometries,
  resetPackageDetachManifestsForTests, retainPackageGeometryCpu,
} from '../src/render/packageCpuDetach.js';

function fixture() {
  resetPackageDetachManifestsForTests();
  clearStaticBatchGeometryCacheForTests();
  const geometry = new THREE.BoxGeometry(2, 4, 6);
  createPackageDetachManifest({ contentHash: 'fixture.lane-beacon', resources: [geometry] }, {
    redecode: async () => new THREE.BoxGeometry(2, 4, 6), collectResources: donor => [donor],
  });
  // The illustrated hull alias arrives after manifest registration, as on the live beacon.
  geometry.setAttribute('sfHullPosition', geometry.getAttribute('position'));
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
