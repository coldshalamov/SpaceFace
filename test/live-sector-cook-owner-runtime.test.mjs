import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';
import * as THREE from 'three';
import { revealSubjectWithAncestors } from '../src/render/compilePresentSlice.js';
import { touchSubjectOnExactTarget } from '../src/render/openingGpuAdmission.js';
import { createPhaseBlinkPresentation } from '../src/render/phaseBlinkPresentation.js';
import { PersistentCombatBeamPool } from '../src/render/combat/persistentBeams.js';
import { isInitialAuthoredCompositionEntity } from '../src/render/partsLibrary.js';
import * as lifecycleHelpers from '../src/core/sectorEnterDefer.js';
import { createOpeningLoadingAdmission, observePipelineAdmission, prepareMobileOpeningFirstPicture, waitForOpeningFirstPicture } from '../src/render/pipelineReadiness.js';
const require = createRequire(import.meta.url);
const { parse } = require(require.resolve('@babel/parser', { paths: [process.env.SPACEFACE_DEPS_ROOT || process.cwd()] }));
const source = readFileSync(process.env.ENTRY_SOURCE_RENDERER || new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module' });
let cookNode, pipelineNode, enterNode, guardNode, preflightNode, gpuNode, compileNode, openingCaptureNode, loadingNode, pictureNode, ownerInactiveTouchNode, ownerInactiveTouchCheckNode, ownerActiveAdmissionNode, touchSubmitNode, touchFacadeNode, groupTouchNode, settleTouchManyNode;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ArrowFunctionExpression' && node.async
      && source.slice(node.start, node.end).includes('submitExactSubjectTouch(subject, admissionOptions.isActive)')
      && source.slice(node.start, node.end).includes('admissionOptions.isActive(subject) !== true')) {
    ownerActiveAdmissionNode = node;
  }
  if (node.type === 'AssignmentExpression' && node.left?.property?.name === 'prepareLiveSectorAfterJump') cookNode = node.right;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'pipelinePrecompile') pipelineNode = node.init;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'compileSectorPipelines') compileNode = node.init;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'captureLiveSectorCookStale') guardNode = node.init;
  if (node.type === 'AssignmentExpression' && node.left?.property?.name === 'prepareLiveSectorBeforeFlight') preflightNode = node.right;
  if (node.type === 'AssignmentExpression' && node.left?.property?.name === 'cookLiveSceneGpu') gpuNode = node.right;
  if (node.type === 'AssignmentExpression' && node.left?.property?.name === 'captureOpeningSubmissionPlanSteps') openingCaptureNode = node.right;
  if (node.type === 'AssignmentExpression' && node.left?.property?.name === 'beginOpeningLoadingAdmission') loadingNode = node.right;
  if (node.type === 'AssignmentExpression' && node.left?.property?.name === 'prepareOpeningFirstPicture') pictureNode = node.right;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'submitExactSubjectTouch') touchSubmitNode = node.init;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'ownerInactiveTouchError') ownerInactiveTouchNode = node.init;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'isOwnerInactiveTouchError') ownerInactiveTouchCheckNode = node.init;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'touchExactTargetSubjects') groupTouchNode = node.init;
  if (node.type === 'ObjectProperty' && node.key?.name === 'touchMany'
      && source.slice(node.value.start, node.value.end).includes('settleDrawableSession')) settleTouchManyNode = node.value;
  if (node.type === 'AssignmentExpression' && node.left?.property?.name === 'touchSubjectExactTarget') touchFacadeNode = node.right;
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
const openingCaptureCode = source.slice(openingCaptureNode.start, openingCaptureNode.end);
const loadingCode = source.slice(loadingNode.start, loadingNode.end);
const pictureCode = source.slice(pictureNode.start, pictureNode.end);
const touchSubmitCode = source.slice(touchSubmitNode.start, touchSubmitNode.end);
const touchFacadeCode = source.slice(touchFacadeNode.start, touchFacadeNode.end);
const ownerInactiveTouchCode = source.slice(ownerInactiveTouchNode.start, ownerInactiveTouchNode.end);
const ownerInactiveTouchCheckCode = source.slice(ownerInactiveTouchCheckNode.start, ownerInactiveTouchCheckNode.end);
const ownerActiveAdmissionCode = source.slice(ownerActiveAdmissionNode.start, ownerActiveAdmissionNode.end);
const groupTouchCode = source.slice(groupTouchNode.start, groupTouchNode.end);
const settleTouchManyCode = source.slice(settleTouchManyNode.start, settleTouchManyNode.end);
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

