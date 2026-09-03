// scripts/lib/bench/knockModel.mjs — shared seeded contact-encounter model for bar B13
// (PQ-173.01 "The measurer"). Both the `feel.knock_budget` verb scenario and the Crucible
// bench resolve incidental contacts through the LIVE consequence rule
// (src/combat/impulseKernel.js `resolveCollisionConsequence`) with inputs mirroring the real
// contact path:
//
//   - The exchanged momentum is the live custom-physics contact impulse (src/core/physics.js
//     `impulse()`): j = (1 + restitution) * |vRelNormal| / (1/ma + 1/mb), i.e. reduced mass
//     times closing speed, with the ship DEFAULT_MATERIAL restitution 0.18 (pairs combine via
//     min, and ship/wreck both use the default).
//   - `collisionConsequences._onImpact` feeds that receipt momentum straight into
//     `resolveCollisionConsequence`, which converts to player deltaV as exchangedMomentum /
//     target.mass — the exact conversion this model consumes (no local impulse formula).
//   - Ordinary flight bumps are helm-neutral: a player-propelled contact carries the
//     'direct_contact' tag (collisionConsequences `explicitContactProvenance`), everything else
//     defaults to 'environment'. Both are in HELM_NEUTRAL_COLLISION_TAGS, so the measured
//     heading change is zero unless the live rule ever grants control (stagger/tumble).
//
// Deterministic: mulberry32 seeded from a stable string key. Never Math.random, never wall time.

import { resolveCollisionConsequence } from '../../../src/combat/impulseKernel.js';

// Bench constants for the player hull (bench-wide convention: mass 18, cruise 195 WU/s).
export const KNOCK_MODEL_CONSTANTS = Object.freeze({
  playerMass: 18,
  cruiseSpeed: 195,
  // src/core/physics.js DEFAULT_MATERIAL.restitution — ship uses it, wrecks fall back to it,
  // and pair materials combine via min, so every traffic/debris bump in this model sees 0.18.
  restitution: 0.18,
});

