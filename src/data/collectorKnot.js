// The Pull collector — a fitted variant of the existing Pull emitter (packet 05, "A genuine deployed
// gather-and-launch expansion"). Authored tuning only: no math, no state.
//
// Grammar. With the Collector Maw fitted, the Pull key drops a COLLECTOR instead of a plain well. It
// is the same emitter on the same field kernel (the well's pull gathers loose mass into one pile);
// what it adds is a maw: the first eligible body to reach the emitter becomes the KNOT'S core, held
// at the emitter point, and every other eligible body that touches it merges in through the same
// capture transaction Gyre uses (src/matter/aggregateCapture.js). The knot is a real physical body:
// its collision mass is the sum of what it has eaten.
//
// Release is explicit. While a knot exists the Pull key is its focus: HOLD to aim and see the
// forecast line from where the knot physically is (the held-key preview), RELEASE to throw. The
// throw spends capacitor charge (a base plus a mass term — a heavier knot is a heavier decision),
// leaves FROM THE KNOT toward the aim point, and hands the ball to Gyre's thrown-aggregate lifecycle.
// A second Pull press never steals a ball: with a knot the key releases it; with an empty collector
// the key replaces it.
//
// Bounds. One collector per pilot (`maxActive`), `maxMembers` bodies per knot, a radius cap, and the
// emitter's own lifetime: when it expires, is shot down or is replaced, the knot is set free as an
// ordinary physical body with its authored lifetime back — never silently deleted.

export const COLLECTOR_MODULE_ID = 'mod_collector_maw_s';

export const COLLECTOR_KNOT = Object.freeze({
  moduleId: COLLECTOR_MODULE_ID,
  // The deployed emitter: the Pull well's field with a longer, sturdier body so a knot can build.
  durationS: 16,
  cooldownS: 10,
  hull: 70,
  // The maw and the knot.
  mawRadius: 28,          // wu — a loose body whose centre comes this close to the emitter becomes the core
  absorbEpsilonWu: 4,     // contact = knotRadius + memberRadius + this (the same skin rule as Gyre)
  absorbGapTicks: 4,      // ticks between merges — a pile folds in as x2, x3, x4, not one pop
  maxKnotRadius: 52,      // wu — the volumetric union clamps here; mass keeps counting
  maxMembers: 20,         // whole bodies per knot; a full knot stops gathering and says so
  maxActive: 1,           // concurrent collectors (and so knots) per pilot
  // Holding the knot at the emitter point (the same spring law as Gyre's hold slot).
  holdSpringK: 24,
  holdDamping: 8,
  holdMaxAccel: 900,
  holdBreakDist: 260,     // wu — a core knocked this far off the emitter slips the maw (set free)
  // The flinch a meal gives the knot — a declared emitter-anchor impulse, shared planMeal tuning.
  absorbKnockPerMass: 3,
  absorbKnockFloor: 0.15,
  absorbKnockSpeedRef: 80,
  // The throw. launchPlan() reads exactly these keys.
  launchSpeed: 460,
  launchMassPenalty: 0.2,
  maxClumpMass: 1600,
  launchTicks: 5,
  launchWindupTicks: 0,       // thrown from where it sits: no coil, no carrier frame
  launchWindupTicksMass: 0,
  launchImpactScaleBase: 1.6,
  launchImpactScalePerMass: 90,
  launchImpactScaleMax: 8,
  // The price of the commit: charge, not a free gesture. 10 for a pebble, +0.012 per tonne up to the
  // reference mass (about 29 at a full 1600 t knot) — against a 100-point capacitor.
  chargeBase: 10,
  chargePerMass: 0.012,
  chargeMassRef: 1600,
  focusRange: 900,        // wu — the ship must be within this of the knot to throw it
  // The shared tick-level words for the HUD/rail.
  rail: Object.freeze({
    name: 'Collector',
    drop: 'Drop a collector at your aim — it gathers loose mass into a knot',
    gather: 'Gathering — let mass pile in, then hold to aim',
    ready: 'Knot ready — hold to aim, release to throw',
  }),
});

/**
 * What the rail's Pull socket should say while the Collector Maw is fitted — the CURRENT role and the
 * NEXT action, from the runtime mirror the fields owner publishes (state.fieldsRuntime.collector).
 * Returns a partial rail slot ({ name, badge, why, description, state? }) or null when not fitted.
 * Pure read; the mirror may be absent before the first deploy.
 */
export function collectorRailSlot(state, fitted) {
  if (fitted !== true) return null;
  const c = state && state.fieldsRuntime && state.fieldsRuntime.collector;
  const words = COLLECTOR_KNOT.rail;
  if (c && c.active && c.ready) {
    const t = Math.round(c.mass);
    return {
      name: words.name, badge: `KNOT ${t}t`, state: 'armed',
      why: `Knot ${t} t, ${c.members + 1} bodies — hold to aim, release to throw (${Math.ceil(c.cost)} charge)${c.refusal ? ` · ${c.refusal}` : ''}`,
      description: words.ready,
    };
  }
  if (c && c.active) {
    return { name: words.name, badge: 'GATHERING', why: words.gather, description: words.gather };
  }
  return { name: words.name, badge: 'DROP', description: words.drop };
}
