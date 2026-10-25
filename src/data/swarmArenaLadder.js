// NEW compatibility implementation, not recovery of the omitted W1 source.
import {
  LINE_RATING_THRESHOLDS_T, LINE_THROW_RADIUS_MAX, LINE_ARENA_SCALE_BY_TIER,
} from './lineRating.js';

// Minimal projection of survivalArenas.js CULL_ARENA_LADDER. Importing that owner here
// would cycle swarmArena -> ladder -> survivalArenas -> swarmArena (top-level ARENA_LAWS).
// The focused contract test compares every id, step, threshold and scale to that owner.
// No second numeric rating/scale progression is maintained here.
const RUNGS = Object.freeze([
  ['cull_pebble_yard', 0], ['cull_slag_bowl', 1],
  ['cull_container_graveyard', 2], ['cull_reef_pinball', 2],
  ['cull_ice_orchard', 3], ['cull_glass_garden', 3], ['cull_garden_ring', 3],
  ['cull_breaker_field', 4], ['cull_yardmasters_belly', 4], ['cull_gutted_maw', 5],
].map(([id, lineTier], index) => Object.freeze({
  id, step: index + 1, lineTier,
  lineRatingMinT: LINE_RATING_THRESHOLDS_T[lineTier],
  scaleStep: LINE_ARENA_SCALE_BY_TIER[lineTier],
})));

/** NEW wave tuning: one rung every three waves, starting at wave 1 (last at 28).
 * Rating chooses the deepest equal-threshold rung, exactly as cullArenaForRating does.
 * Invalid/nonfinite values mean the initial band; no bitwise wrapping for long runs. */
export function swarmArenaTierForRun(options = {}) {
  const wave = Number.isFinite(options?.wave) ? Math.max(1, options.wave) : 1;
  const ratingT = Number.isFinite(options?.ratingT) ? Math.max(0, options.ratingT) : 0;
  const waveIndex = Math.min(RUNGS.length - 1, Math.floor((wave - 1) / 3));
  let index = waveIndex;
  for (let i = 0; i < RUNGS.length; i++) {
    if (ratingT >= RUNGS[i].lineRatingMinT) index = Math.max(index, i);
  }
  return RUNGS[index];
}

/** Layout accepts only this module's rung identities; unknown input keeps the caller's
 * authored arena fallback available. Reef bypass remains entirely owned by swarmArena.
 * NEW geometry tuning: preserve the original base band and surface clearance. Cap outer
 * centers at 390wu, inside the caller's fixed 400wu fight census; larger rooms must not
 * repeatedly spawn uncounted rocks. Bigger bodies reduce target density rather than fuse. */
export function swarmArenaDebrisLayout(tier) {
  if (!RUNGS.includes(tier)) return null;
  const scale = tier.scaleStep;
  const maxRadius = LINE_THROW_RADIUS_MAX[tier.lineTier];
  return Object.freeze({
    id: tier.id,
    target: 14 - tier.lineTier * 2,
    inner: 115 * scale,
    outer: Math.min(390, 340 * scale),
    safeRadius: 120 * scale,
    separation: 34,
    sizeMinWu: maxRadius * 0.5,
    sizeMaxWu: maxRadius,
  });
}

/** Three nearby pebble-class throwables, never a forced occupied placement.
 * NEW opening geometry: 72/96/120wu search rings, 16 bearings each, 24wu surface gap.
 * Heading 0 is +X, matching flight. Even endgame openers retain T0-throwable pebbles.
 * Existing footprints are {x,z,radius}; invalid geometry fails closed, rather than
 * treating unknown solid sizes/positions as free space. Work is capped at 4096 blockers
 * and 48 candidates. Clearance concerns only the supplied discs, not swept hulls or
 * bodies the caller omitted. Caller owns its collision-footprint snapshot.
 */
export function planOpeningThrowables(options = {}) {
  const { anchor = { x: 0, z: 0 }, headingRad = 0, existing = [] } = options || {};
  if (!Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.z)
    || !Number.isFinite(headingRad) || !Array.isArray(existing) || existing.length > 4096) return [];
  for (const body of existing) {
    if (!Number.isFinite(body?.x) || !Number.isFinite(body?.z)
      || !Number.isFinite(body?.radius) || body.radius < 0) return [];
  }
  const radiusWu = LINE_THROW_RADIUS_MAX[0] * 0.75;
  const gap = 24;
  const out = [];
  for (const distance of [72, 96, 120]) {
    for (let i = 0; i < 16; i++) {
      // Fan alternately left/right from the nose, then search behind if obstructed.
      const turn = (i % 2 === 0 ? -1 : 1) * Math.ceil(i / 2) * Math.PI / 8;
      const angle = headingRad + turn;
      const x = anchor.x + Math.cos(angle) * distance;
      const z = anchor.z + Math.sin(angle) * distance;
      if (!Number.isFinite(x) || !Number.isFinite(z)
        || Math.hypot(x - anchor.x, z - anchor.z) < 60 + radiusWu) continue;
      const blocked = existing.some(body => Math.hypot(x - body.x, z - body.z) < radiusWu + body.radius + gap)
        || out.some(body => Math.hypot(x - body.x, z - body.z) < radiusWu + body.radiusWu + gap);
      if (blocked) continue;
      out.push({ x, z, radiusWu });
      if (out.length === 3) return out;
    }
  }
  return out;
}
