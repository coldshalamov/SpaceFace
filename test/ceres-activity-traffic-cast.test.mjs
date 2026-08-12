import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
  CERES_ACTIVITY_SERVICE_SLOTS,
} from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  CINDER_SLUICE_SITE_ID,
  CINDER_SLUICE_TRAFFIC_STAGING_POS,
} from '../src/data/environmentalMachinery.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';
import {
  salvagePoolFromManifest,
  validCivilianManifestForPayload,
} from '../src/systems/lootShards.js';
import { NPC_JOB_PHASE, NPC_JOB_SCHEMA } from '../src/systems/npcJobs.js';
import { normalizeRecord, RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

const SEED = 0x5ce2e5;
const TENDER_SLOT_ID = 'ceres_refinery_tender';

const POCKET_SLOTS = CERES_ACTIVITY_POCKETS.flatMap((pocket) => (
  pocket.actorSlots
    .filter((slot) => slot.id !== TENDER_SLOT_ID)
    .map((slot) => ({ pocket, slot }))
));
const SERVICE_SLOT = CERES_ACTIVITY_SERVICE_SLOTS[0];
const EXPECTED_SLOT_IDS = [
  ...POCKET_SLOTS.map(({ slot }) => slot.id),
  SERVICE_SLOT.id,
];
const EXPECTED_HULLS = {
  ceres_refinery_hauler: 'ship_mule',
  ceres_seam_miner: 'ship_ironback',
  ceres_seam_surveyor: 'ship_ranger',
  ceres_ambush_loaded_hauler: 'ship_mule',
  ceres_ambush_escort: 'ship_wasp',
  ceres_cathedral_salvor: 'ship_pelican',
  ceres_cathedral_patrol: 'ship_wasp',
  ceres_cinder_service_hauler: 'ship_mule',
};

function expectedRecordId(slot) {
  return stableRecordId(
    SEED,
    CERES_ACTIVITY_SECTOR_ID,
    RECORD_KIND.CONVOY,
    slot.worldRecordSlotId,
  );
}

function expectedJobId(slot) {
  return `job:${expectedRecordId(slot)}`;
}

function expectedJobRoute(pocket, slot) {
  return slot.route.marks.map((mark) => ({
    id: mark.id,
    label: mark.id,
    pos: sectorLocalToGlobalForSector({
      x: pocket.activityAnchor.localPos.x + mark.offset.x,
      z: pocket.activityAnchor.localPos.z + mark.offset.z,
    }, CERES_ACTIVITY_SECTOR_ID),
    targetRef: mark.targetRef,
  }));
}

function staleJobSpec(kind = 'patrol') {
  return {
    kind,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    route: [
      { id: 'stale_a', label: 'stale_a', pos: { x: 0, z: 0 } },
      { id: 'stale_b', label: 'stale_b', pos: { x: 10, z: 0 } },
    ],
    speed: 1,
  };
}

function castSlot(id) {
  for (const { slot } of POCKET_SLOTS) if (slot.id === id) return slot;
  if (SERVICE_SLOT.id === id) return SERVICE_SLOT;
  return null;
}

function activeRecord(slot, overrides = {}) {
  return {
    recordId: expectedRecordId(slot),
    kind: RECORD_KIND.CONVOY,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    homeSectorId: CERES_ACTIVITY_SECTOR_ID,
    alive: true,
    outcome: null,
    pos: { x: 1, z: 2 },
    vel: { x: 0, z: 0 },
    ...overrides,
  };
}

function makeStation(id, stationId, pos) {
  return {
    id,
    type: 'station',
    alive: true,
    pos: { ...pos },
    homeSectorId: CERES_ACTIVITY_SECTOR_ID,
    data: { stationId, sectorId: CERES_ACTIVITY_SECTOR_ID, homeSectorId: CERES_ACTIVITY_SECTOR_ID },
  };
}

function boot({ records = {} } = {}) {
  const station = makeStation(10, 'station_ceres', sectorLocalToGlobalForSector(
    CERES_ACTIVITY_POCKETS[0].activityAnchor.localPos,
    CERES_ACTIVITY_SECTOR_ID,
  ));
  const beltOut = makeStation(11, 'station_beltout', {
    x: CINDER_SLUICE_TRAFFIC_STAGING_POS.x + 800,
    z: CINDER_SLUICE_TRAFFIC_STAGING_POS.z,
  });
  const siteRoot = {
    id: 12,
    type: 'fx',
    alive: true,
    pos: { x: CINDER_SLUICE_TRAFFIC_STAGING_POS.x - 240, z: CINDER_SLUICE_TRAFFIC_STAGING_POS.z },
    data: { worldRecordId: `${CINDER_SLUICE_SITE_ID}/root` },
  };
  let stateRngDraws = 0;
  const state = {
    mode: 'flight',
    tick: 17,
    simTime: 3,
    meta: { seed: SEED },
    rng() { stateRngDraws += 1; return 0.5; },
    world: { currentSectorId: CERES_ACTIVITY_SECTOR_ID, records: { byId: { ...records } } },
    entities: new Map(),
    entityList: [],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      dockStations: [station, beltOut],
      stations: [station, beltOut],
      byStationId: new Map([['station_ceres', station], ['station_beltout', beltOut]]),
    },
    traffic: {
      freighters: [],
      appliedArrivalIds: [],
      appliedLossIds: [],
      appliedMinerWorkIds: [],
      rngSeed: 0x12345678,
    },
  };
  for (const entity of [station, beltOut, siteRoot]) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }
  let nextId = 100;
  const npcJobCalls = [];
  const npcJobReleases = [];
  const npcJobsById = Object.create(null);
  const captures = [];
  const supersededRecordIds = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
    npcJobs: {
      assign(entity, spec) {
        const worldRecordId = entity && entity.data && entity.data.worldRecordId;
        if (!worldRecordId || !spec) return null;
        const jobId = `job:${worldRecordId}`;
        if (npcJobsById[jobId]) {
          entity.data.jobId = jobId;
          return jobId;
        }
        const job = {
          schema: NPC_JOB_SCHEMA,
          id: jobId,
          kind: spec.kind,
          phase: NPC_JOB_PHASE.COMMISSION,
          routeIndex: 0,
          progress: 0,
          sequence: 0,
          simTime: state.simTime,
          materialized: true,
          corrupt: false,
          route: spec.route.map((mark) => ({ ...mark, pos: { ...mark.pos } })),
          speed: spec.speed,
          ...(Object.hasOwn(spec, 'payload')
            ? { payload: JSON.parse(JSON.stringify(spec.payload)) }
            : {}),
        };
        npcJobsById[jobId] = {
          job,
          kind: job.kind,
          sectorId: spec.sectorId,
          worldRecordId,
          entityId: entity.id,
        };
        entity.data.jobId = jobId;
        npcJobCalls.push({ entityId: entity.id, jobId, spec });
        return jobId;
      },
      get(jobId) { return npcJobsById[jobId] || null; },
      release(jobId) {
        const entry = npcJobsById[jobId];
        if (!entry) return false;
        const entity = state.entities.get(entry.entityId);
        if (entity && entity.data && entity.data.jobId === jobId) delete entity.data.jobId;
        delete npcJobsById[jobId];
        npcJobReleases.push(jobId);
        return true;
      },
      list() { return Object.values(npcJobsById); },
    },
  };
  const asteroidSites = {
    worldSiteTrafficHooks(sectorId) {
      if (sectorId !== CERES_ACTIVITY_SECTOR_ID) return [];
      return [{
        id: 'ceres_cinder_sluice_service',
        siteId: CINDER_SLUICE_SITE_ID,
        stationId: 'station_beltout',
        eligibleRoles: ['hauler', 'courier'],
        label: 'Belt Outpost ↔ Cinder Sluice',
        hazardPolicy: 'cinder-sluice-phase-gate',
        stagingPos: CINDER_SLUICE_TRAFFIC_STAGING_POS,
      }];
    },
  };
  const worldOwner = {
    upsertWorldRecord(entity) {
      const recordId = entity && entity.data && entity.data.worldRecordId;
      const snapshot = {
        recordId,
        entityId: entity && entity.id,
        aliveAtCapture: entity && entity.alive !== false,
        pos: entity && entity.pos ? { ...entity.pos } : null,
        vel: entity && entity.vel ? { ...entity.vel } : null,
        hull: entity && entity.hull,
        cargoManifest: entity && entity.data && entity.data.cargoManifest || null,
      };
      captures.push(snapshot);
      const record = {
        recordId,
        kind: RECORD_KIND.CONVOY,
        sectorId: CERES_ACTIVITY_SECTOR_ID,
        homeSectorId: CERES_ACTIVITY_SECTOR_ID,
        alive: true,
        outcome: null,
        pos: snapshot.pos,
        vel: snapshot.vel,
      };
      state.world.records.byId[recordId] = record;
      return record;
    },
    markWorldRecordDestroyed(recordId, { outcome } = {}) {
      const record = state.world.records.byId[recordId];
      if (!record) return null;
      record.alive = false;
      record.outcome = outcome || 'destroyed';
      supersededRecordIds.push(recordId);
      return record;
    },
  };
  const bus = createBus();
  const emitted = [];
  for (const name of [
    'freight:arrival', 'freight:loss', 'mining:npcExtraction', 'traffic:jobActionReceipt',
    'aiTrader:requestTrade', 'npcjobs:work', 'npcjobs:unload', 'npcjobs:hold',
  ]) {
    bus.on(name, (payload) => emitted.push({ name, payload }));
  }
  const system = Object.create(trafficBase);
  system.init({
    state,
    bus,
    helpers,
    registry: {
      get(name) {
        if (name === 'asteroidSites') return asteroidSites;
        if (name === 'world') return worldOwner;
        return null;
      },
    },
  });
  let trafficRngDraws = 0;
  system._rng = () => { trafficRngDraws += 1; return 0.25; };
  return {
    state,
    bus,
    system,
    captures,
    emitted,
    npcJobCalls,
    npcJobReleases,
    npcJobsById,
    npcJobs: helpers.npcJobs,
    supersededRecordIds,
    rngDraws: () => ({ state: stateRngDraws, traffic: trafficRngDraws }),
  };
}

