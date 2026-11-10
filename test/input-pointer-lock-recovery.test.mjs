import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { autoTargetAssist, inPureFlightForLock, pointerLockIsLegitimate } from '../src/systems/autoTargetAssist.js';

class Events {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, fields = {}) {
    const event = { type, preventDefault() {}, stopImmediatePropagation() {}, ...fields };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
  }
}

function fixture({ pending = false } = {}) {
  const originals = new Map();
  const install = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  const win = new Events();
  const doc = new Events();
  const canvas = {};
  let focused = true;
  let grant;
  doc.hidden = false;
  doc.hasFocus = () => focused;
  doc.body = { classList: { contains: () => false } };
  doc.getElementById = (id) => id === 'gl-canvas' ? canvas : null;
  doc.pointerLockElement = null;
  doc.exitPointerLock = () => {
    doc.pointerLockElement = null;
    doc.dispatch('pointerlockchange');
  };
  canvas.requestPointerLock = () => {
    const acquire = () => {
      doc.pointerLockElement = canvas;
      doc.dispatch('pointerlockchange');
    };
    if (!pending) { acquire(); return Promise.resolve(); }
    return new Promise((resolve) => { grant = () => { acquire(); resolve(); }; });
  };
  install('document', doc);
  install('addEventListener', win.addEventListener.bind(win));
  install('removeEventListener', win.removeEventListener.bind(win));
  const state = createGameState(821);
  state.mode = 'flight';
  state.ui.screenStack = [];
  const host = Object.create(autoTargetAssist);
  host.init({ state, bus: createBus() });
  return {
    state, host, doc, win, canvas,
    pressG() { win.dispatch('keydown', { code: 'KeyG' }); win.dispatch('keyup', { code: 'KeyG' }); },
    blur() { focused = false; win.dispatch('blur'); },
    focus() { focused = true; win.dispatch('focus'); },
    grant() { assert.ok(grant, 'a lock request is pending'); grant(); },
    cleanup() {
      host.destroy();
      for (const [name, original] of originals) {
        if (original) Object.defineProperty(globalThis, name, original);
        else delete globalThis[name];
      }
    },
  };
}

test('an input fence and a screen stack revoke the combat pointer lock', () => {
  for (const fence of [
    (state) => { state.input.blocked = true; },
    (state) => { state.ui.screenStack.push('drill'); },
  ]) {
    const f = fixture();
    try {
      f.pressG();
      assert.equal(f.doc.pointerLockElement, f.canvas);
      fence(f.state);
      assert.equal(inPureFlightForLock(f.state), false);
      assert.equal(pointerLockIsLegitimate(f.state, true), false,
        'a stale render-visible flag cannot preserve a lock after flight input is fenced');
      f.host.update(1 / 60, f.state);
      assert.equal(f.doc.pointerLockElement, null);
      assert.equal(f.state.input.autoFire, true, 'the mode survives; only cursor ownership is revoked');
    } finally { f.cleanup(); }
  }
});

test('a pointer lock arriving after blur is released without waiting for a simulation tick', async () => {
  const f = fixture({ pending: true });
  try {
    f.pressG();
    f.blur();
    f.grant();
    await Promise.resolve();
    assert.equal(f.doc.pointerLockElement, null, 'late grant must not hide the cursor while unfocused');
    f.focus();
    assert.equal(inPureFlightForLock(f.state), true, 'focus restores eligibility without disabling G mode');
    assert.equal(f.doc.pointerLockElement, null, 'focus alone does not recapture the mouse');
  } finally { f.cleanup(); }
});

test('hiding the page releases a held combat lock before any further tick', () => {
  const f = fixture();
  try {
    f.pressG();
    assert.equal(f.doc.pointerLockElement, f.canvas);
    f.doc.hidden = true;
    f.doc.dispatch('visibilitychange');
    assert.equal(f.doc.pointerLockElement, null, 'hidden pages cannot own the mouse');
    assert.equal(pointerLockIsLegitimate(f.state, true), false);
  } finally { f.cleanup(); }
});

test('a pending lock cannot outlive destruction of its input owner', async () => {
  const f = fixture({ pending: true });
  try {
    f.pressG();
    f.host.destroy();
    f.grant();
    await Promise.resolve();
    assert.equal(f.doc.pointerLockElement, null, 'the request completion releases even after listeners detach');
  } finally { f.cleanup(); }
});
