// HARMONY-FIX 5 (R23): the field of view moves only for the player's own acts, through the one
// camera gate, one beat per 250 ms. Hits, kills, collisions and moments never punch it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { createCameraGate, FOV_BEAT_GAP_S } from '../src/render/shakeAdmission.js';
import { feel } from '../src/render/feel.js';

function feelHost() {
  const state = {
    mode: 'flight', playerId: 1, timeScale: 1, simTime: 10,
    settings: { video: { motionReduce: false } },
    ui: { screenStack: [], docked: false },
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 } }]]),
    render: { cameraCtrl: { addTrauma() {}, impactKick() {}, hold() { return true; } } },
  };
  const bus = createBus();
  const host = Object.create(feel);
  host._injectStyle = () => {}; host._mountVignette = () => {}; host._ensureVignette = () => null; host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: createTimeEffects(state) });
  return { state, bus, host };
}

test('gate: fov admits only own-class causes and one beat per 250 ms', () => {
  const gate = createCameraGate();
  assert.equal(gate.motion('fov', 'hitFov', 2.2, 1), 0, 'a hit never zooms');
  assert.equal(gate.motion('fov', 'killFov', 4, 1), 0, 'a kill never zooms');
  assert.equal(gate.motion('fov', 'collisionFov', 2, 1), 0);
  assert.equal(gate.motion('fov', 'momentFov', 3, 1), 0);
  assert.equal(gate.motion('fov', 'nonsense', 3, 1), 0, 'unknown causes are refused');
  assert.equal(gate.motion('fov', 'boostFov', 2, 2), 2, 'the player\'s boost is admitted');
  assert.equal(gate.motion('fov', 'jumpFov', 6, 2 + FOV_BEAT_GAP_S / 2), 0, 'second beat inside 250 ms is refused');
  assert.equal(gate.motion('fov', 'jumpFov', -3, 2 + FOV_BEAT_GAP_S + 0.01), -3, 'a dip is admitted after the window');
  assert.ok(gate.counts().refused.hitFov >= 1);
});

test('a kill plus a hit in one tick leaves no field-of-view punch', () => {
  const { state, bus, host } = feelHost();
  bus.emit('combat:damage', { attackerId: 8, targetId: 1, brokeShield: true, amount: 60 });
  bus.emit('entity:killed', { id: 9, killerId: 1, pos: { x: 10, z: 0 }, victimClass: 'interceptor' });
  assert.equal(host._fovPunch, 0);
  assert.equal(state.timeScale, 1);
});

test('the player\'s own boost and jump still move the view, once per window', () => {
  const { state, bus, host } = feelHost();
  bus.emit('ship:boostPreKick', { shipId: 1 });
  assert.ok(host._fovPunch > 0, 'boost keeps its widening');
  const first = host._fovPunch;
  bus.emit('ship:boostPreKick', { shipId: 1 });
  assert.equal(host._fovPunch, first, 'a second boost inside 250 ms adds nothing');
  state.simTime += 1;
  bus.emit('jump:start', {});
  assert.ok(host._fovPunch > first, 'a jump keeps its beat');
});
