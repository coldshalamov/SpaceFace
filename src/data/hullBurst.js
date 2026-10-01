// Hull-burst overhaul, slice C (owner principle 2026-09-30): a front-facing cone carried by ONE
// fitted boost upgrade. There is no burst key, no window and no recharge: the upgrade IS the boost.
// Hold Shift and the wedge rides the gesture for exactly as long as the boost meter is paying; the
// meter is the only cost. systems/hullBurst.js polls the boost flag; this file is the law it fires.
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
// that opens with distance, and a small nose width so a dead-centre approach can never miss. The reach IS the
// strike zone: a hit lands the moment a hull's edge is inside it, with the closing speed at that instant, so it
// is short (about 70 WU, a quarter of a second of travel at boost speed) and what is drawn is what hits. (A
// long reach threw hulls 150 WU away, before anything visibly touched them, and latched a hull already inside
// at ignition at its crawling speed for the rest of the window: found in review.)
//
// A hull is hit ONCE per boost gesture, except that a much stronger hit can follow a weak one
// (`rehitFactor`, `rehitMinGain`, `rehitGapS`): a boost with a hostile already inside the wedge at a crawl
// gives it a nudge, and accelerating into it afterwards is worth the full effect, not nothing.

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
    // The wedge.
    reachWu: 75,
    halfAngleRad: 0.5,        // ~29 degrees each side at the far edge
    noseWidthWu: 18,
    rehitFactor: 2,           // a second hit needs at least this multiple of the first hit's delta-V...
    rehitMinGain: 40,         // ...and at least this many WU/s more,
    rehitGapS: 0.25,          // ...and this long since it
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
    // Per-target latch: a hull is hurled once per boost gesture, never re-hit every tick.
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
    reachWu: 60,
    halfAngleRad: 0.16,       // ~9 degrees: a lance, not a cone
    noseWidthWu: 9,
    rehitFactor: 2,           // a second burn needs at least this multiple of the first one's scale...
    rehitMinGain: 0.3,        // ...and at least this much more of a full-effect hit,
    rehitGapS: 0.25,          // ...and this long since it
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
  // GRIP BUMPER (design doc section 4): catches ONE light hostile hull on the nose and carries it: a
  // battering ram with a hostage. The hull is held at the nose by a spring-damper delivered as impulses
  // through the physics port (never a position write), its helm stays lost, and whatever it hits while
  // carried is the player's doing (it is a loose hull, so slice A's projectile law applies). When the boost
  // gesture ends, or the hostage dies, it is released at the player's speed and flies on as an ordinary
  // flung hull (credit held, tumbling). Medium and heavy hulls are not catchable.
  grip: Object.freeze({
    id: 'grip',
    effect: 'grip',
    blurb: 'catches a light hull on the nose and carries it; press again to let it go',
    name: 'Grip Bumper',
    moduleId: 'mod_grip_bumper_s',
    reachWu: 80,
    halfAngleRad: 0.35,
    noseWidthWu: 16,
    rehitFactor: 1e9,         // a catch happens once (a caught hull is held, not re-hit); a refused heavy stays refused
    rehitMinGain: 1e9,
    rehitGapS: 0.25,
    massScale: 4,             // the player counts this much heavier: the hitstun mass factor on the catch and release
    gripMaxMass: 40,          // a Wasp (16) or Hornet (24) is catchable; a Drifter (48) and up is not
    gapWu: 4,                 // clear space between the two hulls' edges while carried (so they never overlap)
    springK: 120,             // 1/s^2, the carry's stiffness (about a 0.6 s pull-in)
    springDamp: 20,           // 1/s, the carry's damping (near critical)
    maxAccelWuS2: 3000,       // ceiling on the carry's acceleration, so a hull caught at the reach is not fired at the nose
    refreshS: 2.5,            // the helm is re-taken this often while carried (a stun outlasts the hold)
    releaseBoost: 1.15,       // released at this multiple of the player's velocity...
    releaseKickWuS: 40,       // ...plus this much along the nose, so it always leaves ahead of the player
    nudgeMaxDeltaVWuS: 0,     // a non-hostile hull is left alone
    hitStunSource: 'hull_burst',
  }),
});

/** Ranks scale a fitted type's reach and throw; rank 1 is the module as sold. */
export const HULL_BURST_RANK_GAIN = Object.freeze({
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
    reachWu: type.reachWu * (1 + HULL_BURST_RANK_GAIN.reachPerRank * r),
    kneeWuS: type.kneeWuS * (1 + HULL_BURST_RANK_GAIN.deltaVPerRank * r),
    maxDeltaVWuS: type.maxDeltaVWuS * (1 + HULL_BURST_RANK_GAIN.deltaVPerRank * r),
  });
}
