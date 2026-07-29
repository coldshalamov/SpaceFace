export function hasActiveSpatialHash(hash) {
  return !!(hash && typeof hash.queryRadius === 'function' &&
    hash.diagnostics && hash.diagnostics.activeBuckets > 0);
}

export function queryNearbyEntities(state, pos, radius, out, fallback) {
  out.length = 0;
  if (pos && hasActiveSpatialHash(state && state.spatialHash)) {
    state.spatialHash.queryRadius(pos.x, pos.z, radius, out);
    return out;
  }
  return fallback || (state && state.entityList) || out;
}

function compareStableIds(left, right) {
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function liveEntityForId(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  const entity = state.entities.get(id);
  return entity && entity.alive ? entity : null;
}

function candidateMatches(entity, entityType, team) {
  return !!(entity && entity.pos
    && (entityType == null || entity.type === entityType)
    && (team == null || entity.team === team));
}

function considerNearest(state, request, id, entityType, team, diagnostics = null) {
  if (id == null || id === request.sourceEntityId || request.seenIds.has(id)) return;
  request.seenIds.add(id);
  if (diagnostics) diagnostics.queryCandidates++;

  const entity = liveEntityForId(state, id);
  if (!candidateMatches(entity, entityType, team)) return;
  const dx = entity.pos.x - request.x;
  const dz = entity.pos.z - request.z;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq < request.bestDistanceSq || (
    request.resultId != null && distanceSq === request.bestDistanceSq
      && compareStableIds(id, request.resultId) < 0
  )) {
    request.bestDistanceSq = distanceSq;
    request.resultId = id;
  }
}

/**
 * Deterministic full-domain oracle for the nearest-query contract. It resolves every candidate
 * through the authoritative entity map and orders exact ties by stable entity ID.
 */
export function findNearestEntityIdFullScan(state, request, options = {}) {
  const entityType = options.entityType ?? null;
  const team = options.team ?? null;
  const source = state && Array.isArray(state.entityList) ? state.entityList : [];
  const radius = positive(request && request.r);
  const x = Number(request && request.x);
  const z = Number(request && request.z);
  let resultId = null;
  let bestDistanceSq = radius * radius;

  if (!Number.isFinite(x) || !Number.isFinite(z) || radius <= 0) return null;
  for (let index = 0; index < source.length; index++) {
    const sourceEntity = source[index];
    const entity = liveEntityForId(state, sourceEntity && sourceEntity.id);
    if (!candidateMatches(entity, entityType, team)
      || entity.id === request.sourceEntityId) continue;
    const dx = entity.pos.x - x;
    const dz = entity.pos.z - z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < bestDistanceSq || (
      resultId != null && distanceSq === bestDistanceSq
        && compareStableIds(entity.id, resultId) < 0
    )) {
      bestDistanceSq = distanceSq;
      resultId = entity.id;
    }
  }
  return resultId;
}

/**
 * Create one bounded nearest-entity batch owner around the existing SpatialHash. Request objects,
 * candidate arrays, and dedupe sets grow to a high-water mark and are then reused. Candidate object
 * references are cleared before execute() returns; callers retain only scalar request/result IDs.
 */
