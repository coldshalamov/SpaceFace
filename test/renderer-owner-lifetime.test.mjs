import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { AUTHORED_ASYNC_DEADLINE_MS, createAsyncAdmission } from '../src/render/asyncAdmission.js';
import {
  cancelAuthoredUpgradeQueue,
  describeAuthoredUpgradeQueue,
  enqueueBoundaryUpgrade,
  prepareAuthoredVisualPipelines,
  residencyOptionsForBoundary,
  waitForOpeningGraphPublicationRelease,
} from '../src/render/partsLibrary.js';
import { POST_PROCESS_ROUTE, render as renderSystem } from '../src/render/renderer.js';
import {
  createPipelineAdmissionTracker,
  observePipelineAdmission,
} from '../src/render/pipelineReadiness.js';

const never = () => new Promise(() => {});
const flushMicrotasks = async (times = 6) => {
  for (let i = 0; i < times; i++) await Promise.resolve();
};

function fakeDisplayPump() {
  const clock = {
    now: 0,
    timers: [],
    frames: [],
  };
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const realRaf = globalThis.requestAnimationFrame;
  const realNow = performance.now.bind(performance);
  globalThis.setTimeout = (fn, ms, ...args) => {
    const timer = { fn, ms: Number(ms) || 0, args, cleared: false };
    clock.timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => { if (timer) timer.cleared = true; };
  globalThis.requestAnimationFrame = (fn) => {
    clock.frames.push(fn);
    return clock.frames.length;
  };
  performance.now = () => clock.now;
  return {
    clock,
    flushFrame() {
      for (const fn of clock.frames.splice(0)) fn();
    },
    fireTimer(ms) {
      for (const timer of clock.timers.splice(0)) {
        if (!timer.cleared && timer.ms === ms) timer.fn(...timer.args);
        else clock.timers.push(timer);
      }
    },
    pending() { return clock.timers.filter((timer) => !timer.cleared).length; },
    restore() {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
      globalThis.requestAnimationFrame = realRaf;
      performance.now = realNow;
    },
  };
}

function stationJob(scene, id, run, options = {}) {
  const boundary = new THREE.Group();
  scene.add(boundary);
  return {
    boundary,
    entity: { id, type: 'station', alive: true, data: {} },
    key: `entity:station:${id}`,
    assetUrls: [],
    estimatedBytes: 0,
    run,
    options,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('a wedged station admission releases the serial lane at the stall bound', async () => {
  const pump = fakeDisplayPump();
  try {
    const scene = new THREE.Group();
    const starts = [];
    let resolveHang;
    let resolveSecond;
    const first = stationJob(scene, 'station_a', () => {
      starts.push(1);
      return new Promise((resolve) => { resolveHang = resolve; });
    });
    const second = stationJob(scene, 'station_b', () => {
      starts.push(2);
      return new Promise((resolve) => { resolveSecond = resolve; });
    });
    const firstCompletion = enqueueBoundaryUpgrade(scene, first);
    const secondCompletion = enqueueBoundaryUpgrade(scene, second);
    pump.flushFrame();
    await flushMicrotasks();
    assert.deepEqual(starts, [1]);
    let describe = describeAuthoredUpgradeQueue(scene);
    assert.equal(describe.inFlight, 1);
    assert.equal(describe.pending, 1);

    pump.clock.now += 5000;
    pump.fireTimer(5000);
    await flushMicrotasks();
    assert.ok(
      pump.clock.timers.some((timer) => !timer.cleared && timer.ms === AUTHORED_ASYNC_DEADLINE_MS),
      'an early wake poll must not drop the still-pending admission deadline timer',
    );
    assert.deepEqual(starts, [1], 'a job inside its stall bound keeps its slot');

    pump.clock.now += AUTHORED_ASYNC_DEADLINE_MS;
    pump.fireTimer(5000);
    const firstResult = await firstCompletion;
    assert.equal(firstResult.status, 'aborted-stalled');
    assert.equal(firstResult.error, null,
      'the hog-wake abort carries no admission error — it is a watchdog verdict, not a rejection');
    assert.equal(first.boundary.userData.authoredAssetState, 'awaiting-authored-admission',
      'a stall-aborted owner re-requests at its natural rung — retriable, never ready');
    assert.equal(first.boundary.userData.authoredReadmissionReason, 'upgrade-stall-abort');
    assert.ok(!first.boundary.userData.authoredUpgradePromise,
      'the stale completion promise is dropped so the re-request starts a fresh admission');
    pump.flushFrame();
    await flushMicrotasks();
    assert.deepEqual(starts, [1, 2], 'the freed slot admits the queued job');

    resolveHang({ stale: true });
    await flushMicrotasks();
    describe = describeAuthoredUpgradeQueue(scene);
    assert.equal(describe.inFlight, 1,
      'a late resolve of the expired job cannot decrement the newer slot');
    assert.equal(second.boundary.userData.authoredAssetState, undefined);
    resolveSecond('b-done');
    assert.deepEqual(await secondCompletion.then((r) => r.status), 'completed');
    describe = describeAuthoredUpgradeQueue(scene);
    assert.equal(describe.inFlight, 0);
    assert.equal(describe.pending, 0);
  } finally {
    pump.restore();
  }
});

test('an owner that departs mid-flight aborts and marks the boundary for readmission', async () => {
  const pump = fakeDisplayPump();
  try {
    const scene = new THREE.Group();
    const job = stationJob(scene, 'station_gone', () => never());
    const completion = enqueueBoundaryUpgrade(scene, job);
    pump.flushFrame();
    await flushMicrotasks();
    job.entity.alive = false;
    pump.fireTimer(5000);
    const result = await completion;
    assert.equal(result.status, 'awaiting-authored-admission');
    assert.equal(job.boundary.userData.authoredAssetState, 'awaiting-authored-admission');
    const describe = describeAuthoredUpgradeQueue(scene);
    assert.equal(describe.inFlight, 0);
    assert.equal(describe.pending, 0);
  } finally {
    pump.restore();
  }
});

test('cancelAuthoredUpgradeQueue settles queued and in-flight work and clears timers', async () => {
  const pump = fakeDisplayPump();
  try {
    const scene = new THREE.Group();
    const starts = [];
    const first = stationJob(scene, 'station_x', () => { starts.push(1); return never(); });
    const second = stationJob(scene, 'station_y', () => { starts.push(2); return never(); });
    const firstCompletion = enqueueBoundaryUpgrade(scene, first);
    const secondCompletion = enqueueBoundaryUpgrade(scene, second);
    pump.flushFrame();
    await flushMicrotasks();
    assert.deepEqual(starts, [1]);
    const timersBefore = pump.pending();
    assert.ok(timersBefore >= 1, 'the admission deadline and wake timers are armed');

    assert.equal(cancelAuthoredUpgradeQueue(scene, 'fixture-retired'), true);
    const [firstResult, secondResult] = await Promise.all([firstCompletion, secondCompletion]);
    assert.equal(secondResult.status, 'cancelled-before-load');
    assert.equal(firstResult.status, 'awaiting-authored-admission');
    await flushMicrotasks();
    assert.equal(pump.pending(), 0, 'retirement clears every held timer');
    const describe = describeAuthoredUpgradeQueue(scene);
    assert.equal(describe.pending, 0);
    assert.equal(describe.inFlight, 0);
    assert.equal(describe.running, false);

    const third = stationJob(scene, 'station_z', () => Promise.resolve('resumed'));
    const thirdCompletion = enqueueBoundaryUpgrade(scene, third);
    pump.flushFrame();
    assert.equal((await thirdCompletion).status, 'completed',
      'a cancelled queue still serves a later live owner');
  } finally {
    pump.restore();
  }
});

test('the overlap pipeline release frees the serial slot exactly once', async () => {
  const pump = fakeDisplayPump();
  try {
    const scene = new THREE.Group();
    const starts = [];
    let context1;
    let resolveHang1;
    let resolveHang2;
    const first = stationJob(scene, 'station_overlap', (context) => {
      starts.push(1);
      context1 = context;
      return new Promise((resolve) => { resolveHang1 = resolve; });
    }, { overlapAuthoredPipelineCompile: true });
    const second = stationJob(scene, 'station_next', () => {
      starts.push(2);
      return new Promise((resolve) => { resolveHang2 = resolve; });
    });
    const firstCompletion = enqueueBoundaryUpgrade(scene, first);
    const secondCompletion = enqueueBoundaryUpgrade(scene, second);
    pump.flushFrame();
    await flushMicrotasks();
    assert.deepEqual(starts, [1]);
    assert.equal(typeof context1.options.onAuthoredPipelineStaged, 'function',
      'the overlap branch receives the staged release on its admitted options');

    assert.equal(context1.options.onAuthoredPipelineStaged(), true);
    assert.equal(context1.options.onAuthoredPipelineStaged(), false,
      'a repeated staged signal cannot release the slot twice');
    pump.flushFrame();
    await flushMicrotasks();
    assert.deepEqual(starts, [1, 2],
      'the released slot admits the next job while the first finishes its GPU stage');
    assert.equal(describeAuthoredUpgradeQueue(scene).inFlight, 1);

    resolveHang1('first-done');
    assert.equal((await firstCompletion).status, 'completed');
    assert.equal(describeAuthoredUpgradeQueue(scene).inFlight, 1,
      'the settled first job must not decrement the slot the second job owns');
    resolveHang2('second-done');
    assert.equal((await secondCompletion).status, 'completed');
    assert.equal(describeAuthoredUpgradeQueue(scene).inFlight, 0);
  } finally {
    pump.restore();
  }
});

function liveRenderFixture() {
  const calls = [];
  const render = {
    admissionRunGeneration: 3,
    renderer: { tag: 'native-target' },
    compileObjectPipelines(root, options) {
      calls.push({ thisIsRender: this === render, root, options });
      return Promise.resolve('compiled');
    },
    touchSubjectExactTarget: () => Promise.resolve(true),
    prepareAuthoredGpuResidency: () => Promise.resolve('resident'),
    yieldToNextPresent: () => Promise.resolve(),
  };
  const liveState = { render, entities: new Map(), world: {}, camera: {} };
  const priorWindow = globalThis.window;
  globalThis.window = { SF: { state: liveState } };
  return {
    render,
    liveState,
    calls,
    restore() {
      if (priorWindow === undefined) delete globalThis.window;
      else globalThis.window = priorWindow;
    },
  };
}

test('captured residency ports invoke the captured render and fail closed when it departs', async () => {
  const fixture = liveRenderFixture();
  try {
    const entity = { id: 'station_ports', type: 'station', alive: true, data: {} };
    const boundary = new THREE.Group();
    const options = residencyOptionsForBoundary(entity, boundary, {});
    assert.equal(typeof options.prepareAuthoredPipelines, 'function');
    assert.equal(await options.prepareAuthoredPipelines(boundary), 'compiled');
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].thisIsRender, true,
      'the captured port runs against the captured render object');

    delete fixture.render.prepareAuthoredGpuResidency;
    await assert.rejects(
      options.prepareAuthoredGpuResidency(boundary, {}),
      (error) => error.name === 'AbortError' && /owner became inactive/.test(error.message),
      'a removed port fails as owner-inactive lifecycle, not a TypeError',
    );

    fixture.render.admissionRunGeneration = 4;
    await assert.rejects(
      options.prepareAuthoredPipelines(boundary),
      (error) => error.name === 'AbortError',
      'a generation bump mid-run rejects the stale continuation',
    );

    fixture.liveState.render = { admissionRunGeneration: 5 };
    await assert.rejects(
      options.prepareAuthoredPipelines(boundary),
      (error) => error.name === 'AbortError',
    );
    assert.equal(fixture.calls.length, 1, 'no stale port ever invokes the dead render');
  } finally {
    fixture.restore();
  }
});

test('the opening publication gate refuses a foreign generation and settles for the live one', async () => {
  const fixture = liveRenderFixture();
  try {
    const released = deferred();
    fixture.render.openingGraphPublicationFrozen = true;
    fixture.render.waitForOpeningGraphPublicationRelease = () => released.promise;

    await assert.rejects(
      waitForOpeningGraphPublicationRelease({ expectedRender: {} }),
      (error) => error.name === 'AbortError',
      'a gate owned by another render object never resolves into this picture',
    );

    const gate = waitForOpeningGraphPublicationRelease({ expectedRender: fixture.render });
    released.resolve('released');
    assert.equal(await gate, 'released');

    const stale = deferred();
    fixture.render.waitForOpeningGraphPublicationRelease = () => stale.promise;
    const staleGate = waitForOpeningGraphPublicationRelease({ expectedRender: fixture.render });
    fixture.render.admissionRunGeneration = 9;
    stale.resolve('released');
    await assert.rejects(staleGate, (error) => error.name === 'AbortError',
      'a release that lands after the generation moved cannot publish old work');
  } finally {
    fixture.restore();
  }
});

test('pipeline preparation rejects through the admission instead of authorizing a stale root', async () => {
  const clock = {
    setTimer: () => ({}),
    clearTimer: () => {},
  };
  const timedOut = createAsyncAdmission({
    label: 'pipeline-owner',
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  timedOut.abort('boundary retired');
  const calls = [];
  const root = new THREE.Group();
  await assert.rejects(
    prepareAuthoredVisualPipelines(root, {
      asyncAdmission: timedOut,
      prepareAuthoredPipelines: () => { calls.push('compile'); return Promise.resolve(); },
      prepareAuthoredGpuResidency: () => { calls.push('gpu'); return Promise.resolve(); },
    }),
    (error) => error.name === 'AbortError',
  );
  assert.deepEqual(calls, [], 'an expired admission runs no GPU stage');

  const admission = createAsyncAdmission({
    label: 'pipeline-hang',
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  const preparation = prepareAuthoredVisualPipelines(root, {
    asyncAdmission: admission,
    prepareAuthoredPipelines: () => never(),
    prepareAuthoredGpuResidency: () => never(),
  });
  admission.abort('superseded');
  await assert.rejects(preparation, (error) => error.name === 'AbortError',
    'a wedged compile rejects the preparation instead of resolving stale');
});

function postRouteOwner(compileImpl) {
  const compileCalls = [];
  const renderer = {
    getRenderTarget: () => null,
    setRenderTarget() {},
    async compileAsync(...args) {
      compileCalls.push(args);
      if (compileImpl) return compileImpl(...args);
      return undefined;
    },
    info: { programs: [] },
  };
  const owner = Object.assign(Object.create(renderSystem), {
    state: { render: { admissionRunGeneration: 3 } },
    renderer,
    bloom: null,
    _renderGraph: null,
  });
  return { owner, compileCalls };
}

test('a post-route compile rejects for a disposed owner and a retired generation', async () => {
  const healthy = postRouteOwner();
  await healthy.owner._compilePostRoute(
    POST_PROCESS_ROUTE.NATIVE, {}, {}, {},
  );
  assert.equal(healthy.compileCalls.length, 1, 'a live owner still compiles natively');

  const disposed = postRouteOwner();
  disposed.owner._rendererResourcesDisposed = true;
  await assert.rejects(
    disposed.owner._compilePostRoute(POST_PROCESS_ROUTE.NATIVE, {}, {}, {}),
    (error) => error.name === 'AbortError',
  );
  assert.equal(disposed.compileCalls.length, 0,
    'a disposed owner never starts a compile against stale targets');

  const missing = postRouteOwner();
  missing.owner.renderer = null;
  await assert.rejects(
    missing.owner._compilePostRoute(POST_PROCESS_ROUTE.NATIVE, {}, {}, {}),
    (error) => error.name === 'AbortError',
  );

  const stalled = deferred();
  const midFlight = postRouteOwner(() => stalled.promise);
  const compile = midFlight.owner._compilePostRoute(POST_PROCESS_ROUTE.NATIVE, {}, {}, {});
  await flushMicrotasks();
  assert.equal(midFlight.compileCalls.length, 1);
  midFlight.owner.state.render.admissionRunGeneration = 4;
  stalled.resolve('late-compile');
  await assert.rejects(compile, (error) => error.name === 'AbortError',
    'a compile resolving into a newer generation rejects instead of reporting success');
});

test('a synchronous exact-target touch throws on a retired port instead of leaking a rejection', async () => {
  const fixture = liveRenderFixture();
  try {
    const entity = { id: 'touch_port', type: 'station', alive: true, data: {} };
    const boundary = new THREE.Group();
    const options = residencyOptionsForBoundary(entity, boundary, {});
    assert.equal(typeof options.touchAuthoredExactTarget, 'function');
    await options.touchAuthoredExactTarget(boundary);

    fixture.render.touchSubjectExactTarget = () => Promise.resolve(true);
    assert.throws(
      () => options.touchAuthoredExactTarget(boundary),
      (error) => error.name === 'AbortError' && /owner became inactive/.test(error.message),
      'a swapped port fails the synchronous caller as owner-inactive, not an unhandled rejection',
    );
    fixture.render.admissionRunGeneration = 4;
    assert.throws(
      () => options.touchAuthoredExactTarget(boundary),
      (error) => error.name === 'AbortError',
    );
    assert.equal(boundary.userData.authoredAssetState, undefined,
      'no state was ever marked ready by a dead touch');
  } finally {
    fixture.restore();
  }
});

test('identical port functions on a replaced native renderer still fail closed', async () => {
  const fixture = liveRenderFixture();
  try {
    const entity = { id: 'native_swap', type: 'station', alive: true, data: {} };
    const boundary = new THREE.Group();
    const options = residencyOptionsForBoundary(entity, boundary, {});
    assert.equal(await options.prepareAuthoredPipelines(boundary), 'compiled');
    assert.equal(options.isResidencyOwnerActive(), true);

    fixture.render.renderer = { tag: 'swapped-native' };
    assert.equal(options.isResidencyOwnerActive(), false,
      'the base owner predicate honors the captured native renderer identity');
    await assert.rejects(
      options.prepareAuthoredPipelines(boundary),
      (error) => error.name === 'AbortError',
      'same ports and same generation on a different native renderer are a dead owner',
    );
    assert.throws(
      () => options.touchAuthoredExactTarget(boundary),
      (error) => error.name === 'AbortError',
    );
    assert.equal(fixture.calls.length, 1, 'the swapped native renderer never receives a call');
  } finally {
    fixture.restore();
  }
});

test('a cancelled job cannot clobber a fresh admission for the same boundary and key', async () => {
  const pump = fakeDisplayPump();
  try {
    const scene = new THREE.Group();
    const boundary = new THREE.Group();
    scene.add(boundary);
    const entity = { id: 'station_re', type: 'station', alive: true, data: {} };
    let resolveStale;
    const staleJob = {
      boundary,
      entity,
      key: 'entity:station:station_re',
      assetUrls: [],
      estimatedBytes: 0,
      run: () => new Promise((resolve) => { resolveStale = resolve; }),
      options: {},
    };
    const staleCompletion = enqueueBoundaryUpgrade(scene, staleJob);
    pump.flushFrame();
    await flushMicrotasks();
    assert.equal(cancelAuthoredUpgradeQueue(scene, 'scene-retired'), true);
    assert.equal((await staleCompletion).status, 'awaiting-authored-admission');

    const freshJob = {
      boundary,
      entity,
      key: 'entity:station:station_re',
      assetUrls: [],
      estimatedBytes: 0,
      run: () => {
        boundary.userData.authoredAssetState = 'ready';
        return Promise.resolve('fresh-done');
      },
      options: {},
    };
    const freshCompletion = enqueueBoundaryUpgrade(scene, freshJob);
    pump.flushFrame();
    const freshResult = await freshCompletion;
    assert.equal(boundary.userData.authoredAssetState, 'ready');

    resolveStale({ stale: true });
    await flushMicrotasks();
    assert.equal(boundary.userData.authoredAssetState, 'ready',
      'the superseded job cannot overwrite the fresh boundary state');
    const describe = describeAuthoredUpgradeQueue(scene);
    assert.equal(describe.inFlight, 0);
    assert.equal(describe.pending, 0);
    assert.ok(freshResult.status === 'ready' || freshResult.status === 'completed');
  } finally {
    pump.restore();
  }
});

test('a timed-out ship admission never publishes its boundary as ready', async () => {
  const pump = fakeDisplayPump();
  try {
    const scene = new THREE.Group();
    const boundary = new THREE.Group();
    scene.add(boundary);
    const job = {
      boundary,
      entity: { id: 'player_ship', type: 'ship', isPlayer: true, alive: true, data: {} },
      key: 'entity:ship:player_ship',
      assetUrls: [],
      estimatedBytes: 0,
      run: () => never(),
      options: {},
    };
    const completion = enqueueBoundaryUpgrade(scene, job);
    pump.flushFrame();
    await flushMicrotasks();
    pump.clock.now += AUTHORED_ASYNC_DEADLINE_MS + 1000;
    pump.fireTimer(5000);
    const result = await completion;
    assert.equal(result.status, 'aborted-stalled');
    assert.equal(result.error, null);
    assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission',
      'a player ship past the stall bound re-requests at its natural rung — never ready');
    assert.equal(boundary.userData.authoredReadmissionReason, 'upgrade-stall-abort');
  } finally {
    pump.restore();
  }
});

test('a queued batch drops the expired entry and still serves the live one', async () => {
  const staged = [];
  const tracker = createPipelineAdmissionTracker((subjects) => {
    staged.push(subjects);
    return Promise.resolve('compiled');
  }, { quietMs: 0, maxWaitMs: 20 });
  const expiredSubject = { tag: 'expired' };
  const liveSubject = { tag: 'live' };
  let expiredActive = true;
  const expired = tracker.compile(expiredSubject, { isActive: () => expiredActive });
  const live = tracker.compile(liveSubject, {});
  expiredActive = false;
  const [expiredError, liveResult] = await Promise.all([
    expired.then(() => null, (error) => error),
    live,
  ]);
  assert.equal(expiredError.name, 'AbortError');
  assert.equal(liveResult, 'compiled', 'the live entry still serves its healthy priority');
  assert.deepEqual(staged, [[liveSubject]],
    'the expired queued subject never reaches the compile stage');
});

test('a subject that expires inside an in-flight batch rejects on settle', async () => {
  let resolveBatch;
  const staged = [];
  const tracker = createPipelineAdmissionTracker((subjects) => {
    staged.push(subjects);
    return new Promise((resolve) => { resolveBatch = resolve; });
  }, { quietMs: 0, maxWaitMs: 20 });
  const expiredSubject = { tag: 'expired' };
  const liveSubject = { tag: 'live' };
  let expiredActive = true;
  const expired = tracker.compile(expiredSubject, { isActive: () => expiredActive });
  const live = tracker.compile(liveSubject, {});
  for (let i = 0; i < 100 && !resolveBatch; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.ok(resolveBatch, 'the batch is in flight');
  assert.deepEqual(staged, [[expiredSubject, liveSubject]],
    'both live subjects staged while both guards were active');
  expiredActive = false;
  resolveBatch('compiled');
  const [expiredError, liveResult] = await Promise.all([
    expired.then(() => null, (error) => error),
    live,
  ]);
  assert.equal(expiredError.name, 'AbortError',
    'a late batch result cannot mark the expired entry ready');
  assert.equal(liveResult, 'compiled');
});

test('an expired explicit subject cannot starve the ambient entries it flushes', async () => {
  const staged = [];
  const tracker = createPipelineAdmissionTracker((subjects, compileOptions) => {
    const isActive = compileOptions && typeof compileOptions.isActive === 'function'
      ? compileOptions.isActive
      : () => true;
    staged.push({
      subjects: [...subjects],
      compiled: subjects.filter((subject) => isActive(subject) === true),
      priority: compileOptions && compileOptions.priority,
    });
    return Promise.resolve('compiled');
  }, { quietMs: 0, maxWaitMs: 20 });
  const explicitSubject = { tag: 'explicit' };
  const ambientSubject = { tag: 'ambient' };
  let explicitActive = true;
  const ambient = tracker.compile(ambientSubject, {});
  const explicit = tracker.compileExplicit(explicitSubject, {
    isActive: () => explicitActive,
    priority: 'critical',
  });
  explicitActive = false;
  const [explicitError, ambientResult] = await Promise.all([
    explicit.then(() => null, (error) => error),
    ambient,
  ]);
  assert.equal(explicitError.name, 'AbortError',
    'the dead explicit owner rejects instead of resolving ready');
  assert.equal(ambientResult, 'compiled',
    'the healthy ambient entry still compiles and resolves');
  assert.equal(staged.length, 1, 'the merged explicit run compiles once');
  assert.deepEqual(staged[0].compiled, [ambientSubject],
    'the explicit subject is filtered out while the ambient one survives');
  assert.equal(staged[0].priority, 'critical',
    'non-guard explicit compile options still reach the driver');
});

test('duplicate consumers of one subject compile once while any consumer is active', async () => {
  const staged = [];
  const tracker = createPipelineAdmissionTracker((subjects) => {
    staged.push([...subjects]);
    return Promise.resolve('compiled');
  }, { quietMs: 0, maxWaitMs: 20 });
  const shared = { tag: 'shared' };
  let explicitActive = true;
  const ambient = tracker.compile(shared, { isActive: () => true });
  const explicit = tracker.compileExplicit(shared, { isActive: () => explicitActive });
  explicitActive = false;
  const [explicitError, ambientResult] = await Promise.all([
    explicit.then(() => null, (error) => error),
    ambient,
  ]);
  assert.equal(explicitError.name, 'AbortError',
    'the dead consumer rejects on settle');
  assert.equal(ambientResult, 'compiled',
    'the live consumer of the same subject still resolves');
  assert.equal(staged.length, 1);
  assert.deepEqual(staged[0], [shared],
    'two consumers of one subject compile that subject exactly once');
});

test('a deferred second shadow pass never receives a subject that expired mid-batch', async () => {
  const shadowPasses = [];
  const gate = deferred();
  const tracker = createPipelineAdmissionTracker((subjects, compileOptions) => {
    const optionActive = compileOptions && compileOptions.isActive;
    const isRootActive = typeof optionActive === 'function'
      ? (root) => optionActive(root) === true
      : () => true;
    const batch = subjects.filter(Boolean).filter(isRootActive);
    if (batch.length === 0) return Promise.resolve({ skipped: true, reason: 'owner-inactive' });
    const admitDepth = () => {
      const live = batch.filter(isRootActive);
      if (live.length === 0) return;
      shadowPasses.push(live.slice());
    };
    admitDepth();
    return gate.promise.then((result) => {
      admitDepth();
      return result;
    });
  }, { quietMs: 0, maxWaitMs: 20 });
  const expiredSubject = { tag: 'expired' };
  const liveSubject = { tag: 'live' };
  let expiredActive = true;
  const expired = tracker.compile(expiredSubject, { isActive: () => expiredActive });
  const live = tracker.compile(liveSubject, {});
  for (let i = 0; i < 100 && shadowPasses.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(shadowPasses.length, 1, 'the first depth pass ran while both subjects were live');
  assert.deepEqual(shadowPasses[0], [expiredSubject, liveSubject]);
  expiredActive = false;
  gate.resolve('compiled');
  const [expiredError, liveResult] = await Promise.all([
    expired.then(() => null, (error) => error),
    live,
  ]);
  assert.equal(expiredError.name, 'AbortError',
    'the expired entry rejects instead of skipping to success');
  assert.equal(liveResult, 'compiled');
  assert.deepEqual(shadowPasses, [[expiredSubject, liveSubject], [liveSubject]],
    'the second depth pass uploads or touches only still-active subjects');
});

test('an observed background admission rejection stays off the global unhandledRejection', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const stalled = deferred();
    const owner = postRouteOwner(() => stalled.promise);
    let observerCalls = 0;
    const compile = observePipelineAdmission(
      owner.owner._compilePostRoute(POST_PROCESS_ROUTE.NATIVE, {}, {}, {}),
      () => { observerCalls += 1; },
    );
    await flushMicrotasks();
    owner.owner.state.render.admissionRunGeneration = 4;
    stalled.resolve('late-compile');
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, [],
      'the fire-and-forget caller leaves no global unhandled rejection');
    assert.equal(observerCalls, 0, 'an expected AbortError is silent lifecycle');
    await assert.rejects(compile,
      (error) => error.name === 'AbortError' && /became inactive/.test(error.message),
      'the returned promise still rejects with the same owner-inactive reason');
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});

test('observePipelineAdmission returns the same promise unchanged', async () => {
  const rejected = deferred();
  const failure = Object.assign(new Error('compile blew up'), { code: 'TEST_COMPILE' });
  let seen = null;
  const observed = observePipelineAdmission(rejected.promise, (error) => { seen = error; });
  assert.equal(observed, rejected.promise, 'identity is preserved for awaiting callers');
  rejected.reject(failure);
  await assert.rejects(observed, (error) => error === failure,
    'the public promise rejects with the original error');
  assert.equal(seen, failure, 'a non-Abort rejection is reported to the observer once');

  const fulfilled = deferred();
  const observedOk = observePipelineAdmission(fulfilled.promise);
  assert.equal(observedOk, fulfilled.promise);
  fulfilled.resolve('compiled');
  assert.equal(await observedOk, 'compiled', 'fulfillment value passes through unchanged');
});

test('an ignored cleanup finally runs once and a throwing observer stays inert', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const aborted = deferred();
    let cleanups = 0;
    observePipelineAdmission(aborted.promise.finally(() => { cleanups += 1; }));
    aborted.reject(Object.assign(new Error('admission aborted'), { name: 'AbortError' }));

    const failed = deferred();
    observePipelineAdmission(failed.promise, () => { throw new Error('observer exploded'); });
    failed.reject(new Error('non-abort failure'));

    for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cleanups, 1, 'the cleanup child ran exactly once');
    assert.deepEqual(unhandled, [],
      'neither the observed cleanup chain nor the throwing observer reaches the global handler');
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});
