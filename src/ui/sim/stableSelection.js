// stableSelection.js — SF-244 sim half ("a local-map selection that survives entity replacement").
//
// A selected durable place must stay selected when its render/entity instance changes, while a
// destroyed transient target closes gracefully instead of pointing at a recycled ID. The raw
// route today carries a bare `targetEntityId` (localmap click targets, `ui:setCourse`,
// `nav.waypoint`); the core deliberately recycles entity ids, so a bare id can silently redirect
// the pilot to an unrelated body. This model is the identity layer a screen resolves THROUGH:
//
//   • durable objects (stations/gates, world-record wrecks/convoy hosts) select by the stable
//     identity the world already maintains — `data.stationId` and `data.worldRecordId` — so the
//     selection survives the instance swap;
//   • transient objects (a random hull in the pool) select by entity id PLUS an identity stamp
//     captured at selection time; a later entity holding the recycled id must match the stamp or
//     the selection resolves to NULL (closed), never to the wrong body.
//
// PURE and VIEW-ONLY (ARCHITECTURE §5): reads state, never mutates, never imports Three.js, no
// Math.random. Reuses the existing stable world-record identity (worldRecords.findLiveEntityForRecord)
// rather than a parallel one. It does not write `nav.waypoint` — a screen consumes it when
// re-resolving what the player still has selected.

import { findLiveEntityForRecord } from '../../world/worldRecords.js';

// ── durable identity ───────────────────────────────────────────────────────────────────────────
/**
 * selectionKeyForEntity(entity) -> 'station:<id>' | 'record:<id>' | null
 *
 * Durable keys only — the identities the world itself maintains across instance swaps. An entity
 * without one is transient and selects by stamped id instead. Station/gate objects carry
 * `data.stationId` (world-owned catalogue id); durable records stamp `data.worldRecordId`
 * (worldRecords.bindEntityToRecord).
 */
export function selectionKeyForEntity(entity) {
  if (!entity || entity.alive === false) return null;
  const data = entity.data;
  if (!data || typeof data !== 'object') return null;
  if (entity.type === 'station' && typeof data.stationId === 'string' && data.stationId) {
    return `station:${data.stationId}`;
  }
  if (data.worldRecordId != null && data.worldRecordId !== '') {
    return `record:${data.worldRecordId}`;
  }
  return null;
}

// ── transient identity stamp ───────────────────────────────────────────────────────────────────
/**
 * Identity stamp for a transient entity: the descriptors a recycled id would have to reproduce to
 * pass as the same target. `type` is required and must match; every captured descriptor that was
 * present at selection time must still match. A fresh spawn may reuse id 47, but it will not also
 * reuse the old hull's role, faction, name and kind together.
 */
export function identityStampForEntity(entity) {
  if (!entity) return null;
  const data = entity.data && typeof entity.data === 'object' ? entity.data : {};
  const stamp = { type: entity.type != null ? String(entity.type) : null };
  if (data.role != null) stamp.role = String(data.role);
  if (entity.factionId != null) stamp.factionId = String(entity.factionId);
  const name = data.name || data.displayName || data.shipName;
  if (name != null) stamp.name = String(name);
  if (data.kind != null) stamp.kind = String(data.kind);
  return stamp;
}

/**
 * stampMatchesEntity(entity, stamp) — true only when the entity IS what was stamped. Any captured
 * descriptor that disagrees is a recycled id: not the same target, fail closed.
 */
export function stampMatchesEntity(entity, stamp) {
  if (!entity || !stamp || typeof stamp !== 'object') return false;
  const entityType = entity.type != null ? String(entity.type) : null;
  if (stamp.type !== entityType) return false;
  const data = entity.data && typeof entity.data === 'object' ? entity.data : {};
  if (stamp.role != null && stamp.role !== String(data.role)) return false;
  if (stamp.factionId != null && stamp.factionId !== String(entity.factionId)) return false;
  if (stamp.kind != null && stamp.kind !== String(data.kind)) return false;
  if (stamp.name != null) {
    const name = data.name || data.displayName || data.shipName;
    if (stamp.name !== (name != null ? String(name) : null)) return false;
  }
  return true;
}

