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
export function applyContinuumToSample(recipe, mode, sample, boostBlend = 0, weights = null) {
  const continuum = continuumForRecipe(recipe);
  // Per-entity blended modes (see integrateModeWeights): the structural multipliers are a
  // weighted mix of every mode, so a mode flip is a ~0.14 s crossfade instead of a one-frame step
  // in length (brake x0.42, reverse x0.08).
  if (weights && continuum) return applyBlendedContinuum(continuum, mode, sample, boostBlend, weights);
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
 * Weighted continuum: the same structural multipliers as the discrete path, mixed by `weights`
 * (one per DRIVE_MODES entry, summing to 1). With a one-hot weight vector this is exactly the
 * discrete result. Allocates nothing.
 */
function applyBlendedContinuum(continuum, mode, sample, boostBlend, weights) {
  let lengthMul = 0;
  let widthMul = 0;
  let turbMul = 0;
  let flowMul = 0;
  let driveMul = 0;
  let coreBias = 0;
  for (let i = 0; i < DRIVE_MODES.length; i++) {
    const w = weights[i];
    if (!(w > 1e-4)) continue;
    const m = continuum[DRIVE_MODES[i]];
    if (!m) {
      lengthMul += w; widthMul += w; turbMul += w; flowMul += w; driveMul += w;
    } else if (m.mainSuppressed) {
      // The same numbers the discrete path applies for a suppressed main drive.
      lengthMul += w * 0.08; widthMul += w * 0.55; turbMul += w * 0.35; flowMul += w * 0.2;
      driveMul += w * 0.12;
    } else {
      lengthMul += w * (m.lengthMul != null ? m.lengthMul : 1);
      widthMul += w * (m.widthMul != null ? m.widthMul : 1);
      turbMul += w * (m.turbulenceMul != null ? m.turbulenceMul : 1);
      flowMul += w * (m.flowMul != null ? m.flowMul : 1);
      driveMul += w;
      if (m.coreBias != null) coreBias += w * m.coreBias;
    }
  }
  sample.length *= lengthMul;
  sample.width *= widthMul;
  sample.turbulence *= turbMul;
  sample.flowSpeed *= flowMul;
  sample.effectiveDrive *= driveMul;
  if (coreBias !== 0) sample.coreSheathBalance = Math.max(0.15, sample.coreSheathBalance + coreBias);
  // Boost structure stays continuous (blend-aware), now scaled by how little of the blend IS boost.
  if (boostBlend > 0 && continuum.boost) {
    const b = continuum.boost;
    const t = Math.max(0, Math.min(1, boostBlend)) * (1 - (weights[BOOST_INDEX] || 0));
    if (b.lengthMul != null) sample.length *= 1 + (b.lengthMul - 1) * t * 0.35;
    if (b.flowMul != null) sample.flowSpeed *= 1 + (b.flowMul - 1) * t * 0.35;
  }
  sample.mode = mode;
  return sample;
}

const BOOST_INDEX = DRIVE_MODES.indexOf('boost');
const ACCEL_INDEX = DRIVE_MODES.indexOf('accel');

/** Time constant of the drive-mode crossfade, seconds. */
export const MODE_BLEND_TAU = 0.14;

/**
 * Advance one entity's mode weights toward the discrete mode `mode`. The weights live on the
 * entity's own drive state (created once, lazily, so there is no per-frame allocation) and start
 * one-hot, so a freshly spawned plume never fades in from a blend of nothing. Mutates and returns
 * the Float32Array.
 */
export function integrateModeWeights(state, mode, dt) {
  let w = state.modeWeights;
  if (!w) {
    w = state.modeWeights = new Float32Array(DRIVE_MODES.length);
    state.modeSeeded = false;
  }
  let target = DRIVE_MODES.indexOf(mode);
  if (target < 0) target = ACCEL_INDEX;
  if (!state.modeSeeded) {
    w.fill(0);
    w[target] = 1;
    state.modeSeeded = true;
    return w;
  }
  const a = 1 - Math.exp(-Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0)) / MODE_BLEND_TAU);
  let sum = 0;
  for (let i = 0; i < w.length; i++) {
    w[i] += ((i === target ? 1 : 0) - w[i]) * a;
    sum += w[i];
  }
  if (sum > 1e-6) for (let i = 0; i < w.length; i++) w[i] /= sum;
  return w;
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
  applyContinuumToSample(recipe, mode, out, boostBlend, flags.modeWeights || null);
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
/**
 * How fast a fleet drive's ignition transient decays, per second. Roughly a third of a second of
 * overpressure, which is what the player's own drive uses and what reads as an event rather than
 * a ramp.
 */
