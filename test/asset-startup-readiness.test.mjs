import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STARTUP_PHASE_BUDGETS_MS,
  STARTUP_PHASE_LABELS,
  clickButton,
  createStartupPhaseTracker,
  runStartupPhase,
  snapshotStartupPhases,
} from '../scripts/check-asset-startup-readiness.mjs';

const PHASE_ORDER = ['documentLoad', 'appSurfaceReady', 'menuReady', 'playableAssetReady'];

test('startup readiness uses named seconds-scale budgets instead of one opaque boot wait', async () => {
  assert.deepEqual(Object.keys(STARTUP_PHASE_BUDGETS_MS), PHASE_ORDER);
  assert.deepEqual(Object.keys(STARTUP_PHASE_LABELS), PHASE_ORDER);
  assert.equal(STARTUP_PHASE_BUDGETS_MS.documentLoad, 60000);
  assert.equal(STARTUP_PHASE_BUDGETS_MS.appSurfaceReady, 90000);
  assert.equal(STARTUP_PHASE_BUDGETS_MS.menuReady, 60000);
  assert.equal(STARTUP_PHASE_BUDGETS_MS.playableAssetReady, 180000);

  const clockValues = [1000, 1042, 1042];
  const tracker = createStartupPhaseTracker({ now: () => clockValues.shift() ?? 1042 });
  let operationOptions = null;
  const result = await runStartupPhase(tracker, 'appSurfaceReady', async (options) => {
    operationOptions = options;
    assert.equal(options.name, 'appSurfaceReady');
    assert.equal(options.label, 'app/debug surface readiness');
    assert.equal(options.timeoutMs, 90000);
    assert.equal(options.remainingMs(), 89958);
    return 'ready';
  });

  assert.equal(result, 'ready');
  assert.equal(operationOptions.timeoutMs, 90000);
  assert.equal(tracker.current, null);
  assert.deepEqual(snapshotStartupPhases(tracker), [{
    name: 'appSurfaceReady',
    label: 'app/debug surface readiness',
    status: 'passed',
    budgetMs: 90000,
    elapsedMs: 42,
  }]);
});

test('startup readiness reports the phase that failed and preserves its bounded budget', async () => {
  const clockValues = [2000, 2055];
  const tracker = createStartupPhaseTracker({ now: () => clockValues.shift() ?? 2055 });
  await assert.rejects(
    runStartupPhase(tracker, 'menuReady', async () => {
      throw new Error('main menu hidden');
    }),
    (error) => {
      assert.equal(error.phase, 'menuReady');
      assert.match(error.message, /^menu readiness failed: main menu hidden$/);
      return true;
    },
  );

  assert.equal(tracker.current, null);
  assert.deepEqual(snapshotStartupPhases(tracker), [{
    name: 'menuReady',
    label: 'menu readiness',
    status: 'failed',
    budgetMs: 60000,
    elapsedMs: 55,
    error: 'main menu hidden',
  }]);
});

test('public control clicks receive the owning phase remaining budget', async () => {
  const clickTimeouts = [];
  const page = {
    getByRole(role, options) {
      assert.equal(role, 'button');
      assert.deepEqual(options, { name: 'New Game', exact: true });
      return {
        first() {
          return {
            async count() { return 1; },
            async click({ timeout }) { clickTimeouts.push(timeout); },
          };
        },
      };
    },
  };
  const clockValues = [5000, 5015, 5015];
  const tracker = createStartupPhaseTracker({ now: () => clockValues.shift() ?? 5015 });

  await runStartupPhase(tracker, 'menuReady', async ({ remainingMs }) => {
    assert.equal(await clickButton(page, 'New Game', remainingMs()), true);
  });

  assert.deepEqual(clickTimeouts, [59985]);
});
