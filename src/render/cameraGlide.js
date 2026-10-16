// Predictive chase-camera obstacle glide (presentation only — never writes sim state).
//
// The camera must never be inside a solid, and it must get out of the way like a drone operator
// would: see the obstacle coming, ease up-and-back along its own viewing ray, hold while it flies
// over, then settle back to the set framing once the way is clear.
//
// The old clearance was reactive: it read the roof at the camera's *current* column, waited 0.3 s
// to believe it, and rose at a flat 110 WU/s in a pure vertical lift. At cruise the camera is
// inside the model long before the lift has done anything.
//
// This solver instead
//   1. dollies the camera along the ray from the look-at target through the camera (scale s >= 1),
//      so the framing direction never changes — the shot pulls "upward and outwards";
//   2. sweeps the path the target is about to travel, at ~48 WU spacing out to ~3 s ahead, asking
//      the renderer's roof query "how much dolly would this spot need?" (fixed point, because
//      dollying moves the camera's own column);
//   3. converts each future requirement into a smoothstep ramp that finishes exactly at the
//      moment of contact and never exceeds a comfortable rise rate;
//   4. feeds the largest ramp through a critically damped follower (fast up, slow down) with a
//      hold so a gap between two towers does not yo-yo the shot;
//   5. finally clamps to the *current* column's exact requirement. That last clamp is the
//      guarantee; when anticipation did its job it never engages (diag.hardFrames stays 0).
//
// Pure numbers in, one number out: no THREE, no allocation per frame.

export const GLIDE_TUNING = Object.freeze({
  slotCount: 24,             // lookahead samples along the predicted path
  slotsPerFrame: 4,          // lookahead samples refreshed per frame (round-robin)
  spacingMaxWu: 48,          // never sample the path coarser than this
  maxHorizonS: 3.0,          // furthest look-ahead in time
  maxHorizonWu: 1100,        // furthest look-ahead in distance (boost speeds)
  preRiseMinSpeedWu: 1100,    // slingshot-class motion needs one bounded early-warning sample
  preRiseHorizonS: 1.35,      // enough runway for the existing rise cap; normal flight stays on the ring
  preRiseHorizonWu: 2300,     // hard bound on the extra early-warning column
  minSpeedWu: 4,             // below this the target is treated as parked (no look-ahead)
  velocitySmoothingS: 0.12,  // EMA time constant for the target's velocity estimate
  maxRiseScalePerS: 1.6,     // comfortable dolly-out rate, in scale units per second
  minRampS: 0.9,             // shortest anticipation ramp, however small the obstacle
  smoothUpS: 0.30,           // follower time constant while rising (ramp already shapes it)
  headroomFraction: 0.05,    // aim slightly past the requirement: a critically damped follower only
  headroomScale: 0.015,      // approaches its target, and must be past the requirement by contact
  followerLeadS: 0.5,        // ramps finish this early so the follower's own lag lands on contact, not after it
  smoothDownS: 0.85,         // follower time constant while returning to the set framing
  maxDownScalePerS: 0.55,    // fastest return, scale units per second (~65 WU/s at default zoom)
  holdS: 0.45,               // keep the lifted framing this long after the way clears
  maxScale: 16,              // aesthetic dolly ceiling for the normal framing target
  maxClearanceScale: 256,    // bounded fallback when a caller has no finite far-plane ceiling
  fixedPointPasses: 5,       // dolly moves the camera column; iterate the requirement to a fixed point
  clearanceRefinePasses: 6,  // fixed bracket refinement for the hard current-column guarantee
  epsilon: 1e-3,
  maxStepS: 0.35,            // longest frame the glide integrates in one go (a 3 fps machine still keeps world time)
  visibleClampScale: 0.004,  // a last-resort clamp smaller than this (~0.5 WU) is not a visible correction
});

/** @returns {object} allocation-free solver state */
export function createCameraGlide(tuning = GLIDE_TUNING) {
  const n = tuning.slotCount;
  const glide = {
    tuning,
    roofAt: null,
    ceiling: Infinity,
    // Created once: rejects broken bounds (past the far plane) so a corrupt mesh can never lift the shot.
    roof: (x, z, pad) => {
      const f = glide.roofAt(x, z, pad);
      return Number.isFinite(f) && f <= glide.ceiling ? f : -Infinity;
    },
    scale: 1,
    rate: 0,
    primed: false,
    holdT: 0,
    velX: 0,
    velZ: 0,
    lastX: 0,
    lastZ: 0,
    hasLast: false,
    cursor: 1,
    slotReq: new Float32Array(n).fill(1),
    slotTime: new Float32Array(n),   // seconds until the target reaches this slot, as measured
    slotAge: new Float32Array(n),    // seconds since it was measured
    diag: { scale: 1, target: 1, req0: 1, hardFrames: 0, frames: 0, maxScale: 1, speed: 0 },
  };
  return glide;
}

