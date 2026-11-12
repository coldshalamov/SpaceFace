// Shockwave sweep — the traveling front of an ordnance blast (hull-burst overhaul family,
// gated behind `combat.tumbleFling` like every other slice-A physics rule).
//
// The blast's instant impulse (impulseKernel, bombs._blastVictims) is the shove; the sweep
// is the wave the shove belongs to: a finite-speed front that expands from the detonation
// and pushes loose bodies again as it overtakes them, nearest first. A blast that moves
// everything on the same tick reads as teleportation; a front that arrives reads as a wave.
//
// This module computes identity and laws only, exactly like bombDynamics.js. It never
// touches entities: runtime consumers (bombs.js) route its outputs through the physics
// authority and the bus, and the renderer reads the published pass receipts.
//
// The tumble threshold is the law this file exists for: a wave shove below `nudgeDeltaV`
// shows nothing; at or above it the object shudders (surface wobble); at or above
// `tumbleDeltaV` it takes a lever-arm tumble kick — spin proportional to the shove and to
// the wave's oblique arrival, inversely to the body's radius (ω = 2·ΔV·lever/R, the
// off-center angular-impulse law; bigger rocks carry their spin slower). The wave's
// impulse couples to the body's cross-section (pressure × area), so the delivered
// deltaV falls with radius: light debris flies, close rocks visibly tumble, far and
// heavy matter sways — the force decides the animation, not a die roll.

export const SHOCKWAVE_SWEEP_LAW = Object.freeze({
  // Front travel speed. A 150 WU concussion blast sweeps its full radius in ~0.5 s —
  // slow enough to read as a passing wave, fast enough to never outrun the eye's follow.
  waveSpeedWuPerS: 340,
  // The wave spends itself on the space it crosses: the front dies here (the blast's own
  // surface falloff reaches zero at blastRadius + bodyRadius, so 1.12 covers the edge).
  maxRadiusFrac: 1.12,
  // The wave is a FRACTION of the payload's own impulse budget, fixed at detonation
  // (bombs.js passes def.impulse * passImpulseFrac, the collapse its collapseImpulse):
  // a zero-impulse payload ("does not blast on arrival") legitimately births no wave.
  // 1/6 of the concussion drum's 1800 is the reference tuning: 300 momentum per pass.
  passImpulseFrac: 1 / 6,
  // TUMBLE_KICK threshold — the amount of physical force (deltaV the front delivers)
  // that triggers a visible tumbling animation on a blasted object.
  tumbleDeltaV: 10,
  // Below the kick but at or above this, the object shudders (render wobble only).
  nudgeDeltaV: 3,
  // Yaw spin at a full-radius lever arm per WU/s of deltaV (before the 1/R inertia law).
  spinPerDeltaV: 0.34,
  // Max spin the law will ask for — a small rock hit hard spins fast but never strobes.
  maxSpinRadPerS: 6,
  // The graded shove saturates here: a sub-mass chip (the tear-off debris this same
  // overhaul spawns) must not be flung past cruise by a paper-thin denominator. The
  // mass floor matches IMPACT_TEAROFF_LAW.minVictimMass — matter lighter than that is
  // dust the wave passes through.
  maxPassDeltaV: 60,
  minSweptMass: 2,
  // Spatial profile of the wave's strength, sampled at the body's own surface distance
  // (the wave element passing IT, same surface law as the blast's bombSurfaceFalloff),
  // never at the tick's front edge: no tick-timing dead zone at the end of the sweep,
  // and a concave curve holds the shove readable through the middle distance before the
  // wave genuinely spends itself at maxRadius.
  lifeCurve: 0.7,
  // Pressure couples to the body's cross-section (J ~ p·A): the delivered impulse scales
  // with (radius / waveRefRadius)^2, clamped. This is what makes the wave read on real
  // field matter — a mass-400 radius-8 rock catches 16x the wave a radius-2 chip does,
  // so deltaV ~ 1/radius: close rocks visibly tumble, far rocks sway, small debris flies.
  waveAreaGain: 18,
  waveRefRadius: 8,
  areaFactorMin: 0.2,
  areaFactorMax: 8,
  maxLiveSweeps: 4,
  // Perf bound: body passes resolved per tick across all live fronts (rare: fronts live
  // ~0.5 s and only near a detonation).
  maxPassesPerTick: 48,
});

