import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceFixedTimestep,
  LOOP_FIXED_DT,
  LOOP_LIFECYCLE_STATES,
  startLoop,
} from '../src/core/loop.js';

function createClock(start = 1000) {
  let now = start;
  return {
    nowMs: () => now,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

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
    count: () => pending.size,
    flushOne(now) {
      const entry = pending.entries().next().value;
      assert.ok(entry, 'expected one scheduled frame');
      pending.delete(entry[0]);
      entry[1](now);
    },
  };
}

function createVisibility(initial = 'visible') {
  let visibilityState = initial;
  const listeners = new Set();
  return {
    get visibilityState() { return visibilityState; },
    addEventListener(type, listener) {
      if (type === 'visibilitychange') listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'visibilitychange') listeners.delete(listener);
    },
    set(next) {
      visibilityState = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}

function createLifecyclePort(initialCommand = null) {
  const listeners = new Set();
  let latest = initialCommand;
  return {
    subscribe(listener) {
      listeners.add(listener);
      if (latest) listener(latest);
      return () => listeners.delete(listener);
    },
    send(command) {
      latest = command;
      for (const listener of [...listeners]) listener(command);
    },
    listenerCount: () => listeners.size,
  };
}

function createHarness({
  visibilityState = 'visible',
  initialShellCommand = null,
  accumulator = 0,
} = {}) {
  const clock = createClock();
  const raf = createRaf();
  const visibility = createVisibility(visibilityState);
  const lifecyclePort = createLifecyclePort(initialShellCommand);
  const calls = [];
  const releases = [];
  const audioTransitions = [];
  const state = { accumulator, timeScale: 1 };
  const registry = {
    step(dt) { calls.push({ type: 'step', dt }); },
    renderUpdate(alpha, frameDt) { calls.push({ type: 'render', alpha, frameDt }); },
    get(name) {
      if (name === 'input') return { releaseHeldControls: (reason) => releases.push(reason) };
      if (name === 'audio') {
        return {
          suspendForLifecycle: (reason) => audioTransitions.push({ type: 'suspend', reason }),
          resumeFromLifecycle: (reason) => audioTransitions.push({ type: 'resume', reason }),
        };
      }
      return null;
    },
  };
  const controller = startLoop(state, registry, {
    requestFrame: raf.requestFrame,
    cancelFrame: raf.cancelFrame,
    nowMs: clock.nowMs,
    visibilityTarget: visibility,
    lifecyclePort,
  });
  return {
    clock,
    raf,
    visibility,
    lifecyclePort,
    calls,
    releases,
    audioTransitions,
    state,
    registry,
    controller,
  };
}

function countCalls(harness, type) {
  return harness.calls.filter((call) => call.type === type).length;
}

test('visible play keeps the existing fixed-step and render cadence', () => {
  const h = createHarness();
  assert.equal(h.raf.count(), 1);

  h.raf.flushOne(h.clock.advance(16.667));

  assert.equal(countCalls(h, 'step'), 1);
  assert.equal(countCalls(h, 'render'), 1);
  assert.equal(h.raf.count(), 1);
  assert.equal(h.controller.getLifecycleState(), LOOP_LIFECYCLE_STATES.FOREGROUND_VISIBLE);
  h.controller.destroy();
});

test('hidden document cancels presentation scheduling and performs no hidden work', () => {
  const h = createHarness();
  h.raf.flushOne(h.clock.advance(16.667));
  const callsBeforeHide = h.calls.length;

  h.visibility.set('hidden');

  assert.equal(h.controller.isSuspended(), true);
  assert.equal(h.controller.getLifecycleState(), LOOP_LIFECYCLE_STATES.HIDDEN_OR_MINIMIZED);
  assert.equal(h.raf.count(), 0);
  assert.deepEqual(h.releases, ['document-visibility']);
  assert.deepEqual(h.audioTransitions, [{ type: 'suspend', reason: 'document-visibility' }]);

  h.clock.advance(30_000);
  assert.equal(h.calls.length, callsBeforeHide);
  assert.equal(h.controller.getDiagnostics().executedFrames, 1);
  h.controller.destroy();
});

test('restore publishes one coherent zero-delta snapshot before simulation resumes', () => {
  const h = createHarness({ accumulator: LOOP_FIXED_DT * 0.25 });
  h.raf.flushOne(h.clock.advance(16.667));
  const stepsBeforeHide = countCalls(h, 'step');

  h.visibility.set('hidden');
  h.clock.advance(20_000);
  h.visibility.set('visible');

  assert.equal(h.controller.getLifecycleState(), LOOP_LIFECYCLE_STATES.RESTORING);
  assert.equal(h.raf.count(), 1);

  h.calls.length = 0;
  h.raf.flushOne(h.clock.advance(16.667));
  assert.deepEqual(h.calls.map((call) => call.type), ['render']);
  assert.equal(h.calls[0].frameDt, 0);
  assert.equal(h.controller.getLifecycleState(), LOOP_LIFECYCLE_STATES.FOREGROUND_VISIBLE);
  assert.equal(h.controller.getDiagnostics().restoreFrameCount, 1);
  assert.deepEqual(h.audioTransitions, [
    { type: 'suspend', reason: 'document-visibility' },
    { type: 'resume', reason: 'restore-frame-complete' },
  ]);

  const expected = advanceFixedTimestep(h.state.accumulator, 0.05, 1, () => {});
  h.calls.length = 0;
  h.raf.flushOne(h.clock.advance(50));
  assert.equal(countCalls(h, 'step'), expected.steps,
    'post-restore foreground time must retain the ordinary fixed-step cadence');
  assert.equal(countCalls(h, 'render'), 1);
  assert.equal(h.calls.find((call) => call.type === 'render').frameDt, 0.05);
  assert.ok(Math.abs(h.state.accumulator - expected.accumulator) < 1e-12);
  assert.equal(h.controller.getDiagnostics().shedBacklogFrames, 0);
  assert.ok(stepsBeforeHide >= 1);
  h.controller.destroy();
});

test('restore callback cost is excluded from the next simulation delta', () => {
  const h = createHarness();
  h.raf.flushOne(h.clock.advance(16.667));
  h.visibility.set('hidden');
  h.clock.advance(5000);
  h.visibility.set('visible');

  h.registry.renderUpdate = (alpha, frameDt) => {
    h.calls.push({ type: 'render', alpha, frameDt });
    if (frameDt === 0) h.clock.advance(100);
  };

  h.calls.length = 0;
  h.raf.flushOne(h.clock.advance(16.667));
  assert.deepEqual(h.calls.map((call) => call.type), ['render']);
  assert.equal(h.calls[0].frameDt, 0);

  h.calls.length = 0;
  h.raf.flushOne(h.clock.advance(16.667));
  assert.equal(countCalls(h, 'step'), 1);
  assert.equal(countCalls(h, 'render'), 1);
  assert.ok(Math.abs(h.calls.find((call) => call.type === 'render').frameDt - 0.016667) < 1e-12);
  assert.equal(h.controller.getDiagnostics().shedBacklogFrames, 0);
  h.controller.destroy();
});

test('initially hidden startup owns no frame callback until restore', () => {
  const h = createHarness({ visibilityState: 'hidden' });
  assert.equal(h.controller.isSuspended(), true);
  assert.equal(h.raf.count(), 0);
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.audioTransitions, [{ type: 'suspend', reason: 'startup' }]);

  h.clock.advance(5000);
  h.visibility.set('visible');
  assert.equal(h.raf.count(), 1);
  h.raf.flushOne(h.clock.advance(16.667));
  assert.deepEqual(h.calls.map((call) => call.type), ['render']);
  assert.deepEqual(h.audioTransitions, [
    { type: 'suspend', reason: 'startup' },
    { type: 'resume', reason: 'restore-frame-complete' },
  ]);
  h.controller.destroy();
});

