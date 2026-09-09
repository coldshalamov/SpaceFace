import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { SIM_TIER } from '../src/world/activityClassification.js';
import {
  farActorCensus,
  getFarActor,
  insertFarActor,
  promoteFarActor,
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
