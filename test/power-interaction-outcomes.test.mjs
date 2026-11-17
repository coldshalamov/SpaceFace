// Player-facing power contract: real input owner -> field owner -> public HUD model.
// This curated simulation proves action/state semantics, not render appearance or physical
// keyboard rollover. The ordinary browser route must still be exercised before visual acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { input, applyFlightKeyEvent } from '../src/systems/input.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { createGamepad } from '../src/systems/gamepad.js';
import { createLaneTouchReducer } from '../src/systems/mobile/laneTouchReducer.js';
import { heldPower, powerUsesReleasePreview } from '../src/systems/powerVerbs.js';
import { powerHeld } from '../src/data/powerPreview.js';
import { readOrdnanceModel } from '../src/ui/orrery/hudAdapter.js';

function fieldTest(name, body) {
  test(name, () => {
    const previous = FIELD_FLAGS.enabled;
    FIELD_FLAGS.enabled = true;
    try { body(); } finally { FIELD_FLAGS.enabled = previous; }
  });
}

function boot({ powerFire = 'hold', bindings = {} } = {}) {
  const sim = createSimulation({ seed: 5172026, bus: createBus(), systems: [input, fields] });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.powerFire = powerFire;
  state.settings.gameplay.controlScheme = 'pilot';
  state.settings.controls.bindings = bindings;
  const player = sim.spawn({
    ...makeShipEntitySpec('ship_kestrel', { pos: { x: 0, z: 0 }, rot: 0 }),
    isPlayer: true,
  });
  state.playerId = player.id;
  state.world = { ...(state.world || {}), currentSectorId: 'sector_a' };
  const host = sim.registry.get('input');
  const events = [];
  for (const name of ['fields:deployed', 'fields:coneToggled']) {
    sim.bus.on(name, (payload) => events.push({ name, payload }));
  }
  return {
    sim, state, host, player, events,
    key: (code, pressed, extra = {}) => applyFlightKeyEvent(host, { code, pressed, ...extra }),
    step: () => sim.step(),
    coneEvents: () => events.filter((e) => e.name === 'fields:coneToggled').map((e) => e.payload.active),
  };
}

function assertCone(t, active, context) {
  assert.equal(t.state.fields.coneActive, active, `${context}: domain toggle`);
  assert.equal(t.state.fields.active.some((field) => field.kind === 'cone'), active,
    `${context}: the published field agrees with the toggle`);
  assert.equal(heldPower(t.state), null, `${context}: no release-to-use grip`);
  assert.equal(powerHeld(t.state), null, `${context}: no automatic held-key preview`);
}

function attachWorkerTouch(t) {
  t.host.touch = createLaneTouchReducer();
  return (actions, extra = {}) => t.host.ingestLaneDomEvent({ type: 'touchFrame',
    frame: { active: true, axes: { leftX: 0, leftY: -0.7, rightX: 0, rightY: 0 }, actions, ...extra } });
}

fieldTest('Rig toggles on key-down while W+D steer; repeats and key-up neither retrigger nor steal movement', () => {
  for (const powerFire of ['hold', 'press']) {
    const t = boot({ powerFire });
    t.key('KeyW', true); t.key('KeyD', true); t.key('Digit5', true); t.step();
    assertCone(t, true, `${powerFire}: first press`);
    assert.equal(t.state.input.moveZ, 1, 'forward remains held');
    assert.equal(t.state.input.turnIntent, 1, 'right yaw remains held');
    for (let i = 0; i < 8; i++) {
      t.key('Digit5', true, { repeat: true }); t.step();
      assertCone(t, true, 'holding the key');
      assert.equal(t.state.input.moveZ, 1);
      assert.equal(t.state.input.turnIntent, 1);
    }
    t.key('Digit5', false); t.step();
    assertCone(t, true, 'release keeps the cone working');
    assert.equal(t.state.input.moveZ, 1);
    assert.equal(t.state.input.turnIntent, 1);
    assert.deepEqual(t.coneEvents(), [true], 'one physical press produces one domain transition');
    t.key('Digit5', true); t.step();
    assertCone(t, false, 'the second press folds it immediately');
    t.key('Digit5', false); t.step();
    assertCone(t, false, 'release leaves it off');
    assert.deepEqual(t.coneEvents(), [true, false]);
  }
});

