import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { prepareAuthoredVisualPipelines, isInitialAuthoredCompositionEntity } from '../src/render/partsLibrary.js';
import { openingPreparedLeafKey, openingAdmissionSubjects, applyFirstPlayablePaintRelease,
  enqueueMissingMeshBuildsSteps, render as renderSystem } from '../src/render/renderer.js';
import { admitOpeningUnitsAcrossSlices, touchSubjectOnExactTarget } from '../src/render/openingGpuAdmission.js';
import { collectFirstFlightLayerDrawables } from '../src/render/latePipelineAdmission.js';
import { revealSubjectForCompile, revealSubjectWithAncestors } from '../src/render/compilePresentSlice.js';
import { createGasSystem } from '../src/render/combat/gas/gasVolumeField.js';
import {
  createOpeningLoadingAdmission, waitForOpeningFirstPicture, holdOpeningPresentationUntilPaint,
  openingFirstPictureIsReady,
} from '../src/render/pipelineReadiness.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function loadingOwnerFixture() {
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: 1205, z: -378 }, data: { defId: 'ship_kestrel' } };
  const spindle = { id: 373, type: 'payload', alive: true,
    pos: { x: -46, z: 278 }, data: { scenarioActorId: 'evidence_spindle_47a',
      assetRef: 'asset.slice.47a_spindle', packagedPropFile: 'pods/pod_47a_evidence_spindle.glb',
      packagedPropSlot: 'pod' } };
  const pelican = { id: 534, type: 'ship', alive: true,
    pos: { x: 1152, z: -411 }, data: { defId: 'ship_pelican' } };
  const distant = { ...spindle, id: 900, pos: { x: -10000, z: 0 } };
  const state = { mode: 'loading', playerId: 1, simTime: 131,
    entityList: [player, spindle, pelican, distant],
    entities: new Map([[1, player], [373, spindle], [534, pelican], [900, distant]]),
    camera: { zoom: 144, liveZoom: 528, fov: 50, aspect: 1.88, tilt: 60 },
    world: { currentSectorId: 'sector_helios_prime', enterSerial: 1 },
    render: { admissionRunGeneration: 1, renderer: {} }, contextRestoreSeq: 0 };
  const built = [];
  const owner = { state, _meshes: new Map(), _meshBuildQueuedIds: new Set(), _meshBuildQueue: [],
    _meshBuildQueueHead: 0, _sessionLiveSectorCookedId: 'sector_helios_prime',
    _frameMembrane: { toLocal(pos, out) { out.x = pos.x; out.z = pos.z; return out; } },
    *_drainMeshBuildQueueSteps() {
      const id = this._meshBuildQueue[this._meshBuildQueueHead++];
      this._meshBuildQueuedIds.delete(id);
      const entity = state.entities.get(id);
      const mesh = new THREE.Group(); mesh.userData.authoredAssetState = 'authored';
      entity.mesh = mesh; this._meshes.set(id, mesh); built.push(id);
    },
  };
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const start = source.indexOf('state.render.beginOpeningLoadingAdmission = () => {');
  const end = source.indexOf('const openingCohort = createOpeningAdmissionCohort();', start);
  assert.ok(start > 0 && end > start, 'the real opening admission owner exists');
  new Function('state', 'cam', 'THREE', 'openingSubmissionCamera', '_meshLocalXZ',
    'rendererGenerationIsActive', 'releaseOpeningGraphPublication', 'createOpeningLoadingAdmission',
    'enqueueMissingMeshBuildsSteps', 'observePipelineAdmission', 'yieldToBrowser',
    'entityVisualCullRadius', 'isInitialAuthoredCompositionEntity', source.slice(start, end))
    .call(owner, state, { obj: { updateMatrixWorld() {} } }, THREE,
      () => ({ frustum: { intersectsSphere: () => false } }), {}, () => true, () => {},
      createOpeningLoadingAdmission, enqueueMissingMeshBuildsSteps, promise => promise,
      () => Promise.resolve(), () => 1, isInitialAuthoredCompositionEntity);
  let loadingListener;
  const listenerStart = source.indexOf("onBus('mode:changed', ({ mode } = {}) => {");
  const listenerEnd = source.indexOf("onBus('jump:arrive'", listenerStart);
  new Function('onBus', 'state', 'vf', 'serviceFaultEpoch', 'mintResidentReattachSweep',
    'resumeAuthoredUpgradeQueueForLoadingHulls', source.slice(listenerStart, listenerEnd))
    .call(owner, (_event, listener) => { loadingListener = listener; }, state,
      { clearReadyPackagedBodies() {} }, () => 'fixture', () => {}, () => {});
  return { state, owner, player, spindle, pelican, distant, built, loadingListener };
}

