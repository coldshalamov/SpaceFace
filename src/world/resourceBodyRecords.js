// Bounded durable ledger for player-touched resource bodies (asteroids).
// Aggregate belt memory stays in fieldDepletion. This answers "is this the
// same rock and what remains in it?"

import { hash32 } from '../core/rng.js';

export const RESOURCE_BODY_SCHEMA_ID = 'spaceface.resourceBodyRecords.v2';
export const RESOURCE_BODY_SCHEMA_VERSION = 2;
export const MAX_RESOURCE_BODIES = 256;
export const MAX_RESOURCE_RETIREMENT_RECEIPTS = 64;
export const RESOURCE_BODY_RETENTION_CLASS = Object.freeze({
  RECLAIMABLE: 'reclaimable',
  PROTECTED: 'protected',
});

const RECOVERY_EPSILON = 1e-6;

export function createEmptyResourceBodyBag() {
  return {
    schemaId: RESOURCE_BODY_SCHEMA_ID,
    schemaVersion: RESOURCE_BODY_SCHEMA_VERSION,
    byId: {},
  };
}

function finiteXZ(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Number.isFinite(value.x) && Number.isFinite(value.z);
}

function cloneXZ(value) {
  if (!finiteXZ(value)) return { x: 0, z: 0 };
  return { x: value.x, z: value.z };
}

function clonePlain(value) {
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

/** A body is protected if any authoritative identity or physical state must survive compaction. */
export function resourceBodyHasProtectedState(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.playerModified === true) return true;
  if (raw.tethered === true || raw.displaced === true) return true;
  if (raw.tracked === true || raw.missionOwned === true) return true;
  if (raw.outcome === 'destroyed' || raw.outcome === 'depleted') return true;
  if (raw.depletedAtT != null) return true;
  return false;
}

function inferredMiningModification(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.displaced === true || raw.outcome === 'destroyed' || raw.outcome === 'depleted'
    || raw.depletedAtT != null) return true;
  if (raw.mined === true || raw.miningModified === true || raw.modified === true
    || raw.miningStarted === true || raw.miningWear > RECOVERY_EPSILON) return true;
  const oreHp = finiteNumber(raw.oreHp != null ? raw.oreHp : raw.oreHP);
  const oreHpMax = finiteNumber(raw.oreHpMax != null ? raw.oreHpMax : raw.oreHPMax);
  if (oreHp != null && oreHpMax != null && oreHp < oreHpMax - RECOVERY_EPSILON) return true;
  const yieldRemainingU = finiteNumber(raw.yieldRemainingU);
  const yieldMaxU = finiteNumber(raw.yieldMaxU);
  if (yieldRemainingU != null && yieldMaxU != null
    && yieldRemainingU < yieldMaxU - RECOVERY_EPSILON) return true;
  if (finiteNumber(raw.pctEjected) != null && raw.pctEjected > RECOVERY_EPSILON) return true;
  if (finiteNumber(raw._oreCarry) != null && raw._oreCarry > RECOVERY_EPSILON) return true;
  return false;
}

/** Derive the bounded ledger class; protected evidence always wins over stale save metadata. */
export function deriveResourceBodyRetentionClass(raw) {
  if (resourceBodyHasProtectedState(raw) || inferredMiningModification(raw)) {
    return RESOURCE_BODY_RETENTION_CLASS.PROTECTED;
  }
  return RESOURCE_BODY_RETENTION_CLASS.RECLAIMABLE;
}

export function isFullyRecoveredResourceBody(record) {
  if (!record || record.outcome !== 'active') return false;
  if (record.depletedAtT != null) return false;
  const oreHp = finiteNumber(record.oreHp);
  const oreHpMax = finiteNumber(record.oreHpMax);
  if (oreHp != null && oreHpMax != null && oreHp < oreHpMax - RECOVERY_EPSILON) return false;
  const remaining = finiteNumber(record.yieldRemainingU);
  const yieldMax = finiteNumber(record.yieldMaxU);
  if (remaining != null && yieldMax != null && remaining < yieldMax - RECOVERY_EPSILON) return false;
  if (finiteNumber(record.pctEjected) != null && record.pctEjected > RECOVERY_EPSILON) return false;
  if (finiteNumber(record._oreCarry) != null && record._oreCarry > RECOVERY_EPSILON) return false;
  return true;
}

