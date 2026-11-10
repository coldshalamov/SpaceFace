// SF-276 — focus loss releases held controls and never replays stale edge actions.
// scope: the REAL DOM adapter paths — window 'blur', 'pointercancel', document
// 'pointerlockchange', and destroy() — all funnel into releaseHeldControls. Assertions pin the
// COMMITTED contract consumers read (state.input.moveX/moveZ/turnIntent/fire/boost/brake,
// state.input.actions edges, pointerScreen/aimIntentActive), not just the private _keys mirror:
// a release that only cleared internals while committed commands stayed hot would still be the
// FB-126 defect. Existing coverage: test/input-lifecycle.test.mjs (listener wiring, internal
// clears), test/fb-126-focus-loss.test.mjs (time-hold prefs). This file proves the seam at the
// level the sim reads after the next update tick.
import test from 'node:test';
import assert from 'node:assert/strict';

import { input } from '../src/systems/input.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type, event = {}) {
    const payload = event;
    payload.type = type;
    if (typeof payload.preventDefault !== 'function') {
      payload.preventDefault = () => { payload.defaultPrevented = true; };
    }
    for (const listener of [...(this.listeners.get(type) || [])]) listener(payload);
  }
  listenerCount(type) { return this.listeners.get(type)?.size || 0; }
}

function installFakeInputDom() {
  const previous = {};
  for (const name of ['window', 'document', 'innerWidth', 'innerHeight', 'addEventListener', 'removeEventListener']) {
    previous[name] = {
      present: Object.prototype.hasOwnProperty.call(globalThis, name),
      value: globalThis[name],
    };
  }
  const windowTarget = new FakeEventTarget();
  windowTarget.innerWidth = 1280;
  windowTarget.innerHeight = 800;
  const canvasTarget = new FakeEventTarget();
  const documentTarget = new FakeEventTarget();
  documentTarget.pointerLockElement = null;
  documentTarget.body = {
    classList: { contains: () => false },
  };
  documentTarget.getElementById = (id) => (id === 'gl-canvas' ? canvasTarget : null);
  documentTarget.activeElement = null;
  globalThis.window = windowTarget;
  globalThis.document = documentTarget;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 800;
  globalThis.addEventListener = windowTarget.addEventListener.bind(windowTarget);
  globalThis.removeEventListener = windowTarget.removeEventListener.bind(windowTarget);
  return {
    windowTarget,
    canvasTarget,
    documentTarget,
    restore() {
      for (const [name, entry] of Object.entries(previous)) {
        if (entry.present) globalThis[name] = entry.value;
        else delete globalThis[name];
      }
    },
  };
}

function makeFixture() {
  const dom = installFakeInputDom();
  const state = createGameState(276);
  state.mode = 'flight';
  state.playerId = 1;
  state.ui.screenStack = [];
  state.player.tether = { active: false, targetId: null, strain: 0, load: 0, restLength: 0, phase: 'slack' };
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
  });
  const events = [];
  const bus = createBus();
  bus.on('input:worldGestureCancelled', (payload) => events.push({ type: 'worldGestureCancelled', payload }));
  const host = Object.create(input);
  host.init({ state, bus, helpers: { raycastToPlane: () => ({ x: 0, z: 0 }) } });
  const step = (n = 1) => {
    for (let i = 0; i < n; i += 1) { state.tick += 1; host.update(1 / 60, state); }
  };
  const keydown = (code) => dom.windowTarget.dispatch('keydown', { code, target: null });
  const keyup = (code) => dom.windowTarget.dispatch('keyup', { code, target: null });
  const assertNeutralCommitted = (label) => {
    const inp = state.input;
    assert.equal(inp.moveX, 0, `${label}: moveX neutral`);
    assert.equal(inp.moveZ, 0, `${label}: moveZ neutral`);
    assert.equal(inp.turnIntent, 0, `${label}: turnIntent neutral`);
    assert.equal(inp.fire, false, `${label}: fire released`);
    assert.equal(inp.boost, false, `${label}: boost released`);
    assert.equal(inp.brake, false, `${label}: brake released`);
    if (inp.pointerScreen) assert.equal(inp.pointerScreen.active, false, `${label}: pointerScreen inactive`);
    assert.equal(inp.aimIntentActive === true, false, `${label}: aim intent inactive`);
  };
  return { dom, state, events, host, step, keydown, keyup, assertNeutralCommitted };
}