// ── selection capture ──────────────────────────────────────────────────────────────────────────
/**
 * captureEntitySelection(entity) -> selection | null
 *
 * { key, durable, entityId, stamp? }
 *
 * `key` is the stable selection identity (durable) or 'entity:<id>' (transient); `entityId` is the
 * instance the selection was made on; transient selections carry the stamp that later proves (or
 * refutes) a resurrection. A dead or malformed entity captures nothing.
 */
export function captureEntitySelection(entity) {
  if (!entity || entity.alive === false) return null;
  const durableKey = selectionKeyForEntity(entity);
  if (durableKey) {
    return Object.freeze({ key: durableKey, durable: true, entityId: entity.id, stamp: null });
  }
  if (entity.id == null) return null;
  const stamp = identityStampForEntity(entity);
  if (!stamp || !stamp.type) return null;
  return Object.freeze({ key: `entity:${entity.id}`, durable: false, entityId: entity.id, stamp: Object.freeze(stamp) });
}

// ── resolution ─────────────────────────────────────────────────────────────────────────────────
function entityIterable(state) {
  if (!state) return null;
  if (state.entities && typeof state.entities.values === 'function') return state.entities.values();
  if (state.entities && typeof state.entities === 'object') return Object.values(state.entities);
  if (Array.isArray(state.entityList)) return state.entityList;
  return null;
}

function liveEntityById(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  let entity = state.entities.get(id);
  if (!entity && typeof id === 'string') {
    const numeric = Number(id);
    if (Number.isFinite(numeric)) entity = state.entities.get(numeric);
  }
  return entity && entity.alive !== false ? entity : null;
}

function findStationByStationId(state, stationId) {
  const index = state.entityIndex && state.entityIndex.byStationId;
  const indexed = index && typeof index.get === 'function' ? index.get(stationId) : null;
  // The index row answers only while the live entity set still holds THAT instance — a stale row
  // (recycled id, pre-rebuild index) falls through to the identity scan below.
  const indexedLive = indexed ? liveEntityById(state, indexed.id) : null;
  if (indexed && indexedLive === indexed && indexed.data && indexed.data.stationId === stationId) return indexed;
  const iterable = entityIterable(state);
  if (!iterable) return null;
  for (const entity of iterable) {
    if (!entity || entity.alive === false || entity.type !== 'station') continue;
    if (entity.data && entity.data.stationId === stationId) return entity;
  }
  return null;
}

function findEntityByKey(state, key) {
  if (typeof key !== 'string' || !key) return null;
  const cut = key.indexOf(':');
  if (cut < 1) return null;
  const kind = key.slice(0, cut);
  const id = key.slice(cut + 1);
  if (!id) return null;
  if (kind === 'station') return findStationByStationId(state, id);
  if (kind === 'record') return findLiveEntityForRecord(entityIterable(state), id);
  if (kind === 'entity') return liveEntityById(state, Number.isFinite(Number(id)) ? Number(id) : id);
  return null;
}

/**
 * resolveEntitySelection(state, selection) -> live entity | null
 *
 * Durable keys resolve through stable identity, so the NEW instance of the same station/record
 * answers (the selection survives replacement). Transient keys resolve the stored instance id and
 * then re-validate the stamp — a recycled id that is not the same body resolves NULL and the
 * selection closes instead of redirecting. Unknown/dead anything -> null.
 */
export function resolveEntitySelection(state, selection) {
  if (!state || !selection || typeof selection !== 'object' || typeof selection.key !== 'string') return null;
  const entity = findEntityByKey(state, selection.key);
  if (!entity) return null;
  if (selection.durable) return entity;
  if (!stampMatchesEntity(entity, selection.stamp)) return null;
  return entity;
}

/**
 * refreshEntitySelection(state, selection) -> selection | null
 *
 * Re-bind the selection to the entity that NOW holds its identity. A durable selection follows the
 * new instance id; a transient one re-freezes onto the same stamped body or closes (null). A
 * screen calls this when the world changed underneath an open map.
 */
export function refreshEntitySelection(state, selection) {
  const entity = resolveEntitySelection(state, selection);
  if (!entity) return null;
  if (selection.durable && entity.id !== selection.entityId) {
    return Object.freeze({ key: selection.key, durable: true, entityId: entity.id, stamp: null });
  }
  return selection;
}
