// SpaceFace Flight V3 — deterministic flight-computer telemetry.
//
// This module turns physical state into information the pilot can reason with:
// velocity vector, drift/slip, stopping solution, projected stop point, closest
// approach, intercept lead and collision warnings. It is pure and can be shared by
// HUD, AI, replay probes and automated balance tests.

const EPS = 1e-9;
const INF = Number.POSITIVE_INFINITY;

export function computeFlightTelemetry({ body, profile, control = null, target = null, horizonS = 12 } = {}) {
  const b = normalizeBody(body);
  const p = profile || {};
  const axes = localAxes(b.rot);
  const speed = Math.hypot(b.vel.x, b.vel.z);
  const forwardSpeed = b.vel.x * axes.fx + b.vel.z * axes.fz;
  const lateralSpeed = b.vel.x * axes.rx + b.vel.z * axes.rz;
  const velocityHeading = speed > EPS ? Math.atan2(b.vel.z, b.vel.x) : b.rot;
  const driftAngle = speed > EPS ? wrapAngle(velocityHeading - b.rot) : 0;
  const braking = estimateBrakingSolution(b, p);
  const result = {
    speed,
    forwardSpeed,
    lateralSpeed,
    velocityHeading,
    driftAngle,
    velocityUnit: speed > EPS ? { x: b.vel.x / speed, z: b.vel.z / speed } : { x: axes.fx, z: axes.fz },
    noseUnit: { x: axes.fx, z: axes.fz },
    rightUnit: { x: axes.rx, z: axes.rz },
    acceleration: control && control.telemetry && control.telemetry.acceleration
      ? vec(control.telemetry.acceleration)
      : { x: 0, z: 0 },
    braking,
    projectedStop: braking.projectedStop,
    precisionEnvelopeRatio: ratio(speed, positive(p.precisionSpeed, INF)),
    combatEnvelopeRatio: ratio(speed, positive(p.combatSpeed, INF)),
    target: null,
  };

  if (target) result.target = computeRelativeTargetTelemetry(b, target, horizonS, p);
  return result;
}

/**
 * Estimate the fastest stop available without inventing drag.
 *
 * `direct` assumes the ship holds its current attitude and uses whatever mix of
 * forward/reverse/lateral thrusters points opposite the velocity vector.
 * `flipBurn` includes an estimated turn to point the main drive opposite velocity.
 */
export function estimateBrakingSolution(body, profile = {}) {
  const b = normalizeBody(body);
  const speed = Math.hypot(b.vel.x, b.vel.z);
  if (speed <= EPS) {
    return {
      speed: 0,
      directAccel: 0,
      directTimeS: 0,
      directDistance: 0,
      flipTurnTimeS: 0,
      flipBurnAccel: 0,
      flipBurnTimeS: 0,
      flipBurnDistance: 0,
      bestMode: 'stopped',
      projectedStop: { x: b.pos.x, z: b.pos.z },
    };
  }

  const axes = localAxes(b.rot);
  const stopDir = { x: -b.vel.x / speed, z: -b.vel.z / speed };
  const stopLocal = {
    forward: stopDir.x * axes.fx + stopDir.z * axes.fz,
    lateral: stopDir.x * axes.rx + stopDir.z * axes.rz,
  };

  const family = String(profile.family || 'reaction');
  let directAccel;
  let flipBurnAccel;

  if (family === 'gravimetric') {
    directAccel = positive(profile.maxBrakeAccel, positive(profile.maxAccel, 80));
    flipBurnAccel = directAccel;
  } else if (family === 'pulse_plate') {
    directAccel = directionalEnvelopeAccel(stopLocal, {
      forward: positive(profile.rcsForwardAccel, 10),
      reverse: positive(profile.rcsReverseAccel, 8),
      strafe: positive(profile.rcsStrafeAccel, 6),
    });
    const maxCharge = positive(profile.maxChargeS, 2);
    const maxDv = positive(profile.maxImpulseDv, 200);
    flipBurnAccel = maxDv / Math.max(maxCharge + positive(profile.pulseCooldownS, 0.3), 0.1);
  } else {
    directAccel = directionalEnvelopeAccel(stopLocal, {
      forward: positive(profile.mainAccel, 40),
      reverse: positive(profile.reverseAccel, positive(profile.mainAccel, 40) * 0.55),
      strafe: positive(profile.strafeAccel, positive(profile.mainAccel, 40) * 0.45),
    });
    flipBurnAccel = positive(profile.mainAccel, 40);
  }

  const desiredFlipHeading = Math.atan2(b.vel.z, b.vel.x) + Math.PI;
  const turnAngle = Math.abs(wrapAngle(desiredFlipHeading - b.rot));
  const turnTime = estimateTurnTime(turnAngle, Math.abs(b.angVel), positive(profile.maxYawRate, 2.5), positive(profile.yawAccel, 8));
  const directTime = directAccel > EPS ? speed / directAccel : INF;
  const directDistance = directAccel > EPS ? speed * speed / (2 * directAccel) : INF;
  const flipBurnTime = flipBurnAccel > EPS ? turnTime + speed / flipBurnAccel : INF;
  // During the turn the ship roughly coasts. This deliberately errs long rather than
  // selling the pilot a fantasy stop marker.
  const flipBurnDistance = flipBurnAccel > EPS
    ? speed * turnTime + speed * speed / (2 * flipBurnAccel)
    : INF;
  const bestMode = directDistance <= flipBurnDistance ? 'direct-counterthrust' : 'flip-and-burn';
  const bestDistance = Math.min(directDistance, flipBurnDistance);
  const unit = { x: b.vel.x / speed, z: b.vel.z / speed };

  return {
    speed,
    directAccel,
    directTimeS: directTime,
    directDistance,
    flipTurnTimeS: turnTime,
    flipBurnAccel,
    flipBurnTimeS: flipBurnTime,
    flipBurnDistance,
    bestMode,
    projectedStop: {
      x: b.pos.x + unit.x * bestDistance,
      z: b.pos.z + unit.z * bestDistance,
    },
  };
}

