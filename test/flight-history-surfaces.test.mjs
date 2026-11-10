// Flight-history class: the recorder's storage, its frame, its join with the live jet, and the
// NPC wake ribbon's cross-section.
//
// The load-bearing rule in this family is the immutability law (B15 / E2): a recorded sample is a
// fact about where an emitting nozzle actually was, and nothing — not a turn, not a stop, not the
// throttle, not the jet handing over — may move it, resize it retroactively, or invent one. Most of
// what follows exists to hold that line while the surface around it got better.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  ContrailTrail,
  CURVE_GATE_MIN_FRACTION,
  MIN_STEP_WU,
  SEAM_MAX_LIFE_FRACTION,
} from '../src/render/thruster/ribbon/contrailTrail.js';
import { resolveJetHandoff } from '../src/render/thruster/ribbon/driveEnvelope.js';
import { createPathSampler } from '../src/render/thruster/systems/pathSampler.js';
import {
  RIBBON_ARCH_RAD,
  createRibbonTrail,
} from '../src/render/engineTrailSurfaces.js';
import { sampleLuminousTrailLayers } from '../src/render/trailTexture.js';

const BURN = {
  drive: 1, emitFloor: 0.02, boost: 0, dash: 0,
  throatRadius: 1.32, spread: 2.6, radiance: 1.12, jetLength: 17,
};

/** Fly a straight line at a fixed step, returning the recorder. */
function flyStraight(trail, { steps = 80, step = 1.2, env = BURN } = {}) {
  const nozzle = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < steps; i++) {
    nozzle.x += step;
    trail.update(1 / 60, nozzle, env);
  }
  return trail;
}

test('the ring never moves a recorded fact: reading order is a cursor, not a copy', () => {
  // A buffer smaller than the flight forces the head to wrap several times. If insertion were
  // still shifting the window, a wrap would scramble the newest-first ordering.
  const trail = new ContrailTrail(THREE, { samples: 8, trailSeconds: 10 });
  const nozzle = { x: 0, y: 0, z: 0 };
  const laid = [];
  for (let i = 0; i < 6; i++) {
    nozzle.x += 1;
    trail.update(1 / 60, nozzle, BURN);
    laid.push(nozzle.x);
  }
  const samples = trail.samplePositions();
  assert.equal(samples.length, 6);
  // Newest first, and every one is exactly a position the nozzle occupied.
  for (let i = 0; i < samples.length; i++) {
    assert.equal(samples[i].x, laid[laid.length - 1 - i], `sample ${i} is not the fact laid down`);
  }
  assert.equal(trail.inspect().storage, 'ring');
  assert.equal(trail.inspect().sampleShifts, 0, 'no fact is copied between texels');
  trail.dispose();
});

test('a rebased render frame carries the wake with it instead of stranding it', () => {
  // The render frame is re-pegged every 8192 WU. Without this the whole player wake was left
  // behind at the old origin and the ship flew out of its own history.
  const trail = new ContrailTrail(THREE, {});
  flyStraight(trail, { steps: 30, step: 1.5 });
  const before = trail.samplePositions();
  const segmentsBefore = new Set(before.map((s) => s.segment));
  assert.ok(before.length > 10);

  trail.reproject(-8192, 4096);
  const after = trail.samplePositions();

  assert.equal(after.length, before.length, 'a rebase must not retire or invent a single sample');
  for (let i = 0; i < before.length; i++) {
    assert.ok(Math.abs(after[i].x - (before[i].x - 8192)) < 1e-3, `sample ${i} x did not rebase`);
    assert.equal(after[i].y, before[i].y, `sample ${i} y must not move`);
    assert.ok(Math.abs(after[i].z - (before[i].z + 4096)) < 1e-3, `sample ${i} z did not rebase`);
    assert.ok(Math.abs(after[i].age - before[i].age) < 1e-6, `sample ${i} was re-aged`);
  }
  assert.deepEqual(new Set(after.map((s) => s.segment)), segmentsBefore,
    'a rebase is the same places in new coordinates, not a discontinuity');

  // And the sampling gate rebases with it: the next frame is an ordinary step, not a teleport.
  const liveAfter = trail.liveSampleCount();
  trail.update(1 / 60, { x: 30 * 1.5 - 8192 + 1.5, y: 0, z: 4096 }, BURN);
  const restarted = trail.samplePositions();
  assert.equal(restarted[0].segment, restarted[1].segment,
    'a rebase must not read as a teleport and split the burn');
  assert.equal(restarted.length, liveAfter + 1);
  trail.dispose();
});

