// Anchor-relative yaw assist.
//
// A tether is only a physical rope. This helper owns one optional convenience: while the pilot
// explicitly holds forward + turn, request the yaw rate that keeps the ship tangent to the live
// ship-to-anchor radius. A swing-drive commitment may supply that missing turn sign for the
// short window after a tangent dash, including while the line is still slack. It never owns
// thrust, boost, strafe, braking, speed, or radial force.

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
 * Line-locked yaw (tuning lab Phase 2a, design/program/lab/TUNING_LAB.md). A taut line already
 * turns the ship at the orbital rate, so while the assist owns yaw the hull may borrow that rate
 * (plus `rateMargin` headroom to keep trimming) instead of capping the swing at its own
 * maxYawRate. The only hard ceiling left is the physics owner's absolute body yaw clamp
 * (sg02DynamicBodyOwner SANE_MAX_YAW_RATE); the swing governor holds the orbit `governorMargin`
 * under it so the nose can still close any error. Measured over 18 scenarios x 5 seeds: spin
 * reaches the physical speed-cap bound (>= 100.1% of vcap / r_ship) with the nose within 3.3 deg.
 */
export const ORBIT_LINE_YAW_LOCK = Object.freeze({
  id: 'orbitAssist.lineYawLock.v1',
  rateMargin: 1.25,
  absoluteYawCap: 6.0, // mirrors SANE_MAX_YAW_RATE (test/orbit-line-yaw-lock.test.mjs pins it)
  governorMargin: 0.95,
});

/**
 * Orbit-direction latch. A helm-cursor or twin-stick turn intent is derived from where the aim
 * point sits relative to the nose; on a spinning tether the aim point sweeps behind the ship every
 * half revolution, which flipped the chosen orbit direction and dumped the spin. An aim-derived
 * intent therefore holds the direction picked at engagement (or the way the line is already
 * swinging) for as long as the chord holds. Keyboard and stick intent stay live, so a deliberate
 * reversal still works. `engageSwingFraction` of hull yaw decides "already swinging".
 */
export const ORBIT_DIRECTION_LATCH = Object.freeze({
  id: 'orbitAssist.directionLatch.aim.v1',
  engageSwingFraction: 0.25,
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
    // Line-locked yaw: the nose can follow the line up to the physics ceiling. Compare the swing
    // in the pair's centre-of-mass frame (the ship's own speed is only armShare of it on a
    // movable anchor) against that ceiling, held a margin under it.
    const share = clamp(positive(t.armShare, 1), 0.05, 1);
    const trackableL = ceiling * positive(t.radius, 0) * ORBIT_LINE_YAW_LOCK.governorMargin * share;
    const demandL = Math.max(Math.abs(finite(t.tangentialSpeed)) * share, Math.max(0, finite(commandedSpeed)));
    if (!(trackableL > 1e-6) || !(demandL > trackableL)) return 1;
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
  const fromAim = !!(options.flightIntent && options.flightIntent.lateralFromAim);
  const priorLatch = fromAim ? Math.sign(finite(options.latchedDirection)) : 0;
  let selectedDirection = Math.sign(finite(options.flightIntent && options.flightIntent.lateral));
  if (priorLatch !== 0) selectedDirection = priorLatch;
  if (input.brake || options.controlsBlocked) return inactive('manual-override');
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
  if (!(forward > ORBIT_ASSIST_TUNING_V1.minIntent) || selectedDirection === 0) {
    return carrySwing(options, input, strength, inactive);
  }

  const host = options.host;
  const anchor = options.anchor;
  if (fromAim && priorLatch === 0) {
    // Engagement of an aim-derived orbit: a line already swinging owns its direction.
    const ex = finite(host.pos.x) - finite(anchor.pos.x);
    const ez = finite(host.pos.z) - finite(anchor.pos.z);
    const er2 = ex * ex + ez * ez;
    const engageRate = er2 > 1e-6
      ? (ex * (finite(host.vel.z) - finite(anchor.vel.z)) - ez * (finite(host.vel.x) - finite(anchor.vel.x))) / er2
      : 0;
    const hullYaw = positive(options.profile && options.profile.maxYawRate, 1);
    if (Math.abs(engageRate) > ORBIT_DIRECTION_LATCH.engageSwingFraction * hullYaw) {
      selectedDirection = Math.sign(engageRate);
    }
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
  const headingError = wrapAngle(desiredHeading - finite(host.rot));
  const alignmentYawRate = headingError
    / (ORBIT_ASSIST_TUNING_V1.tangentAlignTimeS / strengthScale);
  const hullMaxYawRate = positive(options.profile && options.profile.maxYawRate, 1);
  const linePhase = String(options.tether.phase || 'slack');
  const lineLoaded = linePhase === 'capture' || linePhase === 'loaded' || linePhase === 'overload';
  // Line-locked yaw: borrow the line's rate (with headroom) when it outruns the hull, up to the
  // physics ceiling. The input owner applies the lent rate to the yaw profile for this tick.
  let maxYawRate = hullMaxYawRate;
  let lentYawRate = null;
  if (lineLoaded && Math.abs(orbitalYawRate) * ORBIT_LINE_YAW_LOCK.rateMargin > hullMaxYawRate) {
    lentYawRate = Math.min(Math.abs(orbitalYawRate) * ORBIT_LINE_YAW_LOCK.rateMargin,
      ORBIT_LINE_YAW_LOCK.absoluteYawCap);
    maxYawRate = Math.max(hullMaxYawRate, lentYawRate);
  }
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
      tuning: ORBIT_ASSIST_TUNING_V1.id,
      strength,
      direction: selectedDirection,
      selectedDirection,
      intentSource: intentFromCommit ? 'swing-drive' : 'flight',
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
      hullMaxYawRate,
      lentYawRate,
      yawCeiling: lineLoaded ? ORBIT_LINE_YAW_LOCK.absoluteYawCap : null,
      armShare,
      latchedDirection: fromAim ? selectedDirection : 0,
      reason: lineLoaded ? 'engaged' : 'line-slack',
    },
  };
}

