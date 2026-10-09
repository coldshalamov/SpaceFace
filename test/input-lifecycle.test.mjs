import assert from 'node:assert/strict';
import test from 'node:test';

import { input, shouldNeutralizeFlightInput } from '../src/systems/input.js';
import { createMasslineInputGrammar } from '../src/systems/masslineInputGrammar.js';

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

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

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }
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
  globalThis.window = windowTarget;
  globalThis.document = {
    getElementById(id) { return id === 'gl-canvas' ? canvasTarget : null; },
  };
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 800;
  globalThis.addEventListener = windowTarget.addEventListener.bind(windowTarget);
  globalThis.removeEventListener = windowTarget.removeEventListener.bind(windowTarget);

  return {
    windowTarget,
    canvasTarget,
    restore() {
      for (const [name, entry] of Object.entries(previous)) {
        if (entry.present) globalThis[name] = entry.value;
        else delete globalThis[name];
      }
    },
  };
}

function makeDomInputState() {
  return {
    mode: 'flight',
    playerId: 1,
    entities: new Map(),
    input: {
      blocked: false,
      pointerScreen: { x: 0, y: 0, active: false },
      actions: {},
    },
    settings: {
      gameplay: { controlScheme: 'pilot' },
      controls: {
        bindings: {},
        gamepad: { enabled: false },
        touch: { enabled: false },
      },
    },
  };
}

test('DOM input init is idempotent and destroy removes only owned listeners', () => {
  const dom = installFakeInputDom();
  const host = Object.create(input);
  const state = makeDomInputState();
  const ctx = { state, bus: { emit() {} }, helpers: {} };
  const foreignKeydown = () => {};
  dom.windowTarget.addEventListener('keydown', foreignKeydown);

  try {
    host.init(ctx);
    host.init(ctx);

    for (const type of ['resize', 'keydown', 'keyup', 'blur', 'mousemove', 'pointermove', 'mouseup', 'pointercancel']) {
      assert.equal(dom.windowTarget.listenerCount(type), type === 'keydown' ? 2 : 1, type);
    }
    assert.equal(dom.canvasTarget.listenerCount('mousedown'), 1);
    assert.equal(dom.canvasTarget.listenerCount('contextmenu'), 1);

    dom.windowTarget.dispatch('keydown', { code: 'KeyW', target: null });
    dom.canvasTarget.dispatch('mousedown', { button: 0, target: dom.canvasTarget, clientX: 640, clientY: 400 });
    assert.equal(host._keys.KeyW, true);
    assert.equal(host._m0, true);
    assert.equal(host._screen.active, true);
    assert.equal(state.input.pointerScreen.active, true);

    const contextMenu = { target: dom.canvasTarget, defaultPrevented: false };
    dom.canvasTarget.dispatch('contextmenu', contextMenu);
    assert.equal(contextMenu.defaultPrevented, true);

    dom.windowTarget.dispatch('blur');
    assert.equal(host._keys.KeyW, false);
    assert.equal(host._m0, false);
    assert.equal(host._screen.active, false);
    assert.equal(state.input.pointerScreen.active, false);

    host.destroy();
    assert.equal(host._domAdapterAttached, false);
    for (const type of ['resize', 'keyup', 'blur', 'mousemove', 'pointermove', 'mouseup', 'pointercancel']) {
      assert.equal(dom.windowTarget.listenerCount(type), 0, type);
    }
    assert.equal(dom.windowTarget.listenerCount('keydown'), 1, 'foreign keydown listener survives');
    assert.equal(dom.canvasTarget.listenerCount('mousedown'), 0);
    assert.equal(dom.canvasTarget.listenerCount('contextmenu'), 0);

    host.init(ctx);
    for (const type of ['resize', 'keydown', 'keyup', 'blur', 'mousemove', 'pointermove', 'mouseup', 'pointercancel']) {
      assert.equal(dom.windowTarget.listenerCount(type), type === 'keydown' ? 2 : 1, type);
    }
    assert.equal(dom.canvasTarget.listenerCount('mousedown'), 1);
    assert.equal(dom.canvasTarget.listenerCount('contextmenu'), 1);
    host.destroy();
  } finally {
    dom.restore();
  }
});