/** Teleport / snap: forget history; the next step re-derives the framing with no easing. */
export function resetCameraGlide(glide) {
  glide.scale = 1;
  glide.rate = 0;
  glide.primed = false;
  glide.holdT = 0;
  glide.velX = 0;
  glide.velZ = 0;
  glide.hasLast = false;
  glide.cursor = 1;
  glide.slotReq.fill(1);
  glide.slotTime.fill(0);
  glide.slotAge.fill(0);
  glide.diag.scale = 1;
  glide.diag.target = 1;
  glide.diag.req0 = 1;
  glide.diag.hardFrames = 0;
  glide.diag.frames = 0;
  glide.diag.maxScale = 1;
  return glide;
}

/**
 * Smallest dolly scale that puts the camera above every roof it meets on its way out.
 * `ax/az` is the look-at target's position, `rx/ry/rz` the camera's offset from it at scale 1.
 * `roofAt(x, z, pad)` returns the lowest Y the camera may occupy at that column (-Infinity if none).
 */
function refineClearBracket(roofAt, ax, az, rx, ry, rz, pad, blockedScale, clearScale, passes) {
  let lo = blockedScale;
  let hi = clearScale;
  const budget = Number.isFinite(passes) ? Math.max(0, Math.min(8, Math.floor(passes))) : 0;
  for (let i = 0; i < budget; i++) {
    const mid = (lo + hi) * 0.5;
    const floor = roofAt(ax + mid * rx, az + mid * rz, pad);
    if (floor > mid * ry) lo = mid;
    else hi = mid;
  }
  // Keep the clear upper endpoint if a final query at the refined boundary is not clear. The
  // caller must never receive an unverified candidate after the bounded refinement.
  const finalFloor = roofAt(ax + hi * rx, az + hi * rz, pad);
  return !(finalFloor > hi * ry) ? hi : clearScale;
}

export function requiredGlideScale(
  roofAt, ax, az, rx, ry, rz, pad, maxScale,
  passes = GLIDE_TUNING.fixedPointPasses, startScale = 1,
  refine = false, refinePasses = GLIDE_TUNING.clearanceRefinePasses,
) {
  let s = startScale;
  let blockedScale = NaN;
  for (let k = 0; k < passes; k++) {
    const floor = roofAt(ax + s * rx, az + s * rz, pad);
    if (!(floor > s * ry)) {
      return refine && Number.isFinite(blockedScale)
        ? refineClearBracket(roofAt, ax, az, rx, ry, rz, pad, blockedScale, s, refinePasses)
        : s;
    }
    blockedScale = s;
    const next = Math.min(maxScale, floor / ry + GLIDE_TUNING.epsilon);
    if (next <= s) return s;
    s = next;
  }
  // A bounded jump can land exactly on the footprint edge. Re-measure after the last pass so a
  // candidate that escaped at the bound is accepted instead of being reported as a blocked roof.
  const finalFloor = roofAt(ax + s * rx, az + s * rz, pad);
  if (!(finalFloor > s * ry)) {
    return refine && Number.isFinite(blockedScale)
      ? refineClearBracket(roofAt, ax, az, rx, ry, rz, pad, blockedScale, s, refinePasses)
      : s;
  }
  return s;
}

function smoothstep(p) {
  const t = p <= 0 ? 0 : p >= 1 ? 1 : p;
  return t * t * (3 - 2 * t);
}

// Critically damped follower with a speed cap (the classic "SmoothDamp"). Returns the new value and
// leaves the new rate in glide.rate.
function smoothDamp(glide, target, smoothS, maxRate, dt) {
  const omega = 2 / Math.max(1e-4, smoothS);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const cur = glide.scale;
  const maxDelta = maxRate * smoothS;
  let change = cur - target;
  change = change < -maxDelta ? -maxDelta : change > maxDelta ? maxDelta : change;
  const clampedTarget = cur - change;
  const temp = (glide.rate + omega * change) * dt;
  let rate = (glide.rate - omega * temp) * exp;
  let out = clampedTarget + (change + temp) * exp;
  if ((target - cur > 0) === (out > target)) {
    out = target;
    rate = (out - target) / dt;
  }
  glide.rate = rate;
  return out;
}

