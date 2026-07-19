// Velocity language — ADR D7, "measurement, not anime."
//
// WHAT THIS REPLACES, AND WHY IT IS A REWRITE RATHER THAN A RETUNE.
// Slice 0 bounded the old speed-line drive: `intensity` was documented 0..1 and never clamped, so at
// speedRatio 10 it reached 15.5, opacity 4.65, 231 streaks, and a per-streak alpha of ~4.4 that
// saturated a `lighter` composite to opaque white. That clamp made the effect SAFE. It did not make
// it GOOD, because the complaint it was answering ("cheap and cartoonish") is about VOCABULARY, not
// magnitude. Additive white streaks are a cartoon idiom at any amplitude.
//
// The governing principle (D7): at low speed the WORLD conveys motion; at high speed the INSTRUMENTS
// convey it; particles are only ever a whisper in between. Four bands express that:
//
//   Band 0  <= 1x combat speed   NOTHING. Parallax stars and the velocity tape do the work. A streak
//                                here is noise in the fight readout.
//   Band 1  1-2x                 Sparse fine motes. Thin, short, count <= 24, alpha <= 0.20, NORMAL
//                                compositing (never 'lighter'), desaturated warm-white with the
//                                faintest teal. Dust shearing past a hull, not lasers.
//   Band 2  2-5x                 CHANGE VOCABULARY, NOT INTENSITY. Streaks get FEWER and slightly
//                                longer, then stop growing. The load-bearing cue migrates to the
//                                WORLD: `parallaxGain` streams the deep-field tile layers, and
//                                `smear` elongates bright background points along the flow.
//   Band 3  > 5x                 Streaks fade OUT almost entirely. THE INVERSION IS THE POINT — at
//                                extreme velocity individual particles are physically invisible.
//                                What remains is FIELD behaviour: barely-there full-screen
//                                directional grain (~4%), region-boundary blending, a few WU of
//                                camera lead, REDUCED shake, and the instruments rolling.
//
// Smoothness and quiet must read as terrifying speed. Every ramp below is therefore continuous
// across the band seams: there is no value in this file that steps, because a step at a band
// boundary is exactly the "cheap" tell the redesign exists to remove.
//
// HARD PROHIBITIONS (D7), enforced structurally rather than by discipline:
//   * No radial or peripheral vignette of any kind — that is the twice-rejected visor framing. This
//     module emits `grain`, a UNIFORM full-screen field with no radial term anywhere in it, and the
//     record carries no radius, falloff or edge parameter a caller could build one out of.
//   * No additive white saturation — `composite` is 'source-over' in every band and the palette is
//     desaturated warm-white, never #fff.
//   * `motionReduce` respected in EVERY band, applied as one pass over the finished record so it is
//     impossible for a future band to be added and quietly skip it.
//
// PURITY. No DOM, no THREE, no Math.random, no Date.now, nothing ticks, nothing is registered in
// UPDATE_ORDER. This module derives; callers draw. That is what lets `scripts/check-speed-lines.mjs`
// pin the SHIPPED math instead of a copy that can drift.
//
// NaN DISCIPLINE. Math.min/Math.max PROPAGATE NaN — `Math.min(1, Math.max(0, NaN))` is NaN, not 0 —
// so a non-finite velocity from a physics hiccup would sail through a naive clamp and reach the
// canvas as an Infinity line width. Every entry point screens its inputs and returns the SILENT
// record on anything non-finite. Note that "fail dark" is direction-sensitive here: several of these
// ramps DESCEND with speed, so clamping a NaN progress to 0 would fail BRIGHT on those. Screening at
// the entry point rather than clamping per-segment is what makes the failure direction uniform.

import {
  CORRIDOR_SECTOR_IDS,
  sectorGlobalOrigin,
  sectorMembershipAtGlobal,
} from '../data/sectorCoordinates.js';

// ---------------------------------------------------------------------------------------------
// flags
// ---------------------------------------------------------------------------------------------

// The shipped Tier-B pattern: default to IS_BROWSER so the flag is ON in live play and OFF under
// node, with a mutable export so a headless check can opt in explicitly.
//
// This flag deliberately lives HERE and not in src/data/featureFlags.js. `feel` is not in the
// curated system list `scripts/sf-sim.mjs` passes to createSimulation(), so the 47a golden never
// runs this code and there is ZERO golden-safety benefit to putting the flag in the shared module —
// while there is real cost: ADR D10.1 records that appending to a shared module-level declaration in
// featureFlags.js produced a duplicate `export const` and broke EVERY check in the repo for two
// minutes. A flag that needs no shared file should not touch one.
const IS_BROWSER = typeof window !== 'undefined';

