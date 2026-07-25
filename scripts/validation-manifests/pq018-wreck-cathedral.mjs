// PQ-018 Wreck Cathedral Browser + Electron acceptance campaign.
// One broker launch owns both serialized runtime cells for one candidate digest.

import path from 'node:path';

export const PQ018_FIXED_SEED = 18018;
export const PQ018_AUTHORIZED_BASE_SHA = '557903d7340683ca9e1bbf3d4ad20b3a28569237';

export function createPq018WreckCathedralManifest(overrides = {}) {
  return {
    id: 'pq018-wreck-cathedral',
    runtimeKind: 'browser-electron',
    command: process.execPath,
    commandArgs: ['scripts/probe-pq018-wreck-cathedral.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'node --test test/pq018-wreck-cathedral.test.mjs test/pq018-public-route-contract.test.mjs',
      'node --test test/world-site-presentation.test.mjs test/world-site-render-admission.test.mjs',
      'node scripts/check-pq018-baseline.mjs',
      'node scripts/check-asset-reachability.mjs',
      'npm run check:assets:live',
      'npm run check:visual-stability',
      'node scripts/check-atlas-integrity.mjs',
      'node scripts/check-bundle.mjs',
    ],
    // Exact baseline bytes participate in the candidate digest. The CLI omits this set only while
    // bootstrapping a new --baseline-only diagnostic from the authorized immutable base.
    scenarioPaths: [
      '.devshots/pq018-wreck-cathedral/baseline/aggregate.json',
      '.devshots/pq018-wreck-cathedral/baseline/browser/evidence.json',
      '.devshots/pq018-wreck-cathedral/baseline/electron/evidence.json',
    ],
    regressionSourcePaths: [
      'test/pq018-wreck-cathedral.test.mjs',
      'test/pq018-public-route-contract.test.mjs',
      'test/world-site-presentation.test.mjs',
      'test/world-site-render-admission.test.mjs',
    ],
    productionSourcePaths: [
      'assets/ships/parts/parts_manifest.json',
      'assets/ships/release/release_manifest.json',
      'assets/ships/release/parts/places/place_landmark_wreck_cathedral.glb',
      'assets/ships/release/media/wreck-cathedral/neutral_gameplay_distance.png',
      'assets/ships/release/media/wreck-cathedral/silhouette_lod0.png',
      'assets/ships/release/media/wreck-cathedral/neutral_close_3q.png',
      'assets/ships/release/media/wreck-cathedral/neutral_flythrough_cavity.png',
      'assets/ships/release/media/wreck-cathedral/wireframe_flythrough.png',
      'src/data/flavor/080-landmark-lore.js',
      'src/data/sectorAnchors.js',
      'src/data/sectors.js',
      'src/data/worldSiteAssetBindings.js',
      'src/data/worldSiteManifests.js',
      'src/data/wreckCathedralEvidenceCatalog.js',
      'src/systems/asteroidSites.js',
      'src/systems/worldSiteKernel.js',
      'src/systems/worldSiteRuntime.js',
      'src/ui/galaxyMap.js',
    ],
    harnessSourcePaths: [
      'scripts/build-pq018-wreck-cathedral-release.mjs',
      'scripts/check-pq018-baseline.mjs',
      'scripts/lib/alphaLiveBaselineContracts.mjs',
      'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
      'scripts/lib/browser-issues.mjs',
      'scripts/lib/electronTestIsolation.mjs',
      'scripts/lib/gameServer.cjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/pq017WorldSitePublicRoute.mjs',
      'scripts/lib/pq018WreckCathedralPublicRoute.mjs',
      'scripts/lib/professionalTravelPublicRoute.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/validationFingerprint.mjs',
      'scripts/lib/validationProcessControl.mjs',
      'scripts/lib/visualProbeServer.mjs',
      'scripts/probe-pq018-wreck-cathedral.mjs',
      'scripts/validation-broker-cli.mjs',
      'scripts/validation-manifests/pq018-wreck-cathedral.mjs',
    ],
    runtimeProfile: '1440x900-dark-reduced-motion-reduced-flash',
    timeoutMs: 1_200_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq018-wreck-cathedral'),
    fixedSeed: PQ018_FIXED_SEED,
    receiptSchema: 'spaceface.validation-fast-gate.v1',
    lockSchema: 'spaceface.validation-run-lock.v1',
    inflightSchema: 'spaceface.validation-probe-inflight.v1',
    claimSchema: 'spaceface.validation-broker-claim.v1',
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq018WreckCathedralManifest = createPq018WreckCathedralManifest();

export default pq018WreckCathedralManifest;
