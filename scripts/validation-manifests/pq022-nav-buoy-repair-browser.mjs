// PQ-022 nav-buoy repair (reopened billboard-buoy-reauthor): one broker-authorized Browser
// presentation cell. The accepted station billboard is NOT a subject here; only the returned
// navigation buoy is captured, at ordinary and diagnostic-close framing.

import path from 'node:path';

export const PQ022_NAV_BUOY_REPAIR_FIXED_SEED = 47;

// `check:assets:live` is omitted from this cell's gates on purpose: that probe refuses to run
// unless HEAD == origin/master, which the shared concurrent tree cannot satisfy. The corridor
// gate is the live hash-binding authority here (it recomputes every manifest binding from disk).
// The candidate admission check is deliberately NOT a post-promotion gate: it is a pre-promotion
// admission and goes stale by design once the transaction publishes.
const FAST_GATES = Object.freeze([
  'npm run check:pq022:corridor-assets',
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
  'scripts/validation-manifests/pq022-nav-buoy-repair-browser.mjs',
  'scripts/validation-manifests/pq022-nav-buoy-repair-electron.mjs',
  'test/pq022-reauthor-h1-manifests.test.mjs',
]);

export function createPq022NavBuoyRepairBrowserManifest(overrides = {}) {
  return {
    id: 'pq022-nav-buoy-repair-browser',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: [
      'scripts/probe-pq022-corridor-asset-leaves.mjs',
      '--only=nav-buoy-repair',
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
    fastGateTimeoutMs: 360_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq022-nav-buoy-repair', 'browser'),
    fixedSeed: PQ022_NAV_BUOY_REPAIR_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq022NavBuoyRepairBrowserManifest = createPq022NavBuoyRepairBrowserManifest();
export default pq022NavBuoyRepairBrowserManifest;