export const VELOCITY_LANGUAGE_FLAGS = {
  /** The four-band redesign. OFF restores the Slice 0 bounded legacy drive verbatim. */
  bands: IS_BROWSER,
  /** Region volumes: crossfade begun before the Voronoi boundary rather than switched at it. */
  regionVolumes: IS_BROWSER,
};

/** Read at CALL TIME, never cached at init — a cached flag cannot be opted into by a test. */
export function velocityLanguageFlag(name) {
  return VELOCITY_LANGUAGE_FLAGS[name] === true;
}

// ---------------------------------------------------------------------------------------------
// band thresholds and ceilings
// ---------------------------------------------------------------------------------------------

/** Band edges as multiples of the hull's governed combat speed. Straight from the D7 table. */
export const VL_BAND1_AT = 1.0;   // above this: sparse motes begin
export const VL_BAND2_AT = 2.0;   // above this: streaks thin out, the world takes over
export const VL_BAND3_AT = 5.0;   // above this: streaks fade out, the field takes over

export const VELOCITY_BAND = Object.freeze({
  LOCAL: 0,     // combat / local — silent
  MODERATE: 1,  // moderate travel — motes
  HIGH: 2,      // high travel / burn — world streaming
  EXTREME: 3,   // extreme — field behaviour
});

/**
 * Where the band-3 taper finishes. Above this the record is constant: the language has said
 * everything it has to say and further speed is the INSTRUMENTS' story, not the particles'.
 */
export const VL_TAPER_END = 10.0;

// Ceilings, exported so the probe asserts against these names rather than its own copies of the
// numbers — a loosened ceiling cannot pass by silently agreeing with a stale literal in the check.
export const VL_COUNT_MAX = 24;          // streaks — the D7 band-1 cap, and the global maximum
export const VL_ALPHA_MAX = 0.20;        // overlay opacity — the D7 band-1 cap, and the global maximum
export const VL_LEN_SCALE_MAX = 1.15;    // × screen-height tail length; band 2 reaches it and STOPS
export const VL_GRAIN_MAX = 0.04;        // full-screen directional grain opacity (D7's "~4%")
export const VL_PARALLAX_GAIN_MAX = 1.0; // extra background streaming, as a multiple of natural rate
export const VL_CAMERA_LEAD_WU_MAX = 6;  // "a few WU of camera lead along the velocity vector"
export const VL_SMEAR_MAX = 1.0;         // along-flow smear on bright background points, normalized
export const VL_FLOW_MAX = 1400;         // screen-px/s; well under the legacy 2600 — quiet is the point

/** Band-3 streak floor. Not zero: two motes at 3% alpha read as "almost nothing", which is the
 *  physical truth being modelled, whereas exactly zero reads as a bug in the overlay. */
export const VL_BAND3_COUNT_FLOOR = 2;

/**
 * Boost bias, in units of effective speed ratio. Boost is a player ACTION and needs feedback, but
 * D7's table is keyed on speed alone and Band 0 says NOTHING at combat speed. Forcing full intensity
 * on boost (which is what the legacy drive did) reintroduces the cartoon at exactly the moment the
 * player is dogfighting. A small bias instead: boosting at combat speed lands mid-band-1, i.e. a
 * whisper of dust. The band language stays monotone in speed, which is what keeps it legible.
 */
export const VL_BOOST_BIAS = 0.6;

// motionReduce factors, one per channel. Separate factors rather than one folded scale so a future
// channel cannot inherit a wrong reduction by accident, and so the intent of each is readable.
const MR_COUNT = 0.5;
const MR_ALPHA = 0.45;
const MR_GRAIN = 0.4;
const MR_PARALLAX = 0.5;
const MR_SMEAR = 0.5;
const MR_FLOW = 0.6;

/**
 * The band-1 palette: desaturated warm-white with the faintest teal, per D7. Deliberately NOT white
 * — the head stop is #e6ded0-ish, a paper warm, and the tail carries a cool teal cast so the mote
 * reads as lit dust rather than as an emitter. These are plain RGB triples; the caller composes
 * alpha, because alpha is the thing the bands modulate.
 */
