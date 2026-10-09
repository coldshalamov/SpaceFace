import assert from 'node:assert/strict';
import test from 'node:test';
import { startLoop } from '../src/core/loop.js';
import { createTimeEffects } from '../src/core/timeEffects.js';

function harness(deps = {}) {
  const pending = new Map();
  let nextId = 0;
  const focus = new EventTarget();
  const visibility = new EventTarget();
  visibility.visibilityState = 'visible';
  const state = {
    mode: 'flight', accumulator: 0, timeScale: 1, tick: 0, simTime: 0,
    input: { actions: {} }, settings: { audio: { muteOnFocusLoss: true } },
  };
  const registry = {
    step(dt, boundary) {
      state.tick++;
      state.simTime += dt;
      boundary.publishInputCommand(state.input, state.tick);
    },
    renderUpdate() {}, get() { return null; },
  };
  const loop = startLoop(state, registry, {
    requestFrame(fn) { const id = ++nextId; pending.set(id, fn); return id; },
    cancelFrame(id) { pending.delete(id); },
    nowMs: () => 1000, lifecyclePort: null, visibilityTarget: visibility,
    focusTarget: focus, inputResumeTarget: focus,
    ...deps,
  });
  const frame = now => {
    const [id, fn] = pending.entries().next().value;
    pending.delete(id);
    fn(now);
  };
  return { state, focus, visibility, pending, loop, frame, registry };
}

for (const event of ['pointerdown', 'keydown', 'touchstart']) {
  test(`${event} releases a lost-focus hold even when rAF never suspended`, () => {
    const h = harness();
    try {
      h.focus.dispatchEvent(new Event('blur'));
      assert.equal(h.state.timeScale, 0);
      assert.equal(h.loop.isSuspended(), false);
      h.focus.dispatchEvent(new Event(event));
      assert.equal(h.state.timeScale, 1, 'active input must recover a missing focus event');
      assert.equal(h.state.render.focusLossMuted, false);
      assert.equal(h.pending.size, 1, 'resuming input must not create a second loop');
    } finally { h.loop.close(); }
  });
}

test('input resume clears only the focus hold and preserves a modal pause', () => {
  const h = harness();
  try {
    const time = createTimeEffects(h.state);
    time.set('ui:pausing-screen', { scale: 0 });
    h.focus.dispatchEvent(new Event('blur'));
    h.focus.dispatchEvent(new Event('pointerdown'));
    assert.equal(h.state.timeScale, 0);
    assert.deepEqual(time.describeRequests(), { 'ui:pausing-screen': { scale: 0 } });
    time.clear('ui:pausing-screen');
    assert.equal(h.state.timeScale, 1);
  } finally { h.loop.close(); }
});

test('focus recovery restarts a scheduler stranded by a stale hidden-document flag', () => {
  const h = harness();
  try {
    h.focus.dispatchEvent(new Event('blur'));
    h.visibility.visibilityState = 'hidden';
    h.visibility.dispatchEvent(new Event('visibilitychange'));
    assert.equal(h.pending.size, 0);
    h.focus.dispatchEvent(new Event('focus'));
    assert.equal(h.state.timeScale, 1);
    assert.equal(h.loop.isSuspended(), false);
    assert.equal(h.pending.size, 1);
  } finally { h.loop.close(); }
});

test('exhausted graphics recovery stops safely and offers recovery exactly once', () => {
  const failures = [];
  const h = harness({ onPresentationFailure: failure => failures.push(failure) });
  try {
    h.state.render = { contextLost: true, contextRecovery: { terminal: true, lastError: 'GPU rebuild failed' } };
    createTimeEffects(h.state).set('webgl-context-loss', { scale: 0 });
    h.frame(1017);
    assert.equal(failures.length, 1, 'a terminal GPU park must reach the recovery presenter');
    assert.equal(failures[0].code, 'GRAPHICS_RECOVERY_FAILED');
    assert.equal(failures[0].message, 'GPU rebuild failed');
    assert.equal(h.pending.size, 0);
    assert.equal(h.state.tick, 0, 'the player cannot be damaged behind a dead picture');
  } finally { h.loop.close(); }
});

test('a graphics context that never restores has a bounded recovery window', () => {
  const failures = [];
  const h = harness({ onPresentationFailure: failure => failures.push(failure) });
  try {
    h.state.render = { contextLost: true, contextRecovery: { pending: true } };
    createTimeEffects(h.state).set('webgl-context-loss', { scale: 0 });
    h.frame(1017);
    assert.equal(failures.length, 0, 'ordinary automatic recovery gets time to complete');
    h.frame(62017);
    assert.equal(failures.length, 1, 'a permanently dead context cannot strand the player');
    assert.equal(failures[0].code, 'GRAPHICS_RECOVERY_TIMED_OUT');
    assert.equal(h.pending.size, 0);
  } finally { h.loop.close(); }
});

test('successful context recovery cancels the outage deadline', () => {
  const failures = [];
  const h = harness({ onPresentationFailure: failure => failures.push(failure) });
  try {
    h.state.render = { contextLost: true, contextRecovery: { pending: true } };
    const time = createTimeEffects(h.state);
    time.set('webgl-context-loss', { scale: 0 });
    h.frame(1017);
    h.state.render.contextLost = false;
    h.state.render.contextRecovery.pending = false;
    time.clear('webgl-context-loss');
    h.frame(62017);
    assert.equal(failures.length, 0);
    assert.equal(h.pending.size, 1);
    assert.ok(h.state.tick > 0);
  } finally { h.loop.close(); }
});

test('repeated draw failures reach recovery while a transient failure can still retry', () => {
  const failures = [];
  const h = harness({ onPresentationFailure: failure => failures.push(failure) });
  const prior = console.error;
  console.error = () => {};
  try {
    h.registry.renderUpdate = () => { throw new Error('poisoned drawable'); };
    for (let i = 1; i < 30; i++) h.frame(1000 + i * 17);
    assert.equal(failures.length, 0, 'a transient draw failure retains its retry window');
    h.frame(1510);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].code, 'PRESENTATION_FAILED');
    assert.equal(failures[0].message, 'poisoned drawable');
    assert.equal(h.pending.size, 0);
  } finally { console.error = prior; h.loop.close(); }
});
