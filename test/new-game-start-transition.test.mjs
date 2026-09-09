import assert from 'node:assert/strict';
import test from 'node:test';

import { createRunTransitionGuard } from '../src/core/runTransitionGuard.js';
import {
  describeGameStartFailure,
  runNewGameStartTransition,
} from '../src/core/newGameStartTransition.js';

test('fresh New Game prepares the player and world before waiting for authored assets', async () => {
  const guard = createRunTransitionGuard();
  const token = guard.begin('new-game');
  const library = deferred();
  const timeline = [];
  let playerId = 0;
  let flights = 0;

  const transition = runNewGameStartTransition({
    guard,
    token,
    prepareRun() {
      playerId = 1;
      timeline.push('prepare:player-world');
    },
    waitForLibrary() {
      timeline.push('wait:library');
      return library.promise;
    },
    waitForVisuals() {
      timeline.push('wait:visuals');
      return true;
    },
    waitForWarmup() {
      timeline.push('wait:warmup');
      return true;
    },
    waitForGpuResources() {
      timeline.push('wait:gpu-resources');
      return true;
    },
    enterFlight() {
      flights += 1;
      timeline.push('enter:flight');
    },
  });

  await settle();
  assert.equal(playerId, 1, 'loading must already have a canonical player/world');
  assert.deepEqual(timeline, ['prepare:player-world', 'wait:library']);
  assert.equal(flights, 0, 'flight must remain gated while authored assets are pending');

  library.resolve(true);
  assert.deepEqual(await transition, { stale: false, enteredFlight: true });
  assert.equal(flights, 1);
  assert.deepEqual(timeline, [
    'prepare:player-world', 'wait:library', 'wait:visuals', 'wait:warmup',
    'wait:gpu-resources', 'enter:flight',
  ]);
});

test('New Game yields a presentation frame before synchronous preparation and reports truthful stages', async () => {
  const guard = createRunTransitionGuard();
  const token = guard.begin('new-game');
  const timeline = [];

  const result = await runNewGameStartTransition({
    guard,
    token,
    reportProgress(stage) {
      timeline.push(`progress:${stage.id}:${stage.progress}`);
    },
    yieldForPresentation() {
      timeline.push('yield:presentation');
    },
    prepareRun() {
      timeline.push('prepare:player-world');
    },
    waitForLibrary() {
      timeline.push('wait:library');
      return true;
    },
    waitForVisuals() {
      timeline.push('wait:visuals');
      return true;
    },
    waitForWarmup() {
      timeline.push('wait:warmup');
      return true;
    },
    waitForGpuResources() {
      timeline.push('wait:gpu-resources');
      return true;
    },
    enterFlight() {
      timeline.push('enter:flight');
    },
  });

  assert.deepEqual(result, { stale: false, enteredFlight: true });
  assert.deepEqual(timeline, [
    'progress:preparing-run:0.08',
    'yield:presentation',
    'prepare:player-world',
    'progress:authored-library:0.25',
    'wait:library',
    'progress:authored-visuals:0.5',
    'wait:visuals',
    'progress:render-pipelines:0.78',
    'wait:warmup',
    'progress:gpu-resources:0.9',
    'wait:gpu-resources',
    'progress:entering-flight:0.96',
    'enter:flight',
  ]);
});

test('repeated New Game starts admit only the latest transition to flight', async () => {
  const guard = createRunTransitionGuard();
  const firstLibrary = deferred();
  const secondLibrary = deferred();
  const entered = [];

  const firstToken = guard.begin('new-game:first');
  const first = runFixture(firstToken, 'first', firstLibrary.promise);
  await settle();

  const secondToken = guard.begin('new-game:second');
  const second = runFixture(secondToken, 'second', secondLibrary.promise);
  await settle();

  secondLibrary.resolve(true);
  assert.deepEqual(await second, { stale: false, enteredFlight: true });
  firstLibrary.resolve(true);
  assert.deepEqual(await first, { stale: true, enteredFlight: false });
  assert.deepEqual(entered, ['second'], 'the stale first click must never publish flight');

  function runFixture(token, id, libraryPromise) {
    return runNewGameStartTransition({
      guard,
      token,
      prepareRun() {},
      waitForLibrary: () => libraryPromise,
      waitForVisuals: () => true,
      waitForWarmup: () => true,
      enterFlight: () => entered.push(id),
    });
  }
});

test('authored-library failure remains fail-closed and yields retryable player copy', async () => {
  const guard = createRunTransitionGuard();
  const token = guard.begin('new-game');
  let prepared = 0;
  let discarded = 0;
  let flights = 0;

  await assert.rejects(
    runNewGameStartTransition({
      guard,
      token,
      prepareRun: () => { prepared += 1; },
      discardRun: () => { discarded += 1; },
      waitForLibrary: () => false,
      waitForVisuals: () => true,
      waitForWarmup: () => true,
      enterFlight: () => { flights += 1; },
    }),
    (error) => {
      assert.equal(error.code, 'AUTHORED_LIBRARY_UNAVAILABLE');
      assert.equal(error.stage, 'authored-library');
      assert.equal(error.retryable, true);
      const failure = describeGameStartFailure(error);
      assert.deepEqual(failure, {
        code: 'AUTHORED_LIBRARY_UNAVAILABLE',
        stage: 'authored-library',
        retryable: true,
        text: 'The authored starter ship could not be loaded. Retry Launch; saved games are unchanged.',
      });
      return true;
    },
  );
  assert.equal(prepared, 1, 'the run must have a deterministic player/world before the gate settles');
  assert.equal(discarded, 1, 'a current failed start must discard its staged player/world before returning to menu');
  assert.equal(flights, 0, 'asset failure must never enter flight or permit procedural fallback');
});

test('authored-visual failure is distinct from library failure and remains fail-closed', async () => {
  const guard = createRunTransitionGuard();
  const token = guard.begin('new-game');
  let flights = 0;
  await assert.rejects(
    runNewGameStartTransition({
      guard,
      token,
      prepareRun() {},
      waitForLibrary: () => true,
      waitForVisuals: () => false,
      waitForWarmup: () => true,
      enterFlight: () => { flights += 1; },
    }),
    (error) => error.code === 'AUTHORED_VISUALS_UNAVAILABLE'
      && error.stage === 'authored-visuals'
      && error.retryable === true,
  );
  assert.equal(flights, 0);
});

test('render-pipeline failure cannot publish flight after authored visuals load', async () => {
  const guard = createRunTransitionGuard();
  const token = guard.begin('new-game');
  let flights = 0;

  await assert.rejects(
    runNewGameStartTransition({
      guard,
      token,
      prepareRun() {},
      waitForLibrary: () => true,
      waitForVisuals: () => true,
      waitForWarmup: () => false,
      enterFlight: () => { flights += 1; },
    }),
    (error) => error.code === 'RENDER_PIPELINE_UNAVAILABLE'
      && error.stage === 'render-pipeline'
      && error.retryable === true,
  );
  assert.equal(flights, 0);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}