test('flight input fence neutralizes controls while a drill approach owns the handoff', () => {
  const state = { mode: 'flight', ui: { screenStack: [] }, input: { blocked: false } };
  assert.equal(shouldNeutralizeFlightInput(state, false), false);

  state.input.blocked = true;
  assert.equal(shouldNeutralizeFlightInput(state, false), true);

  state.input.blocked = false;
  assert.equal(shouldNeutralizeFlightInput(state, true), true);
  assert.equal(shouldNeutralizeFlightInput({ ...state, ui: { screenStack: ['drill'] } }, false), true);
});

test('input lifecycle owner releases keyboard, pointer, gamepad, and touch holds', () => {
  const host = Object.create(input);
  const grammarResetBlocks = [];
  let gamepadResets = 0;
  const heldClass = {
    removed: [],
    remove(value) { this.removed.push(value); },
  };
  const knob = { style: { transform: 'translate(10px, 4px)' } };
  host._keys = { KeyW: true, ShiftLeft: true };
  host._m0 = true;
  host._m1 = true;
  host._m2 = true;
  // (_prevM1 is gone with the hull burst's middle-click trigger: the upgrade rides the boost now,
  // so the middle button keeps no previous-frame flag.)
  host._kbmActivityPending = true;
  host._travelEdge = true;
  host._cmHeld = true;
  host._gamepadLifecycleQuarantine = null;
  host._edgePrev = { cruise: true, tether: true };
  host._masslineGrammar = { reset(block) { grammarResetBlocks.push(block); } };
  host.gamepad = {
    _prev: { massline: true, countermeasure: true },
    _resetState() { gamepadResets++; },
  };
  host.touch = {
    axes: { leftX: 1, leftY: -1, rightX: 0.5, rightY: -0.5 },
    actions: { fire: { held: true }, boost: { held: true } },
    _sticks: { 7: { side: 'left' } },
    _btnHeld: { fire: true },
    _btnPulse: { fire: true },
    _activityPending: true,
    _overlay: {
      querySelectorAll(selector) {
        if (selector === '.sf-touch-btn.held') return [{ classList: heldClass }];
        if (selector === '.sf-touch-knob') return [knob];
        return [];
      },
    },
  };

  host.releaseHeldControls('hidden');

  assert.deepEqual(host._keys, { KeyW: false, ShiftLeft: false });
  assert.equal(host._m0, false);
  assert.equal(host._m1, false);
  assert.equal(host._m2, false);
  assert.equal(host._kbmActivityPending, false);
  assert.equal(host._travelEdge, false);
  assert.equal(host._cmHeld, false);
  assert.deepEqual(host._gamepadLifecycleQuarantine, {
    massline: true,
    countermeasure: true,
    travelBurn: true,
    autoTarget: true,
    chargeDetonate: true,
    deployRepulsor: true,
    dropBomb: true,
    cycleBomb: true,
    // FB-003 chord verbs carry the same neutral-sample guarantee.
    scanPulse: true,
    cruise: true,
    deployBeacon: true,
    deployMassSeed: true,
    deployWell: true,
    toggleClearingCone: true,
    toggleSkimCollector: true,
    siteBeam: true,
    bulletTime: true,
    cloak: true,
    chargeThrow: true,
    jettisonLot: true,
    // The Gyre Snare pad chord (RB+Y) is a held verb: a grip carried across a dock or
    // tab-hide stays quarantined until a connected neutral sample.
    gyreSnare: true,
  });
  assert.deepEqual(host._edgePrev, { cruise: false, tether: false });
  assert.deepEqual(grammarResetBlocks, [undefined]);
  assert.equal(gamepadResets, 1);
  assert.deepEqual(host.gamepad._prev, { massline: true, countermeasure: true });
  assert.deepEqual(host.touch.axes, { leftX: 0, leftY: 0, rightX: 0, rightY: 0 });
  assert.deepEqual(host.touch._sticks, {});
  assert.deepEqual(host.touch._btnHeld, {});
  assert.deepEqual(host.touch._btnPulse, {});
  assert.equal(host.touch._activityPending, false);
  assert.deepEqual(host.touch.actions, {
    fire: { held: false, pressed: false, released: false, value: 0 },
    boost: { held: false, pressed: false, released: false, value: 0 },
  });
  assert.deepEqual(heldClass.removed, ['held']);
  assert.equal(knob.style.transform, '');
});

