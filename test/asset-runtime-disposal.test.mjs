import assert from 'node:assert/strict';

import * as assetLoader from '../src/render/assetLoader.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function runtimeFixture({ tasks = [], decoders = [] } = {}) {
  return {
    assets: new Map(tasks.map((task, index) => [`asset-${index}`, task])),
    pendingAssetTasks: new Set(tasks),
    failures: new Map([['old-failure', new Error('old failure')]]),
    disposableDecoders: decoders,
    retiring: false,
    retirementPromise: null,
  };
}

async function testTaskAdmissionEstablishesOwnershipBeforeFactoryRuns() {
  assert.equal(typeof assetLoader.admitAuthoredAssetTask, 'function',
    'assetLoader must export the task-admission boundary used by live loads');
  if (typeof assetLoader.admitAuthoredAssetTask !== 'function') return;

  const runtime = runtimeFixture();
  let admittedTask = null;
  let factoryRan = false;
  let ownershipInsideFactory = null;
  admittedTask = assetLoader.admitAuthoredAssetTask(runtime, 'ordered-asset', () => {
    factoryRan = true;
    ownershipInsideFactory = {
      cachedTask: runtime.assets.get('ordered-asset'),
      pending: runtime.pendingAssetTasks.has(admittedTask),
    };
    return 'loaded';
  });

  assert.equal(factoryRan, false, 'task factory is deferred until after synchronous ownership setup');
  assert.strictEqual(runtime.assets.get('ordered-asset'), admittedTask,
    'the exact returned task is synchronously visible in the runtime cache');
  assert.equal(runtime.pendingAssetTasks.has(admittedTask), true,
    'the exact returned task is synchronously owned by the pending-task set');

  assert.equal(await admittedTask, 'loaded');
  assert.equal(factoryRan, true);
  assert.strictEqual(ownershipInsideFactory.cachedTask, admittedTask,
    'the task is already cached when its factory begins');
  assert.equal(ownershipInsideFactory.pending, true,
    'pending ownership is already established when the factory begins');
}

async function testImmediateRetirementOwnsAdmittedTaskBeforeFactoryRuns() {
  assert.equal(typeof assetLoader.admitAuthoredAssetTask, 'function',
    'assetLoader must export the task-admission boundary used by live loads');
  assert.equal(typeof assetLoader.retireAuthoredAssetRuntime, 'function',
    'assetLoader must export the runtime retirement lifecycle');
  if (typeof assetLoader.admitAuthoredAssetTask !== 'function'
    || typeof assetLoader.retireAuthoredAssetRuntime !== 'function') return;

  const inner = deferred();
  let factoryRan = false;
  let disposeCalls = 0;
  const runtime = runtimeFixture({
    decoders: [{ dispose() { disposeCalls += 1; } }],
  });
  const admittedTask = assetLoader.admitAuthoredAssetTask(runtime, 'retiring-asset', () => {
    factoryRan = true;
    return inner.promise;
  });
  let retirementFinished = false;
  const retirement = assetLoader.retireAuthoredAssetRuntime(runtime);
  retirement.then(() => { retirementFinished = true; });

  assert.equal(factoryRan, false, 'retirement can begin before the admitted factory microtask runs');
  assert.equal(runtime.assets.size, 0, 'retirement intentionally clears cache visibility immediately');
  assert.equal(runtime.pendingAssetTasks.size, 0, 'retirement snapshots then releases the live ownership set');
  assert.equal(disposeCalls, 0, 'decoder remains alive for the snapshotted admitted task');

  await Promise.resolve();
  assert.equal(factoryRan, true, 'the already-admitted factory runs after retirement takes ownership');
  assert.equal(retirementFinished, false, 'retirement awaits the controlled inner task');
  assert.equal(disposeCalls, 0);

  inner.resolve('loaded during retirement');
  assert.equal(await admittedTask, 'loaded during retirement');
  await retirement;
  assert.equal(retirementFinished, true);
  assert.equal(disposeCalls, 1, 'decoder disposal occurs only after the admitted task settles');
}

