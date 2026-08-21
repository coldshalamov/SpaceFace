// Pure durable world-entity record schema + rematerialization helpers (M2-C2).
//
// Owned exclusively by systems/world.js for capture on demote and rematerialize on promote.
// Not a second world authority — residency tiers and live bags remain world-owned.
//
// Determinism: stable record IDs from hash32(seed, tags); no Math.random; positions are
// galactic-global XZ (global_v1). Runtime-only liveEntityId is never serialized.

import { hash32 } from '../core/rng.js';
import { SIM_TIER } from './activityClassification.js';
import { normalizeIntent } from './worldCatchup.js';
import { SECTORS } from '../data/sectors.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';

export const WORLD_RECORDS_SCHEMA_ID = 'spaceface.worldRecords.v1';
export const WORLD_RECORDS_SCHEMA_VERSION = 2;

/** Durable retention is independent from simulation residency/tier. */
export const RETENTION_CLASS = Object.freeze({
  PERMANENT: 'permanent',
  RECENT: 'recent',
  AGGREGATE: 'aggregate',
});

const RETENTION_CLASSES = new Set(Object.values(RETENTION_CLASS));

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

/** Generic observed actors stay as recent-memory this long (simTime seconds). */
export const RECENT_MEMORY_WINDOW_S = 180;

/** Bounded deterministic receipts for cap decisions made during restore or runtime upsert. */
export const MAX_RETENTION_RECEIPTS = 64;

/** Explicit capture sentinel for intentionally clearing a scheduled wake. */
export const CLEAR_NEXT_EVENT_AT_T = Symbol('spaceface.clearNextEventAtT');

/** Return capture options that intentionally clear the durable wake and its event ids. */
export function clearScheduledWake(options = {}) {
  return {
    ...options,
    nextEventAtT: CLEAR_NEXT_EVENT_AT_T,
    scheduledEventIds: [],
  };
}

function hasPermanentWorldMarkers(rec) {
  if (!rec) return false;
  if (rec.kind === RECORD_KIND.MISSION_TARGET || rec.kind === RECORD_KIND.WRECK
    || rec.kind === RECORD_KIND.AFTERMATH) return true;
  if (rec.outcome === 'defeated' || rec.outcome === 'destroyed') return true;
  if (rec.playerOwned === true || rec.playerCreated === true || rec.named === true) return true;
  if (rec.missionId || rec.missionTag || rec.jobId) return true;
  if (rec.deactivation && rec.deactivation.reason === 'player') return true;
  return false;
}

/**
 * Derive a durable retention class from a record, including older saves which did not carry
 * the explicit class. Permanent identity markers always win over a stale/invalid class.
 */
export function deriveRetentionClass(raw, fallback = RETENTION_CLASS.RECENT) {
  const value = raw && typeof raw === 'object' ? raw : {};
  if (value.retentionClass === RETENTION_CLASS.PERMANENT || hasPermanentWorldMarkers(value)) {
    return RETENTION_CLASS.PERMANENT;
  }
  if (value.retentionClass === RETENTION_CLASS.RECENT
    || value.retentionClass === RETENTION_CLASS.AGGREGATE) {
    return value.retentionClass;
  }
  if (value.abstractTier === SIM_TIER.S4_AGGREGATE
    || value.retentionReason === RETENTION_CLASS.AGGREGATE
    || value.durableReason === RETENTION_CLASS.AGGREGATE) {
    return RETENTION_CLASS.AGGREGATE;
  }
  return RETENTION_CLASSES.has(fallback) && fallback !== RETENTION_CLASS.PERMANENT
    ? fallback
    : RETENTION_CLASS.RECENT;
}

/** Read the authoritative class while remaining compatible with pre-class records. */
export function retentionClassOf(rec) {
  if (!rec) return RETENTION_CLASS.RECENT;
  if (hasPermanentWorldMarkers(rec)) return RETENTION_CLASS.PERMANENT;
  if (RETENTION_CLASSES.has(rec.retentionClass)) return rec.retentionClass;
  return deriveRetentionClass(rec);
}

export function isPermanentWorldRecord(rec) {
  return retentionClassOf(rec) === RETENTION_CLASS.PERMANENT;
}

