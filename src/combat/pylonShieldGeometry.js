// Linked Shield Pylons — the ONE geometric fact every attack path reads (packet 06).
//
// Pure leaf module: numbers in, numbers out. No state, no bus, no Three.js, no randomness, no
// allocation on the hot paths (callers pass reusable `out` records). The shield's gameplay footprint
// is a SEGMENT WITH THICKNESS in the XZ plane — a capsule: the axis A->B, a half-thickness `h`, and
// round end-caps of radius `h`. The rendered panel draws exactly this footprint; it may rise in Y
// visually but there is no third simulation axis.
//
// What lives here, and only here:
//   * the panel record (`writePanel`) and its derived frame (axis u, left normal n, length),
//   * the first-contact sweep of a disc (a ship, a shell, a ray of radius 0) against a STATIC panel
//     (exact, closed form) and against a MOVING panel (endpoints interpolated across the tick,
//     sub-stepped so a fast projectile or a swinging wall cannot tunnel),
//   * point tests (inside the footprint, which side of the wall, distance to the axis).
//
// The relation policy (who a panel blocks) is src/combat/pylonShieldPolicy.js; the state-reading
// queries the attack paths call are src/combat/pylonShieldQuery.js. This file knows neither.

const EPS = 1e-9;
/** Upper bound on sub-steps for a moving-panel sweep (a hard cost ceiling, never a quality knob). */
export const MAX_SWEEP_SUBSTEPS = 64;
const BISECT_ITERATIONS = 14;

/**
 * Fill `out` with a panel record: endpoints A(ax,az) B(bx,bz), half-thickness h, length, unit axis
 * (ux,uz) and the LEFT normal (nx,nz) = (-uz, ux). Degenerate (zero-length) panels keep a valid frame.
 */
export function writePanel(out, ax, az, bx, bz, h) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  out.ax = ax; out.az = az; out.bx = bx; out.bz = bz;
  out.h = h;
  out.len = len;
  if (len > EPS) { out.ux = dx / len; out.uz = dz / len; } else { out.ux = 1; out.uz = 0; }
  out.nx = 0 - out.uz; // 0 - x, not -x: keeps +0 for an axis-aligned panel
  out.nz = out.ux;
  return out;
}

/** A fresh panel record. */
export function makePanel(ax, az, bx, bz, h) {
  return writePanel({ ax: 0, az: 0, bx: 0, bz: 0, h: 0, len: 0, ux: 1, uz: 0, nx: 0, nz: 1 }, ax, az, bx, bz, h);
}

/** Distance from (x,z) to the panel AXIS (the segment A->B), and the clamped axis parameter. */
export function distanceToAxis(panel, x, z, out = null) {
  const px = x - panel.ax;
  const pz = z - panel.az;
  let s = px * panel.ux + pz * panel.uz;
  if (s < 0) s = 0; else if (s > panel.len) s = panel.len;
  const cx = panel.ax + panel.ux * s;
  const cz = panel.az + panel.uz * s;
  const d = Math.hypot(x - cx, z - cz);
  if (out) { out.s = s; out.cx = cx; out.cz = cz; }
  return d;
}

/** Is the disc (x,z,radius) overlapping the thick footprint (optionally padded)? */
export function discTouchesPanel(panel, x, z, radius = 0, pad = 0) {
  return distanceToAxis(panel, x, z) <= panel.h + Math.max(0, radius) + Math.max(0, pad);
}

/** Which face of the wall the point is on: +1 the LEFT-normal side, -1 the right, 0 exactly on the line. */
export function sideOfPanel(panel, x, z) {
  const q = (x - panel.ax) * panel.nx + (z - panel.az) * panel.nz;
  return q > EPS ? 1 : q < -EPS ? -1 : 0;
}

