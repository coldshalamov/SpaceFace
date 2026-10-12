// Swept whole-body tests for Kinetic League matches.
// Occupancy at one sample is not a score. The z-axis case matches
// src/characters/bracketRules.js goalCrossing when given BRACKET constants.

export const DT = 1 / 60;
export const MAX_DT = 0.25;

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function finiteXZ(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

/**
 * The entire disk must cross `plane` along `dir` (-1 or +1).
 * `aperture` is the half-width of the legal opening on the lateral axis.
 * Displacement beyond maxSpeed * dt * 1.25 is a teleport and does not score.
 * Returns { x, z, t, lateral } or null.
 */
export function sweptDiskCross(prev, curr, radius, spec) {
  if (!finiteXZ(prev) || !finiteXZ(curr)) return null;
  const aperture = spec && spec.aperture;
  const plane = spec && spec.plane;
  const dir = spec && spec.dir;
  const maxSpeed = spec && spec.maxSpeed;
  const dt = spec && spec.dt;
  const axis = spec && spec.axis === 'x' ? 'x' : 'z';
  if (!Number.isFinite(radius) || radius <= 0) return null;
  if (!Number.isFinite(aperture) || aperture <= 0) return null;
  if (!Number.isFinite(plane) || (dir !== -1 && dir !== 1)) return null;
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) return null;
  if (!Number.isFinite(dt) || dt <= 0 || dt > MAX_DT) return null;
  const lateralAxis = axis === 'z' ? 'x' : 'z';
  const p0 = prev[axis];
  const p1 = curr[axis];
  const progress0 = (p0 - plane) * dir;
  const progress1 = (p1 - plane) * dir;
  if (progress0 >= radius || progress1 < radius || progress1 <= progress0) return null;
  const dist = Math.hypot(curr.x - prev.x, curr.z - prev.z);
  if (dist > maxSpeed * dt * 1.25 + 1e-6) return null;
  const t = (radius - progress0) / (progress1 - progress0);
  const lateral = prev[lateralAxis] + (curr[lateralAxis] - prev[lateralAxis]) * t;
  const center = Number.isFinite(spec.center) ? spec.center : 0;
  if (Math.abs(lateral - center) + radius > aperture) return null;
  const crossed = plane + dir * radius;
  const point = axis === 'z'
    ? { x: lateral, z: crossed, t, lateral }
    : { x: crossed, z: lateral, t, lateral };
  return point;
}

/** Whole disk transitions from outside a pocket to inside. Teleports return null. */
export function sweptEnterDisk(prev, curr, radius, pocket, maxSpeed, dt) {
  if (!finiteXZ(prev) || !finiteXZ(curr) || !pocket) return null;
  if (!Number.isFinite(radius) || radius <= 0) return null;
  if (!Number.isFinite(pocket.radius) || pocket.radius <= radius) return null;
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) return null;
  if (!Number.isFinite(dt) || dt <= 0 || dt > MAX_DT) return null;
  const dist = Math.hypot(curr.x - prev.x, curr.z - prev.z);
  if (dist > maxSpeed * dt * 1.25 + 1e-6) return null;
  const was = Math.hypot(prev.x - pocket.x, prev.z - pocket.z) + radius > pocket.radius + 1e-6;
  const now = Math.hypot(curr.x - pocket.x, curr.z - pocket.z) + radius <= pocket.radius + 1e-6;
  if (!was || !now) return null;
  return { x: curr.x, z: curr.z, t: 1 };
}

export function wholeDiskInside(body, center, regionRadius) {
  if (!body || !center) return false;
  return Math.hypot(body.x - center.x, body.z - center.z) + body.radius <= regionRadius + 1e-6;
}

export function speedOf(body) {
  return Math.hypot(body.vx || 0, body.vz || 0);
}

export function headingOf(vx, vz) {
  return Math.atan2(vz, vx);
}