/** Only unprotected, expired recent memory may be reclaimed by a generic retention pass. */
export function isReclaimableRecentWorldRecord(rec) {
  if (!rec || retentionClassOf(rec) !== RETENTION_CLASS.RECENT) return false;
  if (isPermanentWorldRecord(rec)) return false;
  if (rec.outcome === 'defeated' || rec.outcome === 'destroyed' || rec.alive === false) return false;
  return true;
}

export function gcExpiredRecentMemory(bag, simTime, windowS = RECENT_MEMORY_WINDOW_S) {
  if (!bag || !bag.byId) return 0;
  const now = Number.isFinite(simTime) ? simTime : 0;
  const window = Number.isFinite(windowS) && windowS > 0 ? windowS : RECENT_MEMORY_WINDOW_S;
  let dropped = 0;
  for (const id of Object.keys(bag.byId)) {
    const rec = bag.byId[id];
    if (!isReclaimableRecentWorldRecord(rec)) continue;
    const observed = Number.isFinite(rec.lastObservedT) ? rec.lastObservedT : rec.lastExactT;
    if (!Number.isFinite(observed)) continue;
    if (now - observed < window) continue;
    delete bag.byId[id];
    dropped++;
  }
  return dropped;
}

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
  // Retention overflow is runtime telemetry, not save authority. Preserve it across the
  // normalize calls used by world.ensureWorldRecords so an operator can see protected pressure,
  // while serializeRecordsBag deliberately omits it.
  if (input.retentionReport && typeof input.retentionReport === 'object'
    && !Array.isArray(input.retentionReport)) {
    bag.retentionReport = clonePlain(input.retentionReport) || {};
  }
  if (Array.isArray(input.retentionReceipts)) {
    bag.retentionReceipts = input.retentionReceipts
      .map((entry) => clonePlain(entry))
      .filter((entry) => entry && typeof entry === 'object')
      .slice(-MAX_RETENTION_RECEIPTS);
  }
  const src = input.byId && typeof input.byId === 'object' && !Array.isArray(input.byId)
    ? input.byId
    : (typeof input === 'object' && !Array.isArray(input) && !input.schemaId ? input : null);
  if (!src) return bag;
  const ids = Object.keys(src).sort();
  for (const id of ids) {
    const rec = normalizeRecord(src[id], id);
    if (rec) bag.byId[rec.recordId] = rec;
  }
  const sectors = new Set();
  for (const rec of Object.values(bag.byId)) {
    if (rec && rec.sectorId) sectors.add(rec.sectorId);
    if (rec && rec.homeSectorId) sectors.add(rec.homeSectorId);
  }
  for (const sectorId of [...sectors].sort()) {
    enforceSectorBound(bag, sectorId, { source: 'normalize' });
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
    missionTag: raw.missionTag || null,
    jobId: raw.jobId || null,
    playerOwned: raw.playerOwned === true,
    playerCreated: raw.playerCreated === true,
    named: raw.named === true || (typeof raw.name === 'string' && raw.name.trim().length > 0),
    name: typeof raw.name === 'string' && raw.name ? raw.name : null,
    retentionClass: deriveRetentionClass(raw),
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
    lastExactT: Number.isFinite(raw.lastExactT) ? raw.lastExactT : 0,
    lastObservedT: Number.isFinite(raw.lastObservedT) ? raw.lastObservedT : 0,
    abstractTier: Object.values(SIM_TIER).includes(raw.abstractTier) ? raw.abstractTier : SIM_TIER.S0_EXACT,
    intent: normalizeIntent(raw.intent),
    // -1 is the live activity sentinel for "no scheduled wake"; durable records use null.
    nextEventAtT: Number.isFinite(raw.nextEventAtT) && raw.nextEventAtT >= 0 ? raw.nextEventAtT : null,
    scheduledEventIds: Array.isArray(raw.scheduledEventIds)
      ? raw.scheduledEventIds.map((id) => String(id)).filter(Boolean)
      : [],
    regeneration: {
      hullRate: Number.isFinite(raw.regeneration && raw.regeneration.hullRate) ? raw.regeneration.hullRate : 0,
      shieldRate: Number.isFinite(raw.regeneration && raw.regeneration.shieldRate) ? raw.regeneration.shieldRate : 0,
      repairAtT: Number.isFinite(raw.regeneration && raw.regeneration.repairAtT) ? raw.regeneration.repairAtT : null,
    },
    deactivation: {
      reason: raw.deactivation && raw.deactivation.reason != null ? String(raw.deactivation.reason) : null,
      exactSnapshotHash: raw.deactivation && raw.deactivation.exactSnapshotHash != null
        ? String(raw.deactivation.exactSnapshotHash)
        : null,
      generation: Number.isFinite(raw.deactivation && raw.deactivation.generation)
        ? Math.max(0, Math.floor(raw.deactivation.generation))
        : 0,
    },
    extra: preserveUnknownFields(raw),
  };
  return rec;
}

