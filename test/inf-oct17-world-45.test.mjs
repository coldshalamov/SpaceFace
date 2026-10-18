// WORLD-45 — shots inside the Helios memorial scatter the sightseer, with one line.
// Quiet shots outside the array leave that hull sightseeing.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { zoneAt } from '../src/data/sectorZones.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { HELIOS_MEMORIAL_TOURIST, traffic as trafficBase } from '../src/systems/traffic.js';
import { createReadModel, applySpawnInfos, applyEntityVitals } from '../scripts/lib/simReadModel.mjs';
import { entityVitalsOf } from '../scripts/lib/simWorkerHost.mjs';

const SEED = 4242;
const MEMORIAL = HELIOS_MEMORIAL_TOURIST.pos;

function createHarness() {
  let nextId = 100;
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 12,
    meta: { seed: SEED },
    playerId: 1,
    entities: new Map(),
    entityList: [],
    world: {
      currentSectorId: HELIOS_MEMORIAL_TOURIST.sectorId,
      planets: [],
      pois: [],
      records: { byId: {} },
    },
    traffic: { freighters: [], rngSeed: 0 },
    player: { cargo: { items: {} } },
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
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const player = helpers.spawnEntity({
    id: 1,
    type: 'ship',
    team: 0,
    radius: 8,
    pos: { x: MEMORIAL.x, z: MEMORIAL.z },
    vel: { x: 0, z: 0 },
    data: { name: 'Pilot' },
  });
  const station = helpers.spawnEntity({
    id: 10,
    type: 'station',
    radius: 80,
    pos: { x: 400, z: 0 },
    data: { stationId: 'station_helios', name: 'Helios Station' },
  });
  const trafficSys = Object.create(trafficBase);
  trafficSys.init({ state, bus, helpers });
  trafficSys._ensureHeliosMemorialTourist(
    HELIOS_MEMORIAL_TOURIST.sectorId,
    { factionId: 'faction_scn' },
    [station],
    state.traffic.freighters,
  );
  const tourist = state.entityList.find((entity) => entity.data && entity.data.trafficRole === 'tourist');
  const lines = [];
  const director = Object.create(barkDirector);
  director.init({
    state,
    bus,
    helpers: {
      voice: {
        say(message) {
          lines.push(message);
          return true;
        },
      },
    },
  });
  return { state, bus, player, tourist, trafficSys, director, lines };
}

function fireWeapon(bus, ownerId, x, z) {
  bus.emit('combat:fire', {
    ownerId,
    origin: { x, z },
    from: { x, z },
    weaponId: 'wpn_pulse_laser_s',
  });
}

function memorialZoneHolds(x, z) {
  const zone = zoneAt(HELIOS_MEMORIAL_TOURIST.sectorId, x, z);
  return !!(zone && zone.id === HELIOS_MEMORIAL_TOURIST.zoneId);
}

test('WORLD-45 seed 4242 weapon fire inside the memorial scatters the sightseer with one bark', () => {
  const { state, bus, player, tourist, trafficSys, director, lines } = createHarness();
  try {
    assert.ok(tourist, 'the memorial sightseer is present');
    assert.equal(memorialZoneHolds(tourist.pos.x, tourist.pos.z), true);

    trafficSys.update(1 / 60, state);
    assert.notEqual(tourist.data.ai && tourist.data.ai.fsm, 'flee');
    assert.equal(lines.length, 0, 'a quiet memorial draws no scatter line');

    fireWeapon(bus, player.id, 0, 0);
    trafficSys.update(1 / 60, state);
    assert.notEqual(tourist.data.ai && tourist.data.ai.fsm, 'flee', 'shots outside the memorial do not scatter the sightseer');
    assert.equal(lines.length, 0);

    // Inside the array, but farther than the ordinary 300-unit civilian bubble.
    const shotX = MEMORIAL.x + 330;
    const shotZ = MEMORIAL.z;
    assert.equal(memorialZoneHolds(shotX, shotZ), true);
    assert.ok(Math.hypot(shotX - tourist.pos.x, shotZ - tourist.pos.z) > 300);
    fireWeapon(bus, player.id, shotX, shotZ);
    trafficSys.update(1 / 60, state);
    fireWeapon(bus, player.id, shotX - 8, shotZ + 6);
    trafficSys.update(1 / 60, state);

    assert.equal(tourist.data.ai.fsm, 'flee');
    assert.equal(tourist.data.ai.state, 'flee');
    assert.equal(tourist.data.civilianReaction, 'flee');
    assert.equal(tourist.data.intent.moveZ, 1, 'the sightseer thrusts away from the shots');
    assert.equal(tourist.data.intent.boost, true);
    assert.equal(tourist.data.intent.brake, false);
    assert.equal(lines.length, 1, 'one bark for the scatter');
    const text = lines[0].text;
    assert.match(text, /memorial|array|sightseer|tour|passenger/i);
    assert.doesNotMatch(text, /zone_|sector_|faction_|ship_|[a-z]+_[a-z]+|[a-z]+[A-Z]/);

    const model = createReadModel();
    applySpawnInfos(model, [{
      entityId: tourist.id,
      type: 'ship',
      alive: true,
      x: tourist.pos.x,
      z: tourist.pos.z,
      data: { trafficRole: 'tourist', ai: { archetype: 'passive', passive: true } },
    }]);
    applyEntityVitals(model, [[tourist.id, entityVitalsOf(tourist)]]);
    const row = model.entities.get(tourist.id);
    assert.equal(row.data.ai.fsm, 'flee', 'the worker read model carries the flee state');
    assert.equal(row.data.ai.state, 'flee');
  } finally {
    director.destroy();
  }
});
