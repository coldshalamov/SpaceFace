import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAwaitOpeningGpuCook } from '../src/render/renderCapabilityProfile.js';

const capabilities = [
  { name: 'parallel compile', gpu: { software: false }, parallel: true, serial: false },
  { name: 'no parallel compile', gpu: { software: false }, parallel: false, serial: true },
  { name: 'software with parallel extension', gpu: { software: true }, parallel: true, serial: true },
];

for (const capability of capabilities) {
  for (const mode of ['loading', 'flight', 'restore']) {
    test(`${capability.name} / ${mode} preserves every opening policy field`, async () => {
      const { openingLoadPolicy } = await import('../src/render/openingLoadPolicy.js');
      const renderer = { extensions: { get: () => capability.parallel ? {} : null } };
      const policy = openingLoadPolicy({
        shouldAwaitGpuCook: shouldAwaitOpeningGpuCook({ gpu: capability.gpu, renderer }),
        mode,
      });
      const batched = capability.serial && mode === 'loading';
      assert.deepEqual(policy, {
        routeName: `${capability.serial ? 'serial-link' : 'parallel-compile'}-${mode}`,
        serialLinkRoute: capability.serial,
        geometryBatchDrawables: batched ? 32 : undefined,
        textureBatch: batched ? { textureBatchCount: 16, textureBatchBytes: 8 * 1024 * 1024 } : null,
        compositionSettleMs: 12000,
        residencyBudgetMs: capability.serial ? 750 : 5000,
      });
    });
  }
}

test('the measured opening limits and shared texture options are frozen', async () => {
  const { OPENING_LOAD_LIMITS, openingLoadPolicy } = await import('../src/render/openingLoadPolicy.js');
  assert.equal(Object.isFrozen(OPENING_LOAD_LIMITS), true);
  const policy = openingLoadPolicy({ shouldAwaitGpuCook: false, mode: 'loading' });
  assert.equal(Object.isFrozen(policy.textureBatch), true);
  assert.throws(() => { policy.textureBatch.textureBatchCount = 1; }, TypeError);
  assert.equal(openingLoadPolicy({ shouldAwaitGpuCook: false, mode: 'loading' }).textureBatch.textureBatchCount, 16);
});
