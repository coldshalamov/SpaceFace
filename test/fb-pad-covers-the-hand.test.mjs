// FB-003 / CONTROLLER-1 — the pad covers the whole hand.
//
// Packet done-when: every id in VERB_BINDINGS that has a keyboard code has a pad route —
// a dedicated seat, a named alias, a stick axis, or a slice on the held-D-pad-down wheel;
// the default chord table passes findGamepadBindConflict; pq-164-01 glyphs/remap and the
// input lifecycle suites stay green. This file proves the route table itself, the chord
// mechanics (key edges while its modifier is held; the chorded solo is suppressed for the
// hold; the modifier's own verb keeps working), gesture capture committing a 'mod+key'
// name, and the merge of the flight verbs into state.input.actions.
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
import { heldPower } from '../src/systems/powerVerbs.js';
import { GAMEPAD_REBINDABLE } from '../src/ui/screens/settings.js';
import { createBus } from '../src/core/eventBus.js';
import { contextWheelSlices } from '../src/ui/contextWheel.js';

// --- Pad route table ---------------------------------------------------------------
// The keyboard verb set is the union DEFAULT_BINDINGS table minus the mouse-only and
// retired slots. A verb has a pad route when it owns a default binding, when a named
// alias owns it (the rope verb rides the Massline button; the winch rides the line-control
// axis; draw-to-fly rides the auto-target toggle), when a stick axis IS the verb, or when
// the context wheel carries its slice — the held-D-pad-down wheel IS the pad route for
// overflow verbs, exactly like Q on the keyboard.
const AXIS_VERBS = new Set(['forward', 'reverse', 'yawLeft', 'yawRight', 'strafeLeft', 'strafeRight']);

// CONTROLLER-1: LB is the shift bumper — hold it and the face/view buttons take their
// second seat. The fight powers sit solo under the right thumb (A shove, Y pull, B bomb);
// the anchor and the plow ride the layer, never a radial. The Gyre Snare keeps its shipped
// RB+Y lash — a hold-to-beam verb needs a real button's two edges.
const CHORD_VERBS = {
  pin: 'l1+action',
  rig: 'l1+alt',
  countermeasure: 'l1+accept',
  scanPulse: 'l1+cancel',
  steeringView: 'l1+view',
  gyreSnare: 'r1+alt',
};

// Wheel slices whose action id differs from the keyboard verb they route: the mining
// beam's keyboard verb is 'mine', its wheel slice is the aimed beam.
const WHEEL_ROUTE_ALIASES = { mine: 'aimedMine' };

