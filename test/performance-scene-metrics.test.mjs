import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  authoredAssetStatus,
  collectPerformancePipelineReadiness,
  collectPerformanceSceneStructure,
  isPerformancePipelineSettled,
  performanceAdmissionHorizonMs,
  performancePipelineFingerprint,
} from '../scripts/lib/performanceSceneMetrics.mjs';

function node(properties = {}, children = []) {
  const value = { visible: true, userData: {}, children, ...properties };
  for (const child of children) child.parent = value;
  value.traverse = (visit) => {
    visit(value);
    for (const child of children) child.traverse ? child.traverse(visit) : visit(child);
  };
  return value;
}

test('scene metrics count actual visible instances, surfaces, semantic roles, and HLOD', () => {
  const canopy = node({
    isMesh: true,
    name: 'Canopy',
    castShadow: true,
    material: { name: 'Glass', transparent: true, blending: 1, depthWrite: false },
    userData: { spacefaceTags: { canopy: true } },
  });
  const plume = node({
    isMesh: true,
    name: 'Drive Plume',
    material: { name: 'Plume', transparent: true, blending: 2 },
    userData: { spacefaceTags: { drive: 'plume' }, spacefacePartUrl: 'engines/test.glb' },
  });
  const hull = node({
    isInstancedMesh: true,
    isMesh: true,
    count: 10,
    instanceMatrix: { count: 64 },
    material: { name: 'Hull', transparent: false, blending: 1 },
    userData: { spacefaceInstancePool: true },
  });
  const stationMesh = node({ isMesh: true, material: { name: 'Station', transparent: false } });
  const shipRoot = node({ userData: { authoredAssetState: 'authored' } }, [canopy, plume]);
  const stationRoot = node({}, [stationMesh]);
  const scene = node({}, [shipRoot, stationRoot, hull]);
  const ship = { type: 'ship', alive: true, mesh: shipRoot, data: {} };
  const station = { type: 'station', alive: true, mesh: stationRoot, data: { stationId: 'station_test' } };
  const state = {
    entityList: [ship, station],
    render: { scene, hlod: { hlodDetailedVisible: 2, hlodProxyVisible: 3, hlodObjectsSwapped: 4 } },
  };
  const result = collectPerformanceSceneStructure({
    state,
    diagnostics: { memory: { geometries: 7, textures: 8, programs: 9 }, post: { renderTargetCount: 5 } },
  });
  assert.equal(result.visibleMeshes, 4);
  assert.equal(result.visibleInstances, 13);
  assert.deepEqual(result.surfaces, { opaque: 2, transparent: 2 });
  assert.equal(result.roles.canopy, 1);
  assert.equal(result.roles.plume, 1);
  assert.equal(result.roles.shadowCaster, 1);
  assert.deepEqual(result.authoredShipAdmission, {
    relevant: 1,
    ready: 1,
    pending: 0,
    fallback: 0,
    missingMesh: 0,
    ignoredNonresident: 0,
  });
  assert.equal(result.authoredPools.visibleChunks, 1);
  assert.equal(result.authoredPools.visibleInstances, 10);
  assert.equal(result.stationPlaceHlod.stationEntities, 1);
  assert.equal(result.stationPlaceHlod.stationVisibleMeshes, 1);
  assert.equal(result.stationPlaceHlod.proxyVisible, 3);
  assert.deepEqual(result.memory, { geometries: 7, textures: 8, programs: 9, renderTargets: 5 });
});

