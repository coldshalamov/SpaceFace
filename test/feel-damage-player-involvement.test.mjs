import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { feel } from '../src/render/feel.js';

function feelHost(playerId = 1) {
  const traumas = [];
  const state = {
    mode: 'flight',
    playerId,
    timeScale: 1,
    settings: { video: { motionReduce: false } },
    ui: { screenStack: [], docked: false },
    entities: new Map(),
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
    assert.equal(host._hsTimer, 0);
    assert.equal(host._fovPunch, 0);
    assert.deepEqual(traumas, []);
  });
}

test('player shield damage and player-fired shield breaks keep their feedback and release', () => {
  for (const participants of [
    { attackerId: 8, targetId: 1 },
    { attackerId: 1, targetId: 8 },
    { attackerId: 8, targetId: 9, isPlayer: true },
  ]) {
    const { state, bus, effects, host, traumas } = feelHost();
    bus.emit('combat:damage', { ...participants, brokeShield: true, amount: 60 });
    assert.equal(state.timeScale, 0.12);
    assert.ok(host._fovPunch > 0);
    assert.deepEqual(traumas, [0.3]);
    assert.deepEqual(effects.describeRequests(), { 'feel:hit-stop': { scale: 0.12 } });
    host.frame(0.05, state);
    assert.equal(state.timeScale, 1);
    assert.deepEqual(effects.describeRequests(), {});
  }
});

test('large player hits retain a time dip, ordinary hull and armor hits stay rhythmic', () => {
  for (const receipt of receipts.slice(1)) {
    for (const participants of [
      { attackerId: 8, targetId: 1 },
      { attackerId: 1, targetId: 8 },
    ]) {
      const { state, bus, host } = feelHost();
      bus.emit('combat:damage', { ...participants, ...receipt });
      const rhythmic = receipt.hullHit || receipt.armorHit;
      assert.equal(state.timeScale, rhythmic ? 1 : 0.12);
      assert.ok(host._fovPunch > 0);
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
