// PQ-022 revised relay: one broker-authorized Browser presentation cell.

import path from 'node:path';

export const PQ022_RELAY_REAUTHOR_FIXED_SEED = 47;

const FAST_GATES = Object.freeze([
  'npm run check:pq022:relay-collar',
  'npm run check:assets:live',
  'node --test test/pq022-relay-reauthor-h1-manifest.test.mjs',
]);

const REGRESSION_PATHS = Object.freeze([
  'test/pq022-relay-reauthor-h1-manifest.test.mjs',
  'test/pq022-relay-collar-admission.test.mjs',
]);

const PRODUCTION_PATHS = Object.freeze([
  'package.json',
  'electron/main.cjs',
  'assets/ships/parts/places/place_claim_outpost_relay.glb',
  'assets/ships/release/parts/places/place_claim_outpost_relay.glb',
  'assets/ships/parts/parts_manifest.json',
  'assets/ships/release/release_manifest.json',
  'src/core/presentationAdmission.js',
  'src/render/assetLoader.js',
  'src/render/partsLibrary.js',
  'src/render/renderer.js',
  'src/render/visualFactory.js',
  'src/systems/asteroidSites.js',
]);

const HARNESS_PATHS = Object.freeze([
  'scripts/probe-pq022-corridor-asset-leaves.mjs',
  'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
  'scripts/lib/browser-issues.mjs',
  'scripts/lib/electronTestIsolation.mjs',
  'scripts/lib/load-playwright.mjs',
  'scripts/lib/pq022RelayReauthorParity.mjs',
  'scripts/lib/validationBroker.mjs',
  'scripts/lib/validationManifestRegistry.mjs',
  'scripts/lib/visualProbeServer.mjs',
  'scripts/validation-broker-cli.mjs',
  'scripts/validation-manifests/pq022-relay-reauthor-browser.mjs',
  'scripts/validation-manifests/pq022-relay-reauthor-electron.mjs',
]);

export function createPq022RelayReauthorBrowserManifest(overrides = {}) {
  return {
    id: 'pq022-relay-reauthor-browser',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: [
      'scripts/probe-pq022-corridor-asset-leaves.mjs',
      '--only=relay-collar',
      '--runtime=browser',
    ],
    mode: 'acceptance',
    fastGateCommands: [...FAST_GATES],
    scenarioPaths: [],
    regressionSourcePaths: [...REGRESSION_PATHS],
    productionSourcePaths: [...PRODUCTION_PATHS],
    harnessSourcePaths: [...HARNESS_PATHS],
    runtimeProfile: 'default',
    timeoutMs: 360_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq022-relay-reauthor', 'browser'),
    fixedSeed: PQ022_RELAY_REAUTHOR_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq022RelayReauthorBrowserManifest = createPq022RelayReauthorBrowserManifest();
export default pq022RelayReauthorBrowserManifest;
