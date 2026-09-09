import test from 'node:test';
import assert from 'node:assert/strict';
import { input } from '../src/systems/input.js';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';
import { createBus } from '../src/core/eventBus.js';
import { createAutoTargetRuntime, tickAutoTarget, toggleAutoTarget } from '../src/combat/autoTargetMode.js';
import { recordDrawFlightGesture, emptyDrawFlightGesture } from '../src/systems/drawFlightInput.js';

function host() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
    vel: { x: 152, z: 0 }, rot: 0, data: {} };
  const state = { mode: 'flight', simTime: 0, entities: new Map([[1, player]]), playerId: 1,
    player: {}, settings: { gameplay: { controlScheme: 'pilot' },
      controls: { bindings: {}, gamepad: { enabled: false }, touch: { enabled: false } } },
    input: { autoFire: true, actions: {}, aimWorld: { x: 0, z: 0 },
      pointerScreen: { active: false }, mouseNdc: { x: 0, y: 0 } } };
  const h = { state, _autoTargetGesture: emptyDrawFlightGesture(),
    camera: { x: 0, z: 0 }, player };
  h.helpers = {
    worldToScreen: p => ({ x: 500 + (p.x - h.camera.x), y: 300 + (p.z - h.camera.z) }),
    raycastToPlane: n => ({ x: h.camera.x + n.x * 500, z: h.camera.z - n.y * 300 }),
  };
  h.draw = (dx, dy, ms) => { state.simTime = ms / 1000; return recordDrawFlightGesture(h, dx, dy, ms, 1000, 600); };
  return h;
}

test('camera pan cannot write world-space ink; screen edges cannot eat a trackpad stroke', () => {
  const h = host();
  h.draw(40, 0, 0);
  h.camera.x = 300; h.camera.z = -80;
  h.draw(0, 40, 16);
  let pts = h.state.input.autoTargetPath.points;
  assert.deepEqual(pts.map(p => ({ x: Math.round(p.x), z: Math.round(p.z) })),
    [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 40 }]);
  for (let i = 0; i < 30; i++) h.draw(40, 0, 32 + i * 16);
  pts = h.state.input.autoTargetPath.points;
  assert.ok(pts.at(-1).x > 1200, 'relative ink continues beyond viewport width');
});

test('lifting and restarting the trackpad starts a fresh route at the moving ship', () => {
  const h = host();
  h.draw(80, 0, 0);
  const first = h.state.input.autoTargetPath;
  h.player.pos.x = 200;
  h.draw(0, -40, 220);
  assert.notEqual(h.state.input.autoTargetPath, first);
  assert.deepEqual(h.state.input.autoTargetPath.points[0], { x: 200, z: 0 });
  assert.ok(h.state.input.autoTargetPath.points[1].z < -39.99);
});

test('a completed stroke or excessive queued flight cannot hold new steering behind old ink', () => {
  for (const command of [{ exhausted: true }, { backlogS: 2 }]) {
    const h = host(); h.draw(80, 0, 0);
    h.state.input.drawFlight = command;
    h.player.pos.x = 24;
    h.draw(0, 10, 16);
    assert.deepEqual(h.state.input.autoTargetPath.points[0], { x: 24, z: 0 });
  }
});

test('subpixel tremor, corrupt packets and frozen pointer state cannot create phantom control', () => {
  const h = host();
  for (let i = 0; i < 40; i++) h.draw(i % 2 ? -0.2 : 0.2, 0, i * 16);
  assert.equal(h.state.input.autoTargetPath, undefined);
  for (const [x, y] of [[NaN, 0], [Infinity, 3], [1e300, 1e300], [0, 0]]) {
    assert.equal(h.draw(x, y, 800), false);
  }
  h.draw(0, 4, 810);
  assert.ok(h.state.input.autoTargetPath.active, 'small deliberate trackpad movement still engages');
});

test('brake, manual axes, blocked screens and G-off revoke the flight command', () => {
  for (const how of ['brake', 'manual', 'blocked', 'screen', 'off']) {
    const h = host(); h.draw(80, 0, 0);
    const rt = createAutoTargetRuntime();
    tickAutoTarget(h.state, 1 / 60, null, rt);
    assert.ok(h.state.input.drawFlight?.active);
    if (how === 'brake') h.state.input.brake = true;
    if (how === 'manual') h.state.input.drawFlightManual = true;
    if (how === 'blocked') h.state.input.blocked = true;
    if (how === 'screen') h.state.ui = { screenStack: ['pause'] };
    if (how === 'off') toggleAutoTarget(h.state, null, rt);
    tickAutoTarget(h.state, 1 / 60, null, rt);
    assert.equal(h.state.input.drawFlight, undefined, how);
  }
});

// Exercise the actual input owner, including the compatibility mouse/pointer event pair.
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

test('real DOM owner records mousemove once, fences modals, and clears stale flight on blur', () => {
  const d = dom(), h = host();
  const owner = Object.create(input);
  const bus = createBus();
  try {
    owner.init({ state: h.state, bus, helpers: h.helpers });
    owner.update(1 / 60, h.state);
    const e = { target: d.canvas, clientX: 500, clientY: 300, movementX: 30, movementY: 0 };
    d.win.dispatch('pointermove', e); d.win.dispatch('mousemove', e);
    assert.equal(h.state.input.autoTargetPath.points.length, 2, 'one physical move, one segment');
    assert.ok(Math.abs(h.state.input.autoTargetPath.points[1].x - 30) < 1e-8);
    const rt = createAutoTargetRuntime();
    tickAutoTarget(h.state, 1 / 60, bus, rt);
    assert.ok(h.state.input.drawFlight?.active);
    d.win.dispatch('blur');
    assert.equal(h.state.input.drawFlight, undefined);
    assert.equal(h.state.input.autoTargetPath.active, false);
    h.state.ui = { screenStack: ['pause'] };
    d.win.dispatch('mousemove', e);
    assert.equal(h.state.input.autoTargetPath.active, false);
  } finally { owner.destroy(); d.restore(); }
});

test('G is rebindable, repeat-safe, modal-safe, and works after blur or denied pointer lock', () => {
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
