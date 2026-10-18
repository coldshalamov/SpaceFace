// Shell-focus pause release — the native shell lifecycle port is authoritative
// about focus on Electron (electron/main.cjs publishes win.isFocused() state),
// while the focus-loss pause hold is only cleared by the DOM focus/input path.
// A blur that never gets a matching DOM focus event leaves 'window-focus-loss'
// holding the clock at scale 0 even though the native window is confirmed
// focused. An accepted 'foreground-visible' command must release that hold —
// and only that hold.
import test from 'node:test';
import assert from 'node:assert/strict';

import { LOOP_FIXED_DT, startLoop } from '../src/core/loop.js';
import {
  FOCUS_LOSS_TIME_SOURCE,
  syncFocusLossHold,
} from '../src/core/focusLossHold.js';
import { createTimeEffects } from '../src/core/timeEffects.js';

const UI_SOURCE = 'ui:pausing-screen';

function createRaf() {
  let nextId = 1;
  const pending = new Map();
  return {
    requestFrame(callback) {
      const id = nextId++;
      pending.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      pending.delete(id);
    },
    flushOne(now) {
      const entry = pending.entries().next().value;
      assert.ok(entry, 'expected one presentation callback');
      pending.delete(entry[0]);
      entry[1](now);
    },
    count: () => pending.size,
  };
}

function createFocusTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    emit(type) {
      const listener = listeners.get(type);
      assert.ok(listener, `expected a ${type} listener`);
      listener();
    },
  };
}

