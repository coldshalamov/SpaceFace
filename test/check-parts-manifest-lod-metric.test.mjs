import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  collectLodTriangleCounts,
  resolveBoundsMetric,
  resolveTriangleMetric,
} from '../scripts/lib/partsManifestMetrics.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function glbJson(relative) {
  const payload = readFileSync(resolve(ROOT, relative));
  assert.equal(payload.toString('ascii', 0, 4), 'glTF');
  const length = payload.readUInt32LE(12);
  return JSON.parse(payload.subarray(20, 20 + length).toString('utf8'));
}

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

test('Works rover honors explicit LOD tags and the inclusion kit declares per-variant bounds', () => {
  const rover = glbJson('assets/ships/parts/works/place_works_rover.glb');
  const kit = glbJson('assets/ships/parts/works/place_works_inclusion_kit.glb');

  // Rover's LOD0 state surfaces intentionally keep canonical unprefixed names for the runtime
  // hook map, so node metadata — not a name-only scanner — determines their active register.
  assert.deepEqual(collectLodTriangleCounts(rover), { lod0: 17438, lod1: 3002, lod2: 0 });
  assert.equal(resolveTriangleMetric({ triangleMetric: 'lod0' }, {
    triangles: 20440,
    lodTriangles: collectLodTriangleCounts(rover),
  }).measured, 17438);

  assert.deepEqual(collectLodTriangleCounts(kit), { lod0: 24028, lod1: 6444, lod2: 0 });
  assert.deepEqual(resolveBoundsMetric({ boundsMetric: 'variant' }), {
    metric: 'variant', supported: true,
  });
});
