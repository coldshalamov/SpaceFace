// PQ-020 Phase H1 broker-authorized FUNCTIONAL route acceptance: Ceres Belt.
//
// One command owns the Browser half of the cell:
//
//   node scripts/validation-broker-cli.mjs --manifest pq020-ceres-topology
//
// The route starts through the visible fixed-seed New Game controls, enters Ceres from Helios through
// the production jump FSM, selects and flies the public map route through Ceres Refinery, Belt
// Outpost, Throughline Weigh Beacon, and Wreck Cathedral, cold-Continues an F5 save, repeats the two
// key selections, then proves the second endpoint direction by returning from Tethys. The Electron
// half is scripts/check-pq020-ceres-topology-electron.mjs and consumes the same route module after the
// Browser process has closed.
//
// This is H1 functional evidence only. The cell records no percentile, frame-time array, hitch count,
// speed conclusion, renderer.info sample, residency-byte claim, or applied-LOD claim. Those rows are
// deliberately retained for the quiet-machine Phase H3 matched run.

import path from 'node:path';

/** Deterministic seed used by both runtime halves and the landed PQ-020 headless topology proofs. */
export const PQ020_CERES_TOPOLOGY_FIXED_SEED = 47;

export function createPq020CeresTopologyManifest(overrides = {}) {
  return {
    id: 'pq020-ceres-topology',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-pq020-ceres-topology.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'npm run check:pq020:proofs',
      'npm run check:pq020:ceres-topology',
      'npm run check:sim:compare',
      'node --test test/pq020-ceres-topology-manifest.test.mjs',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [
      'test/pq020-ceres-topology-manifest.test.mjs',
      'test/alpha-live-baseline-electron-contract.test.mjs',
      'test/pq020-ceres-topology.test.mjs',
      'test/pq020-ceres-proofs.test.mjs',
      'test/pq018-wreck-cathedral.test.mjs',
      'test/pq018-wreck-cathedral-admission.test.mjs',
      'test/galaxy-map-gate-jump-seam.test.mjs',
      'test/unified-map-professional.test.mjs',
      'test/world-site-public-route-contract.test.mjs',
      'test/save-v9-global-coordinates.test.mjs',
    ],
    productionSourcePaths: [
      'package.json',
      'src/core/presentationAdmission.js',
      'src/data/authoredPlaces.js',
      'src/data/sectorAnchors.js',
      'src/data/sectorCoordinates.js',
      'src/data/sectors.js',
      'src/data/sectorZones.js',
      'src/data/worldSiteAssetBindings.js',
      'src/data/worldSiteManifests.js',
      'src/render/assetLoader.js',
      'src/render/camera.js',
      'src/render/cameraDirector.js',
      'src/render/partsLibrary.js',
      'src/render/renderer.js',
      'src/render/visualOverrides.js',
      'src/save/saveSystem.js',
      'src/systems/asteroidSites.js',
      'src/systems/flightV3.js',
      'src/systems/world.js',
      'src/systems/worldSiteKernel.js',
      'src/systems/worldSiteRuntime.js',
      'src/ui/galaxyMap.js',
      'src/ui/input.js',
      'src/ui/screenManager.js',
      'src/ui/worldSiteMapLayer.js',
      'styles/ui.css',
    ],
    harnessSourcePaths: [
      'scripts/probe-pq020-ceres-topology.mjs',
      'scripts/check-pq020-ceres-topology-electron.mjs',
      'scripts/check-pq020-electron-request-provenance.mjs',
      'scripts/lib/pq020CeresFunctionalRoute.mjs',
      'scripts/lib/pq020CeresProofs.mjs',
      'scripts/lib/pq020CeresTopology.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/browser-issues.mjs',
      'scripts/lib/visualProbeServer.mjs',
      'scripts/lib/electronTestIsolation.mjs',
      'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/validation-broker-cli.mjs',
      'scripts/validation-manifests/pq020-ceres-topology.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 540_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq020-ceres-topology'),
    fixedSeed: PQ020_CERES_TOPOLOGY_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq020CeresTopologyManifest = createPq020CeresTopologyManifest();

export default pq020CeresTopologyManifest;
