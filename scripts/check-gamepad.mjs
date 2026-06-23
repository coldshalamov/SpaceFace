// Verifies the gamepad module loads and maps standard-gamepad buttons correctly under Node.
// Mocks navigator.getGamepads() so the layer can be unit-tested without a browser.

import { createGamepad } from '../src/systems/gamepad.js';

let fail = 0;
function assert(cond, msg) {
  if (!cond) { console.log('FAIL', msg); fail++; }
  else { console.log('ok  ', msg); }
}

function makeBtn(pressed, value = pressed ? 1 : 0) {
  return { pressed: !!pressed, value, touched: !!pressed };
}

function makePad(opts = {}) {
  const buttons = Array(17).fill(null).map(() => makeBtn(false));
  if (opts.buttons) {
    for (const [i, b] of Object.entries(opts.buttons)) {
      buttons[Number(i)] = typeof b === 'boolean' ? makeBtn(b) : makeBtn(!!b.pressed, b.value);
    }
  }
  return {
    id: opts.id || 'Mock Standard Gamepad',
    connected: opts.connected !== false,
    mapping: 'standard',
    axes: opts.axes || [0, 0, 0, 0],
    buttons,
    timestamp: opts.timestamp || 0,
  };
}

// Install a mock navigator before creating the gamepad layer.
let currentPads = [];
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads() { return currentPads; } },
  writable: true,
  configurable: true,
});

const events = [];
const bus = {
  emit(name, payload) { events.push([name, payload]); },
};
const state = {
  settings: {
    controls: {
      gamepad: { enabled: true, deadzone: 0.12, invertY: false },
    },
  },
};

const gp = createGamepad({ bus, state });

// No gamepad connected -> not connected.
gp.tick(0);
assert(!gp.isConnected(), 'starts disconnected when no pad present');

// Connect a pad.
currentPads = [makePad({})];
gp.tick(0);
assert(gp.isConnected(), 'detects connected pad');
assert(events.some((e) => e[0] === 'gamepad:connected'), 'emits gamepad:connected');

// Fire via RT (index 7).
currentPads = [makePad({ buttons: { 7: true } })];
gp.tick(0);
assert(gp.actions.fire.held, 'RT held = fire held');
assert(gp.actions.fire.pressed, 'RT press = fire pressed');

gp.tick(0); // same frame state
assert(!gp.actions.fire.pressed && gp.actions.fire.held, 'second tick keeps fire held, no pressed edge');

currentPads = [makePad({})];
gp.tick(0);
assert(gp.actions.fire.released, 'RT release = fire released');
assert(!gp.actions.fire.held, 'RT release clears fire held');

// Boost via RB (5) and brake via LB (4).
currentPads = [makePad({ buttons: { 5: true, 4: true } })];
gp.tick(0);
assert(gp.actions.boost.held && gp.actions.brake.held, 'LB+RB map to brake and boost');

// Cycle target via X (2), map via View (8), codex via Y (3), pause via Start (9).
currentPads = [makePad({ buttons: { 2: true, 8: true, 3: true, 9: true } })];
gp.tick(0);
assert(gp.actions.cycleTarget.pressed, 'X maps to cycleTarget');
assert(gp.actions.map.pressed, 'View maps to map');
assert(gp.actions.codex.pressed, 'Y maps to codex');
assert(gp.actions.pause.pressed, 'Start maps to pause');

// Accept (A/0) and cancel (B/1).
currentPads = [makePad({ buttons: { 0: true, 1: true } })];
gp.tick(0);
assert(gp.actions.accept.pressed, 'A maps to accept');
assert(gp.actions.cancel.pressed, 'B maps to cancel');

// Axis normalization and deadzone.
currentPads = [makePad({ axes: [0.5, -0.8, 0.05, 0.05] })];
gp.tick(0);
assert(Math.abs(gp.axes.leftX - 0.4318) < 0.01, 'left X is normalized and deadzoned');
assert(Math.abs(gp.axes.leftY - (-0.7727)) < 0.01, 'left Y is normalized and deadzoned');
assert(gp.axes.rightX === 0 && gp.axes.rightY === 0, 'small right-stick inputs are deadzoned');

// invertY setting.
state.settings.controls.gamepad.invertY = true;
currentPads = [makePad({ axes: [0, 0, 0, -0.8] })];
gp.tick(0);
assert(gp.axes.rightY > 0, 'invertY flips right-stick Y');
state.settings.controls.gamepad.invertY = false;

// Disabling gamepad drops connection state.
state.settings.controls.gamepad.enabled = false;
currentPads = [makePad({})];
gp.tick(0);
assert(!gp.isConnected(), 'disabled gamepad reports disconnected');
assert(events.some((e) => e[0] === 'gamepad:disconnected'), 'emits gamepad:disconnected on disable');

console.log(`\n${fail ? 'FAILED' : 'PASSED'} (${fail} failure${fail === 1 ? '' : 's'})`);
process.exit(fail ? 1 : 0);
