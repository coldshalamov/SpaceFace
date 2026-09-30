// Hull-burst overhaul, slice C: the key that lights the wedge (docs/plans/2026-09-29-hull-burst-physics-overhaul-design.md
// section 11.3, "which key fires the burst").
//
// Every left-hand key and every standard pad button was already spoken for; Backslash is referenced
// nowhere else in the repo, so it is the default and the verb is rebindable like every other. Editing
// input.js needs focused input / rebind validation (AGENTS.md section 6): this is it.
//   1. the default exists in every control scheme and collides with nothing (no other flight action,
//      no UI shortcut), so pressing it can only ever mean "burst";
//   2. the real keyboard adapter turns a press into ONE edge on state.input.actions.hullBurst;
//   3. a rebind moves the verb, and the old key stops meaning it;
//   4. no flight verb fires while a modal owns input;
//   5. the Settings grid and the Help screen teach it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { DEFAULTS, PILOT_BINDINGS, formatBindingCode, input } from '../src/systems/input.js';
import { GAMEPAD_DEFAULT_BINDINGS } from '../src/systems/gamepad.js';
import { BINDINGS as UI_BINDINGS } from '../src/ui/bindings.js';
import { GAMEPAD_REBIND_LABELS, GAMEPAD_REBINDABLE, REBINDABLE, REBIND_LABELS } from '../src/ui/screens/settings.js';
import { controlSections } from '../src/ui/screens/help.js';

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event = {}) {
    event.type = type;
    if (typeof event.preventDefault !== 'function') event.preventDefault = () => { event.defaultPrevented = true; };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
  }
}

function withInput(bindings, fn) {
  const names = ['window', 'document', 'innerWidth', 'innerHeight', 'addEventListener', 'removeEventListener'];
  const previous = {};
  for (const name of names) previous[name] = { present: Object.hasOwn(globalThis, name), value: globalThis[name] };
  const win = new FakeEventTarget();
  win.innerWidth = 1280; win.innerHeight = 800;
  const canvas = new FakeEventTarget();
  globalThis.window = win;
  globalThis.document = { getElementById(id) { return id === 'gl-canvas' ? canvas : null; } };
  globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
  globalThis.addEventListener = win.addEventListener.bind(win);
  globalThis.removeEventListener = win.removeEventListener.bind(win);
  const state = createGameState(11);
  state.mode = 'flight';
  state.ui = { screenStack: [], docked: false, dockInRange: false };
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: { defId: 'ship_kestrel' } };
  state.entities.set(1, player);
  state.entityList = [player];
  state.playerId = 1;
  state.player.tether = { active: false };
  state.settings.controls.bindings = bindings;
  const host = Object.create(input);
  host.init({ state, bus: { on() { return () => {}; }, emit() {} }, helpers: { raycastToPlane: (ndc) => ({ x: ndc.x * 100, z: -ndc.y * 100 }) } });
  const tick = () => { state.tick += 1; host.update(1 / 60, state); };
  try {
    return fn({ win, canvas, state, tick });
  } finally {
    host.destroy();
    for (const name of names) {
      if (previous[name].present) globalThis[name] = previous[name].value; else delete globalThis[name];
    }
  }
}

test('Backslash is the default in every control scheme and nothing else uses it', () => {
  assert.deepEqual(DEFAULTS.BINDINGS.hullBurst, ['Backslash', 'IntlBackslash']);
  assert.deepEqual(PILOT_BINDINGS.hullBurst, ['Backslash', 'IntlBackslash']);
  for (const [scheme, table] of Object.entries({ classic: DEFAULTS.BINDINGS, pilot: PILOT_BINDINGS })) {
    for (const [action, codes] of Object.entries(table)) {
      if (action === 'hullBurst') continue;
      assert.ok(!(codes || []).includes('Backslash') && !(codes || []).includes('IntlBackslash'), `${scheme}: ${action} must not also answer to Backslash`);
    }
  }
  for (const [name, def] of Object.entries(UI_BINDINGS)) {
    assert.notEqual(def && def.code, 'Backslash', `the UI shortcut ${name} must not own Backslash`);
  }
});

