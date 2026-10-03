import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';
import * as lifecycleHelpers from '../src/core/sectorEnterDefer.js';
const require = createRequire(import.meta.url);
const { parse } = require(require.resolve('@babel/parser', { paths: [process.env.SPACEFACE_DEPS_ROOT || process.cwd()] }));
const source = readFileSync(process.env.ENTRY_SOURCE_RENDERER || new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module' });
let cookNode, pipelineNode, enterNode, guardNode, preflightNode, gpuNode, compileNode;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'AssignmentExpression' && node.left?.property?.name === 'prepareLiveSectorAfterJump') cookNode = node.right;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'pipelinePrecompile') pipelineNode = node.init;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'compileSectorPipelines') compileNode = node.init;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'captureLiveSectorCookStale') guardNode = node.init;
  if (node.type === 'AssignmentExpression' && node.left?.property?.name === 'prepareLiveSectorBeforeFlight') preflightNode = node.right;
  if (node.type === 'AssignmentExpression' && node.left?.property?.name === 'cookLiveSceneGpu') gpuNode = node.right;
  if (node.type === 'CallExpression' && node.callee?.name === 'onBus' && node.arguments?.[0]?.value === 'sector:enter') enterNode = node.arguments[1];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object' && value.type) walk(value);
  }
}
walk(ast);
assert.ok(cookNode && pipelineNode);
const cookCode = source.slice(cookNode.start, cookNode.end);
const pipelineCode = source.slice(pipelineNode.start, pipelineNode.end);
const enterCode = source.slice(enterNode.start, enterNode.end);
const preflightCode = source.slice(preflightNode.start, preflightNode.end);
const gpuCode = source.slice(gpuNode.start, gpuNode.end);
const compileCode = source.slice(compileNode.start, compileNode.end);
const guardCode = guardNode ? source.slice(guardNode.start, guardNode.end) : null;
function evaluate(code, owner, values) {
  const env = new Proxy(values, {
    has: (target, key) => key in target || key in globalThis,
    get: (target, key) => key === Symbol.unscopables ? undefined
      : key in target ? target[key] : globalThis[key],
  });
  return new Function('env', 'with (env) { return (' + code + '); }').call(owner, env);
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function fixture(providers = []) {
  const frames = [], marks = [];
  let now = 0;
  const state = { mode: 'flight', enterSerialSeq: 7, simTime: 10,
    world: { currentSectorId: 'ceres', enterSerial: 7 }, entities: new Map(),
    render: { sectorShellAdmission: true, sectorShellAdmissionSerial: 7, cookLiveSceneGpu: async () => ({ ok: true }) } };
  const owner = { state, _rendererGeneration: 2, _liveSectorCookGeneration: 0, _simHelpers: { sectorCookProviders: providers },
    _meshes: new Map(), _meshBuildQueue: [], _meshBuildQueueHead: 0, _meshBuildQueuedIds: new Set() };
  const noop = () => {};
  const values = { ...lifecycleHelpers, state,
    rendererGenerationIsActive: () => owner._rendererGeneration === 2 && !owner._rendererResourcesDisposed, scene: { environment: {} },
    renderer: { getContext: () => ({ flush: noop, isContextLost: () => false }) },
    globalThis: { requestAnimationFrame: fn => frames.push(fn) },
    performance: { now: () => now += 10 }, yieldToBrowser: async () => {},
    beginOpeningCookLedger: () => ({}), bindEnvironmentToStandardMaterials: noop,
    collectFirstFlightCookEntities: () => [], enqueueMissingMeshBuilds: noop,
    collectMeshPresentationEntitiesChunked: function* () {},
    recordOpeningCookStep: noop, resumeAuthoredUpgradeQueueForLoadingHulls: noop,
    collectUnresidentInstancedDrawables: () => [],
    holdAuthoredUpgradeQueueForFirstFlight: () => marks.push('hold'),
    freezeOpeningGraphPublication: () => marks.push('freeze'),
    formatOpeningCookLedger: () => 'test', console: { info: noop },
    armSectorArrivalPublishRelease: () => marks.push('release'),
    SECTOR_ARRIVAL_PUBLISH_HOLD_SECONDS: 2, FIRST_FLIGHT_DEFERRED_HOLD_SECONDS: 20,
    exactSectorId: 'ceres', sector: { id: 'ceres' }, continuous: false, enterEpoch: 7,
  };
  if (guardCode) values.captureLiveSectorCookStale = evaluate(guardCode, owner, values);
  const cook = evaluate(cookCode, owner, values);
  state.render.prepareLiveSectorAfterJump = cook;
  values.gpu = { software: false };
  values.compileSectorPipelines = evaluate(compileCode, owner, values);
  return { state, owner, frames, marks, values, cook };
}
function* provider(log) {
  try { for (let i = 1; i <= 3; i++) { log.push(i); yield; } }
  finally { log.push('closed'); }
}
async function flush(promise, frames) {
  let done = false, value, error;
  promise.then(v => { done = true; value = v; }, e => { done = true; error = e; });
  for (let i = 0; i < 30 && !done; i++) {
    await nextTurn();
    if (frames.length) frames.shift()();
  }
  assert.equal(done, true, 'bounded fixture should settle');
  if (error) throw error;
  return value;
}
test('actual complete renderer cook suspends, cancels on same-sector restore, and closes generator', async () => {
  const log = [], f = fixture([() => provider(log)]);
  const running = f.cook({ id: 'ceres' });
  assert.deepEqual(log, [1]);
  assert.equal(f.frames.length, 1);
  f.state.enterSerialSeq = f.state.world.enterSerial = 8;
  f.state.mode = 'loading';
  const newerIds = new Set(['new-owner']);
  f.state.render.liveSectorFirstFlightIds = newerIds;
  const result = await flush(running, f.frames);
  assert.equal(result.reason, 'sector-superseded');
  assert.deepEqual(log, [1, 'closed']);
  assert.equal(f.state.render.liveSectorFirstFlightIds, newerIds);
  assert.deepEqual(f.marks, []);
});
test('actual complete renderer cook cancels on different sector', async () => {
  const log = [], f = fixture([() => provider(log)]);
  const running = f.cook({ id: 'ceres' });
  f.state.world.currentSectorId = 'helios';
  assert.equal((await flush(running, f.frames)).reason, 'sector-superseded');
  assert.deepEqual(log, [1, 'closed']);
});
test('actual complete renderer normal completion retains order and publishes once', async () => {
  const log = [], f = fixture([() => provider(log)]);
  const result = await flush(f.cook({ id: 'ceres' }), f.frames);
  assert.equal(result.skipped, false);
  assert.deepEqual(log, [1, 2, 3, 'closed']);
  assert.deepEqual(f.marks, ['hold', 'freeze', 'release']);
  assert.equal(f.state.render.liveSectorGpuAdmission, false);
});
test('actual complete renderer newer cook owns late finalization', async () => {
  const log = [], f = fixture([() => provider(log)]);
  const oldRun = f.cook({ id: 'ceres' });
  f.owner._simHelpers.sectorCookProviders = [];
  const newer = await flush(f.cook({ id: 'ceres' }), f.frames);
  assert.equal(newer.skipped, false);
  assert.equal((await flush(oldRun, f.frames)).reason, 'sector-superseded');
  assert.deepEqual(log, [1, 'closed']);
  assert.deepEqual(f.marks, ['hold', 'freeze', 'release']);
});
test('actual complete renderer rechecks epoch after awaited GPU stage', async () => {
  const f = fixture(), gpu = deferred();
  f.state.render.cookLiveSceneGpu = () => gpu.promise;
  const oldRun = f.cook({ id: 'ceres' });
  await nextTurn();
  while (f.frames.length) { f.frames.shift()(); await nextTurn(); }
  f.state.enterSerialSeq = f.state.world.enterSerial = 8;
  gpu.resolve({ ok: true });
  assert.equal((await oldRun).reason, 'sector-superseded');
  assert.deepEqual(f.marks, []);
});
test('actual pipeline expression prevents stale completion flags', async () => {
  const f = fixture(), pending = deferred();
  f.values.compileSectorPipelines = (_sector, _epoch, receipt) => { f.owner._liveSectorCookGeneration++; if (receipt) receipt.generation = f.owner._liveSectorCookGeneration; return pending.promise; };
  const completion = evaluate(pipelineCode, f.owner, f.values);
  f.state.enterSerialSeq = f.state.world.enterSerial = 8;
  f.state.render.firstFlightResidencyHoldUntil = 99;
  pending.resolve({ ok: true });
  await completion;
  assert.equal(f.state.render.sectorShellAdmission, true);
  assert.equal(f.state.render.firstFlightResidencyHoldUntil, 99);
});
test('actual pipeline captures entry before a provider synchronously starts restore', async () => {
  const f = fixture();
  f.values.compileSectorPipelines = (_sector, _epoch, receipt) => {
    f.owner._liveSectorCookGeneration++;
    if (receipt) receipt.generation = f.owner._liveSectorCookGeneration;
    f.state.enterSerialSeq = f.state.world.enterSerial = 8;
    return Promise.resolve({ skipped: true, reason: 'sector-superseded' });
  };
  await evaluate(pipelineCode, f.owner, f.values);
  assert.equal(f.state.render.sectorShellAdmission, true);
});
test('actual pipeline normal completion still releases admission', async () => {
  const f = fixture();
  f.values.compileSectorPipelines = (_sector, _epoch, receipt) => { f.owner._liveSectorCookGeneration++; if (receipt) receipt.generation = f.owner._liveSectorCookGeneration; return Promise.resolve({ ok: true }); };
  await evaluate(pipelineCode, f.owner, f.values);
  assert.equal(f.state.render.sectorShellAdmission, false);
  assert.equal(f.state.render.firstFlightResidencyHoldUntil, 12);
});

for (const [label, supersede] of [
  ['renderer reinitialization', f => { f.owner._rendererGeneration++; }],
  ['renderer disposal', f => { f.owner._rendererResourcesDisposed = true; }],
  ['world replacement with same numeric serial', f => { f.state.world = { ...f.state.world }; }],
  ['render-state replacement', f => { f.state.render = { ...f.state.render }; }],
]) {
  test('actual cook honors ' + label + ' while suspended', async () => {
    const log = [], f = fixture([() => provider(log)]);
    const running = f.cook({ id: 'ceres' });
    supersede(f);
    assert.equal((await flush(running, f.frames)).reason, 'sector-superseded');
    assert.deepEqual(log, [1, 'closed']);
    assert.deepEqual(f.marks, []);
  });
}
test('New Game replacement uses existing monotonically advanced world serial', async () => {
  const log = [], f = fixture([() => provider(log)]);
  const running = f.cook({ id: 'ceres' });
  f.state.enterSerialSeq++;
  f.state.world = { currentSectorId: 'ceres', enterSerial: f.state.enterSerialSeq };
  f.state.mode = 'loading';
  assert.equal((await flush(running, f.frames)).reason, 'sector-superseded');
  assert.deepEqual(log, [1, 'closed']);
  assert.deepEqual(f.marks, []);
});
test('actual pipeline honors renderer reinitialization without a new cook', async () => {
  const f = fixture(), pending = deferred();
  f.values.compileSectorPipelines = (_sector, _epoch, receipt) => { f.owner._liveSectorCookGeneration++; if (receipt) receipt.generation = f.owner._liveSectorCookGeneration; return pending.promise; };
  const completion = evaluate(pipelineCode, f.owner, f.values);
  f.owner._rendererGeneration++;
  pending.resolve({ ok: true });
  await completion;
  assert.equal(f.state.render.sectorShellAdmission, true);
});
test('current FIFO deferral and registered census twins execute exactly once', async () => {
  let calls = 0;
  const p = () => { calls++; };
  const f = fixture([p]);
  f.state.render.sectorEnterCookWillRun = () => true;
  lifecycleHelpers.deferSectorEnterMaterialization(f.state, { enterEpoch: 7 }, p);
  assert.equal((await flush(f.cook({ id: 'ceres' }), f.frames)).skipped, false);
  assert.equal(calls, 1);
});
test('current pause early-out drains live FIFO rather than stranding it', async () => {
  const log = [], f = fixture();
  f.state.render.sectorEnterCookWillRun = () => true;
  lifecycleHelpers.deferSectorEnterMaterialization(f.state, { enterEpoch: 7 }, () => provider(log));
  f.state.mode = 'pause';
  assert.equal((await f.cook({ id: 'ceres' })).reason, 'not-flight');
  assert.deepEqual(log, [1, 2, 3, 'closed']);
  assert.deepEqual(f.marks, []);
});
function enterFixture() {
  const f = fixture();
  f.owner._sessionRecookKeepGpu = true;
  f.owner._publishAssetResidencyDiagnostics = () => f.marks.push('diagnostics');
  f.values.clearRendererMeshLatches = () => f.marks.push('clear');
  f.values.cam = { snapToPlayer() {} };
  f.values.reattachResidentGpuMeshes = () => f.marks.push('reattach');
  return { ...f, enter: evaluate(enterCode, f.owner, f.values) };
}
test('stale queued sector listener does not touch a newer same-sector run', () => {
  const f = enterFixture();
  f.state.world.enterSerial = f.state.enterSerialSeq = 8;
  f.enter({ sectorId: 'ceres', sector: { id: 'ceres' }, enterEpoch: 7 });
  assert.deepEqual(f.marks, []);
});
test('current queued sector listener keeps ordinary keep-GPU path', () => {
  const f = enterFixture();
  f.enter({ sectorId: 'ceres', sector: { id: 'ceres' }, enterEpoch: 7 });
  assert.deepEqual(f.marks, ['clear', 'reattach', 'diagnostics']);
});

const { deferSectorEnterMaterialization: defer, drainDeferredEnterMaterializers: drain } = lifecycleHelpers;
function state() { return { world: { enterSerial: 7 }, render: { sectorEnterCookWillRun: () => true } }; }
test('epochless entries bind the current serial', () => {
  const s = state(); defer(s, {}, () => {});
  assert.equal(s.render.deferredEnterMaterializers[0].epoch, 7);
});
test('same provider and epoch are deduplicated', () => {
  const s = state(), p = () => {}; defer(s, {}, p); defer(s, { enterEpoch: 7 }, p);
  assert.equal(s.render.deferredEnterMaterializers.length, 1);
});
test('not-yet-drained stale epoch is discarded and current FIFO order retained', () => {
  const s = state(), log = []; defer(s, {}, () => log.push('old'));
  s.world.enterSerial = 8;
  defer(s, {}, () => log.push('new-1')); defer(s, {}, function* () { log.push('new-2'); yield; });
  drain(s, { id: 'ceres' });
  assert.deepEqual(log, ['new-1', 'new-2']);
  assert.equal(s.render.deferredEnterMaterializers.length, 0);
});
test('loading remains inline when renderer predicate declines deferral', () => {
  const s = state(); s.render.sectorEnterCookWillRun = () => false;
  assert.equal(defer(s, {}, () => {}), false);
  assert.equal(s.render.deferredEnterMaterializers, undefined);
});

const saveSource = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
const saveAst = parse(saveSource, { sourceType: 'module' });
const saveMethods = {};
function findSaveMethods(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ObjectMethod' && ['_openRestoreSession', '_restoreAsync', '_beginRestoreSequence'].includes(node.key?.name)) {
    saveMethods[node.key.name] = (node.async ? 'async function ' : 'function ') + saveSource.slice(node.start, node.end).replace(/^async /, '');
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(findSaveMethods);
    else if (value && typeof value === 'object' && value.type) findSaveMethods(value);
  }
}
findSaveMethods(saveAst);
function realRestoreFixture(f) {
  const boundary = deferred();
  const events = [];
  const owner = {
    state: f.state, helpers: {}, _restoreSequence: 0,
    bus: { emit: (...args) => events.push(args) },
    _cancelActiveAutosave() {},
    *_restoreChunks() { yield; }, // Deserialization chunks/GPU are outside this source-owner test.
    _restoreFrameYield: () => boundary.promise,
    _closeRestoreSession: () => ({ restored: true }),
  };
  const env = {
    createTimeEffects: () => ({ reset() {}, set() {} }),
    nowMs: () => 10, RESTORE_YIELD_SLICE_MS: 8,
  };
  for (const [name, code] of Object.entries(saveMethods)) owner[name] = evaluate(code, owner, env);
  return { owner, boundary, events };
}

