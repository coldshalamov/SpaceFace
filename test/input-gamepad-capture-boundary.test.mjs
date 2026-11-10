import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGamepad } from '../src/systems/gamepad.js';
import { createUiInput } from '../src/ui/input.js';
import { setGamepadCaptureHandler } from '../src/ui/bindings.js';

function fixture() {
  const originals = new Map();
  const install = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  const element = {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [],
    querySelector: () => null, closest: () => null, contains: () => false,
  };
  const doc = {
    body: element, documentElement: element, activeElement: null,
    getElementById: () => element, querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
  };
  const pad = {
    id: 'capture-boundary', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  install('document', doc);
  install('window', { addEventListener() {}, removeEventListener() {} });
  install('navigator', { getGamepads: () => [pad] });
  const bus = createBus();
  let confirms = 0;
  bus.on('ui:confirm', () => { confirms++; });
  const state = {
    tick: 1, mode: 'paused', timeScale: 0, ui: { screenStack: ['settings'] },
    player: {}, entities: new Map(), settings: { controls: { gamepad: { enabled: true } } },
  };
  const gamepad = createGamepad({ state, bus });
  const manager = {
    isOpen: () => true, top: () => 'settings', getActiveScreenDef: () => ({ id: 'settings' }),
    popScreen() {}, pushScreen() {}, locked: () => false,
  };
  const ui = createUiInput({ state, bus, gamepad }, manager);
  const tick = () => { state.tick++; ui.tick(1 / 60); };
  tick();
  return {
    gamepad, tick, confirms: () => confirms,
    button(index, held) { pad.buttons[index] = { pressed: held, value: held ? 1 : 0 }; },
    cleanup() {
      setGamepadCaptureHandler(null);
      ui.dispose();
      for (const [name, original] of originals) {
        if (original) Object.defineProperty(globalThis, name, original);
        else delete globalThis[name];
      }
    },
  };
}

test('the first sampled button during a rebind waits for release', () => {
  const f = fixture();
  try {
    const captured = [];
    setGamepadCaptureHandler((name) => captured.push(name));
    f.button(0, true);
    f.tick();
    assert.deepEqual(captured, [], 'capture applies before sampling the first held button');
    assert.equal(f.confirms(), 0);
    f.button(0, false);
    f.tick();
    assert.deepEqual(captured, ['accept']);
  } finally { f.cleanup(); }
});

test('a modifier pressed on the first capture frame still forms a complete chord', () => {
  const f = fixture();
  try {
    const captured = [];
    setGamepadCaptureHandler((name) => captured.push(name));
    f.button(4, true); // LB
    f.tick();
    f.button(12, true); // D-pad up
    f.tick();
    assert.deepEqual(captured, ['l1+dUp'], 'the modifier must not commit as a lone button first');
  } finally { f.cleanup(); }
});

test('the first press after capture cancellation reaches the menu normally', () => {
  const f = fixture();
  try {
    setGamepadCaptureHandler(() => {});
    f.tick();
    setGamepadCaptureHandler(null);
    f.button(0, true);
    f.tick();
    assert.equal(f.confirms(), 1, 'capture has ended before the next button is polled');
    assert.equal(f.gamepad.captureMode, false);
  } finally { f.cleanup(); }
});
