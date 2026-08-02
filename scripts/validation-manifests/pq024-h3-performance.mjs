// PQ-024 H3 target-profile matched performance. Each fixed-seed repetition commits the Core,
// measures the publicly reached no-relay flight floor, then re-enters Asteroid Ops through shipped
// controls and measures the real producing-one-relay target in the same context and camera pose.

import path from 'node:path';

import { createPq024AsteroidClaimManifest } from './pq024-asteroid-claim.mjs';

export const PQ024_H3_FIXED_SEED = 24024;
export const PQ024_H3_VIEWPORT = Object.freeze({ width: 1830, height: 973, deviceScaleFactor: 1 });

export function createPq024H3PerformanceManifest(overrides = {}) {
  const functionalRoute = createPq024AsteroidClaimManifest();
  return {
    id: 'pq024-h3-performance',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/capture-pq024-h3-performance.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'node --test test/pq024-h3-performance.test.mjs',
      'node --test test/pq024-asteroid-claim-manifest.test.mjs',
      'node --test test/station-docking-corridor.test.mjs',
      'node --test test/authored-admission-no-visible-fallback.test.mjs',
      'node --test test/pq022-relay-collar-admission.test.mjs',
      'node --test test/performance-scene-metrics.test.mjs test/render-target-pipeline-warmup.test.mjs',
      'npm run check:pq024:survey-claim',
      'npm run check:sim:compare',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [...new Set([
      ...functionalRoute.regressionSourcePaths,
      'test/performance-scene-metrics.test.mjs',
      'test/pq024-h3-performance.test.mjs',
      'test/render-target-pipeline-warmup.test.mjs',
      'test/station-docking-corridor.test.mjs',
      'test/authored-admission-no-visible-fallback.test.mjs',
      'test/pq022-relay-collar-admission.test.mjs',
    ])],
    productionSourcePaths: [...new Set([
      ...functionalRoute.productionSourcePaths,
      'src/core/loop.js',
      'src/core/perfRuntime.js',
      'src/core/physics.js',
      'src/core/physicsAuthority.js',
      'src/data/collisionProxyManifests.js',
      'src/render/bloom.js',
      'src/render/diagnostics.js',
      'src/render/gpuTimers.js',
      'src/render/pipelineReadiness.js',
      'src/render/postTelemetry.js',
      'src/render/precompile.js',
      'src/render/partsLibrary.js',
      'src/systems/dockingCorridor.js',
      'src/systems/flightV3.js',
      'src/systems/worldSiteRuntime.js',
    ])],
    harnessSourcePaths: [...new Set([
      ...functionalRoute.harnessSourcePaths,
      'scripts/capture-pq024-h3-performance.mjs',
      'scripts/lib/performanceClosureContracts.mjs',
      'scripts/lib/performanceSceneMetrics.mjs',
      'scripts/lib/pq024H3Performance.mjs',
      'scripts/lib/releaseSoakContracts.mjs',
      'scripts/lib/releaseSoakProbe.mjs',
      'scripts/validation-manifests/pq024-h3-performance.mjs',
    ])],
    runtimeProfile: 'target-desktop-default-quality',
    timeoutMs: 900_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'perf', 'pq024-h3'),
    fixedSeed: PQ024_H3_FIXED_SEED,
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq024H3PerformanceManifest = createPq024H3PerformanceManifest();
export default pq024H3PerformanceManifest;
