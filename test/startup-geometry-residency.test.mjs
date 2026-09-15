import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  captureOpeningAdmissionIdentity,
  describeOpeningAdmissionIdentityDelta,
} from '../src/render/openingGpuAdmission.js';
import {
  collectStartupGeometryDrawables,
  prepareStartupGeometryResidency,
  prepareStartupGpuResidency,
} from '../src/render/startupGpuResidency.js';

const RENDERER_SOURCE = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

test('first-visible admission identity names late roots, leaves, materials, and program families', () => {
  const scene = new THREE.Scene();
  const planned = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  planned.name = 'planned-player-hull';
  const lateRoot = new THREE.Group();
  lateRoot.name = 'Civilian_Pod_47A';
  const lateMaterial = new THREE.MeshStandardMaterial();
  lateMaterial.name = 'CivilianPod_White_Ceramic';
  const lateLeaf = new THREE.Mesh(new THREE.BoxGeometry(), lateMaterial);
  lateLeaf.name = 'CivilianPod_Pressure_Capsule';
  lateRoot.add(lateLeaf);
  scene.add(planned, lateRoot);

  const materialProperties = new WeakMap();
  materialProperties.set(planned.material, { programs: new Map([['physical,STANDARD,PLANNED', {}]]) });
  materialProperties.set(lateMaterial, { programs: new Map() });
  const renderer = {
    info: { programs: [{ cacheKey: 'physical,STANDARD,PLANNED' }] },
    properties: { get: (material) => materialProperties.get(material) || {} },
  };
  const before = captureOpeningAdmissionIdentity(renderer, scene, {
    compileSubjects: [planned],
  });
  lateLeaf.geometry.addEventListener('dispose', () => {});
  materialProperties.get(lateMaterial).programs.set('physical,STANDARD,LATE', {});
  renderer.info.programs.push({ cacheKey: 'physical,STANDARD,LATE' }, { cacheKey: 'depth,LATE' });

  const delta = describeOpeningAdmissionIdentityDelta(before, renderer, scene, {
    compileSubjects: [planned],
  });
  assert.deepEqual(delta.newProgramFamilyKeys, ['depth', 'physical,STANDARD']);
  assert.equal(delta.lateAdmissions.length, 1);
  assert.deepEqual(delta.lateAdmissions[0], {
    root: 'Civilian_Pod_47A',
    object: 'CivilianPod_Pressure_Capsule',
    material: 'CivilianPod_White_Ceramic',
    materialType: 'MeshStandardMaterial',
    geometryAdmitted: true,
    programFamilyKeys: ['physical,STANDARD'],
    programKeys: ['physical,STANDARD,LATE'],
    planned: false,
    exempted: false,
    exemptionReason: null,
  });
  assert.deepEqual(delta.unattributedProgramFamilyKeys, ['depth']);
  assert.equal(delta.unexplained, true);

  const exempted = describeOpeningAdmissionIdentityDelta(before, renderer, scene, {
    compileSubjects: [planned],
  }, {
    exemptions: [{ root: 'Civilian_Pod_47A', reason: 'deliberate diagnostic fixture' }],
  });
  assert.equal(exempted.lateAdmissions[0].exempted, true);
  assert.equal(exempted.lateAdmissions[0].exemptionReason, 'deliberate diagnostic fixture');
  assert.equal(exempted.unexplained, true,
    'a named root exemption cannot silently accept an unattributed depth-program admission');
});

function createRendererHarness({ initGeometry } = {}) {
  const renderer = {
    info: { memory: { geometries: 5 } },
    initTexture() {},
    initGeometry(object) {
      if (initGeometry) initGeometry({ object, renderer });
    },
    render() {
      throw new Error('geometry residency must not render production or proxy scenes');
    },
  };
  return { renderer };
}

