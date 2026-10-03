// FB-003 — the pad covers the whole hand.
//
// Packet done-when: every id in VERB_BINDINGS that has a keyboard code has a pad route;
// the default chord table passes findGamepadBindConflict; pq-164-01 glyphs/remap and the
// input lifecycle suites stay green. This file proves the route table itself, the chord
// mechanics (key edges while its modifier is held; the chorded solo is suppressed for the
// hold; the modifier's own verb keeps working), gesture capture committing a 'mod+key'
// name, and the merge of the twelve new verbs into state.input.actions.
//
// Run: node --test test/fb-pad-covers-the-hand.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  createGamepad,
  GAMEPAD_DEFAULT_BINDINGS,
  GAMEPAD_VERB_ALIASES,
  findGamepadBindConflict,
  gamepadButtonLabels,
  isGamepadButtonName,
  parseGamepadChord,
  resolveGamepadBindings,
} from '../src/systems/gamepad.js';
import { DEFAULTS as INPUT_DEFAULTS, input } from '../src/systems/input.js';
import { GAMEPAD_REBINDABLE } from '../src/ui/screens/settings.js';
import { createBus } from '../src/core/eventBus.js';

// --- Pad route table ---------------------------------------------------------------
// The keyboard verb set is the union DEFAULT_BINDINGS table minus the mouse-only and
// retired slots. A verb has a pad route when it owns a default binding, when a named
// alias owns it (the rope verb rides the Massline button; the winch rides the line-control
// axis; draw-to-fly rides the auto-target toggle), or when a stick axis IS the verb.
const AXIS_VERBS = new Set(['forward', 'reverse', 'yawLeft', 'yawRight', 'strafeLeft', 'strafeRight']);

const CHORD_VERBS = {
  scanPulse: 'l1+dUp',
  deployMassSeed: 'l1+dDown',
  deployWell: 'l1+dLeft',
  toggleClearingCone: 'l1+dRight',
  toggleSkimCollector: 'l1+alt',
  siteBeam: 'l1+action',
  bulletTime: 'r1+dUp',
  cloak: 'r1+dDown',
  chargeThrow: 'r1+dLeft',
  cruise: 'r1+dRight',
  deployBeacon: 'r1+view',
  jettisonLot: 'r1+home',
};

test('every keyboard flight verb with a code has a pad route', () => {
  const missing = [];
  for (const verb in INPUT_DEFAULTS.BINDINGS) {
    const codes = INPUT_DEFAULTS.BINDINGS[verb] || [];
    if (!codes.length) continue; // fire/autopursuit: no keyboard code, nothing to route
    const direct = (GAMEPAD_DEFAULT_BINDINGS[verb] || []).length > 0;
    const aliased = GAMEPAD_VERB_ALIASES[verb] != null;
    const axial = AXIS_VERBS.has(verb);
    if (!direct && !aliased && !axial) missing.push(verb);
  }
  assert.deepEqual(missing, [], 'every keyboard-coded verb must reach the pad');
  // The aliased verbs name real pad machinery, not a hand-wave.
  assert.equal(GAMEPAD_VERB_ALIASES.tether, 'massline');
  assert.equal(GAMEPAD_VERB_ALIASES.autoFire, 'autoTarget');
  assert.ok(GAMEPAD_DEFAULT_BINDINGS[GAMEPAD_VERB_ALIASES.tether].length > 0);
  assert.ok(GAMEPAD_DEFAULT_BINDINGS[GAMEPAD_VERB_ALIASES.autoFire].length > 0);
  assert.equal(GAMEPAD_VERB_ALIASES.reelIn, 'lineControl', 'winch-in rides the line-control axis');
  assert.equal(GAMEPAD_VERB_ALIASES.reelOut, 'lineControl');
});

test('the twelve new verbs sit on LB/RB chords and every bound name is well formed', () => {
  for (const [verb, expected] of Object.entries(CHORD_VERBS)) {
    assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS[verb], [expected], `${verb} default seat`);
    const parts = parseGamepadChord(expected);
    assert.ok(parts, `${expected} parses as a chord`);
    assert.ok(parts[0] === 'l1' || parts[0] === 'r1', 'the modifier is a bumper');
    assert.ok(parts[1] !== 'l1' && parts[1] !== 'r1', 'the key is not the modifier itself');
  }
  for (const action in GAMEPAD_DEFAULT_BINDINGS) {
    for (const name of GAMEPAD_DEFAULT_BINDINGS[action]) {
      assert.ok(isGamepadButtonName(name), `${action}: '${name}' must be a button or chord name`);
    }
    assert.ok(
      GAMEPAD_REBINDABLE.includes(action),
      `${action} must be rebindable under Settings → Controls`,
    );
  }
  // The stock solo verbs were NOT rebound — the chord layer is additive.
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.fire, ['r2']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.mine, ['l2']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.boost, ['r1']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.brake, ['l1']);
});

