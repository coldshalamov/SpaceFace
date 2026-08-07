// Pure durable world-entity record schema + rematerialization helpers (M2-C2).
//
// Owned exclusively by systems/world.js for capture on demote and rematerialize on promote.
// Not a second world authority — residency tiers and live bags remain world-owned.
//
// Determinism: stable record IDs from hash32(seed, tags); no Math.random; positions are
// galactic-global XZ (global_v1). Runtime-only liveEntityId is never serialized.

import { hash32 } from '../core/rng.js';

export const WORLD_RECORDS_SCHEMA_ID = 'spaceface.worldRecords.v1';
export const WORLD_RECORDS_SCHEMA_VERSION = 1;

/** Durable entity kinds persisted under world.records. */
export const RECORD_KIND = Object.freeze({
  CONVOY: 'convoy',
  NPC: 'npc',
  MISSION_TARGET: 'mission_target',
  WRECK: 'wreck',
  AFTERMATH: 'aftermath',
});

const DURABLE_KINDS = new Set(Object.values(RECORD_KIND));

/** Max durable records retained per sector (evict oldest by lastSeenTick). */
export const MAX_RECORDS_PER_SECTOR = 48;

/** Quantize global XZ for identity keys without floating noise. */
export function quantizeGlobal(n, quantum = 4) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / quantum) * quantum;
}

/**
 * Stable deterministic record id. Never depends on live entity ids.
 * @param {number|string} seed
 * @param {string} sectorId
 * @param {string} kind
 * @param {string|number} key
 */
export function stableRecordId(seed, sectorId, kind, key) {
  const h = hash32(seed >>> 0 || 1, 'wr', String(sectorId || ''), String(kind || ''), String(key || ''));
  return `wr_${kind || 'npc'}_${(h >>> 0).toString(16)}`;
}

