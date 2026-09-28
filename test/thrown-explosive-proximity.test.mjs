import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  JETTISONED_CARGO_PAYLOAD_TYPE,
  THROWN_EXPLOSIVE_GRACE_S,
  lootShards,
} from '../src/systems/lootShards.js';

function boot() {
  const state = createGameState(9);
  state.mode = 'flight';
  state.simTime = 0;
  const bus = createBus();
  const impulses = [];
  const slams = [];
  bus.on('cargo:volatileSlam', (payload) => slams.push(payload));
  const helpers = {
    combatPhysics: {
      applyImpulse(request) { impulses.push(request); return true; },
    },
  };
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 400, z: 0 } };
  const hostile = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 40, z: 0 } };
  const pod = {
    id: 10, type: 'payload', alive: true, pos: { x: 30, z: 0 },
    data: {
      payloadType: JETTISONED_CARGO_PAYLOAD_TYPE,
      volatileClass: 'explosive',
      amount: 8,
    },
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entities.set(hostile.id, hostile);
  state.entities.set(pod.id, pod);
  state.entityList = [player, hostile, pod];
  const system = Object.create(lootShards);
  system.init({ state, bus, helpers });
  return { state, bus, system, pod, player, hostile, impulses, slams };
}

test('a thrown explosive pod cooks off near a hull after the toss grace', () => {
  const h = boot();
  try {
    h.bus.emit('massline:throw', { payloadId: h.pod.id });
    assert.equal(h.pod.data.playerThrownFuse, true);
    h.system.update(1 / 60, h.state);
    assert.equal(h.slams.length, 1, 'hostiles inside the fuse ring detonate immediately');
    assert.equal(h.slams[0].thrownFuse, true);
    assert.equal(h.pod.data.thrownFuseDetonated, true);
    assert.ok(h.impulses.length >= 1);
  } finally {
    h.bus.clear();
  }
});

test('the thrower is not the fuse target during grace', () => {
  const h = boot();
  try {
    h.hostile.pos = { x: 800, z: 0 };
    h.player.pos = { x: 32, z: 0 };
    h.bus.emit('massline:throw', { payloadId: h.pod.id });
    h.system.update(1 / 60, h.state);
    assert.equal(h.slams.length, 0, 'grace skips the thrower');
    h.state.simTime = THROWN_EXPLOSIVE_GRACE_S + 0.05;
    h.system.update(1 / 60, h.state);
    assert.equal(h.slams.length, 1);
    assert.equal(h.slams[0].thrownFuse, true);
  } finally {
    h.bus.clear();
  }
});
