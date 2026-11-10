import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pushSharedPlayerStore, resetSharedPlayerStoreMemoForTests, sharedPlayerStoreLastAcceptedWrite,
} from '../src/save/sharedPlayerStore.js';

async function flushMicrotasks() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

function controlledStore(t) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'http:' } });
  resetSharedPlayerStoreMemoForTests();
  const requests = [];
  let active = 0, peak = 0;
  t.mock.method(globalThis, 'fetch', (_url, options) => {
    active += 1; peak = Math.max(peak, active);
    return new Promise((resolve, reject) => {
      let settled = false;
      requests.push({ options, finish(ok = true, body = null) {
        if (settled) return;
        settled = true; active -= 1;
        if (ok) resolve({ ok: true, status: 200, body });
        else reject(new Error('injected store failure'));
      } });
    });
  });
  t.after(async () => {
    // Also release queued requests after an assertion failure, so no test owns a live tail.
    for (let round = 0; round < 12; round++) {
      for (const request of requests) request.finish();
      await flushMicrotasks();
    }
    resetSharedPlayerStoreMemoForTests();
    if (descriptor) Object.defineProperty(globalThis, 'location', descriptor);
    else delete globalThis.location;
  });
  return { requests, peak: () => peak };
}

for (const firstSucceeds of [true, false]) {
  test(`later regular writes cannot overtake a queued mirror after the first ${firstSucceeds ? 'success' : 'failure'}`, async t => {
    const store = controlledStore(t);
    const first = pushSharedPlayerStore({ 'sf.save.1': 'first' });
    const second = pushSharedPlayerStore({ 'sf.save.1': 'second' });
    assert.equal(store.requests.length, 1, 'uncontended first write starts synchronously');
    store.requests[0].finish(firstSucceeds);
    assert.equal(await first, firstSucceeds);
    await flushMicrotasks();
    assert.equal(store.requests.length, 2, 'second write starts after first settles');
    const third = pushSharedPlayerStore({ 'sf.save.1': 'third' });
    await flushMicrotasks();
    assert.equal(store.requests.length, 2, 'third must wait for the active second write');
    store.requests[1].finish();
    assert.equal(await second, true);
    await flushMicrotasks();
    assert.equal(store.requests.length, 3);
    const fourth = pushSharedPlayerStore({ 'sf.save.1': 'fourth' });
    await flushMicrotasks();
    assert.equal(store.requests.length, 3, 'ownership follows the entire queue, not only its first request');
    store.requests[2].finish(); await third; await flushMicrotasks();
    store.requests[3].finish(); await fourth;
    assert.equal(store.peak(), 1, 'at most one regular PUT is in flight');
    assert.deepEqual(store.requests.map(r => JSON.parse(r.options.body).keys['sf.save.1']),
      ['first', 'second', 'third', 'fourth']);
    const afterIdle = pushSharedPlayerStore({ 'sf.save.1': 'after-idle' });
    assert.equal(store.requests.length, 5, 'idle queue releases the synchronous fast path');
    store.requests[4].finish(); await afterIdle;
  });
}

test('small page-exit keepalive still bypasses regular queue; oversized keepalive remains serialized', async t => {
  const store = controlledStore(t);
  const first = pushSharedPlayerStore({ 'sf.save.1': 'first' });
  const second = pushSharedPlayerStore({ 'sf.save.1': 'second' });
  const exiting = pushSharedPlayerStore({ 'sf.settings.profile.v1': '{}' }, { keepalive: true });
  assert.equal(store.requests.length, 2);
  assert.equal(store.requests[1].options.keepalive, true);
  store.requests[1].finish(); await exiting;
  const large = pushSharedPlayerStore({ 'sf.save.1': 'x'.repeat(65000) }, { keepalive: true });
  assert.equal(store.requests.length, 2, 'large exit mirror cannot bypass the regular chain');
  store.requests[0].finish(); await first; await flushMicrotasks();
  assert.equal(store.requests.length, 3);
  store.requests[2].finish(); await second; await flushMicrotasks();
  assert.equal(store.requests.length, 4);
  assert.equal(store.requests[3].options.keepalive, false);
  store.requests[3].finish(); await large;
});

test('regular mirrors retain queue ownership until the acknowledgement body finishes', async t => {
  const store = controlledStore(t);
  let bodyController;
  const body = new ReadableStream({ start(controller) { bodyController = controller; } });
  t.after(() => { try { bodyController.close(); } catch (_) {} });
  const first = pushSharedPlayerStore({ 'sf.save.1': 'first' });
  const second = pushSharedPlayerStore({ 'sf.save.1': 'second' });
  let firstSettled = false;
  first.then(() => { firstSettled = true; });
  store.requests[0].finish(true, body);
  bodyController.enqueue(new Uint8Array(128 * 1024));
  await flushMicrotasks();
  assert.equal(firstSettled, false, 'HTTP 200 headers and one chunk are not a complete acknowledgement');
  assert.equal(store.requests.length, 1, 'the next PUT waits for the current response body');
  assert.equal(sharedPlayerStoreLastAcceptedWrite(), null, 'success is published only after the body completes');
  bodyController.enqueue(new Uint8Array(128 * 1024));
  bodyController.close();
  assert.equal(await first, true);
  assert.equal(body.locked, false, 'the completed stream reader is released');
  await flushMicrotasks();
  assert.equal(store.requests.length, 2);
  store.requests[1].finish();
  assert.equal(await second, true);
  assert.equal(store.peak(), 1);
});

test('an acknowledgement body deadline remains a real failure and releases the next queued mirror', async t => {
  const store = controlledStore(t);
  const deadlines = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    const controller = new AbortController();
    deadlines.push({ ms, controller });
    return controller.signal;
  });
  const first = pushSharedPlayerStore({ 'sf.save.1': 'first' });
  const second = pushSharedPlayerStore({ 'sf.save.1': 'second' });
  let bodyController;
  const body = new ReadableStream({ start(controller) { bodyController = controller; } });
  const signal = store.requests[0].options.signal;
  signal.addEventListener('abort', () => bodyController.error(signal.reason), { once: true });
  store.requests[0].finish(true, body);
  await flushMicrotasks();
  assert.equal(store.requests.length, 1, 'a pending response body still owns the serialized queue');
  assert.equal(deadlines[0].ms, 150000, 'the existing write deadline is unchanged');
  deadlines[0].controller.abort(new DOMException('injected body deadline', 'TimeoutError'));
  assert.equal(await first, false, 'a body abort cannot be relabeled successful after HTTP 200 headers');
  assert.equal(body.locked, false, 'the failed stream reader is released');
  assert.equal(sharedPlayerStoreLastAcceptedWrite(), null);
  await flushMicrotasks();
  assert.equal(store.requests.length, 2, 'a failed body cannot strand the queue');
  store.requests[1].finish();
  assert.equal(await second, true);
  assert.equal(store.peak(), 1);
});
