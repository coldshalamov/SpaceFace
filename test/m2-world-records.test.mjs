// M2-C2 durable world records + deterministic rematerialization.
// Adversarial fixtures: demote/promote, eviction, repeat load, absent/old records,
// stable IDs, no frame serialization, no duplicate live entities.
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
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { MIGRATIONS } from '../src/save/migrations.js';
import { WORLD_SITE_MANIFESTS } from '../src/data/worldSiteManifests.js';
import {
  RECORD_KIND,
  WORLD_RECORDS_SCHEMA_ID,
  captureEntityRecord,
  createEmptyRecordsBag,
  deserializeRecordsBag,
  entityHasDurableMarkers,
  entityIsDurableCandidate,
  ensureWorldRecords,
  findLiveEntityForRecord,
  normalizeRecordsBag,
  recordsForSector,
  serializeRecordsBag,
  spawnSpecFromRecord,
  stableRecordId,
} from '../src/world/worldRecords.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const TETHYS = 'sector_tethys_junction';

function bootWorld(seed = 42) {
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
    radius: 4,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.vel = player.vel || { x: 0, z: 0 };
  player.flags = player.flags || { boosting: false, docked: false, invuln: false, noInterp: false };
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, bus, helpers, world, player };
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function migrateChain(data, fromVer) {
  let v = fromVer | 0;
  let guard = 0;
  while (v < CURRENT_VERSION && guard++ < 64) {
    const step = MIGRATIONS.find((m) => m.from === v);
    if (!step) break;
    step.fn(data);
    v = step.to;
  }
  return v;
}

function entitiesWithRecord(state, recordId) {
  return state.entityList.filter((e) => e && e.alive && e.data && e.data.worldRecordId === recordId);
}

function liveShipsForSector(state, sectorId) {
  return state.entityList.filter((e) => {
    if (!e || !e.alive || e.type !== 'ship' || e.isPlayer) return false;
    const home = e.homeSectorId || (e.data && e.data.homeSectorId);
    return home === sectorId;
  });
}

// ── pure schema ─────────────────────────────────────────────────────────────────────────────

test('stableRecordId is deterministic and independent of live entity ids', () => {
  const a = stableRecordId(42, CERES, RECORD_KIND.NPC, 'reaver:1');
  const b = stableRecordId(42, CERES, RECORD_KIND.NPC, 'reaver:1');
  const c = stableRecordId(42, CERES, RECORD_KIND.NPC, 'reaver:2');
  const d = stableRecordId(99, CERES, RECORD_KIND.NPC, 'reaver:1');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.match(a, /^wr_npc_[0-9a-f]+$/);
});

test('an explicit foreign persistence owner fails closed before wreck/worldRecord markers', () => {
  const siteProxy = {
    id: 99,
    type: 'wreck',
    alive: true,
    data: {
      worldRecordId: 'world_site_helios_relay/component/relay_core',
      persistenceOwner: 'asteroidSites',
      wreckClass: 'world-site-proxy',
    },
  };
  assert.equal(entityHasDurableMarkers(siteProxy, 1), false);
  assert.equal(entityIsDurableCandidate(siteProxy, 1), false);
  siteProxy.data.persistenceOwner = 'worldRecords';
  assert.equal(entityHasDurableMarkers(siteProxy, 1), true);
});

test('world capture excludes every PQ-017 runtime entity while asteroidSites keeps one authority record', () => {
  const { state, bus, helpers, world } = bootWorld(117);
  const sites = Object.assign(Object.create(asteroidSites), {});
  sites.init({ state, bus, helpers, registry: { get() { return null; } } });
  world.enterSector(HELIOS);
  const live = state.entityList.filter((entity) => entity && entity.alive && entity.data
    && entity.data.worldSiteId === 'world_site_helios_relay');
  assert.ok(live.length >= 7);
  assert.ok(live.every((entity) => entity.data.persistenceOwner === 'asteroidSites'));

  world._captureSectorDurableRecords(HELIOS, { reason: 'pq017-owner-proof' });
  assert.equal(Object.keys(state.world.records.byId).some((id) => id.startsWith('world_site_helios_relay')), false);
  const serialized = sites.serialize();
  // Every authored World Site serializes exactly once, in manifest order, with no duplicates and
  // no extra records. Derived from the manifest list so a new authored site cannot silently pass.
  assert.deepEqual(serialized.worldOrder, WORLD_SITE_MANIFESTS.map((manifest) => manifest.id));
  assert.equal(Object.keys(serialized.worldById).length, WORLD_SITE_MANIFESTS.length);
  assert.ok(serialized.worldOrder.includes('world_site_helios_relay'));
});

