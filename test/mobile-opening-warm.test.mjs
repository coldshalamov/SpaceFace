import assert from 'node:assert/strict';
import test from 'node:test';
import { isMobileRenderContext } from '../src/render/renderCapabilityProfile.js';
import { prepareMobileOpeningFirstPicture } from '../src/render/pipelineReadiness.js';
import { render as rendererOwner } from '../src/render/renderer.js';

test('a mobile shader incompatibility preserves the driver log instead of becoming a timeout', async () => {
  const fixture = mobileAdmissionFixture({ renderer: { info: { programs: [{
    name: 'opening hull', diagnostics: { runnable: false, programLog: 'unsupported sampler precision',
      vertexShader: { log: '' }, fragmentShader: { log: 'ERROR: sampler type not supported' } },
  }] } } });
  await assert.rejects(prepareMobileOpeningFirstPicture(fixture.render), (error) => {
    assert.equal(error.code, 'GPU_SHADER_LINK_FAILED');
    assert.equal(error.stage, 'gpu-resources');
    assert.match(error.message, /opening hull.*unsupported sampler precision/);
    assert.match(error.message, /sampler type not supported/);
    return true;
  });
  assert.deepEqual(fixture.calls, ['prepare', 'capture', 'admit'], 'do not continue uploading after shader failure');
});

test('mobile context loss is reported distinctly from unfinished resources', async () => {
  const fixture = mobileAdmissionFixture({ contextLost: true });
  await assert.rejects(prepareMobileOpeningFirstPicture(fixture.render), (error) => {
    assert.equal(error.code, 'GPU_CONTEXT_LOST');
    assert.match(error.message, /context was lost/);
    return true;
  });
});

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
  const resourceOptions = [];
  const plan = { complete: true, firstPlayablePipelineSet: { complete: true },
    drawLeaves: [{ id: 'player' }], contentHashVerified: true };
  const resources = { skipped: false, textures: 3, openingSubmissionPlan: plan };
  const render = {
    async prepareOpeningFirstPicture() { calls.push('prepare'); return true; },
    *captureOpeningSubmissionPlanSteps() { calls.push('capture'); yield; return plan; },
    async drainOpeningSubmissionPlan(captured) { assert.equal(captured, plan); calls.push('admit'); return { materials: 2 }; },
    async prepareOpeningGpuResources(options = {}) {
      calls.push('resources');
      resourceOptions.push(options);
      return options.required === true ? resources : { skipped: true, reason: 'loading-budget' };
    },
    ...overrides,
  };
  return { calls, plan, resources, resourceOptions, render };
}

test('mobile first-picture gate admits the real producer plan before stamping its GPU resources', async () => {
  const fixture = mobileAdmissionFixture();
  const result = await prepareMobileOpeningFirstPicture(fixture.render, { yieldToMain: async () => {} });
  assert.equal(result.plan, fixture.plan);
  assert.equal(result.resources, fixture.resources);
  assert.deepEqual(fixture.calls, ['prepare', 'capture', 'admit', 'resources']);
  assert.equal(fixture.resourceOptions.length, 1);
  assert.equal(fixture.resourceOptions[0].required, true,
    'mobile opening must use the required residency path instead of the optional loading budget');
  assert.equal(typeof fixture.resourceOptions[0].isActive, 'function');
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

test('mobile required residency exposes its outer timeout as the active owner', async () => {
  let requiredOptions = null;
  const fixture = mobileAdmissionFixture({
    prepareOpeningGpuResources(options) {
      requiredOptions = options;
      return new Promise(() => {});
    },
  });
  await assert.rejects(prepareMobileOpeningFirstPicture(fixture.render, {
    timeoutMs: 10,
    yieldToMain: async () => {},
  }), /admission timed out/);
  assert.equal(requiredOptions.required, true);
  assert.equal(requiredOptions.isActive(), false,
    'the required residency owner is cancelled when the outer mobile bound expires');
});

test('mobile required residency stops publishing after replacement', async () => {
  let active = true;
  let requiredOptions = null;
  const fixture = mobileAdmissionFixture();
  fixture.render.prepareOpeningGpuResources = async (options) => {
    requiredOptions = options;
    active = false;
    return fixture.resources;
  };
  await assert.rejects(prepareMobileOpeningFirstPicture(fixture.render, {
    isActive: () => active,
    yieldToMain: async () => {},
  }), /superseded/);
  assert.equal(requiredOptions.isActive(), false,
    'a replaced mobile opening invalidates the required residency owner');
});

test('mobile required residency rejects partial and lost-context results', async () => {
  for (const value of [
    { partial: true },
    { contextLost: true },
    { geometryResidency: { partial: true } },
    { geometryResidency: { contextLost: true } },
  ]) {
    const fixture = mobileAdmissionFixture({
      async prepareOpeningGpuResources() { return value; },
    });
    await assert.rejects(
      prepareMobileOpeningFirstPicture(fixture.render, { yieldToMain: async () => {} }),
      /resources were not admitted/,
      `partial/context-lost residency result must reject: ${JSON.stringify(value)}`,
    );
  }
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

test('priming admission observers during loading clears resolved handles and keeps real pending work', async () => {
  let complete;
  const unfinished = new Promise((resolve) => { complete = resolve; });
  const owner = { state: { mode: 'loading', render: {
    openingGpuResidencyReady: Promise.resolve({ ready: true }),
    pipelinePrecompileReady: Promise.resolve({ ready: true }),
    liveScenePresentReady: unfinished,
  } } };
  assert.equal(rendererOwner._openingAdmissionPendingCount.call(owner), 3);
  await Promise.resolve();
  assert.equal(rendererOwner._openingAdmissionPendingCount.call(owner), 1);
  complete({ ready: true });
  await Promise.resolve();
  owner.state.mode = 'flight';
  assert.equal(rendererOwner._openingAdmissionPendingCount.call(owner), 0,
    'the first flight draw must not rediscover settled handles as pending');
});