test('actual restore entry stops old jump without publishing against the replacement', async () => {
  const log = [], f = fixture([() => provider(log)]), restore = realRestoreFixture(f);
  const oldRun = f.cook({ id: 'ceres' }, 7);
  const generation = f.owner._liveSectorCookGeneration;
  const restoring = restore.owner._restoreAsync({}, 'latest');
  assert.equal(f.state.world.enterSerial, 8);
  assert.equal(f.owner._liveSectorCookGeneration, generation);
  assert.equal((await flush(oldRun, f.frames)).reason, 'sector-superseded');
  assert.deepEqual(log, [1, 'closed']);
  assert.deepEqual(f.marks, []);
  restore.boundary.resolve();
  await restoring;
});

test('actual restore plus keep-GPU preserves replacement hold from old pipeline', async () => {
  const f = fixture(), restore = realRestoreFixture(f), pending = deferred();
  f.values.compileSectorPipelines = (_sector, _epoch, receipt) => { f.owner._liveSectorCookGeneration++; if (receipt) receipt.generation = f.owner._liveSectorCookGeneration; return pending.promise; };
  const pipeline = evaluate(pipelineCode, f.owner, f.values);
  const restoring = restore.owner._restoreAsync({}, 'latest');
  f.state.mode = 'loading';
  f.owner._sessionLiveSectorCookedId = 'ceres';
  f.values.POST_PROCESS_ROUTE = { BLOOM: 'bloom', GRAPH: 'graph' };
  f.values.reattachResidentGpuMeshes = () => {};
  f.state.render.firstFlightResidencyHoldUntil = null;
  f.state.render.sectorShellAdmissionSerial = 8;
  assert.equal((await evaluate(preflightCode, f.owner, f.values)()).reason, 'session-recook-keep-gpu');
  assert.equal(f.owner._liveSectorCookGeneration, 1);
  pending.resolve({ skipped: true });
  await pipeline;
  assert.equal(f.state.render.sectorShellAdmission, true);
  assert.equal(f.state.render.sectorShellAdmissionSerial, 8);
  assert.equal(f.state.render.firstFlightResidencyHoldUntil, null);
  restore.boundary.resolve();
  await restoring;
});