test('pipeline readiness exposes queue, fallback, admission, residency, and recent resource truth', () => {
  const originalPerformance = globalThis.performance;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: {
      getEntriesByType: () => [
        { name: 'http://localhost/assets/ships/release/parts/test.glb', startTime: 12, duration: 3, transferSize: 4, decodedBodySize: 5 },
        { name: 'http://localhost/src/main.js', startTime: 13, duration: 1, transferSize: 2, decodedBodySize: 2 },
      ],
    },
  });
  try {
    const scene = { userData: { authoredUpgradeDiagnostics: {
      activeJobs: 1,
      maxConcurrentJobs: 2,
      maxConcurrentDecode: 1,
      jobs: [{ status: 'authored', durationMs: 3, nested: {} }],
    } } };
    const state = {
      entityList: [{ type: 'ship', alive: true, mesh: { userData: { authoredAssetState: 'fallback' } } }],
      render: {
        scene,
        authoredPartLibraryReady: Promise.resolve(),
        pipelinePrecompileReady: Promise.resolve(),
        exactPipelineWarmupReady: Promise.resolve(),
        assetResidency: { residentBytes: 123, nested: {} },
      },
    };
    const renderSystem = { _meshBuildQueue: [1, 2, 3], _meshBuildQueueHead: 1, _meshReconcileDirty: true };
    const result = collectPerformancePipelineReadiness({
      state,
      registry: { get: () => renderSystem },
      diagnostics: { memory: { programs: 9 } },
      resourceStartTime: 10,
    });
    assert.equal(result.authoredReady, false);
    assert.equal(result.authoredFallbackCount, 1);
    assert.equal(result.meshBuildQueueRemaining, 2);
    assert.equal(result.meshReconcileDirty, true);
    assert.equal(result.programCount, 9);
    assert.equal(result.recentResources.length, 1);
    assert.equal(result.recentAdmissions[0].status, 'authored');
    assert.deepEqual(result.assetResidency, { residentBytes: 123 });
  } finally {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: originalPerformance });
  }
});

test('pipeline warmup fingerprint tracks compile, admission, queue, and residency quiescence', () => {
  const readiness = {
    programCount: 42,
    activeAdmissionJobs: 0,
    meshBuildQueueRemaining: 0,
    meshReconcileDirty: false,
    pipelineCompilePending: 0,
    authoredPendingCount: 4,
    authoredPendingAdmissionRiskCount: 0,
    assetResidency: { residentAssets: 27, residentResources: 799, residentBytes: 123 },
    recentResources: [{ name: 'ignored-by-fingerprint.glb' }],
  };
  assert.deepEqual(performancePipelineFingerprint(readiness), {
    programCount: 42,
    activeAdmissionJobs: 0,
    meshBuildQueueRemaining: 0,
    meshReconcileDirty: false,
    pipelineCompilePending: 0,
    authoredPendingCount: 4,
    authoredPendingAdmissionRiskCount: 0,
    residentAssets: 27,
    residentResources: 799,
  });
  assert.equal(isPerformancePipelineSettled(readiness), true);

  for (const unsettled of [
    { activeAdmissionJobs: 1 },
    { meshBuildQueueRemaining: 1 },
    { meshReconcileDirty: true },
    { pipelineCompilePending: 1 },
    { authoredPendingAdmissionRiskCount: 1 },
    { programCount: null },
  ]) {
    assert.equal(isPerformancePipelineSettled({ ...readiness, ...unsettled }), false);
  }
});

test('pipeline warmup predicts inbound authored admission across the measured horizon', () => {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    presentationAdmission: 'ready',
    mesh: { userData: { authoredAssetState: 'authored' } },
  };
  const inbound = {
    id: 2,
    type: 'ship',
    alive: true,
    pos: { x: 2488, z: 0 },
    vel: { x: -190, z: 0 },
    presentationAdmission: 'pending',
    mesh: { userData: { authoredAssetState: 'awaiting-authored-admission' } },
    data: { defId: 'ship_kestrel' },
  };
  const outbound = {
    id: 3,
    type: 'ship',
    alive: true,
    pos: { x: 1800, z: 0 },
    vel: { x: 190, z: 0 },
    presentationAdmission: 'pending',
    mesh: { userData: { authoredAssetState: 'awaiting-authored-admission' } },
    data: { defId: 'ship_wasp' },
  };
  const state = {
    playerId: 1,
    player: { targetId: null },
    entities: new Map([[1, player], [2, inbound], [3, outbound]]),
    entityList: [player, inbound, outbound],
    render: { scene: { userData: { authoredUpgradeDiagnostics: { activeJobs: 0, jobs: [] } } } },
  };
  const renderSystem = { _meshBuildQueue: [], _meshBuildQueueHead: 0, _meshReconcileDirty: false };
  const options = {
    state,
    registry: { get: () => renderSystem },
    diagnostics: { memory: { programs: 9 } },
  };

  const now = collectPerformancePipelineReadiness(options);
  assert.equal(now.authoredPendingAdmissionRiskCount, 0,
    'the live zero-horizon predicate must not start the 2488-unit boundary yet');

  const measured = collectPerformancePipelineReadiness({ ...options, measurementHorizonMs: 5_000 });
  assert.deepEqual(measured.authoredPendingAdmissionRiskEntities.map((entity) => entity.id), [2]);
  assert.equal(isPerformancePipelineSettled(measured), false,
    'an inbound boundary that will enter the runway during sampling must hold the warmup gate');

  assert.equal(performanceAdmissionHorizonMs(5_000, 1), 5_000);
  assert.equal(performanceAdmissionHorizonMs(5_000, 0.5), 2_500);
  assert.equal(performanceAdmissionHorizonMs(5_000, 0), 0);
  const docked = collectPerformancePipelineReadiness({
    ...options,
    measurementHorizonMs: performanceAdmissionHorizonMs(5_000, 0),
  });
  assert.equal(docked.authoredPendingAdmissionRiskCount, 0,
    'a timeScale=0 docked sample must not project frozen entity velocity into its wall-time window');
  assert.equal(isPerformancePipelineSettled(docked), true);
});

