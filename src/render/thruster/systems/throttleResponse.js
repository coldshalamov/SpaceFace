/**
 * Continuous throttle sampling for plume recipes.
 * Hot-path API mutates caller-owned scratch — no object allocation.
 */
import { sampleCurve } from '../recipes/validate.js';

/**
 * Fill `out` with throttle sample. Allocates nothing.
 * @param {object} recipe
 * @param {number} throttle
 * @param {{ reducedMotion?: boolean, reducedFlash?: boolean, lowQuality?: boolean }} a11y
 * @param {object} out preallocated sample object
 * @returns {object} out
 */
export function sampleThrottleInto(recipe, throttle, a11y, out) {
  const th = recipe.throttle;
  const idle = recipe.kind === 'continuous_plume' ? (th.idle || 0) : 0;
  const t = Math.max(idle, Math.max(0, throttle));

  let length = sampleCurve(th.length, t);
  let width = sampleCurve(th.width, t);
  let turbulence = sampleCurve(th.turbulence, t);
  let coreSheathBalance = sampleCurve(th.coreSheathBalance, t);
  let dissipation = sampleCurve(th.dissipation, t);
  let flowSpeed = sampleCurve(th.flowSpeed, t);

  const baseFlow = recipe.identity?.flowCharacter?.baseFlow ?? 2.4;
  flowSpeed *= baseFlow / 2.4;

  if (a11y && a11y.reducedMotion && recipe.accessibility?.reducedMotion) {
    const p = recipe.accessibility.reducedMotion;
    flowSpeed *= p.flowSpeedScale ?? 0.12;
    coreSheathBalance += p.staticCoreBoost ?? 0.15;
    turbulence = Math.min(turbulence, 0.55);
  }

  if (a11y && a11y.reducedFlash && recipe.accessibility?.reducedFlash) {
    const p = recipe.accessibility.reducedFlash;
    coreSheathBalance = Math.min(coreSheathBalance, 0.5 + (p.coreWhitenessCap ?? 0.35));
  }

  if (a11y && a11y.lowQuality) {
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
  };
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    sampleThrottleInto(recipe, t, {}, scratch);
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
