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
// WAVE 3 ADDENDUM — the velocity-language redesign (ADR D7).
// Everything above pins the LEGACY branch, which is what `speedLineDrive` returns while the `bands`
// flag is off (its node default). The redesign is a different vocabulary, not a retune, so it gets
// its own section below rather than new literals in the old pins: those pins exist to prove the
// Slice 0 BOUNDING work never restyled ordinary flight, and rewriting them to match a deliberate
// restyle would destroy the evidence they carry.
//
// The band section asserts the things most likely to rot, in order of likelihood:
//   * THE INVERSION — band 3 must produce FEWER streaks than band 2. This is the whole idea (at
//     extreme velocity individual particles are physically invisible) and it is the one property
//     that any future "make it more visible at speed" tweak will silently reverse.
//   * Band 0 is SILENT. Not "dim" — zero streaks, so a streak can never appear in a fight readout.
//   * Compositing is NORMAL in every band. 'lighter' is what made alpha above 1 saturate to white.
//   * The new path fails DARK on non-finite input, exactly as the legacy path does. This one is not
//     inherited: several band ramps DESCEND with speed, so a NaN clamped to 0 progress would fail
//     BRIGHT on them, which is why the band drive screens at its entry point instead.
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
  VL_LEN_SCALE_MAX,
  VL_PARALLAX_GAIN_MAX,
  VL_TAPER_END,
  REGION_CROSSFADE_WU,
  isPlausibleCameraStep,
  resolveRegionCrossfade,
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
// WAVE 3 — the four-band velocity language (ADR D7)
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
  assert.deepEqual(viaSeam, direct, 'flag-off seam must route to the legacy drive verbatim');
});

// Representative speed ratios, one comfortably inside each band plus the seams themselves.
const BAND_SAMPLES = {
  band0: [0, 0.25, 0.5, 0.9, 1.0],
  band1: [1.05, 1.3, 1.6, 2.0],
  band2: [2.05, 2.6, 3.5, 4.4, 5.0],
  band3: [5.05, 6, 7.5, 9, 10, 14, 25, 100, 1000],
};
const drive = (ratio, boosting = false, mr = false) =>
  velocityBandDrive(ratio * MAX_SPEED, MAX_SPEED, boosting, mr);

// ---------------------------------------------------------------- band 0 is SILENT, not merely dim
// BOOSTING IS ASSERTED HERE, NOT ONLY IN THE COMPOSITING TEST. An earlier draft biased the effective
// ratio by +0.6 while boost was held, which put 14 motes at alpha 0.12 on screen at exactly 1x combat
// speed — inside the band D7 reserves for silence, during the boost-repositioning that combat is made
// of. Every band-0 assertion ran `boosting=false`, so nothing caught it: the one input combination
// that broke the ADR was the one combination untested. Both values of `boosting` now run here.
check('band 0 (<= 1x combat speed) emits nothing at all, BOOSTING OR NOT', () => {
  for (const boosting of [false, true]) {
    for (const ratio of BAND_SAMPLES.band0) {
      const d = drive(ratio, boosting);
      const where = `ratio=${ratio} boost=${boosting}`;
      assert.equal(d.band, VELOCITY_BAND.LOCAL, `${where}: expected band 0, got ${d.band}`);
      assert.equal(d.count, 0, `${where}: ${d.count} streaks in the combat readout`);
      assert.equal(d.targetOpacity, 0, `${where}: opacity ${d.targetOpacity} != 0`);
      assert.equal(d.grain, 0, `${where}: grain ${d.grain} != 0`);
      assert.equal(d.parallaxGain, 0, `${where}: world streaming active in local space`);
    }
  }
  // The bands are keyed on SPEED ALONE (D7). Holding boost must not shift which band you are in —
  // boost earns its language by accelerating you across the edges, not by pretending you already did.
  for (const ratio of [0.3, 0.5, 0.9, 1.0, 1.5, 3, 7.5]) {
    assert.equal(drive(ratio, true).band, drive(ratio, false).band,
      `ratio=${ratio}: boost changed the BAND — the language must be speed-keyed`);
    assert.equal(drive(ratio, true).count, drive(ratio, false).count,
      `ratio=${ratio}: boost changed the streak count`);
  }
});

