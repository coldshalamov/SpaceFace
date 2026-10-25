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