function enterCeres(harness, extra = {}) {
  harness.bus.emit('sector:enter', {
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    sector: {
      id: CERES_ACTIVITY_SECTOR_ID,
      factionId: 'faction_dmc',
      trafficPerMin: 999,
      security: 0.9,
      industries: { mining: true, refinery: true },
    },
    ...extra,
  });
}

function authoredEntities(state) {
  return (state.traffic.freighters || []).map((record) => state.entities.get(record.id));
}

function liveCeresTraffic(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.data && entity.data.trafficRole
    && (entity.homeSectorId || entity.data.homeSectorId || entity.data.sectorId)
      === CERES_ACTIVITY_SECTOR_ID);
}

function assertExactAuthoredJobs(harness) {
  const jobs = harness.npcJobs.list();
  assert.equal(jobs.length, 7, 'exactly the seven pocket actors own durable jobs');
  assert.deepEqual(
    jobs.reduce((counts, entry) => {
      counts[entry.kind] = (counts[entry.kind] || 0) + 1;
      return counts;
    }, {}),
    { hauler: 2, miner: 1, surveyor: 1, patrol: 2, salvor: 1 },
  );
  for (const { pocket, slot } of POCKET_SLOTS) {
    const entry = harness.npcJobs.get(expectedJobId(slot));
    assert.ok(entry, `${slot.id} owns its stable record-keyed job`);
    assert.equal(entry.kind, slot.jobKind);
    assert.equal(entry.sectorId, CERES_ACTIVITY_SECTOR_ID);
    assert.deepEqual(entry.job.route, expectedJobRoute(pocket, slot), `${slot.id} preserves mark order`);
    const [a, b] = entry.job.route;
    const expectedSpeed = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) / slot.route.durationS;
    assert.ok(Math.abs(entry.job.speed - expectedSpeed) < 1e-12,
      `${slot.id} translates authored duration into kernel speed`);
    const call = harness.npcJobCalls.find((candidate) => candidate.jobId === expectedJobId(slot));
    assert.ok(call, `${slot.id} was assigned through the public NPC jobs seam`);
    const expectedSpecKeys = slot.jobKind === 'hauler'
      ? ['kind', 'payload', 'route', 'sectorId', 'speed']
      : ['kind', 'route', 'sectorId', 'speed'];
    assert.deepEqual(Object.keys(call.spec).sort(), expectedSpecKeys);
    assert.equal(Object.hasOwn(call.spec, 'durationS'), false);
    assert.equal(Object.hasOwn(call.spec, 'receiptType'), false);
    assert.equal(Object.hasOwn(call.spec, 'targetRef'), false);
    if (slot.jobKind === 'hauler') {
      assert.equal(call.spec.payload && call.spec.payload.activityRunSeq, 0,
        'one-shot Ceres haulers capture their durable run sequence at commission');
      if (slot.id === 'ceres_refinery_hauler') {
        assert.equal(Object.hasOwn(call.spec.payload, 'manifest'), false,
          'the refinery hauler starts empty until the physical miner handoff');
      } else {
        assert.equal(Object.hasOwn(call.spec.payload, 'manifest'), false,
          'the Throughline hauler emits a typed action but never invents freight cargo');
      }
    } else {
      assert.equal(Object.hasOwn(call.spec, 'payload'), false);
    }
    assert.equal(call.spec.route.every((mark) => (
      Object.keys(mark).sort().join(',') === 'id,label,pos,targetRef'
      && mark.targetRef === slot.route.marks.find((source) => source.id === mark.id).targetRef
    )), true);
  }
  assert.equal(harness.npcJobs.get(expectedJobId(SERVICE_SLOT)), null,
    'the Cinder service stays hook-owned and jobless');
}

