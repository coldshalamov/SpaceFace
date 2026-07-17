import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  compileScenePipelinesForRenderTarget,
  warmScenePipelinesForRenderTarget,
} from '../src/render/bloom.js';
import {
  createPipelineAdmissionTracker,
  waitForCurrentRenderPipelines,
} from '../src/render/pipelineReadiness.js';

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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
