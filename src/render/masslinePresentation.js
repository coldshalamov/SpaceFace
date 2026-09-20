// Massline presentation UVP — pure intent mappers (no Three, no DOM, no physics writes).
//
// Consumers: shipPitchPresentation (pose), vfx (continuous thrash / neon force cues), feel (punches).
// Simulation authority for tumble scheduling and player immunity remains in tumbleStates / combat.

import { INACTIVE_TUMBLE_VFX_PLAN } from './inactiveVfxPlan.js';

export const TUMBLE_STATUS_ID = 'status_tumbling';
const EMPTY_THROWN_TRAIL_INPUT = Object.freeze({});

/** @typedef {'idle'|'tumbling'|'drifting'|'recovering'} TumbleVisualMode */

/**
 * Read presentation-only control-loss flags from combat runtime. Pure over state snapshot.
 * Player is always idle (product rule: player never tumbles / never gets this body language).
 */
export function readControlLossPresentation(state, entity, out = null) {
  const result = out || {};
  const idle = !entity || !state
    || (entity.id != null && entity.id === state.playerId);
  if (idle) return writeIdleControlLossPresentation(result);
  const runtime = state.combat && state.combat.entities
    ? state.combat.entities[String(entity.id)]
    : null;
  const status = runtime && runtime.statuses ? runtime.statuses[TUMBLE_STATUS_ID] : null;
  const tumbling = !!(status && status.id === TUMBLE_STATUS_ID);
  const drifting = !!(runtime && runtime.capabilities && runtime.capabilities.drive === false);
  const now = Number.isFinite(state.simTime)
    ? state.simTime
    : (Number.isFinite(state.tick) ? state.tick / 60 : 0);
  const data = status && status.data ? status.data : null;
  const startedAt = data && Number.isFinite(data.startedAt) ? data.startedAt : null;
  const until = data && Number.isFinite(data.until) ? data.until : null;
  const spin = data && Number.isFinite(data.spin) ? Math.abs(data.spin) : Math.abs(finite(entity.angVel, 0));
  const elapsedS = startedAt != null ? Math.max(0, now - startedAt) : 0;
  const remainS = until != null ? Math.max(0, until - now) : 0;
  const cause = tumbling && data && typeof data.cause === 'string' ? data.cause : null;
  const attackerId = tumbling && status && Object.prototype.hasOwnProperty.call(status, 'attackerId')
    ? status.attackerId
    : null;
  const playerCaused = state.playerId != null && attackerId === state.playerId;
  let mode = 'idle';
  if (tumbling) mode = 'tumbling';
  else if (drifting) mode = 'drifting';
  result.mode = mode;
  result.tumbling = tumbling;
  result.drifting = drifting;
  result.startedAt = startedAt;
  result.until = until;
  result.spin = spin;
  result.elapsedS = elapsedS;
  result.remainS = remainS;
  result.cause = cause;
  result.attackerId = attackerId;
  result.playerCaused = playerCaused;
  return result;
}

function writeIdleControlLossPresentation(result) {
  result.mode = 'idle';
  result.tumbling = false;
  result.drifting = false;
  result.startedAt = null;
  result.until = null;
  result.spin = 0;
  result.elapsedS = 0;
  result.remainS = 0;
  result.cause = null;
  result.attackerId = null;
  result.playerCaused = false;
  return result;
}

function idleControlLossPresentation() {
  return writeIdleControlLossPresentation({});
}

/**
 * Translational thrown-body trail intent. This remains separate from angular tumble body language:
 * its axis and carry are derived only from the craft's live velocity snapshot.
 */
