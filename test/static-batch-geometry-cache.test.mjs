import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry } from 'three';

import {
  clearStaticBatchGeometryCacheForTests,
  ensureStaticBatchGeometryBounds,
  rememberStaticBatchGeometry,
  staticBatchGeometryCacheKey,
  staticBatchGeometryCacheSize,
  takeCachedStaticBatchGeometry,
} from '../src/render/staticBatchGeometryCache.js';

test('same urls and part matrices share one immutable marked geometry', () => {
  clearStaticBatchGeometryCacheForTests();
  const matrix = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
  const bucket = {
    urls: new Set(['a.glb', 'b.glb']),
    tags: { lod: 'lod1' },
    entries: [
      { primitive: { name: 'hull' }, partMatrix: matrix },
    ],
  };
  const key = staticBatchGeometryCacheKey(bucket);
  assert.equal(key, staticBatchGeometryCacheKey(bucket));
  const geometry = new BoxGeometry(2, 3, 4);
  const positions = [...geometry.attributes.position.array];
  rememberStaticBatchGeometry(key, geometry);
  assert.equal(staticBatchGeometryCacheSize(), 1);
  const taken = takeCachedStaticBatchGeometry(key);
  assert.equal(taken, geometry);
  assert.equal(takeCachedStaticBatchGeometry(key), taken, 'repeat consumers reuse the same upload');
  assert.equal(taken.userData.spacefaceSharedAsset, true, 'entity teardown must not dispose the cache owner');
  assert.deepEqual([...taken.attributes.position.array], positions);
  assert.equal(takeCachedStaticBatchGeometry('missing'), null);
  clearStaticBatchGeometryCacheForTests();
  geometry.dispose();
});

test('shared batch bounds are recomputed once, including when source bounds exist', () => {
  clearStaticBatchGeometryCacheForTests();
  const geometry = new BoxGeometry(2, 3, 4);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  geometry.boundingSphere.radius = 999;
  geometry.boundingBox.max.x = 999;
  let sphereCalls = 0;
  let boxCalls = 0;
  const sphere = geometry.computeBoundingSphere.bind(geometry);
  const box = geometry.computeBoundingBox.bind(geometry);
  geometry.computeBoundingSphere = () => { sphereCalls++; sphere(); };
  geometry.computeBoundingBox = () => { boxCalls++; box(); };
  rememberStaticBatchGeometry('bounds', geometry);
  ensureStaticBatchGeometryBounds(geometry);
  assert.notEqual(geometry.boundingSphere.radius, 999);
  assert.equal(geometry.boundingBox.max.x, 1);
  ensureStaticBatchGeometryBounds(takeCachedStaticBatchGeometry('bounds'));
  assert.equal(sphereCalls, 1);
  assert.equal(boxCalls, 1);
  clearStaticBatchGeometryCacheForTests();
});
