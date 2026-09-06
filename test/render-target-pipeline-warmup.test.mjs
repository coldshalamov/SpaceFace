import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as THREE from 'three';

import {
  compileScenePipelinesForRenderTarget,
  createBloom,
  warmScenePipelinesForRenderTarget,
} from '../src/render/bloom.js';
import {
  createGpuResidencyAdmissionTracker,
  createPipelineAdmissionTracker,
  waitForCurrentRenderPipelines,
} from '../src/render/pipelineReadiness.js';
import { SpaceRenderGraph } from '../src/render/post/spaceRenderGraph.js';
import {
  compileGraphNormalSubjects,
  POST_PROCESS_ROUTE,
  render as renderSystem,
} from '../src/render/renderer.js';

test('pipeline warm-up compiles against the exact render target and restores renderer state', async () => {
  const previousTarget = { name: 'previous-target' };
  const hdrTarget = { name: 'flight-hdr-target' };
  const subject = { name: 'authored-material-subject' };
  const camera = { name: 'flight-camera' };
  const lightingScene = { name: 'flight-lighting-scene' };
  const targetChanges = [];
  const compileCalls = [];
  let activeTarget = previousTarget;
  const renderer = {
    getRenderTarget: () => activeTarget,
    setRenderTarget(target) {
      activeTarget = target;
      targetChanges.push(target);
    },
    async compileAsync(...args) {
      compileCalls.push({ args, target: activeTarget });
    },
    info: { programs: [{}, {}, {}] },
  };

  const result = await compileScenePipelinesForRenderTarget(
    renderer, hdrTarget, subject, camera, lightingScene,
  );

  assert.deepEqual(compileCalls, [{
    args: [subject, camera, lightingScene],
    target: hdrTarget,
  }]);
  assert.deepEqual(targetChanges, [hdrTarget, previousTarget]);
  assert.equal(activeTarget, previousTarget);
  assert.deepEqual(result, { skipped: false, programCount: 3 });
});

test('pipeline warm-up restores the previous target when compilation fails', async () => {
  const previousTarget = { name: 'previous-target' };
  const hdrTarget = { name: 'flight-hdr-target' };
  let activeTarget = previousTarget;
  const renderer = {
    getRenderTarget: () => activeTarget,
    setRenderTarget: (target) => { activeTarget = target; },
    compileAsync: async () => { throw new Error('driver compile failed'); },
  };

  await assert.rejects(
    compileScenePipelinesForRenderTarget(renderer, hdrTarget, {}, {}, {}),
    /driver compile failed/,
  );
  assert.equal(activeTarget, previousTarget);
});

test('pipeline warm-up reports unsupported renderers without mutating them', async () => {
  let setCalls = 0;
  const renderer = {
    getRenderTarget: () => null,
    setRenderTarget: () => { setCalls++; },
  };

  const result = await compileScenePipelinesForRenderTarget(renderer, {}, {}, {}, {});

  assert.deepEqual(result, { skipped: true, reason: 'compileAsync unavailable' });
  assert.equal(setCalls, 0);
});

test('pipeline warm-up cancels owned shader polling when the WebGL context is lost', async () => {
  const listeners = new Map();
  const material = {};
  const nativeProgram = {};
  let contextLost = false;
  let readinessChecks = 0;
  const program = {
    program: nativeProgram,
    isReady() {
      readinessChecks++;
      return false;
    },
  };
  const canvas = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const renderer = {
    domElement: canvas,
    compile: () => new Set([material]),
    compileAsync: async () => { throw new Error('real WebGL renderers must use owned polling'); },
    properties: { get: () => ({ currentProgram: program }) },
    extensions: { get: () => ({}) },
    getContext: () => ({
      isContextLost: () => contextLost,
      isProgram: (candidate) => !contextLost && candidate === nativeProgram,
    }),
    getRenderTarget: () => null,
    setRenderTarget() {},
    info: { programs: [program] },
  };

  const pending = compileScenePipelinesForRenderTarget(renderer, null, {}, {}, {});
  assert.equal(readinessChecks, 1, 'the owned readiness loop starts while the context is valid');
  contextLost = true;
  listeners.get('webglcontextlost')?.();

  assert.deepEqual(await pending, {
    skipped: true,
    reason: 'WebGL context lost during shader compilation',
    contextLost: true,
  });
  assert.equal(listeners.has('webglcontextlost'), false, 'loss retires the readiness listener and timer');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(readinessChecks, 1, 'no stale program is queried after context loss');
});

test('loading warm-up renders the authored batch against the exact target and restores scene ownership', async () => {
  const previousTarget = { name: 'previous-target' };
  const hdrTarget = { name: 'flight-hdr-target' };
  const lightingScene = new THREE.Scene();
  const subject = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  leaf.visible = true;
  leaf.frustumCulled = true;
  subject.add(leaf);
  const renders = [];
  let activeTarget = previousTarget;
  const renderer = {
    autoClear: true,
    getRenderTarget: () => activeTarget,
    setRenderTarget: (target) => { activeTarget = target; },
    render(scene, camera) {
      renders.push({ scene, camera, target: activeTarget, parent: subject.parent });
      assert.equal(leaf.visible, true);
      assert.equal(leaf.frustumCulled, false);
    },
    info: { programs: [{}, {}] },
  };
  const camera = new THREE.PerspectiveCamera();

  const result = await warmScenePipelinesForRenderTarget(
    renderer, hdrTarget, subject, camera, lightingScene,
  );

  assert.equal(renders.length, 1);
  assert.deepEqual(renders[0], {
    scene: lightingScene,
    camera,
    target: hdrTarget,
    parent: lightingScene,
  });
  assert.equal(subject.parent, null);
  assert.equal(leaf.visible, true);
  assert.equal(leaf.frustumCulled, true);
  assert.equal(activeTarget, previousTarget);
  assert.deepEqual(result, { skipped: false, programCount: 2, mode: 'forced-render' });
  leaf.geometry.dispose();
  leaf.material.dispose();
});

