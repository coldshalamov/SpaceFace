// The Line bites a shielded hull and the membrane answers (inf-line-shield-bite).
//
// The shield-contact wire (`weapons/shieldContacts.js` — the four decay slots the shield shell
// samples) only ever fired from damage receipts. A massline could latch a shielded hull, load
// the line to its limit and finally tear free while the membrane showed nothing at all: the
// bite, the strain and the break were all invisible to the one surface they act on.
//
// This module is the decision layer that feeds that existing wire from the tether's own reads:
//
//   resolveLatchShieldBite      — the latch bite: one full-strength contact where the line
//                                 meets the shell, aimed from the target toward the biting hull;
//   resolveLineShieldSustain    — while a strained line holds a shielded hull, re-assert the
//                                 bite on a bounded cadence so the lattice visibly carries the
//                                 load between hull hits (the contact's own life is 0.28 s);
//   shieldBiteDir               — the shared bite direction (target -> source), the same
//                                 contact-aims-at-the-attacker convention projectile hits use.
//
// Pure: no THREE, no pools, no RNG, no sim writes. The caller owns the contact module, the
// strain reads and accessibility scaling of anything it draws beyond the contact wire.

// A strained bite must never visibly die between re-asserts: the contact radiance decays to
// its gate in about 0.27 s, so a 0.22 s cadence keeps one live slot lit without competing for
// all four (three stay free for real hull hits).
export const LINE_SHIELD_SUSTAIN_S = 0.22;

// A slack line carries no load the membrane could answer. Below this the bite decays naturally.
export const LINE_SHIELD_LOAD_FLOOR = 0.04;

// The latch bite lands at hit parity: the shell cannot tell the difference between a round and
// a tow cable, and it should not have to.
export const LINE_SHIELD_LATCH_STRENGTH = 1.0;

// A break under load is the hardest thing the line ever does to the membrane.
export const LINE_SHIELD_BREAK_STRENGTH = 1.0;

// Reduced-flash presentation still gets the sustained read — the lattice carrying load is
// information, not spectacle — at half gain, matching how flash-scale treats other contacts.
export const REDUCED_LINE_SHIELD_GAIN = 0.5;

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Unit bite direction from a target's centre toward the hull biting it. Writes {x, z} into
 * `out` and returns it, or null when the two points do not define an axis.
 */
export function shieldBiteDir(sourceX, sourceZ, targetX, targetZ, out) {
  const dx = finite(sourceX, NaN) - finite(targetX, NaN);
  const dz = finite(sourceZ, NaN) - finite(targetZ, NaN);
  const len = Math.hypot(dx, dz);
  if (!Number.isFinite(len) || len < 1e-6) return null;
  out.x = dx / len;
  out.z = dz / len;
  return out;
}

/** Does this hull present a membrane the line can bite? */
export function targetShieldUp(target) {
  return !!(target && target.alive !== false && Number.isFinite(target.shield) && target.shield > 0);
}

/**
 * The latch (or break) bite plan: { live, dirX, dirZ, strength }. Live only when the target
 * presents a shield and the biting hull gives the contact an axis. `strength` defaults to the
 * latch bite; the break passes its own.
 */
export function resolveLatchShieldBite(target, sourceX, sourceZ, out = {}, strength = LINE_SHIELD_LATCH_STRENGTH) {
  out.live = false;
  out.dirX = 0;
  out.dirZ = 0;
  out.strength = 0;
  if (!targetShieldUp(target)) return out;
  const dir = shieldBiteDir(sourceX, sourceZ, target.pos.x, target.pos.z, out);
  if (!dir) return out;
  out.live = true;
  out.strength = Math.max(0, strength);
  return out;
}

/**
 * The sustained strain bite. Fields (all written):
 *   bite      true when this tick should re-assert the contact
 *   strength  0..1 — a membrane under load radiates with the load; whip adds the snap of a
 *             line trying to leave the shell
 *
 * `lastBiteAt` is the caller's retained bite clock (use -Infinity for "never"). The cadence is
 * checked against `now`, so tests and callers can drive it deterministically. No shield, no
 * load, no cadence due — no bite.
 */
export function resolveLineShieldSustain(now, lastBiteAt, load, whip, shieldUp, reduced = false, out = {}) {
  out.bite = false;
  out.strength = 0;
  if (!shieldUp) return out;
  const l = clamp01(finite(load));
  const w = clamp01(finite(whip));
  if (l <= LINE_SHIELD_LOAD_FLOOR && w <= LINE_SHIELD_LOAD_FLOOR) return out;
  const at = finite(lastBiteAt, -Infinity);
  if (Number.isFinite(at) && now - at < LINE_SHIELD_SUSTAIN_S) return out;
  out.bite = true;
  // Load is the answer's body; whip is its edge. A fully loaded line never reads as hard as a
  // hull hit — it is a steady carry, not a strike.
  const gain = reduced ? REDUCED_LINE_SHIELD_GAIN : 1;
  out.strength = Math.min(0.9, (0.42 + l * 0.38 + w * 0.2)) * gain;
  return out;
}