export const SHOCKWAVE_PASS_EVENT = 'combat:shockwavePass';

/**
 * The mass read every stage of the sweep law shares — the grade in resolveSweepPass and
 * the applied impulse in bombs.js MUST agree, or a receipt would describe a shove the
 * body never took (or, worse, a floor-mass impulse divided by a real 0.1-mass pickup:
 * a 60 WU/s receipt delivered as 1200). Fallback chain mirrors the blast's massOf.
 */
export function sweptMassOf(entity) {
  return positive(entity && entity.physicsBody && entity.physicsBody.mass, positive(entity && entity.mass, 1));
}

/**
 * Create a sweep record for one detonation, or null when the input is degenerate or the
 * live cap holds. One sweep per bomb: a re-detonation (the singularity's collapse) replaces
 * the bomb's earlier front. The `passed` set is plain mutable bookkeeping — a sweep is a
 * tick-local runtime object, never saved.
 */
export function createShockwaveSweep(input = {}) {
  const blastRadius = positive(input.blastRadius, 0);
  if (!(blastRadius > 0)) return null;
  const existing = input.existing;
  const sweep = existing && existing.bombId === input.bombId ? existing : null;
  const record = sweep || {
    bombId: input.bombId,
    ownerId: input.ownerId == null ? null : input.ownerId,
    weaponId: input.weaponId == null ? null : String(input.weaponId),
    // The wave's whole momentum budget, fixed at birth from the payload's own impulse.
    passImpulseWu: positive(input.passImpulseWu, 0),
    x: finite(input.x),
    z: finite(input.z),
    blastRadius,
    maxRadius: blastRadius * SHOCKWAVE_SWEEP_LAW.maxRadiusFrac,
    frontRadius: 0,
    passed: new Set(),
  };
  if (sweep) {
    // Replacement front re-runs from the source: the collapse is a new wave, not a resume.
    sweep.passImpulseWu = positive(input.passImpulseWu, 0);
    sweep.x = finite(input.x);
    sweep.z = finite(input.z);
    sweep.blastRadius = blastRadius;
    sweep.maxRadius = blastRadius * SHOCKWAVE_SWEEP_LAW.maxRadiusFrac;
    sweep.frontRadius = 0;
    sweep.passed.clear();
  }
  return record;
}

/**
 * Advance the front one tick. Returns { alive, prevRadius, radius }; alive is false when
 * the front has spent itself (the caller retires the record).
 */
export function advanceSweepFront(sweep, dt) {
  if (!sweep || !(dt > 0)) return { alive: !!sweep, prevRadius: sweep ? sweep.frontRadius : 0, radius: sweep ? sweep.frontRadius : 0 };
  const prevRadius = sweep.frontRadius;
  const radius = Math.min(sweep.maxRadius, prevRadius + SHOCKWAVE_SWEEP_LAW.waveSpeedWuPerS * dt);
  sweep.frontRadius = radius;
  return { alive: radius < sweep.maxRadius, prevRadius, radius };
}

/**
 * Resolve one loose body against one front position. Returns null when the front has not
 * reached the body, already passed it, or the shove is below the wobble threshold; the
 * below-wobble case still marks the body passed (a weaker re-read must not fire later).
 * The returned receipt is frozen and renderer-safe: level, deltaV, push direction, the
 * deterministic lever bias (radial load on a circular hull has no natural torque arm —
 * the parity bias stands in for the real off-axis arrival a ragged front produces), the
 * spin the kick law asks for, and the facing-surface contact point.
 */
