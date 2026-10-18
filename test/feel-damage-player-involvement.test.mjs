import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { feel } from '../src/render/feel.js';

function feelHost(playerId = 1) {
  const traumas = [];
  const player = playerId == null ? null : { id: playerId, pos: { x: 0, z: 0 } };
  const state = {
    mode: 'flight',
    playerId,
    timeScale: 1,
    settings: { video: { motionReduce: false } },
    ui: { screenStack: [], docked: false },
    entities: player ? new Map([[playerId, player]]) : new Map(),
    render: { cameraCtrl: { addTrauma: (value) => traumas.push(value) } },
  };
  const bus = createBus();
  const effects = createTimeEffects(state);
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: effects });
  return { state, bus, effects, host, traumas };
}

// The authored beat window a fired beat leaves armed, whichever internal field carries it —
// evidence that a beat landed, never a clock contract. Beats are presentation only.
function beatWindow(host) {
  return host._beatTimer ?? host._hsTimer ?? 0;
}

const receipts = [
  { brokeShield: true, amount: 60 },
  { amount: 60 },
  { amount: 8, killing: true },
  { hullHit: true, amount: 60 },
  { armorHit: true, amount: 60 },
];

for (const receipt of receipts) {
  test(`NPC-only damage leaves flight time and camera alone: ${JSON.stringify(receipt)}`, () => {
    const { state, bus, effects, host, traumas } = feelHost();
    // Repeated off-screen combat must not keep renewing a global time dip while UI animates.
    for (let frame = 0; frame < 60; frame += 1) {
      bus.emit('combat:damage', { attackerId: 8, targetId: 9, ...receipt });
      assert.equal(state.timeScale, 1);
      assert.deepEqual(effects.describeRequests(), {});
      host.frame(1 / 60, state);
    }
    assert.equal(beatWindow(host), 0);
    assert.equal(host._fovPunch, 0);
    assert.deepEqual(traumas, []);
  });
}

test('player shield damage and player-fired shield breaks keep their feedback — clock untouched', () => {
  for (const participants of [
    { attackerId: 8, targetId: 1 },
    { attackerId: 1, targetId: 8 },
    { attackerId: 8, targetId: 9, isPlayer: true },
  ]) {
    const { state, bus, effects, host, traumas } = feelHost();
    bus.emit('combat:damage', { ...participants, brokeShield: true, amount: 60 });
    assert.equal(state.timeScale, 1, 'the shield-break beat is presentation only');
    assert.ok(host._fovPunch > 0);
    assert.deepEqual(traumas, [0.3]);
    assert.deepEqual(effects.describeRequests(), {});
    host.frame(0.05, state);
    assert.equal(state.timeScale, 1);
    assert.deepEqual(effects.describeRequests(), {});
  }
});

test('large player hits keep their beat window, ordinary hull and armor hits stay rhythmic', () => {
  for (const receipt of receipts.slice(1)) {
    for (const participants of [
      { attackerId: 8, targetId: 1 },
      { attackerId: 1, targetId: 8 },
    ]) {
      const { state, bus, host } = feelHost();
      bus.emit('combat:damage', { ...participants, ...receipt });
      const rhythmic = receipt.hullHit || receipt.armorHit;
      assert.equal(state.timeScale, 1, 'no damage beat may ever write the clock');
      assert.ok(host._fovPunch > 0);
      if (rhythmic) {
        assert.equal(beatWindow(host), 0, 'ordinary hits stay rhythmic — no held window');
      } else {
        assert.ok(beatWindow(host) > 0, 'a big hit still arms its authored beat window');
      }
      host.frame(0.1, state);
      assert.equal(state.timeScale, 1);
    }
  }
});

test('missing player and receipt IDs cannot accidentally identify a player hit', () => {
  const { state, bus, host } = feelHost(null);
  delete state.playerId;
  bus.emit('combat:damage', { brokeShield: true, amount: 60 });
  assert.equal(state.timeScale, 1);
  assert.equal(host._fovPunch, 0);
});

test('far NPC kills leave the camera alone while nearby action keeps its light feedback', () => {
  const far = feelHost();
  far.bus.emit('entity:killed', {
    id: 9,
    killerId: 8,
    pos: { x: 10000, z: 10000 },
    victimClass: 'interceptor',
  });
  assert.equal(far.state.timeScale, 1);
  assert.deepEqual(far.effects.describeRequests(), {});
  assert.equal(beatWindow(far.host), 0);
  assert.equal(far.host._fovPunch, 0);

  const nearby = feelHost();
  nearby.bus.emit('entity:killed', {
    id: 10,
    killerId: 8,
    pos: { x: 120, z: 0 },
    victimClass: 'interceptor',
  });
  assert.equal(nearby.state.timeScale, 1, 'nearby NPC feedback stays a camera punch, not a freeze');
  assert.ok(nearby.host._fovPunch > 0, 'nearby NPC action keeps its authored light punch');
});

test('player kills keep the full kill beat — presentation only, clock untouched', () => {
  const { state, bus, effects, host } = feelHost();
  bus.emit('entity:killed', {
    id: 9,
    killerId: state.playerId,
    pos: { x: 10000, z: 10000 },
    victimClass: 'interceptor',
  });
  assert.equal(state.timeScale, 1, 'the kill beat never writes the clock');
  assert.ok(beatWindow(host) > 0);
  assert.ok(host._fovPunch > 0);
  assert.deepEqual(effects.describeRequests(), {});
});

test('player death keeps its independent death punch — presentation only', () => {
  const { state, bus, host } = feelHost();
  bus.emit('player:death');
  assert.ok(beatWindow(host) > 0);
  assert.ok(host._fovPunch >= 7);
  host.frame(0.3, state);
  assert.equal(state.timeScale, 1, 'the death beat is presentation only — the clock stays put');
});
