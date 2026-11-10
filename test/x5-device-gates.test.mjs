// X5 second review — every device path asks the same gate.
//
// The keyboard gate landed first, but the pad and touch paths still called their openers
// directly: a fight could open the chart/codex on a controller or the touch overlay, and the pad
// travel-burn branch only checked the lifecycle quarantine (not the fight/low-hull rule). This
// suite drives the REAL ui/input router and the REAL systems/input tick with fake devices.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGamepad } from '../src/systems/gamepad.js';
import { createUiInput } from '../src/ui/input.js';
import { input } from '../src/systems/input.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { contextActionAllowed, contextUiAllowed } from '../src/data/inputContexts.js';

const PLAYER = {
  id: 1, team: 0, hull: 100, hullMax: 100, alive: true,
  pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
  data: { combat: {}, weapons: [] },
};
const ENEMY = { id: 2, team: 1, alive: true, pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 } };

function combatState(over = {}) {
  const player = { ...PLAYER };
  return {
    mode: 'flight',
    timeScale: 1,
    playerId: 1,
    simTime: 0,
    run: null,
    nav: {},
    ui: {},
    settings: { gameplay: { controlScheme: 'pilot' }, controls: {} },
    player: { targetId: 2 },
    world: {},
    entities: { get: (id) => (id === 1 ? player : id === 2 ? ENEMY : null) },
    input: {
      actions: {},
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
      autoFire: false,
    },
    ...over,
  };
}

const isEnemyTarget = (state) => state.player && state.player.targetId === 2;

function installDom() {
  const originals = new Map();
  const install = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  const element = {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [],
    querySelector: () => null, closest: () => null, contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
  };
  const doc = {
    body: element, documentElement: element, activeElement: null,
    getElementById: () => element, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  install('document', doc);
  install('window', { addEventListener() {}, removeEventListener() {} });
  const pad = {
    id: 'x5-device-gates', index: 0, connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  install('navigator', { getGamepads: () => [pad] });
  return {
    pad,
    cleanup() {
      for (const [name, original] of originals) {
        if (original) Object.defineProperty(globalThis, name, original);
        else delete globalThis[name];
      }
    },
  };
}

function uiFixture({ withTouch = false } = {}) {
  const dom = installDom();
  const bus = createBus();
  const state = combatState();
  const pushed = [];
  const manager = {
    isOpen: () => false,
    top: () => null,
    pushScreen: (id) => { pushed.push(id); },
    popScreen() {},
    getActiveScreenDef: () => null,
    locked: () => false,
  };
  const gamepad = createGamepad({ state, bus });
  const touch = withTouch ? {
    isConnected: () => true,
    tick() {},
    lastActiveSeq: 0,
    actions: {
      localmap: { pressed: false },
      starmap: { pressed: false },
      missionLog: { pressed: false },
      pause: { pressed: false },
      dock: { pressed: false },
    },
  } : null;
  const ui = createUiInput({ state, bus, gamepad, touch, registry: null }, manager);
  const tick = () => { state.tick = (state.tick || 0) + 1; ui.tick(1 / 60); };
  return {
    dom, bus, state, pushed, gamepad, touch, tick, ui,
    press(index, held) { dom.pad.buttons[index] = { pressed: held, value: held ? 1 : 0 }; },
    cleanup() {
      ui.dispose();
      dom.cleanup();
    },
  };
}

test('a fight refuses the chart/codex on pad and touch, and keeps the allowed instruments', () => {
  const f = uiFixture({ withTouch: true });
  try {
    assert.equal(isEnemyTarget(f.state), true, 'the fixture is a real combat context');
    f.state.timeScale = 0; // ui/input polls devices while the sim is not running
    // Pad View is the map; Guide is the codex.
    f.press(8, true);
    f.tick();
    assert.equal(f.gamepad.actions.map.pressed, true, 'the pad really sampled the View press');
    f.press(8, false);
    f.tick();
    f.press(16, true);
    f.tick();
    assert.equal(f.gamepad.actions.codex.pressed, true, 'the pad really sampled the Guide press');
    f.press(16, false);
    f.tick();
    // Touch Local / Star map buttons.
    f.touch.actions.localmap.pressed = true;
    f.tick();
    f.touch.actions.localmap.pressed = false;
    f.touch.actions.starmap.pressed = true;
    f.tick();
    f.touch.actions.starmap.pressed = false;
    assert.equal(f.pushed.includes('galaxyMap'), false, 'pad/touch cannot open the chart in a fight');
    assert.equal(f.pushed.includes('codex'), false, 'pad cannot open the codex in a fight');
    assert.notEqual(f.state.ui.mapOpen, true, 'the map latch is not written by the refused press');

    // The allowed instruments still work: pause is in the combat UI set.
    const pause = uiFixture();
    try {
      pause.state.timeScale = 0;
      pause.press(9, true); // Menu
      pause.tick();
      pause.press(9, false);
      pause.tick();
      assert.deepEqual(pause.pushed, ['pause'], 'the fight keeps pause');
    } finally { pause.cleanup(); }
  } finally {
    f.cleanup();
  }
});

test('the gate itself: combat refuses map/codex; station and map keep them', () => {
  const combat = combatState();
  for (const action of ['map', 'localmap', 'starmap', 'codex']) {
    assert.equal(contextUiAllowed(combat, action), false, action);
  }
  assert.equal(contextUiAllowed(combatState({ mode: 'station' }), 'codex'), true);
  assert.equal(contextUiAllowed(combatState({ ui: { mapOpen: true } }), 'map'), true);
});

/** A live `input` system instance without init() (which wants a DOM). */
function makeInputHost() {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host._lastKbmMs = 0;
  host.helpers = { raycastToPlane: () => ({ x: 0, z: 0 }) };
  host.bus = { emit() {} };
  host.touch = null;
  return host;
}

function fakePad(pressed) {
  return {
    isConnected: () => true,
    tick() {},
    deviceLostThisFrame: false,
    axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
    actions: {
      travelBurn: { pressed, held: pressed },
    },
  };
}

function withTravelFlag(on, fn) {
  const previous = TRAVEL_FLAGS.travelBurn;
  TRAVEL_FLAGS.travelBurn = on;
  try { return fn(); } finally { TRAVEL_FLAGS.travelBurn = previous; }
}

test('the pad travel burn is refused by the fight rule and admitted at low hull', () => {
  withTravelFlag(true, () => {
    const healthy = combatState();
    const host = makeInputHost();
    host.gamepad = fakePad(true);
    host.update(1 / 60, healthy);
    assert.equal(healthy.input.actions.travelBurn, false,
      'a healthy targeted fight cannot arm travel burn on the pad');
    assert.notEqual(healthy.input.travelDrive?.state, 'spooling');

    const woundedPlayer = { ...PLAYER, hull: 10, hullMax: 100 };
    const wounded = combatState({ entities: { get: (id) => (id === 1 ? woundedPlayer : ENEMY) } });
    const host2 = makeInputHost();
    host2.gamepad = fakePad(true);
    host2.update(1 / 60, wounded);
    assert.equal(wounded.input.actions.travelBurn, true,
      'the low-hull flee is available on the pad, same as the key');
    assert.equal(wounded.input.travelDrive?.state, 'spooling');
  });
});
