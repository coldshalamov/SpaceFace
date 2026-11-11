import test from 'node:test';
import assert from 'node:assert/strict';

// G18-02 "one set of keys" — WASD + mouse in both doors, Space boost, 1–5 powers,
// RMB the Line, Q the one context wheel (hold-Y on a pad), overflow verbs unbound but
// rebindable, untouched profiles migrated once, custom maps preserved.

import { createSimulation } from '../src/core/sim.js';
import { domKeyEvent, input, resolveActionCodes, resolveActionLabel } from '../src/systems/input.js';
import { createSwarmCallinsDirector } from '../src/systems/swarmCallins.js';
import {
  contextActionAllowed,
  contextHelpRows,
  inputContextFor,
} from '../src/data/inputContexts.js';
import {
  SWARM_DEFAULT_BINDINGS,
  SWARM_HELP_ROWS,
  isSwarmControls,
} from '../src/data/swarmControls.js';
import {
  GAMEPAD_DEFAULT_BINDINGS,
  resolveGamepadBindings,
} from '../src/systems/gamepad.js';
import {
  migrateOneSetOfKeysProfile,
  ONE_SET_OF_KEYS_VERSION,
} from '../src/core/graphicsProfileBootstrap.js';
import { REBINDABLE, GAMEPAD_REBINDABLE } from '../src/ui/screens/settings.js';
import { contextWheelSlices } from '../src/ui/contextWheel.js';
import { createGameState } from '../src/core/gameState.js';

const WHEEL_ACTIONS = [
  'brake', 'aimedMine', 'siteBeam', 'reelIn', 'reelOut', 'strafeLeft', 'strafeRight',
  'bulletTime', 'gyreSnare', 'cloak', 'countermeasure', 'scanPulse', 'cycleBomb',
  'autoFire', 'travelBurn', 'cruise', 'jettisonLot', 'deployBeacon', 'deployShieldPylon',
];

function flightState() {
  return createGameState(7);
}

function swarmState() {
  const s = flightState();
  s.run = { kind: 'survival', phase: 'active', ruleset: 'swarm' };
  return s;
}

function inputFor() {
  const sim = createSimulation({ seed: 11, systems: [input] });
  sim.state.mode = 'flight';
  sim.step();
  return { sim, keys: sim.registry.get('input') };
}

// ── the one table ─────────────────────────────────────────────────────────────

test('G18-02: the six-input table is the Adventure default', () => {
  const st = flightState();
  assert.deepEqual(resolveActionCodes(st, 'forward'), ['KeyW', 'ArrowUp']);
  assert.deepEqual(resolveActionCodes(st, 'reverse'), ['KeyS', 'ArrowDown']);
  assert.deepEqual(resolveActionCodes(st, 'yawLeft'), ['KeyA', 'ArrowLeft']);
  assert.deepEqual(resolveActionCodes(st, 'yawRight'), ['KeyD', 'ArrowRight']);
  assert.deepEqual(resolveActionCodes(st, 'boost'), ['Space']);
  assert.deepEqual(resolveActionCodes(st, 'contextWheel'), ['KeyQ']);
  assert.deepEqual(resolveActionCodes(st, 'pull'), ['Digit1']);
  assert.deepEqual(resolveActionCodes(st, 'shove'), ['Digit2']);
  assert.deepEqual(resolveActionCodes(st, 'pin'), ['Digit3']);
  assert.deepEqual(resolveActionCodes(st, 'bomb'), ['Digit4']);
  assert.deepEqual(resolveActionCodes(st, 'rig'), ['Digit5']);
});

test('G18-02: LMB fire and RMB the Line are fixed mouse verbs, and labels say so', () => {
  const st = flightState();
  assert.deepEqual(resolveActionCodes(st, 'fire'), []);
  assert.deepEqual(resolveActionCodes(st, 'tether'), []);
  assert.equal(resolveActionLabel(st, 'fire'), 'LMB');
  assert.equal(resolveActionLabel(st, 'tether'), 'RMB');
  // Every overflow verb ships unbound — it lives on the wheel, not a key.
  for (const action of WHEEL_ACTIONS) {
    if (action === 'aimedMine') continue; // no keyboard seat; wheel/pad/touch only
    assert.deepEqual(resolveActionCodes(st, action), [], `${action} unbound by default`);
  }
});

test('G18-02: a rebound key on the Line overrides the RMB label', () => {
  const st = flightState();
  st.settings.controls.bindings = { tether: ['KeyF'] };
  assert.equal(resolveActionLabel(st, 'tether'), 'F');
});

// ── context gates and the wheel ───────────────────────────────────────────────

