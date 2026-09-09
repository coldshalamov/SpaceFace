/** Analytical diagnostic, NOT a game physics solver or a drop-in patch.
 * Assumption: taut circular relative motion at fixed tangential speed.
 * The oscillator ceiling is an explicit-spring sanity bound, not a Rapier guarantee.
 */
function positive(name, x) {
  if (!Number.isFinite(x) || x <= 0) throw new RangeError(`${name} must be finite and positive`);
  return x;
}
function nonnegative(name, x) {
  if (!Number.isFinite(x) || x < 0) throw new RangeError(`${name} must be finite and nonnegative`);
  return x;
}
export function reducedMass(massA, massB) {
  for (const m of [massA, massB]) {
    if (m !== Infinity) positive('mass', m);
  }
  const inverse = (massA === Infinity ? 0 : 1 / massA)
    + (massB === Infinity ? 0 : 1 / massB);
  if (!(inverse > 0) || !Number.isFinite(inverse)) {
    throw new RangeError('The pair must contain a numerically representable movable body');
  }
  return positive('reduced mass', 1 / inverse);
}
/** @param {{massA:number,massB:number,speed:number,length:number,stiffness:number,
 * stretchTarget?:number,dt?:number,omegaDtBudget?:number,dampingRatio?:number}} p */
export function ropeEnvelope(p) {
  const mu = reducedMass(p.massA, p.massB);
  const speed = nonnegative('speed', p.speed);
  const length = positive('length', p.length);
  const stiffness = positive('stiffness', p.stiffness);
  const epsilon = positive('stretchTarget', p.stretchTarget ?? 0.05);
  const dt = positive('dt', p.dt ?? 1 / 60);
  const omegaDtBudget = positive('omegaDtBudget', p.omegaDtBudget ?? 0.5);
  const zeta = nonnegative('dampingRatio', p.dampingRatio ?? 0.9);
  const load = mu * speed * speed;
  const a = load / stiffness;
  // Rationalized form avoids subtracting nearly equal square roots at small load.
  const extension = a === 0 ? 0 : 2 * a / (Math.hypot(length, 2 * Math.sqrt(a)) + length);
  const requiredStiffness = load / (epsilon * (1 + epsilon) * length * length);
  const scalarStabilityCeiling = mu * (omegaDtBudget / dt) ** 2;
  const dampingCoefficient = 2 * zeta * Math.sqrt(stiffness * mu);
  const result = {
    reducedMass: mu,
    extension,
    extensionRatio: extension / length,
    firstOrderExtensionRatio: load / (stiffness * length * length),
    requiredStiffness,
    scalarStabilityCeiling,
    dampingCoefficient,
    targetFitsScalarEnvelope: requiredStiffness <= scalarStabilityCeiling,
    currentSpringMeetsTarget: extension / length <= epsilon + 1e-12,
  };
  for (const value of Object.values(result)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new RangeError('Parameter combination exceeds the diagnostic numeric envelope');
    }
  }
  return Object.freeze(result);
}