test('a press is ONE edge on state.input.actions.hullBurst', () => {
  withInput({}, ({ win, state, tick }) => {
    tick();
    assert.equal(state.input.actions.hullBurst, false, 'idle');
    win.dispatch('keydown', { code: 'Backslash', target: null });
    tick();
    assert.equal(state.input.actions.hullBurst, true, 'the press');
    tick();
    assert.equal(state.input.actions.hullBurst, false, 'held is not a second press');
    win.dispatch('keyup', { code: 'Backslash', target: null });
    tick();
    win.dispatch('keydown', { code: 'Backslash', target: null });
    tick();
    assert.equal(state.input.actions.hullBurst, true, 'a fresh press is a fresh edge');
  });
});

test('a rebind moves the verb and the old key stops meaning it', () => {
  withInput({ hullBurst: ['KeyJ'] }, ({ win, state, tick }) => {
    win.dispatch('keydown', { code: 'Backslash', target: null });
    tick();
    assert.equal(state.input.actions.hullBurst, false, 'the old default is free again');
    win.dispatch('keyup', { code: 'Backslash', target: null });
    win.dispatch('keydown', { code: 'KeyJ', target: null });
    tick();
    assert.equal(state.input.actions.hullBurst, true, 'the new key lights the wedge');
  });
});

test('no burst fires while a screen owns input', () => {
  withInput({}, ({ win, state, tick }) => {
    state.ui.screenStack = ['cargo'];
    win.dispatch('keydown', { code: 'Backslash', target: null });
    tick();
    assert.equal(state.input.actions.hullBurst, false);
  });
});

test('Settings can rebind it and Help teaches it', () => {
  assert.ok(REBINDABLE.includes('hullBurst'), 'a remap row exists');
  assert.ok(REBIND_LABELS.hullBurst && REBIND_LABELS.hullBurst.length > 0, 'with a plain-words label');
  const sections = Object.fromEntries(controlSections({}).map(([title, rows]) => [title, rows]));
  assert.ok((sections.Flight || []).some((row) => row[1] === 'hullBurst'), 'the Flight table lists the verb');
});

test('the ISO key next to left Shift (IntlBackslash) lights it too, and prints as the same glyph', () => {
  withInput({}, ({ win, state, tick }) => {
    win.dispatch('keydown', { code: 'IntlBackslash', target: null });
    tick();
    assert.equal(state.input.actions.hullBurst, true);
  });
  assert.equal(formatBindingCode('IntlBackslash'), formatBindingCode('Backslash'));
});

test('a middle-click is a second trigger: one edge per press, nothing while a screen owns input', () => {
  withInput({}, ({ win, canvas, state, tick }) => {
    tick();
    canvas.dispatch('mousedown', { button: 1, target: canvas, clientX: 640, clientY: 400 });
    tick();
    assert.equal(state.input.actions.hullBurst, true, 'the press');
    tick();
    assert.equal(state.input.actions.hullBurst, false, 'held is not a second press');
    win.dispatch('mouseup', { button: 1, target: canvas });
    tick();
    canvas.dispatch('mousedown', { button: 1, target: canvas, clientX: 640, clientY: 400 });
    tick();
    assert.equal(state.input.actions.hullBurst, true, 'a fresh press is a fresh edge');
  });
  withInput({}, ({ canvas, state, tick }) => {
    state.ui.screenStack = ['cargo'];
    canvas.dispatch('mousedown', { button: 1, target: canvas, clientX: 640, clientY: 400 });
    tick();
    assert.equal(state.input.actions.hullBurst, false, 'no burst under a modal');
  });
});

test('the pad has no default button for it but can bind one: unbound by default, rebindable, legal in flight', () => {
  assert.deepEqual([...GAMEPAD_DEFAULT_BINDINGS.hullBurst], [], 'no button is free, so none is taken');
  assert.ok(GAMEPAD_REBINDABLE.includes('hullBurst'), 'a pad remap row exists');
  assert.ok(GAMEPAD_REBIND_LABELS.hullBurst && GAMEPAD_REBIND_LABELS.hullBurst.length > 0, 'with a label');
});