function queuedTouchFixture({ detached = false, failTouch = false, serialPacer = true } = {}) {
  const scene = new THREE.Scene(), root = new THREE.Group(); root.visible = false; scene.add(root);
  const leaf = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2);
  leaf.visible = false; leaf.count = 0; leaf.geometry.setDrawRange(0, 0); root.add(leaf);
  const jobs = [], draws = [], warnings = [];
  const owner = { scene };
  const values = { renderer: {}, revealSubjectWithAncestors, cam: { obj: {} },
    makeGpuQueuePacer: () => serialPacer ? ({ submit: (work, admission = {}) => new Promise((resolve, reject) => {
      jobs.push({
        work: () => typeof admission.isActive === 'function' && admission.isActive() !== true
          ? { skipped: true, reason: 'owner-inactive' }
          : work(),
        resolve,
        reject,
      });
    }) }) : null,
    postTaskAtBackgroundPriorityBounded() {},
    touchExactTargetSubject(subject) {
      assert.equal(root.visible, true); assert.equal(leaf.visible, true);
      assert.equal(leaf.count, 1); assert.ok(leaf.geometry.drawRange.count > 0);
      draws.push(subject);
      if (failTouch) throw new Error('injected-native-touch-failure');
      return { skipped: false };
    },
    detachedSubjectUploadsPendingAsync: async () => detached ? [{}] : [],
    detachedSubjectGeometriesPendingAsync: async () => [],
    rehydrateDetachedTextures: async () => {}, rehydrateDetachedGeometries: async () => {},
    admissionPaceYield: async () => {},
    refillPresentedCompressedUploads: async () => {}, collectStartupTextures: () => [],
    rememberOpeningPreparedLeaves() {}, laneWarn: (...args) => warnings.push(args), emptyCompressedTextureIdentity: () => null,
  };
  values.ownerInactiveTouchError = evaluate(ownerInactiveTouchCode, owner, values);
  values.isOwnerInactiveTouchError = evaluate(ownerInactiveTouchCheckCode, owner, values);
  const submit = evaluate(touchSubmitCode, owner, values);
  values.submitExactSubjectTouch = submit;
  const facade = evaluate(touchFacadeCode, owner, values);
  const assertRestored = () => {
    assert.equal(root.visible, false, 'hidden ancestor stays hidden outside the synchronous draw');
    assert.equal(leaf.visible, false, 'a hidden LOD/pool layer never leaks into live submission');
    assert.equal(leaf.count, 0); assert.equal(leaf.geometry.drawRange.count, 0);
  };
  const runNext = async () => {
    const job = jobs.shift(); assert.ok(job, 'one touch is waiting for its GPU reservation');
    try { job.resolve(await job.work()); } catch (error) { job.reject(error); }
    assertRestored();
    await nextTurn();
  };
  return { root, leaf, jobs, draws, warnings, facade, submit, assertRestored, runNext };
}

for (const detached of [false, true]) {
  test('actual queued publish touches restore overlapping root/descendant visibility; detached=' + detached, async () => {
    const f = queuedTouchFixture({ detached });
    const root = f.facade(f.root), leaf = f.facade(f.leaf);
    await nextTurn();
    assert.equal(f.jobs.length, 2);
    f.assertRestored();
    await f.runNext(); f.assertRestored();
    await f.runNext(); f.assertRestored();
    assert.deepEqual(await Promise.all([root, leaf]), [{ skipped: false }, { skipped: false }]);
    assert.deepEqual(f.draws, [f.root, f.leaf]);
  });
}

test('the actual submit callback restores visibility/count/range before a touch rejection escapes', async () => {
  const f = queuedTouchFixture({ failTouch: true });
  const touch = f.submit(f.root);
  const rejected = assert.rejects(touch, /injected-native-touch-failure/);
  f.assertRestored(); await f.runNext(); await rejected; f.assertRestored();
});

