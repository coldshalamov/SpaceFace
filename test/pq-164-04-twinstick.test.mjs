import test from 'node:test';
import assert from 'node:assert/strict';

import { input } from '../src/systems/input.js';
import { createGamepad } from '../src/systems/gamepad.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import {
  createProofPad,
  installProofPad,
  runProofSixtySeconds,
} from '../src/testing/lab/proofSixtySeconds.js';

const PROFILE_KEY = 'sf.settings.profile.v1';
const localStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (localStore.has(String(k)) ? localStore.get(String(k)) : null),
  setItem: (k, v) => localStore.set(String(k), String(v)),
  removeItem: (k) => localStore.delete(String(k)),
  clear: () => localStore.clear(),
};

// PQ-164.04 — the twin-stick pad scheme: left stick is a world-frame drive vector, right
// stick aims and steers the nose; the scheme is selectable in Settings and suggested once
// when a pad connects.

function fakePadState() {
  return {
    tick: 0,
    simTime: 0,
    mode: 'flight',
    playerId: 1,
    entities: new Map([[1, {
      id: 1, type: 'ship', isPlayer: true, alive: true,
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      rot: 0,
      data: {},
    }]]),
    player: { tether: null },
    ui: { screenStack: [] },
    input: {
      blocked: false,
      actions: {},
      pointerScreen: { x: 0, y: 0, active: false },
      mouseNdc: { x: 0, y: 0 },
    },
    settings: {
      gameplay: { controlScheme: 'pilot' },
      controls: {
        bindings: {},
        gamepad: { enabled: true, deadzone: 0.12, invertY: false, scheme: 'twinstick' },
        touch: { enabled: false },
      },
    },
  };
}

function bootInput(state) {
  const host = Object.create(input);
  host.init({
    state,
    bus: { emit() {}, on: () => () => {} },
    helpers: {},
  });
  return host;
}

test('PQ-164.04 twin-stick maps the left stick to a world-frame drive vector', () => {
  const pad = createProofPad();
  const restore = installProofPad(pad);
  try {
    const state = fakePadState();
    const host = bootInput(state);
    // Player faces +x (rot 0). Stick up = drive world +z (world +Z is "up" on the stick) —
    // at this heading that is pure strafe in hull axes.
    pad.axes[1] = -1;
    host.update(1 / 60, state);
    const inp = state.input;
    assert.ok(Math.abs(inp.moveZ) < 0.01 && Math.abs(inp.moveX - 1) < 0.01,
      `stick-up at rot 0 must read as the world +z drive vector — hull-frame strafe, got moveX=${inp.moveX} moveZ=${inp.moveZ}`);

    // Rotate the hull to face +z (rot = PI/2): the same stick-up still drives world +z,
    // which is now pure forward along the nose.
    const player = state.entities.get(1);
    player.rot = Math.PI / 2;
    host.update(1 / 60, state);
    assert.ok(inp.moveZ > 0.9 && Math.abs(inp.moveX) < 0.1,
      `the same stick-up must stay a world-frame drive as the hull turns — got moveX=${inp.moveX} moveZ=${inp.moveZ}`);
  } finally { restore(); }
});

test('PQ-164.04 twin-stick steers the nose onto the right-stick aim', () => {
  const pad = createProofPad();
  const restore = installProofPad(pad);
  try {
    const state = fakePadState();
    const host = bootInput(state);
    // Aim due +z (screen "down") while the nose faces +x: the helm chase must produce a
    // positive turnIntent (toward increasing rot).
    pad.axes[2] = 0;
    pad.axes[3] = -1; // aim at +z
    host.update(1 / 60, state);
    assert.ok(state.input.turnIntent > 0.5,
      `right-stick aim must steer the nose — got turnIntent=${state.input.turnIntent}`);
    assert.ok(Number.isFinite(state.input.aimAngle));
    assert.equal(state.input.aimIntentActive, true);
  } finally { restore(); }
});