test('every keyboard flight verb with a code has a pad route', () => {
  const state = createGameState(7);
  state.mode = 'flight';
  const wheelActions = new Set(contextWheelSlices(state).map((s) => s.action));
  const missing = [];
  for (const verb in INPUT_DEFAULTS.BINDINGS) {
    const codes = INPUT_DEFAULTS.BINDINGS[verb] || [];
    if (!codes.length) continue; // fire/autopursuit: no keyboard code, nothing to route
    const direct = (GAMEPAD_DEFAULT_BINDINGS[verb] || []).length > 0;
    const aliased = GAMEPAD_VERB_ALIASES[verb] != null;
    const axial = AXIS_VERBS.has(verb);
    const wheelSlice = WHEEL_ROUTE_ALIASES[verb] || verb;
    const wheeled = wheelActions.has(wheelSlice);
    if (!direct && !aliased && !axial && !wheeled) missing.push(verb);
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

test('the chord verbs sit on the LB shift layer and every bound name is well formed', () => {
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
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.massline, ['l2']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.boost, ['r1']);
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.brake, ['l3']);
  // The modifier's own seat is the station-tab verb — inert in flight, so LB shifts freely.
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.tabPrev, ['l1']);
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
  assert.deepEqual(gamepadButtonLabels('pin', map), ['LB + X']);
  assert.deepEqual(gamepadButtonLabels('scanPulse', map, { dual: true }), ['LB / L1 + B / ○']);
  assert.deepEqual(gamepadButtonLabels('rig', map, { dual: true }), ['LB / L1 + Y / △']);
  assert.deepEqual(gamepadButtonLabels('countermeasure', map), ['LB + A']);
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

const BTN = { l1: 4, r1: 5, dUp: 12, dDown: 13, dLeft: 14, dRight: 15, alt: 3, action: 2, accept: 0, cancel: 1, view: 8 };
const press = (i, down) => {
  pad.buttons[i] = { pressed: !!down, value: down ? 1 : 0, touched: !!down };
  pad.timestamp += 1;
};

test('a chord fires only its own verb; the key solo is suppressed for the hold', () => {
  const gp = createGamepad({ bus: createBus() });
  const state = makeState();
  gp.tick(1 / 60, state);
  assert.equal(gp.isConnected(), true);

  // Hold LB, tap X → the anchor seed fires; dock stays silent.
  press(BTN.l1, true);
  state.tick += 1; gp.tick(1 / 60, state);
  press(BTN.action, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.pin.pressed, true, 'LB+X is the anchor edge');
  assert.equal(gp.actions.pin.held, true);
  assert.equal(gp.actions.dock.pressed, false, 'the chorded X solo is suppressed');
  assert.equal(gp.actions.dock.held, false);
  assert.equal(gp.actions.tabPrev.held, true, 'the modifier keeps its own verb (tabPrev)');

  // Releasing the key ends the chord; while the modifier stays held a new key press is
  // another chord, never a leaked dock press.
  press(BTN.action, false);
  state.tick += 1; gp.tick(1 / 60, state);
  press(BTN.action, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.pin.pressed, true, 'key edge under a held modifier re-chords');
  assert.equal(gp.actions.dock.pressed, false);

  // Modifier up: the key solo re-arms and fires its own verb on the next press.
  press(BTN.l1, false); press(BTN.action, false);
  state.tick += 1; gp.tick(1 / 60, state);
  press(BTN.action, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.dock.pressed, true, 'solo re-arms once the modifier is up');
  assert.equal(gp.actions.pin.pressed, false, 'no modifier, no chord');
  press(BTN.action, false);
});

test('the LB+Y chord holds the rig preview: rig.held rides l1+alt, alt solo suppressed', () => {
  const gp = createGamepad({ bus: createBus() });
  const state = makeState();
  gp.tick(1 / 60, state);
  // LB down, Y down — the chorded verb reports held, the key's solo stays silent.
  press(BTN.l1, true);
  state.tick += 1; gp.tick(1 / 60, state);
  press(BTN.alt, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.rig.held, true, 'LB+Y reports the plow held');
  assert.equal(gp.actions.rig.pressed, true);
  assert.equal(gp.actions.pull.pressed, false, 'the chorded Y solo is suppressed');
  assert.equal(gp.actions.tabPrev.held, true, 'the modifier keeps its own verb (tabPrev)');
  // The hold persists across ticks — input.js reads gp.actions.rig.held
  // every frame for its held-through-modal preserve.
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.rig.held, true, 'the chorded hold rides on');
  // Key up ends the hold without leaking a pull press; modifier solo re-arms.
  press(BTN.alt, false);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.rig.held, false, 'Y up drops the plow');
  assert.equal(gp.actions.pull.pressed, false, 'no leaked solo on release');
  press(BTN.l1, false);
  state.tick += 1; gp.tick(1 / 60, state);
});

test('the LB shift layer chords independently of the solo verbs', () => {
  const gp = createGamepad({ bus: createBus() });
  const state = makeState();
  gp.tick(1 / 60, state);
  press(BTN.l1, true);
  press(BTN.accept, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.countermeasure.pressed, true, 'LB+A is the flare edge');
  assert.equal(gp.actions.shove.pressed, false, 'A solo (SHOVE) stays suppressed');
  assert.equal(gp.actions.accept.pressed, false, 'and so does the accept half of the share');
  assert.equal(gp.actions.tabPrev.held, true, 'tabPrev rides the held modifier');
  press(BTN.l1, false); press(BTN.accept, false);
});

test('LB+Y holds the plow grip — the chord edges both ways', () => {
  const gp = createGamepad({ bus: createBus() });
  const state = makeState();
  gp.tick(1 / 60, state);
  press(BTN.l1, true);
  state.tick += 1; gp.tick(1 / 60, state);
  press(BTN.alt, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.rig.pressed, true, 'LB+Y is the plow edge');
  assert.equal(gp.actions.rig.held, true, 'the chord holds the preview open');
  assert.equal(gp.actions.tabPrev.held, true, 'LB keeps its own verb while chorded');
  press(BTN.alt, false);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.rig.released, true, 'releasing Y ends the grip');
  assert.equal(gp.actions.rig.held, false);
  press(BTN.l1, false);
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
  // The grip-preview cases below exercise 'Aim first': press grips, release fires.
  state.settings.gameplay.powerFire = 'aim';
  state.player = { id: 1, targetId: null, tether: { active: false, targetId: null, strain: 0, load: 0, restLength: 0, phase: 'slack' } };
  state.entities = new Map([[1, {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
  }]]);
  return state;
}