async function testCacheInvalidationCannotHideOwnedTask() {
  assert.equal(typeof assetLoader.retireAuthoredAssetRuntime, 'function',
    'assetLoader must export the runtime retirement lifecycle');
  if (typeof assetLoader.retireAuthoredAssetRuntime !== 'function') return;

  const pending = deferred();
  let disposeCalls = 0;
  const runtime = runtimeFixture({
    tasks: [pending.promise],
    decoders: [{ dispose() { disposeCalls += 1; } }],
  });
  runtime.assets.clear();

  const retirement = assetLoader.retireAuthoredAssetRuntime(runtime);
  await Promise.resolve();
  assert.equal(disposeCalls, 0,
    'clearing the cache cannot hide an already-owned task from decoder retirement');
  pending.resolve('loaded after invalidation');
  await retirement;
  assert.equal(disposeCalls, 1);
}

function testEvictedRenderPackageTaskIsDroppedBeforeReadmission() {
  assert.equal(typeof assetLoader.discardEvictedRenderPackageTask, 'function',
    'assetLoader must expose the stale package-task boundary used by a repeated New Game');
  if (typeof assetLoader.discardEvictedRenderPackageTask !== 'function') return;

  const cacheKey = 'assets/ships/release/parts/wholeships/kestrel.glb::hull';
  const staleTask = Promise.resolve({ renderPackage: { evicted: true } });
  const replacementTask = Promise.resolve({ renderPackage: { evicted: false } });
  const runtime = runtimeFixture();
  runtime.assets.set(cacheKey, staleTask);

  assert.equal(assetLoader.discardEvictedRenderPackageTask(
    runtime, cacheKey, staleTask, { renderPackage: { evicted: true } },
  ), true, 'a released Kestrel package must reopen its source-url task cache for the next player boundary');
  assert.equal(runtime.assets.has(cacheKey), false,
    'the evicted task is removed so the canonical hash-bound pilot must be re-admitted');

  runtime.assets.set(cacheKey, replacementTask);
  assert.equal(assetLoader.discardEvictedRenderPackageTask(
    runtime, cacheKey, staleTask, { renderPackage: { evicted: true } },
  ), true, 'a concurrent older completion still retries instead of returning an evicted package');
  assert.strictEqual(runtime.assets.get(cacheKey), replacementTask);
  assert.equal(assetLoader.discardEvictedRenderPackageTask(
    runtime, cacheKey, replacementTask, { renderPackage: { evicted: false } },
  ), false, 'a resident package remains cached for the active boundary');
}

async function testRetirementWaitsForOwnedTasks() {
  assert.equal(typeof assetLoader.retireAuthoredAssetRuntime, 'function',
    'assetLoader must export the runtime retirement lifecycle');
  if (typeof assetLoader.retireAuthoredAssetRuntime !== 'function') return;

  const pending = deferred();
  let disposeCalls = 0;
  const runtime = runtimeFixture({
    tasks: [pending.promise],
    decoders: [{ dispose() { disposeCalls += 1; } }],
  });

  let retired = false;
  const retirement = assetLoader.retireAuthoredAssetRuntime(runtime);
  retirement.then(() => { retired = true; });

  assert.equal(runtime.retiring, true, 'retirement closes admission before taking its task snapshot');
  assert.equal(runtime.assets.size, 0, 'asset cache clears synchronously at retirement');
  assert.equal(runtime.failures.size, 0, 'failure cache clears synchronously at retirement');
  assert.equal(disposeCalls, 0, 'decoder object URLs remain alive while an owned task is pending');
  await Promise.resolve();
  assert.equal(retired, false, 'retirement cannot complete before the owned task settles');

  pending.resolve('loaded');
  await retirement;
  assert.equal(disposeCalls, 1, 'decoder is disposed after the final owned task settles');
}