/** Deterministic seeded PRNG local to the model. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: stable text key -> uint32 PRNG seed (same process or not). */
export function hashSeedToUint32(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Plans a deterministic timeline of incidental contact encounters.
 *
 * @param {object} options
 * @param {string} options.seedKey Stable identity of the run (bench + scenario/arena + seed).
 * @param {number} options.startTick First tick an encounter may land on.
 * @param {number} options.endTick Last tick an encounter may land on.
 * @param {[number, number]} [options.countRange] Fixed-count mode: draw count uniformly in the
 *   inclusive range (used by short crucible runs). Omit for interval-driven mode.
 * @param {number} [options.minIntervalSeconds] Interval-mode lower mean gap (default 18).
 * @param {number} [options.maxIntervalSeconds] Interval-mode upper mean gap (default 32).
 * @param {number} [options.minSpeed] Minimum closing speed in WU/s (default 6).
 * @param {number} [options.maxSpeed] Maximum closing speed in WU/s (default 40).
 * @param {number} [options.minMass] Minimum other-body mass (default 8).
 * @param {number} [options.maxMass] Maximum other-body mass (default 80).
 * @param {string[]} [options.surfaces] Contact surfaces to draw from ('craft' | 'debris').
 * @returns {Array<{tick:number, otherMass:number, relativeSpeed:number, surface:string,
 *   normalAngle:number, playerIsMover:boolean}>} Chronological encounter schedule.
 */
export function planKnockEncounters({
  seedKey,
  startTick,
  endTick,
  countRange = null,
  minIntervalSeconds = 18,
  maxIntervalSeconds = 32,
  minSpeed = 6,
  maxSpeed = 40,
  minMass = 8,
  maxMass = 80,
  surfaces = ['craft', 'debris'],
} = {}) {
  const rng = mulberry32(hashSeedToUint32(`knockModel:${seedKey}`));
  const draw = (tick) => ({
    tick,
    otherMass: minMass + rng() * (maxMass - minMass),
    relativeSpeed: minSpeed + rng() * (maxSpeed - minSpeed),
    surface: surfaces[Math.floor(rng() * surfaces.length)] || 'craft',
    normalAngle: rng() * Math.PI * 2,
    playerIsMover: rng() < 0.5,
  });

  const encounters = [];
  if (Array.isArray(countRange) && countRange.length === 2) {
    const [lo, hi] = countRange;
    const count = lo + Math.floor(rng() * (hi - lo + 1));
    const span = Math.max(0, endTick - startTick);
    for (let i = 0; i < count; i++) {
      // Evenly spaced slots with deterministic jitter so ticks never pile on the boundaries.
      const slot = span / (count + 1);
      const jitter = (rng() - 0.5) * slot;
      const tick = Math.round(Math.min(endTick, Math.max(startTick, startTick + slot * (i + 1) + jitter)));
      encounters.push(draw(tick));
    }
  } else {
    let tick = startTick;
    while (true) {
      tick += Math.round(60 * (minIntervalSeconds + rng() * (maxIntervalSeconds - minIntervalSeconds)));
      if (tick > endTick) break;
      encounters.push(draw(tick));
    }
  }
  return encounters;
}

/**
 * Resolves one scheduled contact through the LIVE consequence rule.
 *
 * Mirrors `collisionConsequences._onImpact` -> `resolveCollisionConsequence`: the momentum
 * receipt is the live physics contact impulse, and the player deltaV is whatever the kernel
 * returns (exchangedMomentum / target.mass). Returns null when the live rule returns null
 * (below minMomentum — no velocity-changing contact).
 *
 * @param {object} params
 * @param {object} params.encounter One planKnockEncounters entry.
 * @param {number} [params.playerMass] Player hull mass (default KNOCK_MODEL_CONSTANTS).
 * @param {number} [params.cruiseSpeed] Cruise reference in WU/s (default KNOCK_MODEL_CONSTANTS).
 * @param {number} [params.playerVelX] Player velocity X before contact (heading guard).
 * @param {number} [params.playerVelZ] Player velocity Z before contact (heading guard).
 * @param {number} [params.tick] Explicit tick override (defaults to encounter.tick).
 * @returns {object|null} { deltaV, deltaVFractionOfCruise, headingChangeRad, dVX, dVZ, control,
 *   surface, exchangedMomentum }
 */
export function resolveContactKnock({
  encounter,
  playerMass = KNOCK_MODEL_CONSTANTS.playerMass,
  cruiseSpeed = KNOCK_MODEL_CONSTANTS.cruiseSpeed,
  playerVelX = 0,
  playerVelZ = 0,
  tick,
} = {}) {
  if (!encounter) return null;
  const atTick = Number.isFinite(tick) ? Math.max(0, Math.trunc(tick)) : encounter.tick;
  const target = { id: 1, type: 'ship', mass: playerMass, radius: 12, pos: { x: 0, z: 0 }, vel: { x: playerVelX, z: playerVelZ } };
  const otherType = encounter.surface === 'debris' ? 'wreck' : 'ship';
  const other = { id: 2, type: otherType, mass: encounter.otherMass, radius: 10, pos: { x: 10, z: 0 }, vel: { x: 0, z: 0 } };

  // Live contact impulse (src/core/physics.js `impulse()`, head-on normal form):
  // j = (1 + restitution) * |vRelN| / (1/ma + 1/mb).
  const reducedMass = (playerMass * encounter.otherMass) / (playerMass + encounter.otherMass);
  const exchangedMomentum = (1 + KNOCK_MODEL_CONSTANTS.restitution) * reducedMass * encounter.relativeSpeed;

  // Ordinary-flight provenance: a player-propelled hull carries 'direct_contact' (collision
  // consequences `explicitContactProvenance`); otherwise the kernel default 'environment' applies.
  const provenance = encounter.playerIsMover
    ? { actorId: 1, weaponId: null, tag: 'direct_contact', appliedTick: atTick }
    : undefined;

  const nx = Math.cos(encounter.normalAngle);
  const nz = Math.sin(encounter.normalAngle);
  const receipt = resolveCollisionConsequence({
    target,
    other,
    exchangedMomentum,
    tick: atTick,
    provenance,
    pos: { x: 0, z: 0 },
    normal: { x: nx, z: nz },
  });
  if (!receipt) return null;

  // The player sits on the 'a' side (normal points from player toward the other), so the live
  // solver applies a.vel -= j * n * invMassA -> dV vector = -deltaV * n.
  const dVX = -receipt.deltaV * nx;
  const dVZ = -receipt.deltaV * nz;

  // Heading guard: contact only rotates the hull when the live rule grants control
  // (stagger/tumble write physics control + torque). Ordinary bumps are helm-neutral, so the
  // measured heading change is 0 unless the rule ever changes — exactly what B13 must watch.
  let headingChangeRad = 0;
  if (receipt.control !== 'none') {
    const speed2 = playerVelX * playerVelX + playerVelZ * playerVelZ;
    if (speed2 > 1e-9) {
      const postX = playerVelX + dVX;
      const postZ = playerVelZ + dVZ;
      const postLen = Math.hypot(postX, postZ);
      if (postLen > 1e-9) {
        const cos = (playerVelX * postX + playerVelZ * postZ) / (Math.sqrt(speed2) * postLen);
        headingChangeRad = Math.acos(Math.max(-1, Math.min(1, cos)));
      }
    }
  }

  return {
    deltaV: receipt.deltaV,
    deltaVFractionOfCruise: receipt.deltaV / cruiseSpeed,
    headingChangeRad,
    dVX,
    dVZ,
    control: receipt.control,
    surface: receipt.surface,
    exchangedMomentum: receipt.exchangedMomentum,
  };
}