/** Conservative axis-aligned bounds of the footprint padded by `pad` (broad phase only). */
export function panelBounds(panel, pad = 0, out = null) {
  const r = panel.h + pad;
  const b = out || { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  b.minX = Math.min(panel.ax, panel.bx) - r;
  b.maxX = Math.max(panel.ax, panel.bx) + r;
  b.minZ = Math.min(panel.az, panel.bz) - r;
  b.maxZ = Math.max(panel.az, panel.bz) + r;
  return b;
}

/** Bounds of the swept area of a moving panel (union of the prev and cur footprints). */
export function sweptPanelBounds(prev, cur, pad = 0, out = null) {
  const r = Math.max(prev.h, cur.h) + pad;
  const b = out || { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  b.minX = Math.min(prev.ax, prev.bx, cur.ax, cur.bx) - r;
  b.maxX = Math.max(prev.ax, prev.bx, cur.ax, cur.bx) + r;
  b.minZ = Math.min(prev.az, prev.bz, cur.az, cur.bz) - r;
  b.maxZ = Math.max(prev.az, prev.bz, cur.az, cur.bz) + r;
  return b;
}

/** Does the segment (x0,z0)->(x1,z1) padded by `pad` touch the bounds? (cheap rejection) */
export function segmentMayTouchBounds(b, x0, z0, x1, z1, pad = 0) {
  return !(Math.max(x0, x1) + pad < b.minX || Math.min(x0, x1) - pad > b.maxX
    || Math.max(z0, z1) + pad < b.minZ || Math.min(z0, z1) - pad > b.maxZ);
}

/**
 * First contact of a disc of `radius` moving (x0,z0)->(x1,z1) with a STATIC panel footprint.
 * Exact: the disc centre enters the capsule of radius h+radius around the axis. Returns false (and
 * leaves `out` unspecified) when the path never reaches the footprint; otherwise fills `out`:
 *   t           first contact fraction along the path, 0..1 (0 when the path STARTS in contact)
 *   cx,cz       the mover's centre at that moment
 *   x,z         the contact point on the panel surface (centre minus normal * radius)
 *   nx,nz       unit normal pointing from the panel toward the mover
 *   side        +1 / -1: which face of the wall the mover started on (0 on the line)
 *   startInside true when the mover already overlapped the footprint at t=0
 *   part        'face' | 'capA' | 'capB' | 'inside'
 */
export function sweepDiscVsPanel(out, panel, x0, z0, x1, z1, radius = 0) {
  const R = panel.h + (radius > 0 ? radius : 0);
  const px = x0 - panel.ax;
  const pz = z0 - panel.az;
  const s0 = px * panel.ux + pz * panel.uz;
  const q0 = px * panel.nx + pz * panel.nz;
  const sc = s0 < 0 ? 0 : s0 > panel.len ? panel.len : s0;
  const qx = px - panel.ux * sc;
  const qz = pz - panel.uz * sc;
  const dist0 = Math.hypot(qx, qz);
  const rad = radius > 0 ? radius : 0;
  if (dist0 <= R) {
    let nx; let nz;
    if (dist0 > EPS) { nx = qx / dist0; nz = qz / dist0; } else { nx = panel.nx; nz = panel.nz; }
    out.t = 0; out.cx = x0; out.cz = z0;
    out.nx = nx; out.nz = nz;
    out.x = x0 - nx * rad; out.z = z0 - nz * rad;
    out.side = q0 > EPS ? 1 : q0 < -EPS ? -1 : 0;
    out.startInside = true;
    out.part = 'inside';
    return true;
  }
  const dx = x1 - x0;
  const dz = z1 - z0;
  const ds = dx * panel.ux + dz * panel.uz;
  const dq = dx * panel.nx + dz * panel.nz;
  let bestT = Infinity;
  let bestPart = null;
  let bestSigma = 0;
  // Faces: the two planes q = +-R, valid only while the contact lies along the axis span.
  if (dq > EPS || dq < -EPS) {
    if (q0 > R && dq < 0) {
      const t = (R - q0) / dq;
      if (t >= 0 && t <= 1) {
        const s = s0 + t * ds;
        if (s >= 0 && s <= panel.len && t < bestT) { bestT = t; bestPart = 'face'; bestSigma = 1; }
      }
    } else if (q0 < -R && dq > 0) {
      const t = (-R - q0) / dq;
      if (t >= 0 && t <= 1) {
        const s = s0 + t * ds;
        if (s >= 0 && s <= panel.len && t < bestT) { bestT = t; bestPart = 'face'; bestSigma = -1; }
      }
    }
  }
  // Caps: first entry into each end disc of radius R.
  const a = ds * ds + dq * dq;
  if (a > EPS) {
    for (let cap = 0; cap < 2; cap++) {
      const es = cap === 0 ? 0 : panel.len;
      const rs = s0 - es;
      const b = rs * ds + q0 * dq;
      if (b >= 0) continue; // not approaching this cap
      const f = rs * rs + q0 * q0 - R * R;
      const disc = b * b - a * f;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0 && t <= 1 && t < bestT) { bestT = t; bestPart = cap === 0 ? 'capA' : 'capB'; bestSigma = 0; }
    }
  }
  if (bestPart === null) return false;
  const cx = x0 + dx * bestT;
  const cz = z0 + dz * bestT;
  let nx; let nz;
  if (bestPart === 'face') {
    nx = panel.nx * bestSigma; nz = panel.nz * bestSigma;
  } else {
    const ex = bestPart === 'capA' ? panel.ax : panel.bx;
    const ez = bestPart === 'capA' ? panel.az : panel.bz;
    const vx = cx - ex;
    const vz = cz - ez;
    const vl = Math.hypot(vx, vz);
    if (vl > EPS) { nx = vx / vl; nz = vz / vl; } else { nx = panel.nx; nz = panel.nz; }
  }
  out.t = bestT; out.cx = cx; out.cz = cz;
  out.nx = nx; out.nz = nz;
  out.x = cx - nx * rad; out.z = cz - nz * rad;
  out.side = q0 > EPS ? 1 : q0 < -EPS ? -1 : 0;
  out.startInside = false;
  out.part = bestPart;
  return true;
}

// Scratch panels for the moving sweep (module-private; the sweep is not re-entrant).
const WORK_A = makePanel(0, 0, 1, 0, 1);
const WORK_B = makePanel(0, 0, 1, 0, 1);
const WORK_AXIS = { s: 0, cx: 0, cz: 0 };

function lerpPanelInto(out, prev, cur, tau) {
  const k = tau < 0 ? 0 : tau > 1 ? 1 : tau;
  return writePanel(out,
    prev.ax + (cur.ax - prev.ax) * k, prev.az + (cur.az - prev.az) * k,
    prev.bx + (cur.bx - prev.bx) * k, prev.bz + (cur.bz - prev.bz) * k,
    prev.h + (cur.h - prev.h) * k);
}

function signedQ(panel, x, z) {
  return (x - panel.ax) * panel.nx + (z - panel.az) * panel.nz;
}

/**
 * First contact of a disc with a panel that MOVES across the tick: its endpoints go linearly from
 * `prev` (tau 0) to `cur` (tau 1) while the disc goes (x0,z0)->(x1,z1). Sub-stepped so the relative
 * travel per step is under the footprint width, plus a face-change test between samples so a thin
 * wall swept past a point (a swinging wall, a very fast shell) is never missed. Same `out` contract
 * as `sweepDiscVsPanel`; `t` is the shared tick fraction. When the panel did not move the exact
 * static sweep answers.
 */
export function sweepDiscVsMovingPanel(out, prev, cur, x0, z0, x1, z1, radius = 0) {
  const rad = radius > 0 ? radius : 0;
  const panelMotion = Math.max(
    Math.hypot(cur.ax - prev.ax, cur.az - prev.az),
    Math.hypot(cur.bx - prev.bx, cur.bz - prev.bz),
  );
  if (panelMotion < 1e-6 && Math.abs(cur.h - prev.h) < 1e-9) {
    return sweepDiscVsPanel(out, cur, x0, z0, x1, z1, radius);
  }
  const dx = x1 - x0;
  const dz = z1 - z0;
  const R = Math.min(prev.h, cur.h) + rad;
  const travel = Math.hypot(dx, dz) + panelMotion;
  let n = Math.ceil(travel / Math.max(0.8 * R, 0.25));
  if (!(n >= 1)) n = 1;
  if (n > MAX_SWEEP_SUBSTEPS) n = MAX_SWEEP_SUBSTEPS;
  lerpPanelInto(WORK_A, prev, cur, 0);
  if (distanceToAxis(WORK_A, x0, z0) <= WORK_A.h + rad) {
    return finishMoving(out, prev, cur, x0, z0, dx, dz, rad, 0, true);
  }
  let prevQ = signedQ(WORK_A, x0, z0);
  let prevTau = 0;
  for (let k = 1; k <= n; k++) {
    const tau = k / n;
    lerpPanelInto(WORK_B, prev, cur, tau);
    const px = x0 + dx * tau;
    const pz = z0 + dz * tau;
    const q = signedQ(WORK_B, px, pz);
    let inside = distanceToAxis(WORK_B, px, pz) <= WORK_B.h + rad;
    if (!inside && prevQ * q < 0) {
      // The mover changed faces between samples: it crossed the line. Count it when the crossing
      // lay along the span (or within a cap) at the later pose.
      const s = (px - WORK_B.ax) * WORK_B.ux + (pz - WORK_B.az) * WORK_B.uz;
      if (s >= -R && s <= WORK_B.len + R) inside = true;
    }
    if (inside) {
      // Bisect (prevTau, tau] for the first instant at/inside the footprint.
      let lo = prevTau;
      let hi = tau;
      for (let i = 0; i < BISECT_ITERATIONS; i++) {
        const mid = (lo + hi) * 0.5;
        lerpPanelInto(WORK_A, prev, cur, mid);
        const mx = x0 + dx * mid;
        const mz = z0 + dz * mid;
        let midInside = distanceToAxis(WORK_A, mx, mz) <= WORK_A.h + rad;
        if (!midInside && prevQ * signedQ(WORK_A, mx, mz) < 0) midInside = true;
        if (midInside) hi = mid; else lo = mid;
      }
      return finishMoving(out, prev, cur, x0, z0, dx, dz, rad, hi, false);
    }
    prevQ = q;
    prevTau = tau;
  }
  return false;
}

function finishMoving(out, prev, cur, x0, z0, dx, dz, rad, tau, startInside) {
  lerpPanelInto(WORK_A, prev, cur, tau);
  const cx = x0 + dx * tau;
  const cz = z0 + dz * tau;
  const d = distanceToAxis(WORK_A, cx, cz, WORK_AXIS);
  let nx; let nz;
  if (d > EPS) { nx = (cx - WORK_AXIS.cx) / d; nz = (cz - WORK_AXIS.cz) / d; } else { nx = WORK_A.nx; nz = WORK_A.nz; }
  out.t = tau; out.cx = cx; out.cz = cz;
  out.nx = nx; out.nz = nz;
  out.x = cx - nx * rad; out.z = cz - nz * rad;
  const q0 = signedQ(prev, x0, z0);
  out.side = q0 > EPS ? 1 : q0 < -EPS ? -1 : 0;
  out.startInside = startInside;
  out.part = startInside ? 'inside' : 'face';
  return true;
}
