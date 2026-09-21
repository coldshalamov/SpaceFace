import test from 'node:test';
import assert from 'node:assert/strict';

import { createGamepad } from '../src/systems/gamepad.js';

// INF-098: unplugging under thrust/fire must not leave either held, and reconnecting with
// buttons already down must not fire, buy, or confirm — those need a fresh edge.
function button(down) {
  return { pressed: !!down, value: down ? 1 : 0 };
}

function fakePad(held = []) {
  const buttons = [];
  for (let i = 0; i < 17; i++) buttons.push(button(held.includes(i)));
  return {
    connected: true, id: 'testpad',
    axes: [0, 0, 0, 0],
    buttons,
  };
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

function boot(events) {
  const gp = createGamepad({ bus: { emit: (name, payload) => events.push({ name, payload }) } });
  const live = { tick: 1, settings: {} };
  return { gp, live };
}

const anyPressed = (gp) => Object.values(gp.actions).some((a) => a && a.pressed);

test('INF-098 disconnect under held fire releases everything and announces', () => {
  const events = [];
  const restore = installNavigator([fakePad([7])]); // RT held: fire
  try {
    const { gp, live } = boot(events);
    gp.tick(0.016, live, null);
    assert.equal(gp.isConnected(), true);
    assert.equal(gp.actions.fire.held, true);
    restore();
    const restore2 = installNavigator([]);
    try {
      live.tick = 2;
      gp.tick(0.016, live, null);
      assert.equal(gp.isConnected(), false);
      assert.ok(!anyPressed(gp), 'no edge survives the unplug');
      assert.equal(gp.actions.fire.held, false, 'fire cannot stick');
      assert.ok(events.some((e) => e.name === 'gamepad:disconnected'));
      assert.deepEqual(gp.drainButtonPresses(), [], 'remap queue drained');
    } finally { restore2(); }
  } finally { restore(); }
});

test('INF-098 reconnect with buttons down reports holds, never fresh presses', () => {
  const events = [];
  const pads = [fakePad([])];
  const restore = installNavigator(pads);
  try {
    const { gp, live } = boot(events);
    gp.tick(0.016, live, null); // boot-time acquisition, neutral
    pads[0] = null; // unplug mid-session
    live.tick = 2;
    gp.tick(0.016, live, null);
    assert.equal(gp.isConnected(), false);
    pads[0] = fakePad([0, 7]); // replug with A + RT already down
    live.tick = 3;
    gp.tick(0.016, live, null);
    assert.ok(events.some((e) => e.name === 'gamepad:connected'));
    assert.equal(gp.actions.fire.held, true, 'live hold still reads held');
    assert.equal(gp.actions.fire.pressed, false, 'but not as a fresh press');
    assert.equal(gp.actions.accept.pressed, false, 'no phantom confirm/buy edge');
    assert.ok(!anyPressed(gp), 'no action anywhere reports pressed on the reconnect frame');
    assert.deepEqual(gp.drainButtonPresses(), [], 'no phantom remap-capture edge');
    // Next frame with the same hold stays edge-free; axes were never latched.
    live.tick = 4;
    gp.tick(0.016, live, null);
    assert.equal(gp.actions.fire.held, true);
    assert.equal(gp.actions.fire.pressed, false);
  } finally { restore(); }
});

test('INF-098 a release plus re-press after reconnect is a real fresh edge', () => {
  const events = [];
  const pads = [fakePad([])];
  const restore = installNavigator(pads);
  try {
    const { gp, live } = boot(events);
    gp.tick(0.016, live, null);
    pads[0] = null;
    live.tick = 2;
    gp.tick(0.016, live, null);
    pads[0] = fakePad([7]); // replug with RT down: suppressed, not fired
    live.tick = 3;
    gp.tick(0.016, live, null);
    assert.equal(gp.actions.fire.pressed, false);
    pads[0] = fakePad([]); // release while connected
    live.tick = 4;
    gp.tick(0.016, live, null);
    assert.equal(gp.actions.fire.held, false);
    pads[0] = fakePad([7]); // genuine re-press
    live.tick = 5;
    gp.tick(0.016, live, null);
    assert.equal(gp.actions.fire.held, true);
    assert.equal(gp.actions.fire.pressed, true, 'genuine re-press fires');
  } finally { restore(); }
});
