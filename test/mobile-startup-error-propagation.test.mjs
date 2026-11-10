import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForOpeningGpuResources } from '../src/render/pipelineReadiness.js';

test('the awaited launch gate preserves a real first-picture graphics rejection', async () => {
  const cause = new Error('Opening shader failed: unsupported sampler precision');
  cause.code = 'GPU_SHADER_LINK_FAILED'; cause.stage = 'gpu-resources';
  const state = { mode: 'loading', world: { currentSectorId: 'start' }, render: {
    admissionRunGeneration: 1,
    prepareLiveSectorBeforeFlight: async () => { throw cause; },
  } };
  await assert.rejects(waitForOpeningGpuResources(state, 100, { throwOnError: true }), error => error === cause);
});

test('the awaited launch gate preserves an upload failure before scene preparation', async () => {
  const cause = new Error('GL_OUT_OF_MEMORY: ship texture upload');
  let sceneCalls = 0;
  const state = { mode: 'loading', world: { currentSectorId: 'start' }, render: {
    admissionRunGeneration: 1,
    prepareOpeningGpuResources: async () => { throw cause; },
    prepareLiveSectorBeforeFlight: async () => { sceneCalls++; },
  } };
  await assert.rejects(waitForOpeningGpuResources(state, 100, { throwOnError: true }), error => error === cause);
  assert.equal(sceneCalls, 0);
});
