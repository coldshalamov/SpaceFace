// Living-world iteration views.
//
// Law, traffic, jobs, careers, bark, and world walk ships / stations / wrecks (and optional
// cargo interactables). Asteroids and dressing FX never enter those loops. Type buckets on
// entityIndex are the source when present; otherwise the master list is filtered.

// Lane counters can never reach this in a session (one bump per indexed append/remove), so
// epoch*STRIDE + sum stays a collision-free ordering key well inside float precision.
const LANE_EPOCH_STRIDE = 1e9;

export function isDressingEntity(entity) {
  return !!(entity && entity.type === 'fx');
}

export function isFieldRockEntity(entity) {
  return !!(entity && entity.type === 'asteroid');
}

export function isLivingWorldActor(entity) {
  if (!entity || entity.alive === false) return false;
  const type = entity.type;
  if (type === 'asteroid' || type === 'fx') return false;
  return type === 'ship' || type === 'drone' || type === 'station' || type === 'wreck';
}

export function isJobInteractable(entity) {
  if (!entity || entity.alive === false) return false;
  const type = entity.type;
  if (type === 'asteroid' || type === 'fx') return false;
  return type === 'ship' || type === 'drone' || type === 'station' || type === 'wreck'
    || type === 'payload' || type === 'pickup';
}

function visitArray(list, fn) {
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false) continue;
    fn(entity);
  }
}

function hasEntityIndex(state) {
  // Marker+ready, same gate the strict accessors use: repairEntityIndex can reset ready
  // mid-run, and serving the emptied buckets then would diverge from the entityList domain
  // the unready readers fall back to.
  return !!(state && state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1
    && state.entityIndex.ready === true);
}

const EMPTY_SHIP_LIKE = [];

/**
 * Compact AI/traffic scan. Production indexes ships+drones on `shipLike`;
 * the fat `entityList` (rocks, FX, wrecks) is the fallback only.
 * Returns the live array — callers must not store or mutate it.
 */
export function indexedShipLikeScan(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true
    && Array.isArray(index.shipLike)) {
    return index.shipLike;
  }
  return (state && state.entityList) || EMPTY_SHIP_LIKE;
}

/**
 * Same as indexedShipLikeScan but for systems whose fallback domain is the entity Map
 * (`state.entities.values()`), not `entityList` — e.g. minimal states that populate only the
 * Map. May return an array or a Map iterator: consume with for..of only. Ship/drone predicates
 * still apply on the fallback path, so callers keep their per-entity filter in both modes.
 */
export function indexedShipLikeOrEntitiesScan(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true
    && Array.isArray(index.shipLike)) {
    return index.shipLike;
  }
  const entities = state && state.entities;
  if (entities && typeof entities.values === 'function') return entities.values();
  return (state && state.entityList) || EMPTY_SHIP_LIKE;
}

const EMPTY_TYPE_SCAN = [];

/**
 * Compact type-bucket scan. When the entity index is ready, returns its named bucket
 * (`ships`, `asteroids`, `pickups`, `projectiles`, …); otherwise the fat `entityList`,
 * so callers must keep their per-entity predicate in both modes. The returned array is
 * live — callers must not store or mutate it.
 */
export function indexedTypeScan(state, bucket) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true
    && typeof bucket === 'string' && Array.isArray(index[bucket])) {
    return index[bucket];
  }
  return (state && state.entityList) || EMPTY_TYPE_SCAN;
}

/**
 * Post-spawn `collides` flips never touch the index — they happen on already-live entities, so
 * no lane or version bump fires. Caches whose membership predicate includes `collides` need
 * this epoch folded into their key; every flip site bumps it. In-memory only: it invalidates
 * caches, it never feeds sim output, so determinism is untouched.
 */
let _collidesFlipEpoch = 0;
export function bumpCollidesFlipEpoch() { _collidesFlipEpoch++; }
export function collidesFlipEpoch() { return _collidesFlipEpoch; }

/** Incremented on every indexed spawn/remove; a cheap "membership changed" watch for caches. */
export function entityIndexVersion(state) {
  const index = state && state.entityIndex;
  return index && index.__spacefaceEntityIndexV1 && index.ready === true
    && Number.isFinite(index.version)
    ? index.version
    : null;
}

/**
 * Membership version summed over a fixed lane set — survives churn on lanes outside it
 * (projectile volleys, pickup drops) where the global entityIndexVersion dies. -1 when the
 * index is unusable, same contract as entityIndexVersion's null.
 */