/** Only a fully recovered, untouched, untracked/untethered body may be compacted. */
export function isReclaimableResourceBody(record, opts = {}) {
  if (!record || !isFullyRecoveredResourceBody(record)) return false;
  if (record.playerModified === true || record.missionOwned === true || record.tracked === true) return false;
  if (record.tethered === true || record.displaced === true) return false;
  if (record.retentionClass === RESOURCE_BODY_RETENTION_CLASS.PROTECTED) return false;
  if (opts.fieldMayRegenerate === false) return false;
  return true;
}

export function stableResourceBodyId(seed, sectorId, fieldId, slotId) {
  const h = hash32(
    seed >>> 0 || 1,
    'rb',
    String(sectorId || ''),
    String(fieldId || ''),
    String(slotId || ''),
  );
  return `rb_${(h >>> 0).toString(16)}`;
}

export function resourceBodyIdentityKey(sectorId, fieldId, slotId, sourceSeed) {
  return [sectorId || '', fieldId || '', slotId || '', sourceSeed != null ? sourceSeed : ''].join(':');
}

export function normalizeResourceBodyRecord(raw, fallbackId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const sectorId = raw.sectorId != null ? String(raw.sectorId) : '';
  const fieldId = raw.fieldId != null ? String(raw.fieldId) : '';
  const slotId = raw.slotId != null ? String(raw.slotId) : (raw.activityObjectSlotId != null
    ? String(raw.activityObjectSlotId)
    : '');
  if (!sectorId || !fieldId || !slotId) return null;
  if (!finiteXZ(raw.pos)) return null;
  const recordId = typeof raw.recordId === 'string' && raw.recordId
    ? raw.recordId
    : (typeof fallbackId === 'string' && fallbackId ? fallbackId : null);
  if (!recordId) return null;
  const extra = {};
  const known = new Set([
    'recordId', 'sectorId', 'fieldId', 'slotId', 'activityObjectSlotId', 'sourceSeed',
    'pos', 'vel', 'rot', 'angVel', 'oreHp', 'oreHP', 'oreHpMax', 'oreHPMax', 'yieldU', 'yieldRemainingU', 'yieldMaxU',
    'pctEjected', '_oreCarry',
    'seamState', 'fractureState', 'fragmentsRemaining', 'bulkCoreState', 'lastMinedT',
    'lastObservedT', 'depletedAtT', 'recoveryPolicy', 'tethered', 'displaced',
    'missionOwned', 'tracked', 'outcome', 'revision', 'identityKey', 'playerModified',
    'retentionClass', 'extra',
  ]);
  if (raw.extra && typeof raw.extra === 'object' && !Array.isArray(raw.extra)) {
    const nested = clonePlain(raw.extra) || {};
    for (const key of Object.keys(nested)) extra[key] = nested[key];
  }
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) extra[key] = clonePlain(raw[key]);
  }
  return {
    recordId,
    sectorId,
    fieldId,
    slotId,
    sourceSeed: raw.sourceSeed != null ? raw.sourceSeed : null,
    identityKey: raw.identityKey != null
      ? String(raw.identityKey)
      : resourceBodyIdentityKey(sectorId, fieldId, slotId, raw.sourceSeed),
    pos: cloneXZ(raw.pos),
    vel: finiteXZ(raw.vel) ? cloneXZ(raw.vel) : { x: 0, z: 0 },
    rot: Number.isFinite(raw.rot) ? raw.rot : 0,
    angVel: Number.isFinite(raw.angVel) ? raw.angVel : 0,
    oreHp: Number.isFinite(raw.oreHp) ? raw.oreHp
      : (Number.isFinite(raw.oreHP) ? raw.oreHP : null),
    oreHpMax: Number.isFinite(raw.oreHpMax) ? raw.oreHpMax
      : (Number.isFinite(raw.oreHPMax) ? raw.oreHPMax : null),
    yieldU: Number.isFinite(raw.yieldU) ? raw.yieldU : null,
    yieldRemainingU: Number.isFinite(raw.yieldRemainingU) ? raw.yieldRemainingU : null,
    yieldMaxU: Number.isFinite(raw.yieldMaxU) ? raw.yieldMaxU : null,
    pctEjected: Number.isFinite(raw.pctEjected) ? Math.max(0, Math.min(1, raw.pctEjected)) : null,
    _oreCarry: Number.isFinite(raw._oreCarry) ? Math.max(0, raw._oreCarry) : null,
    seamState: raw.seamState != null ? clonePlain(raw.seamState) : null,
    fractureState: raw.fractureState != null ? clonePlain(raw.fractureState) : null,
    fragmentsRemaining: Number.isFinite(raw.fragmentsRemaining) ? raw.fragmentsRemaining : null,
    bulkCoreState: raw.bulkCoreState != null ? clonePlain(raw.bulkCoreState) : null,
    lastMinedT: Number.isFinite(raw.lastMinedT) ? raw.lastMinedT : 0,
    lastObservedT: Number.isFinite(raw.lastObservedT) ? raw.lastObservedT : 0,
    depletedAtT: Number.isFinite(raw.depletedAtT) ? raw.depletedAtT : null,
    recoveryPolicy: raw.recoveryPolicy && typeof raw.recoveryPolicy === 'object'
      ? clonePlain(raw.recoveryPolicy)
      : { oreRate: 0, yieldRate: 0 },
    tethered: !!raw.tethered,
    displaced: !!raw.displaced,
    playerModified: raw.playerModified === true || inferredMiningModification(raw),
    missionOwned: raw.missionOwned === true || raw.missionId != null || raw.jobId != null,
    tracked: raw.tracked === true || raw.scannedAndTracked === true,
    outcome: raw.outcome === 'depleted' || raw.outcome === 'destroyed' ? raw.outcome : 'active',
    revision: Number.isFinite(raw.revision) ? Math.max(0, Math.floor(raw.revision)) : 1,
    retentionClass: deriveResourceBodyRetentionClass(raw),
    extra,
  };
}

