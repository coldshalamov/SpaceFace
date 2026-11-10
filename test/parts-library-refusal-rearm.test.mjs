// A Crucible arena refuses hundreds of boundary upgrades in one tick. The paced re-arm used to add one
// timer AND one distinct document 'visibilitychange' listener per refusal; addEventListener scans the list
// for duplicates on every add, so the loading phase paid ~2 s of a 5 s freeze there (CPU profile of a real
// run, 2026-10-28). One shared wake-up now serves them all. These tests pin the cost and the semantics.

import assert from 'node:assert/strict';
import test from 'node:test';

const listeners = [];
let visibility = 'visible';
globalThis.document = {
  get visibilityState() { return visibility; },
  addEventListener(type, fn) { listeners.push({ type, fn }); },
  removeEventListener() {},
};
const { scheduleRefusalTriggerRearm } = await import('../src/render/partsLibrary.js');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a flood of paced refusals adds at most one document listener, and every arm fires exactly once after the delay', async () => {
  const N = 3000;
  const fired = new Array(N).fill(0);
  const t0 = performance.now();
  for (let i = 0; i < N; i += 1) scheduleRefusalTriggerRearm('deferred-arena-dressing', () => { fired[i] += 1; });
  assert.ok(performance.now() - t0 < 250, 'scheduling 3000 refusals is cheap');
  assert.equal(listeners.filter((l) => l.type === 'visibilitychange').length, 1, 'one shared visibility listener, not one per refusal');
  assert.equal(fired.reduce((a, b) => a + b, 0), 0, 'paced arms wait out the delay');
  await sleep(1250);
  assert.ok(fired.every((n) => n === 1), 'each re-arm ran exactly once');
});

test('unpaced refusals still re-arm immediately', () => {
  let ran = 0;
  scheduleRefusalTriggerRearm('cancelled-before-queue', () => { ran += 1; });
  assert.equal(ran, 1);
});

test('a hidden tab that throttled the timer re-arms on the first visible return after the delay', async () => {
  visibility = 'hidden';
  let ran = 0;
  scheduleRefusalTriggerRearm('invalid-upgrade-request', () => { ran += 1; });
  const wake = listeners.find((l) => l.type === 'visibilitychange').fn;
  wake(); // still hidden: nothing may fire
  assert.equal(ran, 0);
  await sleep(1100);
  visibility = 'visible';
  wake();
  assert.equal(ran, 1, 'either the timer or the visibility return ran it, exactly once');
  await sleep(50);
  assert.equal(ran, 1, 'and never twice');
});
