import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { mining as miningSystem } from '../src/systems/mining.js';
import {
  ASTEROID_FIELD_CELL,
  asteroidFieldCensus,
  ensureAsteroidField,
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
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';

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

test('reserved presentation ids advance the allocator and stay unique', () => {
  const state = { nextEntityId: 1, freeIds: [1], entities: new Map(), world: {}, simTime: 0 };
  const reserved = insertAsteroidFieldRock(state, { id: 1, pos: { x: 0, z: 0 } });
  const automatic = insertAsteroidFieldRock(state, { pos: { x: 10, z: 0 } });

  assert.equal(reserved.id, 1);
  assert.notEqual(automatic.id, reserved.id);
  assert.deepEqual(state.freeIds, []);
  assert.equal(new Set(state.world.asteroidField.rocks.map((rock) => rock.id)).size, 2);
  assert.equal(state.world.asteroidField.byId.size, 2);
});

test('reserved dressing ids also stay unique with automatic row allocation', () => {
  const state = { nextEntityId: 1, freeIds: [1], entities: new Map(), world: {} };
  const reserved = insertDressingRow(state, { id: 1, pos: { x: 0, z: 0 } });
  const automatic = insertDressingRow(state, { pos: { x: 10, z: 0 } });

  assert.equal(reserved.id, 1);
  assert.notEqual(automatic.id, reserved.id);
  assert.deepEqual(state.freeIds, []);
  assert.equal(new Set(state.world.dressing.rows.map((row) => row.id)).size, 2);
  assert.equal(state.world.dressing.byId.size, 2);
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
  const allLiveAsteroids = alive.filter((e) => e.type === 'asteroid');
  // Optic-lattice bodies are authored structural dressing that share the asteroid entity type:
  // invulnerable, unmineable, field-resident until the decode disc promotes them. They stand in
  // the compact field census, not on the live list — count them apart so the activity/geology
  // bound keeps its meaning.
  const liveFieldAsteroids = allLiveAsteroids.filter((e) => !(e.data && e.data.opticStructureId));
  const liveOptics = allLiveAsteroids.length - liveFieldAsteroids.length;
  const liveAsteroids = liveFieldAsteroids.length;
  const liveFx = alive.filter((e) => e.type === 'fx').length;
  const fieldRocks = (state.world.asteroidField && state.world.asteroidField.rocks) || [];
  const fieldOptics = fieldRocks.filter((r) => r.data && r.data.opticStructureId).length;
  assert.ok(census.fieldRocks > 200, `expected a compact field, got ${census.fieldRocks}`);
  assert.equal(allLiveAsteroids.length, census.liveAsteroids);
  assert.ok(liveAsteroids < 40, `live asteroids should be the activity/geology set, got ${liveAsteroids}`);
  assert.ok(fieldOptics > 0, 'the authored optic lattice stands as structural dressing');
  assert.equal(liveOptics, 0, `optic lattices stay field-resident until approach, got ${liveOptics} live`);
  assert.ok(fx.dressingRows > 10, `expected dressing off the combat list, got ${fx.dressingRows}`);
  assert.ok(liveFx < 40, `live fx should be landmarks/claimables, got ${liveFx}`);
  // The authored optic lattice and activity anchors put ~60 structural bodies on the list; the
  // bound's job is catching dormant/dressing leakage (hundreds), not pinning the authored set.
  assert.ok(alive.length < 120, `quiet combat list should stay near the authored set, got ${alive.length}`);
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

test('ram promotion fires at the real collider skin, never spawning a body over the player', () => {
  const { state, world, player } = bootWorld(9);
  // Crystalline carries the largest collider factor (1.55): this gap is outside the record
  // disc (8 + 12 = 20) but inside the ball that actually spawns (8 + 18.6 = 26.6). A
  // record-skin trigger leaves the rock dormant while its collider overlaps the player.
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: player.pos.x + 22, z: player.pos.z },
    radius: 12,
    mass: 400,
    data: { typeId: 'ast_crystalline', oreHP: 40, oreHPMax: 40 },
  });
  // Inside the query reach (8 + 36 + 12 = 56) but outside the collider skin — a
  // "promote everything in reach" regression would light this one too.
  const far = insertAsteroidFieldRock(state, {
    pos: { x: player.pos.x + 40, z: player.pos.z },
    radius: 12,
    mass: 400,
    data: { typeId: 'ast_crystalline', oreHP: 40, oreHPMax: 40 },
  });
  world._tickAsteroidFieldInteractions(state);
  const live = state.entities.get(rec.id);
  assert.ok(live, 'the collider reaching the player must already be a live body');
  assert.equal(live.radius, 12, 'record radius stays the entity radius');
  assert.equal(live.physicsBody.radius, asteroidColliderRadius('ast_crystalline', 12));
  assert.equal(live.pos.x, rec.pos.x, 'promotion keeps the record position');
  assert.equal(state.entities.has(far.id), false, 'a rock outside its collider stays dormant');
});

