import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { mining as miningSystem } from '../src/systems/mining.js';
import {
  asteroidFieldCensus,
  insertAsteroidFieldRock,
  promoteAsteroidFieldRock,
  queryAsteroidField,
  shouldKeepLiveAsteroid,
} from '../src/world/asteroidField.js';
import {
  dressingCensus,
  insertDressingRow,
} from '../src/world/dressingTable.js';
import {
  collectJournalPresentationEntities,
  collectMeshPresentationEntities,
  resolveWorldPresentationEntity,
} from '../src/world/presentationSources.js';

const CERES = 'sector_ceres_belt';

function bootWorld(seed = 14920) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
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
  player.vel = player.vel || { x: 0, z: 0 };
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  const mining = Object.assign(Object.create(miningSystem), {});
  mining.init(ctx);
  return { state, bus, helpers, world, mining, player };
}

function aliveList(state) {
  return (state.entityList || []).filter((e) => e && e.alive !== false);
}

test('dormant rocks stay off the combat list until promoted', () => {
  const { state, helpers } = bootWorld(3);
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: 40, z: 10 },
    radius: 12,
    mass: 400,
    data: { typeId: 'ast_common_rock', oreHP: 80, oreHPMax: 80, fieldId: 'f_test' },
  });
  assert.equal(rec.fieldResident, true);
  assert.equal(state.entities.has(rec.id), false);
  assert.equal(aliveList(state).some((e) => e.id === rec.id), false);
  assert.equal(resolveWorldPresentationEntity(state, rec.id), rec);

  const nearby = queryAsteroidField(state, { x: 40, z: 10 }, 20);
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0].id, rec.id);

  const live = promoteAsteroidFieldRock(state, rec.id, helpers, 'mine');
  assert.ok(live);
  assert.equal(live.id, rec.id);
  assert.equal(live.type, 'asteroid');
  assert.equal(state.entities.get(rec.id), live);
  assert.equal(asteroidFieldCensus(state).fieldRocks, 0);
  assert.equal(asteroidFieldCensus(state).liveAsteroids, 1);
});

test('activity and geology rocks stay live entities', () => {
  assert.equal(shouldKeepLiveAsteroid({ activityBinding: { id: 'slot_a' } }), true);
  assert.equal(shouldKeepLiveAsteroid({ collisionAnchorBinding: { id: 'anchor' } }), true);
  assert.equal(shouldKeepLiveAsteroid({ authoredGeologyPlaceId: 'place_rock' }), true);
  assert.equal(shouldKeepLiveAsteroid({}), false);
});

test('dressing rows are presentation sources, not combat entities', () => {
  const { state } = bootWorld(5);
  const row = insertDressingRow(state, {
    pos: { x: 8, z: -4 },
    radius: 10,
    data: { placeId: 'place_nav_buoy', worldDressing: true, poi: true },
  });
  assert.equal(row.dressingResident, true);
  assert.equal(state.entities.has(row.id), false);
  assert.equal(dressingCensus(state).dressingRows, 1);
  assert.equal(dressingCensus(state).liveFx, 0);
  const journal = collectJournalPresentationEntities(state);
  assert.ok(journal.some((e) => e.id === row.id));
  const mesh = collectMeshPresentationEntities(state);
  assert.ok(mesh.some((e) => e.id === row.id));
});

test('quiet Ceres combat list drops the dormant belt and dressing', () => {
  const { state, world, player } = bootWorld(14920);
  world.enterSector(CERES);
  const origin = player.pos;
  const census = asteroidFieldCensus(state);
  const fx = dressingCensus(state);
  const alive = aliveList(state);
  const liveAsteroids = alive.filter((e) => e.type === 'asteroid').length;
  const liveFx = alive.filter((e) => e.type === 'fx').length;
  assert.ok(census.fieldRocks > 200, `expected a compact field, got ${census.fieldRocks}`);
  assert.equal(liveAsteroids, census.liveAsteroids);
  assert.ok(liveAsteroids < 40, `live asteroids should be the activity/geology set, got ${liveAsteroids}`);
  assert.ok(fx.dressingRows > 10, `expected dressing off the combat list, got ${fx.dressingRows}`);
  assert.ok(liveFx < 40, `live fx should be landmarks/claimables, got ${liveFx}`);
  assert.ok(alive.length < 80, `quiet combat list should shrink toward ~50, got ${alive.length}`);
  assert.ok(census.fieldRocks + fx.dressingRows > liveAsteroids + liveFx);
  void origin;
});

test('promote a field rock applies catch-up before it is live', () => {
  const { state, helpers } = bootWorld(11);
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: 10, z: 0 },
    vel: { x: 4, z: 0 },
    radius: 8,
    mass: 400,
    lastExactT: 0,
    data: { typeId: 'ast_common_rock', oreHP: 40, oreHPMax: 40 },
  });
  rec.lastExactT = 0;
  rec.vel = { x: 4, z: 0 };
  state.simTime = 3;
  const live = promoteAsteroidFieldRock(state, rec.id, helpers, 'mine');
  assert.ok(live);
  assert.ok(Math.abs(live.pos.x - 22) < 0.01, `expected catch-up pose ~22, got ${live.pos.x}`);
});

test('ram overlap promotes a field rock onto the combat list', () => {
  const { state, world, helpers, player } = bootWorld(9);
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: player.pos.x + 4, z: player.pos.z },
    radius: 8,
    mass: 400,
    data: { typeId: 'ast_common_rock', oreHP: 40, oreHPMax: 40 },
  });
  world._tickAsteroidFieldInteractions(state);
  const live = state.entities.get(rec.id);
  assert.ok(live);
  assert.equal(live.type, 'asteroid');
  assert.equal(helpers.getEntity(rec.id), live);
});