export function resolveThrownBodyTrailPlan(input = {}, out = {}) {
  const source = input && typeof input === 'object' ? input : EMPTY_THROWN_TRAIL_INPUT;
  const plan = out && typeof out === 'object' ? out : {};
  const velocityX = source.velocityX;
  const velocityZ = source.velocityZ;
  const finiteVelocity = Number.isFinite(velocityX) && Number.isFinite(velocityZ);
  const speed = finiteVelocity ? Math.hypot(velocityX, velocityZ) : 0;
  const active = Number.isFinite(speed)
    && source.mode === 'tumbling'
    && source.cause === 'thrown'
    && source.playerCaused === true
    && source.isPlayer !== true
    && source.alive === true
    && speed > 48;

  if (!active) return clearThrownBodyTrailPlan(plan);

  const intensity = clamp01((speed - 48) / 192);
  const reduced = source.reduced === true;
  const fullLength = 14 + intensity * 38;
  const fullWidth = 0.4 + intensity;
  const fullOpacity = 0.55 + intensity * 0.3;
  const length = reduced ? Math.min(22, fullLength * 0.42) : fullLength;
  const width = reduced ? fullWidth * 0.65 : fullWidth;
  const radius = Math.max(0, finite(source.radius, 0));
  const carry = reduced ? 0.18 : 0.35;

  plan.active = true;
  plan.reduced = reduced;
  plan.speed = speed;
  plan.intensity = intensity;
  plan.axisX = velocityX / speed;
  plan.axisZ = velocityZ / speed;
  plan.length = length;
  plan.width = width;
  plan.centerOffset = radius + length * 0.5;
  plan.life = reduced ? 0.28 + intensity * 0.04 : 0.16 + intensity * 0.08;
  plan.opacity = reduced ? Math.min(0.32, fullOpacity * 0.42) : fullOpacity;
  plan.cadenceHz = reduced ? 4 : 8 + intensity * 4;
  plan.carry = carry;
  plan.sourceVelocityX = velocityX;
  plan.sourceVelocityZ = velocityZ;
  plan.residentVelocityX = velocityX * carry;
  plan.residentVelocityZ = velocityZ * carry;
  plan.admissionPriority = source.targetRelevant === true ? 0.98 : 0.92;
  plan.color = '#d8fbff';
  return plan;
}

function clearThrownBodyTrailPlan(plan) {
  plan.active = false;
  plan.reduced = false;
  plan.speed = 0;
  plan.intensity = 0;
  plan.axisX = 0;
  plan.axisZ = 0;
  plan.length = 0;
  plan.width = 0;
  plan.centerOffset = 0;
  plan.life = 0;
  plan.opacity = 0;
  plan.cadenceHz = 0;
  plan.carry = 0;
  plan.sourceVelocityX = 0;
  plan.sourceVelocityZ = 0;
  plan.residentVelocityX = 0;
  plan.residentVelocityZ = 0;
  plan.admissionPriority = 0;
  plan.color = '#d8fbff';
  return plan;
}

/**
 * Sustained multi-axis hull pose + thrash/dead-drive intent while control is lost.
 * bank/pitch are the existing cosmetic axes applied to hull.rotation.x / .z.
 */
