import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGamepad, resolveGamepadBindings } from '../src/systems/gamepad.js';
import { createUiInput } from '../src/ui/input.js';
import { toggleSteeringView } from '../src/ui/racingControls.js';
import { promptLabel, setPromptDevice, setGamepadPromptBindings } from '../src/ui/bindings.js';
import { GAMEPAD_REBINDABLE, GAMEPAD_REBIND_LABELS } from '../src/ui/screens/settings.js';

function fixture(custom = null) {
  const originals = new Map();
  const install = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  const element = { style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    closest: () => null, contains: () => false };
  install('document', { body: element, documentElement: element, activeElement: null,
    getElementById: () => element, querySelector: () => null, addEventListener() {}, removeEventListener() {} });
  install('window', { addEventListener() {}, removeEventListener() {} });
  const pad = { id: 'chase-toggle', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  install('navigator', { getGamepads: () => [pad] });
  const player = { id: 1, alive: true };
  const state = { tick: 1, simTime: 0, mode: 'flight', timeScale: 1, ui: {}, input: {}, playerId: 1,
    player: {}, entities: new Map([[1, player]]),
    settings: { gameplay: { steeringView: 'overhead' }, controls: { gamepad: { enabled: true, bindings: custom || undefined } } } };
  const bus = createBus(), events = [], opened = [];
  bus.on('race:toggleView', p => { events.push(p); toggleSteeringView(state, bus); });
  let modal = false;
  const manager = { isOpen: () => modal, top: () => modal ? 'settings' : null,
    getActiveScreenDef: () => modal ? { id: 'settings' } : null, pushScreen: id => opened.push(id),
    popScreen() {}, locked: () => false };
  const gp = createGamepad({ state, bus });
  const ui = createUiInput({ state, bus, gamepad: gp }, manager);
  const tick = () => { state.tick++; gp.tick(1 / 60, state, null); ui.tick(1 / 60); };
  tick();
  return { state, gp, events, opened, player, tick,
    modal(value) { modal = value; },
    buttons(...indices) { for (let i = 0; i < pad.buttons.length; i++) pad.buttons[i] = { pressed: indices.includes(i), value: indices.includes(i) ? 1 : 0 }; tick(); },
    dispose() { ui.dispose(); for (const [name, original] of originals) {
      if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name];
    } setPromptDevice('kbm'); setGamepadPromptBindings(null); },
  };
}

test('LB + View toggles the live camera once and suppresses the solo map press', () => {
  const f = fixture();
  try {
    f.buttons(4); f.buttons(4, 8);
    assert.equal(f.state.settings.gameplay.steeringView, 'racing');
    assert.equal(f.events.length, 1);
    assert.equal(f.gp.actions.map.pressed, false);
    assert.deepEqual(f.opened, []);
    f.tick(); assert.equal(f.events.length, 1, 'holding is not a repeated toggle');
    f.buttons(8); assert.deepEqual(f.opened, [], 'releasing LB before View must not open the map');
    f.buttons(); f.buttons(4, 8);
    assert.equal(f.state.settings.gameplay.steeringView, 'overhead');
    assert.equal(f.events.length, 2);
  } finally { f.dispose(); }
});

test('camera toggle is inert behind menus, dock, photo mode, and death', () => {
  for (const block of [f => f.modal(true), f => { f.state.ui.docked = true; },
    f => { f.state.render = { photoMode: { active: true } }; },
    f => { f.state.input.blocked = true; }, f => { f.player.alive = false; }]) {
    const f = fixture();
    try {
      block(f); f.buttons(4, 8);
      assert.equal(f.events.length, 0);
      assert.equal(f.state.settings.gameplay.steeringView, 'overhead');
    } finally { f.dispose(); }
  }
});

test('camera toggle is remappable and its prompt follows controller and touch devices', () => {
  assert.ok(GAMEPAD_REBINDABLE.includes('steeringView'));
  assert.equal(GAMEPAD_REBIND_LABELS.steeringView, 'Chase / overhead camera');
  const f = fixture({ steeringView: ['l1+home'] });
  try {
    f.buttons(4, 8); assert.equal(f.events.length, 0, 'old chord no longer owns the view');
    f.buttons(); f.buttons(4, 16);
    assert.equal(f.state.settings.gameplay.steeringView, 'racing');
    setGamepadPromptBindings(resolveGamepadBindings(f.state.settings)); setPromptDevice('gamepad');
    assert.equal(promptLabel('steeringView'), '[ LB + Home ]');
    setPromptDevice('touch'); assert.equal(promptLabel('steeringView'), '[ View ]');
    setPromptDevice('kbm'); assert.equal(promptLabel('steeringView'), '[ \\ ]');
  } finally { f.dispose(); }
});