test('fresh Ceres entry replaces random ambient traffic with the exact stable 7+1 authored cast', () => {
  const harness = boot();
  const rngSeedBefore = harness.state.traffic.rngSeed;

  enterCeres(harness);

  const entities = authoredEntities(harness.state);
  assert.equal(entities.length, 8, 'no random top-up or factionPresence tender duplicate');
  assert.equal(liveCeresTraffic(harness.state).length, 8, 'the live Ceres traffic population is exact');
  assert.deepEqual(
    entities.map((entity) => entity && entity.data.activityActorSlotId),
    EXPECTED_SLOT_IDS,
    'released descriptor order is the live traffic order',
  );
  assert.equal(entities.some((entity) => entity.data.activityActorSlotId === TENDER_SLOT_ID), false);
  assert.deepEqual(
    harness.state.traffic.freighters.map((record) => record.role),
    [...POCKET_SLOTS.map(({ slot }) => slot.presentationRole), SERVICE_SLOT.presentationRole],
  );

  for (const { pocket, slot } of POCKET_SLOTS) {
    const entity = entities.find((candidate) => candidate.data.activityActorSlotId === slot.id);
    const expectedPos = sectorLocalToGlobalForSector({
      x: pocket.activityAnchor.localPos.x + slot.spawnOffset.x,
      z: pocket.activityAnchor.localPos.z + slot.spawnOffset.z,
    }, CERES_ACTIVITY_SECTOR_ID);
    assert.deepEqual(entity.pos, expectedPos, `${slot.id} uses its pocket-anchor pose`);
    assert.equal(entity.data.defId, EXPECTED_HULLS[slot.id], `${slot.id} uses its canonical role hull`);
    assert.equal(entity.data.trafficRole, slot.presentationRole);
    assert.equal(entity.data.worldRecordId, expectedRecordId(slot));
    assert.equal(entity.data.identityKey, slot.worldRecordSlotId);
    assert.equal(entity.data.durable, true);
    assert.equal(entity.homeSectorId, CERES_ACTIVITY_SECTOR_ID);
    assert.equal(entity.data.homeSectorId, CERES_ACTIVITY_SECTOR_ID);
    assert.equal(entity.data.sectorId, CERES_ACTIVITY_SECTOR_ID);
  }

  const service = entities.at(-1);
  assert.deepEqual(service.pos, CINDER_SLUICE_TRAFFIC_STAGING_POS);
  assert.equal(service.data.defId, EXPECTED_HULLS[SERVICE_SLOT.id]);
  assert.equal(service.data.worldRecordId, expectedRecordId(SERVICE_SLOT));
  assert.equal(service.data.identityKey, SERVICE_SLOT.worldRecordSlotId);
  assert.equal(service.data.ceresActivityJobOwned, false);
  assert.equal(service.data.worldSiteTrafficHookId, 'ceres_cinder_sluice_service');
  assert.equal(harness.state.traffic.freighters.at(-1).worldSiteRoute.hookId,
    'ceres_cinder_sluice_service');
  assert.equal(entities.filter((entity) => entity.data.ceresActivityJobOwned === true).length, 7);
  const miner = entities.find((entity) => entity.data.activityActorSlotId === 'ceres_seam_miner');
  assert.equal(miner.data.namedLaneContactId, 'lane_rell_moisture');
  assert.equal(entities.filter((entity) => entity.data.namedLaneContactId === 'lane_rell_moisture').length, 1);
  assert.deepEqual(harness.rngDraws(), { state: 0, traffic: 0 });
  assert.equal(harness.state.traffic.rngSeed, rngSeedBefore, 'authored cast does not mutate the traffic RNG stream');
  assert.equal(harness.npcJobCalls.length, 7);
  assertExactAuthoredJobs(harness);
  assert.equal(service.data.jobId, undefined);
  assert.equal(harness.emitted.length, 0);

  harness.system.update(1 / 60, harness.state);
  assert.equal(entities.filter((entity) => entity.data.ceresActivityJobOwned
    && entity.data.intent != null).length, 0, 'the seven cast bodies do not enter ambient steppers');
  assert.ok(service.data.intent, 'the reserved Cinder hull alone keeps the existing phase route stepper');
  assert.equal(harness.emitted.length, 0, 'cast materialization and one service step emit no economy/job receipts');
});

