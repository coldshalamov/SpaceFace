// Exact planar convex-polygon queries. The swept disc is the polygon plus its
// edge capsules, not intersecting offset planes (which invent square corners).
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Either winding is accepted; malformed/non-convex data uses the owner's primitive fallback. */
export function convexHullWinding(hull) {
  if (!Array.isArray(hull) || hull.length < 3 || !hull.every(point)) return 0;
  let area = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    if (a.x === b.x && a.z === b.z) return 0;
    area += a.x * b.z - a.z * b.x;
  }
  if (!Number.isFinite(area) || area === 0) return 0;
  const winding = Math.sign(area);
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    for (const p of hull) {
      if (winding * ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) < -1e-12) return 0;
    }
  }
  return winding;
}

function circleEntry(x, z, dx, dz, r) {
  const c = x * x + z * z - r * r;
  if (c <= 1e-14) return 0;
  const a = dx * dx + dz * dz;
  if (!a) return Infinity;
  const b = x * dx + z * dz, disc = b * b - a * c;
  const tolerance = 1e-14 * Math.max(1, b * b, Math.abs(a * c));
  if (disc < -tolerance) return Infinity;
  const t = (-b - Math.sqrt(Math.max(0, disc))) / a;
  return t >= 0 && t <= 1 ? t : Infinity;
}

/** null = invalid hull; false = real miss; true = first contact, including tangency. */
export function sweepConvexHullInto(out, hull, start, end, radius = 0) {
  const winding = convexHullWinding(hull);
  if (!winding) return null;
  out.hit = false;
  if (!point(start) || !point(end) || !Number.isFinite(radius)) return false;
  const r = Math.max(0, radius), dx = end.x - start.x, dz = end.z - start.z;
  let low = 0, high = 1, t = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b.x - a.x, ez = b.z - a.z;
    const side = winding * (ex * (start.z - a.z) - ez * (start.x - a.x));
    const rate = winding * (ex * dz - ez * dx);
    if (rate === 0) { if (side < -1e-12) high = -1; }
    else if (rate > 0) low = Math.max(low, -side / rate);
    else high = Math.min(high, -side / rate);
    if (r > 0) {
      // Rectangle along this edge, with genuine circular endpoint caps.
      const length = Math.hypot(ex, ez), c = ex / length, s = ez / length;
      const x = (start.x - a.x) * c + (start.z - a.z) * s;
      const z = -(start.x - a.x) * s + (start.z - a.z) * c;
      const vx = dx * c + dz * s, vz = -dx * s + dz * c;
      let lo = 0, hi = 1;
      for (const [origin, velocity, min, max] of [[x, vx, 0, length], [z, vz, -r, r]]) {
        if (velocity === 0) { if (origin < min || origin > max) hi = -1; }
        else {
          const ta = (min - origin) / velocity, tb = (max - origin) / velocity;
          lo = Math.max(lo, Math.min(ta, tb)); hi = Math.min(hi, Math.max(ta, tb));
        }
      }
      if (lo <= hi) t = Math.min(t, lo);
      t = Math.min(t, circleEntry(start.x - a.x, start.z - a.z, dx, dz, r));
    }
  }
  if (low <= high) t = Math.min(t, low);
  if (!Number.isFinite(t)) return false;
  out.hit = true; out.t = t;
  out.x = start.x + dx * t; out.z = start.z + dz * t;
  let nearest = Infinity, nx = 0, nz = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b.x - a.x, ez = b.z - a.z, square = ex * ex + ez * ez;
    const u = clamp(((out.x - a.x) * ex + (out.z - a.z) * ez) / square, 0, 1);
    const ox = out.x - a.x - u * ex, oz = out.z - a.z - u * ez;
    const distance = ox * ox + oz * oz;
    if (distance < nearest) {
      nearest = distance;
      if (distance > 1e-24 && winding * (ex * oz - ez * ox) < 0) { nx = ox; nz = oz; }
      else { nx = winding * ez; nz = -winding * ex; }
    }
  }
  const length = Math.hypot(nx, nz) || 1;
  out.nx = nx / length; out.nz = nz / length;
  return true;
}