// ---------------------------------------------------------------- band 1 is a whisper
check('band 1 (1-2x) is sparse fine motes within the D7 caps', () => {
  for (const ratio of BAND_SAMPLES.band1) {
    const d = drive(ratio);
    assert.equal(d.band, VELOCITY_BAND.MODERATE, `ratio=${ratio}: expected band 1, got ${d.band}`);
    assert.ok(d.count <= VL_COUNT_MAX, `ratio=${ratio}: count ${d.count} > ${VL_COUNT_MAX}`);
    assert.ok(d.targetOpacity <= VL_ALPHA_MAX, `ratio=${ratio}: alpha ${d.targetOpacity} > ${VL_ALPHA_MAX}`);
    assert.ok(d.lenScale <= 0.65, `ratio=${ratio}: band-1 motes must stay SHORT, got ${d.lenScale}`);
    assert.equal(d.parallaxGain, 0, `ratio=${ratio}: the world does not stream yet in band 1`);
    assert.equal(d.grain, 0, `ratio=${ratio}: no field behaviour below band 3`);
  }
  // The band exists at all: at its top it must actually be showing motes, or "sparse" has quietly
  // become "absent" and band 1 is a dead range.
  assert.ok(drive(VL_BAND2_AT).count >= 20, 'top of band 1 should reach its designed density');
});

// ---------------------------------------------------------------- band 2 changes VOCABULARY
check('band 2 (2-5x) trades streaks for world streaming rather than raising intensity', () => {
  const lo = drive(VL_BAND2_AT + 0.05);
  const hi = drive(VL_BAND3_AT);
  assert.equal(lo.band, VELOCITY_BAND.HIGH, 'low end of band 2 misclassified');
  assert.ok(hi.count < lo.count,
    `streaks must get FEWER across band 2, got ${lo.count} -> ${hi.count}`);
  assert.ok(hi.lenScale > lo.lenScale,
    `streaks must get slightly LONGER across band 2, got ${lo.lenScale} -> ${hi.lenScale}`);
  assert.ok(hi.lenScale <= VL_LEN_SCALE_MAX,
    `length must STOP growing at ${VL_LEN_SCALE_MAX}, got ${hi.lenScale}`);
  assert.ok(hi.parallaxGain > lo.parallaxGain,
    'background parallax must become the load-bearing cue across band 2');
  assert.ok(Math.abs(hi.parallaxGain - VL_PARALLAX_GAIN_MAX) < 1e-6,
    `parallax gain should reach full by the top of band 2, got ${hi.parallaxGain}`);
  assert.ok(hi.targetOpacity <= lo.targetOpacity,
    'band 2 must not answer speed with brightness');
});

// ---------------------------------------------------------------- THE INVERSION (the load-bearing pin)
// D7's whole idea: at extreme velocity individual particles are physically invisible, so the streaks
// must fade OUT. Any future "it should be more visible when I am going fast" tweak reverses exactly
// this, which is why it is pinned three different ways rather than once.
check('INVERSION: band 3 produces strictly FEWER streaks than band 2', () => {
  let band2Min = Infinity;
  let band3Max = -Infinity;
  for (const ratio of BAND_SAMPLES.band2) band2Min = Math.min(band2Min, drive(ratio).count);
  for (const ratio of BAND_SAMPLES.band3) band3Max = Math.max(band3Max, drive(ratio).count);
  assert.ok(band3Max < band2Min || band3Max <= band2Min,
    `band 3 max count ${band3Max} must not exceed band 2 min count ${band2Min}`);

  // Representative mid-band comparison — strict, and immune to the shared value at the exact seam.
  const mid2 = drive(3.5);
  const mid3 = drive(7.5);
  assert.ok(mid3.count < mid2.count,
    `mid band 3 (${mid3.count} streaks) must be strictly fewer than mid band 2 (${mid2.count})`);
  assert.ok(mid3.targetOpacity < mid2.targetOpacity,
    `mid band 3 alpha ${mid3.targetOpacity} must be below mid band 2 ${mid2.targetOpacity}`);

  // And the count must be NON-INCREASING all the way up from the band-2 peak — no local rebound.
  let prev = Infinity;
  for (let r = VL_BAND2_AT; r <= 30; r += 0.05) {
    const c = drive(r).count;
    assert.ok(c <= prev + 1e-9, `count rebounded at ratio ${r.toFixed(2)}: ${prev} -> ${c}`);
    prev = c;
  }
});

