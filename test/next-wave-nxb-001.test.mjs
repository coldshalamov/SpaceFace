// NXB-001 — one pilot. A noisy or already-deflected unused pad does not fly the ship.
// Disconnect clears that device only. The next pad flies only after a new deliberate gesture,
// and that gesture does not replay a bomb, shot, or Massline edge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { input, noteFlightPointer } from '../src/systems/input.js';
import { createGamepad } from '../src/systems/gamepad.js';

const DT = 1 / 60;

function button(down) {
  return { pressed: !!down, value: down ? 1 : 0 };
}

function fakePad(id, axes, held = []) {
  const buttons = [];
  for (let i = 0; i < 17; i++) buttons.push(button(held.includes(i)));
  return { connected: true, id, axes: axes.slice(), buttons };
}

function installNavigator(pads) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { getGamepads: () => pads },
    configurable: true,
    writable: true,
  });
  return () => {
    if (prev) Object.defineProperty(globalThis, 'navigator', prev);
    else delete globalThis.navigator;
  };
}

function makeState(scheme = 'pilot') {
  const player = {
    id: 'p', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
  };
  return {
    mode: 'flight',
    tick: 1,
    simTime: 0,
    playerId: 'p',
    ui: { screenStack: [] },
    settings: {
      gameplay: { controlScheme: scheme },
      controls: {
        gamepad: { enabled: true, deadzone: 0.12, invertY: false, scheme: 'drive' },
      },
    },
    player: { tether: { active: false } },
    entities: { get: (id) => (id === 'p' ? player : null) },
    input: {
      actions: {},
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
    },
    _player: player,
  };
}

function makeHost(state) {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 40, y: 40, active: true };
  host._m0 = host._m1 = host._m2 = false;
  host._lastKbmTick = -1;
  host._lastKbmSeq = -1;
  host.helpers = { raycastToPlane: () => ({ x: 0, z: 100 }) };
  host.bus = { emit() {} };
  host.gamepad = createGamepad({ bus: { emit() {} }, state });
  host.touch = null;
  return host;
}

function step(host, state) {
  state.tick += 1;
  state.simTime += DT;
  host.update(DT, state);
}

test('NXB-001 a noisy unused pad never changes the keyboard flight vector', () => {
  const pads = [
    fakePad('noise', [0.05, -0.05, 0.04, -0.03]),
    fakePad('resting-hard', [0, -0.9, 0, 0], [7]),
  ];
  const restore = installNavigator(pads);
  try {
    const state = makeState('pilot');
    const host = makeHost(state);
    host._keys.KeyW = true;
    step(host, state);
    const owned = state.input.moveZ;
    assert.ok(owned > 0.5, 'keyboard forward is the commanded vector');
    assert.equal(host.movementSource, 'keyboard');
    const changes = host.movementSourceChanges;
    const scheme = state.settings.gameplay.controlScheme;
    for (let i = 0; i < 600; i++) {
      pads[0].axes[0] = (i % 2 === 0 ? 0.05 : -0.04);
      pads[0].axes[1] = (i % 3 === 0 ? -0.06 : 0.02);
      step(host, state);
      assert.equal(state.input.moveZ, owned);
      assert.equal(state.input.fire, false, 'the other pad\'s held trigger is not a shot');
    }
    assert.equal(host.movementSourceChanges, changes);
    assert.equal(host.movementSource, 'keyboard');
    assert.equal(state.settings.gameplay.controlScheme, scheme);

    pads[1].axes[1] = 0;
    step(host, state);
    assert.equal(host.movementSource, 'keyboard');
    pads[1].axes[1] = -0.9;
    const before = host.movementSourceChanges;
    step(host, state);
    assert.equal(host.movementSource, 'gamepad');
    assert.equal(host.movementSourceChanges, before + 1);
    assert.ok(state.input.moveZ > 0.5 && state.input.moveZ !== owned);
    assert.equal(state.input.fire, false, 'taking over with the stick does not inherit the shot');
    assert.equal(state.input.actions.dropBomb, false);
  } finally { restore(); }
});

