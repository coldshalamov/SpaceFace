import test from 'node:test';
import assert from 'node:assert/strict';
import { beginScreenRegistrationCycle, ui } from '../src/ui/uiRoot.js';

function fixture(top = 'newGame') {
  const keys = ['requestAnimationFrame', 'scheduler', 'setTimeout', 'clearTimeout', 'performance'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const frames = [];
  const tasks = [];
  const timers = new Map();
  const calls = [];
  let nextTimer = 0;
  let now = 0;
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  globalThis.scheduler = { postTask: callback => { tasks.push(callback); } };
  globalThis.setTimeout = callback => { timers.set(++nextTimer, callback); return nextTimer; };
  globalThis.clearTimeout = id => timers.delete(id);
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  const owner = Object.create(ui);
  owner.state = { mode: 'menu' };
  const manager = {
    top: () => top,
    prewarm(id) { calls.push(`mount:${id}`); },
    paintWarm(id) { calls.push(`paint:${id}`); },
  };
  owner.screenManager = manager;
  owner._screenPrewarmQueue = ['pause', 'settings'];
  owner._screenPrewarmDraining = false;
  const cycle = beginScreenRegistrationCycle(owner, manager);
  const frame = async () => {
    for (const callback of frames.splice(0)) callback(now);
    for (const callback of tasks.splice(0)) callback();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { owner, manager, cycle, calls, frame,
    setTop(value) { top = value; },
    setMode(value) { owner.state.mode = value; },
    spend(ms) { now += ms; },
    start() { owner._drainScreenPrewarmQueue(cycle); },
    async close() {
      // Let a parked drain finish before removing the fake scheduling environment.
      top = 'mainMenu';
      for (let i = 0; owner._screenPrewarmDraining && i < 10; i++) await frame();
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('New Game holds unrelated mounts/layouts and Back resumes the same queue', async () => {
  const f = fixture();
  try {
    f.start();
    await f.frame();
    await f.frame();
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.owner._screenPrewarmQueue, ['pause', 'settings']);
    f.setTop('mainMenu');
    await f.frame();
    assert.deepEqual(f.calls, ['mount:pause', 'paint:pause']);
    await f.frame();
    assert.deepEqual(f.calls, ['mount:pause', 'paint:pause', 'mount:settings', 'paint:settings']);
    await f.frame();
    assert.equal(f.owner._screenPrewarmDraining, false);
  } finally { await f.close(); }
});

test('New Game opening between mount and paint retains the unfinished warm', async () => {
  const f = fixture('mainMenu');
  try {
    f.manager.prewarm = id => { f.calls.push(`mount:${id}`); f.spend(7); };
    f.start();
    assert.deepEqual(f.calls, ['mount:pause']);
    f.setTop('newGame');
    await f.frame();
    await f.frame();
    assert.deepEqual(f.calls, ['mount:pause']);
    assert.deepEqual(f.owner._screenPrewarmQueue, ['pause', 'settings']);
    f.setMode('loading');
    await f.frame();
    await f.frame();
    assert.deepEqual(f.calls.slice(0, 3), ['mount:pause', 'mount:pause', 'paint:pause']);
  } finally { await f.close(); }
});

test('a retired parked drain leaves the replacement registration queue alone', async () => {
  const f = fixture();
  try {
    f.start();
    const replacement = { top: () => 'mainMenu',
      prewarm(id) { f.calls.push(`replacement-mount:${id}`); },
      paintWarm(id) { f.calls.push(`replacement-paint:${id}`); } };
    f.owner.screenManager = replacement;
    f.owner._screenPrewarmQueue = ['help'];
    const next = beginScreenRegistrationCycle(f.owner, replacement);
    await f.frame();
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.owner._screenPrewarmQueue, ['help']);
    assert.equal(f.owner._screenPrewarmDraining, false);
    f.owner._drainScreenPrewarmQueue(next);
    assert.deepEqual(f.calls, ['replacement-mount:help', 'replacement-paint:help']);
    await f.frame();
  } finally { await f.close(); }
});