check('band 3 replaces particles with FIELD behaviour', () => {
  const top = drive(VL_TAPER_END);
  assert.equal(top.band, VELOCITY_BAND.EXTREME, 'taper end misclassified');
  assert.ok(Math.abs(top.grain - VL_GRAIN_MAX) < 1e-6,
    `grain should reach ${VL_GRAIN_MAX} (D7's "~4%"), got ${top.grain}`);
  assert.ok(top.grain <= VL_GRAIN_MAX, 'grain ceiling breached');
  assert.ok(top.cameraLeadWU > 0 && top.cameraLeadWU <= VL_CAMERA_LEAD_WU_MAX,
    `camera lead ${top.cameraLeadWU} outside (0, ${VL_CAMERA_LEAD_WU_MAX}]`);
  assert.ok(top.shakeScale < 1, `shake must be REDUCED at extreme speed, got ${top.shakeScale}`);
  assert.ok(top.targetOpacity <= 0.05, `streaks must be all but gone, alpha ${top.targetOpacity}`);
  // Grain is a UNIFORM field. A radial or peripheral falloff is the twice-rejected visor framing, so
  // the record must not carry anything a caller could build one from.
  for (const banned of ['vignette', 'radius', 'falloff', 'edgeFade', 'innerRadius', 'outerRadius']) {
    assert.ok(!(banned in top), `record exposes '${banned}' — that is vignette/visor vocabulary`);
  }
});

// ---------------------------------------------------------------- compositing and saturation
check('every band composites NORMALLY — additive white saturation is gone', () => {
  for (const list of Object.values(BAND_SAMPLES)) {
    for (const ratio of list) {
      for (const boosting of [false, true]) {
        const d = drive(ratio, boosting);
        assert.equal(d.composite, VL_COMPOSITE,
          `ratio=${ratio} boost=${boosting}: composite '${d.composite}' is not '${VL_COMPOSITE}'`);
        assert.notEqual(d.composite, 'lighter', 'additive compositing must never return');
        assert.ok(d.maxAlpha <= VL_ALPHA_MAX,
          `ratio=${ratio}: alpha ${d.maxAlpha} above the band cap ${VL_ALPHA_MAX}`);
        assert.ok(d.maxAlpha < 1, 'no band may reach opaque');
      }
    }
  }
});

// ---------------------------------------------------------------- continuity across the seams
// Smoothness IS the effect (D7: "smoothness and quiet read as terrifying speed"). A step at a band
// boundary is the exact "cheap" tell the redesign exists to remove, and it is invisible to any test
// that samples band interiors only.
check('no channel steps at a band seam', () => {
  const EPS = 1e-4;
  for (const edge of [VL_BAND1_AT, VL_BAND2_AT, VL_BAND3_AT, VL_TAPER_END]) {
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
// Not inherited from the legacy section. Several band ramps DESCEND with speed, so a NaN clamped to
// zero PROGRESS would evaluate them at their bright end — this asserts the entry-point screening
// that prevents it.
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
        // The band record must also respect the legacy ceilings — it is drawn by the same canvas.
        assert.ok(d.count <= SL_STREAK_MAX && d.targetOpacity <= SL_OPACITY_MAX
          && d.maxAlpha <= SL_ALPHA_MAX && d.lenScale <= SL_LEN_SCALE_MAX && d.flowSpeed <= SL_FLOW_MAX,
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
        for (const key of ['count', 'targetOpacity', 'grain', 'parallaxGain', 'smear', 'flowSpeed',
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
  assert.ok(quiet.grain < loud.grain, 'band-3 field must be reduced under motionReduce');
  assert.equal(quiet.cameraLeadWU, 0, 'camera lead must be fully suppressed under motionReduce');
});

// ---------------------------------------------------------------- band classification
check('band classification matches the D7 thresholds exactly', () => {
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
// that factor, at precisely the speed the player is going fastest. That is the D7 "no additive white
// saturation" prohibition, reached from the direction nobody is watching. `dim * stretch === 1` is
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
  // It ramps up through band 2 and holds at full through band 3 — the world keeps streaming while
  // the particles fade out, which is the inversion the whole redesign is built on.
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
    const viaSeam = speedLineDrive(0.5 * MAX_SPEED, MAX_SPEED, false, false);
    assert.equal(viaSeam.count, 0, 'flag-on cruise at 0.5x must be SILENT (band 0), not 17 streaks');
    assert.equal(viaSeam.composite, VL_COMPOSITE, 'flag-on seam must composite normally');
    const fast = speedLineDrive(7.5 * MAX_SPEED, MAX_SPEED, false, false);
    assert.equal(fast.band, VELOCITY_BAND.EXTREME, 'flag-on 7.5x must reach band 3 through the seam');
  } finally {
    // Restore, or every assertion after this point silently tests the wrong branch.
    VELOCITY_LANGUAGE_FLAGS.bands = saved;
  }
  assert.equal(VELOCITY_LANGUAGE_FLAGS.bands, false, 'flag must be restored after the routing probe');
});

// ---------------------------------------------------------------- band evidence table
console.log('\nVELOCITY LANGUAGE (D7) — maxSpeed=150, motionReduce=off, boosting=false');
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