test('loading cohort schedules valid runway actors outside the camera before the authored gate', async () => {
  const { state, owner, spindle, pelican, distant, built } = loadingOwnerFixture();
  assert.equal(isInitialAuthoredCompositionEntity(spindle, state), true,
    'the reproduced payload lies in the legitimate startup runway');
  await state.render.beginOpeningLoadingAdmission();
  assert.equal(owner._openingLoadingAdmission.owns(spindle), true,
    'the off-table evidence spindle owns a real required admission');
  assert.equal(owner._openingLoadingAdmission.owns(pelican), true,
    'restored opening traffic receives its missing build too');
  assert.equal(owner._openingLoadingAdmission.owns(distant), false,
    'the startup runway does not widen to the whole scenario catalog');
  assert.deepEqual(new Set(built), new Set([1, 373, 534]));
});

test('delayed loading acknowledgement preserves the cohort that already owns this restore', async () => {
  const { state, owner, loadingListener } = loadingOwnerFixture();
  await state.render.beginOpeningLoadingAdmission();
  const cohort = owner._openingLoadingAdmission;
  const ready = owner._openingLoadingMeshesReady;
  loadingListener({ mode: 'loading' });
  assert.equal(owner._openingLoadingAdmission, cohort,
    'the worker MODE acknowledgement must not retire the finite restore cohort');
  assert.equal(owner._openingLoadingMeshesReady, ready);
  state.render.admissionRunGeneration++;
  loadingListener({ mode: 'loading' });
  assert.equal(owner._openingLoadingAdmission, null, 'a new generation still resets the old owner');
  assert.equal(owner._openingLoadingMeshesReady, null);
});

test('another restore with the same player id still retires the prior cohort', async () => {
  const { state, owner, player, loadingListener } = loadingOwnerFixture();
  await state.render.beginOpeningLoadingAdmission();
  const replacement = { ...player };
  state.entities.set(player.id, replacement);
  state.entityList[0] = replacement;
  loadingListener({ mode: 'loading' });
  assert.equal(owner._openingLoadingAdmission, null,
    'an id reused by a different entity reference is a new restore owner');
  assert.equal(owner._openingLoadingMeshesReady, null);
});

function strictTouchFixture(scene, drawn, reveal = revealSubjectWithAncestors) {
  const camera = new THREE.PerspectiveCamera();
  const renderer = { autoClear: true, getRenderTarget: () => null, setRenderTarget() {},
    render() {
      scene.traverseVisible((object) => {
        if (!object.isMesh) return;
        assert.ok(object.geometry, `the native geometry read must be safe for ${object.name}`);
        drawn.push(object.name);
      });
    },
  };
  return (subjects) => admitOpeningUnitsAcrossSlices({
    subjects, strict: true,
    beginReadinessBatch: () => ({ drain: async () => ({ contextLost: false }), close() {} }),
    compileOne: async () => ({ compiled: true }),
    touchOne(subject) {
      const restore = reveal(subject);
      try { return touchSubjectOnExactTarget(renderer, null, subject, camera, scene); }
      finally { restore(); }
    },
  });
}

test('strict extra-pool admission excludes hidden fallbacks and retired warms while drawing dormant real pools', async () => {
  const scene = new THREE.Scene();
  const pool = new THREE.Group(); pool.visible = false; scene.add(pool);
  const dormant = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2);
  dormant.name = 'dormant-live-pool'; dormant.count = 0; pool.add(dormant);
  const fallback = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  fallback.name = 'never-drawn-fallback'; fallback.visible = false;
  fallback.userData.authoredReadableFallbackLayer = true; pool.add(fallback);
  const warmRoot = new THREE.Group(); warmRoot.userData.rosterPrewarm = 'bounded'; scene.add(warmRoot);
  const warm = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); warmRoot.add(warm);
  const retired = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  retired.geometry = null; scene.add(retired);
  const detached = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const extras = collectFirstFlightLayerDrawables([pool, warmRoot]).concat(retired, detached);
  assert.ok(extras.includes(fallback), 'the broad layer census includes the never-drawn fallback');
  assert.ok(fallback.geometry, 'the overloaded error can report null-geometry with a real geometry');
  await assert.rejects(strictTouchFixture(scene, [], revealSubjectForCompile)([fallback]), /null-geometry/,
    'this reproduces the native strict admission failure with the production reveal and touch helpers');
  const admitted = openingAdmissionSubjects([], extras, scene);
  assert.deepEqual(admitted, [dormant]);
  const drawn = [];
  await strictTouchFixture(scene, drawn)(admitted);
  assert.deepEqual(drawn, ['dormant-live-pool'], 'the hidden emitter ancestor is revealed for a real draw');
  assert.equal(pool.visible, false);
  assert.equal(dormant.count, 0, 'warm count and graph visibility are restored');
});

