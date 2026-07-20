// Massline fire control + throw-release solvers (Wave M2 §3.1/§3.3,
// design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// PURE MODULE — no state writes, no RNG, no imports from systems. Mirrors the gunnery.js
// discipline: one ballistic model shared by the sim fire path, the release assist, and any HUD
// readout, so the pip/indicator can never lie about what the guns/throw will actually do.
//
// The core idea (the whole reason tether-lock gunnery works): free-flying lead prediction guesses
// at unknown future acceleration, but a TAUT LINE constrains the target to (approximately)
// circular motion about the shared center of mass. Both bodies rotate about the COM at the same
// signed angular rate; the COM itself drifts ballistically. That turns lead prediction from a
// guess into a two-line rotation extrapolation.
//
// Frame convention matches weapons.solveLeadAngle exactly: the intercept is solved in the
// shooter's inertial frame (relative position advanced by relative motion, projectile at
// `projSpeed`), fixed-point iterated. With rotation rate 0 this degrades to the same math as
// solveLeadAngle, which is the correct slack-line fallback.

const TWO_PI = Math.PI * 2;

// Four fixed ticks at 60 Hz = 15 Hz, inside SF-06's deterministic 10-20 Hz predictor budget.
// The expensive intercept solve runs only on these sample ticks; fixed-tick consumers project the
// cached angular error between samples so Arm/Snap and the HUD still see one coherent live stream.
export const RELEASE_PREDICTOR_SAMPLE_TICKS = 4;

// Solution-tolerance clamp (radians). Target-size honesty (§3.3): big targets are generous,
// fighters stay a low-percentage play. assistForgiveness is the victim-radius multiplier dial.
export const ASSIST_FORGIVENESS = 1.6;
export const SOLUTION_TOL_MIN_RAD = 0.5 * Math.PI / 180;
export const SOLUTION_TOL_MAX_RAD = 12 * Math.PI / 180;

function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }

