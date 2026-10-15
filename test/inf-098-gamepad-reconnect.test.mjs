import test from 'node:test';
import assert from 'node:assert/strict';

import { createGamepad } from '../src/systems/gamepad.js';
import { input } from '../src/systems/input.js';
import { createGameState } from '../src/core/gameState.js';

// INF-098: unplugging under thrust/fire must not leave either held, and reconnecting with
// buttons already down must not fire, buy, or confirm — those need a fresh edge.
function button(down) {
  return { pressed: !!down, value: down ? 1 : 0 };
}

function fakePad(held = [], axes = [0, 0, 0, 0]) {
  const buttons = [];
  for (let i = 0; i < 17; i++) buttons.push(button(held.includes(i)));
  return {
    connected: true, id: 'testpad',
    axes,
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

function bootFlightInput() {
  const state = createGameState(821);
  state.mode = 'flight';
  state.ui.screenStack = [];
  state.playerId = 1;
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
  });
  state.settings.controls.gamepad.enabled = true;
  state.settings.controls.gamepad.scheme = 'drive';
  const host = Object.create(input);
  host.init({
    state,
    bus: { emit() {} },
    helpers: { raycastToPlane: () => ({ x: 0, z: 0 }) },
  });
  return {
    state,
    host,
    step() {
      state.tick += 1;
      host.update(1 / 60, state);
    },
    close() { host.destroy(); },
  };
}

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
      const toasts = events.filter((e) => e.name === 'toast');
      assert.equal(toasts.length, 1, 'the lost device tells the player once');
      assert.match(toasts[0].payload.text, /disconnected/i);
      assert.deepEqual(gp.drainButtonPresses(), [], 'remap queue drained');
    } finally { restore2(); }
  } finally { restore(); }
});

