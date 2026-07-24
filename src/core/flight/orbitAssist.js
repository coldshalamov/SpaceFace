// PQ-005 / T05 anchor-relative orbit assist.
//
// This module is pure: it observes two body snapshots plus explicit pilot intent, then returns a
// normal Flight V3 input and an additive physics-authority impulse. The frame is always relative:
// a light or similarly-massed target may move as the tether transmits force, but the requested ship
// heading stays tangent to the live ship-to-target vector. It never writes either body's position,
// velocity, rotation, angular velocity, or serialized state.

export const ORBIT_ASSIST_TUNING_V1 = Object.freeze({
  id: 'orbitAssist.tuning.v1',
  settleTimeS: 2,
  dampingRatio: 1,
  radialKp: 4,
  radialKd: 4,
  maxRadialAccelerationFraction: 0.2,
  anchorRadiusMargin: 1.15,
  minIntent: 0.05,
  flightIntentHoldS: 1,
  reversalSlewPerS: 2,
  tangentAlignTimeS: 0.55,
  strainThrottleStart: 0.72,
  strainThrottleStop: 1.05,
  strainThrottleFloor: 0.05,
});

export const ORBIT_ASSIST_STRENGTH = Object.freeze({
  full: 1,
  standard: 0.75,
  light: 0.4,
  off: 0,
});

