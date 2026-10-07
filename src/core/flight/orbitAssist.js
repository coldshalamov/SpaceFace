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

/**
 * Swing/yaw coordination margin. The yaw helper below is exact only while the hull can turn as
 * fast as the line swings: past maxYawRate the nose lags the tangent while the pilot keeps
 * thrusting, which reads as uncontrolled circling (short ropes, boost, and fast ships all reach
 * it in ordinary play). The input owner answers by holding the swing at this fraction of the
 * trackable rate, so the residual yaw authority keeps trimming the nose onto the tangent and the
 * requested rate stays the exact inverse-radius feed-forward instead of a saturated peg.
 */
export const ORBIT_SWING_TRACK_MARGIN = 0.9;

/**
 * Tuning-lab seam (design/program/lab/TUNING_LAB.md). Every field defaults to "off/unchanged", so
 * with no override the assist is byte-identical to orbitAssist.tuning.v1. Only the headless lab
 * (scripts/lab/) writes it; nothing in the shipped game does.
 *   margin          swing/yaw track margin (default ORBIT_SWING_TRACK_MARGIN)
 *   alignTimeS      heading-capture time constant (default tangentAlignTimeS)
 *   comFrame        measure trackable swing in the pair's centre-of-mass frame (the governor caps
 *                   WORLD speed; on a light anchor the line turns faster than world speed implies)
 *   forwardCommit   never take the "shortest" capture backwards against a fast orbit in the held
 *                   direction (a nose >180 deg behind wraps to "ahead" and turns the wrong way)
 *   thrustGate      scale forward throttle by max(0, cos(headingError)) so a lagging nose never
 *                   brakes the orbit it is chasing
 *   lineLockYaw     let the hull's yaw cap rise to the line's rate while the assist owns yaw
 *   tangentDash     a dash on a live, assisted line goes along the held tangent, not the nose
 *   dashSpeedCap    'track': a line dash may only lift the swing to the trackable rate;
 *                   'boost': only to the boosted speed cap (null = uncapped, shipped)
 *   lendYawAccelMult extra yaw-accel multiplier on top of the lent-rate ratio (flightV3 reads it)
 *   directionLatch  'off' | 'aim' | 'all': hold the orbit direction picked at engagement for as
 *                   long as the chord holds. 'aim' latches only an aim-derived turn intent (helm
 *                   cursor / twin-stick aim), whose sign flips every half revolution by geometry.
 */
export const ORBIT_ASSIST_LAB = {
  margin: null, alignTimeS: null, comFrame: false, forwardCommit: false, thrustGate: false,
  lineLockYaw: false, lineLockMargin: 1.1, tangentDash: false, dashSpeedCap: null,
  lendYawAccelMult: 1, directionLatch: 'off', lineDashCap: false, absYawCap: null, lockGovernorMargin: 0.95, dashCapMult: 1,
};
const ORBIT_ASSIST_LAB_DEFAULTS = Object.freeze({ ...ORBIT_ASSIST_LAB });
export function setOrbitAssistLab(overrides = {}) {
  Object.assign(ORBIT_ASSIST_LAB, ORBIT_ASSIST_LAB_DEFAULTS, overrides || {});
  return ORBIT_ASSIST_LAB;
}

/**
 * Throttle scale that keeps a tethered orbit trackable. Pure: 1 whenever the swing the pilot
 * demands (or already flies) fits inside yaw authority at this radius, falling toward 0 as it
 * outruns the nose. The yaw helper itself stays yaw-only; the input owner multiplies forward
 * throttle by this, which slows both thrust and the governed cap until the nose can track again.
 */
