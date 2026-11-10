// Quiet latch for idle massline swing-trace residual under prepareFrame / vfx.
// Soft-GPU fps not claimed. Picture unchanged while no tether latch is live.


import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';

const DT = 1 / 60;
const PLAYER_ID = 1;
const TARGET_ID = 42;

function makeHarness() {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
  };
  const target = {
    id: TARGET_ID,
    type: 'asteroid',
    alive: true,
    pos: { x: 40, z: 0 },
    vel: { x: 0, z: 18 },
    rot: 0,
    radius: 4,
  };
  const state = {
    playerId: PLAYER_ID,
    player: {
      tether: { active: false, targetId: null },
      remoteMassline: { active: false, sourceId: null, targetId: null },
    },
    entities: new Map([[PLAYER_ID, player], [TARGET_ID, target]]),
    entityList: [player, target],
    simTime: 0,
    tick: 0,
    settings: {
      video: { particleQuality: 'low', motionReduce: false, engineTrails: false },
      accessibility: { flashReduce: false },
    },
    render: { scene },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({
    state,
    bus,
    helpers: {
      player: () => player,
    },
  });
  return { system, state, bus, player, target };
}

test('swing-trace quiet-latches after idle empty and wakes on tether latch', () => {
  const { system, state, target } = makeHarness();
  assert.ok(system._masslineSwingTrace, 'swing-trace mesh must init');

  for (let i = 0; i < 4; i++) system._updateMasslineSwingTrace(DT);
  assert.equal(system._swingTraceQuietIdle, true, 'idle swing-trace must quiet-latch');
  assert.equal(system._masslineSwingTrace.mesh.visible, false);

  const fadeBefore = system._masslineSwingTrace.trace.fade;
  const countBefore = system._masslineSwingTrace.trace.count;
  for (let i = 0; i < 30; i++) {
    assert.equal(system._updateMasslineSwingTrace(DT), false);
  }
  assert.equal(system._swingTraceQuietIdle, true);
  assert.equal(system._masslineSwingTrace.trace.fade, fadeBefore);
  assert.equal(system._masslineSwingTrace.trace.count, countBefore);

  // Dirty wake: player tether latch with tangentially swinging target
  state.player.tether = { active: true, targetId: TARGET_ID };
  assert.equal(system._swingTraceQuietMaybeAwake(), true);
  // Target has tangential speed relative to source at rest → samples push
  target.vel = { x: 0, z: 40 };
  target.pos = { x: 40, z: 0 };
  system._updateMasslineSwingTrace(DT);
  assert.equal(system._swingTraceQuietIdle, false, 'tether latch must clear quiet latch');
  assert.ok(system._masslineSwingTrace.trace.fade > 0, 'fade must rise while latched live');
});

test('swing-trace quiet-latches wake on remote massline', () => {
  const { system, state } = makeHarness();
  for (let i = 0; i < 4; i++) system._updateMasslineSwingTrace(DT);
  assert.equal(system._swingTraceQuietIdle, true);

  state.player.remoteMassline = {
    active: true,
    sourceId: PLAYER_ID,
    targetId: TARGET_ID,
  };
  assert.equal(system._swingTraceQuietMaybeAwake(), true);
  system._updateMasslineSwingTrace(DT);
  assert.equal(system._swingTraceQuietIdle, false);
});

test('swing-trace boundary reset clears quiet latch', () => {
  const { system } = makeHarness();
  for (let i = 0; i < 4; i++) system._updateMasslineSwingTrace(DT);
  assert.equal(system._swingTraceQuietIdle, true);
  system._resetMasslineSwingTrace();
  assert.equal(system._swingTraceQuietIdle, false);
});
