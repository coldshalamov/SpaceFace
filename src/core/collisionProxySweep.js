import { physicsBodyNativeReady } from './physicsAuthority.js';
// Projectile-disc narrow phase over the same resolved world primitives as Rapier/LOS.
// This is a query only: the projectile owner retains filtering, ordering and damage receipts.
import { sweepConvexHullInto } from './convexHullQuery.js';
import { proxyScaleFor, proxyWorldPrimitives } from '../data/collisionProxyManifests.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function circleEntry(sx, sz, dx, dz, cx, cz, r) {
  const x = sx - cx, z = sz - cz;
  const c = x * x + z * z - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a === 0) return Infinity;
  const b = x * dx + z * dz, disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : Infinity;
}
function boxEntry(sx, sz, dx, dz, hx, hz) {
  let lo = 0, hi = 1;
  // This runs for every candidate primitive. Keep the slab test allocation-free.
  if (dx === 0) {
    if (Math.abs(sx) > hx) return Infinity;
  } else {
    const a = (-hx - sx) / dx, b = (hx - sx) / dx;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
    if (lo > hi) return Infinity;
  }
  if (dz === 0) {
    if (Math.abs(sz) > hz) return Infinity;
  } else {
    const a = (-hz - sz) / dz, b = (hz - sz) / dz;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
    if (lo > hi) return Infinity;
  }
  return lo;
}
function frame(p) {
  if (p.kind === 'capsule') {
    const dx = p.bx - p.ax, dz = p.bz - p.az, length = Math.hypot(dx, dz);
    return { x: (p.ax + p.bx) / 2, z: (p.az + p.bz) / 2,
      c: length ? dx / length : 1, s: length ? dz / length : 0, hx: length / 2, hz: 0 };
  }
  return { x: p.x, z: p.z, c: Math.cos(p.rot), s: Math.sin(p.rot), hx: p.hx, hz: p.hz };
}
function primitiveEntry(p, a, b, radius) {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (p.kind === 'circle') return circleEntry(a.x, a.z, dx, dz, p.x, p.z, p.r + radius);
  const f = frame(p), x = a.x - f.x, z = a.z - f.z;
  const sx = x * f.c + z * f.s, sz = -x * f.s + z * f.c;
  const vx = dx * f.c + dz * f.s, vz = -dx * f.s + dz * f.c;
  const r = radius + (p.kind === 'capsule' ? p.r : 0);
  // Minkowski sum with a disc: two rectangular strips and round corners. Merely
  // padding both box half-extents would invent solid square corners in empty space.
  let t = Math.min(boxEntry(sx, sz, vx, vz, f.hx + r, f.hz),
    boxEntry(sx, sz, vx, vz, f.hx, f.hz + r));
  if (r > 0) t = Math.min(t,
    circleEntry(sx, sz, vx, vz, -f.hx, -f.hz, r),
    circleEntry(sx, sz, vx, vz, -f.hx, f.hz, r),
    circleEntry(sx, sz, vx, vz, f.hx, -f.hz, r),
    circleEntry(sx, sz, vx, vz, f.hx, f.hz, r));
  return t;
}

/** compactHull is already entity-local in Rapier, without primitive approach/articulation. */
export function sweepCompactHullInto(out, entity, manifest, start, end, radius = 0) {
  if(!physicsBodyNativeReady(entity)){out.hit=false;return false;}
  if (!manifest?.compactHull) return null;
  const scale = proxyScaleFor(entity, manifest), rot = Number.isFinite(entity.rot) ? entity.rot : 0;
  const c = Math.cos(rot), s = Math.sin(rot);
  const px = entity.pos?.x || 0, pz = entity.pos?.z || 0;
  const local = p => ({ x: ((p.x - px) * c + (p.z - pz) * s) / scale,
    z: (-(p.x - px) * s + (p.z - pz) * c) / scale });
  const result = sweepConvexHullInto(out, manifest.compactHull, local(start), local(end), radius / scale);
  if (result) {
    const nx = out.nx, nz = out.nz;
    out.x = start.x + (end.x - start.x) * out.t;
    out.z = start.z + (end.z - start.z) * out.t;
    out.nx = nx * c - nz * s; out.nz = nx * s + nz * c;
  }
  return result;
}

/** First projectile-centre contact with a resolved compound; false means a real gap. */
export function sweepCollisionProxyInto(out, entity, manifest, start, end, radius = 0) {
  const compact = sweepCompactHullInto(out, entity, manifest, start, end, radius);
  if (compact !== null) return compact;
  let t = Infinity, solid = null;
  for (const p of proxyWorldPrimitives(entity, manifest)) {
    const entry = primitiveEntry(p, start, end, Math.max(0, radius));
    if (entry < t) { t = entry; solid = p; }
  }
  out.hit = solid !== null;
  if (!solid) return false;
  out.t = t;
  out.x = start.x + (end.x - start.x) * t;
  out.z = start.z + (end.z - start.z) * t;
  let nx, nz;
  if (solid.kind === 'circle') {
    nx = out.x - solid.x; nz = out.z - solid.z;
  } else {
    const f = frame(solid), x = out.x - f.x, z = out.z - f.z;
    const lx = x * f.c + z * f.s, lz = -x * f.s + z * f.c;
    const ox = lx - clamp(lx, -f.hx, f.hx), oz = lz - clamp(lz, -f.hz, f.hz);
    nx = ox * f.c - oz * f.s; nz = ox * f.s + oz * f.c;
  }
  if (!(Math.hypot(nx, nz) > 0)) { nx = start.x - end.x; nz = start.z - end.z; }
  const length = Math.hypot(nx, nz) || 1;
  out.nx = nx / length; out.nz = nz / length;
  return true;
}
