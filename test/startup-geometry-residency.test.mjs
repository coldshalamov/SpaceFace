import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  collectStartupGeometryDrawables,
  prepareStartupGeometryResidency,
  prepareStartupGpuResidency,
} from '../src/render/startupGpuResidency.js';

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

test('startup geometry census keeps exact drawable objects and rejects zero-draw pools', () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const line = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  line.geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
  const liveInstances = new THREE.InstancedMesh(
    new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2,
  );
  const emptyInstances = new THREE.InstancedMesh(
    new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1,
  );
  emptyInstances.count = 0;
  const emptyRange = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  emptyRange.geometry.setDrawRange(0, 0);
  root.add(mesh, line, liveInstances, emptyInstances, emptyRange);

  assert.deepEqual(
    collectStartupGeometryDrawables([root, mesh]),
    [mesh, line, liveInstances],
    'duplicate roots are deduped while empty pools never become startup blockers',
  );
});

test('startup residency uploads exact geometry through an isolated 1x1 pass and restores renderer state', async () => {
  const sharedGeometry = new THREE.BoxGeometry();
  const otherGeometry = new THREE.SphereGeometry(1, 8, 6);
  const first = new THREE.Mesh(sharedGeometry, new THREE.MeshStandardMaterial());
  const duplicate = new THREE.Mesh(sharedGeometry, new THREE.MeshStandardMaterial());
  const instanced = new THREE.InstancedMesh(sharedGeometry, new THREE.MeshStandardMaterial(), 3);
  const other = new THREE.Points(otherGeometry, new THREE.PointsMaterial());
  const productionMaterials = new Set([first.material, duplicate.material, instanced.material, other.material]);
  const originalInstanceMatrix = instanced.instanceMatrix;
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
      const proxyInstance = scene.children.find((proxy) => proxy.isInstancedMesh);
      assert.strictEqual(proxyInstance.instanceMatrix, originalInstanceMatrix,
        'the production instance buffer is the buffer admitted by the proxy');
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
    [first, duplicate, instanced, other],
    {
      textures: [new THREE.Texture()],
      yieldToMain: async () => { timeline.push('yield'); },
      onBlockingSlice: (slice) => { slices.push(slice); },
    },
  );

  assert.equal(renderCalls.length, 1);
  assert.equal(result.geometryResidency.skipped, false);
  assert.equal(result.geometryResidency.mode, 'bounded-1x1-render');
  assert.equal(result.geometryResidency.drawables, 4);
  assert.equal(result.geometryResidency.geometryWorkItems, 3,
    'one ordinary duplicate is removed while the shared instanced buffer remains work');
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
