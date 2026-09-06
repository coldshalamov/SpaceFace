import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectLodTriangleCounts,
  resolveTriangleMetric,
} from '../scripts/lib/partsManifestMetrics.mjs';

test('explicit lod0 rows measure tagged LOD0 while retaining aggregate total', () => {
  const gltf = {
    accessors: [
      { count: 6 },
      { count: 3 },
      { count: 3 },
    ],
    meshes: [
      { primitives: [{ indices: 0 }] },
      { primitives: [{ indices: 1 }] },
      { primitives: [{ indices: 2 }] },
    ],
    nodes: [
      { name: 'LOD0_Display_Frame_Coat', mesh: 0 },
      { name: 'LOD0_Display_Frame_Coat_duplicate', mesh: 0 },
      { name: 'LOD1_Display_Frame_Coat', mesh: 1 },
      { name: 'LOD2_Display_Frame_Coat', mesh: 2 },
    ],
  };

  const lodTriangles = collectLodTriangleCounts(gltf);
  assert.deepEqual(lodTriangles, { lod0: 2, lod1: 1, lod2: 1 });

  const lod0 = resolveTriangleMetric(
    { tris: 2, triangleMetric: 'lod0' },
    { triangles: 4, lodTriangles },
  );
  assert.equal(lod0.supported, true);
  assert.equal(lod0.measured, 2);
  assert.equal(lod0.total, 4);

  const legacy = resolveTriangleMetric({ tris: 4 }, { triangles: 4, lodTriangles });
  assert.equal(legacy.metric, 'all');
  assert.equal(legacy.measured, 4);
});

test('unknown triangle metric fails closed instead of silently changing convention', () => {
  const resolved = resolveTriangleMetric(
    { tris: 2, triangleMetric: 'lod1' },
    { triangles: 4, lodTriangles: { lod0: 2, lod1: 1, lod2: 1 } },
  );
  assert.equal(resolved.supported, false);
  assert.equal(resolved.measured, 4);
});
