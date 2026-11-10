import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { SECTORS } from '../src/data/sectors.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';

// WORLD-07 — Sker Bazaar has ships on the apron: seed 4242 entering sector_sker_haven spawns
// at least two non-player ships near station_sker, without raising enemyDensity.

const SKER = SECTORS.find((s) => s.id === 'sector_sker_haven');

function skerState(seed) {
  let nextId = 100;
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 10,
    meta: { seed },
    playerId: 1,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_sker_haven', records: { byId: {} } },
    traffic: { freighters: [], rngSeed: 0 },
    player: { cargo: { items: {}, capVolume: 500, usedVolume: 0, usedMass: 0, richLots: [] }, moduleInventory: [] },
  };
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: spec.id != null ? spec.id : nextId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
        flags: { ...(spec.flags || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const e = state.entities.get(id);
      if (e) e.alive = false;
    },
  };
  helpers.spawnEntity({ id: 1, type: 'ship', pos: { x: 0, z: 0 }, data: { name: 'Player' } });
  const station = helpers.spawnEntity({
    id: 10, type: 'station', radius: 80, pos: { x: 0, z: 0 },
    data: { stationId: 'station_sker', name: 'Sker Bazaar' },
  });
  return { state, bus, helpers, station };
}

test('WORLD-07 seed 4242 puts at least two non-player ships near station_sker', () => {
  const { state, bus, helpers, station } = skerState(4242);
  const trafficSys = Object.create(trafficBase);
  trafficSys.init({ state, bus, helpers });
  bus.emit('sector:enter', { sector: SKER });
  const ships = state.entityList.filter(
    (e) => e.alive !== false && e.type === 'ship' && e.id !== state.playerId,
  );
  assert.ok(ships.length >= 2, `expected >=2 apron ships, got ${ships.length}`);
  const near = ships.filter(
    (e) => Math.hypot(e.pos.x - station.pos.x, e.pos.z - station.pos.z) <= 400,
  );
  assert.ok(near.length >= 2, `expected >=2 ships within the apron radius, got ${near.length}`);
  // The apron is civilian freight, not a hostile wave.
  assert.ok(ships.every((e) => e.data && e.data.trafficRole), 'apron ships are traffic, not encounters');
});

test('WORLD-07 enemyDensity and the hollow-frontier policy are untouched', () => {
  assert.equal(SKER.enemyDensity, 0.70);
  // Explicit-zero sectors still mean authored silence elsewhere in the file.
  const veil = SECTORS.find((s) => s.id === 'sector_veil_nebula');
  assert.equal(veil.trafficPerMin, 0);
});