export function resolveTumbleBodyLanguage(input = {}) {
  const mode = input.mode || 'idle';
  const cause = typeof input.cause === 'string' ? input.cause : null;
  const attackerId = Object.prototype.hasOwnProperty.call(input, 'attackerId')
    ? input.attackerId
    : null;
  const playerCaused = input.playerCaused === true;
  const angVel = finite(input.angVel, 0);
  const simTime = finite(input.simTime, 0);
  const elapsedS = Math.max(0, finite(input.elapsedS, 0));
  const remainS = Math.max(0, finite(input.remainS, 0));
  const spinAuth = Math.max(Math.abs(angVel), Math.abs(finite(input.spin, 0)));
  const motionReduce = !!input.motionReduce;

  if (mode === 'idle' || motionReduce) {
    return {
      mode: motionReduce && mode !== 'idle' ? mode : 'idle',
      cause,
      attackerId,
      playerCaused,
      bank: finite(input.flightBank, 0),
      pitch: finite(input.flightPitch, 0),
      poseIntensity: 0,
      rcsThrash: 0,
      deadThruster: mode === 'drifting' && !motionReduce ? 1 : 0,
      spinRibbon: 0,
      muzzleScatter: 0,
      hullBlur: 0,
      thrashCadenceHz: 0,
      recovering: false,
    };
  }

  // Thrash-then-fail: RCS loud early, dies as spin bleeds / time runs out.
  const spinNorm = clamp01(spinAuth / 4.5);
  const life = remainS > 0 ? clamp01(remainS / Math.max(remainS + elapsedS, 0.001)) : (mode === 'tumbling' ? 0.55 : 0.35);
  const thrashLife = mode === 'tumbling'
    ? clamp01(0.25 + life * 0.85) * (0.45 + spinNorm * 0.55)
    : 0.12 * spinNorm;
  const poseIntensity = mode === 'tumbling'
    ? clamp01(0.35 + spinNorm * 0.65) * (0.55 + life * 0.45)
    : clamp01(0.18 + spinNorm * 0.35);

  // Multi-axis thrash driven by angVel (and simTime so pose is continuous, not tick-noisy).
  const phase = simTime * (2.2 + spinAuth * 0.85) + finite(input.phaseBias, 0);
  const bankAmp = mode === 'tumbling' ? 0.55 : 0.22;
  const pitchAmp = mode === 'tumbling' ? 0.38 : 0.16;
  const bank = Math.sin(phase) * bankAmp * poseIntensity
    + Math.sin(phase * 1.7) * bankAmp * 0.22 * poseIntensity;
  const pitch = Math.cos(phase * 0.83) * pitchAmp * poseIntensity
    + Math.sin(phase * 2.1) * pitchAmp * 0.18 * poseIntensity;

  const deadThruster = mode === 'drifting' ? 1 : clamp01(1 - thrashLife * 0.35);
  const rcsThrash = mode === 'tumbling' ? thrashLife : thrashLife * 0.4;
  const spinRibbon = mode === 'tumbling' ? clamp01(spinNorm * 0.9 + thrashLife * 0.25) : spinNorm * 0.25;
  const muzzleScatter = mode === 'tumbling' ? clamp01(0.4 + spinNorm * 0.6) : 0.15 * spinNorm;
  const hullBlur = mode === 'tumbling' ? clamp01(spinNorm * 0.75) : spinNorm * 0.2;
  const thrashCadenceHz = rcsThrash > 0.08 ? (6 + rcsThrash * 10) : 0;

  return {
    mode,
    cause,
    attackerId,
    playerCaused,
    bank,
    pitch,
    poseIntensity,
    rcsThrash,
    deadThruster,
    spinRibbon,
    muzzleScatter,
    hullBlur,
    thrashCadenceHz,
    recovering: false,
  };
}

/**
 * Continuous VFX spawn plan from presentation.tumble intent.
 * Consumers (vfx._updateTumbleBodyLanguageVfx) must honor these flags — especially hullBlur.
 */
export function resolveTumbleContinuousVfxPlan(tumble = {}) {
  const thrash = Math.max(0, finite(tumble.rcsThrash, 0));
  const ribbon = Math.max(0, finite(tumble.spinRibbon, 0));
  const hullBlur = Math.max(0, finite(tumble.hullBlur, 0));
  const recovering = !!tumble.recovering;
  const mode = tumble.mode || 'idle';
  const active = mode === 'tumbling' || mode === 'drifting' || recovering;
  if (!active) return INACTIVE_TUMBLE_VFX_PLAN;
  return {
    active,
    thrash,
    ribbon,
    hullBlur,
    spawnThrash: thrash > 0.08,
    spawnRibbon: ribbon > 0.15,
    spawnHullBlur: hullBlur > 0.12,
    thrashCadenceHz: Math.max(0, finite(tumble.thrashCadenceHz, thrash > 0.08 ? 8 : 0)),
  };
}

/** Brief settle after tumble end — damp residual thrash pose toward flight lean. */
export function resolveTumbleRecoverPose(input = {}) {
  const age = Math.max(0, finite(input.ageS, 0));
  const windowS = Math.max(0.05, finite(input.windowS, 0.35));
  const t = clamp01(age / windowS);
  const ease = t * t * (3 - 2 * t);
  const fromBank = finite(input.fromBank, 0);
  const fromPitch = finite(input.fromPitch, 0);
  const toBank = finite(input.flightBank, 0);
  const toPitch = finite(input.flightPitch, 0);
  return {
    mode: t >= 1 ? 'idle' : 'recovering',
    bank: fromBank + (toBank - fromBank) * ease,
    pitch: fromPitch + (toPitch - fromPitch) * ease,
    poseIntensity: (1 - ease) * 0.35,
    rcsThrash: 0,
    deadThruster: 0,
    spinRibbon: (1 - ease) * 0.2,
    muzzleScatter: 0,
    hullBlur: 0,
    thrashCadenceHz: 0,
    recovering: t < 1,
    settle: ease,
  };
}