export function entityIndexLaneVersion(state, lanes) {
  const index = state && state.entityIndex;
  if (!index || index.__spacefaceEntityIndexV1 !== true || index.ready !== true) return -1;
  const laneVersions = index.laneVersions;
  if (!laneVersions) return -1;
  let sum = 0;
  for (let i = 0; i < lanes.length; i++) sum += laneVersions[lanes[i]] || 0;
  // The lane counters reset on clear and can re-accrue to the identical sum while membership
  // differs — folding the clear epoch keeps a sum-latched cache from false-matching "unchanged".
  return sum + (Number.isFinite(index.laneEpoch) ? index.laneEpoch : 0) * LANE_EPOCH_STRIDE;
}

/**
 * `worldRecordId` → live entity. The entity index carries a first-holder `byWorldRecordId`
 * map maintained at spawn/despawn, so this is O(1) once the index is ready. A miss — index
 * unready, a carrier stamped with its record id after spawn, or a duplicate keeper that
 * outlived the first holder — falls back to the same entity walk callers ran before, so no
 * record-holder is ever dropped (PERF-93). A walk hit reseeds the map; the next lookup is O(1).
 *
 * Post-spawn `data.worldRecordId` stamps (traffic's durable freight, mission target identity,
 * activityRuntime's captured dematerializations) register through
 * `registerEntityWorldRecordId` — each bumps the `worldRecordIds` lane, so a miss-memo keyed
 * on that lane is sound for per-tick callers polling possibly-absent ids: the memo only
 * serves a negative while the carrier set is bit-identical to what the fallback walk would
 * see, and any registration/append/remove invalidates it. An unregistered raw stamp keeps
 * the historical trap — a memo cannot see it — so every new stamp site must register.
 */
export function registerEntityWorldRecordId(index, entity) {
  if (!index || index.__spacefaceEntityIndexV1 !== true || !(index.byWorldRecordId instanceof Map)) return;
  if (!entity || !entity.data) return;
  const id = entity.data.worldRecordId;
  // _-prefixed stamp — shouldSkipEntitySaveKey drops it from serialized entities, and it
  // never enters `data`. It records which id this entity is COUNTED under, making repeat
  // stamps no-ops and an id swap decrement the stale lane exactly once.
  const counted = entity._wrIndexStamp;
  if (counted === id) return;
  if (counted != null) {
    if (index.byWorldRecordIdCount instanceof Map) {
      const n = (index.byWorldRecordIdCount.get(counted) || 0) - 1;
      if (n > 0) index.byWorldRecordIdCount.set(counted, n);
      else index.byWorldRecordIdCount.delete(counted);
    }
    if (index.byWorldRecordId.get(counted) === entity) index.byWorldRecordId.delete(counted);
    if (index.laneVersions) index.laneVersions.worldRecordIds = (index.laneVersions.worldRecordIds || 0) + 1;
  }
  entity._wrIndexStamp = id != null ? id : undefined;
  if (id != null) {
    // First holder wins — the same semantics appendEntityIndex uses, so map answers match the
    // entity walk every caller ran before the index existed.
    if (!index.byWorldRecordId.has(id)) index.byWorldRecordId.set(id, entity);
    if (index.byWorldRecordIdCount instanceof Map) {
      index.byWorldRecordIdCount.set(id, (index.byWorldRecordIdCount.get(id) || 0) + 1);
    }
    if (index.laneVersions) index.laneVersions.worldRecordIds = (index.laneVersions.worldRecordIds || 0) + 1;
  }
}
export function indexedWorldRecordEntity(state, worldRecordId) {
  if (!state || worldRecordId == null || worldRecordId === '') return null;
  const index = state.entityIndex;
  const map = index && index.__spacefaceEntityIndexV1 && index.ready === true
    && index.byWorldRecordId instanceof Map
    ? index.byWorldRecordId
    : null;
  if (map) {
    const hit = map.get(worldRecordId);
    if (hit && hit.alive !== false) return hit;
  }
  const entities = state.entities;
  if (entities && typeof entities.values === 'function') {
    for (const entity of entities.values()) {
      if (entity && entity.alive !== false && entity.data
        && entity.data.worldRecordId === worldRecordId) {
        // A bare map.set would diverge the bookkeeping — the reseed registers instead so the
        // count, marker, and lane all advance as if append had stamped it (an unregistered
        // carrier's marker is unset, so this is a real registration, not a no-op).
        if (map) registerEntityWorldRecordId(index, entity);
        return entity;
      }
    }
    return null;
  }
  const list = state.entityList || EMPTY_TYPE_SCAN;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (entity && entity.alive !== false && entity.data
      && entity.data.worldRecordId === worldRecordId) {
      if (map) registerEntityWorldRecordId(index, entity);
      return entity;
    }
  }
  return null;
}

