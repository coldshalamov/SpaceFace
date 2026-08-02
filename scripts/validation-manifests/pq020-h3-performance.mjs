// PQ-020 H3 target-profile matched performance. One fixed-seed context per repetition measures the
// ordinary Ceres endpoint-entry floor, then follows the accepted public map/autopilot route to the
// admitted, default-framed Wreck Cathedral target. This is not a historical optimization A/B.

import path from 'node:path';

import { createPq020CeresTopologyManifest } from './pq020-ceres-topology.mjs';

export const PQ020_H3_FIXED_SEED = 47;
export const PQ020_H3_VIEWPORT = Object.freeze({ width: 1830, height: 973, deviceScaleFactor: 1 });

export function createPq020H3PerformanceManifest(overrides = {}) {
  const functionalRoute = createPq020CeresTopologyManifest();
  return {
    id: 'pq020-h3-performance',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/capture-pq020-h3-performance.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'node --test test/pq020-h3-performance.test.mjs',
      'node --test test/pq020-ceres-topology-manifest.test.mjs',
      'node --test test/performance-scene-metrics.test.mjs test/render-target-pipeline-warmup.test.mjs',
      'npm run check:pq020:proofs',
      'npm run check:pq020:ceres-topology',
      'npm run check:sim:compare',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [...new Set([
      ...functionalRoute.regressionSourcePaths,
      'test/performance-scene-metrics.test.mjs',
      'test/pq020-h3-performance.test.mjs',
      'test/render-target-pipeline-warmup.test.mjs',
    ])],
    productionSourcePaths: [...new Set([
      ...functionalRoute.productionSourcePaths,
      'src/core/loop.js',
      'src/core/perfRuntime.js',
      'src/core/registry.js',
      'src/render/bloom.js',
      'src/render/diagnostics.js',
      'src/render/gpuTimers.js',
      'src/render/pipelineReadiness.js',
      'src/render/postTelemetry.js',
      'src/render/precompile.js',
      'src/systems/traffic.js',
      'src/systems/worldSiteRuntime.js',
    ])],
    harnessSourcePaths: [...new Set([
      ...functionalRoute.harnessSourcePaths,
      'scripts/capture-pq020-h3-performance.mjs',
      'scripts/lib/performanceClosureContracts.mjs',
      'scripts/lib/performanceSceneMetrics.mjs',
      'scripts/lib/pq020CeresH3Performance.mjs',
      'scripts/lib/releaseSoakContracts.mjs',
      'scripts/lib/releaseSoakProbe.mjs',
      'scripts/lib/validationManifestRegistry.mjs',
      'scripts/validation-manifests/pq020-h3-performance.mjs',
    ])],
    runtimeProfile: 'target-desktop-default-quality',
    timeoutMs: 900_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'perf', 'pq020-h3'),
    fixedSeed: PQ020_H3_FIXED_SEED,
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq020H3PerformanceManifest = createPq020H3PerformanceManifest();
export default pq020H3PerformanceManifest;
