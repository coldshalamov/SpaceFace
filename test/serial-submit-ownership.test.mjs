import assert from 'node:assert/strict';
import test from 'node:test';
import { makeGpuQueueSubmitter } from '../src/render/gpuQueuePace.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function owner({ parallel = false } = {}) {
  let lost = false;
  const gl = { getExtension: () => parallel ? {} : null, isContextLost: () => lost, finish() {} };
  const renderer = { getContext: () => gl, extensions: { get: () => parallel ? {} : null } };
  return { renderer, lose: () => { lost = true; } };
}

test('a renderer reservation includes asynchronous submission and its drain', async () => {
  const h = owner(), gate = deferred(), order = [];
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => { order.push('drain'); } });
  const a = submit(async () => { order.push('a:start'); await gate.promise; order.push('a:submit'); });
  const b = submit(() => { order.push('b:submit'); });
  await Promise.resolve();
  assert.deepEqual(order, ['a:start']);
  gate.resolve(); await Promise.all([a, b]);
  assert.deepEqual(order, ['a:start', 'a:submit', 'drain', 'b:submit', 'drain']);
});

test('queued urgent units precede ordinary units without interrupting the active unit', async () => {
  const h = owner(), gate = deferred(), order = [];
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => {} });
  const active = submit(async () => { order.push('active'); await gate.promise; });
  const ordinary = submit(() => { order.push('ordinary'); });
  const urgent = submit(() => { order.push('urgent'); }, { urgent: true });
  gate.resolve(); await Promise.all([active, ordinary, urgent]);
  assert.deepEqual(order, ['active', 'urgent', 'ordinary']);
});

test('independent renderer contexts do not share a reservation', async () => {
  const a = owner(), b = owner(), gate = deferred();
  const submitA = makeGpuQueueSubmitter(a.renderer, { paceQueue: async () => {} });
  const submitB = makeGpuQueueSubmitter(b.renderer, { paceQueue: async () => {} });
  let aDone = false;
  const stuck = submitA(async () => { await gate.promise; aDone = true; });
  assert.equal(await submitB(() => 'b-ready'), 'b-ready');
  assert.equal(aDone, false);
  gate.resolve(); await stuck;
});

test('throwing submission drains its prefix, releases the queue and retains its exact error', async () => {
  const h = owner(), order = [], error = new Error('driver submission');
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => { order.push('drain'); } });
  const failed = submit(() => { order.push('prefix'); throw error; });
  const next = submit(() => { order.push('next'); return 42; });
  await assert.rejects(failed, value => value === error);
  assert.equal(await next, 42);
  assert.deepEqual(order, ['prefix', 'drain', 'next', 'drain']);
});

test('a drain failure cannot replace a submission failure or wedge later units', async () => {
  const h = owner(), primary = new Error('primary'), secondary = new Error('drain');
  let drains = 0;
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => { if (++drains === 1) throw secondary; } });
  await assert.rejects(submit(() => { throw primary; }), error => error === primary);
  assert.equal(await submit(() => 'recovered'), 'recovered');
});

test('a queued owner is rechecked before its first submission', async () => {
  const h = owner(), gate = deferred(); let active = true, calls = 0;
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => {} });
  const held = submit(() => gate.promise);
  const retired = submit(() => { calls++; }, { isActive: () => active });
  active = false; gate.resolve(); await held;
  assert.deepEqual(await retired, { skipped: true, reason: 'owner-inactive' });
  assert.equal(calls, 0);
  assert.equal(await submit(() => 'next'), 'next');
});

test('context loss before queued submission skips GL work and releases ownership', async () => {
  const h = owner(), gate = deferred(); let calls = 0;
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => {} });
  const held = submit(() => gate.promise);
  await Promise.resolve();
  const lost = submit(() => { calls++; });
  h.lose(); gate.resolve(); await held;
  assert.equal((await lost).contextLost, true);
  assert.equal(calls, 0);
});

test('KHR keeps its existing overlapping route without a serial reservation', () => {
  assert.equal(makeGpuQueueSubmitter(owner({ parallel: true }).renderer), null);
});