test('findGamepadBindConflict passes pairwise on the shipped table', () => {
  const map = resolveGamepadBindings(null);
  assert.equal(map, GAMEPAD_DEFAULT_BINDINGS, 'no settings resolves the frozen table');
  for (const action in map) {
    for (const name of map[action]) {
      const conflict = findGamepadBindConflict(map, action, name);
      assert.equal(conflict, null, `${action}:${name} conflicts with ${conflict}`);
    }
  }
});

test('chord labels name every button a player holds', () => {
  const map = GAMEPAD_DEFAULT_BINDINGS;
  assert.deepEqual(gamepadButtonLabels('scanPulse', map), ['LB + D-Pad Up']);
  assert.deepEqual(gamepadButtonLabels('scanPulse', map, { dual: true }), ['LB / L1 + D-Pad Up']);
  assert.deepEqual(gamepadButtonLabels('jettisonLot', map, { dual: true }), ['RB / R1 + Guide']);
});

// --- Live chord mechanics ----------------------------------------------------------

function makePad() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
  return {
    id: 'SpaceFace Synthetic Pad', index: 0, connected: true, mapping: 'standard', timestamp: 1,
    axes: [0, 0, 0, 0],
    buttons,
    vibrationActuator: { playEffect() { return Promise.resolve('complete'); }, reset() {} },
  };
}

function makeState() {
  return {
    tick: 1, mode: 'flight', playerId: 1,
    player: { tether: { active: false, load: 0 } },
    input: {},
    settings: { controls: { gamepad: { enabled: true, deadzone: 0.12 } }, accessibility: { haptics: 'full' } },
    entities: new Map([[1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }]]),
  };
}

const pad = makePad();
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => [pad] }, configurable: true,
});

const BTN = { l1: 4, r1: 5, dUp: 12, dDown: 13, dLeft: 14, dRight: 15, alt: 3, action: 2 };
const press = (i, down) => {
  pad.buttons[i] = { pressed: !!down, value: down ? 1 : 0, touched: !!down };
  pad.timestamp += 1;
};

test('a chord fires only its own verb; the key solo is suppressed for the hold', () => {
  const gp = createGamepad({ bus: createBus() });
  const state = makeState();
  gp.tick(1 / 60, state);
  assert.equal(gp.isConnected(), true);

  // Hold LB, tap D-pad up → the scanner ping fires; auto-target stays silent.
  press(BTN.l1, true);
  state.tick += 1; gp.tick(1 / 60, state);
  press(BTN.dUp, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.scanPulse.pressed, true, 'LB+D-pad up is the scanner ping edge');
  assert.equal(gp.actions.scanPulse.held, true);
  assert.equal(gp.actions.autoTarget.pressed, false, 'the chorded solo key is suppressed');
  assert.equal(gp.actions.autoTarget.held, false);
  assert.equal(gp.actions.brake.held, true, 'the modifier keeps its own verb (brake)');

  // Releasing the key ends the chord; while the modifier stays held a new key press is
  // another chord, never a leaked auto-target press.
  press(BTN.dUp, false);
  state.tick += 1; gp.tick(1 / 60, state);
  press(BTN.dUp, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.scanPulse.pressed, true, 'key edge under a held modifier re-chords');
  assert.equal(gp.actions.autoTarget.pressed, false);

  // Modifier up: the key solo re-arms and fires its own verb on the next press.
  press(BTN.l1, false); press(BTN.dUp, false);
  state.tick += 1; gp.tick(1 / 60, state);
  press(BTN.dUp, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.autoTarget.pressed, true, 'solo re-arms once the modifier is up');
  assert.equal(gp.actions.scanPulse.pressed, false, 'no modifier, no chord');
  press(BTN.dUp, false);
});

