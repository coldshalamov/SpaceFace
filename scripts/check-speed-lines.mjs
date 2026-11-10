#!/usr/bin/env node
// Bounding probe for the high-speed speed-line overlay (src/render/feel.js).
//
// The defect this pins: `intensity` was documented as a 0..1 drive but never clamped. It is
// speed/maxSpeed, and cruise/long-distance travel push that ratio well past 1 — ratio 10 produced
// intensity 15.5, opacity 4.65, 231 streaks, and a per-streak alpha of ~4.4 that saturated the
// 'lighter' composite to fully opaque white. The screen washed out at exactly the moment the player
// most needs to see where they are going.
//
// This probe imports the shipped drive function rather than replicating it, so it cannot drift from
// the code it guards. It asserts two different things at once:
//   1. HARD CEILINGS hold across absurd inputs (including Infinity and NaN) — nothing runs away.
//   2. ORDINARY GAMEPLAY IS UNCHANGED — the values at speedRatio 0.5 and 1.0 are pinned as literals
//      against the pre-fix formulas, so the bounding work cannot quietly restyle normal flight.
//
// LUMINOUS-WAKE ADDENDUM — the owner-directed replacement for ADR D7's restraint policy.
// Everything above pins the LEGACY branch, which is what `speedLineDrive` returns while the `bands`
// flag is off (its node default). The redesign is a different vocabulary, not a retune, so it gets
// its own section below rather than new literals in the old pins: those pins exist to prove the
// Slice 0 BOUNDING work never restyled ordinary flight, and rewriting them to match a deliberate
// restyle would destroy the evidence they carry.
//
// The live section pins ordinary-route onset, monotone length/light growth, screen compositing,
// layered field behavior, accessibility reduction, continuous seams, and fail-dark bad input.
import assert from 'node:assert/strict';
import {
  speedLineDrive,
  speedLineDriveLegacy,
  speedLineCenterGate,
  SL_STREAK_MAX,
  SL_OPACITY_MAX,
  SL_ALPHA_MAX,
  SL_LEN_SCALE_MAX,
  SL_FLOW_MAX,
} from '../src/render/feel.js';
import {
  VELOCITY_BAND,
  VELOCITY_LANGUAGE_FLAGS,
  VL_ALPHA_MAX,
  VL_BAND1_AT,
  VL_BAND2_AT,
  VL_BAND3_AT,
  VL_CAMERA_LEAD_WU_MAX,
  VL_COMPOSITE,
  VL_COUNT_MAX,
  VL_GRAIN_MAX,
  VL_EXCEPTIONAL_SPEED_RATIO_MAX,
  VL_LEN_SCALE_MAX,
  VL_PARALLAX_GAIN_MAX,
  VL_TAPER_END,
  VL_WAKE_AT,
  REGION_CROSSFADE_WU,
  isPlausibleCameraStep,
  resolveRegionCrossfade,
  resolveExceptionalSpeed,
  resolveVelocityBand,
  smearStretch,
  streamPhaseStep,
  velocityBandDrive,
  VL_SMEAR_MAX,
  VL_SMEAR_MAX_STRETCH,
} from '../src/render/velocityLanguage.js';

const MAX_SPEED = 150;   // a representative hull maxSpeed (propulsionCatalog: 150-168)
const BRIGHT_MAX = 0.95; // largest per-streak brightness `b` that _newStreak can roll (0.40 + 0.55)
const RATIOS = [0, 0.3, 0.38, 0.5, 1, 2, 5, 10, 25, 50, 100, 1000, Infinity, NaN];

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`ok    ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${label}\n      ${error?.message || error}`);
  }
}

// The ORIGINAL, unbounded formulas — kept here only so the before/after table reports real numbers
// instead of remembered ones. Never imported by the game.
function driveBefore(speed, maxSpeed, boosting, motionReduce) {
  const maxSpd = Math.max(1, maxSpeed || 1);
  const speedRatio = speed / maxSpd;
  let intensity = 0;
  let targetOpacity = 0;
  if (boosting) { targetOpacity = 0.55; intensity = 1; }
  else if (speedRatio > 0.38) { intensity = (speedRatio - 0.38) / 0.62; targetOpacity = intensity * 0.30; }
  if (motionReduce) { targetOpacity *= 0.45; intensity *= 0.55; }
  const baseFlow = 220 + speed * 1.2;
  const flowSpeed = baseFlow * (0.55 + 0.75 * intensity) * (boosting ? 1.55 : 1.0);
  const lenScale = (0.18 + 1.1 * speedRatio) * (boosting ? 1.15 : 1.0);
  const count = Math.round((boosting ? 46 : 28) * (0.50 + 0.50 * intensity));
  return { intensity, targetOpacity, count, lenScale, flowSpeed, maxAlpha: targetOpacity * BRIGHT_MAX };
}

const fmt = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(4)) : String(v));

// ---------------------------------------------------------------- ceilings hold everywhere
for (const boosting of [false, true]) {
  for (const motionReduce of [false, true]) {
    check(`ceilings hold (boost=${boosting} motionReduce=${motionReduce})`, () => {
      for (const ratio of RATIOS) {
        const speed = ratio * MAX_SPEED;
        const d = speedLineDrive(speed, MAX_SPEED, boosting, motionReduce);
        const where = `ratio=${ratio}`;

        for (const [key, value] of Object.entries(d)) {
          assert.ok(Number.isFinite(value), `${where}: ${key} must be finite, got ${value}`);
        }
        assert.ok(d.intensity >= 0 && d.intensity <= 1, `${where}: intensity ${d.intensity} outside [0,1]`);
        assert.ok(Number.isInteger(d.count), `${where}: count ${d.count} is not an integer`);
        assert.ok(d.count >= 0 && d.count <= SL_STREAK_MAX, `${where}: count ${d.count} > SL_STREAK_MAX ${SL_STREAK_MAX}`);
        assert.ok(d.targetOpacity <= SL_OPACITY_MAX, `${where}: targetOpacity ${d.targetOpacity} > SL_OPACITY_MAX`);
        assert.ok(d.maxAlpha <= SL_ALPHA_MAX, `${where}: maxAlpha ${d.maxAlpha} > SL_ALPHA_MAX`);
        assert.ok(d.maxAlpha < 1.0, `${where}: maxAlpha ${d.maxAlpha} reaches opaque — additive whiteout`);
        assert.ok(d.lenScale <= SL_LEN_SCALE_MAX, `${where}: lenScale ${d.lenScale} > SL_LEN_SCALE_MAX`);
        assert.ok(d.flowSpeed <= SL_FLOW_MAX, `${where}: flowSpeed ${d.flowSpeed} > SL_FLOW_MAX`);
      }
    });
  }
}

