// Hull-burst overhaul, slice C (design doc docs/plans/2026-09-29-hull-burst-physics-overhaul-design.md
// section 4): a timed, front-facing special attack carried by ONE fitted utility module.
//
// One slot, one type: the fitted module names a type here and systems/hullBurst.js does the rest.
// Every number below is an untuned placeholder (design doc section 11.6); the fixed-seed scene
// `feel.bumper_scene` measures the ones that matter (crawl versus full-swing fling distance).
//
// THE HURL IS MOMENTUM, NOT A FORCE FIELD. While the burst runs the player counts as `massScale`
// times heavier and the wedge behaves like an elastic bumper: what it touches is thrown away with
//   raw = (kick + (1 + bounce) * eff) * bumperMass / (bumperMass + targetMass),  eff = closing^2 / (closing + toe)
//   deltaV = raw up to a knee, then a soft ceiling toward maxDeltaV (order by mass survives)
// The knee sits ABOVE the arrival speeds the module is meant to reward: a thrown hull must leave the
// nose faster than the player is flying, or the player rams what it just threw and the measured "throw"
// is the player's own bulldozer (found in review: every swing arm converged on the player's speed).
// where `closing` is how fast the target and the nose were coming together along the throw. That is
// the whole point of the module: a crawling touch is a nudge, a full-speed arrival (a Massline
// swing) is the full effect, and a heavy hull shrugs because the ratio shrinks with its mass.
//
// The wedge is a cone, never a sphere (field-kernel law): reach ahead of the nose, a half angle
// that opens with distance, and a small nose width so a dead-centre approach can never miss.

// `effect` says what the wedge DOES to a hostile that enters it: 'throw' (momentum, the Gravity Bumper),
// 'lance' (thermal damage through the combat kernel: contact kills light and medium hulls, heavies burn) or
// 'grip' (catch one light hull and carry it on the nose). Geometry, timing, latch and the hostile/nudge split
// are shared; only the delivery differs, so a new type is a data row plus one small delivery function.
export const HULL_BURST_TYPES = Object.freeze({
  gravity: Object.freeze({
    id: 'gravity',
    effect: 'throw',
    blurb: 'throws hostile hulls at the nose, harder the faster you arrive',
    name: 'Gravity Bumper',
    moduleId: 'mod_gravity_bumper_s',
    // Timing. The recharge is clearly longer than the window (design section 4).
    durationS: 6,
    cooldownS: 18,
    // The wedge.
    reachWu: 150,
    halfAngleRad: 0.5,        // ~29 degrees each side at the far edge
    noseWidthWu: 18,
    // The hurl.
    massScale: 4,             // the player counts as this much heavier while it runs
    kickWuS: 8,               // delta-V of a touch at zero closing speed, before the mass ratio: below the
                              // hitstun floor for a light hull, so a crawl is a shove, never a stun
    bounce: 1.0,              // restitution of the bumper: (1 + bounce) x the effective closing speed
    toeClosingWuS: 60,        // a low-speed toe: eff = c^2 / (c + toe), so a crawl (c ~ 20) counts as ~5 and a
                              // boost-speed arrival (c ~ 280) as ~230. A touch stays a nudge (the shove beat
                              // gives ANY shove-class hit about a screen of travel, so a nudge has to stay under it)
    kneeWuS: 300,             // below this a throw is exactly the momentum law
    maxDeltaVWuS: 480,        // the soft ceiling's asymptote: a hard safety bound, not a tuning knob
    forwardBias: 0.65,        // throw direction = 0.65 x nose heading + 0.35 x centre-to-centre
    // What a non-hostile hull in the wedge gets instead: a nudge, never a fling or a stun.
    nudgeMaxDeltaVWuS: 12,
    // Per-target latch: a hull is hurled once per activation, never re-hit every tick.
    hitStunSource: 'hull_burst',
  }),
  // FIRE LANCE (design doc section 4): a narrow, short wedge you must fly straight at. Contact is thermal
  // damage through the combat kernel, credited to the player: a light or medium hull takes more than its whole
  // pool (shield + armour + hull) and dies (its kill pays the ordinary loot burst); a heavy takes a bounded
  // share and burns. Scaled by closing speed like every burst: a crawling touch scorches, a full-speed pass
  // finishes. It never throws (no shove, no tumble): the finisher, where the bumper is the opener.
  lance: Object.freeze({
    id: 'lance',
    effect: 'lance',
    blurb: 'burns through the hull at the nose: light and medium hulls die, heavies ignite',
    name: 'Fire Lance',
    moduleId: 'mod_fire_lance_s',
    durationS: 4,
    cooldownS: 16,
    reachWu: 95,
    halfAngleRad: 0.16,       // ~9 degrees: a lance, not a cone
    noseWidthWu: 9,
    massScale: 1,             // unused by the lance (no momentum), kept so every type carries the same shape
    lightMediumMaxMass: 100,  // at or under this a full-speed hit kills; above it the hull only burns
    lethalMargin: 1.25,       // a light/medium hull takes this multiple of its whole pool at full speed
    fullSpeedWuS: 140,        // closing speed at which the hit is the module's full effect
    minScale: 0.12,           // even a crawling touch scorches a little
    heavyPoolShare: 0.3,      // a heavy takes this share of its pool at full speed...
    heavyDamageCap: 500,      // ...capped
    burnStacks: 3,            // status_burning stacks at full speed (scaled down with speed, at least 1)
    nudgeMaxDeltaVWuS: 0,     // a non-hostile hull is simply left alone by a lance
    hitStunSource: 'hull_burst',
  }),
});

/** Ranks scale a fitted type's duration and reach; rank 1 is the module as sold. */
export const HULL_BURST_RANK_GAIN = Object.freeze({
  durationPerRank: 0.25,
  reachPerRank: 0.2,
  deltaVPerRank: 0.15,
});

export function hullBurstType(kind) {
  return typeof kind === 'string' && Object.hasOwn(HULL_BURST_TYPES, kind) ? HULL_BURST_TYPES[kind] : null;
}

/** The type's numbers with a rank applied (rank < 1 reads as 1). Pure. */
export function resolveHullBurst(kind, rank = 1) {
  const type = hullBurstType(kind);
  if (!type) return null;
  const r = Math.max(0, (Number.isFinite(rank) ? Math.trunc(rank) : 1) - 1);
  return Object.freeze({
    ...type,
    rank: r + 1,
    durationS: type.durationS * (1 + HULL_BURST_RANK_GAIN.durationPerRank * r),
    reachWu: type.reachWu * (1 + HULL_BURST_RANK_GAIN.reachPerRank * r),
    kneeWuS: type.kneeWuS * (1 + HULL_BURST_RANK_GAIN.deltaVPerRank * r),
    maxDeltaVWuS: type.maxDeltaVWuS * (1 + HULL_BURST_RANK_GAIN.deltaVPerRank * r),
  });
}
