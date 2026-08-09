// Event-driven punctuation for the seven authored Ceres job completions.
//
// Traffic remains the causal owner. This module accepts only its exact v1 receipt, snapshots the
// live actor/target/route coordinates while that synchronous authority still exists, and retains
// detached scalars in a small presentation pool. It never looks an entity up during update and it
// never writes simulation state.
import { CERES_ACTIVITY_SECTOR_ID } from '../data/sectorActivityPockets.js';
import { NPC_JOB_SCHEMA } from '../systems/npcJobs.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';

export const CERES_JOB_ACTION_RECEIPT_EVENT = 'traffic:jobActionReceipt';
export const CERES_JOB_ACTION_RECEIPT_SCHEMA = 'spaceface.trafficJobActionReceipt.v1';
export const CERES_JOB_ACTION_VFX_CAPACITY = 8;
export const CERES_JOB_ACTION_VFX_DEDUPE_CAPACITY = 512;
export const CERES_JOB_ACTION_VFX_ADMISSION_PRIORITY = 0.18;

function profile(definition) {
  return Object.freeze(definition);
}

// Identity is carried by geometry and rhythm, not color. The two haulers intentionally share the
// transfer language; every other authored action has its own silhouette/cadence pair.
export const CERES_JOB_ACTION_VFX_PROFILES = Object.freeze({
  oreCut: profile({
    id: 'ore-cut', geometry: 'single-contact-lance', rhythm: 'three-cut-bites',
    cadenceHz: 7.5, reducedCadenceHz: 2.2, durationS: 0.72,
    maxPulses: 3,
    streakCount: 1, spriteCount: 1, width: 0.18, length: 22, color: '#9fe7ff',
  }),
  transfer: profile({
    id: 'transfer', geometry: 'parallel-transfer-rails', rhythm: 'five-count-tally',
    cadenceHz: 5, reducedCadenceHz: 1.6, durationS: 0.92,
    streakCount: 2, spriteCount: 1, width: 0.24, length: 16, color: '#ffc866',
  }),
  survey: profile({
    id: 'survey', geometry: 'directional-scan-fan', rhythm: 'pulse-wait-pulse',
    cadenceHz: 2.1, reducedCadenceHz: 0.8, durationS: 1.22,
    streakCount: 3, spriteCount: 1, width: 0.08, length: 10, color: '#70e4ff',
  }),
  salvage: profile({
    id: 'salvage', geometry: 'crossed-cutter-arcs', rhythm: 'broken-six-count',
    cadenceHz: 6.2, reducedCadenceHz: 1.9, durationS: 0.86,
    streakCount: 3, spriteCount: 1, width: 0.12, length: 11, color: '#ffad72',
  }),
  escort: profile({
    id: 'escort', geometry: 'paired-cover-chevrons', rhythm: 'alternating-wingbeat',
    cadenceHz: 4.2, reducedCadenceHz: 1.4, durationS: 0.95,
    streakCount: 2, spriteCount: 1, width: 0.14, length: 7, color: '#8fb8ff',
  }),
  patrol: profile({
    id: 'patrol', geometry: 'four-spoke-watch-mark', rhythm: 'quarter-sweep',
    cadenceHz: 3.2, reducedCadenceHz: 1.1, durationS: 1.05,
    streakCount: 4, spriteCount: 1, width: 0.1, length: 5, color: '#b7cfff',
  }),
});

const PROFILE_LIST = Object.freeze([
  CERES_JOB_ACTION_VFX_PROFILES.oreCut,
  CERES_JOB_ACTION_VFX_PROFILES.transfer,
  CERES_JOB_ACTION_VFX_PROFILES.survey,
  CERES_JOB_ACTION_VFX_PROFILES.salvage,
  CERES_JOB_ACTION_VFX_PROFILES.escort,
  CERES_JOB_ACTION_VFX_PROFILES.patrol,
]);

function contract(definition) {
  return Object.freeze({
    ...definition,
    worldRecordSlotId: `ceres:activity:${definition.slotId}`,
  });
}