/** Heist/facility dressing marked as a witness. Never asteroids. */
export function forEachExplicitWitnessMarker(state, fn) {
  if (typeof fn !== 'function') return 'none';
  const fx = indexedTypeScan(state, 'fx');
  const usedIndex = hasEntityIndex(state) && Array.isArray(state.entityIndex.fx);
  for (let i = 0; i < fx.length; i++) {
    const entity = fx[i];
    if (!entity || entity.alive === false || entity.type !== 'fx') continue;
    if (!entity.data || entity.data.lawWitness !== true) continue;
    fn(entity);
  }
  const dressing = state && state.world && state.world.dressing;
  if (dressing && Array.isArray(dressing.rows)) {
    for (let i = 0; i < dressing.rows.length; i++) {
      const row = dressing.rows[i];
      if (!row || row.alive === false || row.type !== 'fx') continue;
      if (!row.data || row.data.lawWitness !== true) continue;
      fn(row);
    }
  }
  return usedIndex ? 'index' : 'filter';
}

/**
 * Call `fn` for every living-world actor. Never yields asteroids or dressing FX.
 * Returns the source used so tests can assert the fat list was not the iterator.
 */
export function forEachLivingWorldActor(state, fn) {
  if (typeof fn !== 'function') return 'none';
  if (hasEntityIndex(state)) {
    const index = state.entityIndex;
    visitArray(index.shipLike, fn);
    visitArray(index.stations, fn);
    visitArray(index.wrecks, fn);
    return 'index';
  }
  const list = (state && state.entityList) || [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!isLivingWorldActor(entity)) continue;
    fn(entity);
  }
  return 'filter';
}

/** Cargo / tow / occupational candidates: actors plus pickups and payloads, still never rocks or FX. */
export function forEachJobInteractable(state, fn) {
  if (typeof fn !== 'function') return 'none';
  if (hasEntityIndex(state)) {
    const index = state.entityIndex;
    visitArray(index.shipLike, fn);
    visitArray(index.stations, fn);
    visitArray(index.wrecks, fn);
    visitArray(index.payloads, fn);
    visitArray(index.pickups, fn);
    return 'index';
  }
  const list = (state && state.entityList) || [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!isJobInteractable(entity)) continue;
    fn(entity);
  }
  return 'filter';
}

/** Scanned / mineable rocks from the compact field plus live promoted asteroids. */
export function forEachFieldRock(state, fn) {
  if (typeof fn !== 'function') return 'none';
  const field = state && state.world && state.world.asteroidField;
  if (field && Array.isArray(field.rocks)) {
    for (let i = 0; i < field.rocks.length; i++) {
      const rec = field.rocks[i];
      if (!rec || rec.alive === false || rec.liveEntityId != null) continue;
      fn(rec);
    }
  }
  if (hasEntityIndex(state)) {
    visitArray(state.entityIndex.asteroids, fn);
    return field ? 'field+index' : 'index';
  }
  const list = (state && state.entityList) || [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!isFieldRockEntity(entity) || entity.alive === false) continue;
    fn(entity);
  }
  return field ? 'field+filter' : 'filter';
}

export function livingWorldActorSeenTypes(state) {
  const types = new Set();
  forEachLivingWorldActor(state, (entity) => {
    if (entity && entity.type) types.add(entity.type);
  });
  return [...types].sort();
}

export function collectLivingWorldActors(state, out = []) {
  out.length = 0;
  forEachLivingWorldActor(state, (entity) => { out.push(entity); });
  return out;
}

export function findLivingWorldActor(state, predicate) {
  let found = null;
  forEachLivingWorldActor(state, (entity) => {
    if (found || typeof predicate !== 'function' || !predicate(entity)) return;
    found = entity;
  });
  return found;
}

/** Compact far-table walk. Does not yield combat-list entities. */
export function forEachFarActor(state, fn) {
  if (typeof fn !== 'function') return 'none';
  const table = state && state.world && state.world.farActors;
  if (!table || !Array.isArray(table.rows)) return 'none';
  for (let i = 0; i < table.rows.length; i++) {
    const rec = table.rows[i];
    if (!rec || rec.alive === false) continue;
    fn(rec);
  }
  return 'far';
}

export function findFarActor(state, predicate) {
  let found = null;
  forEachFarActor(state, (rec) => {
    if (found || typeof predicate !== 'function' || !predicate(rec)) return;
    found = rec;
  });
  return found;
}
