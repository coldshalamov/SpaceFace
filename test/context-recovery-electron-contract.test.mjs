import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildContextRecoveryReceipt,
  createOneShotAsync,
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