test('normalizeRecordsBag fails closed on absent/corrupt and strips runtime fields', () => {
  assert.deepEqual(normalizeRecordsBag(null).byId, {});
  assert.deepEqual(normalizeRecordsBag(undefined).byId, {});
  assert.deepEqual(normalizeRecordsBag([]).byId, {});
  assert.deepEqual(normalizeRecordsBag('x').byId, {});

  const bag = normalizeRecordsBag({
    schemaId: WORLD_RECORDS_SCHEMA_ID,
    byId: {
      good: {
        recordId: 'good',
        kind: RECORD_KIND.CONVOY,
        sectorId: HELIOS,
        homeSectorId: HELIOS,
        pos: { x: 10, z: -20 },
        liveEntityId: 999,
        rematerializedTick: 7,
      },
      bad_kind: { recordId: 'bad_kind', kind: 'spaceship', sectorId: HELIOS, pos: { x: 0, z: 0 } },
      bad_pos: { recordId: 'bad_pos', kind: RECORD_KIND.NPC, sectorId: HELIOS, pos: { x: NaN, z: 1 } },
    },
  });
  assert.ok(bag.byId.good);
  assert.equal(bag.byId.good.kind, RECORD_KIND.CONVOY);
  assert.equal('liveEntityId' in bag.byId.good, false);
  assert.equal(bag.byId.bad_kind, undefined);
  assert.equal(bag.byId.bad_pos, undefined);
});

test('serializeRecordsBag never emits frameOrigin / residentSectors / sectorContents', () => {
  const bag = createEmptyRecordsBag();
  bag.byId.wr_test = {
    recordId: 'wr_test',
    kind: RECORD_KIND.NPC,
    sectorId: CERES,
    homeSectorId: CERES,
    pos: { x: sectorGlobalOrigin(CERES).x + 50, z: sectorGlobalOrigin(CERES).z - 10 },
    alive: true,
    outcome: 'active',
    liveEntityId: 12,
  };
  const ser = serializeRecordsBag(bag);
  assert.equal(ser.schemaId, WORLD_RECORDS_SCHEMA_ID);
  assert.equal('frameOrigin' in ser, false);
  assert.equal('residentSectors' in ser, false);
  assert.equal('sectorContents' in ser, false);
  assert.equal('liveEntityId' in ser.byId.wr_test, false);
  assert.equal(ser.byId.wr_test.pos.x, sectorGlobalOrigin(CERES).x + 50);
});

// ── demote / promote identity ───────────────────────────────────────────────────────────────

test('demote to RECORD_ONLY captures durable NPCs; promote restores same record ids without reroll', () => {
  const { state, world, helpers } = bootWorld(101);
  world.enterSector(HELIOS);

  const ceresO = sectorGlobalOrigin(CERES);
  // Force Ceres FULL so ambient enemies exist, then inject a known durable NPC.
  world._setSectorTier(CERES, RESIDENCY_TIER.FULL, { reason: 'test' });
  const npc = helpers.spawnEntity({
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    pos: { x: ceresO.x + 200, z: ceresO.z + 100 },
    vel: { x: 1.5, z: -0.5 },
    rot: 0.4,
    radius: 6,
    mass: 15,
    hull: 40,
    hullMax: 80,
    shield: 5,
    shieldMax: 20,
    collides: true,
    data: {
      defId: 'ship_hornet',
      lootTableId: 'reaver_pirate',
      enemyTypeId: 'reaver_pirate',
      level: 3,
      homeSectorId: CERES,
      ai: { archetype: 'pirate' },
    },
  });
  npc.homeSectorId = CERES;
  world._assignDurableRecordId(npc, CERES, RECORD_KIND.NPC, 'reaver_pirate:fixture', state.world.sectorContents[CERES]);
  const recordId = npc.data.worldRecordId;
  assert.ok(recordId);
  const active = state.world.sectorContents[CERES];
  active.enemies = active.enemies || [];
  active.enemies.push(npc.id);

  // Demote → records written, live entity gone (not mission-pinned).
  world._setSectorTier(CERES, RESIDENCY_TIER.RECORD_ONLY, { reason: 'test_demote' });
  assert.equal(state.entities.get(npc.id), undefined);
  const bag = ensureWorldRecords(state.world);
  assert.ok(bag.byId[recordId], 'record captured on demote');
  assert.equal(bag.byId[recordId].hull, 40);
  assert.equal(bag.byId[recordId].pos.x, ceresO.x + 200);
  assert.equal(bag.byId[recordId].alive, true);

  // Promote FULL → rematerialize same identity, vitals preserved.
  world._setSectorTier(CERES, RESIDENCY_TIER.FULL, { reason: 'test_promote' });
  const live = findLiveEntityForRecord(state.entityList, recordId);
  assert.ok(live, 'rematerialized live entity');
  assert.notEqual(live.id, npc.id, 'live entity id may change; record id is identity');
  assert.equal(live.data.worldRecordId, recordId);
  assert.equal(live.hull, 40);
  assert.equal(live.pos.x, ceresO.x + 200);
  assert.equal(live.pos.z, ceresO.z + 100);
  assert.equal(entitiesWithRecord(state, recordId).length, 1, 'no duplicate live entities');
});