/**
 * Advance the glide one rendered frame.
 *
 * @param {object} glide createCameraGlide() state
 * @param {number} dt frame seconds
 * @param {number} tx look-at target X (frame-local)
 * @param {number} tz look-at target Z
 * @param {number} rx camera offset from the target at scale 1 (X)
 * @param {number} ry camera height at scale 1
 * @param {number} rz camera offset from the target at scale 1 (Z)
 * @param {(x:number,z:number,pad:number)=>number} roofAt lowest allowed camera Y at a column
 * @param {number} [ceiling] highest Y the camera may be asked to reach (far-plane sanity bound)
 * @returns {number} dolly scale to apply to (rx, ry, rz)
 */
export function stepCameraGlide(glide, dt, tx, tz, rx, ry, rz, roofAt, ceiling = Infinity) {
  const t = glide.tuning;
  const diag = glide.diag;
  const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), t.maxStepS) : 0;
  if (!(ry > 1) || typeof roofAt !== 'function') {
    // A missing callback is an unavailable measurement, not an empty-space measurement. Drop the
    // predictive history so a later callback cannot replay stale look-ahead roofs while the target
    // is already elsewhere. The renderer normally keeps a bound roofAt callback; this protects
    // direct solver consumers and transition seams that temporarily withhold clearance data.
    resetCameraGlide(glide);
    return 1;
  }
  const aestheticMaxScale = Math.max(1, Math.min(t.maxScale,
    Number.isFinite(ceiling) ? ceiling / ry : t.maxScale));
  // The aesthetic cap is a presentation preference, not a clearance authority. A low stern rig
  // can start at only a few WU high while the same renderer roof is hundreds of WU up; clamping
  // the exact requirement to t.maxScale leaves the camera inside that roof forever. Keep the
  // predictive target on the aesthetic bound, but let the current-column guarantee use every
  // finite scale that still fits along the full camera-to-target view ray under the far plane.
  const fallbackClearanceScale = Number.isFinite(t.maxClearanceScale)
    ? Math.max(aestheticMaxScale, t.maxClearanceScale)
    : aestheticMaxScale;
  const viewRayLength = Math.hypot(rx, ry, rz);
  const farPlaneScale = Number.isFinite(ceiling) && ceiling > 0
    && Number.isFinite(viewRayLength) && viewRayLength > t.epsilon
    ? ceiling / viewRayLength
    : Infinity;
  const clearanceMaxScale = Number.isFinite(farPlaneScale) && farPlaneScale > 0
    ? Math.max(1, farPlaneScale)
    : fallbackClearanceScale;
  glide.roofAt = roofAt;
  glide.ceiling = ceiling;
  const roof = glide.roof;

  // Target velocity, smoothed. The target already carries the ship's look-ahead, so it is the
  // right thing to project forward: it is where the camera column will be.
  if (glide.hasLast && step > 0) {
    const a = 1 - Math.exp(-step / t.velocitySmoothingS);
    const vx = (tx - glide.lastX) / step;
    const vz = (tz - glide.lastZ) / step;
    glide.velX += (vx - glide.velX) * a;
    glide.velZ += (vz - glide.velZ) * a;
  }
  glide.lastX = tx;
  glide.lastZ = tz;
  glide.hasLast = true;
  const speed = Math.hypot(glide.velX, glide.velZ);
  diag.speed = speed;

  // Exact requirement of the column the camera occupies right now — the guarantee.
  const req0 = requiredGlideScale(
    roof, tx, tz, rx, ry, rz, 0, clearanceMaxScale, t.fixedPointPasses, 1,
    true, t.clearanceRefinePasses,
  );
  diag.req0 = req0;

  if (!glide.primed) {
    glide.primed = true;
    glide.scale = req0;
    glide.rate = 0;
    glide.holdT = t.holdS;
    glide.slotReq.fill(1);
    diag.scale = req0;
    diag.target = req0;
    diag.maxScale = Math.max(diag.maxScale, req0);
    return req0;
  }

  // Age every lookahead sample, then refresh the next few around the ring.
  const n = t.slotCount;
  let earlyTarget = 1;
  for (let i = 1; i < n; i++) glide.slotAge[i] += step;
  if (speed < t.minSpeedWu) {
    glide.slotReq.fill(1);
  } else {
    const horizon = Math.min(speed * t.maxHorizonS, t.maxHorizonWu);
    const dirX = glide.velX / speed;
    const dirZ = glide.velZ / speed;
    const spacing = Math.min(t.spacingMaxWu, horizon / (n - 1));
    const pad = spacing * 0.5;
    // When the camera leads the target (flying toward the camera's side), rising also carries the
    // camera column forward: the column closes on an obstacle faster than the target does.
    const closing = speed + Math.max(0, dirX * rx + dirZ * rz) * t.maxRiseScalePerS * 0.75;
    for (let k = 0; k < t.slotsPerFrame; k++) {
      const i = glide.cursor;
      glide.cursor = i >= n - 1 ? 1 : i + 1;
      const dist = spacing * i;
      glide.slotReq[i] = requiredGlideScale(
        roof, tx + dirX * dist, tz + dirZ * dist, rx, ry, rz, pad,
        aestheticMaxScale, t.fixedPointPasses,
      );
      glide.slotTime[i] = dist / closing;
      glide.slotAge[i] = 0;
    }

    // At slingshot speed the ordinary 1100 WU ring can discover a tall roof only ~0.6 s before
    // the camera column reaches it.  The follower is deliberately capped for a comfortable rise,
    // so that discovery is too late even though the current-column hard guarantee remains correct.
    // Take one bounded early-warning column farther ahead, and schedule its requirement early
    // enough for that same capped follower to reach it.  This is deliberately gated above normal
    // boost speed and never changes the rise cap or the final penetration clamp.
    if (speed >= t.preRiseMinSpeedWu) {
      const preRiseDistance = Math.min(t.preRiseHorizonWu, speed * t.preRiseHorizonS);
      if (preRiseDistance > horizon + spacing) {
        const preRiseReq = requiredGlideScale(
          roof, tx + dirX * preRiseDistance, tz + dirZ * preRiseDistance,
          rx, ry, rz, pad, aestheticMaxScale, t.fixedPointPasses,
        );
        if (preRiseReq > 1 + t.epsilon) {
          const need = preRiseReq - 1;
          const riseRate = t.maxRiseScalePerS * 1.5;
          const reachS = riseRate > t.epsilon ? need / riseRate : Infinity;
          const ramp = Math.max(t.minRampS, 1.5 * need / t.maxRiseScalePerS);
          const remaining = preRiseDistance / closing - Math.max(t.followerLeadS, reachS);
          const progress = 1 - (remaining > 0 ? remaining : 0) / ramp;
          const ramped = 1 + (need * (1 + t.headroomFraction) + t.headroomScale) * smoothstep(progress);
          if (ramped > earlyTarget) earlyTarget = ramped;
        }
      }
    }
  }

  // Each future requirement becomes a ramp that completes at contact. A tall obstacle gets a
  // longer, gentler ramp so the rise rate stays comfortable.
  let target = earlyTarget;
  for (let i = 1; i < n; i++) {
    const need = glide.slotReq[i] - 1;
    if (need <= t.epsilon) continue;
    const ramp = Math.max(t.minRampS, 1.5 * need / t.maxRiseScalePerS);
    const remaining = glide.slotTime[i] - glide.slotAge[i] - t.followerLeadS;
    const progress = 1 - (remaining > 0 ? remaining : 0) / ramp;
    const ramped = 1 + (need * (1 + t.headroomFraction) + t.headroomScale) * smoothstep(progress);
    if (ramped > target) target = ramped;
  }
  if (req0 > target) target = req0;

  // Hold the lifted framing while the camera is still over a footprint, and briefly after, so the
  // shot neither yo-yos between two towers nor sinks back toward a roof edge it is still above
  // (descending pulls the camera column back toward the target, i.e. back over the roof).
  const lifted = glide.scale > 1 + t.epsilon;
  const overSolid = lifted && roof(tx + glide.scale * rx, tz + glide.scale * rz, 0) > -Infinity;
  if (overSolid || target >= glide.scale - t.epsilon) glide.holdT = t.holdS;
  else glide.holdT -= step;
  const following = glide.holdT > 0 ? Math.max(target, glide.scale) : target;

  if (step > 0) {
    const rising = following > glide.scale;
    glide.scale = smoothDamp(
      glide,
      following,
      rising ? t.smoothUpS : t.smoothDownS,
      rising ? t.maxRiseScalePerS * 1.5 : t.maxDownScalePerS,
      step,
    );
  }

  // The guarantee: never below what the column the camera would actually occupy needs. Chained
  // from the followed scale (not from 1): the valid scales are not contiguous, and a descent can
  // land in the band where the dollied column is over a roof the un-dollied one is not.
  diag.frames++;
  const hard = glide.scale <= 1 + t.epsilon
    ? req0
    : requiredGlideScale(roof, tx, tz, rx, ry, rz, 0,
      clearanceMaxScale, t.fixedPointPasses, glide.scale, true, t.clearanceRefinePasses);
  if (hard > glide.scale) {
    if (hard - glide.scale > t.visibleClampScale) diag.hardFrames++;
    glide.scale = hard;
    if (glide.rate < 0) glide.rate = 0;
  }
  if (glide.scale < 1) glide.scale = 1;
  diag.scale = glide.scale;
  diag.target = target;
  if (glide.scale > diag.maxScale) diag.maxScale = glide.scale;
  return glide.scale;
}
