// BREAKAWAY — pure mechanics helpers, promoted from the BREAKAWAY implementation packet.
//
// Units are WU, seconds and mass units on the XZ plane, with right-handed physical angular Y.
// Nothing here mutates entity motion: every function returns a plan, and only the physics owner
// (`queuePhysicsImpulse` / `queuePhysicsTorqueImpulse` → sg02DynamicBodyOwner) applies one.

export function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

export function positive(value, name) {
  if (!(finite(value, name) > 0)) throw new RangeError(`${name} must be positive`);
  return value;
}

export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * For compound-body splitting ONLY. With two pre-existing constrained bodies, removing the
 * constraint already preserves their velocities: do NOT also apply this as an impulse.
 * v(point) = v(COM) + omega × offset. omega is physical +Y (`entity.angVel`), not a heading rate.
 */
export function velocityAtPoint({ vx, vz, omegaY, rx, rz }, out = {}) {
  [vx, vz, omegaY, rx, rz].forEach((v, i) => finite(v, `argument[${i}]`));
  out.vx = vx + omegaY * rz;
  out.vz = vz - omegaY * rx;
  out.omegaY = omegaY;
  return out;
}

/**
 * Analytic speed damping, force-saturated and unable to reverse velocity in one step.
 * Apply only inside a physically acquired receiver — this is a dissipative machine bolted to a
 * station, not a global drag or a speed governor. F·dt caps the impulse.
 */
export function dampingImpulse({ vx, vz, mass, dt, rate, maxForce }, out = {}) {
  finite(vx, 'vx'); finite(vz, 'vz'); positive(mass, 'mass'); positive(dt, 'dt');
  positive(rate, 'rate'); positive(maxForce, 'maxForce');
  const speed = Math.hypot(vx, vz);
  const fraction = -Math.expm1(-rate * dt);
  const wanted = mass * speed * fraction;
  const magnitude = Math.min(wanted, maxForce * dt);
  const scale = speed > 1e-12 ? -magnitude / speed : 0;
  out.x = vx * scale;
  out.z = vz * scale;
  out.energyRemoved = magnitude * speed - (magnitude * magnitude) / (2 * mass);
  return out;
}

export function angularDampingImpulse({ omegaY, inertiaY, dt, rate, maxTorque }) {
  finite(omegaY, 'omegaY'); positive(inertiaY, 'inertiaY'); positive(dt, 'dt');
  positive(rate, 'rate'); positive(maxTorque, 'maxTorque');
  return -Math.sign(omegaY) * Math.min(
    Math.abs(omegaY) * inertiaY * -Math.expm1(-rate * dt), maxTorque * dt,
  );
}

/** Design/telemetry estimate (constant-force lower bound), NOT a collision solver. */
export function stoppingDistance(speed, mass, maxForce) {
  if (finite(speed, 'speed') < 0) throw new RangeError('speed must be nonnegative');
  return (speed * speed * positive(mass, 'mass')) / (2 * positive(maxForce, 'maxForce'));
}

/**
 * Reward QUOTE only. A modest condition bonus never makes using the load as a weapon a financial
 * disaster. The mission owner settles once; this function grants nothing and creates no currency.
 */
export function deliveryQuote(baseCredits, condition01, qualityBonusFraction = 0.15) {
  if (!Number.isSafeInteger(baseCredits) || baseCredits < 0) {
    throw new RangeError('baseCredits must be a nonnegative safe integer');
  }
  finite(condition01, 'condition01'); finite(qualityBonusFraction, 'qualityBonusFraction');
  if (condition01 < 0 || condition01 > 1 || qualityBonusFraction < 0 || qualityBonusFraction > 0.25) {
    throw new RangeError('invalid quote range');
  }
  const bonus = Math.floor(baseCredits * qualityBonusFraction * condition01);
  if (!Number.isSafeInteger(baseCredits + bonus)) throw new RangeError('quote overflow');
  return Object.freeze({ baseCredits, bonusCredits: bonus, totalCredits: baseCredits + bonus });
}
