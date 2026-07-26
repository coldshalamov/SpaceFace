/**
 * Continuous throttle sampling for plume recipes.
 * Hot-path API mutates caller-owned scratch — no object allocation.
 */
import { sampleCurve } from '../recipes/validate.js';
import { continuumForRecipe } from '../recipes/familyRecipes.js';

/** Drive continuum modes communicated by structure/timing (VP-220). */
export const DRIVE_MODES = Object.freeze([
  'idle',
  'accel',
  'cruise',
  'boost',
  'brake',
  'reverse',
]);

/**
 * Resolve a continuum mode from a preallocated signals scratch. No allocation.
 * Priority: reverse > boost > cruise > brake > accel > idle.
 *
 * `throttle` must be the **commanded** forward authority (not smoothed residual drive).
 * `drive` is residual/effective plume energy (may include speed bleed).
 * Pass the same persistent object used by sampleThrottleInto / PlumeSlotPool.
 *
 * @param {object|null|undefined} signals preallocated scratch (mutated fields only read)
 * @param {object} [recipe]
 * @returns {'idle'|'accel'|'cruise'|'boost'|'brake'|'reverse'}
 */
export function resolveDriveMode(signals, recipe) {
  const s = signals || EMPTY_DRIVE_SIGNALS;
  const reverse = Math.max(0, s.reverse || 0);
  const retroOnly = !!s.retroOnly;
  if (retroOnly || reverse > 0.08) return 'reverse';
  // Prefer boostBlend (smoothed) then boost (command target).
  const boost = Math.max(0, s.boostBlend != null ? s.boostBlend : (s.boost || 0));
  if (boost > 0.35) return 'boost';
  const cruise = Math.max(0, s.cruise || 0);
  if (cruise > 0.5) return 'cruise';
  // Commanded throttle only — never substitute smoothed plumeDrive here.
  const throttle = Math.max(0, s.throttle != null ? s.throttle : 0);
  const residual = Math.max(0, s.drive != null ? s.drive : 0);
  const continuum = continuumForRecipe(recipe);
  const idleFloor = continuum?.idle?.driveFloor
    ?? (recipe?.kind === 'continuous_plume' ? (recipe.throttle?.idle || 0.06) : 0);
  // Braking: residual forward heat while not commanding thrust.
  if (throttle < idleFloor * 1.5 && residual > idleFloor && boost < 0.1) {
    if ((s.brake || 0) > 0.2 || ((s.speedDrive || 0) > 0.25 && throttle < 0.12)) return 'brake';
  }
  if (throttle <= idleFloor * 1.05 && residual <= idleFloor * 1.2) return 'idle';
  return 'accel';
}

/** Frozen empty signals for resolveDriveMode(null) — no alloc. */
const EMPTY_DRIVE_SIGNALS = Object.freeze({
  drive: 0,
  throttle: 0,
  boost: 0,
  boostBlend: 0,
  cruise: 0,
  reverse: 0,
  retroOnly: false,
  brake: 0,
  speedDrive: 0,
});

/**
 * Module-owned mode classification scratch. sampleThrottleInto fills this when
 * caller flags omit drive/throttle fields — never mutates caller flags (may be frozen).
 */
const MODE_CLASSIFY_SCRATCH = {
  drive: 0,
  throttle: 0,
  boost: 0,
  boostBlend: 0,
  cruise: 0,
  reverse: 0,
  retroOnly: false,
  brake: 0,
  speedDrive: 0,
  mode: null,
};

/**
 * Apply continuum structural multipliers into a throttle sample (mutates sample).
 * @param {object} recipe
 * @param {string} mode
 * @param {object} sample from sampleThrottleInto
 * @param {number} [boostBlend]
 */
export function applyContinuumToSample(recipe, mode, sample, boostBlend = 0) {
  const continuum = continuumForRecipe(recipe);
  const m = continuum && continuum[mode] ? continuum[mode] : null;
  if (!m) {
    sample.mode = mode || 'accel';
    return sample;
  }
  if (m.mainSuppressed) {
    sample.length *= 0.08;
    sample.width *= 0.55;
    sample.flowSpeed *= 0.2;
    sample.turbulence *= 0.35;
    sample.effectiveDrive *= 0.12;
  } else {
    if (m.lengthMul != null) sample.length *= m.lengthMul;
    if (m.widthMul != null) sample.width *= m.widthMul;
    if (m.turbulenceMul != null) sample.turbulence *= m.turbulenceMul;
    if (m.flowMul != null) sample.flowSpeed *= m.flowMul;
    if (m.coreBias != null) {
      sample.coreSheathBalance = Math.max(0.15, sample.coreSheathBalance + m.coreBias);
    }
  }
  // Boost structural drive remains continuous even when mode is boost (blend-aware).
  if (boostBlend > 0 && continuum.boost && mode !== 'boost') {
    const b = continuum.boost;
    const t = Math.max(0, Math.min(1, boostBlend));
    if (b.lengthMul != null) sample.length *= 1 + (b.lengthMul - 1) * t * 0.35;
    if (b.flowMul != null) sample.flowSpeed *= 1 + (b.flowMul - 1) * t * 0.35;
  }
  sample.mode = mode;
  return sample;
}

