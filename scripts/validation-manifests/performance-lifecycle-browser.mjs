import path from 'node:path';

import { PERFORMANCE_LIFECYCLE_FIXED_SEED } from '../lib/performanceLifecycleContracts.mjs';

export { PERFORMANCE_LIFECYCLE_FIXED_SEED };

export const PERFORMANCE_LIFECYCLE_SOURCE_IDENTITY = Object.freeze({
  schema: 'spaceface.performanceLifecycleSourceIdentity.v1',
  saveManifest: Object.freeze({
    schema: 'spaceface.performanceLifecycleSaveManifest.v1',
    kind: 'production-new-game',
    seed: PERFORMANCE_LIFECYCLE_FIXED_SEED,
    routeOwner: 'scripts/lib/performanceLifecycleProbe.mjs#enterPublicFlight',
  }),
  inputTapeManifest: Object.freeze({
    schema: 'spaceface.performanceLifecycleInputManifest.v1',
    kind: 'public-keyboard-and-owned-native-window-controls',
    routeOwner: 'scripts/lib/performanceLifecycleProbe.mjs',
    rendererMutation: false,
    gameplayMutation: false,
  }),
  cameraManifest: Object.freeze({
    schema: 'spaceface.performanceLifecycleCameraManifest.v1',
    kind: 'production-runtime-camera',
    settingsOverride: false,
  }),
});

const FAST_GATES = Object.freeze([
  'node --test test/performance-lifecycle-contracts.test.mjs test/performance-lifecycle-manifests.test.mjs',
  'node --test test/loop-lifecycle.test.mjs test/loop-orchestration-perf.test.mjs test/electron-shell-lifecycle.test.mjs test/audio-lifecycle.test.mjs test/input-lifecycle.test.mjs',
  'npm run check:launch-policy',
  'node scripts/check-electron-platform-contracts.mjs',
]);

const SCENARIO_PATHS = Object.freeze([
  'scripts/lib/performanceLifecycleProbe.mjs',
]);

const REGRESSION_PATHS = Object.freeze([
  'test/performance-lifecycle-contracts.test.mjs',
  'test/performance-lifecycle-manifests.test.mjs',
  'test/loop-lifecycle.test.mjs',
  'test/loop-orchestration-perf.test.mjs',
  'test/electron-shell-lifecycle.test.mjs',
  'test/audio-lifecycle.test.mjs',
  'test/input-lifecycle.test.mjs',
  'test/validation-broker.test.mjs',
  'test/validation-manifest-registry.test.mjs',
]);

const PRODUCTION_PATHS = Object.freeze([
  'electron/main.cjs',
  'electron/preload.cjs',
  'src/main.js',
  'src/core/loop.js',
  'src/core/presentationRunner.js',
  'src/core/simulationRunner.js',
  'src/core/perfRuntime.js',
  'src/systems/input.js',
  'src/audio/audioSystem.js',
  'src/render/diagnostics.js',
  'src/render/renderer.js',
]);

const HARNESS_PATHS = Object.freeze([
  'scripts/check-performance-lifecycle.mjs',
  'scripts/lib/performanceLifecycleContracts.mjs',
  'scripts/lib/performanceLifecycleLaunchPolicy.cjs',
  'scripts/lib/performanceLifecycleProbe.mjs',
  'scripts/lib/rawCdpLifecycleBrowser.mjs',
  'scripts/lib/alphaLiveBaselineContracts.mjs',
  'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
  'scripts/lib/browser-issues.mjs',
  'scripts/lib/electronTestIsolation.mjs',
  'scripts/lib/load-playwright.mjs',
  'scripts/lib/validationBroker.mjs',
  'scripts/lib/validationManifestRegistry.mjs',
  'scripts/lib/visualProbeServer.mjs',
  'scripts/validation-broker-cli.mjs',
  'scripts/validation-manifests/performance-lifecycle-browser.mjs',
  'scripts/validation-manifests/performance-lifecycle-electron.mjs',
]);

export function createPerformanceLifecycleBrowserManifest(overrides = {}) {
  return {
    id: 'performance-lifecycle-browser',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/check-performance-lifecycle.mjs', '--runtime=browser', '--acceptance'],
    mode: 'acceptance',
    fastGateCommands: [...FAST_GATES],
    scenarioPaths: [...SCENARIO_PATHS],
    regressionSourcePaths: [...REGRESSION_PATHS],
    productionSourcePaths: [...PRODUCTION_PATHS],
    harnessSourcePaths: [...HARNESS_PATHS],
    runtimeProfile: 'default',
    timeoutMs: 600_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'perf', 'lifecycle', 'browser'),
    fixedSeed: PERFORMANCE_LIFECYCLE_FIXED_SEED,
    sourceIdentity: PERFORMANCE_LIFECYCLE_SOURCE_IDENTITY,
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const performanceLifecycleBrowserManifest = createPerformanceLifecycleBrowserManifest();
export default performanceLifecycleBrowserManifest;
