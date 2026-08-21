import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RECORD_KIND,
  WORLD_RECORDS_SCHEMA_VERSION,
  captureEntityRecord,
  createEmptyRecordsBag,
  markRecordDestroyed,
  normalizeRecord,
  normalizeRecordsBag,
  recordShouldRematerialize,
  serializeRecordsBag,
  upsertRecord,
} from '../src/world/worldRecords.js';
import {
  MAX_RESOURCE_BODIES,
  captureResourceBodyRecord,
  createEmptyResourceBodyBag,
  normalizeResourceBodyBag,
  shouldGarbageCollectResourceBody,
  upsertResourceBody,
} from '../src/world/resourceBodyRecords.js';
import {
  INTENT_KIND,
  advanceResourceBody,
  advanceWorldRecord,
  ballisticDrift,
  itineraryProgress,
  resolveScheduledWorldEvent,
} from '../src/world/worldCatchup.js';
import { SIM_TIER } from '../src/world/activityClassification.js';

test('unknown extra survives two normalizes and serialize round-trip', () => {
  const first = normalizeRecord({
    recordId: 'wr_npc_extra',
    kind: RECORD_KIND.NPC,
    sectorId: 'sec_helios',
    pos: { x: 1, z: 1 },
    customLedgerNote: 'keep-me',
  });
  const second = normalizeRecord(first);
  assert.equal(second.extra.customLedgerNote, 'keep-me');
  const bag = createEmptyRecordsBag();
  upsertRecord(bag, second);
  const disk = serializeRecordsBag(bag);
  const loaded = normalizeRecordsBag(disk);
  assert.equal(loaded.byId.wr_npc_extra.extra.customLedgerNote, 'keep-me');
});

test('recapture keeps prior extra', () => {
  const entity = {
    type: 'ship',
    pos: { x: 2, z: 2 },
    homeSectorId: 'sec_helios',
    data: { defId: 'ship_wasp', homeSectorId: 'sec_helios', worldRecordId: 'wr_keep' },
    flags: { durable: true },
    alive: true,
  };
  const rec = captureEntityRecord(entity, {
    sectorId: 'sec_helios',
    seed: 1,
    recordId: 'wr_keep',
    simTime: 12,
    extra: { customLedgerNote: 'from-prior' },
  });
  assert.equal(rec.extra.customLedgerNote, 'from-prior');
});

test('destroyed records do not ballistic-drift', () => {
  const rec = normalizeRecord({
    recordId: 'wr_dead',
    kind: RECORD_KIND.NPC,
    sectorId: 'sec_helios',
    pos: { x: 0, z: 0 },
    vel: { x: 9, z: 0 },
    alive: false,
    outcome: 'destroyed',
  });
  const later = advanceWorldRecord(rec, 0, 10);
  assert.equal(later.pos.x, 0);
});

test('unresolved combat does not rewind lastExactT', () => {
  const rec = normalizeRecord({
    recordId: 'wr_fight',
    kind: RECORD_KIND.NPC,
    sectorId: 'sec_helios',
    pos: { x: 0, z: 0 },
    vel: { x: 4, z: 0 },
    lastExactT: 88,
  });
  const later = advanceWorldRecord(rec, 0, 10, { unresolvedPlayerCombat: true });
  assert.equal(later.lastExactT, 88);
  assert.equal(later.pos.x, 0);
});

test('v1 world records migrate abstract fields without dropping identity', () => {
  const legacy = normalizeRecord({
    recordId: 'wr_npc_aa',
    kind: RECORD_KIND.NPC,
    sectorId: 'sec_helios',
    pos: { x: 10, z: -4 },
    customLedgerNote: 'keep-me',
  });
  assert.ok(legacy);
  assert.equal(legacy.abstractTier, SIM_TIER.S0_EXACT);
  assert.equal(legacy.lastExactT, 0);
  assert.equal(legacy.extra.customLedgerNote, 'keep-me');
  assert.equal(WORLD_RECORDS_SCHEMA_VERSION, 2);
  const bag = normalizeRecordsBag({
    schemaId: 'spaceface.worldRecords.v1',
    schemaVersion: 1,
    byId: { wr_npc_aa: legacy },
  });
  assert.equal(bag.schemaVersion, 2);
  assert.equal(bag.byId.wr_npc_aa.recordId, 'wr_npc_aa');
});