export function createNearestEntityQueryService(initialState, options = {}) {
  let state = initialState;
  const entityType = options.entityType ?? null;
  const team = options.team ?? null;
  const fallbackIndex = typeof options.fallbackIndex === 'string' ? options.fallbackIndex : null;
  const shadow = options.shadow === true;
  const rejectShadowMismatch = options.rejectShadowMismatch !== false;
  const requests = [];
  const requestPool = [];
  const spawnedEntityIds = [];
  const spawnedEntitySet = new Set();
  const exceptionalEntityIds = [];
  const exceptionalEntityPositions = new Map();
  let exceptionalSeeded = false;
  const diagnostics = {
    queryBatches: 0,
    spatialBatches: 0,
    fallbackBatches: 0,
    queryRequests: 0,
    queryCandidates: 0,
    queryResults: 0,
    queryScratchGrowth: 0,
    spawnSupplements: 0,
    exceptionalCandidates: 0,
    exceptionalEntities: 0,
    shadowChecks: 0,
    shadowMismatches: 0,
    lastBatchRequests: 0,
    lastBatchCandidates: 0,
    highWaterRequests: 0,
  };

  function setState(nextState) {
    if (state !== nextState) {
      state = nextState;
      spawnedEntityIds.length = 0;
      spawnedEntitySet.clear();
      exceptionalEntityIds.length = 0;
      exceptionalEntityPositions.clear();
      exceptionalSeeded = false;
      diagnostics.exceptionalEntities = 0;
    }
    return service;
  }

  function begin() {
    for (let index = 0; index < requests.length; index++) {
      const request = requests[index];
      request.out.length = 0;
      request.seenIds.clear();
      request.requestId = null;
      request.sourceEntityId = null;
      request.resultId = null;
    }
    requests.length = 0;
    return service;
  }

  function request(requestId, sourceEntityId, x, z, radius) {
    const index = requests.length;
    let entry = requestPool[index];
    if (!entry) {
      entry = {
        requestId: null,
        sourceEntityId: null,
        entityType,
        team,
        limit: 1,
        x: 0,
        z: 0,
        r: 0,
        radiusSq: 0,
        out: [],
        seenIds: new Set(),
        resultId: null,
        bestDistanceSq: 0,
      };
      requestPool[index] = entry;
      diagnostics.queryScratchGrowth++;
    }

    const nextX = Number(x);
    const nextZ = Number(z);
    const nextRadius = positive(radius);
    entry.requestId = requestId;
    entry.sourceEntityId = sourceEntityId;
    entry.x = Number.isFinite(nextX) ? nextX : 0;
    entry.z = Number.isFinite(nextZ) ? nextZ : 0;
    entry.r = Number.isFinite(nextX) && Number.isFinite(nextZ) ? nextRadius : 0;
    entry.radiusSq = entry.r * entry.r;
    entry.out.length = 0;
    entry.seenIds.clear();
    entry.resultId = null;
    entry.bestDistanceSq = entry.radiusSq;
    requests.push(entry);
    if (requests.length > diagnostics.highWaterRequests) diagnostics.highWaterRequests = requests.length;
    return entry;
  }

  function addExceptionalEntityId(id) {
    if (id == null || exceptionalEntityPositions.has(id)) return;
    exceptionalEntityPositions.set(id, exceptionalEntityIds.length);
    exceptionalEntityIds.push(id);
    diagnostics.exceptionalEntities = exceptionalEntityIds.length;
  }

  function removeExceptionalEntityId(id) {
    const index = exceptionalEntityPositions.get(id);
    if (index == null) return;
    const lastIndex = exceptionalEntityIds.length - 1;
    const lastId = exceptionalEntityIds[lastIndex];
    exceptionalEntityIds.pop();
    exceptionalEntityPositions.delete(id);
    if (index !== lastIndex) {
      exceptionalEntityIds[index] = lastId;
      exceptionalEntityPositions.set(lastId, index);
    }
    diagnostics.exceptionalEntities = exceptionalEntityIds.length;
  }

  function recordSpawn(payload) {
    const entity = payload && typeof payload === 'object' && payload.entity || null;
    const id = payload && typeof payload === 'object'
      ? (payload.id != null ? payload.id : entity && entity.id)
      : payload;
    if (id == null) return;
    if (!spawnedEntitySet.has(id)) {
      spawnedEntitySet.add(id);
      spawnedEntityIds.push(id);
    }
    const live = entity || liveEntityForId(state, id);
    if (live && !live.collides) addExceptionalEntityId(id);
  }

  function recordDestroy(payload) {
    const id = payload && typeof payload === 'object'
      ? (payload.id != null ? payload.id : payload.entityId)
      : payload;
    if (id != null) removeExceptionalEntityId(id);
  }

  function fallbackSource() {
    const index = state && state.entityIndex;
    if (fallbackIndex && index && index.__spacefaceEntityIndexV1
      && Array.isArray(index[fallbackIndex])) return index[fallbackIndex];
    return state && Array.isArray(state.entityList) ? state.entityList : [];
  }

  function seedExceptionalEntities() {
    if (exceptionalSeeded) return;
    exceptionalSeeded = true;
    const source = fallbackSource();
    for (let index = 0; index < source.length; index++) {
      const sourceEntity = source[index];
      const entity = liveEntityForId(state, sourceEntity && sourceEntity.id);
      if (entity && !entity.collides) addExceptionalEntityId(entity.id);
    }
    diagnostics.exceptionalEntities = exceptionalEntityIds.length;
  }

  function execute() {
    const requestCount = requests.length;
    diagnostics.lastBatchRequests = requestCount;
    diagnostics.lastBatchCandidates = 0;
    if (requestCount === 0) {
      spawnedEntityIds.length = 0;
      spawnedEntitySet.clear();
      return requests;
    }

    diagnostics.queryBatches++;
    diagnostics.queryRequests += requestCount;
    const candidatesBefore = diagnostics.queryCandidates;
    const hash = state && state.spatialHash;

    if (hasActiveSpatialHash(hash) && typeof hash.queryRadiusBatch === 'function') {
      seedExceptionalEntities();
      hash.queryRadiusBatch(requests);
      diagnostics.spatialBatches++;
      for (let requestIndex = 0; requestIndex < requestCount; requestIndex++) {
        const entry = requests[requestIndex];
        for (let candidateIndex = 0; candidateIndex < entry.out.length; candidateIndex++) {
          const candidate = entry.out[candidateIndex];
          considerNearest(state, entry, candidate && candidate.id, entityType, team, diagnostics);
        }
      }
      for (let candidateIndex = 0; candidateIndex < exceptionalEntityIds.length; candidateIndex++) {
        const id = exceptionalEntityIds[candidateIndex];
        for (let requestIndex = 0; requestIndex < requestCount; requestIndex++) {
          diagnostics.exceptionalCandidates++;
          considerNearest(state, requests[requestIndex], id, entityType, team, diagnostics);
        }
      }
    } else {
      diagnostics.fallbackBatches++;
      const source = fallbackSource();
      for (let candidateIndex = 0; candidateIndex < source.length; candidateIndex++) {
        const candidate = source[candidateIndex];
        const id = candidate && candidate.id;
        for (let requestIndex = 0; requestIndex < requestCount; requestIndex++) {
          considerNearest(state, requests[requestIndex], id, entityType, team, diagnostics);
        }
      }
    }

    for (let candidateIndex = 0; candidateIndex < spawnedEntityIds.length; candidateIndex++) {
      const id = spawnedEntityIds[candidateIndex];
      for (let requestIndex = 0; requestIndex < requestCount; requestIndex++) {
        considerNearest(state, requests[requestIndex], id, entityType, team, diagnostics);
      }
    }
    diagnostics.spawnSupplements += spawnedEntityIds.length;
    spawnedEntityIds.length = 0;
    spawnedEntitySet.clear();

    let mismatch = null;
    for (let requestIndex = 0; requestIndex < requestCount; requestIndex++) {
      const entry = requests[requestIndex];
      if (entry.resultId != null) diagnostics.queryResults++;
      if (shadow) {
        diagnostics.shadowChecks++;
        const expected = findNearestEntityIdFullScan(state, entry, { entityType, team });
        if (expected !== entry.resultId) {
          diagnostics.shadowMismatches++;
          if (!mismatch) {
            mismatch = `nearest-query mismatch for ${entry.requestId}: expected ${expected}, got ${entry.resultId}`;
          }
        }
      }
      entry.out.length = 0;
      entry.seenIds.clear();
    }

    diagnostics.lastBatchCandidates = diagnostics.queryCandidates - candidatesBefore;
    if (mismatch && rejectShadowMismatch) throw new Error(mismatch);
    return requests;
  }

  function reset() {
    begin();
    spawnedEntityIds.length = 0;
    spawnedEntitySet.clear();
    exceptionalEntityIds.length = 0;
    exceptionalEntityPositions.clear();
    exceptionalSeeded = false;
    diagnostics.exceptionalEntities = 0;
    diagnostics.lastBatchRequests = 0;
    diagnostics.lastBatchCandidates = 0;
    return service;
  }

  const service = {
    setState,
    begin,
    request,
    recordSpawn,
    recordDestroy,
    execute,
    reset,
    getRequests: () => requests,
    getRequestPool: () => requestPool,
    getDiagnostics: () => diagnostics,
  };
  return service;
}