// ---------------------------------------------------------------- ordinary gameplay unchanged
// If any of these move, the bounding work has restyled normal flight and the change is not a fix.
const TOL = 1e-6;
function pin(label, actual, expected) {
  check(label, () => {
    assert.equal(actual.count, expected.count, `count ${actual.count} != ${expected.count}`);
    for (const key of ['intensity', 'targetOpacity', 'lenScale', 'maxAlpha', 'flowSpeed']) {
      assert.ok(Math.abs(actual[key] - expected[key]) < TOL,
        `${key} ${actual[key]} != ${expected[key]} (tol ${TOL})`);
    }
  });
}

pin('unchanged: cruise at speedRatio 0.5', speedLineDrive(0.5 * MAX_SPEED, MAX_SPEED, false, false), {
  intensity: 0.1935483870967742,
  targetOpacity: 0.058064516129032254,
  count: 17,
  lenScale: 0.73,
  flowSpeed: 215.5,
  maxAlpha: 0.05516129032258064,
});
pin('unchanged: top of ordinary range, speedRatio 1.0', speedLineDrive(MAX_SPEED, MAX_SPEED, false, false), {
  intensity: 1,
  targetOpacity: 0.3,
  count: 28,
  lenScale: 1.28,
  flowSpeed: 520,
  maxAlpha: 0.285,
});
pin('unchanged: boosting at speedRatio 1.0', speedLineDrive(MAX_SPEED, MAX_SPEED, true, false), {
  intensity: 1,
  targetOpacity: 0.55,
  count: 46,
  lenScale: 1.472,
  flowSpeed: 806,
  maxAlpha: 0.5225,
});

check('no ceiling binds on legitimate flight (boost at full speed)', () => {
  const boost = speedLineDrive(MAX_SPEED, MAX_SPEED, true, false);
  assert.equal(boost.count, SL_STREAK_MAX, 'boost count should reach the ceiling exactly, not be cut by it');
  assert.ok(boost.lenScale < SL_LEN_SCALE_MAX, `lenScale ceiling ${SL_LEN_SCALE_MAX} must not bind at ${boost.lenScale}`);
  assert.ok(boost.maxAlpha <= SL_ALPHA_MAX, `alpha ceiling must not cut the designed boost look`);
  assert.ok(boost.flowSpeed < SL_FLOW_MAX, `flow ceiling ${SL_FLOW_MAX} must not bind at ${boost.flowSpeed}`);
});

// ---------------------------------------------------------------- motion-reduce stays reduced
check('motionReduce stays strictly quieter than full motion at every speed', () => {
  for (const boosting of [false, true]) {
    for (const ratio of RATIOS) {
      const speed = ratio * MAX_SPEED;
      const full = speedLineDrive(speed, MAX_SPEED, boosting, false);
      const reduced = speedLineDrive(speed, MAX_SPEED, boosting, true);
      assert.ok(reduced.intensity <= full.intensity, `ratio=${ratio}: mr intensity ${reduced.intensity} > ${full.intensity}`);
      assert.ok(reduced.targetOpacity <= full.targetOpacity, `ratio=${ratio}: mr opacity rose`);
      assert.ok(reduced.count <= full.count, `ratio=${ratio}: mr streak count rose`);
      assert.ok(reduced.maxAlpha <= full.maxAlpha, `ratio=${ratio}: mr alpha rose`);
    }
  }
  // the historical 0.45 / 0.55 split, applied as two separate factors
  const mr = speedLineDrive(MAX_SPEED, MAX_SPEED, false, true);
  assert.ok(Math.abs(mr.targetOpacity - 0.3 * 0.45) < TOL, `mr opacity ${mr.targetOpacity} != 0.135`);
  assert.ok(Math.abs(mr.intensity - 0.55) < TOL, `mr intensity ${mr.intensity} != 0.55`);
});

// ---------------------------------------------------------------- degenerate inputs
check('degenerate maxSpeed / velocity inputs stay finite and silent', () => {
  for (const [speed, maxSpeed] of [[0, 0], [10, 0], [NaN, NaN], [Infinity, Infinity], [-50, 150], [1e12, 1]]) {
    const d = speedLineDrive(speed, maxSpeed, false, false);
    for (const [key, value] of Object.entries(d)) {
      assert.ok(Number.isFinite(value), `speed=${speed} maxSpeed=${maxSpeed}: ${key} = ${value}`);
    }
    assert.ok(d.maxAlpha <= SL_ALPHA_MAX && d.count <= SL_STREAK_MAX,
      `speed=${speed} maxSpeed=${maxSpeed}: ceilings breached`);
  }
});

