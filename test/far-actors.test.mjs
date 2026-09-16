import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { NEAR_EXIT_PAD_WU, SIM_TIER } from '../src/world/activityClassification.js';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';
import { getAsteroidFieldRock, insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { getDressingRow, insertDressingRow } from '../src/world/dressingTable.js';
import {
  FAR_ACTOR_SCHEMA,
  farActorCensus,
  farActorHoldsWorldRecord,
  farActorTableRadius,
  getFarActor,
  insertFarActor,
  promoteFarActor,
  restoreFarActorTable,
  serializeFarActorTable,
  shouldVirtualizeFarActor,
  tickFarActors,
} from '../src/world/farActorTable.js';

function boot(seed = 21) {
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
  return { state, bus, helpers, player };
}

function spawnShip(helpers, spec) {
  const ent = helpers.spawnEntity({
    id: spec.id,
    type: 'ship',
    pos: spec.pos,
    radius: 8,
    mass: 20,
    hull: 80,
    hullMax: 80,
    collides: true,
    data: spec.data || { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
  });
  ent.homeSectorId = 'sector_ceres_belt';
  ent.activity = spec.activity || { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  return ent;
}

test('far dormant ships leave the combat list and rematerialize on approach', () => {
  const { state, helpers, bus, player } = boot();
  const far = spawnShip(helpers, { pos: { x: 12000, z: 0 } });
  const near = spawnShip(helpers, {
    pos: { x: 20, z: 0 },
    activity: { simTier: SIM_TIER.S1_NEAR, pinnedExact: false },
  });
  const farId = far.id;
  const nearId = near.id;

  const first = tickFarActors(state, helpers, bus);
  assert.ok(first.shelved >= 1);
  assert.equal(state.entities.has(farId), false);
  assert.ok(getFarActor(state, farId));
  assert.ok(state.entities.get(nearId));
  assert.equal(state.entities.get(nearId).alive, true);
  assert.ok(state.entities.get(player.id));

  player.pos.x = 12000;
  const second = tickFarActors(state, helpers, bus);
  assert.ok(second.restored >= 1);
  const restored = state.entities.get(farId);
  assert.ok(restored);
  assert.equal(restored.type, 'ship');
  assert.equal(getFarActor(state, farId), null);
});

test('a shelved far actor keeps its id until it comes back', () => {
  const { state, helpers, bus, player } = boot();
  const far = spawnShip(helpers, { pos: { x: 12000, z: 0 } });
  const farId = far.id;

  tickFarActors(state, helpers, bus);
  assert.equal(state.entities.has(farId), false);
  assert.ok(getFarActor(state, farId));
  assert.equal(state.freeIds.includes(farId), false, 'the far row still owns its id');

  // The relay capture's collision: a later spawn, dressing prop or field rock took the shelved id.
  const other = spawnShip(helpers, {
    pos: { x: 300, z: 0 },
    activity: { simTier: SIM_TIER.S1_NEAR, pinnedExact: false },
  });
  const prop = insertDressingRow(state, { pos: { x: 12040, z: 30 }, radius: 6, homeSectorId: 'sector_ceres_belt' });
  const rock = insertAsteroidFieldRock(state, { pos: { x: 12080, z: -30 }, radius: 6, homeSectorId: 'sector_ceres_belt' });
  assert.notEqual(other.id, farId, 'a new ship must not take the shelved id');
  assert.notEqual(prop.id, farId, 'a dressing prop must not take the shelved id');
  assert.notEqual(rock.id, farId, 'a field rock must not take the shelved id');

  player.pos.x = 12000;
  tickFarActors(state, helpers, bus);
  const restored = state.entities.get(farId);
  assert.ok(restored, 'the ship comes back under its own id');
  assert.equal(restored.type, 'ship');
  assert.equal(getFarActor(state, farId), null);
  assert.equal(getDressingRow(state, prop.id), prop);
  assert.equal(getAsteroidFieldRock(state, rock.id), rock);

  helpers.removeEntity(farId, { immediate: true });
  assert.ok(state.freeIds.includes(farId), 'with no row holding it, the id returns to the pool');
});

test('a live body forced onto a shelved id evicts the stale far row on approach', () => {
  const { state, helpers, bus, player } = boot();
  const far = spawnShip(helpers, { pos: { x: 12000, z: 0 } });
  const farId = far.id;

  tickFarActors(state, helpers, bus);
  assert.ok(getFarActor(state, farId));

  const forced = spawnShip(helpers, {
    id: farId,
    pos: { x: 12000, z: 0 },
    activity: { simTier: SIM_TIER.S1_NEAR, pinnedExact: false },
  });
  assert.equal(forced.id, farId, 'the fixture builds the alias through an explicit id');

  player.pos.x = 12000;
  tickFarActors(state, helpers, bus);

  assert.equal(state.entities.get(farId), forced);
  assert.equal(getFarActor(state, farId), null, 'the stale row must not survive as an alias');
});

test('a far actor never comes back onto an id a dressing prop or field rock holds', () => {
  const { state, helpers, bus, player } = boot();
  const shipA = spawnShip(helpers, { pos: { x: 12000, z: 0 } });
  const shipB = spawnShip(helpers, { pos: { x: 12100, z: 0 } });
  const idA = shipA.id;
  const idB = shipB.id;

  tickFarActors(state, helpers, bus);
  assert.ok(getFarActor(state, idA));
  assert.ok(getFarActor(state, idB));

  // Explicit-id inserts check only their own table and live bodies, so build that alias directly.
  const prop = insertDressingRow(state, { id: idA, pos: { x: 12040, z: 30 }, radius: 6, homeSectorId: 'sector_ceres_belt' });
  const rock = insertAsteroidFieldRock(state, { id: idB, pos: { x: 12080, z: -30 }, radius: 6, homeSectorId: 'sector_ceres_belt' });
  assert.equal(prop.id, idA, 'the fixture must alias the prop onto the shelved id');
  assert.equal(rock.id, idB, 'the fixture must alias the rock onto the shelved id');

  player.pos.x = 12000;
  tickFarActors(state, helpers, bus);

  const ships = state.entityList.filter((e) => e.alive !== false && e.type === 'ship' && e.id !== player.id);
  assert.equal(ships.length, 2, 'both ships come back');
  for (const ship of ships) {
    assert.notEqual(ship.id, idA);
    assert.notEqual(ship.id, idB);
  }
  assert.equal(state.entities.has(idA), false);
  assert.equal(state.entities.has(idB), false);
  assert.equal(getDressingRow(state, idA), prop);
  assert.equal(getAsteroidFieldRock(state, idB), rock);
  assert.equal(getFarActor(state, idA), null);
  assert.equal(getFarActor(state, idB), null);
});

test('survival/swarm holds every live ship on the table', () => {
  const { state, helpers, bus } = boot();
  state.run = { kind: 'survival', ruleset: 'swarm' };
  const far = spawnShip(helpers, { pos: { x: 18000, z: 0 } });
  assert.equal(shouldVirtualizeFarActor(far, state), false);
  const result = tickFarActors(state, helpers, bus);
  assert.equal(result.shelved, 0);
  assert.ok(state.entities.get(far.id));
});

test('pinned and nearby wrecks stay; dormant far wrecks shelve', () => {
  const { state, helpers, bus } = boot();
  const farWreck = helpers.spawnEntity({
    type: 'wreck',
    pos: { x: 15000, z: 40 },
    radius: 10,
    mass: 40,
    collides: false,
    data: { wreckClass: 'battlefield', homeSectorId: 'sector_ceres_belt' },
  });
  farWreck.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  const pinned = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 16000, z: 0 },
    radius: 8,
    mass: 20,
    hull: 50,
    hullMax: 50,
    collides: true,
    flags: { missionPinned: true },
    data: { missionPinned: true, homeSectorId: 'sector_ceres_belt' },
  });
  pinned.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };

  tickFarActors(state, helpers, bus);
  assert.equal(state.entities.has(farWreck.id), false);
  assert.ok(getFarActor(state, farWreck.id));
  assert.ok(state.entities.get(pinned.id));
  const census = farActorCensus(state);
  assert.ok(census.farActors >= 1);
  assert.ok(census.liveShips >= 2);
});

