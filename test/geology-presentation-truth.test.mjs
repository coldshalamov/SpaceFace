import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core as coreSystem } from '../src/core/coreSystem.js';
import { mulberry32 } from '../src/core/rng.js';
import { mining } from '../src/systems/mining.js';
import { world as worldSystem } from '../src/systems/world.js';

const ROCK_PLACE_IDS = new Set([
  'place_asteroid_seamed',
  'place_asteroid_rock_a',
  'place_asteroid_rock_b',
  'place_asteroid_rock_c',
  'place_asteroid_graffiti',
]);
const EXPECTED_AUTHORED_PLACE_BY_TYPE = Object.freeze({
  ast_common_rock: 'place_asteroid_seamed',
  ast_metallic: 'place_asteroid_rock_a',
  ast_icy: 'place_asteroid_rock_b',
  ast_crystalline: 'place_asteroid_rock_c',
});

function bootWorld(seed = 94721) {
  const state = createGameState(seed);
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  const core = Object.assign(Object.create(coreSystem), {});
  core.init(ctx);
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, helpers, world };
}

function trackedRng(seed) {
  const source = mulberry32(seed);
  const rng = () => {
    rng.calls++;
    return source();
  };
  rng.calls = 0;
  return rng;
}

function simulationAsteroidSnapshot(entity) {
  const data = entity.data || {};
  return {
    id: entity.id,
    type: entity.type,
    pos: { x: entity.pos.x, z: entity.pos.z },
    radius: entity.radius,
    mass: entity.mass,
    angVel: entity.angVel,
    hull: entity.hull,
    hullMax: entity.hullMax,
    collides: entity.collides,
    data: {
      typeId: data.typeId,
      tier: data.tier,
      tierCap: data.tierCap,
      oreHP: data.oreHP,
      oreHPMax: data.oreHPMax,
      yieldU: data.yieldU,
      ecologyFingerprint: data.ecologyFingerprint,
      size: data.size,
      pctEjected: data.pctEjected,
      respawnSec: data.respawnSec,
      fieldId: data.fieldId,
      seams: data.seams,
    },
  };
}

test('each material-matched field promotes one real asteroid while unmatched types retain semantic presentation', () => {
  const { state, world } = bootWorld();
  const sector = {
    id: 'sector_helios_prime', tier: 1, worldRadius: 3500,
    fields: [
      { id: 'field_common', type: 'ast_common_rock', count: 3, center: { x: 200, z: 0 } },
      { id: 'field_metal', type: 'ast_metallic', count: 2, center: { x: 500, z: 0 } },
      { id: 'field_ice', type: 'ast_icy', count: 2, center: { x: 800, z: 0 } },
      { id: 'field_crystal', type: 'ast_crystalline', count: 2, center: { x: 1100, z: 0 } },
      { id: 'field_rare', type: 'ast_rare_exotic', count: 2, center: { x: 1400, z: 0 } },
      { id: 'field_gas', type: 'ast_gas_cloud', count: 2, center: { x: 1700, z: 0 } },
    ],
  };
  const active = world._emptySectorBag();
  world._spawnFields(sector, active, { fieldsDepleted: {} }, trackedRng(1234));

  assert.equal(active.fields.length, 6);
  for (const field of active.fields) {
    const asteroids = field.asteroidIds.map((id) => state.entities.get(id));
    const authored = asteroids.filter((entity) => entity.data.authoredGeologySkin === true);
    if (!EXPECTED_AUTHORED_PLACE_BY_TYPE[field.type]) {
      assert.equal(authored.length, 0,
        `${field.type} must stay on its exact procedural presentation until a matching authored asset exists`);
      assert.equal(asteroids.some((entity) => entity.data.placeId), false);
      for (const asteroid of asteroids) {
        assert.equal(mining._isValidMineableTarget(
          asteroid,
          { pos: { x: asteroid.pos.x, z: asteroid.pos.z } },
          1,
        ), true, 'unmatched geology remains a real mineable asteroid rather than a decorative rock');
      }
      continue;
    }

    assert.equal(authored.length, 1, `${field.id} must promote exactly one existing asteroid`);
    assert.equal(authored[0].id, field.asteroidIds[0], 'selection is deterministic without another RNG draw');
    assert.equal(authored[0].type, 'asteroid');
    assert.equal(authored[0].collides, true);
    assert.equal(authored[0].data.typeId, field.type);
    assert.equal(authored[0].data.placeId, EXPECTED_AUTHORED_PLACE_BY_TYPE[field.type],
      `${field.type} must bind to the matching authored material identity`);
    assert.equal(authored[0].data.fieldId, field.id);
    assert.equal(authored[0].data.placeTargetRadius, authored[0].radius);
    assert.equal(authored[0].presentationAdmission, 'pending');
    assert.equal(mining._isValidMineableTarget(
      authored[0],
      { pos: { x: authored[0].pos.x, z: authored[0].pos.z } },
      1,
    ), true, 'the actual mining target law still accepts the styled asteroid');
    assert.ok(authored[0].mass > 0);
    assert.ok(authored[0].data.oreHP > 0);
    assert.ok(authored[0].data.yieldU > 0);
  }
});

