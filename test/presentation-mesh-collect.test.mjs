import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  residencyPrefetchRadius,
  TABLE_REFERENCE_SPEED_WU,
} from '../src/render/tabletopPolicy.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { insertDressingRow } from '../src/world/dressingTable.js';
import { insertFarActor } from '../src/world/farActorTable.js';
import {
  collectMeshPresentationEntities,
  requestDecodeRunwayPromote,
} from '../src/world/presentationSources.js';

function boot(seed = 21) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  state.camera = { zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 };
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.vel = { x: 0, z: 0 };
  player.maxSpeed = TABLE_REFERENCE_SPEED_WU;
  return { state, helpers, player };
}

function prefetchRadius(state) {
  return residencyPrefetchRadius(TABLE_REFERENCE_SPEED_WU, 144, 50, 16 / 9, 60);
}

function insertFar(state, id, x, z) {
  return insertFarActor(state, {
    id,
    type: 'ship',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    hull: 40,
    hullMax: 40,
    team: 1,
    data: { trafficRole: 'hauler' },
    flags: {},
  });
}

function ids(list) {
  return new Set(list.map((row) => row && row.id));
}

test('mesh collect takes the prefetch circle, not the whole belt', () => {
  const { state, player } = boot();
  const prefetch = prefetchRadius(state);
  const nearbyRock = insertAsteroidFieldRock(state, {
    id: 701,
    pos: { x: prefetch * 0.4, z: 0 },
    radius: 10,
    mass: 400,
    data: { typeId: 'ast_common_rock', oreHP: 40, oreHPMax: 40 },
  });
  const lipRock = insertAsteroidFieldRock(state, {
    id: 702,
    pos: { x: prefetch - 24, z: 0 },
    radius: 10,
    mass: 400,
    data: { typeId: 'ast_common_rock', oreHP: 40, oreHPMax: 40 },
  });
  const distantRock = insertAsteroidFieldRock(state, {
    id: 703,
    pos: { x: 4000, z: 0 },
    radius: 10,
    mass: 400,
    data: { typeId: 'ast_common_rock', oreHP: 40, oreHPMax: 40 },
  });
  for (let i = 0; i < 276; i++) {
    insertAsteroidFieldRock(state, {
      pos: { x: 4000 + (i % 24) * 40, z: 3200 + Math.floor(i / 24) * 40 },
      radius: 8,
      mass: 400,
      data: { typeId: 'ast_common_rock', oreHP: 20, oreHPMax: 20 },
    });
  }
  const nearbyFar = insertFar(state, 801, prefetch - 30, 0);
  const distantFar = insertFar(state, 802, 4000, 80);
  const dressing = insertDressingRow(state, {
    pos: { x: player.pos.x + 12, z: player.pos.z },
    radius: 6,
    data: { placeId: 'place_nav_buoy', worldDressing: true, poi: true },
  });

  const mesh = collectMeshPresentationEntities(state);
  const seen = ids(mesh);
  assert.ok(seen.has(player.id));
  assert.ok(seen.has(dressing.id), 'dressing stays on the journal collect');
  assert.ok(seen.has(nearbyRock.id), 'a rock inside the prefetch circle still cooks');
  assert.ok(seen.has(lipRock.id), 'a rock on the prefetch lip still cooks');
  assert.ok(seen.has(nearbyFar.id), 'a nearby far hull still cooks');
  assert.equal(seen.has(distantRock.id), false, 'a rock 4000 WU away is not a mesh-collect tax');
  assert.equal(seen.has(distantFar.id), false, 'a far hull 4000 WU away stays off the collect');
  assert.ok(state.world.asteroidField.rocks.length >= 279);
  assert.ok(mesh.length < 20, `collect must not walk the far belt, got ${mesh.length}`);
});

test('decode-runway promote still leaves field rocks off the combat list', () => {
  const { state, helpers } = boot();
  const prefetch = prefetchRadius(state);
  const rock = insertAsteroidFieldRock(state, {
    id: 777,
    pos: { x: 80, z: 0 },
    radius: 10,
    mass: 400,
    data: { typeId: 'ast_common_rock', oreHP: 40, oreHPMax: 40 },
  });
  insertFar(state, 501, prefetch * 0.5, 0);

  const mesh = collectMeshPresentationEntities(state);
  assert.ok(ids(mesh).has(rock.id));

  const promoted = requestDecodeRunwayPromote(state, helpers);
  assert.equal(promoted.rocksPromoted, 0, 'field rocks stay on the ledger');
  assert.ok(promoted.farPromoted >= 1);
  assert.equal(state.entities.has(rock.id), false);
  assert.equal(rock.liveEntityId, null);
});