function nullActions() {
  const a = {};
  for (const verb of new Set([...Object.keys(CHORD_VERBS),
    'boost', 'brake', 'fire', 'mine', 'cargo', 'massline', 'autoTarget', 'shove', 'bomb', 'cycleBomb',
    'travelBurn', 'pull', 'rig', 'scanPulse', 'cruise', 'deployBeacon', 'jettisonLot', 'cloak',
    'bulletTime', 'siteBeam', 'gyreSnare', 'dock', 'countermeasure'])) {
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
    // 'Aim first' (powerFire:'aim' set in flightState): the aimed powers — PULL, PIN, BOMB —
    // grip on the press (the held-key preview draws) and fire on the release; SHOVE stays a
    // pulse and RIG stays a toggle, so both land on the press like any other edge.
    ['pin', 'power', 'deployMassSeed'],
    ['pull', 'power', 'deployWell'],
    ['bomb', 'power', 'dropBomb'],
    ['rig', 'edge', 'toggleClearingCone'],
    ['shove', 'edge', 'deployRepulsor'],
    ['jettisonLot', 'edge', 'jettisonLot'],
    ['cloak', 'edge', 'cloakToggle'],
    ['bulletTime', 'held', 'bulletTime'],
    ['siteBeam', 'held', 'siteBeam'],
    ['gyreSnare', 'held', 'gyreSnare'],
  ];
  for (const [verb, kind, act] of cases) {
    gp.actions = nullActions();
    gp.actions[verb] = { held: true, pressed: true, released: false, value: 1 };
    host.update(1 / 60, state);
    if (kind === 'power') {
      assert.equal(state.input.actions[act], false, `pad ${verb} press grips; it does not fire yet`);
      assert.equal(heldPower(state), verb, `pad ${verb} press publishes the held power for the preview`);
      gp.actions = nullActions();
      gp.actions[verb] = { held: false, pressed: false, released: true, value: 0 };
      host.update(1 / 60, state);
      assert.equal(state.input.actions[act], true, `pad ${verb} release → actions.${act}`);
      assert.equal(heldPower(state), null, `pad ${verb} release ends the preview`);
      gp.actions = nullActions();
      host.update(1 / 60, state);
      assert.equal(state.input.actions[act], false, `pad ${verb} fires once`);
      state.tick += 1;
      continue;
    }
    assert.equal(state.input.actions[act], true, `pad ${verb} → actions.${act}`);
    // Release: the act channel goes quiet on the next sample.
    gp.actions = nullActions();
    gp.actions[verb] = { held: false, pressed: false, released: true, value: 0 };
    host.update(1 / 60, state);
    assert.equal(state.input.actions[act], false, `pad ${verb} release clears actions.${act}`);
    state.tick += 1;
  }
});

