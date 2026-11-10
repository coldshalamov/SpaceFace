/**
 * Iron Maw spawn gate. `_promoteSectorToFull` returned early whenever the bag already held a
 * combat hull (a rematerialized mission target or a projected raid recipe), so the normal
 * neighbor promote (REDUCED -> FULL, e.g. Charon -> Ashfall Reach) never ran `_spawnBossIfDue`
 * and the boss stayed absent on every later promote too (fullExtrasBuilt latched).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { RESIDENCY_TIER } from '../src/data/sectorCoordinates.js';

const SECTOR = 'sector_ashfall_reach';

function bootWorld(seed = 42) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, world, helpers };
}

const bosses = (state) => [...state.entities.values()]
  .filter((e) => e && e.alive !== false && e.data && e.data.isBoss);

test('REDUCED -> FULL promote with a combat hull already in the bag still spawns the Iron Maw', () => {
  const { state, world, helpers } = bootWorld(42);
  world._ensureSectorMaterialized(SECTOR, RESIDENCY_TIER.REDUCED);
  const active = state.world.sectorContents[SECTOR];
  assert.ok(active, 'Ashfall bag materialized');
  assert.equal(bosses(state).length, 0, 'REDUCED never carries the boss');
  // Stand-in for a rematerialized mission target / sectorSim raid recipe hull.
  const raider = helpers.spawnEntity({
    type: 'ship', pos: { x: 500, z: 500 }, radius: 4, mass: 12, hull: 50, hullMax: 50,
    data: { homeSectorId: SECTOR },
  });
  active.enemies.push(raider.id);

  world._promoteSectorToFull(SECTOR);

  const found = bosses(state);
  assert.equal(found.length, 1, 'exactly one boss after promote');
  assert.equal(active.boss && active.boss.entityId, found[0].id);
  assert.equal(found[0].data.bossSectorId, SECTOR);
  assert.equal(active.fullExtrasBuilt, true);

  // Idempotent: a repeat promote must not stack a second boss.
  world._promoteSectorToFull(SECTOR);
  assert.equal(bosses(state).length, 1);
});

test('promote respects a defeated boss and never respawns it', () => {
  const { state, world, helpers } = bootWorld(43);
  world._ensureSectorMaterialized(SECTOR, RESIDENCY_TIER.REDUCED);
  const active = state.world.sectorContents[SECTOR];
  const raider = helpers.spawnEntity({
    type: 'ship', pos: { x: 500, z: 500 }, radius: 4, mass: 12, hull: 50, hullMax: 50,
    data: { homeSectorId: SECTOR },
  });
  active.enemies.push(raider.id);
  const disc = world._discoveryFor(SECTOR);
  disc.pois = disc.pois || {};
  disc.pois.poi_boss = { discovered: true, identified: true, bossDefeated: true };

  world._promoteSectorToFull(SECTOR);
  assert.equal(bosses(state).length, 0);
});

test('plain REDUCED -> FULL promote (no prior combat hull) still spawns the boss once', () => {
  const { state, world } = bootWorld(44);
  world._ensureSectorMaterialized(SECTOR, RESIDENCY_TIER.REDUCED);
  world._promoteSectorToFull(SECTOR);
  assert.equal(bosses(state).length, 1);
});

test('save:restoring clears the corridor dwell candidate and deferred critical ids', () => {
  const { state, world } = bootWorld(45);
  world._membershipCandidate = { sectorId: SECTOR, sinceT: 9999 };
  world._deferredCriticalRecordIds.set('rec_x', SECTOR);
  world.bus.emit('save:restoring', {});
  assert.equal(world._membershipCandidate, null);
  assert.equal(world._deferredCriticalRecordIds.size, 0);
  assert.ok(state);
});
