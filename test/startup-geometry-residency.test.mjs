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
  collectUnresidentInstancedDrawables,
  hasUnresidentGeometry,
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

function setVector(target, x, y, z, w) {
  if (x && x.isVector4) target.copy(x);
  else target.set(x, y, z, w);
}

function createRendererHarness({ render } = {}) {
  const previousTarget = { name: 'previous-target' };
  let activeTarget = previousTarget;
  const viewport = new THREE.Vector4(7, 9, 640, 360);
  const scissor = new THREE.Vector4(11, 13, 320, 180);
  let scissorTest = false;
  const renderer = {
    autoClear: true,
    xr: { enabled: true },
    shadowMap: { autoUpdate: true, needsUpdate: true },
    info: { memory: { geometries: 5 } },
    initTexture() {},
    getRenderTarget: () => activeTarget,
    setRenderTarget(target) { activeTarget = target; },
    getViewport(out) { return out.copy(viewport); },
    setViewport(x, y, z, w) { setVector(viewport, x, y, z, w); },
    getScissor(out) { return out.copy(scissor); },
    setScissor(x, y, z, w) { setVector(scissor, x, y, z, w); },
    getScissorTest: () => scissorTest,
    setScissorTest(value) { scissorTest = !!value; },
    render(scene, camera) {
      if (render) render({ scene, camera, renderer, activeTarget, viewport, scissor, scissorTest });
    },
  };
  return {
    renderer,
    previousTarget,
    activeTarget: () => activeTarget,
    viewport,
    scissor,
    scissorTest: () => scissorTest,
  };
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

test('opening geometry admission uses the shared startup proxy pass', () => {
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

  const drawStart = RENDERER_SOURCE.indexOf('drawPreparedFrame() {');
  const drawEnd = RENDERER_SOURCE.indexOf('renderFrame(alpha', drawStart);
  const firstDraw = RENDERER_SOURCE.slice(drawStart, drawEnd);
  // The rehearsal sweep may refresh the receipt before the first submit, but only while a prior
  // receipt and frozen plan exist — the first visible submit itself never mints the baseline.
  const receiptCreations = firstDraw.match(/createOpeningSubmissionReceipt\(/g) || [];
  if (receiptCreations.length > 0) {
    assert.match(firstDraw, /const priorReceipt = this\.state\.render\.openingSubmissionReceipt/,
      'an in-submit receipt recapture must require a pre-existing receipt');
    assert.match(firstDraw, /if \(priorReceipt && plan\)/,
      'an in-submit receipt recapture must stay gated on the frozen plan');
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

test('startup residency uploads exact geometry through an isolated 1x1 pass and restores renderer state', async () => {
  const sharedGeometry = new THREE.BoxGeometry();
  const otherGeometry = new THREE.SphereGeometry(1, 8, 6);
  const first = new THREE.Mesh(sharedGeometry, new THREE.MeshStandardMaterial());
  const duplicate = new THREE.Mesh(sharedGeometry, new THREE.MeshStandardMaterial());
  const instanced = new THREE.InstancedMesh(sharedGeometry, new THREE.MeshStandardMaterial(), 3);
  const secondInstanced = new THREE.InstancedMesh(
    sharedGeometry, new THREE.MeshStandardMaterial(), 2,
  );
  const other = new THREE.Points(otherGeometry, new THREE.PointsMaterial());
  const productionMaterials = new Set([
    first.material,
    duplicate.material,
    instanced.material,
    secondInstanced.material,
    other.material,
  ]);
  const productionInstanceMatrices = new Set([
    instanced.instanceMatrix,
    secondInstanced.instanceMatrix,
  ]);
  const renderCalls = [];
  const resident = new Set();
  const harness = createRendererHarness({
    render({ scene, camera, renderer, activeTarget, viewport, scissor, scissorTest }) {
      renderCalls.push(scene.children.slice());
      assert.equal(activeTarget.isWebGLRenderTarget, true);
      assert.equal(activeTarget.width, 1);
      assert.equal(activeTarget.height, 1);
      assert.deepEqual(viewport.toArray(), [0, 0, 1, 1]);
      assert.deepEqual(scissor.toArray(), [0, 0, 1, 1]);
      assert.equal(scissorTest, true);
      assert.equal(renderer.autoClear, false);
      assert.equal(renderer.xr.enabled, false);
      assert.equal(renderer.shadowMap.autoUpdate, false);
      assert.equal(renderer.shadowMap.needsUpdate, false);
      assert.equal(camera.layers.mask >>> 0, 0xffffffff);
      assert.ok(scene.children.every((proxy) => proxy.frustumCulled === false));
      assert.ok(scene.children.every((proxy) => !productionMaterials.has(proxy.material)),
        'the upload pass cannot perturb or compile production materials');
      const proxyInstances = scene.children.filter((proxy) => proxy.isInstancedMesh);
      assert.equal(proxyInstances.length, 2,
        'both instanced owners sharing one BufferGeometry remain upload work');
      assert.deepEqual(
        new Set(proxyInstances.map((proxy) => proxy.instanceMatrix)),
        productionInstanceMatrices,
        'the production instance buffers are the buffers admitted by the proxies',
      );
      for (const proxy of scene.children) {
        if (!resident.has(proxy.geometry)) {
          resident.add(proxy.geometry);
          renderer.info.memory.geometries++;
        }
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

  assert.equal(renderCalls.length, 1);
  assert.equal(result.geometryResidency.skipped, false);
  assert.equal(result.geometryResidency.mode, 'bounded-1x1-render');
  assert.equal(result.geometryResidency.drawables, 5);
  assert.equal(result.geometryResidency.geometryWorkItems, 4,
    'one ordinary duplicate is removed while both shared instanced buffers remain work');
  assert.equal(result.geometryResidency.geometries, 2);
  assert.equal(result.geometryResidency.newGeometries, 2);
  assert.deepEqual(timeline, ['yield', 'texture', 'yield', 'yield']);
  assert.deepEqual(slices.map((slice) => slice.kind), [
    'gpuResidencyUpload',
    'gpuGeometryResidency',
  ]);
  assert.equal(slices[1].success, true);
  assert.strictEqual(harness.activeTarget(), harness.previousTarget);
  assert.deepEqual(harness.viewport.toArray(), [7, 9, 640, 360]);
  assert.deepEqual(harness.scissor.toArray(), [11, 13, 320, 180]);
  assert.equal(harness.scissorTest(), false);
  assert.equal(harness.renderer.autoClear, true);
  assert.equal(harness.renderer.xr.enabled, true);
  assert.equal(harness.renderer.shadowMap.autoUpdate, true);
  assert.equal(harness.renderer.shadowMap.needsUpdate, true);
});

// Mid-flight GPU brick regression: continuous plume / RCS layers swap mesh.geometry
// across prebuilt quality tiers on a live frame. Only the active geometry used to be
// admission work, so a tier switch uploaded an unstamped buffer inside the presented pass.
test('quality-tier alternate geometries join residency work and are stamped resident', async () => {
  const activeGeometry = new THREE.BoxGeometry();
  const tierLow = new THREE.BoxGeometry();
  const tierMedium = new THREE.SphereGeometry(1, 4, 3);
  const mesh = new THREE.Mesh(activeGeometry, new THREE.MeshBasicMaterial());
  mesh.name = 'plume-layer:core';
  mesh.userData.spacefaceQualityTierGeometries = [activeGeometry, tierLow, tierMedium];
  const root = new THREE.Group();
  root.add(mesh);

  const drawables = collectStartupGeometryDrawables(root);
  assert.equal(drawables.length, 3, 'the live drawable plus one facade per alternate tier');
  const collected = new Set(drawables.map((d) => d.geometry));
  assert.ok(collected.has(activeGeometry));
  assert.ok(collected.has(tierLow), 'inactive tier geometry must be upload work');
  assert.ok(collected.has(tierMedium));

  const uploaded = new Set();
  const harness = createRendererHarness({
    render({ scene }) {
      for (const proxy of scene.children) uploaded.add(proxy.geometry);
    },
  });
  const result = await prepareStartupGeometryResidency(harness.renderer, root, {
    yieldToMain: async () => {},
  });
  assert.equal(result.skipped, false);
  assert.equal(result.geometries, 3);
  for (const geo of [activeGeometry, tierLow, tierMedium]) {
    assert.ok(uploaded.has(geo), 'every tier geometry reaches the upload pass');
    assert.equal(geo.userData.spacefaceGpuResident, true,
      'every tier geometry is stamped resident so a tier swap is not a first upload');
  }
});

// Late-admitted roots carry dormant pools: plume/RCS layers are InstancedMesh at count 0 with
// full-capacity instance buffers. Without includeEmpty the admission walk skips them, so the
// first 0->N activation uploads inside a presented frame (the mid-flight GPU brick).
test('late admission uploads count-0 instanced pool buffers before activation', async () => {
  const poolGeometry = new THREE.BoxGeometry();
  const dormantPool = new THREE.InstancedMesh(poolGeometry, new THREE.MeshBasicMaterial(), 8);
  dormantPool.count = 0;
  dormantPool.name = 'plume-layer:core';
  const root = new THREE.Group();
  root.name = 'plume-system:family_industrial_main_plume';
  root.add(dormantPool);

  const drawables = collectStartupGeometryDrawables(root, { includeEmpty: true });
  assert.ok(drawables.includes(dormantPool),
    'includeEmpty admits the dormant instanced pool into residency work');

  const submitted = [];
  const harness = createRendererHarness({
    render({ scene }) {
      for (const proxy of scene.children) {
        submitted.push({
          isInstancedMesh: proxy.isInstancedMesh === true,
          geometry: proxy.geometry,
          instanceMatrix: proxy.instanceMatrix,
          count: proxy.count,
        });
      }
    },
  });
  const result = await prepareStartupGpuResidency(harness.renderer, root, {
    includeGeometry: true,
    includeEmpty: true,
    yieldToMain: async () => {},
  });
  assert.equal(result.skipped, false);
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].isInstancedMesh, true);
  assert.equal(submitted[0].geometry, poolGeometry);
  assert.equal(submitted[0].instanceMatrix, dormantPool.instanceMatrix,
    'the proxy submits the production capacity-sized instance buffer, not a throwaway');
  assert.equal(submitted[0].count, 0, 'the dormant pool stays dormant in the proxy pass');
  assert.equal(poolGeometry.userData.spacefaceGpuResident, true,
    'the dormant pool geometry is stamped so first activation is not a first upload');
});

test('every residency admission lane admits dormant instanced pools', () => {
  const trackerStart = RENDERER_SOURCE.indexOf('createGpuResidencyAdmissionTracker(');
  assert.ok(trackerStart >= 0, 'the late-admission tracker must exist');
  const tracker = RENDERER_SOURCE.slice(trackerStart, trackerStart + 2200);
  assert.match(tracker, /includeEmpty:\s*true/,
    'the late-admission lane must upload count-0 pool buffers behind the pending latch');

  const restoreStart = RENDERER_SOURCE.indexOf('ignoreResidentStamps: true');
  assert.ok(restoreStart >= 0, 'the context-restore re-admission must exist');
  const restore = RENDERER_SOURCE.slice(Math.max(0, restoreStart - 400), restoreStart + 400);
  assert.match(restore, /includeEmpty:\s*true/,
    'context restore must re-upload dormant pool buffers, not only stamped drawables');
});

test('already-resident ordinary geometry is not 1x1 uploaded again', async () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.geometry.userData.spacefaceGpuResident = true;
  const harness = createRendererHarness({
    render() { throw new Error('must not re-upload resident geometry'); },
  });
  const result = await prepareStartupGeometryResidency(harness.renderer, mesh, {
    yieldToMain: async () => {},
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'no drawable geometry');
});

test('startup geometry residency slices admission into bounded batches with a browser yield before each', async () => {
  const subjects = Array.from({ length: 5 }, (_, index) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.name = `mesh-${index}`;
    return mesh;
  });
  const batchSizes = [];
  const timeline = [];
  const slices = [];
  let clock = 0;
  const harness = createRendererHarness({
    render({ scene, renderer }) {
      timeline.push('render');
      batchSizes.push(scene.children.length);
      clock += scene.children.length * 3;
      renderer.info.memory.geometries += scene.children.length;
    },
  });

  const result = await prepareStartupGeometryResidency(harness.renderer, subjects, {
    geometryBatchDrawables: 2,
    geometryBatchBytes: Number.MAX_SAFE_INTEGER,
    yieldToMain: async () => { timeline.push('yield'); },
    now: () => clock,
    onBlockingSlice: (slice) => { slices.push(slice); },
  });

  assert.deepEqual(batchSizes, [2, 2, 1]);
  assert.deepEqual(timeline, ['yield', 'render', 'yield', 'render', 'yield', 'render']);
  assert.equal(result.batches.length, 3);
  assert.deepEqual(result.batches.map((batch) => batch.durationMs), [6, 6, 3]);
  assert.deepEqual(slices.map((slice) => slice.success), [true, true, true]);
  assert.equal(result.newGeometries, 5);
});

test('a failed geometry batch restores every renderer owner before rejecting', async () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const slices = [];
  let clock = 20;
  const harness = createRendererHarness({
    render() {
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
  assert.strictEqual(harness.activeTarget(), harness.previousTarget);
  assert.deepEqual(harness.viewport.toArray(), [7, 9, 640, 360]);
  assert.deepEqual(harness.scissor.toArray(), [11, 13, 320, 180]);
  assert.equal(harness.scissorTest(), false);
  assert.equal(harness.renderer.autoClear, true);
  assert.equal(harness.renderer.xr.enabled, true);
  assert.equal(harness.renderer.shadowMap.autoUpdate, true);
  assert.equal(harness.renderer.shadowMap.needsUpdate, true);
});

// Scene-level instance pools have no per-subject admission owner — the only stamp they ever get
// comes from a whole-scene seal. The bounded post-cook seal collects exactly the unstamped set.
test('unresident instanced census picks out only unstamped instanced drawables', () => {
  const stampedGeometry = new THREE.BoxGeometry();
  stampedGeometry.userData.spacefaceGpuResident = true;
  const unstampedGeometry = new THREE.BoxGeometry();
  const stampedPool = new THREE.InstancedMesh(stampedGeometry, new THREE.MeshBasicMaterial(), 4);
  const unresidentPool = new THREE.InstancedMesh(unstampedGeometry, new THREE.MeshBasicMaterial(), 4);
  const ordinary = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const root = new THREE.Group();
  root.add(stampedPool, unresidentPool, ordinary);

  assert.deepEqual(collectUnresidentInstancedDrawables(root), [unresidentPool],
    'stamped instanced owners and ordinary meshes stay out of the seal work list');
  assert.deepEqual(collectUnresidentInstancedDrawables([unresidentPool]), [unresidentPool],
    'a bare instanced subject works without a traversable root');
});

// The 116 ms first-flight bloomScene brick on Intel/ANGLE: shouldAwaitOpeningGpuCook is false
// without KHR_parallel_shader_compile, so the old guard skipped the pool/buffer seal on exactly
// the hardware that bricks worst, and the prepare budget made the same skip silent. The seal is
// the last barrier before flight — it must run on every non-recook cook.
test('the first-frame pool census seal is not gated on KHR or the prepare budget', () => {
  const prepareStart = RENDERER_SOURCE.indexOf('state.render.prepareLiveSectorBeforeFlight = async');
  const receiptStart = RENDERER_SOURCE.indexOf('buildOpeningSubmissionPlan()', prepareStart);
  assert.ok(prepareStart >= 0 && receiptStart > prepareStart,
    'the live-sector prepare body must exist');
  const body = RENDERER_SOURCE.slice(prepareStart, receiptStart);
  const sealIndex = body.indexOf('firstFrameResidency = await prepareStartupGpuResidency');
  assert.ok(sealIndex >= 0, 'the pool/buffer seal call must exist');
  const barrierIndex = body.indexOf('ownsFirstPictureBarrier');
  assert.ok(barrierIndex >= 0, 'the KHR first-picture barrier must still exist');
  assert.ok(sealIndex > barrierIndex,
    'the seal must run after the barrier decision, not inside it');
  const between = body.slice(barrierIndex, sealIndex);
  assert.doesNotMatch(between, /PREPARE_BUDGET_MS/,
    'no prepare-budget gate may sit between the barrier decision and the seal');
});

// Sector jumps publish pool chunks inside liveSectorGpuAdmission while cook.buffers stays
// skipped for the run70 TDR. Without a seal those chunks first upload inside a presented
// post-jump bloomScene — the same brick class, at every sector arrival.
test('the jump cook seals unstamped instance pools inside its admission window', () => {
  const jumpStart = RENDERER_SOURCE.indexOf('state.render.prepareLiveSectorAfterJump = async');
  assert.ok(jumpStart >= 0, 'the jump cook must exist');
  const jumpEnd = RENDERER_SOURCE.indexOf('const runPostOpeningPipelines', jumpStart);
  const body = RENDERER_SOURCE.slice(jumpStart, jumpEnd > jumpStart ? jumpEnd : jumpStart + 9000);
  assert.match(body, /collectUnresidentInstancedDrawables\(scene\)/,
    'the jump cook must collect the unstamped instanced set');
  assert.match(body, /prepareStartupGpuResidency\(renderer, unresidentPools/,
    'the jump cook must upload only the unresident pools, not re-run the full buffer pass');
  assert.match(body, /jump\.instancePoolSeal/,
    'the jump seal must land in the cook ledger');
  const sealIndex = body.indexOf('collectUnresidentInstancedDrawables(scene)');
  const flagReset = body.indexOf("state.render.liveSectorGpuAdmission = false");
  assert.ok(sealIndex >= 0 && flagReset > sealIndex,
    'the seal must run while liveSectorGpuAdmission is still true');
});

// Compile and touch consume programSubjects front-to-back under one shared budget, and a
// timed-out pass used to leave first-picture leaves unwarmed in census order — their first
// draws then created D3D11 pipeline state inside early presented frames (~78–155 ms bloomScene
// residuals after the 772 ms link brick closed). Order the list by the opening submission plan
// so a capped pass warms exactly the leaves the first frames will draw.
test('the cook warms first-picture subjects before beyond-runway subjects', () => {
  const unitsIndex = RENDERER_SOURCE.indexOf('const units = uniqueAdmissionUnits([');
  assert.ok(unitsIndex >= 0, 'the cook admission units must exist');
  const compileLoopIndex = RENDERER_SOURCE.indexOf('for (const subject of units.programSubjects)', unitsIndex);
  assert.ok(compileLoopIndex > unitsIndex, 'the compile cohort loop must exist');
  const between = RENDERER_SOURCE.slice(unitsIndex, compileLoopIndex);
  assert.match(between, /openingSubjects\.map\(\(subject, index\) => \[subject, index\]\)/,
    'the ordering key must come from the first-picture census order');
  assert.match(between, /units\.programSubjects\.sort\(/,
    'programSubjects must be sorted before the compile and touch loops consume it');
  const touchLoopIndex = RENDERER_SOURCE.indexOf('for (const subject of units.programSubjects)', compileLoopIndex + 1);
  assert.ok(touchLoopIndex > compileLoopIndex, 'the touch loop must consume the same ordered list');
});

// compile() never uploads vertex buffers: a live-built mesh with unuploaded geometry used to
// attach drawable-immediately and pay its upload inside the presented bloomScene (the 129 ms
// multi-primitive structure brick). Shared cached geometries carry the stamp from their first
// admission, so only meshes that would pay a real upload report unready.
test('hasUnresidentGeometry reports only meshes that would upload inside a presented pass', () => {
  const shared = new THREE.BoxGeometry();
  shared.userData.spacefaceGpuResident = true;
  const fresh = new THREE.BoxGeometry();
  const stamped = new THREE.Group();
  stamped.add(new THREE.Mesh(shared), new THREE.Mesh(shared));
  const unready = new THREE.Group();
  unready.add(new THREE.Mesh(shared), new THREE.Mesh(fresh));
  assert.equal(hasUnresidentGeometry(stamped), false,
    'a mesh built entirely from stamped shared geometry must stay instantly drawable');
  assert.equal(hasUnresidentGeometry(unready), true,
    'one unuploaded leaf geometry makes the whole build unready');
  assert.equal(hasUnresidentGeometry(new THREE.Mesh(fresh)), true,
    'a bare unstamped mesh reports unready');
  assert.equal(hasUnresidentGeometry(new THREE.Group()), false,
    'a geometry-less group has nothing to upload');
});

// The build queue used to flag geometryPending only for first-flight asteroids and payloads —
// every other live build attached drawable-immediately, and a multi-primitive structure's ~24
// unstamped leaves paid 129 ms inside one bloomScene. Any live build with unuploaded geometry
// must hold the same latch until the per-entity residency queue stamps it.
test('live mesh builds hold unready geometry behind the residency latch', () => {
  const buildStart = RENDERER_SOURCE.indexOf('const m = this.vf.build(e);');
  assert.ok(buildStart >= 0, 'the live mesh build must exist');
  const body = RENDERER_SOURCE.slice(buildStart, buildStart + 4000);
  const flagIndex = body.indexOf('data.geometryPending = true');
  assert.ok(flagIndex >= 0, 'the pending latch must still be armed');
  const before = body.slice(0, flagIndex);
  assert.match(before, /hasUnresidentGeometry\(m\)/,
    'the latch must test the build for unuploaded geometry, not just its entity type');
  assert.match(before, /mode === 'flight'/,
    'the live-build latch must be scoped to flight — loading builds are sealed by the census');
});

// state.render.openingSubmissionPlan is null at cook time on KHR runners (the warmup never
// publishes there; prepareOpeningGpuResources self-builds into a local) and stale on jump
// cooks (it is the opening picture, not the arrival picture). The cook must census the
// picture itself rather than read the stored manifest.
test('the cook censuses the presented picture instead of reading the stored opening plan', () => {
  const cookStart = RENDERER_SOURCE.indexOf('state.render.cookLiveSceneGpu = async');
  assert.ok(cookStart >= 0, 'the live cook must exist');
  const unitsIndex = RENDERER_SOURCE.indexOf('const units = uniqueAdmissionUnits([', cookStart);
  assert.ok(unitsIndex > cookStart, 'the cook admission units must exist');
  const between = RENDERER_SOURCE.slice(cookStart, unitsIndex);
  assert.match(between, /buildOpeningSubmissionPlan\(\)/,
    'the cook must census the picture it is about to present');
  assert.doesNotMatch(between, /state\.render\.openingSubmissionPlan/,
    'the cook must not depend on the stored opening manifest');
});

// A per-item yield to the next present cost one frame per texture and per geometry batch —
// a 20-map hull waited ~20 presents hidden behind the pending latch. Flight residency slices
// several small uploads into one frame gap instead.
test('flight GPU residency admission slices yields instead of yielding per item', () => {
  const trackerStart = RENDERER_SOURCE.indexOf('const gpuResidencyAdmissions = createGpuResidencyAdmissionTracker(');
  assert.ok(trackerStart >= 0, 'the GPU residency admission tracker must exist');
  const tracker = RENDERER_SOURCE.slice(trackerStart, trackerStart + 2600);
  assert.match(tracker, /createSlicedYield\(/,
    'the residency lane must share one frame gap across several small uploads');
  assert.match(tracker, /sliceMs:\s*ADMISSION_SLICE_TARGET_MS/,
    'the slice window must stay at the admission slice target, not a per-item present');
});

// A latched root is invisible until admitted, so it is deadline work — yet it used to ride the
// ambient compile lane's quiet window and first-flight auto-flush hold, adding ~50-250 ms of pure
// waiting to its time-to-visible. The explicit lane flushes the ambient queue and serializes the
// subject on the shared compile tail; in flight the compile is still present-sliced, so the link
// lands on its own beats.
test('latched geometry roots compile on the explicit lane, not the ambient quiet window', () => {
  const queueStart = RENDERER_SOURCE.indexOf('this._liveGeometryAdmissions = createLiveGeometryAdmissionQueue({');
  assert.ok(queueStart >= 0, 'the live geometry admission queue must exist');
  const queueBlock = RENDERER_SOURCE.slice(queueStart, queueStart + 2600);
  assert.match(queueBlock, /compile:\s*\(root\)\s*=>\s*state\.render\.compileObjectPipelines\(\s*root,\s*\{[^}]*explicit:\s*true[^}]*\}\s*,?\s*\)/,
    'latched roots must bypass the ambient compile queue');
  const admitStart = RENDERER_SOURCE.indexOf('const admitSubjectPipelines = (subject');
  assert.ok(admitStart >= 0, 'the subject admission must exist');
  const admitBlock = RENDERER_SOURCE.slice(admitStart, admitStart + 1400);
  assert.match(admitBlock, /explicit === true\s*\?\s*pipelineAdmissions\.compileExplicit\(subject[^)]*\)\s*:\s*pipelineAdmissions\.compile\(subject\)/,
    'the explicit flag must route to compileExplicit, not the quiet-window queue');
});

// One root per present is the GPU-pacing contract; WHICH root drains next is a deadline choice.
// A hull crossing the screen edge must not sit behind a background prop that merely enqueued
// first — the queue re-grades the pending set on every pick by explicit focus then
// predicted time-to-glass.
test('the live geometry admission queue drains nearest-deadline-first', () => {
  const queueStart = RENDERER_SOURCE.indexOf('this._liveGeometryAdmissions = createLiveGeometryAdmissionQueue({');
  assert.ok(queueStart >= 0, 'the live geometry admission queue must exist');
  const queueBlock = RENDERER_SOURCE.slice(queueStart, queueStart + 3800);
  assert.match(queueBlock, /priorityOf:\s*\(entity\)\s*=>/,
    'the queue must grade pending roots instead of draining strict FIFO');
  assert.match(queueBlock, /entityIsExplicitRenderFocus\(entity, state\)/,
    'explicit focus (player, target, forced roots) must outrank every deadline');
  assert.match(queueBlock, /entityTimeToGlassSeconds\(entity, env, state/,
    'ordinary roots must be graded by predicted time-to-glass');
  const queueSource = readFileSync(new URL('../src/render/liveGeometryAdmission.js', import.meta.url), 'utf8');
  assert.match(queueSource, /priorityOf/,
    'the queue itself must accept a grading function');
  assert.match(queueSource, /pending\.splice\(bestIndex, 1\)/,
    'each drain round must pick the best pending entry, not the oldest');
});

// Within each build tier the drain used to be FIFO, so collection order — not the deadline —
// decided which of several same-tier candidates spent the bounded per-frame build budget.
test('mesh build candidates drain nearest-deadline-first inside each tier', () => {
  const pollStart = RENDERER_SOURCE.indexOf('reconcileMeshResidency() {');
  assert.ok(pollStart >= 0, 'the residency poll must exist');
  const drainIndex = RENDERER_SOURCE.indexOf('stats.built = this._drainMeshBuildQueue', pollStart);
  assert.ok(drainIndex > pollStart, 'the poll must drain builds after enqueueing');
  const between = RENDERER_SOURCE.slice(pollStart, drainIndex);
  assert.match(between, /entityTimeToGlassSeconds\(a, env, state\) - entityTimeToGlassSeconds\(b, env, state\)/,
    'each tier must be sorted by predicted time-to-glass before enqueue');
  const reconcileStart = RENDERER_SOURCE.indexOf('enqueueMissingMeshBuilds(\n      presentationList');
  assert.ok(reconcileStart >= 0, 'the full reconcile enqueue must exist');
  const reconcileCall = RENDERER_SOURCE.slice(reconcileStart, reconcileStart + 900);
  assert.match(reconcileCall, /\(entity\) => entityTimeToGlassSeconds\(entity, env, state\),\s*\)/,
    'the full reconcile must pass the same deadline ordering');
});

// Enqueue order is captured once; an entity admitted at the prefetch rim can still accelerate
// toward the glass while older far entries sit ahead of it. The poll must re-hoist already-queued
// ids whose deadline moved inside the urgent window, not only sort new candidates.
test('the poll re-hoists queued builds whose deadline moved inside the urgent window', () => {
  const pollStart = RENDERER_SOURCE.indexOf('reconcileMeshResidency() {');
  assert.ok(pollStart >= 0, 'the residency poll must exist');
  const drainIndex = RENDERER_SOURCE.indexOf('stats.built = this._drainMeshBuildQueue', pollStart);
  assert.ok(drainIndex > pollStart, 'the poll must drain builds after enqueueing');
  const between = RENDERER_SOURCE.slice(pollStart, drainIndex);
  assert.match(between, /pendingBuilds\.splice\(/,
    'the already-queued tail must be repartitioned, not just newly enqueued candidates');
  assert.match(between, /entityTimeToGlassSeconds\(entity, env, state\) <= TABLE_BUILD_URGENT_SECONDS/,
    'the hoist must use the same urgent deadline as the enqueue tiers');
});

// The exempt set only changes on sim ticks and spawn events; a full entity scan every display
// frame is wasted work through the whole 20 s first-flight hold — the busiest window the game
// has. The first frame of the hold still collects immediately.
test('the first-flight hold collects the exempt build set on a cadence, not every frame', () => {
  const holdStart = RENDERER_SOURCE.indexOf('if (holdFirstFlightStreaming(owner.state)) {');
  assert.ok(holdStart >= 0, 'the first-flight streaming hold must exist');
  const holdEnd = RENDERER_SOURCE.indexOf("return 'held-first-flight';", holdStart);
  assert.ok(holdEnd > holdStart, 'the hold branch must return');
  const holdBlock = RENDERER_SOURCE.slice(holdStart, holdEnd);
  assert.match(holdBlock, /_holdExemptCollectS\s*<=\s*0/,
    'the exempt collection must be gated on a countdown');
  assert.match(holdBlock, /HOLD_EXEMPT_COLLECT_SECONDS/,
    'the cadence must be a named constant, not a magic number');
  const afterHold = RENDERER_SOURCE.slice(holdEnd, holdEnd + 300);
  assert.match(afterHold, /_holdExemptCollectS\s*=\s*0/,
    'the cadence must reset when the hold releases so the next hold starts fresh');
});
