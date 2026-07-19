// Pure massline target-scoring helpers (massline rung 07; extended by packet T03).
//
// Single owner of "which target is the best massline (tether/slingshot) candidate?" — a PURE
// scoring function over (player, target, options) with NO state, NO bus, NO side effects. The
// caller resolves anything stateful (hostility, obstruction, ownership, tether def range) and
// passes the result in via options, so this module stays deterministic and unit-testable without
// a harness.
//
// Consumed by rung 08 (combat/autoTargetMode.js auto-target wire): when the player is in massline
// mode (tether out / slingshot intent), the auto-target picker uses rankMasslineTargets() instead
// of the weapon "hostiles first, then distance" sort — it favors SWING POTENTIAL.
//
// Massline scoring favors a target you can actually whip: moving across your line (tangential),
// in the right mass band (not so light it flies away, not so heavy it won't budge), at a
// comfortable range (room to swing, not edge-of-break), with a hostility bonus so combat-relevant
// targets win ties. Geometry is 2D on the XZ plane (y=0), matching the sim.
//
// T03 AXES (03_SIGNATURE_SYSTEMS.md T03 row: intent, range, closing geometry, obstruction,
// ownership). All three additions are STRICTLY OPT-IN and the legacy path is byte-identical when
// none of them is supplied — that is what keeps rung-08 consumers and check:massline:target-scoring
// provably unchanged until a T04+ consumer chooses to pass them:
//   • PLAYER INTENT (opts.intentDir {x,z}, opts.preferredId): alignment between the line to the
//     target and the direction the player is pointing blends in at W_INTENT; an explicitly painted
//     preferredId gets an additive bonus sized to beat the latched tiebreak. Intent is a pure
//     function of THIS call's arguments — flip the intent vector and the very next ranking flips
//     with it (immediate reversal; no hysteresis beyond the documented latched bonus).
//   • OBSTRUCTION (opts.obstructed / opts.isObstructed): a latch cannot pass through terrain, so
//     an obstructed target GATES to score 0, rating 'blocked' — physics honesty, not a penalty.
//   • OWNERSHIP (opts.ownership / opts.ownershipOf -> 'own'|'station'|'ally'|'neutral'|'hostile'):
//     the player's own deployables and station structure GATE to rating 'protected' (you cannot
//     throw what you are); an ally is ELIGIBLE (rescue/tow, T11) but damped by ALLY_FACTOR so it
//     never outranks a comparable hostile; neutral/hostile multiply by 1 (the existing hostility
//     BONUS stays the separate axis it always was).
//   • REACH ALLOWANCE (opts.reachAllowance / opts.reachAllowanceOf -> non-negative WU): optional
//     extra latch range per candidate so a caller can restore surface-reach contracts
//     (centerDistance <= maxRange + radius) without changing range-comfort semantics. Absent or
//     zero allowance keeps the legacy center-distance gate byte-identical. Comfort still uses
//     raw distance / maxRange (clamped), never (distance - allowance).
//   • NO WEAPON-AIM COUPLING: this module reads no weapon or reticle state of any kind. A locked
//     gun must never steer massline target choice — pinned by the contract suite, which also
//     forbids this file from even naming those seams.

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

// --- T03 axis constants -------------------------------------------------------------------------
// Weight of the player-intent alignment axis WHEN an intent vector is supplied. The legacy axes
// are scaled by (1 - W_INTENT) so the blended weights still sum to 1; with no intent vector the
// legacy expression runs untouched (byte-identical scores).
const W_INTENT = 0.25;
// Painted-target bonus. Deliberately larger than the 0.08 latched tiebreak so an explicit player
// designation beats stickiness, while a full intent reversal (alignment swing of 1.0 x W_INTENT
// = 0.25) beats BOTH — reversal must always win immediately.
const PREFERRED_BONUS = 0.15;
// Ownership multipliers. 'own'/'station' are GATES handled before scoring (rating 'protected'),
// so they never reach this table. An ally is eligible (rescue/tow) but damped below any
// comparable hostile or neutral.
const ALLY_FACTOR = 0.35;
const OWNERSHIP_GATED = Object.freeze(new Set(['own', 'station']));

/**
 * Score one candidate target as a massline (tether/slingshot) anchor.
 *
 * Pure: reads only the arguments, writes nothing. Caller resolves hostility + max range.
 *
 * @param {object} player   - { pos:{x,z}, vel?:{x,z} }
 * @param {object} target   - { id, pos:{x,z}, vel?:{x,z}, radius?, mass?, type? }
 * @param {object} [opts]
 * @param {number} [opts.maxRange=390]        - tether latch range (caller passes def.maxLength).
 * @param {number} [opts.reachAllowance=0]    - non-negative extra range (surface reach); opt-in.
 * @param {boolean} [opts.hostile=false]      - caller-resolved isHostileToPlayer flag.
 * @param {boolean} [opts.currentlyLatched=false] - small bonus to hold the target you already have.
 * @returns {{ id, score:0..1, rating:'clean'|'good'|'rough'|'poor'|'out', reasons:object }}
 *   Out-of-range targets return score 0, rating 'out' (they are not massline candidates).
 */