// ---------------------------------------------------------------- centre exclusion
// The ship, reticle and tracked destination must stay legible at every speed.
const CLEAR_R = 1080 * 0.075;
const FADE_W = 1080 * 0.085;
check('centre exclusion: a streak lying across the ship draws nothing', () => {
  // lead exactly at centre
  assert.equal(speedLineCenterGate(0, 200, 0, CLEAR_R, FADE_W), 0, 'lead at centre must gate to 0');
  // lead has cleared the disc but the TAIL still crosses it — the case a lead-point-only test misses
  assert.equal(speedLineCenterGate(CLEAR_R * 0.9, 400, 0, CLEAR_R, FADE_W), 0, 'tail across centre must gate to 0');
  // exactly on the clear radius, laterally
  assert.equal(speedLineCenterGate(0, 200, CLEAR_R, CLEAR_R, FADE_W), 0, 'on the clear radius must gate to 0');
});
check('centre exclusion: streaks well clear of the ship are untouched', () => {
  assert.equal(speedLineCenterGate(900, 200, 400, CLEAR_R, FADE_W), 1, 'far streak must gate to 1 (no dimming)');
  assert.equal(speedLineCenterGate(-900, 200, 0, CLEAR_R, FADE_W), 1, 'far approaching streak must gate to 1');
  const mid = speedLineCenterGate(0, 0, CLEAR_R + FADE_W * 0.5, CLEAR_R, FADE_W);
  assert.ok(Math.abs(mid - 0.5) < TOL, `fade band should be linear, got ${mid}`);
});
check('centre exclusion: non-finite geometry fails dark, never bright', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.equal(speedLineCenterGate(bad, 100, 0, CLEAR_R, FADE_W), 0, `uv=${bad} must gate to 0`);
    assert.equal(speedLineCenterGate(0, 100, bad, CLEAR_R, FADE_W), 0, `p=${bad} must gate to 0`);
  }
  assert.equal(speedLineCenterGate(500, 100, 0, CLEAR_R, 0), 0, 'zero-width fade band must gate to 0');
});

// ================================================================================================
// OWNER-DIRECTED LUMINOUS WAKE — ADR D7 restraint is overturned
// ================================================================================================

// Everything above ran through `speedLineDrive` with the flag at its node default. If that default
// were ever flipped ON, the legacy pins would have been silently testing the NEW math against the
// OLD literals and would have failed loudly — but assert the routing explicitly so the reason for
// any such failure is stated rather than inferred.
check('legacy branch is the node default, so the pins above describe what they claim', () => {
  assert.equal(VELOCITY_LANGUAGE_FLAGS.bands, false,
    'bands flag must default OFF under node (IS_BROWSER), or the legacy pins above are meaningless');
  const viaSeam = speedLineDrive(MAX_SPEED, MAX_SPEED, false, false);
  const direct = speedLineDriveLegacy(MAX_SPEED, MAX_SPEED, false, false);
  assert.deepEqual({ ...viaSeam, exceptionalSpeed: undefined }, { ...direct, exceptionalSpeed: undefined },
    'flag-off seam must preserve the bounded legacy drive fields verbatim');
  assert.equal(viaSeam.exceptionalSpeed, 0,
    'the resident drive must carry a silent exceptional-speed field even on the legacy visual branch');
});

check('exceptional speed is strict physics provenance, bounded, and boost-independent', () => {
  assert.equal(VL_EXCEPTIONAL_SPEED_RATIO_MAX, 3);
  assert.equal(resolveExceptionalSpeed(MAX_SPEED, MAX_SPEED, true), 0);
  assert.equal(resolveExceptionalSpeed(2 * MAX_SPEED, MAX_SPEED, true), 0.5);
  assert.equal(resolveExceptionalSpeed(3 * MAX_SPEED, MAX_SPEED, true), 1);
  assert.equal(resolveExceptionalSpeed(99 * MAX_SPEED, MAX_SPEED, true), 1);
  for (const provenance of [false, null, undefined, 1, 'true', {}]) {
    assert.equal(resolveExceptionalSpeed(3 * MAX_SPEED, MAX_SPEED, provenance), 0);
  }
  const boostOnly = speedLineDrive(2 * MAX_SPEED, MAX_SPEED, true, false, false);
  assert.equal(boostOnly.exceptionalSpeed, 0, 'boost must not manufacture exceptional speed');
  const reduced = speedLineDrive(2 * MAX_SPEED, MAX_SPEED, false, true, true);
  assert.equal(reduced.exceptionalSpeed, 0, 'motionReduce must suppress exceptional amplification');
});

// Representative speed ratios, one comfortably inside each band plus the seams themselves.
const BAND_SAMPLES = {
  band0: [0, 0.25, 0.5, 0.7, 0.9, 1.0],
  band1: [1.05, 1.3, 1.6, 2.0],
  band2: [2.05, 2.6, 3.5, 4.4, 5.0],
  band3: [5.05, 6, 7.5, 9, 10, 14, 25, 100, 1000],
};
const drive = (ratio, boosting = false, mr = false) =>
  velocityBandDrive(ratio * MAX_SPEED, MAX_SPEED, boosting, mr);

// ---------------------------------------------------------------- ordinary route grows a real wake
check('ordinary fast flight grows a long wake below governed top speed', () => {
  for (const ratio of [0, 0.2, VL_WAKE_AT]) {
    const d = drive(ratio);
    assert.equal(d.count, 0, `ratio=${ratio}: precision maneuvering must stay clear`);
    assert.equal(d.targetOpacity, 0, `ratio=${ratio}: precision maneuvering opacity`);
  }
  const first = drive(0.6);
  const fast = drive(1.0);
  assert.equal(first.band, VELOCITY_BAND.LOCAL);
  assert.ok(first.count > 0 && first.targetOpacity > 0 && first.lenScale > 0,
    'the wake must appear during ordinary fast flight, not only after overspeed');
  assert.ok(fast.count > first.count, `ordinary density should build (${first.count} -> ${fast.count})`);
  assert.ok(fast.targetOpacity > first.targetOpacity,
    `ordinary radiance should build (${first.targetOpacity} -> ${fast.targetOpacity})`);
  assert.ok(fast.lenScale > first.lenScale && fast.lenScale >= 0.85,
    `ordinary wake should become long (${first.lenScale} -> ${fast.lenScale})`);

  // The wake is keyed on actual speed. Boost earns presentation by changing physics, not by
  // manufacturing a different band record while the ship is stationary.
  for (const boosting of [false, true]) {
    for (const ratio of [0.3, 0.5, 0.9, 1.0, 1.5, 3, 7.5]) {
      assert.equal(drive(ratio, boosting).band, drive(ratio, false).band,
        `ratio=${ratio}: boost changed the band`);
      assert.equal(drive(ratio, boosting).count, drive(ratio, false).count,
        `ratio=${ratio}: boost changed wake density without changing speed`);
    }
  }
});