export const CERES_JOB_ACTION_VFX_CONTRACTS = Object.freeze([
  contract({
    slotId: 'ceres_refinery_hauler', routeId: 'ceres_refinery_freight_loop',
    jobKind: 'hauler', action: 'unload', waypointIndex: 1,
    waypointId: 'refinery_station_approach', targetRef: 'dest:station_ceres',
    targetKind: 'station', targetMatch: 'station', targetValue: 'station_ceres',
    effectType: 'freight:arrival', effectApplied: true, profileIndex: 1,
  }),
  contract({
    slotId: 'ceres_seam_miner', routeId: 'ceres_seam_extraction_loop',
    jobKind: 'miner', action: 'work', waypointIndex: 1,
    waypointId: 'seam_miner_ore_face', targetRef: 'field:slot:ceres_seam_ore_clast',
    targetKind: 'field-slot', targetMatch: 'field-slot', targetValue: 'ceres_seam_ore_clast',
    effectType: 'mining:npcExtraction', effectApplied: true, profileIndex: 0,
  }),
  contract({
    slotId: 'ceres_seam_surveyor', routeId: 'ceres_seam_survey_sweep',
    jobKind: 'surveyor', action: 'work', waypointIndex: 1,
    waypointId: 'seam_survey_mark_b', targetRef: 'activity:scan-mark-b',
    targetKind: 'activity', targetMatch: 'activity', targetValue: null,
    effectType: null, effectApplied: false, profileIndex: 2,
  }),
  contract({
    slotId: 'ceres_ambush_loaded_hauler', routeId: 'ceres_ambush_loaded_crossing',
    jobKind: 'hauler', action: 'unload', waypointIndex: 1,
    waypointId: 'ambush_hauler_outbound', targetRef: 'activity:throughline-outbound',
    targetKind: 'activity', targetMatch: 'activity', targetValue: null,
    effectType: null, effectApplied: false, profileIndex: 1,
  }),
  contract({
    slotId: 'ceres_ambush_escort', routeId: 'ceres_ambush_escort_crossing',
    jobKind: 'patrol', action: 'hold', waypointIndex: 1,
    waypointId: 'ambush_escort_outbound', targetRef: 'actor:ceres_ambush_loaded_hauler',
    targetKind: 'actor', targetMatch: 'actor-slot', targetValue: 'ceres_ambush_loaded_hauler',
    effectType: null, effectApplied: false, profileIndex: 4,
  }),
  contract({
    slotId: 'ceres_cathedral_salvor', routeId: 'ceres_cathedral_salvage_loop',
    jobKind: 'salvor', action: 'work', waypointIndex: 1,
    waypointId: 'cathedral_salvor_hulk', targetRef: 'world-site:world_site_wreck_cathedral',
    targetKind: 'world-site', targetMatch: 'world-site', targetValue: 'world_site_wreck_cathedral/root',
    effectType: null, effectApplied: false, profileIndex: 3,
  }),
  contract({
    slotId: 'ceres_cathedral_patrol', routeId: 'ceres_cathedral_patrol_perimeter',
    jobKind: 'patrol', action: 'hold', waypointIndex: 1,
    waypointId: 'cathedral_patrol_beat_b', targetRef: 'activity:grave-perimeter-b',
    targetKind: 'activity', targetMatch: 'activity', targetValue: null,
    effectType: null, effectApplied: false, profileIndex: 5,
  }),
]);

const CONTRACT_BY_SLOT = new Map(
  CERES_JOB_ACTION_VFX_CONTRACTS.map((entry, index) => [entry.slotId, { entry, index }]),
);

const RECEIPT_FIELDS = Object.freeze([
  'schema', 'receiptId', 'actionId', 'sectorId', 'routeId', 'jobId', 'jobKind', 'action',
  'sequence', 'kernelSequence', 'actorSlotId', 'actorId', 'targetRef', 'targetKind',
  'targetId', 'effectType', 'effectApplied', 'simTime',
]);

function exactCeresSectorAuthority(entity) {
  if (!entity) return false;
  const data = entity.data || {};
  let present = false;
  const a = entity.homeSectorId;
  const b = data.homeSectorId;
  const c = data.sectorId;
  if (a != null) { present = true; if (a !== CERES_ACTIVITY_SECTOR_ID) return false; }
  if (b != null) { present = true; if (b !== CERES_ACTIVITY_SECTOR_ID) return false; }
  if (c != null) { present = true; if (c !== CERES_ACTIVITY_SECTOR_ID) return false; }
  return present;
}

function finiteXZ(pos) {
  return !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.z);
}

function exactEntityId(value) {
  return (typeof value === 'number' && Number.isSafeInteger(value))
    || (typeof value === 'string' && value.length > 0);
}

function terminalWorldRecord(state, recordId) {
  if (typeof recordId !== 'string' || !recordId) return false;
  const records = state && state.world && state.world.records && state.world.records.byId;
  const record = records && records[recordId];
  return !!record && (record.alive === false
    || record.outcome === 'destroyed'
    || record.outcome === 'defeated');
}