test('invisible pending authored admission is not misreported as a procedural fallback', () => {
  const authored = {
    type: 'ship',
    alive: true,
    presentationAdmission: 'ready',
    mesh: { userData: { authoredAssetState: 'authored' } },
  };
  const pending = {
    type: 'ship',
    alive: true,
    presentationAdmission: 'pending',
    mesh: { userData: { authoredAssetState: 'awaiting-authored-admission' } },
  };
  const state = { entityList: [authored, pending], render: {} };
  assert.deepEqual(authoredAssetStatus(state), {
    shipCount: 2,
    readyCount: 1,
    pendingCount: 1,
    fallbackCount: 0,
    missingMeshCount: 0,
    ignoredNonresidentCount: 0,
    entities: [
      { id: null, defId: null, trafficRole: null, sectorId: null, distanceToPlayer: null, admission: 'ready', assetState: 'authored' },
      { id: null, defId: null, trafficRole: null, sectorId: null, distanceToPlayer: null, admission: 'pending', assetState: 'awaiting-authored-admission' },
    ],
  });
  const readiness = collectPerformancePipelineReadiness({ state });
  assert.equal(readiness.authoredReady, true);
  assert.equal(readiness.authoredPresentedCount, 1);
  assert.equal(readiness.authoredPendingCount, 1);
  assert.equal(readiness.authoredFallbackCount, 0);
  const structure = collectPerformanceSceneStructure({ state });
  assert.deepEqual(structure.authoredShipStates, {
    authored: 1,
    'awaiting-authored-admission': 1,
  });
  assert.equal(structure.authoredShipAdmission.pending, 1);
  assert.equal(structure.authoredShipAdmission.fallback, 0);

  pending.presentationAdmission = 'unavailable';
  pending.mesh.userData.authoredAssetState = 'fallback-after-error';
  const failed = collectPerformancePipelineReadiness({ state });
  assert.equal(failed.authoredReady, false);
  assert.equal(failed.authoredFallbackCount, 1);
});

test('authored readiness excludes reduced neighbour ships from current-sector fallback truth', () => {
  const current = {
    id: 1,
    type: 'ship',
    alive: true,
    homeSectorId: 'sector_current',
    presentationAdmission: 'ready',
    mesh: { userData: { authoredAssetState: 'authored' } },
    data: { defId: 'ship_kestrel' },
  };
  const reducedNeighbour = {
    id: 2,
    type: 'ship',
    alive: true,
    homeSectorId: 'sector_neighbour',
    data: { defId: 'ship_wasp' },
  };
  const state = {
    playerId: 1,
    entityList: [current, reducedNeighbour],
    world: { currentSectorId: 'sector_current' },
    render: {},
  };

  const status = authoredAssetStatus(state);
  assert.equal(status.shipCount, 1);
  assert.equal(status.readyCount, 1);
  assert.equal(status.fallbackCount, 0);
  assert.equal(status.ignoredNonresidentCount, 1);
  assert.deepEqual(status.entities.map((entry) => entry.id), [1]);
});