check('moderate travel extends and brightens the ordinary wake continuously', () => {
  let prior = drive(VL_BAND1_AT);
  for (const ratio of BAND_SAMPLES.band1) {
    const d = drive(ratio);
    assert.equal(d.band, VELOCITY_BAND.MODERATE, `ratio=${ratio}: expected band 1, got ${d.band}`);
    assert.ok(d.count >= prior.count, `ratio=${ratio}: density regressed`);
    assert.ok(d.targetOpacity >= prior.targetOpacity, `ratio=${ratio}: radiance regressed`);
    assert.ok(d.lenScale >= prior.lenScale, `ratio=${ratio}: length regressed`);
    assert.equal(d.parallaxGain, 0, `ratio=${ratio}: the world does not stream yet in band 1`);
    assert.equal(d.grain, 0, `ratio=${ratio}: no field behaviour below band 3`);
    prior = d;
  }
  assert.ok(drive(VL_BAND2_AT).lenScale >= 2,
    '2x travel should carry a materially long wake, not the overturned short-mote look');
});

check('high travel keeps the luminous wake while parallax and smear join it', () => {
  const lo = drive(VL_BAND2_AT + 0.05);
  const hi = drive(VL_BAND3_AT);
  assert.equal(lo.band, VELOCITY_BAND.HIGH, 'low end of band 2 misclassified');
  assert.ok(hi.count > lo.count,
    `wake density must build across band 2, got ${lo.count} -> ${hi.count}`);
  assert.ok(hi.lenScale > lo.lenScale,
    `wake must extend across band 2, got ${lo.lenScale} -> ${hi.lenScale}`);
  assert.ok(hi.lenScale <= VL_LEN_SCALE_MAX,
    `length breached ${VL_LEN_SCALE_MAX}, got ${hi.lenScale}`);
  assert.ok(hi.parallaxGain > lo.parallaxGain,
    'background parallax must join the wake across band 2');
  assert.ok(Math.abs(hi.parallaxGain - VL_PARALLAX_GAIN_MAX) < 1e-6,
    `parallax gain should reach full by the top of band 2, got ${hi.parallaxGain}`);
  assert.ok(hi.targetOpacity > lo.targetOpacity,
    'owner direction requires the high-speed wake to retain and build light energy');
});

check('extreme speed retains the wake and layers field behavior without a visor', () => {
  const edge = drive(VL_BAND3_AT);
  const top = drive(VL_TAPER_END);
  assert.equal(top.band, VELOCITY_BAND.EXTREME, 'taper end misclassified');
  assert.ok(top.count >= edge.count, `extreme density faded (${edge.count} -> ${top.count})`);
  assert.ok(top.targetOpacity >= edge.targetOpacity,
    `extreme radiance faded (${edge.targetOpacity} -> ${top.targetOpacity})`);
  assert.ok(top.lenScale > edge.lenScale && top.lenScale === VL_LEN_SCALE_MAX,
    `extreme wake must reach the long-wake ceiling (${edge.lenScale} -> ${top.lenScale})`);
  assert.ok(Math.abs(top.grain - VL_GRAIN_MAX) < 1e-6,
    `grain should reach ${VL_GRAIN_MAX}, got ${top.grain}`);
  assert.ok(top.grain <= VL_GRAIN_MAX, 'grain ceiling breached');
  assert.ok(top.cameraLeadWU > 0 && top.cameraLeadWU <= VL_CAMERA_LEAD_WU_MAX,
    `camera lead ${top.cameraLeadWU} outside (0, ${VL_CAMERA_LEAD_WU_MAX}]`);
  assert.ok(top.shakeScale < 1, `shake must be REDUCED at extreme speed, got ${top.shakeScale}`);
  for (const banned of ['vignette', 'radius', 'falloff', 'edgeFade', 'innerRadius', 'outerRadius']) {
    assert.ok(!(banned in top), `record exposes '${banned}' — that is vignette/visor vocabulary`);
  }
});

// ---------------------------------------------------------------- compositing and saturation
check('every band uses bounded luminous screen compositing', () => {
  assert.equal(VL_COMPOSITE, 'screen', 'the owner-directed wake must use luminous screen compositing');
  for (const list of Object.values(BAND_SAMPLES)) {
    for (const ratio of list) {
      for (const boosting of [false, true]) {
        const d = drive(ratio, boosting);
        assert.equal(d.composite, VL_COMPOSITE,
          `ratio=${ratio} boost=${boosting}: composite '${d.composite}' is not '${VL_COMPOSITE}'`);
        assert.notEqual(d.composite, 'lighter', 'the unbounded legacy additive sum must not return');
        assert.notEqual(d.composite, 'source-over', 'the overturned flat/restraint composite returned');
        assert.ok(d.maxAlpha <= VL_ALPHA_MAX,
          `ratio=${ratio}: alpha ${d.maxAlpha} above the band cap ${VL_ALPHA_MAX}`);
        assert.ok(d.maxAlpha < 1, 'no band may reach opaque');
      }
    }
  }
});

// ---------------------------------------------------------------- continuity across the seams
check('no channel steps at a band seam', () => {
  const EPS = 1e-4;
  for (const edge of [VL_WAKE_AT, VL_BAND1_AT, VL_BAND2_AT, VL_BAND3_AT, VL_TAPER_END]) {
    const below = drive(edge - EPS);
    const above = drive(edge + EPS);
    for (const key of ['targetOpacity', 'lenScale', 'parallaxGain', 'grain', 'smear', 'cameraLeadWU']) {
      const delta = Math.abs(above[key] - below[key]);
      assert.ok(delta < 0.01, `${key} steps by ${delta} at the ratio-${edge} seam`);
    }
    assert.ok(Math.abs(above.count - below.count) <= 1,
      `count steps by ${Math.abs(above.count - below.count)} at the ratio-${edge} seam`);
  }
});

