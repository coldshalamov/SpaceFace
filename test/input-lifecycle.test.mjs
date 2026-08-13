import assert from 'node:assert/strict';
import test from 'node:test';

import { input, shouldNeutralizeFlightInput } from '../src/systems/input.js';
import { createMasslineInputGrammar } from '../src/systems/masslineInputGrammar.js';

test('flight input fence neutralizes controls while a drill approach owns the handoff', () => {
  const state = { mode: 'flight', ui: { screenStack: [] }, input: { blocked: false } };
  assert.equal(shouldNeutralizeFlightInput(state, false), false);

  state.input.blocked = true;
  assert.equal(shouldNeutralizeFlightInput(state, false), true);

  state.input.blocked = false;
  assert.equal(shouldNeutralizeFlightInput(state, true), true);
  assert.equal(shouldNeutralizeFlightInput({ ...state, ui: { screenStack: ['drill'] } }, false), true);
});

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
  host._gamepadLifecycleQuarantine = null;
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
  assert.equal(host._cmHeld, false);
  assert.deepEqual(host._gamepadLifecycleQuarantine, {
    massline: true,
    countermeasure: true,
    travelBurn: true,
    autoTarget: true,
  });
  assert.deepEqual(host._edgePrev, { cruise: false, tether: false });
  assert.deepEqual(grammarResetBlocks, [undefined]);
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

test('gamepad lifecycle quarantine waits for a connected neutral sample without blocking keyboard', () => {
  const host = Object.create(input);
  host._cmHeld = false;
  host._gamepadLifecycleQuarantine = {
    massline: true,
    countermeasure: true,
    travelBurn: true,
    autoTarget: true,
  };
  const actions = {
    massline: { held: false },
    countermeasure: { held: false },
    travelBurn: { held: false },
    autoTarget: { held: false },
  };

  host._refreshGamepadLifecycleQuarantine({ isConnected: () => false, actions });
  assert.equal(host._gamepadLifecycleActionAllowed('countermeasure'), false,
    'a missing pad is not proof that the physical button was released');

  const heldActions = {
    massline: { held: true },
    countermeasure: { held: true },
    travelBurn: { held: true },
    autoTarget: { held: true },
  };
  host._refreshGamepadLifecycleQuarantine({ isConnected: () => true, actions: heldActions });
  assert.equal(host._gamepadLifecycleActionAllowed('massline'), false,
    'a reconnected held pad remains quarantined');

  const inp = { deployCountermeasure: false };
  host._updateCountermeasureHold(true, inp);
  assert.equal(inp.deployCountermeasure, true,
    'a fresh keyboard press remains authoritative while the gamepad is quarantined');
  host._updateCountermeasureHold(false, inp);

  host._refreshGamepadLifecycleQuarantine({ isConnected: () => true, actions });
  assert.equal(host._gamepadLifecycleActionAllowed('massline'), true);
  assert.equal(host._gamepadLifecycleActionAllowed('countermeasure'), true);
  assert.equal(host._gamepadLifecycleActionAllowed('travelBurn'), true);
  assert.equal(host._gamepadLifecycleActionAllowed('autoTarget'), true);
});

test('input release preserves the committed Massline packet before resetting grammar state', () => {
  const grammar = createMasslineInputGrammar();
  const published = grammar.step(1 / 60, {
    held: true,
    attached: false,
    source: 'gamepad',
  });
  const committed = { ...published };
  const host = Object.create(input);
  host._keys = {};
  host._masslineGrammar = grammar;
  host.state = {
    input: {
      actions: {
        massline: published,
        tetherFire: published.latch,
      },
    },
  };
  host.gamepad = null;
  host.touch = null;

  host.releaseHeldControls('hidden');

  assert.deepEqual(host.state.input.actions.massline, committed);
  assert.notEqual(host.state.input.actions.massline, grammar.command);
  assert.equal(host.state.input.actions.tetherFire, true);
  assert.equal(grammar.command.latch, false);
});

test('Massline grammar can block a physically held source until release', () => {
  const grammar = createMasslineInputGrammar();
  assert.equal(grammar.step(1 / 60, { held: true, attached: false, source: 'gamepad' }).latch, true);

  grammar.reset(true);
  assert.equal(grammar.step(1 / 60, { held: true, attached: false, source: 'gamepad' }).latch, false);
  grammar.step(1 / 60, { held: false, attached: false, source: null });
  assert.equal(grammar.step(1 / 60, { held: true, attached: false, source: 'gamepad' }).latch, true);
});