test('G18-02: contextWheel is admitted in flight, combat and swarm — refused docked', () => {
  assert.equal(contextActionAllowed(flightState(), 'contextWheel'), true);
  const combat = flightState();
  combat.playerId = 1;
  combat.player = { targetId: 2 };
  combat.entities = { get: (id) => (id === 1 ? { id: 1, team: 0 } : { id: 2, team: 1, alive: true }) };
  assert.equal(contextActionAllowed(combat, 'contextWheel'), true);
  // G18-02b: the wheel is in BOTH doors — a live Swarm run must admit it or Q resolves to
  // nothing and the overlay can never open (the bug the lead found on the real route).
  assert.equal(contextActionAllowed(swarmState(), 'contextWheel'), true);
  assert.equal(contextActionAllowed({ ...flightState(), mode: 'station' }, 'contextWheel'), false);
});

test('G18-02: every wheel slice is a context-legal action — nothing is unreachable', () => {
  const st = flightState();
  const slices = contextWheelSlices(st);
  // In free flight the full ring is present except the site-gated SITE BEAM (no site selected).
  const actions = slices.map((s) => s.action);
  for (const action of WHEEL_ACTIONS) {
    if (action === 'siteBeam') continue;
    assert.ok(actions.includes(action), `${action} reachable on the flight wheel`);
  }
  for (const s of slices) {
    if (s.action === 'aimedMine') continue;
    assert.equal(contextActionAllowed(st, s.action), true, `${s.action} allowed in its context`);
  }
  // A selected World Site admits the beam slice; without one it is hidden, not dead.
  assert.ok(!actions.includes('siteBeam'));
});

test('G18-02: the flight help card teaches the wheel', () => {
  const rows = contextHelpRows(flightState(), (a) => resolveActionLabel(flightState(), a));
  const wheelRow = rows.find(([, verb]) => verb.startsWith('Wheel'));
  assert.ok(wheelRow, 'wheel row present');
  assert.equal(wheelRow[0], 'Q');
  const lineRow = rows.find(([, verb]) => verb.startsWith('Line'));
  assert.equal(lineRow[0], 'RMB');
  const fireRow = rows.find(([, verb]) => verb === 'Fire');
  assert.equal(fireRow[0], 'LMB');
});

test('G18-02: the Swarm card matches the unified table', () => {
  const verbs = Object.fromEntries(SWARM_HELP_ROWS.map(([k, v]) => [v, k]));
  assert.equal(verbs['Move'], 'W A S D');
  assert.equal(verbs['Aim'], 'Mouse');
  assert.equal(verbs['Fire'], 'LMB');
  assert.equal(verbs['Line — fire / release'], 'RMB');
  assert.equal(verbs['Boost / dash'], 'Space');
  assert.equal(verbs['Interact'], 'E');
  // G18-02b: Q is the wheel in the Swarm door too; the Call-in slice lives inside it.
  assert.equal(verbs['Wheel — hold · aim · release'], 'Q');
  assert.deepEqual(SWARM_DEFAULT_BINDINGS.boost, ['Space']);
});

// ── the wheel channel ─────────────────────────────────────────────────────────

test('G18-02: a toggle slice latches and releases; a tap slice queues one press', () => {
  const { sim, keys } = inputFor();
  assert.equal(keys.applyWheelVerb({ action: 'brake', phase: 'toggle' }), true);
  assert.equal(keys.wheelLatchOn('brake'), true);
  sim.step();
  assert.equal(keys.wheelLatchOn('brake'), true);
  assert.equal(keys.applyWheelVerb({ action: 'brake', phase: 'toggle' }), true);
  assert.equal(keys.wheelLatchOn('brake'), false);

  // tap: one sampled edge through the same queue a key uses.
  assert.equal(keys.applyWheelVerb({ action: 'scanPulse', phase: 'tap' }), true);
  sim.step();
  // The press was consumed by the tick — the queue does not replay it.
  assert.equal(keys._keyEdgeQueue.some((e) => e.action === 'scanPulse'), false);
});

