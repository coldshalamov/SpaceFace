import path from 'node:path';

export const PERFORMANCE_PRESENTATION_WORLD_FIXED_SEED = 47;

export const PERFORMANCE_PRESENTATION_WORLD_SOURCE_IDENTITY = Object.freeze({
  schema: 'spaceface.performancePresentationWorldSourceIdentity.v1',
  electronRoute: 'source-native-electron',
  packagedElectronClaim: false,
  saveManifest: Object.freeze({
    schema: 'spaceface.performanceSaveManifest.v1',
    kind: 'production-new-game',
    seed: PERFORMANCE_PRESENTATION_WORLD_FIXED_SEED,
    routeOwner: 'scripts/lib/alphaLiveBaselineRoute.mjs#runBrowserPublicRoute',
  }),
  inputTapeManifest: Object.freeze({
    schema: 'spaceface.performanceInputTapeManifest.v1',
    kind: 'procedural-public-route-plus-reviewed-presentation-controls',
    routeOwner: 'scripts/lib/releaseSoakProbe.mjs#runPerformanceAttributionProbe',
    scenarioOwner: 'scripts/lib/performanceScenarioDriver.mjs#presentation-world-specialized',
    replayedSyntheticTape: false,
  }),
  cameraManifest: Object.freeze({
    schema: 'spaceface.performanceCameraManifest.v1',
    kind: 'production-runtime-camera',
    settingsOverride: false,
  }),
});

const FAST_GATES = Object.freeze([
  'node --test test/performance-presentation-world-acceptance.test.mjs test/performance-presentation-world-manifests.test.mjs',
  'node --test test/performance-closure-contracts.test.mjs test/performance-scenario-driver.test.mjs test/performance-attribution-runtime-matrix.test.mjs',
  'node --test test/presentation-world.test.mjs test/presentation-world-origin-cell-corruption.test.mjs test/presentation-journal.test.mjs test/render-entity-frame.test.mjs',
]);

const SCENARIO_PATHS = Object.freeze([
  'scripts/lib/performanceClosureContracts.mjs',
  'scripts/lib/performanceScenarioDriver.mjs',
  'scripts/lib/releaseSoakProbe.mjs',
]);

const REGRESSION_PATHS = Object.freeze([
  'test/performance-attribution-runtime-matrix.test.mjs',
  'test/performance-closure-contracts.test.mjs',
  'test/performance-presentation-world-acceptance.test.mjs',
  'test/performance-presentation-world-manifests.test.mjs',
  'test/performance-scenario-driver.test.mjs',
  'test/presentation-journal.test.mjs',
  'test/presentation-world-origin-cell-corruption.test.mjs',
  'test/presentation-world.test.mjs',
  'test/render-entity-frame.test.mjs',
]);

const PRODUCTION_PATHS = Object.freeze([
  'src/core/coordinates.js',
  'src/core/perfRuntime.js',
  'src/core/presentationJournal.js',
  'src/render/asteroidInstancePool.js',
  'src/render/camera.js',
  'src/render/canopyMaterialPolicy.js',
  'src/render/dynamicBufferRanges.js',
  'src/render/frameCoordinates.js',
  'src/render/livingHullPresentation.js',
  'src/render/lod.js',
  'src/render/partsLibrary.js',
  'src/render/pipelineReadiness.js',
  'src/render/presentationPublisher.js',
  'src/render/presentationQueries.js',
  'src/render/presentationWorld.js',
  'src/render/renderEntityFrame.js',
  'src/render/renderer.js',
  'src/render/shadowCasterPolicy.js',
  'src/render/vfx.js',
  'src/systems/ships.js',
]);

const HARNESS_PATHS = Object.freeze([
  'scripts/check-performance-presentation-world.mjs',
  'scripts/lib/alphaLiveBaselineRoute.mjs',
  'scripts/lib/performancePresentationWorldAcceptance.mjs',
  'scripts/lib/releaseSoakProbe.mjs',
  'scripts/lib/validationBroker.mjs',
  'scripts/lib/validationManifestRegistry.mjs',
  'scripts/lib/visualProbeServer.mjs',
  'scripts/validation-broker-cli.mjs',
  'scripts/validation-manifests/performance-presentation-world-browser.mjs',
  'scripts/validation-manifests/performance-presentation-world-electron.mjs',
]);

export function createPerformancePresentationWorldBrowserManifest(overrides = {}) {
  return {
    id: 'performance-presentation-world-browser',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: [
      'scripts/check-performance-presentation-world.mjs',
      '--runtime=browser',
      '--acceptance',
    ],
    mode: 'acceptance',
    fastGateCommands: [...FAST_GATES],
    scenarioPaths: [...SCENARIO_PATHS],
    regressionSourcePaths: [...REGRESSION_PATHS],
    productionSourcePaths: [...PRODUCTION_PATHS],
    harnessSourcePaths: [...HARNESS_PATHS],
    runtimeProfile: 'default-presentation-world-scale-source-runtime',
    timeoutMs: 1_800_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'perf', 'presentation-world', 'browser'),
    fixedSeed: PERFORMANCE_PRESENTATION_WORLD_FIXED_SEED,
    sourceIdentity: PERFORMANCE_PRESENTATION_WORLD_SOURCE_IDENTITY,
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const performancePresentationWorldBrowserManifest =
  createPerformancePresentationWorldBrowserManifest();
export default performancePresentationWorldBrowserManifest;