test('bloom instance exposes the loading warm-up contract used by renderer admission', async () => {
  const targets = [];
  const compileTargets = [];
  let activeTarget = null;
  const renderer = {
    capabilities: { isWebGL2: false, maxSamples: 0 },
    autoClear: true,
    getRenderTarget: () => activeTarget,
    setRenderTarget: (target) => { activeTarget = target; targets.push(target); },
    render() {},
    async compileAsync() { compileTargets.push(activeTarget); },
    info: { programs: [] },
  };
  const bloom = createBloom(renderer, 64, 64);
  const scene = new THREE.Scene();
  const subject = new THREE.Group();

  const result = await bloom.warmScenePipelines(subject, new THREE.PerspectiveCamera(), scene);

  assert.equal(result.skipped, false);
  assert.equal(result.mode, 'forced-render');
  assert.equal(subject.parent, null);
  assert.ok(targets.some(Boolean), 'warm-up selects the bloom HDR scene target');
  const compileResult = await bloom.compileScenePipelines(
    subject, new THREE.PerspectiveCamera(), scene,
  );
  assert.equal(compileResult.skipped, false);
  assert.strictEqual(compileTargets[0], bloom.contextLossResources()[0],
    'the wrapper compile seam selects its exact HDR scene target');
  assert.strictEqual(activeTarget, null, 'the wrapper restores the prior screen target');
  assert.equal(bloom.contextLossResources().length, bloom.diagnostics().renderTargetCount,
    'context loss exposes every bloom render target before rebuild/resize can dispose it');
  bloom.dispose();
});

test('bloom resource preparation submits its private fullscreen geometry before opening receipt capture', async () => {
  const initializedTargets = [];
  const renders = [];
  const priorTarget = { name: 'existing offscreen target' };
  let activeTarget = priorTarget;
  const renderer = {
    capabilities: { isWebGL2: false, maxSamples: 0 },
    autoClear: true,
    getRenderTarget: () => activeTarget,
    setRenderTarget: (target) => { activeTarget = target; },
    initRenderTarget: (target) => { initializedTargets.push(target); },
    compile() {},
    render(scene, camera) { renders.push({ scene, camera, target: activeTarget }); },
  };
  const bloom = createBloom(renderer, 64, 64);

  const result = await bloom.prepareResources();

  assert.equal(result.skipped, false);
  assert.equal(initializedTargets.length, bloom.contextLossResources().length);
  assert.equal(renders.length, 1, 'one private offscreen quad submission admits its geometry');
  assert.strictEqual(renders[0].target, bloom.contextLossResources()[1],
    'the admission draw stays on the initialized first bloom target');
  assert.strictEqual(activeTarget, priorTarget, 'resource preparation restores the prior target');
  bloom.dispose();
});

test('render graph exposes every off-scene target to context-loss cleanup', () => {
  const renderer = {
    isWebGLRenderer: true,
    capabilities: { isWebGL2: false },
  };
  const graph = new SpaceRenderGraph(renderer, { enabled: false });

  assert.equal(graph.contextLossResources().length, graph.diagnostics().renderTargetCount);
  assert.ok(graph.contextLossResources().every((target) => target?.isWebGLRenderTarget));
  graph.dispose();
});

test('graph normal pass excludes inactive instanced pools and restores them after render errors', () => {
  let activeTarget = null;
  let throwOnNormal = false;
  const normalVisibility = [];
  const renderer = {
    isWebGLRenderer: true,
    capabilities: { isWebGL2: false },
    autoClear: true,
    getRenderTarget: () => activeTarget,
    setRenderTarget(target) { activeTarget = target; },
    clear() {},
    render(scene) {
      if (activeTarget !== graph.normalTarget) return;
      normalVisibility.push({ inactive: inactive.layers.test(camera.layers), active: active.layers.test(camera.layers), child: child.layers.test(camera.layers), parentVisible: inactive.visible });
      if (throwOnNormal) throw new Error('normal target interrupted');
    },
  };
  const graph = new SpaceRenderGraph(renderer, { ao: true, bloom: false });
  graph.setSize(64, 64);
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const inactive = new THREE.InstancedMesh(geometry, material, 1);
  inactive.count = 0;
  const active = new THREE.InstancedMesh(geometry, material, 1);
  const child = new THREE.InstancedMesh(geometry, material, 1);
  inactive.add(child);
  inactive.layers.enable(3);
  const originalMask = inactive.layers.mask;
  scene.add(inactive, active);
  const camera = new THREE.PerspectiveCamera();

  graph.render(scene, camera, { time: 0 });
  assert.deepEqual(normalVisibility, [{ inactive: false, active: true, child: true, parentVisible: true }],
    'only zero-instance pools leave the normal pass');
  assert.equal(inactive.visible, true);
  assert.equal(active.visible, true);

  throwOnNormal = true;
  assert.throws(() => graph.render(scene, camera, { time: 1 }), /normal target interrupted/);
  assert.equal(inactive.layers.mask, originalMask, 'failed normal renders restore every original layer');
  assert.equal(inactive.visible, true, 'inactive parent remains visible so its live children can render');
  assert.equal(active.visible, true);
  graph.dispose();
  geometry.dispose();
  material.dispose();
});

test('graph normal admission substitutes exact subject materials for compile and restores them', async () => {
  const normal = { name: 'normal prepass' };
  const original = { name: 'normal-eligible', allowOverride: true };
  const protectedMaterial = { name: 'protected', allowOverride: false };
  const unmarkedMaterial = { name: 'unmarked' };
  const originalMaterials = [original, protectedMaterial, unmarkedMaterial];
  const subject = { material: originalMaterials };
  const calls = [];
  const renderer = {
    getRenderTarget: () => null,
    setRenderTarget() {},
    async compileAsync(compiledSubject, camera, lightingScene) {
      calls.push({
        materials: [...compiledSubject.material],
        overridePresent: Object.hasOwn(compiledSubject, 'overrideMaterial'),
        camera,
        lightingScene,
      });
    },
    info: { programs: [] },
  };
  const camera = {};
  const lightingScene = {};
  await compileGraphNormalSubjects(renderer, { name: 'normal target' }, [subject], camera, lightingScene, normal);
  assert.deepEqual(calls, [{
    materials: [normal, protectedMaterial, unmarkedMaterial],
    overridePresent: false,
    camera,
    lightingScene,
  }], 'compile-compatible renderers receive the actual temporary material substitution');
  assert.strictEqual(subject.material[0], original);
  assert.strictEqual(subject.material[1], protectedMaterial);
  assert.strictEqual(subject.material, originalMaterials);
  renderer.compileAsync = async () => { throw new Error('compile interrupted'); };
  await assert.rejects(() => compileGraphNormalSubjects(
    renderer, {}, [subject], camera, lightingScene, normal,
  ), /compile interrupted/);
  assert.strictEqual(subject.material, originalMaterials, 'an interrupted compile restores the exact material array');
});