/**
 * Neon / energy scale for force cues. Hulls stay grounded; only force lanes use these multipliers.
 * baselineIntensity is the lane's current authored intensity (1 = as-authored).
 */
export function resolveForceNeonScale(kind, metrics = {}) {
  const k = String(kind || '');
  const load = clamp01(finite(metrics.load, metrics.tension, 0));
  const severity = clamp01(finite(metrics.severity, 0));
  const rating = String(metrics.rating || '');
  const reduced = !!metrics.flashReduce || !!metrics.motionReduce;

  // Relative to a "hull-neutral" baseline of 1.0 — force cues must resolve strictly > 1 when active.
  const HULL_NEUTRAL = 1.0;
  let energy = HULL_NEUTRAL;
  let lightPeak = 1.0;
  let particleBoost = 1.0;
  let coreWhite = 0;

  if (k === 'massline.taut' || k === 'taut') {
    energy = 1.15 + load * 1.35;          // 1.15..2.5
    lightPeak = 1.2 + load * 1.6;
    coreWhite = 0.15 + load * 0.55;
    particleBoost = 1;
  } else if (k === 'massline.throw' || k === 'throw') {
    energy = 1.85;
    lightPeak = 2.1;
    particleBoost = 1.45;
    coreWhite = 0.55;
  } else if (k === 'massline.whip' || k === 'whip' || k === 'tether.whip_impact') {
    const tier = rating === 'crushing' ? 1 : (rating === 'solid' ? 0.72 : (rating === 'glance' || rating === 'light' ? 0.4 : Math.max(0.45, severity)));
    energy = 1.4 + tier * 1.2;
    lightPeak = 1.5 + tier * 1.5;
    particleBoost = 1.2 + tier * 0.9;
    coreWhite = 0.35 + tier * 0.45;
  } else if (k === 'massline.tumble' || k === 'tumble' || k === 'ship.tumble' || k === 'tumble.continuous') {
    const thrash = clamp01(finite(metrics.rcsThrash, metrics.poseIntensity, 0.5));
    energy = 1.25 + thrash * 0.95;
    lightPeak = 1.15 + thrash * 0.9;
    particleBoost = 1.1 + thrash * 0.7;
    coreWhite = 0.2 + thrash * 0.35;
  } else if (k === 'impulse.detonate' || k === 'charge.detonated' || k === 'impulse') {
    energy = 2.05;
    lightPeak = 2.4;
    particleBoost = 1.55;
    coreWhite = 0.7;
  } else {
    energy = HULL_NEUTRAL;
  }

  if (reduced) {
    energy = HULL_NEUTRAL + (energy - HULL_NEUTRAL) * 0.45;
    lightPeak = 1 + (lightPeak - 1) * 0.4;
    particleBoost = 1 + (particleBoost - 1) * 0.35;
    coreWhite *= 0.5;
  }

  return {
    kind: k || 'unknown',
    hullNeutral: HULL_NEUTRAL,
    energy,
    lightPeak,
    particleBoost,
    coreWhite: clamp01(coreWhite),
    brighterThanHull: energy > HULL_NEUTRAL + 0.05,
  };
}

/**
 * Player-facing feel punch selection for massline payoffs.
 * Returns null when motionReduce or when the event should not vestibular-punch.
 * Informational-only path still returns `{ suppress: true, ... }` with zero vestibular fields
 * when the caller wants a caption path — for motionReduce we return null (caller skips punch).
 */