export function normalizeResourceBodyBag(input) {
  const bag = createEmptyResourceBodyBag();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bag;
  if (Array.isArray(input.retirementReceipts)) {
    bag.retirementReceipts = input.retirementReceipts
      .map((entry) => clonePlain(entry))
      .filter((entry) => entry && typeof entry === 'object')
      .slice(-MAX_RESOURCE_RETIREMENT_RECEIPTS);
  }
  if (input.retentionReport && typeof input.retentionReport === 'object'
    && !Array.isArray(input.retentionReport)) {
    bag.retentionReport = clonePlain(input.retentionReport) || {};
  }
  const src = input.byId && typeof input.byId === 'object' && !Array.isArray(input.byId)
    ? input.byId
    : null;
  if (!src) return bag;
  for (const id of Object.keys(src).sort()) {
    const rec = normalizeResourceBodyRecord(src[id], id);
    if (rec) bag.byId[rec.recordId] = rec;
  }
  return bag;
}

export function serializeResourceBodyBag(bag) {
  const normalized = normalizeResourceBodyBag(bag);
  const byId = {};
  for (const id of Object.keys(normalized.byId).sort()) byId[id] = normalized.byId[id];
  const serialized = {
    schemaId: RESOURCE_BODY_SCHEMA_ID,
    schemaVersion: RESOURCE_BODY_SCHEMA_VERSION,
    byId,
  };
  // Keep old save envelopes byte-compatible when no retirement transaction has occurred, while
  // retaining receipts once a body has actually been compacted.
  if (normalized.retirementReceipts && normalized.retirementReceipts.length > 0) {
    serialized.retirementReceipts = normalized.retirementReceipts.slice(-MAX_RESOURCE_RETIREMENT_RECEIPTS);
  }
  return serialized;
}

