// Anchor-relative yaw assist.
//
// A tether is only a physical rope. This helper owns one optional convenience: while the pilot
// holds the orbit chord (forward + a turn direction) and the line is measurably swinging like an
// orbit, trim yaw to the live ship-to-anchor angular rate plus a bounded correction that keeps
// the nose on the swing's tangent. The line's own rotation is the only direction authority —
// a faster swing simply asks for a faster turn — so a boost or a whipped heading can never
// outrun a capture trigger, and heading error never drops the assist back to manual mid-swing.
// Ordinary tethered flight stays untouched: a line that is not rotating like an orbit (towing,
// riding, hanging, drifting radially) fails the swing test and steering stays fully manual.

export const ORBIT_ASSIST_TUNING_V1 = Object.freeze({
  id: 'orbitAssist.tuning.v1',
  minIntent: 0.05,
  tangentAlignTimeS: 0.55,
  maxHeadingCorrectionRateFraction: 0.25,
});

export const ORBIT_ASSIST_STRENGTH = Object.freeze({
  full: 1,
  standard: 1,
  light: 0.5,
  off: 0,
});

/**
 * Engagement gate. The assist may only own yaw while the pilot is asking for the orbit AND the
 * line is physically behaving like one:
 *
 * - chordDwellS: forward + a turn direction held continuously for this long reads as deliberate
 *   spin intent, not a passing maneuver tap on a tethered hull.
 * - minSwingRate: the ship-to-anchor line must actually be rotating. A parked tether or a
 *   straight drift never qualifies.
 * - minTangentiality: the ship-relative motion must run ACROSS the line, not along it. This is
 *   the towing guard — a dragged load's relative velocity lies along the rope, an orbiting
 *   hull's velocity lies around it — and it cannot misfire from heading, aim, or key sign.
 * - continuation* thresholds plus graceS give the engaged state hysteresis: a stall at the top
 *   of a pump, a flicked stick, or a momentarily slack line cannot bounce the assist off and on.
 *
 * Engagement memory ({ chordT, graceT, direction }) is caller-owned entity state, passed in via
 * `options.engage` and returned on every telemetry packet — the helper stays pure per tick.
 */
