import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_RECORDS_PER_SECTOR,
  RECORD_KIND,
  RETENTION_CLASS,
  captureEntityRecord,
  createEmptyRecordsBag,
  deserializeRecordsBag,
  gcExpiredRecentMemory,
  isPermanentWorldRecord,
  normalizeRecord,
  upsertRecord,
} from '../src/world/worldRecords.js';
import {
  MAX_RESOURCE_BODIES,
  RESOURCE_BODY_RETENTION_CLASS,
  captureResourceBodyRecord,
  compactResourceBodyRecords,
  createEmptyResourceBodyBag,
  deserializeResourceBodyBag,
  isReclaimableResourceBody,
  normalizeResourceBodyRecord,
  serializeResourceBodyBag,
  upsertResourceBody,
} from '../src/world/resourceBodyRecords.js';

function worldRecord(recordId, overrides = {}) {
  return {
    recordId,
    kind: RECORD_KIND.NPC,
    sectorId: 'sector_test',
    homeSectorId: 'sector_test',
    pos: { x: 0, z: 0 },
    alive: true,
    outcome: 'active',
    lastSeenTick: 0,
    lastObservedT: 0,
    ...overrides,
  };
}

function resourceRecord(recordId, overrides = {}) {
  return {
    recordId,
    sectorId: 'sector_test',
    fieldId: 'field_test',
    slotId: recordId,
    pos: { x: 0, z: 0 },
    oreHp: 100,
    oreHpMax: 100,
    yieldU: 20,
    yieldRemainingU: 20,
    yieldMaxU: 20,
    pctEjected: 0,
    _oreCarry: 0,
    outcome: 'active',
    lastObservedT: 0,
    ...overrides,
  };
}

test('world retention classes normalize legacy records and fail closed on permanent overflow', () => {
  const legacyRecent = normalizeRecord(worldRecord('legacy_recent'));
  const legacyTombstone = normalizeRecord(worldRecord('legacy_dead', {
    alive: false,
    outcome: 'destroyed',
  }));
  assert.equal(legacyRecent.retentionClass, RETENTION_CLASS.RECENT);
  assert.equal(legacyTombstone.retentionClass, RETENTION_CLASS.PERMANENT);
  assert.equal(isPermanentWorldRecord(legacyTombstone), true);
  const capturedMission = captureEntityRecord({
    type: 'ship',
    alive: true,
    pos: { x: 1, z: 2 },
    homeSectorId: 'sector_test',
    data: {
      worldRecordId: 'captured_mission',
      homeSectorId: 'sector_test',
      missionTag: 'mission-1',
    },
  }, { sectorId: 'sector_test', simTime: 3 });
  assert.equal(capturedMission.retentionClass, RETENTION_CLASS.PERMANENT,
    'capture derives permanent retention from mission identity');

  const bag = createEmptyRecordsBag();
  for (let i = 0; i < MAX_RECORDS_PER_SECTOR + 4; i++) {
    upsertRecord(bag, worldRecord(`tombstone_${i}`, {
      alive: false,
      outcome: 'destroyed',
      lastSeenTick: i,
    }));
  }
  assert.equal(Object.keys(bag.byId).length, MAX_RECORDS_PER_SECTOR + 4);
  assert.ok(bag.byId.tombstone_0, 'oldest destroyed identity survives cap pressure');
  assert.equal(bag.retentionReport.sectors.sector_test.protectedOverflow, 4);

  const named = normalizeRecord(worldRecord('named_actor', { named: true }));
  const job = normalizeRecord(worldRecord('job_actor', { jobId: 'job-1' }));
  assert.equal(named.retentionClass, RETENTION_CLASS.PERMANENT);
  assert.equal(job.retentionClass, RETENTION_CLASS.PERMANENT);
});

test('recent memory cap retires deterministically while aggregate and permanent records remain', () => {
  const first = createEmptyRecordsBag();
  const second = createEmptyRecordsBag();
  for (let i = 0; i < MAX_RECORDS_PER_SECTOR + 4; i++) {
    const rec = worldRecord(`recent_${i}`, { lastSeenTick: i, lastObservedT: i });
    upsertRecord(first, rec);
    upsertRecord(second, rec);
  }
  const expected = Array.from({ length: MAX_RECORDS_PER_SECTOR }, (_, i) => `recent_${i + 4}`);
  assert.deepEqual(Object.keys(first.byId).sort(), expected.sort());
  assert.deepEqual(Object.keys(second.byId).sort(), expected);
  assert.equal(first.retentionReport.sectors.sector_test.retiredRecent, 1,
    'the report describes the most recent cap transaction');

  const aggregate = worldRecord('aggregate', {
    abstractTier: 'S4_AGGREGATE',
    lastObservedT: 0,
  });
  first.byId.aggregate = normalizeRecord(aggregate);
  assert.equal(first.byId.aggregate.retentionClass, RETENTION_CLASS.AGGREGATE);
  assert.equal(gcExpiredRecentMemory(first, 1000, 180), MAX_RECORDS_PER_SECTOR,
    'only recent records are eligible for expiry');
  assert.ok(first.byId.aggregate, 'aggregate history is not treated as recent memory');
});

