// Pure massline orbit/load/release telemetry kernel (packet T01).
//
// OBSERVES ONLY. Given host/target transforms, velocities, masses, line rest length, and the
// player's reel/release intent, this module computes one PURE SEMANTIC OBSERVATION of the swing:
// radial distance and radial rate, tangent direction and tangent speed, angular rate, orbit sign,
// tension/load bands, the stable-orbit window, and the suggested release vector.
//
// It does NOT write transforms, does NOT auto-fly the ship, does NOT touch physics, does NOT emit
// events, and holds NO state. Same input -> byte-identical output. There is deliberately no `dt`
// parameter anywhere: the observation describes INSTANTANEOUS state, so time-step independence is
// structural rather than a property we have to defend.
//
// Geometry is 2D on the XZ plane (y = 0), matching the simulation. No Three.js types or imports.
//
// ---------------------------------------------------------------------------------------------
// VOCABULARY ALIGNMENT (this module deliberately does not invent competing terms)
//
//   distance, radialSpeed, tangentialSpeed, angularSpeed
//       Same definitions and same signs as src/systems/masslineTelemetry.js computeLineKinematics.
//       lineUnit points HOST -> TARGET; relative velocity is HOST minus TARGET. Consequently
//       radialSpeed > 0 means CLOSING (distance is decreasing). There is intentionally no second
//       negated "radialRate" field: one convention, pinned by test.
//
//   tangentQuality = |tangential| / (|tangential| + |radial|)
//       Byte-for-byte the same expression used by tetherGameplay.rateRelease and by
//       masslineTelemetry's arc-preview viability read.
//
//   loadBand 'slack' | 'taut' | 'loaded' | 'overload'
//       Reuses the existing tether phase nouns. 'capture' is DELIBERATELY ABSENT: in
//       tetherGameplay._phaseFor 'capture' is a TEMPORAL transient (the first captureS seconds
//       after a line goes taut), which by definition cannot be derived from instantaneous state.
//       'taut' fills the "touching but not yet doing real work" slot instead.
//
//   overloadLoadRatio default 0.75
//       The same 0.75 threshold tetherGameplay._phaseFor uses for loaded -> overload.
//
//   reelRisk 'low' | 'medium' | 'high' at 0.45 / 0.75
//       The same bands as masslineTelemetry's REEL_PUMP_RISK_MED / REEL_PUMP_RISK_HIGH.
//
//   release.score / release.classification 'razor' | 'clean' | 'good' | 'messy'
//       The same score expression and the same 0.85 / 0.65 / 0.35 bands as
//       tetherGameplay.rateRelease, with loadRatio standing in for that function's `strain`.
//
//   release.exitSpeed / release.exitAngle / release.peakSpeed
//       The same three reads as masslineTelemetry's arcPreview.
//
// ---------------------------------------------------------------------------------------------
// LINE MODEL
//
// The line is a one-sided spring: it pulls when stretched past its rest length and does nothing
// when slack.
//
//     stretch  = max(0, distance - restLength)
//     tension  = lineStiffness * stretch
//     loadRatio = clamp01(tension / breakTension)
//
// Separately we report what a CIRCULAR orbit at this radius and this tangential speed would
// require, using the two-body reduced mass:
//
//     reducedMass       = hostMass * targetMass / (hostMass + targetMass)
//     centripetalDemand = reducedMass * tangentialSpeed^2 / distance
//     tensionBalance    = (tension - centripetalDemand) / centripetalDemand
//
// tensionBalance is the stable-orbit read: 0 means the line pulls exactly as hard as the orbit
// needs (radius holds), positive means the line over-pulls (orbit tightens), negative means the
// line under-pulls (orbit widens). When centripetalDemand is ~0 there is no orbit to balance
// against (a purely radial pass, or unknown mass), so tensionBalance is defined as 0 and the
// stable-orbit window is forced closed rather than reporting a bogus infinite imbalance.
//
// ---------------------------------------------------------------------------------------------
// FAIL-CLOSED CONTRACT
//
// Non-finite (NaN / Infinity / -Infinity) in ANY consumed numeric field -- host or target pos/vel,
// either mass, restLength, reelIntent, or any tuning parameter -- is detected BEFORE any math and
// returns the safe observation with ok:false and reason 'non-finite-input'. NaN never propagates.
//
// The safe observation has the IDENTICAL key set as a nominal observation (only the values
// differ), so consumers never hit undefined on any path.
//
// `ok` and `reason` do double duty:
//   ok:false  -> the observation is unusable; every numeric is 0 and every band is its floor.
//                reason is one of 'missing-host' | 'missing-target' | 'non-finite-input'
//                | 'invalid-rest-length' | 'degenerate-distance'.
//   ok:true   -> the observation is usable. reason is null when fully nominal, or 'zero-mass'
//                when the kinematics are valid but mass data was absent/zero/non-positive, so the
//                orbit-balance reads degrade gracefully (massKnown:false, demand 0, balance 0,
//                stable-orbit window closed) while everything else stays meaningful.

