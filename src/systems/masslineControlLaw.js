/**
 * MASSLINE / CADENCE — radius control, not a second body solver.
 *
 * Contract: return a bounded rest-length delta; only the attachment service may apply it.
 * All vector math is XZ. No random, clock, engine, renderer, entity writes, or dependencies.
 * Winch work below is telemetry in game force*distance units, NOT a second resource charge.
 */
export const CADENCE_VERSION = 1;
export const MASSLINE_CADENCE = Object.freeze({
  deadzone: 0.08,
  precisionLinear: 0.3,
  riseS: 0.12,
  // Fraction of an orbital radian contracted per radian swept. A dimensionless limit makes
  // the same gesture recognisable at a different radius or hull mass.
  drawRatio: 0.32,
  pumpDrawRatio: 0.5,
  minimumDrawRate: 6,
  workingSpeed: 55,
  razorSpeed: 95,
  recoveryRadialRatio: 0.6,
});

const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const positive = (v, fallback) => Number.isFinite(v) && v > 0 ? v : fallback;
const smooth = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };

export function createCadenceWinch() {
  return { version: CADENCE_VERSION, velocity: 0, appliedWork: 0, lastDelta: 0 };
}

export function cadenceAxis(value) {
  const a = clamp(finite(value), -1, 1);
  const u = Math.max(0, (Math.abs(a) - MASSLINE_CADENCE.deadzone) / (1 - MASSLINE_CADENCE.deadzone));
  return Math.sign(a) * (MASSLINE_CADENCE.precisionLinear * u + (1 - MASSLINE_CADENCE.precisionLinear) * u ** 3);
}

/** Measured pair kinematics; independent of uniform world translation or velocity. */
export function readCadencePair(owner, payload, restLength = 0) {
  const valid = [owner?.pos?.x, owner?.pos?.z, payload?.pos?.x, payload?.pos?.z,
    owner?.vel?.x, owner?.vel?.z, payload?.vel?.x, payload?.vel?.z].every(Number.isFinite);
  if (!valid) return { valid: false, distance: 0, radialSpeed: 0, tangentialSpeed: 0,
    omega: 0, tangency: 0, slack: 0, reducedMass: 0, relativeEnergy: 0 };
  const rx = payload.pos.x - owner.pos.x, rz = payload.pos.z - owner.pos.z;
  const vx = payload.vel.x - owner.vel.x, vz = payload.vel.z - owner.vel.z;
  const distance = Math.hypot(rx, rz);
  const radialSpeed = distance > 1e-8 ? (rx * vx + rz * vz) / distance : 0;
  const tangentialSpeed = distance > 1e-8 ? (rx * vz - rz * vx) / distance : 0;
  const speed = Math.hypot(vx, vz);
  const ma = positive(owner.physicsBody?.mass, positive(owner.mass, 1));
  const mb = positive(payload.physicsBody?.mass, positive(payload.mass, 1));
  const reducedMass = 1 / (1 / ma + 1 / mb);
  return { valid: distance > 1e-8, distance, radialSpeed, tangentialSpeed,
    omega: distance > 1e-8 ? tangentialSpeed / distance : 0,
    tangency: speed > 1e-8 ? Math.abs(tangentialSpeed) / speed : 0,
    slack: Math.max(0, finite(restLength) - distance), reducedMass,
    relativeEnergy: 0.5 * reducedMass * speed * speed };
}

/**
 * One fixed tick of operator control. Neutral is a positive HOLD, not motor coast. A reversal
 * brakes through zero; there is never a stored target-length debt to execute after the pilot
 * lets go. PAY OUT is always available, even under a breakable line's load limit.
 *
 * orbit=true is explicit line-orbit intent, not an auto-detected mode switch while towing.
 * pump=true permits a stronger draw, but ONLY while reel-in is commanded: no idle energy pump.
 * A zero/invalid dt does not advance state. Each result is a proposal; commit only after reel()
 * accepts. This keeps a rejected physics command from contaminating the next control tick.
 */