test('shell minimize and system suspend stop work with monotonic command handling', () => {
  const h = createHarness();
  h.lifecyclePort.send({ state: 'hidden-or-minimized', sequence: 2, reason: 'minimize' });
  assert.equal(h.controller.isSuspended(), true);
  assert.equal(h.raf.count(), 0);

  h.lifecyclePort.send({ state: 'foreground-visible', sequence: 1, reason: 'stale-show' });
  h.lifecyclePort.send({ state: 'hidden-or-minimized', sequence: 2, reason: 'duplicate-hide' });
  assert.equal(h.controller.getLifecycleState(), LOOP_LIFECYCLE_STATES.HIDDEN_OR_MINIMIZED);
  assert.equal(h.controller.getDiagnostics().staleShellCommandCount, 1);
  assert.equal(h.controller.getDiagnostics().duplicateShellCommandCount, 1);

  h.lifecyclePort.send({ state: 'system-suspended', sequence: 3, reason: 'suspend' });
  assert.equal(h.controller.getLifecycleState(), LOOP_LIFECYCLE_STATES.SYSTEM_SUSPENDED);
  assert.equal(h.releases.length, 1, 'repeated non-presenting commands release controls once');
  assert.deepEqual(h.audioTransitions, [{ type: 'suspend', reason: 'minimize' }]);

  h.lifecyclePort.send({ state: 'foreground-visible', sequence: 4, reason: 'resume' });
  assert.equal(h.controller.getLifecycleState(), LOOP_LIFECYCLE_STATES.RESTORING);
  assert.equal(h.raf.count(), 1);
  h.controller.destroy();
});

test('document visibility remains authoritative over a foreground shell command', () => {
  const h = createHarness();
  h.visibility.set('hidden');
  h.lifecyclePort.send({ state: 'foreground-visible', sequence: 1, reason: 'focus' });

  assert.equal(h.controller.isSuspended(), true);
  assert.equal(h.controller.getLifecycleState(), LOOP_LIFECYCLE_STATES.HIDDEN_OR_MINIMIZED);
  assert.equal(h.raf.count(), 0);
  h.controller.destroy();
});

test('a hide fired during simulation aborts presentation and rescheduling', () => {
  const h = createHarness();
  h.registry.step = (dt) => {
    h.calls.push({ type: 'step', dt });
    h.visibility.set('hidden');
  };

  h.raf.flushOne(h.clock.advance(16.667));

  assert.deepEqual(h.calls.map((call) => call.type), ['step']);
  assert.equal(h.controller.isSuspended(), true);
  assert.equal(h.raf.count(), 0);
  h.controller.destroy();
});

test('destroy cancels the pending frame and removes both lifecycle listeners', () => {
  const h = createHarness();
  assert.equal(h.visibility.listenerCount(), 1);
  assert.equal(h.lifecyclePort.listenerCount(), 1);
  assert.equal(h.raf.count(), 1);

  h.controller.destroy();
  h.controller.destroy();

  assert.equal(h.visibility.listenerCount(), 0);
  assert.equal(h.lifecyclePort.listenerCount(), 0);
  assert.equal(h.raf.count(), 0);
});