test('filtering optional pooled extras cannot forgive a required leaf that loses its geometry', async () => {
  const scene = new THREE.Scene();
  const required = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  required.name = 'required-visible-hull'; scene.add(required); required.geometry = null;
  const subjects = openingAdmissionSubjects([required], [required], scene);
  assert.deepEqual(subjects, [required], 'required identity is retained even when invalid');
  await assert.rejects(strictTouchFixture(scene, [])(subjects), /null-geometry/);
});

test('mobile opening admits only the actual dormant gas pool alongside required picture leaves', t => {
  const scene = new THREE.Scene();
  const gas = createGasSystem(scene);
  t.after(() => gas.dispose());
  const hull = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  scene.add(hull);
  const otherPool = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4);
  otherPool.count = 0; otherPool.visible = false; scene.add(otherPool);
  const subjects = collectFirstFlightLayerDrawables([gas.mesh, otherPool]);
  const mobile = { mobileFirstPicture: true };
  assert.deepEqual(openingAdmissionSubjects([hull], subjects, scene, mobile), [hull, gas.mesh]);
  assert.deepEqual(openingAdmissionSubjects([hull], subjects, scene), [hull, gas.mesh, otherPool],
    'desktop/arena cohort semantics remain unchanged');
  assert.equal(gas.mesh.count, 0);
  assert.equal(gas.mesh.visible, false, 'selecting the pool never emits or reveals gas');
  gas.mesh.removeFromParent();
  assert.deepEqual(openingAdmissionSubjects([hull], subjects, scene, mobile), [hull],
    'a detached gas owner cannot become an opening draw');
});

function gasOpeningFixture(t) {
  const scene = new THREE.Scene();
  const gas = createGasSystem(scene);
  t.after(() => gas.dispose());
  const camera = new THREE.PerspectiveCamera();
  const hdrTarget = { name: 'gameplay-bloom-scene-target' };
  const priorTarget = { name: 'prior-target' };
  let target = priorTarget;
  let active = true;
  let cancelDuringDrain = false;
  let rejectCompile = false;
  let ready = false;
  let closed = false;
  const bindings = new Map();
  const events = [];
  const material = gas.mesh.material;
  const density = material.uniforms.uDensityFilm.value;
  const motion = material.uniforms.uMotionField.value;
  const renderer = {
    autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: value => { target = value; },
    properties: { get: value => bindings.get(value) || {} },
    render(drawScene, drawCamera) {
      assert.equal(target, hdrTarget, 'the real pool is touched on the exact gameplay HDR target');
      assert.equal(drawScene, scene);
      assert.equal(drawCamera, camera);
      drawScene.traverseVisible(object => {
        if (!object.isMesh) return;
        assert.equal(object, gas.mesh);
        assert.equal(object.material, material, 'compile and touch use the current live material');
        assert.equal(renderer.properties.get(material).currentProgram?.isReady(), true,
          'the binding must finish its readiness drain before drawing');
        assert.equal(object.material.uniforms.uDensityFilm.value, density);
        assert.equal(object.material.uniforms.uMotionField.value, motion);
        assert.ok(object.count > 0, 'the hidden count-zero pool issues an actual warm draw');
        events.push('draw');
      });
    },
  };
  const revealed = run => {
    const restore = revealSubjectWithAncestors(gas.mesh);
    try { return run(); } finally { restore(); }
  };
  const admit = () => admitOpeningUnitsAcrossSlices({
    subjects: openingAdmissionSubjects([], [gas.mesh], scene, { mobileFirstPicture: true }),
    strict: true,
    isActive: () => active,
    beginReadinessBatch: () => ({
      submit: async (work, owner) => owner.isActive()
        ? work() : { skipped: true, reason: 'owner-inactive' },
      async drain() {
        events.push('drain'); ready = true;
        if (cancelDuringDrain) active = false;
        return { contextLost: false };
      },
      close() { closed = true; },
    }),
    compileOne(subject) {
      assert.equal(subject, gas.mesh);
      if (rejectCompile) return Promise.reject(new Error('gas compile failed'));
      return revealed(() => {
        events.push('compile');
        bindings.set(material, { currentProgram: { isReady: () => ready } });
        return { compiled: true };
      });
    },
    touchOne: () => revealed(() => touchSubjectOnExactTarget(renderer, hdrTarget, gas.mesh, camera, scene)),
  });
  return { gas, renderer, admit, events, priorTarget, bindings,
    cancel: () => { active = false; }, rejectCompile: () => { rejectCompile = true; },
    cancelDuringDrain: () => { cancelDuringDrain = true; },
    isClosed: () => closed };
}

