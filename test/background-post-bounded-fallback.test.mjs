import assert from 'node:assert/strict';
import test from 'node:test';

import { postTaskAtBackgroundPriorityBounded } from '../src/core/backgroundPost.js';

test('synchronous background scheduler failure leaves the bounded fallback armed', () => {
  let h;
  h = installHarness(() => {
    assert.equal(h.timers.length, 1, 'fallback timer is installed before scheduler invocation');
    throw new Error('scheduler unavailable');
  });
  try {
    let calls = 0;
    postTaskAtBackgroundPriorityBounded(() => { calls++; }, 24);
    h.timers[0].callback();
    assert.equal(calls, 1);
  } finally { h.restore(); }
});

test('a rejected postTask promise is observed and its bounded fallback fires once', async () => {
  const h = installHarness(() => Promise.reject(new Error('scheduler rejected')));
  try {
    let calls = 0;
    postTaskAtBackgroundPriorityBounded(() => { calls++; }, 24);
    await Promise.resolve();
    assert.equal(h.timers.length, 1);
    h.timers[0].callback();
    assert.equal(calls, 1);
  } finally { h.restore(); }
});

test('background task and fallback race invokes the callback exactly once', () => {
  const h = installHarness((callback) => { callback(); return Promise.resolve(); });
  try {
    let calls = 0;
    postTaskAtBackgroundPriorityBounded(() => { calls++; }, 24);
    assert.equal(calls, 1);
    h.timers[0].callback();
    assert.equal(calls, 1);
  } finally { h.restore(); }
});

test('null scheduler rejection is not mistaken for a callback exception', async () => {
  const h = installHarness(() => Promise.reject(null));
  try {
    let calls = 0;
    postTaskAtBackgroundPriorityBounded(() => { calls++; }, 24);
    await Promise.resolve();
    assert.equal(h.timers.length, 1);
    h.timers[0].callback();
    assert.equal(calls, 1);
  } finally { h.restore(); }
});

test('a callback exception remains visible through the uncaught timer path', () => {
  const failure = new Error('callback failed');
  const h = installHarness((callback) => { callback(); return Promise.resolve(); });
  try {
    postTaskAtBackgroundPriorityBounded(() => { throw failure; }, 24);
    assert.equal(h.timers.length, 2, 'callback errors get a reporting task, in addition to the fallback');
    assert.throws(() => h.timers[1].callback(), (error) => error === failure);
  } finally { h.restore(); }
});

function installHarness(postTask) {
  const priorScheduler = Object.getOwnPropertyDescriptor(globalThis, 'scheduler');
  const priorSetTimeout = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
  const timers = [];
  Object.defineProperty(globalThis, 'scheduler', {
    configurable: true,
    writable: true,
    value: { postTask },
  });
  Object.defineProperty(globalThis, 'setTimeout', {
    configurable: true,
    writable: true,
    value(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
  });
  return {
    timers,
    restore() {
      if (priorScheduler) Object.defineProperty(globalThis, 'scheduler', priorScheduler);
      else delete globalThis.scheduler;
      if (priorSetTimeout) Object.defineProperty(globalThis, 'setTimeout', priorSetTimeout);
      else delete globalThis.setTimeout;
    },
  };
}