test('destroyed outcome is not re-rolled on rematerialize', () => {
  const { state, world, helpers } = bootWorld(202);
  world.enterSector(HELIOS);
  world._setSectorTier(CERES, RESIDENCY_TIER.FULL, { reason: 'test' });
  const ceresO = sectorGlobalOrigin(CERES);
  const npc = helpers.spawnEntity({
    type: 'ship',
    pos: { x: ceresO.x + 10, z: ceresO.z + 10 },
    hull: 10,
    hullMax: 50,
    collides: true,
    data: { lootTableId: 'wasp_swarmer', enemyTypeId: 'wasp_swarmer', level: 2, homeSectorId: CERES },
  });
  npc.homeSectorId = CERES;
  world._assignDurableRecordId(npc, CERES, RECORD_KIND.NPC, 'wasp:kill', state.world.sectorContents[CERES]);
  const recordId = npc.data.worldRecordId;
  state.world.sectorContents[CERES].enemies.push(npc.id);

  world._setSectorTier(CERES, RESIDENCY_TIER.RECORD_ONLY, { reason: 'evict' });
  world.markWorldRecordDestroyed(recordId, { outcome: 'destroyed' });
  assert.equal(state.world.records.byId[recordId].alive, false);

  world._setSectorTier(CERES, RESIDENCY_TIER.FULL, { reason: 'promote' });
  assert.equal(findLiveEntityForRecord(state.entityList, recordId), null, 'destroyed must not rematerialize');
  assert.equal(entitiesWithRecord(state, recordId).length, 0);
});

test('kill while FULL (before demote) still writes destroyed bag entry — no re-roll', () => {
  const { state, world, helpers, bus } = bootWorld(212);
  world.enterSector(HELIOS);
  world._setSectorTier(CERES, RESIDENCY_TIER.FULL, { reason: 'test' });
  const ceresO = sectorGlobalOrigin(CERES);
  const npc = helpers.spawnEntity({
    type: 'ship',
    pos: { x: ceresO.x + 22, z: ceresO.z + 11 },
    hull: 8,
    hullMax: 40,
    collides: true,
    data: { lootTableId: 'wasp_swarmer', enemyTypeId: 'wasp_swarmer', level: 2, homeSectorId: CERES },
  });
  npc.homeSectorId = CERES;
  world._assignDurableRecordId(npc, CERES, RECORD_KIND.NPC, 'wasp:live-kill', state.world.sectorContents[CERES]);
  const recordId = npc.data.worldRecordId;
  assert.ok(recordId);
  // Bag intentionally empty before kill (spawn only stamped id).
  assert.equal(state.world.records.byId[recordId], undefined);

  // Kill while still FULL — must upsert destroyed stub without prior demote.
  npc.alive = false;
  bus.emit('entity:killed', { id: npc.id, type: 'ship', killerId: state.playerId });
  assert.ok(state.world.records.byId[recordId], 'kill path must write bag even before demote');
  assert.equal(state.world.records.byId[recordId].alive, false);
  assert.equal(state.world.records.byId[recordId].outcome, 'destroyed');

  // Evict + rematerialize must not resurrect the kill.
  world._setSectorTier(CERES, RESIDENCY_TIER.RECORD_ONLY, { reason: 'evict' });
  world._setSectorTier(CERES, RESIDENCY_TIER.FULL, { reason: 'promote' });
  assert.equal(findLiveEntityForRecord(state.entityList, recordId), null);
  assert.equal(entitiesWithRecord(state, recordId).length, 0);

  // Continue-style cycle also keeps the outcome.
  const ser = world.serialize();
  assert.equal(ser.records.byId[recordId].alive, false);
  world.deserialize({
    currentSectorId: CERES,
    coordinateSchema: 'global_v1',
    records: ser.records,
    discovery: ser.discovery,
  });
  world.enterSector(CERES);
  assert.equal(findLiveEntityForRecord(state.entityList, recordId), null);
});

