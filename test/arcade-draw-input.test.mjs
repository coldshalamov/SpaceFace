import test from 'node:test';
import assert from 'node:assert/strict';
import { input } from '../src/systems/input.js';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';
import { createBus } from '../src/core/eventBus.js';
import { createAutoTargetRuntime, tickAutoTarget } from '../src/combat/autoTargetMode.js';
import {
  DYNAMIC_FLIGHT_STICK_TUNING,
  dynamicFlightStickRadius,
  emptyDynamicFlightStick,
  projectDynamicFlightStick,
  recordDynamicFlightStick,
  resetDynamicFlightStick,
} from '../src/systems/dynamicFlightStick.js';

function host() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, data: {} };
  const state = { mode: 'flight', simTime: 0, entities: new Map([[1, player]]), playerId: 1,
    player: {}, settings: { gameplay: { controlScheme: 'pilot' },
      controls: { bindings: {}, gamepad: { enabled: false }, touch: { enabled: false } } },
    input: { autoFire: true, actions: {}, aimWorld: { x: 0, z: 0 },
      autoTargetPath: { active: false, drawing: false, pointIndex: 1, points: [] },
      autoTargetVector: { active: false, screenX: 0, screenY: 0, worldX: 0, worldZ: 0, magnitude: 0 },
      pointerScreen: { active: false }, mouseNdc: { x: 0, y: 0 } } };
  const h = { state, player };
  h.helpers = {
    worldToScreen: p => ({ x: 500 + p.x, y: 300 + p.z }),
    raycastToPlane: n => ({ x: n.x * 500, z: -n.y * 300 }),
  };
  resetDynamicFlightStick(h, 1000, 600);
  return h;
}

test('combat-stick radius scales with viewport but stays inside the authored envelope', () => {
  assert.equal(dynamicFlightStickRadius(320, 240), DYNAMIC_FLIGHT_STICK_TUNING.minRadiusPx);
  const desktop = dynamicFlightStickRadius(1920, 1080);
  assert(desktop > DYNAMIC_FLIGHT_STICK_TUNING.minRadiusPx);
  assert(desktop <= DYNAMIC_FLIGHT_STICK_TUNING.maxRadiusPx);
  assert.equal(dynamicFlightStickRadius(8000, 8000), DYNAMIC_FLIGHT_STICK_TUNING.maxRadiusPx);
});

test('relative motion is bounded and preserves direction at full deflection', () => {
  const h = host();
  const r = h._autoTargetStick.radiusPx;
  assert.equal(recordDynamicFlightStick(h, r * 4, r * 3, 1000, 600), true);
  const stick = h._autoTargetStick;
  assert(Math.abs(Math.hypot(stick.xPx, stick.yPx) - r) < 1e-9);
  assert(stick.xPx > 0 && stick.yPx > 0);
});

test('deadzone kills tremor while deliberate displacement gives progressive authority', () => {
  const h = host();
  recordDynamicFlightStick(h, 4, 3, 1000, 600);
  let v = projectDynamicFlightStick(h, 1000, 600);
  assert.equal(v.active, false);
  assert.equal(v.magnitude, 0);

  resetDynamicFlightStick(h, 1000, 600);
  recordDynamicFlightStick(h, 45, 0, 1000, 600);
  const small = projectDynamicFlightStick(h, 1000, 600);
  resetDynamicFlightStick(h, 1000, 600);
  recordDynamicFlightStick(h, 120, 0, 1000, 600);
  const large = projectDynamicFlightStick(h, 1000, 600);
  assert(small.active && large.active);
  assert(large.magnitude > small.magnitude * 2,
    'the middle/outer stick should add decisive authority without destroying center precision');
});

test('screen-right and screen-up project through the camera basis into world axes', () => {
  const h = host();
  recordDynamicFlightStick(h, 80, 0, 1000, 600);
  let v = projectDynamicFlightStick(h, 1000, 600);
  assert(v.active && v.worldX > 0.1 && Math.abs(v.worldZ) < 1e-8);

  resetDynamicFlightStick(h, 1000, 600);
  recordDynamicFlightStick(h, 0, -80, 1000, 600);
  v = projectDynamicFlightStick(h, 1000, 600);
  assert(v.active && v.worldZ < -0.1,
    'screen-up follows the live camera basis rather than a hard-coded ship axis');
});