export function computeRelativeTargetTelemetry(body, target, horizonS = 12, profile = {}) {
  const b = normalizeBody(body);
  const t = normalizeTarget(target);
  const relPos = { x: t.pos.x - b.pos.x, z: t.pos.z - b.pos.z };
  const relVel = { x: t.vel.x - b.vel.x, z: t.vel.z - b.vel.z };
  const distance = Math.hypot(relPos.x, relPos.z);
  const relSpeed2 = relVel.x * relVel.x + relVel.z * relVel.z;
  const closestTimeRaw = relSpeed2 > EPS
    ? -(relPos.x * relVel.x + relPos.z * relVel.z) / relSpeed2
    : 0;
  const closestTimeS = clamp(closestTimeRaw, 0, Math.max(0, horizonS));
  const closestVector = {
    x: relPos.x + relVel.x * closestTimeS,
    z: relPos.z + relVel.z * closestTimeS,
  };
  const closestDistance = Math.hypot(closestVector.x, closestVector.z);
  const radialSpeed = distance > EPS
    ? (relPos.x * relVel.x + relPos.z * relVel.z) / distance
    : 0;
  const closingSpeed = -radialSpeed;
  const timeToContact = solveCircleContact(relPos, relVel, positive(target.radius, 0) + positive(body.radius, 0));
  const safeStop = estimateBrakingSolution(b, profile);

  return {
    id: target.id ?? null,
    distance,
    bearing: Math.atan2(relPos.z, relPos.x),
    relativePosition: relPos,
    relativeVelocity: relVel,
    closingSpeed,
    closestTimeS,
    closestDistance,
    collisionTimeS: timeToContact,
    collisionRisk: Number.isFinite(timeToContact) && timeToContact <= horizonS,
    canStopBeforeClosestApproach: Number.isFinite(safeStop.directDistance)
      ? safeStop.directDistance < Math.max(0, distance - positive(target.radius, 0) - positive(body.radius, 0))
      : false,
  };
}

