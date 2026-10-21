// RC-45 — the pad feels dash, hits, kills and big moments. A player dash, hit
// taken or kill scored lays a pulse; NPC versions of the same events stay
// silent. The 83 ms one-live-pulse gap and the 'off' haptics axis hold.

import test from 'node:test';
import assert from 'node:assert/strict';

let installedPad = null;
function makePad() {
  return {
    id: 'SpaceFace Synthetic Pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 1,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    vibrationActuator: {
      calls: [],
      playEffect(type, params) { this.calls.push({ type, params }); return Promise.resolve('complete'); },
      reset() { this.resetCalls = (this.resetCalls || 0) + 1; },
      resetCalls: 0,
    },
  };
}
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => (installedPad ? [installedPad] : []) },
  configurable: true,
});

const {
  createGamepad,
  HAPTIC_VERB_PULSES,
  HAPTIC_PULSE_MIN_GAP_TICKS,
} = await import('../src/systems/gamepad.js');
const { createBus } = await import('../src/core/eventBus.js');

function padState(haptics = 'full') {
  return {
    tick: 1,
    mode: 'flight',
    playerId: 1,
    player: { tether: { active: false, load: 0 } },
    input: {},
    settings: {
      controls: { gamepad: { enabled: true } },
      accessibility: { haptics, reduceMotion: false },
    },
    entities: new Map([[1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }]]),
  };
}

function step(gp, state, n = 1) {
  for (let i = 0; i < n; i++) { state.tick += 1; gp.tick(1 / 60, state); }
}

test('RC-45: a player dash, hit, kill and base drop each pulse', () => {
  installedPad = makePad();
  const bus = createBus();
  const state = padState();
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);

  const cases = [
    ['ship:dash', { shipId: 1 }],
    ['projectile:hit', { targetId: 1, ownerId: 9, damage: 20 }],
    ['entity:killed', { id: 9, killerId: 1 }],
    ['combat:baseDestroyed', { type: 'pirate_base', killerId: 1 }],
  ];
  for (const [event, payload] of cases) {
    step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2);
    bus.emit(event, payload);
    step(gp, state);
    assert.ok(gp.haptics.pulse, `${event} lays a pulse over the continuous channels`);
    assert.equal(gp._lastVerbPulse, event);
    assert.equal(gp.haptics.pulse.strong, HAPTIC_VERB_PULSES[event].strong);
    assert.equal(gp.haptics.pulse.weak, HAPTIC_VERB_PULSES[event].weak);
  }
});

test('RC-45: NPC dashes, hits and kills stay silent', () => {
  installedPad = makePad();
  const bus = createBus();
  const state = padState();
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);

  bus.emit('ship:dash', { shipId: 9 });
  step(gp, state);
  assert.equal(gp.haptics.pulse, null, 'an NPC dash is silent');
  bus.emit('projectile:hit', { targetId: 9, ownerId: 1, damage: 20 });
  step(gp, state);
  assert.equal(gp.haptics.pulse, null, 'a hit landing on an NPC is silent');
  bus.emit('entity:killed', { id: 7, killerId: 9 });
  step(gp, state);
  assert.equal(gp.haptics.pulse, null, 'an NPC-on-NPC kill is silent');
  bus.emit('combat:baseDestroyed', { type: 'pirate_base', killerId: 9 });
  step(gp, state);
  assert.equal(gp.haptics.pulse, null, 'a base an NPC dropped is silent');
});

test('RC-45: the off axis still silences every channel', () => {
  installedPad = makePad();
  const bus = createBus();
  const state = padState('off');
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);
  bus.emit('ship:dash', { shipId: 1 });
  step(gp, state);
  assert.equal(installedPad.vibrationActuator.calls.length, 0, 'off holds — nothing reaches the actuator');
});