test('actual provider-triggered restore cannot be adopted by the pipeline finalizer', async () => {
  const f = fixture(), restore = realRestoreFixture(f);
  f.owner._simHelpers.sectorCookProviders = [() => restore.owner._openRestoreSession({}, 'latest', {})];
  f.values.compileSectorPipelines = (sector, epoch, receipt) => f.cook(sector, epoch, receipt);
  const pipeline = evaluate(pipelineCode, f.owner, f.values);
  assert.equal(f.state.world.enterSerial, 8);
  await flush(pipeline, f.frames);
  assert.deepEqual(f.marks, []);
  assert.equal(f.state.render.sectorShellAdmission, true);
});

function preflightFixture() {
  const f = fixture(), opening = deferred();
  f.state.mode = 'loading';
  f.owner._simHelpers = null;
  Object.assign(f.values, {
    releaseOpeningGraphPublication() {}, survivalRunHoldsArena: () => false,
    resumeAuthoredUpgradeQueueAfterOpening() {},
    pipelineAdmissions: { resumeAutoFlush() {}, pendingCount: 0 },
    indexedShipLikeScan: () => [], indexedTypeScan: () => [],
    createSlicedYield: () => async () => {},
    waitForOpeningCompositionSettled: () => opening.promise,
    waitForAuthoredUpgradeQueueIdle: async () => ({ idle: true }),
  });
  return { ...f, opening, preflight: evaluate(preflightCode, f.owner, f.values) };
}