test('convoy + mission_target + aftermath records rematerialize with stable ids', () => {
  const { state, world } = bootWorld(303);
  world.enterSector(HELIOS);
  const o = sectorGlobalOrigin(HELIOS);

  const convoyRec = world.upsertWorldRecord({
    recordId: stableRecordId(303, HELIOS, RECORD_KIND.CONVOY, 'hauler-a'),
    kind: RECORD_KIND.CONVOY,
    sectorId: HELIOS,
    homeSectorId: HELIOS,
    pos: { x: o.x + 300, z: o.z - 50 },
    vel: { x: 2, z: 0 },
    rot: 0.1,
    type: 'ship',
    shipDefId: 'ship_mule',
    team: 2,
    trafficRole: 'hauler',
    trafficLabel: 'Cargo Hauler',
    itinerary: { targetStationId: 'st_helios_prime' },
    alive: true,
    outcome: 'active',
  });
  const missionRec = world.upsertWorldRecord({
    recordId: stableRecordId(303, HELIOS, RECORD_KIND.MISSION_TARGET, 'm1'),
    kind: RECORD_KIND.MISSION_TARGET,
    sectorId: HELIOS,
    homeSectorId: HELIOS,
    pos: { x: o.x + 80, z: o.z + 40 },
    type: 'ship',
    enemyTypeId: 'corsair_raider',
    shipDefId: 'ship_hornet',
    missionId: 'mission_fixture_1',
    level: 4,
    hull: 55,
    hullMax: 90,
    alive: true,
    outcome: 'active',
  });
  const wreckRec = world.upsertWorldRecord({
    recordId: stableRecordId(303, HELIOS, RECORD_KIND.AFTERMATH, 'mk1'),
    kind: RECORD_KIND.AFTERMATH,
    sectorId: HELIOS,
    homeSectorId: HELIOS,
    pos: { x: o.x - 120, z: o.z + 90 },
    type: 'wreck',
    wreckClass: 'battlefield',
    markerId: 'mk1',
    victimClass: 'ship',
    alive: true,
    outcome: 'active',
  });
  assert.ok(convoyRec && missionRec && wreckRec);

  // Evict then rematerialize FULL.
  world._setSectorTier(HELIOS, RESIDENCY_TIER.RECORD_ONLY, { reason: 'test' });
  // Helios is membership — re-enter to rematerialize via materializer path.
  world.enterSector(HELIOS, { noTeleport: true, continuous: true });

  const liveConvoy = findLiveEntityForRecord(state.entityList, convoyRec.recordId);
  const liveMission = findLiveEntityForRecord(state.entityList, missionRec.recordId);
  const liveWreck = findLiveEntityForRecord(state.entityList, wreckRec.recordId);
  assert.ok(liveConvoy, 'convoy rematerializes');
  assert.ok(liveMission, 'mission target rematerializes');
  assert.ok(liveWreck, 'aftermath wreck rematerializes');
  assert.equal(liveConvoy.data.trafficRole, 'hauler');
  assert.equal(liveMission.data.missionId, 'mission_fixture_1');
  assert.equal(liveMission.hull, 55);
  assert.equal(liveWreck.data.markerId, 'mk1');
  assert.equal(entitiesWithRecord(state, convoyRec.recordId).length, 1);
  assert.equal(entitiesWithRecord(state, missionRec.recordId).length, 1);
});

test('rematerialize is idempotent — second promote does not duplicate live entities', () => {
  const { state, world } = bootWorld(404);
  world.enterSector(HELIOS);
  const o = sectorGlobalOrigin(CERES);
  const id = stableRecordId(404, CERES, RECORD_KIND.NPC, 'idem');
  world.upsertWorldRecord({
    recordId: id,
    kind: RECORD_KIND.NPC,
    sectorId: CERES,
    homeSectorId: CERES,
    pos: { x: o.x + 5, z: o.z + 5 },
    enemyTypeId: 'patrol_lawman',
    level: 2,
    hull: 70,
    hullMax: 70,
    alive: true,
    outcome: 'active',
  });

  world._setSectorTier(CERES, RESIDENCY_TIER.FULL, { reason: 'a' });
  const first = entitiesWithRecord(state, id);
  assert.equal(first.length, 1);
  const firstLiveId = first[0].id;

  // Promote again / rematerialize again — still one live entity.
  world._rematerializeSectorRecords(CERES, state.world.sectorContents[CERES], RESIDENCY_TIER.FULL);
  world._rematerializeSectorRecords(CERES, state.world.sectorContents[CERES], RESIDENCY_TIER.FULL);
  const second = entitiesWithRecord(state, id);
  assert.equal(second.length, 1);
  assert.equal(second[0].id, firstLiveId);
});

// ── save / Continue / migration ─────────────────────────────────────────────────────────────

test('world.serialize persists records in global space and never frame/residency bags', () => {
  const { state, world } = bootWorld(505);
  world.enterSector(HELIOS);
  const o = sectorGlobalOrigin(TETHYS);
  const id = stableRecordId(505, TETHYS, RECORD_KIND.NPC, 'save');
  world.upsertWorldRecord({
    recordId: id,
    kind: RECORD_KIND.NPC,
    sectorId: TETHYS,
    homeSectorId: TETHYS,
    pos: { x: o.x + 12, z: o.z - 8 },
    enemyTypeId: 'corsair_raider',
    level: 5,
    hull: 33,
    hullMax: 60,
    alive: true,
    outcome: 'active',
  });
  state.world.frameOrigin = { x: 8192, z: -4096 };
  state.world.frameOriginSeq = 3;
  state.world.residentSectors[TETHYS] = { tier: RESIDENCY_TIER.FULL, epoch: 0 };
  state.world.sectorContents[TETHYS] = { stations: [], enemies: [1] };
  state.world.pendingSpawns[TETHYS] = [{ entityType: 'pirate', position: { x: 4, z: 8 }, tags: ['fixture'] }];

  const ser = world.serialize();
  assert.ok(ser.records);
  assert.ok(ser.records.byId[id]);
  assert.equal(ser.records.byId[id].pos.x, o.x + 12);
  assert.equal('frameOrigin' in ser, false);
  assert.equal('frameOriginSeq' in ser, false);
  assert.equal('residentSectors' in ser, false);
  assert.equal('sectorContents' in ser, false);
  assert.equal(ser.coordinateSchema, 'global_v1');
  const liveDiscovery = state.world.discovery[HELIOS].discovered;
  ser.discovery[HELIOS].discovered = !liveDiscovery;
  ser.pendingSpawns[TETHYS][0].position.x = 999;
  assert.equal(state.world.discovery[HELIOS].discovered, liveDiscovery,
    'snapshot-owned world serialization must not retain discovery references');
  assert.equal(state.world.pendingSpawns[TETHYS][0].position.x, 4,
    'snapshot-owned world serialization must not retain pending-spawn references');
});