test('G18-02: wheel choices are context-gated and latches read context-truthfully', () => {
  const { sim, keys } = inputFor();
  sim.state.mode = 'station';
  assert.equal(keys.applyWheelVerb({ action: 'brake', phase: 'toggle' }), false);
  sim.state.mode = 'flight';
  // A flight latch survives; a live Swarm run then refuses Adventure-only verbs and
  // the same latch reads OFF while its context refuses it (the latch itself persists).
  assert.equal(keys.applyWheelVerb({ action: 'gyreSnare', phase: 'toggle' }), true);
  assert.equal(keys.wheelLatchOn('gyreSnare'), true);
  sim.state.run = { kind: 'survival', phase: 'active', ruleset: 'swarm' };
  assert.equal(keys.applyWheelVerb({ action: 'gyreSnare', phase: 'toggle' }), false);
  assert.equal(keys.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' }), false);
  assert.equal(keys.wheelLatchOn('gyreSnare'), false);
  sim.state.run = { kind: 'adventure', phase: 'inactive', ruleset: null };
  assert.equal(keys.wheelLatchOn('gyreSnare'), true);
});

test('G18-02: wheelVerb domEvent descriptors drive the same channel (worker lane)', () => {
  const { keys } = inputFor();
  keys.ingestLaneDomEvent({ type: 'wheelVerb', action: 'strafeLeft', phase: 'toggle' });
  assert.equal(keys.wheelLatchOn('strafeLeft'), true);
  keys.ingestLaneDomEvent({ type: 'wheelVerb', action: 'strafeLeft', phase: 'toggle' });
  assert.equal(keys.wheelLatchOn('strafeLeft'), false);
});

test('G18-02: releasing held controls drops every wheel latch', () => {
  const { keys } = inputFor();
  keys.applyWheelVerb({ action: 'brake', phase: 'toggle' });
  keys.applyWheelVerb({ action: 'reelIn', phase: 'toggle' });
  assert.equal(keys.wheelLatchOn('brake'), true);
  keys.releaseHeldControls('window-blur');
  assert.equal(keys.wheelLatchOn('brake'), false);
  assert.equal(keys.wheelLatchOn('reelIn'), false);
});

test('G18-02: holding contextWheel publishes a held level on actions', () => {
  const { sim, keys } = inputFor();
  assert.equal(sim.state.input.actions.contextWheel, false);
  keys._keys.KeyQ = true;
  sim.step();
  assert.equal(sim.state.input.actions.contextWheel, true);
  keys._keys.KeyQ = false;
  sim.step();
  assert.equal(sim.state.input.actions.contextWheel, false);
});

// ── G18-02b: the wheel on the real route ─────────────────────────────────────

test('G18-02b: holding Q through the real DOM key path opens the wheel in a live Swarm run', () => {
  const { sim, keys } = inputFor();
  sim.state.run = { kind: 'survival', phase: 'active', ruleset: 'swarm' };
  // The exact descriptor the window keydown listener hands domKeyEvent — code, pressed,
  // repeat, blocked. Before the fix this dropped at the Swarm allowlist and the wheel
  // could never open on the shipped route.
  domKeyEvent(keys, { type: 'keydown', code: 'KeyQ', pressed: true, repeat: false, blocked: false });
  sim.step();
  assert.equal(sim.state.input.actions.contextWheel, true,
    'a held Q in a live Swarm run must publish actions.contextWheel');
  assert.equal(sim.state.input.actions.callIn, false,
    'the wheel hold is a level, never a call-in edge');
  domKeyEvent(keys, { type: 'keyup', code: 'KeyQ', pressed: false });
  sim.step();
  assert.equal(sim.state.input.actions.contextWheel, false);
});

test('G18-02b: the Swarm wheel seats its legal slices and Call-in only while a charge waits', () => {
  const st = swarmState();
  const base = contextWheelSlices(st, 0).map((s) => s.action);
  for (const action of ['brake', 'reelIn', 'reelOut', 'strafeLeft', 'strafeRight']) {
    assert.ok(base.includes(action), `swarm wheel seat: ${action}`);
  }
  assert.ok(!base.includes('callIn'), 'no Call-in slice while the queue is empty');
  assert.ok(!base.includes('aimedMine'), 'no mine slice in the Swarm door');
  const charged = contextWheelSlices(st, 1).map((s) => s.action);
  assert.ok(charged.includes('callIn'), 'a stocked call surfaces the Call-in slice');
});

test('G18-02b: a wheel Call-in tap fires the real Swarm edge — and stays Swarm-only', () => {
  const { sim, keys } = inputFor();
  sim.state.run = { kind: 'survival', phase: 'active', ruleset: 'swarm' };
  assert.equal(keys.applyWheelVerb({ action: 'callIn', phase: 'tap' }), true);
  sim.step();
  assert.equal(sim.state.input.actions.callIn, true,
    'the wheel verb must reach actions.callIn — the flag the director edges on');
  // Adventure flight refuses it: Call-in is a Swarm verb, not a second fire button.
  sim.state.run = { kind: 'adventure', phase: 'inactive', ruleset: null };
  assert.equal(keys.applyWheelVerb({ action: 'callIn', phase: 'tap' }), false);
});

// ── the pad ───────────────────────────────────────────────────────────────────

test('G18-02: the pad speaks the same table — hold-Y is the wheel', () => {
  const m = GAMEPAD_DEFAULT_BINDINGS;
  assert.deepEqual([...m.massline], ['l2']);        // LT the Line
  assert.deepEqual([...m.fire], ['r2']);
  assert.deepEqual([...m.boost], ['accept']);       // A boost
  assert.deepEqual([...m.dock], ['action']);        // X interact
  assert.deepEqual([...m.contextWheel], ['alt']);   // hold-Y the wheel
  assert.deepEqual([...m.map], ['view']);
  // Overflow verbs hold no pad seat — they live on the wheel.
  for (const a of ['brake', 'mine', 'travelBurn', 'bulletTime', 'gyreSnare']) {
    assert.deepEqual([...m[a]], [], `pad ${a} unbound — wheel`);
  }
});

test('G18-02: a saved pad remap outranks the reseated defaults', () => {
  const settings = { controls: { gamepad: { bindings: { fire: ['l2'] } } } };
  const resolved = resolveGamepadBindings(settings);
  // The player's saved LT fire survives; the reseated massline default defers rather
  // than silently double-firing both verbs on one trigger.
  assert.deepEqual([...resolved.fire], ['l2']);
  assert.ok(!resolved.massline.includes('l2'));
});

// ── migration ─────────────────────────────────────────────────────────────────

test('G18-02: an untouched profile migrates once to the new defaults', () => {
  const settings = { controls: { bindings: { tether: ['Space', 'KeyF'] } } };
  migrateOneSetOfKeysProfile(settings);
  assert.equal(settings.controls.bindings, null);
  assert.equal(settings.controls.oneSetOfKeysVersion, ONE_SET_OF_KEYS_VERSION);
  // Idempotent — a second pass is a no-op.
  settings.controls.bindings = { brake: ['KeyB'] };
  migrateOneSetOfKeysProfile(settings);
  assert.deepEqual(settings.controls.bindings, { brake: ['KeyB'] });
});

test('G18-02: a real custom binding is never rewritten', () => {
  const settings = { controls: { bindings: { tether: ['KeyF'], brake: ['KeyB'] } } };
  migrateOneSetOfKeysProfile(settings);
  assert.deepEqual(settings.controls.bindings, { tether: ['KeyF'], brake: ['KeyB'] });
  assert.equal(settings.controls.oneSetOfKeysVersion, ONE_SET_OF_KEYS_VERSION);
});

// ── Settings coverage ─────────────────────────────────────────────────────────

test('G18-02: Settings lists the wheel and every wheel slice as rebindable', () => {
  assert.ok(REBINDABLE.includes('contextWheel'));
  assert.ok(GAMEPAD_REBINDABLE.includes('contextWheel'));
  for (const action of ['brake', 'reelIn', 'reelOut', 'strafeLeft', 'strafeRight',
    'bulletTime', 'gyreSnare', 'cloak', 'countermeasure', 'scanPulse', 'cycleBomb',
    'travelBurn', 'cruise', 'jettisonLot', 'deployBeacon', 'deployShieldPylon',
    'siteBeam', 'autoFire']) {
    assert.ok(REBINDABLE.includes(action), `keyboard rebind row: ${action}`);
  }
  for (const action of ['brake', 'mine', 'travelBurn', 'bulletTime', 'gyreSnare']) {
    assert.ok(GAMEPAD_REBINDABLE.includes(action), `pad rebind row: ${action}`);
  }
});

// ── the call-in queue publication (feeds the wheel's Call-in slice) ───────────

test('G18-02b: the call-in director publishes queue depth the wheel can gate on', () => {
  const events = [];
  const st = swarmState();
  st.mode = 'flight';
  st.input = { actions: {} };
  const bus = { emit: (type, payload) => events.push({ type, payload }), on: () => () => {} };
  const director = createSwarmCallinsDirector({ state: st, bus, helpers: {}, registry: { get: () => null } });
  director.init();
  assert.equal(director.callinState().queued, 0);
  director.queueCallin('turret_drop');
  assert.equal(director.callinState().queued, 1);
  assert.deepEqual(events.at(-1), { type: 'swarm:callinQueued', payload: { pending: 1, callinId: 'turret_drop' } });
  // The same actions.callIn edge the wheel's tap mints consumes the queue and re-publishes.
  st.input.actions.callIn = true;
  director.update(1 / 60, st);
  assert.equal(director.callinState().queued, 0);
  assert.deepEqual(events.at(-1), { type: 'swarm:callinQueued', payload: { pending: 0, callinId: 'turret_drop' } });
});