// ---------------------------------------------------------------- ceilings + fail-dark, band mode
check('band mode holds every ceiling and fails DARK on non-finite input', () => {
  for (const boosting of [false, true]) {
    for (const mr of [false, true]) {
      for (const ratio of RATIOS) {
        const d = velocityBandDrive(ratio * MAX_SPEED, MAX_SPEED, boosting, mr);
        const where = `ratio=${ratio} boost=${boosting} mr=${mr}`;
        for (const [key, value] of Object.entries(d)) {
          if (typeof value !== 'number') continue;
          assert.ok(Number.isFinite(value), `${where}: ${key} must be finite, got ${value}`);
        }
        assert.ok(Number.isInteger(d.count), `${where}: count ${d.count} not an integer`);
        assert.ok(d.count >= 0 && d.count <= VL_COUNT_MAX, `${where}: count ${d.count} out of range`);
        assert.ok(d.targetOpacity <= VL_ALPHA_MAX, `${where}: alpha ceiling breached`);
        assert.ok(d.lenScale <= VL_LEN_SCALE_MAX, `${where}: length ceiling breached`);
        assert.ok(d.grain <= VL_GRAIN_MAX, `${where}: grain ceiling breached`);
        assert.ok(d.parallaxGain <= VL_PARALLAX_GAIN_MAX, `${where}: parallax ceiling breached`);
        assert.ok(d.cameraLeadWU <= VL_CAMERA_LEAD_WU_MAX, `${where}: camera lead ceiling breached`);
        // Shared-canvas count, opacity, alpha, and flow limits remain safety rails. The luminous
        // language owns a deliberately longer length scale, bounded by its own viewport cap.
        assert.ok(d.count <= SL_STREAK_MAX && d.targetOpacity <= SL_OPACITY_MAX
          && d.maxAlpha <= SL_ALPHA_MAX && d.flowSpeed <= SL_FLOW_MAX,
          `${where}: band record breaches a legacy canvas ceiling`);
      }
      // Explicit fail-dark: non-finite speed must be SILENT, not maximal.
      for (const [speed, maxSpeed] of [[NaN, MAX_SPEED], [Infinity, MAX_SPEED], [MAX_SPEED, NaN],
                                       [-Infinity, MAX_SPEED], [1e300, 1e-300]]) {
        const d = velocityBandDrive(speed, maxSpeed, boosting, mr);
        assert.ok(d.count === 0 || Number.isFinite(d.count),
          `speed=${speed} maxSpeed=${maxSpeed}: count ${d.count}`);
        assert.ok(d.targetOpacity <= VL_ALPHA_MAX && d.grain <= VL_GRAIN_MAX,
          `speed=${speed} maxSpeed=${maxSpeed}: failed BRIGHT`);
      }
      assert.equal(velocityBandDrive(NaN, MAX_SPEED, boosting, mr).count, 0,
        'a NaN velocity must emit nothing at all');
      assert.equal(velocityBandDrive(NaN, MAX_SPEED, boosting, mr).grain, 0,
        'a NaN velocity must not raise the field');
    }
  }
});

// ---------------------------------------------------------------- motionReduce, in EVERY band
check('motionReduce is strictly quieter in every band, including the field channels', () => {
  for (const list of Object.values(BAND_SAMPLES)) {
    for (const ratio of list) {
      for (const boosting of [false, true]) {
        const full = drive(ratio, boosting, false);
        const red = drive(ratio, boosting, true);
        const where = `ratio=${ratio} boost=${boosting}`;
        for (const key of ['count', 'targetOpacity', 'lenScale', 'grain', 'parallaxGain', 'smear', 'flowSpeed',
                           'cameraLeadWU', 'maxAlpha']) {
          assert.ok(red[key] <= full[key] + 1e-12,
            `${where}: motionReduce RAISED ${key} (${full[key]} -> ${red[key]})`);
        }
      }
    }
  }
  // And the reduction is real, not nominal, wherever there is anything to reduce.
  const loud = drive(VL_TAPER_END, false, false);
  const quiet = drive(VL_TAPER_END, false, true);
  assert.ok(quiet.grain < loud.grain, 'extreme field must be reduced under motionReduce');
  assert.ok(quiet.lenScale < loud.lenScale, 'long wakes must shorten under motionReduce');
  assert.equal(quiet.cameraLeadWU, 0, 'camera lead must be fully suppressed under motionReduce');
});

// ---------------------------------------------------------------- band classification
check('band classification matches the retained continuous thresholds exactly', () => {
  assert.equal(resolveVelocityBand(VL_BAND1_AT), VELOCITY_BAND.LOCAL, 'band 0 is inclusive of 1x');
  assert.equal(resolveVelocityBand(VL_BAND1_AT + 1e-9), VELOCITY_BAND.MODERATE);
  assert.equal(resolveVelocityBand(VL_BAND2_AT), VELOCITY_BAND.MODERATE, 'band 1 is inclusive of 2x');
  assert.equal(resolveVelocityBand(VL_BAND2_AT + 1e-9), VELOCITY_BAND.HIGH);
  assert.equal(resolveVelocityBand(VL_BAND3_AT), VELOCITY_BAND.HIGH, 'band 2 is inclusive of 5x');
  assert.equal(resolveVelocityBand(VL_BAND3_AT + 1e-9), VELOCITY_BAND.EXTREME);
  assert.equal(resolveVelocityBand(NaN), VELOCITY_BAND.LOCAL, 'NaN must classify as silent');
});

// ---------------------------------------------------------------- region volumes
// The trap this section exists for: the naive "blend toward the nearest OTHER cell, complete at the
// boundary" formulation SNAPS BACKWARD the instant you cross, because membership flips and the
// region you just left becomes the nearest other. A test that samples one side of the boundary
// cannot see it. These sample straight through.
const { CORRIDOR_SECTOR_IDS, sectorGlobalOrigin, sectorMembershipAtGlobal } =
  await import('../src/data/sectorCoordinates.js');

