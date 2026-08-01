// Browser-safe scene, pipeline, and residency measurement helpers shared by performance probes.
// No Three.js import is required: the helpers inspect the live Object3D and diagnostic contracts.

import { willEntityEnterAuthoredUpgradeRunway } from '../../src/render/authoredAdmissionPolicy.js';

const PERFORMANCE_RENDER_PREFETCH_RADIUS = 5200;

export const PERFORMANCE_PIPELINE_WARMUP_SCHEMA = 'spaceface.performancePipelineWarmup.v1';

export function collectPerformanceSceneStructure({ state = globalThis.SF?.state, diagnostics = readDiagnostics() } = {}) {
  const renderState = state?.render || null;
  const scene = renderState?.scene || null;
  const owners = new WeakMap();
  const entities = Array.isArray(state?.entityList) ? state.entityList : [];
  for (const entity of entities) {
    if (!entity?.mesh || typeof entity.mesh.traverse !== 'function') continue;
    const owner = ownerCategory(entity);
    entity.mesh.traverse((object) => owners.set(object, owner));
  }

  const visibleMeshByCategory = Object.create(null);
  const visibleShipMeshByRole = Object.create(null);
  const visibleShipMeshByPart = Object.create(null);
  const visibleShipMeshByRoleAndPart = Object.create(null);
  const visibleShipMeshSamples = [];
  const materialKeys = new Set();
  const materialKeyCounts = Object.create(null);
  const materialKeyCountsByCategory = Object.create(null);
  const shipMaterialKeyCounts = Object.create(null);
  const stats = {
    objects: 0,
    visibleObjects: 0,
    meshes: 0,
    visibleMeshes: 0,
    visibleNonPoolMeshes: 0,
    instancedMeshes: 0,
    visibleInstances: 0,
    castShadowObjects: 0,
    visibleMeshByCategory,
    visibleShipMeshByRole,
    visibleShipMeshByPart,
    visibleShipMeshByRoleAndPart,
    visibleShipMeshSamples,
    visibleMaterialKeys: [],
    visibleMaterialKeysByCategory: [],
    visibleShipMaterialKeys: [],
    visibleMaterialKeyCount: 0,
    surfaces: { opaque: 0, transparent: 0 },
    roles: { canopy: 0, plume: 0, fan: 0, signal: 0, decal: 0, shadowCaster: 0 },
    authoredShipStates: {},
    authoredShipAdmission: {
      relevant: 0,
      ready: 0,
      pending: 0,
      fallback: 0,
      missingMesh: 0,
      ignoredNonresident: 0,
    },
    authoredStaticBatches: { visible: 0, hidden: 0, total: 0 },
    authoredPools: {
      totalChunks: 0,
      visibleChunks: 0,
      emptyChunks: 0,
      visibleInstances: 0,
      capacity: 0,
      averageVisibleInstancesPerVisibleChunk: 0,
      lowOccupancyVisibleChunks: 0,
      chunkCounts: [],
    },
    stationPlaceHlod: {
      stationEntities: 0,
      placeEntities: 0,
      stationVisibleMeshes: 0,
      placeVisibleMeshes: 0,
      detailedVisible: Number(renderState?.hlod?.hlodDetailedVisible) || 0,
      proxyVisible: Number(renderState?.hlod?.hlodProxyVisible) || 0,
      objectsSwapped: Number(renderState?.hlod?.hlodObjectsSwapped) || 0,
    },
    memory: {
      geometries: finiteOrNull(diagnostics?.memory?.geometries),
      textures: finiteOrNull(diagnostics?.memory?.textures),
      programs: finiteOrNull(diagnostics?.memory?.programs),
      renderTargets: finiteOrNull(diagnostics?.post?.renderTargetCount),
    },
  };

  for (const entity of entities) {
    if (!entity || entity.alive === false) continue;
    const category = ownerCategory(entity);
    if (category === 'station') stats.stationPlaceHlod.stationEntities++;
    if (category === 'place') stats.stationPlaceHlod.placeEntities++;
  }

  if (scene && typeof scene.traverse === 'function') {
    scene.traverse((object) => {
      if (!object) return;
      const visible = isEffectivelyVisible(object);
      stats.objects++;
      if (visible) stats.visibleObjects++;
      const isMesh = object.isMesh || object.isInstancedMesh;
      if (isMesh) {
        stats.meshes++;
        if (visible) stats.visibleMeshes++;
      }
      if (object.isInstancedMesh) stats.instancedMeshes++;
      if (object.castShadow) stats.castShadowObjects++;
      const authoredPool = object.isInstancedMesh && object.userData?.spacefaceInstancePool;
      if (authoredPool) {
        const count = Math.max(0, Number(object.count) || 0);
        const capacity = Math.max(0, Number(object.instanceMatrix?.count) || 0);
        stats.authoredPools.totalChunks++;
        stats.authoredPools.capacity += capacity;
        stats.authoredPools.chunkCounts.push(count);
        if (count > 0 && visible) {
          stats.authoredPools.visibleChunks++;
          stats.authoredPools.visibleInstances += count;
          if (count <= 3) stats.authoredPools.lowOccupancyVisibleChunks++;
        } else stats.authoredPools.emptyChunks++;
      }
      if (object.isMesh && object.userData?.spacefaceStaticBatch) {
        stats.authoredStaticBatches.total++;
        if (visible) stats.authoredStaticBatches.visible++;
        else stats.authoredStaticBatches.hidden++;
      }
      if (!isMesh || !visible) return;

      let category = owners.get(object);
      if (object.userData?.spacefaceStaticBatch) category = 'ship:authoredStaticBatch';
      else if (object.userData?.spacefaceInstancePool) category = 'ship:authoredInstancePool';
      else if (object.userData?.sharedContactShadow) category = 'contactShadow';
      else if (!category) category = object.isInstancedMesh ? 'unowned:instanced' : 'unowned:mesh';
      increment(visibleMeshByCategory, category);
      if (category === 'station') stats.stationPlaceHlod.stationVisibleMeshes++;
      if (category === 'place') stats.stationPlaceHlod.placeVisibleMeshes++;

      const instanceCount = object.isInstancedMesh ? Math.max(0, Number(object.count) || 0) : 1;
      stats.visibleInstances += instanceCount;
      if (object.castShadow) stats.roles.shadowCaster++;

      let roleKey = null;
      let partKey = null;
      if (category === 'ship' && object.isMesh) {
        roleKey = shipMeshRoleKey(object);
        partKey = compactPartUrl(object.userData?.spacefacePartUrl);
        increment(visibleShipMeshByRole, roleKey);
        increment(visibleShipMeshByPart, partKey);
        increment(visibleShipMeshByRoleAndPart, `${roleKey} | ${partKey}`);
        if (visibleShipMeshSamples.length < 24) visibleShipMeshSamples.push({ name: object.name || '', part: partKey, role: roleKey });
      }

      const tags = object.userData?.spacefaceTags || {};
      const materials = materialList(object);
      if (tags.canopy) stats.roles.canopy += materials.length;
      if (tags.drive === 'plume') stats.roles.plume += materials.length;
      if (tags.drive === 'fan') stats.roles.fan += materials.length;
      if (tags.decal) stats.roles.decal += materials.length;
      if (tags.signal
        || tags.damageRole === 'navLight'
        || tags.damageRole === 'sensor'
        || String(tags.vfxRole || '').includes('signal')
        || /signal/i.test(object.name || '')) stats.roles.signal += materials.length;
      for (const material of materials) {
        if (material?.transparent === true || Number(material?.transmission) > 0) stats.surfaces.transparent++;
        else stats.surfaces.opaque++;
        const key = materialKey(material);
        materialKeys.add(key);
        increment(materialKeyCounts, key);
        increment(materialKeyCountsByCategory, `${category} | ${key}`);
        if (category === 'ship' && roleKey && partKey) increment(shipMaterialKeyCounts, `${partKey} | ${roleKey} | ${key}`);
      }

      if (!authoredPool) {
        stats.visibleNonPoolMeshes++;
      }
    });
  }

  stats.visibleMaterialKeys = rankedCounts(materialKeyCounts, 32);
  stats.visibleMaterialKeysByCategory = rankedCounts(materialKeyCountsByCategory, 32);
  stats.visibleShipMaterialKeys = rankedCounts(shipMaterialKeyCounts, 48);
  const authored = authoredAssetStatus(state);
  stats.authoredShipAdmission = {
    relevant: authored.shipCount,
    ready: authored.readyCount,
    pending: authored.pendingCount,
    fallback: authored.fallbackCount,
    missingMesh: authored.missingMeshCount,
    ignoredNonresident: authored.ignoredNonresidentCount,
  };
  for (const entity of authored.entities) {
    const assetState = entity.assetState || 'unknown';
    stats.authoredShipStates[assetState] = (stats.authoredShipStates[assetState] || 0) + 1;
  }
  if (stats.authoredPools.visibleChunks > 0) {
    stats.authoredPools.averageVisibleInstancesPerVisibleChunk =
      stats.authoredPools.visibleInstances / stats.authoredPools.visibleChunks;
  }
  stats.authoredPools.chunkCounts.sort((a, b) => a - b);
  stats.visibleMaterialKeyCount = materialKeys.size;
  // Preserve the long-lived profile artifact shape while also publishing the grouped HLOD view.
  stats.hlodDetailedVisible = stats.stationPlaceHlod.detailedVisible;
  stats.hlodProxyVisible = stats.stationPlaceHlod.proxyVisible;
  stats.hlodObjectsSwapped = stats.stationPlaceHlod.objectsSwapped;
  return stats;
}

