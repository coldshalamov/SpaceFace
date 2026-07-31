// PERF-00 paired Browser authority for one full matched attribution matrix.

import path from 'node:path';

export const PERFORMANCE_CLOSURE_FIXED_SEED = 47;

const FAST_GATES = Object.freeze([
  'node --test test/performance-closure-manifests.test.mjs test/performance-attribution-runtime-matrix.test.mjs',
  'node --test test/performance-closure-contracts.test.mjs test/performance-closure-probe-contract.test.mjs test/performance-final-acceptance.test.mjs',
  'npm run check:sim:compare',
]);

const SCENARIO_PATHS = Object.freeze([
  'scripts/lib/performanceScenarioManifest.mjs',
  'scripts/lib/performanceScenarioDriver.mjs',
]);

const REGRESSION_PATHS = Object.freeze([
  'test/performance-attribution.test.mjs',
  'test/performance-attribution-runtime-matrix.test.mjs',
  'test/performance-closure-contracts.test.mjs',
  'test/performance-closure-manifests.test.mjs',
  'test/performance-closure-probe-contract.test.mjs',
  'test/performance-final-acceptance.test.mjs',
  'test/performance-runtime-identities.test.mjs',
  'test/performance-scenario-driver.test.mjs',
  'test/performance-scenario-manifest.test.mjs',
  'test/performance-scene-metrics.test.mjs',
  'test/validation-broker.test.mjs',
  'test/validation-manifest-registry.test.mjs',
]);

const PRODUCTION_PATHS = Object.freeze([
  'package.json',
  'src/core/perfRuntime.js',
  'src/render/bloom.js',
  'src/render/gpuTimers.js',
  'src/render/postTelemetry.js',
  'src/render/renderer.js',
]);

const HARNESS_PATHS = Object.freeze([
  'scripts/check-performance-attribution.mjs',
  'scripts/lib/alphaLiveBaselineContracts.mjs',
  'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
  'scripts/lib/browser-issues.mjs',
  'scripts/lib/electronTestIsolation.mjs',
  'scripts/lib/load-playwright.mjs',
  'scripts/lib/performanceClosureContracts.mjs',
  'scripts/lib/performanceFinalAcceptance.mjs',
  'scripts/lib/performanceSceneMetrics.mjs',
  'scripts/lib/releaseSoakContracts.mjs',
  'scripts/lib/releaseSoakProbe.mjs',
  'scripts/lib/validationBroker.mjs',
  'scripts/lib/validationManifestRegistry.mjs',
  'scripts/lib/visualProbeServer.mjs',
  'scripts/validation-broker-cli.mjs',
  'scripts/validation-manifests/performance-closure-browser.mjs',
  'scripts/validation-manifests/performance-closure-electron.mjs',
]);

export function createPerformanceClosureBrowserManifest(overrides = {}) {
  return {
    id: 'performance-closure-browser',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: [
      'scripts/check-performance-attribution.mjs',
      '--runtime=browser',
      '--acceptance',
      '--full-matrix',
    ],
    mode: 'acceptance',
    fastGateCommands: [...FAST_GATES],
    scenarioPaths: [...SCENARIO_PATHS],
    regressionSourcePaths: [...REGRESSION_PATHS],
    productionSourcePaths: [...PRODUCTION_PATHS],
    harnessSourcePaths: [...HARNESS_PATHS],
    runtimeProfile: 'default',
    timeoutMs: 1_800_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'perf', 'closure', 'browser'),
    fixedSeed: PERFORMANCE_CLOSURE_FIXED_SEED,
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const performanceClosureBrowserManifest = createPerformanceClosureBrowserManifest();
export default performanceClosureBrowserManifest;