/**
 * Named tuning parameters with documented defaults. Every one of these may be overridden per call
 * via the `opts` argument. None of them were picked to feel fun -- the tests characterize
 * invariants (sign, symmetry, monotonicity, band ordering), not these specific magnitudes.
 *
 * Callers with a live attachment def SHOULD pass `lineStiffness` and `breakTension` from it; the
 * defaults here are neutral placeholders chosen only so the module is usable standalone.
 */
export const MASSLINE_ORBIT_DEFAULTS = Object.freeze({
  // --- line spring model ---
  /** Tension produced per world-unit of stretch past restLength. Placeholder; pass the def value. */
  lineStiffness: 120,
  /** Tension at which the line reads as fully loaded (loadRatio 1). Placeholder; pass the def value. */
  breakTension: 6000,
  /** Stretch below this reads as slack rather than taut. Mirrors tetherGameplay STRETCH_EPSILON. */
  slackEpsilon: 0.05,

  // --- load bands ---
  /** loadRatio at/above which the line is doing real work ('loaded' rather than merely 'taut'). */
  loadedLoadRatio: 0.25,
  /** loadRatio at/above which the line reads 'overload'. Matches tetherGameplay._phaseFor. */
  overloadLoadRatio: 0.75,

  // --- stable-orbit window ---
  /** tangentQuality at/above which motion counts as swing-dominant rather than a radial pass. */
  stableTangentQuality: 0.85,
  /** |tensionBalance| at/below which the line holds the radius well enough to call it stable. */
  stableTensionBalance: 0.25,

  // --- reel intent risk (mirrors masslineTelemetry REEL_PUMP_RISK_*) ---
  /** loadRatio at/above which reeling IN reads 'high' risk. */
  reelRiskHighLoad: 0.75,
  /** loadRatio at/above which reeling IN reads 'medium' risk. */
  reelRiskMediumLoad: 0.45,
  /** |reelIntent| at/below this is 'hold' rather than in/out. */
  reelIntentDeadzone: 1e-3,

  // --- release rating (mirrors tetherGameplay.rateRelease) ---
  /** loadRatio that counts as fully useful load in the release score. */
  releaseUsefulLoad: 0.65,
  /** loadRatio past which the overload penalty starts eating the release score. */
  releaseOverloadKnee: 0.85,
  /** loadRatio span over which the overload penalty ramps from 0 to full. */
  releaseOverloadSpan: 0.35,
  /** release.score at/above which classification is 'razor'. */
  releaseRazorScore: 0.85,
  /** release.score at/above which classification is 'clean'. */
  releaseCleanScore: 0.65,
  /** release.score at/above which classification is 'good' (below it is 'messy'). */
  releaseGoodScore: 0.35,
  /** release.score at/above which release.advised is true. */
  releaseAdviseScore: 0.65,

  // --- numerical guards ---
  /** distance at/below this is degenerate: there is no line direction, so fail closed. */
  degenerateDistance: 1e-6,
  /** centripetalDemand at/below this counts as "no orbit to balance against". */
  demandEpsilon: 1e-9,
});

const PARAM_KEYS = Object.freeze(Object.keys(MASSLINE_ORBIT_DEFAULTS));

/** Reasons a result can carry. Exported so downstream packets can switch on them safely. */
export const MASSLINE_ORBIT_REASONS = Object.freeze({
  NOMINAL: null,
  MISSING_HOST: 'missing-host',
  MISSING_TARGET: 'missing-target',
  NON_FINITE_INPUT: 'non-finite-input',
  INVALID_REST_LENGTH: 'invalid-rest-length',
  DEGENERATE_DISTANCE: 'degenerate-distance',
  ZERO_MASS: 'zero-mass',
});

