import { solveCadenceRelease } from './masslineReleaseGeometry.js';

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

// Below this angular rate the circle is indistinguishable from a line within projectile flight
// times, so the linear model is used instead. Shared by the solver and by the geometry gate below
// so "the solver took the constrained branch" and "the caller believes this is an orbit" can never
// disagree.
export const ORBIT_OMEGA_MIN = 0.02;

// How much radial motion an "orbit" may carry, as a multiple of its own tangential speed. 1.0 means
// the relative velocity must lie within 45 degrees of tangential. Above that the pair is closing or
// separating faster than it is sweeping — a hard reel-in or a straight tow — and the circle model
// stops being the better prediction.
export const ORBIT_RADIAL_RATIO_MAX = 1.0;

// Four fixed ticks at 60 Hz = 15 Hz, inside SF-06's deterministic 10-20 Hz predictor budget.
// The expensive intercept solve runs only on these sample ticks; fixed-tick consumers project the
// cached metadata between samples. CADENCE refreshes cheap ballistic contact every tick, and
// explicitly requests fresh field trajectories whenever a release decision is authorised.
export const RELEASE_PREDICTOR_SAMPLE_TICKS = 4;

// Legacy angular-tolerance exports retained for gunnery/UI callers. CADENCE throw contact does
// NOT use these inflated radii or angle clamps; it sweeps the sum of both physical proxy radii.
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
 * THE target-reconciliation rule, in one place so no two consumers can hold different versions of
 * it. `state.player.targetId` (the player's selection, which may seed a new latch's releaseTarget)
 * and `state.player.tether.targetId` (what the line is on) are different questions; this decides
 * when the second one claims the guns. Only current input-owned aim intent repaints a live throw.
 *
 * A line on a hostile SHIP/DRONE owns the guns for as long as it is attached. Asteroids and
 * friendlies deliberately do not — while you are swinging a rock you must still be able to shoot
 * whatever you are swinging it at. Tension phase is not consulted: a slack line is still a line.
 *
 * Pure. The caller resolves the entity and its hostility (scanner owns that, per AGENTS §6) and
 * passes the answer in.
 *
 * @param {object} tether  - state.player.tether mirror
 * @param {object} target  - the entity `tether.targetId` resolves to
 * @param {boolean} hostile - scanner.isHostileToPlayer(target, ...)
 */
export function masslineOwnsGuns(tether, target, hostile) {
  if (!tether || !tether.active || tether.targetId == null) return false;
  if (!hostile) return false;
  if (!target || target.alive === false || !target.pos) return false;
  if (target.id !== tether.targetId) return false;
  return target.type === 'ship' || target.type === 'drone';
}

/**
 * Is `b` travelling on an ARC about `a` right now?
 *
 * This is the honest gate for the constrained solver. The old caller gated on the rope's TENSION
 * PHASE, which is wrong in the one case the solver exists for: a tight orbit sits INSIDE rest
 * length, so it reports `slack`, so the constrained solve was skipped exactly when it was needed and
 * a linear lead was fired at a body on a circle. The miss was systematic and always to the outside.
 *
 * What actually makes the path circular is that the separation is BOUNDED by a line while the
 * relative motion is tangential — and that is just as true a hand's width inside rest length as it
 * is at full stretch. So measure the geometry:
 *   - the pair must be sweeping fast enough for the arc to bend inside a projectile's flight
 *     (|omega| > ORBIT_OMEGA_MIN), and
 *   - the motion must be dominantly tangential rather than radial, i.e. it is going AROUND rather
 *     than straight in or straight out.
 *
 * Pure: reads positions/velocities/masses only. Caller owns the "is there a line at all" question.
 *
 * @returns {{constrained:boolean, omega:number, distance:number, radialRate:number,
 *            tangentialSpeed:number, sweeping:boolean}}
 */
