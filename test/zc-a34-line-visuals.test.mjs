// ZC-A34 / build_map §33 row 492 — "The Line you can see". The tape of 2026-10-21 (frames 0042,
// 0379) measured the tether as a hairline at the shipping chase camera. This test evidences the
// parameter mapping that fixes it: strain → cable width (silhouette), strain → cable emissive
// (light), release-arc visibility while the Line is merely held, and the latch rim wearing the
// Line's own colour as light.
//
// Why a unit test and not a shot pair: scripts/flight-look.mjs stages only thrust/boost/fire acts
// (no tether latch) and scripts/fleet-look.mjs renders hulls with no tether at all, so neither
// harness can stage a latched line. The pixel model below is derived from the shipping camera
// (src/render/camera.js + src/render/tabletopPolicy.js DEFAULT_ZOOM 144 WU, 50° vertical FOV,
// 60° tilt) at the owner machine class viewport from docs/visual-assets/LOOK.md (1600×1000).
// The ~15% filament fraction is the ribbon shader's own documented cross-section (the pow 9–18
// core concentrates into the middle ~15% of the ribbon — src/render/vfx.js cable frame comment).
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLineClassCableProfile } from '../src/render/lineVisualProfile.js';
import { MASSLINE_LINE_COLOR, resolveForceNeonScale, resolveMasslineCableProfile, resolveMasslineCableRadiance } from '../src/render/masslinePresentation.js';
import {
  createMasslineReleaseArcGeometry,
  createMasslineReleaseArcPlan,
  resolveMasslineReleaseArcPlan,
  writeMasslineReleaseArcGeometry,
} from '../src/render/masslineReleaseArc.js';
import {
  MASSLINE_LATCH_RIM_COLOR,
  createMasslineLatchRim,
  resolveMasslineLatchRimPlan,
} from '../src/render/masslineLatchRim.js';

// --- the chase-camera pixel model -------------------------------------------------------------
const CHASE_WU = 144;   // src/render/tabletopPolicy.js DEFAULT_ZOOM (flight-look's default zoom)
const V_FOV_RAD = 50 * Math.PI / 180;   // src/render/camera.js default fov
const TILT_RAD = 60 * Math.PI / 180;    // chase tilt, src/render/camera.js
const VIEWPORT_H = 1000;                // docs/visual-assets/LOOK.md owner machine class 1600×1000
// A width lying in the play plane, perpendicular to the view axis, projects at sin(tilt).
const PX_PER_WU = (VIEWPORT_H / (2 * CHASE_WU * Math.tan(V_FOV_RAD / 2))) * Math.sin(TILT_RAD);
// The bright core filament spans ~15% of the core ribbon's full width (shader cross-section).
const FILAMENT_FRACTION = 0.15;
const px = (wu) => wu * PX_PER_WU;
const filamentPx = (coreHalfWidth) => px(coreHalfWidth * 2 * FILAMENT_FRACTION);

test('row 492: strain swells the cable cross-section enough to read at the chase camera', () => {
  const chord = 120;
  const quiet = resolveMasslineCableProfile({ chord, load: 0, taut: false });
  const strained = resolveMasslineCableProfile({ chord, load: 1, taut: true, whip: 0, reel: 0 });

  // The quiet line keeps its authored widths exactly (slack base 0.34, taut base 0.26).
  assert.equal(quiet.coreHalfWidth, 0.34);
  assert.equal(quiet.sheathHalfWidth, 0.62);
  // At full strain (taut, load 1) the load terms carry the width: 0.26 + 0.80 and 0.62 + 1.10.
  // Before this row the load terms were 0.08 / 0.55 — full core width moved only 0.52 → 0.68 WU,
  // a filament under a pixel wide at the chase camera (the measured hairline).
  assert.equal(strained.coreHalfWidth, 0.26 + 0.80);
  assert.equal(strained.sheathHalfWidth, 0.62 + 1.10);

  // Monotone in load, and the authored grammar survives: taut still reads thinner than slack at
  // equal load, so a quiet line is never fatter than a working one.
  let previous = -1;
  for (let load = 0; load <= 1.0001; load += 0.1) {
    const p = resolveMasslineCableProfile({ chord, load, taut: false });
    assert.ok(p.coreHalfWidth >= previous, 'core width must grow with load');
    assert.ok(p.sheathHalfWidth >= previous, 'sheath width must grow with load');
    previous = p.coreHalfWidth;
  }
  const slack = resolveMasslineCableProfile({ chord, load: 0, taut: false });
  const tautQuiet = resolveMasslineCableProfile({ chord, load: 0, taut: true });
  assert.ok(tautQuiet.coreHalfWidth < slack.coreHalfWidth);

  // Pixel read at the shipping chase camera (~6.45 px per in-plane WU at 1600×1000).
  assert.ok(PX_PER_WU > 6 && PX_PER_WU < 7, `px model drifted: ${PX_PER_WU}`);
  assert.ok(filamentPx(quiet.coreHalfWidth) < 1, 'a quiet line stays a fine filament');
  assert.ok(filamentPx(strained.coreHalfWidth) >= 2,
    `a heavy swing must read >= 2 px, got ${filamentPx(strained.coreHalfWidth)}`);
  // The coloured sheath (the halo skirt) grows with strain too: ~15 px -> ~22 px full width.
  assert.ok(px(quiet.sheathHalfWidth * 2) < px(strained.sheathHalfWidth * 2));

  // The line-class width multiplier still applies on top (lineProgression cableWidth 1..2.5).
  const scaled = applyLineClassCableProfile(
    { coreHalfWidth: strained.coreHalfWidth, sheathHalfWidth: strained.sheathHalfWidth },
    { width: 2, heat: 0 },
  );
  assert.equal(scaled.coreHalfWidth, strained.coreHalfWidth * 2);
  assert.equal(scaled.sheathHalfWidth, strained.sheathHalfWidth * 2);

  // Load ferrules swell with the same read (one language: collar crown carries the load).
  assert.ok(strained.collarCrownHalfWidth > quiet.collarCrownHalfWidth);
});