test('render graph prepares only active private passes and delegates its normal prepass to exact subjects', async () => {
  const initializedTargets = [];
  const renders = [];
  const priorTarget = { name: 'prior target' };
  let activeTarget = priorTarget;
  const renderer = {
    isWebGLRenderer: true,
    capabilities: { isWebGL2: false },
    getRenderTarget: () => activeTarget,
    setRenderTarget: (target) => { activeTarget = target; },
    initRenderTarget: (target) => { initializedTargets.push(target); },
    clear() {},
    render(scene, camera) { renders.push({ scene, camera, target: activeTarget }); },
    compile() {},
  };
  const graph = new SpaceRenderGraph(renderer, { ao: true, bloom: true, bloomStrength: 0.5 });
  graph.setSize(64, 64);
  let normalSubjectPasses = 0;
  const result = await graph.prepareResources({
    camera: new THREE.PerspectiveCamera(),
    prepareNormalSubjects: async () => { normalSubjectPasses += 1; },
  });
  assert.equal(result.skipped, false);
  assert.equal(normalSubjectPasses, 1);
  assert.ok(initializedTargets.includes(graph.normalTarget));
  assert.ok(initializedTargets.includes(graph.aoTarget));
  assert.ok(initializedTargets.includes(graph.bloomTargets[0]));
  assert.ok(renders.some((entry) => entry.target === graph.aoTarget));
  assert.ok(renders.some((entry) => entry.target === graph.bloomTargets[0]));
  assert.deepEqual(result, { skipped: false, targets: initializedTargets.length });
  assert.strictEqual(activeTarget, priorTarget);
  graph.dispose();
});

test('render graph admits its composite resources with no AO or bloom pass and restores on init failure', async () => {
  const priorTarget = { name: 'prior target' };
  let activeTarget = priorTarget;
  const renderedTargets = [];
  const renderer = {
    isWebGLRenderer: true,
    capabilities: { isWebGL2: false },
    getRenderTarget: () => activeTarget,
    setRenderTarget: (target) => { activeTarget = target; },
    initRenderTarget() {},
    clear() {},
    render() { renderedTargets.push(activeTarget); },
    compile() {},
  };
  const graph = new SpaceRenderGraph(renderer, { ao: false, bloom: false });
  graph._distortionLive = true;
  const result = await graph.prepareResources({ camera: new THREE.PerspectiveCamera() });
  assert.deepEqual(result, { skipped: false, targets: 2 });
  assert.deepEqual(renderedTargets, [graph.distortionTarget]);
  assert.strictEqual(graph.compositeMaterial.uniforms.tDistortion.value, graph.blackBloomTexture,
    'the composite warmup destination is never sampled as an active distortion input');
  assert.equal(graph._distortionLive, true, 'warmup restores the prior distortion activity state');
  assert.strictEqual(activeTarget, priorTarget);
  graph.dispose();

  const failingRenderer = {
    ...renderer,
    initRenderTarget() { throw new Error('target allocation failed'); },
  };
  const failingGraph = new SpaceRenderGraph(failingRenderer, { ao: false, bloom: false });
  await assert.rejects(() => failingGraph.prepareResources(), /target allocation failed/);
  assert.strictEqual(activeTarget, priorTarget);
  failingGraph.dispose();
});

test('render graph owns one clamped scene scale and reallocates when only that scale changes', () => {
  const renderer = {
    isWebGLRenderer: true,
    capabilities: { isWebGL2: false },
  };
  const graph = new SpaceRenderGraph(renderer, {
    enabled: true,
    ao: false,
    bloom: false,
    renderScale: 0.75,
  });
  graph.setSize(800, 600);
  const firstTarget = graph.sceneTarget;
  assert.deepEqual(graph.diagnostics(), {
    ...graph.diagnostics(),
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
    sceneTargetWidth: 600,
    sceneTargetHeight: 450,
    effectiveSceneScale: 0.75,
  });

  graph.setOptions({ renderScale: 0.5 });
  assert.notStrictEqual(graph.sceneTarget, firstTarget,
    'a scale-only setting change reallocates even when external dimensions are unchanged');
  assert.equal(graph.diagnostics().sceneTargetWidth, 400);
  assert.equal(graph.diagnostics().sceneTargetHeight, 300);

  graph.setOptions({ renderScale: 2 });
  assert.equal(graph.diagnostics().renderScale, 1,
    'the graph declines supersampling above its 1x contract');
  assert.equal(graph.diagnostics().sceneTargetWidth, 800);
  assert.equal(graph.diagnostics().sceneTargetHeight, 600);
  graph.dispose();
});

test('one post-route dispatcher keeps warm-up and opening frames on canonical presentation', () => {
  const cases = [];
  for (const renderGraph of [false, true]) {
    for (const bloom of [false, true]) {
      for (const bloomStrength of [0, 0.52]) {
        cases.push({ renderGraph, bloom, bloomStrength });
      }
    }
  }

  for (const options of cases) {
    const harness = createPostRouteHarness(options);
    const expectedRoute = options.renderGraph
      ? POST_PROCESS_ROUTE.GRAPH
      : POST_PROCESS_ROUTE.BLOOM;

    harness.owner._warmPostProcess(harness.scene, harness.camera);
    assert.deepEqual(harness.renderCalls.map((call) => call.route), [expectedRoute],
      `warm route for ${JSON.stringify(options)}`);
    assert.strictEqual(harness.renderCalls[0].scene, harness.scene);
    assert.strictEqual(harness.renderCalls[0].camera, harness.camera);
    if (expectedRoute === POST_PROCESS_ROUTE.GRAPH) {
      assert.equal(harness.renderCalls[0].frame.time, 19);
    }

    harness.renderCalls.length = 0;
    harness.owner._renderOpeningPostFrame(harness.scene, harness.camera);
    assert.deepEqual(harness.renderCalls.map((call) => call.route), [expectedRoute],
      `opening route for ${JSON.stringify(options)}`);
  }

  const graphFailure = createPostRouteHarness({
    renderGraph: true,
    graphAvailable: false,
    bloom: false,
    bloomStrength: 0,
  });
  graphFailure.owner._warmPostProcess(graphFailure.scene, graphFailure.camera);
  assert.deepEqual(graphFailure.renderCalls.map((call) => call.route), [POST_PROCESS_ROUTE.BLOOM],
    'a failed optional graph falls back to the HDR bloom wrapper, not the native screen target');

  const noPostProcessor = createPostRouteHarness({ bloomAvailable: false });
  assert.equal(noPostProcessor.owner._selectPostRoute(), POST_PROCESS_ROUTE.NATIVE);
  noPostProcessor.owner._renderOpeningPostFrame(noPostProcessor.scene, noPostProcessor.camera);
  assert.deepEqual(noPostProcessor.renderCalls.map((call) => call.route), [POST_PROCESS_ROUTE.NATIVE]);
  assert.equal(noPostProcessor.owner._postNativeFallbackReason, 'post-processor-unavailable');

  const lostContext = createPostRouteHarness({ renderGraph: true, contextLost: true });
  assert.equal(lostContext.owner._selectPostRoute(), POST_PROCESS_ROUTE.NATIVE);
  assert.equal(lostContext.owner._warmPostProcess(lostContext.scene, lostContext.camera), false);
  assert.deepEqual(lostContext.renderCalls, [], 'context loss selects the fallback but submits no unsafe draw');
});

