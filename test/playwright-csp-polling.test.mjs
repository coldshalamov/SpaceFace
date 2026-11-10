import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  consumePageConditionValue,
  installCspSafePlaywrightPolling,
  waitForPageCondition,
} from '../scripts/lib/playwrightCspPolling.mjs';

test('CSP-safe polling uses direct page evaluation instead of Playwright string evaluation', async () => {
  const observations = [false, false, { ready: true }];
  const calls = [];
  const page = {
    async evaluate(predicate, argument) {
      calls.push({ predicate, argument });
      return observations.shift();
    },
    async waitForTimeout() {},
    waitForFunction() { throw new Error('native Playwright polling must not run'); },
  };

  assert.equal(installCspSafePlaywrightPolling(page), page);
  const result = await page.waitForFunction((value) => value, 47, { timeout: 1_000 });
  assert.deepEqual(result, { ready: true });
  assert.equal(calls.length, 3);
  assert.equal(calls.every((entry) => entry.argument === 47), true);
});

test('CSP-safe polling fails closed on invalid inputs', async () => {
  const page = { evaluate: async () => true, waitForTimeout: async () => {} };
  await assert.rejects(waitForPageCondition(page, null), /condition must be a function/);
  assert.throws(() => installCspSafePlaywrightPolling({}, {}), /requires a live Page/);
});

test('page-condition consumers accept direct CSP values and native-style handles', async () => {
  const direct = { ready: true, source: 'csp-polling' };
  assert.equal(await consumePageConditionValue(direct), direct);

  let disposed = false;
  const handle = {
    async jsonValue() { return { ready: true, source: 'native-handle' }; },
    async dispose() { disposed = true; },
  };
  assert.deepEqual(await consumePageConditionValue(handle), {
    ready: true,
    source: 'native-handle',
  });
  assert.equal(disposed, true);
});
