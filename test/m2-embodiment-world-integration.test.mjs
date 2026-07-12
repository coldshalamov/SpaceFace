// M2 C2↔C3 integration: sectorSim recipes become world-owned durable records only on FULL promote.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import {
  RESIDENCY_TIER,
  sectorGlobalOrigin,
} from '../src/data/sectorCoordinates.js';
import {
  SECTOR_EMBODIMENT_SCHEMA_ID,
  MAX_EMBODIMENT_INTENTS_PER_SECTOR,
  consumeEmbodimentPayload,
  createEmptyEmbodimentCache,
  normalizeEmbodimentCache,
} from '../src/world/embodimentRecipes.js';
import {
  RECORD_KIND,
  recordsForSector,
  serializeRecordsBag,
  stableRecordId,
} from '../src/world/worldRecords.js';
import { stableIntentId } from '../src/sim/sector/embodiment.js';

const CERES = 'sector_ceres_belt';

function bootWorld(seed = 42) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, bus, helpers, world, player };
}

function recipe(kind, epochKey, slot = 0, seed = 42, sectorId = CERES) {
  const recordKind = kind === 'convoy_itinerary' ? RECORD_KIND.CONVOY : RECORD_KIND.NPC;
  const stem = kind === 'convoy_itinerary'
    ? 'convoy'
    : kind === 'patrol_presence' ? 'patrol' : 'raid';
  const identityKey = `${stem}:${epochKey}:${slot}`;
  const payload = kind === 'convoy_itinerary'
    ? { slot, role: 'relief_hauler', preferredFactionId: 'faction_mts', scarcity: true }
    : kind === 'patrol_presence'
      ? { slot, role: 'patrol', factionId: 'faction_scn', lawful: true }
      : { slot, role: 'raider', factionId: 'faction_reach', lawful: false };
  return {
    schemaId: SECTOR_EMBODIMENT_SCHEMA_ID,
    schemaVersion: 1,
    intentId: stableIntentId(seed, sectorId, kind, epochKey, String(slot)),
    sectorId,
    kind,
    epochKey,
    epochDays: epochKey * 0.25,
    source: 'sector_field',
    proposedRecordId: stableRecordId(seed, sectorId, recordKind, identityKey),
    proposedRecordKind: recordKind,
    identityKey,
    payload,
  };
}

function payload(epochKey, intents, sectorIds = [CERES]) {
  return {
    schemaId: SECTOR_EMBODIMENT_SCHEMA_ID,
    epochKey,
    epochDays: epochKey * 0.25,
    digest: 0xabc000 + epochKey,
    sectorIds,
    intents,
    createsEntities: false,
    writesCredits: false,
    writesCargo: false,
    writesRep: false,
    writesHull: false,
  };
}

function liveForRecord(state, recordId) {
  return state.entityList.filter((e) => e && e.alive && e.data && e.data.worldRecordId === recordId);
}

test('cache fails closed, ignores older epochs, merges same epoch, and stays bounded', () => {
  const cache = createEmptyEmbodimentCache();
  assert.equal(consumeEmbodimentPayload(cache, null).accepted, 0);
  assert.equal(consumeEmbodimentPayload(cache, { schemaId: 'wrong', epochKey: 1, intents: [] }).accepted, 0);

  const first = recipe('convoy_itinerary', 4, 0);
  consumeEmbodimentPayload(cache, payload(4, [first]));
  const second = recipe('patrol_presence', 4, 1);
  consumeEmbodimentPayload(cache, payload(4, [second]));
  assert.deepEqual(cache.bySector[CERES].intents.map((it) => it.intentId).sort(), [first.intentId, second.intentId].sort());

  consumeEmbodimentPayload(cache, payload(3, [recipe('raid_presence', 3, 0)]));
  assert.equal(cache.bySector[CERES].epochKey, 4, 'older payload ignored');

  const many = [];
  for (let i = 0; i < MAX_EMBODIMENT_INTENTS_PER_SECTOR + 12; i++) {
    many.push(recipe(i % 2 ? 'patrol_presence' : 'raid_presence', 5, i));
  }
  consumeEmbodimentPayload(cache, payload(5, many));
  assert.equal(cache.bySector[CERES].epochKey, 5);
  assert.equal(cache.bySector[CERES].intents.length, MAX_EMBODIMENT_INTENTS_PER_SECTOR);
  assert.deepEqual(normalizeEmbodimentCache(cache), cache, 'cache normalization is idempotent');
});