export function collectPerformancePipelineReadiness({
  state = globalThis.SF?.state,
  registry = globalThis.SF?.registry,
  diagnostics = readDiagnostics(),
  resourceStartTime = 0,
  measurementHorizonMs = 0,
} = {}) {
  const renderSystem = registry && typeof registry.get === 'function' ? registry.get('render') : null;
  const renderState = state?.render || {};
  const queueRemaining = Array.isArray(renderSystem?._meshBuildQueue)
    ? Math.max(0, renderSystem._meshBuildQueue.length - (renderSystem._meshBuildQueueHead || 0))
    : null;
  const upgrade = renderState.scene?.userData?.authoredUpgradeDiagnostics || null;
  const authored = authoredAssetStatus(state);
  const admissionRiskEntities = pendingAdmissionRiskEntities(state, measurementHorizonMs);
  const resources = typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function'
    ? performance.getEntriesByType('resource')
      .filter((entry) => entry.startTime >= resourceStartTime && /(?:assets|vendor)\//.test(String(entry.name || '')))
      .slice(-128)
      .map((entry) => ({
        name: compactResourceName(entry.name),
        startTime: entry.startTime,
        durationMs: entry.duration,
        transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize,
      }))
    : [];
  return {
    // Pending entities use the graphics admission contract's zero-draw boundary: they are not a
    // procedural fallback and must not hold the playable opening route behind a whole-sector drain.
    authoredReady: authored.shipCount > 0
      && authored.readyCount > 0
      && authored.fallbackCount === 0,
    authoredShipCount: authored.shipCount,
    authoredReadyCount: authored.readyCount,
    authoredPendingCount: authored.pendingCount,
    authoredPendingAdmissionRiskCount: admissionRiskEntities.length,
    authoredPendingAdmissionRiskEntities: admissionRiskEntities,
    authoredPresentedCount: authored.readyCount,
    authoredFallbackCount: authored.fallbackCount,
    authoredMissingMeshCount: authored.missingMeshCount,
    authoredIgnoredNonresidentCount: authored.ignoredNonresidentCount,
    authoredEntityStates: authored.entities,
    authoredPartLibraryPromisePresent: isPromiseLike(renderState.authoredPartLibraryReady),
    pipelinePrecompilePromisePresent: isPromiseLike(renderState.pipelinePrecompileReady),
    exactPipelineWarmupPromisePresent: isPromiseLike(renderState.exactPipelineWarmupReady),
    meshBuildQueueRemaining: queueRemaining,
    meshReconcileDirty: renderSystem?._meshReconcileDirty === true,
    pipelineCompilePending: finiteOrNull(renderState.pipelineAdmissions?.pending),
    programCount: finiteOrNull(diagnostics?.memory?.programs),
    recentResources: resources,
    recentAdmissions: Array.isArray(upgrade?.jobs) ? upgrade.jobs.slice(-128).map(plainAdmission) : [],
    activeAdmissionJobs: finiteOrNull(upgrade?.activeJobs),
    maxConcurrentAdmissionJobs: finiteOrNull(upgrade?.maxConcurrentJobs),
    maxConcurrentDecode: finiteOrNull(upgrade?.maxConcurrentDecode),
    assetResidency: plainObject(renderState.assetResidency),
  };
}

export function performancePipelineFingerprint(readiness = {}) {
  const residency = readiness?.assetResidency || {};
  return {
    programCount: finiteOrNull(readiness?.programCount),
    activeAdmissionJobs: finiteOrNull(readiness?.activeAdmissionJobs),
    meshBuildQueueRemaining: finiteOrNull(readiness?.meshBuildQueueRemaining),
    meshReconcileDirty: readiness?.meshReconcileDirty === true,
    pipelineCompilePending: finiteOrNull(readiness?.pipelineCompilePending),
    authoredPendingCount: finiteOrNull(readiness?.authoredPendingCount),
    authoredPendingAdmissionRiskCount: finiteOrNull(readiness?.authoredPendingAdmissionRiskCount),
    residentAssets: finiteOrNull(residency?.residentAssets),
    residentResources: finiteOrNull(residency?.residentResources),
  };
}

export function isPerformancePipelineSettled(readiness = {}) {
  const fingerprint = performancePipelineFingerprint(readiness);
  return fingerprint.programCount != null
    && fingerprint.activeAdmissionJobs === 0
    && fingerprint.meshBuildQueueRemaining === 0
    && fingerprint.meshReconcileDirty === false
    && fingerprint.authoredPendingAdmissionRiskCount === 0
    && (fingerprint.pipelineCompilePending == null || fingerprint.pipelineCompilePending === 0);
}

function pendingAdmissionRiskEntities(state, measurementHorizonMs) {
  const horizonSeconds = Math.max(0, Number(measurementHorizonMs) || 0) / 1000;
  const result = [];
  for (const entity of state?.entityList || []) {
    if (entity?.type !== 'ship' || entity.alive === false) continue;
    const assetState = entity.mesh?.userData?.authoredAssetState;
    if (entity.presentationAdmission !== 'pending' || ![
      'awaiting-authored-admission',
      'loading',
      'compiling-pipelines',
    ].includes(assetState)) continue;
    if (!willEntityEnterAuthoredUpgradeRunway(entity, state, { horizonSeconds })) continue;
    result.push({
      id: entity.id ?? null,
      defId: entity.data?.defId || null,
      distanceToPlayer: performanceDistanceToPlayer(entity, state),
    });
  }
  return result;
}

function readDiagnostics() {
  try {
    return globalThis.__THREE_GAME_DIAGNOSTICS__?.getReport?.() || null;
  } catch {
    return null;
  }
}

function ownerCategory(entity) {
  if (entity?.type === 'station') return 'station';
  if (entity?.data?.placeId || entity?.data?.landmarkGlb || entity?.data?.archetypeGlb) return 'place';
  return entity?.type || 'entity:unknown';
}

export function authoredAssetStatus(state) {
  const result = {
    shipCount: 0,
    readyCount: 0,
    pendingCount: 0,
    fallbackCount: 0,
    missingMeshCount: 0,
    ignoredNonresidentCount: 0,
    entities: [],
  };
  for (const entity of state?.entityList || []) {
    if (entity?.type !== 'ship' || entity.alive === false) continue;
    if (!isPerformanceRelevantShip(entity, state)) {
      result.ignoredNonresidentCount++;
      continue;
    }
    result.shipCount++;
    const detail = {
      id: entity.id ?? null,
      defId: entity.data?.defId || null,
      trafficRole: entity.data?.trafficRole || null,
      sectorId: performanceEntitySectorId(entity),
      distanceToPlayer: performanceDistanceToPlayer(entity, state),
      admission: entity.presentationAdmission || null,
      assetState: entity.mesh?.userData?.authoredAssetState || 'missing-mesh',
    };
    result.entities.push(detail);
    if (!entity.mesh) {
      result.missingMeshCount++;
      result.fallbackCount++;
      continue;
    }
    const assetState = entity.mesh.userData?.authoredAssetState;
    const admission = entity.presentationAdmission;
    if ((assetState === 'authored' || assetState === 'authored-with-cleanup-error')
        && (admission === 'ready' || admission == null)) {
      result.readyCount++;
    } else if (admission === 'pending' && (
      assetState === 'awaiting-authored-admission'
      || assetState === 'loading'
      || assetState === 'compiling-pipelines'
    )) {
      result.pendingCount++;
    } else {
      result.fallbackCount++;
    }
  }
  return result;
}

function performanceEntitySectorId(entity) {
  const data = entity?.data || {};
  return entity?.homeSectorId || data.homeSectorId || data.sectorId || null;
}

function performanceDistanceToPlayer(entity, state) {
  const player = state?.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : (state?.entityList || []).find((candidate) => candidate?.id === state?.playerId);
  if (!player?.pos || !entity?.pos) return null;
  const dx = Number(entity.pos.x) - Number(player.pos.x);
  const dz = Number(entity.pos.z) - Number(player.pos.z);
  return Number.isFinite(dx) && Number.isFinite(dz) ? Math.hypot(dx, dz) : null;
}

function isPerformanceRelevantShip(entity, state) {
  if (entity?._noMesh) return false;
  if (entity?.id === state?.playerId || entity?.isPlayer === true) return true;
  const sectorId = performanceEntitySectorId(entity);
  const currentSectorId = state?.world?.currentSectorId || null;
  if (sectorId && currentSectorId) return String(sectorId) === String(currentSectorId);
  if (sectorId || !currentSectorId) return true;
  const distance = performanceDistanceToPlayer(entity, state);
  return distance != null && distance <= PERFORMANCE_RENDER_PREFETCH_RADIUS;
}

function isEffectivelyVisible(object) {
  for (let current = object; current; current = current.parent) if (current.visible === false) return false;
  return true;
}

function materialList(object) {
  return (Array.isArray(object?.material) ? object.material : [object?.material]).filter(Boolean);
}

function materialKey(material) {
  if (!material) return 'none';
  const name = material.name || material.type || 'material';
  const transparent = material.transparent ? ':transparent' : ':opaque';
  const blending = material.blending != null ? `:blend${material.blending}` : '';
  return `${name}${transparent}${blending}`;
}

function shipMeshRoleKey(object) {
  const tags = object?.userData?.spacefaceTags || {};
  const reasons = [];
  if (tags.instance === false) reasons.push('instance:false');
  if (tags.canopy) reasons.push('canopy');
  if (tags.drive) reasons.push(`drive:${tags.drive}`);
  if (tags.damageRole) reasons.push(`damageRole:${tags.damageRole}`);
  if (tags.vfxRole) reasons.push(`vfxRole:${tags.vfxRole}`);
  if (tags.decal) reasons.push('decal');
  for (const material of materialList(object)) {
    if (material.transparent) reasons.push('transparent');
    if (Number(material.transmission) > 0) reasons.push('transmission');
    if (material.depthWrite === false) reasons.push('depthWrite:false');
  }
  if (!reasons.length) reasons.push('unclassified');
  return [...new Set(reasons)].join('+');
}

function compactPartUrl(url) {
  if (!url) return 'unknown';
  return String(url).split(/[\\/]/).filter(Boolean).slice(-2).join('/');
}

function compactResourceName(url) {
  try {
    const parsed = new URL(url, globalThis.location?.href || 'http://localhost/');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return String(url || '');
  }
}

function rankedCounts(counts, limit) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function plainAdmission(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => (
    value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  )));
}

function plainObject(value) {
  if (!value || typeof value !== 'object') return null;
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => (
    entry == null || typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
  )));
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function isPromiseLike(value) {
  return !!value && typeof value.then === 'function';
}
