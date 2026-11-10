import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mobileWorkerContractHostDeadlineMs,
  runMobileWorkerContract,
} from '../scripts/lib/mobileWorkerContract.mjs';

const workerUrls = {
  digest: 'https://game.test/workers/renderPackageDigestWorker.js',
  prepass: 'https://game.test/workers/glbPrepassWorker.js',
};

test('host deadline is two fetch limits plus two round-trip limits and a small margin', () => {
  assert.equal(mobileWorkerContractHostDeadlineMs({ timeoutMs: 15000, fetchTimeoutMs: 10000 }), 51000);
  assert.equal(mobileWorkerContractHostDeadlineMs({ timeoutMs: 7, fetchTimeoutMs: 11, marginMs: 5 }), 41);
});

test('a stalled page.evaluate is rejected by the host deadline', async () => {
  const page = { evaluate: () => new Promise(() => {}) };
  await assert.rejects(
    runMobileWorkerContract(page, { workerUrls, timeoutMs: 10, fetchTimeoutMs: 10, hostMarginMs: 5 }),
    /Mobile worker contract failed: Mobile worker contract host deadline exceeded after 45ms/,
  );
});

test('in-page errors are preserved and a successful evaluation clears the host timer', async () => {
  const cause = new Error('renderer stopped answering');
  await assert.rejects(
    runMobileWorkerContract({ evaluate: async () => { throw cause; } }, {
      workerUrls, timeoutMs: 10, fetchTimeoutMs: 10, hostMarginMs: 5,
    }),
    error => {
      assert.match(error.message, /Mobile worker contract failed: renderer stopped answering/);
      assert.equal(error.cause, cause);
      return true;
    },
  );

  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = timer => { if (timer) timer.cleared = true; };
  try {
    const result = await runMobileWorkerContract({ evaluate: async () => ({ ok: true }) }, {
      workerUrls, timeoutMs: 10, fetchTimeoutMs: 10, hostMarginMs: 5,
    });
    assert.deepEqual(result, { ok: true });
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 45);
  assert.equal(timers[0].cleared, true);
});