function createHarness({ state } = {}) {
  const raf = createRaf();
  let now = 1000;
  const focusTarget = createFocusTarget();
  let shellListener = null;
  const lifecyclePort = {
    subscribe(listener) {
      shellListener = listener;
      return () => { shellListener = null; };
    },
  };
  const visibilityTarget = {
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {},
  };
  const controller = startLoop(state, {
    renderUpdate() {
      if (state.render) state.render.worldSubmittedFrames = (state.render.worldSubmittedFrames || 0) + 1;
    },
    get() { return null; },
  }, {
    simulationRunner: {
      fixedDt: LOOP_FIXED_DT,
      maxSteps: 4,
      advance() {
        return { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
      },
      prepareWithoutAdvance() {
        return { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 };
      },
      consumeLatestCompletedTick() { return 0; },
      interpolationAlpha() { return 0; },
      setLifecycleGeneration() {},
      setClockActive() {},
      close() { return true; },
      getDiagnostics() { return {}; },
    },
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: () => now,
    visibilityTarget,
    focusTarget,
    inputResumeTarget: null,
    lifecyclePort,
  });
  return { raf, focusTarget, controller, shell: (command) => shellListener(command),
    frame(ms = 17) { now += ms; raf.flushOne(now); } };
}

function pausedSources(state) {
  return Object.keys(createTimeEffects(state).describeRequests()).sort();
}

test('accepted foreground-visible shell command releases the blur hold', () => {
  const state = { accumulator: 0, timeScale: 1, tick: 0, simTime: 0, input: { actions: {} } };
  const { focusTarget, controller, shell } = createHarness({ state });

  focusTarget.emit('blur');
  assert.equal(state.timeScale, 0, 'DOM blur must raise the focus-loss pause');
  assert.deepEqual(pausedSources(state), [FOCUS_LOSS_TIME_SOURCE]);

  // The native window reports focused, but no DOM focus event arrives — the
  // dropped-event shape the shell command exists to cover.
  shell({ state: 'foreground-visible', sequence: 1, reason: 'focus' });
  assert.equal(controller.getDiagnostics().shellState, 'foreground-visible');
  assert.equal(state.timeScale, 1,
    'an accepted foreground-visible command must release the window-focus-loss hold');
  assert.deepEqual(pausedSources(state), []);

  controller.stop();
});

test('foreground-visible releases only window-focus-loss, not independent holds', () => {
  const state = { accumulator: 0, timeScale: 1, tick: 0, simTime: 0, input: { actions: {} } };
  const { focusTarget, controller, shell } = createHarness({ state });

  focusTarget.emit('blur');
  createTimeEffects(state).set(UI_SOURCE, { scale: 0 });
  assert.equal(state.timeScale, 0);
  assert.deepEqual(pausedSources(state), [FOCUS_LOSS_TIME_SOURCE, UI_SOURCE].sort());

  shell({ state: 'foreground-visible', sequence: 1, reason: 'focus' });
  assert.deepEqual(pausedSources(state), [UI_SOURCE],
    'a menu/photo hold owned by another source must survive the focus release');
  assert.equal(state.timeScale, 0, 'the independent hold still pauses the clock');

  createTimeEffects(state).clear(UI_SOURCE);
  assert.equal(state.timeScale, 1);

  controller.stop();
});

test('invalid, stale, and non-foreground shell commands keep the blur hold', () => {
  const state = { accumulator: 0, timeScale: 1, tick: 0, simTime: 0, input: { actions: {} } };
  const { focusTarget, controller, shell } = createHarness({ state });

  focusTarget.emit('blur');
  assert.equal(state.timeScale, 0);

  // A genuinely backgrounded shell must not release the focus pause.
  shell({ state: 'hidden-or-minimized', sequence: 1, reason: 'minimize' });
  assert.equal(state.timeScale, 0, 'hidden/minimized keeps the blur hold');
  assert.deepEqual(pausedSources(state), [FOCUS_LOSS_TIME_SOURCE]);

  // Rejected commands never reach the release: stale sequence and bad shape.
  shell({ state: 'foreground-visible', sequence: 0, reason: 'focus' });
  shell({ state: 'foreground-visible', reason: 'focus' });
  assert.equal(state.timeScale, 0, 'invalid commands cannot release the hold');
  const diagnostics = controller.getDiagnostics();
  assert.equal(diagnostics.invalidShellCommandCount, 2);

  // Focused and foregrounded again: the valid command still releases.
  focusTarget.emit('blur');
  shell({ state: 'foreground-visible', sequence: 2, reason: 'focus' });
  assert.equal(state.timeScale, 1);
  assert.deepEqual(pausedSources(state), []);

  // A genuinely occluded native window pauses even without a DOM blur. A stale
  // focused command and a duplicate background command cannot replay a release.
  shell({ state: 'foreground-occluded', sequence: 3, reason: 'blur' });
  shell({ state: 'foreground-visible', sequence: 2, reason: 'focus' });
  shell({ state: 'foreground-occluded', sequence: 3, reason: 'blur' });
  assert.equal(state.timeScale, 0, 'rejected commands are not release paths');
  assert.equal(controller.getDiagnostics().staleShellCommandCount, 1);
  assert.equal(controller.getDiagnostics().duplicateShellCommandCount, 1);

  controller.stop();
});

test('late DOM blur cannot override accepted native foreground focus', () => {
  const state = { accumulator: 0, timeScale: 1, tick: 0, simTime: 0, input: { actions: {} } };
  const { focusTarget, controller, shell } = createHarness({ state });
  shell({ state: 'foreground-visible', sequence: 1, reason: 'focus' });
  focusTarget.emit('blur');
  assert.equal(state.timeScale, 1, 'native focus wins over a delayed DOM blur');
  assert.deepEqual(pausedSources(state), []);
  controller.stop();
});

test('native occlusion pauses without DOM blur and native focus resumes without DOM focus', () => {
  const state = { accumulator: 0, timeScale: 1, tick: 0, simTime: 0, input: { actions: {} } };
  const { focusTarget, controller, shell } = createHarness({ state });
  shell({ state: 'foreground-visible', sequence: 1, reason: 'focus' });
  shell({ state: 'foreground-occluded', sequence: 2, reason: 'blur' });
  assert.equal(state.timeScale, 0);
  assert.deepEqual(pausedSources(state), [FOCUS_LOSS_TIME_SOURCE]);
  shell({ state: 'foreground-visible', sequence: 3, reason: 'focus' });
  assert.equal(state.timeScale, 1);
  focusTarget.emit('blur');
  assert.equal(state.timeScale, 1, 'a late DOM event cannot orphan the pause again');
  controller.stop();
});

test('a silent pose hold records the actual pause owner while world submissions continue', () => {
  const state = { accumulator: 0, timeScale: 1, tick: 0, simTime: 0, mode: 'flight',
    input: { actions: {} }, playerId: 1, render: { worldSubmittedFrames: 0 },
    entities: new Map([[1, { pos: { x: 10, z: 20 }, vel: { x: 200, z: 0 } }]]) };
  const h = createHarness({ state });
  const reports = [];
  const original = console.info;
  console.info = (prefix, payload) => { if (prefix === '[world-motion-hold]') reports.push(JSON.parse(payload)); };
  try {
    h.shell({ state: 'foreground-occluded', sequence: 1, reason: 'blur' });
    for (let i = 0; i < 180; i++) h.frame();
    assert.equal(reports.length, 1, 'repeated held frames produce one bounded report');
    assert.equal(reports[0].clockScale, 0);
    assert.equal(reports[0].pauseRequests[FOCUS_LOSS_TIME_SOURCE].scale, 0);
    assert.equal(reports[0].shellState, 'foreground-occluded');
    assert.ok(reports[0].worldSubmissions > 0);
    assert.equal(state.timeScale, 0, 'observation does not clear or create pause requests');
  } finally { console.info = original; h.controller.stop(); }
});

test('ordinary movement and a resting ship do not report a motion hold', () => {
  const player = { pos: { x: 10, z: 20 }, vel: { x: 200, z: 0 } };
  const state = { accumulator: 0, timeScale: 1, tick: 0, simTime: 0, mode: 'flight',
    input: { actions: {} }, playerId: 1, render: { worldSubmittedFrames: 0 }, entities: new Map([[1, player]]) };
  const h = createHarness({ state });
  let reports = 0;
  const original = console.info;
  console.info = (prefix) => { if (prefix === '[world-motion-hold]') reports++; };
  try {
    for (let i = 0; i < 180; i++) { player.pos.x++; state.simTime += 1 / 60; h.frame(); }
    player.vel.x = 0;
    for (let i = 0; i < 180; i++) h.frame();
    assert.equal(reports, 0);
  } finally { console.info = original; h.controller.stop(); }
});