export function orbitSwingThrottleScale(telemetry, commandedSpeed) {
  const t = telemetry || {};
  // lineLockYaw (lab): the nose can follow any swing, so there is nothing to hold back.
  if (ORBIT_ASSIST_LAB.lineLockYaw) {
    // Even a lent yaw rate meets the physics owner's absolute yaw ceiling (sg02
    // SANE_MAX_YAW_RATE). Hold the swing a margin under it so the nose can still trim.
    const cap = positive(ORBIT_ASSIST_LAB.absYawCap, 0);
    if (!(cap > 0)) return 1;
    const shareL = clamp(positive(t.armShare, 1), 0.05, 1);
    const trackableL = cap * positive(t.radius, 0) * positive(ORBIT_ASSIST_LAB.lockGovernorMargin, 0.95) * shareL;
    const demandL = Math.max(Math.abs(finite(t.tangentialSpeed)) * shareL, Math.max(0, finite(commandedSpeed)));
    if (!(trackableL > 1e-6) || !(demandL > trackableL)) return 1;
    return clamp(trackableL / demandL, 0, 1);
  }
  const margin = ORBIT_ASSIST_LAB.margin != null ? ORBIT_ASSIST_LAB.margin : ORBIT_SWING_TRACK_MARGIN;
  // comFrame (lab): the governor caps the hull's WORLD speed, which on a movable anchor is only
  // armShare of the line-relative swing. Compare like with like.
  const share = ORBIT_ASSIST_LAB.comFrame ? clamp(positive(t.armShare, 1), 0.05, 1) : 1;
  const trackable = positive(t.maxYawRate, 0) * positive(t.radius, 0) * margin * share;
  const demand = Math.max(
    Math.abs(finite(t.tangentialSpeed)) * share,
    Math.max(0, finite(commandedSpeed)),
  );
  if (!(trackable > 1e-6) || !(demand > trackable)) return 1;
  return clamp(trackable / demand, 0, 1);
}

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
  const lab0 = ORBIT_ASSIST_LAB;
  const latchMode = lab0.directionLatch === 'all' ? 'all'
    : lab0.directionLatch === 'aim' && options.flightIntent && options.flightIntent.lateralFromAim ? 'aim' : null;
  const priorLatch = latchMode ? Math.sign(finite(options.latchedDirection)) : 0;
  let selectedDirection = Math.sign(finite(options.flightIntent && options.flightIntent.lateral));
  if (priorLatch !== 0) selectedDirection = priorLatch;
  if (!(forward > ORBIT_ASSIST_TUNING_V1.minIntent)) return inactive('no-forward-intent');
  if (selectedDirection === 0) return inactive('no-lateral-intent');
  if (input.brake || options.controlsBlocked) return inactive('manual-override');

  const host = options.host;
  const anchor = options.anchor;
  if (latchMode && priorLatch === 0) {
    // Engagement: an orbit already swinging owns its direction; otherwise the intent picks it.
    const ex = finite(host.pos.x) - finite(anchor.pos.x), ez = finite(host.pos.z) - finite(anchor.pos.z);
    const er2 = ex * ex + ez * ez;
    const eOmega = er2 > 1e-6 ? (ex * (finite(host.vel.z) - finite(anchor.vel.z)) - ez * (finite(host.vel.x) - finite(anchor.vel.x))) / er2 : 0;
    const hullYaw = positive(options.profile && options.profile.maxYawRate, 1);
    if (Math.abs(eOmega) > 0.25 * hullYaw) selectedDirection = Math.sign(eOmega);
  }
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
  // Heading capture takes the shortest path onto the selected tangent. The desired tangent already
  // encodes the held orbit direction, so the shortest turn reaches the same nose heading as any
  // longer route. Only the final desired rate is bounded, by the hull's own yaw authority: while
  // the nose is off-tangent the proportional bridge may use full authority to swing onto the
  // tangent, then it falls to zero and leaves the exact inverse-radius feed-forward term. A
  // separate heading-correction cap starved that swing and made the orbit read under-speed.
  const desiredHeading = Math.atan2(tangentZ, tangentX);
  const lab = ORBIT_ASSIST_LAB;
  let headingError = wrapAngle(desiredHeading - finite(host.rot));
  const hullMaxYawRate = positive(options.profile && options.profile.maxYawRate, 1);
  let committed = false;
  if (lab.forwardCommit && Math.sign(orbitalYawRate) === selectedDirection
    && Math.abs(orbitalYawRate) > 0.25 * hullMaxYawRate
    && headingError * selectedDirection < -Math.PI / 2) {
    // A nose that has fallen more than half a turn behind a fast orbit reads as "ahead" after the
    // wrap; keep chasing in the orbit direction instead of reversing through the long way round.
    headingError += 2 * Math.PI * selectedDirection;
    committed = true;
  }
  const alignTimeS = lab.alignTimeS != null ? lab.alignTimeS : ORBIT_ASSIST_TUNING_V1.tangentAlignTimeS;
  const alignmentYawRate = headingError / (alignTimeS / strengthScale);
  let maxYawRate = hullMaxYawRate;
  let maxYawRateOverride = null;
  if (lab.lineLockYaw && Math.abs(orbitalYawRate) * lab.lineLockMargin > hullMaxYawRate) {
    maxYawRateOverride = Math.abs(orbitalYawRate) * lab.lineLockMargin;
    if (positive(lab.absYawCap, 0) > 0) maxYawRateOverride = Math.min(maxYawRateOverride, lab.absYawCap);
    maxYawRate = maxYawRateOverride;
  }
  const rawDesiredYawRate = orbitalYawRate + alignmentYawRate;
  const desiredYawRate = clamp(rawDesiredYawRate, -maxYawRate, maxYawRate);
  const turn = desiredYawRate / maxYawRate;
  const anchorMass = positive(anchor.mass, positive(anchor.physicsBody && anchor.physicsBody.mass, 0));
  const hostMass = positive(host.mass, 1);
  const armShare = anchorMass > 0 ? anchorMass / (anchorMass + hostMass) : 1;
  const outInput = { ...input, turn };
  let thrustGate = 1;
  if (lab.thrustGate && finite(outInput.throttle) > 0) {
    thrustGate = Math.max(0, Math.cos(headingError));
    outInput.throttle = finite(outInput.throttle) * thrustGate;
  }

  return {
    active: true,
    input: outInput,
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
      shortestHeadingError: headingError,
      headingError,
      headingDirectionCommitted: false,
      orbitalYawRate,
      alignmentYawRate,
      maxYawRate,
      headingCorrectionSaturated: false,
      desiredYawRate,
      turnIntent: turn,
      saturated: desiredYawRate !== rawDesiredYawRate,
      armShare,
      headingCommitted: committed,
      thrustGate,
      maxYawRateOverride,
      latchedDirection: latchMode ? selectedDirection : 0,
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