test('the Gyre Snare lash rides the RB+Y chord and gyre events pulse the pad', () => {
  const bus = createBus();
  const gp = createGamepad({ bus });
  const state = makeState();
  gp.tick(1 / 60, state);
  assert.equal(gp.isConnected(), true);

  // Hold RB (its solo verb is boost — it stays live under the chord), tap Y: the lash
  // holds while Y's own verb (PULL) stays suppressed for the hold.
  press(BTN.r1, true);
  state.tick += 1; gp.tick(1 / 60, state);
  press(BTN.alt, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.gyreSnare.held, true, 'RB+Y holds the lash');
  assert.equal(gp.actions.pull.held, false, 'the chorded Y solo stays silent');
  assert.equal(gp.actions.boost.held, true, 'the modifier keeps boost');

  press(BTN.alt, false); press(BTN.r1, false);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.gyreSnare.held, false, 'releasing Y sets the lash down');

  // Key-first order stays the solo verbs: Y down BEFORE RB is the well, not the
  // lash — the chord only binds when the modifier (RB) leads.
  press(BTN.alt, true);
  state.tick += 1; gp.tick(1 / 60, state);
  press(BTN.r1, true);
  state.tick += 1; gp.tick(1 / 60, state);
  assert.equal(gp.actions.gyreSnare.held, false, 'Y-first never forms the lash chord');
  assert.equal(gp.actions.pull.held, true, 'the Y-first press stays the well (PULL)');
  press(BTN.alt, false); press(BTN.r1, false);
  state.tick += 1; gp.tick(1 / 60, state);

  // Gyre events pulse the pad's haptic frame: a queued pulse sets the frame's
  // magnitude to the spec value on the next tick (idle baseline stays near 0).
  const drain = (n = 15) => { for (let i = 0; i < n; i++) { state.tick += 1; gp.tick(1 / 60, state); } };
  drain();
  assert.ok(gp.haptics.strong < 0.4, `idle baseline is quiet (strong=${gp.haptics.strong})`);
  const pulseAt = (ev, want, payload) => {
    bus.emit(ev, payload || { coreId: 9 });
    state.tick += 1; gp.tick(1 / 60, state);
    assert.ok(gp.haptics.strong >= want, `${ev} pulses strong>=${want} (got ${gp.haptics.strong})`);
    drain();
  };
  pulseAt('gyre:snagged', 0.70);
  pulseAt('gyre:full', 0.65);
  // The throw crack mass-lerps: a capped moon lands the authored 0.90, a bare
  // payload reads as a pebble (0.55) — grading pinned in fb-haptic-verbs.
  pulseAt('gyre:thrown', 0.90, { coreId: 9, mass: 2400 });
  pulseAt('gyre:absorbTick', 0.30);

  // Meal size lerps the absorb thump: mass 160 → t=1 → strong 0.30 + 0.25·1 = 0.55 —
  // a wreck in the mouth lands near the drop thud, a pebble stays a flick.
  bus.emit('gyre:absorbTick', { coreId: 9, mass: 160 });
  state.tick += 1; gp.tick(1 / 60, state);
  assert.ok(gp.haptics.strong >= 0.55,
    `heavy absorbTick scales the thump (strong=${gp.haptics.strong})`);
  drain();

  // A boundary-flagged drop is a context reset, not a player verb — the pad stays silent.
  bus.emit('gyre:dropped', { boundary: true });
  state.tick += 1; gp.tick(1 / 60, state);
  assert.ok(gp.haptics.strong < 0.45, `boundary drop does not pulse (strong=${gp.haptics.strong})`);
  // An empty beam closing is the soft flick (droppedEmpty 0.20), not the clump thud (0.45).
  bus.emit('gyre:dropped', {});
  state.tick += 1; gp.tick(1 / 60, state);
  assert.ok(gp.haptics.strong >= 0.18 && gp.haptics.strong < 0.4,
    `empty beam close gets the soft flick (strong=${gp.haptics.strong})`);
  drain();
  // A launch-phase drop carries coreId: null — the ball already flew, nothing tore —
  // so it lands the same soft flick, not the clump thud (the emitId contract, end-to-end).
  bus.emit('gyre:dropped', { coreId: null });
  state.tick += 1; gp.tick(1 / 60, state);
  assert.ok(gp.haptics.strong >= 0.18 && gp.haptics.strong < 0.4,
    `launch-phase drop keeps the soft flick (strong=${gp.haptics.strong})`);
  drain();
  // The quiet flag (docking, mode flips, player loss) silences like a boundary —
  // context resets don't pulse even when a reason string rides along.
  bus.emit('gyre:dropped', { coreId: 9, quiet: true, reason: 'player_lost' });
  state.tick += 1; gp.tick(1 / 60, state);
  assert.ok(gp.haptics.strong < 0.45, `quiet drop does not pulse (strong=${gp.haptics.strong})`);
  drain();
  // But 'strained' wins over the null coreId — a tear is never an empty drop.
  bus.emit('gyre:dropped', { coreId: null, reason: 'strained' });
  state.tick += 1; gp.tick(1 / 60, state);
  assert.ok(gp.haptics.strong >= 0.55, `a tear beats the empty key (strong=${gp.haptics.strong})`);
  drain();
  // A clump TORN off the lash (reason 'strained') is the verb's biggest loss beat —
  // heavier than a released drop (0.45), short of the throw crack (0.90).
  bus.emit('gyre:dropped', { coreId: 9, reason: 'strained' });
  state.tick += 1; gp.tick(1 / 60, state);
  assert.ok(gp.haptics.strong >= 0.65,
    `strain break lands the tear pulse (strong=${gp.haptics.strong})`);
  drain();
  pulseAt('gyre:dropped', 0.45);
});

test('the Gyre Snare pad tables are pinned — the lash never silently unbinds', () => {
  // The three load-bearing pad entries for the verb: the RB+Y chord (below), the
  // lifecycle quarantine (deep-pinned in input-lifecycle.test.mjs ~:233 — a dropped
  // entry fails that literal), and the hold-to-toggle whitelist (deep-pinned in
  // fb-hold-to-toggle.test.mjs :88). This asserts the public binding surface so a
  // table edit can't silently regress pad play.
  assert.deepEqual([...GAMEPAD_DEFAULT_BINDINGS.gyreSnare], ['r1+alt'],
    'the lash holds RB+Y under the boost hand');
});