test('gamepad lifecycle quarantine waits for a connected neutral sample without blocking keyboard', () => {
  const host = Object.create(input);
  host._cmHeld = false;
  host._gamepadLifecycleQuarantine = {
    massline: true,
    countermeasure: true,
    travelBurn: true,
    autoTarget: true,
  };
  const actions = {
    massline: { held: false },
    countermeasure: { held: false },
    travelBurn: { held: false },
    autoTarget: { held: false },
  };

  host._refreshGamepadLifecycleQuarantine({ isConnected: () => false, actions });
  assert.equal(host._gamepadLifecycleActionAllowed('countermeasure'), false,
    'a missing pad is not proof that the physical button was released');

  const heldActions = {
    massline: { held: true },
    countermeasure: { held: true },
    travelBurn: { held: true },
    autoTarget: { held: true },
  };
  host._refreshGamepadLifecycleQuarantine({ isConnected: () => true, actions: heldActions });
  assert.equal(host._gamepadLifecycleActionAllowed('massline'), false,
    'a reconnected held pad remains quarantined');

  const inp = { deployCountermeasure: false };
  host._updateCountermeasureHold(true, inp);
  assert.equal(inp.deployCountermeasure, true,
    'a fresh keyboard press remains authoritative while the gamepad is quarantined');
  host._updateCountermeasureHold(false, inp);

  host._refreshGamepadLifecycleQuarantine({ isConnected: () => true, actions });
  assert.equal(host._gamepadLifecycleActionAllowed('massline'), true);
  assert.equal(host._gamepadLifecycleActionAllowed('countermeasure'), true);
  assert.equal(host._gamepadLifecycleActionAllowed('travelBurn'), true);
  assert.equal(host._gamepadLifecycleActionAllowed('autoTarget'), true);
});

test('gamepad lifecycle quarantine protects the detonation edge after resume', () => {
  const host = Object.create(input);
  host._keys = {};
  host._edgePrev = {};
  host.gamepad = null;
  host.touch = null;

  host.releaseHeldControls('hidden');
  assert.equal(host._gamepadLifecycleActionAllowed('chargeDetonate'), false,
    'a resumed held D-pad-down must not detonate ordnance');

  const connected = { isConnected: () => true };
  host._refreshGamepadLifecycleQuarantine(connected);
  assert.equal(host._gamepadLifecycleActionAllowed('chargeDetonate'), false,
    'a missing action sample is not proof that the detonation button was released');

  connected.actions = { chargeDetonate: { held: true } };
  host._refreshGamepadLifecycleQuarantine(connected);
  assert.equal(host._gamepadLifecycleActionAllowed('chargeDetonate'), false,
    'a reconnected held detonation button remains quarantined');

  connected.actions.chargeDetonate.held = false;
  host._refreshGamepadLifecycleQuarantine(connected);
  assert.equal(host._gamepadLifecycleActionAllowed('chargeDetonate'), true,
    'a connected neutral sample releases the detonation quarantine');
});

test('input release preserves the committed Massline packet before resetting grammar state', () => {
  const grammar = createMasslineInputGrammar();
  const published = grammar.step(1 / 60, {
    held: true,
    attached: false,
    source: 'gamepad',
  });
  const committed = { ...published };
  const host = Object.create(input);
  host._keys = {};
  host._masslineGrammar = grammar;
  host.state = {
    input: {
      actions: {
        massline: published,
        tetherFire: published.latch,
      },
    },
  };
  host.gamepad = null;
  host.touch = null;

  host.releaseHeldControls('hidden');

  assert.deepEqual(host.state.input.actions.massline, committed);
  assert.notEqual(host.state.input.actions.massline, grammar.command);
  assert.equal(host.state.input.actions.tetherFire, true);
  assert.equal(grammar.command.latch, false);
});