test('auto-target consumes the dynamic vector without path-follow authority', () => {
  const h = host();
  const bus = createBus();
  const runtime = createAutoTargetRuntime();
  recordDynamicFlightStick(h, 120, 0, 1000, 600);
  const v = projectDynamicFlightStick(h, 1000, 600);
  Object.assign(h.state.input.autoTargetVector, v);
  tickAutoTarget(h.state, 1 / 60, bus, runtime);
  assert(Math.abs(h.state.input.moveX) + Math.abs(h.state.input.moveZ) > 0.1);
  assert.equal(h.state.input.autoTargetPath.active, false);
  assert.equal(h.state.input.drawFlight, undefined);
});

class Target {
  listeners = new Map();
  addEventListener(type, cb) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(cb); }
  removeEventListener(type, cb) { this.listeners.get(type)?.delete(cb); }
  dispatch(type, props = {}) {
    const e = { type, preventDefault() {}, stopImmediatePropagation() {}, ...props };
    for (const cb of this.listeners.get(type) || []) cb(e);
  }
}
function dom() {
  const originals = new Map();
  const canvas = new Target(), win = new Target(), doc = new Target();
  doc.getElementById = id => id === 'gl-canvas' ? canvas : null;
  doc.body = { classList: { contains: () => false } };
  const replacements = { window: win, document: doc, innerWidth: 1000, innerHeight: 600,
    addEventListener: win.addEventListener.bind(win), removeEventListener: win.removeEventListener.bind(win) };
  for (const [k, v] of Object.entries(replacements)) {
    originals.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v });
  }
  return { win, canvas, doc, restore() { for (const [k, desc] of originals) {
    if (desc) Object.defineProperty(globalThis, k, desc); else delete globalThis[k];
  } } };
}

test('real input owner counts one physical mouse move, bounds it, and never authors a route', () => {
  const d = dom(), h = host();
  const owner = Object.create(input);
  const bus = createBus();
  try {
    owner.init({ state: h.state, bus, helpers: h.helpers });
    owner.update(1 / 60, h.state);
    const e = { target: d.canvas, clientX: 500, clientY: 300, movementX: 50, movementY: -25 };
    d.win.dispatch('pointermove', e);
    d.win.dispatch('mousemove', e);
    owner.update(1 / 60, h.state);
    const v = h.state.input.autoTargetVector;
    assert(v.active);
    assert(Math.hypot(v.screenX, v.screenY) <= 1.0001);
    assert.equal(h.state.input.autoTargetPath.active, false);
    assert.equal(h.state.input.autoTargetPath.points.length, 0);
    const before = { ...v };
    owner.update(1 / 60, h.state);
    assert.deepEqual(h.state.input.autoTargetVector, before,
      'a held virtual stick remains stable until the player recenters it');
  } finally { owner.destroy(); d.restore(); }
});

test('G is rebindable, repeat-safe, modal-safe, and survives denied pointer lock', () => {
  const d = dom(), h = host();
  const owner = Object.create(autoTargetAssist), bus = createBus();
  h.state.input.autoFire = false;
  h.state.settings.controls.bindings.autoFire = ['KeyH'];
  d.canvas.requestPointerLock = () => { throw new Error('denied'); };
  try {
    owner.init({ state: h.state, bus });
    d.win.dispatch('keydown', { code: 'KeyG' });
    assert.equal(h.state.input.autoFire, false);
    d.win.dispatch('keydown', { code: 'KeyH' });
    assert.equal(h.state.input.autoFire, true);
    d.win.dispatch('keydown', { code: 'KeyH', repeat: true });
    assert.equal(h.state.input.autoFire, true);
    d.win.dispatch('blur');
    d.win.dispatch('keydown', { code: 'KeyH', repeat: true });
    assert.equal(h.state.input.autoFire, true, 'a held repeat after focus loss is not a new press');
    d.win.dispatch('keydown', { code: 'KeyH' });
    assert.equal(h.state.input.autoFire, false, 'blur releases the toggle latch');
    d.win.dispatch('keyup', { code: 'KeyH' });
    h.state.ui = { screenStack: ['pause'] };
    d.win.dispatch('keydown', { code: 'KeyH' });
    assert.equal(h.state.input.autoFire, false);
  } finally { owner.destroy(); d.restore(); }
});

test('emptyDynamicFlightStick is a neutral serializable shape', () => {
  const stick = emptyDynamicFlightStick(1000, 600);
  assert.deepEqual(Object.keys(stick).sort(), ['radiusPx', 'xPx', 'yPx']);
  assert.equal(stick.xPx, 0);
  assert.equal(stick.yPx, 0);
});