test('repeated Ceres entry and save-loaded adopt the same bodies without healing live state', () => {
  const harness = boot();
  enterCeres(harness);
  const miner = authoredEntities(harness.state)
    .find((entity) => entity.data.activityActorSlotId === 'ceres_seam_miner');
  const originalId = miner.id;
  miner.pos = { x: 4321, z: -765 };
  miner.vel = { x: 12, z: -7 };
  miner.hull = 9;
  miner.cap = 3;
  miner.boost.energy = 2;
  miner.boost.dashCdT = 1.5;
  miner.data.cargoManifest = { id: 'saved-cargo', lines: [{ commodityId: 'ore', qty: 3 }] };

  enterCeres(harness);
  harness.bus.emit('save:loaded');

  const after = authoredEntities(harness.state)
    .find((entity) => entity.data.activityActorSlotId === 'ceres_seam_miner');
  assert.equal(after.id, originalId);
  assert.deepEqual(after.pos, { x: 4321, z: -765 });
  assert.deepEqual(after.vel, { x: 12, z: -7 });
  assert.equal(after.hull, 9);
  assert.equal(after.cap, 3);
  assert.equal(after.boost.energy, 2);
  assert.equal(after.boost.dashCdT, 1.5);
  assert.equal(after.data.cargoManifest.id, 'saved-cargo');
  assert.equal(harness.state.traffic.freighters.length, 8);
  assert.equal(harness.npcJobCalls.length, 7, 're-entry reuses the stable job bag without duplicates');
  assertExactAuthoredJobs(harness);
});

test('Continue migrates the exact pre-ore-cycle seam route and loaded miner manifest in place', () => {
  const harness = boot();
  enterCeres(harness);
  const slot = castSlot('ceres_seam_miner');
  const actor = authoredEntities(harness.state)
    .find((entity) => entity.data.activityActorSlotId === slot.id);
  const rec = harness.state.traffic.freighters.find((row) => row.id === actor.id);
  const entry = harness.npcJobs.get(expectedJobId(slot));
  const legacy = harness.system._buildMinerManifest(
    actor,
    5,
    'cmdty_ore_iron',
    8,
    'miner',
  );
  const originalIdentity = {
    manifestId: legacy.manifestId,
    freighterKey: legacy.freighterKey,
    lines: JSON.parse(JSON.stringify(legacy.lines)),
    totalQty: legacy.totalQty,
  };
  actor.data.cargoManifest = legacy;
  rec.manifest = legacy;
  entry.job.route[0].targetRef = 'activity:seam-work-pad';
  assert.equal(entry.job.route[1].targetRef, 'field:slot:ceres_seam_ore_clast');

  harness.bus.emit('save:loaded');

  assert.equal(entry.job.route[0].targetRef, 'dest:station_ceres');
  assert.equal(entry.job.route[1].targetRef, 'field:slot:ceres_seam_ore_clast');
  const migrated = actor.data.cargoManifest;
  assert.equal(migrated.role, 'ore_carrier');
  assert.equal(migrated.manifestId, originalIdentity.manifestId);
  assert.equal(migrated.freighterKey, originalIdentity.freighterKey);
  assert.deepEqual(migrated.lines, originalIdentity.lines);
  assert.equal(migrated.totalQty, originalIdentity.totalQty);
  assert.equal(migrated.lotId, originalIdentity.manifestId);
  assert.equal(migrated.lotSource.fieldId, 'f_ceres_1');
  assert.equal(migrated.custody.holderId, actor.data.worldRecordId);
  assert.strictEqual(rec.manifest, migrated);
});

