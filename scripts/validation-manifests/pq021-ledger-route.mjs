// PQ-021 Phase 4 broker-authorized route acceptance: the Ship's Ledger read routes.
//
// BUILT, NOT RUN. PQ-034 holds the performance-evidence / validation-broker / browser-gpu leases,
// so no claim has ever been issued against this manifest. It is ready to execute in one command:
//
//   node scripts/validation-broker-cli.mjs --manifest pq021-ledger-route
//
// What the acceptance cell covers: five Cathedral evidence pages earned in the live runtime through
// the ordinary operation API, then read through BOTH ordinary routes (station dock -> Ledger
// destination; flight K -> Codex -> Ledger tab), with every authored image admitted at its bounded
// crop, provenance shown, focus entering and returning, and identical information in both hosts.
//
// The Electron half of the cell is scripts/check-pq021-ledger-route-electron.mjs and shares
// scripts/lib/pq021LedgerPublicRoute.mjs with the Browser probe.

import path from 'node:path';

/** Deterministic seed for the acceptance cell (not wall-clock). */
export const PQ021_LEDGER_ROUTE_FIXED_SEED = 47;

export function createPq021LedgerRouteManifest(overrides = {}) {
  return {
    id: 'pq021-ledger-route',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-pq021-ledger-route.mjs'],
    mode: 'acceptance',
    // Deterministic gates that must be green before a claim is issued. These are the same headless
    // checks that prove earning, Continue, and two-host DOM behaviour without a browser lease.
    fastGateCommands: [
      'node --test test/pq021-ledger-natural-earning.test.mjs test/ship-ledger-evidence-host.test.mjs',
      'node scripts/check-pq021-ledger-hosts.mjs',
      'node scripts/check-pq021-ledger-keyboard-route.mjs',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [
      'test/pq021-ledger-natural-earning.test.mjs',
      'test/pq021-cathedral-route-harness.mjs',
      'test/pq021-ledger-route-manifest.test.mjs',
      'test/ship-ledger-evidence-host.test.mjs',
      'test/depth-program-a2-ship-ledger.test.mjs',
      'test/pq018-wreck-cathedral.test.mjs',
    ],
    // Every production path whose change should invalidate a previously accepted route receipt.
    productionSourcePaths: [
      'package.json',
      'src/systems/shipLedger.js',
      'src/ui/screens/shipLedger.js',
      'src/ui/station/screens/ledger.js',
      'src/ui/station/stationApp.js',
      'src/ui/screens/codex.js',
      'src/data/wreckCathedralEvidenceCatalog.js',
      'src/data/worldSiteManifests.js',
      'src/systems/worldSiteKernel.js',
      'src/systems/asteroidSites.js',
      'src/save/saveSystem.js',
      'src/ui/bindings.js',
      'src/ui/input.js',
      'styles/ui.css',
      'styles/station.css',
    ],
    harnessSourcePaths: [
      'scripts/probe-pq021-ledger-route.mjs',
      'scripts/check-pq021-ledger-route-electron.mjs',
      'scripts/check-pq021-ledger-hosts.mjs',
      'scripts/check-pq021-ledger-keyboard-route.mjs',
      'scripts/lib/pq021LedgerPublicRoute.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/browser-issues.mjs',
      'scripts/validation-manifests/pq021-ledger-route.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 300_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq021-ledger-route'),
    fixedSeed: PQ021_LEDGER_ROUTE_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq021LedgerRouteManifest = createPq021LedgerRouteManifest();

export default pq021LedgerRouteManifest;
