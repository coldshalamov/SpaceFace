// Pointer-lock menu trap — the OS cursor must never strand while a menu is open.
//
// The canvas lock belongs to combat-stick mode (autoFire) in pure flight. Opening any
// screen freezes sim ticks (shouldSkipFullTickSystems), which kills autoTargetAssist.update's
// per-tick reconcile, and pause flips mode directly without a mode:changed event, so the
// reset path never runs either. A lock held (or landing late) across that boundary used to
// stay held: the browser hides the OS cursor while locked and the software reticle is off
// under any menu, so the player sits in front of a menu with NO cursor at all — the mouse
// looks dead. This drives the REAL screenManager + REAL autoTargetAssist together so the
// release is proven across the boundary, not inside one module.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { shouldSkipFullTickSystems } from '../src/core/presentationFreeze.js';
import { createScreenManager } from '../src/ui/screenManager.js';
import { autoTargetAssist, inPureFlightForLock, pointerLockIsLegitimate } from '../src/systems/autoTargetAssist.js';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    if (force === undefined) force = !this.values.has(value);
    if (force) this.values.add(value); else this.values.delete(value);
    return force;
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.hidden = false;
    this.disabled = false;
    this.isConnected = true;
    this.inert = false;
    this.id = '';
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  prepend(child) { child.parentNode = this; this.children.unshift(child); return child; }
  removeChild(child) { this.children = this.children.filter((node) => node !== child); child.parentNode = null; return child; }
  addEventListener() {}
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  contains(candidate) { for (let node = candidate; node; node = node.parentNode) if (node === this) return true; return false; }
  focus() { globalThis.document.activeElement = this; }
  blur() { if (globalThis.document.activeElement === this) globalThis.document.activeElement = globalThis.document.body; }
}

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, cb) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(cb);
  }
  removeEventListener(type, cb) { this.listeners.get(type)?.delete(cb); }
  dispatch(type, props = {}) {
    const e = { type, preventDefault() {}, stopImmediatePropagation() {}, ...props };
    for (const cb of [...(this.listeners.get(type) || [])]) cb(e);
  }
}

function installFixtureDom() {
  const originals = new Map();
  const stash = (key, value) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  const elements = new Map();
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const screens = new FakeElement('div'); screens.id = 'screens'; elements.set('screens', screens); body.appendChild(screens);
  const backdrop = new FakeElement('div'); backdrop.id = 'modal-backdrop'; elements.set('modal-backdrop', backdrop); body.appendChild(backdrop);
  const hud = new FakeElement('div'); hud.id = 'hud'; elements.set('hud', hud); body.appendChild(hud);
  const canvas = new FakeElement('canvas'); canvas.id = 'gl-canvas'; elements.set('gl-canvas', canvas); body.appendChild(canvas);
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.body = body;
  doc.head = head;
  doc.activeElement = body;
  doc.pointerLockElement = null;
  doc.exitCalls = 0;
  doc.getElementById = (id) => elements.get(id) || null;
  doc.createElement = (tagName) => new FakeElement(tagName);
  doc.exitPointerLock = () => {
    doc.exitCalls += 1;
    doc.pointerLockElement = null;
    doc.dispatch('pointerlockchange');
  };
  stash('document', doc);
  stash('window', win);
  stash('addEventListener', win.addEventListener.bind(win));
  stash('removeEventListener', win.removeEventListener.bind(win));
  stash('requestAnimationFrame', (callback) => { callback(0); return 1; });
  stash('cancelAnimationFrame', () => {});
  return {
    win, doc, canvas, body,
    restore() {
      for (const [key, desc] of originals) {
        if (desc) Object.defineProperty(globalThis, key, desc);
        else delete globalThis[key];
      }
    },
  };
}