test('the path sampler rebases with the same rule', () => {
  const sampler = createPathSampler(16);
  const owner = { id: 'rebase' };
  for (let i = 0; i < 12; i++) sampler.follow(i * 4, 0, 0, 1 / 60, owner, 2, 640, 1 / 30);
  const before = sampler.inspect();
  sampler.reproject(-8192, 100);
  const after = sampler.inspect();
  assert.equal(after.historyCount, before.historyCount, 'a rebase drops no history');
  assert.ok(Math.abs(after.liveX - (before.liveX - 8192)) < 1e-3);
  assert.ok(Math.abs(after.liveZ - (before.liveZ + 100)) < 1e-3);
  // The next follow() must not see the delta as a jump and reseed.
  assert.equal(sampler.follow(after.liveX + 1, after.liveZ, 0, 1 / 60, owner, 2, 640, 1 / 30), true);
  assert.equal(sampler.inspect().historyCount, after.historyCount);
});

test('width belongs to the sample, not to the live throttle', () => {
  // The size uniforms describe the bell at FULL drive; the vertex stage re-applies each sample's
  // own recorded drive. Easing off the throttle must not thin light already laid down.
  const trail = new ContrailTrail(THREE, {});
  const u = trail.material.uniforms;
  flyStraight(trail, { steps: 20, step: 1.5, env: BURN });
  const hot = u.uRadiusHead.value;

  const eased = { ...BURN, drive: 0.25, throatRadius: 1.32 * (0.72 + 0.25 * 0.28) };
  const nozzle = { x: 40, y: 0, z: 0 };
  for (let i = 0; i < 5; i++) {
    nozzle.x += 1.5;
    trail.update(1 / 60, nozzle, eased);
  }
  assert.ok(Math.abs(u.uRadiusHead.value - hot) < 1e-3,
    `the full-drive reference width must not follow the throttle (${hot} -> ${u.uRadiusHead.value})`);
  assert.equal(trail.inspect().birthWidth, true);
  // And the per-sample drive that reconstructs it is on the record.
  const samples = trail.samplePositions();
  assert.ok(samples.some((s) => s.drive > 0.9), 'samples born at full burn keep that drive');
  assert.ok(samples.some((s) => s.drive < 0.3), 'samples born eased off keep that drive');
  trail.dispose();
});

test('curvature-aware sampling adds detail on a bend and changes nothing on a straight line', () => {
  const straightFlat = new ContrailTrail(THREE, {});
  const straightSlow = new ContrailTrail(THREE, {});
  // A creep below the gate on a straight line must still record nothing extra.
  const creep = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 120; i++) {
    creep.x += MIN_STEP_WU * 0.4;
    straightSlow.update(1 / 60, creep, BURN);
  }
  const slowSamples = straightSlow.samplePositions();
  for (let i = 1; i < slowSamples.length; i++) {
    const d = Math.hypot(slowSamples[i - 1].x - slowSamples[i].x, slowSamples[i - 1].z - slowSamples[i].z);
    assert.ok(d >= MIN_STEP_WU - 1e-4,
      `a straight creep must keep the full step gate (got ${d.toFixed(4)} WU)`);
  }

  // The same speed through a hard pivot: the gate shortens, so the turn records its shape.
  const pivot = new ContrailTrail(THREE, {});
  const p = { x: 0, y: 0, z: 0 };
  let heading = 0;
  for (let i = 0; i < 120; i++) {
    heading += 0.42;
    p.x += Math.cos(heading) * MIN_STEP_WU * 0.4;
    p.z += Math.sin(heading) * MIN_STEP_WU * 0.4;
    pivot.update(1 / 60, p, BURN);
  }
  assert.ok(pivot.liveSampleCount() > straightSlow.liveSampleCount(),
    `a hard pivot must earn more detail than a straight creep at the same speed `
      + `(pivot ${pivot.liveSampleCount()} vs straight ${straightSlow.liveSampleCount()})`);

  // But never below the shortened floor, and never more than one fact per update.
  const pivotSamples = pivot.samplePositions();
  for (let i = 1; i < pivotSamples.length; i++) {
    const d = Math.hypot(pivotSamples[i - 1].x - pivotSamples[i].x,
      pivotSamples[i - 1].z - pivotSamples[i].z);
    assert.ok(d >= MIN_STEP_WU * CURVE_GATE_MIN_FRACTION - 1e-4,
      `the bend gate has a floor (got ${d.toFixed(4)} WU)`);
  }
  assert.ok(pivot.liveSampleCount() <= 120, 'the one-sample-per-update ceiling is unchanged');

  straightFlat.dispose();
  straightSlow.dispose();
  pivot.dispose();
});