test('live gas opening compile drains before exact-target draw and restores its empty state', async t => {
  const f = gasOpeningFixture(t);
  const result = await f.admit();
  assert.equal(result.materials, 1);
  assert.equal(result.geometries, 1);
  assert.deepEqual(f.events, ['compile', 'drain', 'draw']);
  assert.equal(f.isClosed(), true);
  assert.equal(f.gas.mesh.visible, false);
  assert.equal(f.gas.mesh.count, 0);
  assert.equal(f.gas.liveCount, 0, 'warming never creates a cosmetic body');
  assert.equal(f.renderer.getRenderTarget(), f.priorTarget);
});

test('stale or rejected gas admission cannot draw or claim a prepared material', async t => {
  for (const failure of ['stale', 'late-stale', 'compile']) {
    const f = gasOpeningFixture(t);
    if (failure === 'stale') f.cancel();
    else if (failure === 'late-stale') f.cancelDuringDrain();
    else f.rejectCompile();
    await assert.rejects(f.admit(), failure === 'compile' ? /gas compile failed/ : /owner-inactive/);
    assert.equal(f.events.includes('draw'), false);
    assert.equal(f.bindings.size, failure === 'late-stale' ? 1 : 0,
      'cancelled compiles may finish, but cannot authorize a warm draw');
    assert.equal(f.isClosed(), true);
    assert.equal(f.gas.mesh.visible, false);
    assert.equal(f.gas.mesh.count, 0);
  }
});

function fixture(overrides = {}) {
  const calls = [];
  const state = { mode: 'loading', world: { currentSectorId: 'helios', enterSerial: 1 },
    render: { admissionRunGeneration: 1,
      beginOpeningLoadingAdmission: async () => { calls.push('begin'); },
      prepareOpeningFirstPicture: async () => { calls.push('seal'); return true; },
      captureOpeningSubmissionPlan: () => {
        calls.push('capture'); return { complete: true, firstPlayablePipelineSet: { complete: true } };
      },
      drainOpeningSubmissionPlan: async (_plan, options) => {
        assert.equal(options.strict, true); assert.equal(options.isActive(), true);
        calls.push('submission'); return { ok: true };
      },
      prepareOpeningGpuResources: async (options) => {
        assert.equal(options.required, true); assert.equal(options.isActive(), true);
        calls.push('resources'); return { skipped: false };
      }, ...overrides,
    } };
  return { state, calls };
}

test('loading snapshots references and admits an authored subject while another is still preparing', async () => {
  const a = { id: 1 }, b = { id: 2 };
  const entities = [a, b];
  const cohort = createOpeningLoadingAdmission({ entities, isRequired: () => true });
  entities.push({ id: 3 });
  assert.equal(cohort.owns({ id: 1 }), false, 'a reused id is another owner');
  assert.equal(cohort.owns(entities[2]), false, 'later spawns cannot extend launch');
  const remaining = deferred();
  cohort.track(remaining.promise);
  const order = [];
  const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  await cohort.track(prepareAuthoredVisualPipelines(root, {
    prepareAuthoredPipelines: async () => { order.push('compile:a'); return { compiled: true }; },
    prepareAuthoredGpuResidency: async () => { order.push('upload:a'); return { uploaded: true }; },
    isResidencyOwnerActive: () => true,
  }));
  let ready = false;
  const drain = cohort.drain().then(() => { ready = true; });
  await flush();
  assert.deepEqual(order, ['compile:a', 'upload:a']);
  assert.equal(ready, false, 'the completed subject overlaps the remaining required subject');
  remaining.resolve(); await drain;
});