function boot({ grant = 'sync' } = {}) {
  const d = installFixtureDom();
  const state = createGameState(11);
  state.mode = 'flight';
  state.settings.gameplay.controlScheme = 'pilot';
  state.settings.controls.bindings = { autoFire: ['KeyG'] };
  const bus = createBus();
  const effects = createTimeEffects(state);
  const manager = createScreenManager({ state, bus, timeEffects: effects });
  // Mirror the real pause screen's mode flip (src/ui/screens/pause.js onShow).
  manager.register({ id: 'pause', onShow: (ctx) => { if (ctx.state.mode === 'flight') ctx.state.mode = 'paused'; } });
  const assist = Object.create(autoTargetAssist);
  assist.init({ state, bus });
  let releaseGrant = null;
  if (grant === 'sync') {
    d.canvas.requestPointerLock = () => {
      d.doc.pointerLockElement = d.canvas;
      d.doc.dispatch('pointerlockchange');
      return Promise.resolve();
    };
  } else if (grant === 'pending') {
    d.canvas.requestPointerLock = () => new Promise((resolve) => {
      releaseGrant = () => {
        d.doc.pointerLockElement = d.canvas;
        d.doc.dispatch('pointerlockchange');
        resolve();
      };
    });
  }
  const pressG = () => {
    d.win.dispatch('keydown', { code: 'KeyG' });
    d.win.dispatch('keyup', { code: 'KeyG' });
  };
  return {
    d, state, bus, manager, assist,
    pressG,
    grantPending: () => { if (!releaseGrant) throw new Error('no pending lock request'); releaseGrant(); },
    destroy() { try { assist.destroy(); } finally { d.restore(); } },
  };
}

test('a lock held when a menu opens is released even though sim ticks freeze', () => {
  const f = boot();
  try {
    f.pressG();
    assert.equal(f.state.input.autoFire, true, 'G enables combat-stick mode');
    assert.equal(f.d.doc.pointerLockElement, f.d.canvas, 'the mode holds the canvas lock');
    f.manager.pushScreen('pause');
    assert.equal(shouldSkipFullTickSystems(f.state), true, 'the open menu freezes sim ticks');
    assert.equal(f.d.doc.pointerLockElement, null, 'the menu boundary releases the lock — the OS cursor must come back');
    assert.ok(f.d.doc.exitCalls >= 1, 'exitPointerLock ran at the boundary');
    assert.equal(f.state.input.autoFire, true, 'the mode itself survives pause; only the lock is released');
  } finally { f.destroy(); }
});

test('a lock granted late while a menu is open is released on arrival, not kept', () => {
  const f = boot({ grant: 'pending' });
  try {
    f.pressG();
    assert.equal(f.state.input.autoFire, true);
    assert.equal(f.d.doc.pointerLockElement, null, 'grant still pending');
    f.manager.pushScreen('pause');
    assert.equal(shouldSkipFullTickSystems(f.state), true);
    f.grantPending();
    assert.equal(f.d.doc.pointerLockElement, null, 'a late grant landing in a menu must not strand the cursor');
    assert.ok(f.d.doc.exitCalls >= 1, 'the late landing is released on arrival');
  } finally { f.destroy(); }
});

test('losing window focus releases a held lock so Alt-Tab cannot strand the cursor', () => {
  const f = boot();
  try {
    f.pressG();
    assert.equal(f.d.doc.pointerLockElement, f.d.canvas);
    f.d.win.dispatch('blur');
    assert.equal(f.d.doc.pointerLockElement, null, 'blur releases the lock');
  } finally { f.destroy(); }
});

test('the lock is legitimate only for G-mode in pure flight', () => {
  const f = boot();
  try {
    // Pure flight, mode off: a stray lock is never legitimate.
    assert.equal(inPureFlightForLock(f.state), true);
    assert.equal(pointerLockIsLegitimate(f.state, true), false);
    // Pure flight, mode on: the one legitimate hold.
    f.state.input.autoFire = true;
    assert.equal(pointerLockIsLegitimate(f.state, true), true);
    // Mode on but a menu is up: the reticle is gone, so the lock must go too.
    f.d.body.classList.add('ui-modal-open');
    assert.equal(inPureFlightForLock(f.state), false);
    assert.equal(pointerLockIsLegitimate(f.state, inPureFlightForLock(f.state)), false);
    // Mode on but paused: same — no reticle, no lock.
    f.d.body.classList.remove('ui-modal-open');
    f.state.mode = 'paused';
    assert.equal(inPureFlightForLock(f.state), false);
    assert.equal(pointerLockIsLegitimate(f.state, inPureFlightForLock(f.state)), false);
  } finally { f.destroy(); }
});
