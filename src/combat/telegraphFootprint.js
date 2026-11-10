// Telegraph footprint = damage query (packet 02, design/combat-convergence/02_COMBAT_READABILITY_AND_TARGETING.md).
//
// A telegraph that draws a smaller footprint than the query that hurts is a lie the player pays for
// (they stand on the rim and are hit), and a larger one teaches them to ignore it. The fix is not a
// tuned fudge on the drawing side: the SIM's damage query and the PRESENTATION's drawn footprint call
// the same functions with the same inputs, so they cannot drift.
//
// PURE. No state, no rng, no clock. Numbers are the authored query conventions, moved here without
// change (a circle query reaches half the victim's radius past the base radius; a body-sweep query
// reaches the sum of both radii), so adopting these in the sim is a no-op for determinism.

/** How much of the VICTIM's own radius a circular area query adds to the authored radius. */
export const CIRCLE_VICTIM_REACH = 0.5;

/** Radius within which a circular area effect (acid splash, pool) hurts a victim of `victimRadius`. */
export function circleHitRadius(baseRadius, victimRadius) {
  const v = Number.isFinite(victimRadius) && victimRadius > 0 ? victimRadius : 0;
  return baseRadius + v * CIRCLE_VICTIM_REACH;
}

/** Half-width of the lane a body-sweep (a charging hull) hurts: the two radii touching. */
export function corridorHalfWidth(carrierRadius, victimRadius) {
  const v = Number.isFinite(victimRadius) && victimRadius > 0 ? victimRadius : 0;
  return carrierRadius + v;
}

/** How far a committed pass can reach from where it starts. */
export function dashReach(speed, maxSeconds) {
  return Math.max(0, speed * maxSeconds);
}

/**
 * Time-to-contact urgency in [0,1] for a telegraph: 0 at the start of its preparation, 1 at the
 * instant of effect. `elapsed` and `duration` share a unit.
 */
export function telegraphUrgency(elapsed, duration) {
  if (!(duration > 0)) return 1;
  return Math.max(0, Math.min(1, elapsed / duration));
}