test('SF-276 window blur releases held thrust, boost, and fire before the next tick', () => {
  const { dom, state, host, step, keydown, assertNeutralCommitted } = makeFixture();
  try {
    keydown('KeyW');            // forward thrust
    keydown('KeyD');            // yaw
    keydown('ShiftLeft');       // boost
    dom.canvasTarget.dispatch('mousedown', { button: 0, target: dom.canvasTarget, clientX: 640, clientY: 400 });
    step();
    assert.notEqual(state.input.moveZ, 0, 'held W commands thrust');
    assert.equal(state.input.boost, true, 'held Shift commands boost');
    assert.equal(state.input.fire, true, 'held LMB commands fire');
    assert.notEqual(state.input.turnIntent, 0, 'held D commands yaw');

    // The window blurs; the OS never delivers the keyup/mouseup for these holds.
    dom.windowTarget.dispatch('blur');
    step();
    assertNeutralCommitted('after blur');
    assert.equal(host._keys.KeyW, false, 'the raw key map no longer remembers W');
    assert.equal(host._m0, false, 'the raw mouse button no longer remembers LMB');

    // Several blurred frames pass; nothing resurfaces without a fresh physical event.
    step(5);
    assertNeutralCommitted('still blurred');
  } finally {
    host.destroy();
    dom.restore();
  }
});

test('SF-276 pointercancel releases the same holds through the same seam', () => {
  const { dom, state, host, step, keydown, assertNeutralCommitted } = makeFixture();
  try {
    keydown('KeyW');
    dom.canvasTarget.dispatch('mousedown', { button: 0, target: dom.canvasTarget, clientX: 640, clientY: 400 });
    step();
    assert.equal(state.input.fire, true);
    assert.notEqual(state.input.moveZ, 0);

    dom.windowTarget.dispatch('pointercancel');
    step();
    assertNeutralCommitted('after pointercancel');
  } finally {
    host.destroy();
    dom.restore();
  }
});

test('SF-276 losing pointer lock releases holds; a lock handoff to another element does not', () => {
  const { dom, state, host, step, keydown, assertNeutralCommitted } = makeFixture();
  try {
    keydown('KeyW');
    dom.canvasTarget.dispatch('mousedown', { button: 0, target: dom.canvasTarget, clientX: 640, clientY: 400 });
    step();
    assert.equal(state.input.fire, true);

    // Pointer lock moves to a NEW element — lock is still held, no release.
    dom.documentTarget.pointerLockElement = dom.canvasTarget;
    dom.documentTarget.dispatch('pointerlockchange');
    step();
    assert.equal(state.input.fire, true, 'still-locked pointerlockchange must not release');
    assert.notEqual(state.input.moveZ, 0, 'still-locked pointerlockchange keeps thrust');

    // Lock actually drops: held controls release before the next tick publishes them.
    dom.documentTarget.pointerLockElement = null;
    dom.documentTarget.dispatch('pointerlockchange');
    step();
    assertNeutralCommitted('after pointerlock release');
  } finally {
    host.destroy();
    dom.restore();
  }
});

test('SF-276 destroy() releases committed controls and detaches every owned listener', () => {
  const { dom, state, host, step, keydown, assertNeutralCommitted } = makeFixture();
  try {
    keydown('KeyW');
    dom.canvasTarget.dispatch('mousedown', { button: 0, target: dom.canvasTarget, clientX: 640, clientY: 400 });
    step();
    assert.equal(state.input.fire, true);

    host.destroy();
    assert.equal(host._keys.KeyW, false, 'destroy clears the raw key map');
    assert.equal(host._m0, false);
    assertNeutralCommitted('after destroy');

    // Detached listeners: a later blur/keydown reaches nothing the host still owns.
    assert.equal(dom.windowTarget.listenerCount('keydown'), 0);
    assert.equal(dom.windowTarget.listenerCount('blur'), 0);
    assert.equal(dom.documentTarget.listenerCount('pointerlockchange'), 0);
    dom.windowTarget.dispatch('keydown', { code: 'KeyW', target: null });
    assert.notEqual(host._keys.KeyW, true, 'a dead host cannot be re-armed by stray events');
  } finally {
    dom.restore();
  }
});