test('inactive exact-target owners cancel before draw without masquerading as a successful admission', async () => {
  const f = queuedTouchFixture();
  assert.deepEqual(await f.facade(f.root, { isActive: () => false }),
    { skipped: true, reason: 'owner-inactive' });
  assert.equal(f.jobs.length, 0, 'inactive before admission does no async texture scan or queue work');

  // The owner can retire while waiting for the serial GPU reservation. The pacer skip is a
  // cancellation, not a successful exact touch; the awaited submit remains rejected as AbortError.
  let active = true;
  const retiredWhileQueued = f.submit(f.root, () => active);
  active = false;
  const cancelled = assert.rejects(retiredWhileQueued, (error) => (
    error.name === 'AbortError' && error.code === 'SF_EXACT_TARGET_OWNER_INACTIVE'
  ));
  await f.runNext();
  await cancelled;
  assert.deepEqual(f.draws, [], 'an inactive owner never runs the native exact-target draw');
  assert.deepEqual(f.warnings, [], 'owner cancellation does not enter GPU failure diagnostics');

  // The no-pacer route reaches the same typed cancellation from the submission callback itself.
  const direct = queuedTouchFixture({ serialPacer: false });
  active = true;
  const retiredBeforeSubmit = direct.submit(direct.root, () => active);
  active = false;
  await assert.rejects(retiredBeforeSubmit, (error) => (
    error.name === 'AbortError' && error.code === 'SF_EXACT_TARGET_OWNER_INACTIVE'
  ));
  assert.deepEqual(direct.draws, []);
});

test('pipeline continuation rejects a retired owner instead of resolving stale readiness', async () => {
  const subject = {};
  const owner = { scene: {} };
  const errorFactory = evaluate(ownerInactiveTouchCode, owner, {});
  let exactTouches = 0;
  const continuation = evaluate(ownerActiveAdmissionCode, owner, {
    admissionOptions: { isActive: () => false },
    cam: { obj: {} },
    ownerInactiveTouchError: errorFactory,
    state: { mode: 'flight', render: {} },
    subject,
    submitExactSubjectTouch: () => { exactTouches += 1; },
  });
  await assert.rejects(continuation({}), (error) => (
    error.name === 'AbortError' && error.code === 'SF_EXACT_TARGET_OWNER_INACTIVE'
  ));
  assert.equal(exactTouches, 0, 'retired owner is rejected before any exact-target draw');
});

test('live exact-target touches still draw; genuine touch failures remain warned failures', async () => {
  const live = queuedTouchFixture();
  const ready = live.facade(live.root, { isActive: () => true });
  await nextTurn();
  await live.runNext();
  assert.deepEqual(await ready, { skipped: false });
  assert.deepEqual(live.draws, [live.root]);
  assert.deepEqual(live.warnings, []);

  const failed = queuedTouchFixture({ failTouch: true });
  const rejectedTouch = failed.facade(failed.root, { isActive: () => true });
  await nextTurn();
  await failed.runNext();
  assert.deepEqual(await rejectedTouch, { skipped: true, reason: 'touch-failed' });
  assert.equal(failed.draws.length, 1, 'the live owner did attempt its exact-target draw');
  assert.equal(failed.warnings.length, 1, 'a real draw failure remains observable');
  assert.equal(failed.warnings[0][2], '[render] exact-target admission touch failed');
  assert.match(String(failed.warnings[0][3]), /injected-native-touch-failure/);
});