test('the jet handoff flares the mouth without moving one recorded position', () => {
  // Two identical flights, one with a jet handing over and one without. The SURFACE differs; the
  // record must be bit-identical, because E5 is a rendering agreement and B15 is a law.
  const withJet = new ContrailTrail(THREE, {});
  const bare = new ContrailTrail(THREE, {});
  const noJet = { ...BURN, throatRadius: 0, spread: 0, radiance: 0 };
  flyStraight(withJet, { steps: 40, step: 2.0, env: BURN });
  flyStraight(bare, { steps: 40, step: 2.0, env: noJet });

  const a = withJet.samplePositions();
  const b = bare.samplePositions();
  assert.equal(a.length, b.length, 'the handoff must not change WHETHER a fact is recorded');
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].x, b[i].x, `handoff moved sample ${i} in x`);
    assert.equal(a[i].y, b[i].y, `handoff moved sample ${i} in y`);
    assert.equal(a[i].z, b[i].z, `handoff moved sample ${i} in z`);
  }

  const u = withJet.material.uniforms;
  assert.ok(u.uSeamAge.value > 0, 'a firing jet hands over');
  assert.ok(u.uSeamAge.value <= SEAM_MAX_LIFE_FRACTION + 1e-9,
    'the overlap is a join, not a mood: it is capped well inside the history');
  const handoff = resolveJetHandoff(null, BURN);
  assert.ok(Math.abs(u.uSeamHalfWidth.value - handoff.widthWU * 0.5) < 1e-6,
    'the mouth is sized to the jet lane s own terminal width, not to a guess');
  // Radiance crosses as a ratio, never as the jet's absolute value: the two shaders are not the
  // same quantity and importing the number outright darkens the mouth by roughly eight times.
  assert.ok(u.uSeamEnergy.value > 0.5 && u.uSeamEnergy.value < 2.0,
    `hand-over energy is dimensionless, got ${u.uSeamEnergy.value}`);
  assert.notEqual(u.uSeamEnergy.value, handoff.radiance);

  withJet.dispose();
  bare.dispose();
});

test('a stopped ship keeps a still seam: the overlap has no clock of its own', () => {
  const trail = new ContrailTrail(THREE, {});
  flyStraight(trail, { steps: 30, step: 2.0 });
  const u = trail.material.uniforms;
  const parked = { x: 60, y: 0, z: 0 };
  const phaseAtStop = u.uSeamPhase.value;
  const before = trail.samplePositions();
  // plasmaStream now feeds the plume's own flow clock through env.time, so resolveJetHandoff
  // returns a genuinely advancing phase. The recorder must still not move: it latches only on the
  // frames a fact is recorded, and a ship holding station records nothing.
  let clock = 0;
  for (let i = 0; i < 20; i++) {
    clock += 1 / 60;
    trail.update(1 / 60, parked, { ...BURN, time: clock });
  }
  assert.equal(u.uSeamPhase.value, phaseAtStop,
    'the seam motif advances with emission, never with time');
  const after = trail.samplePositions();
  for (let i = 0; i < before.length; i++) {
    assert.equal(after[i].x, before[i].x, `sample ${i} moved while the ship held station`);
    assert.equal(after[i].z, before[i].z, `sample ${i} moved while the ship held station`);
  }
  trail.dispose();
});