test('NXB-001 pointer helm stays put across 600 noisy samples, then a real stick registers', () => {
  const pads = [
    fakePad('noise', [0.05, -0.05, 0, 0]),
    fakePad('parked', [0, -0.9, 0, 0]),
  ];
  const restore = installNavigator(pads);
  try {
    const state = makeState('helm-assist');
    const host = makeHost(state);
    host._lastKbmTick = 5;
    host._lastKbmSeq = 2;
    state.tick = 1;
    step(host, state);
    const turn = state.input.turnIntent;
    assert.ok(turn > 0.5, 'the cursor is steering');
    assert.equal(host.movementSource, 'keyboard');
    const changes = host.movementSourceChanges;
    for (let i = 0; i < 600; i++) {
      pads[0].axes[1] = (i % 2 === 0 ? 0.05 : -0.05);
      step(host, state);
      assert.equal(state.input.turnIntent, turn);
    }
    assert.equal(host.movementSourceChanges, changes);
    assert.ok(host.gamepad.lastActiveTick < host._lastKbmTick);

    pads[1].axes[1] = 0;
    step(host, state);
    pads[1].axes[1] = -1;
    step(host, state);
    assert.equal(host.movementSource, 'gamepad');
    assert.notEqual(state.input.turnIntent, turn);
  } finally { restore(); }
});

test('NXB-001 disconnect clears only that device; index reuse needs a new gesture', () => {
  const pads = [fakePad('pad-a', [0, -1, 0, 0], [7, 0])];
  const restore = installNavigator(pads);
  try {
    const state = makeState('pilot');
    state.player.tether = { active: true };
    const host = makeHost(state);
    step(host, state);
    assert.equal(host.movementSource, 'gamepad');
    assert.equal(state.input.fire, true);
    const scheme = state.settings.gameplay.controlScheme;
    pads[0] = null;
    step(host, state);
    assert.equal(state.input.fire, false);
    assert.equal(state.input.moveZ, 0);
    assert.equal(state.input.actions.tetherCut, false, 'unplugging is not a Massline cut');
    assert.equal(state.input.actions.dropBomb, false);
    assert.equal(state.settings.gameplay.controlScheme, scheme);
    assert.equal(host.gamepad.isConnected(), false);

    host._keys.KeyW = true;
    step(host, state);
    assert.equal(host.movementSource, 'keyboard');
    assert.ok(state.input.moveZ > 0.5, 'the keyboard flies on the same host without a restart');
    host._keys.KeyW = false;
    step(host, state);

    pads[0] = fakePad('pad-b', [0, -1, 0, 0], [7, 15]);
    step(host, state);
    assert.equal(state.input.moveZ, 0, 'a stick already buried on the reused index does not fly');
    assert.equal(state.input.fire, false);
    assert.equal(state.input.actions.dropBomb, false);
    assert.equal(state.settings.gameplay.controlScheme, scheme);

    pads[0].axes[1] = 0;
    step(host, state);
    pads[0].axes[1] = -1;
    const before = host.movementSourceChanges;
    step(host, state);
    assert.equal(host.movementSource, 'gamepad');
    assert.equal(host.movementSourceChanges, before + 1);
    assert.ok(state.input.moveZ > 0.5);
    assert.equal(state.input.fire, false);
    assert.equal(state.input.actions.dropBomb, false);

    pads[0] = fakePad('pad-b', [0, -1, 0, 0], []);
    step(host, state);
    pads[0] = fakePad('pad-b', [0, -1, 0, 0], [7]);
    step(host, state);
    assert.equal(state.input.fire, true);
    step(host, state);
    assert.equal(state.input.fire, true, 'the held trigger stays one level, not a second edge');
  } finally { restore(); }
});

