import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { SIM_TIER } from '../src/world/activityClassification.js';
import {
  FAR_ACTOR_SCHEMA,
  farActorCensus,
  getFarActor,
  isStrippedHullEchoTwin,
  restoreFarActorTable,
  shouldVirtualizeFarActor,
  tickFarActors,
} from '../src/world/farActorTable.js';
import { tickPlayerHullEcho } from '../src/world/playerHullEcho.js';
import { ensureWorldRecords } from '../src/world/worldRecords.js';

// The player-hull echo (M11, src/world/playerHullEcho.js) is owner-keyed like the marker,
// one-off and onboarding bodies: tickPlayerHullEcho re-mints a missing echo every tick while
// the lean far row drops hullEchoLossId/siteId/scanLabel. Before the residency exemption a
// shelved echo minted one anonymous durable twin per tick — thousands of identical-position
// wreck rows on the site anchor that promoted as a single coincident heap and detonated the
// solver inside world.step. The echo stays resident; pre-fix rows are dropped at restore by
// immutable signature.

function boot(seed = 21) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  return { state, bus, helpers, player };
}

function echoWreck(helpers, pos = { x: 15000, z: 0 }) {
  const ent = helpers.spawnEntity({
    type: 'wreck', pos, vel: { x: 0, z: 0 }, rot: 2.02, radius: 14, mass: 100,
    hull: 100, hullMax: 100, collides: true, ttl: Infinity, homeSectorId: 'sector_charon_expanse',
    data: {
      name: 'Hitch', defId: 'ship_kestrel', parentType: 'ship', parentDefId: 'ship_kestrel',
      hulkOfDefId: 'ship_kestrel', hullEchoLossId: 'loss_42', siteId: 'preserved_cockpit',
      persistenceOwner: 'alienEcology', scanLabel: 'Hitch — Kestrel', salvagePool: {},
      homeSectorId: 'sector_charon_expanse',
    },
  });
  ent.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  return ent;
}

function echoRow(id, over = {}) {
  // Pre-fix lean-row shape: hullEchoLossId/siteId/scanLabel all stripped.
  return {
    id, type: 'wreck', alive: true, farResident: true,
    pos: { x: 10492, z: 29072 }, vel: { x: 0, z: 0 }, rot: 2.02, angVel: 0,
    radius: 14, mass: 100, hull: 100, hullMax: 100,
    shield: 0, shieldMax: 0, team: 0, factionId: null,
    homeSectorId: 'sector_charon_expanse', hullDefId: 'ship_kestrel',
    intent: null, route: null, lastExactT: 0, nextEventAtT: -1,
    collides: true,
    data: { defId: 'ship_kestrel', wreckClass: 'ancient', persistenceOwner: 'alienEcology',
      homeSectorId: 'sector_charon_expanse' },
    jobId: null, trafficRole: null, virtualizedAt: 0,
    ...over,
  };
}

function ordinaryWreck(helpers, pos = { x: 15100, z: 0 }) {
  const ent = helpers.spawnEntity({
    type: 'wreck', pos, radius: 10, mass: 40, collides: false,
    data: { wreckClass: 'battlefield', homeSectorId: 'sector_ceres_belt' },
  });
  ent.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  return ent;
}

test('a hull-echo body never shelves — the lean row drops the owner keys', () => {
  const { state, helpers, bus } = boot();
  const echo = echoWreck(helpers);
  const ordinary = ordinaryWreck(helpers);
  assert.equal(shouldVirtualizeFarActor(echo, state), false);
  assert.equal(shouldVirtualizeFarActor(ordinary, state), true);
  tickFarActors(state, helpers, bus);
  assert.ok(state.entities.get(echo.id), 'the echo stays live past the exit radius');
  assert.equal(getFarActor(state, echo.id), null);
  assert.equal(state.entities.has(ordinary.id), false);
  assert.ok(getFarActor(state, ordinary.id));
});

test('isStrippedHullEchoTwin matches only anonymous alienEcology wreck rows', () => {
  assert.equal(isStrippedHullEchoTwin(echoRow(1)), true);
  // A row that kept echo identity is the real body, not a spent twin.
  assert.equal(isStrippedHullEchoTwin(echoRow(2, { data: { ...echoRow(0).data, hullEchoLossId: 'loss_42' } })), false);
  // Other owners, types and identity never match.
  assert.equal(isStrippedHullEchoTwin(echoRow(3, { data: { persistenceOwner: 'asteroidSites' } })), false);
  assert.equal(isStrippedHullEchoTwin(echoRow(4, { type: 'ship' })), false);
  assert.equal(isStrippedHullEchoTwin(echoRow(5, { data: {} })), false);
  assert.equal(isStrippedHullEchoTwin(null), false);
});

test('restore drops stripped echo twins and keeps every other row', () => {
  const state = { world: {} };
  const keptEcho = echoRow(30, { data: { ...echoRow(0).data, hullEchoLossId: 'loss_42' } });
  const ordinary = {
    id: 40, type: 'ship', alive: true, farResident: true,
    pos: { x: 1000, z: -200 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius: 8, mass: 20, hull: 80, hullMax: 80, shield: 0, shieldMax: 0,
    team: 2, factionId: 'faction_free', homeSectorId: 'sector_ceres_belt', hullDefId: null,
    intent: null, route: null, lastExactT: 0, nextEventAtT: -1, collides: true,
    data: { ai: { archetype: 'passive' } }, jobId: null, trafficRole: null, virtualizedAt: 0,
  };
  const rows = [echoRow(10), echoRow(11, { hull: 5 }), keptEcho, ordinary];
  const table = restoreFarActorTable(state, { schema: FAR_ACTOR_SCHEMA, version: 0, rows });
  assert.deepEqual(table.rows.map((r) => r.id).sort((a, b) => a - b), [30, 40]);
});

test('the mint/shelve clone factory is dead: one live echo, zero rows accrue', () => {
  const { state, helpers, bus } = boot();
  state.world.currentSectorId = 'sector_charon_expanse';
  ensureWorldRecords(state.world).hullLosses.push({
    lossId: 'loss_42', name: 'Hitch', shipDefId: 'ship_kestrel', shipClass: 'Kestrel',
    sectorId: 'sector_charon_expanse', sectorName: 'Charon Expanse', lostAt: 12,
    rot: 2.02, radius: 14,
  });
  const world = {
    state, bus, helpers, active: null,
    _toGlobal: (p) => ({ x: p.x + 8192, z: p.z + 28672 }),
  };
  const site = {
    siteId: 'preserved_cockpit', sectorId: 'sector_charon_expanse', playerHullEcho: true,
    center: { x: 2300, z: 400 }, arrivalBands: { long: 600, mid: 220, close: 60 },
  };
  // The echo materializes at the site anchor (~13k WU away) while the player stays at origin.
  for (let i = 0; i < 40; i++) {
    tickPlayerHullEcho(world, site);
    tickFarActors(state, helpers, bus);
  }
  const echoes = state.entityList.filter((e) => e.alive !== false
    && e.data && e.data.hullEchoLossId === 'loss_42');
  assert.equal(echoes.length, 1, 'exactly one live echo body exists');
  assert.equal(farActorCensus(state).farActors, 0, 'no anonymous twin rows accrue on the shelf');
});