test('deserialize + enterSector rematerializes records once; no double sector-origin offset', () => {
  const { state, world } = bootWorld(606);
  const o = sectorGlobalOrigin(CERES);
  const globalPos = { x: o.x + 77, z: o.z + 33 };
  const id = stableRecordId(606, CERES, RECORD_KIND.NPC, 'load');

  const payload = {
    currentSectorId: CERES,
    coordinateSchema: 'global_v1',
    discovery: { [CERES]: { charted: true, discovered: true } },
    records: {
      schemaId: WORLD_RECORDS_SCHEMA_ID,
      schemaVersion: 1,
      byId: {
        [id]: {
          recordId: id,
          kind: RECORD_KIND.NPC,
          sectorId: CERES,
          homeSectorId: CERES,
          pos: globalPos,
          enemyTypeId: 'reaver_pirate',
          level: 2,
          hull: 22,
          hullMax: 50,
          alive: true,
          outcome: 'active',
        },
      },
    },
    // Smuggled runtime must be ignored.
    frameOrigin: { x: 99999, z: -99999 },
    frameOriginSeq: 9,
    residentSectors: { [CERES]: { tier: 'FULL' } },
    sectorContents: { [CERES]: { enemies: [1, 2, 3] } },
  };

  world.deserialize(payload);
  assert.deepEqual(state.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(state.world.frameOriginSeq, 0);
  assert.ok(state.world.records.byId[id]);
  assert.deepEqual(Object.keys(state.world.residentSectors), []);

  world.enterSector(CERES);
  const live = findLiveEntityForRecord(state.entityList, id);
  assert.ok(live);
  // Pose must equal saved global — not global+origin (double offset).
  assert.equal(live.pos.x, globalPos.x);
  assert.equal(live.pos.z, globalPos.z);
  assert.equal(live.hull, 22);

  // Repeat enter must not duplicate.
  world.enterSector(CERES, { continuous: true, noTeleport: true });
  assert.equal(entitiesWithRecord(state, id).length, 1);

  // Second full deserialize+enter cycle (repeat load).
  world.deserialize(payload);
  world.enterSector(CERES);
  assert.equal(entitiesWithRecord(state, id).length, 1);
  const live2 = findLiveEntityForRecord(state.entityList, id);
  assert.equal(live2.pos.x, globalPos.x);
});

test('v10→v11 migration is idempotent, seeds empty records, preserves careerOrigins, no double offset', () => {
  assert.ok(CURRENT_VERSION >= 11, `expected CURRENT_VERSION >= 11, got ${CURRENT_VERSION}`);
  const ceresO = sectorGlobalOrigin(CERES);
  const global = { x: ceresO.x + 15, z: ceresO.z - 9 };
  const data = {
    world: {
      currentSectorId: CERES,
      coordinateSchema: 'global_v1',
      frameOrigin: { x: 4096, z: 0 },
      frameOriginSeq: 2,
      residentSectors: { [CERES]: { tier: 'FULL' } },
      sectorContents: { [CERES]: { stations: [] } },
    },
    entities: {
      player: { type: 'ship', pos: { x: global.x, z: global.z } },
    },
    careerOrigins: {
      schemaId: 'spaceface.careerOrigins.v1',
      schemaVersion: 1,
      origins: { hauler: { stage: 1 } },
    },
    careerLadders: {
      schemaId: 'spaceface.careerLadders.v1',
      schemaVersion: 1,
      ladders: { __meta: { schemaId: 'spaceface.careerLadders.v1', schemaVersion: 1 } },
    },
  };

  const to = migrateChain(data, 10);
  assert.equal(to, CURRENT_VERSION);
  assert.ok(data.world.records);
  assert.equal(data.world.records.schemaId, WORLD_RECORDS_SCHEMA_ID);
  assert.deepEqual(data.world.records.byId, {});
  assert.equal('residentSectors' in data.world, false);
  assert.equal('sectorContents' in data.world, false);
  assert.deepEqual(data.world.frameOrigin, { x: 0, z: 0 });
  assert.deepEqual(data.entities.player.pos, global);
  assert.equal(data.careerOrigins.origins.hauler.stage, 1);
  assert.equal(data.careerLadders.schemaId, 'spaceface.careerLadders.v1');

  // Idempotent re-run of v10→v11.
  const step = MIGRATIONS.find((m) => m.from === 10 && m.to === 11);
  assert.ok(step);
  const before = deepClone(data);
  step.fn(data);
  step.fn(data);
  assert.deepEqual(data.entities.player.pos, before.entities.player.pos);
  assert.deepEqual(data.world.records, before.world.records);
  assert.equal(data.careerOrigins.origins.hauler.stage, 1);
});

test('absent records on old v9 payload migrate cleanly through chain to empty bag', () => {
  const data = {
    world: {
      currentSectorId: HELIOS,
      // pre-v9 local pose will be offset by v8→v9; use stamped global_v1 to skip offset
      coordinateSchema: 'global_v1',
      frameOrigin: { x: 0, z: 0 },
      frameOriginSeq: 0,
    },
    entities: {
      player: { type: 'ship', pos: { x: 1, z: 2 } },
    },
  };
  const to = migrateChain(data, 9);
  assert.equal(to, CURRENT_VERSION);
  assert.ok(data.world.records);
  assert.deepEqual(data.world.records.byId, {});
  assert.ok(data.careerOrigins);
});

test('FULL→REDUCED strip captures durable combat records without killing structural anchors', () => {
  const { state, world, helpers } = bootWorld(707);
  world.enterSector(HELIOS);
  world._setSectorTier(CERES, RESIDENCY_TIER.FULL, { reason: 'test' });
  const stationsBefore = (state.world.sectorContents[CERES].stations || []).map((s) => s.stationId).sort();
  assert.ok(stationsBefore.length >= 1);

  const o = sectorGlobalOrigin(CERES);
  const npc = helpers.spawnEntity({
    type: 'ship',
    pos: { x: o.x + 40, z: o.z },
    hull: 12,
    hullMax: 40,
    collides: true,
    data: { lootTableId: 'reaver_pirate', enemyTypeId: 'reaver_pirate', homeSectorId: CERES },
  });
  npc.homeSectorId = CERES;
  world._assignDurableRecordId(npc, CERES, RECORD_KIND.NPC, 'strip', state.world.sectorContents[CERES]);
  const rid = npc.data.worldRecordId;
  state.world.sectorContents[CERES].enemies.push(npc.id);

  world._setSectorTier(CERES, RESIDENCY_TIER.REDUCED, { reason: 'strip' });
  assert.ok(state.world.records.byId[rid]);
  assert.equal(state.entities.get(npc.id), undefined);
  const stationsAfter = (state.world.sectorContents[CERES].stations || []).map((s) => s.stationId).sort();
  assert.deepEqual(stationsAfter, stationsBefore);
});

test('recordsForSector ordering is deterministic by recordId', () => {
  const bag = createEmptyRecordsBag();
  for (const key of ['b', 'a', 'c']) {
    bag.byId[`wr_${key}`] = {
      recordId: `wr_${key}`,
      kind: RECORD_KIND.NPC,
      sectorId: HELIOS,
      homeSectorId: HELIOS,
      pos: { x: 0, z: 0 },
      alive: true,
      outcome: 'active',
    };
  }
  const list = recordsForSector(bag, HELIOS).map((r) => r.recordId);
  assert.deepEqual(list, ['wr_a', 'wr_b', 'wr_c']);
});

test('deserializeRecordsBag round-trip preserves global poses', () => {
  const o = sectorGlobalOrigin(TETHYS);
  const ser = serializeRecordsBag({
    byId: {
      wr_x: {
        recordId: 'wr_x',
        kind: RECORD_KIND.CONVOY,
        sectorId: TETHYS,
        homeSectorId: TETHYS,
        pos: { x: o.x + 1, z: o.z + 2 },
        trafficRole: 'courier',
        alive: true,
        outcome: 'active',
      },
    },
  });
  const bag = deserializeRecordsBag(ser);
  assert.equal(bag.byId.wr_x.pos.x, o.x + 1);
  assert.equal(bag.byId.wr_x.trafficRole, 'courier');
});

test('durable convoy records preserve scanned cargo and the next delivery sequence', () => {
  const manifest = {
    schemaId: 'spaceface.freightCausality.v1',
    schemaVersion: 1,
    manifestId: 'fm_fixture_ore',
    freighterKey: 'wr_freight_fixture',
    role: 'hauler',
    lines: [{ commodityId: 'cmdty_ore_iron', qty: 8 }],
    totalQty: 8,
  };
  const entity = {
    id: 77,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 120, z: -80 },
    vel: { x: 3, z: 1 },
    rot: 0.25,
    data: {
      worldRecordId: 'wr_freight_fixture',
      defId: 'ship_mule',
      trafficRole: 'hauler',
      trafficLabel: 'Cargo Hauler',
      cargoManifest: manifest,
      freightDockSeq: 19,
    },
  };
  const captured = captureEntityRecord(entity, {
    seed: 44,
    sectorId: TETHYS,
    kind: RECORD_KIND.CONVOY,
    tick: 100,
  });
  assert.deepEqual(captured.cargoManifest, manifest);
  assert.notEqual(captured.cargoManifest, manifest, 'record owns a detached cargo snapshot');
  assert.equal(captured.freightDockSeq, 19);

  const restored = deserializeRecordsBag(serializeRecordsBag({
    byId: { [captured.recordId]: captured },
  })).byId[captured.recordId];
  const spec = spawnSpecFromRecord(restored);
  assert.deepEqual(spec.data.cargoManifest, manifest);
  assert.equal(spec.data.freightDockSeq, 19);

  spec.data.cargoManifest.lines[0].qty = 999;
  assert.equal(restored.cargoManifest.lines[0].qty, 8,
    'rematerialized cargo cannot mutate the durable record through aliasing');
});
// ── adversarial: traffic / mission pre-demotion identity + Continue adoption ────────────────

