// Shared, renderer-free ordnance math. All motion writes are to caller-owned outputs.
// Runtime and trajectory/telegraph consumers must use the SAME drift law.
export function integrateBombDrift(out, x, z, vx, vz, dt, dragPerS) {
  if (!(dt >= 0) || !Number.isFinite(dt) || !(dragPerS >= 0) || !Number.isFinite(dragPerS)) {
    throw new RangeError('Bomb drift requires finite nonnegative time and drag');
  }
  const decay = Math.exp(-dragPerS * dt);
  const travel = dragPerS > 0 ? -Math.expm1(-dragPerS * dt) / dragPerS : dt;
  out.x = x + vx * travel;
  out.z = z + vz * travel;
  out.vx = vx * decay;
  out.vz = vz * decay;
  return out;
}

// Earliest hit on a relative-motion chord against a circle. The arming boundary clips the
// segment; crossing a safe bomb BEFORE that boundary does not become a retroactive trigger.
// Return normalized time in [minT,1], or Infinity. At 60 Hz, drift is chord-approximated ONLY
// for fuze collision; position integration above remains analytic.
export function sweptBombContact(x0, z0, x1, z1, radius, minT = 0) {
  if (!Number.isFinite(x0) || !Number.isFinite(z0) || !Number.isFinite(x1) || !Number.isFinite(z1)
    || !Number.isFinite(radius) || !Number.isFinite(minT) || radius < 0 || minT > 1) return Infinity;
  const lo = Math.max(0, minT);
  const dx = x1 - x0, dz = z1 - z0;
  const ax = x0 + dx * lo, az = z0 + dz * lo;
  if (ax * ax + az * az <= radius * radius) return lo;
  const a = dx * dx + dz * dz;
  if (a <= 1e-18) return Infinity;
  const b = x0 * dx + z0 * dz;
  const c = x0 * x0 + z0 * z0 - radius * radius;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return Infinity;
  // Stable quadratic roots, avoiding cancellation for high-speed small-radius encounters.
  const root = Math.sqrt(discriminant);
  const q = -b - (b >= 0 ? root : -root);
  const r0 = q / a, r1 = q === 0 ? -b / a : c / q;
  const entry = Math.min(r0, r1);
  return entry >= lo && entry <= 1 ? entry : Infinity;
}

export function compareBombEntityIds(a, b) {
  if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
  const x = String(a.id), y = String(b.id);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function bombSurfaceFalloff(distance, bodyRadius, blastRadius) {
  return blastRadius > 0 ? Math.max(0, 1 - Math.max(0, distance - Math.max(0, bodyRadius || 0)) / blastRadius) : 0;
}

// The slug weakens continuously, but still has teeth before its terminal collapse.
export function bombFieldEnvelope(now, startedAt, durationS, endStrength = 1) {
  const age = Math.max(0, now - startedAt);
  if (!(durationS > 0) || age >= durationS) return 0;
  const t = age / durationS;
  return 1 + (Math.max(0, Math.min(1, endStrength)) - 1) * t;
}

// Viscous drag against the CLOUD'S moving frame, not the world origin. Exponential damping
// cannot reverse relative velocity. Compensation uses the solver's effective mass, so goo's
// existing massScale wallow cannot accidentally immunize its victim to this separate brake.
// Multiple overlapping clouds split one tick's damping budget, preventing stack overshoot.
export function fillBombViscosityImpulse(out, velocity, frame, effectiveMass, dt, dragPerS, share = 1) {
  out.x = out.y = out.z = 0;
  if (!(dt > 0) || !Number.isFinite(dt) || !(effectiveMass > 0) || !Number.isFinite(effectiveMass)) return false;
  const fraction = -Math.expm1(-Math.max(0, dragPerS) * dt) * Math.max(0, Math.min(1, share));
  out.x = ((frame?.x || 0) - (velocity?.x || 0)) * effectiveMass * fraction;
  out.z = ((frame?.z || 0) - (velocity?.z || 0)) * effectiveMass * fraction;
  return Number.isFinite(out.x) && Number.isFinite(out.z) && Math.hypot(out.x, out.z) > 1e-9;
}
