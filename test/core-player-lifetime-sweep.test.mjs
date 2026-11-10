import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';

test('lifetimeSweep does not recycle or drop the current player wreck', () => {
  const sim = createSimulation({ seed: 3, systems: [] });
  const player = sim.spawn({ type: 'ship', pos: { x: 8, z: -4 } });
  sim.state.playerId = player.id;
  const playerId = player.id;

  const npc = sim.spawn({ type: 'ship', pos: { x: 40, z: 0 } });
  const npcId = npc.id;

  player.alive = false;
  npc.alive = false;
  sim.step(SIM_DT);

  assert.equal(sim.state.entities.get(playerId), player, 'defeated player must remain addressable');
  assert.equal(player.alive, false);
  assert.ok(!sim.state.freeIds.includes(playerId), 'player id must not return to the allocator');
  assert.equal(sim.helpers.player(), player);

  assert.equal(sim.state.entities.get(npcId), undefined, 'ordinary dead ships still despawn');
  assert.ok(sim.state.freeIds.includes(npcId));

  const extra = sim.spawn({ type: 'projectile', pos: { x: 1, z: 1 } });
  assert.notEqual(extra.id, playerId, 'a later spawn must not steal the player id');
  assert.equal(sim.state.entities.get(playerId), player);
});

test('lifetimeSweep does not expire the current player via TTL', () => {
  const sim = createSimulation({ seed: 11, systems: [] });
  const player = sim.spawn({ type: 'ship', ttl: 0 });
  sim.state.playerId = player.id;

  sim.step(SIM_DT);

  assert.equal(player.alive, true, 'player hull is not a timed entity');
  assert.equal(sim.state.entities.get(player.id), player);
});