export function deserializeResourceBodyBag(data) {
  return normalizeResourceBodyBag(data);
}

export function captureResourceBodyRecord(entity, opts = {}) {
  if (!entity || entity.type !== 'asteroid') return null;
  const d = entity.data || {};
  const sectorId = opts.sectorId || d.homeSectorId || d.sectorId || null;
  const fieldId = opts.fieldId || d.fieldId || null;
  const slotId = opts.slotId || d.activityObjectSlotId || d.slotId || d.asteroidSlotId || null;
  if (!sectorId || !fieldId || !slotId) return null;
  const seed = opts.seed != null ? opts.seed : 1;
  const existing = d.resourceBodyId || opts.recordId || null;
  const recordId = existing || stableResourceBodyId(seed, sectorId, fieldId, slotId);
  const previous = opts.previousRecord
    || opts.existingRecord
    || (opts.resourceBag && opts.resourceBag.byId && existing ? opts.resourceBag.byId[existing] : null)
    || null;
  const oreHp = entity.oreHp != null ? entity.oreHp
    : (d.oreHp != null ? d.oreHp : (d.oreHP != null ? d.oreHP : previous && previous.oreHp));
  const oreHpMax = entity.oreHpMax != null ? entity.oreHpMax
    : (d.oreHpMax != null ? d.oreHpMax : (d.oreHPMax != null ? d.oreHPMax : previous && previous.oreHpMax));
  const yieldU = entity.yieldU != null ? entity.yieldU : (d.yieldU != null ? d.yieldU : previous && previous.yieldU);
  const yieldRemainingU = d.yieldRemainingU != null ? d.yieldRemainingU : previous && previous.yieldRemainingU;
  const yieldMaxU = d.yieldMaxU != null ? d.yieldMaxU : previous && previous.yieldMaxU;
  const pctEjected = d.pctEjected != null ? d.pctEjected : (previous && previous.pctEjected);
  const oreCarry = d._oreCarry != null ? d._oreCarry : (previous && previous._oreCarry);
  const recoveryPolicy = opts.recoveryPolicy !== undefined
    ? opts.recoveryPolicy
    : (d.recoveryPolicy !== undefined
      ? d.recoveryPolicy
      : (previous && previous.recoveryPolicy) || {
        oreRate: 0,
        yieldRate: 0,
        respawnSec: Number.isFinite(d.respawnSec) ? d.respawnSec : null,
        recoverDepleted: false,
      });
  const depleted = d.depleted === true || d.depletedAtT != null
    || (entity.alive !== false && Number.isFinite(oreHp) && oreHp <= 0)
    || (entity.alive !== false && Number.isFinite(yieldRemainingU) && yieldRemainingU <= 0);
  const destroyed = d.destroyed === true || (entity.alive === false && !depleted);
  const tethered = (opts.clearTethered !== true && previous && previous.tethered === true)
    || !!(entity.flags && entity.flags.tethered) || !!d.tethered;
  const displaced = (opts.clearDisplaced !== true && previous && previous.displaced === true)
    || !!d.displaced;
  const missionOwned = opts.missionOwned === true || d.missionOwned === true
    || d.missionId != null || d.jobId != null || previous && previous.missionOwned === true;
  const tracked = opts.tracked === true || d.tracked === true || d.scannedAndTracked === true
    || previous && previous.tracked === true;
  const modifiedEvidence = {
    ...d,
    oreHp,
    oreHpMax,
    yieldRemainingU,
    yieldMaxU,
    pctEjected,
    _oreCarry: oreCarry,
    tethered,
    displaced,
    missionOwned,
    tracked,
    outcome: destroyed ? 'destroyed' : (depleted ? 'depleted' : 'active'),
  };
  // Capture is an observation seam, not proof of mining. Only explicit mining/depletion or
  // changed resource fields marks the durable body as player-modified.
  const playerModified = opts.playerModified === true
    || previous && previous.playerModified === true
    || d.playerModified === true
    || inferredMiningModification(modifiedEvidence);
  const retentionClass = deriveResourceBodyRetentionClass({
    ...modifiedEvidence,
    playerModified,
    retentionClass: opts.retentionClass,
  });
  return normalizeResourceBodyRecord({
    recordId,
    sectorId,
    fieldId,
    slotId,
    sourceSeed: d.sourceSeed != null ? d.sourceSeed : d.seed,
    pos: entity.pos,
    vel: entity.vel,
    rot: entity.rot,
    angVel: entity.angVel,
    oreHp,
    oreHpMax,
    yieldU,
    yieldRemainingU,
    yieldMaxU,
    pctEjected,
    _oreCarry: oreCarry,
    seamState: d.seams || d.seamState,
    fractureState: d.fractureState,
    fragmentsRemaining: d.fragmentsRemaining,
    bulkCoreState: d.bulkCoreState,
    // A save observation is not necessarily a mining event. Preserve a previously recorded
    // mining timestamp when present, while advancing the observation watermark to this capture.
    lastMinedT: Number.isFinite(d.lastMinedT) ? d.lastMinedT : (Number.isFinite(opts.simTime) ? opts.simTime : 0),
    lastObservedT: Number.isFinite(opts.simTime)
      ? opts.simTime
      : (Number.isFinite(d.lastObservedT) ? d.lastObservedT : 0),
    depletedAtT: d.depletedAtT,
    recoveryPolicy,
    tethered,
    displaced,
    missionOwned,
    tracked,
    playerModified,
    retentionClass,
    outcome: destroyed ? 'destroyed' : (depleted ? 'depleted' : 'active'),
    revision: opts.revision,
  });
}

