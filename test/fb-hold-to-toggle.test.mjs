// FB-113 — "Hold verbs can toggle."
//
// A player who cannot sustain a press opts into press-to-toggle per verb: boost, brake, bullet
// time, the Massline hold, and the two winch keys. A press flips a latch that reads as held until
// the next press or a context change (dock, death, any screen/modal, lifecycle reset). Players
// who leave the option off get the shipped physical-hold semantics, bit for bit — the raw action
// edges are never touched.
//
// Run: node --test test/fb-hold-to-toggle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const { input, HOLD_TO_TOGGLE_ACTIONS } = await import('../src/systems/input.js');
const { createGameState } = await import('../src/core/gameState.js');
const { createBus } = await import('../src/core/eventBus.js');
const { save } = await import('../src/save/saveSystem.js');

const SEED = 1113;

function flightState(toggles = {}) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.playerId = 1;
  state.ui = { screenStack: [] };
  state.player = {
    id: 1, alive: true,
    tether: { active: false, targetId: null, strain: 0, load: 0, restLength: 0, phase: 'slack' },
  };
  state.entities = new Map([[1, {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
  }]]);
  state.settings.accessibility.holdToToggle = toggles;
  return state;
}

function makeHost(gp = null) {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host._lastKbmTick = -1; host._lastKbmSeq = -1;
  host.helpers = { raycastToPlane: () => ({ x: 0, z: 0 }) };
  host.bus = { emit() {} };
  host.gamepad = gp;
  host.touch = null;
  return host;
}

function step(host, state, n = 1) {
  for (let i = 0; i < n; i++) { state.tick += 1; host.update(1 / 60, state); }
}

test('FB-113: a toggled boost reads as held across frames until the next press', () => {
  const state = flightState({ boost: true });
  const host = makeHost();

  // Tap: held during the press, STILL held after release — the latch owns the verb now.
  host._keys.ShiftLeft = true;
  step(host, state);
  assert.equal(state.input.boost, true, 'the press itself is held');
  host._keys.ShiftLeft = false;
  step(host, state, 3);
  assert.equal(state.input.boost, true, 'release does not drop a toggled boost');

  // Second tap toggles back off — after release the verb is quiet.
  host._keys.ShiftLeft = true;
  step(host, state);
  assert.equal(state.input.boost, true);
  host._keys.ShiftLeft = false;
  step(host, state, 3);
  assert.equal(state.input.boost, false, 'the second press unlatches');
});

test('FB-113: players who leave the option off keep the shipped physical hold', () => {
  const state = flightState(); // nothing enabled — the shipped default
  assert.deepEqual(state.settings.accessibility.holdToToggle, {}, 'defaults are all off');
  const host = makeHost();
  host._keys.ShiftLeft = true;
  step(host, state);
  assert.equal(state.input.boost, true);
  host._keys.ShiftLeft = false;
  step(host, state, 2);
  assert.equal(state.input.boost, false, 'no option, no latch — physical truth');
});

test('FB-113: every whitelisted verb latches; the winch latches the reel direction', () => {
  assert.deepEqual([...HOLD_TO_TOGGLE_ACTIONS].sort(),
    ['boost', 'brake', 'bulletTime', 'massline', 'reelIn', 'reelOut'].sort());

  const state = flightState({ brake: true, bulletTime: true, reelIn: true });
  const host = makeHost();

  host._keys.Digit0 = true; step(host, state); host._keys.Digit0 = false;
  step(host, state);
  assert.equal(state.input.brake, true, 'brake latch survives release');

  host._keys.CapsLock = true; step(host, state); host._keys.CapsLock = false;
  step(host, state);
  assert.equal(state.input.actions.bulletTime, true, 'bullet time holds the dilation');

  host._keys.BracketLeft = true; step(host, state); host._keys.BracketLeft = false;
  step(host, state);
  assert.equal(state.input.actions.reelDelta, -1, 'reel-in keeps winching after the tap');

  // A non-toggled verb in the same press storm is untouched by the latches.
  host._keys.KeyC = true; step(host, state);
  assert.equal(state.input.actions.scanPulse, true, 'edge verbs still edge');
  host._keys.KeyC = false; step(host, state);
  assert.equal(state.input.actions.scanPulse, false);
});

