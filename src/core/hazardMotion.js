// Pure deterministic motion geometry for world-owned spatial hazards.
//
// Authored hazards keep an immutable origin and derive their live center from sim time. Nothing is
// integrated frame-to-frame, so save/Continue, re-entry, and different fixed-step groupings return
// the same physical pressure at the same simulation time.

const TAU = Math.PI * 2;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
  const number = finite(value, fallback);
  return number > 0 ? number : fallback;
}

function wrap01(value) {
  return ((value % 1) + 1) % 1;
}

function motionFor(hazard) {
  const motion = hazard && hazard.motion;
  if (!hazard?.moving || !motion || motion.kind !== 'orbit') return null;
  return motion;
}

export function hazardMotionPhaseAt(hazard, simTime) {
  const motion = motionFor(hazard);
  if (!motion) return 0;
  const periodS = positive(motion.periodS, 1);
  return wrap01(
    (Math.max(0, finite(simTime, 0)) + finite(motion.phaseOffsetS, 0)) / periodS
      + finite(motion.phaseTurns, 0),
  );
}

export function hazardCenterAt(hazard, simTime, out = {}) {
  const source = hazard?.originCenter || hazard?.center || { x: 0, z: 0 };
  const originX = finite(source.x, 0);
  const originZ = finite(source.z, 0);
  const motion = motionFor(hazard);
  if (!motion) {
    out.x = originX;
    out.z = originZ;
    return out;
  }
  const angle = hazardMotionPhaseAt(hazard, simTime) * TAU;
  out.x = originX + Math.cos(angle) * Math.max(0, finite(motion.radiusX, 0));
  out.z = originZ + Math.sin(angle) * Math.max(0, finite(motion.radiusZ, 0));
  return out;
}

export function hazardClearanceAt(hazard, point, simTime) {
  if (!hazard || !point) return Infinity;
  const center = hazardCenterAt(hazard, simTime);
  const dx = finite(point.x, 0) - center.x;
  const dz = finite(point.z, 0) - center.z;
  return Math.hypot(dx, dz) - Math.max(0, finite(hazard.radius, 0));
}

export function hazardContainsPointAt(hazard, point, simTime) {
  return hazardClearanceAt(hazard, point, simTime) <= 0;
}

// Used only for a blocked interaction receipt, not per-tick world motion. A bounded phase scan plus
// a small bisection gives the HUD a stable next-clear estimate without creating a second timer.
export function nextHazardClearAt(hazard, point, simTime) {
  const motion = motionFor(hazard);
  const now = Math.max(0, finite(simTime, 0));
  if (!motion || !hazardContainsPointAt(hazard, point, now)) return null;
  const periodS = positive(motion.periodS, 1);
  const sampleS = periodS / 96;
  let coveredAt = now;
  for (let sample = 1; sample <= 96; sample++) {
    const candidate = now + sample * sampleS;
    if (hazardContainsPointAt(hazard, point, candidate)) {
      coveredAt = candidate;
      continue;
    }
    let low = coveredAt;
    let high = candidate;
    for (let iteration = 0; iteration < 8; iteration++) {
      const middle = (low + high) * 0.5;
      if (hazardContainsPointAt(hazard, point, middle)) low = middle;
      else high = middle;
    }
    return Math.round(high * 1000) / 1000;
  }
  return null;
}
