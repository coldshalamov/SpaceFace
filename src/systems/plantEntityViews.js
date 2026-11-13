import { entityIndexVersion } from '../world/livingWorldViews.js';

const EMPTY = Object.freeze([]);
const mapOrderByState = new WeakMap();

// The two bounded plant cursors use Map insertion order. The core entityList
// swap-pops on removal, so using that array would change who gets a cue first.
export function plantMapOrder(state) {
  const entities = state?.entities;
  if (!entities) return EMPTY;
  if (Array.isArray(entities)) return entities;
  if (typeof entities.values !== 'function') return EMPTY;
  const version = entityIndexVersion(state);
  if (version === null) {
    mapOrderByState.delete(state);
    return Array.from(entities.values());
  }
  const prior = mapOrderByState.get(state);
  if (prior?.entities === entities && prior.version === version && prior.list.length === entities.size) {
    return prior.list;
  }
  const list = Array.from(entities.values());
  mapOrderByState.set(state, { entities, version, list });
  return list;
}

function isStation(entity, stationId) {
  return entity && entity.alive !== false && entity.type === 'station'
    && (entity.data?.stationId || entity.id) === stationId;
}

export function plantStationById(state, stationId) {
  const index = state?.entityIndex;
  const bucket = index?.stations;
  if (index?.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(bucket)) {
    const indexed = index.byStationId?.get?.(stationId);
    if (isStation(indexed, stationId)) return indexed;
    // A dead/stale first row can coexist with a second live row until the sweep.
    return bucket.find(entity => isStation(entity, stationId)) || null;
  }
  const found = (bucket || state?.entityList)?.find(entity => isStation(entity, stationId));
  if (found) return found;
  for (const entity of state?.entities?.values?.() || EMPTY) {
    if (isStation(entity, stationId)) return entity;
  }
  return null;
}