test('event consumption never spawns; REDUCED does not adopt recipes; FULL does exactly once', () => {
  const { state, bus, world } = bootWorld();
  const intents = [
    recipe('convoy_itinerary', 6, 0),
    recipe('patrol_presence', 6, 0),
    recipe('raid_presence', 6, 0),
  ];
  const before = state.entityList.length;
  bus.emit('sectorsim:embodiment', payload(6, intents));
  assert.equal(state.entityList.length, before, 'recipe event must not create a live entity');
  assert.equal(state.world.embodiment.bySector[CERES].intents.length, 3);

  const active = world._emptySectorBag();
  world._rematerializeSectorRecords(CERES, active, RESIDENCY_TIER.REDUCED);
  assert.equal(recordsForSector(state.world.records, CERES).length, 0, 'REDUCED must not reconcile recipes');
  assert.equal(state.entityList.length, before);

  const first = world._rematerializeSectorRecords(CERES, active, RESIDENCY_TIER.FULL);
  assert.equal(first.spawned, 3);
  const records = recordsForSector(state.world.records, CERES);
  assert.equal(records.length, 3);
  assert.ok(records.every((rec) => rec.recordSource === 'sector_embodiment'));
  assert.equal(records.find((rec) => rec.kind === RECORD_KIND.CONVOY).team, 2);
  assert.equal(records.find((rec) => rec.enemyTypeId === 'patrol_lawman').factionId, 'faction_scn');
  assert.equal(records.find((rec) => rec.enemyTypeId === 'reaver_pirate').factionId, 'faction_reach');
  const origin = sectorGlobalOrigin(CERES);
  for (const rec of records) {
    const radius = Math.hypot(rec.pos.x - origin.x, rec.pos.z - origin.z);
    assert.ok(radius >= 719 && radius <= 1901, `global recipe position radius ${radius}`);
  }

  const again = world._rematerializeSectorRecords(CERES, active, RESIDENCY_TIER.FULL);
  assert.equal(again.spawned, 0);
  for (const rec of records) assert.equal(liveForRecord(state, rec.recordId).length, 1);
});

test('existing damage or destroyed outcome is never overwritten by same recipe identity', () => {
  const { state, bus, world } = bootWorld();
  const intent = recipe('raid_presence', 7, 0);
  bus.emit('sectorsim:embodiment', payload(7, [intent]));
  world._rematerializeSectorRecords(CERES, world._emptySectorBag(), RESIDENCY_TIER.FULL);
  const rec = state.world.records.byId[intent.proposedRecordId];
  const live = liveForRecord(state, rec.recordId)[0];
  rec.hull = 17;
  live.alive = false;
  rec.alive = false;
  rec.outcome = 'destroyed';

  bus.emit('sectorsim:embodiment', payload(7, [intent]));
  const result = world._rematerializeSectorRecords(CERES, world._emptySectorBag(), RESIDENCY_TIER.FULL);
  assert.equal(result.spawned, 0);
  assert.equal(state.world.records.byId[rec.recordId].outcome, 'destroyed');
  assert.equal(state.world.records.byId[rec.recordId].hull, 17);
  assert.equal(liveForRecord(state, rec.recordId).length, 0);
});

test('new epoch retires stale active recipe after its live body is gone but keeps tombstones', () => {
  const { state, bus, world } = bootWorld();
  const oldActive = recipe('patrol_presence', 8, 0);
  const oldKilled = recipe('raid_presence', 8, 0);
  bus.emit('sectorsim:embodiment', payload(8, [oldActive, oldKilled]));
  world._rematerializeSectorRecords(CERES, world._emptySectorBag(), RESIDENCY_TIER.FULL);

  const activeEntity = liveForRecord(state, oldActive.proposedRecordId)[0];
  const killedEntity = liveForRecord(state, oldKilled.proposedRecordId)[0];
  activeEntity.alive = false;
  killedEntity.alive = false;
  const killedRecord = state.world.records.byId[oldKilled.proposedRecordId];
  killedRecord.alive = false;
  killedRecord.outcome = 'destroyed';

  const current = recipe('convoy_itinerary', 9, 0);
  bus.emit('sectorsim:embodiment', payload(9, [current]));
  world._rematerializeSectorRecords(CERES, world._emptySectorBag(), RESIDENCY_TIER.FULL);
  assert.equal(state.world.records.byId[oldActive.proposedRecordId], undefined, 'stale active recipe retires');
  assert.equal(state.world.records.byId[oldKilled.proposedRecordId].outcome, 'destroyed', 'outcome tombstone stays');
  assert.ok(state.world.records.byId[current.proposedRecordId]);
});

