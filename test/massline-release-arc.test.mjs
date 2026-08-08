import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MASSLINE_RELEASE_ARC_SEGMENT_CAPACITY,
  MASSLINE_RELEASE_QUALITIES,
  createMasslineReleaseArcScratch,
  resolveMasslineReleaseArcPlan,
  writeMasslineReleaseArcGeometry,
} from '../src/render/masslineReleaseArc.js';

const TAU = Math.PI * 2;

test('release annulus stays on the captured world target and keeps anticipation distinct from ratings', () => {
  const scratch = createMasslineReleaseArcScratch();
  const input = releaseInput();
  const before = structuredClone(input);

  const plan = resolveMasslineReleaseArcPlan(scratch.plan, input);

  assert.equal(plan, scratch.plan, 'the hot-path resolver must reuse its caller-owned plan');
  assert.equal(plan.visible, true);
  assert.equal(plan.stage, 'approaching');
  assert.equal(plan.quality, null, 'a predictor window is anticipation, not a fabricated release rating');
  assert.equal(plan.targetKind, 'entity');
  assert.equal(plan.targetId, 77);
  assert.equal(plan.centerX, 840, 'entity targets use the live world position');
  assert.equal(plan.centerZ, -315);
  assert.equal(plan.radius, 23, 'the annulus clears the live target hull by the authored padding');
  assert.equal(plan.windowOpen, false);
  assert.ok(plan.proximity > 0 && plan.proximity < 1);
  assert.deepEqual(input, before, 'presentation planning must not mutate predictor or live state');
});

test('messy/good/clean/razor are preserved and differ redundantly without relying on color', () => {
  assert.deepEqual(MASSLINE_RELEASE_QUALITIES, ['messy', 'good', 'clean', 'razor']);
  const scratch = createMasslineReleaseArcScratch();
  const reads = [];

  for (const quality of MASSLINE_RELEASE_QUALITIES) {
    const input = releaseInput({ classification: quality, timeS: 0.25 });
    const plan = resolveMasslineReleaseArcPlan(scratch.plan, input);
    reads.push({
      quality: plan.quality,
      shape: plan.shape,
      bandWidth: plan.bandWidth,
      laneCount: plan.laneCount,
      segmentCount: plan.segmentCount,
      cadenceHz: plan.cadenceHz,
      brightness: plan.brightness,
    });
  }

  assert.deepEqual(reads.map((read) => read.quality), MASSLINE_RELEASE_QUALITIES);
  assert.equal(new Set(reads.map((read) => read.shape)).size, 4, 'each producer rating keeps a shape read');
  assert.ok(strictlyDescending(reads.map((read) => read.bandWidth)), 'better releases draw a tighter band');
  assert.ok(nonDecreasing(reads.map((read) => read.laneCount)), 'better releases add structural lanes');
  assert.ok(strictlyAscending(reads.map((read) => read.segmentCount)), 'better releases refine the silhouette');
  assert.ok(strictlyAscending(reads.map((read) => read.cadenceHz)), 'cadence carries quality independently');
  assert.ok(strictlyAscending(reads.map((read) => read.brightness)), 'brightness carries quality independently');

  const animated = resolveMasslineReleaseArcPlan(
    scratch.plan,
    releaseInput({ classification: 'razor', timeS: 0.07 }),
  );
  assert.ok(animated.phaseRad >= 0 && animated.phaseRad < animated.spanRad / animated.segmentCount,
    'cadence advances within one dash step instead of rotating every ring edge through the camera');
});

test('geometry writes a caller-owned world-space annulus without replacing typed arrays', () => {
  const scratch = createMasslineReleaseArcScratch(MASSLINE_RELEASE_ARC_SEGMENT_CAPACITY);
  const positions = scratch.geometry.positions;
  const colors = scratch.geometry.colors;
  const indices = scratch.geometry.indices;
  const plan = resolveMasslineReleaseArcPlan(scratch.plan, releaseInput({ classification: 'clean' }));

  const geometry = writeMasslineReleaseArcGeometry(scratch.geometry, plan);

  assert.equal(geometry, scratch.geometry);
  assert.equal(geometry.positions, positions);
  assert.equal(geometry.colors, colors);
  assert.equal(geometry.indices, indices);
  assert.ok(geometry.segmentCount > 0);
  assert.equal(geometry.vertexCount, geometry.segmentCount * 4);
  assert.equal(geometry.indexCount, geometry.segmentCount * 6);
  assert.ok(geometry.segmentCount <= geometry.segmentCapacity);

  for (let vertex = 0; vertex < geometry.vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    const radial = Math.hypot(x - plan.centerX, z - plan.centerZ);
    assert.ok(radial >= plan.innerRadius - 1e-4 && radial <= plan.outerRadius + 1e-4,
      `vertex ${vertex} stays inside the planned annulus (${radial})`);
    assert.equal(y, plan.y);
  }
  assert.ok(Math.abs(positions[0]) > 100 && Math.abs(positions[2]) > 100,
    'positions remain in galactic world space; vfx owns any frame-local projection');
  assert.ok(colors.slice(0, geometry.vertexCount * 3).some((value) => value > 0),
    'the preallocated annulus carries vertex color/radiance instead of a flat material-only tint');
  assert.ok(colors[0] > colors[3] || colors[1] > colors[4] || colors[2] > colors[5],
    'inner and outer vertices preserve a hot-core/soft-sheath read');

  resolveMasslineReleaseArcPlan(scratch.plan, releaseInput({ classification: 'razor', timeS: 9 }));
  writeMasslineReleaseArcGeometry(scratch.geometry, scratch.plan);
  assert.equal(scratch.geometry.positions, positions, 'a later frame reuses the same position buffer');
  assert.equal(scratch.geometry.colors, colors, 'a later frame reuses the same color buffer');
  assert.equal(scratch.geometry.indices, indices, 'a later frame reuses the same index buffer');
});