export function stepCadenceWinch(previous, input = {}) {
  const prev = previous || createCadenceWinch();
  const runtime = { version: CADENCE_VERSION, velocity: finite(prev.velocity),
    appliedWork: Math.max(0, finite(prev.appliedWork)), lastDelta: 0 };
  const dt = clamp(finite(input.dt), 0, 0.25);
  const rest = Math.max(0, finite(input.restLength));
  const min = Math.max(0, finite(input.minLength));
  const max = Math.max(min, positive(input.maxLength, Number.MAX_VALUE));
  const rate = Math.max(0, finite(input.reelRate));
  const axis = cadenceAxis(input.axis);
  const pair = input.pair || {};
  const tension = Math.max(0, finite(input.tension));
  const loadLimit = positive(input.maxTension, Infinity);
  let reason = null, phase = 'coast', delta = 0, desiredVelocity = 0;
  if (!(dt > 0)) return { runtime: { ...prev }, delta, desiredVelocity, phase, reason: 'no_step' };
  if (!axis) { runtime.velocity = 0; return { runtime, delta, desiredVelocity, phase, reason }; }
  if (!(rate > 0)) { runtime.velocity = 0; return { runtime, delta, desiredVelocity, phase, reason: 'reel_unavailable' }; }
  if (axis < 0 && rest <= min + 1e-6 || axis > 0 && rest >= max - 1e-6) {
    runtime.velocity = 0;
    return { runtime, delta, desiredVelocity, phase,
      reason: axis < 0 ? 'minimum_length' : 'maximum_length' };
  }
  if (axis < 0 && input.automaticBreakAllowed === true && tension >= loadLimit * 0.9) {
    runtime.velocity = 0;
    return { runtime, delta, desiredVelocity, phase: 'recover', reason: 'load_limit' };
  }
  let authority = rate;
  phase = axis > 0 ? 'pay_out' : 'draw';
  if (axis < 0 && input.orbit === true && pair.valid) {
    const vt = Math.abs(finite(pair.tangentialSpeed));
    const vr = Math.abs(finite(pair.radialSpeed));
    const drawRatio = input.pump === true ? MASSLINE_CADENCE.pumpDrawRatio : MASSLINE_CADENCE.drawRatio;
    authority = Math.min(rate, Math.max(MASSLINE_CADENCE.minimumDrawRate, vt * drawRatio));
    // As the pair collapses radially, reduce draw rather than multiplying a bad swing's jerk.
    // A soft floor leaves deliberate recovery possible; no input can create a hidden cut.
    const recovery = smooth(MASSLINE_CADENCE.recoveryRadialRatio, 1.8, vr / Math.max(vt, 12));
    authority *= 1 - 0.75 * recovery;
    if (recovery > 0.3) phase = 'recover';
    else if (pair.slack > Math.max(0.5, rest * 0.015)) phase = 'take_up';
  }
  desiredVelocity = axis * authority;
  const accel = rate / MASSLINE_CADENCE.riseS;
  // Stop before a spool endpoint, instead of smashing into the clamp at full motor speed.
  const travel = axis < 0 ? Math.max(0, rest - min) : Math.max(0, max - rest);
  desiredVelocity = Math.sign(axis) * Math.min(Math.abs(desiredVelocity), Math.sqrt(2 * accel * travel));
  if (runtime.velocity * desiredVelocity < 0) {
    // The operator's sign is authoritative immediately: brake this tick without travelling
    // in the now-forbidden direction. Acceleration resumes through zero on the next tick.
    runtime.velocity = 0;
  } else {
    runtime.velocity += clamp(desiredVelocity - runtime.velocity, -accel * dt, accel * dt);
    // Falling operator authority is a hard ceiling, like neutral HOLD; only spin-up ramps.
    runtime.velocity = Math.sign(runtime.velocity) * Math.min(Math.abs(runtime.velocity), Math.abs(desiredVelocity));
    delta = clamp(rest + runtime.velocity * dt, min, max) - rest;
  }
  runtime.lastDelta = delta;
  if (Math.abs(delta) < 1e-9) runtime.velocity = 0;
  const appliedWork = tension * Math.max(0, -delta);
  runtime.appliedWork += appliedWork;
  return { runtime, delta, desiredVelocity, phase, reason, appliedWork };
}

/** Technique and consequence are different questions. This rates ONLY the pair's technique.
 * Physical break strain is deliberately excluded: standard line ratings are enormous.
 * A useful straight tow is not a failed operation; it is simply not an orbital release.
 */
export function rateCadenceTechnique(pair, { phase = 'slack' } = {}) {
  if (!pair?.valid) return { releaseScore: 0, classification: 'messy', technique: 'unobserved', speedReadiness: 0 };
  const vt = Math.abs(pair.tangentialSpeed);
  const speedReadiness = smooth(15, MASSLINE_CADENCE.razorSpeed, vt);
  const geometricGrip = pair.slack <= Math.max(0.5, pair.distance * 0.025);
  const grip = phase !== 'slack' || geometricGrip ? 1 : 0.35;
  const releaseScore = clamp(pair.tangency * speedReadiness * grip, 0, 1);
  const classification = releaseScore >= 0.85 ? 'razor' : releaseScore >= 0.65 ? 'clean'
    : releaseScore >= 0.35 ? 'good' : 'messy';
  return { releaseScore, classification, speedReadiness,
    technique: vt < 15 ? 'tow' : pair.tangency < 0.7 ? 'radial' : geometricGrip ? 'swing' : 'slack' };
}
