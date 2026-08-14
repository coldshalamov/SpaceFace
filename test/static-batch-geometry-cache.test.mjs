import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearStaticBatchGeometryCacheForTests,
  rememberStaticBatchGeometry,
  staticBatchGeometryCacheKey,
  staticBatchGeometryCacheSize,
  takeCachedStaticBatchGeometry,
} from '../src/render/staticBatchGeometryCache.js';

test('same urls and part matrices share a cloneable merged geometry', () => {
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
  rememberStaticBatchGeometry(key, { clone() { return { shared: true }; } });
  assert.equal(staticBatchGeometryCacheSize(), 1);
  const taken = takeCachedStaticBatchGeometry(key);
  assert.deepEqual(taken, { shared: true });
  assert.equal(takeCachedStaticBatchGeometry('missing'), null);
});