function bareFieldState() {
  return { nextEntityId: 1, freeIds: [], entities: new Map(), world: {}, simTime: 0 };
}

function countingGrid(grid, limit = Infinity) {
  let reads = 0;
  const counting = new Map(grid);
  const get = Map.prototype.get.bind(counting);
  counting.get = (key) => {
    reads += 1;
    if (reads > limit) throw new Error('unbounded asteroid-field cell walk');
    return get(key);
  };
  return { counting, reads: () => reads };
}

test('queryAsteroidField rejects nonfinite and nonpositive radii without reading the grid', () => {
  const state = bareFieldState();
  insertAsteroidFieldRock(state, { id: 900, pos: { x: 10, z: 0 }, radius: 8 });
  const field = state.world.asteroidField;
  const counted = countingGrid(field.grid);
  field.grid = counted.counting;
  for (const radius of [Infinity, -Infinity, Number.NaN, -1, 0]) {
    assert.deepEqual(queryAsteroidField(state, { x: 0, z: 0 }, radius), []);
  }
  assert.equal(counted.reads(), 0, 'an invalid radius must never touch the grid');
});

test('queryAsteroidField returns immediately on an empty or missing grid', () => {
  const state = bareFieldState();
  const field = ensureAsteroidField(state);
  const counted = countingGrid(field.grid);
  field.grid = counted.counting;
  assert.deepEqual(queryAsteroidField(state, { x: 0, z: 0 }, 500), []);
  field.grid = null;
  assert.deepEqual(queryAsteroidField(state, { x: 0, z: 0 }, 500), []);
  assert.equal(counted.reads(), 0);
});

test('queryAsteroidField bounds a hostile radius by occupied cells', () => {
  const state = bareFieldState();
  insertAsteroidFieldRock(state, { id: 901, pos: { x: 5, z: 0 }, radius: 8 });
  insertAsteroidFieldRock(state, { id: 902, pos: { x: 50000, z: 0 }, radius: 8 });
  const field = state.world.asteroidField;
  const counted = countingGrid(field.grid, 4096);
  field.grid = counted.counting;
  const hits = queryAsteroidField(state, { x: 0, z: 0 }, 1e9);
  assert.deepEqual(hits.map((rec) => rec.id).sort(), [901, 902]);
  assert.ok(counted.reads() <= 4096);
});

test('queryAsteroidField returns promptly from an unsafe query origin', () => {
  const state = bareFieldState();
  insertAsteroidFieldRock(state, { id: 903, pos: { x: 5, z: 0 }, radius: 8 });
  const hits = queryAsteroidField(state, { x: 1e300, z: 0 }, 50);
  assert.deepEqual(hits, []);
});

test('queryAsteroidField occupied-bucket fallback keeps grid-walk order and the live predicate', () => {
  const state = bareFieldState();
  insertAsteroidFieldRock(state, { id: 910, pos: { x: 500, z: 0 }, radius: 8 });
  insertAsteroidFieldRock(state, { id: 911, pos: { x: 10, z: 500 }, radius: 8 });
  insertAsteroidFieldRock(state, { id: 912, pos: { x: 10, z: 0 }, radius: 8 });
  insertAsteroidFieldRock(state, { id: 913, pos: { x: 230, z: 0 }, radius: 8 });
  const dead = insertAsteroidFieldRock(state, { id: 914, pos: { x: 10, z: 10 }, radius: 8 });
  dead.alive = false;
  const promoted = insertAsteroidFieldRock(state, { id: 915, pos: { x: 30, z: 0 }, radius: 8 });
  promoted.liveEntityId = 42;
  const field = state.world.asteroidField;
  const pos = { x: 250, z: 250 };
  const radius = 600;
  const span = Math.floor((pos.x + radius) / ASTEROID_FIELD_CELL)
    - Math.floor((pos.x - radius) / ASTEROID_FIELD_CELL) + 1;
  assert.ok(span * span > field.grid.size, 'the fixture must take the occupied-bucket branch');
  const hits = queryAsteroidField(state, pos, radius);
  const oracle = field.rocks
    .filter((rec) => {
      if (!rec || rec.alive === false || rec.liveEntityId != null || !rec.pos) return false;
      const dx = rec.pos.x - pos.x;
      const dz = rec.pos.z - pos.z;
      const reach = radius + rec.radius;
      return dx * dx + dz * dz <= reach * reach || dx * dx + dz * dz <= radius * radius;
    })
    .sort((a, b) => (
      Math.floor(a.pos.x / ASTEROID_FIELD_CELL) - Math.floor(b.pos.x / ASTEROID_FIELD_CELL))
      || (Math.floor(a.pos.z / ASTEROID_FIELD_CELL) - Math.floor(b.pos.z / ASTEROID_FIELD_CELL)));
  assert.deepEqual(hits.map((rec) => rec.id), oracle.map((rec) => rec.id));
  assert.deepEqual(hits.map((rec) => rec.id), [912, 911, 913, 910]);
});