const KNOWN_RECORD_FIELDS = new Set([
  'recordId', 'kind', 'sectorId', 'homeSectorId', 'pos', 'vel', 'rot', 'angVel',
  'type', 'enemyTypeId', 'shipDefId', 'defId', 'factionId', 'team', 'level',
  'hull', 'hullMax', 'shield', 'shieldMax', 'armorHp', 'armorMax', 'alive', 'outcome',
  'missionId', 'missionTag', 'jobId', 'playerOwned', 'playerCreated', 'named', 'name', 'retentionClass',
  'trafficRole', 'trafficLabel', 'itinerary', 'cargoManifest', 'freightDockSeq',
  'wreckClass', 'markerId', 'victimClass', 'ai', 'isBoss', 'bossPoiId', 'bossSectorId',
  'epoch', 'createdTick', 'lastSeenTick', 'durableReason', 'identityKey', 'recordSource',
  'recipeKey', 'liveEntityId', 'rematerializedTick', 'lastExactT', 'lastObservedT',
  'abstractTier', 'intent', 'nextEventAtT', 'scheduledEventIds', 'regeneration',
  'deactivation', 'extra',
]);

function preserveUnknownFields(raw) {
  const extra = {};
  if (raw.extra && typeof raw.extra === 'object' && !Array.isArray(raw.extra)) {
    const nested = clonePlain(raw.extra) || {};
    for (const key of Object.keys(nested)) extra[key] = nested[key];
  }
  for (const key of Object.keys(raw)) {
    if (KNOWN_RECORD_FIELDS.has(key)) continue;
    extra[key] = clonePlain(raw[key]);
  }
  return extra;
}

function positionFromItinerary(value) {
  if (!value || typeof value !== 'object') return null;
  const pos = value.pos || value.position || value.location || value.point || value;
  return finiteXZ(pos) ? cloneXZ(pos) : null;
}

function stationIdFromValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return null;
  const id = value.stationId || value.id;
  return id == null || id === '' ? null : String(id);
}

function stationIdentity(station) {
  if (!station || typeof station !== 'object') return null;
  const data = station.data || {};
  const id = data.stationId || data.id || station.stationId || station.id;
  return id == null || id === '' ? null : String(id);
}

function stationPositionValue(value) {
  if (!value || typeof value !== 'object') return null;
  return positionFromItinerary(value.pos || value.position || value);
}