function targetWorldRecordId(entity, contractEntry, seed) {
  if (contractEntry.targetMatch === 'actor-slot') {
    const targetContract = CONTRACT_BY_SLOT.get(contractEntry.targetValue);
    return targetContract
      ? stableRecordId(
          seed,
          CERES_ACTIVITY_SECTOR_ID,
          RECORD_KIND.CONVOY,
          targetContract.entry.worldRecordSlotId,
        )
      : null;
  }
  if (contractEntry.targetMatch === 'world-site') return contractEntry.targetValue;
  const data = entity && entity.data;
  return data && typeof data.worldRecordId === 'string' ? data.worldRecordId : null;
}

function exactTargetEntity(entity, contractEntry, state, seed) {
  if (!entity || entity.alive === false || !finiteXZ(entity.pos)
    || !exactCeresSectorAuthority(entity)) return false;
  const data = entity.data || {};
  let matches = false;
  switch (contractEntry.targetMatch) {
    case 'station':
      matches = entity.type === 'station' && data.stationId === contractEntry.targetValue;
      break;
    case 'field-slot':
      matches = entity.type === 'asteroid'
        && data.activityObjectSlotId === contractEntry.targetValue;
      break;
    case 'actor-slot':
      matches = entity.type === 'ship'
        && data.activityActorSlotId === contractEntry.targetValue
        && data.ceresActivityCast === true
        && data.ceresActivityJobOwned === true
        && data.worldRecordId === targetWorldRecordId(entity, contractEntry, seed);
      break;
    case 'world-site':
      matches = entity.type === 'fx' && data.worldRecordId === contractEntry.targetValue;
      break;
    default:
      return false;
  }
  return matches && !terminalWorldRecord(
    state,
    targetWorldRecordId(entity, contractEntry, seed),
  );
}

function uniqueExactTargetEntity(entities, contractEntry, state, seed) {
  let unique = null;
  for (const entity of entities.values()) {
    if (!exactTargetEntity(entity, contractEntry, state, seed)) continue;
    if (unique !== null) return null;
    unique = entity;
  }
  return unique;
}

function resetSnapshot(out) {
  out.contractIndex = -1;
  out.profileIndex = -1;
  out.receiptId = null;
  out.sourceX = 0;
  out.sourceZ = 0;
  out.targetX = 0;
  out.targetZ = 0;
  out.routeX = 0;
  out.routeZ = 0;
  return out;
}