test('a required GPU rejection survives a boundary catching its own error', async () => {
  const cohort = createOpeningLoadingAdmission();
  const failure = new Error('ship_kestrel texture missing');
  await cohort.track(Promise.reject(failure)).catch(() => {});
  await assert.rejects(cohort.drain(), /ship_kestrel texture missing/);
});

test('New Game and Continue callers join one exact sequence and acceptance follows resources', async () => {
  const resources = deferred();
  const { state, calls } = fixture({ prepareOpeningGpuResources: () => resources.promise });
  const first = waitForOpeningFirstPicture(state, 1000);
  const second = waitForOpeningFirstPicture(state, 1000);
  assert.equal(first, second);
  await flush();
  assert.equal(state.render.openingFirstPictureReady, undefined);
  assert.deepEqual(calls, ['begin', 'seal', 'capture', 'submission']);
  resources.resolve({ skipped: false });
  assert.equal(await first, true);
  assert.equal(state.render.requiredPackageAdmission.status, 'accepted');
  assert.equal(state.render.openingFirstPictureReady, true);
  assert.equal(openingFirstPictureIsReady(state), true);
});

test('launch joins the current-sector cook before sealing the exact picture', async () => {
  const cook = deferred();
  const { state, calls } = fixture({ openingLiveSectorReady: cook.promise });
  const first = waitForOpeningFirstPicture(state, 1000);
  assert.equal(waitForOpeningFirstPicture(state, 1000), first);
  await flush();
  assert.deepEqual(calls, ['begin'], 'no exact plan is sealed while imminent-sector work is pending');
  cook.resolve({ skipped: false, opening: { settled: true } });
  assert.equal(await first, true);
  assert.deepEqual(calls, ['begin', 'seal', 'capture', 'submission', 'resources']);
});

test('a failed or cancelled current-sector cook never authorizes the exact picture', async () => {
  for (const result of [false, { partial: true }, { reason: 'sector-superseded' },
    { cook: { reason: 'sector-superseded' } }, { opening: { settled: false } }]) {
    const { state, calls } = fixture({ openingLiveSectorReady: Promise.resolve(result) });
    await assert.rejects(waitForOpeningFirstPicture(state, 1000), /current-sector preparation did not complete/);
    assert.deepEqual(calls, ['begin']);
    assert.notEqual(state.render.openingFirstPictureReady, true);
  }
});

test('the current-sector wait remains bounded and cannot submit after its deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cook = deferred();
  const { state, calls } = fixture({ openingLiveSectorReady: cook.promise });
  const first = waitForOpeningFirstPicture(state, 20, { presentBudgetMs: 20 });
  const rejected = assert.rejects(first, /timed out at current-sector/);
  await flush(); t.mock.timers.tick(20); await rejected;
  cook.resolve({ skipped: false }); await flush();
  assert.deepEqual(calls, ['begin']);
  assert.notEqual(state.render.openingFirstPictureReady, true);
  assert.equal(state.render.openingFirstPicturePhase.stage, 'current-sector');
  assert.equal(state.render.openingFirstPicturePhase.outcome, 'timeout');
  assert.ok(state.render.openingCookLedger.some(row => row.step === 'exact.current-sector' && row.outcome === 'timeout'));
});

test('sector preparation keeps its existing bounded envelope and cannot consume the exact-picture window', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cook = deferred(), seal = deferred();
  const { state, calls } = fixture({ prepareLiveSectorBeforeFlight: () => cook.promise,
    prepareOpeningFirstPicture: () => seal.promise });
  const ready = waitForOpeningFirstPicture(state, 20);
  const rejected = assert.rejects(ready, /timed out at seal/);
  await flush();
  assert.equal(state.render.openingFirstPicturePhase.budgetMs, 120000,
    'the sector owner retains its established ordinary-route ceiling');
  t.mock.timers.tick(30); await flush();
  assert.equal(state.render.openingFirstPicturePhase.outcome, 'pending');
  cook.resolve({ skipped: false }); await flush();
  assert.equal(state.render.openingFirstPicturePhase.stage, 'seal');
  assert.equal(state.render.openingFirstPicturePhase.budgetMs, 20, 'the exact window starts after the sector settles');
  t.mock.timers.tick(20); await rejected;
  seal.resolve(true); await flush();
  assert.deepEqual(calls, ['begin'], 'a late seal cannot capture or submit');
});