/** Solve a constant-velocity projectile lead. Null means no physical intercept. */
export function solveIntercept(shooterPos, shooterVel, targetPos, targetVel, projectileSpeed, maxTimeS = 20) {
  const p = {
    x: finite(targetPos && targetPos.x) - finite(shooterPos && shooterPos.x),
    z: finite(targetPos && targetPos.z) - finite(shooterPos && shooterPos.z),
  };
  const v = {
    x: finite(targetVel && targetVel.x) - finite(shooterVel && shooterVel.x),
    z: finite(targetVel && targetVel.z) - finite(shooterVel && shooterVel.z),
  };
  const s = positive(projectileSpeed, 0);
  if (!(s > 0)) return null;

  const a = v.x * v.x + v.z * v.z - s * s;
  const b = 2 * (p.x * v.x + p.z * v.z);
  const c = p.x * p.x + p.z * p.z;
  let t = INF;
  if (Math.abs(a) < EPS) {
    if (Math.abs(b) > EPS) t = -c / b;
  } else {
    const d = b * b - 4 * a * c;
    if (d >= 0) {
      const root = Math.sqrt(d);
      const t0 = (-b - root) / (2 * a);
      const t1 = (-b + root) / (2 * a);
      if (t0 > EPS) t = t0;
      if (t1 > EPS) t = Math.min(t, t1);
    }
  }
  if (!Number.isFinite(t) || t <= 0 || t > maxTimeS) return null;
  const aimPoint = {
    x: finite(targetPos && targetPos.x) + finite(targetVel && targetVel.x) * t,
    z: finite(targetPos && targetPos.z) + finite(targetVel && targetVel.z) * t,
  };
  return { timeS: t, aimPoint, angle: Math.atan2(aimPoint.z - finite(shooterPos && shooterPos.z), aimPoint.x - finite(shooterPos && shooterPos.x)) };
}

export class FlightTelemetryBuffer {
  constructor(capacity = 240) {
    this.capacity = Math.max(2, Math.trunc(capacity));
    this.samples = new Array(this.capacity);
    this.index = 0;
    this.count = 0;
  }

  push(tick, telemetry) {
    this.samples[this.index] = Object.freeze({ tick: Math.trunc(finite(tick)), ...telemetry });
    this.index = (this.index + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
  }

  latest() {
    if (!this.count) return null;
    return this.samples[(this.index - 1 + this.capacity) % this.capacity] || null;
  }

  toArray() {
    const out = [];
    const start = (this.index - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) out.push(this.samples[(start + i) % this.capacity]);
    return out;
  }

  clear() {
    this.samples.fill(undefined);
    this.index = 0;
    this.count = 0;
  }
}

function directionalEnvelopeAccel(localDirection, limits) {
  let max = INF;
  const f = finite(localDirection.forward);
  const l = finite(localDirection.lateral);
  if (Math.abs(f) > EPS) {
    const available = f >= 0 ? positive(limits.forward, 0) : positive(limits.reverse, 0);
    max = Math.min(max, available / Math.abs(f));
  }
  if (Math.abs(l) > EPS) max = Math.min(max, positive(limits.strafe, 0) / Math.abs(l));
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}

function estimateTurnTime(angle, initialRate, maxRate, maxAccel) {
  if (angle <= EPS) return 0;
  // Conservative trapezoidal estimate: accelerate to max rate, rotate, brake.
  const accelTime = Math.max(0, (maxRate - Math.min(initialRate, maxRate)) / maxAccel);
  const accelAngle = Math.min(angle / 2, (initialRate * accelTime + 0.5 * maxAccel * accelTime * accelTime));
  const remaining = Math.max(0, angle - 2 * accelAngle);
  return accelTime * 2 + remaining / maxRate;
}

function solveCircleContact(relPos, relVel, radius) {
  const a = relVel.x * relVel.x + relVel.z * relVel.z;
  const b = 2 * (relPos.x * relVel.x + relPos.z * relVel.z);
  const c = relPos.x * relPos.x + relPos.z * relPos.z - radius * radius;
  if (c <= 0) return 0;
  if (a <= EPS) return INF;
  const d = b * b - 4 * a * c;
  if (d < 0) return INF;
  const root = Math.sqrt(d);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  if (t0 >= 0) return t0;
  if (t1 >= 0) return t1;
  return INF;
}

function normalizeBody(body = {}) {
  return {
    pos: vec(body.pos),
    vel: vec(body.vel),
    rot: finite(body.rot),
    angVel: finite(body.angVel),
    mass: positive(body.mass, 1),
    radius: positive(body.radius, 0),
  };
}

function normalizeTarget(target = {}) {
  return { id: target.id, pos: vec(target.pos), vel: vec(target.vel), radius: positive(target.radius, 0) };
}

function vec(v) { return { x: finite(v && v.x), z: finite(v && v.z) }; }
function localAxes(rot) { const c = Math.cos(rot), s = Math.sin(rot); return { fx: c, fz: s, rx: -s, rz: c }; }
function ratio(value, limit) { return Number.isFinite(limit) && limit > 0 ? value / limit : 0; }
function wrapAngle(v) { let x = finite(v) % (Math.PI * 2); if (x <= -Math.PI) x += Math.PI * 2; if (x > Math.PI) x -= Math.PI * 2; return x; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function finite(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }
function positive(v, fallback) { return Number.isFinite(v) && v > 0 ? v : fallback; }
