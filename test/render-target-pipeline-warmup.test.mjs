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
  const renderer = {
    capabilities: { isWebGL2: false, maxSamples: 0 },
    autoClear: true,
    getRenderTarget: () => null,
    setRenderTarget: (target) => { targets.push(target); },
    render() {},
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
  assert.equal(bloom.contextLossResources().length, bloom.diagnostics().renderTargetCount,
    'context loss exposes every bloom render target before rebuild/resize can dispose it');
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

test('startup waits for procedural warm-up, then compiles the installed authored scene', async () => {
  const timeline = [];
  const state = {
    render: {
      pipelinePrecompileReady: Promise.resolve().then(() => { timeline.push('procedural'); }),
      compileCurrentPipelines: async () => { timeline.push('authored-hdr'); },
    },
  };

  const ready = await waitForCurrentRenderPipelines(state, 1000);

  assert.equal(ready, true);
  assert.deepEqual(timeline, ['procedural', 'authored-hdr']);
  assert.equal(typeof state.render.exactPipelineWarmupReady?.then, 'function');
});

test('startup cannot outrun authored GPU residency after the deferred shader flush', async () => {
  const timeline = [];
  const upload = deferred();
  const tracker = createGpuResidencyAdmissionTracker(async () => {
    timeline.push('gpu:start');
    await upload.promise;
    timeline.push('gpu:ready');
    return { skipped: false, textures: 21 };
  });
  let publication = null;
  const state = {
    render: {
      compileCurrentPipelines() {
        timeline.push('pipelines:ready');
        publication = tracker.prepare({ name: 'detached-authored-root' }).then(() => {
          timeline.push('authored:published');
        });
      },
      waitForAuthoredGpuResidency: () => tracker.waitForPending(),
    },
  };

  let settled = false;
  const readiness = waitForCurrentRenderPipelines(state, 1_000).then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false, 'a fast shader compile cannot publish flight while textures are pending');
  assert.deepEqual(timeline, ['pipelines:ready', 'gpu:start']);

  upload.resolve();
  assert.equal(await readiness, true);
  await publication;
  assert.deepEqual(timeline, [
    'pipelines:ready',
    'gpu:start',
    'gpu:ready',
    'authored:published',
  ]);
  assert.equal(typeof state.render.authoredGpuAdmissionReady?.then, 'function');
});

test('startup fails closed when exact authored pipeline compilation rejects', async () => {
  const state = {
    render: {
      pipelinePrecompileReady: Promise.resolve(),
      compileCurrentPipelines: async () => { throw new Error('authored compile failed'); },
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

test('current-scene compilation is serialized behind admissions and waits for later arrivals', async () => {
  const started = [];
  const lateGate = deferred();
  const tracker = createPipelineAdmissionTracker(async (subjects) => {
    started.push(subjects);
    if (subjects[0] === 'late-ship') return lateGate.promise;
    return { subjects };
  }, {
    deferAutoFlush: () => true,
  });

  const first = tracker.compile('opening-ship');
  let currentSettled = false;
  const current = tracker.compileCurrent('installed-scene').then((result) => {
    currentSettled = true;
    return result;
  });
  const late = tracker.compile('late-ship');
  for (let turn = 0; turn < 10 && started.length < 3; turn++) await Promise.resolve();

  assert.deepEqual(started, [['opening-ship'], ['installed-scene'], ['late-ship']]);
  assert.equal(currentSettled, false, 'the current-scene gate must include admissions queued during its compile');
  lateGate.resolve({ ok: true });
  await Promise.all([first, current, late]);
  assert.equal(currentSettled, true);
  assert.equal(tracker.pendingCount, 0);
});

test('renderer wires current-scene compilation to the installed scene, not a wait-only gate', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source,
    /compileCurrentPipelines\s*=\s*\(\)\s*=>\s*pipelineAdmissions\.compileCurrent\(scene\)/);
  assert.doesNotMatch(source,
    /compileCurrentPipelines\s*=\s*\(\)\s*=>\s*pipelineAdmissions\.waitForPending\(\)/);
});

test('pipeline admission tracker reports only synchronous compileBatch duration for queued and current paths', async () => {
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
  const current = await tracker.compileCurrent('installed-scene');
  assert.deepEqual(current, { subjects: ['installed-scene'] });
  assert.equal(slices.length, 2, 'compileCurrent notifies once for its serial compileBatch invocation');
  assert.equal(slices[1].kind, 'pipelineAdmissionSync');
  assert.equal(slices[1].durationMs, 7);
  assert.equal(slices[1].path, 'current');
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
    /prepareStartupGpuResidency\(renderer,\s*\[\.\.\.roots,\s*\.\.\.vfxRoots\][\s\S]*?onBlockingSlice:\s*recordAuthoredAdmissionBlockingSlice/,
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
