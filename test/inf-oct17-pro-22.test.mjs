// PRO-22 — reconnecting as a DIFFERENT pad family swaps the prompt glyphs live.
//
// Done check: a focused test proves a reconnect as another family updates the displayed
// glyphs without a restart, and the in-flight source rules of NXI-003 still hold.
// Do-NOT: persist a hardware fingerprint (NXI-004), change default bindings.
//
// The test drives the real owner code (createGamepad tick + verbBindingLabel over the live
// settings) on seed 4242: Xbox -> disconnect -> DualShock-family reconnect must flip the
// face-button register from 'LB + Y' to 'LB + △' on the SAME gp object and SAME state
// object (no restart), while an unknown pad and a same-family reconnect stay quiet and
// deliberate keyboard<->pad switches still own the helm exactly as NXI-003 proved.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GAMEPAD_DEFAULT_BINDINGS,
  createGamepad,
  detectGamepadGlyphFamily,
  resolveGamepadBindings,
} from '../src/systems/gamepad.js';
import { input } from '../src/systems/input.js';
import { createGameState } from '../src/core/gameState.js';
import { verbBindingLabel } from '../src/onboarding/verbSpeech.js';

const DT = 1 / 60;
// Realistic browser Gamepad.id strings (hardwareiverse, never player text).
const XB_ID = 'Xbox 360 Controller (XInput STANDARD GAMEPAD Vendor: 045e Product: 028e)';
const DS_ID = 'Sony Interactive Entertainment DualSense Wireless Controller (Vendor: 054c Product: 0ce6)';
const UNKNOWN_ID = 'Generic USB Pad 1234 (Vendor: 1234 Product: 5678)';

function button(down) {
  return { pressed: !!down, value: down ? 1 : 0 };
}

function fakePad(id, axes = [0, 0, 0, 0], held = []) {
  const buttons = [];
  for (let i = 0; i < 17; i++) buttons.push(button(held.includes(i)));
  return { connected: true, id, axes: axes.slice(), buttons };
}

function installNavigator(pads) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { getGamepads: () => pads },
    configurable: true,
    writable: true,
  });
  return () => {
    if (prev) Object.defineProperty(globalThis, 'navigator', prev);
    else delete globalThis.navigator;
  };
}

function bootGp(state) {
  const events = [];
  const gp = createGamepad({ bus: { emit: (name, payload) => events.push({ name, payload }) }, state });
  return { gp, events };
}

function tickGp(gp, state) {
  state.tick += 1;
  gp.tick(DT, state, null);
}

test('PRO-22 reconnecting as another pad family swaps the prompt glyphs live, no restart', () => {
  const state = createGameState(4242);
  const { gp, events } = bootGp(state);
  const pads = [fakePad(XB_ID)];
  const restore = installNavigator(pads);
  try {
    tickGp(gp, state); // boot-time acquisition of the Xbox-family pad
    assert.equal(gp.isConnected(), true);
    assert.equal(state.settings.controls.gamepad.glyphSet, 'xb');
    assert.equal(verbBindingLabel(state, 'toggleSkimCollector', 'gamepad'), 'LB + Y');
    assert.equal(verbBindingLabel(state, 'tether', 'gamepad'), 'A');

    pads[0] = null; // unplug mid-session
    tickGp(gp, state);
    assert.equal(gp.isConnected(), false);
    assert.ok(events.some((e) => e.name === 'gamepad:disconnected'));

    pads[0] = fakePad(DS_ID); // replug as the PlayStation family, neutral
    tickGp(gp, state);
    assert.equal(gp.isConnected(), false, 'a fresh replug is not adopted before a deliberate gesture');
    assert.equal(state.settings.controls.gamepad.glyphSet, 'xb', 'no phantom swap before adoption');

    pads[0] = fakePad(DS_ID, [0, -0.9, 0, 0]); // deliberate stick gesture re-acquires
    tickGp(gp, state);
    assert.ok(events.some((e) => e.name === 'gamepad:connected'));
    assert.equal(gp.isConnected(), true);
    // The live swap: same gp object, same state object — no restart anywhere.
    assert.equal(state.settings.controls.gamepad.glyphSet, 'ds');
    assert.equal(verbBindingLabel(state, 'toggleSkimCollector', 'gamepad'), 'LB + △');
    assert.equal(verbBindingLabel(state, 'tether', 'gamepad'), '✕');
    assert.equal(gp.helmGestureEdge, true, 'the re-acquire is still a helm gesture');
  } finally { restore(); }
});

