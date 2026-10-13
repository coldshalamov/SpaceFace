import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry } from 'three';

import {
  clearStaticBatchGeometryCacheForTests,
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