test('post-route compilation targets the graph scene target or the bloom HDR admission seam', async () => {
  const graph = createPostRouteHarness({ renderGraph: true, bloom: false, bloomStrength: 0 });
  await graph.owner._compilePostRoute(
    graph.owner._selectPostRoute(), graph.subject, graph.camera, graph.scene,
  );
  assert.equal(graph.compileCalls.length, 1);
  assert.strictEqual(graph.compileCalls[0].target, graph.graphTarget,
    'graph admission compiles the exact graph scene target');
  assert.strictEqual(graph.activeTarget(), graph.previousTarget,
    'graph admission restores the renderer target');

  const bloom = createPostRouteHarness({ renderGraph: false, bloom: false, bloomStrength: 0 });
  const bloomResult = await bloom.owner._compilePostRoute(
    bloom.owner._selectPostRoute(), bloom.subject, bloom.camera, bloom.scene,
  );
  assert.deepEqual(bloomResult, { skipped: false, route: 'bloom-hdr' });
  assert.deepEqual(bloom.bloomCompileCalls, [{
    subject: bloom.subject,
    camera: bloom.camera,
    lightingScene: bloom.scene,
  }], 'bloom off/zero still uses the wrapper-owned HDR compile seam');
  assert.deepEqual(bloom.compileCalls, [], 'the dispatcher never substitutes a screen-target compile');

  const unavailable = createPostRouteHarness({ bloomAvailable: false });
  await unavailable.owner._compilePostRoute(
    unavailable.owner._selectPostRoute(), unavailable.subject, unavailable.camera, unavailable.scene,
  );
  assert.equal(unavailable.compileCalls.length, 1);
  assert.strictEqual(unavailable.compileCalls[0].target, null,
    'only the diagnosed unavailable-post fallback compiles for the native screen target');
});

test('AO and zero/off bloom skip their pass families without skipping presentation', () => {
  let activeTarget = null;
  const renders = [];
  const renderer = {
    isWebGLRenderer: true,
    capabilities: { isWebGL2: false },
    autoClear: true,
    getRenderTarget: () => activeTarget,
    setRenderTarget(target) { activeTarget = target; },
    clear() {},
    render(scene) { renders.push(scene); },
  };
  const graph = new SpaceRenderGraph(renderer, {
    ao: false,
    bloom: false,
    bloomStrength: 1,
  });
  graph.setSize(64, 64);
  const scene = new THREE.Scene();
  graph.render(scene, new THREE.PerspectiveCamera(), { time: 0 });

  assert.equal(renders.filter((candidate) => candidate === scene).length, 1,
    'AO off renders the world once and performs no normal override pass');
  assert.equal(renders.length, 2, 'scene plus canonical composite remain');
  assert.deepEqual(graph.diagnostics().passFamilies,
    { scene: 1, normal: 0, ao: 0, bloom: 0, distortion: 0, composite: 1 });

  renders.length = 0;
  graph.setOptions({ bloom: true, bloomStrength: 0 });
  graph.render(scene, new THREE.PerspectiveCamera(), { time: 0 });
  assert.equal(renders.length, 2, 'zero strength also skips every bloom pass');
  assert.equal(graph.diagnostics().bloomPasses, 0);
  graph.dispose();
});

test('startup waits for procedural warm-up, then drains captured authored opening plans', async () => {
  const timeline = [];
  const pipelinePlan = { watermark: 4, pendingCount: 2 };
  const residencyPlan = { watermark: 9, pendingCount: 2 };
  const state = {
    render: {
      pipelinePrecompileReady: Promise.resolve().then(() => { timeline.push('procedural'); }),
      captureOpeningPipelinePlan: () => {
        timeline.push('pipelines:capture');
        return pipelinePlan;
      },
      drainOpeningPipelinePlan: async (plan) => {
        assert.strictEqual(plan, pipelinePlan);
        timeline.push('pipelines:ready');
      },
      captureOpeningGpuResidencyPlan: (capturedPipelinePlan) => {
        assert.strictEqual(capturedPipelinePlan, pipelinePlan);
        timeline.push('residency:capture');
        return residencyPlan;
      },
      drainOpeningGpuResidencyPlan: async (plan) => {
        assert.strictEqual(plan, residencyPlan);
        timeline.push('residency:ready');
      },
    },
  };

  const ready = await waitForCurrentRenderPipelines(state, 1000);

  assert.equal(ready, true);
  assert.deepEqual(timeline, [
    'procedural',
    'pipelines:capture',
    'pipelines:ready',
    'residency:capture',
    'residency:ready',
  ]);
  assert.equal(typeof state.render.exactPipelineWarmupReady?.then, 'function');
  assert.equal(typeof state.render.authoredGpuAdmissionReady?.then, 'function');
});

test('startup drains the immutable exact opening submission before GPU residency', async () => {
  const timeline = [];
  const pipelinePlan = { watermark: 1, pendingCount: 1 };
  const submissionPlan = Object.freeze({
    complete: true,
    drawLeaves: [],
    firstPlayablePipelineSet: Object.freeze({ complete: true }),
  });
  const residencyPlan = { watermark: 2, pendingCount: 0 };
  const state = {
    render: {
      pipelinePrecompileReady: Promise.resolve(),
      captureOpeningPipelinePlan: () => pipelinePlan,
      drainOpeningPipelinePlan: async () => { timeline.push('pipeline'); },
      captureOpeningSubmissionPlan: () => {
        timeline.push('submission:capture');
        return submissionPlan;
      },
      drainOpeningSubmissionPlan: async (plan) => {
        assert.strictEqual(plan, submissionPlan);
        timeline.push('submission:drain');
      },
      captureOpeningGpuResidencyPlan: () => {
        timeline.push('residency:capture');
        return residencyPlan;
      },
      drainOpeningGpuResidencyPlan: async () => { timeline.push('residency'); },
    },
  };

  assert.equal(await waitForCurrentRenderPipelines(state, 1000), true);
  assert.deepEqual(timeline, [
    'pipeline',
    'submission:capture',
    'submission:drain',
    'residency:capture',
    'residency',
  ]);
  assert.strictEqual(state.render.openingSubmissionReady?.then instanceof Function, true);
});

