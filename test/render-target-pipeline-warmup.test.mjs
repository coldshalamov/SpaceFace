import assert from 'node:assert/strict';
import test from 'node:test';

import { compileScenePipelinesForRenderTarget } from '../src/render/bloom.js';
import { waitForCurrentRenderPipelines } from '../src/render/pipelineReadiness.js';

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
