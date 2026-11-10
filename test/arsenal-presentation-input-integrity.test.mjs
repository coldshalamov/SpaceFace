// Packet 01 — input integrity for the powers. Hold-to-preview / release-to-use is a supported policy,
// so every way a held power can be taken away from the pilot must cancel it WITHOUT firing it: a modal,
// lost focus, docking, a pad that vanishes, pointer cancel, pause, a new sector. Releasing one key never
// fires another key's preview, a remap or an explicit unbind is respected, and picking a bomb type never
// throws it. Each case drives the shipped input owner, not a copy of its logic.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { input, applyFlightKeyEvent, setLaneModalActive } from '../src/systems/input.js';
import { heldPower } from '../src/systems/powerVerbs.js';
import { createLaneTouchReducer } from '../src/systems/mobile/laneTouchReducer.js';
import { enhanceMobileTouch } from '../src/systems/mobile/bridge.js';
import { ALL_POWERS } from '../src/systems/mobile/catalog.js';
import { drainSimCommandEnvelopes } from '../scripts/lib/simCommandChannel.mjs';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const POWER_FLAGS = ['deployWell', 'deployRepulsor', 'chargeDetonate', 'deployMassSeed', 'dropBomb', 'chargeThrow',
  'swarmBombThrow', 'toggleClearingCone', 'toggleSkimCollector'];
const POWER_KEYS = { pull: 'Digit1', shove: 'Digit2', pin: 'Digit3', bomb: 'Digit4', rig: 'Digit5' };

function boot({ bindings = null } = {}) {
  const sim = createSimulation({ seed: 4931, bus: createBus(), systems: [input] });
  const { state } = sim;
  state.mode = 'flight';
  const p = sim.spawn({ ...makeShipEntitySpec('ship_kestrel', { pos: { x: 0, z: 0 }, rot: 0 }), isPlayer: true });
  state.playerId = p.id;
  state.world = { ...(state.world || {}), currentSectorId: 'sector_a' };
  state.player.cargo = { items: { cmdty_impulse_charge: 2 } };
  state.bombs = { selectedId: 'bomb_frag', rack: { cells: [{ id: 'bomb_frag', count: 3 }] } };
  if (bindings) state.settings.controls = { ...(state.settings.controls || {}), bindings };
  const host = sim.registry.get('input');
  const key = (code, pressed, extra = {}) => applyFlightKeyEvent(host, { code, pressed, ...extra });
  const fired = () => POWER_FLAGS.filter((f) => state.input.actions[f] === true);
  const step = () => { sim.step(); return fired(); };
  return { sim, state, host, key, step, fired };
}

// Every context that must cancel a held power. Each one is the way the game, the OS or the pilot's hardware
// takes the grip away — none is the pilot releasing the key.
const CANCELS = {
  'a modal opens': { apply: () => setLaneModalActive(true), undo: () => setLaneModalActive(null) },
  'a screen opens (pause)': { apply: (t) => { t.state.ui = { screenStack: ['pause'] }; }, undo: (t) => { t.state.ui = { screenStack: [] }; } },
  'the window loses focus': { apply: (t) => t.host.releaseHeldControls('window-blur'), undo: () => {} },
  'the pointer is cancelled': { apply: (t) => t.host.releaseHeldControls('pointercancel'), undo: () => {} },
  'the ship docks': { apply: (t) => { t.state.mode = 'station'; }, undo: (t) => { t.state.mode = 'flight'; } },
  'the sim is blocked (a cinematic or pause latch)': { apply: (t) => { t.state.input.blocked = true; }, undo: (t) => { t.state.input.blocked = false; } },
  'the sector changes': { apply: (t) => { t.state.world.currentSectorId = 'sector_b'; }, undo: () => {} },
};