test('startup geometry census keeps every live instanced buffer owner sharing one geometry', () => {
  const root = new THREE.Group();
  const sharedGeometry = new THREE.BoxGeometry();
  const mesh = new THREE.Mesh(sharedGeometry, new THREE.MeshBasicMaterial());
  const firstInstances = new THREE.InstancedMesh(
    sharedGeometry, new THREE.MeshBasicMaterial(), 2,
  );
  const secondInstances = new THREE.InstancedMesh(
    sharedGeometry, new THREE.MeshBasicMaterial(), 3,
  );
  const line = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  line.geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
  const emptyInstances = new THREE.InstancedMesh(
    new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1,
  );
  emptyInstances.count = 0;
  const emptyRange = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  emptyRange.geometry.setDrawRange(0, 0);
  root.add(mesh, firstInstances, secondInstances, line, emptyInstances, emptyRange);

  assert.deepEqual(
    collectStartupGeometryDrawables([root, mesh]),
    [mesh, firstInstances, secondInstances, line],
    'duplicate roots are deduped, every live instance owner survives, and empty pools stay out',
  );
});

test('opening geometry admission uses the shared startup residency pass', () => {
  const start = RENDERER_SOURCE.indexOf('state.render.prepareOpeningGpuResources = async');
  const end = RENDERER_SOURCE.indexOf('// Collision/socket/landing debug toggle', start);
  assert.ok(start >= 0 && end > start, 'the opening GPU resource boundary must remain present');
  const openingAdmission = RENDERER_SOURCE.slice(start, end);
  assert.match(openingAdmission, /prepareStartupGpuResidency\(renderer, plan\.residencySubjects/);
  assert.doesNotMatch(openingAdmission, /includeGeometry:\s*false/,
    'OPENING cannot opt out of the buffer-class contract used by Continue');
  assert.doesNotMatch(openingAdmission, /result\.geometries\s*=\s*await admitOpeningUnitsAcrossSlices/,
    'OPENING cannot substitute geometry-deduped production-object touches for proxy admission');
  assert.equal(
    (openingAdmission.match(/createOpeningSubmissionReceipt\(/g) || []).length,
    1,
    'the admission-time GPU baseline must not be reset after yielding toward handoff',
  );

  const drawStart = RENDERER_SOURCE.indexOf('drawPreparedFrame()');
  const drawEnd = RENDERER_SOURCE.indexOf('renderFrame(alpha', drawStart);
  const firstDraw = RENDERER_SOURCE.slice(drawStart, drawEnd);
  const receiptCalls = firstDraw.match(/createOpeningSubmissionReceipt\(/g) || [];
  assert.ok(receiptCalls.length <= 1,
    'the first visible submit cannot mint a fresh geometry baseline');
  if (receiptCalls.length === 1) {
    const guardIndex = firstDraw.indexOf('if (priorReceipt && plan)');
    const callIndex = firstDraw.indexOf('createOpeningSubmissionReceipt(');
    assert.ok(guardIndex >= 0 && guardIndex < callIndex,
      'a pre-submit rehearsal may only refresh a baseline that already exists');
  }
  assert.match(firstDraw, /&& !this\.state\.render\.openingFirstVisibleGpuCounts/,
    'the unconditional first-visible count line must emit exactly once per opening');
  assert.match(firstDraw, /reason:\s*'first-visible-geometry-delta'/,
    'the post-submit gate must fail when the visible pass creates GPU geometries');
  assert.match(firstDraw, /first-visible-program-delta/,
    'the post-submit gate must also fail on unexplained first-visible programs');
  assert.match(firstDraw, /lateAdmissions/,
    'the first-visible failure payload must name owning roots, objects, materials, and program families');
  assert.match(
    firstDraw,
    /first-visible-pass-residency geometries=\$\{openingFirstDrawCountsBefore\.geometries\}->\$\{after\.geometries\} programs=\$\{openingFirstDrawCountsBefore\.programs\}->\$\{after\.programs\} geometry-only-brick=\$\{geometryOnlyBrick\}/,
    'the first visible pass must always name geometry-only bricks from cheap renderer counts',
  );
});

test('startup residency uploads exact production objects through initGeometry', async () => {
  const sharedGeometry = new THREE.BoxGeometry();
  const otherGeometry = new THREE.SphereGeometry(1, 8, 6);
  const first = new THREE.Mesh(sharedGeometry, new THREE.MeshStandardMaterial());
  const duplicate = new THREE.Mesh(sharedGeometry, new THREE.MeshStandardMaterial());
  const instanced = new THREE.InstancedMesh(sharedGeometry, new THREE.MeshStandardMaterial(), 3);
  const secondInstanced = new THREE.InstancedMesh(
    sharedGeometry, new THREE.MeshStandardMaterial(), 2,
  );
  const other = new THREE.Points(otherGeometry, new THREE.PointsMaterial());
  const uploaded = [];
  const resident = new Set();
  const harness = createRendererHarness({
    initGeometry({ object, renderer }) {
      uploaded.push(object);
      if (!resident.has(object.geometry)) {
        resident.add(object.geometry);
        renderer.info.memory.geometries++;
      }
    },
  });
  const timeline = [];
  const slices = [];
  harness.renderer.initTexture = () => { timeline.push('texture'); };

  const result = await prepareStartupGpuResidency(
    harness.renderer,
    [first, duplicate, instanced, secondInstanced, other],
    {
      textures: [new THREE.Texture()],
      yieldToMain: async () => { timeline.push('yield'); },
      onBlockingSlice: (slice) => { slices.push(slice); },
    },
  );

  assert.deepEqual(uploaded, [first, instanced, secondInstanced, other],
    'the exact production objects upload — one ordinary duplicate is removed while both shared '
    + 'instanced buffers remain work');
  assert.equal(result.geometryResidency.skipped, false);
  assert.equal(result.geometryResidency.mode, 'direct-buffer-upload');
  assert.equal(result.geometryResidency.drawables, 5);
  assert.equal(result.geometryResidency.geometryWorkItems, 4);
  assert.equal(result.geometryResidency.geometries, 2);
  assert.equal(result.geometryResidency.newGeometries, 2);
  assert.deepEqual(timeline, [
    'yield', 'texture', 'yield', 'yield', 'yield', 'yield', 'yield',
  ]);
  assert.deepEqual(slices.map((slice) => slice.kind), [
    'gpuResidencyUpload',
    'gpuGeometryResidency',
    'gpuGeometryResidency',
    'gpuGeometryResidency',
    'gpuGeometryResidency',
  ]);
  assert.ok(slices.slice(1).every((slice) => slice.success === true));
  assert.ok([sharedGeometry, otherGeometry].every(
    (geometry) => geometry.userData.spacefaceGpuResident === true,
  ), 'successful uploads stamp their geometries resident');
});

test('already-resident ordinary geometry is not uploaded again', async () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.geometry.userData.spacefaceGpuResident = true;
  const harness = createRendererHarness({
    initGeometry() { throw new Error('must not re-upload resident geometry'); },
  });
  const result = await prepareStartupGeometryResidency(harness.renderer, mesh, {
    yieldToMain: async () => {},
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'no drawable geometry');
});

test('startup geometry residency yields before every upload item', async () => {
  const subjects = Array.from({ length: 5 }, (_, index) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.name = `mesh-${index}`;
    return mesh;
  });
  const timeline = [];
  const slices = [];
  let clock = 0;
  const harness = createRendererHarness({
    initGeometry({ renderer }) {
      timeline.push('upload');
      clock += 3;
      renderer.info.memory.geometries++;
    },
  });

  const result = await prepareStartupGeometryResidency(harness.renderer, subjects, {
    yieldToMain: async () => { timeline.push('yield'); },
    now: () => clock,
    onBlockingSlice: (slice) => { slices.push(slice); },
  });

  assert.deepEqual(timeline, [
    'yield', 'upload', 'yield', 'upload', 'yield', 'upload', 'yield', 'upload', 'yield', 'upload',
  ]);
  assert.equal(result.batches.length, 5);
  assert.deepEqual(result.batches.map((batch) => batch.durationMs), [3, 3, 3, 3, 3]);
  assert.deepEqual(slices.map((slice) => slice.success), [true, true, true, true, true]);
  assert.equal(result.newGeometries, 5);
});

test('a failed geometry upload reports the slice before rejecting', async () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const slices = [];
  let clock = 20;
  const harness = createRendererHarness({
    initGeometry() {
      clock += 7;
      throw new Error('driver upload failed');
    },
  });

  await assert.rejects(
    prepareStartupGeometryResidency(harness.renderer, mesh, {
      yieldToMain: async () => {},
      now: () => clock,
      onBlockingSlice: (slice) => { slices.push(slice); },
    }),
    /driver upload failed/,
  );

  assert.equal(slices.length, 1);
  assert.equal(slices[0].kind, 'gpuGeometryResidency');
  assert.equal(slices[0].durationMs, 7);
  assert.equal(slices[0].success, false);
});
