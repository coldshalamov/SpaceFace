// New Game embark speculation — the scheduling contract, exercised through the real scheduler.
//
// The screen arms one whole-sector warm while the player is still on the form. That work must
// leave the gesture task, wait for the displayed frame, and still run when the main thread is
// busy or rAF is throttled. Hiding or disposing the screen invalidates the pending warm.
//
// This used to rebuild the screen's methods with `new Function` over a slice of newGame.js.
// That pinned source text and could not survive a refactor. The scheduler is the real exported
// module; the screen state transitions below are the real exported object's methods.
import assert from 'node:assert/strict';
import test from 'node:test';

import { armCallbackAfterPresent } from '../src/render/compilePresentSlice.js';
import { newGameScreen } from '../src/ui/screens/newGame.js';

function harness({ raf = true } = {}) {
  const previous = Object.fromEntries(['requestAnimationFrame', 'scheduler', 'setTimeout', 'clearTimeout']
    .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const frames = [];
  const tasks = [];
  const timers = [];
  let now = 0;
  let nextTimer = 1;
  globalThis.requestAnimationFrame = raf ? (callback) => { frames.push(callback); return frames.length; } : undefined;
  globalThis.scheduler = { postTask(callback) { tasks.push(callback); } };
  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    const id = nextTimer++;
    timers.push({ id, callback: () => callback(...args), due: now + Number(delay || 0) });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    const index = timers.findIndex((timer) => timer.id === id);
    if (index >= 0) timers.splice(index, 1);
  };
  return {
    frame() { for (const callback of frames.splice(0)) callback(now); },
    task() { for (const callback of tasks.splice(0)) callback(); },
    timers() { return timers.length; },
    advance(ms) {
      now += ms;
      for (;;) {
        const due = timers.filter((timer) => timer.due <= now).sort((a, b) => a.due - b.due)[0];
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        due.callback();
      }
    },
    close() {
      for (const [key, descriptor] of Object.entries(previous)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('the warm leaves the gesture task and runs in the frame background task, once', () => {
  const h = harness();
  try {
    let calls = 0;
    armCallbackAfterPresent(() => { calls++; }, { idleBoundMs: 48 });
    assert.equal(calls, 0, 'never synchronous — the form must not pay the warm in the gesture');
    h.frame();
    assert.equal(calls, 0, 'the display callback only arms the post-present task');
    h.task();
    assert.equal(calls, 1);
    h.advance(48);
    h.task();
    assert.equal(calls, 1, 'the two arming paths coalesce at the scheduler seam');
  } finally { h.close(); }
});

test('a busy main thread still delivers the warm on the bounded timer', () => {
  const h = harness();
  try {
    let calls = 0;
    armCallbackAfterPresent(() => { calls++; }, { idleBoundMs: 48 });
    h.frame();
    assert.equal(h.timers(), 2, 'the outer arm and the bounded fallback both have a timer');
    h.advance(48);
    assert.equal(calls, 1, 'starvation cannot hold the warm forever');
    h.task();
    assert.equal(calls, 1);
  } finally { h.close(); }
});

test('a document without rAF uses the headless timer path', () => {
  const h = harness({ raf: false });
  try {
    let calls = 0;
    armCallbackAfterPresent(() => { calls++; });
    assert.equal(calls, 0);
    h.advance(0);
    assert.equal(calls, 0, 'the timer only posts the background task');
    h.task();
    assert.equal(calls, 1);
  } finally { h.close(); }
});

test('hiding invalidates the pending warm and a re-show can own a fresh one', () => {
  const h = harness();
  const screen = Object.create(newGameScreen);
  try {
    screen._embarkSpecActive = true;
    screen._embarkSpecQueued = {};
    let emitted = 0;
    armCallbackAfterPresent(() => {
      if (screen._embarkSpecActive && screen._embarkSpecQueued) emitted++;
    }, { idleBoundMs: 48 });
    screen.onHide();
    assert.equal(screen._embarkSpecActive, false);
    assert.equal(screen._embarkSpecQueued, null);
    h.frame();
    h.task();
    assert.equal(emitted, 0, 'a hidden screen never warms the sector behind the menu');

    screen._embarkSpecActive = true;
    screen._embarkSpecQueued = {};
    armCallbackAfterPresent(() => {
      if (screen._embarkSpecActive && screen._embarkSpecQueued) emitted++;
    }, { idleBoundMs: 48 });
    h.frame();
    h.task();
    assert.equal(emitted, 1, 'the re-show owns its new request');
  } finally { h.close(); }
});

test('dispose invalidates the pending warm and clears the queued token', () => {
  const h = harness();
  const screen = Object.create(newGameScreen);
  try {
    screen._embarkSpecActive = true;
    screen._embarkSpecQueued = {};
    let emitted = 0;
    armCallbackAfterPresent(() => {
      if (screen._embarkSpecActive && screen._embarkSpecQueued) emitted++;
    }, { idleBoundMs: 48 });
    screen.dispose();
    assert.equal(screen._embarkSpecActive, false);
    assert.equal(screen._embarkSpecQueued, null);
    h.frame();
    h.advance(48);
    h.task();
    assert.equal(emitted, 0, 'a disposed screen cannot receive a late warm');
  } finally { h.close(); }
});

test('a missing callback is ignored rather than scheduling undefined work', () => {
  const h = harness();
  try {
    assert.doesNotThrow(() => armCallbackAfterPresent(null));
    h.frame();
    h.advance(48);
    h.task();
  } finally { h.close(); }
});
