// PQ-022 billboard/buoy re-author: one broker-authorized Browser presentation cell.

import path from 'node:path';

export const PQ022_BILLBOARD_BUOY_REAUTHOR_FIXED_SEED = 47;

const FAST_GATES = Object.freeze([
  'npm run check:pq022:corridor-assets',
  'npm run check:assets:live',
  'node --test test/pq022-reauthor-h1-manifests.test.mjs',
]);

const PRODUCTION_PATHS = Object.freeze([
  'package.json',
  'electron/main.cjs',
  'assets/ships/parts/places/place_station_billboard.glb',
  'assets/ships/release/parts/places/place_station_billboard.glb',
  'assets/ships/parts/places/place_nav_buoy.glb',
  'assets/ships/release/parts/places/place_nav_buoy.glb',
  'assets/ships/parts/parts_manifest.json',
  'assets/ships/release/release_manifest.json',
  'src/core/presentationAdmission.js',
  'src/data/sectorAnchors.js',
  'src/render/assetLoader.js',
  'src/render/partsLibrary.js',
  'src/render/renderer.js',
  'src/render/visualFactory.js',
  'src/systems/world.js',
]);

const HARNESS_PATHS = Object.freeze([
  'scripts/probe-pq022-corridor-asset-leaves.mjs',
  'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
  'scripts/lib/browser-issues.mjs',
  'scripts/lib/electronTestIsolation.mjs',
  'scripts/lib/load-playwright.mjs',
  'scripts/lib/validationBroker.mjs',
  'scripts/lib/validationManifestRegistry.mjs',
  'scripts/lib/visualProbeServer.mjs',
  'scripts/validation-broker-cli.mjs',
  'scripts/validation-manifests/pq022-billboard-buoy-reauthor-browser.mjs',
  'scripts/validation-manifests/pq022-billboard-buoy-reauthor-electron.mjs',
  'test/pq022-reauthor-h1-manifests.test.mjs',
]);

export function createPq022BillboardBuoyReauthorBrowserManifest(overrides = {}) {
  return {
    id: 'pq022-billboard-buoy-reauthor-browser',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: [
      'scripts/probe-pq022-corridor-asset-leaves.mjs',
      '--only=billboard-buoy',
      '--runtime=browser',
    ],
    mode: 'acceptance',
    fastGateCommands: [...FAST_GATES],
    scenarioPaths: [],
    regressionSourcePaths: ['test/pq022-reauthor-h1-manifests.test.mjs'],
    productionSourcePaths: [...PRODUCTION_PATHS],
    harnessSourcePaths: [...HARNESS_PATHS],
    runtimeProfile: 'default',
    timeoutMs: 360_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq022-billboard-buoy-reauthor', 'browser'),
    fixedSeed: PQ022_BILLBOARD_BUOY_REAUTHOR_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq022BillboardBuoyReauthorBrowserManifest = createPq022BillboardBuoyReauthorBrowserManifest();
export default pq022BillboardBuoyReauthorBrowserManifest;