export function upsertResourceBody(bag, record, opts = {}) {
  const b = bag && bag.byId ? bag : createEmptyResourceBodyBag();
  if (!b.byId) b.byId = {};
  const prior = record && record.recordId ? b.byId[record.recordId] : null;
  const merged = prior && record && typeof record === 'object'
    ? {
      ...prior,
      ...record,
      // No ordinary observation may erase a known modification/protected identity marker.
      playerModified: prior.playerModified === true || record.playerModified === true,
      missionOwned: prior.missionOwned === true || record.missionOwned === true,
      tracked: prior.tracked === true || record.tracked === true,
    }
    : record;
  const rec = normalizeResourceBodyRecord(merged);
  if (!rec) return null;
  b.byId[rec.recordId] = rec;
  enforceBound(b, opts);
  return rec;
}

function enforceBound(bag, opts = {}) {
  const ids = Object.keys(bag.byId);
  const before = ids.map((id) => bag.byId[id]).filter(Boolean);
  if (before.length <= MAX_RESOURCE_BODIES && !bag.retentionReport) return;
  const ranked = before.filter((record) => isReclaimableResourceBody(record, {
    fieldMayRegenerate: opts.fieldMayRegenerate !== false,
  })).sort((a, b) => {
    const ta = Number(a.lastObservedT) || 0;
    const tb = Number(b.lastObservedT) || 0;
    if (ta !== tb) return ta - tb;
    return a.recordId < b.recordId ? -1 : (a.recordId > b.recordId ? 1 : 0);
  });
  const required = Math.max(0, before.length - MAX_RESOURCE_BODIES);
  let retired = 0;
  if (required > 0 && opts.authoritativeRetirement === true && ranked.length > 0) {
    const result = compactResourceBodyRecords(bag, {
      ...opts,
      authoritativeRetirement: true,
      targetCount: MAX_RESOURCE_BODIES,
      fieldMayRegenerate: opts.fieldMayRegenerate !== false,
    });
    retired = result.retired;
  }
  const after = Object.values(bag.byId).filter(Boolean);
  const protectedCount = after.filter((record) => !isReclaimableResourceBody(record, {
    fieldMayRegenerate: true,
  })).length;
  const reclaimableCount = after.length - protectedCount;
  const report = ensureResourceRetentionReport(bag);
  report.total = after.length;
  report.limit = MAX_RESOURCE_BODIES;
  report.reclaimable = reclaimableCount;
  report.protected = protectedCount;
  report.retiredRecent = retired;
  report.protectedOverflow = Math.max(0, after.length - MAX_RESOURCE_BODIES);
}

