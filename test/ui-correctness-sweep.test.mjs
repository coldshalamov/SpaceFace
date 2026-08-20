import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { BINDINGS } from '../src/ui/bindings.js';
import { confirmGamepadAccept, confirmGamepadCancel, isConfirmOpen } from '../src/ui/confirm.js';
import { createUiInput } from '../src/ui/input.js';
import { cargoQty } from '../src/ui/screens/market.js';
import { cycleTarget } from '../src/ui/uiRoot.js';
import { createGamepad } from '../src/systems/gamepad.js';
import { input } from '../src/systems/input.js';
import { createTouch } from '../src/systems/touch.js';

const INPUT_SRC = readFileSync(fileURLToPath(new URL('../src/ui/input.js', import.meta.url)), 'utf8');
const MARKET_SRC = readFileSync(fileURLToPath(new URL('../src/ui/screens/market.js', import.meta.url)), 'utf8');
const STATION_MARKET_SRC = readFileSync(
  fileURLToPath(new URL('../src/ui/station/screens/market.js', import.meta.url)),
  'utf8',
);
const CONTRACTS_SRC = readFileSync(
  fileURLToPath(new URL('../src/ui/station/screens/contracts.js', import.meta.url)),
  'utf8',
);

function entity(id, extras = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 40, z: 0 },
    vel: { x: 0, z: 0 },
    ...extras,
  };
}

function installDomHarness() {
  const listeners = new Map();
  const body = { tagName: 'BODY', isContentEditable: false };
  globalThis.document = {
    activeElement: body,
    body,
    documentElement: { classList: { add() {}, remove() {} } },
    addEventListener(type, handler, options) {
      const capture = options === true || !!(options && options.capture);
      const list = listeners.get(type) || [];
      list.push({ handler, capture });
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((entry) => entry.handler !== handler));
    },
    getElementById() { return null; },
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };
  return listeners;
}

function press(listeners, key, code, extra = {}) {
  const event = {
    key,
    code,
    target: globalThis.document.body,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {},
    stopImmediatePropagation() {},
    ...extra,
  };
  for (const { handler } of listeners.get('keydown') || []) handler(event);
  return event;
}

test('cargoQty is 0 when player, cargo, or items are missing', () => {
  assert.equal(cargoQty(null, 'cmdty_ore'), 0);
  assert.equal(cargoQty({}, 'cmdty_ore'), 0);
  assert.equal(cargoQty({ player: {} }, 'cmdty_ore'), 0);
  assert.equal(cargoQty({ player: { cargo: {} } }, 'cmdty_ore'), 0);
  assert.equal(cargoQty({ player: { cargo: { items: { cmdty_ore: 4.8 } } } }, 'cmdty_ore'), 4);
});

test('Tab cycle skips contacts without a position and does not throw without a player bag', () => {
  const player = entity('player', { team: 0, pos: { x: 0, z: 0 } });
  const ghost = entity('ghost', { pos: null });
  const hostile = entity('foe', { pos: { x: 30, z: 0 }, data: { ai: { huntPlayer: true } } });
  const entities = new Map([[player.id, player], [ghost.id, ghost], [hostile.id, hostile]]);
  const state = {
    playerId: player.id,
    entities,
    entityList: [player, ghost, hostile],
  };
  assert.doesNotThrow(() => cycleTarget(state, 1, { emit() {} }));
  assert.equal(state.player.targetId, hostile.id);

  const empty = {
    playerId: 'missing',
    entities: new Map(),
    entityList: [entity('orphan', { pos: undefined })],
  };
  assert.doesNotThrow(() => cycleTarget(empty, 1, { emit() {} }));
});

test('gamepad reset clears previous button edges so a reconnect cannot stick fire', () => {
  const gp = createGamepad({});
  gp._prev = { fire: true, pause: true };
  gp._wasActive = true;
  gp.actions.fire = { held: true, pressed: false, released: false, value: 1 };
  gp._resetState();
  assert.deepEqual(gp._prev, {});
  assert.equal(gp._wasActive, false);
  assert.equal(gp.actions.fire.held, false);
  assert.equal(gp.actions.fire.pressed, false);
  assert.equal(gp.axes.leftX, 0);
});

test('disabling touch releases sticks and buttons instead of latching fire on re-enable', () => {
  const touch = createTouch({ state: {}, bus: { emit() {} } });
  touch.axes.leftX = 1;
  touch.axes.leftY = -1;
  touch._btnHeld = { fire: true, boost: true };
  touch._btnPulse = { fire: true };
  touch._sticks = { 3: { side: 'left' } };
  touch.actions.fire = { held: true, pressed: true, released: false, value: 1 };
  touch.setEnabled(false);
  assert.equal(touch.active, false);
  assert.deepEqual(touch.axes, { leftX: 0, leftY: 0, rightX: 0, rightY: 0 });
  assert.deepEqual(touch._btnHeld, {});
  assert.deepEqual(touch._sticks, {});
  assert.equal(touch.actions.fire.held, false);
  assert.equal(touch.actions.fire.pressed, false);
});

test('T / K / F1 close the matching instrument instead of no-op while it is open', () => {
  const listeners = installDomHarness();
  const popped = [];
  const state = { mode: 'flight', ui: {}, settings: {} };
  const bus = { on() { return () => {}; }, emit() {} };
  let topId = 'techTree';
  const screenManager = {
    isOpen() { return true; },
    locked() { return false; },
    getActiveScreenDef() { return { id: topId }; },
    popScreen() { popped.push(topId); },
    pushScreen() {},
  };
  const ui = createUiInput({ state, bus }, screenManager);

  press(listeners, BINDINGS.techTree.key, BINDINGS.techTree.code);
  assert.deepEqual(popped, ['techTree']);

  topId = 'codex';
  press(listeners, BINDINGS.codex.key, BINDINGS.codex.code);
  assert.deepEqual(popped, ['techTree', 'codex']);

  topId = 'help';
  press(listeners, 'F1', 'F1');
  assert.deepEqual(popped, ['techTree', 'codex', 'help']);

  ui.dispose();
});

test('gamepad A/B own an open confirm instead of falling through to the screen', () => {
  assert.match(
    INPUT_SRC,
    /if \(isConfirmOpen\(\)\) \{\s*if \(gp\.actions\.accept && gp\.actions\.accept\.pressed\) confirmGamepadAccept\(\);/,
  );
  assert.match(INPUT_SRC, /gp\.actions\.cancel && gp\.actions\.cancel\.pressed\) confirmGamepadCancel\(\)/);
  assert.equal(isConfirmOpen(), false);
  assert.equal(confirmGamepadAccept(), false);
  assert.equal(confirmGamepadCancel(), false);
});

test('market and contract UIs gate double-submit of buy/sell/accept', () => {
  assert.match(MARKET_SRC, /if \(tradeBusy\) return/);
  assert.match(STATION_MARKET_SRC, /if \(tradeBusy\) return/);
  assert.match(CONTRACTS_SRC, /acc\.disabled = true/);
});

test('flight aim does not throw when raycast misses and the player entity is gone', () => {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host._kbmActivityPending = false;
  host.helpers = { raycastToPlane() { return null; } };
  host.gamepad = null;
  host.touch = null;
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 0,
    playerId: 'gone',
    entities: new Map(),
    ui: { screenStack: [] },
    player: {},
    input: {
      actions: {},
      aimWorld: { x: 1, z: 1 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
    },
  };
  assert.doesNotThrow(() => host.update(1 / 60, state));
  assert.equal(state.input.aimWorld.x, 0);
  assert.equal(state.input.aimWorld.z, 0);
});