function stationPositionForId(stationId, opts = {}, entity = null) {
  const id = stationId == null || stationId === '' ? null : String(stationId);
  if (!id) return null;
  const supplied = opts.stationPositions;
  if (supplied instanceof Map) {
    const point = stationPositionValue(supplied.get(id));
    if (point) return point;
  } else if (supplied && typeof supplied === 'object') {
    const point = stationPositionValue(supplied[id]);
    if (point) return point;
  }

  const source = opts.stationSource || opts.state || null;
  const candidates = opts.stations
    || source && source.entityIndex && source.entityIndex.__spacefaceEntityIndexV1
      && source.entityIndex.dockStations
    || source && source.entityList
    || null;
  if (candidates && typeof candidates[Symbol.iterator] === 'function') {
    for (const station of candidates) {
      if (stationIdentity(station) !== id) continue;
      const point = stationPositionValue(station);
      if (point) return point;
    }
  }

  const sectorHint = opts.sectorId
    || entity && (entity.homeSectorId || entity.data && (entity.data.homeSectorId || entity.data.sectorId));
  const sectors = source && source.world && source.world.sectors;
  if (sectors && typeof sectors === 'object') {
    const values = Array.isArray(sectors) ? sectors : Object.values(sectors);
    for (const sector of values) {
      if (!sector || sectorHint && sector.id !== sectorHint || !Array.isArray(sector.stations)) continue;
      const station = sector.stations.find((entry) => stationIdentity(entry) === id);
      if (station && finiteXZ(station.pos)) return sectorLocalToGlobalForSector(station.pos, sector.id);
    }
  }

  // The authored catalog is the deterministic fallback for a demote/capture that occurs after
  // the station owner has left the live entity index. Station coordinates are sector-local in the
  // catalog and must be composed into the same global XZ used by durable records.
  for (const sector of SECTORS) {
    if (!sector || sectorHint && sector.id !== sectorHint || !Array.isArray(sector.stations)) continue;
    const station = sector.stations.find((entry) => stationIdentity(entry) === id);
    if (station && finiteXZ(station.pos)) return sectorLocalToGlobalForSector(station.pos, sector.id);
  }
  if (sectorHint) {
    for (const sector of SECTORS) {
      if (!sector || !Array.isArray(sector.stations)) continue;
      const station = sector.stations.find((entry) => stationIdentity(entry) === id);
      if (station && finiteXZ(station.pos)) return sectorLocalToGlobalForSector(station.pos, sector.id);
    }
  }
  return null;
}

function itineraryStationId(itinerary, keys) {
  for (const key of keys) {
    const id = stationIdFromValue(itinerary && itinerary[key]);
    if (id) return id;
  }
  return null;
}

