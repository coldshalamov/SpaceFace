// PQ-023 combat-readability H1 continuation — only the five cells changed after the H2 verdict.
// Accepted Cathedral, unrelated weapon, ordinary, and capital evidence remains retained.

import path from 'node:path';

export const PQ023_COMBAT_READABILITY_FIXED_SEED = 47;

export function createPq023CombatReadabilityManifest(overrides = {}) {
  return {
    id: 'pq023-combat-readability',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-pq023-combat-readability.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'npm run check:pq023:corridor-cues',
      'npm run check:presentation',
      'node --test test/pq023-corridor-cues-h1-manifest.test.mjs',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [
      'test/pq023-corridor-cues-h1-manifest.test.mjs',
      'test/pq023-corridor-cues.test.mjs',
      'test/combat-vfx-presentation-contract.test.mjs',
    ],
    productionSourcePaths: [
      'package.json',
      'src/render/combat/phasedExplosions.js',
      'src/render/renderer.js',
      'src/render/vfx.js',
      'src/render/vfxProfiles.js',
    ],
    harnessSourcePaths: [
      'scripts/probe-pq023-combat-readability.mjs',
      'scripts/capture-combat-vfx-acceptance.mjs',
      'scripts/check-pq023-corridor-cues-electron.mjs',
      'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
      'scripts/lib/browser-issues.mjs',
      'scripts/lib/electronTestIsolation.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/pq023Accessibility.mjs',
      'scripts/lib/pq023CaptureCleanup.mjs',
      'scripts/lib/pq023CombatReadabilityProjection.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/visualProbeServer.mjs',
      'scripts/validation-broker-cli.mjs',
      'scripts/validation-manifests/pq023-combat-readability.mjs',
      'scripts/validation-manifests/pq023-corridor-cues.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 360_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq023-combat-readability'),
    fixedSeed: PQ023_COMBAT_READABILITY_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq023CombatReadabilityManifest = createPq023CombatReadabilityManifest();

export default pq023CombatReadabilityManifest;
