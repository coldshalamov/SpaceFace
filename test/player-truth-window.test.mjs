import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { keepHeadedWindowNormal } from '../scripts/player-truth/browser.mjs';

function fixture(send, { detachFails = false } = {}) {
  const calls = []; const timers = new Map();
  let detached = 0; let created = 0;
  const session = {
    async send(method, params) { calls.push([method, params]); return send(method, params); },
    async detach() { detached++; if (detachFails) throw new Error('Browser closed'); },
  };
  const page = new EventEmitter();
  page.isClosed = () => false;
  page.context = () => ({ newCDPSession: async target => {
    assert.equal(target, page); created++; return session;
  } });
  const options = {
    headed: true, platform: 'win32',
    setTimer(fn, delay) { assert.equal(delay, 5000); const id = {}; timers.set(id, fn); return id; },
    clearTimer(id) { timers.delete(id); },
  };
  const fire = () => {
    assert.equal(timers.size, 1);
    const [id, fn] = timers.entries().next().value; timers.delete(id); return fn();
  };
  return { page, options, calls, timers, fire,
    get detached() { return detached; }, get created() { return created; } };
}

test('startup restores only the page-owned minimized window without changing bounds', async () => {
  const f = fixture(() => ({ windowId: 73, bounds: { windowState: 'minimized', width: 1280 } }));
  const stop = await keepHeadedWindowNormal(f.page, f.options);
  assert.deepEqual(f.calls, [
    ['Browser.getWindowForTarget', undefined],
    ['Browser.setWindowBounds', { windowId: 73, bounds: { windowState: 'normal' } }],
  ]);
  const queued = f.timers.values().next().value;
  await stop(); await stop(); await queued();
  assert.equal(f.calls.length, 2);
  assert.equal(f.timers.size, 0); assert.equal(f.detached, 1);
  assert.equal(f.page.listenerCount('close'), 0);
});

test('periodic checks leave normal, maximized and fullscreen windows alone, restoring a later minimization', async () => {
  const states = ['normal', 'maximized', 'fullscreen', 'minimized'];
  const f = fixture(method => method === 'Browser.getWindowForTarget'
    ? { windowId: 9, bounds: { windowState: states.shift() } } : {});
  const stop = await keepHeadedWindowNormal(f.page, f.options);
  await f.fire(); await f.fire(); await f.fire();
  assert.deepEqual(f.calls.filter(([method]) => method === 'Browser.setWindowBounds'), [
    ['Browser.setWindowBounds', { windowId: 9, bounds: { windowState: 'normal' } }],
  ]);
  await stop();
});

test('headless and non-Windows runs do not create a session or timer', async () => {
  for (const overrides of [{ headed: false }, { platform: 'linux' }]) {
    const f = fixture(() => { throw new Error('unexpected query'); });
    const stop = await keepHeadedWindowNormal(f.page, { ...f.options, ...overrides });
    await stop();
    assert.equal(f.created, 0); assert.equal(f.timers.size, 0);
  }
});

test('one in-flight check has no queued timer and cleanup prevents a late restore', async () => {
  let resolve; let queries = 0;
  const f = fixture(() => ++queries === 1
    ? { windowId: 6, bounds: { windowState: 'normal' } }
    : new Promise(r => { resolve = r; }));
  const stop = await keepHeadedWindowNormal(f.page, f.options);
  const pending = f.fire();
  assert.equal(f.timers.size, 0); assert.equal(queries, 2);
  await stop();
  resolve({ windowId: 6, bounds: { windowState: 'minimized' } });
  await pending;
  assert.equal(f.calls.length, 2); assert.equal(f.timers.size, 0);
  assert.equal(f.detached, 1);
});

test('page closure during the startup query prevents restore and detaches once', async () => {
  let resolve;
  const f = fixture(() => new Promise(r => { resolve = r; }));
  const starting = keepHeadedWindowNormal(f.page, f.options);
  await Promise.resolve(); await Promise.resolve();
  f.page.emit('close');
  resolve({ windowId: 6, bounds: { windowState: 'minimized' } });
  const stop = await starting; await stop();
  assert.equal(f.calls.length, 1); assert.equal(f.detached, 1);
  assert.equal(f.timers.size, 0);
});

test('closed-browser query and detach errors are harmless and stop polling', async () => {
  const f = fixture(() => { throw new Error('Target closed'); }, { detachFails: true });
  const stop = await keepHeadedWindowNormal(f.page, f.options);
  await stop();
  assert.equal(f.timers.size, 0); assert.equal(f.detached, 1);
  f.page.context = () => ({ newCDPSession: async () => { throw new Error('Browser closed'); } });
  await (await keepHeadedWindowNormal(f.page, f.options))();
});
