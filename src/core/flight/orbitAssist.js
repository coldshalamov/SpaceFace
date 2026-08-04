// Anchor-relative yaw assist.
//
// A tether is only a physical rope. This helper owns one optional convenience: while the pilot
// explicitly holds forward + turn, request the yaw rate that keeps the ship tangent to the live
// ship-to-anchor radius. It never owns thrust, boost, strafe, braking, speed, or radial force.

export const ORBIT_ASSIST_TUNING_V1 = Object.freeze({
  id: 'orbitAssist.tuning.v1',
  minIntent: 0.05,
  tangentAlignTimeS: 0.55,
});

export const ORBIT_ASSIST_STRENGTH = Object.freeze({
  full: 1,
  standard: 1,
  light: 0.5,
  off: 0,
});

export function stepAnchorRelativeOrbitAssist(options = {}) {
  const input = { ...(options.input || {}) };
  const strength = normalizeStrength(options.strength);
  const strengthScale = ORBIT_ASSIST_STRENGTH[strength];
  const inactive = (reason) => ({
    active: false,
    input,
    telemetry: inactiveTelemetry(strength, reason),
  });

  if (!(strengthScale > 0)) return inactive('assist-off');
  if (!(positive(options.dt, 0) > 0) || !finiteBody(options.host) || !finiteBody(options.anchor)
      || options.anchor.alive === false) return inactive('invalid-body');
  if (!options.tether || options.tether.active !== true || options.tether.targetId == null) {
    return inactive('not-tethered');
  }

  const forward = finite(options.flightIntent && options.flightIntent.forward);
  const selectedDirection = Math.sign(finite(options.flightIntent && options.flightIntent.lateral));
  if (!(forward > ORBIT_ASSIST_TUNING_V1.minIntent)) return inactive('no-forward-intent');
  if (selectedDirection === 0) return inactive('no-lateral-intent');
  if (input.brake || options.controlsBlocked) return inactive('manual-override');

  const host = options.host;
  const anchor = options.anchor;
  const rx = finite(host.pos.x) - finite(anchor.pos.x);
  const rz = finite(host.pos.z) - finite(anchor.pos.z);
  const radius = Math.hypot(rx, rz);
  if (!(radius > 1e-6)) return inactive('degenerate-radius');

  const relVx = finite(host.vel.x) - finite(anchor.vel.x);
  const relVz = finite(host.vel.z) - finite(anchor.vel.z);
  const rHatX = rx / radius;
  const rHatZ = rz / radius;
  const tangentX = -rHatZ * selectedDirection;
  const tangentZ = rHatX * selectedDirection;
  const radialSpeed = relVx * rHatX + relVz * rHatZ;
  const tangentialSpeed = relVx * tangentX + relVz * tangentZ;

  // d(theta)/dt = cross(radius, relativeVelocity) / |radius|^2. That one kinematic
  // relationship is the whole detector: a shorter line or faster swing requests more yaw; a
  // longer line or slower swing requests less. Heading error only brings the nose onto the chosen
  // tangent, then falls to zero and leaves the exact angular-rate feed-forward term.
  const orbitalYawRate = (rx * relVz - rz * relVx) / (radius * radius);
  const desiredHeading = Math.atan2(tangentZ, tangentX);
  const headingError = wrapAngle(desiredHeading - finite(host.rot));
  const alignmentYawRate = headingError
    / (ORBIT_ASSIST_TUNING_V1.tangentAlignTimeS / strengthScale);
  const maxYawRate = positive(options.profile && options.profile.maxYawRate, 1);
  const rawDesiredYawRate = orbitalYawRate + alignmentYawRate;
  const desiredYawRate = clamp(rawDesiredYawRate, -maxYawRate, maxYawRate);
  const turn = desiredYawRate / maxYawRate;

  return {
    active: true,
    input: { ...input, turn },
    telemetry: {
      tuning: ORBIT_ASSIST_TUNING_V1.id,
      strength,
      direction: selectedDirection,
      selectedDirection,
      intentSource: 'flight',
      radius,
      restLength: positive(options.tether.restLength, radius),
      radialSpeed,
      tangentialSpeed,
      desiredHeading,
      headingError,
      orbitalYawRate,
      desiredYawRate,
      turnIntent: turn,
      saturated: desiredYawRate !== rawDesiredYawRate,
      reason: String(options.tether.phase || 'slack') === 'slack' ? 'line-slack' : 'engaged',
    },
  };
}

function inactiveTelemetry(strength, reason) {
  return {
    tuning: ORBIT_ASSIST_TUNING_V1.id,
    strength,
    direction: 0,
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

function wrapAngle(value) {
  let angle = finite(value) % (Math.PI * 2);
  if (angle <= -Math.PI) angle += Math.PI * 2;
  if (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}
