// PQ-007 target-relative pursuit-slot assist.
//
// This pure module observes plain body snapshots and returns one bounded additive impulse. It does
// not mutate input, physics bodies, target/weapon aim, or serialized state.

export const PURSUIT_SLOT_TUNING_V1 = Object.freeze({
  id: 'pursuitSlot.tuning.v1',
  minRange: 120,
  maxRange: 520,
  defaultRange: 240,
  pointerDeadzonePx: 1,
  pointerCurvePx: 24,
  bearingGainRadPerPx: 0.006,
  rangeGainWuPerPx: 1.15,
  settleTimeS: 1,
  velocityDampingRatio: 1.125,
  positionDeadband: 12,
  slotTolerance: 32,
  velocityTolerance: 8,
  maxAccelerationFraction: 0.5,
});

export function createPursuitSlot(options = {}) {
  const host = options.host;
  const target = options.target;
  if (!finitePosition(host) || !finitePosition(target) || target.id == null) {
    return inactiveSlot(options.source, 'invalid-selection');
  }
  const dx = host.pos.x - target.pos.x;
  const dz = host.pos.z - target.pos.z;
  const range = Math.hypot(dx, dz);
  const worldBearing = range > 1e-6 ? Math.atan2(dz, dx) : targetHeading(target);
  return {
    active: true,
    targetId: target.id,
    bearing: wrapAngle(worldBearing - targetHeading(target)),
    range: clamp(range || PURSUIT_SLOT_TUNING_V1.defaultRange,
      PURSUIT_SLOT_TUNING_V1.minRange, PURSUIT_SLOT_TUNING_V1.maxRange),
    source: options.source === 'mmb' ? 'mmb' : 'g',
    reason: 'selected',
  };
}

export function adjustPursuitSlot(slot, delta = {}, tuning = PURSUIT_SLOT_TUNING_V1) {
  if (!slot || slot.active !== true) return { ...(slot || {}) };
  const movementX = finite(delta.movementX);
  const movementY = finite(delta.movementY);
  const shapedX = shapePointerDelta(movementX, tuning);
  const shapedY = shapePointerDelta(movementY, tuning);
  if (shapedX === 0 && shapedY === 0) return { ...slot };
  return {
    ...slot,
    bearing: wrapAngle(finite(slot.bearing) + shapedX * tuning.bearingGainRadPerPx),
    range: clamp(
      finite(slot.range, tuning.defaultRange) - shapedY * tuning.rangeGainWuPerPx,
      tuning.minRange,
      tuning.maxRange
    ),
    reason: 'adjusted',
  };
}

