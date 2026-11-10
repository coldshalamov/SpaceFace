import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import * as THREE from 'three';

import { AUTHORED_ASYNC_DEADLINE_MS, createAsyncAdmission } from '../src/render/asyncAdmission.js';
import { createDecodeTaskBudget, sharedDecodeTaskBudget } from '../src/render/decodeTaskBudget.js';
import {
  ASSET_RUNTIME_DECODER_CONTRACT,
  admitAuthoredAssetTask,
  configureCspSafeKtx2Loader,
  createAuthoredAssetRuntimeRegistry,
  loadAuthoredRenderPackagePilot,
  retireAuthoredAssetRuntime,
} from '../src/render/assetLoader.js';
import {
  createRenderPackageLoader,
  disposeDecodedResources,
  startMeshoptWorkerPool,
} from '../src/render/renderPackageLoader.js';
import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';
import { revealSubjectForCompile } from '../src/render/compilePresentSlice.js';
import {
  RENDER_PACKAGE_SCHEMA,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
  renderPackageContentIdentity,
  stableJsonStringify,
} from '../src/contracts/renderPackage.js';

const never = () => new Promise(() => {});
const flush = () => new Promise((resolve) => queueMicrotask(resolve));

function fakeTimerQueue() {
  const timers = [];
  return {
    timers,
    setTimer(fn, ms) {
      const timer = { fn, ms: Number(ms) || 0, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) { if (timer) timer.cleared = true; },
    fireWhere(ms) {
      for (const timer of timers.splice(0)) {
        if (!timer.cleared && timer.ms === ms) timer.fn();
        else timers.push(timer);
      }
    },
    fireAll() {
      for (const timer of timers.splice(0)) if (!timer.cleared) timer.fn();
    },
    pending() { return timers.filter((timer) => !timer.cleared).length; },
  };
}

function rejectedFields(promise) {
  return promise.then(() => ({ resolved: true }), (error) => ({ resolved: false, error }));
}

test('an admission wait settles wedged work at its deadline', async () => {
  const clock = fakeTimerQueue();
  const admission = createAsyncAdmission({
    label: 'wedged-decode',
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  const outcome = rejectedFields(admission.wait(never()));
  clock.fireWhere(AUTHORED_ASYNC_DEADLINE_MS);
  const { resolved, error } = await outcome;
  assert.equal(resolved, false);
  assert.equal(error.name, 'TimeoutError');
  assert.equal(error.code, 'AUTHORED_ADMISSION_TIMEOUT');
  assert.match(error.message, /wedged-decode/);
  assert.equal(admission.signal.aborted, true);
  assert.throws(() => admission.assertActive(), error);
  await assert.rejects(admission.wait(Promise.resolve(1)), (later) => later === error);
});

test('abort rejects pending and later waits with an AbortError reason', async () => {
  const clock = fakeTimerQueue();
  const admission = createAsyncAdmission({
    label: 'owner-lifetime',
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  const pending = admission.wait(never());
  admission.abort('boundary owner departed');
  await assert.rejects(pending, (error) => error.name === 'AbortError'
    && /boundary owner departed/.test(error.message));
  await assert.rejects(admission.wait(Promise.resolve(3)), (error) => error.name === 'AbortError');
  assert.equal(clock.pending(), 0, 'the deadline timer is cleared by abort');
});

test('finish clears the deadline without aborting the signal', async () => {
  const clock = fakeTimerQueue();
  const admission = createAsyncAdmission({
    label: 'successful-run',
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  assert.equal(await admission.wait(Promise.resolve(7)), 7);
  admission.finish();
  assert.equal(admission.signal.aborted, false);
  assert.equal(clock.pending(), 0);
  assert.equal(await admission.wait(Promise.resolve(8)), 8,
    'a finished admission still serves work — later LOD callbacks stay live');
  admission.assertActive();
});

test('an admission rejects malformed deadlines and still honors a finite zero', () => {
  const clock = fakeTimerQueue();
  for (const bad of [NaN, Infinity, -Infinity, 'soon', {}, -1]) {
    assert.throws(
      () => createAsyncAdmission({
        timeoutMs: bad,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
      }),
      TypeError,
      String(bad),
    );
  }
  const immediate = createAsyncAdmission({
    label: 'immediate',
    timeoutMs: 0,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  clock.fireWhere(0);
  assert.equal(immediate.signal.aborted, true);
  assert.equal(immediate.signal.reason.code, 'AUTHORED_ADMISSION_TIMEOUT');
});

test('a wait on a dead admission still observes the supplied work rejection', async () => {
  const clock = fakeTimerQueue();
  const admission = createAsyncAdmission({
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  admission.abort('owner retired');
  await assert.rejects(
    admission.wait(Promise.reject(new Error('late worker failure'))),
    (error) => error.name === 'AbortError',
  );
  await flush();
});

test('each wait detaches its abort listener on settle, exactly once', async () => {
  const clock = fakeTimerQueue();
  const additions = [];
  const removals = [];
  const realAdd = AbortSignal.prototype.addEventListener;
  const realRemove = AbortSignal.prototype.removeEventListener;
  AbortSignal.prototype.addEventListener = function (...args) {
    additions.push(this);
    return realAdd.apply(this, args);
  };
  AbortSignal.prototype.removeEventListener = function (...args) {
    removals.push(this);
    return realRemove.apply(this, args);
  };
  try {
    const admission = createAsyncAdmission({
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    let resolveWork;
    const work = new Promise((resolve) => { resolveWork = resolve; });
    const hung = rejectedFields(admission.wait(never()));
    const pending = rejectedFields(admission.wait(work));
    admission.abort('retired');
    await hung;
    await pending;
    assert.equal(additions.filter((s) => s === admission.signal).length, 2,
      'each wait registers exactly one abort listener');
    assert.equal(removals.filter((s) => s === admission.signal).length, 2,
      'each settled wait detaches its listener immediately');
    resolveWork(1);
    await flush();
    assert.equal(removals.filter((s) => s === admission.signal).length, 2,
      'a late work settlement cannot leak or re-detach a listener');
  } finally {
    AbortSignal.prototype.addEventListener = realAdd;
    AbortSignal.prototype.removeEventListener = realRemove;
  }
});

test('an external signal relays abort and detaches on finish', async () => {
  const clock = fakeTimerQueue();
  const parent = new AbortController();
  const admission = createAsyncAdmission({
    label: 'child',
    signal: parent.signal,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  parent.abort(new Error('loader disposed'));
  assert.equal(admission.signal.aborted, true);
  assert.equal(admission.signal.reason.name, 'AbortError');
  assert.equal(clock.pending(), 0);

  const second = new AbortController();
  const finished = createAsyncAdmission({
    signal: second.signal,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  finished.finish();
  second.abort();
  assert.equal(finished.signal.aborted, false,
    'detached external aborts cannot mark a finished admission dead');
});

test('a late rejection of aborted work is observed, not unhandled', async () => {
  const clock = fakeTimerQueue();
  const admission = createAsyncAdmission({
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  let rejectWork;
  const work = new Promise((resolve, reject) => { rejectWork = reject; });
  const outcome = rejectedFields(admission.wait(work));
  admission.abort('retired');
  rejectWork(new Error('inner failed after abort'));
  const { resolved, error } = await outcome;
  assert.equal(resolved, false);
  assert.equal(error.name, 'AbortError');
});

test('decode budget rejects malformed limits instead of parking acquires', () => {
  for (const bad of [0, -2, NaN, Infinity, -Infinity, 'four', null]) {
    assert.throws(() => createDecodeTaskBudget(bad), RangeError, String(bad));
  }
});

test('decode budget keeps FIFO order and idempotent per-lease release', async () => {
  const budget = createDecodeTaskBudget(1);
  const releaseA = await budget.acquire();
  const order = [];
  const b = budget.acquire().then((release) => { order.push('b'); return release; });
  const c = budget.acquire().then((release) => { order.push('c'); return release; });
  assert.equal(budget.queued, 2);
  releaseA();
  releaseA();
  const releaseB = await b;
  assert.deepEqual(order, ['b']);
  assert.equal(budget.queued, 1, 'a second release of the same lease grants no extra token');
  releaseB();
  const releaseC = await c;
  assert.deepEqual(order, ['b', 'c']);
  releaseA();
  assert.equal(budget.inFlight, 1, "a stale lease cannot return another lease's token");
  releaseC();
  assert.equal(budget.inFlight, 0);
  assert.equal(budget.queued, 0);
});

test('decode budget cancels a queued waiter on abort and frees the slot', async () => {
  const budget = createDecodeTaskBudget(1);
  const held = await budget.acquire();
  const controller = new AbortController();
  const queued = budget.acquire({ signal: controller.signal });
  assert.equal(budget.queued, 1);
  controller.abort('decoder retired');
  await assert.rejects(queued, (error) => error.name === 'AbortError');
  assert.equal(budget.queued, 0);
  held();
  assert.equal(budget.inFlight, 0);
  await assert.rejects(
    budget.acquire({ signal: controller.signal }),
    (error) => error.name === 'AbortError',
  );
  const release = await budget.acquire();
  release();
});

function fakeKtx2Loader() {
  const pool = {
    posted: [],
    disposed: 0,
    setWorkerLimit() {},
    setWorkerCreator() {},
    postMessage() {
      const task = { promise: never() };
      pool.posted.push(task);
      return task.promise;
    },
    dispose() { pool.disposed += 1; },
  };
  const loader = {
    transcoderPath: ASSET_RUNTIME_DECODER_CONTRACT.ktx2TranscoderPath,
    workerConfig: {},
    workerPool: pool,
  };
  return { loader, pool };
}

test('KTX2 disposal rejects queued and in-flight pool tasks and returns budget tokens', async () => {
  const budget = createDecodeTaskBudget(1);
  const heldToken = await budget.acquire();
  const queuedLoader = fakeKtx2Loader();
  configureCspSafeKtx2Loader(queuedLoader.loader, {
    decodeBudget: budget,
    fetchImpl: () => never(),
  });
  const queuedTask = queuedLoader.pool.postMessage({ type: 'transcode' });
  assert.equal(budget.queued, 1);
  queuedLoader.loader.dispose();
  await assert.rejects(queuedTask, (error) => error.name === 'AbortError');
  assert.equal(budget.queued, 0);
  assert.equal(queuedLoader.pool.posted.length, 0,
    'a queued task never reaches the worker pool after disposal');
  heldToken();
  assert.equal(budget.inFlight, 0);

  const flightBudget = createDecodeTaskBudget(1);
  const flightLoader = fakeKtx2Loader();
  configureCspSafeKtx2Loader(flightLoader.loader, {
    decodeBudget: flightBudget,
    fetchImpl: () => never(),
  });
  const inFlightTask = flightLoader.pool.postMessage({ type: 'transcode' });
  await flush();
  assert.equal(flightLoader.pool.posted.length, 1);
  flightLoader.loader.dispose();
  await assert.rejects(inFlightTask, (error) => error.name === 'AbortError');
  assert.equal(flightBudget.inFlight, 0,
    'the in-flight token returns exactly once even though the worker never answers');
  flightLoader.loader.dispose();
  assert.equal(flightLoader.pool.disposed, 1);
});

test('a rejected KTX2 transcoder init clears the latch so the next decode retries', async () => {
  const { loader } = fakeKtx2Loader();
  const fetches = [];
  const seenSignals = [];
  let fail = true;
  configureCspSafeKtx2Loader(loader, {
    decodeBudget: createDecodeTaskBudget(2),
    fetchImpl: (url, init) => {
      fetches.push(url);
      seenSignals.push(init && init.signal);
      if (fail) return Promise.reject(new Error('transcoder CDN unreachable'));
      return Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    },
    WorkerImpl: function FakeWorker() { return { postMessage() {}, terminate() {} }; },
  });
  await assert.rejects(loader.init(), /transcoder CDN unreachable/);
  await flush();
  assert.equal(loader.transcoderPending, null);
  fail = false;
  await loader.init();
  assert.equal(fetches.length, 2, 'the retry re-fetches instead of replaying the rejection');
  assert.ok(seenSignals.every((signal) => signal instanceof AbortSignal),
    'every transcoder fetch rides the loader cancellation signal');
  loader.dispose();
  await assert.rejects(loader.init(), /disposed/);
});

test('a stalled KTX2 transcode releases its token at the deadline and admits a later decode', async () => {
  const clock = fakeTimerQueue();
  const budget = createDecodeTaskBudget(1);
  const { loader, pool } = fakeKtx2Loader();
  configureCspSafeKtx2Loader(loader, {
    decodeBudget: budget,
    admissionTimers: { setTimer: clock.setTimer, clearTimer: clock.clearTimer },
  });
  const stalled = rejectedFields(pool.postMessage({ type: 'transcode', spacefaceDecodeClass: 'visible' }));
  await flush();
  assert.equal(pool.posted.length, 1);
  assert.equal(budget.inFlight, 1);
  clock.fireWhere(AUTHORED_ASYNC_DEADLINE_MS);
  assert.equal((await stalled).error.code, 'AUTHORED_ADMISSION_TIMEOUT');
  assert.equal(budget.inFlight, 0);

  const later = rejectedFields(pool.postMessage({ type: 'transcode' }));
  await flush();
  assert.equal(pool.posted.length, 2, 'the abandoned worker cannot pin the only decode slot');
  assert.equal(budget.inFlight, 1);
  loader.dispose();
  assert.equal((await later).error.name, 'AbortError');
  assert.equal(budget.inFlight, 0);
  assert.equal(clock.pending(), 0);
});

function freshRuntime(extra = {}) {
  return { assets: new Map(), failures: new Map(), retiring: false, ...extra };
}

test('a hung authored asset task settles at the deadline and cannot evict a fresh admission', async () => {
  const clock = fakeTimerQueue();
  const runtime = freshRuntime({
    admissionTimers: { setTimer: clock.setTimer, clearTimer: clock.clearTimer },
  });
  let resolveLate;
  const hung = admitAuthoredAssetTask(runtime, 'u::s', () => new Promise((resolve) => {
    resolveLate = resolve;
  }));
  const outcome = rejectedFields(hung);
  clock.fireWhere(AUTHORED_ASYNC_DEADLINE_MS);
  const { resolved, error } = await outcome;
  assert.equal(resolved, false);
  assert.equal(error.code, 'AUTHORED_ADMISSION_TIMEOUT');
  await flush();
  assert.equal(runtime.assets.has('u::s'), false,
    'the expired task evicts itself so the key can re-admit');
  assert.equal(runtime.failures.get('u::s'), error,
    'the deadline verdict is recorded for owner diagnostics');

  const fresh = admitAuthoredAssetTask(runtime, 'u::s', () => Promise.resolve({ ok: true }));
  assert.notStrictEqual(fresh, hung);
  assert.deepEqual(await fresh, { ok: true });
  await flush();
  resolveLate({ stale: true });
  await flush();
  assert.equal(runtime.assets.get('u::s'), fresh,
    'the late-settling expired task cannot evict or overwrite the fresh admission');
  assert.equal(runtime.failures.has('u::s'), false,
    'a healed key clears its recorded failure');
});

test('an authored source URL timeout retains fallback and its late result cannot replace a retry', async () => {
  const clock = fakeTimerQueue();
  const url = 'fixture/outer-timeout.glb';
  const cacheKey = `${url}::hull`;
  const pilot = { metadataUrl: 'fixture/outer-timeout.json' };
  let resolveStale;
  let loadCalls = 0;
  let staleObservers = 0;
  let freshObservers = 0;
  const packageFixture = (contentHash, onStale) => ({
    prepared: { url, report: {} },
    assetId: 'fixture.outer-timeout',
    contentHash,
    residencyKey: `render-package:${contentHash}`,
    retain() { return true; },
    onStale,
  });
  const stale = packageFixture('stale', () => { staleObservers += 1; });
  const fresh = packageFixture('fresh', () => { freshObservers += 1; });
  const runtime = freshRuntime({
    admissionTimers: { setTimer: clock.setTimer, clearTimer: clock.clearTimer },
    renderPackages: {
      load() {
        loadCalls += 1;
        return loadCalls === 1
          ? new Promise((resolve) => { resolveStale = resolve; })
          : Promise.resolve(fresh);
      },
    },
  });
  const options = { slot: 'hull', optional: true };
  const expired = loadAuthoredRenderPackagePilot(runtime, pilot, url, options);
  await flush();
  assert.equal(loadCalls, 1);
  clock.fireWhere(AUTHORED_ASYNC_DEADLINE_MS);
  assert.equal(await expired, null, 'the public asset owner keeps its procedural fallback');
  assert.equal(runtime.failures.get(cacheKey).code, 'AUTHORED_ADMISSION_TIMEOUT');
  assert.equal(runtime.assets.has(cacheKey), false);

  const record = await loadAuthoredRenderPackagePilot(runtime, pilot, url, options);
  const freshTask = runtime.assets.get(cacheKey);
  assert.strictEqual(record.renderPackage, fresh);
  assert.equal(freshObservers, 1);
  resolveStale(stale);
  await flush();
  await flush();
  assert.equal(staleObservers, 0, 'expired work never installs a stale-generation cache invalidator');
  assert.strictEqual(runtime.assets.get(cacheKey), freshTask);
  assert.equal(runtime.failures.has(cacheKey), false);
  assert.equal(clock.pending(), 0);
});

test('authored consumers can cancel independently while another owner finishes the shared decode', async () => {
  for (const useAdmission of [false, true]) {
    const clock = fakeTimerQueue();
    const timerOptions = { setTimer: clock.setTimer, clearTimer: clock.clearTimer };
    const controller = new AbortController();
    const consumerAdmission = useAdmission ? createAsyncAdmission({ signal: controller.signal, ...timerOptions }) : null;
    const canceledOwner = { id: 'departed' };
    const activeOwner = { id: 'visible' };
    const retained = [];
    let resolveDecode;
    let loadCalls = 0;
    let loaderOptions;
    const renderPackage = {
      prepared: { url: 'shared.glb', report: {} },
      assetId: 'fixture.shared-consumers',
      contentHash: 'shared',
      residencyKey: 'render-package:shared',
      retain(owner) { retained.push(owner); return true; },
    };
    const runtime = freshRuntime({
      admissionTimers: timerOptions,
      renderPackages: {
        load(_url, options) {
          loadCalls += 1;
          loaderOptions = options;
          return new Promise((resolve) => { resolveDecode = resolve; });
        },
      },
    });
    const pilot = { metadataUrl: 'shared.json' };
    const departed = loadAuthoredRenderPackagePilot(runtime, pilot, 'shared.glb', {
      optional: true,
      residencyOwner: canceledOwner,
      signal: consumerAdmission?.signal || controller.signal,
      ...(consumerAdmission ? { asyncAdmission: consumerAdmission } : {}),
    });
    const visible = loadAuthoredRenderPackagePilot(runtime, pilot, 'shared.glb', {
      optional: true,
      residencyOwner: activeOwner,
    });
    await flush();
    assert.equal(loadCalls, 1, 'both consumers share the same source URL decode');
    controller.abort(new Error('entity left the frame'));
    assert.equal(await departed, null, 'the departed consumer settles before the worker answers');
    assert.equal(runtime.pendingAssetTasks.size, 1, 'consumer cancellation keeps the shared task alive');
    assert.equal(loaderOptions.isResidencyOwnerActive(), false,
      'the package commit receives the same consumer lifetime check');

    resolveDecode(renderPackage);
    assert.strictEqual((await visible).renderPackage, renderPackage);
    assert.deepEqual(retained, [activeOwner], 'late decode never retains the departed owner');
    assert.equal(runtime.failures.size, 0);
    assert.equal(runtime.pendingAssetTasks.size, 0);
    assert.equal(clock.pending(), 0);
  }
});

test('runtime retirement resolves after bounded task settlement and disposes decoders once', async () => {
  const clock = fakeTimerQueue();
  let decoderDisposals = 0;
  let packageDisposals = 0;
  const runtime = freshRuntime({
    admissionTimers: { setTimer: clock.setTimer, clearTimer: clock.clearTimer },
    disposableDecoders: [{ dispose() { decoderDisposals += 1; } }],
    renderPackages: { dispose() { packageDisposals += 1; } },
  });
  admitAuthoredAssetTask(runtime, 'hung::x', () => never());
  await flush();
  const retirement = retireAuthoredAssetRuntime(runtime);
  assert.equal(runtime.retiring, true);
  assert.equal(runtime.assets.size, 0, 'cache visibility closes synchronously');
  assert.equal(decoderDisposals, 0, 'decoders stay live until owned tasks settle');
  clock.fireWhere(AUTHORED_ASYNC_DEADLINE_MS);
  await retirement;
  assert.equal(decoderDisposals, 1);
  assert.equal(packageDisposals, 1);
  assert.strictEqual(retireAuthoredAssetRuntime(runtime), retirement);
});

test('registry factory failure frees the renderer slot for a fresh admission', async () => {
  let calls = 0;
  const registry = createAuthoredAssetRuntimeRegistry(() => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error('decoder pair failed')) : Promise.resolve({ tag: calls });
  });
  const renderer = {};
  await assert.rejects(registry.get(renderer), /decoder pair failed/);
  await flush();
  assert.equal(registry.peek(renderer), null);
  const second = await registry.get(renderer);
  assert.deepEqual(second, { tag: 2 });
  assert.equal(calls, 2);
});

test('disposing a renderer mid-factory still owns and retires the produced runtime', async () => {
  let resolveFactory;
  const registry = createAuthoredAssetRuntimeRegistry(() => new Promise((resolve) => {
    resolveFactory = resolve;
  }));
  const renderer = {};
  const lookup = registry.get(renderer);
  await flush();
  const disposal = registry.dispose(renderer);
  assert.equal(registry.peek(renderer), null,
    'the mapping detaches synchronously so a later get() starts a fresh admission');

  const staleRuntime = { assets: new Map(), failures: new Map(), retiring: false };
  resolveFactory(staleRuntime);
  assert.strictEqual(await lookup, staleRuntime,
    'the admitted factory still resolves its caller — retirement owns the runtime next');
  await disposal;
  assert.equal(staleRuntime.retiring, true,
    'the runtime produced during disposal is retired, not leaked');
});

const HASH_IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function packageMetadata() {
  const metadata = {
    schema: RENDER_PACKAGE_SCHEMA,
    assetId: 'fixture.hang',
    kind: 'ship',
    compiler: { name: 'spaceface-render-package-compiler', version: '1.0.0' },
    contentHash: '0'.repeat(64),
    render: { uri: 'render.glb', sha256: '2'.repeat(64), bytes: 256 },
    provenance: {
      sourceGlb: { uri: 'fixture.glb', sha256: '3'.repeat(64), bytes: 512 },
      sourceManifest: null,
      semantics: { sha256: '4'.repeat(64) },
    },
    nodes: [{
      id: 'fixture.body',
      nodeName: 'Hull',
      nodePath: [0],
      role: 'immutable',
      parentId: null,
      localTransform: [...HASH_IDENTITY],
      worldTransform: [...HASH_IDENTITY],
      materialPipelineKey: 'opaque:front',
      spatialClusterId: 'body',
      mergeBoundary: 'body',
    }],
    anchors: [],
    dynamicGroups: [],
    geometry: [],
    materials: [],
    lods: [],
    hlods: [],
    collisions: [],
    spatialClusters: [{ id: 'body', nodeIds: ['fixture.body'], bounds: null }],
  };
  metadata.contentHash = createHash('sha256')
    .update(stableJsonStringify(renderPackageContentIdentity(metadata)))
    .digest('hex');
  return metadata;
}

function decodedScene() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const material = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Hull';
  mesh.userData = {
    [RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY]: {
      schema: RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
      recordIds: ['fixture.body'],
      rawNodeName: 'Hull',
    },
  };
  root.add(mesh);
  const disposals = { geometry: 0, material: 0 };
  geometry.dispose = () => { disposals.geometry += 1; };
  material.dispose = () => { disposals.material += 1; };
  return { scene: root, disposals };
}

test('render package loader disposal settles a wedged entry decode and evicts the cache lease', async () => {
  const residency = createAssetResidencyRegistry();
  const decoded = decodedScene();
  let resolveDecode;
  let decodeStarted;
  const started = new Promise((resolve) => { decodeStarted = resolve; });
  const loader = createRenderPackageLoader({
    residency,
    loadGlb: () => {
      decodeStarted();
      return new Promise((resolve) => { resolveDecode = resolve; });
    },
  });
  const load = loader.load(packageMetadata());
  const outcome = rejectedFields(load);
  await started;
  loader.dispose('test-retired');
  const { resolved, error } = await outcome;
  assert.equal(resolved, false);
  assert.equal(error.name, 'AbortError');
  await flush();
  assert.equal(loader.diagnostics().cacheEntries, 0);

  resolveDecode({ scene: decoded.scene });
  await flush();
  await flush();
  assert.deepEqual(decoded.disposals, { geometry: 1, material: 1 },
    'the late decode registers nothing and disposes its abandoned resources once');
  assert.equal(residency.canonicalDiagnostics().residentAssets, 0);
});

test('a render package entry that outlives its deadline rejects, evicts, and retries fresh', async () => {
  const clock = fakeTimerQueue();
  let decodeCalls = 0;
  let decodeStarted;
  const started = new Promise((resolve) => { decodeStarted = resolve; });
  const loader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    admissionTimers: { setTimer: clock.setTimer, clearTimer: clock.clearTimer },
    loadGlb: async () => {
      decodeCalls += 1;
      if (decodeCalls === 1) {
        decodeStarted();
        return never();
      }
      return { scene: decodedScene().scene };
    },
  });
  const metadata = packageMetadata();
  const first = rejectedFields(loader.load(metadata));
  await started;
  assert.equal(decodeCalls, 1);
  clock.fireWhere(AUTHORED_ASYNC_DEADLINE_MS);
  const { error } = await first;
  assert.equal(error.code, 'AUTHORED_ADMISSION_TIMEOUT');
  await flush();
  assert.equal(loader.diagnostics().cacheEntries, 0);
  const second = await loader.load(metadata);
  assert.equal(second.assetId, 'fixture.hang');
  assert.equal(decodeCalls, 2, 'the expired lease does not poison the content hash');
  loader.dispose();
});

test('compile reveal keeps geometry-less drawables and fallback layers hidden and restores on throw', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const root = new THREE.Group();
  root.visible = false;
  const valid = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  valid.visible = false;
  const broken = new THREE.Mesh();
  broken.geometry = null;
  const fallback = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  fallback.visible = false;
  fallback.userData.authoredReadableFallbackLayer = true;
  const instanced = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 4);
  instanced.count = 0;
  root.add(valid, broken, fallback, instanced);

  const restore = revealSubjectForCompile(root);
  const visibleInvalidDrawables = [];
  root.traverse((object) => {
    const drawable = object.isMesh === true || object.isPoints === true || object.isLine === true;
    if (drawable && object.visible === true && !object.geometry) visibleInvalidDrawables.push(object);
  });
  assert.deepEqual(visibleInvalidDrawables, [],
    'no geometry-less drawable may be forced visible for a compile pass');
  assert.equal(root.visible, true, 'wrappers still reveal so valid descendants compile');
  assert.equal(valid.visible, true);
  assert.equal(broken.visible, false);
  assert.equal(fallback.visible, false, 'authored fallback layers are never compile-revealed');
  assert.equal(instanced.count, 1);

  assert.throws(() => {
    try { throw new Error('render pass failed'); }
    finally { restore(); }
  }, /render pass failed/);
  assert.equal(root.visible, false);
  assert.equal(valid.visible, false);
  assert.equal(instanced.count, 0);
});

test('decode budget preserves a positive fractional limit as one slot', async () => {
  const budget = createDecodeTaskBudget(0.5);
  assert.equal(budget.limit, 1);
  const first = await budget.acquire();
  const queued = budget.acquire();
  assert.equal(budget.queued, 1, 'the single slot is taken so the next acquire queues');
  first();
  const second = await queued;
  assert.equal(budget.inFlight, 1);
  second();
  assert.equal(budget.inFlight, 0);
});

test('a stale task deadline cannot overwrite a newer failure record', async () => {
  const clock = fakeTimerQueue();
  const runtime = freshRuntime({
    admissionTimers: { setTimer: clock.setTimer, clearTimer: clock.clearTimer },
  });
  const hung = admitAuthoredAssetTask(runtime, 'u::f', () => never());
  const hungOutcome = rejectedFields(hung);
  runtime.assets.delete('u::f');
  const freshError = new Error('fresh decode broke');
  runtime.failures.set('u::f', freshError);
  clock.fireWhere(AUTHORED_ASYNC_DEADLINE_MS);
  const { error } = await hungOutcome;
  assert.equal(error.code, 'AUTHORED_ADMISSION_TIMEOUT');
  await flush();
  assert.equal(runtime.failures.get('u::f'), freshError,
    'an evicted task must not rewrite a key a newer attempt owns');
});

test('disposeDecodedResources releases shared geometry, materials, and textures exactly once', () => {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshBasicMaterial();
  const texture = new THREE.Texture();
  material.map = texture;
  const counts = { geometry: 0, material: 0, texture: 0 };
  geometry.dispose = () => { counts.geometry += 1; };
  material.dispose = () => { counts.material += 1; };
  texture.dispose = () => { counts.texture += 1; };
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  disposeDecodedResources({ scene });
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 },
    'two meshes sharing one resource stack dispose each resource once');
});

function globalTimerPump() {
  const timers = [];
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => {
    const timer = { fn, ms: Number(ms) || 0, args, cleared: false };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => { if (timer) timer.cleared = true; };
  return {
    timers,
    fireWhere(ms) {
      for (const timer of timers.splice(0)) {
        if (!timer.cleared && timer.ms === ms) timer.fn(...timer.args);
        else timers.push(timer);
      }
    },
    restore() {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    },
  };
}

test('a stale KTX2 init cannot overwrite a healthy retry after its admission expires', async () => {
  const pump = globalTimerPump();
  try {
    const { loader } = fakeKtx2Loader();
    const bodies = [];
    configureCspSafeKtx2Loader(loader, {
      decodeBudget: createDecodeTaskBudget(2),
      fetchImpl: () => Promise.resolve({
        ok: true,
        arrayBuffer: () => new Promise((resolve) => { bodies.push(resolve); }),
      }),
      WorkerImpl: function FakeWorker() { return { postMessage() {}, terminate() {} }; },
    });
    const stale = rejectedFields(loader.init());
    await flush();
    await flush();
    assert.equal(bodies.length, 1);
    pump.fireWhere(AUTHORED_ASYNC_DEADLINE_MS);
    await stale;
    await flush();
    assert.equal(loader.transcoderPending, null, 'the expired init frees the latch');

    const healthy = loader.init();
    await flush();
    await flush();
    assert.equal(bodies.length, 2);
    bodies[1](new ArrayBuffer(16));
    await healthy;
    assert.equal(loader.transcoderBinary.byteLength, 16);

    bodies[0](new ArrayBuffer(8));
    await flush();
    await flush();
    assert.equal(loader.transcoderBinary.byteLength, 16,
      'the late stale body cannot clobber the healthy binary or worker creator');
    assert.equal(loader.transcoderPending, healthy,
      'the pending latch still points at the healthy init, not the dead record');
    loader.dispose();
  } finally {
    pump.restore();
  }
});

test('a meshopt decode past its admission deadline returns the shared budget token', async () => {
  const clock = fakeTimerQueue();
  const innerCalls = [];
  const meshopt = {
    useWorkers() {},
    decodeGltfBufferAsync() { innerCalls.push(1); return never(); },
  };
  const priorWorker = globalThis.Worker;
  globalThis.Worker = class FakeWorker {};
  try {
    startMeshoptWorkerPool(meshopt, {
      admissionTimers: { setTimer: clock.setTimer, clearTimer: clock.clearTimer },
    });
  } finally {
    if (priorWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = priorWorker;
  }
  const budget = sharedDecodeTaskBudget();
  const hung = rejectedFields(meshopt.decodeGltfBufferAsync(1, 4, new Uint8Array(4), 0, null));
  await flush();
  await flush();
  assert.equal(innerCalls.length, 1);
  assert.equal(budget.inFlight, 1, 'the decode holds a shared token while the worker runs');
  clock.fireWhere(AUTHORED_ASYNC_DEADLINE_MS);
  const { error } = await hung;
  assert.equal(error.code, 'AUTHORED_ADMISSION_TIMEOUT');
  assert.equal(budget.inFlight, 0, 'the timed-out decode returns its token exactly once');
  const second = rejectedFields(meshopt.decodeGltfBufferAsync(1, 4, new Uint8Array(4), 0, null));
  await flush();
  await flush();
  assert.equal(innerCalls.length, 2, 'the freed slot admits the next decode');
  clock.fireWhere(AUTHORED_ASYNC_DEADLINE_MS);
  await second;
  assert.equal(budget.inFlight, 0);
});

test('a stalled render package metadata fetch rejects at the admission deadline', async () => {
  const clock = fakeTimerQueue();
  const loader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    admissionTimers: { setTimer: clock.setTimer, clearTimer: clock.clearTimer },
    fetchImpl: () => never(),
    loadGlb: () => never(),
  });
  const outcome = rejectedFields(loader.load('package.json'));
  clock.fireWhere(AUTHORED_ASYNC_DEADLINE_MS);
  const { error } = await outcome;
  assert.equal(error.code, 'AUTHORED_ADMISSION_TIMEOUT');
  assert.equal(loader.diagnostics().cacheEntries, 0, 'no cache entry was ever created');
  loader.dispose();
});

test('dispose during the runtime hash stage aborts the load before any decode starts', async () => {
  const digests = [];
  const decodes = [];
  const loader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    contentDigest: () => new Promise((resolve) => { digests.push(resolve); }),
    loadGlb: () => { decodes.push(1); return never(); },
  });
  const metadata = packageMetadata();
  metadata.runtime = { blueprint: 1 };
  metadata.runtimeHash = '5'.repeat(64);
  const outcome = rejectedFields(loader.load(metadata));
  await flush();
  await flush();
  assert.equal(digests.length, 1, 'the content hash stage ran first');
  digests.shift()(metadata.contentHash);
  await flush();
  await flush();
  assert.equal(digests.length, 1, 'the runtime hash stage is in flight');
  loader.dispose('test-retired');
  const { resolved, error } = await outcome;
  assert.equal(resolved, false);
  assert.equal(error.name, 'AbortError');
  digests.shift()(metadata.runtimeHash);
  await flush();
  await flush();
  assert.equal(decodes.length, 0, 'the late hash never admits a decode or cache entry');
  assert.equal(loader.diagnostics().cacheEntries, 0);
});
