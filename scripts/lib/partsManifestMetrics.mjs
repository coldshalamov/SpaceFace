// Triangle accounting for parts-manifest rows.
//
// `parts_manifest.json` predates the multi-LOD library and its `tris` field has
// both aggregate and LOD0 meanings. Keep the historic aggregate default and
// require a row to opt into an explicit LOD metric.

const DEFAULT_TRIANGLE_METRIC = 'all';
const SUPPORTED_TRIANGLE_METRICS = new Set(['all', 'lod0']);
const DEFAULT_BOUNDS_METRIC = 'all';
const SUPPORTED_BOUNDS_METRICS = new Set(['all', 'lod0', 'variant']);

function normalizeLod(value) {
  const match = String(value || '').toLowerCase().match(/^lod([012])$/u);
  return match ? `lod${match[1]}` : null;
}

/**
 * Matches assetLoader's LOD precedence: a node-name convention supplies a default, while explicit
 * `spaceface.lod` / `spacefaceLod` metadata is the author-controlled runtime value.
 */
export function nodeLod(node) {
  const named = /^LOD([012])(?:_|$)/i.exec(node?.name || '');
  const extras = node?.extras || {};
  const explicit = extras?.spaceface?.lod || extras?.spacefaceLod;
  return normalizeLod(explicit) || (named ? `lod${named[1]}` : null);
}

/** Match assetLoader's hidden-helper predicate; metadata alone must not hide rendered geometry. */
function isRuntimeHiddenHelper(node) {
  const extras = node?.extras || {};
  const normalizedName = String(node?.name || '').toUpperCase().replace(/[\s-]+/g, '_');
  return normalizedName === 'COLLISION_HULL'
    || extras.nonRender === true
    || extras.spaceface?.nonRender === true;
}

function primitiveTriangles(gltf, primitive) {
  if ((primitive?.mode ?? 4) !== 4) return 0;
  const indexAccessor = gltf.accessors?.[primitive.indices];
  const positionAccessor = gltf.accessors?.[primitive.attributes?.POSITION];
  const count = indexAccessor?.count ?? positionAccessor?.count ?? 0;
  return Math.floor(count / 3);
}

/**
 * Count triangles by runtime LOD metadata (for example LOD0_Frame or `spacefaceLod: lod0`).
 * A mesh referenced more than once by the same LOD is counted once, matching
 * the manifest's mesh-level aggregate accounting while avoiding duplicate
 * node instances.
 */
export function collectLodTriangleCounts(gltf) {
  const lodTriangles = { lod0: 0, lod1: 0, lod2: 0 };
  const seen = new Set();

  for (const node of gltf?.nodes || []) {
    if (isRuntimeHiddenHelper(node)) continue;
    const lod = nodeLod(node);
    if (!lod || node?.mesh == null) continue;
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

export function resolveBoundsMetric(part) {
  const metric = part?.boundsMetric ?? DEFAULT_BOUNDS_METRIC;
  return { metric, supported: SUPPORTED_BOUNDS_METRICS.has(metric) };
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