test('active records without bodies and terminal tombstones suppress exact slots without fallback', () => {
  const minerSlot = castSlot('ceres_seam_miner');
  const records = {
    [expectedRecordId(minerSlot)]: activeRecord(minerSlot),
    [expectedRecordId(SERVICE_SLOT)]: activeRecord(SERVICE_SLOT, {
      alive: false,
      outcome: 'destroyed',
    }),
  };
  const harness = boot({ records });
  enterCeres(harness);

  const entities = authoredEntities(harness.state);
  assert.equal(entities.length, 6);
  assert.equal(entities.some((entity) => entity.data.activityActorSlotId === minerSlot.id), false,
    'world residency owns an active record with no materialized body');
  assert.equal(entities.some((entity) => entity.data.activityActorSlotId === SERVICE_SLOT.id), false,
    'terminal service tombstone is never refilled');
  assert.equal(entities.some((entity) => entity.data.namedLaneContactId === 'lane_rell_moisture'), false,
    'Rell is absent instead of being reassigned');
  assert.equal(harness.state.traffic.freighters.some((record) => record.worldSiteRoute), false,
    'the Cinder hook is absent instead of falling back');
  assert.deepEqual(harness.rngDraws(), { state: 0, traffic: 0 });
});

test('terminal authored records release stale stable jobs before suppressing the slot', () => {
  const slot = castSlot('ceres_seam_surveyor');
  const recordId = expectedRecordId(slot);
  const harness = boot({
    records: { [recordId]: activeRecord(slot, { alive: false, outcome: 'defeated' }) },
  });
  const staleEntity = { id: 901, data: { worldRecordId: recordId } };
  harness.npcJobs.assign(staleEntity, staleJobSpec(slot.jobKind));
  assert.ok(harness.npcJobs.get(expectedJobId(slot)));

  enterCeres(harness);

  assert.equal(harness.npcJobs.get(expectedJobId(slot)), null);
  assert.equal(harness.npcJobReleases.includes(expectedJobId(slot)), true);
  assert.equal(authoredEntities(harness.state)
    .some((entity) => entity.data.activityActorSlotId === slot.id), false);
});

test('Continue retires pre-R5 random Ceres traffic records and bodies without sweeping mission convoys', () => {
  const legacyRecordId = 'wr_convoy_pre_r5_random';
  const missionRecordId = 'wr_convoy_mission_owned';
  const harness = boot({
    records: {
      [legacyRecordId]: {
        ...activeRecord(castSlot('ceres_refinery_hauler')),
        recordId: legacyRecordId,
        trafficRole: 'hauler',
        identityKey: 'traffic:hauler:old-random',
      },
      [missionRecordId]: {
        ...activeRecord(castSlot('ceres_refinery_hauler')),
        recordId: missionRecordId,
        kind: RECORD_KIND.MISSION_TARGET,
        trafficRole: 'hauler',
        identityKey: 'mission:convoy:keep',
        missionTag: 'mission-convoy-keep',
      },
    },
  });
  const legacy = {
    id: 70,
    type: 'ship',
    alive: true,
    homeSectorId: CERES_ACTIVITY_SECTOR_ID,
    pos: { x: 300, z: 400 },
    vel: { x: 0, z: 0 },
    data: {
      worldRecordId: legacyRecordId,
      homeSectorId: CERES_ACTIVITY_SECTOR_ID,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      trafficRole: 'hauler',
    },
  };
  const mission = {
    id: 71,
    type: 'ship',
    alive: true,
    homeSectorId: CERES_ACTIVITY_SECTOR_ID,
    pos: { x: 500, z: 600 },
    vel: { x: 0, z: 0 },
    data: {
      worldRecordId: missionRecordId,
      homeSectorId: CERES_ACTIVITY_SECTOR_ID,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      trafficRole: 'hauler',
      missionTag: 'mission-convoy-keep',
    },
  };
  for (const entity of [legacy, mission]) {
    harness.state.entities.set(entity.id, entity);
    harness.state.entityList.push(entity);
  }
  harness.state.traffic.freighters.push({ id: legacy.id, role: 'hauler', waitT: 0 });
  harness.system._active.push(legacy.id);
  harness.npcJobs.assign(legacy, staleJobSpec('hauler'));

  enterCeres(harness);

  assert.equal(legacy.alive, false);
  assert.equal(harness.state.world.records.byId[legacyRecordId].alive, false);
  assert.equal(harness.state.world.records.byId[legacyRecordId].outcome, 'destroyed');
  const normalizedLegacy = normalizeRecord(
    harness.state.world.records.byId[legacyRecordId],
    legacyRecordId,
  );
  assert.equal(normalizedLegacy.alive, false);
  assert.equal(normalizedLegacy.outcome, 'destroyed',
    'legacy cast replacement survives the real durable-record normalizer as a terminal tombstone');
  assert.deepEqual(harness.supersededRecordIds, [legacyRecordId]);
  assert.equal(harness.npcJobs.get(`job:${legacyRecordId}`), null,
    'superseded ambient records release any stale durable job');
  assert.equal(harness.npcJobReleases.includes(`job:${legacyRecordId}`), true);
  assert.equal(mission.alive, true, 'non-traffic convoy identity remains world/mission owned');
  assert.equal(harness.state.world.records.byId[missionRecordId].alive, true);
  assert.equal(authoredEntities(harness.state).length, 8);
  assert.equal(liveCeresTraffic(harness.state).length, 9,
    'the exact authored cast coexists with the mission-owned traffic-role body');
  assert.equal(harness.state.traffic.freighters.length, 8);
});

