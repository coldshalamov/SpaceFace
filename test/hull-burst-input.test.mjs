// Hull burst + input (owner principle, 2026-09-30): THE TRIGGER KEY IS GONE. The bumper family are
// boost upgrades now — hold Shift and the wedge rides the gesture; the hullBurst system polls the
// player's resource-gated boost flag (flightV3 writes it, update order runs flightSlot first). There
// is no verb to bind, so this file pins the NEW input contract (editing input.js needs focused
// input / rebind validation, AGENTS.md section 6 — this is it):
//   1. no hullBurst verb exists anywhere: no key in any scheme, no action member, no rebind row
//      (keyboard or pad), no help row, no pad action;
//   2. boost is unchanged and stays the ONE meter — Shift in every scheme, Backslash free again;
//   3. a Shift press is a held boost on state.input.boost — the channel the burst rides;
//   4. the middle-click second trigger is gone with the verb.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { DEFAULTS, PILOT_BINDINGS, input } from '../src/systems/input.js';
import { GAMEPAD_DEFAULT_BINDINGS } from '../src/systems/gamepad.js';
import { GAMEPAD_REBINDABLE, REBINDABLE } from '../src/ui/screens/settings.js';
import { controlSections, gamepadControlRows } from '../src/ui/screens/help.js';

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

test('the hull burst has no key anywhere: no verb, no action member, no rebind row, no pad action', () => {
  for (const [scheme, table] of Object.entries({ classic: DEFAULTS.BINDINGS, pilot: PILOT_BINDINGS })) {
    assert.ok(!('hullBurst' in table), `${scheme}: no hullBurst verb in the binding table`);
  }
  assert.ok(!('hullBurst' in GAMEPAD_DEFAULT_BINDINGS), 'no pad action either');
  assert.ok(!REBINDABLE.includes('hullBurst'), 'no keyboard remap row (nothing to bind)');
  assert.ok(!GAMEPAD_REBINDABLE.includes('hullBurst'), 'no pad remap row');
  const sections = Object.fromEntries(controlSections({}).map(([title, rows]) => [title, rows]));
  assert.ok((sections.Flight || []).every((row) => row[1] !== 'hullBurst'), 'the Flight table teaches no burst key');
  const padRows = gamepadControlRows(null);
  assert.ok(padRows.every((row) => row[0] !== 'Hull burst'), 'the pad sheet has no Hull burst row');
});

test('a live session never publishes a hullBurst action — not on ticks, keys, or middle-click', () => {
  withInput({}, ({ win, canvas, state, tick }) => {
    tick();
    assert.ok(!('hullBurst' in state.input.actions), 'the actions packet has no member at all');
    win.dispatch('keydown', { code: 'Backslash', target: null });
    win.dispatch('keydown', { code: 'IntlBackslash', target: null });
    canvas.dispatch('mousedown', { button: 1, target: canvas, clientX: 640, clientY: 400 });
    tick();
    assert.ok(!('hullBurst' in state.input.actions), 'the old triggers are dead keys now');
    win.dispatch('keyup', { code: 'Backslash', target: null });
    win.dispatch('keyup', { code: 'IntlBackslash', target: null });
    win.dispatch('mouseup', { button: 1, target: canvas });
  });
});

test('boost is unchanged and stays the ONE meter: Shift in every scheme, Backslash free again', () => {
  for (const [scheme, table] of Object.entries({ classic: DEFAULTS.BINDINGS, pilot: PILOT_BINDINGS, 'helm-assist': DEFAULTS.SCHEMES['helm-assist'] })) {
    assert.deepEqual(table.boost, ['ShiftLeft', 'ShiftRight'], `${scheme}: boost is Shift, untouched`);
    for (const [action, codes] of Object.entries(table)) {
      assert.ok(!(codes || []).includes('Backslash') && !(codes || []).includes('IntlBackslash'),
        `${scheme}: ${action} must not answer to the retired burst keys`);
    }
  }
});

test('a Shift press is a held boost on state.input.boost — the channel the burst rides', () => {
  withInput({}, ({ win, state, tick }) => {
    tick();
    assert.equal(state.input.boost, false, 'idle');
    win.dispatch('keydown', { code: 'ShiftLeft', target: null });
    tick();
    assert.equal(state.input.boost, true, 'held Shift is a held boost intent');
    tick();
    assert.equal(state.input.boost, true, 'still held, still boosting');
    win.dispatch('keyup', { code: 'ShiftLeft', target: null });
    tick();
    assert.equal(state.input.boost, false, 'released');
  });
});