test('SF-276 a verb held across blur cannot replay its edge when focus returns', () => {
  const { dom, state, host, step, keydown, keyup } = makeFixture();
  try {
    // Pilot holds V (cruise) — the press queues an edge and the key stays down.
    keydown('KeyV');
    // The window blurs before any tick samples the queue: press edge + key state both drop.
    dom.windowTarget.dispatch('blur');
    // Focus returns; the OS delivers the keyup it held during the blur.
    keyup('KeyV');
    step(3);
    assert.equal(state.input.actions.cruise, false,
      'a held-across-blur press must not fire on the far side of focus');

    // An honest fresh press still works — release only reset memory, not the binding.
    keydown('KeyV');
    step();
    assert.equal(state.input.actions.cruise, true, 'a fresh press after focus returns fires once');
    keyup('KeyV');
    step();
    assert.equal(state.input.actions.cruise, false, 'the edge does not repeat on later ticks');
  } finally {
    host.destroy();
    dom.restore();
  }
});

test('SF-276 a completed tap before blur still lands exactly once — and a held one never does', () => {
  const { dom, state, host, step, keydown, keyup } = makeFixture();
  try {
    // Completed tap: press AND release both sampled before the blur. Contract (see
    // dropUnreleasedHeldEdges): the queued tap still reaches the next sim step.
    keydown('KeyC'); // scanPulse
    keyup('KeyC');
    dom.windowTarget.dispatch('blur');
    step();
    assert.equal(state.input.actions.scanPulse, true,
      'a tap completed before blur is real input, not a stale edge');
    step(2);
    assert.equal(state.input.actions.scanPulse, false, 'and it fires exactly once');

    // Contrast, same tick-gap: a press whose release never arrived is dropped entirely.
    keydown('KeyV'); // cruise — stays physically held
    dom.windowTarget.dispatch('blur');
    step(3);
    assert.equal(state.input.actions.cruise, false,
      'the still-held press is the stale edge the release drops');
  } finally {
    host.destroy();
    dom.restore();
  }
});

test('SF-276 the Massline hold across blur cannot phantom-attach after focus returns', () => {
  const { dom, state, host, step, keydown, keyup } = makeFixture();
  try {
    keydown('Space'); // tether primary
    step();
    assert.equal(state.input.actions.tetherFire, true, 'held Space latches the Massline cast');

    dom.windowTarget.dispatch('blur'); // Space never releases
    step();
    assert.equal(state.input.actions.tetherFire, false,
      'a blurred hold cannot keep the latch lit');
    keyup('Space'); // the OS delivers the release after focus returns
    step(3);
    assert.equal(state.input.actions.tetherFire, false,
      'the late release is not mistaken for a fresh cast');
    assert.equal(state.input.actions.tetherCut, false,
      'and it cannot cut a line that was never attached');
  } finally {
    host.destroy();
    dom.restore();
  }
});

test('SF-276 player rebinds survive the release — resume is neutral, not dead', () => {
  const { dom, state, host, step, keydown, keyup } = makeFixture();
  try {
    state.settings.controls.bindings = { cruise: ['KeyN'] };
    keydown('KeyN');
    step();
    assert.equal(state.input.actions.cruise, true, 'the rebound key edges before blur');

    dom.windowTarget.dispatch('blur');
    step(2);
    keyup('KeyN');
    step(2);
    assert.equal(state.input.actions.cruise, false, 'no stale rebound edge replays');

    keydown('KeyN');
    step();
    assert.equal(state.input.actions.cruise, true,
      'the binding still resolves after focus loss — controls are not unbound by release');
    keyup('KeyN');
  } finally {
    host.destroy();
    dom.restore();
  }
});

test('SF-276 blur cancels a live world-object gesture exactly once', () => {
  const { dom, state, events, host, step, keydown } = makeFixture();
  try {
    state.input.worldObjectTargetId = 7;
    dom.canvasTarget.dispatch('mousedown', { button: 2, target: dom.canvasTarget, clientX: 640, clientY: 400 });
    dom.windowTarget.dispatch('blur');
    assert.equal(host._m2, false, 'RMB hold released');
    assert.equal('worldObjectTargetId' in state.input, false, 'gesture target cleared');
    assert.deepEqual(
      events.map((entry) => entry.payload && entry.payload.reason),
      ['window-blur'],
      'the cancel receipt names the blur reason once',
    );
    step(2);
    dom.windowTarget.dispatch('blur'); // a second blur has nothing left to cancel
    assert.equal(events.length, 1, 'release is idempotent — no double cancel receipt');
  } finally {
    host.destroy();
    dom.restore();
  }
});