for (const [name, cancel] of Object.entries(CANCELS)) {
  test(`${name}: a held power never fires — not on the cancel, not on the later key-up — and the next press works`, () => {
    for (const [power, code] of Object.entries(POWER_KEYS)) {
      const t = boot();
      t.key(code, true);
      assert.deepEqual(t.step(), [], `${power}: gripped, nothing fires yet`);
      assert.equal(heldPower(t.state), power);
      const before = JSON.stringify([t.state.player.cargo.items, t.state.bombs.rack]);
      try {
        cancel.apply(t);
        assert.deepEqual(t.step(), [], `${power}: ${name} does not commit the grip`);
        assert.equal(heldPower(t.state), null, `${power}: the preview is gone`);
        cancel.undo(t);
        assert.deepEqual(t.step(), [], `${power}: still down after the context ends is not a new press`);
        t.key(code, false);
        assert.deepEqual(t.step(), [], `${power}: the key-up after a cancelled grip fires nothing`);
      } finally {
        cancel.undo(t);
      }
      assert.equal(JSON.stringify([t.state.player.cargo.items, t.state.bombs.rack]), before, `${power}: no charge or bomb was spent`);
      t.key(code, true);
      t.key(code, false);
      assert.ok(t.step().length > 0, `${power}: the next real press fires`);
    }
  });
}

test('a pad that disconnects mid-grip cancels the power instead of firing it', () => {
  const t = boot();
  const idle = () => ({ held: false, pressed: false, released: false, value: 0 });
  let connected = true;
  const gp = { axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0, l2: 0, r2: 0 }, actions: {}, isConnected() { return connected; }, tick() {} };
  for (const verb of ['boost', 'brake', 'fire', 'mine', 'massline', 'pull', 'shove', 'pin', 'bomb', 'rig']) gp.actions[verb] = idle();
  t.host.gamepad = gp;
  t.state.settings.controls.gamepad = { ...(t.state.settings.controls.gamepad || {}), enabled: true };
  assert.deepEqual(t.step(), [], 'the pad is seen at rest first');
  gp.actions.shove = { held: true, pressed: true, released: false, value: 1 };
  assert.deepEqual(t.step(), []);
  assert.equal(heldPower(t.state), 'shove', 'the pad grips Shove');
  // The pad vanishes with the button still down: no key-up will ever arrive, and the pilot did not let go.
  connected = false;
  gp.actions.shove = idle();
  assert.deepEqual(t.step(), [], 'a vanished pad is not a release');
  assert.equal(heldPower(t.state), null);
  // …and when it comes back, nothing was left half-committed.
  connected = true;
  assert.deepEqual(t.step(), []);
  gp.actions.shove = { held: true, pressed: true, released: false, value: 1 };
  t.step();
  gp.actions.shove = { held: false, pressed: false, released: true, value: 0 };
  assert.deepEqual(t.step(), ['deployRepulsor', 'chargeDetonate'], 'a deliberate release on a live pad still uses the power');
});

test('releasing one held key fires only that key; the other keeps its preview and fires on its own release', () => {
  const t = boot();
  t.key('Digit1', true); // Pull — older
  t.step();
  t.key('Digit2', true); // Shove — the most recent grip, the one previewed
  assert.deepEqual(t.step(), []);
  assert.equal(heldPower(t.state), 'shove');
  t.key('Digit1', false);
  assert.deepEqual(t.step(), ['deployWell'], 'letting go of Pull fires Pull, not the previewed Shove');
  assert.equal(heldPower(t.state), 'shove', 'Shove is still gripped and still previewed');
  assert.deepEqual(t.step(), [], 'and nothing else fires on its own');
  t.key('Digit2', false);
  assert.deepEqual(t.step(), ['deployRepulsor', 'chargeDetonate']);
  assert.equal(heldPower(t.state), null);
});

