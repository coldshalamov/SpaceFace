import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  collectStartupGeometryDrawables,
  prepareStartupGeometryResidency,
  prepareStartupGpuResidency,
} from '../src/render/startupGpuResidency.js';

const RENDERER_SOURCE = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

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

  const drawStart = RENDERER_SOURCE.indexOf('drawPreparedFrame()');
  const drawEnd = RENDERER_SOURCE.indexOf('renderFrame(alpha', drawStart);
  const firstDraw = RENDERER_SOURCE.slice(drawStart, drawEnd);
  assert.doesNotMatch(firstDraw, /createOpeningSubmissionReceipt\(/,
    'the first visible submit cannot replace its own geometry baseline');
  assert.match(firstDraw, /&& !this\.state\.render\.openingFirstVisibleGpuCounts/,
    'the unconditional first-visible count line must emit exactly once per opening');
  assert.match(firstDraw, /reason:\s*'first-visible-geometry-delta'/,
    'the post-submit gate must fail when the visible pass creates GPU geometries');
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
