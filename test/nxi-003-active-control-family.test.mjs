// NXI-003 — the Settings → Controls surface shows the newly ACCEPTED control family once.
//
// The Controls tab now carries an "Active input" display row fed by the input owner's
// accepted source (resolveMovementOwner → host.movementSource), retexted in place by
// refresh() — never rebuilt — so one deliberate keyboard<->gamepad switch flips the label
// exactly once, and pointer traffic over the Settings screen cannot move the in-flight
// source (UI targets are not flight pointer activity).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { input, noteFlightPointer } from '../src/systems/input.js';
import { createGamepad } from '../src/systems/gamepad.js';
import {
  CONTROL_FAMILY_LABELS,
  activeControlFamily,
  controlFamilyLabel,
  syncActiveControlFamily,
} from '../src/ui/screens/settings.js';

const DT = 1 / 60;

function button(down) {
  return { pressed: !!down, value: down ? 1 : 0 };
}

function fakePad(id, axes, held = []) {
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

function makeState(scheme = 'pilot') {
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
      gameplay: { controlScheme: scheme },
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
    _player: player,
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

function makeCtx(state, host) {
  return {
    state,
    bus: { emit() {} },
    registry: { get: (name) => (name === 'input' ? host : null) },
  };
}

function step(host, state) {
  state.tick += 1;
  state.simTime += DT;
  host.update(DT, state);
}

/** A textContent sink that counts real writes — proof the label flips exactly once. */
function countEl(text = '') {
  let count = 0;
  let current = text;
  return {
    get count() { return count; },
    get textContent() { return current; },
    set textContent(v) { count += 1; current = v; },
  };
}

test('NXI-003 one deliberate source switch changes the displayed control family once', () => {
  const pads = [fakePad('pad-a', [0, 0, 0, 0])];
  const restore = installNavigator(pads);
  try {
    const state = makeState('pilot');
    const host = makeHost(state);
    const ctx = makeCtx(state, host);
    const valueEl = countEl(controlFamilyLabel(activeControlFamily(ctx)));

    host._keys.KeyW = true;
    step(host, state);
    assert.equal(host.movementSource, 'keyboard');
    assert.equal(activeControlFamily(ctx), 'keyboard');
    assert.equal(syncActiveControlFamily(ctx, valueEl), 'Keyboard & mouse');
    assert.equal(valueEl.count, 1, 'the new family writes once');
    assert.equal(syncActiveControlFamily(ctx, valueEl), 'Keyboard & mouse');
    assert.equal(valueEl.count, 1, 'a repeat refresh while the source holds writes nothing');

    // A deliberate stick cross is the ONE pad takeover — the displayed family flips once.
    pads[0].axes[1] = -1;
    step(host, state);
    assert.equal(host.movementSource, 'gamepad');
    assert.equal(activeControlFamily(ctx), 'gamepad');
    assert.equal(syncActiveControlFamily(ctx, valueEl), 'Gamepad');
    assert.equal(valueEl.count, 2, 'one deliberate switch, one new label');
    for (let i = 0; i < 30; i++) step(host, state);
    assert.equal(syncActiveControlFamily(ctx, valueEl), 'Gamepad');
    assert.equal(valueEl.count, 2, 'held flight is not a new family');
  } finally { restore(); }
});

test('NXI-003 hovering Settings does not change the in-flight source', () => {
  const pads = [fakePad('pad-a', [0, -1, 0, 0])];
  const restore = installNavigator(pads);
  try {
    const state = makeState('pilot');
    const host = makeHost(state);
    const ctx = makeCtx(state, host);
    step(host, state);
    assert.equal(host.movementSource, 'gamepad');
    const family = activeControlFamily(ctx);
    const changes = host.movementSourceChanges;

    // Hovering a Settings row is pointer traffic on a UI command target — it must not count
    // as flight pointer activity and must not touch the accepted source.
    const settingsRow = { closest: (sel) => (String(sel).includes('button') ? {} : null) };
    assert.equal(noteFlightPointer(host, settingsRow), false,
      'UI hover is not flight pointer activity');
    step(host, state);
    assert.equal(host.movementSource, 'gamepad');
    assert.equal(host.movementSourceChanges, changes);
    assert.equal(activeControlFamily(ctx), family);

    // The legitimate neighboring success still works: a real flight-surface pointer claims
    // kbm activity, and a deliberate keyboard drive takes the family back.
    const flightSurface = { closest: () => null };
    assert.equal(noteFlightPointer(host, flightSurface), true);
    step(host, state);
    host._keys.KeyW = true;
    step(host, state);
    assert.equal(host.movementSource, 'keyboard');
    assert.equal(activeControlFamily(ctx), 'keyboard');
  } finally { restore(); }
});

test('NXI-003 an unreachable input owner prints the empty family, never a guess', () => {
  const state = makeState();
  const noRegistry = makeCtx(state, null);
  noRegistry.registry = null;
  assert.equal(activeControlFamily(noRegistry), null);
  assert.equal(controlFamilyLabel(null), '—');
  const valueEl = countEl('—');
  assert.equal(syncActiveControlFamily(noRegistry, valueEl), '—');
  assert.equal(valueEl.count, 0, 'an absent owner changes nothing');
  // A registry whose input system has not accepted a source yet is '—' too.
  const fresh = makeCtx(state, { movementSource: null });
  assert.equal(controlFamilyLabel(activeControlFamily(fresh)), '—');
});

test('NXI-003 the Controls surface binds the row to the accepted source, not a hover detector', () => {
  const source = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  assert.match(source, /shortcut\('Active input', controlFamilyLabel\(activeControlFamily\(ctx\)\)/,
    'the row prints the resolved family at render');
  assert.match(source, /registry\.get\('input'\)/,
    'the family comes from the sim input owner');
  assert.match(source, /sys\.movementSource/,
    'the accepted source is host.movementSource — the parent takeover result');
  assert.match(source, /refresh\(ctx\) \{\s*syncActiveControlFamily\(ctx, refs && refs\.familyValue\)/,
    'refresh retexts the family value instead of rebuilding the pane');
  // The family must never be fed by pointer traffic over the screen: the only listeners the
  // pane owns are the settings preview's, and none writes the family value.
  assert.equal(CONTROL_FAMILY_LABELS.keyboard, 'Keyboard & mouse');
  assert.equal(CONTROL_FAMILY_LABELS.gamepad, 'Gamepad');
  assert.equal(CONTROL_FAMILY_LABELS.touch, 'Touch');
});