function writeValidatedSnapshot(receipt, state, helpers, out) {
  resetSnapshot(out);
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false;
  for (let i = 0; i < RECEIPT_FIELDS.length; i++) {
    if (!Object.hasOwn(receipt, RECEIPT_FIELDS[i])) return false;
  }
  if (receipt.schema !== CERES_JOB_ACTION_RECEIPT_SCHEMA
    || receipt.sectorId !== CERES_ACTIVITY_SECTOR_ID
    || typeof receipt.actorSlotId !== 'string') return false;
  const row = CONTRACT_BY_SLOT.get(receipt.actorSlotId);
  if (!row) return false;
  const expected = row.entry;
  if (receipt.routeId !== expected.routeId
    || receipt.jobKind !== expected.jobKind
    || receipt.action !== expected.action
    || receipt.targetRef !== expected.targetRef
    || receipt.targetKind !== expected.targetKind
    || receipt.effectType !== expected.effectType
    || receipt.effectApplied !== expected.effectApplied
    || typeof receipt.jobId !== 'string' || !receipt.jobId.startsWith('job:')
    || !Number.isSafeInteger(receipt.sequence) || receipt.sequence < 0
    || !Number.isSafeInteger(receipt.kernelSequence) || receipt.kernelSequence <= 0
    || !Number.isFinite(receipt.simTime) || receipt.simTime < 0
    || !exactEntityId(receipt.actorId)) return false;
  if (expected.jobKind !== 'hauler' && receipt.sequence !== receipt.kernelSequence) return false;
  const recomputedId = `ceres-job-action:${receipt.jobId}:${receipt.action}:${receipt.sequence}:${receipt.targetRef}`;
  if (receipt.receiptId !== recomputedId || receipt.actionId !== recomputedId) return false;

  const entities = state && state.entities;
  const world = state && state.world;
  if (!entities || typeof entities.get !== 'function'
    || !world || world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return false;
  const actor = entities.get(receipt.actorId);
  const actorData = actor && actor.data;
  const seed = state.meta && state.meta.seed || 1;
  const expectedWorldRecordId = stableRecordId(
    seed,
    CERES_ACTIVITY_SECTOR_ID,
    RECORD_KIND.CONVOY,
    expected.worldRecordSlotId,
  );
  if (terminalWorldRecord(state, expectedWorldRecordId)) return false;
  if (!actor || actor.id !== receipt.actorId || actor.alive === false || actor.type !== 'ship'
    || !finiteXZ(actor.pos) || !exactCeresSectorAuthority(actor)
    || !actorData || actorData.jobId !== receipt.jobId
    || actorData.activityActorSlotId !== expected.slotId
    || actorData.ceresActivityCast !== true || actorData.ceresActivityJobOwned !== true
    || actorData.worldRecordId !== expectedWorldRecordId
    || receipt.jobId !== `job:${expectedWorldRecordId}`) return false;

  const npcJobs = helpers && helpers.npcJobs;
  const entry = npcJobs && typeof npcJobs.get === 'function'
    ? npcJobs.get(receipt.jobId)
    : null;
  const job = entry && entry.job;
  if (!entry || !job || job.schema !== NPC_JOB_SCHEMA || job.corrupt === true
    || job.materialized !== true || job.id !== receipt.jobId || job.kind !== expected.jobKind
    || job.phase !== expected.action || job.progress !== 1
    || job.sequence !== receipt.kernelSequence || job.simTime !== receipt.simTime
    || entry.kind !== expected.jobKind || entry.sectorId !== CERES_ACTIVITY_SECTOR_ID
    || entry.worldRecordId !== actorData.worldRecordId || entry.entityId !== receipt.actorId) return false;
  if (expected.jobKind === 'hauler') {
    const runSequence = job.payload && job.payload.activityRunSeq;
    if (!Number.isSafeInteger(runSequence) || runSequence < 0
      || receipt.sequence !== runSequence) return false;
  }
  const route = job.route;
  if (!Array.isArray(route) || job.routeIndex !== expected.waypointIndex) return false;
  const waypoint = route[job.routeIndex];
  if (!waypoint || waypoint.id !== expected.waypointId
    || waypoint.targetRef !== expected.targetRef || !finiteXZ(waypoint.pos)) return false;

  let targetX = waypoint.pos.x;
  let targetZ = waypoint.pos.z;
  if (expected.targetMatch === 'activity') {
    if (receipt.targetId !== null || expected.targetKind !== 'activity') return false;
  } else {
    if (!exactEntityId(receipt.targetId)) return false;
    const target = uniqueExactTargetEntity(entities, expected, state, seed);
    if (!target || target !== entities.get(receipt.targetId) || target.id !== receipt.targetId) return false;
    if (expected.targetMatch === 'actor-slot') {
      const targetContract = CONTRACT_BY_SLOT.get(expected.targetValue);
      if (!targetContract) return false;
      const expectedTargetWorldRecordId = stableRecordId(
        seed,
        CERES_ACTIVITY_SECTOR_ID,
        RECORD_KIND.CONVOY,
        targetContract.entry.worldRecordSlotId,
      );
      const targetJobId = `job:${expectedTargetWorldRecordId}`;
      if (!target.data || target.data.worldRecordId !== expectedTargetWorldRecordId
        || (target.data.jobId != null && target.data.jobId !== targetJobId)) return false;
      if (target.data.jobId != null) {
        const targetJobEntry = npcJobs.get(targetJobId);
        if (!targetJobEntry || targetJobEntry.worldRecordId !== expectedTargetWorldRecordId
          || targetJobEntry.sectorId !== CERES_ACTIVITY_SECTOR_ID
          || targetJobEntry.entityId !== target.id
          || !targetJobEntry.job || targetJobEntry.job.id !== targetJobId
          || targetJobEntry.job.materialized !== true
          || targetJobEntry.job.corrupt === true) return false;
      }
    }
    targetX = target.pos.x;
    targetZ = target.pos.z;
  }

  out.contractIndex = row.index;
  out.profileIndex = expected.profileIndex;
  out.receiptId = receipt.receiptId;
  out.sourceX = actor.pos.x;
  out.sourceZ = actor.pos.z;
  out.targetX = targetX;
  out.targetZ = targetZ;
  out.routeX = waypoint.pos.x;
  out.routeZ = waypoint.pos.z;
  return true;
}

function createSlot() {
  return {
    alive: false,
    contractIndex: -1,
    profileIndex: -1,
    receiptId: null,
    age: 0,
    nextEmit: 0,
    pulse: 0,
    sourceX: 0,
    sourceZ: 0,
    targetX: 0,
    targetZ: 0,
    routeX: 0,
    routeZ: 0,
  };
}

/** Fixed-capacity presentation controller. `emit` receives only a resident scalar slot. */
export function createCeresJobActionVfxController() {
  const slots = new Array(CERES_JOB_ACTION_VFX_CAPACITY);
  for (let i = 0; i < slots.length; i++) slots[i] = createSlot();
  const dedupe = new Set();
  const dedupeRing = new Array(CERES_JOB_ACTION_VFX_DEDUPE_CAPACITY).fill(null);
  const snapshot = resetSnapshot({});
  let dedupeHead = 0;
  let dedupeCount = 0;
  let active = 0;
  let accepted = 0;
  let rejectedInvalid = 0;
  let rejectedDuplicate = 0;
  let rejectedSaturated = 0;
  let emitted = 0;
  let lastProfileId = null;

  const controller = {
    accept(receipt, state, helpers) {
      // Validation is deliberately complete before the dedupe lookup: a malformed spoof can never
      // poison the bounded replay ledger for a later valid receipt with the same claimed id.
      if (!writeValidatedSnapshot(receipt, state, helpers, snapshot)) {
        rejectedInvalid++;
        return false;
      }
      if (dedupe.has(snapshot.receiptId)) {
        rejectedDuplicate++;
        return false;
      }
      let slot = null;
      for (let i = 0; i < slots.length; i++) {
        if (!slots[i].alive) { slot = slots[i]; break; }
      }
      if (!slot) {
        rejectedSaturated++;
        return false;
      }
      slot.alive = true;
      slot.contractIndex = snapshot.contractIndex;
      slot.profileIndex = snapshot.profileIndex;
      slot.receiptId = snapshot.receiptId;
      slot.age = 0;
      slot.nextEmit = 0;
      slot.pulse = 0;
      slot.sourceX = snapshot.sourceX;
      slot.sourceZ = snapshot.sourceZ;
      slot.targetX = snapshot.targetX;
      slot.targetZ = snapshot.targetZ;
      slot.routeX = snapshot.routeX;
      slot.routeZ = snapshot.routeZ;
      active++;
      accepted++;
      lastProfileId = PROFILE_LIST[slot.profileIndex].id;
      if (dedupeCount === CERES_JOB_ACTION_VFX_DEDUPE_CAPACITY) {
        const evicted = dedupeRing[dedupeHead];
        if (evicted != null) dedupe.delete(evicted);
      } else {
        dedupeCount++;
      }
      dedupeRing[dedupeHead] = slot.receiptId;
      dedupe.add(slot.receiptId);
      dedupeHead = (dedupeHead + 1) % CERES_JOB_ACTION_VFX_DEDUPE_CAPACITY;
      return true;
    },

    update(frameDt, reducedMotion, reducedFlash, emit) {
      if (!(frameDt > 0) || active <= 0 || typeof emit !== 'function') return 0;
      const dt = Math.min(0.1, frameDt);
      let live = 0;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot.alive) continue;
        const actionProfile = PROFILE_LIST[slot.profileIndex];
        slot.age += dt;
        const pulseCap = Number.isSafeInteger(actionProfile.maxPulses)
          ? actionProfile.maxPulses
          : Number.MAX_SAFE_INTEGER;
        if (slot.pulse < pulseCap
          && slot.age >= slot.nextEmit && slot.age <= actionProfile.durationS) {
          emit(slot, actionProfile, slot.pulse, reducedMotion === true, reducedFlash === true);
          emitted++;
          slot.pulse++;
          const cadence = reducedMotion === true
            ? actionProfile.reducedCadenceHz
            : actionProfile.cadenceHz;
          slot.nextEmit += 1 / cadence;
        }
        if (slot.age >= actionProfile.durationS) {
          slot.alive = false;
          slot.receiptId = null;
          slot.contractIndex = -1;
          slot.profileIndex = -1;
          active--;
        } else {
          live++;
        }
      }
      return live;
    },

    clear() {
      for (let i = 0; i < slots.length; i++) {
        slots[i].alive = false;
        slots[i].receiptId = null;
        slots[i].contractIndex = -1;
        slots[i].profileIndex = -1;
        slots[i].age = 0;
        slots[i].nextEmit = 0;
        slots[i].pulse = 0;
      }
      for (let i = 0; i < dedupeRing.length; i++) dedupeRing[i] = null;
      dedupe.clear();
      dedupeHead = 0;
      dedupeCount = 0;
      active = 0;
      lastProfileId = null;
    },

    inspect() {
      return {
        active,
        capacity: CERES_JOB_ACTION_VFX_CAPACITY,
        dedupe: dedupeCount,
        dedupeCapacity: CERES_JOB_ACTION_VFX_DEDUPE_CAPACITY,
        accepted,
        rejectedInvalid,
        rejectedDuplicate,
        rejectedSaturated,
        emitted,
        lastProfileId,
      };
    },

    // Test/read-only seam: the array is fixed and slots contain detached scalar state only.
    slots,
  };
  return controller;
}