/**
 * Observe the current massline swing. Pure: reads only its arguments, writes nothing, allocates a
 * fresh result each call.
 *
 * @param {object} host   - the tethered ship. { pos:{x,z}, vel:{x,z}, mass? }
 * @param {object} target - the anchor.        { pos:{x,z}, vel:{x,z}, mass? }
 * @param {object} [opts]
 * @param {number}  opts.restLength      - REQUIRED. Line rest length in world units, >= 0.
 * @param {number}  [opts.hostMass]      - overrides host.mass.
 * @param {number}  [opts.targetMass]    - overrides target.mass.
 * @param {number}  [opts.reelIntent=0]  - player reel axis. NEGATIVE = reel IN (shorten), matching
 *                                         the input contract's reelDelta sign (tetherGameplay
 *                                         treats reelDelta < 0 as reel-held). Positive = pay out.
 * @param {boolean} [opts.releaseIntent] - player is asking to cut right now. Echoed as
 *                                         release.requested; does not change any measurement.
 * @param {...number} [opts.<param>]     - any key of MASSLINE_ORBIT_DEFAULTS.
 * @returns {object} observation, shape documented on safeObservation() below.
 */
export function observeMasslineOrbit(host, target, opts = {}) {
  const options = opts && typeof opts === 'object' ? opts : {};

  if (!host || !host.pos || !host.vel) return safeObservation(MASSLINE_ORBIT_REASONS.MISSING_HOST);
  if (!target || !target.pos || !target.vel) return safeObservation(MASSLINE_ORBIT_REASONS.MISSING_TARGET);

  // ---- 1. Resolve tuning parameters. A non-finite override is a non-finite input. ----
  const params = {};
  for (const key of PARAM_KEYS) {
    const override = options[key];
    if (override === undefined || override === null) {
      params[key] = MASSLINE_ORBIT_DEFAULTS[key];
      continue;
    }
    if (!Number.isFinite(override)) return safeObservation(MASSLINE_ORBIT_REASONS.NON_FINITE_INPUT);
    params[key] = override;
  }

  // ---- 2. Non-finite sweep FIRST, before any arithmetic. ----
  // Absent mass is not the same thing as non-finite mass: absent degrades to the zero-mass path
  // below, while NaN/Infinity fails closed here.
  const hostMass = readOptionalNumber(options.hostMass !== undefined ? options.hostMass : host.mass);
  const targetMass = readOptionalNumber(options.targetMass !== undefined ? options.targetMass : target.mass);
  const reelIntent = readOptionalNumber(options.reelIntent);
  const restLengthRaw = readOptionalNumber(options.restLength);
  if (!hostMass.ok || !targetMass.ok || !reelIntent.ok || !restLengthRaw.ok) {
    return safeObservation(MASSLINE_ORBIT_REASONS.NON_FINITE_INPUT);
  }

  const hx = host.pos.x;
  const hz = host.pos.z;
  const hvx = host.vel.x;
  const hvz = host.vel.z;
  const tx = target.pos.x;
  const tz = target.pos.z;
  const tvx = target.vel.x;
  const tvz = target.vel.z;
  if (!Number.isFinite(hx) || !Number.isFinite(hz) || !Number.isFinite(hvx) || !Number.isFinite(hvz)
    || !Number.isFinite(tx) || !Number.isFinite(tz) || !Number.isFinite(tvx) || !Number.isFinite(tvz)) {
    return safeObservation(MASSLINE_ORBIT_REASONS.NON_FINITE_INPUT);
  }

  // ---- 3. restLength must be present and non-negative (finite already proven above). ----
  if (!restLengthRaw.present || restLengthRaw.value < 0) {
    return safeObservation(MASSLINE_ORBIT_REASONS.INVALID_REST_LENGTH);
  }
  const restLength = restLengthRaw.value;

  // ---- 4. Line geometry. ----
  const dx = tx - hx;
  const dz = tz - hz;
  const distance = Math.hypot(dx, dz);
  if (!(distance > params.degenerateDistance)) {
    // Coincident bodies: there is no line direction, so every directional read would be arbitrary.
    return safeObservation(MASSLINE_ORBIT_REASONS.DEGENERATE_DISTANCE);
  }

  // lineUnit points host -> target. tangentUnit is lineUnit rotated -90 degrees in XZ, chosen so
  // that dot(relativeVelocity, tangentUnit) equals the 2D cross product masslineTelemetry uses.
  const ux = dx / distance;
  const uz = dz / distance;
  const txu = uz;
  const tzu = -ux;

  // ---- 5. Kinematics (host relative to target, matching masslineTelemetry). ----
  const rvx = hvx - tvx;
  const rvz = hvz - tvz;
  const radialSpeed = rvx * ux + rvz * uz;         // > 0 means closing: distance is decreasing
  const tangentialSpeed = rvx * txu + rvz * tzu;   // == rvx * uz - rvz * ux (signed 2D cross)
  const angularRate = tangentialSpeed / distance;  // signed bearing rate of the host->target line
  const angularSpeed = Math.abs(angularRate);
  const orbitSign = tangentialSpeed > 0 ? 1 : tangentialSpeed < 0 ? -1 : 0;

  const absTangential = Math.abs(tangentialSpeed);
  const absRadial = Math.abs(radialSpeed);
  const tangentQuality = absTangential / Math.max(absTangential + absRadial, 1e-6);

  const hostSpeed = Math.hypot(hvx, hvz);
  const targetSpeed = Math.hypot(tvx, tvz);
  const relativeSpeed = Math.hypot(rvx, rvz);

  // ---- 6. Line load. ----
  const rawStretch = distance - restLength;
  const stretch = rawStretch > 0 ? rawStretch : 0;
  const slackLength = rawStretch < 0 ? -rawStretch : 0;
  const taut = rawStretch > params.slackEpsilon;
  const tension = taut ? params.lineStiffness * stretch : 0;
  const loadRatio = params.breakTension > 0 ? clamp01(tension / params.breakTension) : 0;

  let loadBand;
  if (!taut) loadBand = 'slack';
  else if (loadRatio >= params.overloadLoadRatio) loadBand = 'overload';
  else if (loadRatio >= params.loadedLoadRatio) loadBand = 'loaded';
  else loadBand = 'taut';

  // ---- 7. Orbit balance. Guard the reduced-mass 0/0 on the SUM, not per-mass. ----
  const mHost = hostMass.value > 0 ? hostMass.value : 0;
  const mTarget = targetMass.value > 0 ? targetMass.value : 0;
  const massSum = mHost + mTarget;
  const reducedMass = massSum > 0 ? (mHost * mTarget) / massSum : 0;
  const massKnown = reducedMass > 0;

  const centripetalDemand = massKnown
    ? (reducedMass * tangentialSpeed * tangentialSpeed) / distance
    : 0;
  const demandKnown = centripetalDemand > params.demandEpsilon;
  // No orbit to balance against (purely radial pass, or unknown mass) -> defined 0, not Infinity.
  const tensionBalance = demandKnown ? (tension - centripetalDemand) / centripetalDemand : 0;

  const balanceTerm = params.stableTensionBalance > 0
    ? clamp01(1 - Math.abs(tensionBalance) / params.stableTensionBalance)
    : (tensionBalance === 0 ? 1 : 0);
  const stableScore = demandKnown ? clamp01(tangentQuality * balanceTerm) : 0;
  const stableInWindow = demandKnown
    && loadBand !== 'slack'
    && loadBand !== 'overload'
    && tangentQuality >= params.stableTangentQuality
    && Math.abs(tensionBalance) <= params.stableTensionBalance;

  // ---- 8. Reel intent. ----
  const intent = reelIntent.present ? reelIntent.value : 0;
  const reelDirection = intent < -params.reelIntentDeadzone ? 'in'
    : intent > params.reelIntentDeadzone ? 'out'
      : 'hold';
  // Paying out or holding never risks a snap; only winching a loaded line does.
  const reelRisk = reelDirection !== 'in' ? 'low'
    : loadRatio >= params.reelRiskHighLoad ? 'high'
      : loadRatio >= params.reelRiskMediumLoad ? 'medium'
        : 'low';

  // ---- 9. Suggested release. Cutting now leaves the host coasting on its current velocity. ----
  const usefulLoad = params.releaseUsefulLoad > 0 ? clamp01(loadRatio / params.releaseUsefulLoad) : 0;
  const overloadPenalty = params.releaseOverloadSpan > 0
    ? clamp01((loadRatio - params.releaseOverloadKnee) / params.releaseOverloadSpan)
    : (loadRatio >= params.releaseOverloadKnee ? 1 : 0);
  const releaseScore = clamp01(tangentQuality * usefulLoad * (1 - overloadPenalty));
  const classification = releaseScore >= params.releaseRazorScore ? 'razor'
    : releaseScore >= params.releaseCleanScore ? 'clean'
      : releaseScore >= params.releaseGoodScore ? 'good'
        : 'messy';

  return {
    ok: true,
    reason: massKnown ? MASSLINE_ORBIT_REASONS.NOMINAL : MASSLINE_ORBIT_REASONS.ZERO_MASS,

    distance,
    lineUnit: { x: ux, z: uz },
    tangentUnit: { x: txu, z: tzu },
    tangentDirection: orbitSign === 0
      ? { x: 0, z: 0 }
      : { x: txu * orbitSign, z: tzu * orbitSign },

    radialSpeed,
    tangentialSpeed,
    angularRate,
    angularSpeed,
    orbitSign,
    tangentQuality,
    hostSpeed,
    targetSpeed,
    relativeSpeed,

    restLength,
    stretch,
    slackLength,
    tension,
    loadRatio,
    loadBand,

    massKnown,
    reducedMass,
    centripetalDemand,
    tensionBalance,
    stableOrbit: {
      inWindow: stableInWindow,
      score: stableScore,
      tangentQuality,
      tensionBalance,
    },

    reelDirection,
    reelRisk,

    release: {
      requested: !!options.releaseIntent,
      advised: releaseScore >= params.releaseAdviseScore,
      vector: { x: hvx, z: hvz },
      exitSpeed: hostSpeed,
      exitAngle: Math.atan2(hvz, hvx),
      // Triangle inequality guarantees peakSpeed >= exitSpeed: the best this swing could convert
      // to if all remaining relative motion were swung tangential. Matches arcPreview.peakSpeed.
      peakSpeed: targetSpeed + relativeSpeed,
      score: releaseScore,
      classification,
    },
  };
}