test('resource capture distinguishes untouched rocks from actual mining modification', () => {
  const untouched = captureResourceBodyRecord({
    type: 'asteroid',
    alive: true,
    pos: { x: 10, z: 4 },
    data: {
      sectorId: 'sector_test',
      fieldId: 'field_test',
      activityObjectSlotId: 'slot_clean',
      oreHP: 100,
      oreHPMax: 100,
      yieldU: 20,
      pctEjected: 0,
      _oreCarry: 0,
    },
  }, { simTime: 4 });
  const mined = captureResourceBodyRecord({
    type: 'asteroid',
    alive: true,
    pos: { x: 11, z: 4 },
    data: {
      sectorId: 'sector_test',
      fieldId: 'field_test',
      activityObjectSlotId: 'slot_mined',
      oreHP: 40,
      oreHPMax: 100,
      yieldU: 20,
      pctEjected: 0.4,
      _oreCarry: 0.25,
    },
  }, { simTime: 4 });
  assert.equal(untouched.playerModified, false);
  assert.equal(untouched.retentionClass, RESOURCE_BODY_RETENTION_CLASS.RECLAIMABLE);
  assert.equal(mined.playerModified, true);
  assert.equal(mined.retentionClass, RESOURCE_BODY_RETENTION_CLASS.PROTECTED);
  assert.equal(mined.oreHp, 40);
  assert.equal(mined.pctEjected, 0.4);
  assert.equal(mined._oreCarry, 0.25);
});

test('authoritative resource compaction emits a receipt and folds into field memory', () => {
  const bag = createEmptyResourceBodyBag();
  const clean = normalizeResourceBodyRecord(resourceRecord('clean'));
  upsertResourceBody(bag, clean);
  const fieldDepletion = {
    fields: {
      field_test: {
        fieldId: 'field_test',
        sectorId: 'sector_test',
        extractedU: 8,
        destroyedCount: 1,
        depletion: 0.02,
        richnessMult: 0.989,
        lastChangedT: 1,
      },
    },
    receipts: [],
  };
  const denied = compactResourceBodyRecords(bag, { fieldDepletion });
  assert.equal(denied.retired, 0, 'compaction requires explicit authority');
  assert.ok(bag.byId.clean);

  const result = compactResourceBodyRecords(bag, {
    authoritativeRetirement: true,
    fieldDepletion,
    simTime: 12,
    tick: 48,
  });
  assert.equal(result.retired, 1);
  assert.equal(bag.byId.clean, undefined);
  assert.equal(bag.retirementReceipts.length, 1);
  assert.equal(bag.retirementReceipts[0].event, 'resource_body_retired');
  assert.equal(bag.retirementReceipts[0].fieldId, 'field_test');
  assert.equal(fieldDepletion.fields.field_test.extractedU, 8,
    'recovery compaction does not fabricate extraction');
  assert.equal(fieldDepletion.receipts[0].event, 'resource_body_retired');
  assert.equal(serializeResourceBodyBag(bag).retirementReceipts.length, 1);
});

test('modified, mission, tracked, tethered, displaced, depleted, and destroyed bodies never compact', () => {
  const bag = createEmptyResourceBodyBag();
  const protectedRecords = [
    resourceRecord('modified', { oreHp: 90, playerModified: true }),
    resourceRecord('mission', { missionOwned: true }),
    resourceRecord('tracked', { tracked: true }),
    resourceRecord('tethered', { tethered: true }),
    resourceRecord('displaced', { displaced: true }),
    resourceRecord('depleted', { outcome: 'depleted', oreHp: 0, oreHpMax: 100 }),
    resourceRecord('destroyed', { outcome: 'destroyed', oreHp: 0, oreHpMax: 100 }),
  ];
  for (const record of protectedRecords) upsertResourceBody(bag, record);
  const result = compactResourceBodyRecords(bag, {
    authoritativeRetirement: true,
    fieldDepletion: { fields: {}, receipts: [] },
  });
  assert.equal(result.retired, 0);
  for (const record of protectedRecords) assert.ok(bag.byId[record.recordId]);
  assert.equal(bag.retentionReport.protectedOverflow, 0);
  assert.equal(isReclaimableResourceBody(bag.byId.modified), false);
  assert.equal(isReclaimableResourceBody(bag.byId.mission), false);
});

test('resource cap reports protected overflow and only retires reclaimable records', () => {
  const bag = createEmptyResourceBodyBag();
  for (let i = 0; i < MAX_RESOURCE_BODIES + 3; i++) {
    upsertResourceBody(bag, resourceRecord(`protected_${i}`, {
      playerModified: true,
      oreHp: 80,
      lastObservedT: i,
    }));
  }
  assert.equal(Object.keys(bag.byId).length, MAX_RESOURCE_BODIES + 3);
  assert.equal(bag.retentionReport.protectedOverflow, 3);
  assert.ok(bag.byId.protected_0);
});

