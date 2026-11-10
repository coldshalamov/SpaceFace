// PQ-022 Phase H1 — one-use headed Browser presentation of the corridor's required identity leaves.
//
// The cell captures the relay collar, four corridor station archetypes, three lane-furniture places,
// and the three Helios civilian whole-ships. It proves exact source/release identity and live authored
// admission, but makes no performance claim; matched measurements remain Phase H3.

import path from 'node:path';

export const PQ022_CORRIDOR_ASSET_LEAVES_FIXED_SEED = 47;

export function createPq022CorridorAssetLeavesManifest(overrides = {}) {
  return {
    id: 'pq022-corridor-asset-leaves',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-pq022-corridor-asset-leaves.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'npm run check:pq022:corridor-assets',
      'npm run check:pq022:relay-collar',
      'node --test test/pq022-corridor-asset-set-contract.test.mjs test/pq022-corridor-asset-leaves-h1-manifest.test.mjs',
      'npm run check:sim:compare',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [
      'test/pq022-corridor-asset-leaves-h1-manifest.test.mjs',
      'test/pq022-corridor-asset-set-contract.test.mjs',
      'test/pq022-relay-collar-admission.test.mjs',
      'test/authored-admission-no-visible-fallback.test.mjs',
      'test/asset-npc-authored-binding.test.mjs',
      'test/presentation-admission.test.mjs',
    ],
    productionSourcePaths: [
      'package.json',
      'assets/ships/parts/parts_manifest.json',
      'assets/ships/release/release_manifest.json',
      'src/core/presentationAdmission.js',
      'src/data/laneContacts.js',
      'src/data/sectorAnchors.js',
      'src/data/sectors.js',
      'src/render/assetLoader.js',
      'src/render/partsLibrary.js',
      'src/render/renderer.js',
      'src/render/visualFactory.js',
      'src/systems/asteroidSites.js',
      'src/systems/ships.js',
      'src/systems/traffic.js',
      'src/systems/world.js',
    ],
    harnessSourcePaths: [
      'scripts/probe-pq022-corridor-asset-leaves.mjs',
      'scripts/check-pq022-corridor-assets.mjs',
      'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
      'scripts/lib/pq022CorridorAssetSet.mjs',
      'scripts/lib/pq022CorridorExpectedGaps.json',
      'scripts/lib/browser-issues.mjs',
      'scripts/lib/electronTestIsolation.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/pq022RelayReauthorParity.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/visualProbeServer.mjs',
      'scripts/validation-broker-cli.mjs',
      'scripts/validation-manifests/pq022-corridor-asset-leaves.mjs',
      'scripts/validation-manifests/pq022-relay-reauthor-browser.mjs',
      'scripts/validation-manifests/pq022-relay-reauthor-electron.mjs',
      'scripts/validation-manifests/pq022-refinery-reauthor-browser.mjs',
      'scripts/validation-manifests/pq022-refinery-reauthor-electron.mjs',
      'scripts/validation-manifests/pq022-billboard-buoy-reauthor-browser.mjs',
      'scripts/validation-manifests/pq022-billboard-buoy-reauthor-electron.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 540_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq022-corridor-asset-leaves'),
    fixedSeed: PQ022_CORRIDOR_ASSET_LEAVES_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq022CorridorAssetLeavesManifest = createPq022CorridorAssetLeavesManifest();

export default pq022CorridorAssetLeavesManifest;