test('NXB-001 aim and a stuck trigger do not compete with the helm', () => {
  const pads = [
    fakePad('noise', [0, 0, 0, 0]),
    fakePad('aim-pad', [0, 0, 0, 0], [7]),
  ];
  const restore = installNavigator(pads);
  try {
    const state = makeState('classic');
    state.player.tether = { active: true };
    const host = makeHost(state);
    host._keys.KeyA = true;
    step(host, state);
    const yaw = state.input.turnIntent;
    assert.ok(Math.abs(yaw) > 0.5, 'keyboard yaw is the helm');
    assert.equal(host.movementSource, 'keyboard');
    pads[0].axes[2] = 1;
    pads[0].axes[3] = 0.8;
    for (let i = 0; i < 30; i++) step(host, state);
    assert.equal(host.movementSource, 'keyboard', 'the right stick aims and does not take the helm');
    assert.equal(state.input.turnIntent, yaw);

    host._keys.Space = true;
    for (let i = 0; i < 20; i++) step(host, state);
    assert.equal(state.input.actions.massline.lineControl, true);
    assert.ok(Math.abs(state.input.actions.massline.orbitDirection) > 0.5);

    pads[1].axes[1] = -0.9;
    step(host, state);
    assert.equal(host.movementSource, 'gamepad');
    assert.equal(state.input.fire, false, 'the trigger that was already down is not a shot');
    assert.equal(state.input.turnIntent, 0, 'keyboard yaw does not keep turning under the stick');
    assert.equal(state.input.actions.massline.orbitDirection, 0, 'keyboard yaw does not keep orbiting the rope');

    pads[1].axes[1] = 0;
    step(host, state);
    const stamped = host.gamepad.lastActiveTick;
    for (let i = 0; i < 12; i++) step(host, state);
    assert.equal(host.gamepad.lastActiveTick, stamped, 'a trigger already held does not stay recent');
    assert.equal(state.input.fire, false);
    assert.equal(host.movementSource, 'gamepad');
  } finally { restore(); }
});

test('NXB-001 a touch shot does not take the helm; a stick cross does', () => {
  const restore = installNavigator([null]);
  try {
    const state = makeState('pilot');
    const host = makeHost(state);
    host._keys.KeyW = true;
    const touch = {
      connected: true,
      isConnected() { return this.connected; },
      tick() {},
      lastActiveTick: -1,
      lastActiveSeq: -1,
      axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
      actions: {
        fire: { held: true, pressed: true },
        mine: { held: false, pressed: false },
        boost: { held: false, pressed: false },
      },
    };
    host.touch = touch;
    step(host, state);
    const owned = state.input.moveZ;
    assert.ok(owned > 0.5);
    assert.equal(host.movementSource, 'keyboard');
    assert.equal(state.input.fire, true, 'the touch trigger still fires');
    touch.actions.fire = { held: true, pressed: false };
    step(host, state);
    assert.equal(host.movementSource, 'keyboard');
    assert.equal(state.input.moveZ, owned);
    touch.axes.leftY = -0.7;
    step(host, state);
    assert.equal(host.movementSource, 'touch');
    assert.ok(state.input.moveZ > 0.5 && state.input.moveZ !== owned);
  } finally { restore(); }
});

test('NXB-001 a UI pointer does not retake the helm', () => {
  const pads = [fakePad('pad', [0, -1, 0, 0])];
  const restore = installNavigator(pads);
  try {
    const state = makeState('pilot');
    const host = makeHost(state);
    step(host, state);
    assert.equal(host.movementSource, 'gamepad');
    const ui = { closest: (sel) => (String(sel).includes('button') ? {} : null) };
    assert.equal(noteFlightPointer(host, ui), false);
    const flight = { closest: () => null };
    assert.equal(noteFlightPointer(host, flight), true);
    const changes = host.movementSourceChanges;
    step(host, state);
    assert.equal(host.movementSource, 'gamepad');
    assert.equal(host.movementSourceChanges, changes);
    assert.ok(state.input.moveZ > 0.5);
  } finally { restore(); }
});