test('PRO-22 quiet branches: unknown pads and same-family reconnects never re-label', () => {
  assert.equal(detectGamepadGlyphFamily(XB_ID), 'xb');
  assert.equal(detectGamepadGlyphFamily('Microsoft Xbox One Controller (045e)'), 'xb');
  assert.equal(detectGamepadGlyphFamily(DS_ID), 'ds');
  assert.equal(detectGamepadGlyphFamily('DUALSHOCK 4 Wireless Controller'), 'ds');
  assert.equal(detectGamepadGlyphFamily(UNKNOWN_ID), null);
  assert.equal(detectGamepadGlyphFamily('Nintendo Switch Pro Controller (057e)'), null);
  assert.equal(detectGamepadGlyphFamily(''), null);
  assert.equal(detectGamepadGlyphFamily(null), null);

  const state = createGameState(4242);
  const beforeKeys = Object.keys(state.settings.controls.gamepad).sort();
  const { gp } = bootGp(state);
  const pads = [fakePad(UNKNOWN_ID)];
  const restore = installNavigator(pads);
  try {
    tickGp(gp, state);
    assert.equal(gp.isConnected(), true, 'an unknown pad still connects and flies');
    assert.equal(state.settings.controls.gamepad.glyphSet, 'xb', 'an unknown family never re-labels');

    // A manual cross-choice survives a same-family reconnect: detection only arbitrates
    // a genuine family CHANGE, it never clobbers the player's register every plug.
    state.settings.controls.gamepad.glyphSet = 'ds';
    pads[0] = null;
    tickGp(gp, state);
    pads[0] = fakePad(XB_ID);
    tickGp(gp, state);
    pads[0] = fakePad(XB_ID, [0, -0.9, 0, 0]);
    tickGp(gp, state);
    assert.equal(gp.isConnected(), true);
    assert.equal(state.settings.controls.gamepad.glyphSet, 'ds', 'same-family reconnect keeps the manual choice');
    assert.equal(verbBindingLabel(state, 'tether', 'gamepad'), '✕');

    // Do-NOT: no hardware fingerprint is persisted into settings, default bindings untouched.
    assert.deepEqual(Object.keys(state.settings.controls.gamepad).sort(), beforeKeys,
      'the swap writes the existing glyph register, never a new persisted field');
    assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.fire, ['r2']);
    assert.deepEqual(resolveGamepadBindings(state.settings).fire, ['r2']);
  } finally { restore(); }
});

// NXI-003 still holds through a family swap: deliberate edges own the helm, a reconnect
// is not a gesture, and held flight is not a new family.
function makeFlightState() {
  const player = {
    id: 'p', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
  };
  return {
    mode: 'flight',
    tick: 1,
    simTime: 0,
    playerId: 'p',
    ui: { screenStack: [] },
    settings: {
      gameplay: { controlScheme: 'pilot' },
      controls: { gamepad: { enabled: true, deadzone: 0.12, invertY: false } },
    },
    player: { tether: { active: false } },
    entities: { get: (id) => (id === 'p' ? player : null) },
    input: {
      actions: {},
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
    },
  };
}

function makeHost(state) {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 40, y: 40, active: true };
  host._m0 = host._m1 = host._m2 = false;
  host._lastKbmTick = -1;
  host._lastKbmSeq = -1;
  host.helpers = { raycastToPlane: () => ({ x: 0, z: 100 }) };
  host.bus = { emit() {} };
  host.gamepad = createGamepad({ bus: { emit() {} }, state });
  host.touch = null;
  return host;
}

function stepFlight(host, state) {
  state.tick += 1;
  state.simTime += DT;
  host.update(DT, state);
}

test('PRO-22 the in-flight source rules still hold across a pad-family swap', () => {
  const pads = [fakePad(XB_ID)];
  const restore = installNavigator(pads);
  try {
    const state = makeFlightState();
    const host = makeHost(state);
    stepFlight(host, state);
    assert.equal(host.gamepad.isConnected(), true);

    // A deliberate keyboard drive claims the helm (NXI-003).
    host._keys.KeyW = true;
    stepFlight(host, state);
    assert.equal(host.movementSource, 'keyboard');

    // Unplug: the accepted source survives on the still-held keys.
    pads[0] = null;
    stepFlight(host, state);
    assert.equal(host.gamepad.isConnected(), false);
    assert.equal(host.movementSource, 'keyboard');

    // Replug as the other family, neutral: still keyboard — a reconnect is not a gesture.
    pads[0] = fakePad(DS_ID);
    stepFlight(host, state);
    assert.equal(host.movementSource, 'keyboard', 'a reconnect alone never steals the helm');
    assert.equal(state.settings.controls.gamepad.glyphSet, 'xb', 'no swap before adoption');

    // The deliberate stick gesture re-acquires: glyphs swap live AND the pad takes the helm.
    pads[0] = fakePad(DS_ID, [0, -0.9, 0, 0]);
    stepFlight(host, state);
    assert.equal(host.gamepad.isConnected(), true);
    assert.equal(state.settings.controls.gamepad.glyphSet, 'ds');
    assert.equal(verbBindingLabel(state, 'toggleSkimCollector', 'gamepad'), 'LB + △');
    assert.equal(host.movementSource, 'gamepad', 'the deliberate stick gesture still claims');
    const changes = host.movementSourceChanges;
    for (let i = 0; i < 10; i++) stepFlight(host, state);
    assert.equal(host.movementSource, 'gamepad');
    assert.equal(host.movementSourceChanges, changes, 'held flight is not a new family');
  } finally { restore(); }
});
