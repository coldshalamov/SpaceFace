// Bounded durable ledger for player-touched resource bodies (asteroids).
// Aggregate belt memory stays in fieldDepletion. This answers "is this the
// same rock and what remains in it?"

import { hash32 } from '../core/rng.js';

export const RESOURCE_BODY_SCHEMA_ID = 'spaceface.resourceBodyRecords.v2';
export const RESOURCE_BODY_SCHEMA_VERSION = 2;
export const MAX_RESOURCE_BODIES = 256;

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
    'pos', 'vel', 'rot', 'angVel', 'oreHp', 'oreHpMax', 'yieldU', 'yieldRemainingU', 'yieldMaxU',
    'pctEjected', '_oreCarry',
    'seamState', 'fractureState', 'fragmentsRemaining', 'bulkCoreState', 'lastMinedT',
    'lastObservedT', 'depletedAtT', 'recoveryPolicy', 'tethered', 'displaced',
    'outcome', 'revision', 'identityKey', 'playerModified', 'extra',
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
    oreHp: Number.isFinite(raw.oreHp) ? raw.oreHp : null,
    oreHpMax: Number.isFinite(raw.oreHpMax) ? raw.oreHpMax : null,
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
    playerModified: !!raw.playerModified,
    outcome: raw.outcome === 'depleted' || raw.outcome === 'destroyed' ? raw.outcome : 'active',
    revision: Number.isFinite(raw.revision) ? Math.max(0, Math.floor(raw.revision)) : 1,
    extra,
  };
}

export function normalizeResourceBodyBag(input) {
  const bag = createEmptyResourceBodyBag();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bag;
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
  return {
    schemaId: RESOURCE_BODY_SCHEMA_ID,
    schemaVersion: RESOURCE_BODY_SCHEMA_VERSION,
    byId,
  };
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
    tethered: !!(entity.flags && entity.flags.tethered) || !!d.tethered,
    displaced: !!d.displaced,
    playerModified: true,
    outcome: destroyed ? 'destroyed' : (depleted ? 'depleted' : 'active'),
    revision: opts.revision,
  });
}

export function upsertResourceBody(bag, record, opts = {}) {
  const b = bag && bag.byId ? bag : createEmptyResourceBodyBag();
  if (!b.byId) b.byId = {};
  const rec = normalizeResourceBodyRecord(record);
  if (!rec) return null;
  b.byId[rec.recordId] = rec;
  enforceBound(b, opts);
  return rec;
}

function enforceBound(bag, opts = {}) {
  const ids = Object.keys(bag.byId);
  if (ids.length <= MAX_RESOURCE_BODIES) return;
  const ranked = ids.map((id) => bag.byId[id]).sort((a, b) => {
    const ta = Number(a.lastObservedT) || 0;
    const tb = Number(b.lastObservedT) || 0;
    if (ta !== tb) return ta - tb;
    return a.recordId < b.recordId ? -1 : 1;
  });
  const drop = ids.length - MAX_RESOURCE_BODIES;
  let removed = 0;
  for (let i = 0; i < ranked.length && removed < drop; i++) {
    const rec = ranked[i];
    if (rec.tethered || rec.displaced) continue;
    if (rec.outcome === 'destroyed' || rec.outcome === 'depleted') continue;
    if (rec.playerModified && opts.authoritativeRetirement !== true) continue;
    delete bag.byId[rec.recordId];
    removed += 1;
  }
}

export function shouldGarbageCollectResourceBody(record, opts = {}) {
  if (!record) return false;
  if (record.playerModified && opts.authoritativeRetirement !== true) return false;
  if (record.tethered || record.displaced) return false;
  if (record.outcome === 'destroyed') return false;
  if (record.outcome === 'depleted' && opts.allowDepletedGc !== true) return false;
  if (opts.missionOwned === true || opts.tracked === true) return false;
  const recovered = record.oreHpMax != null
    && Number.isFinite(record.oreHp)
    && record.oreHp >= record.oreHpMax - 1e-6;
  return recovered === true && opts.fieldMayRegenerate === true;
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