export function resolveMasslineFeelPunch(event, context = {}) {
  if (!event) return null;
  if (context.motionReduce) return null;
  if (context.mode && context.mode !== 'flight') return null;

  const type = String(event.type || event.id || '');
  const rating = String(event.rating || event.tier || '').toLowerCase();
  const severity = clamp01(finite(event.severity, 0));
  const important = !!(event.important || event.named || event.ace
    || context.important || context.named || context.ace);

  // Clean / razor release (tether:releaseRated tiers).
  // Release snap is a render-phase hitstop. feel.js is nodeSafe:false and is absent from
  // scripts/sf-sim.mjs, so the 47-A tapes cannot see it. motionReduce still returns null
  // before any of these branches.
  if (type === 'tether.release.razor' || rating === 'razor' || event.tier === 'razor') {
    return punch('release.razor', { hsDur: 0.055, fov: 2.4, trauma: 0.16, vig: 0 });
  }
  if (type === 'tether.release.clean' || rating === 'clean' || event.tier === 'clean') {
    return punch('release.clean', { hsDur: 0.038, fov: 1.6, trauma: 0.09, vig: 0 });
  }
  if (type === 'tether.release.good' || rating === 'good' || event.tier === 'good') {
    // Good is intentional but light — still "I did that," below clean.
    return punch('release.good', { hsDur: 0.020, fov: 0.9, trauma: 0.04, vig: 0 });
  }
  if (type === 'tether.release.messy' || rating === 'messy') {
    return null;
  }

  // Tumble start — full punch only for named/important targets; ordinary hosts get a lighter nudge.
  if (type === 'massline.tumbled' || type === 'massline:tumbled' || type === 'ship.tumble.start') {
    if (important) {
      return punch('tumble.important', { hsDur: 0.028, fov: 2.0, trauma: 0.14, vig: 0 });
    }
    return punch('tumble.ordinary', { hsDur: 0, fov: 0.7, trauma: 0.05, vig: 0 });
  }

  // Whip impact severity tiers.
  if (type === 'tether.whip_impact' || type === 'tether:whipImpact' || type === 'massline.whip') {
    if (rating === 'crushing' || severity >= 0.85) {
      return punch('whip.crushing', { hsDur: 0.050, fov: 2.8, trauma: 0.2, vig: 0.06 });
    }
    if (rating === 'solid' || severity >= 0.55) {
      return punch('whip.solid', { hsDur: 0.030, fov: 1.8, trauma: 0.12, vig: 0 });
    }
    // glance / light / default
    return punch('whip.glance', { hsDur: 0, fov: 0.8, trauma: 0.05, vig: 0 });
  }

  // Recover settle — soft FOV only, no hit-stop.
  if (type === 'massline.tumbleEnd' || type === 'massline:tumbleEnd' || type === 'ship.tumble.recover') {
    return punch('tumble.recover', { hsDur: 0, fov: 0.55, trauma: 0.03, vig: 0 });
  }

  return null;
}

function punch(id, fields) {
  return Object.freeze({
    id,
    hsDur: fields.hsDur,
    fov: fields.fov,
    trauma: fields.trauma,
    vig: fields.vig,
    suppress: false,
  });
}