for (const failDraw of [false, true]) {
  test('actual grouped touches keep real idle Phase Blink and beam roots hidden across async preparation; rejection=' + failDraw, async () => {
    const scene = new THREE.Scene();
    let blinkEvent;
    const blink = createPhaseBlinkPresentation();
    blink.attach(scene, { on(_event, handler) { blinkEvent = handler; }, off() {} });
    const rifts = scene.children.filter(root => root.children.length === 3 && root.children[2].children.length === 6);
    assert.equal(rifts.length, 6, 'the production owner creates six idle rifts');
    const beams = new PersistentCombatBeamPool(THREE, { maxBeams: 2 });
    scene.add(beams.group);
    const roots = [...rifts, beams.group];
    const initial = [];
    scene.traverse(node => initial.push({ node, visible: node.visible, frustumCulled: node.frustumCulled,
      count: node.count, range: node.geometry?.drawRange ? { ...node.geometry.drawRange } : null }));
    const restored = () => {
      for (const prior of initial) {
        assert.equal(prior.node.visible, prior.visible, 'warm does not publish a temporary visibility bit');
        assert.equal(prior.node.frustumCulled, prior.frustumCulled);
        assert.equal(prior.node.count, prior.count);
        if (prior.range) assert.deepEqual(prior.node.geometry.drawRange, prior.range);
      }
    };
    const stamp = deferred(), draws = [];
    const renderer = { autoClear: true, getRenderTarget: () => null, setRenderTarget() {},
      render() { draws.push(roots.filter(root => root.visible)); if (failDraw) throw new Error('injected grouped draw failure'); } };
    const owner = {};
    const values = { renderer, scene, cam: { obj: new THREE.PerspectiveCamera() }, revealSubjectWithAncestors,
      stampSubjectEnvAsync: async () => stamp.promise, touchSubjectOnExactTarget, settleDrawableSession: null };
    values.touchExactTargetSubjects = evaluate(groupTouchCode, owner, values);
    const touchMany = evaluate(settleTouchManyCode, owner, values);
    try {
      const first = touchMany([...rifts.map(root => root.children[0]), beams.core]);
      const second = touchMany([...rifts.map(root => root.children[2].children[0]), beams.halo]);
      const waitingVisibility = roots.map(root => root.visible);
      stamp.resolve();
      const results = await Promise.allSettled([first, second]);
      assert.deepEqual(waitingVisibility, roots.map(() => false), 'environment stamping never holds an idle ancestor revealed');
      assert.equal(draws.length, 2, 'each prepared group submits exactly once');
      assert.ok(draws.every(drawnRoots => drawnRoots.length === 7), 'each synchronous native draw sees all of its exact subjects');
      assert.ok(results.every(result => result.status === (failDraw ? 'rejected' : 'fulfilled')));
      if (failDraw) assert.ok(results.every(result => /injected grouped draw failure/.test(result.reason.message)));
      restored();
      // The repair owns warm state only: the real effect owners can still activate after loading.
      const liveState = { simTime: 0, entities: new Map(), settings: {} };
      blinkEvent({ from: { x: 0, z: 0 }, to: { x: 50, z: 0 }, rot: 0 });
      blink.sync(liveState, null, null, 0);
      assert.equal(rifts.filter(root => root.visible).length, 2, 'departure and arrival remain reachable');
      beams.upsert({ beamKey: 'ship:beam', ownerId: 'ship', weaponId: 'beam', phase: 'begin',
        from: { x: 0, z: 0 }, to: { x: 10, z: 0 } }, 1);
      beams.update(1, (x, z, out) => { out.x = x; out.z = z; return out; });
      assert.equal(beams.group.visible, true, 'a real beam still activates its pool');
      assert.equal(beams.activeCount, 1);
    } finally { blink.dispose(); beams.dispose(); }
  });
}

test('the actual first-picture facade forwards the readiness cancellation guard to its renderer owner', async () => {
  let active = true;
  const options = { isActive: () => active };
  const called = [];
  const owner = { prepareOpeningFirstPicture: async (...args) => { called.push(args); return args[1].isActive(); } };
  const facade = evaluate(pictureCode, owner, {});
  assert.equal(await facade(20, options), true);
  active = false;
  assert.equal(await facade(20, options), false);
  assert.deepEqual(called, [[20, options], [20, options]], 'the facade preserves the owning guard identity');
});

function loadingFixture() {
  const player = { id: 'player', alive: true, isPlayer: true };
  const state = { mode: 'loading', playerId: player.id, entities: new Map([[player.id, player]]), entityList: [player],
    world: { enterSerial: 1, currentSectorId: 'ceres' }, render: { admissionRunGeneration: 1 } };
  const cook = deferred(), calls = [];
  const owner = { _meshes: new Map(), _meshBuildQueuedIds: new Set(), _meshBuildQueue: [], _meshBuildQueueHead: 0 };
  state.render.prepareLiveSectorBeforeFlight = (options) => { calls.push(options); return cook.promise; };
  const begin = evaluate(loadingCode, owner, {
    state, THREE, createOpeningLoadingAdmission, observePipelineAdmission, isInitialAuthoredCompositionEntity,
    rendererGenerationIsActive: () => true, releaseOpeningGraphPublication() {},
    cam: {}, openingSubmissionCamera: () => null,
    enqueueMissingMeshBuildsSteps: function* () { yield; },
    performance: { now: () => 0 }, yieldToBrowser: async () => {},
  });
  state.render.beginOpeningLoadingAdmission = begin;
  state.render.prepareOpeningFirstPicture = async () => true;
  state.render.captureOpeningSubmissionPlan = () => ({ complete: true, firstPlayablePipelineSet: { complete: true } });
  state.render.drainOpeningSubmissionPlan = async () => ({ ok: true });
  state.render.prepareOpeningGpuResources = async () => ({ skipped: false });
  return { state, owner, cook, calls, begin };
}

