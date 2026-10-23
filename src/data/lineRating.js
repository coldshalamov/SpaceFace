// Row 483 (ROCK-KATAMARI) / 484 (ROCK-FLAIL) / 485 (ROCK-ARENAS):
// the Line rating — the katamari number for the massline. Everything on this module is pure
// data: the registered owner is src/systems/rockCore.js, the band/radio + winch + Line-colour
// presentation layers read the projection this produces. No Math.random, no wall time.

import { ROCK_SIZE_CLASSES } from './rockSubstances.js';

/** Tonnes on the Line at which each rating tier starts. T0 is a bare line; T5 hauls plate. */
export const LINE_RATING_THRESHOLDS_T = Object.freeze([0, 25, 80, 180, 360, 640]);
export const LINE_RATING_TIER_MAX = LINE_RATING_THRESHOLDS_T.length - 1; // 5

/** Names the HUD/band can speak when a new tier unlocks a body class. */
export const LINE_THROW_CLASSES = Object.freeze([
  'pebble',    // T0 — always throwable
  'boulder',   // T1 — ROCK_SIZE_CLASSES.boulder
  'monolith',  // T2 — ROCK_SIZE_CLASSES.monolith
  'wreck',     // T3 — wreck chunks / slag bergs
  'hulk',      // T4 — whole dead hulls
  'plate',     // T5 — dreadnought plate (Gutted Maw ammunition)
]);

/** Radius ceiling (wu) each tier can move. Derived from the landed rock-size ladder so the
 * pebble/boulder/monolith bands line up exactly with ROCK_SIZE_CLASSES. */
export const LINE_THROW_RADIUS_MAX = Object.freeze([
  ROCK_SIZE_CLASSES.pebble.radius,      // 9
  ROCK_SIZE_CLASSES.boulder.radius,     // 18
  ROCK_SIZE_CLASSES.monolith.radius,    // 30
  45,                                   // wreck chunk
  70,                                   // hulk
  110,                                  // plate
]);

/** Rating tier a body of the given radius/mass needs to be Line-movable. */
export function lineThrowTierForBody(body) {
  const radius = Number.isFinite(body?.radius) ? body.radius
    : Number.isFinite(body?.rockRadius) ? body.rockRadius : 0;
  for (let tier = LINE_RATING_TIER_MAX; tier >= 1; tier--) {
    if (radius > LINE_THROW_RADIUS_MAX[tier - 1]) return tier;
  }
  return 0;
}

export function lineTierForRating(ratingT) {
  const t = Number.isFinite(ratingT) ? ratingT : 0;
  let tier = 0;
  for (let i = 1; i <= LINE_RATING_TIER_MAX; i++) {
    if (t >= LINE_RATING_THRESHOLDS_T[i]) tier = i;
  }
  return tier;
}

/** The class a tier just lit — used to paint newly-movable bodies in Line colour. */
export function lineUnlockedClass(tier) {
  const t = Math.max(0, Math.min(LINE_RATING_TIER_MAX, tier | 0));
  return LINE_THROW_CLASSES[t];
}

export function lineCanThrow(ratingT, body) {
  return lineTierForRating(ratingT) >= lineThrowTierForBody(body);
}

// ─── 484 ROCK-FLAIL ────────────────────────────────────────────────────────────
/** Chained wrecks on the Line. Five links is the certified stable count. */
export const LINE_FLAIL_MAX_LINKS = 5;
/** Chaining opens at T2 — you need enough line to swing a wreck. */
export const LINE_FLAIL_MIN_TIER = 2;
/** Each chained link keeps this gap behind the previous anchor (wu), mass-scaled. */
export const LINE_FLAIL_LINK_GAP_WU = 26;
export const LINE_FLAIL_LINK_GAP_PER_TONNE_WU = 0.12;
export const LINE_FLAIL_LINK_GAP_MAX_WU = 90;
/** Constraint iterations per fixed tick — bounded, keeps five links stable at 60 Hz. */
export const LINE_FLAIL_SOLVER_PASSES = 2;
export const LINE_FLAIL_DAMPING = 0.92;

export function lineFlailLinkGap(body) {
  const massT = Number.isFinite(body?.mass) ? body.mass
    : Number.isFinite(body?.rockTonnage) ? body.rockTonnage : 1;
  return Math.min(LINE_FLAIL_LINK_GAP_MAX_WU,
    LINE_FLAIL_LINK_GAP_WU + LINE_FLAIL_LINK_GAP_PER_TONNE_WU * Math.max(0, massT));
}

// ─── 485 ROCK-ARENAS ───────────────────────────────────────────────────────────
/** Arena radius multiplier per rating tier — the room grows with what you can swing. */
export const LINE_ARENA_SCALE_BY_TIER = Object.freeze([1.0, 1.15, 1.35, 1.6, 1.9, 2.25]);
/** Camera open floor (zoom-out bias 0..1) per tier — the frame widens as the rating grows.
 * Consumed read-only by the camera composition floor. */
export const LINE_CAMERA_OPEN_BY_TIER = Object.freeze([0, 0.08, 0.18, 0.3, 0.42, 0.55]);
/** Visible winch drum scale per tier — the winch is the tell that the Line grew. */
export const LINE_WINCH_SCALE_BY_TIER = Object.freeze([1.0, 1.15, 1.35, 1.6, 1.85, 2.2]);

export function lineArenaScale(tier) {
  const t = Math.max(0, Math.min(LINE_RATING_TIER_MAX, tier | 0));
  return LINE_ARENA_SCALE_BY_TIER[t];
}
export function lineCameraOpen(tier) {
  const t = Math.max(0, Math.min(LINE_RATING_TIER_MAX, tier | 0));
  return LINE_CAMERA_OPEN_BY_TIER[t];
}
export function lineWinchScale(tier) {
  const t = Math.max(0, Math.min(LINE_RATING_TIER_MAX, tier | 0));
  return LINE_WINCH_SCALE_BY_TIER[t];
}