async function testMixedSettlementAndIdempotentDecoderCleanup() {
  assert.equal(typeof assetLoader.retireAuthoredAssetRuntime, 'function',
    'assetLoader must export the runtime retirement lifecycle');
  if (typeof assetLoader.retireAuthoredAssetRuntime !== 'function') return;

  const fulfilled = deferred();
  const rejected = deferred();
  const calls = [];
  const runtime = runtimeFixture({
    tasks: [fulfilled.promise, rejected.promise],
    decoders: [
      { dispose() { calls.push('throwing'); throw new Error('decoder dispose failed'); } },
      { dispose() { calls.push('remaining'); } },
    ],
  });

  const first = assetLoader.retireAuthoredAssetRuntime(runtime);
  const repeated = assetLoader.retireAuthoredAssetRuntime(runtime);
  assert.strictEqual(repeated, first, 'repeat retirement returns the same guarded promise');

  fulfilled.resolve('ok');
  rejected.reject(new Error('load failed'));
  await assert.doesNotReject(() => first,
    'mixed task rejection and decoder disposal exceptions are contained by retirement');
  assert.deepEqual(calls, ['throwing', 'remaining'],
    'all decoders are attempted once even when an earlier decoder throws');
  assert.deepEqual(runtime.disposableDecoders, [], 'disposed decoder ownership is released');

  await assetLoader.retireAuthoredAssetRuntime(runtime);
  assert.deepEqual(calls, ['throwing', 'remaining'], 'settled repeat retirement cannot double-dispose decoders');
}

function testRetiringRuntimeRejectsNewTasks() {
  assert.equal(typeof assetLoader.admitAuthoredAssetTask, 'function',
    'assetLoader must export the task-admission boundary used by live loads');
  if (typeof assetLoader.admitAuthoredAssetTask !== 'function') return;

  const runtime = runtimeFixture();
  runtime.retiring = true;
  let factoryCalls = 0;
  const admitted = assetLoader.admitAuthoredAssetTask(runtime, 'late-asset', () => {
    factoryCalls += 1;
    return Promise.resolve('late');
  });

  assert.equal(admitted, null, 'a load that observes retirement falls back instead of starting work');
  assert.equal(factoryCalls, 0, 'retiring runtime does not invoke the asset task factory');
  assert.equal(runtime.assets.size, 0, 'retiring runtime cannot gain a new cached task');
}

async function testRegistryRemovesMappingAndGuardsDisposal() {
  assert.equal(typeof assetLoader.createAuthoredAssetRuntimeRegistry, 'function',
    'assetLoader must expose the production runtime registry constructor');
  if (typeof assetLoader.createAuthoredAssetRuntimeRegistry !== 'function') return;

  const pending = deferred();
  let decoderDisposals = 0;
  const firstRuntime = runtimeFixture({
    tasks: [pending.promise],
    decoders: [{ dispose() { decoderDisposals += 1; } }],
  });
  const replacementRuntime = runtimeFixture();
  let factoryCalls = 0;
  const registry = assetLoader.createAuthoredAssetRuntimeRegistry(async () => {
    factoryCalls += 1;
    return factoryCalls === 1 ? firstRuntime : replacementRuntime;
  });
  const renderer = {};

  const firstLookup = registry.get(renderer);
  const disposal = registry.dispose(renderer);
  const repeated = registry.dispose(renderer);
  assert.strictEqual(repeated, disposal, 'public repeat disposal returns the same guarded retirement');
  assert.equal(registry.peek(renderer), null, 'renderer mapping is removed synchronously on disposal');

  const replacementLookup = registry.get(renderer);
  assert.notStrictEqual(replacementLookup, firstLookup,
    'a later load receives a fresh runtime even while the retiring runtime is still being created');
  assert.strictEqual(await firstLookup, firstRuntime);
  assert.strictEqual(await replacementLookup, replacementRuntime);
  assert.equal(decoderDisposals, 0, 'fresh runtime creation does not revoke the retiring runtime decoders');

  pending.reject(new Error('owned task rejected'));
  await assert.doesNotReject(() => disposal, 'ignored public disposal is backed by a resolving guarded promise');
  assert.equal(decoderDisposals, 1);

  const failingRegistry = assetLoader.createAuthoredAssetRuntimeRegistry(
    async () => { throw new Error('runtime creation failed'); },
  );
  const failingRenderer = {};
  failingRegistry.get(failingRenderer);
  const guardedFailure = failingRegistry.dispose(failingRenderer);
  assert.strictEqual(failingRegistry.dispose(failingRenderer), guardedFailure,
    'creation-failure retirement remains idempotent');
  await assert.doesNotReject(() => guardedFailure,
    'runtime creation rejection is contained and cannot become an unhandled disposal rejection');
}

