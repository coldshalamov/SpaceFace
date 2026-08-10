// Velocity language — owner-directed luminous wake (VISION.md "long velocity trails").
//
// ADR D7's restraint policy was explicitly overturned in design/program/VISION_ALIGNMENT_PLAN.md.
// The ordinary route now grows a continuous, colorful wake from fast local flight through cruise:
// longer paths, brighter filament heads, and increasing field flow. This is still bounded — the
// original unbounded drive could produce hundreds of opaque additive lines — but the bounds are
// safety rails, not the aesthetic. `screen` compositing preserves luminous overlap without the old
// runaway white sum, and the renderer layers a colored sheath around a narrow hot filament.
//
// Every ramp remains continuous across its band seams. No radial/peripheral vignette is introduced,
// and `motionReduce` scales every moving channel in one final pass. The progression is now:
//
//   LOCAL     0.45-1x   first long wakes appear during ordinary fast flight;
//   MODERATE  1-2x      wake density, length and color energy build together;
//   HIGH      2-5x      long wakes combine with world parallax/smear;
//   EXTREME   >5x       the wake remains present while field grain and camera lead join it.
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

/** Retained continuous band edges as multiples of the hull's governed combat speed. */
export const VL_BAND1_AT = 1.0;   // above this: moderate travel wake
export const VL_BAND2_AT = 2.0;   // above this: parallax/smear join the wake
export const VL_BAND3_AT = 5.0;   // above this: field behavior joins the fully-developed wake
export const VL_WAKE_AT = 0.45;    // ordinary-route wake begins below governed top speed

export const VELOCITY_BAND = Object.freeze({
  LOCAL: 0,     // precision motion, then ordinary-route wake
  MODERATE: 1,  // moderate travel — luminous wake
  HIGH: 2,      // high travel / burn — wake + world streaming
  EXTREME: 3,   // extreme — wake + field behaviour
});

/**
 * Where the extreme-band ramp finishes. Above this the record stays at its bounded full-wake
 * values while instruments continue to report further physical speed.
 */
export const VL_TAPER_END = 10.0;

// Ceilings, exported so the probe asserts against these names rather than its own copies of the
// numbers — a loosened ceiling cannot pass by silently agreeing with a stale literal in the check.
// Count stays at the shared-canvas streak ceiling (SL_STREAK_MAX = 46). Length and light energy
// are the free variables of the D7 overturn — not an unbounded filament count.
export const VL_COUNT_MAX = 46;          // bounded luminous filaments, not legacy 200+ runaway lines
export const VL_ALPHA_MAX = 0.48;        // screen-composited field opacity (D7 0.20 cap overturned)
export const VL_LEN_SCALE_MAX = 5.8;     // long liquid screen-space wakes; feel owns the viewport cap
export const VL_GRAIN_MAX = 0.04;        // subtle full-screen directional grain
export const VL_PARALLAX_GAIN_MAX = 1.0; // extra background streaming, as a multiple of natural rate
export const VL_CAMERA_LEAD_WU_MAX = 6;  // "a few WU of camera lead along the velocity vector"
export const VL_SMEAR_MAX = 1.0;         // along-flow smear on bright background points, normalized
export const VL_FLOW_MAX = 2000;         // screen-px/s, saturated below one-recycle-per-frame strobe

/** Density reached at the extreme-band entry; it grows to VL_COUNT_MAX rather than fading out. */
export const VL_BAND3_COUNT_FLOOR = 40;

/**
 * BOOST DOES NOT BIAS THE BANDS. Recorded as a constant rather than deleted because the tempting
 * mistake is specific and worth naming.
 *
 * The legacy drive forced `intensity = 1` whenever boost was held, at any speed. An early draft of
 * this module replaced that with a "small" +0.6 bias on the effective ratio. That made the same
 * physical speed render differently depending on an input bit and introduced a visible band jump.
 *
 * The bands are keyed on SPEED alone. Boost earns its language by accelerating you
 * across the band edges, which it does within a second. The moment of ignition is already carried by
 * `BOOST_FOV_PUNCH` and `BOOST_TRAUMA` in feel.js — camera response, not particles, which is the
 * complementary ignition beat. `boosting` is still accepted by the drive so the seam signature
 * matches the legacy branch, and is deliberately unused.
 */
export const VL_BOOST_BIAS = 0;

/** Speed ratio where the bounded physics-earned presentation scalar reaches one. */
export const VL_EXCEPTIONAL_SPEED_RATIO_MAX = 3;

