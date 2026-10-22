// Row 493 — hold to preview, release to use. A power key grips on the press (the held-key preview
// draws what it will move) and fires on the release; a whole tap between two updates fires at once.
// A screen, focus loss, a sector change or a fenced pad cancels the grip without firing. Settings →
// Gameplay → Powers "Use on press" keeps fire-on-press. Drives the shipped input owner.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { input, applyFlightKeyEvent } from '../src/systems/input.js';
import { heldPower, powersFireOnPress } from '../src/systems/powerVerbs.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const POWER_FLAGS = ['deployWell', 'deployRepulsor', 'chargeDetonate', 'deployMassSeed', 'dropBomb', 'chargeThrow', 'toggleClearingCone', 'toggleSkimCollector'];

function boot() {
  const sim = createSimulation({ seed: 4931, bus: createBus(), systems: [input] });
  const { state } = sim;
  state.mode = 'flight';
  const p = sim.spawn({ ...makeShipEntitySpec('ship_kestrel', { pos: { x: 0, z: 0 }, rot: 0 }), isPlayer: true });
  state.playerId = p.id;
  state.world = { ...(state.world || {}), currentSectorId: 'sector_a' };
  const host = sim.registry.get('input');
  const key = (code, pressed, extra = {}) => applyFlightKeyEvent(host, { code, pressed, ...extra });
  const fired = () => POWER_FLAGS.filter((f) => state.input.actions[f] === true);
  const step = () => { sim.step(); return fired(); };
  return { sim, state, host, key, step };
}

test('a held key grips and previews; the key-up fires it once; a whole tap fires at once', () => {
  const t = boot();
  assert.equal(powersFireOnPress(t.state), false, 'hold to preview is the shipped default');
  t.key('Digit1', true);
  assert.deepEqual(t.step(), [], 'held: nothing fires yet');
  assert.equal(heldPower(t.state), 'pull', 'the preview reads the grip');
  for (let i = 0; i < 4; i++) t.key('Digit1', true, { repeat: true });
  assert.deepEqual(t.step(), [], 'key repeats add nothing');
  assert.equal(heldPower(t.state), 'pull');
  t.key('Digit1', false);
  assert.deepEqual(t.step(), ['deployWell'], 'letting go uses it');
  assert.equal(heldPower(t.state), null);
  assert.deepEqual(t.step(), [], 'once');

  t.key('Digit3', true);
  t.key('Digit3', false);
  assert.deepEqual(t.step(), ['deployMassSeed'], 'a tap inside one update fires on that update');
  assert.equal(heldPower(t.state), null, 'a tap never shows a preview');
});

test('a screen, focus loss or a sector change cancels the grip: the later key-up fires nothing', () => {
  const t = boot();
  t.key('Digit2', true);
  t.step();
  assert.equal(heldPower(t.state), 'shove');
  t.state.ui = { screenStack: ['pause'] };
  assert.deepEqual(t.step(), []);
  assert.equal(heldPower(t.state), null, 'a screen over the grip ends the preview');
  t.state.ui = { screenStack: [] };
  assert.deepEqual(t.step(), [], 'still held after the screen: not a new press');
  t.key('Digit2', false);
  assert.deepEqual(t.step(), [], 'the key-up after a cancelled grip fires nothing');
  t.key('Digit2', true);
  t.key('Digit2', false);
  assert.deepEqual(t.step(), ['deployRepulsor', 'chargeDetonate'], 'the next press works');

  t.key('Digit5', true);
  t.step();
  assert.equal(heldPower(t.state), 'rig');
  t.host.releaseHeldControls('blur');
  assert.equal(heldPower(t.state), null, 'focus loss ends the preview');
  t.key('Digit5', false);
  assert.deepEqual(t.step(), [], 'and the key-up fires nothing');

  t.key('Digit1', true);
  t.step();
  t.state.world.currentSectorId = 'sector_b';
  assert.deepEqual(t.step(), []);
  assert.equal(heldPower(t.state), null, 'a new sector drops the grip');
  t.key('Digit1', false);
  assert.deepEqual(t.step(), [], 'no well lands in the new sector from the old aim');
});

