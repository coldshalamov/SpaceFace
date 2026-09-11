// PQ-164.03 — haptics. Line tension, slams and boost on the pad's rumble motors.
//
// Done-when: a table test of intensity by momentum. Bar: intensity rises with momentum;
// reduce-motion is silent. Fixed seed 16403. Node only — no Chromium (PQ-194.01 holds the GPU).
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGamepad,
  computeHapticFrame,
  HAPTIC_REF_MOMENTUM,
  HAPTIC_SLAM_REF_DP,
} from '../src/systems/gamepad.js';
import { createBus } from '../src/core/eventBus.js';

const SEED = 16403;

function makePad() {
  const effects = [];
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
  return {
    id: 'SpaceFace Synthetic Pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 1,
    axes: [0, 0, 0, 0],
    buttons,
    vibrationActuator: {
      effects,
      playEffect(type, params) { effects.push({ type, ...params }); return Promise.resolve('complete'); },
      reset() { effects.push({ type: 'reset' }); },
      last(type) { for (let i = effects.length - 1; i >= 0; i--) if (effects[i].type === type) return effects[i]; return null; },
      lastAny() { return effects.length ? effects[effects.length - 1] : null; },
    },
  };
}

let installedPad = makePad();
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => [installedPad] },
  configurable: true,
});

function makeState(overrides = {}) {
  return {
    tick: 1,
    mode: 'flight',
    playerId: 1,
    player: { tether: { active: false, load: 0 } },
    input: {},
    settings: { controls: { gamepad: { enabled: true } }, video: { motionReduce: false } },
    entities: new Map([[1, { id: 1, type: 'ship', mass: 16, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }]]),
    ...overrides,
  };
}

test('PQ-164.03 seed 16403: table test of intensity by momentum', () => {
  const MOMENTA = [0, 30, 60, 90, 120, 150]; // WU/s
  const rows = MOMENTA.map((m) => {
    const m01 = Math.min(1, m / HAPTIC_REF_MOMENTUM);
    // Each channel is driven by the momentum of its own physical scenario: a tensioned line, an
    // impact, and a held boost at that speed. All three read stronger as the momentum rises.
    const line = computeHapticFrame({ momentum: m, lineActive: true, lineLoad: m01 });
    const slam = computeHapticFrame({ momentum: m, slam: m01 });
    const boost = computeHapticFrame({ momentum: m, boost: true });
    return { m, line: line.line, slam: slam.slam, boost: boost.boost };
  });

  const header = 'momentum(WU/s) | line tension |   slam   |  boost';
  console.log(`[pq-164.03] seed ${SEED} — rumble intensity by momentum`);
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const r of rows) {
    console.log(
      `${String(r.m).padStart(13)} | ${r.line.toFixed(4).padStart(12)} | ${r.slam.toFixed(4).padStart(8)} | ${r.boost.toFixed(4).padStart(7)}`,
    );
  }

  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].line >= rows[i - 1].line, `line tension must not fall at ${rows[i].m} WU/s`);
    assert.ok(rows[i].slam >= rows[i - 1].slam, `slam must not fall at ${rows[i].m} WU/s`);
    assert.ok(rows[i].boost >= rows[i - 1].boost, `boost must not fall at ${rows[i].m} WU/s`);
  }
  assert.ok(rows[rows.length - 1].line > rows[0].line, 'line tension rises with momentum');
  assert.ok(rows[rows.length - 1].slam > rows[0].slam, 'slam rises with momentum');
  assert.ok(rows[rows.length - 1].boost > rows[0].boost, 'boost rises with momentum');
});

test('PQ-164.03: reduce-motion is silent on every channel', () => {
  const loud = computeHapticFrame({ momentum: 999, lineActive: true, lineLoad: 1, boost: true, slam: 1 });
  assert.ok(loud.strong > 0.9 && loud.weak > 0.9, 'a full frame is a real frame');
  const quiet = computeHapticFrame({
    momentum: 999, lineActive: true, lineLoad: 1, boost: true, slam: 1, reduceMotion: true,
  });
  assert.deepEqual(quiet, {
    enabled: false, reduceMotion: true, momentum: 0, line: 0, slam: 0, boost: 0, weak: 0, strong: 0,
  });
});

test('PQ-164.03: shipped tick drives dual-rumble; reduce-motion resets the motors', () => {
  const pad = makePad();
  installedPad = pad;
  const bus = createBus();
  const state = makeState();
  state.entities.get(1).vel = { x: HAPTIC_REF_MOMENTUM, z: 0 }; // full-speed
  pad.buttons[5] = { pressed: true, value: 1, touched: true };  // RB / R1 = boost

  const gp = createGamepad({ bus, state });
  state.tick = 1;
  gp.tick(0.016, state);
  assert.equal(gp.connected, true);
  assert.ok(gp.haptics.boost > 0, 'held boost resolves a boost channel');
  const boostEffect = pad.vibrationActuator.last('dual-rumble');
  assert.ok(boostEffect, 'boost must play a dual-rumble effect');
  assert.ok(boostEffect.weakMagnitude > 0 && boostEffect.strongMagnitude > 0);

  // Boost released, coasting: no rumble, and the motors are reset once.
  pad.buttons[5] = { pressed: false, value: 0, touched: false };
  state.tick = 2;
  gp.tick(0.016, state);
  assert.equal(gp.haptics.enabled, true);
  assert.equal(gp.haptics.boost, 0);
  assert.equal(pad.vibrationActuator.lastAny().type, 'reset');

  // A line under load rumbles even while coasting.
  state.player.tether = { active: true, load: 0.6 };
  state.tick = 3;
  gp.tick(0.016, state);
  assert.equal(gp.haptics.line, 0.6);
  assert.equal(state.player.tether.active && gp.haptics.line > 0, true);

  // A full player slam drives the strong motor, then decays on sim ticks.
  bus.emit('physics:impact', { playerInvolved: true, aId: 1, bId: 2, dp: HAPTIC_SLAM_REF_DP, tick: 3 });
  state.tick = 4;
  gp.tick(0.016, state);
  assert.ok(gp.haptics.slam > 0.9, `full slam reads ~1 (got ${gp.haptics.slam})`);
  assert.ok(pad.vibrationActuator.last('dual-rumble').strongMagnitude > 0.9);

  // Reduce-motion goes quiet and releases the motors.
  state.settings.video.motionReduce = true;
  state.tick = 5;
  gp.tick(0.016, state);
  assert.equal(gp.haptics.enabled, false);
  assert.equal(gp.haptics.strong, 0);
  assert.equal(pad.vibrationActuator.lastAny().type, 'reset');
});