export function stepPursuitSlotAssist(options = {}) {
  const slot = options.slot;
  const inactive = (reason) => ({
    active: false,
    impulse: null,
    telemetry: inactiveTelemetry(slot, reason),
  });
  if (!slot || slot.active !== true) return inactive('assist-off');
  if (options.manualOverride) return inactive('manual-override');
  if (!options.target || options.target.alive === false || options.target.id !== slot.targetId) {
    return inactive('target-lost');
  }
  if (!finiteBody(options.host)) return inactive('invalid-body');
  if (!finiteTarget(options.target)) return inactive('invalid-target');
  if (!Number.isFinite(slot.bearing) || !Number.isFinite(slot.range)) return inactive('invalid-slot');
  const dt = positive(options.dt, 0);
  if (!(dt > 0)) return inactive('invalid-dt');

  const tuning = options.tuning || PURSUIT_SLOT_TUNING_V1;
  const host = options.host;
  const target = options.target;
  const heading = targetHeading(target);
  const worldBearing = wrapAngle(heading + slot.bearing);
  const selectedRange = clamp(slot.range, tuning.minRange, tuning.maxRange);
  const offset = {
    x: Math.cos(worldBearing) * selectedRange,
    z: Math.sin(worldBearing) * selectedRange,
  };
  const desiredPosition = {
    x: target.pos.x + offset.x,
    z: target.pos.z + offset.z,
  };
  const error = {
    x: desiredPosition.x - host.pos.x,
    z: desiredPosition.z - host.pos.z,
  };
  const slotError = Math.hypot(error.x, error.z);
  const angularVelocity = finite(target.angVel);
  // A target-frame station rotates with the target as well as translating with it. Feed that
  // tangential velocity forward so the derivative term damps error, not the motion required to
  // ride a weaving/turning target's selected bearing.
  const desiredVelocity = {
    x: target.vel.x - angularVelocity * offset.z,
    z: target.vel.z + angularVelocity * offset.x,
  };
  const relativeVelocity = {
    x: host.vel.x - desiredVelocity.x,
    z: host.vel.z - desiredVelocity.z,
  };
  const relativeSpeed = Math.hypot(relativeVelocity.x, relativeVelocity.z);
  const settleTime = positive(tuning.settleTimeS, 1);
  const kp = 4 / (settleTime * settleTime);
  const kd = (4 * positive(tuning.velocityDampingRatio, 1)) / settleTime;
  const positionScale = slotError <= positive(tuning.positionDeadband, 12) ? 0 : kp;
  const profile = options.profile || {};
  const maxAcceleration = positive(profile.mainAccel, 40)
    * clamp(finite(tuning.maxAccelerationFraction, 0.5), 0, 1);
  // Slightly over-damped target-frame PD suppresses the saturated controller's one-crossing wobble
  // without raising the assist cap or slowing the named transition past its 2.5-second limit.
  let acceleration = {
    x: error.x * positionScale - relativeVelocity.x * kd,
    z: error.z * positionScale - relativeVelocity.z * kd,
  };
  const rawAcceleration = Math.hypot(acceleration.x, acceleration.z);
  const saturated = rawAcceleration > maxAcceleration;
  if (saturated && rawAcceleration > 1e-9) {
    const scale = maxAcceleration / rawAcceleration;
    acceleration = { x: acceleration.x * scale, z: acceleration.z * scale };
  }
  if (!Number.isFinite(acceleration.x) || !Number.isFinite(acceleration.z)) {
    return inactive('invalid-command');
  }

  const mass = positive(host.mass, 1);
  const impulse = {
    x: acceleration.x * mass * dt,
    y: 0,
    z: acceleration.z * mass * dt,
  };
  const actualRange = Math.hypot(host.pos.x - target.pos.x, host.pos.z - target.pos.z);
  return {
    active: true,
    impulse,
    telemetry: {
      active: true,
      reason: 'holding',
      targetId: slot.targetId,
      source: slot.source || 'unknown',
      bearing: round6(slot.bearing),
      range: round6(slot.range),
      actualRange: round6(actualRange),
      rangeError: round6(actualRange - slot.range),
      slotError: round6(slotError),
      relativeSpeed: round6(relativeSpeed),
      desiredPosition: { x: round6(desiredPosition.x), z: round6(desiredPosition.z) },
      desiredVelocity: { x: round6(desiredVelocity.x), z: round6(desiredVelocity.z) },
      targetAngularVelocity: round6(angularVelocity),
      acceleration: { x: round6(acceleration.x), z: round6(acceleration.z) },
      maxAcceleration: round6(maxAcceleration),
      saturated,
      withinTolerance: slotError <= tuning.slotTolerance && relativeSpeed <= tuning.velocityTolerance,
    },
  };
}

function inactiveSlot(source, reason) {
  return {
    active: false,
    targetId: null,
    bearing: 0,
    range: PURSUIT_SLOT_TUNING_V1.defaultRange,
    source: source === 'mmb' ? 'mmb' : 'g',
    reason,
  };
}

function inactiveTelemetry(slot, reason) {
  return {
    active: false,
    reason,
    targetId: slot && slot.targetId != null ? slot.targetId : null,
    source: slot && slot.source || 'unknown',
    slotError: 0,
    relativeSpeed: 0,
    saturated: false,
    withinTolerance: false,
  };
}

function shapePointerDelta(value, tuning) {
  const magnitude = Math.abs(value);
  const deadzone = Math.max(0, finite(tuning.pointerDeadzonePx, 1));
  if (magnitude <= deadzone) return 0;
  const effective = magnitude - deadzone;
  const curve = clamp(effective / positive(tuning.pointerCurvePx, 24), 0, 1);
  const gain = 0.25 + curve * 0.75;
  return Math.sign(value) * effective * gain;
}

function targetHeading(target) {
  if (target && Number.isFinite(target.rot)) return target.rot;
  const vx = finite(target && target.vel && target.vel.x);
  const vz = finite(target && target.vel && target.vel.z);
  return Math.hypot(vx, vz) > 1 ? Math.atan2(vz, vx) : 0;
}

function finitePosition(body) {
  return !!(body && body.pos && Number.isFinite(body.pos.x) && Number.isFinite(body.pos.z));
}

function finiteBody(body) {
  return finitePosition(body)
    && !!body.vel
    && Number.isFinite(body.vel.x)
    && Number.isFinite(body.vel.z)
    && Number.isFinite(body.mass)
    && body.mass > 0;
}

function finiteTarget(target) {
  return finitePosition(target)
    && !!target.vel
    && Number.isFinite(target.vel.x)
    && Number.isFinite(target.vel.z)
    && (target.angVel == null || Number.isFinite(target.angVel));
}

function wrapAngle(value) {
  let angle = finite(value) % (Math.PI * 2);
  if (angle <= -Math.PI) angle += Math.PI * 2;
  if (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function round6(value) {
  return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : 0;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}
