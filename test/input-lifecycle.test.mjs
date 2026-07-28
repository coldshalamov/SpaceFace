import assert from 'node:assert/strict';
import test from 'node:test';

import { input } from '../src/systems/input.js';

test('input lifecycle owner releases keyboard, pointer, gamepad, and touch holds', () => {
  const host = Object.create(input);
  let grammarResets = 0;
  let gamepadResets = 0;
  const heldClass = {
    removed: [],
    remove(value) { this.removed.push(value); },
  };
  const knob = { style: { transform: 'translate(10px, 4px)' } };
  host._keys = { KeyW: true, ShiftLeft: true };
  host._m0 = true;
  host._m1 = true;
  host._m2 = true;
  host._prevM1 = true;
  host._kbmActivityPending = true;
  host._edgePrev = { cruise: true, tether: true };
  host._masslineGrammar = { reset() { grammarResets++; } };
  host.gamepad = { _resetState() { gamepadResets++; } };
  host.touch = {
    axes: { leftX: 1, leftY: -1, rightX: 0.5, rightY: -0.5 },
    actions: { fire: { held: true }, boost: { held: true } },
    _sticks: { 7: { side: 'left' } },
    _btnHeld: { fire: true },
    _btnPulse: { fire: true },
    _activityPending: true,
    _overlay: {
      querySelectorAll(selector) {
        if (selector === '.sf-touch-btn.held') return [{ classList: heldClass }];
        if (selector === '.sf-touch-knob') return [knob];
        return [];
      },
    },
  };

  host.releaseHeldControls('hidden');

  assert.deepEqual(host._keys, { KeyW: false, ShiftLeft: false });
  assert.equal(host._m0, false);
  assert.equal(host._m1, false);
  assert.equal(host._m2, false);
  assert.equal(host._prevM1, false);
  assert.equal(host._kbmActivityPending, false);
  assert.deepEqual(host._edgePrev, { cruise: false, tether: false });
  assert.equal(grammarResets, 1);
  assert.equal(gamepadResets, 1);
  assert.deepEqual(host.touch.axes, { leftX: 0, leftY: 0, rightX: 0, rightY: 0 });
  assert.deepEqual(host.touch._sticks, {});
  assert.deepEqual(host.touch._btnHeld, {});
  assert.deepEqual(host.touch._btnPulse, {});
  assert.equal(host.touch._activityPending, false);
  assert.deepEqual(host.touch.actions, {
    fire: { held: false, pressed: false, released: false, value: 0 },
    boost: { held: false, pressed: false, released: false, value: 0 },
  });
  assert.deepEqual(heldClass.removed, ['held']);
  assert.equal(knob.style.transform, '');
});
