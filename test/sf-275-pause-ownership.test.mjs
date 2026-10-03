// SF-275 — a pause request releases only its own hold.
// scope: the REAL screenManager aggregate source ('ui:pausing-screen'), the REAL focus-loss
// hold ('window-focus-loss'), and the REAL timeEffects minimum-composition are driven together
// so each release path is proven against the other owners still holding — not a re-implemented
// ledger. describeRequests() is asserted as the diagnostic surface that must show the truth.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import {
  FOCUS_LOSS_TIME_SOURCE,
  beginFocusLossSaveWrite,
  endFocusLossSaveWrite,
  syncFocusLossHold,
} from '../src/core/focusLossHold.js';
import { createScreenManager } from '../src/ui/screenManager.js';

const UI_SOURCE = 'ui:pausing-screen';
const HIT_STOP = 'feel:hit-stop';

function installDomFixture() {
  const elements = new Map();
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
    appendChild(child) { child.parentNode = this; this.children.push(child); if (child.id) elements.set(child.id, child); return child; }
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
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const screens = new FakeElement('div'); screens.id = 'screens'; elements.set('screens', screens); body.appendChild(screens);
  const backdrop = new FakeElement('div'); backdrop.id = 'modal-backdrop'; elements.set('modal-backdrop', backdrop); body.appendChild(backdrop);
  const hud = new FakeElement('div'); hud.id = 'hud'; elements.set('hud', hud); body.appendChild(hud);
  globalThis.document = {
    body, head, activeElement: body,
    getElementById(id) { return elements.get(id) || null; },
    createElement(tagName) { return new FakeElement(tagName); },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = (callback) => { callback(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};
}

function makeFixture() {
  installDomFixture();
  const state = createGameState(11);
  state.mode = 'flight';
  const bus = createBus();
  const emitted = [];
  bus.on('sim:pause', () => emitted.push('pause'));
  bus.on('sim:resume', () => emitted.push('resume'));
  const effects = createTimeEffects(state);
  const manager = createScreenManager({ state, bus, timeEffects: effects });
  manager.register({ id: 'pause' });
  manager.register({ id: 'settings' });
  manager.register({ id: 'crucibleResults' });
  return { state, bus, emitted, effects, manager };
}

function sources(effects) {
  return Object.keys(effects.describeRequests()).sort();
}

test('SF-275 a UI release leaves the focus-loss hold frozen; focus return releases only its own', () => {
  const { state, emitted, effects, manager } = makeFixture();

  manager.pushScreen('pause');
  assert.equal(state.timeScale, 0);
  assert.deepEqual(sources(effects), [UI_SOURCE]);
  assert.deepEqual(emitted, ['pause']);

  // The window blurs under the open pause screen: a second, independent hold.
  const blurred = syncFocusLossHold(state, true);
  assert.deepEqual(blurred, { paused: true, muted: false });
  assert.equal(state.timeScale, 0);
  assert.deepEqual(sources(effects), [FOCUS_LOSS_TIME_SOURCE, UI_SOURCE].sort());

  // Closing the screen releases ONLY the UI source — the window is still blurred.
  manager.popScreen();
  assert.equal(state.timeScale, 0, 'focus-loss hold must keep the sim frozen after UI releases');
  assert.deepEqual(sources(effects), [FOCUS_LOSS_TIME_SOURCE]);
  assert.deepEqual(emitted, ['pause', 'resume'],
    'UI emits its resume edge; whether the sim actually runs belongs to the scalar');

  // Focus returns: the focus hold clears and nothing is left — the sim resumes.
  const focused = syncFocusLossHold(state, false);
  assert.deepEqual(focused, { paused: false, muted: false });
  assert.equal(state.timeScale, 1);
  assert.deepEqual(sources(effects), []);
});

test('SF-275 a focus return under a still-open screen cannot resume the sim', () => {
  const { state, effects, manager } = makeFixture();

  manager.pushScreen('pause');
  manager.pushScreen('settings');
  syncFocusLossHold(state, true);
  assert.equal(state.timeScale, 0);
  assert.deepEqual(sources(effects), [FOCUS_LOSS_TIME_SOURCE, UI_SOURCE].sort());

  // Focus returns while the nested stack is still open — its hold stays.
  syncFocusLossHold(state, false);
  assert.equal(state.timeScale, 0, 'the UI aggregate must outlive the focus hold');
  assert.deepEqual(sources(effects), [UI_SOURCE]);

  manager.popScreen();
  assert.equal(state.timeScale, 0, 'one nested screen still holds the aggregate');
  assert.deepEqual(sources(effects), [UI_SOURCE]);
  manager.popScreen();
  assert.equal(state.timeScale, 1);
  assert.deepEqual(sources(effects), []);
});

test('SF-275 docked is folded into the SAME ui source — one aggregate hold, one pause edge', () => {
  const { state, emitted, effects, manager } = makeFixture();

  manager.pushScreen('pause');
  assert.deepEqual(sources(effects), [UI_SOURCE]);
  assert.deepEqual(emitted, ['pause']);

  // Docking under an open screen must not mint a second source or a second pause edge.
  state.ui.docked = true;
  manager.syncVisibility();
  assert.deepEqual(sources(effects), [UI_SOURCE], 'docked shares the aggregate ui source');
  assert.equal(state.timeScale, 0);
  assert.deepEqual(emitted, ['pause'], 'no second sim:pause for the same interruption');

  // Undocking while the screen is still open keeps exactly that one hold.
  state.ui.docked = false;
  manager.syncVisibility();
  assert.equal(state.timeScale, 0);
  assert.deepEqual(sources(effects), [UI_SOURCE]);

  // And the inverse edge: dock alone freezes, a screen pushed over it reuses the same source.
  manager.popScreen();
  assert.equal(state.timeScale, 1);
  assert.deepEqual(emitted, ['pause', 'resume']);
  state.ui.docked = true;
  manager.syncVisibility();
  assert.equal(state.timeScale, 0);
  assert.deepEqual(sources(effects), [UI_SOURCE]);
  assert.deepEqual(emitted, ['pause', 'resume', 'pause']);
  manager.pushScreen('settings');
  assert.deepEqual(sources(effects), [UI_SOURCE], 'a screen over a docked pause stays one hold');
  assert.deepEqual(emitted, ['pause', 'resume', 'pause']);
  state.ui.docked = false;
  manager.syncVisibility();
  assert.equal(state.timeScale, 0, 'undocking under an open screen must not resume');
  manager.popScreen();
  assert.equal(state.timeScale, 1);
});

test('SF-275 hit-stop composes under UI pause in both release orders', () => {
  const { state, effects, manager } = makeFixture();

  manager.pushScreen('pause');
  effects.set(HIT_STOP, { scale: 0.12 });
  assert.equal(state.timeScale, 0, 'pause (0) still beats hit-stop slow-time');
  assert.deepEqual(sources(effects), [HIT_STOP, UI_SOURCE].sort());

  effects.clear(HIT_STOP);
  assert.equal(state.timeScale, 0, 'releasing hit-stop leaves the UI hold untouched');
  assert.deepEqual(sources(effects), [UI_SOURCE]);

  // Reverse order: hit-stop outlives the UI release.
  effects.set(HIT_STOP, { scale: 0.12 });
  manager.popScreen();
  assert.equal(state.timeScale, 0.12, 'UI release must expose the surviving hit-stop request');
  assert.deepEqual(sources(effects), [HIT_STOP]);
  effects.clear(HIT_STOP);
  assert.equal(state.timeScale, 1);
});

test('SF-275 destroy() releases the aggregate UI hold and nothing else', () => {
  const { state, effects, manager } = makeFixture();

  manager.pushScreen('pause');
  syncFocusLossHold(state, true);
  effects.set(HIT_STOP, { scale: 0.3 });
  assert.equal(state.timeScale, 0);
  assert.deepEqual(sources(effects), [FOCUS_LOSS_TIME_SOURCE, HIT_STOP, UI_SOURCE].sort());

  manager.destroy();
  assert.equal(state.timeScale, 0, 'other owners still hold the freeze after UI teardown');
  assert.deepEqual(sources(effects), [FOCUS_LOSS_TIME_SOURCE, HIT_STOP].sort(),
    'destroy must clear only its own ui:pausing-screen source');
});

test('SF-275 a blocked focus pause leaves no hold and touches no other owner', () => {
  const { state, effects, manager } = makeFixture();

  // Crucible results own their own clock: a blur there must not mint a focus hold.
  manager.pushScreen('pause');
  manager.pushScreen('crucibleResults');
  assert.equal(state.timeScale, 0);
  const blocked = syncFocusLossHold(state, true);
  assert.deepEqual(blocked, { paused: false, muted: false });
  assert.deepEqual(sources(effects), [UI_SOURCE], 'blocked blur must not mint window-focus-loss');
  manager.popScreen();
  manager.popScreen();
  assert.equal(state.timeScale, 1, 'releasing the UI hold leaves nothing behind');

  // A save write holds the same gate — and ends cleanly.
  beginFocusLossSaveWrite(state);
  const duringSave = syncFocusLossHold(state, true);
  assert.deepEqual(duringSave, { paused: false, muted: false });
  assert.deepEqual(sources(effects), []);
  assert.equal(state.timeScale, 1);
  endFocusLossSaveWrite(state);
  const afterSave = syncFocusLossHold(state, true);
  assert.equal(afterSave.paused, true, 'the block ends with the write');
  assert.equal(state.timeScale, 0);
  syncFocusLossHold(state, false);
  assert.equal(state.timeScale, 1);
});

test('SF-275 focus-loss preferences gate pause and mute independently of other holds', () => {
  const { state, effects, manager } = makeFixture();
  state.settings.gameplay.pauseOnFocusLoss = false;
  state.settings.audio.muteOnFocusLoss = true;

  manager.pushScreen('pause');
  const blurred = syncFocusLossHold(state, true);
  assert.deepEqual(blurred, { paused: false, muted: true },
    'mute applies even when the pause preference is off');
  assert.equal(state.render.focusLossMuted, true);
  assert.deepEqual(sources(effects), [UI_SOURCE], 'no focus hold is minted under pause-off');
  assert.equal(state.timeScale, 0, 'the UI hold, not focus, owns this freeze');

  const focused = syncFocusLossHold(state, false);
  assert.deepEqual(focused, { paused: false, muted: false });
  assert.equal(state.render.focusLossMuted, false);
  assert.deepEqual(sources(effects), [UI_SOURCE]);
});

test('SF-275 describeRequests is a diagnostic copy — mutating it cannot forge a release', () => {
  const { state, effects, manager } = makeFixture();
  manager.pushScreen('pause');
  const description = effects.describeRequests();
  assert.deepEqual(description, { [UI_SOURCE]: { scale: 0 } });
  description[UI_SOURCE].scale = 1;
  delete description[UI_SOURCE];
  assert.equal(state.timeScale, 0, 'the description is a copy, not a writable view');
  assert.deepEqual(sources(effects), [UI_SOURCE]);
});