// Find a real adjacent pair whose bisector the straight line between their origins actually crosses
// (a third origin can own the midpoint on a dense lattice, which would make the sample meaningless).
function findBoundaryPair() {
  for (const a of CORRIDOR_SECTOR_IDS) {
    for (const b of CORRIDOR_SECTOR_IDS) {
      if (a >= b) continue;
      const oa = sectorGlobalOrigin(a);
      const ob = sectorGlobalOrigin(b);
      const mx = (oa.x + ob.x) / 2;
      const mz = (oa.z + ob.z) / 2;
      const dx = ob.x - oa.x;
      const dz = ob.z - oa.z;
      const len = Math.hypot(dx, dz);
      if (!(len > 0)) continue;
      const ux = dx / len, uz = dz / len;
      const before = sectorMembershipAtGlobal({ x: mx - ux * 40, z: mz - uz * 40 });
      const after = sectorMembershipAtGlobal({ x: mx + ux * 40, z: mz + uz * 40 });
      if (before === a && after === b) {
        return { a, b, oa, ob, mx, mz, ux, uz, len };
      }
    }
  }
  return null;
}
const PAIR = findBoundaryPair();

check('region crossfade: window opens at 1500 WU out and is 50/50 on the boundary', () => {
  assert.ok(PAIR, 'no adjacent sector pair found — the lattice fixture is wrong, not the code');
  const at = (s) => resolveRegionCrossfade({ x: PAIR.mx + PAIR.ux * s, z: PAIR.mz + PAIR.uz * s });

  const boundary = at(0);
  assert.ok(Math.abs(boundary.blend - 0.5) < 0.02,
    `blend on the boundary should be 0.5, got ${boundary.blend}`);

  // Exactly at the window edge inside the home cell: the fade has not begun.
  const edge = at(-REGION_CROSSFADE_WU);
  assert.ok(edge.blend < 1e-6, `blend at ${REGION_CROSSFADE_WU} WU out should be 0, got ${edge.blend}`);
  assert.equal(edge.sectorId, PAIR.a, 'membership before the boundary must be the home sector');

  // Well outside the window: fully the home region, and NOT reported as approaching.
  const far = at(-REGION_CROSSFADE_WU * 3);
  assert.equal(far.blend, 0, `blend far inside a region should be 0, got ${far.blend}`);
  assert.equal(far.approaching, false, 'far inside a region must not report an approach');

  // A full window past the boundary: the crossing is COMPLETE. Note that `blend` is
  // membership-relative — once across, the neighbour has become home, so "fully transitioned" reads
  // as blend 0 against the NEW home, not blend 1 against the old one. Asserting `blend > 0.98` here
  // would be asserting that the fade never finishes. The canonical progress is what matters.
  const past = at(REGION_CROSSFADE_WU);
  assert.equal(past.sectorId, PAIR.b, 'membership past the boundary must be the neighbour');
  assert.ok(past.blend < 1e-6,
    `a full window past the boundary the crossing must be COMPLETE (blend 0 vs the new home), got ${past.blend}`);
  assert.equal(past.nextSectorId, PAIR.a, 'the sector just left becomes the neighbour after crossing');
});

check('region crossfade: the composed blend is CONTINUOUS through the crossing', () => {
  assert.ok(PAIR, 'no adjacent sector pair found');
  // Compose the membership-relative blend into one canonical scalar: progress from sector A toward
  // sector B. This is the quantity a consumer actually renders, and it is the quantity the naive
  // formulation discontinuously reverses at the boundary.
  const progressTowardB = (s) => {
    const r = resolveRegionCrossfade({ x: PAIR.mx + PAIR.ux * s, z: PAIR.mz + PAIR.uz * s });
    if (r.sectorId === PAIR.a) return r.blend;          // blending home(A) -> neighbour(B)
    if (r.sectorId === PAIR.b) return 1 - r.blend;      // blending home(B) -> neighbour(A)
    return null;                                        // a third cell owns this sample
  };

  let prev = null;
  let prevS = null;
  let maxJump = 0;
  for (let s = -REGION_CROSSFADE_WU * 1.5; s <= REGION_CROSSFADE_WU * 1.5; s += 10) {
    const p = progressTowardB(s);
    if (p === null) continue;
    if (prev !== null) {
      const jump = Math.abs(p - prev);
      maxJump = Math.max(maxJump, jump);
      assert.ok(jump < 0.05,
        `blend jumped ${jump.toFixed(4)} between ${prevS} and ${s} WU — the palette POPS at the boundary`);
      assert.ok(p >= prev - 1e-9,
        `blend reversed between ${prevS} and ${s} WU — the crossfade snaps backward on crossing`);
    }
    prev = p;
    prevS = s;
  }
  console.log(`      (max blend step across the crossing: ${maxJump.toFixed(5)} per 10 WU)`);
});

check('region crossfade: degenerate inputs stay finite and silent', () => {
  for (const bad of [null, undefined, {}, { x: NaN, z: 0 }, { x: 0, z: Infinity }]) {
    const r = resolveRegionCrossfade(bad);
    assert.ok(r && typeof r === 'object', 'must always return a record');
    assert.ok(Number.isFinite(r.blend), `blend ${r.blend} is not finite`);
    assert.ok(r.blend >= 0 && r.blend <= 1, `blend ${r.blend} outside [0,1]`);
  }
});