export const IGNITION_DECAY_PER_S = 3.6;
/** Boost blend per second that counts as the taps being THROWN open rather than eased. */
export const IGNITION_TRIGGER_RATE = 3.5;

export function integrateDriveState(state, rawDrive, targetBoost, dt, rates) {
  const driveRise = rates.driveRise ?? 9.5;
  const driveFall = rates.driveFall ?? 4.2;
  const boostRise = rates.boostRise ?? 8.5;
  const boostFall = rates.boostFall ?? 3.6;
  const d = Math.max(0, dt || 0);
  const driveRate = rawDrive > state.plumeDrive ? driveRise : driveFall;
  const boostRate = targetBoost > state.boostBlend ? boostRise : boostFall;
  const prevBoost = state.boostBlend;
  const prevDrive = state.plumeDrive;
  state.plumeDrive += (rawDrive - state.plumeDrive) * (1 - Math.exp(-driveRate * d));
  state.boostBlend += (targetBoost - state.boostBlend) * (1 - Math.exp(-boostRate * d));

  // IGNITION — lighting a drive is an EVENT, not the first part of a ramp.
  //
  // Two exponentials settling toward a target describe a dial being turned. What a drive
  // actually does when the taps are thrown open is overpressure: the chamber spikes above its
  // steady value, the shock train snaps in, and then it settles. Without that, boost and a
  // standing start are the same motion at two speeds, and the player never feels the machine
  // commit to anything.
  //
  // Deliberately rate-triggered, not level-triggered: easing the throttle up produces no
  // transient at all, which is the difference between opening a valve and slamming it. The
  // fleet path consumes it structurally — crease sharpness, fold speed and a bounded length
  // overshoot — never as a brightness pop, so a reduced-flash profile still sees the event.
  if (d > 0) {
    const boostSlew = (state.boostBlend - prevBoost) / d;
    const driveSlew = (state.plumeDrive - prevDrive) / d;
    const throw_ = Math.max(boostSlew, driveSlew * 0.55);
    if (throw_ > IGNITION_TRIGGER_RATE) {
      const kick = Math.min(1, (throw_ - IGNITION_TRIGGER_RATE) / (IGNITION_TRIGGER_RATE * 2.5));
      const ign = state.ignition || 0;
      state.ignition = Math.min(1, ign + kick * (1 - ign * 0.6));
    }
  }
  state.ignition = Math.max(0, (state.ignition || 0) - d * IGNITION_DECAY_PER_S);
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

/**
 * Extra seconds every control jet takes to arrive, ADDED to its family's own recipe attack (so a vector
 * drive's needle still arrives sooner than an industrial one's puff, by the same margin as authored).
 *
 * The recipe attacks are 14-28 ms: at 60 Hz that is one or two presentation ticks, i.e. the jet's first
 * drawn frame was already 100% of its reach with the collar flash lit (slice 1b, RCS lifecycle). With the
 * ramp a jet takes ~5 ticks to arrive: first tick a stub, no tick above ~1/3 of its reach.
 */
export const IMPULSE_PRESS_RAMP_S = 0.07;

/**
 * Share of the release during which the packet still holds its whole body (the collar shuts, the head
 * leaves) before its ROOT starts to leave the nozzle. Small on purpose: the tail has to be spent over
 * several ticks even for the shortest-release family, so it starts almost at once and eases in.
 */
export const IMPULSE_TAPER_START = 0.1;

const IMPULSE_DEFAULT_TIMING = Object.freeze({ attack: 0.03, sustain: 0.05, release: 0.12 });

/**
 * The ONE timing record an impulse lives and is sampled by: recipe timing with the press ramp added.
 * The pool's life check, the envelope, the body shape and the event light all read this record, so none
 * of them can retire an impulse while another is still drawing it (a mismatch there is a hard cut).
 */
export function resolveImpulseTiming(recipeTiming, out) {
  const t = recipeTiming || IMPULSE_DEFAULT_TIMING;
  out.attack = (t.attack || IMPULSE_DEFAULT_TIMING.attack) + IMPULSE_PRESS_RAMP_S;
  out.sustain = t.sustain || IMPULSE_DEFAULT_TIMING.sustain;
  out.release = t.release || IMPULSE_DEFAULT_TIMING.release;
  out.total = out.attack + out.sustain + out.release;
  return out;
}

/**
 * Pressure envelope of one control-jet impulse at `age` seconds, for a timing record from
 * resolveImpulseTiming. The attack is a smoothstep (zero slope at ignition): it used to be linear, so the
 * first tick already carried 76% of the envelope.
 */
export function sampleImpulseEnvelope(age, timing) {
  if (age < 0) return 0;
  const a = timing.attack || 0.03;
  const s = timing.sustain || 0.05;
  const r = timing.release || 0.12;
  if (age < a) {
    if (a <= 0) return 1;
    const t = age / a;
    return t * t * (3 - 2 * t);
  }
  if (age < a + s) return 1;
  if (age < a + s + r) {
    const u = (age - a - s) / Math.max(1e-6, r);
    // BLOWDOWN, not a linear ramp. When a control valve shuts, the chamber behind it does not
    // bleed off at a constant rate — pressure drops hard at first and then lingers. A straight
    // line reads as a dimmer being turned down at a steady speed, which is the thing that made
    // these pops feel like an opacity channel rather than gas leaving a nozzle. Same quadratic
    // cooling tail the main drive's dash flare uses, for the same reason.
    const remain = 1 - u;
    return remain * remain;
  }
  return 0;
}

/**
 * The BODY of one control-jet packet, the channel that actually reaches nothing.
 *
 * The pressure envelope cannot make a jet go dark: the fragment stage draws `0.55 + 0.9 * envelope` and
 * the alpha has its own floor, so a card at envelope 0 is still ~26% of its peak brightness. Only
 * length reaches nothing (the vertex stage collapses a zero-length card), so length is the lifecycle
 * channel here exactly as it is for the main drive (ribbon/plumeSlug.js, driveEnvelope PLUME_DARK):
 *
 *   born   0 -> 1 across the attack: the front runs out of the nozzle, the root stays at the throat.
 *   taper  1 -> 0 across the release: the FRONT holds where the gas got to and the ROOT leaves the nozzle
 *          down the jet (the slug detaches and is spent), so a released jet never retracts into its
 *          nozzle. The caller derives root = reach * born * (1 - taper).
 *
 * `born` is the envelope's own attack (one curve, not a parallel one). Writes into and returns `out`.
 */
export function sampleImpulseBody(age, timing, out) {
  const a = timing.attack || 0.03;
  const s = timing.sustain || 0.05;
  const r = timing.release || 0.12;
  out.born = age <= 0 ? 0 : sampleImpulseEnvelope(Math.min(age, a), timing);
  const u = (age - a - s) / Math.max(1e-6, r);
  let taper = 1;
  if (u > IMPULSE_TAPER_START) {
    const t = Math.min(1, (u - IMPULSE_TAPER_START) / (1 - IMPULSE_TAPER_START));
    taper = 1 - t * t * (3 - 2 * t);
  }
  out.taper = taper;
  return out;
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
