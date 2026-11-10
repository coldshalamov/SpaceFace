import assert from 'node:assert/strict';
import test from 'node:test';

import { runNewGameStartTransition } from '../src/core/newGameStartTransition.js';
import { createRunTransitionGuard } from '../src/core/runTransitionGuard.js';

test('a superseded launch ignores a late render-pipeline failure', async () => {
  const guard = createRunTransitionGuard();
  const warmup = deferred();
  const warmupStarted = deferred();
  const token = guard.begin('first-launch');

  const first = runNewGameStartTransition({
    guard,
    token,
    prepareRun() {},
    waitForLibrary: () => true,
    waitForVisuals: () => true,
    waitForWarmup() {
      warmupStarted.resolve();
      return warmup.promise;
    },
    enterFlight() {},
  });

  await warmupStarted.promise;
  guard.begin('replacement-launch');
  warmup.resolve(false);

  assert.deepEqual(await first, { stale: true, enteredFlight: false });
});

test('a superseded launch ignores a late GPU-residency failure', async () => {
  const guard = createRunTransitionGuard();
  const gpu = deferred();
  const gpuStarted = deferred();
  const token = guard.begin('first-launch');

  const first = runNewGameStartTransition({
    guard,
    token,
    prepareRun() {},
    waitForLibrary: () => true,
    waitForVisuals: () => true,
    waitForWarmup: () => true,
    waitForGpuResources() {
      gpuStarted.resolve();
      return gpu.promise;
    },
    enterFlight() {},
  });

  await gpuStarted.promise;
  guard.begin('replacement-launch');
  gpu.resolve(false);

  assert.deepEqual(await first, { stale: true, enteredFlight: false });
});

test('a superseded launch ignores a late readiness rejection', async () => {
  const guard = createRunTransitionGuard();
  const warmup = deferred();
  const warmupStarted = deferred();
  const token = guard.begin('first-launch');

  const first = runNewGameStartTransition({
    guard,
    token,
    prepareRun() {},
    waitForLibrary: () => true,
    waitForVisuals: () => true,
    waitForWarmup() {
      warmupStarted.resolve();
      return warmup.promise;
    },
    enterFlight() {},
  });

  await warmupStarted.promise;
  guard.begin('replacement-launch');
  warmup.reject(new Error('late shader compilation failure'));

  assert.deepEqual(await first, { stale: true, enteredFlight: false });
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
