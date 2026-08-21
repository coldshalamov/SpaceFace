import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_RECORDS_PER_SECTOR,
  RECORD_KIND,
  RETENTION_CLASS,
  captureEntityRecord,
  createEmptyRecordsBag,
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
