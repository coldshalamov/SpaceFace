import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGamepad } from '../src/systems/gamepad.js';
import { createUiInput } from '../src/ui/input.js';
import { setGamepadCaptureHandler } from '../src/ui/bindings.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

function fixture({ cargoOpen = false } = {}) {
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
    isOpen: () => !cargoOpen, top: () => cargoOpen ? null : 'settings', getActiveScreenDef: () => ({ id: 'settings' }),
    popScreen() {}, pushScreen() {}, locked: () => false,
  };
  if (cargoOpen) {
    state.mode = 'flight';
    state.ui = { cargoPanelOpen: true, screenStack: [] };
  }
  const ui = createUiInput({ state, bus, gamepad }, manager);
  const tick = () => { state.tick++; ui.tick(1 / 60); };
  tick();
  return {
    gamepad, tick, doc, state, bus, confirms: () => confirms,
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

test('Cargo owns Pad Back and Pad Accept has to focus the timed decision deliberately', () => {
  const f = fixture({ cargoOpen: true });
  try {
    const seen = [];
    const button = (name, x) => ({
      tagName: 'BUTTON', closest: () => null, getAttribute: () => null,
      getBoundingClientRect: () => ({ left: x, right: x + 80, top: 20, bottom: 60, width: 80, height: 40 }),
      focus() { f.doc.activeElement = this; },
      click() { seen.push(name); },
    });
    const holdButton = button('Cargo row', 20);
    const choice = button('Rell of the Moisture Column', 200);
    const root = child => ({ contains: node => node === child, querySelectorAll: () => [child] });
    const cargo = root(holdButton);
    const deck = root(choice);
    f.doc.querySelector = selector => selector === '#hud .sf-cargo-panel.open' ? cargo : null;
    setPromptDeck({ el: deck, size: 1, gamepadCapture() { throw new Error('automatic deck acceptance stole Cargo'); } });
    f.bus.on('ui:closeCargo', () => { seen.push('Close cargo hold'); f.state.ui.cargoPanelOpen = false; });

    holdButton.focus();
    f.button(0, true); f.tick();
    f.button(0, false); f.tick();
    assert.deepEqual(seen, ['Cargo row']);
    f.button(15, true); f.tick();
    f.button(15, false); f.tick();
    assert.equal(f.doc.activeElement, choice);
    f.button(0, true); f.tick();
    f.button(0, false); f.tick();
    assert.deepEqual(seen, ['Cargo row', 'Rell of the Moisture Column']);
    f.button(1, true); f.tick();
    assert.deepEqual(seen, ['Cargo row', 'Rell of the Moisture Column', 'Close cargo hold']);
    assert.equal(f.state.ui.cargoPanelOpen, false);
  } finally { setPromptDeck(null); f.cleanup(); }
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