// ---------------------------------------------------------------- world streaming (band 2 cue)
// This pins the integration `spaceBackground.update()` actually calls, not a copy. The defect it
// guards is specific: scaling the layer's parallax factor by the gain — the obvious implementation —
// snaps the sky, because the natural term is `camPos * par / tile` and camPos is thousands of WU.
check('world streaming INTEGRATES the gain instead of scaling the parallax factor', () => {
  const par = 0.08, tile = 2400, camStart = 250000, stepWU = 4;

  // The shipped path: accumulate, with the gain ramping 0 -> 1 over 20 frames mid-run.
  let phase = 0, cam = camStart, prevU = null, maxStep = 0;
  for (let i = 0; i < 400; i++) {
    const gain = i < 120 ? 0 : i < 140 ? (i - 120) / 20 : 1;
    cam += stepWU;
    phase = streamPhaseStep(phase, stepWU, par, tile, gain);
    const u = (cam * par / tile + phase) % 1;
    if (prevU !== null) {
      const d = Math.abs(u - prevU);
      maxStep = Math.max(maxStep, Math.min(d, 1 - d));   // wrap-aware
    }
    prevU = u;
  }

  // The naive alternative, for contrast: the jump a gain change would produce if it scaled `par`.
  const naiveAt = (g) => (camStart * par * (1 + g) / tile) % 1;
  const naiveJump = Math.abs(naiveAt(1) - naiveAt(0));

  assert.ok(maxStep < 0.01,
    `integrated streaming stepped by ${maxStep} UV in one frame — the sky snaps`);
  assert.ok(naiveJump > maxStep * 50,
    `the contrast is the evidence: naive ${naiveJump} vs integrated ${maxStep}`);
  console.log(`      (integrated ${maxStep.toFixed(6)} UV/frame vs naive par-scaling ${naiveJump.toFixed(6)} UV snap)`);

  // Gain 0 must not advance the phase at all — band 0/1 leave the background alone entirely.
  assert.equal(streamPhaseStep(0.25, 999, par, tile, 0), 0.25, 'gain 0 advanced the phase');
  // Non-finite inputs must leave the phase untouched rather than poisoning it forever.
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.equal(streamPhaseStep(0.25, bad, par, tile, 1), 0.25, `deltaWU=${bad} corrupted the phase`);
    assert.equal(streamPhaseStep(0.25, 4, par, bad, 1), 0.25, `tile=${bad} corrupted the phase`);
    assert.ok(Number.isFinite(streamPhaseStep(bad, 4, par, tile, 1)), `phase=${bad} stayed non-finite`);
  }
  assert.equal(streamPhaseStep(0.25, 4, par, 0, 1), 0.25, 'a zero tile must not divide');
  // The phase stays wrapped no matter how long the burn lasts.
  let long = 0;
  for (let i = 0; i < 200000; i++) long = streamPhaseStep(long, 20, par, tile, 1);
  assert.ok(Math.abs(long) <= 1 && Number.isFinite(long),
    `phase escaped its wrap after a long burn: ${long}`);
});

check('camera-step plausibility rejects a frame rebase but accepts real travel', () => {
  // 20 WU is one tick at the absolute travel ceiling (1200 WU/s) — the fastest legitimate step.
  assert.equal(isPlausibleCameraStep(20, 20), true, 'max legitimate travel must be accepted');
  assert.equal(isPlausibleCameraStep(0, 0), true);
  assert.equal(isPlausibleCameraStep(-499, 499), true);
  // FRAME_REBASE_THRESHOLD_WU is 8192; a rebase or jump must never be integrated as travel.
  assert.equal(isPlausibleCameraStep(8192, 0), false, 'a frame rebase must be rejected');
  assert.equal(isPlausibleCameraStep(0, -12288), false, 'a sector-scale jump must be rejected');
  assert.equal(isPlausibleCameraStep(NaN, 0), false, 'NaN must be rejected');
  assert.equal(isPlausibleCameraStep(0, Infinity), false, 'Infinity must be rejected');
});

// ---------------------------------------------------------------- along-flow smear (band 2, cue b)
// The trap this section exists for is NOT that the smear might be too weak — it is that a smear on
// ADDITIVELY BLENDED sprites brightens the sky unless the alpha is compensated. The star and flare
// materials both use THREE.AdditiveBlending, so stretching a point over `stretch` times the area
// without dividing its alpha by `stretch` multiplies the light the starfield contributes by exactly
// that factor, at precisely the speed the player is going fastest. `dim * stretch === 1` is
// the invariant that forecloses it, and it is asserted below as an identity rather than a bound.
check('along-flow smear conserves energy — a stretched star spreads, it never glows', () => {
  for (const s of [0, 0.05, 0.25, 0.5, 0.75, 1]) {
    const { stretch, dim } = smearStretch(s);
    assert.ok(stretch >= 1, `smear ${s}: stretch ${stretch} must never shrink a point`);
    assert.ok(stretch <= VL_SMEAR_MAX_STRETCH,
      `smear ${s}: stretch ${stretch} exceeds ${VL_SMEAR_MAX_STRETCH} — a star became a line`);
    assert.ok(Math.abs(dim * stretch - 1) < 1e-12,
      `smear ${s}: energy NOT conserved (dim ${dim} x stretch ${stretch} = ${dim * stretch}); ` +
      'an additively blended starfield will brighten by that factor at speed');
    assert.ok(dim <= 1, `smear ${s}: dim ${dim} would BRIGHTEN the point`);
  }
  // Monotone: more smear is always more stretch, never a fold-back.
  let prev = 0;
  for (let s = 0; s <= 1.0001; s += 0.05) {
    const { stretch } = smearStretch(s);
    assert.ok(stretch >= prev - 1e-12, `smear ramp folded back at ${s}`);
    prev = stretch;
  }
  // Off is exactly OFF — an inert uniform, so bands 0 and 1 render byte-identically to the
  // pre-smear starfield. A "1.0001" here would mean every frame of ordinary flight pays a
  // different shader path than the one that shipped.
  assert.equal(smearStretch(0).stretch, 1, 'smear 0 must be exactly 1.0 (inert)');
  assert.equal(smearStretch(0).dim, 1, 'smear 0 must not dim');
  // Fail NEUTRAL on garbage: not stretched, not dimmed. Clamping a NaN to the far end would either
  // wash the field out or black it; both are worse than declining to apply an optional cue.
  for (const bad of [NaN, Infinity, -Infinity, -1, undefined, null]) {
    const { stretch, dim } = smearStretch(bad);
    assert.equal(stretch, 1, `smear ${bad} must not stretch`);
    assert.equal(dim, 1, `smear ${bad} must not dim`);
  }
  // Above the ceiling the result saturates rather than running away.
  assert.equal(smearStretch(1e9).stretch, smearStretch(VL_SMEAR_MAX).stretch,
    'smear above its ceiling must saturate, not keep stretching');
});