test('unnamed quiet world-site wrecks shelf; unique wrecks stay', () => {
  const { state, helpers, bus } = boot();
  const siteWreck = helpers.spawnEntity({
    type: 'wreck',
    pos: { x: 18000, z: 0 },
    radius: 24,
    mass: 1e9,
    collides: true,
    data: {
      worldSiteId: 'world_site_wreck_cathedral',
      worldRecordId: 'world_site_wreck_cathedral/component/cathedral_hull',
      persistenceOwner: 'asteroidSites',
      kind: 'world_site_component',
      homeSectorId: 'sector_ceres_belt',
    },
  });
  siteWreck.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  const unique = helpers.spawnEntity({
    type: 'wreck',
    pos: { x: 19000, z: 0 },
    radius: 12,
    mass: 1e6,
    collides: true,
    data: { uniqueWreckId: 'wreck_isc_vigilant', name: 'ISC Vigilant', homeSectorId: 'sector_ceres_belt' },
  });
  unique.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };

  assert.equal(shouldVirtualizeFarActor(siteWreck, state), true);
  assert.equal(shouldVirtualizeFarActor(unique, state), false);
  tickFarActors(state, helpers, bus);
  assert.equal(state.entities.has(siteWreck.id), false);
  assert.ok(getFarActor(state, siteWreck.id));
  assert.ok(state.entities.get(unique.id));
});