test('preflight same-sector cancellation returns cleanly without stale finalizer writes', async () => {
  const f = preflightFixture();
  const run = f.preflight();
  await nextTurn();
  const newerIds = new Set(['replacement']);
  f.state.world.enterSerial = 8;
  f.state.render.liveSectorFirstFlightIds = newerIds;
  f.opening.resolve({ settled: true });
  assert.equal((await run).reason, 'sector-superseded');
  assert.equal(f.state.render.liveSectorFirstFlightIds, newerIds);
  assert.deepEqual(f.marks, []);
});

test('preflight prefix error keeps original error and performs current-owner cleanup once', async () => {
  const f = preflightFixture();
  const error = new Error('controlled-prefix-failure');
  f.values.bindEnvironmentToStandardMaterials = () => { throw error; };
  await assert.rejects(f.preflight(), actual => actual === error);
  assert.deepEqual(f.marks, ['hold', 'freeze']);
  assert.equal(f.state.render.liveSectorGpuAdmission, false);
});

function gpuFixture() {
  const f = fixture();
  f.owner._selectPostRoute = () => 'test-route';
  f.owner._compilePostRoute = async () => {};
  f.owner._startDeferredWarmDecodes = () => {};
  f.owner._beginCrucibleBoundedRosterWarm = () => null;
  f.owner._rosterPrewarmRoots = [];
  f.values.scene.remove = root => { root.parent = null; f.marks.push('remove-warm-root'); };
  f.values.scene.add = root => { root.parent = f.values.scene; };
  f.state.render.restLiveFlightEffectsAfterCook = () => f.marks.push('rest-effects');
  Object.assign(f.values, {
    cam: { obj: {} }, collectFirstFlightEffectRoots: () => [],
    collectPreparedAuthoredCompileRoots: () => [], syncVisiblePointLightBudget() {},
    armAdmissionShadows: () => () => f.marks.push('restore-shadows'),
    revealSubjectForCompile: () => () => f.marks.push('restore-reveal'),
    survivalRunHoldsArena: () => false, createSlicedYield: fn => fn,
    prepareStartupGpuResidency: async () => ({ ok: true }),
    collectFirstFlightLayerDrawables: () => [], collectInstancePoolCompileRoots: () => [],
    buildOpeningSubmissionPlan: () => ({ compileSubjects: [] }),
    uniqueAdmissionUnits: () => ({ programSubjects: [] }),
    collectCompileSubjects: () => [],
  });
  return { ...f, gpu: evaluate(gpuCode, f.owner, f.values) };
}