async function testEmptyRuntimeDisposesPromptly() {
  assert.equal(typeof assetLoader.retireAuthoredAssetRuntime, 'function',
    'assetLoader must export the runtime retirement lifecycle');
  if (typeof assetLoader.retireAuthoredAssetRuntime !== 'function') return;

  let disposeCalls = 0;
  const runtime = runtimeFixture({ decoders: [{ dispose() { disposeCalls += 1; } }] });
  await assetLoader.retireAuthoredAssetRuntime(runtime);
  assert.equal(disposeCalls, 1, 'an empty runtime retires without an artificial delay');
}

function createFakeKtx2Loader() {
  const loader = {
    detectSupportCalls: [],
    disposeCalls: 0,
    detectSupport(renderer) {
      this.detectSupportCalls.push(renderer);
      return this;
    },
    dispose() {
      this.disposeCalls += 1;
    },
  };
  return loader;
}

async function testTwoRuntimesShareOneKtx2Loader() {
  assert.equal(typeof assetLoader.createSharedKtx2LoaderOwner, 'function',
    'assetLoader must export shared KTX2 ownership for authored-asset runtimes');
  if (typeof assetLoader.createSharedKtx2LoaderOwner !== 'function') return;

  let factoryCalls = 0;
  const fakeLoader = createFakeKtx2Loader();
  const owner = assetLoader.createSharedKtx2LoaderOwner({
    createLoader: async () => {
      factoryCalls += 1;
      return fakeLoader;
    },
  });

  const mainRenderer = { id: 'main' };
  const previewRenderer = { id: 'preview' };

  const [mainLoader, previewLoader] = await Promise.all([
    owner.acquire(mainRenderer),
    owner.acquire(previewRenderer),
  ]);

  assert.strictEqual(mainLoader, previewLoader,
    'main and preview runtimes must share one KTX2Loader instance');
  assert.strictEqual(mainLoader, fakeLoader);
  assert.equal(factoryCalls, 1, 'the Basis transcoder factory runs once for concurrent acquires');
  assert.equal(owner.peek().refCount, 2, 'each runtime holds one shared-loader reference');
  assert.equal(fakeLoader.detectSupportCalls.length, 2,
    'each acquire re-runs detectSupport for its own renderer');
  assert.ok(fakeLoader.detectSupportCalls.includes(mainRenderer),
    'main renderer support is detected against the shared loader');
  assert.ok(fakeLoader.detectSupportCalls.includes(previewRenderer),
    'preview renderer support is detected against the shared loader');
}

async function testSharedKtx2SurvivesPeerRuntimeDisposal() {
  assert.equal(typeof assetLoader.createSharedKtx2LoaderOwner, 'function',
    'assetLoader must export shared KTX2 ownership for authored-asset runtimes');
  assert.equal(typeof assetLoader.retireAuthoredAssetRuntime, 'function',
    'assetLoader must export the runtime retirement lifecycle');
  if (typeof assetLoader.createSharedKtx2LoaderOwner !== 'function'
    || typeof assetLoader.retireAuthoredAssetRuntime !== 'function') return;

  const fakeLoader = createFakeKtx2Loader();
  const owner = assetLoader.createSharedKtx2LoaderOwner({
    createLoader: async () => fakeLoader,
  });

  const mainRenderer = { id: 'main' };
  const previewRenderer = { id: 'preview' };
  const shared = await owner.acquire(mainRenderer);
  await owner.acquire(previewRenderer);
  assert.equal(owner.peek().refCount, 2);

  // Mirror production attachRuntimeDecoders: each runtime owns a release handle, not the loader.
  const mainRuntime = runtimeFixture({
    decoders: [{ dispose() { owner.release(shared); } }],
  });
  const previewRuntime = runtimeFixture({
    decoders: [{ dispose() { owner.release(shared); } }],
  });

  await assetLoader.retireAuthoredAssetRuntime(previewRuntime);

  assert.equal(fakeLoader.disposeCalls, 0,
    'disposing the preview runtime must not terminate the shared KTX2 loader while main still owns it');
  assert.equal(owner.peek()?.refCount, 1,
    'main runtime retains the shared loader after peer retirement');
  assert.strictEqual(owner.peek()?.loader, fakeLoader,
    'shared loader identity is preserved across peer disposal');

  await assetLoader.retireAuthoredAssetRuntime(mainRuntime);

  assert.equal(fakeLoader.disposeCalls, 1,
    'shared KTX2 loader disposes only after the final runtime releases it');
  assert.equal(owner.peek(), null, 'owner clears after the last release');

  // Stale release after full retirement must not dispose again or poison a new generation.
  owner.release(shared);
  assert.equal(fakeLoader.disposeCalls, 1, 'stale release after zero refs is a no-op');

  const nextLoader = createFakeKtx2Loader();
  const owner2Calls = { n: 0 };
  const owner2 = assetLoader.createSharedKtx2LoaderOwner({
    createLoader: async () => {
      owner2Calls.n += 1;
      return nextLoader;
    },
  });
  // Re-use the production-shaped double acquire/release on a fresh owner generation.
  const again = await owner2.acquire(mainRenderer);
  assert.strictEqual(again, nextLoader);
  owner2.release(again);
  assert.equal(nextLoader.disposeCalls, 1);
  assert.equal(owner2Calls.n, 1);
}

