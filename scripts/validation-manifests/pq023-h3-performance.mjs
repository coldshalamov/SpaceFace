// PQ-023 H3 target-profile matched performance. Each fixed-seed context compares the ordinary
// authored Helios flight floor with the accepted dense destruction/connected-beam representative.
// It is a feature-load comparison, not a historical optimization A/B.

import path from 'node:path';

import { createPq023CorridorCuesManifest } from './pq023-corridor-cues.mjs';

export const PQ023_H3_FIXED_SEED = 47;
export const PQ023_H3_VIEWPORT = Object.freeze({ width: 1830, height: 973, deviceScaleFactor: 1 });

export function createPq023H3PerformanceManifest(overrides = {}) {
  const functionalRoute = createPq023CorridorCuesManifest();
  return {
    id: 'pq023-h3-performance',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/capture-pq023-h3-performance.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'node --test test/pq023-h3-performance.test.mjs',
      'node --test test/pq023-corridor-cues-h1-manifest.test.mjs',
      'node --test test/performance-scene-metrics.test.mjs test/render-target-pipeline-warmup.test.mjs',
      'npm run check:pq023:corridor-cues',
      'npm run check:presentation',
      'npm run check:sim:compare',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [...new Set([
      ...functionalRoute.regressionSourcePaths,
      'test/performance-scene-metrics.test.mjs',
      'test/pq023-h3-performance.test.mjs',
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
    ])],
    harnessSourcePaths: [...new Set([
      ...functionalRoute.harnessSourcePaths,
      'scripts/capture-pq023-h3-performance.mjs',
      'scripts/lib/performanceClosureContracts.mjs',
      'scripts/lib/performanceSceneMetrics.mjs',
      'scripts/lib/pq023DensePerformanceScenario.mjs',
      'scripts/lib/pq023H3Performance.mjs',
      'scripts/lib/releaseSoakContracts.mjs',
      'scripts/lib/releaseSoakProbe.mjs',
      'scripts/lib/validationManifestRegistry.mjs',
      'scripts/validation-manifests/pq023-h3-performance.mjs',
    ])],
    runtimeProfile: 'target-desktop-default-quality',
    timeoutMs: 900_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'perf', 'pq023-h3'),
    fixedSeed: PQ023_H3_FIXED_SEED,
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq023H3PerformanceManifest = createPq023H3PerformanceManifest();
export default pq023H3PerformanceManifest;