export const VL_COLOR = Object.freeze({
  /** Streak head — warm, slightly off-white. */
  head: Object.freeze({ r: 230, g: 222, b: 206 }),
  /** Streak body — the faintest teal, the Surveyor's Table restrained accent. */
  body: Object.freeze({ r: 168, g: 196, b: 196 }),
  /** Full-screen grain — warm grey, never a bright. */
  grain: Object.freeze({ r: 214, g: 206, b: 192 }),
});

/** Compositing is NORMAL in every band. Additive is the cartoon idiom this packet removes. */
export const VL_COMPOSITE = 'source-over';

// ---------------------------------------------------------------------------------------------
// numeric helpers
// ---------------------------------------------------------------------------------------------

const clamp01 = (x) => (Number.isFinite(x) ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0);

/**
 * Clamped linear segment. Callers guarantee `x` is finite (entry points screen for that), so this
 * does not re-screen; it only clamps the progress into the segment. Continuous by construction at
 * both ends, which is what keeps the band seams from stepping.
 */
function seg(x, x0, x1, y0, y1) {
  if (!(x1 > x0)) return y1;
  const t = clamp01((x - x0) / (x1 - x0));
  return y0 + (y1 - y0) * t;
}

/** Smoothstep, for channels where a linear ramp would read as a mechanical wipe. */
function smooth(t) {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

// ---------------------------------------------------------------------------------------------
// the band drive
// ---------------------------------------------------------------------------------------------

/** The silent record. Band 0, and the answer to every non-finite input. */
function silentRecord(speedRatio, effectiveRatio) {
  return {
    schema: 'velocity_language_v1',
    speedRatio: Number.isFinite(speedRatio) ? speedRatio : 0,
    effectiveRatio: Number.isFinite(effectiveRatio) ? effectiveRatio : 0,
    band: VELOCITY_BAND.LOCAL,
    // particles
    count: 0,
    targetOpacity: 0,
    maxAlpha: 0,
    lenScale: 0,
    flowSpeed: 0,
    widthScale: 0,
    composite: VL_COMPOSITE,
    // world
    parallaxGain: 0,
    smear: 0,
    // field
    grain: 0,
    // camera (published for the camera lane; this module never applies it)
    cameraLeadWU: 0,
    shakeScale: 1,
  };
}

/**
 * Resolve which band an effective speed ratio falls in. Exported because the band INDEX is the thing
 * checks and HUD copy want to talk about, and re-deriving it from thresholds at three call sites is
 * how two of them end up off by an epsilon.
 */
export function resolveVelocityBand(effectiveRatio) {
  if (!Number.isFinite(effectiveRatio)) return VELOCITY_BAND.LOCAL;
  if (effectiveRatio > VL_BAND3_AT) return VELOCITY_BAND.EXTREME;
  if (effectiveRatio > VL_BAND2_AT) return VELOCITY_BAND.HIGH;
  if (effectiveRatio > VL_BAND1_AT) return VELOCITY_BAND.MODERATE;
  return VELOCITY_BAND.LOCAL;
}

/**
 * The four-band velocity language. This is the whole redesign; everything else in the packet is
 * plumbing that reads this record.
 *
 * @param {number} speed     current planar speed, WU/s (unbounded, possibly non-finite)
 * @param {number} maxSpeed  the hull's governed COMBAT speed, WU/s — the 1x reference for the bands
 * @param {boolean} boosting
 * @param {boolean} motionReduce
 * @returns {object} a plain (unfrozen, allocation-per-call) record; see silentRecord for the shape
 */
export function velocityBandDrive(speed, maxSpeed, boosting, motionReduce) {
  const maxSpd = Math.max(1, Number.isFinite(maxSpeed) ? maxSpeed : 1);
  // Screen at the entry point. A NaN or Infinity anywhere downstream would otherwise clamp to the
  // WRONG end on the descending ramps (count and alpha both fall with speed above band 2), so the
  // overlay would fail bright at exactly the moment the physics went wrong.
  if (!Number.isFinite(speed) || !Number.isFinite(maxSpeed)) return silentRecord(0, 0);

  const speedRatio = Math.max(0, speed) / maxSpd;
  const r = speedRatio + (boosting ? VL_BOOST_BIAS : 0);
  if (!Number.isFinite(r)) return silentRecord(speedRatio, 0);

  if (r <= VL_BAND1_AT) {
    // Band 0. Nothing at all — and this is a hard return, not a ramp that happens to reach zero, so
    // no future edit can leak a stray mote into the combat readout.
    return silentRecord(speedRatio, r);
  }

  const band = resolveVelocityBand(r);
  const rec = silentRecord(speedRatio, r);
  rec.band = band;

  if (band === VELOCITY_BAND.MODERATE) {
    // 1 -> 2x. Motes fade UP from nothing. Short, thin, sparse.
    rec.count = Math.round(seg(r, VL_BAND1_AT, VL_BAND2_AT, 0, VL_COUNT_MAX));
    rec.targetOpacity = seg(r, VL_BAND1_AT, VL_BAND2_AT, 0, VL_ALPHA_MAX);
    // Length ramps from ZERO, not from a comfortable minimum. Starting band 1 at a finite length
    // makes the record STEP at the ratio-1 seam, and a stepping channel is the "cheap" tell the
    // redesign exists to remove — motes must grow out of nothing as speed builds, the same way
    // their alpha does. (The continuity pin in check-speed-lines.mjs caught this.)
    rec.lenScale = seg(r, VL_BAND1_AT, VL_BAND2_AT, 0, 0.60);
    rec.widthScale = seg(r, VL_BAND1_AT, VL_BAND2_AT, 0.55, 0.75);
    rec.parallaxGain = 0;
    rec.smear = 0;
  } else if (band === VELOCITY_BAND.HIGH) {
    // 2 -> 5x. THE VOCABULARY CHANGES, THE INTENSITY DOES NOT. Streaks get FEWER (24 -> 8) and only
    // slightly longer (0.60 -> 1.15, where they STOP), while the load-bearing cue migrates to the
    // world: parallaxGain and smear ramp from nothing to full across this band.
    rec.count = Math.round(seg(r, VL_BAND2_AT, VL_BAND3_AT, VL_COUNT_MAX, 8));
    rec.targetOpacity = seg(r, VL_BAND2_AT, VL_BAND3_AT, VL_ALPHA_MAX, 0.16);
    rec.lenScale = seg(r, VL_BAND2_AT, VL_BAND3_AT, 0.60, VL_LEN_SCALE_MAX);
    rec.widthScale = seg(r, VL_BAND2_AT, VL_BAND3_AT, 0.75, 0.70);
    rec.parallaxGain = VL_PARALLAX_GAIN_MAX * smooth((r - VL_BAND2_AT) / (VL_BAND3_AT - VL_BAND2_AT));
    rec.smear = VL_SMEAR_MAX * smooth((r - VL_BAND2_AT) / (VL_BAND3_AT - VL_BAND2_AT));
  } else {
    // > 5x. The inversion. Streaks collapse toward the floor and their alpha all but vanishes; the
    // world keeps streaming at full gain and the FIELD takes over — uniform directional grain, a few
    // WU of camera lead, and REDUCED shake (shakeScale < 1: at extreme velocity the camera gets
    // calmer, not busier, because smoothness is what reads as terrifying speed).
    rec.count = Math.round(seg(r, VL_BAND3_AT, VL_TAPER_END, 8, VL_BAND3_COUNT_FLOOR));
    rec.targetOpacity = seg(r, VL_BAND3_AT, VL_TAPER_END, 0.16, 0.03);
    rec.lenScale = VL_LEN_SCALE_MAX;
    rec.widthScale = 0.7;
    rec.parallaxGain = VL_PARALLAX_GAIN_MAX;
    rec.smear = VL_SMEAR_MAX;
    rec.grain = VL_GRAIN_MAX * smooth((r - VL_BAND3_AT) / (VL_TAPER_END - VL_BAND3_AT));
    rec.cameraLeadWU = seg(r, VL_BAND3_AT, VL_TAPER_END, 0, VL_CAMERA_LEAD_WU_MAX);
    rec.shakeScale = seg(r, VL_BAND3_AT, VL_TAPER_END, 1, 0.55);
  }

  // Flow is how fast a mote crosses the screen. It rises with speed but saturates well below the
  // legacy ceiling: past saturation every streak recycles each frame and the field degenerates into
  // a strobe, which is the loudest possible way to say "fast" and the least convincing.
  rec.flowSpeed = seg(r, VL_BAND1_AT, VL_TAPER_END, 180, VL_FLOW_MAX);

  // motionReduce, applied ONCE over the finished record. Every channel that moves the vestibular
  // system is reduced; `shakeScale` is left alone because it is already a REDUCTION and pushing it
  // further would fight the camera lane's own motionReduce handling.
  if (motionReduce) {
    rec.count = Math.round(rec.count * MR_COUNT);
    rec.targetOpacity *= MR_ALPHA;
    rec.grain *= MR_GRAIN;
    rec.parallaxGain *= MR_PARALLAX;
    rec.smear *= MR_SMEAR;
    rec.flowSpeed *= MR_FLOW;
    rec.cameraLeadWU = 0;
  }

  // Final ceilings. Belt and braces: every ramp above is already bounded by its own segment, so a
  // ceiling that BINDS here is a bug in a segment, not a safety net doing its job.
  rec.count = Math.max(0, Math.min(VL_COUNT_MAX, rec.count));
  rec.targetOpacity = Math.min(VL_ALPHA_MAX, Math.max(0, rec.targetOpacity));
  rec.lenScale = Math.min(VL_LEN_SCALE_MAX, Math.max(0, rec.lenScale));
  rec.flowSpeed = Math.min(VL_FLOW_MAX, Math.max(0, rec.flowSpeed));
  rec.grain = Math.min(VL_GRAIN_MAX, Math.max(0, rec.grain));
  rec.parallaxGain = Math.min(VL_PARALLAX_GAIN_MAX, Math.max(0, rec.parallaxGain));
  rec.smear = Math.min(VL_SMEAR_MAX, Math.max(0, rec.smear));
  rec.cameraLeadWU = Math.min(VL_CAMERA_LEAD_WU_MAX, Math.max(0, rec.cameraLeadWU));
  rec.maxAlpha = rec.targetOpacity;

  return rec;
}

// ---------------------------------------------------------------------------------------------
// region volumes
// ---------------------------------------------------------------------------------------------

/**
 * Half-width of the region crossfade, in WU. D7: "begin crossfading background and ambient ~1500 WU
 * BEFORE the Voronoi sector boundary." That entry point is exact here — the blend leaves 0 at
 * precisely 1500 WU out.
 */
export const REGION_CROSSFADE_WU = 1500;

/**
 * Crossfade progress toward the neighbouring region, from a GLOBAL position.
 *
 * WHY THIS IS SIGNED-BISECTOR AND NOT "FADE TOWARD THE NEAREST OTHER CELL".
 * The obvious formulation — blend toward the nearest other sector, reaching 100% at the boundary —
 * SNAPS BACKWARD the instant you cross. `sectorMembershipAtGlobal` flips home and other at the
 * bisector, so one frame after entering the new region the sector you just LEFT is the nearest
 * "other", and a blend defined relative to membership jumps straight back to full old-palette. That
 * palette pop is precisely the cheap artifact this packet exists to remove, and it is invisible to
 * any test that samples a single side of the boundary.
 *
 * The fix is to define the blend on the SIGNED distance to the bisector, which is antisymmetric
 * about the boundary and therefore continuous through it:
 *
 *     signedWU = (dOther^2 - dHome^2) / (2 * |AB|)      // > 0 inside home, 0 on the boundary
 *     t        = clamp01(0.5 - signedWU / (2 * REGION_CROSSFADE_WU))
 *
 * At 1500 WU before the boundary t = 0 (pure home). At the boundary t = 0.5. At 1500 WU past it
 * t = 1 (pure neighbour). Crossing swaps home/other, which negates signedWU AND swaps the two
 * palettes being blended — the two inversions cancel exactly, so the composed colour is continuous.
 *
 * DEVIATION FROM D7, STATED PLAINLY: the ADR says the crossfade should "complete at" the boundary.
 * Completing at the boundary is provably incompatible with continuity under a membership-relative
 * blend — t would have to be 1 on both sides of a line where the endpoints swap, which is a jump
 * from full-neighbour to full-home. The alternative (orienting the fade by travel direction)
 * flickers whenever the player strafes along a boundary. This implementation keeps D7's stated
 * ENTRY point exactly (1500 WU before) and treats the boundary as the committed 50/50 midpoint,
 * completing 1500 WU beyond. Regions still read as volumes you approach, enter, cross and leave,
 * which is the requirement the ADR was expressing.
 *
 * @param {{x:number,z:number}} globalPos GLOBAL position (`global_v1`) — NEVER a render-frame or
 *   sector-local position. The render frame is rebased every 8192 WU, so feeding it here would make
 *   the region blend jump at every rebase.
 * @param {{candidates?:ReadonlyArray<string>, crossfadeWU?:number}} [options]
 */
export function resolveRegionCrossfade(globalPos, options = {}) {
  const px = globalPos && Number.isFinite(globalPos.x) ? globalPos.x : 0;
  const pz = globalPos && Number.isFinite(globalPos.z) ? globalPos.z : 0;
  const halfWidth = Number.isFinite(options.crossfadeWU) && options.crossfadeWU > 0
    ? options.crossfadeWU
    : REGION_CROSSFADE_WU;
  const candidates = Array.isArray(options.candidates) && options.candidates.length
    ? options.candidates
    : CORRIDOR_SECTOR_IDS;

  const idle = {
    schema: 'region_crossfade_v1',
    sectorId: null,
    nextSectorId: null,
    blend: 0,
    signedBoundaryWU: Infinity,
    crossfadeWU: halfWidth,
    approaching: false,
  };

  // Membership comes from the SHIPPED Voronoi resolver, not a local re-derivation, so this cannot
  // drift from the world/residency systems or from deepSpaceAddress — three components disagreeing
  // about which cell the player is in is a worse bug than any palette artifact.
  const homeId = sectorMembershipAtGlobal({ x: px, z: pz }, candidates);
  if (!homeId) return idle;

  const home = sectorGlobalOrigin(homeId);
  if (!home || !Number.isFinite(home.x) || !Number.isFinite(home.z)) return idle;

  // Nearest OTHER origin. Tie-broken by id, matching sectorMembershipAtGlobal's own tiebreak — if
  // the two disagreed, a player on a three-cell corner would blend toward a region the addressing
  // layer says they are nowhere near.
  const dHomeSq = (px - home.x) ** 2 + (pz - home.z) ** 2;
  let otherId = null;
  let otherOrigin = null;
  let bestSq = Infinity;
  for (const id of candidates) {
    if (typeof id !== 'string' || !id || id === homeId) continue;
    const o = sectorGlobalOrigin(id);
    if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.z)) continue;
    const dSq = (px - o.x) ** 2 + (pz - o.z) ** 2;
    if (dSq < bestSq || (dSq === bestSq && otherId !== null && id < otherId)) {
      bestSq = dSq;
      otherId = id;
      otherOrigin = o;
    }
  }
  if (!otherId || !otherOrigin) {
    return { ...idle, sectorId: homeId };
  }

  const abx = otherOrigin.x - home.x;
  const abz = otherOrigin.z - home.z;
  const abLen = Math.sqrt(abx * abx + abz * abz);
  if (!(abLen > 0)) {
    // Two distinct ids authored at one origin. Degenerate — report home, never divide by it.
    return { ...idle, sectorId: homeId, nextSectorId: otherId };
  }

  const signedBoundaryWU = (bestSq - dHomeSq) / (2 * abLen);
  if (!Number.isFinite(signedBoundaryWU)) return { ...idle, sectorId: homeId, nextSectorId: otherId };

  const blend = clamp01(0.5 - signedBoundaryWU / (2 * halfWidth));

  return {
    schema: 'region_crossfade_v1',
    sectorId: homeId,
    nextSectorId: otherId,
    /** 0 = wholly this region, 0.5 = on the boundary, 1 = wholly the neighbour. */
    blend,
    /** Perpendicular distance to the Voronoi bisector; positive inside `sectorId`. */
    signedBoundaryWU,
    crossfadeWU: halfWidth,
    approaching: blend > 0,
  };
}

