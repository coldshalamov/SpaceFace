import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorksPartLoader } from '../src/ui/asteroid/worksPartLoader.js';

test('the visible rover and geology kit enter the existing visible asset admission class', async () => {
  const requests = [];
  const loader = createWorksPartLoader({
    renderer: {},
    lease: {
      isActive: () => true,
      async load(url, options) { requests.push({ url, options }); return null; },
      release() {},
    },
  });
  await loader.loadWorksPart('place_works_rover');
  await loader.acquireWorksInclusionKit();
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ options }) => options.admissionVisible === true),
    'already-visible mining assets must not wait behind ambient flight warmups');
});

test('background preparation can explicitly retain ambient admission', async () => {
  const requests = [];
  const loader = createWorksPartLoader({
    renderer: {},
    lease: {
      isActive: () => true,
      async load(url, options) { requests.push({ url, options }); return null; },
      release() {},
    },
  });
  await loader.loadWorksPart('place_works_rover', { admissionVisible: false });
  assert.equal(requests[0].options.admissionVisible, false);
});

test('an active conduit promotes its pending background template through the shared lease', async () => {
  let settle;
  const pending = new Promise((resolve) => { settle = resolve; });
  const requests = [];
  const loader = createWorksPartLoader({
    renderer: {},
    lease: {
      isActive: () => true,
      load(url, options) { requests.push({ url, options }); return pending; },
      release() {},
    },
  });
  const id = 'place_works_conduit_power_straight';
  const warm = loader.acquireWorksConduitTemplates([id], { admissionVisible: false });
  const visible = loader.acquireWorksConduitTemplates([id]);
  // Resolve even on assertion failure so no pending fixture promises escape the test.
  settle({ assetId: id, primitives: [] });
  const [warmHandle, visibleHandle] = await Promise.all([warm, visible]);
  assert.equal(requests.length, 2, 'the active join must reach shared-loader priority promotion');
  assert.equal(requests[0].options.admissionVisible, false);
  assert.equal(requests[1].options.admissionVisible, true);
  assert.equal(loader.stats().conduitTemplateCount, 1, 'promotion retains the same template');
  warmHandle.release();
  visibleHandle.release();
  assert.equal(loader.stats().conduitTemplateReferences, 0);
});
