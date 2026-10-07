/** CPU source-surface measurements for canonical Brood anatomy.
 *
 * Input triangles are rendered (nonRender already excluded), transformed into
 * source-origin WU exactly once: { lod, points: [{x,y,z}, {x,y,z}, {x,y,z}] }.
 * Boundary distance is to the union of actual projected TRIANGLES, never the
 * nearest vertex or a radial hull. Native-boundary sampling is finite: at least
 * 96 arc segments, with straight/curved sample spacing <=0.15 WU. This is geometric
 * source evidence, not GPU performance, art acceptance or live-route proof.
 * Full render-to-native containment remains a separate source-test obligation;
 * this helper measures reverse outline coverage and the declared clear volumes.
 */
import { normalizeConvexProxyVertices, convexProxyDistance } from '../../src/core/convexProxyGeometry.js';

const EPS = 2e-5;
const ARC_STEPS = 96;
const MAX_STEP = .15;
const cross2 = (a, b, p) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}
function positive(value, label) {
  finite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be positive`);
  return value;
}
function segmentDistance(p, a, b) {
  const x = b.x - a.x, z = b.z - a.z, length2 = x * x + z * z;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / length2)) : 0;
  return Math.hypot(p.x - a.x - x * t, p.z - a.z - z * t);
}
function nativeDistance(point, p) {
  if (p.kind === 'convex') return convexProxyDistance(point, p.vertices);
  if (p.kind === 'capsule') return segmentDistance(point, { x: p.ax, z: p.az }, { x: p.bx, z: p.bz }) - p.r;
  const c = Math.cos(-p.rot), s = Math.sin(-p.rot);
  const dx = point.x - p.x, dz = point.z - p.z;
  const x = Math.abs(c * dx - s * dz) - p.hx, z = Math.abs(s * dx + c * dz) - p.hz;
  return Math.hypot(Math.max(x, 0), Math.max(z, 0)) + Math.min(Math.max(x, z), 0);
}

/** Exact Euclidean distance in canonical XZ from a point to a real projected face. */
export function projectedPointToTriangleDistance(point, points) {
  const [a, b, c] = points;
  if (Math.abs(cross2(a, b, c)) > 1e-12) {
    const sides = [cross2(a, b, point), cross2(b, c, point), cross2(c, a, point)];
    if (sides.every(v => v >= -1e-10) || sides.every(v => v <= 1e-10)) return 0;
  }
  return Math.min(segmentDistance(point, a, b), segmentDistance(point, b, c), segmentDistance(point, c, a));
}

function boundarySamples(p) {
  const samples = [];
  const line = (a, b) => {
    const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / MAX_STEP));
    for (let i = 0; i < count; i++) samples.push(lerp(a, b, i / count));
  };
  if (p.kind === 'convex') {
    const corners = p.vertices.map(([x,z]) => ({x,z}));
    for (let i = 0; i < corners.length; i++) line(corners[i], corners[(i + 1) % corners.length]);
    return samples;
  }
  if (p.kind === 'obb') {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => ({
      x: p.x + c * x * p.hx - s * z * p.hz,
      z: p.z + s * x * p.hx + c * z * p.hz,
    }));
    for (let i = 0; i < corners.length; i++) line(corners[i], corners[(i + 1) % corners.length]);
    return samples;
  }
  const angle = Math.atan2(p.bz - p.az, p.bx - p.ax);
  const arc = (x, z, start) => {
    const count = Math.max(ARC_STEPS / 2, Math.ceil(Math.PI * p.r / MAX_STEP));
    for (let i = 0; i <= count; i++) {
      const t = start + Math.PI * i / count;
      samples.push({ x: x + p.r * Math.cos(t), z: z + p.r * Math.sin(t) });
    }
  };
  arc(p.bx, p.bz, angle - Math.PI / 2);
  arc(p.ax, p.az, angle + Math.PI / 2);
  for (const sign of [-1, 1]) {
    const x = Math.cos(angle + sign * Math.PI / 2) * p.r, z = Math.sin(angle + sign * Math.PI / 2) * p.r;
    line({ x: p.ax + x, z: p.az + z }, { x: p.bx + x, z: p.bz + z });
  }
  return samples;
}

// Clip a real 3D triangle by all six planes of the clear box. Its vertices may
// all be outside while an edge or its interior crosses the box. Vertical faces
// remain measurable rather than vanishing into a zero-area XZ projection.
function clipTriangleToClearVolume(points, volume) {
  let polygon = points;
  for (let axis = 0; axis < 3; axis++) for (const side of [-1, 1]) {
    const key = ['x', 'y', 'z'][axis];
    const bound = side < 0 ? volume.min[axis] + EPS : volume.max[axis] - EPS;
    const distance = p => side < 0 ? p[key] - bound : bound - p[key];
    const next = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b);
      if (da >= 0) next.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    polygon = next;
    if (!polygon.length) return [];
  }
  return polygon;
}
function polygonArea3(polygon) {
  if (polygon.length < 3) return 0;
  const a = polygon[0];
  let x = 0, y = 0, z = 0;
  for (let i = 1; i + 1 < polygon.length; i++) {
    const b = polygon[i], c = polygon[i + 1];
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    x += u.y * v.z - u.z * v.y; y += u.z * v.x - u.x * v.z; z += u.x * v.y - u.y * v.x;
  }
  return Math.hypot(x, y, z) / 2;
}

/**
 * Return {ok, byLod, perPrimitive, clearVolumes, coverage, violations}.
 *
 * Per-primitive byLod rows carry maxDistanceWU, witness:{x,z}, sampleCount,
 * allowedWU and overTolerance. A fully occluded primitive has no exposed
 * boundary and contributes no artificial interior witness. Missing requested
 * LODs fail closed and report null (not an unserializable Infinity) distance.
 * Malformed inputs throw rather than silently emitting a passing certificate.
 */
export function measureBroodSurface(body, triangles, { expectedLods = [0, 1, 2] } = {}) {
  if (!Array.isArray(expectedLods) || !expectedLods.length || new Set(expectedLods).size !== expectedLods.length
    || expectedLods.some(lod => ![0, 1, 2].includes(lod))) throw new TypeError('expectedLods must contain distinct LOD0/1/2 levels');
  if (!body?.collision || !Array.isArray(body.collision.primitives) || !body.collision.primitives.length) throw new TypeError('body needs canonical native collision primitives');
  if (body.collision.primitives.length > 32) throw new RangeError('Brood surface geometry requires 1..32 authored pieces');
  if (!Array.isArray(triangles)) throw new TypeError('triangles must be an array');
  positive(body.collision.outlineErrorMaxWU, 'collision.outlineErrorMaxWU');
  const primitives = body.collision.primitives.map(p => {
    if (!p || !['capsule', 'obb', 'convex'].includes(p.kind) || typeof p.id !== 'string' || !p.id) throw new TypeError('native primitive needs id and capsule/obb/convex kind');
    const result = { ...p };
    if (p.kind === 'convex') result.vertices = normalizeConvexProxyVertices(p.vertices);
    else {
      for (const key of p.kind === 'capsule' ? ['ax', 'az', 'bx', 'bz', 'r'] : ['x', 'z', 'hx', 'hz', 'rot']) finite(p[key], `${p.id}.${key}`);
      for (const key of p.kind === 'capsule' ? ['r'] : ['hx', 'hz']) positive(p[key], `${p.id}.${key}`);
    }
    if (p.surfaceSlackWU !== undefined) positive(p.surfaceSlackWU, `${p.id}.surfaceSlackWU`);
    return result;
  });
  if (new Set(primitives.map(p => p.id)).size !== primitives.length) throw new TypeError('native primitive ids must be unique');
  const volumes = body.clearVolumes || [];
  if (!Array.isArray(volumes)) throw new TypeError('clearVolumes must be an array');
  for (const volume of volumes) {
    if (!volume?.id || !Array.isArray(volume.min) || !Array.isArray(volume.max) || volume.min.length !== 3 || volume.max.length !== 3) throw new TypeError('clear volume needs id and three-component min/max');
    for (let i = 0; i < 3; i++) {
      finite(volume.min[i], `${volume.id}.min`); finite(volume.max[i], `${volume.id}.max`);
      if (volume.max[i] - volume.min[i] <= 2 * EPS) throw new RangeError('clear volume must have positive interior');
    }
  }
  const byLodTriangles = new Map(expectedLods.map(lod => [lod, []]));
  triangles.forEach((triangle, index) => {
    if (![0, 1, 2].includes(triangle?.lod) || !Array.isArray(triangle.points) || triangle.points.length !== 3) throw new TypeError(`triangle ${index} needs lod and three points`);
    for (const p of triangle.points) for (const axis of ['x', 'y', 'z']) finite(p?.[axis], `triangle ${index}.${axis}`);
    byLodTriangles.get(triangle.lod)?.push({ ...triangle, index,
      minX: Math.min(...triangle.points.map(p => p.x)), maxX: Math.max(...triangle.points.map(p => p.x)),
      minZ: Math.min(...triangle.points.map(p => p.z)), maxZ: Math.max(...triangle.points.map(p => p.z)),
    });
  });
  const byLod = expectedLods.map(lod => ({ lod, triangleCount: byLodTriangles.get(lod).length, hasGeometry: byLodTriangles.get(lod).length > 0 }));
  const violations = byLod.filter(row => !row.hasGeometry).map(({ lod }) => ({ kind: 'missing-lod', lod }));
  const perPrimitive = primitives.map((primitive, i) => {
    const allowedWU = primitive.surfaceSlackWU ?? body.collision.outlineErrorMaxWU;
    const exposed = boundarySamples(primitive).filter(point => !primitives.some((other, j) => j !== i && nativeDistance(point, other) < -EPS));
    const rows = expectedLods.map(lod => {
      const faces = byLodTriangles.get(lod);
      if (!faces.length) return { lod, allowedWU, maxDistanceWU: null, witness: exposed[0] || null, sampleCount: exposed.length, overTolerance: true, hasGeometry: false };
      let maxDistanceWU = 0, witness = null;
      for (const point of exposed) {
        let nearest = Infinity;
        for (const face of faces) {
          const aabbDistance = Math.hypot(Math.max(face.minX - point.x, point.x - face.maxX, 0), Math.max(face.minZ - point.z, point.z - face.maxZ, 0));
          if (aabbDistance > nearest) continue;
          nearest = Math.min(nearest, projectedPointToTriangleDistance(point, face.points));
          if (nearest <= 1e-10) break;
        }
        if (nearest > maxDistanceWU) { maxDistanceWU = nearest; witness = { ...point }; }
      }
      const overTolerance = maxDistanceWU > allowedWU + EPS;
      if (overTolerance) violations.push({ kind: 'outline-slack', primitiveId: primitive.id, lod, allowedWU, maxDistanceWU, witness });
      return { lod, allowedWU, maxDistanceWU, witness, sampleCount: exposed.length, overTolerance, hasGeometry: true };
    });
    return { id: primitive.id, allowedWU, exposedSampleCount: exposed.length, byLod: rows };
  });
  const clearVolumes = volumes.map(volume => ({ id: volume.id, byLod: expectedLods.map(lod => {
    let intersectingTriangleCount = 0, maxIntersectionAreaWU2 = 0, witness = null;
    for (const triangle of byLodTriangles.get(lod)) {
      const polygon = clipTriangleToClearVolume(triangle.points, volume);
      if (!polygon.length) continue;
      intersectingTriangleCount++;
      const intersectionAreaWU2 = polygonArea3(polygon);
      if (!witness || intersectionAreaWU2 > maxIntersectionAreaWU2) {
        witness = { triangleIndex: triangle.index, point: polygon[0] };
        maxIntersectionAreaWU2 = intersectionAreaWU2;
      }
    }
    if (intersectingTriangleCount) violations.push({ kind: 'clear-volume-intersection', volumeId: volume.id, lod, intersectingTriangleCount, maxIntersectionAreaWU2, witness });
    return { lod, intersectingTriangleCount, maxIntersectionAreaWU2, witness };
  }) }));
  return {
    ok: violations.length === 0, byLod, perPrimitive, clearVolumes,
    coverage: { expectedLods: [...expectedLods], missingLods: byLod.filter(row => !row.hasGeometry).map(row => row.lod),
      exposedBoundarySamples: perPrimitive.reduce((n, p) => n + p.exposedSampleCount, 0) },
    method: { domain: 'source-origin-WU-XZ', distance: 'exposed-native-boundary-to-projected-triangle-union',
      minimumArcSegments: ARC_STEPS, maxBoundaryStepWU: MAX_STEP, comparisonEpsilonWU: EPS, clearVolume: 'actual-3D-triangle-box-clipping' },
    violations,
  };
}