test('destroyed durable ids never rematerialize', () => {
  const bag = createEmptyRecordsBag();
  upsertRecord(bag, {
    recordId: 'wr_pirate_1',
    kind: RECORD_KIND.NPC,
    sectorId: 'sec_helios',
    pos: { x: 1, z: 1 },
  });
  markRecordDestroyed(bag, 'wr_pirate_1', { outcome: 'destroyed' });
  const rec = bag.byId.wr_pirate_1;
  assert.equal(rec.alive, false);
  assert.equal(recordShouldRematerialize(rec, 'FULL'), false);
});

test('captureEntityRecord stamps lastExactT from simTime', () => {
  const rec = captureEntityRecord({
    type: 'ship',
    pos: { x: 8, z: 2 },
    vel: { x: 1, z: 0 },
    rot: 0.2,
    homeSectorId: 'sec_helios',
    data: { defId: 'ship_kestrel', homeSectorId: 'sec_helios', trafficRole: 'hauler' },
    flags: { durable: true },
    alive: true,
  }, { seed: 7, simTime: 44.5, sectorId: 'sec_helios' });
  assert.ok(rec);
  assert.equal(rec.kind, RECORD_KIND.CONVOY);
  assert.equal(rec.lastExactT, 44.5);
  assert.equal(rec.lastObservedT, 44.5);
});

test('advanceWorldRecord ballistic drift is closed-form in simTime', () => {
  const rec = normalizeRecord({
    recordId: 'wr_a',
    kind: RECORD_KIND.NPC,
    sectorId: 'sec_helios',
    pos: { x: 0, z: 0 },
    vel: { x: 10, z: 0 },
    rot: 0,
    angVel: 0,
  });
  const later = advanceWorldRecord(rec, 0, 2.5);
  assert.equal(later.pos.x, 25);
  assert.equal(later.pos.z, 0);
  assert.equal(later.lastExactT, 2.5);
});

test('itinerary travel does not 60 Hz integrate', () => {
  const rec = normalizeRecord({
    recordId: 'wr_b',
    kind: RECORD_KIND.CONVOY,
    sectorId: 'sec_helios',
    pos: { x: 0, z: 0 },
    intent: {
      kind: INTENT_KIND.TRAVEL,
      startT: 10,
      endT: 20,
      parameters: { from: { x: 0, z: 0 }, to: { x: 100, z: 0 } },
    },
  });
  assert.equal(itineraryProgress(rec.intent, 15), 0.5);
  const later = advanceWorldRecord(rec, 10, 15);
  assert.equal(later.pos.x, 50);
});

test('unresolved player combat is never abstracted', () => {
  const rec = normalizeRecord({
    recordId: 'wr_c',
    kind: RECORD_KIND.NPC,
    sectorId: 'sec_helios',
    pos: { x: 0, z: 0 },
    vel: { x: 4, z: 0 },
  });
  const later = advanceWorldRecord(rec, 0, 10, { unresolvedPlayerCombat: true });
  assert.equal(later.pos.x, 0);
  assert.equal(later.abstractTier, SIM_TIER.S0_EXACT);
});

test('resource body ledger keys field+slot and keeps ore', () => {
  const rec = captureResourceBodyRecord({
    type: 'asteroid',
    pos: { x: 12, z: -3 },
    vel: { x: 0, z: 0 },
    oreHp: 40,
    oreHpMax: 100,
    data: {
      fieldId: 'field_helios_a',
      activityObjectSlotId: 'slot_9',
      homeSectorId: 'sec_helios',
      seams: { a: 1 },
    },
    alive: true,
  }, { seed: 3, simTime: 9, sectorId: 'sec_helios', fieldId: 'field_helios_a', slotId: 'slot_9' });
  assert.ok(rec);
  assert.equal(rec.oreHp, 40);
  assert.equal(rec.fieldId, 'field_helios_a');
  assert.equal(rec.playerModified, true);
  const bag = createEmptyResourceBodyBag();
  upsertResourceBody(bag, rec);
  const round = normalizeResourceBodyBag(bag);
  assert.equal(round.byId[rec.recordId].oreHp, 40);
});

