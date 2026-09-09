import path from 'node:path';

export const PERFORMANCE_ELECTRON_MODERNIZATION_FIXED_SEED = 47;

export const PERFORMANCE_ELECTRON_MODERNIZATION_SOURCE_IDENTITY = Object.freeze({
  schema: 'spaceface.performanceElectronModernizationSourceIdentity.v1',
  saveManifest: Object.freeze({
    schema: 'spaceface.performanceSaveManifest.v1',
    kind: 'production-new-game',
    seed: PERFORMANCE_ELECTRON_MODERNIZATION_FIXED_SEED,
    routeOwner: 'scripts/lib/alphaLiveBaselineRoute.mjs#runBrowserPublicRoute',
  }),
  inputTapeManifest: Object.freeze({
    schema: 'spaceface.performanceInputTapeManifest.v1',
    kind: 'procedural-public-keyboard-mouse-route',
    routeOwner: 'scripts/lib/releaseSoakProbe.mjs#runReleaseSoakProbe',
    replayedSyntheticTape: false,
  }),
  cameraManifest: Object.freeze({
    schema: 'spaceface.performanceCameraManifest.v1',
    kind: 'production-runtime-camera',
    settingsOverride: false,
  }),
});

const FAST_GATES = Object.freeze([
  'node --test test/performance-electron-modernization-manifests.test.mjs test/startup-loading-presentation.test.mjs test/electron-packaged-startup-contract.test.mjs test/electron-packaged-startup.test.mjs',
  'node --test test/release-soak-contract.test.mjs test/release-soak-evidence-contract.test.mjs test/release-soak-checker.test.mjs test/m6-platform-matrix.test.mjs',
  'npm run check:launch-policy',
  'node scripts/check-electron-platform-contracts.mjs',
  'npm run check:m6:packaging',
  'npm run check:sim:compare',
]);

const SCENARIO_PATHS = Object.freeze([
  'scripts/lib/alphaLiveBaselineRoute.mjs',
  'scripts/lib/releaseSoakProbe.mjs',
  'scripts/lib/releaseSoakSession.mjs',
]);

const REGRESSION_PATHS = Object.freeze([
  'test/alpha-live-baseline-contracts.test.mjs',
  'test/electron-packaged-startup-contract.test.mjs',
  'test/electron-packaged-startup.test.mjs',
  'test/m6-platform-matrix.test.mjs',
  'test/performance-electron-modernization-manifests.test.mjs',
  'test/release-soak-checker.test.mjs',
  'test/release-soak-contract.test.mjs',
  'test/release-soak-evidence-contract.test.mjs',
  'test/startup-loading-presentation.test.mjs',
  'test/validation-broker.test.mjs',
  'test/validation-manifest-registry.test.mjs',
]);

const PRODUCTION_PATHS = Object.freeze([
  'electron/main.cjs',
  'electron/preload.cjs',
  'package-lock.json',
  'package.json',
  'scripts/lib/electronLaunchProtocol.cjs',
  'scripts/lib/gameServer.cjs',
  'src/main.js',
  'src/core/loop.js',
  'src/core/registry.js',
  'src/render/renderer.js',
]);

const HARNESS_PATHS = Object.freeze([
  'scripts/check-electron-packaged-startup.mjs',
  'scripts/check-performance-electron-modernization.mjs',
  'scripts/check-release-soak-browser.mjs',
  'scripts/check-release-soak-electron.mjs',
  'scripts/lib/alphaLiveBaselineContracts.mjs',
  'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
  'scripts/lib/alphaLiveBaselineRoute.mjs',
  'scripts/lib/browser-issues.mjs',
  'scripts/lib/electronPackagedStartup.mjs',
  'scripts/lib/electronTestIsolation.mjs',
  'scripts/lib/load-playwright.mjs',
  'scripts/lib/m6PlatformMatrix.mjs',
  'scripts/lib/performanceElectronModernizationAcceptance.mjs',
  'scripts/lib/releaseSoakCli.mjs',
  'scripts/lib/releaseSoakContracts.mjs',
  'scripts/lib/releaseSoakEvidenceChecker.mjs',
  'scripts/lib/releaseSoakProbe.mjs',
  'scripts/lib/validationBroker.mjs',
  'scripts/lib/validationManifestRegistry.mjs',
  'scripts/lib/visualProbeServer.mjs',
  'scripts/validation-broker-cli.mjs',
  'scripts/validation-manifests/performance-electron-modernization-browser.mjs',
  'scripts/validation-manifests/performance-electron-modernization-electron.mjs',
]);

export function createPerformanceElectronModernizationBrowserManifest(overrides = {}) {
  const artifactRoot = path.join('.devshots', 'perf', 'electron-modernization', 'browser');
  return {
    id: 'performance-electron-modernization-browser',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: [
      'scripts/check-release-soak-browser.mjs',
      '--cycles=1',
      `--output-root=${artifactRoot.replaceAll('\\', '/')}`,
      '--task-id=release-soak-browser',
    ],
    mode: 'acceptance',
    fastGateCommands: [...FAST_GATES],
    scenarioPaths: [...SCENARIO_PATHS],
    regressionSourcePaths: [...REGRESSION_PATHS],
    productionSourcePaths: [...PRODUCTION_PATHS],
    harnessSourcePaths: [...HARNESS_PATHS],
    runtimeProfile: 'default-packaged-parity',
    timeoutMs: 1_800_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot,
    fixedSeed: PERFORMANCE_ELECTRON_MODERNIZATION_FIXED_SEED,
    sourceIdentity: PERFORMANCE_ELECTRON_MODERNIZATION_SOURCE_IDENTITY,
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    packagedStartupRequired: false,
    ...overrides,
  };
}

export const performanceElectronModernizationBrowserManifest =
  createPerformanceElectronModernizationBrowserManifest();
export default performanceElectronModernizationBrowserManifest;