test('actual per-subject staging starts early and the broad cook starts once at the post-visual picture gate', async () => {
  const f = loadingFixture();
  const meshes = f.begin();
  assert.equal(f.begin(), meshes, 'duplicate callers share the finite mesh owner');
  assert.equal(await meshes, true, 'mesh preparation does not recursively join the sector cook');
  await nextTurn();
  assert.equal(f.calls.length, 0, 'library and visual staging cannot start a broad census/freeze');
  const ready = waitForOpeningFirstPicture(f.state, 1000);
  assert.equal(waitForOpeningFirstPicture(f.state, 1000), ready);
  await nextTurn();
  assert.equal(f.calls.length, 1, 'the post-visual gate starts the current-sector owner during loading');
  assert.equal(f.calls[0].isActive(), true);
  assert.equal(f.begin(), meshes);
  f.cook.resolve({ skipped: false });
  assert.equal(await ready, true);
});

test('the picture gate rejects a replaced world, generation, context or loading mode while the sector cook awaits', async () => {
  for (const replace of [
    f => { f.state.world = { ...f.state.world }; },
    f => { f.state.render.admissionRunGeneration++; },
    f => { f.state.contextRestoreSeq = 1; },
    f => { f.state.world.currentSectorId = 'helios'; },
    f => { f.state.render.renderer = {}; },
    f => { f.state.mode = 'menu'; },
  ]) {
    const f = loadingFixture();
    const ready = waitForOpeningFirstPicture(f.state, 1000);
    const rejected = assert.rejects(ready, /superseded/);
    await nextTurn();
    replace(f);
    assert.equal(f.calls[0].isActive(), false);
    f.cook.resolve({ skipped: false });
    await rejected;
  }
});