/** Empty durable bag (disk + runtime). */
export function createEmptyRecordsBag() {
  return {
    schemaId: WORLD_RECORDS_SCHEMA_ID,
    schemaVersion: WORLD_RECORDS_SCHEMA_VERSION,
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

/**
 * Normalize a disk/runtime bag. Absent / corrupt → empty. Idempotent.
 * Strips runtime-only liveEntityId from records.
 */
export function normalizeRecordsBag(input) {
  const bag = createEmptyRecordsBag();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bag;
  const src = input.byId && typeof input.byId === 'object' && !Array.isArray(input.byId)
    ? input.byId
    : (typeof input === 'object' && !Array.isArray(input) && !input.schemaId ? input : null);
  if (!src) return bag;
  const ids = Object.keys(src).sort();
  for (const id of ids) {
    const rec = normalizeRecord(src[id], id);
    if (rec) bag.byId[rec.recordId] = rec;
  }
  return bag;
}

/**
 * @param {object} raw
 * @param {string} [fallbackId]
 * @returns {object|null}
 */
export function normalizeRecord(raw, fallbackId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const kind = DURABLE_KINDS.has(raw.kind) ? raw.kind : null;
  if (!kind) return null;
  const sectorId = raw.sectorId || raw.homeSectorId;
  if (!sectorId || typeof sectorId !== 'string') return null;
  const recordId = typeof raw.recordId === 'string' && raw.recordId
    ? raw.recordId
    : (typeof fallbackId === 'string' && fallbackId ? fallbackId : null);
  if (!recordId) return null;
  if (!finiteXZ(raw.pos)) return null;

  const rec = {
    recordId,
    kind,
    sectorId: String(sectorId),
    homeSectorId: String(raw.homeSectorId || sectorId),
    pos: cloneXZ(raw.pos),
    vel: finiteXZ(raw.vel) ? cloneXZ(raw.vel) : { x: 0, z: 0 },
    rot: Number.isFinite(raw.rot) ? raw.rot : 0,
    angVel: Number.isFinite(raw.angVel) ? raw.angVel : 0,
    // identity / spawn
    type: raw.type === 'wreck' || raw.type === 'fx' || raw.type === 'ship' ? raw.type : 'ship',
    enemyTypeId: raw.enemyTypeId || null,
    shipDefId: raw.shipDefId || raw.defId || null,
    factionId: raw.factionId || null,
    team: Number.isFinite(raw.team) ? raw.team : (kind === RECORD_KIND.CONVOY ? 2 : 1),
    level: Number.isFinite(raw.level) ? raw.level : 1,
    // vitals (outcome-preserving)
    hull: Number.isFinite(raw.hull) ? raw.hull : null,
    hullMax: Number.isFinite(raw.hullMax) ? raw.hullMax : null,
    shield: Number.isFinite(raw.shield) ? raw.shield : null,
    shieldMax: Number.isFinite(raw.shieldMax) ? raw.shieldMax : null,
    armorHp: Number.isFinite(raw.armorHp) ? raw.armorHp : null,
    armorMax: Number.isFinite(raw.armorMax) ? raw.armorMax : null,
    // outcome
    alive: raw.alive !== false,
    outcome: raw.outcome === 'defeated' || raw.outcome === 'destroyed' ? raw.outcome : 'active',
    // mission / convoy / wreck extras
    missionId: raw.missionId || null,
    trafficRole: raw.trafficRole || null,
    trafficLabel: raw.trafficLabel || null,
    itinerary: raw.itinerary && typeof raw.itinerary === 'object' ? clonePlain(raw.itinerary) : null,
    // A convoy's cargo is part of its durable identity: sector residency may replace the live
    // entity id, but it must never reroll what the player already scanned or reuse a delivered leg.
    cargoManifest: raw.cargoManifest && typeof raw.cargoManifest === 'object'
      && !Array.isArray(raw.cargoManifest)
      ? clonePlain(raw.cargoManifest)
      : null,
    freightDockSeq: Number.isFinite(raw.freightDockSeq)
      ? Math.max(0, Math.floor(raw.freightDockSeq))
      : null,
    wreckClass: raw.wreckClass || null,
    markerId: raw.markerId || null,
    victimClass: raw.victimClass || null,
    // ai / combat context (shallow)
    ai: raw.ai && typeof raw.ai === 'object' ? clonePlain(raw.ai) : null,
    isBoss: !!raw.isBoss,
    bossPoiId: raw.bossPoiId || null,
    bossSectorId: raw.bossSectorId || null,
    // bookkeeping
    epoch: Number.isFinite(raw.epoch) ? raw.epoch : 0,
    createdTick: Number.isFinite(raw.createdTick) ? raw.createdTick : 0,
    lastSeenTick: Number.isFinite(raw.lastSeenTick) ? raw.lastSeenTick : 0,
    durableReason: raw.durableReason || kind,
    // identity key used for re-derive (not live entity id)
    identityKey: raw.identityKey != null ? String(raw.identityKey) : null,
    // Optional provenance for bounded sectorSim recipe reconciliation.
    recordSource: raw.recordSource === 'sector_embodiment' ? 'sector_embodiment' : null,
    recipeKey: raw.recipeKey != null ? String(raw.recipeKey) : null,
  };
  return rec;
}

/** Disk serialization: durable only; sorted keys; no liveEntityId / frame / residency. */
export function serializeRecordsBag(bag) {
  const normalized = normalizeRecordsBag(bag);
  const byId = {};
  for (const id of Object.keys(normalized.byId).sort()) {
    const rec = normalized.byId[id];
    // Drop runtime-only fields if present.
    const { liveEntityId: _live, rematerializedTick: _rt, ...durable } = rec;
    byId[id] = durable;
  }
  return {
    schemaId: WORLD_RECORDS_SCHEMA_ID,
    schemaVersion: WORLD_RECORDS_SCHEMA_VERSION,
    byId,
  };
}

/** Deserialize disk overlay → runtime bag. */
export function deserializeRecordsBag(data) {
  return normalizeRecordsBag(data);
}

/** List records for a sector, deterministic order by recordId. */
export function recordsForSector(bag, sectorId) {
  const byId = bag && bag.byId ? bag.byId : {};
  const out = [];
  for (const id of Object.keys(byId).sort()) {
    const rec = byId[id];
    if (!rec) continue;
    if (rec.sectorId === sectorId || rec.homeSectorId === sectorId) out.push(rec);
  }
  return out;
}

/** Whether a record should produce a live entity at FULL rematerialize. */
export function recordShouldRematerialize(rec, tier) {
  if (!rec || rec.alive === false) return false;
  if (rec.outcome === 'defeated' || rec.outcome === 'destroyed') return false;
  // REDUCED: only mission targets + wreck markers (structural anchors come from authored data).
  if (tier === 'REDUCED') {
    return rec.kind === RECORD_KIND.MISSION_TARGET
      || rec.kind === RECORD_KIND.WRECK
      || rec.kind === RECORD_KIND.AFTERMATH;
  }
  // FULL: all active durable kinds.
  return true;
}

/**
 * Mission identity on an entity: missions spawn with data.missionTag; rematerialize
 * also stamps data.missionId / missionPinned. Treat either as the same contract id.
 */
export function missionIdentityOf(entityOrData) {
  if (!entityOrData) return null;
  const d = entityOrData.data != null ? entityOrData.data : entityOrData;
  if (!d || typeof d !== 'object') return null;
  const id = d.missionId || d.missionTag;
  return id != null && id !== '' ? String(id) : null;
}

/**
 * True if entity data/flags mark durable ownership (ignores alive — used on kill path).
 */
export function entityHasDurableMarkers(entity, playerId) {
  if (!entity) return false;
  if (entity.isPlayer || entity.id === playerId) return false;
  const explicitOwner = entity.data && entity.data.persistenceOwner;
  if (explicitOwner != null && explicitOwner !== 'worldRecords') return false;
  if (entity.type === 'station' && entity.data && entity.data.isGate) return false;
  if (entity.type === 'station' && entity.data && entity.data.stationId) return false;
  if (entity.type === 'asteroid') return false;
  if (entity.type === 'projectile' || entity.type === 'pickup' || entity.type === 'payload') return false;
  // Cosmetic dressing re-rolls with FULL extras.
  if (entity.type === 'fx' && entity.data && entity.data.worldDressing && !entity.data.poi) return false;

  const d = entity.data || {};
  const flags = entity.flags || {};
  if (flags.missionPinned || d.missionPinned || d.missionId || d.missionTag) return true;
  if (d.trafficRole || d.convoyId || d.itinerary) return true;
  if (entity.type === 'wreck' || d.wreckClass || d.markerId) return true;
  if (d.isBoss || d.worldRecordId) return true;
  // Ambient / zone combatants stamped with homeSectorId.
  if (entity.type === 'ship' && (entity.homeSectorId || d.homeSectorId)) return true;
  if (flags.durable || d.durable) return true;
  return false;
}

/**
 * Decide if a live entity is durable for world.records capture.
 * Structural stations/gates/asteroids re-derive from authored data — not recorded here.
 */
export function entityIsDurableCandidate(entity, playerId) {
  if (!entity || !entity.alive) return false;
  return entityHasDurableMarkers(entity, playerId);
}

/**
 * Classify durable kind for a live entity.
 */
export function classifyEntityKind(entity) {
  const d = entity && entity.data || {};
  if (entity.type === 'wreck' || d.wreckClass || d.markerId) {
    return d.markerId ? RECORD_KIND.AFTERMATH : RECORD_KIND.WRECK;
  }
  if (
    d.missionPinned
    || d.missionId
    || d.missionTag
    || (entity.flags && entity.flags.missionPinned)
  ) {
    return RECORD_KIND.MISSION_TARGET;
  }
  if (d.trafficRole || d.convoyId || d.itinerary) return RECORD_KIND.CONVOY;
  return RECORD_KIND.NPC;
}

/**
 * Build a durable record snapshot from a live entity.
 * Preserves existing data.worldRecordId when present (identity stability).
 */
export function captureEntityRecord(entity, opts = {}) {
  if (!entity) return null;
  if (entity.data && entity.data.persistenceOwner != null
    && entity.data.persistenceOwner !== 'worldRecords') return null;
  const sectorId = opts.sectorId
    || entity.homeSectorId
    || (entity.data && (entity.data.homeSectorId || entity.data.sectorId))
    || null;
  if (!sectorId) return null;
  const kind = opts.kind || classifyEntityKind(entity);
  const seed = opts.seed != null ? opts.seed : 1;
  const d = entity.data || {};
  const existingId = d.worldRecordId || opts.recordId || null;
  const missionId = missionIdentityOf(d);
  const identityKey = existingId
    || opts.identityKey
    || d.identityKey
    || [
      kind,
      d.lootTableId || d.enemyTypeId || d.defId || entity.type || 'x',
      quantizeGlobal(entity.pos && entity.pos.x),
      quantizeGlobal(entity.pos && entity.pos.z),
      missionId || d.trafficRole || d.markerId || '',
    ].join(':');
  const recordId = existingId || stableRecordId(seed, sectorId, kind, identityKey);
  const rec = normalizeRecord({
    recordId,
    kind,
    sectorId,
    homeSectorId: entity.homeSectorId || d.homeSectorId || sectorId,
    pos: entity.pos,
    vel: entity.vel,
    rot: entity.rot,
    angVel: entity.angVel,
    type: entity.type === 'wreck' || entity.type === 'fx' ? entity.type : 'ship',
    enemyTypeId: d.lootTableId || d.enemyTypeId || null,
    shipDefId: d.defId || null,
    factionId: entity.factionId || d.factionId || null,
    team: entity.team,
    level: d.level,
    hull: entity.hull,
    hullMax: entity.hullMax,
    shield: entity.shield,
    shieldMax: entity.shieldMax,
    armorHp: entity.armorHp,
    armorMax: entity.armorMax,
    alive: entity.alive !== false,
    outcome: entity.alive === false ? 'destroyed' : 'active',
    missionId: missionId || null,
    trafficRole: d.trafficRole || null,
    trafficLabel: d.trafficLabel || null,
    itinerary: d.itinerary || (opts.itinerary || null),
    cargoManifest: d.cargoManifest || null,
    freightDockSeq: Number.isFinite(d.freightDockSeq) ? d.freightDockSeq : null,
    wreckClass: d.wreckClass || null,
    markerId: d.markerId || null,
    victimClass: d.victimClass || null,
    ai: d.ai || null,
    isBoss: !!d.isBoss,
    bossPoiId: d.bossPoiId || null,
    bossSectorId: d.bossSectorId || null,
    epoch: opts.epoch || 0,
    createdTick: opts.createdTick != null ? opts.createdTick : (opts.tick || 0),
    lastSeenTick: opts.tick || 0,
    durableReason: opts.durableReason || kind,
    identityKey,
    recordSource: d.recordSource === 'sector_embodiment' ? 'sector_embodiment' : null,
    recipeKey: d.recipeKey != null ? String(d.recipeKey) : null,
  });
  return rec;
}

/**
 * Upsert into bag; enforce per-sector bound. Returns the stored record.
 */
export function upsertRecord(bag, record) {
  const b = bag && bag.byId ? bag : createEmptyRecordsBag();
  if (!b.byId) b.byId = {};
  const rec = normalizeRecord(record);
  if (!rec) return null;
  b.byId[rec.recordId] = rec;
  enforceSectorBound(b, rec.homeSectorId || rec.sectorId);
  return rec;
}

function enforceSectorBound(bag, sectorId) {
  const list = recordsForSector(bag, sectorId);
  if (list.length <= MAX_RECORDS_PER_SECTOR) return;
  // Drop oldest by lastSeenTick (then recordId) until under cap. Prefer keeping mission/aftermath.
  const ranked = list.slice().sort((a, b) => {
    const pa = kindPriority(a.kind);
    const pb = kindPriority(b.kind);
    if (pa !== pb) return pa - pb; // higher priority kept (sort ascending drop first)
    if (a.lastSeenTick !== b.lastSeenTick) return a.lastSeenTick - b.lastSeenTick;
    return a.recordId < b.recordId ? -1 : 1;
  });
  const dropCount = list.length - MAX_RECORDS_PER_SECTOR;
  for (let i = 0; i < dropCount; i++) {
    delete bag.byId[ranked[i].recordId];
  }
}

function kindPriority(kind) {
  // Lower number = drop first under pressure.
  if (kind === RECORD_KIND.NPC) return 0;
  if (kind === RECORD_KIND.CONVOY) return 1;
  if (kind === RECORD_KIND.WRECK) return 2;
  if (kind === RECORD_KIND.AFTERMATH) return 3;
  if (kind === RECORD_KIND.MISSION_TARGET) return 4;
  return 0;
}

/**
 * Mark a record as destroyed/defeated without removing identity.
 * If the bag lacks the id but opts.stub is provided, upserts the stub first.
 */
export function markRecordDestroyed(bag, recordId, opts = {}) {
  if (!bag || !bag.byId || !recordId) return null;
  let rec = bag.byId[recordId];
  if (!rec && opts.stub && typeof opts.stub === 'object') {
    const stub = normalizeRecord({ ...opts.stub, recordId, alive: false, outcome: opts.outcome || 'destroyed' });
    if (stub) {
      bag.byId[recordId] = stub;
      rec = stub;
    }
  }
  if (!rec) return null;
  rec.alive = false;
  // Prefer defeated over destroyed when already marked (boss path).
  if (rec.outcome !== 'defeated') {
    rec.outcome = opts.outcome || 'destroyed';
  }
  rec.lastSeenTick = opts.tick != null ? opts.tick : rec.lastSeenTick;
  if (finiteXZ(opts.pos)) rec.pos = cloneXZ(opts.pos);
  return rec;
}

/**
 * Build a minimal spawnEntity-compatible spec from a durable record.
 * World applies makeEnemySpawnSpec when enemyTypeId is present; this is the fallback path.
 */
export function spawnSpecFromRecord(record) {
  const rec = normalizeRecord(record);
  if (!rec || !recordShouldRematerialize(rec, 'FULL')) return null;

  if (rec.type === 'wreck' || rec.kind === RECORD_KIND.WRECK || rec.kind === RECORD_KIND.AFTERMATH) {
    return {
      type: 'wreck',
      factionId: rec.factionId,
      team: rec.team,
      pos: { x: rec.pos.x, z: rec.pos.z },
      rot: rec.rot || 0,
      radius: 18,
      mass: 50,
      hull: 1,
      hullMax: 1,
      collides: false,
      flags: { noInterp: true },
      data: {
        worldRecordId: rec.recordId,
        wreckClass: rec.wreckClass || 'battlefield',
        markerId: rec.markerId || null,
        victimClass: rec.victimClass || null,
        homeSectorId: rec.homeSectorId,
        sectorId: rec.sectorId,
        durable: true,
      },
    };
  }

  // Ship / NPC / convoy / mission target — world prefers makeEnemySpawnSpec; this is a shell.
  return {
    type: 'ship',
    factionId: rec.factionId,
    team: rec.team,
    pos: { x: rec.pos.x, z: rec.pos.z },
    vel: { x: rec.vel.x, z: rec.vel.z },
    rot: rec.rot || 0,
    angVel: rec.angVel || 0,
    hull: rec.hull != null ? rec.hull : 100,
    hullMax: rec.hullMax != null ? rec.hullMax : 100,
    shield: rec.shield != null ? rec.shield : 0,
    shieldMax: rec.shieldMax != null ? rec.shieldMax : 0,
    armorHp: rec.armorHp != null ? rec.armorHp : 0,
    armorMax: rec.armorMax != null ? rec.armorMax : 0,
    radius: 8,
    mass: 20,
    collides: true,
    data: {
      worldRecordId: rec.recordId,
      defId: rec.shipDefId || 'ship_kestrel',
      enemyTypeId: rec.enemyTypeId,
      lootTableId: rec.enemyTypeId,
      level: rec.level,
      missionId: rec.missionId,
      missionTag: rec.missionId, // missions match kills / adopt via missionTag
      missionPinned: rec.kind === RECORD_KIND.MISSION_TARGET,
      trafficRole: rec.trafficRole,
      trafficLabel: rec.trafficLabel,
      itinerary: rec.itinerary,
      cargoManifest: rec.cargoManifest,
      freightDockSeq: rec.freightDockSeq,
      ai: rec.ai || { archetype: 'passive', passive: true },
      isBoss: rec.isBoss,
      bossPoiId: rec.bossPoiId,
      bossSectorId: rec.bossSectorId,
      homeSectorId: rec.homeSectorId,
      sectorId: rec.sectorId,
      durable: true,
      identityKey: rec.identityKey,
      recordSource: rec.recordSource,
      recipeKey: rec.recipeKey,
    },
    flags: rec.kind === RECORD_KIND.MISSION_TARGET
      ? { missionPinned: true }
      : {},
  };
}

/**
 * Apply saved vitals onto a freshly spawned entity from a record (outcome preserve).
 */
export function applyRecordVitals(entity, record) {
  if (!entity || !record) return entity;
  if (Number.isFinite(record.hullMax)) entity.hullMax = record.hullMax;
  if (Number.isFinite(record.hull)) entity.hull = Math.min(record.hull, entity.hullMax != null ? entity.hullMax : record.hull);
  if (Number.isFinite(record.shieldMax)) entity.shieldMax = record.shieldMax;
  if (Number.isFinite(record.shield)) entity.shield = Math.min(record.shield, entity.shieldMax != null ? entity.shieldMax : record.shield);
  if (Number.isFinite(record.armorMax)) entity.armorMax = record.armorMax;
  if (Number.isFinite(record.armorHp)) entity.armorHp = Math.min(record.armorHp, entity.armorMax != null ? entity.armorMax : record.armorHp);
  if (finiteXZ(record.vel)) {
    entity.vel = entity.vel || { x: 0, z: 0 };
    entity.vel.x = record.vel.x;
    entity.vel.z = record.vel.z;
  }
  if (Number.isFinite(record.rot)) entity.rot = record.rot;
  if (Number.isFinite(record.angVel)) entity.angVel = record.angVel;
  return entity;
}

/**
 * True if any live entity already carries this worldRecordId (idempotent rematerialize).
 */
export function findLiveEntityForRecord(entityList, recordId) {
  if (!recordId || !entityList) return null;
  for (const e of entityList) {
    if (!e || !e.alive) continue;
    if (e.data && e.data.worldRecordId === recordId) return e;
  }
  return null;
}

/**
 * Bind live entity ↔ durable record (runtime stamp only).
 */
export function bindEntityToRecord(entity, record) {
  if (!entity || !record) return;
  if (!entity.data) entity.data = {};
  entity.data.worldRecordId = record.recordId;
  entity.data.durable = true;
  if (record.homeSectorId) {
    entity.homeSectorId = record.homeSectorId;
    entity.data.homeSectorId = record.homeSectorId;
  }
  if (record.kind === RECORD_KIND.MISSION_TARGET) {
    entity.flags = entity.flags || {};
    entity.flags.missionPinned = true;
    entity.data.missionPinned = true;
    if (record.missionId) {
      entity.data.missionId = record.missionId;
      // Keep missionTag in sync so missions adoption + kill attribution see rematerialized hosts.
      entity.data.missionTag = record.missionId;
    }
  }
  if (record.trafficRole) {
    entity.data.trafficRole = record.trafficRole;
    if (record.trafficLabel) entity.data.trafficLabel = record.trafficLabel;
    if (record.cargoManifest) entity.data.cargoManifest = clonePlain(record.cargoManifest);
    if (Number.isFinite(record.freightDockSeq)) entity.data.freightDockSeq = record.freightDockSeq;
  }
  if (record.recordSource) entity.data.recordSource = record.recordSource;
  if (record.recipeKey) entity.data.recipeKey = record.recipeKey;
}

/**
 * Ensure bag exists on state.world (mutates world root).
 */
export function ensureWorldRecords(world) {
  if (!world || typeof world !== 'object') return createEmptyRecordsBag();
  if (!world.records || typeof world.records !== 'object' || Array.isArray(world.records)) {
    world.records = createEmptyRecordsBag();
  } else {
    world.records = normalizeRecordsBag(world.records);
  }
  return world.records;
}
