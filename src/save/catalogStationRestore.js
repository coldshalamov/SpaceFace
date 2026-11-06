// A station carried by the persistent envelope is the catalog station, not a second body.
// Only an exact authored station/sector identity can claim it. The saved-body join is
// restore-scoped; a retained persistent carrier remains authoritative on later promotion.
import { SECTORS } from '../data/sectors.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { occupantGenerationOf, worldLedgerHoldsId } from '../core/entity.js';

const sectorByStation = new Map();
const catalogAnchorByStation = new Map();
// Native preparation can finish after the save session closes. Retain only this body's
// bounded anchor, not the envelope/map, and reject a recycled or detached occupant.
const anchorByCarrier = new WeakMap();
for (const sector of SECTORS) for (const station of sector.stations || []) {
  // An ambiguous catalog key grants no adoption authority.
  const duplicate = sectorByStation.has(station.id);
  sectorByStation.set(station.id, duplicate ? null : sector.id);
  // An ambiguous key has no single authored rest either: never keep the last duplicate's.
  if (duplicate) catalogAnchorByStation.delete(station.id);
  else if (Number.isFinite(station.pos?.x) && Number.isFinite(station.pos?.z)) {
    catalogAnchorByStation.set(station.id, sectorLocalToGlobalForSector(station.pos, sector.id));
  }
}

function stationKey(entity) {
  if (!entity || entity.type !== 'station' || entity.alive === false || entity.data?.isGate) return null;
  const id = entity.data?.stationId, sectorId = sectorByStation.get(id);
  if (!sectorId) return null;
  for (const actual of [entity.homeSectorId, entity.data?.homeSectorId, entity.data?.sectorId]) {
    if (actual != null && actual !== sectorId) return null;
  }
  return id;
}

// Identical physical snapshots do not prove identical earned lives. The stunt restore
// owners rekey observations and bind one life per body, so even an equivalent station
// alias must fail closed when distinct identities participate in retained evidence.
const referenceFields = new Set(['id', 'actorId', 'sourceId', 'targetId', 'senderId', 'receiverId',
  'speakerId', 'entityId', 'ownerId', 'projectileId', 'projectileOwnerId', 'surfaceId', 'aId', 'bId']);
const referenceLists = new Set(['threatIds', 'boundaryIds', 'secondaryIds', 'witnessIds', 'knownWitnesses']);
function hasAliasEvidenceCollision(data, aliases) {
  const stack = [data?.stunts, data?.missions?.story, data?.story, data?.barkDirector];
  const seen = new Set();
  const referenced = new Set();
  const note = value => {
    // A null/undefined/blank reference is the absence of a link, not the identity "null".
    if (value == null || value === '') return;
    const id = typeof value === 'string' && value.startsWith('entity:') ? value.slice(7) : String(value);
    if (aliases.has(id)) referenced.add(id);
  };
  while (stack.length) {
    const row = stack.pop();
    if (!row || typeof row !== 'object' || seen.has(row)) continue;
    seen.add(row);
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith('entity:')) note(key);
      if (referenceFields.has(key) || key === 'identity' || key === 'speakerIdentity') note(value);
      if (referenceLists.has(key) && Array.isArray(value)) value.forEach(note);
      if (referenced.size > 1) return true;
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return false;
}