test('row 492: strain raises the cable emissive (core filament and sheath halo)', () => {
  const quiet = resolveMasslineCableRadiance({ load: 0, taut: false, whip: 0, reel: 0, heat: 0 });
  const strained = resolveMasslineCableRadiance({ load: 1, taut: true, whip: 0, reel: 0, heat: 0 });

  // The internal neon energy is the same force-neon law vfx.js multiplies by.
  assert.equal(strained.energy, resolveForceNeonScale('taut', { load: 1 }).energy);
  assert.ok(strained.energy > 2 && strained.energy <= 2.5);   // 1.15 + 1.35·load, taut
  // Values at the ends of the law: slack-quiet core 2.2·1.0525 (energy stays near hull-neutral
  // off-taut); fully strained taut core 4.8·2.5 (the old core law peaked at 3.9·2.5).
  assert.ok(Math.abs(quiet.core - 2.2 * (1 + 0.15 * 0.35)) < 1e-9);
  assert.equal(strained.core, (2.2 + 2.6) * 2.5);
  assert.equal(strained.sheath, (1.5 + 2.2) * 2.5);

  // Monotone in load; strain, whip and reel each add light, never remove it.
  let previousCore = 0;
  let previousSheath = 0;
  for (let load = 0; load <= 1.0001; load += 0.1) {
    const r = resolveMasslineCableRadiance({ load, taut: true });
    assert.ok(r.core >= previousCore && r.sheath >= previousSheath);
    previousCore = r.core;
    previousSheath = r.sheath;
  }
  assert.ok(resolveMasslineCableRadiance({ load: 0.5, whip: 0.4, taut: true }).core
    > resolveMasslineCableRadiance({ load: 0.5, taut: true }).core);
  assert.ok(resolveMasslineCableRadiance({ load: 0.5, reel: 0.6, taut: true }).sheath
    > resolveMasslineCableRadiance({ load: 0.5, taut: true }).sheath);

  // The over-class winch heat warning lifts only the halo (vfx keeps the filament's colour law).
  const cool = resolveMasslineCableRadiance({ load: 0.5, taut: true, heat: 0 });
  const hot = resolveMasslineCableRadiance({ load: 0.5, taut: true, heat: 0.8 });
  assert.equal(hot.core, cool.core);
  assert.ok(hot.sheath > cool.sheath);

  // Reduced-motion/flash damp the neon energy toward hull-neutral, exactly as the force-neon law.
  const reduced = resolveMasslineCableRadiance({ load: 1, taut: true, motionReduce: true });
  const plain = resolveMasslineCableRadiance({ load: 1, taut: true });
  assert.ok(reduced.core < plain.core);
  assert.ok(reduced.energy > 1);   // reduced, not dark
});