test('traffic freighter kill while FULL (empty bag) persists destroyed convoy record', async () => {
  const { traffic } = await import('../src/systems/traffic.js');
  const { state, world, bus, helpers } = bootWorld(801);
  world.enterSector(HELIOS);

  // Mimic traffic spawn stamps: homeSectorId + worldRecordId before any demote.
  const o = sectorGlobalOrigin(HELIOS);
  const freighter = helpers.spawnEntity({
    type: 'ship',
    team: 2,
    pos: { x: o.x + 150, z: o.z - 40 },
    hull: 60,
    hullMax: 60,
    collides: true,
    data: {
      defId: 'ship_mule',
      trafficRole: 'hauler',
      trafficLabel: 'Cargo Hauler',
      ai: { archetype: 'fleeing_trader', passive: true },
    },
  });
  // Use traffic system's stamp helper when available; otherwise stamp as traffic does.
  const trafficSys = Object.assign(Object.create(traffic), {});
  trafficSys.init({ state, bus, helpers, registry: null });
  trafficSys._stampTrafficDurableIdentity(freighter, HELIOS, 'hauler', { label: 'Cargo Hauler' }, 0);
  assert.ok(freighter.homeSectorId === HELIOS || freighter.data.homeSectorId === HELIOS);
  assert.ok(freighter.data.worldRecordId, 'traffic must stamp worldRecordId before demote');
  const rid = freighter.data.worldRecordId;
  assert.equal(state.world.records.byId[rid], undefined, 'bag empty before kill');

  freighter.alive = false;
  bus.emit('entity:killed', { id: freighter.id, type: 'ship', killerId: state.playerId });
  assert.ok(state.world.records.byId[rid], 'traffic kill must write bag stub even when empty');
  assert.equal(state.world.records.byId[rid].alive, false);
  assert.equal(state.world.records.byId[rid].outcome, 'destroyed');
  assert.equal(state.world.records.byId[rid].kind, RECORD_KIND.CONVOY);
  assert.equal(state.world.records.byId[rid].homeSectorId, HELIOS);

  // Rematerialize must not resurrect killed freighter.
  world._setSectorTier(HELIOS, RESIDENCY_TIER.RECORD_ONLY, { reason: 'evict' });
  world.enterSector(HELIOS, { continuous: true, noTeleport: true });
  assert.equal(findLiveEntityForRecord(state.entityList, rid), null);
});

