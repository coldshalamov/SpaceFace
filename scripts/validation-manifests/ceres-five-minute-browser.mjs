import path from 'node:path';

export const CERES_FIVE_MINUTE_FIXED_SEED = 47;
export const CERES_FIVE_MINUTE_SIMULATION_SECONDS = 300;
export const CERES_FIVE_MINUTE_SIMULATION_TICKS = 18_000;

export const CERES_FIVE_MINUTE_SOURCE_IDENTITY = Object.freeze({
  schema: 'spaceface.ceresFiveMinuteSourceIdentity.v1',
  route: 'ceres-reference-pocket-five-minute-v1',
  electronRoute: 'source-native-electron',
  packagedElectronClaim: false,
  controllerClaim: false,
  saveManifest: Object.freeze({
    schema: 'spaceface.ceresFiveMinuteSaveManifest.v1',
    kind: 'production-sandbox-new-game',
    scenarioId: 'ceres_reference_pocket',
    seed: CERES_FIVE_MINUTE_FIXED_SEED,
    routeOwner: 'scripts/lib/ceresFiveMinuteAcceptance.mjs#runCeresFiveMinutePublicRoute',
  }),
  inputTapeManifest: Object.freeze({
    schema: 'spaceface.ceresFiveMinuteInputTapeManifest.v1',
    kind: 'procedural-public-keyboard-mouse-route',
    routeOwner: 'scripts/lib/ceresFiveMinuteAcceptance.mjs#runCeresFiveMinutePublicRoute',
    replayedSyntheticTape: false,
    controllerClaim: false,
  }),
  cameraManifest: Object.freeze({
    schema: 'spaceface.ceresFiveMinuteCameraManifest.v1',
    kind: 'production-runtime-camera',
    settingsOverride: false,
  }),
  observationManifest: Object.freeze({
    schema: 'spaceface.ceresFiveMinuteObservationManifest.v1',
    simulationSeconds: CERES_FIVE_MINUTE_SIMULATION_SECONDS,
    simulationTicks: CERES_FIVE_MINUTE_SIMULATION_TICKS,
    activityGapMetric: 'maxZeroVisibleActivityS',
    visibilitySemantics: 'world-camera-renderability-v1',
    numericActivityGapThresholdS: null,
    humanReview: 'browser-candidate-bound-KEEP-or-REVISE',
    browserKeepRequired: true,
    electronReviewRequired: false,
  }),
});

const COMMON_FAST_GATES = Object.freeze([
  'node --test test/propulsion-spawned-ship-authority.test.mjs',
  'node --test test/ceres-five-minute-acceptance.test.mjs test/ceres-five-minute-manifests.test.mjs',
  'node --test test/ceres-active-pockets.test.mjs test/sandbox-recovery-launcher.test.mjs test/ceres-activity-traffic-cast.test.mjs test/ceres-activity-faction-tender.test.mjs test/ceres-activity-ambush-director.test.mjs test/npc-jobs-runtime-spatial-query.test.mjs test/npc-jobs-runtime-wiring.test.mjs test/ceres-activity-runtime-lifecycle.test.mjs',
  'npm run check:pq020:ceres-topology',
  'npm run check:pq020:proofs',
  'npm run check:sim:compare',
]);

const SCENARIO_PATHS = Object.freeze([
  'scripts/lib/ceresFiveMinuteAcceptance.mjs',
]);

const REGRESSION_PATHS = Object.freeze([
  'test/ceres-five-minute-acceptance.test.mjs',
  'test/ceres-five-minute-manifests.test.mjs',
  'test/ceres-active-pockets.test.mjs',
  'test/sandbox-recovery-launcher.test.mjs',
  'test/ceres-activity-traffic-cast.test.mjs',
  'test/ceres-activity-faction-tender.test.mjs',
  'test/ceres-activity-ambush-director.test.mjs',
  'test/ceres-activity-runtime-lifecycle.test.mjs',
  'test/npc-jobs-runtime-spatial-query.test.mjs',
  'test/npc-jobs-runtime-wiring.test.mjs',
  'test/propulsion-spawned-ship-authority.test.mjs',
  'test/pq020-ceres-topology.test.mjs',
  'test/pq020-ceres-proofs.test.mjs',
]);