export function resolveSweepPass(sweep, entity, frontRadius) {
  if (!sweep || !entity || entity.alive === false) return null;
  if (sweep.passed.has(entity.id)) return null;
  const ex = finite(entity.pos && entity.pos.x);
  const ez = finite(entity.pos && entity.pos.z);
  const dx = ex - sweep.x;
  const dz = ez - sweep.z;
  const dist = Math.hypot(dx, dz);
  const bodyRadius = Math.max(0, finite(entity.radius, 0));
  if (dist > frontRadius + bodyRadius) return null;
  sweep.passed.add(entity.id);
  // Strength is the wave's profile at the body's own SURFACE distance (the same
  // dist-minus-radius law the blast's falloff uses), and the delivered impulse couples
  // to the body's cross-section: J = budget · waveAreaGain · (r/ref)² · life. The
  // concave curve keeps the shove readable through the middle distance; at the
  // outermost edge the wave has genuinely spent itself.
  const areaFactor = Math.min(
    SHOCKWAVE_SWEEP_LAW.areaFactorMax,
    Math.max(SHOCKWAVE_SWEEP_LAW.areaFactorMin, (bodyRadius / SHOCKWAVE_SWEEP_LAW.waveRefRadius) * (bodyRadius / SHOCKWAVE_SWEEP_LAW.waveRefRadius)),
  );
  const surfaceDist = Math.max(0, dist - bodyRadius);
  const life = Math.pow(
    clamp01(1 - surfaceDist / Math.max(1, sweep.maxRadius)),
    SHOCKWAVE_SWEEP_LAW.lifeCurve,
  );
  const deltaV = Math.min(
    SHOCKWAVE_SWEEP_LAW.maxPassDeltaV,
    (sweep.passImpulseWu || 0) * SHOCKWAVE_SWEEP_LAW.waveAreaGain * areaFactor * life
      / Math.max(SHOCKWAVE_SWEEP_LAW.minSweptMass, sweptMassOf(entity)),
  );
  if (!(deltaV >= SHOCKWAVE_SWEEP_LAW.nudgeDeltaV)) return null;
  let dirX = 0;
  let dirZ = 0;
  if (dist > 1e-6) {
    dirX = dx / dist;
    dirZ = dz / dist;
  }
  const level = deltaV >= SHOCKWAVE_SWEEP_LAW.tumbleDeltaV ? 'tumble' : 'wobble';
  const radius = Math.max(1, bodyRadius);
  // ω = 2·ΔV·lever/R — the off-center angular-impulse law. The parity biases (id's own
  // bit signs the kick, the id/2 bit picks the flank) are the deterministic stand-in for a
  // ragged front's oblique arrival; both signs occur across the id space, so a volley of
  // blasts tumbles its wreckage both ways. The renderer folds the bias into the same
  // lever-arm math a solver impact uses.
  const lever = numericParity(entity.id) === 0 ? 0 : (numericParity(Math.trunc(entity.id / 2)) ? 1 : -1);
  const spinYaw = Math.max(
    -SHOCKWAVE_SWEEP_LAW.maxSpinRadPerS,
    Math.min(
      SHOCKWAVE_SWEEP_LAW.maxSpinRadPerS,
      SHOCKWAVE_SWEEP_LAW.spinPerDeltaV * deltaV * 2 * lever / radius,
    ),
  );
  return Object.freeze({
    schemaVersion: 1,
    bombId: sweep.bombId,
    ownerId: sweep.ownerId,
    weaponId: sweep.weaponId,
    targetId: entity.id,
    type: entity.type || null,
    level,
    deltaV,
    dirX,
    dirZ,
    lever,
    spinYaw,
    frontRadius,
    contact: Object.freeze({
      x: ex - dirX * bodyRadius,
      z: ez - dirZ * bodyRadius,
    }),
  });
}

function numericParity(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(Math.trunc(value)) % 2;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function positive(v, fallback = 0) {
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