for (const mode of ['loading', 'flight']) {
  test('admitted actual GPU cook completes in ' + mode + ' without minting a generation', async () => {
    const f = gpuFixture();
    f.state.mode = mode;
    assert.equal((await f.gpu({ holdLeftoverFx: true, skipBuffers: true })).skipped, false);
    assert.equal(f.owner._liveSectorCookGeneration, 0);
    assert.deepEqual(f.marks, ['restore-shadows', 'rest-effects']);
  });
}

test('actual normal jump composed with actual GPU cook completes once', async () => {
  const f = gpuFixture();
  f.state.render.cookLiveSceneGpu = f.gpu;
  const result = await flush(f.cook({ id: 'ceres' }, 7), f.frames);
  assert.equal(result.skipped, false);
  assert.equal(f.owner._liveSectorCookGeneration, 1);
  assert.deepEqual(f.marks, ['restore-shadows', 'restore-shadows', 'rest-effects', 'hold', 'freeze', 'release']);
});

test('actual GPU non-admitted early-out remains unchanged', async () => {
  const f = gpuFixture();
  f.state.render.sectorShellAdmission = false;
  assert.equal((await f.gpu()).reason, 'not-loading');
  assert.deepEqual(f.marks, []);
});

test('actual GPU cancellation after buffer await preserves new effects and still restores temporary roots', async () => {
  const f = gpuFixture(), buffers = deferred();
  const root = {};
  f.values.buildAsteroidLeafWarmGroup = () => root;
  f.values.prepareStartupGpuResidency = () => buffers.promise;
  const run = f.gpu({ holdLeftoverFx: true, warmFirstFlightFx: true, skipBuffers: true });
  await nextTurn();
  f.state.world.enterSerial = 8;
  buffers.resolve({ ok: true });
  assert.equal((await run).reason, 'sector-superseded');
  assert.equal(root.parent, null);
  assert.equal(f.marks.includes('rest-effects'), false);
  assert.equal(f.marks.filter(x => x === 'remove-warm-root').length, 1);
});