export function shouldGarbageCollectResourceBody(record, opts = {}) {
  return isReclaimableResourceBody(record, opts) && opts.fieldMayRegenerate === true;
}

function ensureResourceRetentionReport(bag) {
  if (!bag.retentionReport || typeof bag.retentionReport !== 'object'
    || Array.isArray(bag.retentionReport)) bag.retentionReport = {};
  return bag.retentionReport;
}

function retirementBlockReason(record) {
  if (!record) return 'missing';
  if (record.playerModified === true) return 'player-modified';
  if (record.missionOwned === true) return 'mission-owned';
  if (record.tracked === true) return 'tracked';
  if (record.tethered === true) return 'tethered';
  if (record.displaced === true) return 'displaced';
  if (record.outcome === 'destroyed') return 'destroyed';
  if (record.outcome === 'depleted') return 'depleted';
  if (!isFullyRecoveredResourceBody(record)) return 'not-recovered';
  return null;
}

function recoveredUnitsForReceipt(record) {
  for (const key of ['yieldMaxU', 'yieldU', 'oreHpMax', 'oreHp']) {
    if (Number.isFinite(record && record[key])) return Math.max(0, record[key]);
  }
  return 0;
}

function appendBounded(list, value, limit) {
  if (!Array.isArray(list)) return [value];
  list.push(value);
  if (list.length > limit) list.splice(0, list.length - limit);
  return list;
}

function foldRetirementIntoFieldDepletion(fieldDepletion, record, receipt, opts = {}) {
  if (typeof opts.foldIntoFieldRecipe === 'function') {
    opts.foldIntoFieldRecipe(record, receipt, fieldDepletion);
  }
  if (!fieldDepletion || typeof fieldDepletion !== 'object' || Array.isArray(fieldDepletion)) return;
  if (!fieldDepletion.fields || typeof fieldDepletion.fields !== 'object'
    || Array.isArray(fieldDepletion.fields)) fieldDepletion.fields = {};
  const field = fieldDepletion.fields[record.fieldId]
    && typeof fieldDepletion.fields[record.fieldId] === 'object'
    ? fieldDepletion.fields[record.fieldId]
    : {
      fieldId: record.fieldId,
      sectorId: record.sectorId || null,
      extractedU: 0,
      destroyedCount: 0,
      depletion: 0,
      richnessMult: 1,
      lastChangedT: receipt.simTime,
    };
  field.fieldId = record.fieldId;
  if (!field.sectorId) field.sectorId = record.sectorId || null;
  if (!Number.isFinite(field.extractedU)) field.extractedU = 0;
  if (!Number.isFinite(field.destroyedCount)) field.destroyedCount = 0;
  if (!Number.isFinite(field.depletion)) field.depletion = 0;
  if (!Number.isFinite(field.richnessMult)) field.richnessMult = 1;
  if (!Number.isFinite(field.lastChangedT)) field.lastChangedT = receipt.simTime;
  fieldDepletion.fields[record.fieldId] = field;
  if (!Array.isArray(fieldDepletion.receipts)) fieldDepletion.receipts = [];
  // The recovered body's state is already represented by the authored field recipe. The
  // transaction receipt is the durable hand-off; do not fabricate extraction/depletion deltas.
  appendBounded(fieldDepletion.receipts, {
    ...receipt,
    event: 'resource_body_retired',
    fieldId: record.fieldId,
  }, 24);
}

/**
 * Authoritatively fold one fully recovered ordinary body back into the aggregate field recipe.
 * No caller without explicit authority can delete a ledger identity.
 */