test('the recorder shaders still carry no clock and no second bright head', () => {
  const trail = new ContrailTrail(THREE, {});
  const vert = trail.material.vertexShader;
  const frag = trail.material.fragmentShader;
  assert.doesNotMatch(vert, /\buTime\b/, 'history has no clock');
  assert.doesNotMatch(frag, /\buTime\b/, 'history has no clock');
  // The recorder's own sear peaks at age zero, exactly where the jet is already burning its head.
  assert.match(frag, /sear \*= 1\.0 - vSeam/,
    'E5: the recorder must stand its own head down across the overlap, leaving one head at the bell');
  // Widening for a stable screen footprint has to be paid back out of radiance, or a receding
  // wake gains energy into the bloom pass.
  assert.match(frag, /rad \*= vWidthGain/, 'the min-width widening must be energy-compensated');
  assert.equal(trail.inspect().temporalModulation, false);
  assert.equal(trail.inspect().advectsAft, false);
  assert.equal(trail.inspect().retention, 'time-only');
  trail.dispose();
});

test('the NPC wake ribbon has an arched cross-section and reads its view term per fragment', () => {
  const scene = new THREE.Scene();
  const trail = createRibbonTrail(scene, '#7fe0ff', 24, 3);
  const mesh = trail.getMesh();
  const owner = { id: 'arch' };

  // Drive it through a turn so the bank term is exercised.
  let x = 0;
  let z = 0;
  let yaw = 0;
  for (let i = 0; i < 24; i++) {
    yaw += 0.16;
    x += Math.cos(yaw) * 5;
    z += Math.sin(yaw) * 5;
    trail.follow(x, z, yaw, 1 / 60, owner, 3, 640, 1 / 30);
    trail.rebuild(0.8, 0.1, i * 0.02, 1.7);
  }

  const normals = mesh.geometry.attributes.aTrailNormal.array;
  const count = trail.inspect().renderedCount;
  assert.ok(count >= 4, `expected a built ribbon, got ${count} stations`);

  let sawOpposedFlanks = false;
  let sawBank = false;
  for (let i = 0; i < count; i++) {
    const a = i * 2 * 3;
    const b = (i * 2 + 1) * 3;
    const na = [normals[a], normals[a + 1], normals[a + 2]];
    const nb = [normals[b], normals[b + 1], normals[b + 2]];
    // Unit length, so the fragment stage can normalize an honest interpolation.
    assert.ok(Math.abs(Math.hypot(...na) - 1) < 1e-5, `edge normal ${i}A is not unit length`);
    assert.ok(Math.abs(Math.hypot(...nb) - 1) < 1e-5, `edge normal ${i}B is not unit length`);
    // Both flanks lean upward out of the sheet — this is an arch, not a flat panel and not a fan.
    assert.ok(na[1] > 0 && nb[1] > 0, `station ${i} normals must lean out of the sheet, not into it`);
    const dot = na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2];
    if (dot < Math.cos(RIBBON_ARCH_RAD)) sawOpposedFlanks = true;
    // The midpoint of the two flanks is the sheet's own up vector: that is the response the
    // MIDLINE has, and it is only available if the normal is interpolated and dotted per fragment.
    const midX = (na[0] + nb[0]) * 0.5;
    const midZ = (na[2] + nb[2]) * 0.5;
    assert.ok(Math.hypot(midX, midZ) < 0.35,
      `station ${i} midline normal must sweep through the sheet up vector`);
    // The old code stored the transverse horizontal, whose Y is exactly zero. That was the bug.
    assert.ok(na[1] > 1e-3, `station ${i} must not store a flat binormal as its surface normal`);

    const posArr = mesh.geometry.attributes.position.array;
    if (Math.abs(posArr[i * 6 + 1] - posArr[i * 6 + 4]) > 1e-4) sawBank = true;
  }
  assert.ok(sawOpposedFlanks, 'the two edges must genuinely oppose each other across the arch');
  assert.ok(sawBank, 'a turning wake must roll into its own turn so a top-down camera sees an angle');

  // The centerline is untouched by the roll: banking is cross-section, never a path edit.
  const pos = mesh.geometry.attributes.position.array;
  const headY = (pos[1] + pos[4]) * 0.5;
  assert.ok(Math.abs(headY - 0.4) < 1e-4, 'banking must be symmetric about the recorded centerline');

  const frag = trail.getMaterial().fragmentShader;
  assert.match(frag, /vTrailNormal/, 'the grazing term must be resolved from the interpolated normal');
  assert.match(frag, /normalize\(vTrailNormal\)/);
  assert.doesNotMatch(trail.getMaterial().vertexShader, /clamp\(1\.0 \/ max\(abs\(dot/,
    'collapsing the view term in the vertex stage hands the midline the average of the two flanks');
  trail.dispose();
});

test('the CPU trail twin mirrors the live view response instead of silently dropping it', () => {
  // Face-on is the default so every existing caller keeps the numbers it had.
  const faceOn = sampleLuminousTrailLayers(0.3, 0.2, 0.25, 0.5);
  assert.equal(faceOn.facing, 1);
  assert.ok(Math.abs(faceOn.grazeLift - 1) < 1e-9, 'face on, the arch adds nothing');

  const grazing = sampleLuminousTrailLayers(0.3, 0.2, 0.25, 0.5, { facing: 0.15 });
  assert.ok(grazing.grazing > faceOn.grazing, 'along the sheet there is more material in the line of sight');
  assert.ok(grazing.shoulder > faceOn.shoulder);
  assert.ok(grazing.alpha > faceOn.alpha, 'optical depth rises at grazing angles');
  assert.ok(grazing.radiance > faceOn.radiance, 'the shaded shoulder is part of the lit body');
  // Bounded: a ship yawing through the grazing angle must not flash. The ceiling is the grazing
  // lift the 2026-09-18 polish pass already shipped, times the small optical-depth term — the arch
  // itself must not raise it, because the arch redistributes rather than adds.
  const ceiling = grazing.grazeLift * grazing.depth;
  assert.ok(grazing.alpha / faceOn.alpha < ceiling,
    `the arch must not exceed the landed grazing lift: ${(grazing.alpha / faceOn.alpha).toFixed(3)}x `
      + `against a ceiling of ${ceiling.toFixed(3)}x`);
  assert.ok(grazing.grazing <= 4.2 + 1e-9);

  // Across the whole width the arch is energy neutral: integrate the sheet and the only growth
  // left is that same landed lift. This is the assertion that actually protects against a flash.
  let faceSum = 0;
  let grazeSum = 0;
  for (let side = -1; side <= 1.0001; side += 0.01) {
    faceSum += sampleLuminousTrailLayers(0.3, side, 0.25, 0.5).alpha;
    grazeSum += sampleLuminousTrailLayers(0.3, side, 0.25, 0.5, { facing: 0.15 }).alpha;
  }
  assert.ok(grazeSum / faceSum < ceiling,
    `width-integrated response must stay under the landed lift, got ${(grazeSum / faceSum).toFixed(3)}x`);

  // The flanks trade rather than add: an arch turns one side toward the eye and the other away, so
  // the pair's total is conserved and the sheet as a whole cannot gain energy from a yaw.
  for (const side of [-0.9, -0.4, 0, 0.4, 0.9]) {
    const s = sampleLuminousTrailLayers(0.3, side, 0.25, 0.5, { facing: 0.15 });
    assert.ok(Math.abs(s.flankA + s.flankB - 2) < 1e-9,
      `the flanks must trade, not add (side ${side}: ${s.flankA} + ${s.flankB})`);
  }
  const off = sampleLuminousTrailLayers(0.3, 0.6, 0.25, 0.5);
  assert.equal(off.flankA, 1, 'face on, neither flank leans');
  assert.equal(off.flankB, 1);
});
