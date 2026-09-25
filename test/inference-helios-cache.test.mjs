// A ropeable cache sits beside The Candle Fleet on a new Helios game.
// Seed 4242, no mission accept: the pod is a legal Massline target, and splitting
// it spills at least one pickup of a commodity the loot system already knows.
//
// Run: node --test test/inference-helios-cache.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { HELIOS_ROPE_CACHE } from '../src/data/worldOneOffs.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { SECTORS } from '../src/data/sectors.js';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { mining } from '../src/systems/mining.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const PLACE_GLB = fileURLToPath(new URL(
  `../assets/ships/release/parts/places/${HELIOS_ROPE_CACHE.placeId}.glb`,
  import.meta.url,
));
const LATCH = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard').maxLength;

function bootHelios() {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [physics, world, mining] });
  const { state } = sim;
  state.mode = 'flight';
  sim.registry.get('world').newGame();
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector('sector_helios_prime');
  return { sim, state, player };
}

test('seed 4242 places a ropeable Candle Fleet cache that splits into a known commodity', () => {
  assert.ok(existsSync(PLACE_GLB), `${HELIOS_ROPE_CACHE.placeId}.glb is a place the game already ships`);
  assert.ok(COMMODITIES.some((row) => row.id === HELIOS_ROPE_CACHE.commodityId),
    'the spill commodity is one the loot tables already know');
  assert.equal(SECTORS.find((sector) => sector.id === 'sector_helios_prime')
    .pois.find((poi) => poi.id === HELIOS_ROPE_CACHE.landmarkPoiId).name, 'The Candle Fleet');

  const { sim, state, player } = bootHelios();
  assert.equal(state.meta.seed, 4242);
  assert.equal(state.missions.active.length, 0, 'the cache is there without accepting a mission');

  const pod = state.entityList.find((entity) => entity
    && entity.alive !== false
    && entity.data
    && entity.data.oneOffId === HELIOS_ROPE_CACHE.id);
  assert.ok(pod, 'seed 4242 spawns the cache');
  assert.equal(pod.data.placeId, HELIOS_ROPE_CACHE.placeId);
  assert.equal(pod.type, 'payload');
  assert.equal(isAttachable(pod, state.playerId, state), true, 'the cache is a legal Massline target');

  const memorial = state.entityList.find((entity) => entity
    && entity.alive !== false
    && entity.data
    && entity.data.poiId === HELIOS_ROPE_CACHE.landmarkPoiId);
  assert.ok(memorial, 'The Candle Fleet landmark is in the sector');
  const distance = Math.hypot(pod.pos.x - memorial.pos.x, pod.pos.z - memorial.pos.z);
  assert.ok(distance <= LATCH, `cache is ${distance.toFixed(1)} WU from the landmark, inside latch ${LATCH}`);
  assert.ok(distance > (memorial.radius || 0), 'the pod is beside the memorial, not inside it');

  sim.registry.get('mining')._splitCargoPod(player, pod);
  const pickups = state.entityList.filter((entity) => entity
    && entity.alive !== false
    && entity.type === 'pickup'
    && entity.data
    && entity.data.commodityId === HELIOS_ROPE_CACHE.commodityId
    && entity.data.amount >= 1);
  assert.ok(pickups.length >= 1, 'splitting the cache spills at least one pickup of the named commodity');
});