export function orbitalConstraintState(a, b) {
  const kin = tetherPairKinematics(a, b);
  const distance = kin.distance;
  const sweeping = Math.abs(kin.omega) > ORBIT_OMEGA_MIN;
  if (!(distance > 1e-6)) {
    return { constrained: false, omega: kin.omega, distance, radialRate: 0, tangentialSpeed: 0, sweeping: false };
  }
  const ax = finite(a && a.pos && a.pos.x), az = finite(a && a.pos && a.pos.z);
  const bx = finite(b && b.pos && b.pos.x), bz = finite(b && b.pos && b.pos.z);
  const avx = finite(a && a.vel && a.vel.x), avz = finite(a && a.vel && a.vel.z);
  const bvx = finite(b && b.vel && b.vel.x), bvz = finite(b && b.vel && b.vel.z);
  const rx = (bx - ax) / distance, rz = (bz - az) / distance;
  const radialRate = (bvx - avx) * rx + (bvz - avz) * rz;
  const tangentialSpeed = Math.abs(kin.omega) * distance;
  const constrained = sweeping
    && Math.abs(radialRate) <= ORBIT_RADIAL_RATIO_MAX * tangentialSpeed;
  return { constrained, omega: kin.omega, distance, radialRate, tangentialSpeed, sweeping };
}

/**
 * Constrained-motion lead solve (§3.1): world-space angle to aim so a projectile at `projSpeed`
 * intercepts a TETHERED target. While the line is meaningfully rotating the target's future
 * position is extrapolated on the rotating COM frame; a slack/static line degrades to the
 * standard linear solve. Returns { angle, time, predicted:{x,z}, constrained }.
 *
 * `opts.taut` is the caller's verdict that the pair is CONSTRAINED — use orbitalConstraintState()
 * for that, not the rope's tension phase (see its header for why phase is the wrong question). When
 * false we still solve, but with pure linear extrapolation, so the caller does not need to branch.
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
  const constrained = taut && Math.abs(kin.omega) > ORBIT_OMEGA_MIN;

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
 * Legacy angular UI tolerance (not used to authorize CADENCE throws).
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
 * payload: { pos:{x,z}, vel:{x,z}, radius? }
 * aim:     { pos:{x,z}, vel?:{x,z}, radius? }  — the caller's captured transient release target
 *                                                  (entity or synthetic point). This pure solver
 *                                                  never reads selection, auto-aim, or raw input.
 * opts.omega is retained as a compatible input but does not invent an off-vector ETA.
 * A separately gated coast forecast supplies timing; a free-flight ray alone cannot.
 *
 * Returns { valid, errorRad, tolRad, onSolution, interceptAngle, payloadSpeed, timeToSolution,
 *           timeOfFlight }.
 */
export function solveThrowSolution(payload, aim, opts = {}) {
  return solveCadenceRelease(payload, aim, opts);
}

/**
 * Keep the established sample metadata, but never extrapolate an old heading into a new HIT.
 * Ballistic contact is O(1) and read from current endpoints every fixed tick. Field trajectories
 * are sampled at the existing cadence for preview; requireFresh=true forces a current solve for
 * an armed/manual decision. Stale field previews are explicitly ineligible to auto-cut.
 */
export function sampleThrowSolution(cache, payload, aim, opts = {}) {
  const host = cache && typeof cache === 'object' ? cache : {};
  const tick = Math.max(0, Math.trunc(finite(opts.tick, 0)));
  const sampleIntervalTicks = Math.max(1, Math.trunc(finite(opts.sampleIntervalTicks, RELEASE_PREDICTOR_SAMPLE_TICKS)));
  const identity = opts.identity == null ? '' : String(opts.identity);
  const previousTick = Number.isFinite(host.sampleTick) ? host.sampleTick : -Infinity;
  const needsSample = !host.sample || host.identity !== identity || tick < previousTick
    || tick - previousTick >= sampleIntervalTicks
    || opts.requireFresh === true && typeof opts.fieldSampler === 'function';
  let current;
  if (needsSample) {
    current = solveThrowSolution(payload, aim, opts);
    host.sample = current;
    host.identity = identity;
    host.sampleTick = tick;
    host.sampleSequence = Math.max(0, Math.trunc(finite(host.sampleSequence, 0))) + 1;
  } else if (typeof opts.fieldSampler === 'function') {
    current = { ...host.sample, onSolution: false, timeToSolution: null, decisionStale: true };
  } else {
    current = solveThrowSolution(payload, aim, opts);
  }
  return { ...current, sampleTick: host.sampleTick, sampleAgeTicks: Math.max(0, tick - host.sampleTick),
    sampleIntervalTicks, sampleSequence: host.sampleSequence, sampled: needsSample,
    decisionTick: tick, decisionStale: current.decisionStale === true };
}
