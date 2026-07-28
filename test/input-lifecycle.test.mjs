import assert from 'node:assert/strict';
import test from 'node:test';

import { input } from '../src/systems/input.js';
import { createMasslineInputGrammar } from '../src/systems/masslineInputGrammar.js';

test('input lifecycle owner releases keyboard, pointer, gamepad, and touch holds', () => {
  const host = Object.create(input);
  const grammarResetBlocks = [];
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
  host._travelEdge = true;
  host._cmHeld = true;
  host._cmSuppressUntilRelease = false;
  host._edgePrev = { cruise: true, tether: true };
  host._masslineGrammar = { reset(block) { grammarResetBlocks.push(block); } };
  host.gamepad = {
    _prev: { massline: true, countermeasure: true },
    _resetState() { gamepadResets++; },
  };
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
  assert.equal(host._travelEdge, false);
  assert.equal(host._cmHeld, true, 'release preserves the existing debounce state');
  assert.equal(host._cmSuppressUntilRelease, true);
  assert.deepEqual(host._edgePrev, { cruise: false, tether: false });
  assert.deepEqual(grammarResetBlocks, [true]);
  assert.equal(gamepadResets, 1);
  assert.deepEqual(host.gamepad._prev, { massline: true, countermeasure: true });
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

test('countermeasure lifecycle suppression requires a neutral sample before another deploy edge', () => {
  const host = Object.create(input);
  const inp = { deployCountermeasure: false };
  host._cmHeld = false;
  host._cmSuppressUntilRelease = true;

  host._updateCountermeasureHold(true, inp);
  host._updateCountermeasureHold(true, inp);
  assert.equal(inp.deployCountermeasure, false);
  assert.equal(host._cmSuppressUntilRelease, true);

  host._updateCountermeasureHold(false, inp);
  assert.equal(host._cmSuppressUntilRelease, false);
  host._updateCountermeasureHold(true, inp);
  assert.equal(inp.deployCountermeasure, true);
});

test('Massline lifecycle reset blocks a physically held source until release', () => {
  const grammar = createMasslineInputGrammar();
  assert.equal(grammar.step(1 / 60, { held: true, attached: false, source: 'gamepad' }).latch, true);

  grammar.reset(true);
  assert.equal(grammar.step(1 / 60, { held: true, attached: false, source: 'gamepad' }).latch, false);
  grammar.step(1 / 60, { held: false, attached: false, source: null });
  assert.equal(grammar.step(1 / 60, { held: true, attached: false, source: 'gamepad' }).latch, true);
});