test('the RB combat-state layer chords independently of the LB layer', () => {
  const gp = createGamepad({ bus: createBus() });
  const state = makeState();
  gp.tick(1 / 60, state);
  press(BTN.r1, true);
  press(BTN.dDown, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.cloak.pressed, true, 'RB+D-pad down is the cloak edge');
  assert.equal(gp.actions.chargeDetonate.pressed, false, 'D-pad down solo stays suppressed');
  assert.equal(gp.actions.boost.held, true, 'boost rides the held modifier');
  press(BTN.r1, false); press(BTN.dDown, false);
});

test('remap capture resolves a held modifier + tapped key into a chord name', () => {
  const gp = createGamepad({ bus: createBus() });
  const state = makeState();
  gp.tick(1 / 60, state);
  gp.captureMode = true;
  press(BTN.l1, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.deepEqual(gp.drainButtonPresses(), [], 'a lone held modifier is still an open gesture');
  press(BTN.dLeft, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.deepEqual(gp.drainButtonPresses(), ['l1+dLeft'], 'the gesture commits as a chord name');
  press(BTN.l1, false); press(BTN.dLeft, false);
  state.tick += 1; gp.tick(1 / 60, state);
  gp.captureMode = false;
});

// --- Merge into state.input.actions -------------------------------------------------

function makeHost(gp) {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host.helpers = { raycastToPlane: () => ({ x: 0, z: 0 }) };
  host.bus = { emit() {} };
  host.gamepad = gp;
  host.touch = null;
  return host;
}

function flightState() {
  const state = createGameState(3003);
  state.mode = 'flight';
  state.playerId = 1;
  state.ui = { screenStack: [] };
  state.player = { id: 1, targetId: null, tether: { active: false, targetId: null, strain: 0, load: 0, restLength: 0, phase: 'slack' } };
  state.entities = new Map([[1, {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
  }]]);
  return state;
}

function nullActions() {
  const a = {};
  for (const verb of Object.keys(CHORD_VERBS)) {
    a[verb] = { held: false, pressed: false, released: false, value: 0 };
  }
  for (const verb of ['boost', 'brake', 'fire', 'mine', 'massline', 'countermeasure', 'autoTarget', 'deployRepulsor', 'dropBomb', 'cycleBomb', 'chargeDetonate', 'travelBurn']) {
    a[verb] = { held: false, pressed: false, released: false, value: 0 };
  }
  return a;
}

test('each new pad verb merges into state.input.actions like a stock pad verb', () => {
  const state = flightState();
  // A selected world-site proxy so the dedicated site-beam channel has a target.
  state.entities.set(9, {
    id: 9, type: 'worldSite', alive: true, pos: { x: 40, z: 0 },
    vel: { x: 0, z: 0 }, data: { worldSiteTargetable: true },
  });
  state.player.targetId = 9;

  const gp = {
    axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0, l2: 0, r2: 0 },
    actions: nullActions(),
    isConnected() { return true; },
    tick() {},
  };
  const host = makeHost(gp);

  const cases = [
    ['scanPulse', 'edge', 'scanPulse'],
    ['cruise', 'edge', 'cruise'],
    ['deployBeacon', 'edge', 'deployBeacon'],
    ['deployMassSeed', 'edge', 'deployMassSeed'],
    ['deployWell', 'edge', 'deployWell'],
    ['toggleClearingCone', 'edge', 'toggleClearingCone'],
    ['toggleSkimCollector', 'edge', 'toggleSkimCollector'],
    ['chargeThrow', 'edge', 'chargeThrow'],
    ['jettisonLot', 'edge', 'jettisonLot'],
    ['cloak', 'edge', 'cloakToggle'],
    ['bulletTime', 'held', 'bulletTime'],
    ['siteBeam', 'held', 'siteBeam'],
  ];
  for (const [verb, kind, act] of cases) {
    gp.actions = nullActions();
    gp.actions[verb] = { held: true, pressed: true, released: false, value: 1 };
    host.update(1 / 60, state);
    assert.equal(state.input.actions[act], true, `pad ${verb} → actions.${act}`);
    // Release: the act channel goes quiet on the next sample.
    gp.actions = nullActions();
    gp.actions[verb] = { held: false, pressed: false, released: true, value: 0 };
    host.update(1 / 60, state);
    assert.equal(state.input.actions[act], false, `pad ${verb} release clears actions.${act}`);
    state.tick += 1;
  }
});
