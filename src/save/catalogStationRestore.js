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
  sectorByStation.set(station.id, sectorByStation.has(station.id) ? null : sector.id);
  if (Number.isFinite(station.pos?.x) && Number.isFinite(station.pos?.z)) {
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

export function createCatalogStationRestore(savedList) {
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
    if (existing && existing.signature !== signature) throw new Error('ambiguous_catalog_station:' + key);
    if (!existing) {
      // A remote station can bypass materialization and use the generic persistent lane.
      // It still needs an undisplaced rest anchor before physics consumes its recoil row.
      const rest = catalogAnchorByStation.get(key) || saved.physicsBody?.anchorRecoil?.rest;
      const anchor = Number.isFinite(rest?.x) && Number.isFinite(rest?.z) ? { x: rest.x, z: rest.z } : null;
      entries.set(key, { saved, signature, entity: null, generation: null, anchor });
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
  entry.anchor = { x: anchor.x, z: anchor.z };
  bindRestoredCatalogStation(state, entry.saved, entity);
  if (entry.saved.id != null) state.sessionEntityIdRemap?.set(String(entry.saved.id), entity.id);
  return entity;
}