// motionReduce factors, one per channel. Separate factors rather than one folded scale so a future
// channel cannot inherit a wrong reduction by accident, and so the intent of each is readable.
const MR_COUNT = 0.35;
const MR_ALPHA = 0.38;
const MR_LENGTH = 0.52;
const MR_GRAIN = 0.4;
const MR_PARALLAX = 0.5;
const MR_SMEAR = 0.5;
const MR_FLOW = 0.6;

/**
 * Luminous wake palette. The colored sheath stays saturated while the narrow head approaches a
 * warm white-hot value; these are plain RGB triples because the caller composes alpha.
 */
export const VL_COLOR = Object.freeze({
  /** White-hot filament head, kept slightly warm so it retains color under bloom. */
  head: Object.freeze({ r: 248, g: 251, b: 238 }),
  /** Saturated ion-cyan sheath — arcade-industrial energy against black space. */
  body: Object.freeze({ r: 58, g: 205, b: 255 }),
  /** Full-screen grain stays cooler/dimmer than the authored wake. */
  grain: Object.freeze({ r: 148, g: 205, b: 222 }),
});

/** Screen gives luminous overlap without unbounded additive accumulation. */
export const VL_COMPOSITE = 'screen';

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

/**
 * Presentation-only intensity for speed earned from the live flight governor.
 * Boost is deliberately absent: only exact physics provenance may open this channel.
 */
export function resolveExceptionalSpeed(speed, maxSpeed, physicsEarned = false) {
  if (physicsEarned !== true) return 0;
  if (!Number.isFinite(speed) || !Number.isFinite(maxSpeed) || !(maxSpeed > 0)) return 0;
  const ratio = Math.max(0, speed) / maxSpeed;
  if (!(ratio > 1)) return 0;
  return smooth((ratio - 1) / (VL_EXCEPTIONAL_SPEED_RATIO_MAX - 1));
}

// ---------------------------------------------------------------------------------------------
// the band drive
// ---------------------------------------------------------------------------------------------

