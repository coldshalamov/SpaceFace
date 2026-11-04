import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareMobileOpeningFirstPicture, settleWhileProgressing } from '../src/render/pipelineReadiness.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('slow-GL first picture: a still-advancing admission outlives the base budget', async () => {
  let links = 0;
  const work = (async () => { for (let i = 0; i < 6; i += 1) { await delay(10); links += 1; } return 'flight'; })();
  const settled = await settleWhileProgressing(work, 25, { progress: () => links, windowMs: 15, extensionCapMs: 100 });
  assert.deepEqual(settled, { ok: true, value: 'flight' });
});

test('slow-GL first picture: a wedged admission still fails within one window of the base', async () => {
  const started = Date.now();
  const settled = await settleWhileProgressing(new Promise(() => {}), 20, { progress: () => 7, windowMs: 15, extensionCapMs: 1000 });
  assert.equal(settled.ok, false);
  assert.equal(settled.timeout, true);
  assert.ok(settled.extendedMs <= 15, `wedge extended ${settled.extendedMs}ms`);
  assert.ok(Date.now() - started < 200);
});

test('slow-GL first picture: progressing work is capped at base + extension cap', async () => {
  let ticks = 0;
  const timer = setInterval(() => { ticks += 1; }, 2);
  try {
    const settled = await settleWhileProgressing(new Promise(() => {}), 20, { progress: () => ticks, windowMs: 10, extensionCapMs: 30 });
    assert.equal(settled.ok, false);
    assert.equal(settled.extendedMs, 30);
  } finally { clearInterval(timer); }
});

test('slow-GL first picture: fast GL settles on the base path with no extension', async () => {
  const settled = await settleWhileProgressing(delay(5).then(() => 1), 50, { progress: () => 0, windowMs: 10 });
  assert.deepEqual(settled, { ok: true, value: 1 });
});

test('mobile first picture survives a program-linking drain slower than its budget', async () => {
  const plan = { complete: true, firstPlayablePipelineSet: { complete: true }, drawLeaves: [] };
  const programs = [];
  const render = {
    renderer: { info: { programs } },
    async prepareOpeningFirstPicture() { return true; },
    captureOpeningSubmissionPlan() { return plan; },
    async drainOpeningSubmissionPlan() {
      for (let i = 0; i < 5; i += 1) { await delay(12); programs.push({ diagnostics: { runnable: true } }); }
      return { materials: 5 };
    },
    async prepareOpeningGpuResources() { return { skipped: false }; },
  };
  const result = await prepareMobileOpeningFirstPicture(render, {
    timeoutMs: 20, progressWindowMs: 15, slowGlExtensionCapMs: 200, yieldToMain: async () => {},
  });
  assert.equal(result.plan, plan);
  assert.equal(programs.length, 5);
});

test('mobile first picture wedge reports its budget and extension', async () => {
  const render = {
    renderer: { info: { programs: [] } },
    async prepareOpeningFirstPicture() { return true; },
    captureOpeningSubmissionPlan() { return { complete: true, firstPlayablePipelineSet: { complete: true } }; },
    drainOpeningSubmissionPlan() { return new Promise(() => {}); },
    async prepareOpeningGpuResources() { return { skipped: false }; },
  };
  await assert.rejects(prepareMobileOpeningFirstPicture(render, {
    timeoutMs: 20, progressWindowMs: 15, slowGlExtensionCapMs: 200, yieldToMain: async () => {},
  }), /mobile opening first-picture admission timed out after \d+ms \(budget 20ms, slow-GL extension (0|15)ms\)/);
});