test('a power bound to two keys fires once per use from either key, and the other key stays a different key', () => {
  const t = boot();
  // Shove answers to both 2 and R. Gripping and releasing R uses it once; the unused key adds nothing.
  t.key('KeyR', true);
  assert.deepEqual(t.step(), []);
  assert.equal(heldPower(t.state), 'shove');
  t.key('KeyR', false);
  assert.deepEqual(t.step(), ['deployRepulsor', 'chargeDetonate']);
  assert.deepEqual(t.step(), []);
  t.key('Digit2', true);
  assert.deepEqual(t.step(), []);
  t.key('Digit2', false);
  assert.deepEqual(t.step(), ['deployRepulsor', 'chargeDetonate'], 'the digit uses it just the same');
  assert.deepEqual(t.step(), []);
});

test('an explicitly unbound power stays unbound, and a legacy saved alias keeps driving its power', () => {
  // Pull was deliberately unbound: the number-row key must not quietly come back.
  const unbound = boot({ bindings: { pull: [] } });
  unbound.key('Digit1', true);
  unbound.key('Digit1', false);
  assert.deepEqual(unbound.step(), [], 'an unbound Pull does nothing on its old key');
  // A binding saved under the OLD name (before the five-power merge) still drives the power.
  const legacy = boot({ bindings: { deployWell: ['KeyP'] } });
  legacy.key('Digit1', true);
  legacy.key('Digit1', false);
  assert.deepEqual(legacy.step(), [], 'the saved custom key replaced the default');
  legacy.key('KeyP', true);
  legacy.key('KeyP', false);
  assert.deepEqual(legacy.step(), ['deployWell'], 'the legacy alias drives Pull');
  // An old verb the pilot unbound stays unbound as a choice (it does not fall back to the scheme default).
  const legacyUnbound = boot({ bindings: { deployWell: [] } });
  legacyUnbound.key('Digit1', true);
  legacyUnbound.key('Digit1', false);
  assert.deepEqual(legacyUnbound.step(), []);
});

test('selecting a bomb type never fires it, even with the Bomb key held or a charge aboard', () => {
  const t = boot();
  // The ordnance cycle (Comma): an edge for the bombs system, never a power press.
  t.key('Comma', true);
  assert.deepEqual(t.step(), []);
  assert.equal(t.state.input.actions.cycleBomb, true, 'the cycle edge reaches the bombs system');
  t.key('Comma', false);
  assert.deepEqual(t.step(), []);
  // Cycling while the Bomb key is gripped neither fires nor loses the grip.
  t.key('Digit4', true);
  t.step();
  t.key('Comma', true);
  assert.deepEqual(t.step(), [], 'a cycle during a Bomb grip fires nothing');
  t.key('Comma', false);
  t.step();
  assert.equal(heldPower(t.state), 'bomb', 'the Bomb grip survives a cycle');
  t.key('Digit4', false);
  const flags = t.step();
  assert.equal(flags.length, 1, 'the Bomb key-up fires exactly one ordnance action');
  assert.ok(['chargeThrow', 'dropBomb', 'swarmBombThrow'].includes(flags[0]));
});

function workerTouch() {
  const t = boot();
  t.host.touch = createLaneTouchReducer();
  let seq = 0;
  const drain = (...descriptors) => drainSimCommandEnvelopes(
    descriptors.map(d => ({ seq: ++seq, t: 'dom', p: { d } })),
    { state: t.state, helpers: t.sim.helpers, bus: t.sim.bus,
      ingestDomEvent: d => t.host.ingestLaneDomEvent(d) });
  const frame = (actions = {}, extra = {}) => ({ type: 'touchFrame',
    frame: { active: true, axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 }, actions, ...extra } });
  drain(frame());
  t.step();
  return { ...t, drain, frame, pulse: () => drain(frame({ deployShieldPylon: true }), frame()),
    deployed: () => t.state.input.actions.deployShieldPylon };
}

test('a mobile pylon tap survives both wire frames draining before one sim update', () => {
  const t = workerTouch();
  t.pulse();
  t.step();
  assert.equal(t.deployed(), true, 'the tap reaches the pylon owner once');
  assert.equal(t.host.touch.actions.deployShieldPylon.held, false, 'the raw released sample stays truthful');
  assert.equal(t.host.touch.actions.deployShieldPylon.released, true);
  t.step();
  assert.equal(t.deployed(), false, 'the one tap cannot replay');
});

