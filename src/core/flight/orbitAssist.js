// Anchor-relative yaw assist.
//
// A tether is only a physical rope. This helper owns one optional convenience: while the pilot
// explicitly holds forward + turn, request the yaw rate that keeps the ship tangent to the live
// ship-to-anchor radius. It never owns thrust, boost, strafe, braking, speed, or radial force.

export const ORBIT_ASSIST_TUNING_V1 = Object.freeze({
  id: 'orbitAssist.tuning.v1',
  minIntent: 0.05,
  tangentAlignTimeS: 0.55,
  // Heading alignment is only a quiet bridge onto the selected tangent. It must not flatten the
  // actual inverse-radius orbital-rate read into full manual yaw when a latch begins radial-facing.
  maxHeadingCorrectionRateFraction: 0.35,
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
  const maxYawRate = positive(options.profile && options.profile.maxYawRate, 1);
  const headingCorrectionLimit = maxYawRate
    * ORBIT_ASSIST_TUNING_V1.maxHeadingCorrectionRateFraction
    * strengthScale;
  // Far outside the proportional correction cone, preserve the orbit direction chosen by the
  // held key. Once the nose enters the unsaturated cone, ordinary shortest-path trim can correct
  // either side without turning a small overshoot into a full revolution.
  const headingCaptureAngle = headingCorrectionLimit
    * (ORBIT_ASSIST_TUNING_V1.tangentAlignTimeS / strengthScale);
  const desiredHeading = Math.atan2(tangentZ, tangentX);
  const headingSelection = selectedTangentHeadingError(
    desiredHeading,
    finite(host.rot),
    selectedDirection,
    headingCaptureAngle,
  );
  const headingError = headingSelection.headingError;
  const rawAlignmentYawRate = headingError
    / (ORBIT_ASSIST_TUNING_V1.tangentAlignTimeS / strengthScale);
  const alignmentYawRate = clamp(
    rawAlignmentYawRate,
    -headingCorrectionLimit,
    headingCorrectionLimit,
  );
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
      shortestHeadingError: headingSelection.shortestHeadingError,
      headingError,
      headingDirectionCommitted: headingSelection.directionCommitted,
      headingCaptureAngle,
      orbitalYawRate,
      rawAlignmentYawRate,
      alignmentYawRate,
      headingCorrectionLimit,
      headingCorrectionSaturated: alignmentYawRate !== rawAlignmentYawRate,
      maxYawRate,
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

function selectedTangentHeadingError(
  desiredHeading,
  currentHeading,
  selectedDirection,
  captureAngle,
) {
  const shortestHeadingError = wrapAngle(desiredHeading - currentHeading);
  const direction = Math.sign(finite(selectedDirection));
  const outsideCapture = Math.abs(shortestHeadingError) + 1e-12
    >= positive(captureAngle);
  const directionCommitted = outsideCapture
    && direction !== 0
    && shortestHeadingError * direction < 0;
  return {
    shortestHeadingError,
    headingError: directionCommitted
      ? shortestHeadingError + direction * Math.PI * 2
      : shortestHeadingError,
    directionCommitted,
  };
}