/** Convert supported traffic endpoint itineraries into the deterministic catch-up language. */
export function canonicalTrafficIntent(entity, opts = {}, previous = null) {
  const d = entity && entity.data || {};
  const explicit = opts.intent !== undefined
    ? opts.intent
    : (d.abstractIntent || d.activityIntent || null);
  const normalized = normalizeIntent(explicit);
  if (normalized) return normalized;
  const prior = normalizeIntent(previous && previous.intent);
  if (!d.trafficRole && !d.itinerary && !opts.itinerary) return prior;
  const itinerary = d.itinerary || opts.itinerary || null;
  if (!itinerary || typeof itinerary !== 'object') return prior;
  const fromStationId = itineraryStationId(itinerary, [
    'fromStationId', 'originStationId', 'departureStationId', 'sourceStationId',
    'stationFromId', 'fromStation', 'originStation', 'from', 'origin',
  ]);
  const toStationId = itineraryStationId(itinerary, [
    'toStationId', 'destinationStationId', 'arrivalStationId', 'targetStationId',
    'stationToId', 'toStation', 'destinationStation', 'to', 'destination',
  ]);
  let from = positionFromItinerary(itinerary.from || itinerary.origin || itinerary.originPos)
    || stationPositionForId(fromStationId, opts, entity);
  let to = positionFromItinerary(itinerary.to || itinerary.destination || itinerary.destinationPos)
    || stationPositionForId(toStationId, opts, entity);
  const waypoints = Array.isArray(itinerary.waypoints)
    ? itinerary.waypoints
    : (Array.isArray(itinerary.route) ? itinerary.route : null);
  if ((!from || !to) && waypoints && waypoints.length >= 2) {
    from = from || positionFromItinerary(waypoints[0])
      || stationPositionForId(stationIdFromValue(waypoints[0]), opts, entity);
    to = to || positionFromItinerary(waypoints[1])
      || stationPositionForId(stationIdFromValue(waypoints[1]), opts, entity);
  }
  if (!from || !to) return prior;
  const startT = Number.isFinite(itinerary.startT)
    ? itinerary.startT
    : (Number.isFinite(itinerary.departureAt) ? itinerary.departureAt : (opts.simTime || 0));
  const duration = Number.isFinite(itinerary.durationS) ? Math.max(0, itinerary.durationS) : 0;
  const endT = Number.isFinite(itinerary.endT)
    ? itinerary.endT
    : (Number.isFinite(itinerary.arrivalAt)
      ? itinerary.arrivalAt
      : (Number.isFinite(itinerary.dueAt) ? itinerary.dueAt : startT + duration));
  const kind = itinerary.intentKind === 'patrol' || itinerary.kind === 'patrol'
    ? 'patrol'
    : (itinerary.intentKind === 'escort' ? 'escort' : 'travel');
  const routeId = itinerary.routeId != null
    ? String(itinerary.routeId)
    : (itinerary.serviceId != null
      ? String(itinerary.serviceId)
      : `traffic:${String(d.trafficRole || 'route')}:${String(fromStationId || 'origin')}>${String(toStationId || 'destination')}`);
  const seed = opts.seed != null ? opts.seed : 1;
  const resultSeed = hash32(seed >>> 0 || 1, 'traffic-intent', routeId, d.worldRecordId || entity && entity.id || 'actor');
  return normalizeIntent({
    kind,
    routeId,
    segmentIndex: Number.isFinite(itinerary.segmentIndex) ? itinerary.segmentIndex : 0,
    startT,
    endT,
    parameters: { from, to },
    resultSeed,
  });
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
  const serialized = {
    schemaId: WORLD_RECORDS_SCHEMA_ID,
    schemaVersion: WORLD_RECORDS_SCHEMA_VERSION,
    byId,
  };
  if (normalized.retentionReceipts && normalized.retentionReceipts.length > 0) {
    serialized.retentionReceipts = normalized.retentionReceipts.slice(-MAX_RETENTION_RECEIPTS);
  }
  return serialized;
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
  const previous = opts.previousRecord
    || opts.existingRecord
    || (opts.recordsBag && opts.recordsBag.byId && existingId ? opts.recordsBag.byId[existingId] : null)
    || null;
  const missionId = missionIdentityOf(d) || (previous && previous.missionId) || null;
  const missionTag = d.missionTag || (previous && previous.missionTag) || missionId || null;
  const jobId = d.jobId || (previous && previous.jobId) || null;
  const playerOwned = d.playerOwned === true || entity.playerOwned === true
    || previous && previous.playerOwned === true;
  const playerCreated = d.playerCreated === true || entity.playerCreated === true
    || previous && previous.playerCreated === true;
  const named = d.named === true || entity.named === true
    || typeof d.name === 'string' && d.name.trim().length > 0
    || typeof entity.name === 'string' && entity.name.trim().length > 0
    || previous && previous.named === true;
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
  const aiRecord = d.ai && typeof d.ai === 'object'
    ? d.ai
    : (entity.ai && typeof entity.ai === 'object' ? entity.ai : null);
  const activity = entity.activity && typeof entity.activity === 'object' ? entity.activity : null;
  const aiActivity = aiRecord && aiRecord.activity && typeof aiRecord.activity === 'object'
    ? aiRecord.activity
    : null;
  // Movement intent is an ephemeral per-tick control object. Only carry the normalized abstract
  // itinerary intent, so a demoted actor resumes the same deterministic route rather than a stale
  // steering bit. Likewise, a scheduled wake is durable even when no live worker is involved.
  const intent = canonicalTrafficIntent(entity, {
    ...opts,
    stationSource: opts.stationSource || opts.state,
    intent: opts.intent !== undefined
      ? opts.intent
      : (d.abstractIntent || d.activityIntent || activity && activity.intent || undefined),
  }, previous);
  const clearNextEvent = opts.nextEventAtT === CLEAR_NEXT_EVENT_AT_T
    || opts.clearNextEventAtT === true;
  const nextEventAtT = clearNextEvent
    ? null
    : (Number.isFinite(opts.nextEventAtT) && opts.nextEventAtT >= 0
      ? opts.nextEventAtT
      : (Number.isFinite(activity && activity.nextEventAtT) && activity.nextEventAtT >= 0
        ? activity.nextEventAtT
        : (Number.isFinite(d.nextEventAtT) && d.nextEventAtT >= 0
          ? d.nextEventAtT
          : (Number.isFinite(aiRecord && aiRecord.nextEventAtT) && aiRecord.nextEventAtT >= 0
            ? aiRecord.nextEventAtT
            : (Number.isFinite(aiActivity && aiActivity.nextEventAtT) && aiActivity.nextEventAtT >= 0
              ? aiActivity.nextEventAtT
              : (Number.isFinite(previous && previous.nextEventAtT) && previous.nextEventAtT >= 0
                ? previous.nextEventAtT
                : null))))));
  const retentionClass = deriveRetentionClass({
    ...(previous || {}),
    ...d,
    kind,
    missionId,
    missionTag,
    jobId,
    playerOwned,
    playerCreated,
    named,
    retentionClass: opts.retentionClass !== undefined
      ? opts.retentionClass
      : (d.retentionClass !== undefined ? d.retentionClass : previous && previous.retentionClass),
    abstractTier: opts.abstractTier || d.abstractTier || previous && previous.abstractTier,
    outcome: entity.alive === false ? 'destroyed' : 'active',
  });
  const scheduledEventIds = clearNextEvent
    ? []
    : (opts.scheduledEventIds !== undefined
      ? opts.scheduledEventIds
      : (d.scheduledEventIds !== undefined
        ? d.scheduledEventIds
        : (previous && previous.scheduledEventIds || [])));
  const regeneration = opts.regeneration !== undefined
    ? opts.regeneration
    : (d.regeneration !== undefined ? d.regeneration : (previous && previous.regeneration));
  const deactivation = opts.deactivation !== undefined
    ? opts.deactivation
    : (d.deactivation !== undefined ? d.deactivation : (previous && previous.deactivation));
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
    missionTag,
    jobId,
    playerOwned,
    playerCreated,
    named,
    name: typeof d.name === 'string' ? d.name : (typeof entity.name === 'string' ? entity.name : null),
    retentionClass,
    trafficRole: d.trafficRole || null,
    trafficLabel: d.trafficLabel || null,
    itinerary: d.itinerary || (opts.itinerary || null),
    cargoManifest: d.cargoManifest || null,
    freightDockSeq: Number.isFinite(d.freightDockSeq) ? d.freightDockSeq : null,
    wreckClass: d.wreckClass || null,
    markerId: d.markerId || null,
    victimClass: d.victimClass || null,
    ai: aiRecord,
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
    lastExactT: opts.simTime != null ? opts.simTime : opts.tick || 0,
    lastObservedT: opts.simTime != null ? opts.simTime : opts.tick || 0,
    abstractTier: opts.abstractTier || d.abstractTier || previous && previous.abstractTier || SIM_TIER.S0_EXACT,
    intent,
    nextEventAtT,
    scheduledEventIds,
    regeneration,
    deactivation,
    extra: opts.extra !== undefined ? opts.extra : (previous && previous.extra) || null,
  });
  return rec;
}