test('deferred clock and tick belong only to actual synchronous provider steps', async () => {
  const f = fixture(), seen = [];
  f.state.render._deferredEnterClock = 99;
  f.state.render._deferredEnterTick = 101;
  f.state.render.sectorEnterCookWillRun = () => true;
  lifecycleHelpers.deferSectorEnterMaterialization(f.state, { enterEpoch: 7, enterSimTime: 10, enterTick: 12 }, function* () {
    for (let i = 0; i < 2; i++) {
      seen.push([f.state.render._deferredEnterClock, f.state.render._deferredEnterTick]);
      yield;
    }
  });
  const run = f.cook({ id: 'ceres' }, 7);
  assert.deepEqual(seen, [[10, 12]]);
  assert.equal(f.state.render._deferredEnterClock, 99);
  assert.equal(f.state.render._deferredEnterTick, 101);
  assert.equal((await flush(run, f.frames)).skipped, false);
  assert.deepEqual(seen, [[10, 12], [10, 12]]);
  assert.equal(f.state.render._deferredEnterClock, 99);
  assert.equal(f.state.render._deferredEnterTick, 101);
});

test('canceled deferred provider cannot clear replacement render clock or tick', async () => {
  const f = fixture(), log = [];
  f.state.render.sectorEnterCookWillRun = () => true;
  lifecycleHelpers.deferSectorEnterMaterialization(f.state, { enterEpoch: 7, enterSimTime: 10, enterTick: 12 }, () => provider(log));
  const run = f.cook({ id: 'ceres' }, 7);
  f.state.render = { ...f.state.render, _deferredEnterClock: 99, _deferredEnterTick: 101 };
  f.state.world.enterSerial = 8;
  assert.equal((await flush(run, f.frames)).reason, 'sector-superseded');
  assert.deepEqual(log, [1, 'closed']);
  assert.equal(f.state.render._deferredEnterClock, 99);
  assert.equal(f.state.render._deferredEnterTick, 101);
});

