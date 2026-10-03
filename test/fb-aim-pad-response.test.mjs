// FB-004 — aim and pad response are tunable.
//
// Packet done-when: an expo curve exists and is monotonic; the right stick's deadzone is
// its own axis; aim and fly sensitivity scale DERIVED intent only (gp.axes stay the raw
// deadzoned truth); mouse sensitivity and invert-Y live under controls.mouse and the
// invert flips aim sign; 'linear' + sensitivity 1 reproduces the shipped numbers exactly.
// Run: node --test test/fb-aim-pad-response.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  createGamepad,
  GAMEPAD_AXIS_CURVES,
  shapePadAxis,
  shapePadVector,
} from '../src/systems/gamepad.js';
import { input } from '../src/systems/input.js';

// --- Pure shaping ------------------------------------------------------------------

test('the expo curve is monotonic and preserves the stick endpoints', () => {
  assert.deepEqual(GAMEPAD_AXIS_CURVES, ['linear', 'expo']);
  let prev = -Infinity;
  for (let x = -1; x <= 1.0001; x += 0.005) {
    const y = shapePadAxis(x, 'expo', 1);
    assert.ok(y >= prev, `expo must not descend at x=${x}`);
    prev = y;
  }
  assert.equal(shapePadAxis(-1, 'expo'), -1, 'full deflection still reaches -1');
  assert.equal(shapePadAxis(1, 'expo'), 1, 'full deflection still reaches +1');
  // Expo softens the center without moving zero.
  assert.equal(shapePadAxis(0, 'expo'), 0);
  assert.ok(Math.abs(shapePadAxis(0.5, 'expo')) < 0.5, 'expo softens the center');
  assert.ok(shapePadAxis(0.95, 'expo') > shapePadAxis(0.5, 'expo') * 2 * 0.95,
    'the edge still approaches the corner faster than the softened center implies');
});

test('linear + sensitivity 1 is the shipped numbers, bit for bit', () => {
  for (const x of [-1, -0.73, -0.31, 0, 0.42, 0.87, 1]) {
    assert.equal(shapePadAxis(x, 'linear', 1), x);
    const v = shapePadVector(x, -x, 'linear', 1);
    if (x === 0) {
      assert.deepEqual(v, { x: 0, y: 0 }, 'a quiet stick publishes dead zero');
    } else {
      assert.equal(v.x, x);
      assert.equal(v.y, -x);
    }
  }
  // Vector shaping reshapes the magnitude, never the direction.
  const v = shapePadVector(0.3, 0.4, 'expo', 1);
  const dirIn = Math.atan2(0.4, 0.3), dirOut = Math.atan2(v.y, v.x);
  assert.ok(Math.abs(dirOut - dirIn) < 1e-9, 'expo never turns the stick');
  assert.ok(Math.hypot(v.x, v.y) < 0.5, 'expo softens the pushed magnitude');
  // Sensitivity scales derived intent and saturates at ±1 per axis.
  assert.equal(shapePadAxis(0.4, 'linear', 2), 0.8);
  assert.equal(shapePadAxis(0.7, 'linear', 2), 1);
  assert.equal(shapePadAxis(-0.7, 'linear', 2), -1);
});

// --- Independent right-stick deadzone -----------------------------------------------

function makePad() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
  return {
    id: 'SpaceFace Synthetic Pad', index: 0, connected: true, mapping: 'standard', timestamp: 1,
    axes: [0, 0, 0, 0], buttons,
    vibrationActuator: { playEffect() { return Promise.resolve('complete'); }, reset() {} },
  };
}
const pad = makePad();
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => [pad] }, configurable: true,
});
function makeState(gamepadCfg) {
  return {
    tick: 1, mode: 'flight', playerId: 1,
    player: { tether: { active: false, load: 0 } }, input: {},
    settings: { controls: { gamepad: gamepadCfg }, accessibility: { haptics: 'full' } },
    entities: new Map([[1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }]]),
  };
}

test('the right stick deadzone is an axis of its own', () => {
  const gp = createGamepad({ bus: { on() {}, emit() {} } });
  const state = makeState({ enabled: true, deadzone: 0.10, deadzoneRight: 0.30 });
  pad.axes = [0.2, 0, 0.2, 0];
  gp.tick(1 / 60, state);
  assert.ok(gp.axes.leftX > 0, 'left stick is outside the shared 10% deadzone');
  assert.equal(gp.axes.rightX, 0, 'right stick at the same deflection sits inside its 30% zone');
  pad.axes = [0, 0, 0, 0];
});

