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
export function readControlLossPresentation(state, entity) {
  if (!entity || !state) {
    return idleControlLossPresentation();
  }
  if (entity.id != null && entity.id === state.playerId) {
    return idleControlLossPresentation();
  }
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
  return {
    mode,
    tumbling,
    drifting,
    startedAt,
    until,
    spin,
    elapsedS,
    remainS,
    cause,
    attackerId,
    playerCaused,
  };
}

function idleControlLossPresentation() {
  return {
    mode: 'idle',
    tumbling: false,
    drifting: false,
    startedAt: null,
    until: null,
    spin: 0,
    elapsedS: 0,
    remainS: 0,
    cause: null,
    attackerId: null,
    playerCaused: false,
  };
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
