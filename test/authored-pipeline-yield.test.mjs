import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareAuthoredVisualPipelines } from '../src/render/partsLibrary.js';

test('flight admission yields to the next present between compile and upload', async () => {
  const order = [];
  const root = { name: 'yield-root' };
  const result = await prepareAuthoredVisualPipelines(root, {
    prepareAuthoredPipelines: async (subject) => {
      order.push(`compile:${subject.name}`);
      return { compiled: true };
    },
    prepareAuthoredGpuResidency: async (subject) => {
      order.push(`upload:${subject.name}`);
      return { uploaded: true };
    },
    yieldBetweenGpuStages: true,
    yieldToNextPresent: async () => {
      order.push('yield');
    },
    isResidencyOwnerActive: () => true,
  });
  const compileIndex = order.indexOf('compile:yield-root');
  assert.ok(compileIndex >= 0);
  assert.deepEqual(order.slice(compileIndex), ['compile:yield-root', 'yield', 'upload:yield-root']);
  assert.equal(result.pipelines.compiled, true);
  assert.equal(result.gpuResidency.uploaded, true);
});