test('row 492: the release arc draws whenever the Line is held, and only then', () => {
  const target = { id: 7, alive: true, pos: { x: 10, z: -4 }, radius: 6 };

  // HELD: latched, carried, no aiming window, no rating — the quiet annulus in the Line colour.
  const held = createMasslineReleaseArcPlan();
  resolveMasslineReleaseArcPlan(held, { active: true, held: true, liveTarget: target, radiusPadding: 4 });
  assert.equal(held.visible, true);
  assert.equal(held.reason, 'ready');
  assert.equal(held.stage, 'held');
  assert.equal(held.shape, 'held-band');
  assert.equal(held.centerX, 10);
  assert.equal(held.centerZ, -4);
  assert.equal(held.radius, 10);                       // target radius 6 + padding 4
  // Quiet under the approaching ladder's floor (approaching brightness starts at 0.3).
  assert.ok(held.brightness < 0.3);
  assert.equal(held.colorR, MASSLINE_LINE_COLOR.r);
  assert.equal(held.colorG, MASSLINE_LINE_COLOR.g);
  assert.equal(held.colorB, MASSLINE_LINE_COLOR.b);

  // The pure geometry writer emits real quads for a held plan (the vfx receiver rides the plan).
  const geo = createMasslineReleaseArcGeometry();
  writeMasslineReleaseArcGeometry(geo, held);
  assert.equal(geo.segmentCount, 14);
  assert.ok(geo.indexCount > 0);

  // No clutter when nothing is latched: inactive input, or a held line whose target cannot be
  // resolved, both stay invisible (the latter fades out through vfx's arc.fade drain).
  const inactive = createMasslineReleaseArcPlan();
  resolveMasslineReleaseArcPlan(inactive, { active: false, held: true });
  assert.equal(inactive.visible, false);
  assert.equal(inactive.reason, 'inactive');
  const unresolved = createMasslineReleaseArcPlan();
  resolveMasslineReleaseArcPlan(unresolved, { active: true, held: true, liveTarget: null });
  assert.equal(unresolved.visible, false);
  assert.equal(unresolved.reason, 'no-world-target');

  // The legacy states keep their gating: no held flag and no predictor still fails closed.
  const legacy = createMasslineReleaseArcPlan();
  resolveMasslineReleaseArcPlan(legacy, { active: true, liveTarget: target });
  assert.equal(legacy.visible, false);
  assert.equal(legacy.reason, 'no-live-predictor');

  // A live predictor is more specific news than held: the armed aiming window wins.
  const aiming = createMasslineReleaseArcPlan();
  resolveMasslineReleaseArcPlan(aiming, {
    active: true, held: true,
    predictor: { valid: true, onSolution: false, errorRad: 0.2, tolRad: 0.05, predicted: { x: 1, z: 1 } },
    liveTarget: target,
  });
  assert.equal(aiming.visible, true);
  assert.equal(aiming.stage, 'approaching');
  assert.notEqual(aiming.shape, 'held-band');

  // A post-release classification outranks held as well.
  const released = createMasslineReleaseArcPlan();
  resolveMasslineReleaseArcPlan(released, {
    active: true, held: true, classification: 'clean', releaseScore: 1,
    releaseTarget: { pos: { x: 3, z: 3 }, radius: 6 },
  });
  assert.equal(released.visible, true);
  assert.equal(released.stage, 'released');
});

test('row 492: the latch rim wears the Line colour and reads as light', () => {
  // One colour for the whole Line family: rim, swing trace, release annulus (0.49, 0.89, 1).
  assert.equal(MASSLINE_LATCH_RIM_COLOR.r, MASSLINE_LINE_COLOR.r);
  assert.equal(MASSLINE_LATCH_RIM_COLOR.g, MASSLINE_LINE_COLOR.g);
  assert.equal(MASSLINE_LATCH_RIM_COLOR.b, MASSLINE_LINE_COLOR.b);

  const rim = createMasslineLatchRim();
  // Light, not paint: additive and untone-mapped, so the rim survives bright sector fills.
  assert.equal(rim.mesh.material.blending, 2 /* THREE.AdditiveBlending */);
  assert.equal(rim.mesh.material.toneMapped, false);

  // The plan still breathes with the published strain reads: load and whip each raise it.
  const tether = { active: true, targetId: 3 };
  const target = { alive: true, pos: { x: 1, z: 2 }, radius: 6 };
  const quietRim = resolveMasslineLatchRimPlan(tether, target, 0, 0, {});
  const loadedRim = resolveMasslineLatchRimPlan(tether, target, 0.8, 0.5, {});
  assert.equal(quietRim.visible, true);
  assert.ok(loadedRim.opacity > quietRim.opacity);
  assert.ok(loadedRim.bandScale > quietRim.bandScale);
  assert.ok(quietRim.opacity >= 0.42 && quietRim.opacity <= 1);

  // Not latched: the rim hides (no clutter when nothing is bound).
  const idle = resolveMasslineLatchRimPlan({ active: false }, target, 1, 1, {});
  assert.equal(idle.visible, false);
});