/**
 * Swing carry. On a loaded line the hull turns with the swing: the orbital yaw rate
 * (cross(radius, relative velocity) / radius^2) is added to whatever the pilot steers, so the nose
 * keeps its bearing to the anchor and forward thrust stays tangent instead of rotating onto the
 * radius and diving the ship in. The pilot's own turn input rides on top, relative to the line.
 * It needs no key, speed or heading condition: only a taut line, which is what makes a swing real.
 */
function carrySwing(options, input, strength, inactive) {
  const phase = String((options.tether && options.tether.phase) || 'slack');
  if (!(phase === 'capture' || phase === 'loaded' || phase === 'overload')) return inactive('line-slack');
  const host = options.host;
  const anchor = options.anchor;
  const rx = finite(host.pos.x) - finite(anchor.pos.x);
  const rz = finite(host.pos.z) - finite(anchor.pos.z);
  const radius = Math.hypot(rx, rz);
  if (!(radius > 1e-6)) return inactive('degenerate-radius');
  const relVx = finite(host.vel.x) - finite(anchor.vel.x);
  const relVz = finite(host.vel.z) - finite(anchor.vel.z);
  const orbitalYawRate = (rx * relVz - rz * relVx) / (radius * radius);
  const direction = Math.sign(orbitalYawRate) || 1;
  const tangentialSpeed = (relVx * -rz + relVz * rx) / radius * direction;
  const hullMaxYawRate = positive(options.profile && options.profile.maxYawRate, 1);
  let maxYawRate = hullMaxYawRate;
  let lentYawRate = null;
  if (Math.abs(orbitalYawRate) * ORBIT_LINE_YAW_LOCK.rateMargin > hullMaxYawRate) {
    lentYawRate = Math.min(Math.abs(orbitalYawRate) * ORBIT_LINE_YAW_LOCK.rateMargin,
      ORBIT_LINE_YAW_LOCK.absoluteYawCap);
    maxYawRate = Math.max(hullMaxYawRate, lentYawRate);
  }
  const pilotRate = clamp(finite(input.turn), -1, 1) * hullMaxYawRate;
  const desiredYawRate = clamp(orbitalYawRate + pilotRate, -maxYawRate, maxYawRate);
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
      orbitalYawRate,
      maxYawRate,
      hullMaxYawRate,
      lentYawRate,
      desiredYawRate,
      turnIntent: desiredYawRate / maxYawRate,
      saturated: false,
      yawCeiling: ORBIT_LINE_YAW_LOCK.absoluteYawCap,
      armShare: anchorMass > 0 ? anchorMass / (anchorMass + hostMass) : 1,
      latchedDirection: 0,
      reason: 'swing-carry',
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