export function stepAnchorRelativeOrbitAssist(options = {}) {
  const input = { ...(options.input || {}) };
  const strength = normalizeStrength(options.strength);
  const strengthScale = ORBIT_ASSIST_STRENGTH[strength];
  const host = options.host;
  const anchor = options.anchor;
  const tether = options.tether;
  const intent = options.intent;
  const flightIntent = options.flightIntent;
  const dt = positive(options.dt, 0);
  const inactive = (reason) => ({
    active: false,
    input,
    impulse: null,
    runtime: { direction: 0, engaged: false, intentSource: null, flightIntentHoldS: 0 },
    telemetry: inactiveTelemetry(strength, reason),
  });
  const suspended = (reason, direction, intentSource, flightIntentHoldS) => ({
    active: false,
    input,
    impulse: null,
    runtime: { direction, engaged: true, intentSource, flightIntentHoldS },
    telemetry: {
      ...inactiveTelemetry(strength, reason),
      direction,
      intentSource,
      engagementHoldS: flightIntentHoldS,
    },
  });

  if (!(strengthScale > 0)) return inactive('assist-off');
  if (!(dt > 0) || !finiteBody(host) || !finiteBody(anchor) || anchor.alive === false) return inactive('invalid-body');
  if (!tether || tether.active !== true || tether.targetId == null) return inactive('not-tethered');
  const lineControl = !!(intent && intent.lineControl === true);
  const intentSource = lineControl ? 'massline' : 'flight';
  const selectedDirection = Math.sign(finite(lineControl
    ? intent.orbitDirection
    : flightIntent && flightIntent.lateral));
  if (selectedDirection === 0) return inactive('no-lateral-intent');
  const forwardHeld = lineControl
    ? finite(intent.lineLength) < -ORBIT_ASSIST_TUNING_V1.minIntent
    : finite(flightIntent && flightIntent.forward) > ORBIT_ASSIST_TUNING_V1.minIntent;
  const continuing = !!(options.runtime && options.runtime.engaged
    && options.runtime.intentSource === intentSource);
  if (!forwardHeld && !(lineControl && continuing)) return inactive('no-forward-intent');
  if (input.brake || options.throwArmed || options.controlsBlocked) return inactive('manual-override');
  const previousHoldS = options.runtime && options.runtime.intentSource === 'flight'
    && Math.sign(finite(options.runtime.direction)) === selectedDirection
    ? Math.max(0, finite(options.runtime.flightIntentHoldS))
    : 0;
  const flightIntentHoldS = intentSource === 'flight'
    ? previousHoldS + dt
    : 0;
  if (intentSource === 'flight' && !continuing
      && flightIntentHoldS < ORBIT_ASSIST_TUNING_V1.flightIntentHoldS) {
    return {
      active: false,
      input,
      impulse: null,
      runtime: {
        direction: selectedDirection,
        engaged: false,
        intentSource,
        flightIntentHoldS,
      },
      telemetry: {
        ...inactiveTelemetry(strength, 'engage-pending'),
        direction: selectedDirection,
        selectedDirection,
        intentSource,
        engagementHoldS: flightIntentHoldS,
      },
    };
  }
  if (String(tether.phase || 'slack') === 'slack') {
    const heldDirection = clamp(finite(options.runtime && options.runtime.direction, selectedDirection), -1, 1);
    return suspended('line-slack', heldDirection, intentSource, flightIntentHoldS);
  }

  const hostMass = positive(host.mass, positive(host.physicsBody && host.physicsBody.mass, 0));
  if (!(hostMass > 0)) return inactive('invalid-host-mass');

  const rx = finite(host.pos.x) - finite(anchor.pos.x);
  const rz = finite(host.pos.z) - finite(anchor.pos.z);
  const radius = Math.hypot(rx, rz);
  if (!(radius > 1e-6)) return inactive('degenerate-radius');
  const previousDirection = clamp(finite(options.runtime && options.runtime.direction), -1, 1);
  const direction = previousDirection !== 0 && Math.sign(previousDirection) !== selectedDirection
    ? approach(previousDirection, selectedDirection, ORBIT_ASSIST_TUNING_V1.reversalSlewPerS * dt)
    : selectedDirection;
  const tangentSign = Math.sign(direction) || selectedDirection;
  const rHatX = rx / radius;
  const rHatZ = rz / radius;
  const tangentX = -rHatZ * tangentSign;
  const tangentZ = rHatX * tangentSign;
  const relVx = finite(host.vel.x) - finite(anchor.vel.x);
  const relVz = finite(host.vel.z) - finite(anchor.vel.z);
  const radialSpeed = relVx * rHatX + relVz * rHatZ;
  const tangentialSpeed = relVx * tangentX + relVz * tangentZ;
  const restLength = positive(tether.restLength, radius);
  const lengthError = radius - restLength;

  const profile = options.profile || {};
  const maxThrustAcceleration = positive(profile.mainAccel, positive(profile.maxAcceleration, 0));
  const maxRadialAcceleration = maxThrustAcceleration
    * ORBIT_ASSIST_TUNING_V1.maxRadialAccelerationFraction
    * strengthScale;
  const rawRadialAcceleration = -ORBIT_ASSIST_TUNING_V1.radialKp * lengthError
    - ORBIT_ASSIST_TUNING_V1.radialKd * radialSpeed;
  const radialAcceleration = clamp(rawRadialAcceleration, -maxRadialAcceleration, maxRadialAcceleration);

  const maxYawRate = positive(profile.maxYawRate, 1);
  const minRadius = Math.max(1, positive(anchor.radius, 0) * ORBIT_ASSIST_TUNING_V1.anchorRadiusMargin);
  const desiredHeading = Math.atan2(tangentZ, tangentX);
  const headingError = wrapAngle(desiredHeading - finite(host.rot));
  const directionAuthority = Math.abs(direction);
  const orbitalYawRate = tangentialSpeed / Math.max(radius, minRadius) * directionAuthority;
  const alignmentYawRate = headingError / ORBIT_ASSIST_TUNING_V1.tangentAlignTimeS;
  const desiredYawRate = clamp(
    orbitalYawRate + alignmentYawRate,
    -maxYawRate,
    maxYawRate,
  );
  const turn = clamp(desiredYawRate / maxYawRate, -1, 1);
  const impulseScale = hostMass * dt * radialAcceleration;
  const impulse = {
    x: canonicalZero(rHatX * impulseScale),
    y: 0,
    z: canonicalZero(rHatZ * impulseScale),
  };
  const strain = Math.max(0, finite(tether.strain));
  const throttle = Math.max(
    ORBIT_ASSIST_TUNING_V1.strainThrottleFloor,
    clamp(
      (ORBIT_ASSIST_TUNING_V1.strainThrottleStop - strain)
        / (ORBIT_ASSIST_TUNING_V1.strainThrottleStop - ORBIT_ASSIST_TUNING_V1.strainThrottleStart),
      0,
      1,
    ),
  );

  return {
    active: true,
    input: { ...input, throttle, strafe: 0, turn, brake: false },
    impulse,
    runtime: { direction, engaged: true, intentSource, flightIntentHoldS },
    telemetry: {
      tuning: ORBIT_ASSIST_TUNING_V1.id,
      strength,
      direction,
      selectedDirection,
      intentSource,
      engagementHoldS: flightIntentHoldS,
      radius,
      restLength,
      lengthError,
      radialSpeed,
      tangentialSpeed,
      headingError,
      orbitalYawRate,
      desiredYawRate,
      turnIntent: turn,
      throttle,
      strain,
      strainLimited: throttle < 1,
      radialAcceleration,
      maxRadialAcceleration,
      saturated: Math.abs(rawRadialAcceleration) > maxRadialAcceleration,
      reason: 'engaged',
    },
  };
}

function inactiveTelemetry(strength, reason) {
  return {
    tuning: ORBIT_ASSIST_TUNING_V1.id,
    strength,
    direction: 0,
    radialAcceleration: 0,
    maxRadialAcceleration: 0,
    saturated: false,
    reason,
  };
}

function normalizeStrength(value) {
  const key = String(value || 'standard').toLowerCase();
  return Object.prototype.hasOwnProperty.call(ORBIT_ASSIST_STRENGTH, key) ? key : 'standard';
}

function finiteBody(body) {
  return !!(body && body.pos && body.vel
    && Number.isFinite(Number(body.pos.x)) && Number.isFinite(Number(body.pos.z))
    && Number.isFinite(Number(body.vel.x)) && Number.isFinite(Number(body.vel.z)));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positive(value, fallback = 0) {
  const n = finite(value, fallback);
  return n > 0 ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value)));
}

function approach(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta);
  if (value > target) return Math.max(target, value - maxDelta);
  return target;
}

function canonicalZero(value) {
  return value === 0 ? 0 : value;
}

function wrapAngle(value) {
  let angle = finite(value) % (Math.PI * 2);
  if (angle <= -Math.PI) angle += Math.PI * 2;
  if (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}
