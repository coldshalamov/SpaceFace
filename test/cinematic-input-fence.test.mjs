import assert from 'node:assert/strict';

import { createCinematicInputFence } from '../src/ui/cinematicInputFence.js';

function testSingleKeyReleaseFence() {
  const fixture = createFixture();
  const down = fixture.key('keydown', { code: 'Space', key: ' ' });
  assert.equal(down.defaultPrevented, true, 'dismissal keydown is consumed');
  assert.equal(down.immediatePropagationStopped, true, 'dismissal keydown cannot leak to later listeners');
  assert.equal(fixture.finalized.length, 0, 'keydown alone cannot expose a focused Main Menu action');
  assert.equal(fixture.fence.snapshot().state, 'keys-held');

  const up = fixture.key('keyup', { code: 'Space', key: ' ' });
  assert.equal(up.defaultPrevented, true, 'matching keyup is consumed');
  assert.deepEqual(fixture.finalized, ['keyboard'], 'the full released gesture dismisses exactly once');
  assert.equal(fixture.keyboard.listenerCount('keydown'), 0, 'finalize removes keydown capture');
  assert.equal(fixture.keyboard.listenerCount('keyup'), 0, 'finalize removes keyup capture');

  const later = fixture.key('keydown', { code: 'Space', key: ' ' });
  assert.equal(later.defaultPrevented, false, 'a later deliberate key is not swallowed');
}

function testChordReleaseFence() {
  const fixture = createFixture();
  fixture.key('keydown', { code: 'KeyA', key: 'a' });
  fixture.key('keydown', { code: 'Space', key: ' ' });
  fixture.key('keyup', { code: 'KeyA', key: 'a' });
  assert.equal(fixture.finalized.length, 0, 'releasing one chord member cannot dismiss while another is held');
  assert.deepEqual(fixture.fence.snapshot().heldPhysicalKeys, ['Space']);
  fixture.key('keyup', { code: 'Space', key: ' ' });
  assert.deepEqual(fixture.finalized, ['keyboard'], 'all tracked physical keys must release before dismissal');

  const modifiers = createFixture();
  modifiers.key('keydown', { code: 'ShiftLeft', key: 'Shift', location: 1 });
  modifiers.key('keydown', { code: 'ShiftRight', key: 'Shift', location: 2 });
  modifiers.key('keyup', { code: 'ShiftLeft', key: 'Shift', location: 1 });
  assert.equal(modifiers.finalized.length, 0, 'left/right modifiers remain distinct physical keys');
  modifiers.key('keyup', { code: 'ShiftRight', key: 'Shift', location: 2 });
  assert.deepEqual(modifiers.finalized, ['keyboard']);
}

function testRepeatAndMismatchedKeyup() {
  const repeatOnly = createFixture();
  const repeat = repeatOnly.key('keydown', { code: 'Space', key: ' ', repeat: true });
  assert.equal(repeat.defaultPrevented, true, 'a first repeat is consumed');
  assert.deepEqual(repeatOnly.fence.snapshot().heldPhysicalKeys, ['Space'], 'a first repeat is tracked as a pre-held key');
  assert.equal(repeatOnly.fence.snapshot().initiator, null, 'a first repeat cannot create a keyboard gesture');
  repeatOnly.key('keyup', { code: 'Space', key: ' ' });
  assert.equal(repeatOnly.finalized.length, 0, 'releasing a pre-held repeat alone does not dismiss');
  assert.equal(repeatOnly.fence.snapshot().state, 'visible-idle');

  for (const reason of ['pointer', 'timer']) {
    const fixture = createFixture();
    fixture.key('keydown', { code: 'Space', key: ' ', repeat: true });
    assert.equal(fixture.fence.requestDismiss(reason), false, `${reason} waits behind a pre-held repeat key`);
    fixture.key('keyup', { code: 'Space', key: ' ' });
    assert.deepEqual(fixture.finalized, [reason], `${reason} finalizes only after the pre-held key releases`);
  }

  const fixture = createFixture();
  fixture.key('keyup', { code: 'KeyQ', key: 'q' });
  assert.equal(fixture.finalized.length, 0, 'unknown keyup cannot dismiss');
  fixture.key('keydown', { code: '', key: 'Enter', location: 0 });
  fixture.key('keyup', { code: '', key: 'Enter', location: 0 });
  assert.deepEqual(fixture.finalized, ['keyboard'], 'key+location fallback remains usable');
}

function testDeferredPointerAndTimerDismissal() {
  for (const reason of ['pointer', 'timer']) {
    const fixture = createFixture();
    fixture.key('keydown', { code: 'Space', key: ' ' });
    assert.equal(fixture.fence.requestDismiss(reason), false, `${reason} waits behind a held keyboard gesture`);
    assert.equal(fixture.finalized.length, 0);
    fixture.key('keyup', { code: 'Space', key: ' ' });
    assert.deepEqual(fixture.finalized, [reason], `${reason} finalizes once after the release fence`);
    assert.equal(fixture.fence.requestDismiss(reason), false, 'closed fence is idempotent');
  }

  const idle = createFixture();
  assert.equal(idle.fence.requestDismiss('pointer'), true, 'pointer dismissal remains immediate while idle');
  assert.deepEqual(idle.finalized, ['pointer']);
}