async function testSharedKtx2ReleaseIsIdempotentPerRuntimeHandle() {
  assert.equal(typeof assetLoader.createSharedKtx2LoaderOwner, 'function',
    'assetLoader must export shared KTX2 ownership for authored-asset runtimes');
  if (typeof assetLoader.createSharedKtx2LoaderOwner !== 'function') return;

  const fakeLoader = createFakeKtx2Loader();
  const owner = assetLoader.createSharedKtx2LoaderOwner({
    createLoader: async () => fakeLoader,
  });

  const loader = await owner.acquire({ id: 'a' });
  await owner.acquire({ id: 'b' });
  assert.equal(owner.peek().refCount, 2);

  owner.release(loader);
  assert.equal(fakeLoader.disposeCalls, 0, 'first of two refs must not dispose the shared loader');
  assert.equal(owner.peek()?.refCount, 1);

  owner.release(loader);
  assert.equal(fakeLoader.disposeCalls, 1, 'exactly one dispose when the final ref is released');
  assert.equal(owner.peek(), null);

  owner.release(loader);
  assert.equal(fakeLoader.disposeCalls, 1, 'extra release after zero refs cannot re-dispose');
}

async function testSharedKtx2CreationFailureDoesNotLeakRefs() {
  assert.equal(typeof assetLoader.createSharedKtx2LoaderOwner, 'function',
    'assetLoader must export shared KTX2 ownership for authored-asset runtimes');
  if (typeof assetLoader.createSharedKtx2LoaderOwner !== 'function') return;

  let attempts = 0;
  const owner = assetLoader.createSharedKtx2LoaderOwner({
    createLoader: async () => {
      attempts += 1;
      throw new Error('basis transcoder unavailable');
    },
  });

  await assert.rejects(() => owner.acquire({ id: 'main' }), /basis transcoder unavailable/);
  assert.equal(owner.peek(), null, 'failed acquire leaves no live shared entry');
  assert.equal(attempts, 1);

  // A later acquire may retry with a healthy factory after full failure cleanup.
  const recovered = createFakeKtx2Loader();
  const healthy = assetLoader.createSharedKtx2LoaderOwner({
    createLoader: async () => recovered,
  });
  const loader = await healthy.acquire({ id: 'main' });
  assert.strictEqual(loader, recovered);
  healthy.release(loader);
  assert.equal(recovered.disposeCalls, 1);
}

await testTaskAdmissionEstablishesOwnershipBeforeFactoryRuns();
await testImmediateRetirementOwnsAdmittedTaskBeforeFactoryRuns();
await testRetirementWaitsForOwnedTasks();
await testCacheInvalidationCannotHideOwnedTask();
testEvictedRenderPackageTaskIsDroppedBeforeReadmission();
await testMixedSettlementAndIdempotentDecoderCleanup();
testRetiringRuntimeRejectsNewTasks();
await testRegistryRemovesMappingAndGuardsDisposal();
await testEmptyRuntimeDisposesPromptly();
await testTwoRuntimesShareOneKtx2Loader();
await testSharedKtx2SurvivesPeerRuntimeDisposal();
await testSharedKtx2ReleaseIsIdempotentPerRuntimeHandle();
await testSharedKtx2CreationFailureDoesNotLeakRefs();

console.log('PASS authored asset runtime disposal lifecycle');
