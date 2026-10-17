import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const renderer = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const pipeline = readFileSync(new URL('../src/render/pipelineReadiness.js', import.meta.url), 'utf8');

function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing production owner: ${start}`);
  assert.equal(source.indexOf(start, a + 1), -1, `ambiguous production owner: ${start}`);
  return source.slice(a, b);
}

// Execute the complete production readiness module with browser/GPU imports removed. These
// cases exercise its actual deadlines, deduplication, cancellation and classification, while
// the graphics ports remain controlled. No copied implementation of the admission guard.
const readinessSource = pipeline.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const releaseSource = between(renderer, 'export function freezeOpeningGraphPublication(owner) {',
  '\nfunction afterBrowserPaint(').replace(/^export /gm, '');
const loadingSource = between(renderer, '    state.render.beginOpeningLoadingAdmission = () => {',
  '    const openingCohort = createOpeningAdmissionCohort();');

function fixture() {
  const context = vm.createContext({ setTimeout, clearTimeout, performance,
    reportBootWork() {}, yieldToBrowser: () => Promise.resolve() });
  vm.runInContext(`${readinessSource}\n${releaseSource}\n`
    + 'globalThis.api = { waitForOpeningFirstPicture, waitForCurrentRenderPipelines, '
    + 'createOpeningLoadingAdmission, observePipelineAdmission, '
    + 'freezeOpeningGraphPublication, releaseOpeningGraphPublication };', context);
  const { api } = context;
  const calls = [];
  const state = { mode: 'loading', simTime: 0,
    world: { currentSectorId: 'helios', enterSerial: 1 }, contextRestoreSeq: 0,
    entityList: [], entities: new Map(),
    render: { renderer: {}, admissionRunGeneration: 1, deferNoncriticalMeshStreaming: false,
      openingGraphPublicationFrozen: false, openingVfxFrozen: false } };
  const owner = { state, _meshes: new Map(), _meshBuildQueuedIds: new Set(),
    _meshBuildQueue: [], _meshBuildQueueHead: 0, _deferNoncriticalMeshStreaming: false,
    _openingFirstPicturePrepared: false };
  // This is the complete live renderer's mesh-entry owner, including the graph/defer reset
  // before its asynchronous iterator checks. Empty required entities avoid graphics work.
  new Function('state', 'cam', 'THREE', 'openingSubmissionCamera', '_meshLocalXZ',
    'rendererGenerationIsActive', 'releaseOpeningGraphPublication', 'createOpeningLoadingAdmission',
    'enqueueMissingMeshBuildsSteps', 'observePipelineAdmission', 'yieldToBrowser',
    'entityVisualCullRadius', 'isInitialAuthoredCompositionEntity', loadingSource)
    .call(owner, state, { follow() { calls.push('begin'); }, obj: { updateMatrixWorld() {} } },
      { Sphere: class { constructor(center, radius) { this.center = center; this.radius = radius; } }, Vector3: class {} },
      () => null, {}, () => true, api.releaseOpeningGraphPublication, api.createOpeningLoadingAdmission,
      function* () {}, api.observePipelineAdmission, () => Promise.resolve(), () => 1, () => false);
  Object.assign(state.render, {
    prepareOpeningFirstPicture: async () => { calls.push('seal'); return true; },
    captureOpeningSubmissionPlan: () => {
      calls.push('capture'); return { complete: true, firstPlayablePipelineSet: { complete: true } };
    },
    drainOpeningSubmissionPlan: async () => { calls.push('submission'); return { ok: true }; },
    prepareOpeningGpuResources: async () => { calls.push('resources'); return { skipped: false }; },
    captureOpeningPipelinePlan: () => { calls.push('pipeline:capture'); return {}; },
    drainOpeningPipelinePlan: async () => { calls.push('pipeline:drain'); },
  });
  return { api, owner, state, calls,
    start: options => api.waitForOpeningFirstPicture(state, 1000, options) };
}

for (const replacement of ['flight', 'cancelled-loading', 'render', 'world', 'serial',
  'generation', 'sector', 'renderer', 'context', 'context-lost']) {
  test(`queued loading entry preserves ${replacement} successor ownership`, async () => {
    const f = fixture();
    let active = true;
    const pending = f.start({ isActive: () => active });
    // The public launch gate has captured its owner, but its queued mesh callback has not run.
    if (replacement === 'flight') f.state.mode = 'flight';
    if (replacement === 'cancelled-loading') active = false;
    if (replacement === 'render') f.state.render = { ...f.state.render };
    if (replacement === 'world') f.state.world = { ...f.state.world };
    if (replacement === 'serial') f.state.world.enterSerial++;
    if (replacement === 'generation') f.state.render.admissionRunGeneration++;
    if (replacement === 'sector') f.state.world.currentSectorId = 'ceres';
    if (replacement === 'renderer') f.state.render.renderer = {};
    if (replacement === 'context') f.state.contextRestoreSeq++;
    if (replacement === 'context-lost') f.state.render.contextLost = true;
    const current = f.state.render;
    f.owner._deferNoncriticalMeshStreaming = current.deferNoncriticalMeshStreaming = true;
    f.owner._openingFirstPicturePrepared = true;
    f.api.freezeOpeningGraphPublication(f.owner);
    const gate = f.owner._openingGraphPublicationGate;
    await assert.rejects(pending, /superseded|context was lost/);
    assert.deepEqual(f.calls, [], 'reject before the real mesh owner can reset successor state');
    assert.equal(f.owner._deferNoncriticalMeshStreaming, true);
    assert.equal(current.deferNoncriticalMeshStreaming, true);
    assert.equal(f.owner._openingFirstPicturePrepared, true);
    assert.equal(f.owner._openingGraphPublicationGate, gate);
    assert.equal(current.openingGraphPublicationFrozen, true);
    assert.equal(f.owner._openingLoadingAdmission, undefined);
  });
}

test('current loading owner still stages and admits one exact picture', async () => {
  const f = fixture();
  assert.equal(await f.start(), true);
  assert.deepEqual(f.calls, ['begin', 'seal', 'capture', 'submission', 'resources']);
  assert.equal(f.state.render.openingFirstPictureReady, true);
  assert.equal(f.state.render.requiredPackageAdmission.status, 'accepted');
});

test('overlapping launch callers still join the same queued mesh entry', async () => {
  const f = fixture();
  const first = f.start(), second = f.start();
  assert.equal(first, second);
  assert.equal(await first, true);
  assert.equal(f.calls.filter(call => call === 'begin').length, 1);
  assert.equal(f.calls.filter(call => call === 'seal').length, 1);
});

test('ordinary nonloading pipeline warmup still skips opening mesh and picture work', async () => {
  const f = fixture();
  f.state.mode = 'flight';
  assert.equal(await f.api.waitForCurrentRenderPipelines(f.state, 1000), true);
  assert.deepEqual(f.calls, ['pipeline:capture', 'pipeline:drain', 'capture', 'submission']);
  assert.equal(f.state.render.openingGraphPublicationFrozen, false);
  assert.equal(f.owner._openingLoadingAdmission, undefined);
});