fieldTest('Rig HUD reads the continuing cone state after release and the off state after the next tap', () => {
  const t = boot();
  t.key('Digit5', true); t.step();
  const pressed = readOrdnanceModel(t.state, null, undefined, { nowWall: 1 })['5'];
  assert.equal(pressed.active, true, 'working cone is active');
  assert.notEqual(pressed.held, true, 'a toggle is not a held preview');
  t.key('Digit5', false); t.step();
  const released = readOrdnanceModel(t.state, null, undefined, { nowWall: 2 })['5'];
  assert.equal(released.active, true, 'ON feedback persists after the input edge');
  assert.notEqual(released.held, true);
  assert.match(released.label, /(?:cone|rig).*on/i, 'the continuing state is visible in the label');
  t.key('Digit5', true); t.step();
  t.key('Digit5', false); t.step();
  const off = readOrdnanceModel(t.state, null, undefined, { nowWall: 3 })['5'];
  assert.notEqual(off.active, true, 'OFF must not stay lit by the last activation');
  assert.match(off.label, /(?:cone|rig).*off/i, 'off feedback names the actual state');
});

fieldTest('queued quick Rig taps preserve one domain toggle per tap across catch-up ticks', () => {
  for (const taps of [2, 3]) {
    const t = boot();
    for (let i = 0; i < taps; i++) { t.key('Digit5', true); t.key('Digit5', false); }
    for (let i = 0; i < taps + 2; i++) t.step();
    assertCone(t, taps % 2 === 1, `${taps} taps`);
    assert.deepEqual(t.coneEvents(), Array.from({ length: taps }, (_, i) => i % 2 === 0));
  }
});

fieldTest('custom and legacy Rig bindings retain their key and explicit unbinding remains unbound', () => {
  for (const bindings of [{ rig: ['KeyR'] }, { toggleClearingCone: ['KeyR'] }, { toggleSkimCollector: ['KeyR'] }]) {
    const saved = structuredClone(bindings);
    const t = boot({ bindings });
    t.key('Digit5', true); t.step(); t.key('Digit5', false); t.step();
    assertCone(t, false, 'the old default no longer owns the action');
    t.key('KeyR', true); t.step();
    assertCone(t, true, 'the saved key switches it on immediately');
    t.key('KeyR', false); t.step();
    assertCone(t, true, 'the saved key may be released');
    assert.deepEqual(t.state.settings.controls.bindings, saved, 'using a power does not rewrite custom controls');
  }
  for (const bindings of [{ rig: [] }, { toggleClearingCone: [] }, { rig: [], toggleClearingCone: ['KeyR'] }]) {
    const t = boot({ bindings });
    for (const code of ['Digit5', 'KeyR']) { t.key(code, true); t.step(); t.key(code, false); t.step(); }
    assertCone(t, false, 'an explicit empty binding does not recover a default or legacy key');
    assert.deepEqual(t.coneEvents(), []);
  }
});

fieldTest('focus loss and modal resume do not synthesize a Rig toggle or replay an uncommitted press', () => {
  const t = boot();
  t.key('Digit5', true); t.step();
  t.host.releaseHeldControls('blur'); t.step();
  assertCone(t, true, 'focus loss releases input without switching off a persistent tool');
  t.key('Digit5', true, { repeat: true }); t.key('Digit5', false); t.step();
  assertCone(t, true, 'the eventual key-up does not fire');
  t.key('Digit5', true); t.step();
  assertCone(t, false, 'a fresh press still works');
  t.state.ui = { screenStack: ['pause'] }; t.step();
  t.state.ui.screenStack = []; t.step();
  assertCone(t, false, 'holding the same key across a modal is not a new press');
  t.key('Digit5', false); t.step();
  t.key('Digit5', true); t.host.releaseHeldControls('blur'); t.step();
  assertCone(t, false, 'an uncommitted held press is cancelled on focus loss');
  t.key('Digit5', false); t.step();
  assert.deepEqual(t.coneEvents(), [true, false]);
});

fieldTest('Shove deploys its real repulsor and requests detonation on press, never on repeat or release', () => {
  for (const powerFire of ['hold', 'press']) {
    const t = boot({ powerFire });
    t.key('Digit2', true); t.step();
    const deployed = () => t.events.filter((e) => e.name === 'fields:deployed' && e.payload.kind === 'repulsor');
    assert.equal(deployed().length, 1, 'ship-centered repulsor is deployed on key-down');
    assert.equal(t.state.input.actions.chargeDetonate, true, 'the same press requests armed-ordnance detonation');
    assert.equal(heldPower(t.state), null);
    assert.equal(powerHeld(t.state), null, 'a ship-centered pulse never enters an aiming preview');
    t.key('Digit2', true, { repeat: true }); t.step();
    assert.equal(t.state.input.actions.chargeDetonate, false, 'repeat is inert');
    t.key('Digit2', false); t.step();
    assert.equal(t.state.input.actions.chargeDetonate, false, 'release is inert');
    assert.equal(deployed().length, 1);
  }
});