function finite(v, fb = 0) {
  return Number.isFinite(v) ? v : fb;
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// ---------------------------------------------------------------------------
// Cable surface profile (VFX_TECHNIQUE_STANDARD §3 "Loaded Massline").
//
// The pure tension -> SHAPE mapping for the drawn line. Everything here is a geometric channel:
// how finely the curve is sampled, how thick each cross-section is, and how the load ferrules are
// cut. Colour is resolved elsewhere (resolveForceNeonScale + the ribbon shader) and is deliberately
// NOT the only load read — width, ferrule profile and curve sampling all move with load on their
// own, so the line still reads loaded in greyscale.
//
// No Three, no clock, no GameState. src/render/masslineCableSurface.js turns these numbers into
// resident buffers; vfx.js owns the live endpoints and feeds them in.
// ---------------------------------------------------------------------------

/** Below this a straight span is already pixel-exact: the shader's travel is a varying, not a mesh. */
const CABLE_SEGMENT_FLOOR = 6;
/**
 * Spans the resident cable buffer holds. Reached only by a whipping, shivering, deeply bowed line.
 * src/render/masslineCableSurface.js allocates against this exact number and re-exports it, so the
 * planner can never ask for a span the buffer does not have.
 */
export const MASSLINE_CABLE_SEGMENT_CAPACITY = 48;
/** Chord-to-arc error accepted per span, in world units (~0.8 px at the supported gameplay camera). */
const CABLE_SAGITTA_TOLERANCE_WU = 0.045;
/** The slack bow is one half-cycle of sin(pi*t) across the span. */
const CABLE_BOW_CYCLES = 0.5;

/**
 * Spans needed to draw one lateral sinusoid inside the tolerance.
 *
 * A sinusoid of amplitude A and k spatial cycles, sampled with n straight spans, departs from the
 * true curve by about A * (pi*k/n)^2 / 2. Solving that for the tolerance gives one rule that covers
 * the slack bow, the whip harmonic and the load shiver alike, instead of a sagitta guess for the
 * first and a samples-per-cycle guess for the other two. A term whose whole amplitude is already
 * below the tolerance is invisible and buys no spans at all.
 */
function spansForLateralTerm(amplitude, cycles, tolerance) {
  const a = Math.abs(Number.isFinite(amplitude) ? amplitude : 0);
  const k = Math.max(0, Number.isFinite(cycles) ? cycles : 0);
  if (!(a > tolerance) || k <= 0) return 0;
  return Math.ceil(Math.PI * k * Math.sqrt(a / (2 * tolerance)));
}
/** Reference tessellation the accepted collar length was authored against (the old fixed SEG). */
const CABLE_COLLAR_LENGTH_REFERENCE = 24 * 3.2;

/**
 * Curvature-sensitive tessellation plus the cross-section and ferrule cut for one drawn cable.
 *
 * `out` is caller-owned so the frame path never allocates.
 *
 * Inputs are all already-resolved presentation truth from the live cable:
 *   chord            world-unit distance between the two RENDERED attachment points
 *   load / taut      the presentation load read (tether.load, phase-floored) and its taut gate
 *   whip / reel      the latch/snap recoil envelope and the winch read, both 0..1
 *   bowMagnitude     peak lateral slack bow, world units (already signed-away)
 *   whipAmplitude    peak lateral whip displacement, world units
 *   shiverAmplitude  peak lateral load shiver, world units
 *   whipCycles       spatial cycles of the whip harmonic across the span
 *   shiverCycles     spatial cycles of the fastest shiver term across the span
 *   segmentCapacity  the resident buffer's span capacity
 */
export function resolveMasslineCableProfile(input = {}, out = {}) {
  const chord = Math.max(0, finite(input.chord, 0));
  const load = clamp01(finite(input.load, 0));
  const taut = input.taut === true;
  const whip = clamp01(finite(input.whip, 0));
  const reel = clamp01(finite(input.reel, 0));
  const parting = input.parting === true;
  const collarCount = Math.max(1, Math.trunc(finite(input.collarCount, 10)));
  const bow = Math.abs(finite(input.bowMagnitude, 0));
  const whipAmplitude = Math.abs(finite(input.whipAmplitude, 0));
  const shiverAmplitude = Math.abs(finite(input.shiverAmplitude, 0));
  const capacity = Math.max(
    CABLE_SEGMENT_FLOOR,
    Math.trunc(finite(input.segmentCapacity, MASSLINE_CABLE_SEGMENT_CAPACITY)),
  );

  // Sample the curve for what is actually on it this frame, term by term. A quiet, straight, taut
  // line needs almost no spans and loses nothing by having few, because the shader's travelling
  // structure rides `aAlong` — a perspective-correct varying that is exactly linear along a
  // straight span. A worked line asks for far more than the old fixed 24 precisely where the old
  // count was under-sampling its own shiver into the jagged read it was trying to avoid. Reduced
  // motion zeroes these amplitudes upstream, so removing the motion also removes its cost.
  const tolerance = CABLE_SAGITTA_TOLERANCE_WU;
  const sagittaNeed = spansForLateralTerm(bow, CABLE_BOW_CYCLES, tolerance);
  const waveNeed = Math.max(
    spansForLateralTerm(whipAmplitude, finite(input.whipCycles, 0), tolerance),
    spansForLateralTerm(shiverAmplitude, finite(input.shiverCycles, 0), tolerance),
  );
  const deviation = bow + whipAmplitude + shiverAmplitude;
  const segments = Math.max(
    CABLE_SEGMENT_FLOOR,
    Math.min(capacity, Math.max(sagittaNeed, waveNeed)),
  );

  // Cross-section. The authored relation is unchanged: a taut line reads THINNER than a slack one,
  // and load swells both draws slightly so a heavy pull is legible in silhouette alone.
  const coreHalfWidth = (taut ? 0.26 : 0.34) + load * 0.08 + whip * 0.08;
  const sheathHalfWidth = 0.62 + 0.55 * load + whip * 0.45 + reel * 0.30;

  // Load ferrules. Length is deliberately keyed off the CHORD against a fixed reference, never off
  // the live span count — otherwise adaptive tessellation would silently resize the hardware.
  //
  // It is then capped at a third of the pitch between rings. That cap is what keeps the hardware
  // legible when the line runs along the camera's screen axis: at the supported 60-degree gameplay
  // tilt a cable pointing up-screen foreshortens by about half, and rings that merely LOOK close
  // together still read as separate rings, while rings that actually touch read as one tube.
  const collarPitch = chord / (collarCount + 1);
  const collarHalfLength = Math.min(
    Math.min(1.9, Math.max(0.5, chord / CABLE_COLLAR_LENGTH_REFERENCE)) * (1 + load * 0.55),
    Math.max(0.05, collarPitch * 0.35),
  );
  // The cut itself is the load read. Slack: a rounded swell barely proud of the rope. Taut: the
  // lips undercut hard and the crown stands off, so the ferrule becomes a machined ring with a
  // real edge. Nothing in this relation is a colour.
  //
  // PARTING is the third state, and it is what keeps a snap distinct from a clean release without
  // touching either one's timing or adding a single particle. A parting line is no longer gripped:
  // the lips open back out toward the crown and the hard shoulder softens, so the hardware visibly
  // lets go while the rope lashes. A clean release has no whip envelope at all, so its ferrules
  // simply hold their shape and fade with the line while the released body carries the momentum —
  // which is exactly where the energy is supposed to go.
  const release = parting ? clamp01(whip) : 0;
  const grip = 1 - release;
  const collarCrownHalfWidth = coreHalfWidth * 1.34 + 0.08 + load * 0.30;
  const collarLipHalfWidth = coreHalfWidth * (0.94 - 0.34 * load * grip)
    + (collarCrownHalfWidth - coreHalfWidth * 0.94) * release * 0.75;
  // Plateau fraction: how much of the ferrule's length is crown rather than ramp. A slack ferrule
  // is a soft dome (long ramps, almost no plateau); a loaded one is a hard-shouldered ring whose
  // crown fills its length and whose sides stand near-vertical.
  const collarCrownFraction = (0.34 + load * 0.52) * grip + 0.18 * release;

  out.segments = segments;
  out.segmentCapacity = capacity;
  out.sagittaSegments = sagittaNeed;
  out.waveSegments = waveNeed;
  out.deviation = deviation;
  out.coreHalfWidth = coreHalfWidth;
  out.sheathHalfWidth = sheathHalfWidth;
  out.collarHalfLength = collarHalfLength;
  out.collarCrownHalfWidth = collarCrownHalfWidth;
  out.collarLipHalfWidth = collarLipHalfWidth;
  out.collarCrownFraction = clamp01(collarCrownFraction);
  out.collarCount = collarCount;
  out.collarPitch = collarPitch;
  out.parting = parting;
  out.grip = grip;
  out.load = load;
  out.taut = taut;
  return out;
}

/**
 * Snarl strand lay. One physical relation: a rope's turn count is fixed by how it was laid, but a
 * slack rope's strands bow well away from the axis and a pulled one's collapse toward it. Amplitude
 * therefore carries the tension and turn count does not — which keeps the strand read stable while
 * the line works, instead of appearing to re-braid itself every frame.
 */
export function resolveMasslineWebStrandProfile(input = {}, out = {}) {
  const maxSlack = Math.max(1e-6, finite(input.maxSlack, 12));
  const slack = Math.max(0, Math.min(maxSlack, finite(input.slack, 0)));
  const slackNorm = clamp01(slack / maxSlack);
  out.slack = slack;
  out.slackNorm = slackNorm;
  out.braidTurns = 3;
  out.braidAmplitude = 0.30 + 0.62 * slackNorm;
  out.liftAmplitude = 0.20 + 0.42 * slackNorm;
  return out;
}