test('a rematerialized exact record body is rehydrated and adopted without pose or vital reset', () => {
  const slot = castSlot('ceres_seam_miner');
  const recordId = expectedRecordId(slot);
  const harness = boot({ records: { [recordId]: activeRecord(slot) } });
  const shell = {
    id: 77,
    type: 'ship',
    alive: true,
    pos: { x: 921, z: -611 },
    vel: { x: -4, z: 8 },
    hull: 13,
    shield: 2,
    cap: 1,
    boost: { energy: 4, max: 99, dashCdT: 2.5, dashCd: 99 },
    data: {
      worldRecordId: recordId,
      cargoManifest: { id: 'durable-manifest', lines: [] },
      freightDockSeq: 7,
    },
  };
  harness.state.entities.set(shell.id, shell);
  harness.state.entityList.push(shell);

  enterCeres(harness);

  const adopted = authoredEntities(harness.state)
    .find((entity) => entity.data.activityActorSlotId === slot.id);
  assert.equal(adopted.id, 77);
  assert.deepEqual(adopted.pos, { x: 921, z: -611 });
  assert.deepEqual(adopted.vel, { x: -4, z: 8 });
  assert.equal(adopted.hull, 13);
  assert.equal(adopted.shield, 2);
  assert.equal(adopted.cap, 1);
  assert.equal(adopted.boost.energy, 4);
  assert.equal(adopted.boost.dashCdT, 2.5);
  assert.equal(adopted.data.cargoManifest.id, 'durable-manifest');
  assert.equal(adopted.data.freightDockSeq, 7);
  assert.equal(adopted.data.defId, EXPECTED_HULLS[slot.id]);
  assert.equal(harness.state.traffic.freighters.length, 8);
  assert.equal(adopted.data.jobId, expectedJobId(slot));
  assert.ok(harness.npcJobs.get(expectedJobId(slot)));
});

test('a completed authored hauler recommissions the same stable job before ambient fallback', () => {
  const harness = boot();
  enterCeres(harness);
  const slot = castSlot('ceres_refinery_hauler');
  const hauler = authoredEntities(harness.state)
    .find((entity) => entity.data.activityActorSlotId === slot.id);
  const jobId = expectedJobId(slot);
  assert.equal(hauler.data.jobId, jobId);
  assert.equal(harness.npcJobs.release(jobId), true, 'runtime completion releases the one-shot job');
  assert.equal(hauler.data.jobId, undefined);
  assert.equal(harness.npcJobs.get(jobId), null);
  const callsBefore = harness.npcJobCalls.length;

  harness.system.update(1 / 60, harness.state);

  assert.equal(hauler.data.jobId, jobId);
  assert.ok(harness.npcJobs.get(jobId));
  assert.equal(harness.npcJobCalls.length, callsBefore + 1);
  assert.equal(hauler.data.intent, null, 'traffic never falls through to the ambient hauler stepper');
  assert.equal(harness.emitted.length, 0, 'recommissioning claims no freight or mining receipt');
});

test('a transferred refinery lot rejects early unload and settles once inside physical dock range', () => {
  const harness = boot();
  enterCeres(harness);
  const slot = castSlot('ceres_refinery_hauler');
  const hauler = authoredEntities(harness.state)
    .find((entity) => entity.data.activityActorSlotId === slot.id);
  const jobId = expectedJobId(slot);
  const rec = harness.state.traffic.freighters.find((row) => row.id === hauler.id);
  const arrivals = () => harness.emitted.filter((event) => event.name === 'freight:arrival');
  const receipts = () => harness.emitted.filter((event) => event.name === 'traffic:jobActionReceipt');
  const unloadIntent = (entry, seq = 7) => {
    entry.job.phase = NPC_JOB_PHASE.UNLOAD;
    entry.job.routeIndex = 1;
    entry.job.progress = 1;
    entry.job.sequence = seq;
    entry.job.simTime = harness.state.simTime;
    const waypointId = entry.job.route[entry.job.routeIndex].id;
    return {
      jobId,
      kind: 'hauler',
      seq,
      simTime: entry.job.simTime,
      phase: NPC_JOB_PHASE.UNLOAD,
      waypointId,
      completed: true,
      destination: waypointId,
      payload: JSON.parse(JSON.stringify(entry.job.payload)),
    };
  };

  const minerSlot = castSlot('ceres_seam_miner');
  const miner = authoredEntities(harness.state)
    .find((entity) => entity.data.activityActorSlotId === minerSlot.id);
  const minerRec = harness.state.traffic.freighters.find((row) => row.id === miner.id);
  const manifest = harness.system._buildMinerManifest(
    miner, 1, 'cmdty_ore_iron', 8, 'ore_carrier', { rootLotId: 'cast-route-lot' },
  );
  harness.system._setTrafficManifest(miner, minerRec, manifest);
  const handoff = harness.system._requestCeresMinerHaulerHandoff({
    entity: miner,
    rec: minerRec,
    slot: minerSlot,
    worldRecordId: miner.data.worldRecordId,
  }, manifest);
  hauler.pos = { ...miner.pos };
  harness.system._transferCeresMinerHaulerHandoff(handoff,
    { entity: miner, rec: minerRec, worldRecordId: miner.data.worldRecordId },
    { entity: hauler, rec, worldRecordId: hauler.data.worldRecordId }, 0);

  let entry = harness.npcJobs.get(jobId);
  assert.equal(entry.job.payload.manifest.totalQty, 8,
    'post-transfer recommission carries the authoritative lot');
  const station = harness.state.entityIndex.byStationId.get('station_ceres');
  hauler.pos = { x: station.pos.x + 500, z: station.pos.z };
  harness.bus.emit('npcjobs:unload', unloadIntent(entry));
  assert.equal(arrivals().length, 0, 'logical unload at rendezvous cannot settle cargo');
  assert.equal(receipts().length, 0);
  entry = harness.npcJobs.get(jobId);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.COMMISSION,
    'early unload recommissions the physical route instead of dropping the delivery');

  hauler.pos = { x: station.pos.x + 72, z: station.pos.z };
  harness.bus.emit('npcjobs:unload', unloadIntent(entry, 8));
  assert.equal(arrivals().length, 1);
  assert.equal(receipts().length, 1);
  assert.equal(handoff.state, 'delivered');
  const replay = unloadIntent(entry, 8);
  harness.bus.emit('npcjobs:unload', replay);
  assert.equal(arrivals().length, 1, 'duplicate settlement remains idempotent');
});