test('"Use on press" fires on the key-down, as before the preview', () => {
  const t = boot();
  t.state.settings.gameplay.powerFire = 'press';
  assert.equal(powersFireOnPress(t.state), true);
  t.key('Digit1', true);
  assert.deepEqual(t.step(), ['deployWell']);
  assert.equal(heldPower(t.state), null, 'no grip, no preview');
  t.key('Digit1', false);
  assert.deepEqual(t.step(), []);
});

test("Bomb's charge-or-bomb choice is read when it fires, not when it was gripped", () => {
  const t = boot();
  t.state.bombs = { selectedId: 'bomb_frag' };
  t.state.player.cargo = { items: { cmdty_impulse_charge: 0 } };
  t.key('Digit4', true);
  t.step();
  assert.equal(heldPower(t.state), 'bomb');
  t.state.player.cargo.items.cmdty_impulse_charge = 2;
  t.key('Digit4', false);
  assert.deepEqual(t.step(), ['chargeThrow'], 'a charge picked up during the hold is what flies');
});

test('pad powers grip and fire the same way; two held powers preview the newest and fire their own', () => {
  const t = boot();
  const idle = () => ({ held: false, pressed: false, released: false, value: 0 });
  const gp = {
    axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0, l2: 0, r2: 0 },
    actions: {},
    isConnected() { return true; },
    tick() {},
  };
  for (const v of ['boost', 'brake', 'fire', 'mine', 'massline', 'pull', 'shove', 'pin', 'bomb', 'rig']) gp.actions[v] = idle();
  t.host.gamepad = gp;
  t.state.settings.controls.gamepad = { ...(t.state.settings.controls.gamepad || {}), enabled: true };
  const pad = (verb, held, pressed = false, released = false) => {
    gp.actions[verb] = { held, pressed, released, value: held ? 1 : 0 };
  };
  // A pad first has to be seen at rest: the lifecycle fence ignores buttons held when it arrives.
  assert.deepEqual(t.step(), []);
  pad('shove', true, true);
  assert.deepEqual(t.step(), []);
  assert.equal(heldPower(t.state), 'shove');
  pad('shove', true);
  pad('pin', true, true);
  assert.deepEqual(t.step(), []);
  assert.equal(heldPower(t.state), 'pin', 'the newest grip is the one previewed');
  pad('pin', false, false, true);
  pad('shove', true);
  assert.deepEqual(t.step(), ['deployMassSeed'], 'releasing Pin fires Pin');
  assert.equal(heldPower(t.state), 'shove', 'the older grip is previewed again');
  pad('pin', false);
  pad('shove', false, false, true);
  assert.deepEqual(t.step(), ['deployRepulsor', 'chargeDetonate'], 'then Shove fires its own');
  assert.equal(heldPower(t.state), null);
});

test('one press schedule counts the same uses at 30, 60 and 120 Hz catch-up in hold mode', () => {
  const events = [['KeyR', true], ['KeyU', true], ['KeyU', false], ['KeyR', false], ['KeyU', true], ['KeyR', true]];
  const totals = [];
  for (const hz of [30, 60, 120]) {
    const collapsed = boot();
    for (const [code, pressed] of events) collapsed.key(code, pressed);
    let a = 0;
    for (let i = 0; i < events.length; i++) a += collapsed.step().includes('deployRepulsor') ? 1 : 0;
    const split = boot();
    let b = 0;
    for (const [code, pressed] of events) { split.key(code, pressed); b += split.step().includes('deployRepulsor') ? 1 : 0; }
    assert.equal(a, b, `${hz} Hz: sampled together or apart, one release is one use`);
    totals.push(a);
  }
  assert.deepEqual(totals, [1, 1, 1], 'the first press is used; the second is still held');
});
