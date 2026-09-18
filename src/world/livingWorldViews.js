// Living-world iteration views.
//
// Law, traffic, jobs, careers, bark, and world walk ships / stations / wrecks (and optional
// cargo interactables). Asteroids and dressing FX never enter those loops. Type buckets on
// entityIndex are the source when present; otherwise the master list is filtered.

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
  return !!(state && state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1);
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

/** Incremented on every indexed spawn/remove; a cheap "membership changed" watch for caches. */
export function entityIndexVersion(state) {
  const index = state && state.entityIndex;
  return index && index.__spacefaceEntityIndexV1 && Number.isFinite(index.version)
    ? index.version
    : null;
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