test('replacing the captured player retires the old loading cohort before starting its replacement', async () => {
  const f = loadingFixture();
  await f.begin(); await nextTurn();
  const old = f.owner._openingLoadingAdmission;
  const player = { ...f.state.entities.get('player') };
  f.state.entities.set('player', player); f.state.entityList = [player];
  const replacement = f.begin();
  await replacement; await nextTurn();
  assert.equal(f.calls.length, 0, 'cohort replacement cannot start broad work before its prerequisites');
  assert.equal(old.owns(f.state.entities.get('player')), false);
  await assert.rejects(old.drain(), /superseded/);
  assert.equal(f.owner._openingLoadingAdmission.owns(player), true);
  assert.equal(f.begin(), replacement, 'the replacement also deduplicates nested callers');
});
test('opening plan capture uses the renderer owner when invoked through the render facade', () => {
  const owner = { _meshes: new Map([[1, { name: 'player' }]]) };
  const state = { render: {} };
  const plan = { complete: true, compileSubjects: [...owner._meshes.values()] };
  const capture = evaluate(openingCaptureCode, owner, {
    state,
    captureLiveSectorCookStale: () => () => false,
    *buildOpeningSubmissionPlanSteps() {
      assert.equal(this._meshes, owner._meshes);
      yield;
      return plan;
    },
    stampProducerReceipt: () => {},
    openingSubjectIdentity: (subject) => subject.name,
    openingCohort: { capture: () => {}, snapshot: () => ({}) },
  });
  state.render.captureOpeningSubmissionPlanSteps = capture;
  const steps = state.render.captureOpeningSubmissionPlanSteps();
  assert.equal(steps.next().done, false);
  assert.equal(steps.next().value, plan);
  assert.equal(state.render.openingSubmissionPlan, plan);
});
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
    isMobileRenderContext: () => false,
    rendererGenerationIsActive: () => owner._rendererGeneration === 2 && !owner._rendererResourcesDisposed, scene: { environment: {} },
    renderer: { getContext: () => ({ flush: noop, isContextLost: () => false }) },
    globalThis: { requestAnimationFrame: fn => frames.push(fn) },
    // The yield seams now resume through the bounded background post (the W119
    // post-present contract) — on this harness that rides the same frame pump.
    postTaskAtBackgroundPriorityBounded: (cb) => frames.push(cb),
    performance: { now: () => now += 10 }, yieldToBrowser: async () => {},
    beginOpeningCookLedger: () => ({}), bindEnvironmentToStandardMaterials: noop,
    bindEnvironmentToStandardMaterialsSteps: function* () {},
    collectFirstFlightCookEntities: () => [], enqueueMissingMeshBuilds: noop,
    enqueueMissingMeshBuildsSteps: function* () {},
    collectNeverLinkedSceneRootsSteps: function* () {},
    createSlicedYield: (fn) => fn,
    collectMeshPresentationEntitiesChunked: function* () {},
    recordOpeningCookStep: noop, stampProducerReceipt: noop, resumeAuthoredUpgradeQueueForLoadingHulls: noop,
    collectUnresidentInstancedDrawables: () => [],
    holdAuthoredUpgradeQueueForFirstFlight: () => marks.push('hold'),
    freezeOpeningGraphPublication: () => marks.push('freeze'),
    formatOpeningCookLedger: () => 'test', console: { info: noop, warn: noop, error: noop },
    armSectorArrivalPublishRelease: () => marks.push('release'),
    SECTOR_ARRIVAL_PUBLISH_HOLD_SECONDS: 2, FIRST_FLIGHT_DEFERRED_HOLD_SECONDS: 20,
    warmNearbyLedgerRows: noop, makeHoldExemptScanContext: () => ({}),
    exactSectorId: 'ceres', sector: { id: 'ceres' }, continuous: false, enterEpoch: 7,
    // Ledger consults inside the cook's slice clocks: a never-spent wallet keeps
    // the fixture on the private-clock path it asserts (ordering, cancellation).
    notePacedFrameSpend: noop, pacedFrameSpend: () => 0, PACED_FRAME_BUDGET_MS: 8,
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
  f.owner._publishAssetResidencyDiagnosticsDeferred = () => f.marks.push('diagnostics');
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
  if (node.type === 'ObjectMethod' && ['_openRestoreSession', '_restoreAsync', '_beginRestoreSequence',
    '_cancelCeresEntityReferenceRestore', '_cancelCeresAttachmentRestore'].includes(node.key?.name)) {
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
    shouldAwaitOpeningGpuCook: () => true,
    resumeAuthoredUpgradeQueueAfterOpening() {},
    pipelineAdmissions: { resumeAutoFlush() {}, pendingCount: 0 },
    indexedShipLikeScan: () => [], indexedTypeScan: () => [],
    createSlicedYield: () => async () => {},
    waitForOpeningCompositionSettled: () => opening.promise,
    waitForAuthoredUpgradeQueueIdle: async () => ({ idle: true }),
  });
  return { ...f, opening, preflight: evaluate(preflightCode, f.owner, f.values) };
}

test('the actual preflight owner stops at its next await after loading admission is cancelled', async () => {
  const f = preflightFixture();
  let active = true;
  const run = f.preflight({ isActive: () => active });
  await nextTurn(); active = false;
  f.opening.resolve({ settled: true });
  assert.equal((await run).reason, 'sector-superseded');
  assert.equal(f.state.render.openingCompositionSettle, undefined);
  assert.deepEqual(f.marks, [], 'cancelled work cannot hold/freeze a replacement presentation');
});

function mobilePreflightFixture() {
  const f = preflightFixture();
  f.values.isMobileRenderContext = () => true;
  f.values.prepareMobileOpeningFirstPicture = prepareMobileOpeningFirstPicture;
  f.owner._discardEarlyCrucibleWarm = () => f.marks.push('discard-speculative-warm');
  f.owner._openingAdmissionPendingCount = () => {
    assert.equal(f.state.mode, 'loading', 'the loading shell still owns the first picture');
    f.marks.push('watch-opening-admissions');
    return 0;
  };
  const plan = { complete: true, firstPlayablePipelineSet: { complete: true }, drawLeaves: [{ id: 'player' }] };
  Object.assign(f.state.render, {
    prepareOpeningFirstPicture: async () => true,
    *captureOpeningSubmissionPlanSteps() { return plan; },
    drainOpeningSubmissionPlan: async (candidate) => { assert.equal(candidate, plan); return { materials: 1 }; },
    prepareOpeningGpuResources: async () => ({ skipped: false, openingSubmissionPlan: plan }),
  });
  return { ...f, plan, preflight: evaluate(preflightCode, f.owner, f.values) };
}

