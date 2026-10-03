// FB-002 / FB-116 / FB-117 — the verb shelf: every bound verb is spoken exactly once,
// in the player's own device vocabulary, on the moment the verb matters. Covers the
// seven untaught bound verbs (travelBurn, chargeThrow, bulletTime, cloak, deployBeacon,
// toggleSkimCollector, jettisonLot): device labels, glyph sets, rebind liveness, touch
// neutrality, rail deferral, once-per-profile stamps, and the live contextual triggers.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { onboarding } from '../src/systems/onboarding.js';
import {
  SHELF_VERBS,
  SHELF_VERB_KEYS,
  SHELF_CHARGE_HOSTILE_WU,
  SHELF_NO_HOSTILE_WU,
  shelfHintKey,
  shelfVerbEnabled,
  verbBindingLabel,
  gamepadGlyphSetFor,
  governedCombatSpeed,
  shelfLongStraightActive,
  shelfHostileChargeReady,
} from '../src/onboarding/verbSpeech.js';
import { shelfVerbLine, SHELF_VERB_LINES } from '../src/ui/hudAttention.js';
import {
  resolveGamepadBindings,
  gamepadButtonLabels,
  GAMEPAD_DEFAULT_BINDINGS,
} from '../src/systems/gamepad.js';

// ── DOM stubs (same shape as missing-three.test.mjs) ────────────────────────────
function stubElement() {
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    getAttribute: () => null,
    appendChild() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
}
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  head: stubElement(),
  body: stubElement(),
  documentElement: null,
  createElement: () => stubElement(),
};

// ── Harness ────────────────────────────────────────────────────────────────────
function makeState() {
  const player = makeEntity({
    type: 'ship',
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: {
      weapons: [],
      combat: {},
      ai: {},
      derived: { propulsion: { combatSpeed: 100, maxSpeed: 140 } },
    },
  });
  player.id = 1;
  return {
    meta: { seed: 7 },
    simTime: 10,
    tick: 0,
    mode: 'flight',
    settings: { gameplay: { tutorialHints: true }, controls: {} },
    runtime: { features: {
      massline2: { enabled: true, bulletTime: true, cloak: true },
      travel: { travelBurn: true },
    } },
    playerId: 1,
    player: {
      hints: {},
      targetId: null,
      cargo: { items: {}, capacity: 50 },
      ownedShips: [{ hullId: 'hull', fittings: [null, null, null] }],
      activeShipIndex: 0,
    },
    entities: new Map([[1, player]]),
    entityList: [player],
    nextEntityId: 10,
    nav: {},
    combat: { attachments: { byId: {} } },
    input: {
      boost: false,
      autoTargetPath: { active: false, drawing: false, points: [] },
    },
    world: { activeSector: { stations: [], gates: [] } },
    story: { beatIndex: 0 },
  };
}

