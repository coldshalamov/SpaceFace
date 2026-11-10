// A short-horizon, bounded launch forecast for a thrown aggregate (packet 05 — "Hold and release
// must feel intentional").
//
// What it promises, and what it does not:
//   • SAME initial state, impulse plan and collision shape as execution — the caller hands in the
//     post-burst velocity from `burstPlan` and the ball's real collider radius; this module adds
//     nothing of its own to either.
//   • SAME field queries — `fieldAccel` is the owner's kernel sample (injected, so this file imports
//     neither the field system nor the renderer); the step is the sim's own semi-implicit Euler at
//     the fixed tick, so a Pull well bends the forecast exactly the way it bends the ball.
//   • BOUNDED — a horizon in seconds, a cap on candidate bodies, and caller-owned buffers: nothing
//     is allocated per call, and there is no second physics world (bodies are constant-velocity
//     swept discs; the first contact ends the forecast).
//   • CONDITIONAL — every result says so (`conditional: true`). Moving bodies steer, fields expire
//     and the pilot can turn: this is a forecast of the current intent, never a promise.
//
// Pure: no state, no bus, no rng, no Three.js.

import { sweptDiskContact } from '../combat/masslineReleaseGeometry.js';

export const TRAJECTORY_BUDGET = Object.freeze({
  horizonS: 2.4,        // seconds forecast ahead — short on purpose
  stepS: 1 / 60,        // the sim's fixed tick
  sampleEvery: 6,       // one polyline point per 0.1 s
  maxBodies: 14,        // candidate bodies swept per step
  maxPoints: 40,        // polyline capacity (2.4 s / 0.1 s + the start + slack)
});

const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** Reusable output. Create once per consumer; `predictTrajectory` rewrites it in place. */
export function createTrajectoryBuffer(maxPoints = TRAJECTORY_BUDGET.maxPoints) {
  return {
    points: new Float64Array(maxPoints * 2), count: 0, capacity: maxPoints,
    impact: { hit: false, id: null, t: 0, x: 0, z: 0, relSpeed: 0, index: -1 },
    endT: 0, steps: 0, bodiesSwept: 0, fieldAware: false, conditional: true, valid: false,
    exit: { x: 0, z: 0, speed: 0 },
  };
}

const _acc = { ax: 0, az: 0 };

/**
 * Forecast a free body from `init = { x, z, vx, vz, radius }`.
 *
 *   opts.fieldAccel?  (x, z, vx, vz, t, out) -> out {ax, az}   the owner's field kernel, per step
 *   opts.bodies?      [{ id, x, z, vx, vz, radius }]           candidate bodies, nearest/most relevant first
 *   opts.horizonS / stepS / sampleEvery / maxBodies            see TRAJECTORY_BUDGET
 *
 * Returns `out` (the buffer you passed): `points` holds `count` x,z pairs from the start to either the
 * horizon or the first contact; `impact` names the first body struck, when, where and how hard
 * (relative closing speed). `valid` is false for non-finite input.
 */
export function predictTrajectory(init, opts, out) {
  const o = opts || {};
  const stepS = Math.max(1 / 240, finite(o.stepS, TRAJECTORY_BUDGET.stepS));
  const horizonS = Math.max(0, Math.min(6, finite(o.horizonS, TRAJECTORY_BUDGET.horizonS)));
  const every = Math.max(1, Math.trunc(finite(o.sampleEvery, TRAJECTORY_BUDGET.sampleEvery)));
  const bodies = Array.isArray(o.bodies) ? o.bodies : null;
  const nBodies = bodies ? Math.min(bodies.length, Math.max(0, Math.trunc(finite(o.maxBodies, TRAJECTORY_BUDGET.maxBodies)))) : 0;
  const fieldAccel = typeof o.fieldAccel === 'function' ? o.fieldAccel : null;
  const radius = Math.max(0, finite(init && init.radius));

  out.count = 0; out.endT = 0; out.steps = 0; out.bodiesSwept = nBodies;
  out.fieldAware = !!fieldAccel; out.conditional = true; out.valid = false;
  const im = out.impact; im.hit = false; im.id = null; im.t = 0; im.x = 0; im.z = 0; im.relSpeed = 0; im.index = -1;
  if (!init || ![init.x, init.z, init.vx, init.vz].every(Number.isFinite)) return out;

  let x = init.x, z = init.z, vx = init.vx, vz = init.vz;
  out.exit.x = vx; out.exit.z = vz; out.exit.speed = Math.hypot(vx, vz);
  const pts = out.points;
  const cap = out.capacity;
  let n = 0;
  pts[n * 2] = x; pts[n * 2 + 1] = z; n++;
  const steps = Math.ceil(horizonS / stepS);
  let t = 0;
  let ended = false;
  for (let i = 0; i < steps && !ended; i++) {
    if (fieldAccel) {
      _acc.ax = 0; _acc.az = 0;
      const a = fieldAccel(x, z, vx, vz, t, _acc) || _acc;
      const ax = finite(a.ax), az = finite(a.az);
      vx += ax * stepS; vz += az * stepS;
    }
    // Contact is swept inside this step's displacement against each candidate's own drift.
    for (let b = 0; b < nBodies; b++) {
      const body = bodies[b];
      if (!body) continue;
      const bvx = finite(body.vx), bvz = finite(body.vz);
      const rx = finite(body.x) + bvx * t - x;
      const rz = finite(body.z) + bvz * t - z;
      const hit = sweptDiskContact(rx, rz, bvx - vx, bvz - vz, radius + Math.max(0, finite(body.radius)), stepS);
      if (!hit.valid || !hit.hit) continue;
      if (im.hit && hit.impactTime >= im.t - t) continue; // an earlier hit in the same step wins
      im.hit = true; im.id = body.id; im.index = b;
      im.t = t + hit.impactTime;
      im.x = x + vx * hit.impactTime; im.z = z + vz * hit.impactTime;
      im.relSpeed = Math.hypot(bvx - vx, bvz - vz);
    }
    if (im.hit) {
      const dt = im.t - t;
      x += vx * dt; z += vz * dt; t = im.t;
      ended = true;
    } else {
      x += vx * stepS; z += vz * stepS; t += stepS;
    }
    out.steps = i + 1;
    if (ended || (i + 1) % every === 0 || i === steps - 1) {
      if (n < cap) { pts[n * 2] = x; pts[n * 2 + 1] = z; n++; }
      else { pts[(cap - 1) * 2] = x; pts[(cap - 1) * 2 + 1] = z; } // never past the buffer: the tail rides the last slot
    }
  }
  out.count = n; out.endT = t; out.valid = true;
  return out;
}