test('missionTag-only kill while FULL (empty bag) persists destroyed mission_target', async () => {
  const { missions } = await import('../src/systems/missions.js');
  const { state, world, bus, helpers } = bootWorld(802);
  world.enterSector(HELIOS);
  const o = sectorGlobalOrigin(HELIOS);

  // Missions historically stamp missionTag only (not missionId/missionPinned).
  const target = helpers.spawnEntity({
    type: 'ship',
    team: 1,
    pos: { x: o.x + 90, z: o.z + 30 },
    hull: 25,
    hullMax: 50,
    collides: true,
    data: {
      lootTableId: 'reaver_pirate',
      enemyTypeId: 'reaver_pirate',
      level: 3,
      missionTag: 'm_bounty_802',
    },
  });
  const missionsSys = Object.assign(Object.create(missions), {});
  missionsSys.init({ state, bus, helpers, registry: null });
  missionsSys._stampMissionTargetIdentity(target, {
    id: 'm_bounty_802',
    destSectorId: HELIOS,
  }, 0);
  assert.equal(target.data.missionTag, 'm_bounty_802');
  assert.equal(target.data.missionId, 'm_bounty_802');
  assert.ok(target.data.worldRecordId);
  assert.equal(target.homeSectorId || target.data.homeSectorId, HELIOS);
  const rid = target.data.worldRecordId;
  assert.equal(state.world.records.byId[rid], undefined);

  target.alive = false;
  bus.emit('entity:killed', { id: target.id, type: 'ship', killerId: state.playerId });
  assert.ok(state.world.records.byId[rid], 'mission kill must persist even when bag was empty');
  assert.equal(state.world.records.byId[rid].alive, false);
  assert.equal(state.world.records.byId[rid].outcome, 'destroyed');
  assert.equal(state.world.records.byId[rid].kind, RECORD_KIND.MISSION_TARGET);
  assert.equal(state.world.records.byId[rid].missionId, 'm_bounty_802');

  world._setSectorTier(HELIOS, RESIDENCY_TIER.RECORD_ONLY, { reason: 'evict' });
  world.enterSector(HELIOS, { continuous: true, noTeleport: true });
  assert.equal(findLiveEntityForRecord(state.entityList, rid), null);
});

