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
// off-center angular-impulse law; bigger rocks carry their spin slower). Heavies are
// graded by the same math: the pass delivers a fixed momentum, so a light hull is tumbled
// away while a mass-150 wreck only sways — the force decides the animation, not a die roll.

export const SHOCKWAVE_SWEEP_LAW = Object.freeze({
  // Front travel speed. A 150 WU concussion blast sweeps its full radius in ~0.5 s —
  // slow enough to read as a passing wave, fast enough to never outrun the eye's follow.
  waveSpeedWuPerS: 340,
  // The wave spends itself on the space it crosses: the front dies here (the blast's own
  // surface falloff reaches zero at blastRadius + bodyRadius, so 1.12 covers the edge).
  maxRadiusFrac: 1.12,
  // Momentum the front delivers to one body at the source edge, linearly decaying to zero
  // at maxRadius. A real blast wave's impulse ~ pressure × area, NOT mass-scaled: light
  // debris flies, heavies sway. deltaV = passImpulse × life / mass.
  passImpulseWu: 300,
  // TUMBLE_KICK threshold — the amount of physical force (deltaV the front delivers)
  // that triggers a visible tumbling animation on a blasted object.
  tumbleDeltaV: 10,
  // Below the kick but at or above this, the object shudders (render wobble only).
  nudgeDeltaV: 3,
  // Yaw spin at a full-radius lever arm per WU/s of deltaV (before the 1/R inertia law).
  spinPerDeltaV: 0.34,
  // Max spin the law will ask for — a small rock hit hard spins fast but never strobes.
  maxSpinRadPerS: 6,
  maxLiveSweeps: 4,
  // Perf bound: body passes resolved per tick across all live fronts (rare: fronts live
  // ~0.5 s and only near a detonation).
  maxPassesPerTick: 48,
});

export const SHOCKWAVE_PASS_EVENT = 'combat:shockwavePass';

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
    x: finite(input.x),
    z: finite(input.z),
    blastRadius,
    maxRadius: blastRadius * SHOCKWAVE_SWEEP_LAW.maxRadiusFrac,
    frontRadius: 0,
    passed: new Set(),
  };
  if (sweep) {
    // Replacement front re-runs from the source: the collapse is a new wave, not a resume.
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
  // Wave strength decays with the space already crossed.
  const life = clamp01(1 - frontRadius / Math.max(1, sweep.maxRadius));
  const deltaV = SHOCKWAVE_SWEEP_LAW.passImpulseWu * life / Math.max(0.1, positive(entity.physicsBody && entity.physicsBody.mass, positive(entity.mass, 1)));
  if (!(deltaV >= SHOCKWAVE_SWEEP_LAW.nudgeDeltaV)) return null;
  let dirX = 0;
  let dirZ = 0;
  if (dist > 1e-6) {
    dirX = dx / dist;
    dirZ = dz / dist;
  }
  const level = deltaV >= SHOCKWAVE_SWEEP_LAW.tumbleDeltaV ? 'tumble' : 'wobble';
  const radius = Math.max(1, bodyRadius);
  // ω = 2·ΔV·lever/R — the off-center angular-impulse law. The parity bias (±1, or 0 for
  // a clean radial read on odd ids) is the deterministic stand-in for a ragged front's
  // oblique arrival; the renderer folds it into the same lever-arm math a solver impact uses.
  const lever = numericParity(entity.id) === 0 ? 0 : (numericParity(entity.id + 1) ? 1 : -1);
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
