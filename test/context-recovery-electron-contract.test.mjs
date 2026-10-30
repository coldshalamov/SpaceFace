import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildContextRecoveryReceipt,
  createOneShotAsync,
  releasedPlayableFlightInPage,
} from '../scripts/probe-context-recovery-electron.mjs';

test('context diagnostic close wrapper invokes ordinary close only once', async () => {
  let calls = 0;
  const close = createOneShotAsync(async () => {
    calls += 1;
    return { pass: true };
  });

  const [first, second] = await Promise.all([close.invoke(), close.invoke()]);
  assert.deepEqual(first, { pass: true });
  assert.strictEqual(second, first, 'concurrent teardown callers share the same close promise');
  assert.equal(calls, 1);
  assert.equal(close.callCount, 1);
});

test('context diagnostic receipt keeps recovery and teardown attribution on failure', () => {
  const contextLoss = {
    available: true,
    lostEvent: true,
    restoredEvent: true,
    recovered: true,
    contextRecovery: { losses: 1, restores: 1, generation: 2, pending: false },
  };
  const postTeardown = {
    armed: true,
    entries: [{ api: 'deleteTexture', count: 4, alive: true }],
    evicted: 0,
    dropped: 0,
  };
  const receipt = buildContextRecoveryReceipt({
    outputDir: '.devshots/context-recovery-electron/test',
    contextLoss,
    postTeardownInstall: { installed: true, already: false, captured: false },
    postTeardown,
    cleanupReport: { pass: false, failures: ['process close unconfirmed'] },
    closeCallCount: 1,
    primaryError: new Error('cleanup failed'),
  });

  assert.equal(receipt.pass, false, 'cleanup failure must keep the diagnostic fail-closed');
  assert.equal(receipt.status, 'fail');
  assert.deepEqual(receipt.contextLoss, contextLoss);
  assert.deepEqual(receipt.glDeleteTrap.postTeardown.snapshot, postTeardown);
  assert.equal(receipt.teardown.closeCallCount, 1);
  assert.match(receipt.error.message, /cleanup failed/);
});

test('context diagnostic cannot pass on low-level restore without sustained authored flight', () => {
  const base = {
    outputDir: '.devshots/context-recovery-electron/test',
    contextLoss: { available: true, lostEvent: true, restoredEvent: true, recovered: true },
    postTeardownInstall: { installed: true },
    postTeardown: { armed: true, entries: [], evicted: 0, dropped: 0 },
    cleanupReport: { pass: true, appCloseCompleted: true, pageClosed: true, processExited: true, listenerReleased: true },
    closeCallCount: 1,
    profileCleanup: true,
  };
  const lowLevelOnly = buildContextRecoveryReceipt(base);
  assert.equal(lowLevelOnly.pass, false);

  const gameplayRestored = buildContextRecoveryReceipt({ ...base, postRecoveryFlightStable: true });
  assert.equal(gameplayRestored.pass, true);
});

test('optional public F5/F9 context trigger is reported as diagnostic-only', () => {
  const receipt = buildContextRecoveryReceipt({
    outputDir: '.devshots/context-recovery-electron/test',
    contextLoss: { available: true, lostEvent: true, restoredEvent: true, recovered: true },
    postRecoveryFlightStable: true,
    postTeardownInstall: { installed: true },
    postTeardown: { armed: true, entries: [], evicted: 0, dropped: 0 },
    cleanupReport: { pass: true, appCloseCompleted: true, pageClosed: true, processExited: true, listenerReleased: true },
    closeCallCount: 1,
    profileCleanup: true,
    publicSaveLoadBeforeContext: {
      events: { saves: 1, loads: 1, savedSlot: 'quick', loadedSlot: 'quick' },
    },
    bufferResizeDiagnosticEnabled: true,
  });

  assert.match(receipt.route.sequence, /public F5 save -> public F9 load/);
  assert.equal(receipt.publicSaveLoadBeforeContext.events.loads, 1);
  assert.equal(receipt.diagnosticMode.bufferResizeDiagnosticEnabled, true);
  assert.equal(receipt.diagnosticMode.performanceClaimsEligible, false);
  assert.equal(receipt.pass, true, 'the trigger is reported but does not become an extra acceptance predicate');
});

test('released-flight predicate requires opening release, an unpaused clock, and advancing thresholds', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const state = {
    mode: 'flight',
    timeScale: 1,
    tick: 8,
    simTime: 1,
    ui: { docked: false, screenStack: [] },
    render: {
      openingFirstPictureReady: true,
      firstPlayableFrameAt: 42,
      flightVeilHoldsSim: false,
    },
  };
  const requests = {};
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { SF: {
      state,
      authoredVisualReadiness: () => ({ ready: true }),
      timeEffects: { describeRequests: () => requests },
    } },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      visibilityState: 'visible',
      body: { classList: { contains: () => false } },
      getElementById: () => null,
      querySelector: () => null,
    },
  });

  try {
    assert.equal(releasedPlayableFlightInPage(), true);
    assert.equal(releasedPlayableFlightInPage({ minimumTick: 9 }), false);
    assert.equal(releasedPlayableFlightInPage({ minimumSimTime: 2 }), false);
    state.render.openingFirstPictureReady = false;
    assert.equal(releasedPlayableFlightInPage(), false);
    state.render.openingFirstPictureReady = true;
    state.render.firstPlayableFrameAt = null;
    assert.equal(releasedPlayableFlightInPage(), false);
    state.render.firstPlayableFrameAt = 42;
    state.render.flightVeilHoldsSim = true;
    assert.equal(releasedPlayableFlightInPage(), false);
    state.render.flightVeilHoldsSim = false;
    requests['runtime:first-picture'] = { scale: 0 };
    assert.equal(releasedPlayableFlightInPage(), false);
    delete requests['runtime:first-picture'];
    state.paused = true;
    assert.equal(releasedPlayableFlightInPage(), false);
    state.paused = false;
    state.timeScale = 0;
    assert.equal(releasedPlayableFlightInPage(), false);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  }
});