test('missionTag without prior stamp still derives kill outcome via durable markers', () => {
  // Kill path must derive identity from missionTag even if spawn forgot worldRecordId.
  const { state, world, bus, helpers } = bootWorld(803);
  world.enterSector(HELIOS);
  const o = sectorGlobalOrigin(HELIOS);
  const target = helpers.spawnEntity({
    type: 'ship',
    pos: { x: o.x + 11, z: o.z + 7 },
    hull: 10,
    hullMax: 40,
    collides: true,
    data: {
      enemyTypeId: 'corsair_raider',
      lootTableId: 'corsair_raider',
      missionTag: 'm_orphan_803',
      homeSectorId: HELIOS,
    },
  });
  target.homeSectorId = HELIOS;
  assert.equal(target.data.worldRecordId, undefined);

  target.alive = false;
  bus.emit('entity:killed', { id: target.id, type: 'ship', killerId: state.playerId });
  assert.ok(target.data.worldRecordId, 'kill path derives worldRecordId from missionTag markers');
  const rid = target.data.worldRecordId;
  assert.ok(state.world.records.byId[rid]);
  assert.equal(state.world.records.byId[rid].alive, false);
  assert.equal(state.world.records.byId[rid].kind, RECORD_KIND.MISSION_TARGET);
  assert.equal(state.world.records.byId[rid].missionId, 'm_orphan_803');
});

test('Continue adoption: rematerialized mission target is adopted — no duplicate spawn', async () => {
  const { missions } = await import('../src/systems/missions.js');
  const { state, world, bus, helpers } = bootWorld(804);
  const o = sectorGlobalOrigin(HELIOS);
  const missionId = 'm_continue_804';
  const recordId = stableRecordId(804, HELIOS, RECORD_KIND.MISSION_TARGET, 'mission:' + missionId + ':0');

  // Simulate save payload: durable mission_target in bag; missions restore with empty targetEntityIds.
  world.deserialize({
    currentSectorId: HELIOS,
    coordinateSchema: 'global_v1',
    discovery: { [HELIOS]: { charted: true, discovered: true } },
    records: {
      schemaId: WORLD_RECORDS_SCHEMA_ID,
      schemaVersion: 1,
      byId: {
        [recordId]: {
          recordId,
          kind: RECORD_KIND.MISSION_TARGET,
          sectorId: HELIOS,
          homeSectorId: HELIOS,
          pos: { x: o.x + 60, z: o.z + 20 },
          enemyTypeId: 'reaver_pirate',
          level: 3,
          hull: 44,
          hullMax: 80,
          missionId,
          alive: true,
          outcome: 'active',
        },
      },
    },
  });
  // World rematerializes before missions restore (saveSystem order).
  world.enterSector(HELIOS);
  const liveBefore = findLiveEntityForRecord(state.entityList, recordId);
  assert.ok(liveBefore, 'record rematerialized before missions restore');
  assert.equal(liveBefore.data.missionId || liveBefore.data.missionTag, missionId);
  assert.equal(liveBefore.data.missionTag, missionId, 'rematerialize stamps missionTag for adoption');
  const liveId = liveBefore.id;

  // Missions restore: active mission with empty targetEntityIds (runtime stripped on save).
  const missionsSys = Object.assign(Object.create(missions), {});
  missionsSys.init({ state, bus, helpers, registry: null });
  state.missions.active = [{
    id: missionId,
    type: 'bounty_hunt',
    status: 'active',
    needsTargets: true,
    destSectorId: HELIOS,
    objectiveProgress: 0,
    objectiveTarget: 1,
    targetEntityIds: [],
    factionId: 'faction_helios',
  }];

  // This is the Continue seam that previously double-spawned.
  missionsSys.spawnTargetsForSector(HELIOS);
  assert.deepEqual(state.missions.active[0].targetEntityIds, [liveId], 'must adopt rematerialized id');
  const tagged = state.entityList.filter(
    (e) => e && e.alive && e.data && (e.data.missionTag === missionId || e.data.missionId === missionId),
  );
  assert.equal(tagged.length, 1, 'no duplicate mission target after Continue adoption');
  assert.equal(tagged[0].id, liveId);
  assert.equal(tagged[0].data.worldRecordId, recordId);
  assert.equal(tagged[0].hull, 44, 'adopted host keeps rematerialized vitals');
});

test('missionTag is recognized as durable mission identity for capture', () => {
  const { state, world, helpers } = bootWorld(805);
  world.enterSector(HELIOS);
  const o = sectorGlobalOrigin(HELIOS);
  const ent = helpers.spawnEntity({
    type: 'ship',
    pos: { x: o.x + 5, z: o.z + 5 },
    hull: 30,
    hullMax: 30,
    collides: true,
    data: {
      missionTag: 'm_capture_805',
      homeSectorId: HELIOS,
      enemyTypeId: 'wasp_swarmer',
    },
  });
  ent.homeSectorId = HELIOS;
  // No worldRecordId yet — capture on demote must still classify as mission_target.
  world._captureSectorDurableRecords(HELIOS, { reason: 'test_mission_tag' });
  const bag = ensureWorldRecords(state.world);
  const ids = Object.keys(bag.byId).filter((id) => bag.byId[id].missionId === 'm_capture_805');
  assert.equal(ids.length, 1);
  assert.equal(bag.byId[ids[0]].kind, RECORD_KIND.MISSION_TARGET);
  assert.equal(ent.data.worldRecordId, ids[0]);
});