test('recipe provenance survives spawn, capture, world save, and Continue restore', () => {
  const first = bootWorld(77);
  const intent = recipe('convoy_itinerary', 10, 2, 77);
  first.bus.emit('sectorsim:embodiment', payload(10, [intent]));
  first.world._rematerializeSectorRecords(CERES, first.world._emptySectorBag(), RESIDENCY_TIER.FULL);
  const live = liveForRecord(first.state, intent.proposedRecordId)[0];
  assert.equal(live.data.recordSource, 'sector_embodiment');
  assert.equal(live.data.recipeKey, 'convoy_itinerary:2');

  first.world._captureSectorDurableRecords(CERES, { reason: 'test_capture' });
  const captured = first.state.world.records.byId[intent.proposedRecordId];
  assert.equal(captured.recordSource, 'sector_embodiment');
  assert.equal(captured.recipeKey, 'convoy_itinerary:2');

  const blob = first.world.serialize();
  assert.equal(blob.embodiment.bySector[CERES].epochKey, 10);
  const second = bootWorld(77);
  second.world.deserialize(structuredClone(blob));
  assert.equal(second.state.world.embodiment.bySector[CERES].epochKey, 10);
  const result = second.world._rematerializeSectorRecords(CERES, second.world._emptySectorBag(), RESIDENCY_TIER.FULL);
  assert.equal(result.spawned, 1);
  const restored = liveForRecord(second.state, intent.proposedRecordId)[0];
  assert.ok(restored);
  assert.equal(restored.data.recordSource, 'sector_embodiment');
});

test('Continue restores epoch-N durable records before a later promotion reconciles epoch N+1 recipes', () => {
  const seed = 91;
  const epochN = [
    recipe('convoy_itinerary', 20, 0, seed),
    recipe('patrol_presence', 20, 0, seed),
    recipe('raid_presence', 20, 0, seed),
  ];
  const epochN1 = [
    recipe('convoy_itinerary', 21, 1, seed),
    recipe('patrol_presence', 21, 1, seed),
    recipe('raid_presence', 21, 1, seed),
  ];

  const first = bootWorld(seed);
  first.bus.emit('sectorsim:embodiment', payload(20, epochN));
  first.world._rematerializeSectorRecords(CERES, first.world._emptySectorBag(), RESIDENCY_TIER.FULL);
  const savedRecords = serializeRecordsBag(first.state.world.records);
  first.bus.emit('sectorsim:embodiment', payload(21, epochN1));

  const second = bootWorld(seed);
  second.world.deserialize({
    currentSectorId: CERES,
    records: structuredClone(savedRecords),
    embodiment: structuredClone(first.state.world.embodiment),
  });
  const beforeContinue = JSON.stringify(serializeRecordsBag(second.state.world.records));
  second.world.enterSector(CERES, { placePlayer: false, restoreDurableRecords: true });
  const afterContinue = JSON.stringify(serializeRecordsBag(second.state.world.records));

  assert.equal(afterContinue, beforeContinue,
    'Continue must rematerialize the serialized durable bag byte-identically');
  assert.equal(second.state.world.embodiment.bySector[CERES].epochKey, 21,
    'Continue must retain the newer recipe cache for later reconciliation');
  for (const intent of epochN) {
    assert.ok(second.state.world.records.byId[intent.proposedRecordId], 'saved epoch-N record remains');
    assert.equal(liveForRecord(second.state, intent.proposedRecordId).length, 1,
      'saved epoch-N record rematerializes once');
  }
  for (const intent of epochN1) {
    assert.equal(second.state.world.records.byId[intent.proposedRecordId], undefined,
      'newer recipe does not replace serialized records during Continue');
  }

  second.world._demoteSectorToRecordOnly(CERES);
  second.world.enterSector(CERES, { placePlayer: false });
  for (const intent of epochN) {
    assert.equal(second.state.world.records.byId[intent.proposedRecordId], undefined,
      'ordinary later promotion retires stale epoch-N active records');
  }
  for (const intent of epochN1) {
    assert.ok(second.state.world.records.byId[intent.proposedRecordId],
      'ordinary later promotion reconciles the retained epoch-N+1 recipe');
  }
});