test('resource body catch-up recovers ore by policy and does not GC tethered rocks', () => {
  const rec = captureResourceBodyRecord({
    type: 'asteroid',
    pos: { x: 0, z: 0 },
    vel: { x: 2, z: 0 },
    oreHp: 10,
    oreHpMax: 20,
    data: { fieldId: 'f', activityObjectSlotId: 's', homeSectorId: 'sec' },
    flags: { tethered: true },
    alive: true,
  }, { seed: 1, simTime: 0, sectorId: 'sec', fieldId: 'f', slotId: 's', recoveryPolicy: { oreRate: 1 } });
  const later = advanceResourceBody(rec, 0, 5);
  assert.equal(later.pos.x, 10);
  assert.equal(later.oreHp, 15);
  assert.equal(shouldGarbageCollectResourceBody(later, { fieldMayRegenerate: true }), false);
});

test('resource body bag honors max occupancy without dropping tethered rocks first', () => {
  const bag = createEmptyResourceBodyBag();
  for (let i = 0; i < MAX_RESOURCE_BODIES + 4; i++) {
    upsertResourceBody(bag, {
      recordId: `rb_${i}`,
      sectorId: 'sec',
      fieldId: 'f',
      slotId: `s${i}`,
      pos: { x: i, z: 0 },
      lastObservedT: i,
      playerModified: true,
      tethered: i === 0,
    });
  }
  assert.equal(Object.keys(bag.byId).length, MAX_RESOURCE_BODIES);
  assert.ok(bag.byId.rb_0, 'tethered first rock is retained');
});

test('resource body extra does not nest on re-normalize', () => {
  const rec = {
    recordId: 'rb_extra',
    sectorId: 'sec',
    fieldId: 'f',
    slotId: 's',
    pos: { x: 1, z: 1 },
    oddNote: 7,
  };
  const twice = normalizeResourceBodyBag({ byId: { rb_extra: rec } });
  const again = normalizeResourceBodyBag(twice);
  assert.equal(again.byId.rb_extra.extra.oddNote, 7);
  assert.equal(again.byId.rb_extra.extra.extra, undefined);
});

test('scheduled world events resolve on simTime not wall clock', () => {
  const pending = resolveScheduledWorldEvent({ id: 'e1', kind: 'dock', atT: 30 }, { simTime: 10 });
  assert.equal(pending.resolved, false);
  const due = resolveScheduledWorldEvent({ id: 'e1', kind: 'dock', atT: 30, resultSeed: 9 }, { simTime: 30 });
  assert.equal(due.resolved, true);
  assert.equal(due.resultSeed, 9);
});

test('serialize drops liveEntityId and keeps abstract intent', () => {
  const bag = createEmptyRecordsBag();
  upsertRecord(bag, {
    recordId: 'wr_x',
    kind: RECORD_KIND.NPC,
    sectorId: 'sec_helios',
    pos: { x: 1, z: 2 },
    liveEntityId: 99,
    intent: { kind: INTENT_KIND.LOITER, startT: 1, endT: 2 },
  });
  const disk = serializeRecordsBag(bag);
  assert.equal(disk.byId.wr_x.liveEntityId, undefined);
  assert.equal(disk.byId.wr_x.intent.kind, INTENT_KIND.LOITER);
});

test('ballistic drift is linear', () => {
  const d = ballisticDrift({ x: 1, z: 2 }, { x: 3, z: -1 }, 0.1, 0.2, 2);
  assert.equal(d.pos.x, 7);
  assert.equal(d.pos.z, 0);
});