export function retireResourceBody(bag, recordId, opts = {}) {
  if (!bag || !bag.byId || !recordId) return { retired: false, reason: 'missing' };
  if (opts.authoritativeRetirement !== true) return { retired: false, reason: 'authority-required' };
  const record = bag.byId[recordId];
  const blocked = retirementBlockReason(record);
  if (blocked) return { retired: false, reason: blocked, record };
  if (!isReclaimableResourceBody(record, {
    fieldMayRegenerate: opts.fieldMayRegenerate !== false,
  })) {
    return { retired: false, reason: 'protected', record };
  }
  const simTime = Number.isFinite(opts.simTime)
    ? opts.simTime
    : (Number.isFinite(record.lastObservedT) ? record.lastObservedT : 0);
  const receipt = {
    receiptId: `rb-retire:${record.recordId}:${Math.max(0, Math.floor(record.revision || 1))}`,
    event: 'resource_body_retired',
    reason: opts.reason || 'field_compaction',
    recordId: record.recordId,
    sectorId: record.sectorId,
    fieldId: record.fieldId,
    slotId: record.slotId,
    restoredU: recoveredUnitsForReceipt(record),
    simTime,
    tick: Math.max(0, Math.floor(Number.isFinite(opts.tick) ? opts.tick : 0)),
  };
  const fieldDepletion = opts.fieldDepletion
    || opts.state && opts.state.fieldDepletion
    || null;
  foldRetirementIntoFieldDepletion(fieldDepletion, record, receipt, opts);
  bag.retirementReceipts = appendBounded(
    Array.isArray(bag.retirementReceipts) ? bag.retirementReceipts : [],
    receipt,
    MAX_RESOURCE_RETIREMENT_RECEIPTS,
  );
  delete bag.byId[record.recordId];
  return { retired: true, record, receipt };
}

/** Compact deterministic reclaimable bodies; protected identities are reported, never evicted. */
export function compactResourceBodyRecords(bag, opts = {}) {
  if (!bag || !bag.byId) return { retired: 0, protected: 0, receipts: [] };
  const candidates = Object.values(bag.byId).filter((record) => isReclaimableResourceBody(record, {
    fieldMayRegenerate: opts.fieldMayRegenerate !== false,
  })).sort((a, b) => {
    const ta = Number(a.lastObservedT) || 0;
    const tb = Number(b.lastObservedT) || 0;
    if (ta !== tb) return ta - tb;
    return a.recordId < b.recordId ? -1 : (a.recordId > b.recordId ? 1 : 0);
  });
  const targetCount = Number.isFinite(opts.targetCount)
    ? Math.max(0, Math.floor(opts.targetCount))
    : null;
  const needed = targetCount == null ? candidates.length
    : Math.max(0, Object.keys(bag.byId).length - targetCount);
  const receipts = [];
  let retired = 0;
  for (let i = 0; i < candidates.length && retired < needed; i++) {
    const result = retireResourceBody(bag, candidates[i].recordId, opts);
    if (!result.retired) continue;
    retired++;
    receipts.push(result.receipt);
  }
  const report = ensureResourceRetentionReport(bag);
  const remaining = Object.values(bag.byId).filter(Boolean);
  report.total = remaining.length;
  report.limit = MAX_RESOURCE_BODIES;
  report.reclaimable = remaining.filter((record) => isReclaimableResourceBody(record, {
    fieldMayRegenerate: true,
  })).length;
  report.protected = remaining.length - report.reclaimable;
  report.retiredRecent = retired;
  report.protectedOverflow = Math.max(0, remaining.length - MAX_RESOURCE_BODIES);
  return { retired, protected: report.protected, receipts };
}