test('FB-113: dock/screen drops every latch — the context, not the pilot, released it', () => {
  const state = flightState({ boost: true, bulletTime: true });
  const host = makeHost();
  host._keys.ShiftLeft = true; step(host, state); host._keys.ShiftLeft = false;
  host._keys.CapsLock = true; step(host, state); host._keys.CapsLock = false;
  step(host, state);
  assert.equal(state.input.boost, true);
  assert.equal(state.input.actions.bulletTime, true);

  // A screen mounts — flight input is neutralized and the latches go with it.
  state.ui.screenStack.push('pause');
  step(host, state);
  assert.equal(state.input.boost, false, 'boost latch dropped on the screen mount');
  assert.equal(state.input.actions.bulletTime, false);

  // Back in flight with no new press: nothing was silently re-armed.
  state.ui.screenStack.pop();
  step(host, state, 2);
  assert.equal(state.input.boost, false, 'the latch does not resurrect after the screen');
  assert.equal(state.input.actions.bulletTime, false);
});

test('FB-113: death clears the latches before the death screen even mounts', () => {
  const state = flightState({ boost: true });
  const host = makeHost();
  host._keys.ShiftLeft = true; step(host, state); host._keys.ShiftLeft = false;
  step(host, state);
  assert.equal(state.input.boost, true);
  state.player.alive = false;
  step(host, state, 2);
  assert.equal(state.input.boost, false, 'a dead pilot is not still boosting the wreck');
});

test('FB-113: the Massline hold toggles — a toggled tap never cuts, a long stay opens the winch', () => {
  // Baseline cadence without the option: a tap shorter than the hold window still cuts.
  const plain = flightState();
  plain.player.tether.active = true; // latched rope — a tap means "let go"
  const plainHost = makeHost();
  plainHost._keys.Space = true; step(plainHost, plain); plainHost._keys.Space = false;
  step(plainHost, plain);
  assert.equal(plain.input.actions.tetherCut, true, 'shipped cadence: the tap cuts');

  // With massline toggled the same physical tap latches the hold — no cut ever reaches the line.
  const state = flightState({ massline: true });
  state.player.tether.active = true;
  const host = makeHost();
  host._keys.Space = true; step(host, state); host._keys.Space = false;
  step(host, state, 3);
  assert.equal(state.input.actions.tetherCut, false, 'a toggled tap does not cut the rope');
  assert.equal(state.input.actions.massline.phase, 'latched', 'still on the line');

  // The latch holds past the 0.16 s window — the winch opens exactly as a held line does.
  step(host, state, 12);
  assert.equal(state.input.actions.massline.phase, 'line-control');
  assert.equal(state.input.actions.massline.lineControl, true, 'reel control from a toggle');

  // A second tap lets go. To the grammar it is one long hold ending — and a hold NEVER cuts on
  // release (the standing cadence rule), so nothing about tap-to-cut changes for anyone.
  host._keys.Space = true; step(host, state); host._keys.Space = false;
  step(host, state);
  assert.equal(state.input.actions.massline.lineControl, false, 'the second tap releases');
  assert.equal(state.input.actions.tetherCut, false, 'a hold never cuts on release');
});

test('FB-113: raw action edges are unchanged — a toggle never invents or eats an edge', () => {
  const state = flightState({ boost: true });
  const host = makeHost();

  // With boost latched, unrelated edge verbs still report exact one-tick edges.
  host._keys.ShiftLeft = true; step(host, state); host._keys.ShiftLeft = false;
  step(host, state);
  assert.equal(state.input.boost, true, 'latch on');

  host._keys.KeyC = true;
  step(host, state);
  assert.equal(state.input.actions.scanPulse, true, 'press edge');
  host._keys.KeyC = false;
  step(host, state);
  assert.equal(state.input.actions.scanPulse, false, 'released edge — no phantom second fire');

  // And boost itself: the latch is a held level, not a stream of fake edges — inp.boost is the
  // only boost channel (there is no actions.boost), and it stays a plain boolean.
  assert.equal(typeof state.input.boost, 'boolean');
});

test('FB-113: the setting survives profile normalization; stray keys are dropped', () => {
  const state = createGameState(SEED + 1);
  save.init({ state, bus: createBus(), helpers: {}, registry: { get: () => null } });
  save._restoreSettings({
    accessibility: { holdToToggle: { boost: true, reelIn: true, hyperdrive: true, brake: 'yes' } },
  });
  assert.deepEqual(state.settings.accessibility.holdToToggle, { boost: true, reelIn: true },
    'only whitelisted verbs with a true value persist');

  const legacy = createGameState(SEED + 2);
  save.init({ state: legacy, bus: createBus(), helpers: {}, registry: { get: () => null } });
  save._restoreSettings({ accessibility: {} });
  assert.deepEqual(legacy.settings.accessibility.holdToToggle, {}, 'an old profile is all-off');
});