test('far snapshot stays lean and promote runs catch-up first', () => {
  const { state, helpers } = boot();
  const ship = spawnShip(helpers, {
    pos: { x: 40, z: 0 },
    data: {
      trafficRole: 'hauler',
      homeSectorId: 'sector_ceres_belt',
      shipDefId: 'hull_workhorse',
      salvagePool: { cmdty_scrap_metal: 9 },
      aftermath: { markerId: 'fat', evidence: { long: true } },
    },
  });
  ship.vel = { x: 12, z: 0 };
  ship.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false, lastExactT: 0 };
  state.simTime = 0;
  const rec = insertFarActor(state, ship, 0);
  assert.equal(rec.data.salvagePool, undefined);
  assert.equal(rec.data.aftermath, undefined);
  assert.equal(rec.trafficRole, 'hauler');
  assert.equal(rec.hullDefId, 'hull_workhorse');
  assert.ok(!('flags' in rec) || rec.flags == null);

  rec.lastExactT = 0;
  rec.vel = { x: 12, z: 0 };
  rec.pos = { x: 40, z: 0 };
  state.simTime = 5;
  helpers.removeEntity(ship.id, { immediate: true });
  const live = promoteFarActor(state, rec.id, helpers);
  assert.ok(live);
  assert.ok(Math.abs(live.pos.x - 100) < 0.01, `expected catch-up pose ~100, got ${live.pos.x}`);
  assert.equal(getFarActor(state, rec.id), null);
});

test('production leftover S3 still shelves after delayed far-actor exit', () => {
  const { state, helpers, bus, player } = boot();
  state.runtime = { ...(state.runtime || {}), profileId: 'production' };
  player.maxSpeed = 500;
  state.tick = 1;

  const primed = ensureActivityClassified(state);
  assert.equal(primed.classifyMode, 'full');
  const radii = farActorTableRadius(state);
  const nearExit = (primed.physicsReachWu || 0) + NEAR_EXIT_PAD_WU;
  assert.ok(
    radii.exit > nearExit + 8,
    `need decodeR hysteresis band (far exit ${radii.exit} vs near exit ${nearExit})`,
  );

  const x = (nearExit + radii.exit) / 2;
  const far = spawnShip(helpers, {
    pos: { x, z: 0 },
    data: {
      trafficRole: 'hauler',
      homeSectorId: 'sector_ceres_belt',
      named: true,
    },
  });
  const farId = far.id;

  state.tick = 2;
  const insideExit = tickFarActors(state, helpers, bus);
  assert.equal(insideExit.shelved, 0, 'S3 inside far-actor exit must stay live');
  assert.equal(state.entities.has(farId), true);
  const stamped = state.entities.get(farId);
  assert.equal(stamped.activity.simTier, SIM_TIER.S3_DORMANT);
  const listed = ensureActivityClassified(state);
  assert.ok(
    listed.dormantIds.includes(farId) || listed.abstractIds.includes(farId),
    'visited S3 is listed on the classify tick',
  );

  player.pos.x = -1e5;
  state.tick = 3;
  const leftover = ensureActivityClassified(state);
  assert.equal(leftover.classifyMode, 'incremental');
  assert.equal(leftover.dormantIds.includes(farId), false, 'leftover S3 is counted not listed');
  assert.equal(leftover.abstractIds.includes(farId), false);
  assert.ok(leftover.counts.s3 >= 1);
  assert.equal(state.entities.get(farId).activity.simTier, SIM_TIER.S3_DORMANT);

  const delayed = tickFarActors(state, helpers, bus);
  assert.ok(delayed.shelved >= 1, 'unvisited S3 beyond exit must still shelve');
  assert.equal(state.entities.has(farId), false);
  assert.ok(getFarActor(state, farId));
});

