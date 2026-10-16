// VERB-33: a held modifier dumps the whole selected lot as one payload (INFERENCE_IDEAS.md).
//
// The modifier is the boost grip — ShiftLeft on the keyboard, the pad's boost button — held
// through the jettison edge. The chord reads the bound codes, so rebinding either verb moves
// the chord with it, and it reads the RAW physical hold, never the hold-to-toggle latch, so a
// player cruising on a toggled boost cannot turn an ordinary tap into a full-hold dump.
// Editing input.js needs focused input/rebind validation:
//   1. the modifier split: chord -> jettisonLotAll only, tap -> jettisonLot only;
//   2. a toggled boost latch never leaks into the modifier;
//   3. a rebind moves the chord and the old modifier stops meaning it;
//   4. jettisonLot resolves non-empty in every scheme (the chord's base verb);
//   5. on seed 4242 the modified edge emits ONE cargo:jettisoned carrying the full lot as a
//      single payload body, and the tap still releases one unit.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { DEFAULTS, PILOT_BINDINGS, resolveActionCodes, input } from '../src/systems/input.js';
import { cargo as cargoSystem } from '../src/systems/cargo.js';

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type, listener)) this.listeners.set(type, new Set());
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

test('the modifier splits the edge: chord fires jettisonLotAll only, tap fires jettisonLot only', () => {
  withInput(null, ({ win, state, tick }) => {
    tick();
    // Plain tap: one unit, the VERB-13 behavior.
    win.dispatch('keydown', { code: 'Period', target: null });
    tick();
    assert.equal(state.input.actions.jettisonLot, true, 'tap: the one-unit release fires');
    assert.equal(state.input.actions.jettisonLotAll, false, 'tap: the whole-lot dump does not');
    win.dispatch('keyup', { code: 'Period', target: null });
    tick();
    assert.equal(state.input.actions.jettisonLot, false, 'the edge is consumed');

    // Chord: boost grip held through the edge.
    win.dispatch('keydown', { code: 'ShiftLeft', target: null });
    tick();
    win.dispatch('keydown', { code: 'Period', target: null });
    tick();
    assert.equal(state.input.actions.jettisonLotAll, true, 'chord: the whole-lot dump fires');
    assert.equal(state.input.actions.jettisonLot, false, 'chord: the one-unit release does not double-fire');
    win.dispatch('keyup', { code: 'Period', target: null });
    win.dispatch('keyup', { code: 'ShiftLeft', target: null });
    tick();
    assert.equal(state.input.actions.jettisonLotAll, false, 'the edge is consumed');
  });
});

test('a toggled boost latch never leaks into the modifier', () => {
  withInput(null, ({ win, state, tick }) => {
    state.settings.accessibility = { holdToToggle: { boost: true } };
    tick();
    // Toggle boost on with a press+release: acts.boost stays true, the physical key is up.
    win.dispatch('keydown', { code: 'ShiftLeft', target: null });
    tick();
    win.dispatch('keyup', { code: 'ShiftLeft', target: null });
    tick();
    assert.equal(state.input.boost, true, 'the boost latch is on');
    win.dispatch('keydown', { code: 'Period', target: null });
    tick();
    assert.equal(state.input.actions.jettisonLot, true, 'a latched boost does not turn the tap into a dump');
    assert.equal(state.input.actions.jettisonLotAll, false);
    win.dispatch('keyup', { code: 'Period', target: null });
    tick();
  });
});

test('a rebind moves the chord and the old modifier stops meaning it', () => {
  withInput({ jettisonLot: ['Semicolon'], boost: ['ControlLeft'] }, ({ win, state, tick }) => {
    tick();
    // The old Shift modifier no longer chords: the plain tap wins.
    win.dispatch('keydown', { code: 'ShiftLeft', target: null });
    tick();
    win.dispatch('keydown', { code: 'Semicolon', target: null });
    tick();
    assert.equal(state.input.actions.jettisonLot, true, 'Shift is no longer the modifier after the rebind');
    assert.equal(state.input.actions.jettisonLotAll, false);
    win.dispatch('keyup', { code: 'Semicolon', target: null });
    win.dispatch('keyup', { code: 'ShiftLeft', target: null });
    tick();

    // The rebound boost is the modifier now.
    win.dispatch('keydown', { code: 'ControlLeft', target: null });
    tick();
    win.dispatch('keydown', { code: 'Semicolon', target: null });
    tick();
    assert.equal(state.input.actions.jettisonLotAll, true, 'the chord follows the rebound boost');
    assert.equal(state.input.actions.jettisonLot, false);
    win.dispatch('keyup', { code: 'Semicolon', target: null });
    win.dispatch('keyup', { code: 'ControlLeft', target: null });
    tick();
  });
});

test('jettisonLot resolves non-empty in every scheme', () => {
  const tables = {
    classic: DEFAULTS.BINDINGS,
    pilot: PILOT_BINDINGS,
    'helm-assist': DEFAULTS.SCHEMES['helm-assist'],
  };
  for (const scheme of Object.keys(tables)) {
    assert.ok(tables[scheme].jettisonLot && tables[scheme].jettisonLot.length > 0,
      `${scheme}: the chord's base verb stays bound`);
  }
  for (const scheme of ['pilot', 'helm-assist', 'classic']) {
    withInput(null, ({ state }) => {
      assert.ok(resolveActionCodes(state, 'jettisonLot').length > 0, `${scheme}: jettisonLot resolves codes`);
    }, scheme);
  }
});

test('seed 4242: the modified edge emits one cargo:jettisoned carrying the whole lot as one payload body', () => {
  const receipts = [];
  const sim = createSimulation({ seed: 4242, systems: [cargoSystem] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 100, hullMax: 100, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  state.player.cargo.items.cmdty_ore_iron = 7;
  bus.on('cargo:jettisoned', (p) => receipts.push(structuredClone(p)));
  const pods = () => [...state.entities.values()].filter(
    (e) => e && e.type === 'payload' && e.data && e.data.jettisonedCargo === true && e.alive !== false,
  );

  // The tap still releases one unit (VERB-13 behavior beside the new chord).
  state.input.actions = { jettisonLot: true };
  sim.runTicks(1);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].amount, 1, 'the tap dumps one unit');
  assert.equal(receipts[0].holdRemaining, 6);
  assert.equal(pods().length, 1);
  assert.equal(pods()[0].data.amount, 1);

  // The modified edge dumps the whole remaining lot as ONE payload body and ONE receipt.
  state.input.actions = { jettisonLotAll: true };
  sim.runTicks(1);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[1].commodityId, 'cmdty_ore_iron');
  assert.equal(receipts[1].amount, 6, 'the chord dumps the whole selected lot');
  assert.equal(receipts[1].holdRemaining, 0);
  const allPods = pods();
  assert.equal(allPods.length, 2, 'the whole lot is one payload body beside the earlier tap pod');
  assert.equal(allPods[1].data.amount, 6);
  assert.ok(!(state.player.cargo.items && Number(state.player.cargo.items.cmdty_ore_iron) > 0), 'the hold is empty');

  // Both action flavors are consumed by the same tick; nothing double-fires later.
  sim.runTicks(3);
  assert.equal(receipts.length, 2);
  sim.dispose();
});