function livePictureBarrier(owner) {
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const start = source.indexOf('if (ownsFirstPictureBarrier) {');
  const end = source.indexOf('// PQ-210.00 — a roster-prewarm exemplar', start);
  assert.ok(start > 0 && end > start);
  return new Function('state', 'remainingMs', 'cookStale', 'cookSuperseded', 'survivalRunHoldsArena',
    `return (async () => { let firstPictureError = null; const ownsFirstPictureBarrier = true;
      ${source.slice(start, end)} return firstPictureError; })();`)
    .call(owner, owner.state, () => 400, () => false, {}, () => false);
}

function pendingPictureOwner() {
  const work = deferred(); let pending = true;
  const state = { mode: 'loading', world: { enterSerial: 1 }, render: { admissionRunGeneration: 1 } };
  const owner = Object.assign(Object.create(renderSystem), { state, scene: new THREE.Scene(),
    *_publishOpeningFirstPictureSteps() { return true; },
    *_openingFirstPictureUpgradePromisesSteps() { return pending ? [work.promise] : []; },
    _bakeEnv() {},
  });
  return { owner, complete() { pending = false; work.resolve(); } };
}

test('the real live-sector handover gives required batch preparation its existing picture window', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { owner, complete } = pendingPictureOwner();
  let settled = false;
  const barrier = livePictureBarrier(owner).then(result => { settled = true; return result; });
  await flush(); await flush();
  now = 400; t.mock.timers.tick(400); await flush();
  assert.equal(settled, false, 'the exhausted broad-cook residual must not expire required picture work');
  now = 1000; complete();
  assert.equal(await barrier, null);
  assert.equal(owner._openingFirstPicturePrepared, true);
});

test('the real picture window still expires and its pool-census owner propagates the failure', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { owner } = pendingPictureOwner();
  const barrier = livePictureBarrier(owner);
  await flush(); await flush();
  now = 20000; t.mock.timers.tick(20000);
  const error = await barrier;
  assert.match(error, /opening first-picture preparation timed out/);
  assert.notEqual(owner._openingFirstPicturePrepared, true);
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const start = source.indexOf("recordOpeningCookStep(state.render, 'live.firstFramePoolCensus'");
  const end = source.indexOf('\n      }\n      // Final ambient seal:', start);
  assert.ok(start > 0 && end > start);
  const finish = new Function('state', 'recordOpeningCookStep', 'censusStarted', 'firstPictureError',
    'firstFrameResidency', source.slice(start, end));
  assert.throws(() => finish(owner.state, () => {}, 0, error, { skipped: false }), /preparation timed out/);
});

test('final live-sector handover replaces only stale composition samples with a fresh owner verdict', async () => {
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const start = source.indexOf('let finalOpening = opening;');
  const end = source.indexOf('\n      } finally {', start);
  assert.ok(start > 0 && end > start);
  for (const fresh of [{ settled: true, pending: 0 },
    { settled: false, pending: 1, reason: 'unstartable' },
    { settled: false, pending: 1, reason: 'timeout' }]) {
    const initial = { settled: false, pending: 3, reason: 'timeout' };
    const state = { render: { openingCookLedger: [{ step: 'live.openingComposition', outcome: 'timeout' }] } };
    const owner = { _meshes: new Map() }, rows = [];
    const env = { state, opening: initial, recook: false, sectorId: 'helios',
      resumed: null, upgrades: null, pending: null, cook: null, leftover: null,
      renderer: {}, scene: {}, cookSuperseded: {}, cookStale: () => false,
      remainingMs: () => 400, prepareNow: () => 0, yieldAndFlushLiveSectorGpu: async () => {},
      waitForOpeningCompositionSettled: async (_state, options) => {
        assert.equal(options.timeoutMs, 400); assert.equal(options.meshes, owner._meshes); return fresh;
      }, recordOpeningCookStep: (...row) => rows.push(row),
    };
    const result = await new Function('env', `with (env) { return (async () => { ${source.slice(start, end)} })(); }`)
      .call(owner, env);
    assert.equal(result.opening, fresh);
    assert.equal(state.render.openingCompositionSettle, fresh);
    assert.equal(initial.settled, false, 'the earlier diagnostic sample remains truthful');
    assert.equal(state.render.openingCookLedger[0].outcome, 'timeout');
    assert.equal(rows[0][1], 'live.openingCompositionFinal');
    assert.equal(owner._sessionLiveSectorCookedId, fresh.settled ? 'helios' : undefined);
  }
});