test('normal pipeline skip without generation mint still releases its own latch', async () => {
  const f = fixture();
  f.values.gpu.software = true;
  await evaluate(pipelineCode, f.owner, f.values);
  assert.equal(f.state.render.sectorShellAdmission, false);
  assert.equal(f.state.render.firstFlightResidencyHoldUntil, 12);
});

test('actual compile receipt prevents same-entry nested cook from lending its generation to old pipeline', async () => {
  const f = fixture(), gpu = deferred();
  let started = false, newer;
  f.state.render.cookLiveSceneGpu = () => gpu.promise;
  f.owner._simHelpers.sectorCookProviders = [() => {
    if (!started) {
      started = true;
      newer = f.cook({ id: 'ceres' }, 7);
    }
  }];
  const oldPipeline = evaluate(pipelineCode, f.owner, f.values);
  await flush(oldPipeline, f.frames);
  assert.equal(f.owner._liveSectorCookGeneration, 2);
  assert.equal(f.state.render.sectorShellAdmission, true);
  gpu.resolve({ ok: true });
  assert.equal((await flush(newer, f.frames)).skipped, false);
});

for (const [mode, shell] of [['loading', true], ['pause', true], ['flight', false]]) {
  test('stale jump early-out preserves current FIFO in ' + mode + ' shell=' + shell, async () => {
    const f = fixture(), calls = [];
    f.state.world.currentSectorId = 'helios';
    f.state.world.enterSerial = 8;
    f.state.render.sectorEnterCookWillRun = () => true;
    lifecycleHelpers.deferSectorEnterMaterialization(f.state, { enterEpoch: 8 }, sector => calls.push(sector.id));
    f.state.mode = mode;
    f.state.render.sectorShellAdmission = shell;
    assert.equal((await f.cook({ id: 'ceres' }, 7)).reason, 'stale-enter-superseded');
    assert.deepEqual(calls, []);
    assert.equal(f.state.render.deferredEnterMaterializers.length, 1);
  });
}

test('keep-GPU drain cancellation skips replacement ledger and route work', async () => {
  const f = fixture(), boundary = deferred(), steps = [];
  f.state.mode = 'loading';
  f.owner._sessionLiveSectorCookedId = 'ceres';
  f.owner._meshBuildQueue = [1];
  f.owner._drainPendingMeshBuilds = () => { f.owner._meshBuildQueueHead = 1; };
  f.owner._selectPostRoute = () => { steps.push('route'); return null; };
  f.values.reattachResidentGpuMeshes = () => {};
  f.values.yieldToBrowser = () => boundary.promise;
  f.values.recordOpeningCookStep = (_render, name) => steps.push(name);
  const run = evaluate(preflightCode, f.owner, f.values)();
  await nextTurn();
  f.state.world.enterSerial = 8;
  boundary.resolve();
  assert.equal((await run).reason, 'sector-superseded');
  assert.deepEqual(steps, ['live.sessionRecook']);
});

test('preflight pending-admission completion cannot invoke replacement providers or stamp its composition', async () => {
  const f = preflightFixture(), pending = deferred(), calls = [];
  f.state.render.drainPendingPipelineAdmissions = () => pending.promise;
  const run = f.preflight();
  f.opening.resolve({ settled: true });
  await nextTurn();
  const replacement = { sentinel: true };
  f.state.world.enterSerial = 8;
  f.state.render.openingCompositionSettle = replacement;
  f.owner._simHelpers = { sectorCookProviders: [() => calls.push('replacement-provider')] };
  pending.resolve({ ok: true });
  assert.equal((await run).reason, 'sector-superseded');
  assert.equal(f.state.render.openingCompositionSettle, replacement);
  assert.deepEqual(calls, []);
  assert.deepEqual(f.marks, []);
});

test('provider iterator closes when the yielded frame reports context loss', async () => {
  const log = [], f = fixture([() => provider(log)]);
  f.values.renderer.getContext = () => ({ flush() {}, isContextLost: () => true });
  await assert.rejects(flush(f.cook({ id: 'ceres' }, 7), f.frames), /webgl-context-lost-during-live-sector-cook/);
  assert.deepEqual(log, [1, 'closed']);
});

test('presentation iterator closes when the yielded frame reports context loss', async () => {
  const log = [], f = fixture();
  let frames = 0;
  f.values.collectMeshPresentationEntitiesChunked = () => provider(log);
  f.values.renderer.getContext = () => ({ flush() {}, isContextLost: () => ++frames > 1 });
  await assert.rejects(flush(f.cook({ id: 'ceres' }, 7), f.frames), /webgl-context-lost-during-live-sector-cook/);
  assert.deepEqual(log, [1, 'closed']);
});

