// PQ-024 Phase H1 broker cell: the default-route asteroid claim corridor.
//
// The headed cell is deliberately built and gated without launching here. When the broker later
// spends its one acceptance claim, the probe drives only shipped player controls from New Game:
// Helios market acquisition, local-map asteroid course, Massline + Asteroid Ops, survey, Core,
// extractor output, exterior relay, quick-save, cold Continue, and public re-entry. Production,
// survey, inventory, and relay terminal truth remain owned by their registered systems.

import path from 'node:path';

export const PQ024_ASTEROID_CLAIM_FIXED_SEED = 24024;

export function createPq024AsteroidClaimManifest(overrides = {}) {
  return {
    id: 'pq024-asteroid-claim',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-pq024-asteroid-claim.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'npm run check:pq024:survey-claim',
      'node --test test/asteroid-sites.test.mjs',
      'npm run check:sim:compare',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [
      'test/pq024-asteroid-claim-manifest.test.mjs',
      'test/pq024-survey-claim.test.mjs',
      'test/asteroid-sites.test.mjs',
    ],
    productionSourcePaths: [
      'package.json',
      'src/core/gameState.js',
      'src/core/registry.js',
      'src/data/commodities.js',
      'src/data/newGameDefaults.js',
      'src/data/sectors.js',
      'src/data/sites.js',
      'src/save/saveSystem.js',
      'src/systems/asteroidSites.js',
      'src/systems/cargo.js',
      'src/systems/drill.js',
      'src/systems/economy.js',
      'src/systems/siteProduction.js',
      'src/systems/siteSurvey.js',
      'src/systems/world.js',
      'src/ui/asteroid/asteroidController.js',
      'src/ui/asteroid/asteroidScreen.js',
      'src/ui/asteroid/buildPalette.js',
      'src/ui/bindings.js',
      'src/ui/input.js',
      'src/ui/screens/localmap.js',
      'src/ui/station/screens/market.js',
      'src/ui/station/stationApp.js',
      'src/ui/uiRoot.js',
      'styles/asteroid-ops.css',
      'styles/station.css',
      'styles/ui.css',
    ],
    harnessSourcePaths: [
      'scripts/probe-pq024-asteroid-claim.mjs',
      'scripts/check-pq024-asteroid-claim-electron.mjs',
      'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
      'scripts/lib/browser-issues.mjs',
      'scripts/lib/electronTestIsolation.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/pq024AsteroidClaimParity.mjs',
      'scripts/lib/pq024CommittedPresentation.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/visualProbeServer.mjs',
      'scripts/validation-broker-cli.mjs',
      'scripts/validation-manifests/pq024-asteroid-claim.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 600_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq024-asteroid-claim'),
    fixedSeed: PQ024_ASTEROID_CLAIM_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq024AsteroidClaimManifest = createPq024AsteroidClaimManifest();

export default pq024AsteroidClaimManifest;