check('smear is a BAND 2 cue: silent below it, and motionReduce-respecting', () => {
  // Bands 0 and 1 must leave the sky completely alone — the world only starts streaming at 2x.
  for (const ratio of [0.5, 1, 1.5, 2]) {
    const d = drive(ratio);
    assert.equal(d.smear, 0, `ratio ${ratio}: smear must be 0 below band 2, got ${d.smear}`);
    assert.equal(smearStretch(d.smear).stretch, 1,
      `ratio ${ratio}: the sky must be untouched below band 2`);
  }
  // It ramps through band 2 and holds through band 3, layered with the retained luminous wake.
  assert.ok(drive(3).smear > 0 && drive(3).smear < VL_SMEAR_MAX, 'smear must ramp inside band 2');
  assert.ok(drive(4).smear > drive(3).smear, 'smear must rise across band 2');
  assert.equal(drive(10).smear, VL_SMEAR_MAX, 'smear must hold at full through band 3');
  assert.equal(drive(100).smear, VL_SMEAR_MAX, 'smear must not fall off at extreme speed');
  // The consumer reads `drive.smear`, which velocityBandDrive has ALREADY reduced, so reduced-motion
  // handling comes for free. Pinned because a future consumer reading a raw band instead would
  // silently lose it.
  for (const ratio of [3, 4, 5, 7.5, 10]) {
    const full = smearStretch(drive(ratio, false, false).smear);
    const red = smearStretch(drive(ratio, false, true).smear);
    assert.ok(red.stretch < full.stretch,
      `ratio ${ratio}: motionReduce must reduce the smear (${full.stretch} -> ${red.stretch})`);
    assert.ok(red.stretch >= 1, `ratio ${ratio}: reduced smear must stay >= 1`);
  }
});

// ---------------------------------------------------------------- the seam actually routes
check('speedLineDrive routes to the band language when the flag is on', () => {
  const saved = VELOCITY_LANGUAGE_FLAGS.bands;
  try {
    VELOCITY_LANGUAGE_FLAGS.bands = true;
    const viaSeam = speedLineDrive(0.7 * MAX_SPEED, MAX_SPEED, false, false);
    assert.ok(viaSeam.count > 0 && viaSeam.lenScale > 0,
      'flag-on ordinary fast flight must route to the luminous wake');
    assert.equal(viaSeam.composite, VL_COMPOSITE, 'flag-on seam must use screen compositing');
    const fast = speedLineDrive(7.5 * MAX_SPEED, MAX_SPEED, false, false);
    assert.equal(fast.band, VELOCITY_BAND.EXTREME, 'flag-on 7.5x must reach band 3 through the seam');
  } finally {
    // Restore, or every assertion after this point silently tests the wrong branch.
    VELOCITY_LANGUAGE_FLAGS.bands = saved;
  }
  assert.equal(VELOCITY_LANGUAGE_FLAGS.bands, false, 'flag must be restored after the routing probe');
});

// ---------------------------------------------------------------- band evidence table
console.log('\nVELOCITY LANGUAGE (LUMINOUS WAKE) — maxSpeed=150, motionReduce=off, boosting=false');
console.log('  ratio | band | streaks | alpha  | length | parallax | smear→stretch | grain  | lead');
console.log('  ------+------+---------+--------+--------+----------+---------------+--------+------');
for (const ratio of [0.5, 1, 1.5, 2, 3, 4, 5, 6, 7.5, 10, 25, 100]) {
  const d = drive(ratio);
  const sm = smearStretch(d.smear);
  console.log(
    `  ${String(ratio).padStart(5)} |    ${d.band} | ${String(d.count).padStart(7)} | ` +
    `${d.targetOpacity.toFixed(4)} | ${d.lenScale.toFixed(4)} | ${d.parallaxGain.toFixed(4)}   | ` +
    `${d.smear.toFixed(3)}→${sm.stretch.toFixed(2)}x   | ` +
    `${d.grain.toFixed(4)} | ${d.cameraLeadWU.toFixed(2)}`);
}

// ---------------------------------------------------------------- before/after evidence table
console.log('\nBEFORE (unbounded) vs AFTER (bounded) — maxSpeed=150, motionReduce=off');
for (const boosting of [false, true]) {
  console.log(`\n  boosting=${boosting}`);
  console.log('  ratio     | intensity          | targetOpacity      | count     | lenScale           | maxAlpha');
  console.log('  ----------+--------------------+--------------------+-----------+--------------------+-------------------');
  for (const ratio of RATIOS) {
    const speed = ratio * MAX_SPEED;
    const b = driveBefore(speed, MAX_SPEED, boosting, false);
    const a = speedLineDrive(speed, MAX_SPEED, boosting, false);
    const col = (before, after) => `${fmt(before).padStart(8)}→${fmt(after).padStart(9)}`;
    const intCol = (before, after) => `${String(before).padStart(4)}→${String(after).padStart(4)}`;
    console.log(`  ${String(ratio).padEnd(9)} | ${col(b.intensity, a.intensity)} | ${col(b.targetOpacity, a.targetOpacity)} | ${intCol(b.count, a.count)} | ${col(b.lenScale, a.lenScale)} | ${col(b.maxAlpha, a.maxAlpha)}`);
  }
}

console.log(`\nceilings: streaks<=${SL_STREAK_MAX} opacity<=${SL_OPACITY_MAX} alpha<=${SL_ALPHA_MAX} lenScale<=${SL_LEN_SCALE_MAX} flow<=${SL_FLOW_MAX}px/s`);
if (failures > 0) {
  console.error(`\nFAIL check:speed-lines — ${failures} failing group(s)`);
  process.exit(1);
}
console.log('\nPASS check:speed-lines');
