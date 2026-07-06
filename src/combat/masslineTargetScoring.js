// Pure massline target-scoring helpers (massline rung 07).
//
// Single owner of "which target is the best massline (tether/slingshot) candidate?" — a PURE
// scoring function over (player, target, options) with NO state, NO bus, NO side effects. The
// caller resolves anything stateful (hostility, tether def range) and passes the result in via
// options, so this module stays deterministic and unit-testable without a harness.
//
// Consumed by rung 08 (combat/autoTargetMode.js auto-target wire): when the player is in massline
// mode (tether out / slingshot intent), the auto-target picker uses rankMasslineTargets() instead
// of the weapon "hostiles first, then distance" sort — it favors SWING POTENTIAL.
//
// Massline scoring favors a target you can actually whip: moving across your line (tangential),
// in the right mass band (not so light it flies away, not so heavy it won't budge), at a
// comfortable range (room to swing, not edge-of-break), with a hostility bonus so combat-relevant
// targets win ties. Geometry is 2D on the XZ plane (y=0), matching the sim.

// Defaults mirror the live tether def (src/data/combatDefs.js: tether_standard.maxLength = 390).
const DEFAULT_MAX_RANGE = 390;
// Range comfort band: ideal at 30-75% of max range. <15% = too close (no room to swing, snap risk);
// >90% = edge of break. Below 15% and above 90% both penalize.
const RANGE_IDEAL_LO = 0.30;
const RANGE_IDEAL_HI = 0.75;
const RANGE_FLOOR = 0.15;
const RANGE_CEIL = 0.90;
// Mass band: anchors need enough mass that the line loads instead of yanking them away, but not so
// much that no energy transfers. Empirical sweet spot ~120-1200 wu-mass for the stock tether.
const MASS_IDEAL_LO = 120;
const MASS_IDEAL_HI = 1200;
const MASS_LIGHT_CEIL = 40;     // below this = drone/debris, whips away, barely an anchor
// Rating bands (mirror the release/snap-catch quality tiers).
const RATING_CLEAN = 0.80;
const RATING_GOOD = 0.55;
const RATING_ROUGH = 0.30;

// Factor weights (sum = 1.0). Swing geometry is the headline massline read; the rest break ties.
const W_SWING = 0.45;
const W_MASS = 0.20;
const W_RANGE = 0.20;
const W_HOSTILE = 0.15;

/**
 * Score one candidate target as a massline (tether/slingshot) anchor.
 *
 * Pure: reads only the arguments, writes nothing. Caller resolves hostility + max range.
 *
 * @param {object} player   - { pos:{x,z}, vel?:{x,z} }
 * @param {object} target   - { id, pos:{x,z}, vel?:{x,z}, radius?, mass?, type? }
 * @param {object} [opts]
 * @param {number} [opts.maxRange=390]        - tether latch range (caller passes def.maxLength).
 * @param {boolean} [opts.hostile=false]      - caller-resolved isHostileToPlayer flag.
 * @param {boolean} [opts.currentlyLatched=false] - small bonus to hold the target you already have.
 * @returns {{ id, score:0..1, rating:'clean'|'good'|'rough'|'poor'|'out', reasons:object }}
 *   Out-of-range targets return score 0, rating 'out' (they are not massline candidates).
 */
export function scoreMasslineTarget(player, target, opts = {}) {
  const maxRange = positiveFinite(opts.maxRange, DEFAULT_MAX_RANGE);
  const id = target && target.id != null ? target.id : null;

  if (!player || !player.pos || !target || !target.pos) {
    return zero(id, 'missing geometry');
  }

  const dx = finite(target.pos.x, 0) - finite(player.pos.x, 0);
  const dz = finite(target.pos.z, 0) - finite(player.pos.z, 0);
  const distance = Math.hypot(dx, dz);

  // Reachability gate: outside latch range is not a candidate at all.
  if (!(distance <= maxRange) || !(distance > 1e-6)) {
    return zero(id, distance > maxRange ? 'out of range' : 'degenerate distance');
  }

  const swing = scoreSwingGeometry(player, target, dx, dz, distance);
  const mass = scoreMass(target);
  const range = scoreRangeComfort(distance, maxRange);
  const hostile = opts.hostile ? 1 : 0;
  const latchedBonus = opts.currentlyLatched ? 0.08 : 0;   // tiebreak, not a weighted factor

  const score = clamp01(
    W_SWING * swing
    + W_MASS * mass
    + W_RANGE * range
    + W_HOSTILE * hostile
    + latchedBonus,
  );

  return {
    id,
    score,
    rating: ratingFor(score),
    reasons: { swing, mass, range, hostile, latchedBonus, distance },
  };
}

/**
 * Rank candidate targets by massline score, best first. Pure; does not mutate the input array
 * (returns a new sorted array of score records).
 *
 * @param {object} player
 * @param {Array<object>} candidates
 * @param {object} [opts]  - forwarded to scoreMasslineTarget for each candidate. May also pass
 *   opts.isHostile(target) -> boolean and/or opts.isLatched(target) -> boolean to let the caller
 *   resolve hostility and current-latch status per-candidate (both optional).
 * @returns {Array<object>} sorted score records ({id, score, rating, reasons}), descending.
 */