test('an exact-picture timeout names the active resource phase and retains earlier timings', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const residency = deferred();
  const { state } = fixture({ prepareOpeningGpuResources: () => residency.promise });
  const ready = waitForOpeningFirstPicture(state, 20);
  const rejected = assert.rejects(ready, /timed out at residency/);
  await flush(); t.mock.timers.tick(20); await rejected;
  assert.deepEqual(state.render.openingCookLedger.filter(row => row.step.startsWith('exact.'))
    .map(row => [row.step, row.outcome]), [
    ['exact.mesh-staging', 'resolved'], ['exact.seal', 'resolved'], ['exact.capture', 'resolved'],
    ['exact.submission', 'resolved'], ['exact.residency', 'timeout'],
  ]);
  residency.resolve({ skipped: false }); await flush();
  assert.notEqual(state.render.openingFirstPictureReady, true);
});

test('a completed picture cannot authorize a different context, sector, run or renderer', async () => {
  for (const replace of [
    (state) => { state.contextRestoreSeq = 1; },
    (state) => { state.render.contextLost = true; },
    (state) => { state.render.contextRecovery = { pending: true }; },
    (state) => { state.world.enterSerial++; },
    (state) => { state.world.currentSectorId = 'another-sector'; },
    (state) => { state.world = { ...state.world }; },
    (state) => { state.render.admissionRunGeneration++; },
    (state) => { state.render.renderer = {}; },
  ]) {
    const { state } = fixture();
    await waitForOpeningFirstPicture(state, 1000);
    assert.equal(openingFirstPictureIsReady(state), true);
    replace(state);
    assert.equal(openingFirstPictureIsReady(state), false);
  }
});

test('incomplete plans, partial residency and failed resources cannot accept flight', async () => {
  for (const override of [
    { captureOpeningSubmissionPlan: () => ({ complete: false }) },
    { prepareOpeningGpuResources: async () => ({ skipped: true, reason: 'loading-budget' }) },
    { prepareOpeningGpuResources: async () => ({ skipped: false, partial: true }) },
    { prepareOpeningGpuResources: async () => { throw new Error('required ship.glb missing'); } },
  ]) {
    const { state } = fixture(override);
    await assert.rejects(waitForOpeningFirstPicture(state, 1000), /incomplete|loading-budget|did not complete|ship.glb missing/);
    assert.notEqual(state.render.requiredPackageAdmission?.status, 'accepted');
    assert.notEqual(state.render.openingFirstPictureReady, true);
  }
});

test('a bounded readiness deadline stops late submission without authorizing flight', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const seal = deferred();
  const { state, calls } = fixture({ prepareOpeningFirstPicture: () => seal.promise });
  const ready = waitForOpeningFirstPicture(state, 20);
  const rejected = assert.rejects(ready, /timed out/);
  await flush(); t.mock.timers.tick(20); await rejected;
  seal.resolve(true); await flush();
  assert.equal(calls.includes('submission'), false);
  assert.notEqual(state.render.openingFirstPictureReady, true);
});

test('world, generation and context replacement discard stale completions', async () => {
  for (const replace of [
    (state) => { state.world = { ...state.world }; },
    (state) => { state.render.admissionRunGeneration++; },
    (state) => { state.contextRestoreSeq = 1; },
  ]) {
    const seal = deferred();
    const { state, calls } = fixture({ prepareOpeningFirstPicture: () => seal.promise });
    const old = waitForOpeningFirstPicture(state, 1000);
    const rejected = assert.rejects(old, /superseded/);
    await flush(); replace(state); seal.resolve(true); await rejected;
    assert.equal(calls.includes('submission'), false);
    assert.notEqual(state.render.openingFirstPictureReady, true);
  }
});