/**
 * The fail-closed observation. Identical key set to a nominal result -- only the values differ --
 * so consumers never hit undefined regardless of which branch produced the result.
 *
 * Exported so tests and downstream packets can assert shape parity without duplicating the list.
 *
 * @param {string|null} reason - one of MASSLINE_ORBIT_REASONS.
 */
export function safeObservation(reason = MASSLINE_ORBIT_REASONS.NON_FINITE_INPUT) {
  return {
    ok: false,
    reason,

    distance: 0,
    lineUnit: { x: 0, z: 0 },
    tangentUnit: { x: 0, z: 0 },
    tangentDirection: { x: 0, z: 0 },

    radialSpeed: 0,
    tangentialSpeed: 0,
    angularRate: 0,
    angularSpeed: 0,
    orbitSign: 0,
    tangentQuality: 0,
    hostSpeed: 0,
    targetSpeed: 0,
    relativeSpeed: 0,

    restLength: 0,
    stretch: 0,
    slackLength: 0,
    tension: 0,
    loadRatio: 0,
    loadBand: 'slack',

    massKnown: false,
    reducedMass: 0,
    centripetalDemand: 0,
    tensionBalance: 0,
    stableOrbit: {
      inWindow: false,
      score: 0,
      tangentQuality: 0,
      tensionBalance: 0,
    },

    reelDirection: 'hold',
    reelRisk: 'low',

    release: {
      requested: false,
      advised: false,
      vector: { x: 0, z: 0 },
      exitSpeed: 0,
      exitAngle: 0,
      peakSpeed: 0,
      score: 0,
      classification: 'messy',
    },
  };
}

// ---- helpers ----

// Distinguishes "absent" (undefined/null -> present:false, ok:true, value 0) from "non-finite"
// (NaN/Infinity -> ok:false). Absent mass degrades gracefully; NaN mass fails closed.
function readOptionalNumber(value) {
  if (value === undefined || value === null) return { ok: true, present: false, value: 0 };
  if (!Number.isFinite(value)) return { ok: false, present: true, value: 0 };
  return { ok: true, present: true, value };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
