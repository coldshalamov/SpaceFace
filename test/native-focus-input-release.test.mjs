// Native-focus input release — on Electron the accepted shell lifecycle owns
// focus truth because the real desktop drops BOTH DOM blur and DOM focus on
// native focus loss (shell-focus-pause-release.test.mjs pins the clock side).
// The missing edge that fixture does not cover: foreground-occluded is a
// PRESENTING state, so enterNonPresenting's releaseHeldControls never runs —
// W/fire/reel pressed before the native blur and released while the window is
// unfocused would still read held when foreground-visible resumes the clock.
// The accepted occluded edge must release held controls exactly once through
// the existing registry 'input' seam (main lane calls input.js directly; the
// worker facade ships the same release as a {type:'blur'} lane descriptor —
// see registry.js case 'input'). Stale, duplicate, and invalid commands must
// never reach that release.
import test from 'node:test';
import assert from 'node:assert/strict';

import { LOOP_FIXED_DT, startLoop } from '../src/core/loop.js';

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
  const releases = [];
  const controller = startLoop(state, {
    renderUpdate() {
      if (state.render) state.render.worldSubmittedFrames = (state.render.worldSubmittedFrames || 0) + 1;
    },
    get(name) {
      if (name === 'input') {
        return { releaseHeldControls: (reason) => releases.push(reason) };
      }
      return null;
    },
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
  return { raf, focusTarget, controller, releases,
    shell: (command) => shellListener(command),
    frame(ms = 17) { now += ms; raf.flushOne(now); } };
}

function createState() {
  return { accumulator: 0, timeScale: 1, tick: 0, simTime: 0, input: { actions: {} } };
}

test('accepted native focus loss releases held controls once per occluded edge', () => {
  const state = createState();
  const { controller, releases, shell } = createHarness({ state });

  shell({ state: 'foreground-visible', sequence: 1, reason: 'focus' });
  assert.equal(releases.length, 0, 'focus gain is never an input release');

  // Native blur with no DOM blur: keys still latched from the focused play.
  shell({ state: 'foreground-occluded', sequence: 2, reason: 'blur' });
  assert.equal(state.timeScale, 0, 'the focus-loss hold still pauses the clock');
  assert.equal(releases.length, 1,
    'the accepted occluded edge releases held controls exactly once');
  assert.equal(releases[0], 'blur');
  assert.equal(controller.getDiagnostics().nativeFocusInputReleaseCount, 1);

  // A newer-sequence re-report of the same unfocused state (e.g. 'restore'
  // re-deriving occluded) is accepted, but is not a new focus-loss edge.
  shell({ state: 'foreground-occluded', sequence: 3, reason: 'restore' });
  assert.equal(releases.length, 1, 'a repeated occluded state releases once');
  assert.equal(controller.getDiagnostics().nativeFocusInputReleaseCount, 1);

  controller.stop();
});

test('rejected occluded commands can never wipe live input', () => {
  const state = createState();
  const { controller, releases, shell } = createHarness({ state });

  shell({ state: 'foreground-visible', sequence: 1, reason: 'focus' });
  shell({ state: 'foreground-occluded', sequence: 2, reason: 'blur' });
  shell({ state: 'foreground-visible', sequence: 3, reason: 'focus' });
  assert.equal(releases.length, 1, 'setup: one genuine focus-loss release');
  assert.equal(state.timeScale, 1, 'window focused and playing again');

  // While the player is focused and holding keys, late/invalid traffic must
  // not reach releaseHeldControls.
  shell({ state: 'foreground-occluded', sequence: 2, reason: 'stale-blur' });
  shell({ state: 'foreground-visible', sequence: 3, reason: 'duplicate-focus' });
  shell({ state: 'foreground-occluded', sequence: 0, reason: 'bad-seq' });
  shell({ state: 'foreground-occluded', reason: 'missing-seq' });
  shell({ state: 'bogus-state', sequence: 4, reason: 'bad-state' });
  shell({ state: 'foreground-occluded', sequence: 4.5, reason: 'non-integer' });
  assert.equal(releases.length, 1, 'no rejected message resets current input');
  assert.equal(controller.getDiagnostics().nativeFocusInputReleaseCount, 1);
  const diagnostics = controller.getDiagnostics();
  assert.equal(diagnostics.staleShellCommandCount, 1);
  assert.equal(diagnostics.duplicateShellCommandCount, 1);
  assert.equal(diagnostics.invalidShellCommandCount, 4);
  assert.equal(state.timeScale, 1, 'the rejected occluded claims never paused');

  controller.stop();
});

test('each new focus-loss episode releases again — held keys cannot survive resume', () => {
  const state = createState();
  const { focusTarget, controller, releases, shell } = createHarness({ state });

  // Electron blur/focus drops the DOM pair; the shell command is the only
  // focus edge the runner sees.
  shell({ state: 'foreground-occluded', sequence: 1, reason: 'blur' });
  assert.equal(releases.length, 1);
  shell({ state: 'foreground-visible', sequence: 2, reason: 'focus' });
  assert.equal(state.timeScale, 1);
  assert.equal(releases.length, 1, 'resume does not release — nothing is held');

  // Second episode: held again, lost again, released again — once.
  shell({ state: 'foreground-occluded', sequence: 3, reason: 'blur' });
  assert.equal(releases.length, 2, 'a new focus-loss edge releases the new hold');
  shell({ state: 'foreground-visible', sequence: 4, reason: 'focus' });
  assert.equal(releases.length, 2);

  // A late DOM blur arriving after native focus is already authoritative must
  // not double-release (DOM events are ignored once the shell owns focus).
  focusTarget.emit('blur');
  assert.equal(releases.length, 2, 'late DOM blur is not a second release');
  assert.equal(state.timeScale, 1, 'late DOM blur cannot re-pause either');

  controller.stop();
});

test('suspend paths still release exactly once at the non-presenting edge', () => {
  const state = createState();
  const { controller, releases, shell } = createHarness({ state });

  shell({ state: 'hidden-or-minimized', sequence: 1, reason: 'minimize' });
  assert.equal(releases.length, 1, 'the existing suspend release is intact');
  shell({ state: 'system-suspended', sequence: 2, reason: 'suspend' });
  assert.equal(releases.length, 1, 'repeated non-presenting commands release once');

  // Restoring while still unfocused: occluded is a presenting state, so the
  // loop comes back under the focus-loss hold — and the occluded edge release
  // still applies to anything the suspend release could not have seen.
  shell({ state: 'foreground-occluded', sequence: 3, reason: 'restore' });
  assert.equal(releases.length, 2, 'occluded after suspend is a new edge');
  assert.equal(state.timeScale, 0, 'still unfocused: the focus hold owns the clock');
  assert.equal(controller.isSuspended(), false,
    'an occluded window still presents — it is not the suspend path');

  controller.stop();
});