/**
 * Upsert into bag; enforce per-sector bound. Returns the stored record.
 */
export function upsertRecord(bag, record) {
  const b = bag && bag.byId ? bag : createEmptyRecordsBag();
  if (!b.byId) b.byId = {};
  const prior = record && record.recordId ? b.byId[record.recordId] : null;
  const priorPermanent = isPermanentWorldRecord(prior);
  const priorTerminal = prior && (prior.outcome === 'defeated' || prior.outcome === 'destroyed');
  const merged = prior && record && typeof record === 'object'
    ? {
      ...prior,
      ...record,
      // Retention is a latch: a later observation cannot turn a named/mission/player or
      // terminal identity back into ordinary recent memory.
      kind: priorPermanent ? prior.kind : record.kind,
      retentionClass: priorPermanent ? RETENTION_CLASS.PERMANENT : record.retentionClass,
      missionId: record.missionId || prior.missionId,
      missionTag: record.missionTag || prior.missionTag,
      jobId: record.jobId || prior.jobId,
      playerOwned: prior.playerOwned === true || record.playerOwned === true,
      playerCreated: prior.playerCreated === true || record.playerCreated === true,
      named: prior.named === true || record.named === true,
      name: record.name || prior.name,
      outcome: priorTerminal ? prior.outcome : record.outcome,
      alive: priorTerminal ? false : record.alive,
      scheduledEventIds: record.scheduledEventIds !== undefined
        ? record.scheduledEventIds : prior.scheduledEventIds,
      regeneration: record.regeneration !== undefined ? record.regeneration : prior.regeneration,
      deactivation: priorPermanent && prior.deactivation && prior.deactivation.reason === 'player'
        ? prior.deactivation
        : (record.deactivation !== undefined ? record.deactivation : prior.deactivation),
    }
    : record;
  const rec = normalizeRecord(merged);
  if (!rec) return null;
  b.byId[rec.recordId] = rec;
  enforceSectorBound(b, rec.homeSectorId || rec.sectorId, { source: 'upsert' });
  return rec;
}