test('malformed authored route timing and geometry fail closed without ambient fallback', () => {
  const harness = boot();
  const slot = castSlot('ceres_refinery_hauler');
  const pocket = CERES_ACTIVITY_POCKETS.find((candidate) => candidate.id === slot.pocketId);
  const entity = { id: 902, alive: true, data: { worldRecordId: expectedRecordId(slot) } };
  const malformedEntries = [
    { pocket, slot: { ...slot, route: { ...slot.route, durationS: 0 } }, service: false },
    {
      pocket,
      slot: {
        ...slot,
        route: {
          ...slot.route,
          marks: [slot.route.marks[0], slot.route.marks[0]],
        },
      },
      service: false,
    },
    {
      pocket,
      slot: {
        ...slot,
        route: {
          ...slot.route,
          marks: [slot.route.marks[0], { ...slot.route.marks[1], offset: { x: NaN, z: 0 } }],
        },
      },
      service: false,
    },
  ];
  for (const entry of malformedEntries) {
    assert.equal(harness.system._assignCeresActivityJob(entity, entry), null);
  }
  assert.equal(harness.npcJobs.list().length, 0);
  assert.equal(entity.data.jobId, undefined);
});

test('destroying an authored pocket actor releases its job without inventing economy receipts', () => {
  const harness = boot();
  enterCeres(harness);
  const slot = castSlot('ceres_cathedral_salvor');
  const actor = authoredEntities(harness.state)
    .find((entity) => entity.data.activityActorSlotId === slot.id);
  const jobId = expectedJobId(slot);
  assert.ok(harness.npcJobs.get(jobId));
  actor.alive = false;

  harness.bus.emit('entity:killed', { id: actor.id, sectorId: CERES_ACTIVITY_SECTOR_ID });

  assert.equal(harness.npcJobs.get(jobId), null);
  assert.equal(harness.npcJobReleases.includes(jobId), true);
  assert.equal(harness.emitted.some((event) => event.name === 'freight:loss'), false);
  assert.equal(harness.emitted.some((event) => event.name === 'mining:npcExtraction'), false);
});

test('destroying the loaded authored Ore Barge routes the same lot through loss and physical payload custody', () => {
  const harness = boot();
  enterCeres(harness);
  const slot = castSlot('ceres_seam_miner');
  const actor = authoredEntities(harness.state)
    .find((entity) => entity.data.activityActorSlotId === slot.id);
  const rec = harness.state.traffic.freighters.find((row) => row.id === actor.id);
  const manifest = harness.system._buildMinerManifest(
    actor,
    7,
    'cmdty_ore_iron',
    8,
    'ore_carrier',
    {
      workId: 'npc-miner-work:ceres-loaded-loss',
      asteroidId: 77,
      fieldId: 'f_ceres_1',
      sectorId: CERES_ACTIVITY_SECTOR_ID,
    },
  );
  rec.manifest = manifest;
  actor.data.cargoManifest = manifest;
  actor.alive = false;

  harness.bus.emit('entity:killed', {
    id: actor.id,
    killerId: 999,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
  });

  const losses = harness.emitted.filter((event) => event.name === 'freight:loss');
  assert.equal(losses.length, 1);
  assert.equal(losses[0].payload.manifestId, manifest.manifestId);
  assert.equal(losses[0].payload.lotId, manifest.lotId);
  assert.deepEqual(losses[0].payload.lotSource, manifest.lotSource);
  assert.equal(validCivilianManifestForPayload(manifest), true,
    'the ordinary loot owner accepts the authored barge manifest');
  assert.deepEqual(salvagePoolFromManifest(manifest), { cmdty_ore_iron: 8 },
    'physical payload custody receives the conserved ore quantity');
  assert.equal(harness.npcJobs.get(expectedJobId(slot)), null);
  assert.equal(harness.state.traffic.freighters.some((row) => row.id === actor.id), false);

  harness.bus.emit('entity:killed', {
    id: actor.id,
    killerId: 999,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
  });
  assert.equal(harness.emitted.filter((event) => event.name === 'freight:loss').length, 1,
    'the dead authored lot cannot publish a second loss');
  assert.equal(harness.emitted.some((event) => event.name === 'freight:arrival'), false);
});

