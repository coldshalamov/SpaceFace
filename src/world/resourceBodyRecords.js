// Bounded durable ledger for player-touched resource bodies (asteroids).
// Aggregate belt memory stays in fieldDepletion. This answers "is this the
// same rock and what remains in it?"

import { hash32 } from '../core/rng.js';

export const RESOURCE_BODY_SCHEMA_ID = 'spaceface.resourceBodyRecords.v1';
export const RESOURCE_BODY_SCHEMA_VERSION = 1;
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
    'pos', 'vel', 'rot', 'angVel', 'oreHp', 'oreHpMax', 'yieldRemainingU', 'yieldMaxU',
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
    yieldRemainingU: Number.isFinite(raw.yieldRemainingU) ? raw.yieldRemainingU : null,
    yieldMaxU: Number.isFinite(raw.yieldMaxU) ? raw.yieldMaxU : null,
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
    oreHp: entity.oreHp != null ? entity.oreHp : d.oreHp,
    oreHpMax: entity.oreHpMax != null ? entity.oreHpMax : d.oreHpMax,
    yieldRemainingU: d.yieldRemainingU,
    yieldMaxU: d.yieldMaxU,
    seamState: d.seams || d.seamState,
    fractureState: d.fractureState,
    fragmentsRemaining: d.fragmentsRemaining,
    bulkCoreState: d.bulkCoreState,
    lastMinedT: opts.simTime,
    lastObservedT: opts.simTime,
    depletedAtT: d.depletedAtT,
    recoveryPolicy: opts.recoveryPolicy,
    tethered: !!(entity.flags && entity.flags.tethered) || !!d.tethered,
    displaced: !!d.displaced,
    playerModified: true,
    outcome: entity.alive === false ? 'destroyed' : 'active',
    revision: opts.revision,
  });
}

export function upsertResourceBody(bag, record) {
  const b = bag && bag.byId ? bag : createEmptyResourceBodyBag();
  if (!b.byId) b.byId = {};
  const rec = normalizeResourceBodyRecord(record);
  if (!rec) return null;
  b.byId[rec.recordId] = rec;
  enforceBound(b);
  return rec;
}

function enforceBound(bag) {
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
    delete bag.byId[rec.recordId];
    removed += 1;
  }
}

export function shouldGarbageCollectResourceBody(record, opts = {}) {
  if (!record) return false;
  if (record.tethered || record.displaced) return false;
  if (record.outcome === 'destroyed') return false;
  if (opts.missionOwned === true || opts.tracked === true) return false;
  const recovered = record.oreHpMax != null
    && Number.isFinite(record.oreHp)
    && record.oreHp >= record.oreHpMax - 1e-6;
  return recovered === true && opts.fieldMayRegenerate === true;
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
