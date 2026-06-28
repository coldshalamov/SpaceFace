#!/usr/bin/env node
// check-station-interact-undock.mjs - pure UI-input contract for station airlock parity.
//
// The visible station Undock button, Esc, gamepad cancel, and backdrop already use the shared
// dock:undocked contract. This focused check guards the keyboard interact path: the same live
// binding that docks from flight must also undock from the station hub, while Enter remains free
// for normal focused button/tab activation.
import assert from 'node:assert/strict';

const listeners = new Map();
const windowListeners = new Map();

globalThis.document = {
  activeElement: null,
  addEventListener(type, handler) { listeners.set(type, handler); },
  removeEventListener(type, handler) {
    if (listeners.get(type) === handler) listeners.delete(type);
  },
};

globalThis.window = {
  addEventListener(type, handler) { windowListeners.set(type, handler); },
  removeEventListener(type, handler) {
    if (windowListeners.get(type) === handler) windowListeners.delete(type);
  },
};

const { createUiInput } = await import('../src/ui/input.js');

const emitted = [];
const bus = {
  on() {},
  emit(type, payload = {}) { emitted.push({ type, payload }); },
};
const state = {
  mode: 'flight',
  ui: { docked: true, screenStack: ['station'] },
  settings: { controls: {} },
  player: {},
  entities: new Map(),
  entityList: [],
};
const screenManager = {
  isOpen: () => true,
  getActiveScreenDef: () => ({ id: 'station' }),
  locked: () => false,
  popScreen: () => bus.emit('screen:pop'),
  pushScreen: (id) => bus.emit('screen:push', { id }),
};

const input = createUiInput({ state, bus, gamepad: null, registry: null }, screenManager);
assert.equal(typeof listeners.get('keydown'), 'function', 'createUiInput should register a document keydown handler');
assert.equal(typeof windowListeners.get('wheel'), 'function', 'createUiInput should register flight zoom wheel passthrough');

function dispatchKey(key, code = key, target = { tagName: 'DIV', isContentEditable: false }) {
  const ev = {
    key,
    code,
    target,
    shiftKey: false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
  listeners.get('keydown')(ev);
  return ev;
}

const enterEv = dispatchKey('Enter', 'Enter');
assert.equal(enterEv.defaultPrevented, false, 'Enter should remain available for focused station controls');
assert.equal(emitted.filter((e) => e.type === 'dock:undocked').length, 0, 'Enter must not undock from station hub');

const typingEv = dispatchKey('e', 'KeyE', { tagName: 'INPUT', isContentEditable: false });
assert.equal(typingEv.defaultPrevented, false, 'typing in station inputs should not trigger station undock');
assert.equal(emitted.filter((e) => e.type === 'dock:undocked').length, 0, 'typing E inside inputs must not undock');

const eEv = dispatchKey('e', 'KeyE');
assert.equal(eEv.defaultPrevented, true, 'station interact key should be consumed by the undock route');
assert.equal(emitted.filter((e) => e.type === 'dock:undocked').length, 1, 'station interact key should emit one dock:undocked intent');
assert(emitted.some((e) => e.type === 'audio:cue' && e.payload && e.payload.id === 'ui_back'),
  'station interact key should use the same back/egress audio cue as Esc');
assert.equal(emitted.some((e) => e.type === 'screen:pop'), false,
  'docked station interact egress should not pop the screen directly; uiRoot owns dock:undocked');

input.dispose();
assert.equal(listeners.has('keydown'), false, 'dispose should remove the keydown handler');
assert.equal(windowListeners.has('wheel'), false, 'dispose should remove the wheel handler');

console.log('Station interact undock OK: E exits the station hub through dock:undocked; Enter stays available for buttons.');
