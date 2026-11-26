import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { laneSetMode } from '../src/core/simLaneCommands.js';
import { createScreenManager } from '../src/ui/screenManager.js';
import { beginScreenRegistrationCycle, invalidateScreenRegistrationCycle, ui } from '../src/ui/uiRoot.js';
import { makeDocument } from './helpers/mini-dom.mjs';

function fixture({ mode = 'menu', top = 'newGame', mountMs = 0 } = {}) {
  const keys = ['document', 'requestAnimationFrame', 'scheduler', 'setTimeout', 'clearTimeout', 'performance'];
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

  const document = makeDocument();
  document.addEventListener = () => {};
  document.removeEventListener = () => {};
  globalThis.document = document;
  const screens = document.createElement('div');
  screens.id = 'screens';
  screens.removeChild = child => child.remove();
  document.body.appendChild(screens);

  const owner = Object.create(ui);
  const stack = top ? [top] : [];
  owner.state = { mode, ui: { screenStack: stack } };
  owner.bus = createBus();
  const manager = createScreenManager({
    state: owner.state, bus: owner.bus, timeEffects: { clear() {}, set() {} },
  });
  for (const id of ['pause', 'settings']) {
    manager.register({
      id,
      mount(el) {
        calls.push('mount:' + id);
        Object.defineProperty(el, 'offsetHeight', { get() { calls.push('paint:' + id); return 1; } });
        now += mountMs;
      },
      onShow(ctx) {
        if (id === 'pause' && ctx.state.mode === 'flight') laneSetMode(ctx.state, ctx.bus, 'paused');
        calls.push('show:' + id);
      },
    });
  }
  owner.screenManager = manager;
  owner._screenPrewarmQueue = ['pause', 'settings'];
  owner._screenPrewarmDraining = false;
  owner._screenRegistrationCycle = beginScreenRegistrationCycle(owner, manager);
  owner._bindScreenPrewarmWake(owner._screenRegistrationCycle);

  const frame = async () => {
    await Promise.resolve(); // Finish the synchronous screen/mode transition before the wake check.
    for (const callback of frames.splice(0)) callback(now);
    for (const callback of tasks.splice(0)) callback();
    await Promise.resolve();
    await Promise.resolve();
  };
  return {
    owner, manager, calls, frame, screens, pendingFrames: () => frames.length,
    setTop(value) {
      stack.splice(0, stack.length, value);
      manager.syncVisibility();
    },
    setMode(value) {
      owner.state.mode = value;
      owner.bus.emit('mode:changed', { mode: value });
    },
    dock() {
      owner.state.ui.docked = true;
      manager.syncVisibility();
    },
    start() { owner._drainScreenPrewarmQueue(); },
    async close() {
      owner._screenPrewarmWakeOff();
      invalidateScreenRegistrationCycle(owner);
      await frame();
      manager.destroy();
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('New Game parks the warm queue with no frame polling and Back resumes it', async () => {
  const f = fixture();
  try {
    f.start();
    await f.frame();
    assert.equal(f.pendingFrames(), 0);
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.owner._screenPrewarmQueue, ['pause', 'settings']);

    f.setTop('mainMenu');
    await f.frame();
    assert.deepEqual(f.calls, ['mount:pause', 'paint:pause']);
    await f.frame();
    assert.deepEqual(f.calls, ['mount:pause', 'paint:pause', 'mount:settings', 'paint:settings']);
    assert.equal(f.owner._screenPrewarmDraining, false);
  } finally { await f.close(); }
});

test('resuming flight between mount and layout defers only the unfinished work to loading', async () => {
  const f = fixture({ top: 'mainMenu', mountMs: 7 });
  try {
    f.start();
    await f.frame();
    assert.deepEqual(f.calls, ['mount:pause']);

    f.setMode('flight');
    await f.frame();
    assert.deepEqual(f.calls, ['mount:pause']);
    assert.deepEqual(f.owner._screenPrewarmQueue, ['pause', 'settings']);
    assert.equal(f.pendingFrames(), 0);

    f.setMode('loading');
    await f.frame();
    assert.deepEqual(f.calls, ['mount:pause', 'paint:pause']);
  } finally { await f.close(); }
});

test('Pause opens and focuses on demand in flight while the optional queue waits for the paused screen', async () => {
  const f = fixture({ mode: 'flight', top: null });
  try {
    f.start();
    await f.frame();
    assert.equal(f.pendingFrames(), 0);
    assert.deepEqual(f.calls, []);

    f.manager.pushScreen('pause');
    const pause = f.screens.firstElementChild;
    assert.deepEqual(f.calls, ['mount:pause', 'show:pause']);
    assert.equal(f.manager.top(), 'pause');
    assert.equal(pause.getAttribute('aria-modal'), 'true');
    assert.equal(pause.inert, false);
    assert.equal(globalThis.document.activeElement, pause);

    await f.frame();
    await f.frame();
    assert.equal(pause.classList.contains('sf-screen--visible'), true);
    assert.deepEqual(f.calls, ['mount:pause', 'show:pause', 'mount:settings', 'paint:settings']);
  } finally { await f.close(); }
});

test('docking wakes the optional queue without changing flight mode', async () => {
  const f = fixture({ mode: 'flight', top: null });
  try {
    f.start();
    assert.equal(f.pendingFrames(), 0);
    f.dock();
    assert.equal(f.owner.state.mode, 'flight');
    assert.deepEqual(f.calls, []);

    await f.frame();
    assert.deepEqual(f.calls, ['mount:pause', 'paint:pause']);
  } finally { await f.close(); }
});

test('an in-flight callback from a retired manager leaves the replacement queue to its own drain', async () => {
  const f = fixture({ top: 'mainMenu' });
  try {
    f.start();
    const replacement = {
      top: () => 'mainMenu',
      prewarm(id) { f.calls.push('replacement-mount:' + id); },
      paintWarm(id) { f.calls.push('replacement-paint:' + id); },
    };
    f.owner.screenManager = replacement;
    f.owner._screenPrewarmQueue = ['help'];
    f.owner._screenRegistrationCycle = beginScreenRegistrationCycle(f.owner, replacement);
    f.start();

    await f.frame();
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.owner._screenPrewarmQueue, ['help']);
    await f.frame();
    assert.deepEqual(f.calls, ['replacement-mount:help', 'replacement-paint:help']);
    assert.equal(f.owner._screenPrewarmDraining, false);
  } finally { await f.close(); }
});
