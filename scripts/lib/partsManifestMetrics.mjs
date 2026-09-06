// Triangle accounting for parts-manifest rows.
//
// `parts_manifest.json` predates the multi-LOD library and its `tris` field has
// both aggregate and LOD0 meanings. Keep the historic aggregate default and
// require a row to opt into an explicit LOD metric.

const DEFAULT_TRIANGLE_METRIC = 'all';
const SUPPORTED_TRIANGLE_METRICS = new Set(['all', 'lod0']);

function primitiveTriangles(gltf, primitive) {
  if ((primitive?.mode ?? 4) !== 4) return 0;
  const indexAccessor = gltf.accessors?.[primitive.indices];
  const positionAccessor = gltf.accessors?.[primitive.attributes?.POSITION];
  const count = indexAccessor?.count ?? positionAccessor?.count ?? 0;
  return Math.floor(count / 3);
}

/**
 * Count triangles by the LOD encoded in node names (for example LOD0_Frame).
 * A mesh referenced more than once by the same LOD is counted once, matching
 * the manifest's mesh-level aggregate accounting while avoiding duplicate
 * node instances.
 */
export function collectLodTriangleCounts(gltf) {
  const lodTriangles = { lod0: 0, lod1: 0, lod2: 0 };
  const seen = new Set();

  for (const node of gltf?.nodes || []) {
    const match = /^LOD([012])(?:_|$)/i.exec(node?.name || '');
    if (!match || node?.mesh == null) continue;
    const lod = `lod${match[1]}`;
    const key = `${lod}:${node.mesh}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const mesh = gltf.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives || []) {
      lodTriangles[lod] += primitiveTriangles(gltf, primitive);
    }
  }

  return lodTriangles;
}

/**
 * Resolve the manifest row's triangle convention without changing legacy
 * rows. Callers can report `total` alongside an explicit LOD0 measurement.
 */
export function resolveTriangleMetric(part, metrics) {
  const metric = part?.triangleMetric ?? DEFAULT_TRIANGLE_METRIC;
  const supported = SUPPORTED_TRIANGLE_METRICS.has(metric);
  const total = Number.isFinite(metrics?.triangles) ? metrics.triangles : 0;
  const lod0 = Number.isFinite(metrics?.lodTriangles?.lod0)
    ? metrics.lodTriangles.lod0
    : 0;

  return {
    metric,
    supported,
    measured: metric === 'lod0' ? lod0 : total,
    total,
    lod0,
  };
}
