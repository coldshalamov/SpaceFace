import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { shouldAutoTriggerAuthoredUpgrade } from '../src/render/partsLibrary.js';
import { isEntityAuthoredUpgradeRelevant, isEntityRenderRelevant } from '../src/render/renderer.js';
import {
  authoredPrefetchRadius,
  residencyEvictRadius,
  residencyPrefetchRadius,
  TABLE_AUTHORED_DECODE_SECONDS,
  TABLE_REFERENCE_SPEED_WU,
  TABLE_RESIDENCY_EVICT_SECONDS,
  TABLE_RESIDENCY_PREFETCH_SECONDS,
} from '../src/render/tabletopPolicy.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { insertFarActor } from '../src/world/farActorTable.js';
import {
  collectMeshPresentationEntities,
  requestDecodeRunwayPromote,
  resolveWorldPresentationEntity,
} from '../src/world/presentationSources.js';

function boot(seed = 77) {
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
  player.vel = { x: 0, z: 0 };
  player.maxSpeed = TABLE_REFERENCE_SPEED_WU;
  return { state, helpers, player };
}

test('evict stays farther than admit so a lip oscillation does not thrash', () => {
  assert.ok(TABLE_RESIDENCY_EVICT_SECONDS > TABLE_RESIDENCY_PREFETCH_SECONDS);
  assert.ok(residencyEvictRadius() > residencyPrefetchRadius());
  assert.equal(authoredPrefetchRadius(), TABLE_AUTHORED_DECODE_SECONDS * TABLE_REFERENCE_SPEED_WU);
});

test('decode runway sees an inbound far hull and can request promote', () => {
  const { state, helpers, player } = boot();
  const decodeR = authoredPrefetchRadius(TABLE_REFERENCE_SPEED_WU);
  const rec = insertFarActor(state, {
    id: 501,
    type: 'ship',
    pos: { x: decodeR * 0.7, z: 0 },
    vel: { x: -160, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    hull: 40,
    hullMax: 40,
    team: 1,
    data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
    flags: {},
  });
  insertAsteroidFieldRock(state, {
    id: 777,
    pos: { x: 80, z: 0 },
    radius: 10,
    mass: 400,
    data: { typeId: 'ast_common_rock', oreHP: 40, oreHPMax: 40 },
  });

  assert.equal(resolveWorldPresentationEntity(state, rec.id), rec);
  assert.ok(collectMeshPresentationEntities(state).some((row) => row.id === rec.id));

  const inbound = {
    id: rec.id,
    type: 'ship',
    alive: true,
    farResident: true,
    pos: rec.pos,
    vel: rec.vel,
    radius: rec.radius,
  };
  const authoredState = {
    playerId: player.id,
    player: { targetId: null },
    entities: state.entities,
    camera: { zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 },
  };
  assert.equal(isEntityAuthoredUpgradeRelevant(inbound, authoredState), true,
    'an inbound hull inside the 4s decode runway must start authored work before glass');

  const missing = requestDecodeRunwayPromote(state, null);
  assert.equal(missing.helpersMissing, true);
  assert.ok(missing.farSeen >= 1);
  assert.equal(missing.farPromoted, 0);
  assert.ok(missing.rocksSeen >= 1);
  assert.equal(missing.rocksPromoted, 0, 'field rocks stay on the ledger; do not refill the combat list');

  const promoted = requestDecodeRunwayPromote(state, helpers);
  assert.equal(promoted.helpersMissing, false);
  assert.ok(promoted.farPromoted >= 1);
  assert.equal(promoted.rocksPromoted, 0);
  const live = state.entities.get(rec.id);
  assert.ok(live && live.alive !== false);
  assert.equal(resolveWorldPresentationEntity(state, rec.id), live);
});

test('a mesh already on the lip is kept when the live body is shelved', () => {
  const prefetch = residencyPrefetchRadius();
  const evict = residencyEvictRadius();
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    maxSpeed: 160, radius: 8, data: {},
  };
  const entities = new Map([[1, player]]);
  const state = {
    mode: 'flight',
    playerId: 1,
    player: { targetId: null },
    entities,
    entityList: [player],
    world: {},
    camera: { zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 },
    settings: { video: { fov: 50 } },
  };
  const rec = insertFarActor(state, {
    id: 44,
    type: 'ship',
    pos: { x: (prefetch + evict) * 0.5, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    hull: 40,
    hullMax: 40,
    team: 1,
    data: {},
    flags: {},
  });
  assert.equal(isEntityRenderRelevant(rec, state, evict), true,
    'existing lip resident stays until the evict radius, not the admit radius');
  assert.equal(isEntityRenderRelevant(rec, state, prefetch), false,
    'a new create does not start in the hysteresis band');
});

test('flight first-render does not compose an ordinary on-glass hull', () => {
  const scene = { name: 'main' };
  const npc = { id: 9, type: 'ship', alive: true, mesh: { visible: true } };
  const liveState = {
    mode: 'flight',
    render: { scene, camera: null },
    player: { targetId: null },
  };
  assert.equal(shouldAutoTriggerAuthoredUpgrade(npc, scene, liveState), false);
  liveState.player.targetId = 9;
  assert.equal(shouldAutoTriggerAuthoredUpgrade(npc, scene, liveState), true);
});
