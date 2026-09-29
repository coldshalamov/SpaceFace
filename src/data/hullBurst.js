// Hull-burst overhaul, slice C (design doc docs/plans/2026-09-29-hull-burst-physics-overhaul-design.md
// section 4): a timed, front-facing special attack carried by ONE fitted utility module.
//
// One slot, one type: the fitted module names a type here and systems/hullBurst.js does the rest.
// Every number below is an untuned placeholder (design doc section 11.6); the fixed-seed scene
// `feel.bumper_scene` measures the ones that matter (crawl versus full-swing fling distance).
//
// THE HURL IS MOMENTUM, NOT A FORCE FIELD. While the burst runs the player counts as `massScale`
// times heavier and the wedge behaves like an elastic bumper: what it touches is thrown away with
//   raw = (kick + (1 + bounce) * closing) * bumperMass / (bumperMass + targetMass)
//   deltaV = maxDeltaV * tanh(raw / maxDeltaV)          (a soft ceiling: order by mass survives)
// where `closing` is how fast the target and the nose were coming together along the throw. That is
// the whole point of the module: a crawling touch is a nudge, a full-speed arrival (a Massline
// swing) is the full effect, and a heavy hull shrugs because the ratio shrinks with its mass.
//
// The wedge is a cone, never a sphere (field-kernel law): reach ahead of the nose, a half angle
// that opens with distance, and a small nose width so a dead-centre approach can never miss.

export const HULL_BURST_TYPES = Object.freeze({
  gravity: Object.freeze({
    id: 'gravity',
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
    massScale: 2.5,           // the player counts as this much heavier while it runs
    kickWuS: 8,               // delta-V of a touch at zero closing speed, before the mass ratio: below the
                              // hitstun floor for a light hull, so a crawl is a shove, never a stun
    bounce: 0.6,              // restitution of the bumper: (1 + bounce) x closing
    maxDeltaVWuS: 260,        // soft ceiling (asymptote) on what one hit delivers
    forwardBias: 0.65,        // throw direction = 0.65 x nose heading + 0.35 x centre-to-centre
    // What a non-hostile hull in the wedge gets instead: a nudge, never a fling or a stun.
    nudgeMaxDeltaVWuS: 12,
    // Per-target latch: a hull is hurled once per activation, never re-hit every tick.
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
    maxDeltaVWuS: type.maxDeltaVWuS * (1 + HULL_BURST_RANK_GAIN.deltaVPerRank * r),
  });
}