test('startup publishes the final opening visibility boundary before freezing exact capture', async () => {
  const timeline = [];
  const root = { visible: false };
  const state = {
    mode: 'loading',
    render: {
      pipelinePrecompileReady: Promise.resolve(),
      prepareOpeningFirstPicture: async () => {
        assert.equal(root.visible, false, 'the actor is still hidden during the loading phase');
        timeline.push('opening:prepare');
        root.visible = true;
        await Promise.resolve();
        timeline.push('opening:published');
        return true;
      },
      captureOpeningSubmissionPlan: () => {
        assert.equal(root.visible, true, 'capture observes the final first-picture visibility');
        timeline.push('opening:capture');
        return { complete: true, firstPlayablePipelineSet: { complete: true } };
      },
      drainOpeningSubmissionPlan: async () => { timeline.push('opening:drain'); },
    },
  };

  assert.equal(await waitForCurrentRenderPipelines(state, 1000), true);
  assert.deepEqual(timeline, [
    'opening:prepare',
    'opening:published',
    'opening:capture',
    'opening:drain',
  ]);
});

test('opening publication settles the chase camera before classifying first-picture visibility', () => {
  const source = renderSystem._publishOpeningFirstPicture.toString();
  const followAt = source.indexOf('this.cam.follow(0)');
  const visibilityAt = source.indexOf('this.syncEntityViews(1)');
  assert.ok(followAt >= 0 && visibilityAt >= 0 && followAt < visibilityAt,
    'the exact census must not cull with the loading camera and then freeze a different chase-camera picture');
});

test('the first flight submit preserves the prepared opening graph instead of selecting a new LOD', () => {
  const source = renderSystem.prepareFrame.toString();
  assert.match(source, /holdOpeningPicture\s*=\s*this\._openingFirstPicturePrepared\s*===\s*true/);
  assert.match(source,
    /if\s*\(!holdOpeningPicture\)\s*\{[\s\S]*?this\.syncEntityViews\(alpha\)[\s\S]*?this\.cam\.follow\(frameDt\)/,
    'ordinary pose, visibility, LOD, and camera selection resume only after the exact first picture is submitted');
});

test('opening admission waits for a visible whole-ship LOD transition after authored swap settles', async () => {
  const transition = deferred();
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.userData.authoredAssetState = 'authored';
  root.userData.authoredUpgradePromise = Promise.resolve({ status: 'authored' });
  root.userData.wholeShipLodTransitionPromise = transition.promise;
  scene.add(root);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const entity = { id: 'lod-opening-root', type: 'ship', alive: true, radius: 1 };
  const owner = {
    state: { entities: new Map([[entity.id, entity]]) },
    cam: { obj: camera },
    scene,
    _meshes: new Map([[entity.id, root]]),
    renderer: {},
  };

  const pending = renderSystem._openingFirstPictureUpgradePromises.call(owner);
  assert.deepEqual(pending, [transition.promise],
    'the retained settled base promise is ignored while the live LOD child replacement still blocks');

  let completed = false;
  const wait = Promise.all(pending).then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false, 'opening admission must not move past an unresolved LOD replacement');
  transition.resolve({ swapped: true });
  await wait;
  assert.equal(completed, true);
  scene.remove(root);
});

test('loading startup bypasses broad authored queues and admits the exact submission once', async () => {
  const timeline = [];
  let broadCaptureCalls = 0;
  let exactCaptureCalls = 0;
  let exactDrainCalls = 0;
  const state = {
    mode: 'loading',
    render: {
      pipelinePrecompileReady: Promise.resolve(),
      captureOpeningPipelinePlan: () => {
        broadCaptureCalls++;
        throw new Error('loading must not capture the broad authored queue');
      },
      drainOpeningPipelinePlan: () => {
        throw new Error('loading must not drain the broad authored queue');
      },
      captureOpeningSubmissionPlan: () => {
        exactCaptureCalls++;
        timeline.push('exact:capture');
        return { complete: true, firstPlayablePipelineSet: { complete: true } };
      },
      drainOpeningSubmissionPlan: async () => {
        exactDrainCalls++;
        timeline.push('exact:drain');
      },
      captureOpeningGpuResidencyPlan: () => {
        throw new Error('loading must not capture broad residency');
      },
      drainOpeningGpuResidencyPlan: () => {
        throw new Error('loading must not drain broad residency');
      },
    },
  };

  assert.equal(await waitForCurrentRenderPipelines(state, 1000), true);
  assert.equal(broadCaptureCalls, 0);
  assert.equal(exactCaptureCalls, 1);
  assert.equal(exactDrainCalls, 1);
  assert.deepEqual(timeline, ['exact:capture', 'exact:drain']);
});

test('startup selects residency started by captured pipeline continuations and excludes unrelated roots', async () => {
  const timeline = [];
  const openingUpload = deferred();
  const lateUpload = deferred();
  const residencyCaptured = deferred();
  const gpuStarted = new Set();
  const residencyTracker = createGpuResidencyAdmissionTracker(async (subject) => {
    gpuStarted.add(subject);
    timeline.push(`gpu:start:${subject}`);
    await (subject === 'opening-root' ? openingUpload.promise : lateUpload.promise);
    timeline.push(`gpu:ready:${subject}`);
    return { skipped: false, subject };
  });
  const shaderDrain = deferred();
  const pipelineTracker = createPipelineAdmissionTracker(async () => {
    timeline.push('pipelines:ready');
    await shaderDrain.promise;
    return { skipped: false };
  }, { deferAutoFlush: () => true });
  let openingPublished = false;
  let latePublished = false;
  const pipeline = pipelineTracker.compile('opening-root').then(() => {
    timeline.push('pipeline:continued:opening');
    return residencyTracker.prepare('opening-root').then(() => {
      openingPublished = true;
    });
  });
  const state = {
    render: {
      captureOpeningPipelinePlan: () => {
        timeline.push('pipelines:capture');
        return pipelineTracker.capturePending();
      },
      drainOpeningPipelinePlan: (plan) => pipelineTracker.waitForCaptured(plan),
      captureOpeningGpuResidencyPlan: (pipelinePlan) => {
        timeline.push('residency:capture');
        residencyCaptured.resolve();
        return residencyTracker.captureSubjects(pipelineTracker.subjectsForCaptured(pipelinePlan));
      },
      drainOpeningGpuResidencyPlan: (plan) => residencyTracker.waitForCaptured(plan),
    },
  };

  let readinessSettled = false;
  const readiness = waitForCurrentRenderPipelines(state, 1_000).then((result) => {
    readinessSettled = true;
    return result;
  });
  const lateResidency = residencyTracker.prepare('late-root').then(() => {
    latePublished = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(timeline.includes('residency:capture'), false,
    'residency selection waits until captured pipeline continuations can start production work');
  assert.equal(gpuStarted.has('opening-root'), false);

  shaderDrain.resolve();
  await Promise.race([
    residencyCaptured.promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('residency cohort was not captured')), 100)),
  ]);
  assert.equal(gpuStarted.has('opening-root'), true,
    'the captured root starts residency from its pipeline continuation');
  assert.ok(timeline.indexOf('pipeline:continued:opening') < timeline.indexOf('residency:capture'));
  assert.ok(timeline.indexOf('gpu:start:opening-root') < timeline.indexOf('residency:capture'));
  lateUpload.resolve();
  await lateResidency;
  assert.equal(readinessSettled, false,
    'unrelated residency admitted after the cohort boundary cannot satisfy startup');
  assert.equal(latePublished, true);
  assert.equal(openingPublished, false);

  openingUpload.resolve();
  assert.equal(await readiness, true,
    'startup waits the captured root through its own future residency receipt');
  assert.equal(latePublished, true,
    'the unrelated root remains independently published by only its own residency receipt');
  await pipeline;
  assert.equal(openingPublished, true);
  assert.equal(typeof state.render.authoredGpuAdmissionReady?.then, 'function');
});

