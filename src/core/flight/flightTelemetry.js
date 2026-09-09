// SpaceFace Flight V3 — deterministic flight-computer telemetry.
//
// This module turns physical state into information the pilot can reason with:
// velocity vector, drift/slip, stopping solution, projected stop point, closest
// approach, intercept lead and collision warnings. It is pure and can be shared by
// HUD, AI, replay probes and automated balance tests.

import { COAST_HELM_YAW_MULT, resolveTravelCeiling, TRAVEL_DRIVE_STATES } from './propulsionKernel.js';
import { travelFlag } from '../../data/featureFlags.js';

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
    actuators: computeActuatorDemand(control, axes, { forward: forwardSpeed, lateral: lateralSpeed }),
    braking,
    projectedStop: braking.projectedStop,
    precisionEnvelopeRatio: ratio(speed, positive(p.precisionSpeed, INF)),
    combatEnvelopeRatio: ratio(speed, positive(p.combatSpeed, INF)),
    target: null,
  };

  // Travel-drive forwarding (atlas D5 / W1-6). Same seam and same reasoning as S0-6: the kernel
  // computes this and presentation was left to guess. Shape-gated exactly like the kernel's own
  // publication — with the axis off not one key is attached, so this module's contribution to any
  // frozen telemetry hash is unchanged.
  if (travelFlag('travelBurn')) result.travel = resolveTravelReadout(control, p);

  if (target) result.target = computeRelativeTargetTelemetry(b, target, horizonS, p);
  return result;
}

/**
 * Assemble the travel-drive readout the velocity tape needs, from the kernel's flat publication.
 *
 * The ceiling is taken from the kernel when it published one and otherwise from
 * `resolveTravelCeiling` — never re-derived from the family table here. One rule, one owner: a
 * second copy of the ceiling derivation is precisely how the "V-MAX 3,200" fiction in D5 outlived
 * the catalogue that contradicted it.
 */
function resolveTravelReadout(control, profile) {
  const t = control && control.telemetry && typeof control.telemetry === 'object' ? control.telemetry : null;
  const published = t && typeof t.travelDrive === 'string' && TRAVEL_DRIVE_STATES.includes(t.travelDrive)
    ? t.travelDrive
    : 'off';
  const ceiling = positive(t && t.travelCeiling, 0) || resolveTravelCeiling(profile);
  const cap = Math.max(0, finite(t && t.travelCap));
  return {
    state: published,
    cap,
    ceiling,
    // Fraction of the ceiling the ramp has currently unlocked. The tape draws the earned span with
    // this; it is NOT speed/ceiling, which is a different question the tape answers separately.
    capRatio: ceiling > EPS ? clamp(cap / ceiling, 0, 1) : 0,
    active: published !== 'off',
  };
}

/**
 * Decide whether a manually-flown ship should be told to BRAKE NOW for an arrival (D5 / W1-9).
 *
 * Pure and advisory: it reports, it never commands. **This must never be wired to actually apply
 * the brake in manual flight** — D9.8 explicitly rejects auto-magic arrival, and the product
 * direction wants overshoot to remain possible. Ignoring this cue and sailing past the station is
 * the gameplay, not a bug. The route follower auto-brakes because that is its job; a hand-flown
 * burn does not.
 *
 * `brakeNow` goes true when the stopping distance the ship can still achieve has grown to meet the
 * remaining distance to the arrival ring — i.e. the last moment a stop is still free. `overshoot`
 * reports that the moment has already passed, which is information the pilot has earned the right
 * to see rather than be rescued from.
 */
