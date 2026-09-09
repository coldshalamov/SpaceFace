import path from 'node:path';

export const PERFORMANCE_DIRTY_RANGES_FIXED_SEED = 47;

export const PERFORMANCE_DIRTY_RANGES_SOURCE_IDENTITY = Object.freeze({
  schema: 'spaceface.performanceDirtyRangesSourceIdentity.v1',
  saveManifest: Object.freeze({
    schema: 'spaceface.performanceSaveManifest.v1',
    kind: 'production-new-game',
    seed: PERFORMANCE_DIRTY_RANGES_FIXED_SEED,
    routeOwner: 'scripts/lib/alphaLiveBaselineRoute.mjs#runBrowserPublicRoute',
  }),
  inputTapeManifest: Object.freeze({
    schema: 'spaceface.performanceInputTapeManifest.v1',
    kind: 'procedural-public-player-route',
    routeOwner: 'scripts/lib/alphaLiveBaselineRoute.mjs#runBrowserPublicRoute',
    scenarioOwner: 'scripts/lib/performanceScenarioDriver.mjs#combat_vfx_burst',
    replayedSyntheticTape: false,
  }),
  cameraManifest: Object.freeze({
    schema: 'spaceface.performanceCameraManifest.v1',
    kind: 'production-runtime-camera',
    settingsOverride: false,
  }),
});

const FAST_GATES = Object.freeze([
  'node --test test/dynamic-buffer-ranges.test.mjs test/electron-shell-lifecycle.test.mjs test/performance-dirty-ranges.test.mjs',
  'node --test test/vfx-instanced-sprite-pool.test.mjs test/trail-streak-instancing.test.mjs',
  'npm run check:render-hotpath',
]);

const SCENARIO_PATHS = Object.freeze([
  'scripts/lib/performanceScenarioManifest.mjs',
  'scripts/lib/performanceScenarioDriver.mjs',
]);

const REGRESSION_PATHS = Object.freeze([
  'test/dynamic-buffer-ranges.test.mjs',
  'test/electron-shell-lifecycle.test.mjs',
  'test/performance-dirty-ranges.test.mjs',
  'test/trail-streak-instancing.test.mjs',
  'test/vfx-instanced-sprite-pool.test.mjs',
]);

const PRODUCTION_PATHS = Object.freeze([
  'electron/main.cjs',
  'src/core/perfCounters.js',
  'src/core/perfRuntime.js',
  'src/render/combat/instancedSpritePool.js',
  'src/render/dynamicBufferRanges.js',
  'src/render/engineTrailSurfaces.js',
  'src/render/renderer.js',
  'src/render/vfx.js',
]);

const HARNESS_PATHS = Object.freeze([
  'scripts/check-performance-dirty-ranges.mjs',
  'scripts/lib/alphaLiveBaselineRoute.mjs',
  'scripts/lib/performanceDirtyRangeAcceptance.mjs',
  'scripts/lib/releaseSoakProbe.mjs',
  'scripts/lib/validationBroker.mjs',
  'scripts/lib/validationManifestRegistry.mjs',
  'scripts/lib/visualProbeServer.mjs',
  'scripts/validation-broker-cli.mjs',
  'scripts/validation-manifests/performance-dirty-ranges-browser.mjs',
  'scripts/validation-manifests/performance-dirty-ranges-electron.mjs',
]);

export function createPerformanceDirtyRangesBrowserManifest(overrides = {}) {
  return {
    id: 'performance-dirty-ranges-browser',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: [
      'scripts/check-performance-dirty-ranges.mjs',
      '--runtime=browser',
      '--acceptance',
    ],
    mode: 'acceptance',
    fastGateCommands: [...FAST_GATES],
    scenarioPaths: [...SCENARIO_PATHS],
    regressionSourcePaths: [...REGRESSION_PATHS],
    productionSourcePaths: [...PRODUCTION_PATHS],
    harnessSourcePaths: [...HARNESS_PATHS],
    runtimeProfile: 'default-tier1-dynamic-buffer',
    timeoutMs: 900_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'perf', 'dirty-ranges', 'browser'),
    fixedSeed: PERFORMANCE_DIRTY_RANGES_FIXED_SEED,
    sourceIdentity: PERFORMANCE_DIRTY_RANGES_SOURCE_IDENTITY,
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const performanceDirtyRangesBrowserManifest = createPerformanceDirtyRangesBrowserManifest();
export default performanceDirtyRangesBrowserManifest;
