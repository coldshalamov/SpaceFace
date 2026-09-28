import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';

function boot(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      entity.alive = true;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = helpers.spawnEntity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 16, mass: 58, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const system = Object.create(aftermathWrecks);
  system.init({ state, bus, helpers, registry: { get: () => system } });
  return { state, bus, helpers, player, spawned, system };
}

test('a player kill in adventure leaves the hull and a companion shard at kill momentum', () => {
  const h = boot();
  try {
    const victim = h.helpers.spawnEntity({
      type: 'ship', team: 1,
      pos: { x: 80, z: 12 }, vel: { x: 40, z: -8 }, rot: 0.4,
      radius: 14, mass: 22, hull: 40, hullMax: 40,
      data: { defId: 'ship_wasp', shipClass: 'wasp' },
    });
    const before = new Set(h.state.entityList);
    victim.alive = false;
    h.bus.emit('entity:killed', {
      id: victim.id, killerId: h.player.id, type: 'ship',
      pos: { ...victim.pos }, victimClass: 'wasp',
    });
    const spawnedNow = h.state.entityList.filter((entity) => entity && !before.has(entity) && entity.type === 'wreck');
    assert.equal(spawnedNow.length, 2, 'adventure player kills throw a hull and a shard');
    const wreck = spawnedNow.find((entity) => entity.data && entity.data.markerId);
    const shard = spawnedNow.find((entity) => entity.data && entity.data.arenaShardOf);
    assert.ok(wreck && shard);
    assert.equal(shard.data.arenaShardOf, wreck.data.markerId);
    assert.ok(Math.hypot(wreck.vel.x - 40, wreck.vel.z + 8) < 1, 'the hull keeps death momentum');
  } finally {
    h.bus.clear();
  }
});

test('an NPC-on-NPC death still materializes one hull without a thrown shard', () => {
  const h = boot(8008);
  try {
    const victim = h.helpers.spawnEntity({
      type: 'ship', team: 1, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 },
      radius: 12, mass: 16, hull: 30, hullMax: 30, data: { defId: 'ship_wasp' },
    });
    const before = new Set(h.state.entityList);
    victim.alive = false;
    h.bus.emit('entity:killed', {
      id: victim.id, killerId: 99, type: 'ship', pos: { ...victim.pos },
    });
    const spawnedNow = h.state.entityList.filter((entity) => entity && !before.has(entity) && entity.type === 'wreck');
    assert.equal(spawnedNow.filter((entity) => entity.data && entity.data.markerId).length, 1);
    assert.equal(spawnedNow.filter((entity) => entity.data && entity.data.arenaShardOf).length, 0);
  } finally {
    h.bus.clear();
  }
});