export const ORBIT_ASSIST_ENGAGE_V1 = Object.freeze({
  id: 'orbitAssist.engage.v1',
  chordDwellS: 0.4,
  graceS: 0.6,
  minSwingRate: 0.05,
  continuationSwingRate: 0.025,
  minTangentiality: 0.6,
  continuationTangentiality: 0.35,
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
 * Physical line ceiling and governor margin. The controller retains the fitted hull's yaw
 * authority; a rope no longer lends its larger angular rate or acceleration to the hull.
 * The COM-aware swing governor still keeps small movable anchors trackable.
 */
export const ORBIT_LINE_YAW_LOCK = Object.freeze({
  id: 'orbitAssist.lineYawLock.v1',
  rateMargin: 1.25,
  absoluteYawCap: 6.0, // mirrors SANE_MAX_YAW_RATE (test/orbit-line-yaw-lock.test.mjs pins it)
  governorMargin: 0.95,
});

/**
 * Thrust gate for the input owner: forward throttle scales by max(0, cos(headingError)) while
 * the assist is engaged, so a nose that is still swinging onto the tangent never thrusts across
 * (or against) the orbit it is chasing. The yaw helper itself stays yaw-only.
 */
export function orbitHeadingThrustGate(telemetry) {
  const t = telemetry || {};
  if (!Number.isFinite(Number(t.headingError))) return 1;
  return Math.max(0, Math.cos(Number(t.headingError)));
}

/**
 * Throttle scale that keeps a tethered orbit trackable. Pure: 1 whenever the swing the pilot
 * demands (or already flies) fits inside yaw authority at this radius, falling toward 0 as it
 * outruns the nose. The yaw helper itself stays yaw-only; the input owner multiplies forward
 * throttle by this, which slows both thrust and the governed cap until the nose can track again.
 */
export function orbitSwingThrottleScale(telemetry, commandedSpeed) {
  const t = telemetry || {};
  const ceiling = positive(t.yawCeiling, 0);
  if (ceiling > 0) {
    // Compare the swing against the hull's bounded yaw ceiling, including the physical limit,
    // in the pair's centre-of-mass frame (the ship's own speed is only armShare of it on a
    // movable anchor) against that ceiling, held a margin under it.
    // A light target gives the ship a genuinely tiny COM arm. Flooring that share invents
    // turning radius and allows a swing faster than the nose can follow, eventually sending
    // thrust back across the line. Preserve the actual share, however small.
    const share = Math.min(positive(t.armShare, 1), 1);
    const trackableL = ceiling * positive(t.radius, 0) * ORBIT_LINE_YAW_LOCK.governorMargin * share;
    const demandL = Math.max(Math.abs(finite(t.tangentialSpeed)) * share, Math.max(0, finite(commandedSpeed)));
    if (!(trackableL > 0) || !(demandL > trackableL)) return 1;
    return clamp(trackableL / demandL, 0, 1);
  }
  const trackable = positive(t.maxYawRate, 0) * positive(t.radius, 0) * ORBIT_SWING_TRACK_MARGIN;
  const demand = Math.max(
    Math.abs(finite(t.tangentialSpeed)),
    Math.max(0, finite(commandedSpeed)),
  );
  if (!(trackable > 1e-6) || !(demand > trackable)) return 1;
  return clamp(trackable / demand, 0, 1);
}

export function stepAnchorRelativeOrbitAssist(options = {}) {
  const input = { ...(options.input || {}) };
  const strength = normalizeStrength(options.strength);
  const strengthScale = ORBIT_ASSIST_STRENGTH[strength];
  const dt = positive(options.dt, 0);
  const memory = normalizeEngageMemory(options.engage);
  const inactive = (reason, engage) => ({
    active: false,
    input,
    telemetry: inactiveTelemetry(strength, reason, engage),
  });

  if (!(strengthScale > 0)) return inactive('assist-off');
  if (!(dt > 0) || !finiteBody(options.host) || !finiteBody(options.anchor)
      || options.anchor.alive === false) return inactive('invalid-body');
  if (!options.tether || options.tether.active !== true || options.tether.targetId == null) {
    return inactive('not-tethered');
  }
  if (input.brake || options.controlsBlocked) return inactive('manual-override');

  const forward = finite(options.flightIntent && options.flightIntent.forward);
  const fromAim = !!(options.flightIntent && options.flightIntent.lateralFromAim);
  let selectedDirection = Math.sign(finite(options.flightIntent && options.flightIntent.lateral));
  // Swing Drive's commitment is a turn sign, not a force. It fills a stick that is not
  // already steering so forward thrust can be yawed onto the tangent the dash just bought,
  // even while the line is still slack and carrySwing has nothing taut to follow.
  const commitDirection = Math.sign(finite(options.commitDirection));
  let intentFromCommit = false;
  if (selectedDirection === 0 && commitDirection !== 0
      && forward > ORBIT_ASSIST_TUNING_V1.minIntent) {
    selectedDirection = commitDirection;
    intentFromCommit = true;
  }

  // No chord (forward + a turn direction): the pilot still gets the swing carried for them.
  const chord = forward > ORBIT_ASSIST_TUNING_V1.minIntent && selectedDirection !== 0;
  const chordT = chord ? memory.chordT + dt : 0;
  if (!chord) return carrySwing(options, input, strength, dt, memory, inactive);

  const host = options.host;
  const anchor = options.anchor;
  const rx = finite(host.pos.x) - finite(anchor.pos.x);
  const rz = finite(host.pos.z) - finite(anchor.pos.z);
  const radius = Math.hypot(rx, rz);
  if (!(radius > 1e-6)) return inactive('degenerate-radius', decayedEngage(memory, dt, chordT));

  const relVx = finite(host.vel.x) - finite(anchor.vel.x);
  const relVz = finite(host.vel.z) - finite(anchor.vel.z);
  const relSpeed = Math.hypot(relVx, relVz);
  const rHatX = rx / radius;
  const rHatZ = rz / radius;

  // d(theta)/dt = cross(radius, relativeVelocity) / |radius|^2. That one kinematic
  // relationship is the whole detector: a shorter line or faster swing requests more yaw; a
  // longer line or slower swing requests less. Heading error only brings the nose onto the
  // swing's tangent, then falls to zero and leaves the exact angular-rate feed-forward term.
  const orbitalYawRate = (rx * relVz - rz * relVx) / (radius * radius);
  const swingRate = Math.abs(orbitalYawRate);
  // |relV . t̂| / |relV|: 1 reads as the hull travelling around the anchor, 0 as the hull
  // dragging it — the physical orbit/tow discriminator no input signal can fake.
  const tangentiality = relSpeed > 0.5
    ? Math.abs(relVx * -rHatZ + relVz * rHatX) / relSpeed
    : 0;
  const swingLive = swingRate > ORBIT_ASSIST_ENGAGE_V1.minSwingRate
    && tangentiality > ORBIT_ASSIST_ENGAGE_V1.minTangentiality;
  const swingAlive = swingRate > ORBIT_ASSIST_ENGAGE_V1.continuationSwingRate
    && tangentiality > ORBIT_ASSIST_ENGAGE_V1.continuationTangentiality;
  // Direction comes from the line itself: the swing owns the tangent while it is rotating, and
  // the remembered direction bridges a stall inside the grace window. The held key never picks
  // the tangent sign against a live swing, so aim sweeps and commit echoes cannot misfire it.
  const swingDirection = swingRate > ORBIT_ASSIST_ENGAGE_V1.continuationSwingRate
    ? Math.sign(orbitalYawRate)
    : memory.direction;
  const tracked = swingDirection !== 0 ? swingDirection : selectedDirection;

  const tangentX = -rHatZ * tracked;
  const tangentZ = rHatX * tracked;
  const radialSpeed = relVx * rHatX + relVz * rHatZ;
  const tangentialSpeed = relVx * tangentX + relVz * tangentZ;
  const desiredHeading = Math.atan2(tangentZ, tangentX);
  const headingError = wrapAngle(desiredHeading - finite(host.rot));
  const hullMaxYawRate = positive(options.profile && options.profile.maxYawRate, 1);
  const maxYawRate = hullMaxYawRate;
  const sharedTelemetry = {
    tuning: ORBIT_ASSIST_TUNING_V1.id,
    strength,
    direction: tracked,
    selectedDirection,
    radius,
    restLength: positive(options.tether.restLength, radius),
    radialSpeed,
    tangentialSpeed,
    desiredHeading,
    shortestHeadingError: headingError,
    headingError,
    headingDirectionCommitted: false,
    orbitalYawRate,
    tangentiality,
    swingLive,
    swingAlive,
    maxYawRate,
    hullMaxYawRate,
    lentYawRate: null,
  };

  const freshEngage = swingLive
    && (chordT >= ORBIT_ASSIST_ENGAGE_V1.chordDwellS || intentFromCommit);
  if (!freshEngage && !(memory.graceT > 0)) {
    const out = inactive(swingLive ? 'arming' : 'swing-absent', {
      chordT,
      graceT: Math.max(0, memory.graceT - dt),
      direction: swingDirection,
    });
    Object.assign(out.telemetry, sharedTelemetry, {
      alignmentYawRate: 0,
      desiredYawRate: finite(input.turn) * hullMaxYawRate,
    });
    return out;
  }

  // A deliberate counter-key still owns the tick: while the swing is really turning, a held turn
  // direction opposing it means the pilot is reversing by hand, so yaw stays fully manual. Aim
  // intent is exempt — the helm cursor sweeps behind the hull mid-orbit and its sign flickers —
  // and a swing-drive commit fill is not a held key, so a decelerating dash cannot misfire it.
  const heldDirection = Math.sign(finite(options.flightIntent && options.flightIntent.lateral));
  if (!fromAim && heldDirection !== 0 && swingDirection !== 0 && heldDirection !== swingDirection) {
    const out = inactive('manual-override', {
      chordT,
      graceT: Math.max(0, memory.graceT - dt),
      direction: swingDirection,
    });
    Object.assign(out.telemetry, sharedTelemetry, {
      alignmentYawRate: 0,
      desiredYawRate: finite(input.turn) * hullMaxYawRate,
    });
    return out;
  }

  const trimLimit = hullMaxYawRate * ORBIT_ASSIST_TUNING_V1.maxHeadingCorrectionRateFraction;
  const alignmentYawRate = clamp(headingError
    / (ORBIT_ASSIST_TUNING_V1.tangentAlignTimeS / strengthScale), -trimLimit, trimLimit);
  const linePhase = String(options.tether.phase || 'slack');
  const lineLoaded = linePhase === 'capture' || linePhase === 'loaded' || linePhase === 'overload';
  const rawDesiredYawRate = orbitalYawRate + alignmentYawRate;
  const desiredYawRate = clamp(rawDesiredYawRate, -maxYawRate, maxYawRate);
  const turn = desiredYawRate / maxYawRate;
  const anchorMass = positive(anchor.mass, positive(anchor.physicsBody && anchor.physicsBody.mass, 0));
  const hostMass = positive(host.mass, 1);
  const armShare = anchorMass > 0 ? anchorMass / (anchorMass + hostMass) : 1;

  return {
    active: true,
    input: { ...input, turn },
    telemetry: {
      ...sharedTelemetry,
      intentSource: intentFromCommit ? 'swing-drive' : 'flight',
      alignmentYawRate,
      desiredYawRate,
      turnIntent: turn,
      saturated: desiredYawRate !== rawDesiredYawRate,
      yawCeiling: lineLoaded ? Math.min(hullMaxYawRate, ORBIT_LINE_YAW_LOCK.absoluteYawCap) : null,
      armShare,
      engage: {
        chordT,
        graceT: swingAlive ? ORBIT_ASSIST_ENGAGE_V1.graceS : Math.max(0, memory.graceT - dt),
        direction: tracked,
      },
      reason: lineLoaded ? 'engaged' : 'line-slack',
    },
  };
}

/**
 * Swing carry. On a loaded line the hull turns with the swing: the orbital yaw rate
 * (cross(radius, relative velocity) / radius^2) carries the unsteered nose, so the nose
 * keeps its bearing to the anchor and forward thrust stays tangent instead of rotating onto the
 * radius and diving the ship in. A manual turn takes ownership instead: adding the swing rate
 * to countersteering could turn the hull the opposite way to the held key on a fast line.
 */
function carrySwing(options, input, strength, dt, memory, inactive) {
  const decayed = { chordT: 0, graceT: Math.max(0, memory.graceT - dt), direction: memory.direction };
  if (Math.abs(finite(input.turn)) > ORBIT_ASSIST_TUNING_V1.minIntent
      || Math.abs(finite(options.flightIntent && options.flightIntent.lateral)) > ORBIT_ASSIST_TUNING_V1.minIntent) {
    return inactive('manual-override', decayed);
  }
  const phase = String((options.tether && options.tether.phase) || 'slack');
  if (!(phase === 'capture' || phase === 'loaded' || phase === 'overload')) {
    return inactive('line-slack', decayed);
  }
  const host = options.host;
  const anchor = options.anchor;
  const rx = finite(host.pos.x) - finite(anchor.pos.x);
  const rz = finite(host.pos.z) - finite(anchor.pos.z);
  const radius = Math.hypot(rx, rz);
  if (!(radius > 1e-6)) return inactive('degenerate-radius', decayed);
  const relVx = finite(host.vel.x) - finite(anchor.vel.x);
  const relVz = finite(host.vel.z) - finite(anchor.vel.z);
  const relSpeed = Math.hypot(relVx, relVz);
  const rHatX = rx / radius;
  const rHatZ = rz / radius;
  // A tow or a radial drift is not a swing: the unsteered hull keeps its heading rather than
  // being rotated by a line whose relative motion runs along the rope instead of around it.
  const tangentiality = relSpeed > 0.5 ? Math.abs(relVx * -rHatZ + relVz * rHatX) / relSpeed : 0;
  if (!(tangentiality > ORBIT_ASSIST_ENGAGE_V1.continuationTangentiality)) {
    return inactive('not-orbiting', decayed);
  }
  const orbitalYawRate = (rx * relVz - rz * relVx) / (radius * radius);
  const direction = Math.sign(orbitalYawRate) || 1;
  const tangentialSpeed = (relVx * -rz + relVz * rx) / radius * direction;
  const hullMaxYawRate = positive(options.profile && options.profile.maxYawRate, 1);
  const maxYawRate = hullMaxYawRate;
  const lentYawRate = null;
  const desiredYawRate = clamp(orbitalYawRate, -maxYawRate, maxYawRate);
  const anchorMass = positive(anchor.mass, positive(anchor.physicsBody && anchor.physicsBody.mass, 0));
  const hostMass = positive(host.mass, 1);
  return {
    active: true,
    input: { ...input, turn: desiredYawRate / maxYawRate },
    telemetry: {
      tuning: ORBIT_ASSIST_TUNING_V1.id,
      strength,
      direction,
      selectedDirection: direction,
      intentSource: 'swing-carry',
      carry: true,
      radius,
      radialSpeed: (relVx * rx + relVz * rz) / radius,
      tangentialSpeed,
      tangentiality,
      orbitalYawRate,
      maxYawRate,
      hullMaxYawRate,
      lentYawRate,
      desiredYawRate,
      turnIntent: desiredYawRate / maxYawRate,
      saturated: false,
      yawCeiling: Math.min(hullMaxYawRate, ORBIT_LINE_YAW_LOCK.absoluteYawCap),
      armShare: anchorMass > 0 ? anchorMass / (anchorMass + hostMass) : 1,
      engage: { chordT: 0, graceT: decayed.graceT, direction },
      reason: 'swing-carry',
    },
  };
}

function decayedEngage(memory, dt, chordT = 0) {
  return {
    chordT,
    graceT: Math.max(0, memory.graceT - dt),
    direction: memory.direction,
  };
}

function normalizeEngageMemory(value) {
  const m = value && typeof value === 'object' ? value : {};
  return {
    chordT: Math.max(0, finite(m.chordT, 0)),
    graceT: Math.max(0, finite(m.graceT, 0)),
    direction: Math.sign(finite(m.direction, 0)),
  };
}

function inactiveTelemetry(strength, reason, engage) {
  return {
    tuning: ORBIT_ASSIST_TUNING_V1.id,
    strength,
    direction: 0,
    saturated: false,
    reason,
    engage: engage || { chordT: 0, graceT: 0, direction: 0 },
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
