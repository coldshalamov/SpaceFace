import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { input } from '../src/systems/input.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { projectSaucerControls } from '../src/core/flight/saucerControl.js';

function fixture() {
  const state = createGameState(11);
  const player = { ...makeShipEntitySpec('ship_saucer', { isPlayer: true }), id: 1, alive: true };
  state.mode = 'flight'; state.playerId = 1;
  state.entities.set(1, player); state.entityList = [player];
  state.settings.gameplay.controlScheme = 'pilot';
  state.settings.controls.touch = { enabled: false };
  state.settings.controls.gamepad = { enabled: false };
  state.settings.controls.bindings = {
    forward: ['KeyI'], reverse: ['KeyK'], yawLeft: ['KeyJ'], yawRight: ['KeyL'],
    strafeLeft: [], strafeRight: [],
  };
  const host = Object.create(input);
  host.init({ state, bus: createBus(), helpers: {} });
  const step = keys => {
    host._keys = Object.assign(Object.create(null), keys);
    state.tick++;
    host.update(1 / 60, state);
    return state.input;
  };
  return { state, host, step };
}

test('resolved saucer controls override defaults, including a deliberately unbound direction', () => {
  const intent = projectSaucerControls({ keys: { KeyW: true, KeyD: true },
    up: false, down: false, left: false, right: false });
  assert.equal(intent.moveX, 0); assert.equal(intent.moveZ, 0);
  assert.equal(projectSaucerControls({ keys: { KeyD: true } }).moveX, 1,
    'standalone keyboard projection retains its default mapping');
});

test('the live input owner honors rebound directions and releases the old WASD controls', () => {
  const { host, step } = fixture();
  try {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      const intent = step({ [code]: true });
      assert.equal(intent.moveX, 0, code); assert.equal(intent.moveZ, 0, code);
    }
    assert.equal(step({ KeyL: true }).moveX, 1);
    assert.equal(step({ KeyJ: true }).moveX, -1);
    assert.equal(step({ KeyI: true }).moveZ, 1);
    assert.equal(step({ KeyK: true }).moveZ, -1);
    assert.equal(step({ KeyJ: true, KeyL: true }).moveX, 0);
    assert.equal(step({}).moveX, 0);
  } finally { host.destroy(); }
});

test('unbound legacy keys cannot take steering ownership from the live gamepad', () => {
  const { host, step, state } = fixture();
  host.gamepad = { isConnected: () => true,
    axes: { leftX: 0.5, leftY: 0, rightX: 0, rightY: 0 }, actions: {},
    lastActiveTick: 1, lastActiveSeq: 1, tick() {}, destroy() {} };
  state.settings.controls.gamepad.enabled = true;
  try {
    const intent = step({ KeyA: true, KeyD: true });
    assert.equal(host._movementSource, 'gamepad');
    assert.equal(intent.moveX, 0.5);
    assert.ok(intent.moveZ === 0);
  } finally { host.destroy(); }
});