export function scoreMasslineTarget(player, target, opts = {}) {
  const maxRange = positiveFinite(opts.maxRange, DEFAULT_MAX_RANGE);
  const reachAllowance = nonNegativeFinite(opts.reachAllowance, 0);
  const id = target && target.id != null ? target.id : null;

  if (!player || !player.pos || !target || !target.pos) {
    return zero(id, 'missing geometry');
  }

  // T03 hard gates run before any scoring. Order is deliberate: ownership protection outranks
  // obstruction (you are told a station is protected even when a rock also happens to block it),
  // and both outrank the range gate so the caller's reasons are the most actionable ones.
  const ownership = typeof opts.ownership === 'string' ? opts.ownership : null;
  if (ownership && OWNERSHIP_GATED.has(ownership)) {
    return gated(id, 'protected', `ownership ${ownership}`);
  }
  if (opts.obstructed === true) {
    return gated(id, 'blocked', 'line of sight obstructed');
  }

  const dx = finite(target.pos.x, 0) - finite(player.pos.x, 0);
  const dz = finite(target.pos.z, 0) - finite(player.pos.z, 0);
  const distance = Math.hypot(dx, dz);

  // Reachability gate: outside latch range (+ optional surface allowance) is not a candidate.
  // Comfort still uses raw center distance / maxRange so allowance does not inflate "ideal mid-band".
  const reachLimit = maxRange + reachAllowance;
  if (!(distance <= reachLimit) || !(distance > 1e-6)) {
    return zero(id, distance > reachLimit ? 'out of range' : 'degenerate distance');
  }

  const swing = scoreSwingGeometry(player, target, dx, dz, distance);
  const mass = scoreMass(target);
  const range = scoreRangeComfort(distance, maxRange);
  const hostile = opts.hostile ? 1 : 0;
  const latchedBonus = opts.currentlyLatched ? 0.08 : 0;   // tiebreak, not a weighted factor

  const legacyWeighted = W_SWING * swing
    + W_MASS * mass
    + W_RANGE * range
    + W_HOSTILE * hostile;

  // Player-intent alignment: 1 = the line to this target points exactly where the player is
  // pointing, 0 = exactly opposite, 0.5 = orthogonal. Pure function of THIS call — flipping
  // intentDir flips the ranking on the very next call (immediate reversal by construction).
  const intent = readIntentAlignment(opts.intentDir, dx, dz, distance);
  const preferredBonus = opts.preferredId != null && id != null && opts.preferredId === id
    ? PREFERRED_BONUS : 0;

  let score;
  if (intent.present) {
    score = (1 - W_INTENT) * legacyWeighted + W_INTENT * intent.alignment
      + latchedBonus + preferredBonus;
  } else {
    // LEGACY PATH — byte-identical to rung 07 when no T03 axis is active.
    score = legacyWeighted + latchedBonus + preferredBonus;
  }

  const ownershipFactor = ownership === 'ally' ? ALLY_FACTOR : 1;
  score = clamp01(score * ownershipFactor);

  const reasons = { swing, mass, range, hostile, latchedBonus, distance };
  if (intent.present) reasons.intent = intent.alignment;
  if (preferredBonus > 0) reasons.preferredBonus = preferredBonus;
  if (ownership) reasons.ownership = ownership;

  return { id, score, rating: ratingFor(score), reasons };
}

/**
 * Normalise an intent vector and read the [0,1] alignment of the target bearing against it.
 * Absent, zero-length, or non-finite intent reads as not-present (legacy scoring path).
 */
function readIntentAlignment(intentDir, dx, dz, distance) {
  if (!intentDir || typeof intentDir !== 'object') return { present: false, alignment: 0.5 };
  const ix = finite(intentDir.x, 0);
  const iz = finite(intentDir.z, 0);
  const len = Math.hypot(ix, iz);
  if (!(len > 1e-9)) return { present: false, alignment: 0.5 };
  const dot = (dx / distance) * (ix / len) + (dz / distance) * (iz / len);
  return { present: true, alignment: clamp01((dot + 1) / 2) };
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
  const isObstructedFn = typeof opts.isObstructed === 'function' ? opts.isObstructed : null;
  const ownershipOfFn = typeof opts.ownershipOf === 'function' ? opts.ownershipOf : null;
  const reachAllowanceOfFn = typeof opts.reachAllowanceOf === 'function' ? opts.reachAllowanceOf : null;
  const out = [];
  for (const c of candidates) {
    const subOpts = { ...opts };
    if (isHostileFn) subOpts.hostile = !!isHostileFn(c);
    if (isLatchedFn) subOpts.currentlyLatched = !!isLatchedFn(c);
    if (isObstructedFn) subOpts.obstructed = !!isObstructedFn(c);
    if (ownershipOfFn) {
      const o = ownershipOfFn(c);
      if (typeof o === 'string') subOpts.ownership = o;
    }
    if (reachAllowanceOfFn) {
      const a = reachAllowanceOfFn(c);
      if (Number.isFinite(a) && a >= 0) subOpts.reachAllowance = a;
    }
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

// T03 gate record: same shape as zero() but with the gate's own rating so a consumer can tell
// "not a candidate at all" ('out') from "physically blocked" ('blocked') from "yours/protected"
// ('protected') without parsing prose.
function gated(id, rating, reason) {
  return { id, score: 0, rating, reasons: { gate: reason } };
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function lerp(a, b, t) { return a + (b - a) * clamp01(t); }

function finite(v, fb) { return Number.isFinite(v) ? v : fb; }

function positiveFinite(v, fb) {
  return Number.isFinite(v) && v > 0 ? v : fb;
}

function nonNegativeFinite(v, fb) {
  return Number.isFinite(v) && v >= 0 ? v : fb;
}

function compareId(a, b) {
  // Stable, type-tolerant comparison so the sort is deterministic regardless of id type.
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
