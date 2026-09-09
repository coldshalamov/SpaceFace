import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { shouldSubmitEntityMesh } from '../src/render/entityMeshVisibility.js';
import { cookLiveSceneGpu } from '../src/render/liveSceneCook.js';
import { waitForCurrentRenderPipelines } from '../src/render/pipelineReadiness.js';

test('loading waitForCurrentRenderPipelines drains optional post-opening pipelines after the exact plan', async () => {
  const timeline = [];
  const state = {
    mode: 'loading',
    render: {
      pipelinePrecompileReady: Promise.resolve(),
      captureOpeningSubmissionPlan: () => {
        timeline.push('exact:capture');
        return { complete: true, firstPlayablePipelineSet: { complete: true } };
      },
      drainOpeningSubmissionPlan: async () => {
        timeline.push('exact:drain');
      },
      preparePostOpeningPipelines: async () => {
        timeline.push('post-opening');
        return { skipped: false };
      },
    },
  };

  assert.equal(await waitForCurrentRenderPipelines(state, 1000), true);
  assert.deepEqual(timeline, ['exact:capture', 'exact:drain', 'post-opening']);
  assert.equal(typeof state.render.postOpeningPipelinesReady?.then, 'function');
  assert.equal(typeof state.render.liveSceneCookReady?.then, 'function');
  assert.equal(state.render.liveSceneCook.skipped, true);
  assert.equal(state.render.liveSceneCook.reason, 'no-live-scene');
});

test('cookLiveSceneGpu compiles and uploads the live scene subjects', async () => {
  const calls = [];
  const scene = { name: 'live-sector' };
  const camera = { name: 'flight-cam' };
  const state = {
    mode: 'loading',
    render: {
      renderer: {
        compileAsync: async (subject, cam) => {
          calls.push(['compile', subject.name, cam.name]);
        },
      },
      scene,
      camera,
    },
  };
  const result = await cookLiveSceneGpu(state, {
    prepareResidency: async (_renderer, subject) => {
      calls.push(['buffers', subject.name]);
      return { skipped: false, textures: 2 };
    },
  });
  assert.equal(result.liveScene, true);
  assert.equal(result.programs.method, 'compileAsync');
  assert.deepEqual(calls, [
    ['compile', 'live-sector', 'flight-cam'],
    ['buffers', 'live-sector'],
  ]);
});

test('loading cook uses the live scene programs and buffers, not a dummy catalog', async () => {
  const cooked = [];
  const state = {
    mode: 'loading',
    render: {
      cookLiveSceneGpu: async () => {
        cooked.push('live');
        return { skipped: false, liveScene: true };
      },
    },
  };
  const result = await cookLiveSceneGpu(state);
  assert.deepEqual(cooked, ['live']);
  assert.equal(result.liveScene, true);
  assert.equal(state.render.liveSceneCook.liveScene, true);
});

test('flight mode refuses a live-scene cook so dummy mid-flight prewarm stays dead', async () => {
  const result = await cookLiveSceneGpu({
    mode: 'flight',
    render: { scene: {}, renderer: {}, camera: {} },
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'not-loading');
});

test('post-opening drain is optional so existing loading mocks without it still pass', async () => {
  const state = {
    mode: 'loading',
    render: {
      pipelinePrecompileReady: Promise.resolve(),
      captureOpeningSubmissionPlan: () => ({
        complete: true,
        firstPlayablePipelineSet: { complete: true },
      }),
      drainOpeningSubmissionPlan: async () => {},
    },
  };
  assert.equal(await waitForCurrentRenderPipelines(state, 1000), true);
});

test('uncompiled ordinary roots are held; protected roots still submit', () => {
  assert.equal(shouldSubmitEntityMesh({ pipelinesPending: true }), false);
  assert.equal(shouldSubmitEntityMesh({ isPlayer: true, pipelinesPending: true }), true);
});

test('admission queues compiles during loading and retries the starting sector after the exact plan', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const readiness = await readFile(new URL('../src/render/pipelineReadiness.js', import.meta.url), 'utf8');
  assert.match(renderer, /state\.mode === 'loading'[\s\S]{0,700}?opening-submission-plan-owns-first-picture/,
    'loading still bypasses the broad authored-root watermark');
  assert.match(renderer, /if \(subject\) void admitSubjectPipelines\(subject\)/);
  assert.match(renderer, /_pendingPostOpeningSector/);
  assert.match(renderer, /preparePostOpeningPipelines/);
  assert.match(renderer, /precompilePipelines\(renderer, scene, cam\.obj,/);
  assert.match(renderer, /pipelinesPending = pending === true/);
  assert.match(readiness, /preparePostOpeningPipelines/);
  assert.doesNotMatch(renderer, /deferredStartupPrecompile|backgroundPipelinePrecompileReady/);
  assert.doesNotMatch(renderer, /scheduleUpgradeFrame/,
    'must not relitigate upgrade-frame scheduling');
});