test('continuous exit preserves the cast; hard exit captures all eight before scoped cleanup', () => {
  const harness = boot();
  enterCeres(harness);
  const before = authoredEntities(harness.state);
  const hauler = before.find((entity) => entity.data.activityActorSlotId === 'ceres_refinery_hauler');
  hauler.pos = { x: 701, z: 909 };
  hauler.vel = { x: 6, z: -3 };
  hauler.hull = 21;
  hauler.data.cargoManifest = { id: 'captured-cargo', lines: [] };
  const ceresMinerWorkId = 'npc-miner-work:job:ceres-rewind:work:1:field:slot:ceres_seam_ore_clast';
  const genericMinerWorkId = 'npc-miner-work:generic-non-ceres:1';
  harness.state.traffic.appliedJobActionIds = ['ceres-job-action:rewind'];
  harness.state.traffic.appliedMinerWorkIds = [ceresMinerWorkId, genericMinerWorkId];
  harness.system._committedCeresMinerWorkIds.add(ceresMinerWorkId);
  harness.system._pendingJobActionIds.add('in-flight-action');
  const liveEpoch = harness.system._causalRunEpoch;

  harness.bus.emit('sector:exit', {
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    continuous: true,
    noTeleport: true,
  });
  assert.equal(harness.captures.length, 0);
  assert.equal(before.every((entity) => entity.alive), true);
  assert.equal(harness.state.traffic.freighters.length, 8);
  assert.deepEqual(harness.state.traffic.appliedMinerWorkIds, [ceresMinerWorkId, genericMinerWorkId],
    'continuous handoff preserves the current causal boundary');
  assert.equal(harness.system._pendingJobActionIds.has('in-flight-action'), true);
  assert.equal(harness.system._causalRunEpoch, liveEpoch,
    'continuous/noTeleport handoff does not invalidate the live causal run');

  harness.bus.emit('sector:exit', { sectorId: CERES_ACTIVITY_SECTOR_ID });
  assert.equal(harness.captures.length, 8);
  assert.equal(harness.captures.every((snapshot) => snapshot.aliveAtCapture), true,
    'world capture precedes traffic cleanup');
  const captured = harness.captures.find((snapshot) => snapshot.recordId === hauler.data.worldRecordId);
  assert.deepEqual(captured.pos, { x: 701, z: 909 });
  assert.deepEqual(captured.vel, { x: 6, z: -3 });
  assert.equal(captured.hull, 21);
  assert.equal(captured.cargoManifest.id, 'captured-cargo');
  assert.equal(before.every((entity) => entity.alive === false), true);
  assert.equal(harness.state.traffic.freighters.length, 0);
  assert.deepEqual(harness.state.traffic.appliedMinerWorkIds, [genericMinerWorkId],
    'hard reentry removes only committed Ceres miner identities');
  assert.deepEqual(harness.state.traffic.appliedJobActionIds, []);
  assert.equal(harness.system._pendingJobActionIds.has('in-flight-action'), false,
    'an authoritative hard exit invalidates reservations from the terminated run');
  assert.equal(harness.system._causalRunEpoch > liveEpoch, true);

  const hardExitEpoch = harness.system._causalRunEpoch;
  harness.system._pendingJobActionIds.add('new-game-stale-action');
  harness.system.newGame();
  assert.equal(harness.system._pendingJobActionIds.size, 0,
    'a terminal new run clears reservations that cannot belong to the new authority');
  assert.equal(harness.system._causalRunEpoch > hardExitEpoch, true,
    'New Game starts a distinct causal run');
});

test('destroying the stable Cinder service slot leaves the hook empty and emits no freight loss', () => {
  const harness = boot();
  enterCeres(harness);
  const service = authoredEntities(harness.state)
    .find((entity) => entity.data.activityActorSlotId === SERVICE_SLOT.id);
  harness.state.world.records.byId[service.data.worldRecordId] = activeRecord(SERVICE_SLOT, {
    alive: false,
    outcome: 'destroyed',
  });
  service.alive = false;
  harness.bus.emit('entity:killed', { id: service.id, sectorId: CERES_ACTIVITY_SECTOR_ID });

  assert.equal(harness.state.traffic.freighters.some((record) => record.worldSiteRoute), false);
  assert.equal(authoredEntities(harness.state)
    .some((entity) => entity && entity.data.worldSiteTrafficHookId === 'ceres_cinder_sluice_service'), false);
  assert.equal(harness.emitted.some((event) => event.name === 'freight:loss'), false);
  enterCeres(harness);
  assert.equal(authoredEntities(harness.state)
    .some((entity) => entity.data.activityActorSlotId === SERVICE_SLOT.id), false);
  assert.deepEqual(harness.rngDraws(), { state: 0, traffic: 0 });
});

test('non-Ceres entry retains the seeded ambient producer instead of using activity slots', () => {
  const harness = boot();
  const rngSeedBefore = harness.state.traffic.rngSeed;
  harness.bus.emit('sector:enter', {
    sectorId: 'sector_non_ceres_fixture',
    sector: {
      id: 'sector_non_ceres_fixture',
      factionId: 'faction_free',
      trafficPerMin: 3,
      security: 0.2,
    },
  });
  const entities = authoredEntities(harness.state);
  assert.equal(entities.length, 1);
  assert.equal(entities[0].data.activityActorSlotId, undefined);
  assert.ok(harness.rngDraws().traffic > 0, 'ordinary ambient selection still consumes its owned RNG');
  assert.notEqual(harness.state.traffic.rngSeed, rngSeedBefore);
});
