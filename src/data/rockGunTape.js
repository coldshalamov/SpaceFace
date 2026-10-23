// Row 482 (ROCK-GUN): the rock IS the gun. Deterministic tape model for swarm waves 1–10 —
// the bounded analytical proof that thrown rock clears faster than guns, plus the kill-cause
// buckets the live ledger (src/systems/rockCore.js) files entity:killed payloads into.
// Pure data + math; deterministic; no ambient time or RNG (wave shape is a fixed function
// of wave index, not a roll).

import { FODDER_RIVER_RECIPE } from './squadChoreography.js';
import { ROCK_SIZE_CLASSES } from './rockSubstances.js';

// ─── Kill buckets (live ledger) ────────────────────────────────────────────────
/** Impact tags a thrown/physics kill carries (mirrors src/combat/killCausality.js tag sets —
 * kept local so the bucket test cannot drift silently when the causality table grows). */
export const ROCK_GUN_IMPACT_TAGS = Object.freeze([
  'massline_throw', 'massline', 'rope_throw', 'massline_whip',
  'direct_contact', 'ram_plate', 'tow_flail',
]);
export const ROCK_GUN_IMPACT_CAUSES = Object.freeze(['terrain_collision', 'ship_collision']);
export const ROCK_GUN_GUN_TAGS = Object.freeze(['projectile', 'gun', 'turret', 'energy', 'kinetic']);

/** Bucket an entity:killed payload into 'impact' | 'gun' | 'other' for the waves-1–10 share. */
export function rockGunKillBucket(payload) {
  const p = payload?.presentation;
  // The receipt keeps the provenance tag inside impactLink, not at top level; a tag-shaped
  // cause (massline_whip) is still an impact kill.
  const tag = typeof p?.tag === 'string' ? p.tag
    : typeof p?.impactLink?.tag === 'string' ? p.impactLink.tag
    : typeof payload?.tag === 'string' ? payload.tag : '';
  // The canonical whip payload pairs a top-level physical cause ('massline_whip') with a
  // presentation cause of 'generic' — check both fields for impact before the generic
  // cause can fall through to 'gun'.
  const causes = [p?.cause, payload?.cause].filter((c) => typeof c === 'string');
  if (ROCK_GUN_IMPACT_TAGS.includes(tag)
    || causes.some((c) => ROCK_GUN_IMPACT_CAUSES.includes(c) || ROCK_GUN_IMPACT_TAGS.includes(c))) {
    return 'impact';
  }
  if (ROCK_GUN_GUN_TAGS.includes(tag) || causes.some((c) => c === 'kinetic' || c === 'generic')) return 'gun';
  return 'other';
}

export const ROCK_GUN_SHARE_TARGET = 0.60;
export const ROCK_GUN_WAVE_MAX = 10;

/** Share of impact kills inside waves 1–10 from a ledger {impact,gun,other}. */
export function rockGunImpactShare(ledger) {
  const impact = Math.max(0, Number(ledger?.impact) || 0);
  const gun = Math.max(0, Number(ledger?.gun) || 0);
  const other = Math.max(0, Number(ledger?.other) || 0);
  const total = impact + gun + other;
  return total > 0 ? impact / total : 0;
}

// ─── Wave clear-time model ─────────────────────────────────────────────────────
// Deterministic tape: same inputs → same answer. The wave roster is a function of wave index
// (matches squadChoreography pack composition), not a roll.

/** Enemies on the field for swarm wave `wave` (1-based, waves 1–10 band). */
export function tapeWaveStrength(wave) {
  const w = Math.max(1, Math.min(ROCK_GUN_WAVE_MAX, wave | 0));
  return 4 + w * 2; // wave 1: 6 hulls … wave 10: 24 hulls
}

/** Multi-hit expectation per thrown body through the pack: the landed row-486 geometry —
 * a T2 boulder sweeps a 2·radius corridor; lanes tighter than the corridor mean ≥2 hulls. */
export function tapeHitsPerThrow(throwRadius = ROCK_SIZE_CLASSES.boulder.radius) {
  const corridor = throwRadius * 2;
  const laneHits = 1 + Math.floor(corridor / Math.max(1, FODDER_RIVER_RECIPE.laneSpacing));
  const rowHits = 1 + Math.floor(corridor / Math.max(1, FODDER_RIVER_RECIPE.alongSpacing));
  return Math.max(1, Math.min(4, Math.max(laneHits, Math.min(laneHits, rowHits) + 1)));
}

/** Seconds between throws once the player works the Line (aim + release + fetch cadence). */
export const TAPE_THROW_PERIOD_S = 3.6;
/** Sustained guns time-to-kill per swarm hull in waves 1–10 — swarm hulls are tuned for
 * impact (mass-scaled hit-stop, pack density); sustained gun DPS against the pack is the
 * deliberately slow path. */
export const TAPE_GUN_TTK_S = 7.0;
/** Travel time until the first thrown body connects (aim + flight). */
export const TAPE_FIRST_THROW_FLIGHT_S = 2.4;

/**
 * Time to clear wave `wave` with mode 'rocks' | 'guns'. Deterministic pure model.
 * Returns seconds (fractional allowed).
 */
export function tapeWaveClearSeconds(wave, mode) {
  const n = tapeWaveStrength(wave);
  if (mode === 'guns') return n * TAPE_GUN_TTK_S;
  const killsPerThrow = tapeHitsPerThrow();
  const throwsNeeded = Math.ceil(n / killsPerThrow);
  return TAPE_FIRST_THROW_FLIGHT_S + throwsNeeded * TAPE_THROW_PERIOD_S;
}

/** Slowdown factor of a guns-only tape vs the rock tape for wave `wave`. */
export function tapeGunsOnlySlowdown(wave) {
  return tapeWaveClearSeconds(wave, 'guns') / Math.max(0.001, tapeWaveClearSeconds(wave, 'rocks'));
}

/** Slowdown of the guns-only tape across waves 1–10 (total clear time). */
export function tapeGunsOnlySlowdownAll() {
  let guns = 0, rocks = 0;
  for (let w = 1; w <= ROCK_GUN_WAVE_MAX; w++) {
    guns += tapeWaveClearSeconds(w, 'guns');
    rocks += tapeWaveClearSeconds(w, 'rocks');
  }
  return guns / Math.max(0.001, rocks);
}

/** Impact-kill share when the player runs the rock tape as their primary weapon — every
 * thrown kill is an impact tag; incidental gun chip is bounded by the multi-hit rate. */
export function tapeImpactShare(mode = 'rocks') {
  if (mode === 'guns') return 0;
  // The rock tape kills by throw (impact). A fraction of hulls die to secondary physics
  // (terrain_collision on the fling) — still impact. The residual is chip damage.
  const killsPerThrow = tapeHitsPerThrow();
  const impact = killsPerThrow;
  const chip = 0.35; // stray gun chip per thrown kill, bounded
  return impact / (impact + chip);
}