export function createCatalogStationRestore(savedList, data = null) {
  const entries = new Map();
  for (const saved of Array.isArray(savedList) ? savedList : []) {
    const key = stationKey(saved);
    if (!key) continue;
    const signature = JSON.stringify({ ...saved, id: null, _isPlayer: false }, (_, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
    const existing = entries.get(key);
    // A leaked identical alias is recoverable. Conflicting snapshots cannot be silently
    // discarded: refuse before clearing the outgoing run and leave the source save intact.
    // A row without an id carries no alias identity: stringifying it would mint the
    // phantom alias "undefined"/"null" that unrelated null references then collide with.
    if (existing && saved.id != null) existing.aliases.add(String(saved.id));
    if (existing && (existing.signature !== signature || hasAliasEvidenceCollision(data, existing.aliases))) {
      throw new Error('ambiguous_catalog_station:' + key);
    }
    if (!existing) {
      // A remote station can bypass materialization and use the generic persistent lane.
      // It still needs an undisplaced rest anchor before physics consumes its recoil row.
      const rest = catalogAnchorByStation.get(key) || saved.physicsBody?.anchorRecoil?.rest;
      const anchor = Number.isFinite(rest?.x) && Number.isFinite(rest?.z) ? { x: rest.x, z: rest.z } : null;
      entries.set(key, { saved, signature, aliases: new Set(saved.id != null ? [String(saved.id)] : []), entity: null, generation: null, anchor });
    }
  }
  return entries;
}

function liveCarrier(state, entry) {
  const entity = entry?.entity;
  return entity && entry.generation != null && entity.alive !== false && state.entities?.get(entity.id) === entity
    && occupantGenerationOf(entity) === entry.generation
    && stationKey(entity) === stationKey(entry.saved) ? entity : null;
}

export function restoredCatalogStation(state, saved) {
  return liveCarrier(state, state.restoreEnvelopeStations?.get(stationKey(saved)));
}

export function isRestoredCatalogStation(state, entity) {
  return restoredCatalogStation(state, entity) === entity;
}

export function bindRestoredCatalogStation(state, saved, entity) {
  const entry = state.restoreEnvelopeStations?.get(stationKey(saved));
  if (!entry || stationKey(entity) !== stationKey(saved)) return;
  entry.entity = entity;
  entry.generation = occupantGenerationOf(entity);
  if (entry.anchor) anchorByCarrier.set(entity, {
    key: stationKey(entity), generation: entry.generation, anchor: { ...entry.anchor },
  });
}

export function restoredCatalogStationAnchor(state, entity) {
  const retained = entity && anchorByCarrier.get(entity);
  return retained && retained.generation != null && entity.alive !== false
    && state.entities?.get(entity.id) === entity
    && occupantGenerationOf(entity) === retained.generation
    && stationKey(entity) === retained.key ? retained.anchor : null;
}

export function spawnRestoredCatalogStation(state, helpers, stationId, sectorId, anchor) {
  if (sectorByStation.get(stationId) !== sectorId) return null;
  const entry = state.restoreEnvelopeStations?.get(stationId);
  if (!entry) {
    // Residency deliberately retains persistent actors when their sector demotes. Returning
    // later must bind the existing station into the new bag, not mint a second catalog body.
    const residents = (state.entityList || []).filter(entity =>
      stationKey(entity) === stationId && entity.flags?.persistent === true
      && occupantGenerationOf(entity) != null && state.entities?.get(entity.id) === entity);
    if (residents.length > 1) throw new Error('ambiguous_live_catalog_station:' + stationId);
    return residents[0] || null;
  }
  const existing = liveCarrier(state, entry);
  if (existing) return existing;
  const spec = structuredClone(entry.saved);
  delete spec._isPlayer;
  if (!(Number.isSafeInteger(spec.id) && spec.id > 0 && !state.entities?.has(spec.id)
    && !worldLedgerHoldsId(state.world, spec.id))) delete spec.id;
  if (!Number.isFinite(spec.ttl) || spec.ttl <= 0) spec.ttl = Infinity;
  spec.flags = { ...spec.flags, persistent: true, noInterp: true };
  const activity = spec.activity;
  delete spec.activity;
  const entity = helpers.spawnEntity(spec);
  if (activity && typeof activity === 'object') Object.defineProperty(entity, 'activity', {
    value: activity, writable: true, configurable: true, enumerable: false,
  });
  // A caller without a finite slot keeps the entry's authored/saved rest instead of throwing.
  if (Number.isFinite(anchor?.x) && Number.isFinite(anchor?.z)) entry.anchor = { x: anchor.x, z: anchor.z };
  bindRestoredCatalogStation(state, entry.saved, entity);
  if (entry.saved.id != null) state.sessionEntityIdRemap?.set(String(entry.saved.id), entity.id);
  return entity;
}