// ---------------------------------------------------------------------------------------------
// the shared record
// ---------------------------------------------------------------------------------------------

/**
 * Publish the frame's velocity language on a lazily-created `state.render.velocityLanguage` subtree.
 *
 * ONE PRODUCER, MANY READERS. `src/core/gameState.js` is under concurrency quarantine, so this
 * subtree is created at runtime rather than declared in the initial state literal — the shipped
 * idiom (`state.massline2`, `state.player.masslineTelemetry`). The alternative, each consumer
 * deriving its own band from speed, guarantees eventual drift between what the streaks say and what
 * the background says, which is the one failure this record exists to prevent.
 *
 * Consumers read a record that is at most one frame old (the render system ticks before `feel` in
 * UPDATE_ORDER). For a purely visual signal that is imperceptible, and it is far cheaper than
 * reordering systems to chase it.
 */
export function publishVelocityLanguage(state, drive, region) {
  if (!state) return null;
  if (!state.render) state.render = {};
  let node = state.render.velocityLanguage;
  if (!node) {
    node = { schema: 'velocity_language_v1', drive: null, region: null, frame: 0 };
    state.render.velocityLanguage = node;
  }
  node.drive = drive || null;
  node.region = region || null;
  node.frame = (node.frame || 0) + 1;
  return node;
}

/** Read the published record, or null. Never derives — a reader that derives is a second producer. */
export function readVelocityLanguage(state) {
  return (state && state.render && state.render.velocityLanguage) || null;
}