test('Massline grammar can block a physically held source until release', () => {
  const grammar = createMasslineInputGrammar();
  assert.equal(grammar.step(1 / 60, { held: true, attached: false, source: 'gamepad' }).latch, true);

  grammar.reset(true);
  assert.equal(grammar.step(1 / 60, { held: true, attached: false, source: 'gamepad' }).latch, false);
  grammar.step(1 / 60, { held: false, attached: false, source: null });
  assert.equal(grammar.step(1 / 60, { held: true, attached: false, source: 'gamepad' }).latch, true);
});

test('pointer cancel drops a held fire and the committed thrust before the next tick', () => {
  const dom = installFakeInputDom();
  const host = Object.create(input);
  const state = makeDomInputState();
  state.input.moveX = 1;
  state.input.moveZ = 1;
  state.input.fire = true;
  state.input.brake = true;
  const ctx = { state, bus: { emit() {} }, helpers: {} };
  try {
    host.init(ctx);
    host._m0 = true;
    host._keys.KeyW = true;
    dom.windowTarget.dispatch('pointercancel');
    assert.equal(host._m0, false);
    assert.equal(host._keys.KeyW, false);
    assert.equal(state.input.moveX, 0);
    assert.equal(state.input.moveZ, 0);
    assert.equal(state.input.fire, false);
    assert.equal(state.input.brake, false);
    host.destroy();
  } finally {
    dom.restore();
  }
});

test('a hold-to-toggle verb held through a dock does not re-latch on the way back', () => {
  const dom = installFakeInputDom();
  const host = Object.create(input);
  const state = makeDomInputState();
  state.ui = { screenStack: [] };
  state.input.mouseNdc = { x: 0, y: 0 };
  state.input.aimWorld = { x: 0, z: 0 };
  state.input.aimAngle = 0;
  state.input.aimIntentActive = false;
  state.input.autoTargetVector = { active: false, screenX: 0, screenY: 0, worldX: 0, worldZ: 0, magnitude: 0 };
  state.input.autoTargetPath = { points: [], active: false };
  state.settings.accessibility = { holdToToggle: { gyreSnare: true } };
  const ctx = { state, bus: { emit() {} }, helpers: {} };
  try {
    host.init(ctx);
    // Quote held BEFORE the screen opens — not a press that wants a toggle.
    dom.windowTarget.dispatch('keydown', { code: 'Quote', target: null });
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, true, 'held key runs the lash');

    state.ui.screenStack.push('station');
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, true,
      'a screen preserves a physically held key — zeroing would synthesize a falling edge ' +
      'that bowls the clump (massline modal-preservation parity)');
    assert.equal(host._holdToggleEdges.gyreSnare, true,
      'the still-held key pins the toggle edge so it cannot re-arm as a fresh press');

    state.ui.screenStack.pop();
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, true,
      'the still-held key is a hold, not a new edge — the verb rides the physical sample');
    dom.windowTarget.dispatch('keyup', { code: 'Quote', target: null });
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, false,
      'releasing after the dock actually drops the beam — no phantom latch left behind');
    host.destroy();
  } finally {
    dom.restore();
  }
});

test('a pad-held gyre chord survives a screen opening — acts.gyreSnare stays latched', () => {
  const dom = installFakeInputDom();
  const host = Object.create(input);
  const state = makeDomInputState();
  state.ui = { screenStack: [] };
  state.input.mouseNdc = { x: 0, y: 0 };
  state.input.aimWorld = { x: 0, z: 0 };
  state.input.aimAngle = 0;
  state.input.aimIntentActive = false;
  state.input.autoTargetVector = { active: false, screenX: 0, screenY: 0, worldX: 0, worldZ: 0, magnitude: 0 };
  state.input.autoTargetPath = { points: [], active: false };
  const ctx = { state, bus: { emit() {} }, helpers: {} };
  try {
    host.init(ctx);
    // The RB+Y chord reports held only through the pad's actions table — the keyboard
    // side never touched Quote. Same modal-preservation contract as the held key.
    host.gamepad = {
      isConnected: () => true,
      actions: { gyreSnare: { held: false, pressed: false, released: false, value: 0 } },
      axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
      tick() {},
      _resetState() {},
    };
    host.update(1 / 60, state); // connected neutral sample — clears the init quarantine
    assert.equal(host._gamepadLifecycleActionAllowed('gyreSnare'), true,
      'a connected neutral sample re-arms the chord');
    host.gamepad.actions.gyreSnare.held = true;
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, true, 'pad-held chord runs the lash');

    state.ui.screenStack.push('station');
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, true,
      'a screen preserves the pad-held chord — zeroing would bowl the clump mid-modal');
    assert.equal(host._holdToggleEdges.gyreSnare, true,
      'the still-held pad chord pins the toggle edge — same live-sample rule as the key');

    state.ui.screenStack.pop();
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, true, 'the still-held chord rides on the way back');
    host.gamepad.actions.gyreSnare.held = false;
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, false, 'releasing the chord drops the beam');
    host.destroy();
  } finally {
    dom.restore();
  }
});