test('mobile preflight admits the exact picture and cleans up its publication guards once', async () => {
  const f = mobilePreflightFixture();
  const result = await f.preflight();
  assert.equal(result.mobileFirstPicture, true);
  assert.equal(result.plan, f.plan);
  assert.equal(f.state.render.sessionLiveSectorCookedId, 'ceres');
  assert.equal(f.state.render.liveSectorGpuAdmission, false);
  assert.deepEqual(f.marks, ['discard-speculative-warm', 'watch-opening-admissions', 'hold', 'freeze']);
});

test('mobile preflight rejects a required admission failure and restores the current guards', async () => {
  const f = mobilePreflightFixture();
  const error = new Error('required GPU admission failed');
  f.state.render.drainOpeningSubmissionPlan = async () => { throw error; };
  await assert.rejects(f.preflight(), (failure) => failure === error);
  assert.equal(f.state.render.sessionLiveSectorCookedId, undefined);
  assert.equal(f.state.render.liveSectorGpuAdmission, false);
  assert.deepEqual(f.marks, ['discard-speculative-warm', 'hold', 'freeze']);
});

test('superseded mobile preflight preserves the replacement publication guards', async () => {
  const f = mobilePreflightFixture();
  const pending = deferred();
  f.state.render.prepareOpeningFirstPicture = () => pending.promise;
  const run = f.preflight();
  f.state.world.enterSerial = 8;
  pending.resolve(true);
  assert.equal((await run).reason, 'sector-superseded');
  assert.deepEqual(f.marks, ['discard-speculative-warm']);
});

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
  f.values.bindEnvironmentToStandardMaterialsSteps = function* () { throw error; };
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
    collectFirstFlightEffectRootsSteps: function* () { return []; },
    collectPreparedAuthoredCompileRoots: () => [], syncVisiblePointLightBudget() {},
    // Steps-name stubs must be function-valued generators or the typeof guards
    // route every drive site to its sync fallback and the paced bodies (the code
    // that actually runs in production) stay dead under the harness.
    syncVisiblePointLightBudgetSteps: function* () { yield; },
    collectInstancePoolCompileRootsAndSubjectsSteps: function* () { yield; return { roots: [], subjects: [] }; },
    armAdmissionShadows: () => () => f.marks.push('restore-shadows'),
    revealSubjectForCompile: () => () => f.marks.push('restore-reveal'),
    survivalRunHoldsArena: () => false, createSlicedYield: fn => fn,
    createCookQueuePaceDebt: () => ({ note() {}, due: () => true, clear() {} }),
    prepareStartupGpuResidency: async () => ({ ok: true }),
    collectFirstFlightLayerDrawables: () => [], collectInstancePoolCompileRoots: () => [],
    buildOpeningSubmissionPlan: () => ({ compileSubjects: [] }),
    buildOpeningSubmissionPlanSteps: function* () { return { compileSubjects: [] }; },
    uniqueAdmissionUnits: () => ({ programSubjects: [] }),
    collectCompileSubjects: () => [],
  });
  return { ...f, gpu: evaluate(gpuCode, f.owner, f.values) };
}

test('the nested GPU cook honors cancellation from its loading owner after an awaited upload', async () => {
  const f = gpuFixture(), upload = deferred();
  f.state.mode = 'loading';
  let active = true;
  f.values.buildAsteroidLeafWarmGroup = () => ({});
  f.values.prepareStartupGpuResidency = () => upload.promise;
  const run = f.gpu({ isActive: () => active, holdLeftoverFx: true, warmFirstFlightFx: true, skipBuffers: true });
  await nextTurn(); active = false; upload.resolve({ ok: true });
  assert.equal((await run).reason, 'sector-superseded');
  assert.equal(f.marks.includes('rest-effects'), false, 'cancelled nested work cannot rest a replacement effect owner');
});

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
  disposeObjectSteps:(mesh)=>{disposed.push(mesh.name);return{next:()=>({done:true})};},
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