test('full cold preflight completes and publishes captured sector', async()=>{
 const f=preflightFixture();
 f.values.scene.traverse=()=>{};
 f.values.collectMeshPresentationEntities=()=>{};
 f.values.shouldAwaitOpeningGpuCook=()=>false;
 f.values.prepareStartupGpuResidency=async()=>({ok:true});
 f.values.recordAuthoredAdmissionBlockingSlice=()=>{};
 f.owner._parkBoundedWarmRoots=()=>({roots:0,nodes:0});
 f.state.render.drainPendingPipelineAdmissions=async()=>({pendingCount:0});
 f.opening.resolve({settled:true});
 const result=await f.preflight();
 assert.equal(result.skipped,false);
 assert.equal(f.owner._liveSectorCookGeneration,1);
 assert.equal(f.owner._sessionLiveSectorCookedId,'ceres');
 assert.equal(f.state.render.sessionLiveSectorCookedId,'ceres');
 assert.deepEqual(f.marks,['hold','freeze']);
});
test('GPU buffer error removes temporary root and preserves original rejection',async()=>{
 const f=gpuFixture(), err=new Error('buffer-failure'), root={};
 f.values.buildAsteroidLeafWarmGroup=()=>root;
 f.values.prepareStartupGpuResidency=async()=>{throw err;};
 await assert.rejects(f.gpu({holdLeftoverFx:true,warmFirstFlightFx:true,skipBuffers:true}),e=>e===err);
 assert.equal(root.parent,null);
 assert.equal(f.marks.filter(x=>x==='remove-warm-root').length,1);
 assert.equal(f.marks.includes('rest-effects'),false);
});
test('ordinary provider failure preserves later provider order and finalization',async()=>{
 const calls=[], f=fixture([()=>{calls.push('fails');throw new Error('isolated-provider');},()=>calls.push('next')]);
 const result=await flush(f.cook({id:'ceres'},7),f.frames);
 assert.equal(result.skipped,false);
 assert.deepEqual(calls,['fails','next']);
 assert.deepEqual(f.marks,['hold','freeze','release']);
});
test('stale census teardown stops before disposing remaining/new live mesh',async()=>{
 const f=fixture(), disposed=[];
 const oldMesh={name:'old'},liveMesh={name:'new-live'};
 f.owner._meshes=new Map([['old',oldMesh],['new-live',liveMesh]]);
 f.owner.scene=f.values.scene;
 f.owner.scene.remove=()=>{};
 f.owner._unbindPresentationMesh=()=>{};
 Object.assign(f.values,{
  resolveWorldPresentationEntity:()=>null,isEntityRenderRelevant:()=>false,
  releaseAsteroidInstancesForEntity(){},disposeObject:mesh=>disposed.push(mesh.name),
  noteShadowMeshRemoved(){},clearEntityMeshReference(){},
 });
 const running=f.cook({id:'ceres'},7);
 for(let n=0;n<10 && !disposed.length;n++){await nextTurn();if(f.frames.length)f.frames.shift()();}
 assert.deepEqual(disposed,['old']);
 f.state.world.enterSerial=8;
 const result=await flush(running,f.frames);
 assert.equal(result.reason,'sector-superseded');
 assert.deepEqual(disposed,['old']);
 assert.equal(f.owner._meshes.get('new-live'),liveMesh);
 assert.deepEqual(f.marks,[]);
});
for(const stage of ['gpu','preflight','pipeline']) test('state identity replacement cancels '+stage,async()=>{
 const f=stage==='gpu'?gpuFixture():stage==='preflight'?preflightFixture():fixture(), pending=deferred();
 let run;
 if(stage==='gpu'){
  f.owner._compilePostRoute=()=>pending.promise;
  run=f.gpu();
 }else if(stage==='preflight'){
  run=f.preflight();
  await nextTurn();
 }else{
  f.values.compileSectorPipelines=()=>pending.promise;
  run=evaluate(pipelineCode,f.owner,f.values);
 }
 f.owner.state={...f.state};
 if(stage==='preflight')f.opening.resolve({settled:true});else pending.resolve({ok:true});
 const result=await run;
 if(stage!=='pipeline')assert.equal(result.reason,'sector-superseded');
 assert.equal(f.marks.includes('hold'),false);
 assert.equal(f.marks.includes('rest-effects'),false);
 assert.equal(f.state.render.sectorShellAdmission,true);
});