export function findResourceBodyForEntity(bag, entity) {
  const d = entity && entity.data || {};
  const sectorId = entity && (entity.homeSectorId || d.homeSectorId || d.sectorId);
  const fieldId = d.fieldId;
  const slotId = d.activityObjectSlotId || d.asteroidSlotId || d.slotId;
  if (!bag || !bag.byId || !sectorId || !fieldId || slotId == null || slotId === '') return null;
  const key = resourceBodyIdentityKey(sectorId, fieldId, slotId, d.sourceSeed);
  const ids = Object.keys(bag.byId).sort();
  for (const id of ids) {
    const rec = bag.byId[id];
    if (!rec) continue;
    if (rec.identityKey === key) return rec;
    if (rec.sectorId === String(sectorId) && rec.fieldId === String(fieldId) && rec.slotId === String(slotId)) {
      return rec;
    }
  }
  return null;
}

export function applyResourceBodyToEntity(entity, record) {
  if (!entity || !record) return entity;
  const d = entity.data || (entity.data = {});
  if (Number.isFinite(record.oreHp)) {
    d.oreHP = record.oreHp;
    entity.hull = record.oreHp;
  }
  if (Number.isFinite(record.oreHpMax)) {
    d.oreHPMax = record.oreHpMax;
    entity.hullMax = record.oreHpMax;
  }
  if (Number.isFinite(record.yieldU)) d.yieldU = record.yieldU;
  if (Number.isFinite(record.yieldRemainingU)) d.yieldRemainingU = record.yieldRemainingU;
  if (Number.isFinite(record.yieldMaxU)) d.yieldMaxU = record.yieldMaxU;
  if (Number.isFinite(record.pctEjected)) d.pctEjected = record.pctEjected;
  if (Number.isFinite(record._oreCarry)) d._oreCarry = record._oreCarry;
  if (record.seamState != null) d.seams = clonePlain(record.seamState);
  if (record.fractureState != null) d.fractureState = clonePlain(record.fractureState);
  if (Number.isFinite(record.fragmentsRemaining)) d.fragmentsRemaining = record.fragmentsRemaining;
  if (record.bulkCoreState != null) d.bulkCoreState = clonePlain(record.bulkCoreState);
  if (Number.isFinite(record.lastMinedT)) d.lastMinedT = record.lastMinedT;
  if (Number.isFinite(record.lastObservedT)) d.lastObservedT = record.lastObservedT;
  if (record.depletedAtT != null) d.depletedAtT = record.depletedAtT;
  else if (record.outcome === 'active') delete d.depletedAtT;
  if (record.recoveryPolicy != null) d.recoveryPolicy = clonePlain(record.recoveryPolicy);
  d.depleted = record.outcome === 'depleted';
  d.destroyed = record.outcome === 'destroyed';
  d.displaced = record.displaced === true;
  d.tethered = record.tethered === true;
  if (entity.flags && typeof entity.flags === 'object') entity.flags.tethered = record.tethered === true;
  if (record.outcome === 'destroyed' || record.outcome === 'depleted') entity.alive = false;
  else if (record.outcome === 'active') {
    entity.alive = true;
    delete d.respawnAt;
  }
  if (record.pos && entity.pos) {
    entity.pos.x = record.pos.x;
    entity.pos.z = record.pos.z;
  }
  if (record.vel) {
    entity.vel = entity.vel || { x: 0, z: 0 };
    entity.vel.x = record.vel.x;
    entity.vel.z = record.vel.z;
  }
  if (Number.isFinite(record.rot)) entity.rot = record.rot;
  if (Number.isFinite(record.angVel)) entity.angVel = record.angVel;
  d.resourceBodyId = record.recordId;
  d.playerModified = record.playerModified === true;
  d.missionOwned = record.missionOwned === true;
  d.tracked = record.tracked === true;
  return entity;
}

export function ensureResourceBodies(world) {
  if (!world || typeof world !== 'object') return createEmptyResourceBodyBag();
  if (!world.resourceBodies || typeof world.resourceBodies !== 'object' || Array.isArray(world.resourceBodies)) {
    world.resourceBodies = createEmptyResourceBodyBag();
  } else {
    world.resourceBodies = normalizeResourceBodyBag(world.resourceBodies);
  }
  return world.resourceBodies;
}
