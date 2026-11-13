import assert from 'node:assert/strict';
import test from 'node:test';

import {
  armCallbackAfterPresent,
  postTaskAtBackgroundPriority,
  yieldAfterPresent,
} from '../src/render/compilePresentSlice.js';

// Behaviour of the after-present scheduling primitives in compilePresentSlice.js.
//
// WHAT IS DELIBERATELY NOT TESTED HERE. This file originally also asserted, by SOURCE REGEX, that
// partsLibrary.js routes flight upgrades through armCallbackAfterPresent. Those assertions were
// removed with the change they pinned: a clean A/B rejected it (it removed the entering-flight
// brick in only one of two runs, and raised the hitch count 15 -> 80 when it did apply). See the
// note on scheduleUpgradeFrame in partsLibrary.js for the numbers.
//
// A source-regex assertion could not have caught either failure. It proves the code has a SHAPE,
// never that the shape helps. The tests below drive the primitives and observe ORDER.

test('armCallbackAfterPresent runs after the display callback, not inside it', async () => {
  const order = [];
  const realRaf = globalThis.requestAnimationFrame;
  const realTimeout = globalThis.setTimeout;
  const realScheduler = globalThis.scheduler;
  globalThis.scheduler = undefined;
  globalThis.requestAnimationFrame = (cb) => {
    order.push('raf');
    cb();
    return 1;
  };
  globalThis.setTimeout = (cb) => {
    order.push('timeout');
    cb();
    return 1;
  };
  try {
    await new Promise((resolve) => {
      armCallbackAfterPresent(() => {
        order.push('job');
        resolve();
      });
    });
    assert.equal(order[0], 'raf');
    assert.ok(order.includes('timeout'));
    assert.ok(order.includes('job'));
    assert.ok(order.indexOf('timeout') < order.indexOf('job'));
    assert.notEqual(order[1], 'job');
  } finally {
    globalThis.requestAnimationFrame = realRaf;
    globalThis.setTimeout = realTimeout;
    globalThis.scheduler = realScheduler;
  }
});

test('armCallbackAfterPresent uses scheduler.yield when priorities are unavailable', async () => {
  const order = [];
  const realRaf = globalThis.requestAnimationFrame;
  const realTimeout = globalThis.setTimeout;
  const realScheduler = globalThis.scheduler;
  globalThis.requestAnimationFrame = (cb) => {
    order.push('raf');
    cb();
    return 1;
  };
  globalThis.setTimeout = (cb, ms) => {
    order.push(`timeout:${ms ?? 0}`);
    // Do not run the unstick timer synchronously — yield should win the race.
    return 1;
  };
  globalThis.scheduler = {
    yield: async () => { order.push('yield'); },
  };
  try {
    await new Promise((resolve) => {
      armCallbackAfterPresent(() => {
        order.push('job');
        resolve();
      });
    });
    assert.equal(order[0], 'raf');
    assert.ok(order.includes('yield'));
    assert.ok(order.includes('job'));
    assert.ok(order.indexOf('yield') < order.indexOf('job'));
    assert.ok(!order.includes('timeout:0'), 'must not stack setTimeout(0) when yield exists');
  } finally {
    globalThis.requestAnimationFrame = realRaf;
    globalThis.setTimeout = realTimeout;
    globalThis.scheduler = realScheduler;
  }
});

test('admission posts background work even when a boosted continuation is available', async () => {
  const realScheduler = globalThis.scheduler;
  let run;
  let calls = 0;
  globalThis.scheduler = {
    yield() { assert.fail('yield would inherit the foreground task priority'); },
    postTask(callback, options) {
      assert.deepEqual(options, { priority: 'background' });
      run = callback;
    },
  };
  try {
    postTaskAtBackgroundPriority(() => { calls++; });
    assert.equal(calls, 0);
    run();
    assert.equal(calls, 1);
  } finally {
    globalThis.scheduler = realScheduler;
  }
});

test('yieldAfterPresent settles only after the display callback', async () => {
  const order = [];
  const realRaf = globalThis.requestAnimationFrame;
  const realTimeout = globalThis.setTimeout;
  const realScheduler = globalThis.scheduler;
  globalThis.scheduler = undefined;
  globalThis.requestAnimationFrame = (cb) => {
    order.push('raf');
    cb();
    return 1;
  };
  globalThis.setTimeout = (cb) => {
    order.push('timeout');
    cb();
    return 1;
  };
  try {
    const pending = yieldAfterPresent().then(() => order.push('yielded'));
    await pending;
    assert.equal(order[0], 'raf');
    assert.ok(order.includes('timeout'));
    assert.ok(order.includes('yielded'));
    assert.ok(order.indexOf('timeout') < order.indexOf('yielded'));
    assert.notEqual(order[1], 'yielded');
  } finally {
    globalThis.requestAnimationFrame = realRaf;
    globalThis.setTimeout = realTimeout;
  }
});