/**
 * Fill `out` with throttle sample. Allocates nothing.
 * @param {object} recipe
 * @param {number} throttle
 * @param {{ reducedMotion?: boolean, reducedFlash?: boolean, lowQuality?: boolean, mode?: string, boostBlend?: number, cruise?: number, reverse?: number, retroOnly?: boolean, brake?: number, speedDrive?: number, drive?: number }} a11y
 * @param {object} out preallocated sample object
 * @returns {object} out
 */
export function sampleThrottleInto(recipe, throttle, a11y, out) {
  const th = recipe.throttle;
  const idle = recipe.kind === 'continuous_plume' ? (th.idle || 0) : 0;
  const t = Math.max(idle, Math.max(0, throttle));
  const flags = a11y || {};

  let length = sampleCurve(th.length, t);
  let width = sampleCurve(th.width, t);
  let turbulence = sampleCurve(th.turbulence, t);
  let coreSheathBalance = sampleCurve(th.coreSheathBalance, t);
  let dissipation = sampleCurve(th.dissipation, t);
  let flowSpeed = sampleCurve(th.flowSpeed, t);

  const baseFlow = recipe.identity?.flowCharacter?.baseFlow ?? 2.4;
  flowSpeed *= baseFlow / 2.4;

  if (flags.reducedMotion && recipe.accessibility?.reducedMotion) {
    const p = recipe.accessibility.reducedMotion;
    flowSpeed *= p.flowSpeedScale ?? 0.12;
    coreSheathBalance += p.staticCoreBoost ?? 0.15;
    turbulence = Math.min(turbulence, 0.55);
  }

  if (flags.reducedFlash && recipe.accessibility?.reducedFlash) {
    const p = recipe.accessibility.reducedFlash;
    coreSheathBalance = Math.min(coreSheathBalance, 0.5 + (p.coreWhitenessCap ?? 0.35));
  }

  if (flags.lowQuality) {
    turbulence *= 0.7;
  }

  out.throttle = t;
  out.length = length;
  out.width = width;
  out.turbulence = turbulence;
  out.coreSheathBalance = coreSheathBalance;
  out.dissipation = dissipation;
  out.flowSpeed = flowSpeed;
  out.effectiveDrive = t;
  out.mode = 'accel';

  // Never mutate caller flags (may be Object.freeze'd accessibility/settings inputs).
  // Prefer full persistent scratch when present; otherwise classify via module scratch.
  let mode = flags.mode || null;
  let boostBlend = flags.boostBlend != null ? flags.boostBlend : 0;
  if (!mode) {
    const hasFullSignals = flags.drive != null || flags.throttle != null
      || flags.brake != null || flags.reverse != null || flags.retroOnly
      || flags.cruise != null || flags.speedDrive != null || flags.boost != null
      || flags.boostBlend != null;
    if (hasFullSignals) {
      // Read-only view: copy into module scratch without writing flags.
      MODE_CLASSIFY_SCRATCH.drive = flags.drive != null ? flags.drive : t;
      MODE_CLASSIFY_SCRATCH.throttle = flags.throttle != null ? flags.throttle : t;
      MODE_CLASSIFY_SCRATCH.boost = flags.boost != null ? flags.boost : 0;
      MODE_CLASSIFY_SCRATCH.boostBlend = boostBlend;
      MODE_CLASSIFY_SCRATCH.cruise = flags.cruise || 0;
      MODE_CLASSIFY_SCRATCH.reverse = flags.reverse || 0;
      MODE_CLASSIFY_SCRATCH.retroOnly = !!flags.retroOnly;
      MODE_CLASSIFY_SCRATCH.brake = flags.brake || 0;
      MODE_CLASSIFY_SCRATCH.speedDrive = flags.speedDrive || 0;
      mode = resolveDriveMode(MODE_CLASSIFY_SCRATCH, recipe);
    } else {
      // Minimal path (a11y-only flags): idle vs accel from sample throttle alone.
      MODE_CLASSIFY_SCRATCH.drive = t;
      MODE_CLASSIFY_SCRATCH.throttle = t;
      MODE_CLASSIFY_SCRATCH.boost = 0;
      MODE_CLASSIFY_SCRATCH.boostBlend = 0;
      MODE_CLASSIFY_SCRATCH.cruise = 0;
      MODE_CLASSIFY_SCRATCH.reverse = 0;
      MODE_CLASSIFY_SCRATCH.retroOnly = false;
      MODE_CLASSIFY_SCRATCH.brake = 0;
      MODE_CLASSIFY_SCRATCH.speedDrive = 0;
      mode = resolveDriveMode(MODE_CLASSIFY_SCRATCH, recipe);
    }
  }
  applyContinuumToSample(recipe, mode, out, boostBlend);
  return out;
}

