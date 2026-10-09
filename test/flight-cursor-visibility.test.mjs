import assert from 'node:assert/strict';
import test from 'node:test';
import { flightReticlePosition, createFlightPointerTracker } from '../src/ui/uiRoot.js';

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
}

test('the target cursor survives gameplay pointer resets and focus return without another mouse move', () => {
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.hasFocus = () => true;
  const tracker = createFlightPointerTracker(win, doc);
  const state = { input: { autoFire: false, pointerScreen: { active: false, x: 0, y: 0 } } };
  try {
    win.dispatch('pointermove', { clientX: 610, clientY: 315, pointerType: 'mouse' });
    assert.deepEqual(flightReticlePosition(state, 1440, 900, tracker.pointer), { x: 610, y: 315 });
    state.input.pointerScreen = { active: false, x: 720, y: 450 };
    assert.deepEqual(flightReticlePosition(state, 1440, 900, tracker.pointer), { x: 610, y: 315 });
    win.dispatch('blur');
    assert.equal(flightReticlePosition(state, 1440, 900, tracker.pointer), null);
    win.dispatch('focus');
    assert.deepEqual(flightReticlePosition(state, 1440, 900, tracker.pointer), { x: 610, y: 315 });
    doc.dispatch('mouseout', { relatedTarget: {} });
    assert.deepEqual(flightReticlePosition(state, 1440, 900, tracker.pointer), { x: 610, y: 315 },
      'crossing HUD controls must not count as leaving the game window');
    doc.dispatch('mouseout', { relatedTarget: null });
    assert.equal(flightReticlePosition(state, 1440, 900, tracker.pointer), null);
    win.dispatch('mousemove', { clientX: 800, clientY: 350 });
    assert.deepEqual(flightReticlePosition(state, 1440, 900, tracker.pointer), { x: 800, y: 350 });
    win.dispatch('pointermove', { clientX: 100, clientY: 100, pointerType: 'touch' });
    assert.deepEqual(flightReticlePosition(state, 1440, 900, tracker.pointer), { x: 800, y: 350 });
  } finally { tracker.destroy(); }
  assert.equal([...win.listeners.values(), ...doc.listeners.values()].some(listeners => listeners.size), false);
});

test('mouse flight has no invented center sight before a pointer arrives or after focus loss', () => {
  const state = { input: { autoFire: false, pointerScreen: { x: 600, y: 300, active: false } } };
  assert.equal(flightReticlePosition(state, 1440, 900), null);
  state.input.pointerScreen.active = true;
  assert.deepEqual(flightReticlePosition(state, 1440, 900), { x: 600, y: 300 });
  state.input.pointerScreen.active = false;
  assert.equal(flightReticlePosition(state, 1440, 900), null);
});

test('only explicit combat-stick mode gets a centered sight, even after pointer lock releases', () => {
  const state = { input: { autoFire: true, pointerScreen: { x: 500, y: 200, active: false } } };
  assert.deepEqual(flightReticlePosition(state, 1440, 900), { x: 720, y: 450 });
  state.input.autoFire = false;
  assert.equal(flightReticlePosition(state, 1440, 900), null);
  state.input.pointerScreen.active = true;
  assert.deepEqual(flightReticlePosition(state, 1440, 900), { x: 500, y: 200 });
});

test('invalid or outside-window mouse coordinates do not leave a stranded sight', () => {
  for (const [x, y] of [[NaN, 300], [600, Infinity], [-1, 300], [1441, 300], [600, -1], [600, 901]]) {
    assert.equal(flightReticlePosition({ input: { pointerScreen: { active: true, x, y } } }, 1440, 900), null);
  }
});