test('an absent deadzoneRight inherits the shared deadzone (shipped feel)', () => {
  const gp = createGamepad({ bus: { on() {}, emit() {} } });
  const state = makeState({ enabled: true, deadzone: 0.12 });
  pad.axes = [0.2, 0, 0.2, 0];
  gp.tick(1 / 60, state);
  assert.ok(Math.abs(gp.axes.leftX - gp.axes.rightX) < 1e-9, 'both sticks deadzone identically');
  pad.axes = [0, 0, 0, 0];
});

// --- Derived intent (never the raw axes) --------------------------------------------

function makeHost(gp) {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host.helpers = { raycastToPlane: (ndc) => ({ x: ndc.x * 100, z: -ndc.y * 100 }) };
  host.bus = { emit() {} };
  host.gamepad = gp;
  host.touch = null;
  return host;
}

function flightState() {
  const state = createGameState(4004);
  state.mode = 'flight';
  state.playerId = 1;
  state.ui = { screenStack: [] };
  state.player = { id: 1, targetId: null, tether: { active: false, targetId: null, load: 0 } };
  state.entities = new Map([[1, {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
  }]]);
  return state;
}

function fakeGp(axes, actions = {}) {
  return {
    axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0, l2: 0, r2: 0, ...axes },
    actions,
    lastActiveTick: 0, lastActiveSeq: 0,
    isConnected() { return true; },
    tick() {},
  };
}

test('fly sensitivity scales derived turn/throttle and leaves the raw axes alone', () => {
  const state = flightState();
  const gp = fakeGp({ leftX: 0.5 });
  const host = makeHost(gp);
  host._movementSource = 'gamepad';
  host.update(1 / 60, state);
  assert.ok(Math.abs(state.input.turnIntent - 0.5) < 1e-9, 'shipped linear response');

  state.settings.controls.gamepad.sensitivityFly = 2;
  host.update(1 / 60, state);
  assert.ok(Math.abs(state.input.turnIntent - 1) < 1e-9, 'sensitivity 2 doubles derived intent');
  assert.equal(gp.axes.leftX, 0.5, 'the raw axis is untouched');

  state.settings.controls.gamepad.curve = 'expo';
  state.settings.controls.gamepad.sensitivityFly = 1;
  host.update(1 / 60, state);
  assert.ok(Math.abs(state.input.turnIntent - shapePadAxis(0.5, 'expo', 1)) < 1e-9,
    'the derived channel follows the expo curve');
});

test('aim sensitivity shapes pad aim intent only', () => {
  const state = flightState();
  const gp = fakeGp({ rightX: 0.6 });
  gp.lastActiveTick = 999; // the pad owns aim this tick
  const host = makeHost(gp);
  host._movementSource = 'gamepad';
  host.update(1 / 60, state);
  // Stick aim publishes through mouseNdc/aimAngle; autoTargetVector is the draw-to-fly channel
  // and stays neutral unless that gesture is live.
  assert.ok(Math.abs(state.input.mouseNdc.x - 0.6) < 1e-9, 'pad aim publishes the aimed axis');
  assert.ok(Math.abs(state.input.aimAngle) < 1e-9, 'aiming straight out the +X nose');

  state.settings.controls.gamepad.sensitivityAim = 0.5;
  state.tick += 1;
  host.update(1 / 60, state);
  assert.ok(Math.abs(state.input.mouseNdc.x - 0.3) < 1e-9,
    'aim sensitivity 0.5 halves the derived aim axis');
  assert.equal(gp.axes.rightX, 0.6, 'the raw aim axis is untouched');
});

test('mouse sensitivity and invert-Y shape the derived cursor channel only', () => {
  const state = flightState();
  const host = makeHost(null);
  host._ndc.x = 0.4; host._ndc.y = 0.5;
  host.update(1 / 60, state);
  assert.ok(Math.abs(state.input.mouseNdc.x - 0.4) < 1e-9
    && Math.abs(state.input.mouseNdc.y - 0.5) < 1e-9, 'shipped cursor response');

  state.settings.controls.mouse = { sensitivity: 2, invertY: true };
  state.tick += 1;
  host.update(1 / 60, state);
  assert.ok(Math.abs(state.input.mouseNdc.x - 0.8) < 1e-9, 'sensitivity scales the cursor axis');
  assert.ok(Math.abs(state.input.mouseNdc.y - (-1.0)) < 1e-9, 'invertY flips the aim sign');
  assert.equal(host._ndc.y, 0.5, 'the raw pointer NDC is untouched');
});

test('fresh defaults carry the shipped feel', () => {
  const state = flightState();
  const gp = state.settings.controls.gamepad;
  assert.equal(gp.curve, 'linear');
  assert.equal(gp.sensitivityAim, 1);
  assert.equal(gp.sensitivityFly, 1);
  assert.equal(gp.deadzoneRight, 0.12, 'right stick starts on the shared deadzone');
  assert.deepEqual(state.settings.controls.mouse, { sensitivity: 1, invertY: false });
});