/**
 * Convenience non-hot-path helper (allocates). Prefer sampleThrottleInto in systems.
 */
export function sampleThrottle(recipe, throttle, a11y = {}) {
  return sampleThrottleInto(recipe, throttle, a11y, {
    throttle: 0,
    length: 0,
    width: 0,
    turbulence: 0,
    coreSheathBalance: 0,
    dissipation: 0,
    flowSpeed: 0,
    effectiveDrive: 0,
    mode: 'idle',
  });
}

/**
 * Mutates state; no allocation.
 */
export function integrateDriveState(state, rawDrive, targetBoost, dt, rates) {
  const driveRise = rates.driveRise ?? 9.5;
  const driveFall = rates.driveFall ?? 4.2;
  const boostRise = rates.boostRise ?? 8.5;
  const boostFall = rates.boostFall ?? 3.6;
  const d = Math.max(0, dt || 0);
  const driveRate = rawDrive > state.plumeDrive ? driveRise : driveFall;
  const boostRate = targetBoost > state.boostBlend ? boostRise : boostFall;
  state.plumeDrive += (rawDrive - state.plumeDrive) * (1 - Math.exp(-driveRate * d));
  state.boostBlend += (targetBoost - state.boostBlend) * (1 - Math.exp(-boostRate * d));
  return state;
}

/**
 * Precompile drive rates from recipe identity (call once at init).
 */
export function compileDriveRates(recipe, out) {
  const t = recipe.identity?.timingCharacter || {};
  out.driveRise = t.driveRise ?? 9.5;
  out.driveFall = t.driveFall ?? 4.2;
  out.boostRise = t.boostRise ?? 8.5;
  out.boostFall = t.boostFall ?? 3.6;
  return out;
}

export function sampleImpulseEnvelope(age, timing) {
  if (age < 0) return 0;
  const a = timing.attack || 0.03;
  const s = timing.sustain || 0.05;
  const r = timing.release || 0.12;
  if (age < a) return a <= 0 ? 1 : age / a;
  if (age < a + s) return 1;
  if (age < a + s + r) {
    const u = (age - a - s) / Math.max(1e-6, r);
    return 1 - u;
  }
  return 0;
}

/**
 * Assert continuous response across a throttle sweep.
 */
export function assertContinuousThrottleResponse(recipe, steps = 9) {
  const failures = [];
  const samples = [];
  const scratch = {
    throttle: 0,
    length: 0,
    width: 0,
    turbulence: 0,
    coreSheathBalance: 0,
    dissipation: 0,
    flowSpeed: 0,
    effectiveDrive: 0,
    mode: 'idle',
  };
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    // Force accel continuum so the sweep measures throttle curves, not mode hops.
    sampleThrottleInto(recipe, t, { mode: 'accel' }, scratch);
    samples.push({
      length: scratch.length,
      width: scratch.width,
      turbulence: scratch.turbulence,
      coreSheathBalance: scratch.coreSheathBalance,
      dissipation: scratch.dissipation,
      flowSpeed: scratch.flowSpeed,
    });
  }
  const keys = ['length', 'width', 'turbulence', 'coreSheathBalance', 'dissipation', 'flowSpeed'];
  for (const key of keys) {
    let changed = false;
    for (let i = 1; i < samples.length; i++) {
      if (Math.abs(samples[i][key] - samples[i - 1][key]) > 1e-4) changed = true;
    }
    const first = samples[0][key];
    const last = samples[samples.length - 1][key];
    if (Math.abs(last - first) < 0.04) {
      failures.push(`${key} does not continuously respond to throttle (Δ=${(last - first).toFixed(4)})`);
    }
    if (!changed) failures.push(`${key} is constant across throttle sweep`);
  }
  return { ok: failures.length === 0, failures, samples };
}