function wrapPi(a) {
  a = a % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

/**
 * World velocity used by the shipped aim-true projectile path. The projectile's world vector
 * remains on `angle`, while its velocity relative to the shooter has magnitude `projSpeed`.
 * Keeping this beside the lead solver prevents the solver and spawn path from silently using
 * different ballistic models.
 */
export function aimTrueProjectileVelocity(angle, projSpeed, shooterVel = null) {
  const cf = Math.cos(angle), sf = Math.sin(angle);
  const worldSpeed = aimTrueProjectileWorldSpeed(cf, sf, projSpeed, shooterVel);
  return { x: cf * worldSpeed, z: sf * worldSpeed };
}

function aimTrueProjectileWorldSpeed(cf, sf, projSpeed, shooterVel) {
  const speed = Math.max(1, finite(projSpeed, 1));
  const sx = finite(shooterVel && shooterVel.x);
  const sz = finite(shooterVel && shooterVel.z);
  const along = sx * cf + sz * sf;
  const shooterSpeed2 = sx * sx + sz * sz;
  const lateral2 = Math.max(0, shooterSpeed2 - along * along);
  const launch2 = speed * speed;
  if (!(launch2 > lateral2)) return speed;
  const worldSpeed = along + Math.sqrt(launch2 - lateral2);
  return worldSpeed > 0 ? worldSpeed : speed;
}

/**
 * Shared line kinematics for a tethered pair: signed angular rate of the line about the shared
 * center of mass, plus the COM state. Positive omega = counter-clockwise in the XZ plane
 * (atan2 convention).
 */
export function tetherPairKinematics(a, b) {
  const ax = finite(a && a.pos && a.pos.x), az = finite(a && a.pos && a.pos.z);
  const bx = finite(b && b.pos && b.pos.x), bz = finite(b && b.pos && b.pos.z);
  const avx = finite(a && a.vel && a.vel.x), avz = finite(a && a.vel && a.vel.z);
  const bvx = finite(b && b.vel && b.vel.x), bvz = finite(b && b.vel && b.vel.z);
  const ma = Math.max(0.1, finite(a && a.mass, 1));
  const mb = Math.max(0.1, finite(b && b.mass, 1));
  const mSum = ma + mb;

  const comX = (ax * ma + bx * mb) / mSum;
  const comZ = (az * ma + bz * mb) / mSum;
  const comVx = (avx * ma + bvx * mb) / mSum;
  const comVz = (avz * ma + bvz * mb) / mSum;

  // Signed angular rate of the separation vector r = b - a: omega = cross(r, dr/dt) / |r|^2.
  const rx = bx - ax, rz = bz - az;
  const rvx = bvx - avx, rvz = bvz - avz;
  const rr = rx * rx + rz * rz;
  const omega = rr > 1e-9 ? (rx * rvz - rz * rvx) / rr : 0;

  return { comX, comZ, comVx, comVz, omega, distance: Math.sqrt(rr) };
}

/**
 * Constrained-motion lead solve (§3.1): world-space angle to aim so a projectile at `projSpeed`
 * intercepts a TETHERED target. While the line is meaningfully rotating the target's future
 * position is extrapolated on the rotating COM frame; a slack/static line degrades to the
 * standard linear solve. Returns { angle, time, predicted:{x,z}, constrained }.
 *
 * `taut` should be passed from the mirrored tether phase (loaded/overload). When false we still
 * solve, but with pure linear extrapolation — the caller does not need to branch.
 */
export function solveTetherLeadSolution(shooter, target, projSpeed, opts = {}) {
  const sp = (shooter && shooter.pos) || { x: 0, z: 0 };
  const sv = (shooter && shooter.vel) || { x: 0, z: 0 };
  const tp = (target && target.pos) || { x: 0, z: 0 };
  const tv = (target && target.vel) || { x: 0, z: 0 };
  const ps = Math.max(1, finite(projSpeed, 1));
  const taut = opts.taut !== false;

  const kin = tetherPairKinematics(shooter, target);
  // Below this angular rate the circle is indistinguishable from a line within projectile flight
  // times; use the linear model (identical to weapons.solveLeadAngle).
  const constrained = taut && Math.abs(kin.omega) > 0.02;

  let t = 0;
  let px = tp.x - sp.x, pz = tp.z - sp.z;
  if (!constrained) {
    const rvx = finite(tv.x) - finite(sv.x), rvz = finite(tv.z) - finite(sv.z);
    for (let i = 0; i < 2; i++) {
      const aimx = px + rvx * t, aimz = pz + rvz * t;
      t = Math.hypot(aimx, aimz) / ps;
    }
    const aimx = px + rvx * t, aimz = pz + rvz * t;
    return {
      angle: Math.atan2(aimz, aimx),
      time: t,
      predicted: { x: sp.x + aimx, z: sp.z + aimz },
      constrained: false,
      omega: kin.omega,
    };
  }

  // Target offset from the COM rotates at kin.omega and the COM drifts ballistically. The shipped
  // projectile path is aim-true: its WORLD velocity stays on the authored aim line while its
  // velocity relative to the shooter has magnitude `projSpeed`. Solve against that exact spawn
  // model rather than pretending the projectile inherits the shooter's full velocity.
  const qx0 = tp.x - kin.comX, qz0 = tp.z - kin.comZ;
  let predX = tp.x, predZ = tp.z;
  for (let i = 0; i < 6; i++) {
    const ang = kin.omega * t;
    const c = Math.cos(ang), s = Math.sin(ang);
    const qx = qx0 * c - qz0 * s;
    const qz = qx0 * s + qz0 * c;
    predX = kin.comX + kin.comVx * t + qx;
    predZ = kin.comZ + kin.comVz * t + qz;
    const dx = predX - sp.x;
    const dz = predZ - sp.z;
    const distance = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const worldSpeed = aimTrueProjectileWorldSpeed(Math.cos(angle), Math.sin(angle), ps, sv);
    t = distance / Math.max(1, worldSpeed);
  }
  // Recompute the target at the converged time. The old implementation returned the position from
  // the penultimate iterate paired with the final time, which made its own receipt internally
  // inconsistent under hard swings.
  const finalAng = kin.omega * t;
  const finalC = Math.cos(finalAng), finalS = Math.sin(finalAng);
  const finalQx = qx0 * finalC - qz0 * finalS;
  const finalQz = qx0 * finalS + qz0 * finalC;
  predX = kin.comX + kin.comVx * t + finalQx;
  predZ = kin.comZ + kin.comVz * t + finalQz;
  const relX = predX - sp.x;
  const relZ = predZ - sp.z;
  return {
    angle: Math.atan2(relZ, relX),
    time: t,
    predicted: { x: predX, z: predZ },
    constrained: true,
    omega: kin.omega,
  };
}

/**
 * Angular tolerance for "on solution" at a given range — target-size honesty in one place.
 * radius/dist in world units; returns radians clamped to [TOL_MIN, TOL_MAX].
 */
export function solutionToleranceRad(targetRadius, distance, forgiveness = ASSIST_FORGIVENESS) {
  const r = Math.max(0.5, finite(targetRadius, 0.5)) * Math.max(0.1, finite(forgiveness, 1));
  const d = Math.max(1, finite(distance, 1));
  const tol = Math.atan2(r, d);
  return Math.min(SOLUTION_TOL_MAX_RAD, Math.max(SOLUTION_TOL_MIN_RAD, tol));
}

/**
 * Throw-release solution (§3.3/§4.1). The payload (thrown mass, or the player for a self-sling)
 * leaves the cut ballistic at its CURRENT velocity — so the "solution" is the moment its velocity
 * vector points at the moving-target intercept. On a sustained swing that direction rotates at
 * the line's angular rate, so the solution recurs every revolution.
 *
 * payload: { pos:{x,z}, vel:{x,z} }
 * aim:     { pos:{x,z}, vel?:{x,z}, radius? }  — the throw target (entity or synthetic point)
 * opts.omega — signed rotation rate of the payload velocity direction (pass the line omega);
 *              used only for timeToSolution pacing, not correctness.
 *
 * Returns { valid, errorRad, tolRad, onSolution, interceptAngle, payloadSpeed, timeToSolution,
 *           timeOfFlight }.
 */
export function solveThrowSolution(payload, aim, opts = {}) {
  const pv = (payload && payload.vel) || { x: 0, z: 0 };
  const pp = (payload && payload.pos) || { x: 0, z: 0 };
  const speed = Math.hypot(finite(pv.x), finite(pv.z));
  if (!(speed > 1) || !aim || !aim.pos) {
    return { valid: false, errorRad: Math.PI, tolRad: 0, onSolution: false, interceptAngle: 0, payloadSpeed: speed, timeToSolution: null, timeOfFlight: 0, predicted: null };
  }

  // Standard 2-pass intercept: the payload is the projectile, at its current speed.
  const av = aim.vel || { x: 0, z: 0 };
  const px = aim.pos.x - pp.x, pz = aim.pos.z - pp.z;
  const rvx = finite(av.x), rvz = finite(av.z);
  let t = 0;
  for (let i = 0; i < 2; i++) {
    const ix = px + rvx * t, iz = pz + rvz * t;
    t = Math.hypot(ix, iz) / speed;
  }
  const ix = px + rvx * t, iz = pz + rvz * t;
  const interceptAngle = Math.atan2(iz, ix);
  const distance = Math.hypot(ix, iz);

  const headingAngle = Math.atan2(pv.z, pv.x);
  const errorRad = wrapPi(interceptAngle - headingAngle);
  const tolRad = solutionToleranceRad(aim.radius, distance, opts.forgiveness);

  // Pacing read for the indicator: with the velocity direction rotating at omega, how long until
  // the error sweeps through zero (approaching side only — receding reads as most of a lap).
  const omega = finite(opts.omega, 0);
  let timeToSolution = null;
  if (Math.abs(omega) > 1e-3) {
    let sweep = errorRad / omega; // error decreases as the heading rotates toward intercept
    if (sweep < 0) sweep += TWO_PI / Math.abs(omega);
    timeToSolution = sweep;
  }

  return {
    valid: true,
    errorRad,
    tolRad,
    onSolution: Math.abs(errorRad) <= tolRad,
    interceptAngle,
    payloadSpeed: speed,
    timeToSolution,
    timeOfFlight: t,
    predicted: { x: pp.x + ix, z: pp.z + iz },
  };
}

/**
 * Deterministically sample and project the shared throw solution.
 *
 * `cache` is caller-owned mutable storage; no module-global state or wall time participates. A new
 * solve occurs at 15 Hz by default, immediately after a tick rewind, or when `identity` changes.
 * Every other fixed tick projects the sampled angular error with the live line omega. The returned
 * record is newly allocated so receipts may retain it without later cache updates rewriting history.
 */
export function sampleThrowSolution(cache, payload, aim, opts = {}) {
  const host = cache && typeof cache === 'object' ? cache : {};
  const tick = Math.max(0, Math.trunc(finite(opts.tick, 0)));
  const tickRate = Math.max(1, finite(opts.tickRate, 60));
  const sampleIntervalTicks = Math.max(1, Math.trunc(finite(
    opts.sampleIntervalTicks,
    RELEASE_PREDICTOR_SAMPLE_TICKS,
  )));
  const identity = opts.identity == null ? '' : String(opts.identity);
  const previousTick = Number.isFinite(host.sampleTick) ? host.sampleTick : -Infinity;
  const needsSample = !host.sample
    || host.identity !== identity
    || tick < previousTick
    || tick - previousTick >= sampleIntervalTicks;

  if (needsSample) {
    const solved = solveThrowSolution(payload, aim, opts);
    host.sample = {
      valid: solved.valid,
      errorRad: solved.errorRad,
      tolRad: solved.tolRad,
      onSolution: solved.onSolution,
      interceptAngle: solved.interceptAngle,
      payloadSpeed: solved.payloadSpeed,
      timeToSolution: solved.timeToSolution,
      timeOfFlight: solved.timeOfFlight,
      predicted: solved.predicted ? { ...solved.predicted } : null,
    };
    host.identity = identity;
    host.sampleTick = tick;
    host.sampleSequence = Math.max(0, Math.trunc(finite(host.sampleSequence, 0))) + 1;
  }

  const sample = host.sample;
  const sampleAgeTicks = Math.max(0, tick - host.sampleTick);
  const omega = finite(opts.omega, 0);
  const projectedError = sample.valid
    ? wrapPi(sample.errorRad - omega * (sampleAgeTicks / tickRate))
    : sample.errorRad;
  let timeToSolution = null;
  if (sample.valid && Math.abs(omega) > 1e-3) {
    let sweep = projectedError / omega;
    if (sweep < 0) sweep += TWO_PI / Math.abs(omega);
    timeToSolution = sweep;
  }

  return {
    ...sample,
    errorRad: projectedError,
    onSolution: !!(sample.valid && Math.abs(projectedError) <= sample.tolRad),
    timeToSolution,
    sampleTick: host.sampleTick,
    sampleAgeTicks,
    sampleIntervalTicks,
    sampleSequence: host.sampleSequence,
    sampled: needsSample,
  };
}
