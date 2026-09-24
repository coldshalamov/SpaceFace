// Render-only slide along the velocity copied at death. The sim body stays parked.

export const DEATH_SLIDE_S = 0.4;
export const DEATH_SLIDE_CAP_WU = 36;

export function deathSlideOffset(vel, elapsed, cap = DEATH_SLIDE_CAP_WU) {
  const t = Math.max(0, Math.min(DEATH_SLIDE_S, Number(elapsed) || 0));
  const damp = 1 - t / DEATH_SLIDE_S;
  const scale = t * (0.35 + 0.65 * damp);
  let x = (Number(vel && vel.x) || 0) * scale;
  let z = (Number(vel && vel.z) || 0) * scale;
  const d = Math.hypot(x, z);
  if (d > cap && d > 0) {
    const s = cap / d;
    x *= s;
    z *= s;
  }
  return { x, z, done: (Number(elapsed) || 0) >= DEATH_SLIDE_S };
}

/**
 * Shorten a slide so its end does not sit inside another hull.
 * `hulls` are { id, x, z, r }. Returns the same offset object, scaled down when needed.
 */
export function clampSlideAgainstHulls(origin, offset, hulls, selfId) {
  if (!origin || !offset || !Array.isArray(hulls)) return offset;
  const x0 = Number(origin.x) || 0;
  const z0 = Number(origin.z) || 0;
  let scale = 1;
  for (let i = 0; i < hulls.length; i++) {
    const hull = hulls[i];
    if (!hull || hull.id === selfId) continue;
    const hx = Number(hull.x);
    const hz = Number(hull.z);
    if (!Number.isFinite(hx) || !Number.isFinite(hz)) continue;
    const radius = (Number(hull.r) > 0 ? Number(hull.r) : 8) + 4;
    const ex = x0 + offset.x * scale;
    const ez = z0 + offset.z * scale;
    const dx = ex - hx;
    const dz = ez - hz;
    if (dx * dx + dz * dz >= radius * radius) continue;
    const vx = offset.x;
    const vz = offset.z;
    const len2 = vx * vx + vz * vz;
    if (!(len2 > 1e-6)) {
      scale = 0;
      break;
    }
    // Step back along the segment until the end clears the hull.
    let lo = 0;
    let hi = scale;
    for (let step = 0; step < 8; step++) {
      const mid = (lo + hi) * 0.5;
      const mx = x0 + vx * mid;
      const mz = z0 + vz * mid;
      const ddx = mx - hx;
      const ddz = mz - hz;
      if (ddx * ddx + ddz * ddz < radius * radius) hi = mid;
      else lo = mid;
    }
    scale = lo;
  }
  offset.x *= scale;
  offset.z *= scale;
  return offset;
}