test('the exact delta key invalidates material, texture, geometry and context changes', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() }));
  let key = openingPreparedLeafKey(mesh, 'context:1');
  assert.equal(openingPreparedLeafKey(mesh, 'context:1'), key);
  for (const mutate of [
    () => { mesh.material.needsUpdate = true; },
    () => { mesh.material.map.needsUpdate = true; },
    () => { mesh.geometry.attributes.position.needsUpdate = true; },
    () => { mesh.geometry.setAttribute('position', mesh.geometry.attributes.position.clone()); },
    () => { mesh.geometry = new THREE.BoxGeometry(); },
  ]) {
    mutate(); const next = openingPreparedLeafKey(mesh, 'context:1');
    assert.notEqual(next, key); key = next;
  }
  assert.notEqual(openingPreparedLeafKey(mesh, 'context:2'), key);
});

test('actual paint releases only the main hold and preserves pause or worker slow time', () => {
  const state = { mode: 'flight', timeScale: 1, world: {}, render: { admissionRunGeneration: 1, worldSubmittedFrames: 0 } };
  const effects = createTimeEffects(state);
  effects.set('bullet-time', { scale: .35 });
  effects.set('runtime:pause', { scale: 0 });
  let scheduled;
  holdOpeningPresentationUntilPaint(state, effects, assert.fail, {
    schedule: (callback) => { scheduled = callback; return 1; }, cancel() { scheduled = null; },
  });
  assert.equal(state.render.releaseOpeningPresentationHold(), false);
  assert.equal(effects.describeRequests()['runtime:first-picture'].scale, 0);
  state.render.worldSubmittedFrames = 1;
  applyFirstPlayablePaintRelease({ state });
  assert.equal(effects.describeRequests()['runtime:first-picture'], undefined);
  assert.equal(state.timeScale, 0);
  effects.clear('runtime:pause'); assert.equal(state.timeScale, .35);
  assert.equal(scheduled, null);
});

test('a completed exact first picture preserves the existing optional handoff hold', async () => {
  const { state } = fixture();
  await waitForOpeningFirstPicture(state, 1000);
  state.mode = 'flight';
  const resumeCalls = [];
  state.render.resumeDeferredPipelineAdmissions = (...options) => { resumeCalls.push(options); };
  const owner = { state, _openingLoadingAdmission: {}, _openingPreparedLeaves: new WeakMap() };
  applyFirstPlayablePaintRelease(owner);
  assert.deepEqual(resumeCalls, [[]], 'the existing hold is consulted without a force override');
  assert.notEqual(owner._postOpeningPipelineAdmissionReleased, true);
  assert.equal(owner._openingLoadingAdmission, null);
});

test('an old paint cannot release a replacement launch, and a missing picture fails recoverably', () => {
  const state = { mode: 'flight', timeScale: 1, world: {}, render: { admissionRunGeneration: 1, worldSubmittedFrames: 0 } };
  const effects = createTimeEffects(state);
  const timers = [];
  const options = { schedule: (callback) => { timers.push(callback); return timers.length; }, cancel() {} };
  holdOpeningPresentationUntilPaint(state, effects, assert.fail, options);
  const oldRelease = state.render.releaseOpeningPresentationHold;
  state.render.admissionRunGeneration++;
  let failure;
  holdOpeningPresentationUntilPaint(state, effects, (error) => { failure = error; }, options);
  state.render.worldSubmittedFrames++;
  assert.equal(oldRelease(), false); assert.equal(state.timeScale, 0);
  timers[1]();
  assert.match(failure.message, /Retry Launch/);
  assert.equal(state.timeScale, 1);
});

test('explicit cancellation retires its stale generation/world without clearing a replacement hold', () => {
  for (const replace of [
    (state) => { state.render.admissionRunGeneration++; },
    (state) => { state.world = {}; },
    (state) => { state.render = { admissionRunGeneration: 2, worldSubmittedFrames: 0 }; },
  ]) {
    const state = { mode: 'flight', timeScale: 1, world: {}, render: { admissionRunGeneration: 1 } };
    const effects = createTimeEffects(state);
    const options = { schedule: () => 1, cancel() {} };
    const oldRender = state.render;
    const cancelOld = holdOpeningPresentationUntilPaint(state, effects, assert.fail, options);
    replace(state); cancelOld();
    assert.equal(effects.describeRequests()['runtime:first-picture'], undefined);
    assert.equal(oldRender.releaseOpeningPresentationHold, null);
    holdOpeningPresentationUntilPaint(state, effects, assert.fail, options);
    cancelOld();
    assert.equal(effects.describeRequests()['runtime:first-picture'].scale, 0);
    state.render.cancelOpeningPresentationHold();
  }
});
