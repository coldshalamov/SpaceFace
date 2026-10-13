import test from 'node:test';
import assert from 'node:assert/strict';
import { input } from '../src/systems/input.js';
import { recordDynamicFlightStick, projectDynamicFlightStick } from '../src/systems/dynamicFlightStick.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';

class Events {
  listeners = new Map();
  addEventListener(type, listener, options) {
    const capture = options === true || options?.capture === true;
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ listener, capture });
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry.listener !== listener));
  }
  dispatch(type, fields = {}, consumeUnderWindow = false) {
    const event = { type, target: null, preventDefault() {}, ...fields };
    const listeners = [...(this.listeners.get(type) || [])];
    for (const { listener, capture } of listeners) if (capture) listener(event);
    // A document/element handler may stop propagation after the window capture phase.
    if (!consumeUnderWindow) for (const { listener, capture } of listeners) if (!capture) listener(event);
  }
}

function fixture() {
  const originals = new Map();
  const install = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  const win = new Events();
  const doc = new Events();
  const canvas = new Events();
  doc.body = { classList: { contains: () => false } };
  doc.getElementById = (id) => id === 'gl-canvas' ? canvas : null;
  install('window', win);
  install('document', doc);
  install('innerWidth', 1280);
  install('innerHeight', 800);
  const state = createGameState(821);
  state.mode = 'flight';
  state.ui.screenStack = [];
  state.playerId = 1;
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 });
  const host = Object.create(input);
  host.init({ state, bus: createBus(), helpers: { raycastToPlane: () => ({ x: 0, z: 0 }) } });
  const tick = () => { state.tick++; host.update(1 / 60, state); };
  return {
    host, state, win, canvas, tick,
    cleanup() {
      host.destroy();
      for (const [name, original] of originals) {
        if (original) Object.defineProperty(globalThis, name, original);
        else delete globalThis[name];
      }
    },
  };
}

test('a key released inside a modal cannot remain held when flight resumes', () => {
  const f = fixture();
  try {
    f.win.dispatch('keydown', { code: 'KeyW' });
    f.tick();
    assert.equal(f.state.input.moveZ, 1);
    // The modal freezes sim ticks and owns/consumes its keyboard events.
    f.state.ui.screenStack.push('range');
    f.win.dispatch('keyup', { code: 'KeyW' }, true);
    f.state.ui.screenStack.pop();
    f.tick();
    assert.equal(f.state.input.moveZ, 0, 'physical release reaches the flight owner before the modal consumes it');
    f.win.dispatch('keydown', { code: 'KeyW' });
    f.tick();
    assert.equal(f.state.input.moveZ, 1, 'a fresh hold remains usable');
  } finally { f.cleanup(); }
});

test('a mouse released inside a modal cannot keep the gun firing on resume', () => {
  const f = fixture();
  try {
    f.canvas.dispatch('mousedown', { button: 0, target: f.canvas, clientX: 640, clientY: 400 });
    f.tick();
    assert.equal(f.state.input.fire, true);
    f.state.ui.screenStack.push('pause');
    f.win.dispatch('mouseup', { button: 0 }, true);
    f.state.ui.screenStack.pop();
    f.tick();
    assert.equal(f.state.input.fire, false, 'a consumed release cannot become a held gun command');
  } finally { f.cleanup(); }
});

function shoveCombatStick(f) {
  // A flat raycast collapses the camera basis and the stick publishes nothing.
  f.host.helpers = {
    raycastToPlane: (n) => ({ x: (n.x || 0) * 40, z: -(n.y || 0) * 40 }),
    worldToScreen: () => ({ x: 640, y: 400 }),
  };
  f.state.input.autoFire = true;
  f.tick();
  recordDynamicFlightStick(f.host, 90, 0, 1280, 800);
  f.tick();
  assert.equal(f.state.input.autoTargetVector.active, true);
  assert.equal(projectDynamicFlightStick(f.host, 1280, 800).active, true);
}

test('closing the map does not resume a combat-stick shove', () => {
  const f = fixture();
  try {
    shoveCombatStick(f);
    f.state.ui.screenStack.push('map');
    f.tick();
    assert.equal(f.state.input.autoTargetVector.active, false);
    assert.equal(projectDynamicFlightStick(f.host, 1280, 800).magnitude, 0);
    assert.equal(f.state.input.fire, false);
    f.state.ui.screenStack.pop();
    f.tick();
    assert.equal(f.state.input.autoTargetVector.active, false, 'the shove does not resume');
    assert.equal(f.state.input.autoFire, true, 'combat stick stays armed');
    recordDynamicFlightStick(f.host, 90, 0, 1280, 800);
    f.tick();
    assert.equal(f.state.input.autoTargetVector.active, true, 'a fresh shove still steers');
  } finally { f.cleanup(); }
});

test('losing focus drops a combat-stick shove and does not leave the gun firing', () => {
  const f = fixture();
  try {
    shoveCombatStick(f);
    f.state.input.fire = true;
    f.host.releaseHeldControls('window-blur');
    assert.equal(f.state.input.fire, false);
    assert.equal(f.state.input.autoFire, true);
    assert.equal(f.state.input.autoTargetVector.active, false);
    assert.equal(projectDynamicFlightStick(f.host, 1280, 800).magnitude, 0);
    f.tick();
    assert.equal(f.state.input.autoTargetVector.active, false, 'the next flight tick stays neutral');
    recordDynamicFlightStick(f.host, 90, 0, 1280, 800);
    f.tick();
    assert.equal(f.state.input.autoTargetVector.active, true);
  } finally { f.cleanup(); }
});