export function evaluateArrivalCue(body, profile = {}, arrival = null) {
  const b = normalizeBody(body);
  const braking = estimateBrakingSolution(b, profile);
  const speed = braking.speed;
  if (!arrival || !Number.isFinite(arrival.x) || !Number.isFinite(arrival.z) || speed <= EPS) {
    return {
      active: false, brakeNow: false, overshoot: false,
      distance: INF, stopDistance: braking.directDistance, margin: INF,
      bestMode: braking.bestMode, projectedStop: braking.projectedStop, closing: false,
    };
  }

  const radius = Math.max(0, finite(arrival.radius));
  const dx = arrival.x - b.pos.x;
  const dz = arrival.z - b.pos.z;
  const distance = Math.max(0, Math.hypot(dx, dz) - radius);
  // Only cue when actually heading at the thing. Drifting past a station you are not aimed at must
  // not scream BRAKE NOW — that is the alarm-fatigue failure that makes pilots ignore real cues.
  const closingRate = distance > EPS ? (dx * b.vel.x + dz * b.vel.z) / Math.hypot(dx, dz) : 0;
  const closing = closingRate > EPS;
  // Use the mode the ship would actually fly. `bestMode` already accounts for the flip turn cost.
  const stopDistance = Math.min(braking.directDistance, braking.flipBurnDistance);
  const margin = distance - stopDistance;

  return {
    active: closing,
    brakeNow: closing && margin <= 0,
    overshoot: closing && margin < -Math.max(radius, stopDistance * 0.15),
    distance,
    stopDistance,
    margin,
    closingRate,
    closing,
    bestMode: braking.bestMode,
    projectedStop: braking.projectedStop,
    // Seconds of grace left before the stop stops being free, at the current closing rate. The tape
    // uses this to fade the cue in rather than pop it, so it reads as an approach, not an alarm.
    timeToBrakeS: closing && closingRate > EPS ? Math.max(0, margin / closingRate) : INF,
  };
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
  // Flip-and-burn turns happen while coasting, so use coast-helm yaw authority.
  const turnTime = estimateTurnTime(
    turnAngle,
    Math.abs(b.angVel),
    positive(profile.maxYawRate, 2.5) * COAST_HELM_YAW_MULT,
    positive(profile.yawAccel, 8) * COAST_HELM_YAW_MULT
  );
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

/**
 * Resolve which thrusters the drive is actually asking for, in a shape presentation can
 * consume without knowing the drive family.
 *
 * Why this exists: turning presentation was firing both bow jets instead of the opposite-side
 * jet, because the only actuator signal leaving this module was an unsigned world-space
 * `acceleration`. A renderer cannot pick a nozzle from a magnitude, so it guessed from input
 * keys — and input keys do not know about assist counter-thrust, the governor, or reverse.
 *
 * SIGN CONVENTION (ship-local, gameplay XZ plane, +X is ship-forward at yaw 0):
 *   forward > 0 → ship pushed along the nose        · forward < 0 → ship pushed aft
 *   lateral > 0 → ship pushed toward `rightUnit`, i.e. STARBOARD · lateral < 0 → PORT
 *   yaw     > 0 → nose swings toward starboard (+X rotates toward +Z). On the standard
 *                 top-down chart (+X screen-right, +Z screen-down) that reads clockwise,
 *                 hence the `yawCw`/`yawCcw` channel names — but the frame convention, not
 *                 any camera up-vector, is the definition.
 *
 * Channel names describe THE DIRECTION THE SHIP IS PUSHED, never the hull side the nozzle
 * sits on: the nozzle is always on the opposite side (`reverse` demand lights bow retros,
 * `port` demand lights starboard jets). Yaw is a couple, so `yawCw` means bow pushed to
 * starboard AND stern pushed to port. Publishing both the signed value and the two
 * non-negative channels is deliberate: re-deriving a channel from a sign at every call site
 * is exactly how the both-bow-jets bug got written in the first place.
 *
 * The signed backbone is projected from the top-level `acceleration`/`angularAcceleration`,
 * which every family publishes, so gravimetric and sail — which never emit `manualLocal` —
 * still light the correct nozzle. Projecting the applied acceleration (rather than the pilot
 * axis) is also what presentation wants: assisted drift-kill fires real RCS with no pilot
 * input at all. Caveat: for families that fold environmental drag into `acceleration` this
 * block attributes that drag to a nozzle. Drag is zero outside authored nebulae and capped
 * inside them, so this is left uncorrected rather than made family-specific.
 *
 * `manual`/`assist`/`governor` are provenance and vary by family; they are zeroed, never
 * dropped, so the key set is identical for every drive and for `control = null`.
 */
function computeActuatorDemand(control, axes, localVelocity) {
  const t = control && control.telemetry && typeof control.telemetry === 'object' ? control.telemetry : null;
  const world = t ? vec(t.acceleration) : { x: 0, z: 0 };
  const forward = world.x * axes.fx + world.z * axes.fz;
  const lateral = world.x * axes.rx + world.z * axes.rz;
  const yaw = finite(t && t.angularAcceleration);
  const manual = t && t.manualLocal ? t.manualLocal : null;
  const assist = t && t.assistLocal ? t.assistLocal : null;
  const governor = t && t.governor && typeof t.governor === 'object' ? t.governor : null;
  const reason = t && typeof t.assistReason === 'string' ? t.assistReason : 'none';
  const driveState = t && typeof t.driveState === 'string' ? t.driveState : 'idle';
  // Two different questions, deliberately two flags. `braking` is the physical one — is this
  // drive spending authority against its own velocity — and is derived here because it is true
  // for every family regardless of what the kernel chose to publish. `pilotBrake` is the
  // narrower "the pilot pulled the brake actuator", and only reaction (assistReason) and
  // pulse-plate (auto flip-burn) publish enough to answer it, so it stays false elsewhere
  // rather than being faked. Neither reads an input key: both are physics outputs, which is the
  // whole point of moving this off the renderer's guesswork.
  const braking = forward * finite(localVelocity && localVelocity.forward)
    + lateral * finite(localVelocity && localVelocity.lateral) < -EPS;
  const pilotBrake = reason === 'pilot-brake' || driveState === 'flip-burn';
  const governorEngaged = !!(governor && governor.engaged);
  const overspeed = !!(governor && governor.overspeed);
  const boostFraction = clamp(finite(t && t.boostFraction), 0, 1);

  return {
    forward,
    lateral,
    yaw,
    yawRateTarget: finite(t && t.targetYawRate),
    main: Math.max(0, forward),
    reverse: Math.max(0, -forward),
    starboard: Math.max(0, lateral),
    port: Math.max(0, -lateral),
    yawCw: Math.max(0, yaw),
    yawCcw: Math.max(0, -yaw),
    manual: { forward: finite(manual && manual.forward), lateral: finite(manual && manual.lateral) },
    assist: { forward: finite(assist && assist.forward), lateral: finite(assist && assist.lateral), reason },
    governor: {
      engaged: governorEngaged,
      overspeed,
      // Both caps read 0 when the governor has no opinion this tick; check `engaged` first
      // rather than treating 0 as "commanded to a standstill".
      cap: positive(governor && governor.cap, 0),
      baseCap: positive(governor && governor.baseCap, 0),
      physicsEarned: !!(governor && governor.physicsEarned),
    },
    // Applied-versus-requested authority. The speed governor is the only demand clamp the
    // kernel publishes; the hard per-axis envelope clamp is not observable from here, so it is
    // deliberately not claimed rather than guessed at from a residual.
    limited: governorEngaged,
    limitReason: governorEngaged ? (overspeed ? 'governor-overspeed' : 'governor-cap') : 'none',
    driveState,
    assistMode: t && typeof t.assistMode === 'string' ? t.assistMode : 'none',
    braking,
    pilotBrake,
    boosting: boostFraction > 0,
    boostFraction,
    coastHelm: !!(t && t.coastHelm),
    impulseDeltaV: Math.max(0, finite(t && t.firedDeltaV)),
  };
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