test('Ceres appearance owner survives a stale same-sector enter epoch', () => {
  const f = enterFixture(), canceled = [];
  const newOwner = { cancel: reason => canceled.push(reason) };
  f.owner._appearanceReplacements = new Map([['new-ceres-owner', newOwner]]);
  f.state.world.enterSerial = f.state.enterSerialSeq = 8;
  f.enter({ sectorId: 'ceres', sector: { id: 'ceres' }, enterEpoch: 7 });
  assert.deepEqual(canceled, []);
  assert.strictEqual(f.owner._appearanceReplacements.get('new-ceres-owner'), newOwner);
  assert.deepEqual(f.marks, []);
});

test('Ceres appearance owner survives an epochless event for a departed sector', () => {
  const f = enterFixture(), canceled = [];
  const newOwner = { cancel: reason => canceled.push(reason) };
  f.owner._appearanceReplacements = new Map([['new-ceres-owner', newOwner]]);
  f.state.world.currentSectorId = 'new-sector';
  f.enter({ sectorId: 'ceres', sector: { id: 'ceres' } });
  assert.deepEqual(canceled, []);
  assert.strictEqual(f.owner._appearanceReplacements.get('new-ceres-owner'), newOwner);
  assert.deepEqual(f.marks, []);
});

test('Ceres appearance owner is canceled once by its current sector enter', () => {
  const f = enterFixture(), canceled = [];
  f.owner._appearanceReplacements = new Map([['old-ceres-owner', {
    cancel: reason => canceled.push(reason),
  }]]);
  f.enter({ sectorId: 'ceres', sector: { id: 'ceres' }, enterEpoch: 7 });
  assert.deepEqual(canceled, ['appearance-sector-changed']);
  assert.deepEqual(f.marks, ['clear', 'reattach', 'diagnostics']);
});

test('throwing provider return preserves supersession and both captured clock owners', async () => {
  const f = fixture(), closed = [], capturedRender = f.state.render;
  capturedRender._deferredEnterClock = 40;
  capturedRender._deferredEnterTick = 41;
  capturedRender.sectorEnterCookWillRun = () => true;
  lifecycleHelpers.deferSectorEnterMaterialization(f.state, {
    enterEpoch: 7, enterSimTime: 10, enterTick: 12,
  }, () => ({
    next: () => ({ done: false }),
    return() {
      closed.push([capturedRender._deferredEnterClock, capturedRender._deferredEnterTick]);
      throw new Error('controlled-finalizer-failure');
    },
  }));
  const run = f.cook({ id: 'ceres' }, 7);
  const replacementRender = { ...capturedRender, _deferredEnterClock: 99, _deferredEnterTick: 101 };
  f.state.render = replacementRender;
  f.state.world.enterSerial = 8;
  assert.equal((await flush(run, f.frames)).reason, 'sector-superseded');
  assert.deepEqual(closed, [[10, 12]], 'cleanup closes once under the captured emit clock');
  assert.equal(capturedRender._deferredEnterClock, 40);
  assert.equal(capturedRender._deferredEnterTick, 41);
  assert.equal(replacementRender._deferredEnterClock, 99);
  assert.equal(replacementRender._deferredEnterTick, 101);
  assert.deepEqual(f.marks, []);
});

test('throwing provider step and return isolate failure without skipping its sibling', async () => {
  const calls = [];
  const f = fixture([() => ({
    next() { calls.push('failed-step'); throw new Error('controlled-step-failure'); },
    return() { calls.push('closed'); throw new Error('controlled-finalizer-failure'); },
  }), () => calls.push('sibling')]);
  const result = await flush(f.cook({ id: 'ceres' }, 7), f.frames);
  assert.equal(result.skipped, false);
  assert.deepEqual(calls, ['failed-step', 'closed', 'sibling']);
  assert.deepEqual(f.marks, ['hold', 'freeze', 'release']);
});

test('throwing presentation finalizer preserves the original context-loss rejection', async () => {
  const f = fixture();
  let contextReads = 0, closed = 0;
  f.values.collectMeshPresentationEntitiesChunked = () => ({
    next: () => ({ done: false }),
    return() { closed++; throw new Error('controlled-collect-finalizer-failure'); },
  });
  f.values.renderer.getContext = () => ({ flush() {}, isContextLost: () => ++contextReads > 1 });
  await assert.rejects(flush(f.cook({ id: 'ceres' }, 7), f.frames), /webgl-context-lost-during-live-sector-cook/);
  assert.equal(closed, 1);
});