export function rankMasslineTargets(player, candidates, opts = {}) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  const isHostileFn = typeof opts.isHostile === 'function' ? opts.isHostile : null;
  const isLatchedFn = typeof opts.isLatched === 'function' ? opts.isLatched : null;
  const out = [];
  for (const c of candidates) {
    const subOpts = { ...opts };
    if (isHostileFn) subOpts.hostile = !!isHostileFn(c);
    if (isLatchedFn) subOpts.currentlyLatched = !!isLatchedFn(c);
    const rec = scoreMasslineTarget(player, c, subOpts);
    if (rec) out.push(rec);
  }
  // Deterministic sort: score desc, then id asc (stable across equal scores so reruns hash-equal).
  out.sort((a, b) => (b.score - a.score) || compareId(a.id, b.id));
  return out;
}

// ---- factor scorers (each 0..1) ----

// Swing geometry: how perpendicular is the target's motion to the line? A purely tangential
// (perpendicular) catch is the ideal slingshot — you convert all that sideways speed into a whip.
// A radial catch (flying straight at/away from you) has nothing to swing on. Measured as
// |tangential| / max(|relative|, floor) so a SLOW but purely-tangential target still scores its
// geometry, but a STATIC target scores 0 (no swing to convert).
function scoreSwingGeometry(player, target, dx, dz, distance) {
  const pvx = finite(player.vel && player.vel.x, 0);
  const pvz = finite(player.vel && player.vel.z, 0);
  const tvx = finite(target.vel && target.vel.x, 0);
  const tvz = finite(target.vel && target.vel.z, 0);
  const rvx = pvx - tvx;
  const rvz = pvz - tvz;
  const rel = Math.hypot(rvx, rvz);
  if (rel < 1e-6) return 0;                     // static catch — nothing to swing on
  const lineUnit = distance > 1e-9 ? { x: dx / distance, z: dz / distance } : { x: 1, z: 0 };
  // 2D cross = tangential magnitude (unsigned for scoring).
  const tangential = Math.abs(rvx * lineUnit.z - rvz * lineUnit.x);
  return clamp01(tangential / rel);             // 1 = perfectly perpendicular, 0 = purely radial
}

// Mass band: sweet spot in the middle; penalize at both extremes. Below MASS_LIGHT_CEIL is barely
// an anchor (drone/debris whips away); above MASS_IDEAL_HI the target barely budges (still a usable
// anchor but less satisfying). Returns 0..1.
function scoreMass(target) {
  const mass = positiveFinite(target && target.mass, 0);
  if (mass <= 0) {
    // No mass data (some fixtures). Neutral — don't reward or penalize.
    return 0.5;
  }
  if (mass < MASS_LIGHT_CEIL) return 0.1;       // too light: yanks free
  if (mass < MASS_IDEAL_LO) return lerp(0.1, 0.9, (mass - MASS_LIGHT_CEIL) / (MASS_IDEAL_LO - MASS_LIGHT_CEIL));
  if (mass <= MASS_IDEAL_HI) return 1.0;        // ideal anchor band
  // Heavy tail: gradually decay but never to 0 — a capital ship is still a fine anchor, just stolid.
  return clamp01(1.0 - 0.4 * (mass - MASS_IDEAL_HI) / MASS_IDEAL_HI);
}

// Range comfort: ideal mid-band, penalize at the extremes. Too close = snap risk; too far = edge of
// break. Returns 0..1.
function scoreRangeComfort(distance, maxRange) {
  const r = clamp01(distance / maxRange);
  if (r < RANGE_FLOOR) return 0.2;              // too close — no swing room
  if (r > RANGE_CEIL) return 0.2;               // edge of break
  if (r >= RANGE_IDEAL_LO && r <= RANGE_IDEAL_HI) return 1.0;
  if (r < RANGE_IDEAL_LO) return lerp(0.2, 1.0, (r - RANGE_FLOOR) / (RANGE_IDEAL_LO - RANGE_FLOOR));
  return lerp(1.0, 0.2, (r - RANGE_IDEAL_HI) / (RANGE_CEIL - RANGE_IDEAL_HI));
}

// ---- helpers ----

function ratingFor(score) {
  if (score >= RATING_CLEAN) return 'clean';
  if (score >= RATING_GOOD) return 'good';
  if (score >= RATING_ROUGH) return 'rough';
  return 'poor';
}

function zero(id, reason) {
  return { id, score: 0, rating: 'out', reasons: { gate: reason } };
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function lerp(a, b, t) { return a + (b - a) * clamp01(t); }

function finite(v, fb) { return Number.isFinite(v) ? v : fb; }

function positiveFinite(v, fb) {
  return Number.isFinite(v) && v > 0 ? v : fb;
}

function compareId(a, b) {
  // Stable, type-tolerant comparison so the sort is deterministic regardless of id type.
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
