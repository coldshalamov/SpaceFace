// PQ-019A Phase H1 continuation — one-use Browser presentation of the physical cargo capsule.
//
// The original H1 row already retained valid facility/count evidence. This cell exists only to
// capture the repaired close/default/far in-flight capsule views and their hard NDC assertions.
// It records no timing or performance conclusion.

import path from 'node:path';

export const PQ019A_CAPSULE_PRESENTATION_FIXED_SEED = 0x50513139;

export function createPq019aCapsulePresentationManifest(overrides = {}) {
  return {
    id: 'pq019a-capsule-presentation',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/capture-pq019a-acceptance.mjs', '--capsule-only'],
    mode: 'acceptance',
    fastGateCommands: [
      'node --test test/pq019a-capsule-capture-repair.test.mjs test/pq019a-capsule-presentation-h1-manifest.test.mjs',
      'npm run check:pq019a:facility-embodiment',
      'npm run check:sim:compare',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [
      'test/pq019a-capsule-capture-repair.test.mjs',
      'test/pq019a-capsule-presentation-h1-manifest.test.mjs',
      'test/pq019-authored-cargo-capsule.test.mjs',
      'test/pq019-facility-embodiment.test.mjs',
      'test/pq019-launch-schedule-cue.test.mjs',
    ],
    productionSourcePaths: [
      'package.json',
      'src/core/timeEffects.js',
      'src/data/heistFacilities.js',
      'src/render/assetLoader.js',
      'src/render/camera.js',
      'src/render/partsLibrary.js',
      'src/render/renderer.js',
      'src/systems/heistFacilities.js',
      'src/systems/world.js',
      'src/ui/screens/newGame.js',
    ],
    harnessSourcePaths: [
      'scripts/capture-pq019a-acceptance.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/visualProbeServer.mjs',
      'scripts/validation-broker-cli.mjs',
      'scripts/validation-manifests/pq019a-capsule-presentation.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 420_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq019a-acceptance'),
    fixedSeed: PQ019A_CAPSULE_PRESENTATION_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq019aCapsulePresentationManifest = createPq019aCapsulePresentationManifest();

export default pq019aCapsulePresentationManifest;