function boot() {
  const bus = createBus();
  const state = makeState();
  const sys = Object.create(onboarding);
  const firstUse = [];
  bus.on('hud:firstUse', (p) => firstUse.push(p));
  sys.init({
    state,
    bus,
    helpers: {
      spawnEntity(spec) {
        const e = makeEntity(spec);
        e.id = state.nextEntityId++;
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    },
    registry: null,
  });
  return { bus, state, sys, firstUse };
}

function addHostile(state, x, z, targetPlayer = true) {
  const e = makeEntity({
    type: 'ship',
    team: 3,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: { ai: {}, combat: targetPlayer ? { targetId: 1 } : {} },
  });
  e.id = state.nextEntityId++;
  state.entities.set(e.id, e);
  state.entityList.push(e);
  return e;
}

// ── Roster & copy ──────────────────────────────────────────────────────────────
test('shelf roster: seven bound verbs, unique keys and actions, each with a trigger', () => {
  assert.equal(SHELF_VERBS.length, 7);
  assert.equal(SHELF_VERB_KEYS.length, 7);
  const keys = new Set();
  const actions = new Set();
  for (const v of SHELF_VERBS) {
    assert.ok(v.key && !keys.has(v.key), `unique key: ${v.key}`);
    assert.ok(v.action && !actions.has(v.action), `unique action: ${v.action}`);
    assert.ok(typeof v.trigger === 'string' && v.trigger.length > 0, `trigger: ${v.key}`);
    assert.ok(SHELF_VERB_LINES[v.key], `copy line exists for ${v.key}`);
    keys.add(v.key); actions.add(v.action);
  }
});

test('line copy: ≤12 words, binding appended only when a label exists', () => {
  for (const v of SHELF_VERBS) {
    const words = SHELF_VERB_LINES[v.key].trim().split(/\s+/).length;
    assert.ok(words <= 12, `${v.key} line ${words} words exceeds drill budget`);
  }
  assert.equal(shelfVerbLine('travelBurn', 'L3'), 'The burn keeps the speed — L3.');
  assert.equal(shelfVerbLine('travelBurn', ''), 'The burn keeps the speed.');
  assert.equal(shelfVerbLine('nonexistent', 'X'), '');
});

// ── Device vocabulary ──────────────────────────────────────────────────────────
test('keyboard: the spoken label is the live binding, and a rebind re-labels it', () => {
  const state = makeState();
  const before = verbBindingLabel(state, 'travelBurn', 'kbm');
  assert.equal(before, 'Num Lock/H'); // NumLock + KeyH defaults
  assert.equal(verbBindingLabel(state, 'deployBeacon', 'kbm'), 'U');
  assert.equal(verbBindingLabel(state, 'jettisonLot', 'kbm'), '.');
  state.settings.controls.bindings = { travelBurn: ['KeyG'] };
  assert.equal(verbBindingLabel(state, 'travelBurn', 'kbm'), 'G', 'rebind must relabel the line');
});

test('gamepad: chords print button names, verb aliases reach their pad route', () => {
  const state = makeState();
  assert.equal(verbBindingLabel(state, 'deployBeacon', 'gamepad'), 'RB + View');
  assert.equal(verbBindingLabel(state, 'jettisonLot', 'gamepad'), 'RB + Home');
  assert.equal(verbBindingLabel(state, 'travelBurn', 'gamepad'), 'L3');
  assert.equal(verbBindingLabel(state, 'chargeThrow', 'gamepad'), 'RB + D-Pad Left');
  // Alias: the rope verb rides the Massline button (accept → A), never a blank.
  assert.equal(verbBindingLabel(state, 'tether', 'gamepad'), 'A');
});

test('glyph sets: face buttons spell xb / ds / fh, shoulders are stable', () => {
  const state = makeState();
  assert.equal(gamepadGlyphSetFor(state), 'xb', 'unset defaults to xb');
  // toggleSkimCollector = l1+alt: LB + <face alt>
  assert.equal(verbBindingLabel(state, 'toggleSkimCollector', 'gamepad'), 'LB + Y');
  state.settings.controls.gamepad = { glyphSet: 'ds' };
  assert.equal(verbBindingLabel(state, 'toggleSkimCollector', 'gamepad'), 'LB + △');
  assert.equal(verbBindingLabel(state, 'tether', 'gamepad'), '✕');
  state.settings.controls.gamepad.glyphSet = 'fh';
  assert.equal(verbBindingLabel(state, 'toggleSkimCollector', 'gamepad'), 'LB + Ⓨ');
  assert.equal(verbBindingLabel(state, 'tether', 'gamepad'), 'Ⓐ');
  state.settings.controls.gamepad.glyphSet = 'nonsense';
  assert.equal(gamepadGlyphSetFor(state), 'xb', 'unknown set falls back to xb');
  // A remapped pad binding is honored: every solo button is already claimed in the stock map,
  // so the remap uses the genuinely free chord l1+view and the line names the new chord.
  state.settings.controls.gamepad = {
    glyphSet: 'xb',
    bindings: { toggleSkimCollector: ['l1+view'] },
  };
  assert.equal(verbBindingLabel(state, 'toggleSkimCollector', 'gamepad'), 'LB + View');
});

test('touch: no key or pad label is claimed for a button the overlay does not have', () => {
  const state = makeState();
  for (const v of SHELF_VERBS) {
    assert.equal(verbBindingLabel(state, v.action, 'touch'), '', `${v.key} must be label-less on touch`);
  }
});

// ── Trigger predicates ─────────────────────────────────────────────────────────
test('governedCombatSpeed reads the live derived stats', () => {
  const state = makeState();
  assert.equal(governedCombatSpeed(state), 100);
  state.entities.get(1).data.derived.propulsion.combatSpeed = 0;
  assert.equal(governedCombatSpeed(state), 140, 'falls back to maxSpeed');
});

test('long-straight predicate: above-cap speed, in flight, no hostile in the quiet radius', () => {
  const state = makeState();
  const player = state.entities.get(1);
  const noHostile = () => false;
  player.vel = { x: 0, z: 0 };
  assert.equal(shelfLongStraightActive(state, noHostile), false, 'parked hull is not a long straight');
  player.vel = { x: 150, z: 0 }; // 150 > 100 * 1.02
  assert.equal(shelfLongStraightActive(state, noHostile), true);
  // A hostile inside SHELF_NO_HOSTILE_WU suppresses the lesson.
  const hostileNear = () => true;
  addHostile(state, SHELF_NO_HOSTILE_WU - 10, 0);
  assert.equal(shelfLongStraightActive(state, hostileNear), false, 'hunted hull is not cruising');
  state.mode = 'dock';
  assert.equal(shelfLongStraightActive(state, noHostile), false, 'not flight');
  state.mode = 'flight';
  // An engaged travel drive has nothing to teach.
  state.input.travelDrive = { state: 'engaged' };
  assert.equal(shelfLongStraightActive(state, noHostile), false, 'drive already engaged');
});

test('hostile-charge predicate: hostile inside 300 WU while a charge is racked', () => {
  const state = makeState();
  const hostile = (e) => e.team === 3;
  assert.equal(shelfHostileChargeReady(state, hostile), false, 'no charge racked');
  state.player.cargo.items.cmdty_impulse_charge = 2;
  assert.equal(shelfHostileChargeReady(state, hostile), false, 'no hostile near');
  addHostile(state, SHELF_CHARGE_HOSTILE_WU - 1, 0);
  assert.equal(shelfHostileChargeReady(state, hostile), true);
  state.player.cargo.items.cmdty_impulse_charge = 0;
  assert.equal(shelfHostileChargeReady(state, hostile), false, 'charge spent');
});

// ── Exactly-once speech through the real system ───────────────────────────────
test('beacon/collector/jettison receipts each speak their verb exactly once', () => {
  const h = boot();
  h.bus.emit('beacon:deployed', { x: 1, z: 2 });
  assert.equal(h.firstUse.length, 1);
  assert.equal(h.firstUse[0].verbId, 'shelf:deployBeacon');
  assert.equal(h.firstUse[0].text, 'The beacon marks the spot — U.');
  h.bus.emit('beacon:deployed', { x: 3, z: 4 });
  assert.equal(h.firstUse.length, 1, 'second deploy must not re-speak');
  assert.equal(h.state.player.hints[shelfHintKey('deployBeacon')], true);

  h.bus.emit('planet:collector', { on: false });
  assert.equal(h.firstUse.length, 1, 'closing the scoop is not the lesson');
  h.bus.emit('planet:collector', { on: true });
  assert.equal(h.firstUse.length, 2);
  assert.equal(h.firstUse[1].verbId, 'shelf:toggleSkimCollector');
  assert.equal(h.firstUse[1].text, 'The scoop harvests a band — 8.');

  h.bus.emit('cargo:jettisoned', { count: 3 });
  assert.equal(h.firstUse.length, 3);
  assert.equal(h.firstUse[2].verbId, 'shelf:jettisonLot');
  h.bus.emit('cargo:jettisoned', { count: 1 });
  assert.equal(h.firstUse.length, 3, 'jettison is once-per-profile');
});

test('module:equipped on the player ship speaks bulletTime; a shroud fit speaks cloak', () => {
  const h = boot();
  h.bus.emit('module:equipped', { shipId: 1, defId: 'mod_massline_spool_l' });
  assert.equal(h.firstUse.length, 1);
  assert.equal(h.firstUse[0].verbId, 'shelf:bulletTime');
  assert.equal(h.firstUse[0].text, 'The clock widens — Caps Lock.');
  // A fit that grants a shroud speaks cloak; the foreign ship's fit does neither.
  h.bus.emit('module:equipped', { shipId: 999, defId: 'mod_cloak_mk1' });
  assert.equal(h.firstUse.length, 1, 'a foreign ship fit teaches the player nothing');
  h.state.player.ownedShips[0].fittings = ['mod_cloak_mk1'];
  h.bus.emit('module:equipped', { shipId: 1, defId: 'mod_cloak_mk1' });
  assert.equal(h.firstUse.length, 2);
  assert.equal(h.firstUse[1].verbId, 'shelf:cloak');
  assert.equal(h.firstUse[1].text, 'The shroud is fitted — `.');
});

test('feature-flag-gated verbs stay silent while their feature is off', () => {
  const h = boot();
  h.state.runtime.features = { massline2: { enabled: false }, travel: { travelBurn: false } };
  assert.equal(shelfVerbEnabled(SHELF_VERBS.find((v) => v.key === 'bulletTime'), h.state), false);
  h.bus.emit('module:equipped', { shipId: 1, defId: 'mod_massline_spool_l' });
  h.bus.emit('beacon:deployed', {});
  const spoke = h.firstUse.map((p) => p.verbId);
  assert.ok(!spoke.includes('shelf:bulletTime'), 'flag-off verb must not speak');
  assert.ok(spoke.includes('shelf:deployBeacon'), 'ungated verbs still speak');
});

test('a trigger landing while the rail owns the voice parks, then speaks — never lost', () => {
  const h = boot();
  h.state.onboarding = { active: true, finished: false, beatDoneAt: {}, tutorialLog: [] };
  h.bus.emit('beacon:deployed', {});
  assert.equal(h.firstUse.length, 0, 'rail owns the voice — the moment must wait');
  assert.ok(h.sys._shelfPending && h.sys._shelfPending.has('deployBeacon'), 'moment is parked');
  h.state.onboarding.finished = true;
  h.sys._tickShelfVerbs(0.25, h.state);
  assert.equal(h.firstUse.length, 1, 'parked line lands on the first free cadence');
  assert.equal(h.firstUse[0].verbId, 'shelf:deployBeacon');
  assert.equal(h.state.player.hints[shelfHintKey('deployBeacon')], true);
});

test('chargeThrow speaks on the cadence tick when a hostile closes on a racked charge', () => {
  const h = boot();
  h.state.player.cargo.items.cmdty_impulse_charge = 1;
  h.sys._tickShelfVerbs(0.25, h.state);
  assert.equal(h.firstUse.length, 0, 'no hostile — nothing to teach');
  addHostile(h.state, 200, 0);
  h.sys._tickShelfVerbs(0.25, h.state);
  assert.equal(h.firstUse.length, 1);
  assert.equal(h.firstUse[0].verbId, 'shelf:chargeThrow');
  assert.equal(h.firstUse[0].text, 'A charge is racked — Y/1.');
  h.sys._tickShelfVerbs(0.25, h.state);
  assert.equal(h.firstUse.length, 1, 'once only');
});

test('travelBurn speaks after ~3 s above the governed cap with nobody hunting', () => {
  const h = boot();
  const player = h.state.entities.get(1);
  player.vel = { x: 150, z: 0 };
  for (let i = 0; i < 11; i++) h.sys._tickShelfVerbs(0.25, h.state); // 2.75 s — under the bar
  assert.equal(h.firstUse.length, 0, 'a short burst is not a long straight');
  h.sys._tickShelfVerbs(0.25, h.state); // 3.0 s
  assert.equal(h.firstUse.length, 1);
  assert.equal(h.firstUse[0].verbId, 'shelf:travelBurn');
  assert.equal(h.firstUse[0].text, 'The burn keeps the speed — Num Lock/H.');
  // The timer resets when speed drops below the governed cap.
  const h2 = boot();
  const p2 = h2.state.entities.get(1);
  p2.vel = { x: 150, z: 0 };
  for (let i = 0; i < 11; i++) h2.sys._tickShelfVerbs(0.25, h2.state);
  p2.vel = { x: 50, z: 0 };
  h2.sys._tickShelfVerbs(0.25, h2.state);
  p2.vel = { x: 150, z: 0 };
  for (let i = 0; i < 11; i++) h2.sys._tickShelfVerbs(0.25, h2.state);
  assert.equal(h2.firstUse.length, 0, 'the timer does not carry across a slowdown');
});

test('the cadence tick runs inside update() only after onboarding begins', () => {
  const h = boot();
  // No state.onboarding: update must not tick shelf verbs (nor crash).
  h.state.player.cargo.items.cmdty_impulse_charge = 1;
  addHostile(h.state, 100, 0);
  h.sys.update(0.25, h.state);
  assert.equal(h.firstUse.length, 0, 'shelf cadence waits for onboarding state to exist');
  h.state.onboarding = { active: false, finished: true, beatDoneAt: {}, tutorialLog: [] };
  h.sys.update(0.25, h.state);
  assert.equal(h.firstUse.length, 1, 'finished rail still ticks contextual shelf verbs');
  assert.equal(h.firstUse[0].verbId, 'shelf:chargeThrow');
});