test('shelved far actors round-trip through the save payload', () => {
  const { state, helpers, bus } = boot();
  const far = spawnShip(helpers, {
    pos: { x: 12000, z: 0 },
    data: {
      trafficRole: 'hauler',
      homeSectorId: 'sector_ceres_belt',
      worldRecordId: 'wr_npc_roundtrip',
      ai: { archetype: 'trader', passive: true },
    },
  });
  const farId = far.id;
  tickFarActors(state, helpers, bus);
  assert.equal(state.entities.has(farId), false);
  assert.ok(getFarActor(state, farId));

  // Save-path shape: serialize → JSON (localStorage) → restore into the cleared state.
  const payload = JSON.parse(JSON.stringify(serializeFarActorTable(state.world.farActors)));
  state.entities.clear();
  state.entityList.length = 0;
  state.freeIds.length = 0;
  state.nextEntityId = 1;
  restoreFarActorTable(state, payload);

  const row = getFarActor(state, farId);
  assert.ok(row, 'shelved row must restore from the save payload');
  assert.equal(row.data.worldRecordId, 'wr_npc_roundtrip');
  assert.deepEqual(row.data.ai, { archetype: 'trader', passive: true },
    'the durable ai descriptor must survive shelve→save→load');
  assert.equal(farActorHoldsWorldRecord(state, 'wr_npc_roundtrip'), true,
    'a shelved record must not rematerialize a second live entity');
  assert.equal(farActorHoldsWorldRecord(state, 'wr_npc_other'), false);

  // The shelved id stays reserved: fresh spawns must never land on it.
  state.nextEntityId = farId; // simulate an allocator that would collide
  const spawned = helpers.spawnEntity({ type: 'fx', pos: { x: 0, z: 0 } });
  assert.notEqual(spawned.id, farId, 'allocator must skip the shelved id');
  assert.equal(getFarActor(state, farId), row);

  // The actor still promotes back live on approach after reload.
  const live = promoteFarActor(state, farId, helpers);
  assert.ok(live, 'restored far actor must promote back to a live entity');
  assert.equal(live.data.worldRecordId, 'wr_npc_roundtrip');
  assert.deepEqual(live.data.ai, { archetype: 'trader', passive: true });
});

test('runtime presentation stamps on shelved rows never reach the save payload', () => {
  const { state, helpers, bus } = boot();
  const far = spawnShip(helpers, {
    pos: { x: 12000, z: 0 },
    data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
  });
  const farId = far.id;
  tickFarActors(state, helpers, bus);
  const row = getFarActor(state, farId);
  assert.ok(row);

  // The mesh loop resolves the shelved row itself as a presentation entity and stamps a live
  // Object3D on it (e.mesh = m; e.view = { root: m }). A recursive clone of that graph
  // stack-overflows — serializing must strip runtime fields instead.
  const fakeObject3D = { isObject3D: true, children: [], matrix: { elements: new Array(16).fill(0) } };
  fakeObject3D.children.push(fakeObject3D); // cyclic, like a real scene graph can be
  row.mesh = fakeObject3D;
  row.view = { root: fakeObject3D };
  row._noMesh = true;
  row.liveEntityId = 9999;

  const payload = serializeFarActorTable(state.world.farActors);
  assert.ok(payload, 'serialize must not throw on presentation-stamped rows');
  const json = JSON.stringify(payload); // proves the payload is JSON-safe
  const restored = JSON.parse(json);
  const saved = restored.rows.find((r) => r.id === farId);
  assert.ok(saved);
  for (const key of ['mesh', 'view', '_noMesh', 'liveEntityId', '_cell']) {
    assert.equal(saved[key], undefined, `runtime field ${key} must not serialize`);
  }
  assert.equal(saved.type, 'ship');
  assert.equal(saved.trafficRole, 'hauler');
});

test('a missing or empty far-actor payload restores to no table', () => {
  const { state } = boot();
  assert.equal(restoreFarActorTable(state, null), null);
  assert.equal(state.world.farActors, null);
  assert.equal(restoreFarActorTable(state, { schema: FAR_ACTOR_SCHEMA, rows: [] }), null);
  assert.equal(restoreFarActorTable(state, { schema: 'bogus', rows: [{ id: 5 }] }), null);
  // Legacy saves (no farActors key) keep the old behavior: records rematerialize live.
  assert.equal(farActorHoldsWorldRecord(state, 'wr_npc_roundtrip'), false);
});