test('a pad-held gyre chord survives input.blocked — preserved hold, real edge on release', () => {
  const dom = installFakeInputDom();
  const host = Object.create(input);
  const state = makeDomInputState();
  state.ui = { screenStack: [] };
  state.input.mouseNdc = { x: 0, y: 0 };
  state.input.aimWorld = { x: 0, z: 0 };
  state.input.aimAngle = 0;
  state.input.aimIntentActive = false;
  state.input.autoTargetVector = { active: false, screenX: 0, screenY: 0, worldX: 0, worldZ: 0, magnitude: 0 };
  state.input.autoTargetPath = { points: [], active: false };
  const ctx = { state, bus: { emit() {} }, helpers: {} };
  try {
    host.init(ctx);
    host.gamepad = {
      isConnected: () => true,
      actions: { gyreSnare: { held: false, pressed: false, released: false, value: 0 } },
      axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
      tick() {},
      _resetState() {},
    };
    host.update(1 / 60, state); // connected neutral sample — clears the init quarantine
    host.gamepad.actions.gyreSnare.held = true;
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, true, 'pad-held chord runs the lash');

    // input.blocked is the LIVE modal path — the sim keeps ticking behind it, so
    // the preserve must hold here or the sim sees a phantom release it would
    // defer-bowl the instant the block lifts.
    state.input.blocked = true;
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, true,
      'input.blocked preserves the pad-held chord — the lifecycle quarantine can\'t eat it');
    // A genuine release under the block still reaches the sim as a falling edge —
    // gyreSnare defers it to the first visible tick (pinned in gyreSnare.test.mjs).
    host.gamepad.actions.gyreSnare.held = false;
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, false,
      'a pad release under input.blocked produces the falling edge the sim defers');

    state.input.blocked = false;
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, false,
      'no phantom re-arm on the way back — the released verb stays released');
    host.destroy();
  } finally {
    dom.restore();
  }
});

test('a keyboard-held gyre verb survives a screen opening — preserve is not toggle-only', () => {
  const dom = installFakeInputDom();
  const host = Object.create(input);
  const state = makeDomInputState();
  state.ui = { screenStack: [] };
  state.input.mouseNdc = { x: 0, y: 0 };
  state.input.aimWorld = { x: 0, z: 0 };
  state.input.aimAngle = 0;
  state.input.aimIntentActive = false;
  state.input.autoTargetVector = { active: false, screenX: 0, screenY: 0, worldX: 0, worldZ: 0, magnitude: 0 };
  state.input.autoTargetPath = { points: [], active: false };
  const ctx = { state, bus: { emit() {} }, helpers: {} };
  try {
    host.init(ctx);
    // Plain hold (no holdToToggle): the modal-preserve contract must keep the
    // physically held key — zeroing would bowl the clump out from under it.
    dom.windowTarget.dispatch('keydown', { code: 'Quote', target: null });
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, true, 'held key runs the lash');

    state.ui.screenStack.push('station');
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, true,
      'a screen preserves a physically held key — the falling edge would be a phantom bowl');

    state.ui.screenStack.pop();
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, true, 'the still-held key rides on the way back');
    dom.windowTarget.dispatch('keyup', { code: 'Quote', target: null });
    host.update(1 / 60, state);
    assert.equal(state.input.actions.gyreSnare, false, 'releasing drops the beam');
    host.destroy();
  } finally {
    dom.restore();
  }
});
