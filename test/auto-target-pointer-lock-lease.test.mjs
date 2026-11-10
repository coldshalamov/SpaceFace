import test from 'node:test';
import assert from 'node:assert/strict';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';
import { createBus } from '../src/core/eventBus.js';

// The canvas pointer lock is owned by combat-stick mode (autoFire). Two real leak paths
// stranded it in the OFF state: a requestPointerLock() that was still pending when the mode
// toggled back lands as a lock nothing releases, and writers that clear autoFire without
// touching the lock API (runtime resets, restores) leave a held lock in place. While the
// canvas holds the lock the OS cursor is hidden and clientX/Y freeze — the aim reticle
// pins dead and the player cannot see where they are aiming ("cursor is nowhere").

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, cb) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(cb);
  }
  removeEventListener(type, cb) { this.listeners.get(type)?.delete(cb); }
  dispatch(type, props = {}) {
    const e = { type, preventDefault() {}, stopImmediatePropagation() {}, ...props };
    for (const cb of this.listeners.get(type) || []) cb(e);
  }
}

function dom() {
  const originals = new Map();
  const canvas = new Target(), win = new Target(), doc = new Target();
  doc.getElementById = (id) => (id === 'gl-canvas' ? canvas : null);
  doc.body = { classList: { contains: () => false } };
  doc.pointerLockElement = null;
  doc.exitCalls = 0;
  doc.exitPointerLock = () => {
    doc.exitCalls += 1;
    doc.pointerLockElement = null;
    doc.dispatch('pointerlockchange');
  };
  const replacements = {
    window: win, document: doc, innerWidth: 1000, innerHeight: 600,
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
  };
  for (const [k, v] of Object.entries(replacements)) {
    originals.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v });
  }
  return {
    win, canvas, doc,
    restore() {
      for (const [k, desc] of originals) {
        if (desc) Object.defineProperty(globalThis, k, desc);
        else delete globalThis[k];
      }
    },
  };
}

function host() {
  const state = {
    mode: 'flight',
    simTime: 0,
    entities: new Map(),
    playerId: 1,
    player: {},
    ui: { screenStack: [] },
    settings: { gameplay: { controlScheme: 'pilot' }, controls: { bindings: {} } },
    input: {
      autoFire: false,
      actions: {},
      aimWorld: { x: 0, z: 0 },
      autoTargetPath: { active: false, drawing: false, pointIndex: 1, points: [] },
      autoTargetVector: { active: false, screenX: 0, screenY: 0, worldX: 0, worldZ: 0, magnitude: 0 },
      pointerScreen: { active: false },
      mouseNdc: { x: 0, y: 0 },
    },
  };
  return { state };
}

function boot() {
  const d = dom();
  const h = host();
  const inst = Object.create(autoTargetAssist);
  const bus = createBus();
  inst.init({ state: h.state, bus });
  return { d, h, inst, bus };
}

const pressG = (d) => {
  d.win.dispatch('keydown', { code: 'KeyG' });
  d.win.dispatch('keyup', { code: 'KeyG' });
};

test('a pointer-lock request still pending when the mode turns off is released when it lands', () => {
  const { d, h, inst } = boot();
  let grant = null;
  d.canvas.requestPointerLock = () => new Promise((resolve) => {
    grant = () => {
      d.doc.pointerLockElement = d.canvas;
      d.doc.dispatch('pointerlockchange');
      resolve();
    };
  });
  try {
    pressG(d);
    assert.equal(h.state.input.autoFire, true);
    assert.equal(grant != null, true, 'lock request was issued');
    pressG(d);
    assert.equal(h.state.input.autoFire, false);
    assert.equal(d.doc.exitCalls, 0, 'nothing was held to release at toggle-off');
    grant();
    assert.equal(d.doc.exitCalls, 1, 'the late-landing lock is released, not kept');
    assert.equal(d.doc.pointerLockElement, null);
    assert.equal(inst._pointerLockAcquired, false);
  } finally { inst.destroy(); d.restore(); }
});

test('a lock held while autoFire is cleared by a non-toggle writer releases on the next tick', () => {
  const { d, h, inst } = boot();
  d.canvas.requestPointerLock = () => {
    d.doc.pointerLockElement = d.canvas;
    d.doc.dispatch('pointerlockchange');
    return Promise.resolve();
  };
  try {
    pressG(d);
    assert.equal(h.state.input.autoFire, true);
    assert.equal(d.doc.pointerLockElement, d.canvas);
    // main.js resetCombatInputMode clears autoFire directly — no lock API call.
    h.state.input.autoFire = false;
    inst.update(1 / 60, h.state);
    assert.equal(d.doc.exitCalls, 1, 'the orphaned canvas lock is reconciled away');
    assert.equal(d.doc.pointerLockElement, null);
    assert.equal(inst._pointerLockAcquired, false);
  } finally { inst.destroy(); d.restore(); }
});

test('a held lock is NOT released while combat-stick mode is still on', () => {
  const { d, h, inst } = boot();
  d.canvas.requestPointerLock = () => {
    d.doc.pointerLockElement = d.canvas;
    d.doc.dispatch('pointerlockchange');
    return Promise.resolve();
  };
  try {
    pressG(d);
    assert.equal(h.state.input.autoFire, true);
    assert.equal(d.doc.pointerLockElement, d.canvas);
    inst.update(1 / 60, h.state);
    inst.update(1 / 60, h.state);
    assert.equal(d.doc.exitCalls, 0, 'the live-mode lock is left alone');
    assert.equal(d.doc.pointerLockElement, d.canvas);
  } finally { inst.destroy(); d.restore(); }
});