fieldTest('the real standard-pad B mapping toggles Rig and the lifecycle fence requires neutral before reuse', () => {
  const t = boot();
  const gp = createGamepad({ state: t.state, bus: t.sim.bus }, { connectionEvents: false });
  t.host.gamepad = gp;
  t.state.settings.controls.gamepad = { ...(t.state.settings.controls.gamepad || {}), enabled: true };
  let seq = 0;
  const frame = (pressed) => {
    const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === 1 && pressed, touched: i === 1 && pressed, value: i === 1 && pressed ? 1 : 0 }));
    t.host.ingestLaneDomEvent({ type: 'gamepadFrame', frame: { pads: [{ id: 'Standard Test Pad', index: 0, connected: true,
      mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: ++seq }] } });
  };
  frame(false); t.step();
  frame(true); t.step(); assertCone(t, true, 'B down');
  frame(true); t.step(); assertCone(t, true, 'B still held');
  t.host.releaseHeldControls('blur'); frame(true); t.step();
  assertCone(t, true, 'resume cannot reinterpret a held B as another toggle');
  frame(false); t.step(); assertCone(t, true, 'neutral only clears the fence');
  frame(true); t.step(); assertCone(t, false, 'a new B press folds the cone');
  assert.deepEqual(t.coneEvents(), [true, false]);
});

fieldTest('worker touch taps retain their Rig edge even when press and neutral snapshots arrive before a tick', () => {
  const t = boot();
  const frame = attachWorkerTouch(t);
  frame({ rig: true }); frame({}); t.step();
  assertCone(t, true, 'a quick touch tap survives a collapsed frame batch');
  assert.ok(t.state.input.moveZ > 0, 'the left stick keeps flying during the tap');
  frame({ rig: true }); frame({}); t.step();
  assertCone(t, false, 'a second quick tap turns the tool off');
  frame({ rig: true }); frame({}, { active: false }); t.step();
  assertCone(t, false, 'a disabled touch deck cancels its uncommitted edge');
  assert.deepEqual(t.coneEvents(), [true, false]);
});

fieldTest('repeated touch Rig frames do not retrigger and blur requires a neutral frame before a new use', () => {
  const t = boot();
  const frame = attachWorkerTouch(t);
  frame({ rig: true }); t.step();
  assertCone(t, true, 'first touch press');
  for (let i = 0; i < 3; i++) { frame({ rig: true }); t.step(); assertCone(t, true, 'held snapshot'); }
  t.host.releaseHeldControls('blur');
  frame({ rig: true }); t.step();
  assertCone(t, true, 'a stale held snapshot after blur is fenced');
  frame({}); t.step();
  assertCone(t, true, 'neutral clears the fence without using the power');
  frame({ rig: true }); t.step();
  assertCone(t, false, 'a new touch press works after neutral');
  frame({}); t.step();
  assert.deepEqual(t.coneEvents(), [true, false]);
});

fieldTest('worker touch preserves quick Shove pulses while aimed Pull still previews until release', () => {
  const t = boot();
  const frame = attachWorkerTouch(t);
  frame({ shove: true }); frame({ shove: true }); frame({}); t.step();
  assert.equal(t.events.filter((e) => e.name === 'fields:deployed' && e.payload.kind === 'repulsor').length, 1,
    'a collapsed quick Shove deploys its actual repulsor exactly once');
  assert.equal(t.state.input.actions.chargeDetonate, true);
  assert.equal(heldPower(t.state), null);
  assert.equal(powerHeld(t.state), null);
  t.step();
  assert.equal(t.state.input.actions.chargeDetonate, false, 'the buffered pulse does not replay');
  frame({ pull: true }); t.step();
  assert.equal(heldPower(t.state), 'pull', 'an aimed touch power still holds its preview');
  assert.equal(t.events.filter((e) => e.name === 'fields:deployed' && e.payload.kind === 'well').length, 0);
  frame({}); t.step();
  assert.equal(heldPower(t.state), null);
  assert.equal(t.events.filter((e) => e.name === 'fields:deployed' && e.payload.kind === 'well').length, 1,
    'releasing aimed Pull still deploys its real well');
});

test('only aimed powers obey the existing release-preview preference, including legacy saved action names', () => {
  const state = { settings: { gameplay: { powerFire: 'hold' } } };
  for (const verb of ['pull', 'pin', 'bomb', 'deployWell', 'deployMassSeed', 'chargeThrow']) {
    assert.equal(powerUsesReleasePreview(state, verb), true, verb);
  }
  for (const verb of ['rig', 'shove', 'toggleClearingCone', 'toggleSkimCollector', 'deployRepulsor', 'chargeDetonate']) {
    assert.equal(powerUsesReleasePreview(state, verb), false, verb);
  }
  state.settings.gameplay.powerFire = 'press';
  for (const verb of ['pull', 'pin', 'bomb', 'rig', 'shove']) assert.equal(powerUsesReleasePreview(state, verb), false, verb);
});
