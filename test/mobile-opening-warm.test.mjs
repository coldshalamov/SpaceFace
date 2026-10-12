import assert from 'node:assert/strict';
import test from 'node:test';
import { isMobileRenderContext } from '../src/render/renderCapabilityProfile.js';
import { prepareMobileOpeningFirstPicture } from '../src/render/pipelineReadiness.js';

test('iPhone Chrome uses the mobile warm scheduler even when its WebKit GPU links in parallel', () => {
  assert.equal(isMobileRenderContext({ navigator: {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/131.0.0.0 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 0,
  } }), true);
  assert.equal(isMobileRenderContext({ navigator: { userAgent: 'Mozilla/5.0 Windows NT 10.0' } }), false);
  assert.equal(isMobileRenderContext({ navigator: { userAgent: 'Macintosh', maxTouchPoints: 5 },
    matchMedia: () => ({ matches: true }) }), true);
});

function mobileAdmissionFixture(overrides = {}) {
  const calls = [];
  const plan = { complete: true, firstPlayablePipelineSet: { complete: true },
    drawLeaves: [{ id: 'player' }], contentHashVerified: true };
  const resources = { skipped: false, textures: 3, openingSubmissionPlan: plan };
  const render = {
    async prepareOpeningFirstPicture() { calls.push('prepare'); return true; },
    *captureOpeningSubmissionPlanSteps() { calls.push('capture'); yield; return plan; },
    async drainOpeningSubmissionPlan(captured) { assert.equal(captured, plan); calls.push('admit'); return { materials: 2 }; },
    async prepareOpeningGpuResources() { calls.push('resources'); return resources; },
    ...overrides,
  };
  return { calls, plan, resources, render };
}

test('mobile first-picture gate admits the real producer plan before stamping its GPU resources', async () => {
  const fixture = mobileAdmissionFixture();
  const result = await prepareMobileOpeningFirstPicture(fixture.render, { yieldToMain: async () => {} });
  assert.equal(result.plan, fixture.plan);
  assert.equal(result.resources, fixture.resources);
  assert.deepEqual(fixture.calls, ['prepare', 'capture', 'admit', 'resources']);
});

test('incomplete producer plans and rejected GPU admission fail mobile launch', async () => {
  const incomplete = mobileAdmissionFixture({
    *captureOpeningSubmissionPlanSteps() { return { complete: true, firstPlayablePipelineSet: { complete: false } }; },
  });
  await assert.rejects(prepareMobileOpeningFirstPicture(incomplete.render), /submission plan is incomplete/);
  assert.deepEqual(incomplete.calls, ['prepare']);
  const failed = mobileAdmissionFixture({ async drainOpeningSubmissionPlan() { throw new Error('shader link failed'); } });
  await assert.rejects(prepareMobileOpeningFirstPicture(failed.render), /shader link failed/);
  assert.deepEqual(failed.calls, ['prepare', 'capture']);
  const resources = mobileAdmissionFixture({ async prepareOpeningGpuResources() { return { skipped: true, reason: 'loading-budget' }; } });
  await assert.rejects(prepareMobileOpeningFirstPicture(resources.render, { yieldToMain: async () => {} }), /resources were not admitted/);
});

test('a replaced opening never captures or publishes into the new generation', async () => {
  let active = true;
  const fixture = mobileAdmissionFixture({ async prepareOpeningFirstPicture() { active = false; return true; } });
  await assert.rejects(prepareMobileOpeningFirstPicture(fixture.render, { isActive: () => active }), /superseded/);
  assert.deepEqual(fixture.calls, []);
});

test('a stuck exact submission has a bounded failure route', async () => {
  const fixture = mobileAdmissionFixture({ drainOpeningSubmissionPlan: () => new Promise(() => {}) });
  await assert.rejects(prepareMobileOpeningFirstPicture(fixture.render, {
    timeoutMs: 10,
    yieldToMain: async () => {},
  }), /admission timed out/);
  assert.deepEqual(fixture.calls, ['prepare', 'capture']);
});
