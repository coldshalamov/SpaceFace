import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { HELIOS_ROPE_CACHE } from '../src/data/worldOneOffs.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { ships } from '../src/systems/ships.js';

function boot(playerPos = { x: 0, z: 0 }) {
  const sim = createSimulation({ seed: 4242, systems: [uniqueWrecks, npcJobsRuntime, ships] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { ...playerPos }, hull: 100, hullMax: 100,
    radius: 10, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const cache = sim.spawn({
    type: 'payload', pos: { x: 800, z: 0 }, radius: 8, hull: 20, hullMax: 20,
    data: { oneOffId: HELIOS_ROPE_CACHE.id, name: HELIOS_ROPE_CACHE.name },
  });
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  bus.emit('economy:tick', {});
  return { sim, state, bus, player, cache };
}

test('a scavenger moves on the Candle Fleet pod until a player arrives', () => {
  const h = boot();
  try {
    const thief = h.state.entityList.find((entity) => entity.data && entity.data.memorialThief);
    assert.ok(thief, 'the memorial thief spawns when the pod is unguarded');
    assert.equal(h.state.player.uniqueWrecks.memorialThief.spawned, true);
    thief.pos = { ...h.cache.pos };
    h.bus.emit('economy:tick', {});
    assert.equal(h.cache.alive, false);
    assert.equal(h.state.player.uniqueWrecks.memorialThief.stolen, true);
  } finally {
    h.sim.dispose();
  }
});

test('reaching the pod first marks the theft intercepted', () => {
  const h = boot({ x: 790, z: 0 });
  try {
    assert.equal(h.state.player.uniqueWrecks.memorialThief.intercepted, true);
    assert.equal(h.cache.alive, true);
    assert.equal(
      h.state.entityList.some((entity) => entity.data && entity.data.memorialThief && entity.alive),
      false,
    );
  } finally {
    h.sim.dispose();
  }
});