/** The silent record. Band 0, and the answer to every non-finite input. */
function silentRecord(speedRatio, effectiveRatio, out = null) {
  const rec = out || {};
  rec.schema = 'velocity_language_v1';
  rec.speedRatio = Number.isFinite(speedRatio) ? speedRatio : 0;
  rec.effectiveRatio = Number.isFinite(effectiveRatio) ? effectiveRatio : 0;
  rec.band = VELOCITY_BAND.LOCAL;
    // particles
  rec.count = 0;
  rec.targetOpacity = 0;
  rec.maxAlpha = 0;
  rec.lenScale = 0;
  rec.flowSpeed = 0;
  rec.widthScale = 0;
  rec.composite = VL_COMPOSITE;
    // world
  rec.parallaxGain = 0;
  rec.smear = 0;
    // field
  rec.grain = 0;
    // camera (published for the camera lane; this module never applies it)
  rec.cameraLeadWU = 0;
  rec.shakeScale = 1;
  rec.exceptionalSpeed = 0;
  return rec;
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
 * @param {boolean} physicsEarned
 * @param {object|null} [out] caller-owned record; omitted calls retain the allocating public API
 * @returns {object} the complete drive record; see silentRecord for the shape
 */
export function velocityBandDrive(
  speed,
  maxSpeed,
  boosting,
  motionReduce,
  physicsEarned = false,
  out = null,
) {
  const maxSpd = Math.max(1, Number.isFinite(maxSpeed) ? maxSpeed : 1);
  // Screen at the entry point. A NaN or Infinity anywhere downstream would otherwise clamp to the
  // WRONG end on the descending ramps (count and alpha both fall with speed above band 2), so the
  // overlay would fail bright at exactly the moment the physics went wrong.
  if (!Number.isFinite(speed) || !Number.isFinite(maxSpeed)) return silentRecord(0, 0, out);

  const speedRatio = Math.max(0, speed) / maxSpd;
  // VL_BOOST_BIAS is 0 — see its doc comment. Boost must NOT manufacture particles below 1x.
  const r = speedRatio + (boosting ? VL_BOOST_BIAS : 0);
  if (!Number.isFinite(r)) return silentRecord(speedRatio, 0, out);

  if (r <= VL_WAKE_AT) {
    // Docking/slow maneuvering stays quiet. The ordinary-route wake begins only once the ship is
    // visibly crossing the play space, below governed top speed but above precision combat motion.
    return silentRecord(speedRatio, r, out);
  }

  const band = resolveVelocityBand(r);
  const rec = silentRecord(speedRatio, r, out);
  rec.band = band;

  if (band === VELOCITY_BAND.LOCAL) {
    const t = smooth((r - VL_WAKE_AT) / (VL_BAND1_AT - VL_WAKE_AT));
    rec.count = Math.round(16 * t);
    rec.targetOpacity = 0.16 * t;
    rec.lenScale = 1.15 * t;
    rec.widthScale = seg(t, 0, 1, 0.38, 0.78);
    rec.parallaxGain = 0;
    rec.smear = 0;
  } else if (band === VELOCITY_BAND.MODERATE) {
    // 1 -> 2x. The ordinary wake becomes a long, liquid filament family.
    rec.count = Math.round(seg(r, VL_BAND1_AT, VL_BAND2_AT, 16, 30));
    rec.targetOpacity = seg(r, VL_BAND1_AT, VL_BAND2_AT, 0.16, 0.32);
    rec.lenScale = seg(r, VL_BAND1_AT, VL_BAND2_AT, 1.15, 2.6);
    rec.widthScale = seg(r, VL_BAND1_AT, VL_BAND2_AT, 0.78, 1.08);
    rec.parallaxGain = 0;
    rec.smear = 0;
  } else if (band === VELOCITY_BAND.HIGH) {
    // 2 -> 5x. Long liquid wakes remain load-bearing while the world joins through parallax/smear.
    rec.count = Math.round(seg(r, VL_BAND2_AT, VL_BAND3_AT, 30, VL_BAND3_COUNT_FLOOR));
    rec.targetOpacity = seg(r, VL_BAND2_AT, VL_BAND3_AT, 0.32, 0.40);
    rec.lenScale = seg(r, VL_BAND2_AT, VL_BAND3_AT, 2.6, 4.4);
    rec.widthScale = seg(r, VL_BAND2_AT, VL_BAND3_AT, 1.08, 1.22);
    rec.parallaxGain = VL_PARALLAX_GAIN_MAX * smooth((r - VL_BAND2_AT) / (VL_BAND3_AT - VL_BAND2_AT));
    rec.smear = VL_SMEAR_MAX * smooth((r - VL_BAND2_AT) / (VL_BAND3_AT - VL_BAND2_AT));
  } else {
    // > 5x. The luminous wake reaches full extension rather than disappearing. Field grain, camera
    // lead and calmer shake join it, so extreme speed has layers instead of one louder scalar.
    rec.count = Math.round(seg(r, VL_BAND3_AT, VL_TAPER_END, VL_BAND3_COUNT_FLOOR, VL_COUNT_MAX));
    rec.targetOpacity = seg(r, VL_BAND3_AT, VL_TAPER_END, 0.40, VL_ALPHA_MAX);
    rec.lenScale = seg(r, VL_BAND3_AT, VL_TAPER_END, 4.4, VL_LEN_SCALE_MAX);
    rec.widthScale = seg(r, VL_BAND3_AT, VL_TAPER_END, 1.22, 1.34);
    rec.parallaxGain = VL_PARALLAX_GAIN_MAX;
    rec.smear = VL_SMEAR_MAX;
    rec.grain = VL_GRAIN_MAX * smooth((r - VL_BAND3_AT) / (VL_TAPER_END - VL_BAND3_AT));
    rec.cameraLeadWU = seg(r, VL_BAND3_AT, VL_TAPER_END, 0, VL_CAMERA_LEAD_WU_MAX);
    rec.shakeScale = seg(r, VL_BAND3_AT, VL_TAPER_END, 1, 0.55);
  }

  // Flow rises from the first ordinary-route wake but saturates below the recycle-every-frame strobe.
  rec.flowSpeed = seg(r, VL_WAKE_AT, VL_TAPER_END, 140, VL_FLOW_MAX);

  // motionReduce, applied ONCE over the finished record. Every channel that moves the vestibular
  // system is reduced; `shakeScale` is left alone because it is already a REDUCTION and pushing it
  // further would fight the camera lane's own motionReduce handling.
  if (motionReduce) {
    rec.count = Math.round(rec.count * MR_COUNT);
    rec.targetOpacity *= MR_ALPHA;
    rec.lenScale *= MR_LENGTH;
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
  rec.exceptionalSpeed = motionReduce
    ? 0
    : resolveExceptionalSpeed(speed, maxSpeed, physicsEarned);

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
 * @param {{candidates?:ReadonlyArray<string>, crossfadeWU?:number}|null} [options]
 * @param {object|null} [out] caller-owned record; omitted calls retain the allocating public API
 */
export function resolveRegionCrossfade(globalPos, options = null, out = null) {
  const px = globalPos && Number.isFinite(globalPos.x) ? globalPos.x : 0;
  const pz = globalPos && Number.isFinite(globalPos.z) ? globalPos.z : 0;
  const halfWidth = Number.isFinite(options && options.crossfadeWU) && options.crossfadeWU > 0
    ? options.crossfadeWU
    : REGION_CROSSFADE_WU;
  const candidates = Array.isArray(options && options.candidates) && options.candidates.length
    ? options.candidates
    : CORRIDOR_SECTOR_IDS;

  const rec = out || {};
  rec.schema = 'region_crossfade_v1';
  rec.sectorId = null;
  rec.nextSectorId = null;
  rec.blend = 0;
  rec.signedBoundaryWU = Infinity;
  rec.crossfadeWU = halfWidth;
  rec.approaching = false;

  // Membership comes from the SHIPPED Voronoi resolver, not a local re-derivation, so this cannot
  // drift from the world/residency systems or from deepSpaceAddress — three components disagreeing
  // about which cell the player is in is a worse bug than any palette artifact.
  const homeId = sectorMembershipAtGlobal(globalPos, candidates);
  if (!homeId) return rec;

  const home = sectorGlobalOrigin(homeId);
  if (!home || !Number.isFinite(home.x) || !Number.isFinite(home.z)) return rec;
  rec.sectorId = homeId;

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
    return rec;
  }
  rec.nextSectorId = otherId;

  const abx = otherOrigin.x - home.x;
  const abz = otherOrigin.z - home.z;
  const abLen = Math.sqrt(abx * abx + abz * abz);
  if (!(abLen > 0)) {
    // Two distinct ids authored at one origin. Degenerate — report home, never divide by it.
    return rec;
  }

  const signedBoundaryWU = (bestSq - dHomeSq) / (2 * abLen);
  if (!Number.isFinite(signedBoundaryWU)) return rec;

  const blend = clamp01(0.5 - signedBoundaryWU / (2 * halfWidth));
  /** 0 = wholly this region, 0.5 = on the boundary, 1 = wholly the neighbour. */
  rec.blend = blend;
  /** Perpendicular distance to the Voronoi bisector; positive inside `sectorId`. */
  rec.signedBoundaryWU = signedBoundaryWU;
  rec.approaching = blend > 0;
  return rec;
}

// ---------------------------------------------------------------------------------------------
// world streaming (the band-2 load-bearing cue)
// ---------------------------------------------------------------------------------------------

/**
 * Largest per-frame camera step the streaming accumulator will integrate.
 *
 * A frame rebase (`FRAME_REBASE_THRESHOLD_WU` = 8192) or a jump relocates the render frame wholesale,
 * producing a delta that is travel in arithmetic only. 500 WU sits two orders of magnitude clear of
 * both bounds: the absolute travel ceiling of 1200 WU/s displaces 20 WU per 1/60 s tick, and the
 * smallest relocation is 8192 WU. So the discriminator is never close to either side of its job.
 */
export const STREAM_MAX_STEP_WU = 500;

/** True when a per-frame camera delta is plausible travel rather than a frame relocation. */
export function isPlausibleCameraStep(dx, dz) {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
  return Math.abs(dx) <= STREAM_MAX_STEP_WU && Math.abs(dz) <= STREAM_MAX_STEP_WU;
}

/**
 * Advance one background layer's streaming phase by a frame of travel.
 *
 * THE POINT OF THIS FUNCTION IS THAT IT INTEGRATES. The background's natural parallax is a
 * CLOSED-FORM term, `camPos * par / tile` — an absolute position thousands of WU in magnitude. The
 * obvious way to make the world stream faster is to scale `par` by the gain, and it is wrong: the
 * offset would jump by `camPos * dPar / tile` the instant the gain moved. Measured at a
 * representative camera position that is a **0.387 UV snap**, i.e. the sky lurching a third of a
 * tile sideways at exactly the moment the player is going fastest. Integrating `gain * dCam` instead
 * is continuous by construction, and a gain returning to 0 simply stops the phase growing rather
 * than unwinding it. The same measurement puts the integrated path at 0.000267 UV per frame.
 *
 * Extracted as a pure function for the same reason `speedLineDrive` is: so the probe pins the math
 * the renderer actually runs, rather than a copy in the test that can silently drift from it.
 *
 * @param {number} prevPhase accumulated phase, in UV (wrapped to [-1, 1])
 * @param {number} deltaWU   this frame's camera travel along the axis, in WU
 * @param {number} par       the layer's parallax factor
 * @param {number} tile      the layer's tile size in world units
 * @param {number} gain      0..1 extra streaming, as a multiple of the natural rate
 * @returns {number} the new wrapped phase; always finite, and unchanged on any bad input
 */
export function streamPhaseStep(prevPhase, deltaWU, par, tile, gain) {
  const prev = Number.isFinite(prevPhase) ? prevPhase : 0;
  if (!(gain > 0)) return prev;
  if (!Number.isFinite(deltaWU) || !Number.isFinite(par) || !Number.isFinite(gain)) return prev;
  if (!Number.isFinite(tile) || tile === 0) return prev;
  const next = prev + deltaWU * par / tile * gain;
  if (!Number.isFinite(next)) return prev;
  return next % 1;
}

// ---------------------------------------------------------------------------------------------
// along-flow smear (the band-2 load-bearing cue, second half)
// ---------------------------------------------------------------------------------------------

/**
 * How far a bright background point is elongated along the flow axis at full `smear`.
 *
 * 3.4x is set by what the shape still READS as. Below ~2x the elongation is indistinguishable from
 * the point sprite's own soft halo, so the cue costs a uniform and buys nothing; above ~4x a star
 * becomes a line segment, which is the additive-streak vocabulary this packet exists to delete —
 * merely relocated from the overlay into the sky, where it would be worse because there are
 * thousands of them.
 */
export const VL_SMEAR_MAX_STRETCH = 3.4;

/**
 * The along-flow stretch factor for a `smear` value, and the alpha compensation that must accompany
 * it. Pure, and exported, for the same reason `velocityBandDrive` is: `scripts/check-speed-lines.mjs`
 * pins the math the shader actually runs rather than a copy in the test that can drift from it.
 *
 * ENERGY IS CONSERVED, AND THAT IS A HARD REQUIREMENT, NOT A REFINEMENT. The star and flare
 * materials both composite with `THREE.AdditiveBlending` — that is pre-existing shipped behaviour
 * this packet does not touch. Stretching an additive sprite without dimming it multiplies the light
 * the sky contributes by exactly `stretch`, so at band 2 the whole starfield would brighten 3.4x at
 * precisely the moment the player is going fastest. Dimming by `1/stretch` holds
 * the integrated energy of each point constant: the star spreads, it does not glow.
 *
 * @param {number} smear 0..1, already motionReduce-scaled by `velocityBandDrive`
 * @param {{stretch?:number, dim?:number}|null} [out] optional caller-owned result record
 * @returns {{stretch:number, dim:number}} `stretch` >= 1 along flow; `dim` = 1/stretch
 */
export function smearStretch(smear, out = null) {
  // Keep the public one-argument API allocating: scripts, tooling, and external callers may retain
  // its plain result record. The render loop supplies one owned record so normal flight does not
  // create another short-lived object every display frame.
  const result = out && typeof out === 'object' ? out : {};
  // Fail NEUTRAL, not dark and not bright: a non-finite smear yields no elongation and no dimming,
  // which is exactly the band-0/1 sky. Clamping to the far end would either wash the field out or
  // black it, and both are worse than simply not applying an optional cue.
  if (!Number.isFinite(smear) || smear <= 0) {
    result.stretch = 1;
    result.dim = 1;
    return result;
  }
  const s = smear > VL_SMEAR_MAX ? VL_SMEAR_MAX : smear;
  const stretch = 1 + s * (VL_SMEAR_MAX_STRETCH - 1);
  result.stretch = stretch;
  result.dim = 1 / stretch;
  return result;
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
    node = { schema: 'velocity_language_v1', ownerId: null, drive: null, region: null, frame: 0 };
    state.render.velocityLanguage = node;
  }
  node.ownerId = state.playerId ?? null;
  node.drive = drive || null;
  node.region = region || null;
  node.frame = (node.frame || 0) + 1;
  return node;
}

/** Read the published record, or null. Never derives — a reader that derives is a second producer. */
export function readVelocityLanguage(state) {
  return (state && state.render && state.render.velocityLanguage) || null;
}

/** Read the prior-frame exceptional scalar only when it belongs to the current player. */
export function readOwnedExceptionalSpeed(state) {
  const node = readVelocityLanguage(state);
  const playerId = state && state.playerId;
  if (playerId == null || !node || node.schema !== 'velocity_language_v1' || node.ownerId !== playerId) return 0;
  const value = node.drive && node.drive.exceptionalSpeed;
  return clamp01(value);
}
