// §22 E1 — thrust, brake, rope, shove, fire, and dock each have their own pad control.
// No chord. The flight owner reads shove the same way the keyboard edge does.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  GAMEPAD_DEFAULT_BINDINGS,
  gamepadShareAllowed,
} from '../src/systems/gamepad.js';
import { input } from '../src/systems/input.js';

const CORE = [
  ['thrust', 'axis'],
  ['brake', 'l1'],
  ['rope', 'accept'],
  ['shove', 'alt'],
  ['fire', 'r2'],
  ['dock', 'cancel'],
];

test('the six flight verbs do not share a button or a chord', () => {
  const used = new Map();
  const claim = (verb, button) => {
    assert.equal(button.includes('+'), false, `${verb} is a chord`);
    assert.ok(!used.has(button), `${verb} reuses ${button}, already ${used.get(button)}`);
    used.set(button, verb);
  };
  claim('thrust', 'axis:left');
  claim('brake', GAMEPAD_DEFAULT_BINDINGS.brake[0]);
  claim('rope', GAMEPAD_DEFAULT_BINDINGS.massline[0]);
  claim('shove', GAMEPAD_DEFAULT_BINDINGS.deployRepulsor[0]);
  claim('fire', GAMEPAD_DEFAULT_BINDINGS.fire[0]);
  claim('dock', GAMEPAD_DEFAULT_BINDINGS.dock[0]);
  assert.deepEqual(CORE.map((row) => row[1]), ['axis', 'l1', 'accept', 'alt', 'r2', 'cancel']);
  assert.equal(gamepadShareAllowed('dock', 'cancel'), true, 'B is dock in flight and back on a screen');
  assert.equal(gamepadShareAllowed('massline', 'dock'), false, 'the rope and the dock are different buttons');
});

test('a pad shove reaches state.input the way the keyboard edge does', () => {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.playerId = 1;
  state.ui = { screenStack: [] };
  state.player = { id: 1, tether: { active: false, targetId: null, strain: 0, load: 0, restLength: 0, phase: 'slack' } };
  state.entities = new Map([[1, {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
  }]]);
  const gp = {
    axes: { leftX: 0, leftY: -1, rightX: 0, rightY: 0, l2: 0, r2: 0 },
    actions: {
      deployRepulsor: { held: true, pressed: true, released: false, value: 1 },
      brake: { held: false, pressed: false, released: false, value: 0 },
      fire: { held: true, pressed: false, released: false, value: 1 },
      massline: { held: false, pressed: false, released: false, value: 0 },
      boost: { held: false, pressed: false, released: false, value: 0 },
      mine: { held: false, pressed: false, released: false, value: 0 },
    },
    isConnected() { return true; },
    tick() {},
  };
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host.helpers = { raycastToPlane: () => ({ x: 0, z: 0 }) };
  host.bus = { emit() {} };
  host.gamepad = gp;
  host.touch = null;
  host.update(1 / 60, state);
  assert.equal(state.input.actions.deployRepulsor, true, 'shove');
  assert.equal(state.input.fire, true, 'fire');
  assert.ok(state.input.moveZ > 0, 'thrust is the left stick');
  gp.actions.brake = { held: true, pressed: true, released: false, value: 1 };
  gp.axes.leftY = 0;
  gp.actions.deployRepulsor = { held: false, pressed: false, released: true, value: 0 };
  host.update(1 / 60, state);
  assert.equal(state.input.brake, true, 'brake');
});
