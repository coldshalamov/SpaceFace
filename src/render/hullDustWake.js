// inf-hull-dust-wake — the drift sheet's dust notices the biggest thing moving through it.
//
// The player story: the belt has weather now — the near-field drift dust rides a slow sector
// wind (inf-belt-wind), and the sheet shears downwind. But the weather ignored the hull: open
// the throttle in the Ceres belt and the biggest moving object in the sky combs nothing, trails
// nothing — the dust is a painting, not a medium. Now a hull moving fast through its sector's
// dust leaves a wake: sparse grains combed off the drift sheet's own palette, trailing behind
// the hull and SHEARING AWAY DOWNWIND with the same wind the sheet rides — the weather and the
// wake compose, so carving across the belt flow leaves a swept tail while a run against it
// crushes the wake short behind you.
//
// Truth read: the sector palette the renderer already resolves (state.render.sectorPalette —
// the same object the drift sheet and the wind owner consume: its `dust` tints the grains, its
// resolved wind carries them), and the hull's own published vel/maxSpeed. No rng, no wall
// time: per-grain spread hashes the emission step, and the emission tick rides floor(simTime
// * cadence) so a variable frame rate cannot stack grains and a frozen sim freezes the wake
// mid-flight. Reduced motion thins the wake, never to zero — the hull still displaces the
// world, just more quietly.
//
// This module is a pure decision layer; the caller (the VFX particle pool) draws exactly what
// it names. The wind owner (sectorWind.js) and the sheet owner (parallaxLayers.js) are
// committed subjects and are consumed, never modified.

import { resolveSectorWind } from './sectorWind.js';

export { resolveSectorWind };

/** The wake engages past this fraction of the hull's own top speed (cruise territory). */
export const WAKE_ENGAGE_SPEED_RATIO = 0.55;
/** Full wake at/above this fraction — boost and overdrive plough the sheet. */
export const WAKE_FULL_SPEED_RATIO = 1.05;
/** Emission cadence: grain ticks per second of sim time. */
export const WAKE_CADENCE_HZ = 9;
export const WAKE_CADENCE_REDUCED_HZ = 4.5;
/** Grains per tick at the floor and at full plough. */
export const WAKE_GRAINS_BASE = 1;
export const WAKE_GRAINS_FULL = 2;
/** The trailing grains keep this fraction of the hull's velocity (the comb drag). */
export const WAKE_TRAIL_FRACTION = 0.35;
/** Grain life scales with the hull's own speed — a faster hull sheds a longer tail. */
export const WAKE_LIFE_BASE_S = 0.45;
export const WAKE_LIFE_SPEED_S = 0.004;

function hash2(seedA, seedB) {
  let h = 2166136261 ^ Math.imul(seedA | 0, 0x85ebca6b);
  h = Math.imul(h ^ (seedB | 0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

function clamp01(value) {
  return Number.isFinite(value) ? (value < 0 ? 0 : value > 1 ? 1 : value) : 0;
}

/**
 * One emission tick for the hull's dust wake. Returns a plan, or null on a quiet tick (no
 * hull, not past the engage ratio, no palette dust, or the cadence step has not advanced —
 * `lastStep` is the caller's latch, keep it on the presenter).
 *
 * `palette` is the sector palette (its `dust` tints the wake; the wind resolved from it
 * shears the grains); `velX/velZ` and `maxSpeed` are the hull's published motion truth;
 * `simTime` is the presentation clock. Deterministic per (time bucket, grain, inputs).
 */
export function resolveHullDustWakePlan({
  velX, velZ, maxSpeed, palette, simTime, reducedMotion = false, lastStep = null,
} = {}) {
  const vx = Number.isFinite(velX) ? velX : 0;
  const vz = Number.isFinite(velZ) ? velZ : 0;
  const speed = Math.hypot(vx, vz);
  const top = Number.isFinite(maxSpeed) && maxSpeed > 0 ? maxSpeed : 0;
  if (!(top > 0) || speed < top * WAKE_ENGAGE_SPEED_RATIO) return null;
  const dustHex = palette && Number.isFinite(palette.dust) ? (palette.dust >>> 0) : null;
  if (dustHex == null) return null;
  const now = Number(simTime);
  if (!Number.isFinite(now) || now < 0) return null;
  const cadenceHz = reducedMotion ? WAKE_CADENCE_REDUCED_HZ : WAKE_CADENCE_HZ;
  const step = Math.floor(now * cadenceHz);
  if (step === lastStep) return null;

  const wind = resolveSectorWind(palette);
  const intensity = clamp01(
    (speed - top * WAKE_ENGAGE_SPEED_RATIO)
    / (top * (WAKE_FULL_SPEED_RATIO - WAKE_ENGAGE_SPEED_RATIO)),
  );
  const grains = Math.round(
    WAKE_GRAINS_BASE + (WAKE_GRAINS_FULL - WAKE_GRAINS_BASE) * intensity,
  );
  const trailVX = -vx * WAKE_TRAIL_FRACTION + wind.dirX * wind.speedWuPerS;
  const trailVZ = -vz * WAKE_TRAIL_FRACTION + wind.dirZ * wind.speedWuPerS;
  const heading = Math.atan2(vz, vx);
  const lifeS = WAKE_LIFE_BASE_S + WAKE_LIFE_SPEED_S * speed;

  const grainsOut = [];
  for (let k = 0; k < grains; k++) {
    const h = hash2(step, k * 131 + 7);
    // The comb: grains lift off the hull's flanks, not its nose — a lateral spread
    // perpendicular to travel, deterministic per tick.
    const side = (h & 1) === 0 ? 1 : -1;
    const lateral = side * (0.4 + ((h >>> 8) % 100) / 100 * 0.6);
    const jitter = (((h >>> 16) % 100) / 100 - 0.5) * 0.22; // ±0.11 rad of spread
    const a = heading + Math.PI + jitter;
    grainsOut.push({
      lateral, // fraction of the hull radius, signed, perpendicular to travel
      angle: a,
      vx: trailVX,
      vz: trailVZ,
      speedMul: 0.85 + ((h >>> 24) % 100) / 100 * 0.3,
    });
  }
  return {
    step,
    dustHex,
    intensity,
    speed,
    lifeS,
    grains: grainsOut,
    wind,
    reducedMotion,
  };
}