test('adding the geology presentation fields does not perturb asteroid identity or RNG', () => {
  function spawn(placeId) {
    const { world } = bootWorld(51);
    const rng = trackedRng(90210);
    const entity = world._spawnAsteroid(
      { id: 'field_a', type: 'ast_common_rock' },
      {
        tierCap: 1,
        respawnSec: 90,
        _homeSectorId: 'sector_helios_prime',
        _ecologyYieldMultiplier: 1,
        _ecologyFingerprint: 'test-ecology',
      },
      { x: 400, z: -200 },
      350,
      rng,
      placeId,
    );
    return {
      entity,
      simulation: simulationAsteroidSnapshot(entity),
      nextRandom: rng(),
      rngCalls: rng.calls,
    };
  }

  const procedural = spawn(null);
  const authored = spawn('place_asteroid_rock_a');
  assert.deepEqual(authored.simulation, procedural.simulation);
  assert.equal(authored.nextRandom, procedural.nextRandom);
  assert.equal(authored.rngCalls, procedural.rngCalls);
  assert.equal(authored.entity.data.authoredGeologySkin, true);
  assert.equal(authored.entity.data.placeTargetRadius, authored.entity.radius);
});

test('rock-shaped dressing is replaced one-for-one with non-colliding infrastructure', () => {
  const { state, world } = bootWorld(77);
  const sector = { id: 'sector_helios_prime', factionId: 'faction_scn', worldRadius: 3500 };
  const rng = trackedRng(8080);

  const belt = world._emptySectorBag();
  belt.fields = [
    { id: 'a', center: { x: 100, z: 100 } },
    { id: 'b', center: { x: 300, z: 100 } },
    { id: 'c', center: { x: 500, z: 100 } },
  ];
  belt.stations = [{ stationId: 'station_test', pos: { x: 0, z: 0 } }];
  world._spawnBeltDressing(sector, belt, rng, 'belt');
  assert.equal(belt.dressing.length, 7, 'six field props plus one conveyor are retained');
  assert.equal(rng.calls, 9, 'belt replacement consumes the legacy RNG cadence');

  const fringe = world._emptySectorBag();
  fringe.fields = [{ id: 'd', center: { x: 700, z: 100 } }];
  fringe.gates = [{ pos: { x: 900, z: 0 } }];
  fringe.pois = [{ type: 'wreck', pos: { x: 800, z: 200 } }];
  world._spawnFringeDressing(sector, fringe, rng, 'fringe');
  assert.equal(fringe.dressing.length, 4, 'nav, hulk, debris, and prospecting prop are retained');
  assert.equal(rng.calls, 15, 'fringe replacement consumes the legacy RNG cadence');

  const anomaly = world._emptySectorBag();
  anomaly.pois = [{ pos: { x: 1100, z: -300 } }];
  world._spawnAnomalyDressing(sector, anomaly, rng, 'anomaly');
  assert.equal(anomaly.dressing.length, 3, 'nav, debris, and survey prop are retained');
  assert.equal(rng.calls, 19, 'anomaly replacement consumes the legacy RNG cadence');

  const dressing = [...belt.dressing, ...fringe.dressing, ...anomaly.dressing]
    .map((entry) => state.entities.get(entry.id));
  assert.equal(dressing.length, 14);
  assert.equal(dressing.some((entity) => ROCK_PLACE_IDS.has(entity.data.placeId)), false,
    'no world-dressing FX entity may masquerade as a mineable rock');
  const infrastructure = dressing.filter((entity) =>
    entity.data.placeId === 'place_nav_buoy' || entity.data.placeId === 'place_mining_drone');
  assert.ok(infrastructure.length >= 8);
  for (const entity of infrastructure) {
    assert.equal(entity.type, 'fx');
    assert.equal(entity.collides, false);
    assert.equal(entity.data.worldDressing, true);
  }
});