test('inactive captured root without residency does not reserve or delay startup', async () => {
  const residencyTracker = createGpuResidencyAdmissionTracker(async () => {
    throw new Error('inactive root must not begin residency');
  });
  const pipelineTracker = createPipelineAdmissionTracker(async () => ({ skipped: false }), {
    deferAutoFlush: () => true,
  });
  let rootActive = true;
  let residencyPlan = null;
  const pipeline = pipelineTracker.compile('inactive-root').then(() => {
    rootActive = false;
    if (!rootActive) return { skipped: true, reason: 'inactive' };
    return residencyTracker.prepare('inactive-root');
  });
  const state = {
    render: {
      captureOpeningPipelinePlan: () => pipelineTracker.capturePending(),
      drainOpeningPipelinePlan: (plan) => pipelineTracker.waitForCaptured(plan),
      captureOpeningGpuResidencyPlan: (pipelinePlan) => {
        residencyPlan = residencyTracker.captureSubjects(
          pipelineTracker.subjectsForCaptured(pipelinePlan),
        );
        return residencyPlan;
      },
      drainOpeningGpuResidencyPlan: (plan) => residencyTracker.waitForCaptured(plan),
    },
  };

  assert.equal(await waitForCurrentRenderPipelines(state, 50), true,
    'an inactive root that starts no residency cannot hold the loading gate');
  assert.deepEqual(await pipeline, { skipped: true, reason: 'inactive' });
  assert.equal(residencyPlan?.pendingCount, 0,
    'the captured identity creates no future residency reservation');
  assert.equal(residencyTracker.pendingCount, 0);
});

test('startup fails closed when exact authored pipeline compilation rejects', async () => {
  const state = {
    render: {
      pipelinePrecompileReady: Promise.resolve(),
      captureOpeningPipelinePlan: () => ({ watermark: 1, pendingCount: 1 }),
      drainOpeningPipelinePlan: async () => { throw new Error('authored compile failed'); },
    },
  };

  assert.equal(await waitForCurrentRenderPipelines(state, 1000), false);
});

test('startup fails closed when the GPU context is lost', async () => {
  const state = {
    render: {
      contextLost: true,
      pipelinePrecompileReady: Promise.resolve(),
      captureOpeningPipelinePlan: () => ({ watermark: 1, pendingCount: 1 }),
      drainOpeningPipelinePlan: async () => ({ skipped: false }),
    },
  };

  assert.equal(await waitForCurrentRenderPipelines(state, 1000), false);
});

test('pipeline admission tracker batches subjects into one driver compile and exposes one readiness gate', async () => {
  const gate = deferred();
  const started = [];
  const tracker = createPipelineAdmissionTracker((subjects) => {
    started.push(subjects);
    return gate.promise;
  });

  const first = tracker.compile('ship-a');
  const second = tracker.compile('ship-b');
  assert.deepEqual(started, []);
  assert.equal(tracker.pendingCount, 2);

  let settled = false;
  const all = tracker.waitForPending().then(() => { settled = true; });
  await Promise.resolve();
  assert.deepEqual(started, [['ship-a', 'ship-b']]);
  await Promise.resolve();
  assert.equal(settled, false);
  gate.resolve({ ok: true });
  await all;
  assert.equal(tracker.pendingCount, 0);
  assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }]);
});

test('loading admission can defer all automatic compiles until the explicit startup gate', async () => {
  const started = [];
  const tracker = createPipelineAdmissionTracker(async (subjects) => {
    started.push(subjects);
    return { ok: true };
  }, {
    deferAutoFlush: () => true,
    quietMs: 1,
    maxWaitMs: 2,
  });

  const first = tracker.compile('player');
  const second = tracker.compile('station');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(started, [], 'the loading route must not pay one GPU admission per decoded object');

  await tracker.waitForPending();
  assert.deepEqual(started, [['player', 'station']]);
  assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }]);
});