test('PQ-164.04 drive scheme keeps the wheel map unchanged', () => {
  const pad = createProofPad();
  const restore = installProofPad(pad);
  try {
    const state = fakePadState();
    state.settings.controls.gamepad.scheme = 'drive';
    const host = bootInput(state);
    pad.axes[0] = 1;  // full right on the left stick = yaw, not strafe
    pad.axes[1] = -1; // stick up = forward throttle
    host.update(1 / 60, state);
    assert.equal(state.input.turnIntent, 1);
    assert.equal(state.input.moveZ, 1);
    assert.equal(state.input.moveX, 0);
  } finally { restore(); }
});

test('PQ-164.04 pad connect suggests the twin-stick scheme exactly once', () => {
  const events = [];
  const pad = createProofPad();
  const restore = installProofPad(pad);
  try {
    const gp = createGamepad({ bus: { emit: (name, payload) => events.push({ name, payload }) } });
    const live = { tick: 1, settings: { controls: { gamepad: { enabled: true } } } };
    gp.tick(1 / 60, live, null);
    const toasts = events.filter((e) => e.name === 'toast');
    assert.equal(toasts.length, 1, 'one suggestion toast on first connect');
    assert.match(toasts[0].payload.text, /twin-stick/i);
    assert.equal(live.settings.controls.gamepad.schemeSuggested, true);

    // Reconnect must not re-suggest.
    events.length = 0;
    pad.connected = false;
    live.tick = 2;
    gp.tick(1 / 60, live, null);
    pad.connected = true;
    live.tick = 3;
    gp.tick(1 / 60, live, null);
    assert.equal(events.filter((e) => e.name === 'toast').length, 0, 'no second suggestion');

    // A profile that already picked twin-stick is never suggested.
    events.length = 0;
    const live2 = { tick: 1, settings: { controls: { gamepad: { scheme: 'twinstick' } } } };
    const gp2 = createGamepad({ bus: { emit: (name, payload) => events.push({ name, payload }) } });
    gp2.tick(1 / 60, live2, null);
    assert.equal(events.filter((e) => e.name === 'toast').length, 0);
  } finally { restore(); }
});

test('PQ-164.04 the scheme survives save/profile settings normalization', () => {
  const state = createGameState(16404);
  save.init({ state, bus: createBus(), helpers: {}, registry: { get: () => null } });
  save._restoreSettings({ controls: { gamepad: { scheme: 'twinstick' } } });
  assert.equal(state.settings.controls.gamepad.scheme, 'twinstick', 'a saved twin-stick choice restores');

  const legacy = createGameState(16405);
  save.init({ state: legacy, bus: createBus(), helpers: {}, registry: { get: () => null } });
  save._restoreSettings({ controls: {} });
  assert.equal(legacy.settings.controls.gamepad.scheme, 'drive', 'an old save normalizes to the shipping default');
  assert.equal(legacy.settings.controls.gamepad.schemeSuggested, false);

  const bogus = createGameState(16406);
  save.init({ state: bogus, bus: createBus(), helpers: {}, registry: { get: () => null } });
  save._restoreSettings({ controls: { gamepad: { scheme: 'sideways' } } });
  assert.equal(bogus.settings.controls.gamepad.scheme, 'drive', 'an unknown scheme value falls back');
});

// The PQ-141 60-second scenario on twin-stick alone. Env-gated like the keyboard suite:
// PROOF_TWINSTICK=1 node --test test/pq-164-04-twinstick.test.mjs
test('PQ-164.04 the 60-second proof completes on twin-stick alone', {
  timeout: 300_000,
  skip: process.env.PROOF_TWINSTICK !== '1'
    && 'set PROOF_TWINSTICK=1 to run the pad proof (full Ceres pocket scenario)',
}, async () => {
  const run = await runProofSixtySeconds(47, { inputDevice: 'gamepad' });
  assert.equal(run.inputDevice, 'gamepad');
  assert.ok(run.realPath && run.realPath.sg02Ready === true);
  assert.ok(
    run.gateMet,
    `twin-stick run detected ${run.detected}/${run.total} beats in ${run.simS}s: `
    + (run.missing || []).map((m) => m.id).join(', '),
  );
});