function testBlurAndVisibilityReset() {
  const fixture = createFixture();
  fixture.key('keydown', { code: 'Space', key: ' ' });
  fixture.fence.requestDismiss('timer');
  fixture.keyboard.dispatch('blur', event());
  assert.equal(fixture.finalized.length, 0, 'blur never dismisses an incomplete keyboard gesture');
  assert.equal(fixture.fence.snapshot().state, 'suspended');
  assert.equal(fixture.fence.snapshot().pendingDismissReason, null, 'blur clears pending timer/click dismissal');
  assert.equal(fixture.fence.requestDismiss('timer'), false, 'timer cannot dismiss a backgrounded splash');
  assert.equal(fixture.fence.requestDismiss('pointer'), false, 'pointer cannot dismiss a backgrounded splash');
  fixture.key('keyup', { code: 'Space', key: ' ' });
  assert.equal(fixture.finalized.length, 0, 'late keyup after blur cannot leak into the menu');
  fixture.keyboard.dispatch('focus', event());
  assert(fixture.focusCount() >= 2, 'refocus restores the splash as focus owner');

  fixture.key('keydown', { code: 'KeyF', key: 'f' });
  fixture.visibility.hidden = true;
  fixture.visibility.dispatch('visibilitychange', event());
  assert.equal(fixture.fence.snapshot().state, 'suspended', 'hidden document resets held keys without dismissing');
  assert.equal(fixture.fence.requestDismiss('timer'), false, 'timer cannot dismiss a hidden splash');
  fixture.keyboard.dispatch('blur', event());
  fixture.visibility.hidden = false;
  fixture.visibility.dispatch('visibilitychange', event());
  assert.equal(fixture.fence.snapshot().state, 'suspended', 'visibility alone cannot resume a still-blurred window');
  fixture.keyboard.dispatch('focus', event());
  assert(fixture.focusCount() >= 3, 'visible and focused document restores splash focus ownership');
  assert.equal(fixture.fence.requestDismiss('pointer'), true, 'a fresh pointer gesture works after focus is restored');
}

function testInitialSuspension() {
  const hidden = createFixture({ hidden: true, focused: false });
  assert.equal(hidden.fence.snapshot().state, 'suspended', 'an initially hidden splash starts suspended');
  assert.equal(hidden.focusCount(), 0, 'an initially hidden splash cannot steal focus');
  assert.equal(hidden.fence.requestDismiss('timer'), false, 'timer cannot dismiss an initially hidden splash');
  hidden.visibility.hidden = false;
  hidden.visibility.dispatch('visibilitychange', event());
  assert.equal(hidden.fence.snapshot().state, 'suspended', 'becoming visible does not invent window focus');
  hidden.keyboard.dispatch('focus', event());
  assert.equal(hidden.fence.snapshot().state, 'visible-idle');
  assert.equal(hidden.focusCount(), 1, 'focus is restored once the splash is both visible and focused');

  const unfocused = createFixture({ hidden: false, focused: false });
  assert.equal(unfocused.fence.snapshot().state, 'suspended', 'an initially unfocused splash starts suspended');
  assert.equal(unfocused.focusCount(), 0, 'an initially unfocused splash cannot steal focus');
  assert.equal(unfocused.fence.requestDismiss('timer'), false, 'timer cannot dismiss an initially unfocused splash');
  unfocused.keyboard.dispatch('focus', event());
  assert.equal(unfocused.fence.requestDismiss('pointer'), true, 'fresh input works after initial focus arrives');
}

function testTeardownDoesNotFinalize() {
  const fixture = createFixture();
  fixture.key('keydown', { code: 'Space', key: ' ' });
  assert.equal(fixture.fence.teardown(), true, 'first teardown removes the active fence');
  assert.equal(fixture.fence.teardown(), false, 'teardown is idempotent');
  assert.equal(fixture.finalized.length, 0, 'teardown never records cinematic dismissal');
  assert.equal(fixture.keyboard.listenerCount('keydown'), 0);
  assert.equal(fixture.visibility.listenerCount('visibilitychange'), 0);
}

function createFixture({ hidden = false, focused = true } = {}) {
  const keyboard = new FakeTarget();
  const visibility = new FakeTarget();
  visibility.hidden = hidden;
  visibility.hasFocus = () => focused;
  const finalized = [];
  let focuses = 0;
  const fence = createCinematicInputFence({
    keyboardTarget: keyboard,
    visibilityTarget: visibility,
    focusOwner: () => { focuses += 1; },
    onFinalize: (reason) => finalized.push(reason),
  });
  return {
    fence,
    keyboard,
    visibility,
    finalized,
    focusCount: () => focuses,
    key(type, init) {
      const value = event(init);
      keyboard.dispatch(type, value);
      return value;
    },
  };
}

class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener, options) {
    const bucket = this.listeners.get(type) || [];
    bucket.push({ listener, capture: options === true || options?.capture === true });
    this.listeners.set(type, bucket);
  }
  removeEventListener(type, listener, options) {
    const capture = options === true || options?.capture === true;
    const bucket = (this.listeners.get(type) || []).filter((entry) => entry.listener !== listener || entry.capture !== capture);
    this.listeners.set(type, bucket);
  }
  dispatch(type, value) {
    for (const entry of [...(this.listeners.get(type) || [])]) entry.listener(value);
  }
  listenerCount(type) { return (this.listeners.get(type) || []).length; }
}

function event(init = {}) {
  return {
    code: init.code || '',
    key: init.key || '',
    location: Number(init.location || 0),
    repeat: init.repeat === true,
    defaultPrevented: false,
    immediatePropagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.immediatePropagationStopped = true; },
  };
}

testSingleKeyReleaseFence();
testChordReleaseFence();
testRepeatAndMismatchedKeyup();
testDeferredPointerAndTimerDismissal();
testBlurAndVisibilityReset();
testInitialSuspension();
testTeardownDoesNotFinalize();

console.log('PASS cinematic input release fence');