test('reduced-motion and reduced-flash freeze cadence while retaining the quality distinctions', () => {
  const scratch = createMasslineReleaseArcScratch();
  const early = releaseInput({ classification: 'razor', reducedMotion: true, timeS: 1 });
  resolveMasslineReleaseArcPlan(scratch.plan, early);
  writeMasslineReleaseArcGeometry(scratch.geometry, scratch.plan);
  const first = scratch.geometry.positions.slice(0, scratch.geometry.vertexCount * 3);
  const firstBrightness = scratch.plan.brightness;

  resolveMasslineReleaseArcPlan(scratch.plan, { ...early, timeS: 999 });
  writeMasslineReleaseArcGeometry(scratch.geometry, scratch.plan);

  assert.equal(scratch.plan.reducedMotion, true);
  assert.equal(scratch.plan.cadenceHz, 0);
  assert.equal(scratch.plan.phaseRad, 0);
  assert.equal(scratch.plan.pulse, 1);
  assert.equal(scratch.plan.brightness, firstBrightness);
  assert.deepEqual(
    scratch.geometry.positions.slice(0, scratch.geometry.vertexCount * 3),
    first,
    'reduced-motion is a stable spatial read, not a slower animation',
  );
  assert.equal(scratch.plan.shape, 'triple-needle');
  assert.equal(scratch.plan.quality, 'razor');

  const flashReduced = releaseInput({
    classification: 'clean', reducedFlash: true, reducedMotion: false, timeS: 1,
  });
  resolveMasslineReleaseArcPlan(scratch.plan, flashReduced);
  writeMasslineReleaseArcGeometry(scratch.geometry, scratch.plan);
  const flashFirst = scratch.geometry.positions.slice(0, scratch.geometry.vertexCount * 3);
  resolveMasslineReleaseArcPlan(scratch.plan, { ...flashReduced, timeS: 999 });
  writeMasslineReleaseArcGeometry(scratch.geometry, scratch.plan);
  assert.equal(scratch.plan.reducedMotion, false);
  assert.equal(scratch.plan.reducedFlash, true);
  assert.equal(scratch.plan.cadenceHz, 0);
  assert.equal(scratch.plan.phaseRad, 0);
  assert.equal(scratch.plan.pulse, 1);
  assert.deepEqual(
    scratch.geometry.positions.slice(0, scratch.geometry.vertexCount * 3),
    flashFirst,
    'reduced-flash never leaves a moving/strobing annulus behind a lower opacity',
  );
});

test('invalid predictor/target/rating fails closed and clears the preallocated draw range', () => {
  const scratch = createMasslineReleaseArcScratch();
  const valid = releaseInput({ classification: 'good' });
  resolveMasslineReleaseArcPlan(scratch.plan, valid);
  writeMasslineReleaseArcGeometry(scratch.geometry, scratch.plan);
  assert.ok(scratch.geometry.indexCount > 0, 'precondition: a valid plan emits geometry');

  resolveMasslineReleaseArcPlan(scratch.plan, releaseInput({ classification: 'legendary' }));
  writeMasslineReleaseArcGeometry(scratch.geometry, scratch.plan);
  assert.equal(scratch.plan.visible, false);
  assert.equal(scratch.plan.reason, 'unsupported-quality');
  assert.equal(scratch.geometry.segmentCount, 0);
  assert.equal(scratch.geometry.vertexCount, 0);
  assert.equal(scratch.geometry.indexCount, 0);

  resolveMasslineReleaseArcPlan(scratch.plan, releaseInput({
    classification: null,
    predictor: { valid: false },
  }));
  assert.equal(scratch.plan.visible, false);
  assert.equal(scratch.plan.reason, 'no-live-predictor');

  resolveMasslineReleaseArcPlan(scratch.plan, releaseInput({ liveTarget: null }));
  assert.equal(scratch.plan.visible, false);
  assert.equal(scratch.plan.reason, 'no-world-target');
});

function releaseInput(overrides = {}) {
  const base = {
    active: true,
    releaseTarget: {
      kind: 'entity', source: 'selection', targetId: 77, pos: null, radius: 0,
    },
    liveTarget: {
      id: 77, alive: true, pos: { x: 840, z: -315 }, radius: 19,
    },
    predictor: {
      valid: true,
      onSolution: false,
      errorRad: 0.08,
      tolRad: 0.02,
      timeToSolution: 0.32,
      predicted: { x: 842, z: -314 },
    },
    classification: null,
    radiusPadding: 4,
    y: 1.5,
    timeS: 2,
    reducedMotion: false,
    reducedFlash: false,
    startAngle: 0,
    spanRad: TAU,
  };
  return { ...base, ...overrides };
}

function strictlyAscending(values) {
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

function strictlyDescending(values) {
  return values.every((value, index) => index === 0 || value < values[index - 1]);
}

function nonDecreasing(values) {
  return values.every((value, index) => index === 0 || value >= values[index - 1]);
}
