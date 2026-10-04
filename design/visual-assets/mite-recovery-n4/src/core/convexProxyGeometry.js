// Bounded authored convex XZ subparts. Never hull-fit across separate pieces: gaps
// and concavities belong to the union, while each piece is strictly convex.
import { sweepConvexHullInto } from './convexHullQuery.js';
import { planarProxyPrismHalfHeight } from './planarProxyGeometry.js';

export const MAX_CONVEX_PROXY_VERTICES = 12;
export const MAX_PROXY_COORDINATE = 1e6;
// Conservative supported native envelope, not a proof of every larger/aspect-ratio
// shape. Rapier's absolute convex-contact tolerances miss sub-centimeter pieces.
// Reject them rather than inflate geometry; exact XZ sweeps remain ray authority.
export const MIN_NATIVE_CONVEX_PROXY_WIDTH_WU = 0.01;
export function convexProxyMinimumWidth(vertices) {
  let width = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    let support = 0;
    for (const p of vertices) support = Math.max(support, Math.abs(dx * (p[1] - a[1]) - dz * (p[0] - a[0])));
    width = Math.min(width, support / Math.hypot(dx, dz));
  }
  return width;
}
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/** Reject before copying; canonical CCW winding and start make identities stable. */
export function normalizeConvexProxyVertices(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 3 || vertices.length > MAX_CONVEX_PROXY_VERTICES) {
    throw new RangeError('convex requires 3..12 vertices');
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const v of vertices) {
    if (!Array.isArray(v) || v.length !== 2 || !v.every(n => Number.isFinite(n) && Math.abs(n) <= MAX_PROXY_COORDINATE)) {
      throw new RangeError('convex coordinates must be finite bounded [x,z] pairs');
    }
    minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
    minZ = Math.min(minZ, v[1]); maxZ = Math.max(maxZ, v[1]);
  }
  const extent = Math.max(maxX - minX, maxZ - minZ);
  const epsilon = 64 * Number.EPSILON * extent * extent;
  const turn = cross(vertices[0], vertices[1], vertices[2]);
  if (!(Math.abs(turn) > epsilon)) throw new RangeError('degenerate convex piece');
  const winding = Math.sign(turn);
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    for (let j = 0; j < vertices.length; j++) {
      if (j === i || j === (i + 1) % vertices.length) continue;
      if (!(winding * cross(a, b, vertices[j]) > epsilon)) throw new RangeError('nonconvex or degenerate convex piece');
    }
  }
  const out = vertices.map(v => [v[0] === 0 ? 0 : v[0], v[1] === 0 ? 0 : v[1]]);
  if (winding < 0) out.reverse();
  let first = 0;
  for (let i = 1; i < out.length; i++) if (out[i][0] < out[first][0] || (out[i][0] === out[first][0] && out[i][1] < out[first][1])) first = i;
  return out.slice(first).concat(out.slice(0, first));
}

function convexProxyPoints(vertices) { return vertices.map(([x, z]) => ({ x, z })); }

/** Normalize numerical query scale only; preserve the authored XZ polygon exactly. */
export function sweepConvexProxyInto(out, vertices, start, end, radius = 0) {
  if (!Array.isArray(vertices) || vertices.length < 3 || vertices.length > MAX_CONVEX_PROXY_VERTICES) { out.hit = false; return false; }
  const origin = vertices[0];
  let scale = 0;
  for (const [x, z] of vertices) scale = Math.max(scale, Math.abs(x - origin[0]), Math.abs(z - origin[1]));
  if (!(scale > 0) || !Number.isFinite(scale)) { out.hit = false; return false; }
  const local = p => ({ x: (p.x - origin[0]) / scale, z: (p.z - origin[1]) / scale });
  const hull = vertices.map(([x, z]) => local({ x, z }));
  const hit = sweepConvexHullInto(out, hull, local(start), local(end), radius / scale);
  if (hit) { out.x = start.x + (end.x - start.x) * out.t; out.z = start.z + (end.z - start.z) * out.t; }
  return hit === true;
}

export function convexProxyDistance(point, vertices) {
  let inside = true, best = Infinity;
  // Expanded vertices are canonical CCW; world transforms preserve winding.
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], px = point.x - a[0], pz = point.z - a[1];
    if (dx * pz - dz * px < 0) inside = false;
    const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(px - dx * t, pz - dz * t));
  }
  return inside ? -best : best;
}

/** Validate float32 projection too: underflow/collapse must never silently drop a piece. */
export function convexProxyColliderDesc(R, vertices, scale) {
  if (!(scale > 0) || !Number.isFinite(scale) || typeof R.ColliderDesc.convexHull !== 'function') throw new RangeError('unsupported convex proxy scale or native runtime');
  const canonical = normalizeConvexProxyVertices(vertices);
  if (convexProxyMinimumWidth(canonical) * scale < MIN_NATIVE_CONVEX_PROXY_WIDTH_WU * (1 - 64 * Number.EPSILON)) {
    throw new RangeError('convex native support width is below 0.01 WU');
  }
  const projected = normalizeConvexProxyVertices(canonical.map(([x, z]) => [Math.fround(x * scale), Math.fround(z * scale)]));
  // Permit float32 rounding of the exact boundary, but never a materially thinner
  // projected polygon caused by cancellation at a large authored local offset.
  if (convexProxyMinimumWidth(projected) < MIN_NATIVE_CONVEX_PROXY_WIDTH_WU * (1 - 16 * 2 ** -23)) {
    throw new RangeError('convex native float32 support width is below 0.01 WU');
  }
  const verts = convexProxyPoints(projected), halfY = planarProxyPrismHalfHeight(verts, 1);
  const points = new Float32Array(verts.length * 6);
  for (let i = 0; i < verts.length; i++) for (let side = 0; side < 2; side++) {
    const j = (i + side * verts.length) * 3;
    points[j] = verts[i].x; points[j + 1] = side ? -halfY : halfY; points[j + 2] = verts[i].z;
  }
  const desc = R.ColliderDesc.convexHull(points);
  if (!desc) throw new RangeError('native convex proxy construction failed');
  return desc;
}
