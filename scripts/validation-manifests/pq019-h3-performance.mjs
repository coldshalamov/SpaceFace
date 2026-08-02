// PQ-019 H3 target-profile matched performance. This is a one-use primary Browser cell, not an
// optimization A/B: it compares the same fixed-seed route before and during the real witnessed
// capsule heist and preserves both load profiles without calling their difference an improvement.

import path from 'node:path';
import { createPq019SurfaceHeistManifest } from './pq019-surface-heist.mjs';

export const PQ019_H3_FIXED_SEED = 19019;
export const PQ019_H3_VIEWPORT = Object.freeze({ width: 1830, height: 973, deviceScaleFactor: 1 });

export function createPq019H3PerformanceManifest(overrides = {}) {
  const functionalRoute = createPq019SurfaceHeistManifest();
  return {
    id: 'pq019-h3-performance',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/capture-pq019-h3-performance.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'node --test test/pq019-h3-performance.test.mjs',
      'node --test test/authored-entity-plan-budget.test.mjs test/authored-preload-scope.test.mjs test/render-target-pipeline-warmup.test.mjs',
      'node --test test/startup-gpu-residency.test.mjs test/performance-scene-metrics.test.mjs',
      'npm run check:pq019a:facility-embodiment',
      'npm run check:pq019b:seams',
      'npm run check:pq019c:mission',
      'npm run check:sim:compare',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [...new Set([
      ...functionalRoute.regressionSourcePaths,
      'test/authored-entity-plan-budget.test.mjs',
      'test/authored-preload-scope.test.mjs',
      'test/ai-engagement-authority.test.mjs',
      'test/render-target-pipeline-warmup.test.mjs',
      'test/sg06-squad-fire-discipline.test.mjs',
      'test/tactical-ai-production-cadence.test.mjs',
      'test/performance-scene-metrics.test.mjs',
      'test/pq019-h3-performance.test.mjs',
      'test/startup-gpu-residency.test.mjs',
    ])],
    productionSourcePaths: [...new Set([
      ...functionalRoute.productionSourcePaths,
      'src/core/perfRuntime.js',
      'src/core/loop.js',
      'src/core/registry.js',
      'src/ai/engagementAuthority.js',
      'src/render/bloom.js',
      'src/render/diagnostics.js',
      'src/render/engineTrailSurfaces.js',
      'src/render/gpuTimers.js',
      'src/render/partsLibrary.js',
      'src/render/pipelineReadiness.js',
      'src/render/postTelemetry.js',
      'src/render/precompile.js',
      'src/render/renderer.js',
      'src/render/vfx.js',
      'src/systems/traffic.js',
      'src/systems/aiFireIntent.js',
      'src/systems/tacticalAI.js',
    ])],
    harnessSourcePaths: [...new Set([
      ...functionalRoute.harnessSourcePaths,
      'scripts/capture-pq019-h3-performance.mjs',
      'scripts/lib/performanceClosureContracts.mjs',
      'scripts/lib/performanceSceneMetrics.mjs',
      'scripts/lib/pq019H3Performance.mjs',
      'scripts/lib/releaseSoakContracts.mjs',
      'scripts/lib/releaseSoakProbe.mjs',
      'scripts/lib/validationManifestRegistry.mjs',
      'scripts/validation-manifests/pq019-h3-performance.mjs',
    ])],
    runtimeProfile: 'target-desktop-default-quality',
    timeoutMs: 900_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'perf', 'pq019-h3'),
    fixedSeed: PQ019_H3_FIXED_SEED,
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq019H3PerformanceManifest = createPq019H3PerformanceManifest();
export default pq019H3PerformanceManifest;