test('restore normalization enforces world/resource caps and emits honest receipts', () => {
  const worldRecent = {};
  for (let i = 0; i < 60; i++) worldRecent[`restored_recent_${i}`] = worldRecord(`restored_recent_${i}`, {
    lastSeenTick: i,
    lastObservedT: i,
  });
  const normalizedRecent = deserializeRecordsBag({ byId: worldRecent });
  assert.equal(Object.keys(normalizedRecent.byId).length, MAX_RECORDS_PER_SECTOR);
  assert.ok(normalizedRecent.retentionReceipts.some((receipt) => receipt.event === 'world_records_cap'));

  const worldPermanent = {};
  for (let i = 0; i < 60; i++) worldPermanent[`restored_dead_${i}`] = worldRecord(`restored_dead_${i}`, {
    alive: false,
    outcome: 'destroyed',
  });
  const normalizedPermanent = deserializeRecordsBag({ byId: worldPermanent });
  assert.equal(Object.keys(normalizedPermanent.byId).length, 60,
    'restored tombstones fail closed instead of being silently evicted');
  assert.equal(normalizedPermanent.retentionReport.sectors.sector_test.protectedOverflow, 12);
  assert.ok(normalizedPermanent.retentionReceipts.some((receipt) => receipt.protectedOverflow === 12));

  const resourceClean = {};
  for (let i = 0; i < 300; i++) resourceClean[`restored_clean_${i}`] = resourceRecord(`restored_clean_${i}`, {
    lastObservedT: i,
  });
  const normalizedClean = deserializeResourceBodyBag({ byId: resourceClean });
  assert.equal(Object.keys(normalizedClean.byId).length, MAX_RESOURCE_BODIES);
  assert.ok(normalizedClean.retirementReceipts.length > 0);
  assert.ok(normalizedClean.retentionReceipts.some((receipt) => receipt.event === 'resource_body_cap'));

  const resourceProtected = {};
  for (let i = 0; i < 300; i++) resourceProtected[`restored_protected_${i}`] = resourceRecord(
    `restored_protected_${i}`, { playerModified: true, oreHp: 80 },
  );
  const normalizedProtected = deserializeResourceBodyBag({ byId: resourceProtected });
  assert.equal(Object.keys(normalizedProtected.byId).length, 300,
    'restored modified bodies survive protected overflow');
  assert.equal(normalizedProtected.retentionReport.protectedOverflow, 44);
  assert.ok(normalizedProtected.retentionReceipts.some((receipt) => receipt.protectedOverflow === 44));
});

test('clean resource upserts converge to the cap without caller authority', () => {
  const bag = createEmptyResourceBodyBag();
  for (let i = 0; i < MAX_RESOURCE_BODIES + 1; i++) {
    upsertResourceBody(bag, resourceRecord(`clean_upsert_${i}`, { lastObservedT: i }));
  }
  assert.equal(Object.keys(bag.byId).length, MAX_RESOURCE_BODIES);
  assert.equal(bag.byId.clean_upsert_0, undefined, 'oldest clean record is reclaimed deterministically');
  assert.ok(bag.retirementReceipts.some((receipt) => receipt.recordId === 'clean_upsert_0'));
  assert.equal(bag.retentionReport.protectedOverflow, 0);
});

test('retention protection is monotonic across downgrade attempts', () => {
  const records = createEmptyRecordsBag();
  upsertRecord(records, worldRecord('latched_world', {
    named: true,
    name: 'The Named One',
    retentionClass: RETENTION_CLASS.PERMANENT,
  }));
  upsertRecord(records, worldRecord('latched_world', {
    named: false,
    name: null,
    retentionClass: RETENTION_CLASS.RECENT,
  }));
  assert.equal(records.byId.latched_world.retentionClass, RETENTION_CLASS.PERMANENT);
  assert.equal(records.byId.latched_world.named, true);
  assert.equal(isPermanentWorldRecord(records.byId.latched_world), true);

  const resources = createEmptyResourceBodyBag();
  upsertResourceBody(resources, resourceRecord('latched_tether', { tethered: true }));
  upsertResourceBody(resources, resourceRecord('latched_tether', { tethered: false }));
  upsertResourceBody(resources, resourceRecord('latched_displaced', { displaced: true }));
  upsertResourceBody(resources, resourceRecord('latched_displaced', { displaced: false }));
  upsertResourceBody(resources, resourceRecord('latched_depleted', {
    outcome: 'depleted', oreHp: 0,
  }));
  upsertResourceBody(resources, resourceRecord('latched_depleted', {
    outcome: 'active', oreHp: 100,
  }));
  upsertResourceBody(resources, resourceRecord('latched_destroyed', {
    outcome: 'destroyed', oreHp: 0,
  }));
  upsertResourceBody(resources, resourceRecord('latched_destroyed', {
    outcome: 'active', oreHp: 100,
  }));
  assert.equal(resources.byId.latched_tether.tethered, true);
  assert.equal(resources.byId.latched_displaced.displaced, true);
  assert.equal(resources.byId.latched_depleted.outcome, 'depleted');
  assert.equal(resources.byId.latched_destroyed.outcome, 'destroyed');
  for (const id of ['latched_tether', 'latched_displaced', 'latched_depleted', 'latched_destroyed']) {
    assert.equal(isReclaimableResourceBody(resources.byId[id]), false);
  }
});