test('two mobile taps buffered in one worker batch remain two uses, one per update', () => {
  const t = workerTouch();
  t.drain(t.frame({ deployShieldPylon: true }), t.frame(),
    t.frame({ deployShieldPylon: true }), t.frame());
  for (const expected of [true, true, false, false]) { t.step(); assert.equal(t.deployed(), expected); }
});

test('a held touch pylon descriptor does not repeat or change the raw flight axes', () => {
  const t = workerTouch();
  const axes = { leftX: .2, leftY: -.6, rightX: .8, rightY: -.4 };
  t.drain(t.frame({ deployShieldPylon: true }, { axes }));
  t.step();
  assert.equal(t.deployed(), true);
  for (let i = 0; i < 3; i++) {
    t.drain(t.frame({ deployShieldPylon: true }, { axes }));
    t.step(); assert.equal(t.deployed(), false);
    assert.deepEqual(t.host.touch.axes, axes);
    assert.equal(t.host.touch.actions.deployShieldPylon.held, true);
  }
  t.drain(t.frame()); t.step(); assert.equal(t.deployed(), false);
  t.pulse(); t.step(); assert.equal(t.deployed(), true);
});

for (const reason of ['window-blur', 'pointercancel']) {
  test(`${reason} discards buffered touch taps and fences a still-held descriptor until neutral`, () => {
    const t = workerTouch();
    t.drain(t.frame({ deployShieldPylon: true }));
    if (reason === 'window-blur') t.drain({ type: 'blur' });
    else t.host.releaseHeldControls(reason);
    t.drain(t.frame({ deployShieldPylon: true }));
    for (let i = 0; i < 2; i++) { t.step(); assert.equal(t.deployed(), false); }
    t.drain(t.frame()); t.step(); assert.equal(t.deployed(), false);
    t.pulse(); t.step(); assert.equal(t.deployed(), true, 'a fresh contact works');
    t.step(); assert.equal(t.deployed(), false);
  });
}

test('modal cancellation clears queued touch uses and allows the first fresh tap after closing', () => {
  const t = workerTouch();
  t.pulse();
  t.state.ui = { screenStack: ['pause'] };
  t.step(); assert.equal(t.deployed(), false);
  t.state.ui.screenStack = [];
  t.step(); assert.equal(t.deployed(), false);
  t.pulse(); t.step(); assert.equal(t.deployed(), true, 'the first deliberate tap is not swallowed');
  t.step(); assert.equal(t.deployed(), false);
  t.drain(t.frame({ deployShieldPylon: true }));
  t.state.ui.screenStack = ['pause'];
  t.step(); assert.equal(t.deployed(), false);
  t.state.ui.screenStack = [];
  t.step(); assert.equal(t.deployed(), false, 'holding across the menu is not a fresh tap');
  t.drain(t.frame()); t.step();
  t.pulse(); t.step(); assert.equal(t.deployed(), true);
});

test('a disabled touch deck and a sector transition discard pending pylon placements', () => {
  for (const cancel of [
    t => t.drain({ type: 'touchFrame', frame: { active: false } }),
    t => { t.state.world.currentSectorId = 'sector_b'; },
  ]) {
    const t = workerTouch(); t.pulse(); cancel(t);
    t.step(); assert.equal(t.deployed(), false);
    t.step(); assert.equal(t.deployed(), false);
    t.pulse(); t.step(); assert.equal(t.deployed(), true);
    t.step(); assert.equal(t.deployed(), false);
  }
});

test('touch pylon buffering keeps the existing 64-edge bound and cannot replay overflow later', () => {
  const t = workerTouch();
  for (let i = 0; i < 100; i++) t.pulse();
  assert.equal(t.host._keyEdgeQueue.length, 64);
  for (let i = 0; i < 64; i++) { t.step(); assert.equal(t.deployed(), true); }
  t.step(); assert.equal(t.deployed(), false);
  t.drain(t.frame()); t.step(); assert.equal(t.deployed(), false);
});