test('INF-098 idle ticks after the loss do not restate the toast', () => {
  const events = [];
  const pads = [fakePad([])];
  const restore = installNavigator(pads);
  try {
    const { gp, live } = boot(events);
    gp.tick(0.016, live, null);
    pads[0] = null;
    live.tick = 2;
    gp.tick(0.016, live, null);
    assert.equal(events.filter((e) => e.name === 'toast').length, 1);
    for (let i = 3; i <= 6; i++) {
      live.tick = i;
      gp.tick(0.016, live, null);
    }
    assert.equal(events.filter((e) => e.name === 'toast').length, 1,
      'the announcement is once per loss, not once per sample');
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
    pads[0] = fakePad([0, 7]); // replug with A + RT already down — not a new gesture
    live.tick = 3;
    gp.tick(0.016, live, null);
    assert.ok(events.some((e) => e.name === 'gamepad:connected'));
    assert.equal(gp.isConnected(), false, 'a reused slot is not adopted while its buttons are already down');
    assert.equal(gp.actions.fire.held, false, 'no inherited held thrust or trigger');
    assert.equal(gp.actions.fire.pressed, false, 'and not a fresh press');
    assert.equal(gp.actions.accept.pressed, false, 'no phantom confirm/buy edge');
    assert.ok(!anyPressed(gp), 'no action anywhere reports pressed on the reconnect frame');
    assert.deepEqual(gp.drainButtonPresses(), [], 'no phantom remap-capture edge');
    // The same hold on the next sample is still not thrust. A new press is required.
    live.tick = 4;
    gp.tick(0.016, live, null);
    assert.equal(gp.actions.fire.held, false);
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

test('INF-098 continuous flight controls require neutral then re-press after lifecycle release', () => {
  const pads = [fakePad([5, 7], [0, -1, 0.5, -0.25])]; // RB + RT + both sticks out
  const restore = installNavigator(pads);
  const fixture = bootFlightInput();
  try {
    fixture.step();
    assert.deepEqual(
      { fire: fixture.state.input.fire, boost: fixture.state.input.boost, moveZ: fixture.state.input.moveZ },
      { fire: true, boost: true, moveZ: 1 },
      'the initial held pad drives flight',
    );
    const actions = fixture.state.input.actions;
    fixture.host.releaseHeldControls('window-blur');
    fixture.step();
    assert.deepEqual(
      { fire: fixture.state.input.fire, boost: fixture.state.input.boost, moveZ: fixture.state.input.moveZ },
      { fire: false, boost: false, moveZ: 0 },
      'the first held sample after blur stays neutral',
    );
    assert.equal(fixture.host.gamepad.actions.fire.held, true, 'raw RT remains truthful');
    assert.equal(fixture.host.gamepad.actions.boost.held, true, 'raw RB remains truthful');
    assert.equal(fixture.host.gamepad.axes.leftY, -1, 'raw drive stick remains truthful');
    assert.equal(fixture.host.gamepad.axes.rightX > 0.4, true, 'raw aim stick remains truthful');
    assert.equal(fixture.state.input.actions, actions, 'state.input.actions keeps its stable object contract');

    pads[0] = fakePad([]);
    fixture.step();
    assert.deepEqual(
      { fire: fixture.state.input.fire, boost: fixture.state.input.boost, moveZ: fixture.state.input.moveZ },
      { fire: false, boost: false, moveZ: 0 },
      'neutral remains neutral',
    );
    assert.equal(fixture.host._gamepadLifecycleActionAllowed('fire'), true);
    assert.equal(fixture.host._gamepadLifecycleActionAllowed('boost'), true);
    assert.equal(fixture.host._gamepadLifecycleActionAllowed('leftStick'), true);
    assert.equal(fixture.host._gamepadLifecycleActionAllowed('rightStick'), true);

    pads[0] = fakePad([5, 7], [0, -1, 0.5, -0.25]);
    fixture.step();
    assert.deepEqual(
      { fire: fixture.state.input.fire, boost: fixture.state.input.boost, moveZ: fixture.state.input.moveZ },
      { fire: true, boost: true, moveZ: 1 },
      'a fresh pad press drives flight again',
    );
  } finally {
    fixture.close();
    restore();
  }
});

test('INF-098 modal and mode fences keep continuous pad holds quarantined', () => {
  const pads = [fakePad([5, 7], [0, -1, 0, 0])];
  const restore = installNavigator(pads);
  const fixture = bootFlightInput();
  try {
    fixture.step();
    fixture.state.ui.screenStack.push('pause');
    fixture.step();
    assert.equal(fixture.state.input.fire, false, 'modal flight input is neutral');
    fixture.state.ui.screenStack.pop();
    fixture.step();
    assert.equal(fixture.state.input.fire, false, 'held RT does not re-arm on modal close');
    assert.equal(fixture.host._gamepadLifecycleActionAllowed('fire'), false);

    fixture.state.mode = 'loading';
    fixture.step();
    fixture.state.mode = 'flight';
    fixture.step();
    assert.equal(fixture.state.input.fire, false, 'mode return still requires a neutral sample');

    pads[0] = fakePad([]);
    fixture.step();
    pads[0] = fakePad([5, 7], [0, -1, 0, 0]);
    fixture.step();
    assert.equal(fixture.state.input.fire, true, 'neutral then re-press restores fire');
    assert.equal(fixture.state.input.boost, true, 'neutral then re-press restores boost');
  } finally {
    fixture.close();
    restore();
  }
});

test('INF-098 continuous pad quarantine survives disconnect and reconnect', () => {
  const pads = [fakePad([5, 7], [0, -1, 0, 0])];
  const restore = installNavigator(pads);
  const fixture = bootFlightInput();
  try {
    fixture.step();
    fixture.host.releaseHeldControls('window-blur');
    pads[0] = null;
    fixture.step();
    assert.equal(fixture.state.input.fire, false);

    pads[0] = fakePad([5, 7], [0, -1, 0, 0]);
    fixture.step();
    assert.equal(fixture.host.gamepad.isConnected(), false, 'held reconnect does not reacquire the pad');
    assert.equal(fixture.state.input.fire, false);

    pads[0] = fakePad([]);
    fixture.step();
    pads[0] = fakePad([5, 7], [0, -1, 0, 0]);
    fixture.step();
    assert.equal(fixture.state.input.fire, false, 'the reacquire gesture remains quarantined');

    pads[0] = fakePad([]);
    fixture.step();
    pads[0] = fakePad([5, 7], [0, -1, 0, 0]);
    fixture.step();
    assert.equal(fixture.state.input.fire, true, 'release then re-press after reconnect works');
  } finally {
    fixture.close();
    restore();
  }
});
