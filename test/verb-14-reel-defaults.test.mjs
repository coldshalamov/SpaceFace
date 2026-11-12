// VERB-14: reel in/out have default keys in every scheme (INFERENCE_IDEAS.md).
//
// BracketLeft/Right are free repo-wide (no flight verb, no UI shortcut claims them) and form a
// natural in/out pair. Editing input.js needs focused input/rebind validation:
//   1. defaults exist in pilot, helm-assist and classic and collide with nothing;
//   2. a held key drives the winch (acts.reelDelta) and releases cleanly;
//   3. a rebind moves the verb and the old key stops meaning it;
//   4. no reel while a modal owns input;
//   5. Settings can rebind it and Help teaches it; labels print as [ and ].
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { DEFAULTS, PILOT_BINDINGS, formatBindingCode, resolveActionCodes, input } from '../src/systems/input.js';
import { BINDINGS as UI_BINDINGS } from '../src/ui/bindings.js';
import { REBINDABLE, REBIND_LABELS } from '../src/ui/screens/settings.js';
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

function withInput(bindings, fn, scheme = 'pilot') {
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
  const state = createGameState(4242);
  state.mode = 'flight';
  state.ui = { screenStack: [], docked: false, dockInRange: false };
  state.settings.gameplay.controlScheme = scheme;
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
    return fn({ win, canvas, state, tick, host });
  } finally {
    host.destroy();
    for (const name of names) {
      if (previous[name].present) globalThis[name] = previous[name].value; else delete globalThis[name];
    }
  }
}

function schemeTables() {
  return {
    classic: DEFAULTS.BINDINGS,
    pilot: PILOT_BINDINGS,
    'helm-assist': DEFAULTS.SCHEMES['helm-assist'],
  };
}

test('BracketLeft/Right are the default in every scheme and nothing else uses them', () => {
  const tables = schemeTables();
  for (const [scheme, table] of Object.entries(tables)) {
    assert.deepEqual(table.reelIn, ['BracketLeft'], `${scheme}: reelIn default`);
    assert.deepEqual(table.reelOut, ['BracketRight'], `${scheme}: reelOut default`);
  }
  for (const [scheme, table] of Object.entries(tables)) {
    for (const [action, codes] of Object.entries(table)) {
      if (action === 'reelIn' || action === 'reelOut') continue;
      assert.ok(!(codes || []).includes('BracketLeft'), `${scheme}: ${action} must not also answer to BracketLeft`);
      assert.ok(!(codes || []).includes('BracketRight'), `${scheme}: ${action} must not also answer to BracketRight`);
    }
  }
  for (const [name, def] of Object.entries(UI_BINDINGS)) {
    assert.notEqual(def && def.code, 'BracketLeft', `UI shortcut ${name} must not own BracketLeft`);
    assert.notEqual(def && def.code, 'BracketRight', `UI shortcut ${name} must not own BracketRight`);
  }
});

test('resolveActionCodes is non-empty in every scheme', () => {
  for (const scheme of ['pilot', 'helm-assist', 'classic']) {
    withInput(null, ({ state }) => {
      assert.deepEqual(resolveActionCodes(state, 'reelIn'), ['BracketLeft'], `${scheme}: reelIn resolves`);
      assert.deepEqual(resolveActionCodes(state, 'reelOut'), ['BracketRight'], `${scheme}: reelOut resolves`);
    }, scheme);
  }
});

// NXI-217: an explicitly emptied binding is a deliberate unbind — the runtime resolves no codes and
// the default is not silently restored. Deleting the override restores the scheme default.
test('an explicit empty binding stays unbound and restores on delete', () => {
  withInput({ forward: [] }, ({ state }) => {
    assert.deepEqual(resolveActionCodes(state, 'forward'), [], 'an emptied binding is unbound, not defaulted');
    delete state.settings.controls.bindings.forward;
    assert.deepEqual(resolveActionCodes(state, 'forward'), ['KeyW', 'ArrowUp'], 'removing the override restores the default');
  });
});

test('a held key drives the winch and releases cleanly', () => {
  withInput(null, ({ win, state, tick }) => {
    tick();
    assert.equal(state.input.actions.reelDelta, 0, 'idle');
    win.dispatch('keydown', { code: 'BracketLeft', target: null });
    tick();
    assert.equal(state.input.actions.reelDelta, -1, 'reel in shortens');
    win.dispatch('keyup', { code: 'BracketLeft', target: null });
    tick();
    assert.equal(state.input.actions.reelDelta, 0, 'release stops');
    win.dispatch('keydown', { code: 'BracketRight', target: null });
    tick();
    assert.equal(state.input.actions.reelDelta, 1, 'reel out lengthens');
    win.dispatch('keyup', { code: 'BracketRight', target: null });
    tick();
    assert.equal(state.input.actions.reelDelta, 0, 'release stops');
  });
});

test('a rebind moves the verb and the old key stops meaning it', () => {
  withInput({ reelIn: ['KeyJ'], reelOut: ['KeyK'] }, ({ win, state, tick }) => {
    win.dispatch('keydown', { code: 'BracketLeft', target: null });
    tick();
    assert.equal(state.input.actions.reelDelta, 0, 'the old default is free again');
    win.dispatch('keyup', { code: 'BracketLeft', target: null });
    win.dispatch('keydown', { code: 'KeyJ', target: null });
    tick();
    assert.equal(state.input.actions.reelDelta, -1, 'the new key reels in');
  });
});

test('no reel while a screen owns input', () => {
  withInput(null, ({ win, state, tick }) => {
    state.ui.screenStack = ['cargo'];
    win.dispatch('keydown', { code: 'BracketLeft', target: null });
    tick();
    assert.equal(state.input.actions.reelDelta, 0);
    win.dispatch('keyup', { code: 'BracketLeft', target: null });
    win.dispatch('keydown', { code: 'BracketRight', target: null });
    tick();
    assert.equal(state.input.actions.reelDelta, 0);
  });
});

test('Settings can rebind it and Help teaches it, labels print as brackets', () => {
  assert.ok(REBINDABLE.includes('reelIn'), 'reelIn remap row exists');
  assert.ok(REBINDABLE.includes('reelOut'), 'reelOut remap row exists');
  assert.ok(REBIND_LABELS.reelIn && REBIND_LABELS.reelIn.length > 0, 'reelIn has a plain-words label');
  assert.ok(REBIND_LABELS.reelOut && REBIND_LABELS.reelOut.length > 0, 'reelOut has a plain-words label');
  const sections = Object.fromEntries(controlSections({}).map(([title, rows]) => [title, rows]));
  const flight = sections.Flight || [];
  assert.ok(flight.some((row) => row[1] === 'reelIn'), 'the Flight table lists reelIn');
  assert.ok(flight.some((row) => row[1] === 'reelOut'), 'the Flight table lists reelOut');
  assert.equal(formatBindingCode('BracketLeft'), '[');
  assert.equal(formatBindingCode('BracketRight'), ']');
});