function enforceSectorBound(bag, sectorId, opts = {}) {
  const list = recordsForSector(bag, sectorId);
  const reclaimable = list.filter(isReclaimableRecentWorldRecord);
  const required = Math.max(0, list.length - MAX_RECORDS_PER_SECTOR);
  // Keep the ordinary under-cap runtime shape unchanged; reports are created only when a cap
  // transaction or protected overflow actually occurs.
  if (required === 0) return;
  const ranked = reclaimable.slice().sort((a, b) => {
    if (a.lastSeenTick !== b.lastSeenTick) return a.lastSeenTick - b.lastSeenTick;
    if (a.lastObservedT !== b.lastObservedT) return a.lastObservedT - b.lastObservedT;
    return a.recordId < b.recordId ? -1 : (a.recordId > b.recordId ? 1 : 0);
  });
  const dropCount = Math.min(required, ranked.length);
  for (let i = 0; i < dropCount; i++) {
    delete bag.byId[ranked[i].recordId];
  }
  const protectedOverflow = Math.max(0, required - ranked.length);
  const report = ensureRetentionReport(bag);
  report.sectors[String(sectorId || '')] = {
    sectorId: sectorId || null,
    total: list.length - dropCount,
    limit: MAX_RECORDS_PER_SECTOR,
    reclaimable: ranked.length - dropCount,
    retiredRecent: dropCount,
    protectedOverflow,
  };
  const remainingIds = recordsForSector(bag, sectorId).map((rec) => rec.recordId).sort();
  const droppedIds = ranked.slice(0, dropCount).map((rec) => rec.recordId).sort();
  appendRetentionReceipt(bag, {
    receiptId: `wr-cap:${sectorId}:${(hash32(1, 'wr-cap', remainingIds.join(','), droppedIds.join(','), protectedOverflow) >>> 0).toString(16)}`,
    event: 'world_records_cap',
    source: opts.source || 'runtime',
    sectorId: sectorId || null,
    limit: MAX_RECORDS_PER_SECTOR,
    before: list.length,
    retiredRecordIds: droppedIds,
    protectedOverflow,
  });
}

function ensureRetentionReport(bag) {
  if (!bag.retentionReport || typeof bag.retentionReport !== 'object'
    || Array.isArray(bag.retentionReport)) {
    bag.retentionReport = { sectors: {} };
  } else if (!bag.retentionReport.sectors || typeof bag.retentionReport.sectors !== 'object'
    || Array.isArray(bag.retentionReport.sectors)) {
    bag.retentionReport.sectors = {};
  }
  return bag.retentionReport;
}

function appendRetentionReceipt(bag, receipt) {
  if (!receipt || !receipt.receiptId) return;
  if (!Array.isArray(bag.retentionReceipts)) bag.retentionReceipts = [];
  if (bag.retentionReceipts.some((entry) => entry && entry.receiptId === receipt.receiptId)) return;
  bag.retentionReceipts.push(receipt);
  if (bag.retentionReceipts.length > MAX_RETENTION_RECEIPTS) {
    bag.retentionReceipts.splice(0, bag.retentionReceipts.length - MAX_RETENTION_RECEIPTS);
  }
}

/** Runtime-only cap pressure report; protected records are never hidden by the cap. */
export function getWorldRecordRetentionReport(bag) {
  return bag && bag.retentionReport && typeof bag.retentionReport === 'object'
    ? bag.retentionReport
    : { sectors: {} };
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
  rec.retentionClass = RETENTION_CLASS.PERMANENT;
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