test('keyboard pylon taps honor remaps and deliberate unbinding alongside buffered touch taps', () => {
  const t = workerTouch();
  t.key('Digit6', true); t.key('Digit6', false); t.pulse();
  for (const expected of [true, true, false]) { t.step(); assert.equal(t.deployed(), expected); }
  const remap = boot({ bindings: { deployShieldPylon: ['KeyP'] } });
  remap.key('Digit6', true); remap.key('Digit6', false); remap.step();
  assert.equal(remap.state.input.actions.deployShieldPylon, false);
  remap.key('KeyP', true); remap.key('KeyP', false); remap.step();
  assert.equal(remap.state.input.actions.deployShieldPylon, true);
  remap.step(); assert.equal(remap.state.input.actions.deployShieldPylon, false);
  const unbound = boot({ bindings: { deployShieldPylon: [] } });
  unbound.key('Digit6', true); unbound.key('Digit6', false); unbound.step();
  assert.equal(unbound.state.input.actions.deployShieldPylon, false);
});

test('the real controller pylon chord deploys once without cycling ordnance on modifier release', () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const pad = { id: 'input-pylon-standard', index: 0, connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [pad] } });
  try {
    const t = boot();
    t.state.settings.controls.gamepad.enabled = true;
    const button = (i, held) => { pad.buttons[i] = { pressed: held, value: held ? 1 : 0 }; };
    t.step(); button(5, true); t.step(); // RB, then left: pylon, not ordnance cycle.
    button(14, true); t.step();
    assert.equal(t.state.input.actions.deployShieldPylon, true);
    assert.equal(t.state.input.actions.cycleBomb, false);
    t.step(); assert.equal(t.state.input.actions.deployShieldPylon, false);
    button(5, false); t.step();
    assert.equal(t.state.input.actions.cycleBomb, false, 'a consumed chord key stays consumed until released');
    button(14, false); t.step(); button(14, true); t.step();
    assert.equal(t.state.input.actions.cycleBomb, true, 'the next solo press still cycles');
    assert.equal(t.state.input.actions.deployShieldPylon, false);
  } finally {
    if (prior) Object.defineProperty(globalThis, 'navigator', prior); else delete globalThis.navigator;
  }
});

test('the real main-lane mobile catalog and bridge still deploy one pylon per tap without keyboard writes', () => {
  const t = boot();
  const touch = { active: false, axes: {}, actions: {}, _btnHeld: {}, _btnPulse: {},
    tick() { for (const a of ['fire', 'boost']) this.actions[a] = { held: !!this._btnHeld[a] }; },
    _clearTouchState() {}, isConnected() { return this.active; } };
  const doc = { body: { classList: { contains: () => false } }, documentElement: { dataset: {} } };
  const win = { innerWidth: 390, innerHeight: 844, navigator: { maxTouchPoints: 5 }, matchMedia: () => ({ matches: true }) };
  enhanceMobileTouch(touch, { state: t.state, bus: t.sim.bus }, { win, doc,
    mountView: () => ({ root: {}, render() {}, applyConfig() {}, cancelAll() {}, destroy() {} }) });
  touch.autoDetect(); t.host.touch = touch;
  t.step();
  const before = { ...t.host._keys };
  const power = ALL_POWERS.find(p => p.id === 'deployShieldPylon');
  assert.ok(power, 'the new gear is reachable in the default touch catalog');
  touch.mobile.activate(power); t.step();
  assert.equal(t.state.input.actions.deployShieldPylon, true);
  t.step(); assert.equal(t.state.input.actions.deployShieldPylon, false);
  t.step(); assert.equal(t.state.input.actions.deployShieldPylon, false);
  assert.deepEqual({ ...t.host._keys }, before);
});
