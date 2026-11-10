// J5 (research B, board row 196 residual) — a capture owns its close exactly once. The conflict
// label arms a 900 ms `done(false)` timer; if the player closes early (Escape, click-away) and
// starts a new capture inside that window, the stale timer used to run the OLD closure anyway —
// clearing the newer capture's `_activeCapture` handle and restoring the older button's text over
// the live "Press a key…" listen. `done` now refuses any close it does not own. These pins drive
// the real screen object with fake DOM/window plumbing; no renderer, no GPU.
import test from 'node:test';
import assert from 'node:assert/strict';

import { settingsScreen, REBINDABLE } from '../src/ui/screens/settings.js';
import { setGamepadCaptureHandler, getGamepadCaptureHandler } from '../src/ui/bindings.js';
import { DEFAULTS as INPUT_DEFAULTS } from '../src/systems/input.js';

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** Minimal window shim: records capture-phase listeners so the test dispatches by hand. */
function fakeWindow() {
  const listeners = { keydown: [], mousedown: [] };
  globalThis.window = {
    addEventListener(type, fn) { listeners[type]?.push(fn); },
    removeEventListener(type, fn) {
      const list = listeners[type] || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
  };
  return listeners;
}

function fakeBtn() {
  const classes = new Set();
  const attrs = new Map();
  return {
    textContent: 'KeyX',
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
    closest: () => null,
  };
}

function fakeCtx() {
  return {
    state: { settings: { controls: {} } },
    bus: { emit() {} },
    gamepad: {},
  };
}

function keyEvent(code) {
  return { code, preventDefault() {}, stopPropagation() {} };
}

function mouseEvent(target) {
  return { target };
}

test('J5: a stale conflict timer never mutates the capture that replaced it', async () => {
  const listeners = fakeWindow();
  const ctx = fakeCtx();
  const live = {};
  for (const action of REBINDABLE) live[action] = [];
  live.scanPulse = ['KeyW']; // the code the player will try to steal
  const base = {};
  const committed = [];
  const realCommit = settingsScreen._commitBind;
  const realRender = settingsScreen._render;
  settingsScreen._commitBind = function (c, action, code) { committed.push([action, code]); };
  settingsScreen._render = function () {};
  try {
    const btnA = fakeBtn();
    settingsScreen._capture(ctx, btnA, 'forward', live, base);
    assert.equal(btnA.textContent, 'Press a key…');

    // A conflicting key: denial label shows, and the 900 ms close timer arms.
    listeners.keydown[0](keyEvent('KeyW'));
    assert.match(btnA.textContent, /in use/i);

    // The player bails out (click-away) and immediately rebinds a different verb.
    listeners.mousedown[0](mouseEvent(null));
    assert.equal(settingsScreen._capturing, false);
    const btnB = fakeBtn();
    settingsScreen._capture(ctx, btnB, 'reverse', live, base);
    const captureB = settingsScreen._activeCapture;
    assert.notEqual(captureB, null);
    assert.equal(btnB.textContent, 'Press a key…');

    // The stale 900 ms close fires into capture B's window: it must be a no-op.
    await sleep(950);
    assert.equal(settingsScreen._activeCapture, captureB, 'capture B still owns the slot');
    assert.equal(settingsScreen._capturing, true, 'capture B is still listening');
    assert.equal(btnB.textContent, 'Press a key…', 'stale close never restores an older label');
    assert.equal(btnA.textContent, 'KeyX', 'A stayed closed');

    // Capture B's own listeners still resolve a key to a commit.
    assert.equal(listeners.keydown.length, 1, 'exactly one live keydown listener');
    listeners.keydown[0](keyEvent('KeyF'));
    assert.deepEqual(committed, [['reverse', 'KeyF']]);
    assert.equal(settingsScreen._capturing, false);
    assert.equal(settingsScreen._activeCapture, null);
  } finally {
    settingsScreen._commitBind = realCommit;
    settingsScreen._render = realRender;
    delete globalThis.window;
  }
});

test('J5: the screen-hide path cancels the live capture exactly once', () => {
  fakeWindow();
  const ctx = fakeCtx();
  const live = {};
  for (const action of REBINDABLE) live[action] = [];
  const base = {};
  const realRender = settingsScreen._render;
  settingsScreen._render = function () {};
  try {
    const btn = fakeBtn();
    settingsScreen._capture(ctx, btn, 'boost', live, base);
    assert.notEqual(settingsScreen._activeCapture, null);
    settingsScreen.onHide();
    assert.equal(settingsScreen._capturing, false);
    assert.equal(settingsScreen._activeCapture, null);
    assert.equal(btn.textContent, 'KeyX', 'cancelled listen restores the row label');
    // A second hide (or any stale close) must not resurrect or double-run the closure.
    settingsScreen.onHide();
    assert.equal(settingsScreen._activeCapture, null);
  } finally {
    settingsScreen._render = realRender;
    delete globalThis.window;
  }
});

test('J5: the pad capture carries the same ownership guard', async () => {
  const listeners = fakeWindow();
  const ctx = fakeCtx();
  const liveMap = { fire: ['Standard0'] };
  const realCommit = settingsScreen._commitPadBind;
  const realRender = settingsScreen._render;
  const committed = [];
  settingsScreen._commitPadBind = function (c, action, stdName) { committed.push([action, stdName]); };
  settingsScreen._render = function () {};
  try {
    const btnA = fakeBtn();
    settingsScreen._capturePad(ctx, btnA, 'scanPulse', liveMap);
    assert.equal(ctx.gamepad.captureMode, true);
    const handlerA = getGamepadCaptureHandler();
    assert.equal(typeof handlerA, 'function');

    // Conflicting pad button: denial label, 900 ms close timer arms.
    handlerA('Standard0');
    assert.match(btnA.textContent, /in use|Fire/i);

    // Bail out, start a newer pad capture inside the stale window.
    listeners.mousedown[0](mouseEvent(null));
    const btnB = fakeBtn();
    settingsScreen._capturePad(ctx, btnB, 'boost', liveMap);
    const handlerB = getGamepadCaptureHandler();
    assert.notEqual(handlerB, handlerA);

    // Stale timer fires: capture B's listen stays live, its button keeps the prompt.
    await sleep(950);
    assert.equal(settingsScreen._capturing, true);
    assert.equal(btnB.textContent, 'Press a pad button…');

    // B still resolves: a free pad button commits and closes the listen.
    handlerB('Standard3');
    assert.deepEqual(committed, [['boost', 'Standard3']]);
    assert.equal(settingsScreen._capturing, false);
    assert.equal(settingsScreen._activeCapture, null);
    assert.equal(getGamepadCaptureHandler(), null, 'the pad capture handler is released');
  } finally {
    settingsScreen._commitPadBind = realCommit;
    settingsScreen._render = realRender;
    setGamepadCaptureHandler(null);
    delete globalThis.window;
  }
});

test('J4: a per-action reset refuses while its default code is deliberately owned elsewhere', async () => {
  const listeners = fakeWindow();
  const ctx = fakeCtx();
  const base = INPUT_DEFAULTS.BINDINGS;
  const live = {};
  for (const action of REBINDABLE) live[action] = (base[action] || []).slice();
  const forwardDefault = base.forward[0]; // e.g. KeyW — the code the player gave to another verb
  live.scanPulse = [forwardDefault];
  const committed = [];
  const realCommit = settingsScreen._commitBind;
  const realRender = settingsScreen._render;
  settingsScreen._commitBind = function (c, action, code) { committed.push([action, code]); };
  settingsScreen._render = function () {};
  try {
    const btn = fakeBtn();
    settingsScreen._capture(ctx, btn, 'forward', live, base);
    listeners.keydown[0](keyEvent('Backspace'));
    // Refusal names the owning action; nothing is committed; the capture stays open.
    assert.match(btn.textContent, /in use/i);
    assert.deepEqual(committed, [], 'a refused reset commits nothing');
    assert.equal(settingsScreen._capturing, true);
    // The 900 ms denial label restores the prompt, then Escape closes the listen.
    await sleep(950);
    assert.equal(settingsScreen._capturing, false);
    assert.deepEqual(live.scanPulse, [forwardDefault], 'the deliberate owner keeps the code');

    // Release the deliberate override; the same reset now succeeds.
    live.scanPulse = [];
    settingsScreen._capture(ctx, fakeBtn(), 'forward', live, base);
    listeners.keydown[0](keyEvent('Backspace'));
    assert.deepEqual(committed, [['forward', null]], 'the reset restores the default once unowned');
    assert.equal(settingsScreen._capturing, false);
  } finally {
    settingsScreen._commitBind = realCommit;
    settingsScreen._render = realRender;
    delete globalThis.window;
  }
});

test('F-CONTROLS-01: a flight rebind onto a reserved interface code is refused and names the verb', async () => {
  // The conflict rule used to consult REBINDABLE only, so a flight verb could be bound onto a
  // fixed interface key: overlay keys (Z/I/L) then double-fired the verb AND the interface
  // action (preventDefault is not suppression — the window flight adapter ignores it), while
  // modal openers (M/N) left the verb silently dead. The capture now refuses reserved codes.
  const listeners = fakeWindow();
  const ctx = fakeCtx();
  const live = {};
  for (const action of REBINDABLE) live[action] = [];
  const committed = [];
  const realCommit = settingsScreen._commitBind;
  const realRender = settingsScreen._render;
  settingsScreen._commitBind = function (c, action, code) { committed.push([action, code]); };
  settingsScreen._render = function () {};
  try {
    // Overlay key: Z is the Fleet Command radial — the exact double-bind the audit proved.
    const btnZ = fakeBtn();
    settingsScreen._capture(ctx, btnZ, 'boost', live, {});
    listeners.keydown[0](keyEvent('KeyZ'));
    assert.match(btnZ.textContent, /in use/i);
    assert.match(btnZ.textContent, /fleet/i, 'the refusal names the interface verb');
    assert.deepEqual(committed, [], 'a refused bind commits nothing');
    await sleep(950);
    assert.equal(settingsScreen._capturing, false);

    // Modal opener: M is the Local Map — a bind there would fire the map and never the verb.
    const btnM = fakeBtn();
    settingsScreen._capture(ctx, btnM, 'boost', live, {});
    listeners.keydown[0](keyEvent('KeyM'));
    assert.match(btnM.textContent, /in use/i);
    assert.match(btnM.textContent, /map/i);
    assert.deepEqual(committed, []);
    await sleep(950);

    // Camera zoom: Equal rides the router's passthrough default case.
    const btnEq = fakeBtn();
    settingsScreen._capture(ctx, btnEq, 'boost', live, {});
    listeners.keydown[0](keyEvent('Equal'));
    assert.match(btnEq.textContent, /in use/i);
    assert.deepEqual(committed, []);
    await sleep(950);

    // Contextual keys stay bindable by design: E is strafe/dock (router claims it only in
    // dock range), so the reserved set must not swallow it.
    const btnE = fakeBtn();
    settingsScreen._capture(ctx, btnE, 'boost', live, {});
    listeners.keydown[0](keyEvent('KeyE'));
    assert.deepEqual(committed, [['boost', 'KeyE']], 'the contextual dock key remains a legal flight bind');
    assert.equal(settingsScreen._capturing, false);

    // An ordinary free code still commits.
    const btnF = fakeBtn();
    settingsScreen._capture(ctx, btnF, 'boost', live, {});
    listeners.keydown[0](keyEvent('F8'));
    assert.deepEqual(committed[committed.length - 1], ['boost', 'F8']);
  } finally {
    settingsScreen._commitBind = realCommit;
    settingsScreen._render = realRender;
    delete globalThis.window;
  }
});

test('F-CONTROLS-01: the per-action reset refuses a default that lands on an interface code', async () => {
  // Stock travelBurn used to ship ['NumLock','KeyH'] while h/H opens Help — the shipped collision
  // the audit flagged; RC-05 moved the fallback to F8. The refusal path still has to reject a
  // default that lands on a reserved code, so the fixture carries the legacy default in `base`.
  // (The shipped default itself is untouched here: the full "Reset key bindings" word still
  // restores authored stock wholesale.)
  const listeners = fakeWindow();
  const ctx = fakeCtx();
  const base = { ...INPUT_DEFAULTS.BINDINGS, travelBurn: ['NumLock', 'KeyH'] };
  const live = {};
  for (const action of REBINDABLE) live[action] = (base[action] || []).slice();
  const committed = [];
  const realCommit = settingsScreen._commitBind;
  const realRender = settingsScreen._render;
  settingsScreen._commitBind = function (c, action, code) { committed.push([action, code]); };
  settingsScreen._render = function () {};
  try {
    const btn = fakeBtn();
    settingsScreen._capture(ctx, btn, 'travelBurn', live, base);
    listeners.keydown[0](keyEvent('Backspace'));
    assert.match(btn.textContent, /in use/i);
    assert.match(btn.textContent, /help/i, 'the refusal names Help as the owner of H');
    assert.deepEqual(committed, [], 'a refused reset commits nothing');
    await sleep(950);
    assert.equal(settingsScreen._capturing, false);
  } finally {
    settingsScreen._commitBind = realCommit;
    settingsScreen._render = realRender;
    delete globalThis.window;
  }
});

test('J4: the stock scheme is conflict-free, so a full reset can never collide', () => {
  // The reset-to-defaults word sets `bindings = null` in one click. That is only safe while the
  // invariant holds: no default code appears on two actions. If an alias ever ships on purpose,
  // this pin is the thing to reconsider — not the reset word.
  const seen = new Map();
  for (const action of REBINDABLE) {
    for (const code of INPUT_DEFAULTS.BINDINGS[action] || []) {
      assert.ok(!seen.has(code), `${code} is stock-bound to both ${seen.get(code)} and ${action}`);
      seen.set(code, action);
    }
  }
  assert.ok(seen.size > 10, 'the stock scheme actually binds keys');
});