const PRODUCTION_PATHS = Object.freeze([
  'electron/main.cjs',
  'electron/preload.cjs',
  'package.json',
  'src/main.js',
  'src/core/gameState.js',
  'src/core/loop.js',
  'src/core/registry.js',
  'src/core/spatialQuery.js',
  'src/data/environmentalMachinery.js',
  'src/data/modules.js',
  'src/data/newGameDefaults.js',
  'src/data/sectorActivityPockets.js',
  'src/data/sectorCoordinates.js',
  'src/data/sectorZones.js',
  'src/data/ships.js',
  'src/data/weapons.js',
  'src/render/camera.js',
  'src/render/renderer.js',
  'src/runtime/nodeSystemFactoryTable.js',
  'src/systems/asteroidFormations.js',
  'src/systems/encounterDirector.js',
  'src/systems/encounterScripts.js',
  'src/systems/factionPresence.js',
  'src/systems/flightV3.js',
  'src/systems/input.js',
  'src/systems/npcJobsRuntime.js',
  'src/systems/ships.js',
  'src/systems/traffic.js',
  'src/systems/world.js',
  'src/ui/hud.js',
  'src/ui/input.js',
  'src/ui/screenManager.js',
  'src/ui/screens/mainMenu.js',
  'src/ui/screens/sandbox.js',
  'src/ui/sandbox/sandboxSetup.js',
]);

const HARNESS_PATHS = Object.freeze([
  'scripts/check-ceres-five-minute.mjs',
  'scripts/lib/ceresFiveMinuteAcceptance.mjs',
  'scripts/lib/alphaLiveBaselineContracts.mjs',
  'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
  'scripts/lib/browser-issues.mjs',
  'scripts/lib/electronTestIsolation.mjs',
  'scripts/lib/electronRuntimeProvisioning.mjs',
  'scripts/lib/load-playwright.mjs',
  'scripts/lib/playwrightCspPolling.mjs',
  'scripts/lib/pq020CeresFunctionalRoute.mjs',
  'scripts/lib/releaseSoakContracts.mjs',
  'scripts/lib/releaseSoakProbe.mjs',
  'scripts/lib/validationAtomicWrite.mjs',
  'scripts/lib/validationBroker.mjs',
  'scripts/lib/validationFingerprint.mjs',
  'scripts/lib/validationManifestRegistry.mjs',
  'scripts/lib/visualProbeServer.mjs',
  'scripts/validation-broker-cli.mjs',
  'scripts/validation-manifests/ceres-five-minute-browser.mjs',
  'scripts/validation-manifests/ceres-five-minute-electron.mjs',
  'test/ceres-five-minute-acceptance.test.mjs',
  'test/ceres-five-minute-manifests.test.mjs',
]);

export function createCeresFiveMinuteBrowserManifest(overrides = {}) {
  const runtimeKind = overrides.runtimeKind ?? 'browser';

  return {
    id: 'ceres-five-minute-browser',
    runtimeKind,
    command: process.execPath,
    commandArgs: [
      'scripts/check-ceres-five-minute.mjs',
      '--runtime=browser',
      '--acceptance',
    ],
    mode: 'acceptance',
    fastGateCommands: [
      `node scripts/check-ceres-five-minute.mjs --runtime=${runtimeKind} --preflight`,
      ...COMMON_FAST_GATES,
    ],
    scenarioPaths: [...SCENARIO_PATHS],
    regressionSourcePaths: [...REGRESSION_PATHS],
    productionSourcePaths: [...PRODUCTION_PATHS],
    harnessSourcePaths: [...HARNESS_PATHS],
    runtimeProfile: 'default-ceres-five-minute-source-runtime',
    timeoutMs: 900_000,
    fastGateTimeoutMs: 600_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join(
      '.devshots',
      'physics-as-spectacle',
      'ceres-five-minute',
      'browser',
    ),
    fixedSeed: CERES_FIVE_MINUTE_FIXED_SEED,
    sourceIdentity: CERES_FIVE_MINUTE_SOURCE_IDENTITY,
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const ceresFiveMinuteBrowserManifest = createCeresFiveMinuteBrowserManifest();
export default ceresFiveMinuteBrowserManifest;