test('nonopening admissions stay outside startup and resume after paint in bounded batches', async () => {
  const started = [];
  const scheduledCadence = [];
  const gpuGates = new Map();
  const published = [];
  let loading = true;
  const tracker = createPipelineAdmissionTracker(async (subjects) => {
    started.push(subjects.slice());
    return { subjects };
  }, {
    deferAutoFlush: () => loading,
    resumeBatchSize: 2,
    scheduleResume: (callback) => { scheduledCadence.push(callback); },
  });
  const residency = createGpuResidencyAdmissionTracker(async (subject) => {
    const gate = deferred();
    gpuGates.set(subject, gate);
    await gate.promise;
    return { subject };
  });

  const opening = tracker.compile('opening-ship');
  const plan = tracker.capturePending();
  const startup = tracker.waitForCaptured(plan);
  const nonopeningRoots = Array.from({ length: 7 }, (_, index) => `nonopening-${index}`);
  const publications = nonopeningRoots.map((root) => (
    tracker.compile(root)
      .then(() => residency.prepare(root))
      .then(() => { published.push(root); })
  ));
  await startup;

  assert.equal(plan.pendingCount, 1);
  assert.equal(plan.watermark, 1);
  assert.deepEqual(started, [['opening-ship']],
    'startup compiles only the authored root captured at the opening watermark');
  assert.deepEqual(published, [], 'nonopening roots cannot publish before their own GPU residency');
  assert.deepEqual(await opening, { subjects: ['opening-ship'] });

  loading = false;
  tracker.resumeAutoFlush();
  for (let turn = 0; turn < 10 && started.length < 2; turn++) await Promise.resolve();
  assert.deepEqual(started[1], ['nonopening-0', 'nonopening-1']);
  assert.deepEqual(published, [], 'pipeline completion alone never publishes a nonopening root');

  while (started.length < 5) {
    for (let turn = 0; turn < 10 && scheduledCadence.length === 0; turn++) await Promise.resolve();
    const resume = scheduledCadence.shift();
    assert.equal(typeof resume, 'function', 'each remaining batch waits for an explicit cadence turn');
    resume();
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.ok(started.slice(1).every((batch) => batch.length <= 2),
    `resumed compile batches exceeded the limit: ${JSON.stringify(started.slice(1))}`);
  assert.deepEqual(started.slice(1).flat(), nonopeningRoots);
  assert.deepEqual(published, []);
  for (let turn = 0; turn < 20 && gpuGates.size < nonopeningRoots.length; turn++) {
    await Promise.resolve();
  }

  for (const root of nonopeningRoots) {
    assert.ok(gpuGates.has(root), `${root} must own an independent residency promise`);
    gpuGates.get(root).resolve();
  }
  await Promise.all(publications);
  assert.deepEqual(published.sort(), nonopeningRoots.slice().sort());
  assert.equal(tracker.pendingCount, 0);
});

test('renderer wires startup to captured authored admissions, never the installed scene or moving fixpoint', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const readiness = await readFile(new URL('../src/render/pipelineReadiness.js', import.meta.url), 'utf8');
  assert.match(source,
    /captureOpeningPipelinePlan\s*=\s*\(\)\s*=>\s*\{[\s\S]*pipelineAdmissions\.capturePending\(\)/);
  assert.match(source,
    /drainOpeningPipelinePlan\s*=\s*\(plan\)\s*=>\s*\(\s*plan\s*&&\s*plan\.skipped\s*===\s*true/);
  assert.match(source,
    /captureOpeningGpuResidencyPlan\s*=\s*\(pipelinePlan\)\s*=>\s*gpuResidencyAdmissions\.captureSubjects\(/);
  assert.match(source,
    /drainOpeningGpuResidencyPlan\s*=\s*\(plan\)\s*=>\s*\(\s*plan\s*&&\s*plan\.skipped\s*===\s*true/);
  assert.doesNotMatch(readiness, /compileCurrentPipelines|waitForAuthoredGpuResidency/,
    'startup readiness no longer invokes the diagnostic full-scene compiler or moving residency wait');
  assert.match(source,
    /compileCurrentPipelines\s*=\s*\(\)\s*=>\s*pipelineAdmissions\.compileExplicit\(scene\)/,
    'the retained full-scene compiler is explicit diagnostic compatibility only');
  assert.match(source, /createOpeningSubmissionPlan/, 'startup must build an exact first-picture leaf plan');
  assert.match(source, /state\.render\.captureOpeningSubmissionPlan/, 'startup must capture the exact plan');
  // The extracted first-paint release and admission resumption are exercised directly in
  // opening-mesh-defer.test.mjs; character distance between source tokens is not that contract.
});

test('renderer entry points delegate route selection instead of branching on bloom controls', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const warmStart = source.indexOf('state.render.warmPostProcess =');
  const compileStart = source.indexOf('const compileSubjectColorAndDepth =', warmStart);
  const openingStart = source.indexOf('state.render.prepareOpeningGpuResources =', compileStart);
  const openingEnd = source.indexOf('// Collision/socket/landing debug toggle', openingStart);
  const drawStart = source.indexOf('drawPreparedFrame()');
  const renderFrameStart = source.indexOf('renderFrame(', drawStart);
  assert.ok(warmStart >= 0 && compileStart > warmStart && openingStart > compileStart
    && openingEnd > openingStart);
  assert.ok(drawStart >= 0 && renderFrameStart > drawStart);

  const warmWire = source.slice(warmStart, compileStart);
  const compileWire = source.slice(compileStart, openingStart);
  const openingWire = source.slice(openingStart, openingEnd);
  const drawWire = source.slice(drawStart, renderFrameStart);
  assert.match(warmWire, /this\._warmPostProcess\(scene, cam\.obj\)/);
  assert.match(compileWire,
    /this\._compilePostRoute\(\s*route, subject, cam\.obj, scene/);
  assert.match(compileWire,
    /compileSubjectColorAndDepth\(batch\[0\], route\)/);
  assert.match(compileWire,
    /compileSubjectColorAndDepth\(staging, route\)/);
  assert.match(compileWire, /restoreObjectHome\(home\)/);
  assert.match(openingWire, /openingSubmissionPlan/);
  assert.doesNotMatch(openingWire, /_renderOpeningPostFrame\(/,
    'the loading path must not render a hidden discovery frame');
  assert.match(drawWire,
    /const postRoute = this\._selectPostRoute\(\)[\s\S]*?this\._renderPostRoute\(postRoute,/);
  assert.doesNotMatch(`${warmWire}\n${compileWire}\n${openingWire}\n${drawWire}`,
    /video\.bloom|bloomStrength\s*[<=>]/,
    'bloom controls stay inside the selected post processor and never choose the route');
});

test('pipeline admission tracker reports only synchronous compileBatch duration for queued and captured paths', async () => {
  const slices = [];
  let clock = 1000;
  const tracker = createPipelineAdmissionTracker((subjects) => {
    clock += 7;
    return new Promise((resolve) => {
      queueMicrotask(() => {
        clock += 1000; // async settle must not be attributed as blocking CPU
        resolve({ subjects: subjects.slice() });
      });
    });
  }, {
    deferAutoFlush: () => true,
    now: () => clock,
    onBlockingSlice: (slice) => { slices.push({ ...slice }); },
  });

  const first = tracker.compile('ship-a');
  const second = tracker.compile('ship-b');
  await tracker.waitForPending();
  assert.deepEqual(await Promise.all([first, second]), [
    { subjects: ['ship-a', 'ship-b'] },
    { subjects: ['ship-a', 'ship-b'] },
  ]);
  assert.equal(slices.length, 1, 'queued batch notifies once for the shared compileBatch invocation');
  assert.equal(slices[0].kind, 'pipelineAdmissionSync');
  assert.equal(slices[0].durationMs, 7);
  assert.equal(slices[0].path, 'queued');
  assert.equal(slices[0].subjectCount, 2);

  clock = 5000;
  const opening = tracker.compile('opening-root');
  const plan = tracker.capturePending();
  await tracker.waitForCaptured(plan);
  assert.deepEqual(await opening, { subjects: ['opening-root'] });
  assert.equal(slices.length, 2, 'captured plan notifies once for its serial compileBatch invocation');
  assert.equal(slices[1].kind, 'pipelineAdmissionSync');
  assert.equal(slices[1].durationMs, 7);
  assert.equal(slices[1].path, 'captured');
  assert.equal(slices[1].subjectCount, 1);
});

test('pipeline admission tracker observes a synchronous compileBatch throw once and still rejects', async () => {
  const slices = [];
  let clock = 10;
  const tracker = createPipelineAdmissionTracker(() => {
    clock += 5;
    throw new Error('sync compile boom');
  }, {
    deferAutoFlush: () => true,
    now: () => clock,
    onBlockingSlice: (slice) => { slices.push({ ...slice }); },
  });

  const pending = tracker.compile('broken-root');
  const readiness = tracker.waitForPending();
  await assert.rejects(pending, /sync compile boom/);
  await assert.rejects(readiness, /sync compile boom/);
  assert.equal(slices.length, 1, 'a sync throw still notifies exactly once');
  assert.equal(slices[0].kind, 'pipelineAdmissionSync');
  assert.equal(slices[0].durationMs, 5);
  assert.equal(slices[0].path, 'queued');
  assert.equal(slices[0].subjectCount, 1);
});

test('pipeline admission tracker ignores invalid observer/clock options without changing results', async () => {
  const tracker = createPipelineAdmissionTracker(async (subjects) => ({ subjects }), {
    deferAutoFlush: () => true,
    onBlockingSlice: 'not-a-function',
    now: () => { throw new Error('clock must stay inert without a valid observer'); },
  });
  const pending = tracker.compile('safe');
  await tracker.waitForPending();
  assert.deepEqual(await pending, { subjects: ['safe'] });
});

test('pipeline admission tracker observer throw does not change compile success or failure', async () => {
  const okTracker = createPipelineAdmissionTracker(async (subjects) => ({ subjects }), {
    deferAutoFlush: () => true,
    onBlockingSlice: () => { throw new Error('observer boom'); },
  });
  const okPending = okTracker.compile('ok-root');
  await okTracker.waitForPending();
  assert.deepEqual(await okPending, { subjects: ['ok-root'] });

  const failTracker = createPipelineAdmissionTracker(() => {
    throw new Error('sync compile boom');
  }, {
    deferAutoFlush: () => true,
    onBlockingSlice: () => { throw new Error('observer boom'); },
  });
  const failPending = failTracker.compile('broken-root');
  const failReadiness = failTracker.waitForPending();
  await assert.rejects(failPending, /sync compile boom/);
  await assert.rejects(failReadiness, /sync compile boom/);
});

test('renderer routes authored pipeline/GPU residency blocking slices into perf admission work', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source,
    /recordAuthoredAdmissionBlockingSlice/,
    'renderer must own one shared blocking-slice observer for authored admission paths');
  const observerWires = source.match(/onBlockingSlice:\s*recordAuthoredAdmissionBlockingSlice/g);
  assert.equal(
    observerWires?.length,
    3,
    'pipeline tracker, authored residency tracker, and opening residency call must share the observer',
  );
  assert.match(source,
    /createPipelineAdmissionTracker\([\s\S]*?onBlockingSlice:\s*recordAuthoredAdmissionBlockingSlice/,
    'pipeline admission must publish synchronous compileBatch slices');
  assert.match(source,
    /createGpuResidencyAdmissionTracker\([\s\S]*?onBlockingSlice:\s*recordAuthoredAdmissionBlockingSlice/,
    'authored GPU residency tracker must publish initTexture slices');
  assert.match(source,
    /prepareStartupGpuResidency\(renderer,\s*plan\.residencySubjects[\s\S]*?onBlockingSlice:\s*recordAuthoredAdmissionBlockingSlice/,
    'opening GPU residency must publish initTexture slices');
  assert.match(source,
    /recordAdmissionWork\(\s*durationMs\s*\)/,
    'positive finite slices must feed backlog admission attribution');
  assert.match(source,
    /renderWorkEnabled[\s\S]*?recordRenderWork\(\s*(?:slice\.)?kind\s*,\s*durationMs\s*\)/,
    'render-work attribution must stay behind the existing default-off contract');
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createPostRouteHarness({
  renderGraph = false,
  graphAvailable = true,
  bloomAvailable = true,
  bloom = true,
  bloomStrength = 0.52,
  contextLost = false,
} = {}) {
  const previousTarget = { name: 'previous-target' };
  const graphTarget = { name: 'graph-scene-target' };
  const scene = { name: 'route-scene' };
  const subject = { name: 'route-subject' };
  const camera = { name: 'route-camera' };
  const renderCalls = [];
  const compileCalls = [];
  const bloomCompileCalls = [];
  let activeTarget = previousTarget;

  const renderer = {
    getRenderTarget: () => activeTarget,
    setRenderTarget(target) { activeTarget = target; },
    render(renderScene, renderCamera) {
      renderCalls.push({
        route: POST_PROCESS_ROUTE.NATIVE,
        scene: renderScene,
        camera: renderCamera,
      });
    },
    async compileAsync(...args) {
      compileCalls.push({ args, target: activeTarget });
    },
    getContext: () => ({ isContextLost: () => contextLost }),
    info: { programs: [] },
  };
  const graph = {
    sceneTarget: graphTarget,
    render(renderScene, renderCamera, frame) {
      renderCalls.push({
        route: POST_PROCESS_ROUTE.GRAPH,
        scene: renderScene,
        camera: renderCamera,
        frame,
      });
    },
  };
  const bloomWrapper = {
    render(renderScene, renderCamera) {
      renderCalls.push({
        route: POST_PROCESS_ROUTE.BLOOM,
        scene: renderScene,
        camera: renderCamera,
      });
    },
    async compileScenePipelines(compileSubject, compileCamera, lightingScene) {
      bloomCompileCalls.push({ subject: compileSubject, camera: compileCamera, lightingScene });
      return { skipped: false, route: 'bloom-hdr' };
    },
  };
  const owner = Object.assign(Object.create(renderSystem), {
    state: {
      settings: { video: { renderGraph, bloom, bloomStrength } },
      render: {},
    },
    renderer,
    bloom: bloomAvailable ? bloomWrapper : null,
    _renderGraph: renderGraph && graphAvailable ? graph : null,
    _contextLost: contextLost,
    _bgTime: 19,
    _postFrameOptions: { time: 0 },
    _ensureRenderGraph() {
      if (!graphAvailable) {
        this._renderGraph = null;
        return false;
      }
      this._renderGraph = graph;
      return true;
    },
  });

  return {
    owner,
    previousTarget,
    graphTarget,
    scene,
    subject,
    camera,
    renderCalls,
    compileCalls,
    bloomCompileCalls,
    activeTarget: () => activeTarget,
  };
}
