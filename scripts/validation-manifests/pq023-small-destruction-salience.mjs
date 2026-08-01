// PQ-023 final small-destruction H1 continuation — only normal small, reduced small, and dense guard.
// Accepted flak, Cathedral, unrelated weapon, ordinary, and capital evidence remains retained.

import path from 'node:path';

export const PQ023_SMALL_DESTRUCTION_SALIENCE_FIXED_SEED = 47;

export function createPq023SmallDestructionSalienceManifest(overrides = {}) {
  return {
    id: 'pq023-small-destruction-salience',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-pq023-small-destruction-salience.mjs'],
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
      'scripts/probe-pq023-small-destruction-salience.mjs',
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
      'scripts/validation-manifests/pq023-small-destruction-salience.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 300_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq023-small-destruction-salience'),
    fixedSeed: PQ023_SMALL_DESTRUCTION_SALIENCE_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq023SmallDestructionSalienceManifest =
  createPq023SmallDestructionSalienceManifest();

export default pq023SmallDestructionSalienceManifest;
