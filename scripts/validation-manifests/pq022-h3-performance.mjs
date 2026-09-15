// PQ-022 H3 matched corridor-asset performance and cleanup. One fixed-seed headed Browser context runs
// three route cycles over the eleven accepted exact corridor identities: an ordinary floor window on
// every sector entry and exit with no accepted identity drawn in frame, and one admitted, default-framed
// target window per identity, plus close/default/far LOD occupancy, residency, and end-of-cycle cleanup.
// It measures the accepted assets as shipped; it is not a historical optimization A/B.

import path from 'node:path';

import {
  PQ022_H3_FIXED_SEED,
  PQ022_H3_IDENTITIES,
  PQ022_H3_VIEWPORT,
} from '../lib/pq022CorridorH3Performance.mjs';

export { PQ022_H3_FIXED_SEED, PQ022_H3_VIEWPORT };

export function createPq022H3PerformanceManifest(overrides = {}) {
  const renderPackageMetadata = PQ022_H3_IDENTITIES.map(
    (row) => `assets/ships/release/render-packages/${row.renderPackage}/render-package.json`,
  );
  return {
    id: 'pq022-h3-performance',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/capture-pq022-h3-performance.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'node --test test/pq022-h3-performance.test.mjs',
      'npm run check:pq022:corridor-assets',
      'node --test test/pq022-corridor-asset-set-contract.test.mjs',
      'node --test test/performance-scene-metrics.test.mjs test/render-target-pipeline-warmup.test.mjs',
      'npm run check:sim:compare',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [
      'test/pq022-h3-performance.test.mjs',
      'test/pq022-corridor-asset-set-contract.test.mjs',
      'test/performance-scene-metrics.test.mjs',
      'test/render-target-pipeline-warmup.test.mjs',
    ],
    productionSourcePaths: [
      'assets/ships/parts/parts_manifest.json',
      'assets/ships/release/release_manifest.json',
      'assets/ships/render-packages/pilots.json',
      ...renderPackageMetadata,
      'src/core/perfRuntime.js',
      'src/render/assetResidency.js',
      'src/render/hlod.js',
      'src/render/lod.js',
      'src/render/partsLibrary.js',
      'src/render/renderPackageLoader.js',
      'src/render/renderer.js',
      'src/systems/asteroidSites.js',
      'src/systems/traffic.js',
      'src/systems/world.js',
    ],
    harnessSourcePaths: [
      'scripts/capture-pq022-h3-performance.mjs',
      'scripts/lib/browser-issues.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/performanceClosureContracts.mjs',
      'scripts/lib/performanceSceneMetrics.mjs',
      'scripts/lib/pq022CorridorH3Performance.mjs',
      'scripts/lib/pq022CorridorH3Route.mjs',
      'scripts/lib/releaseSoakContracts.mjs',
      'scripts/lib/releaseSoakProbe.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/visualProbeServer.mjs',
      'scripts/validation-manifests/pq022-h3-performance.mjs',
    ],
    runtimeProfile: 'target-desktop-default-quality',
    // Three cycles, up to three 180 s relay admission ceilings, a 600 s quiet-host gate, fixture re-issues,
    // and contended frames stretching sample windows can pass an hour; a kill-tree timeout voids the claim.
    timeoutMs: 5_400_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'perf', 'pq022-h3'),
    fixedSeed: PQ022_H3_FIXED_SEED,
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq022H3PerformanceManifest = createPq022H3PerformanceManifest();
export default pq022H3PerformanceManifest;
