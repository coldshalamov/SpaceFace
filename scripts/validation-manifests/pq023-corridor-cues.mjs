// PQ-023 H1 — one-use headed Browser cue-motion evidence cell.
//
// This is functional/perceptual evidence only. Video offsets identify editorial segments; they are
// explicitly contended metadata, not performance samples. Matched target/floor performance stays H3.

import path from 'node:path';

export const PQ023_CORRIDOR_CUES_FIXED_SEED = 47;
export const PQ023_CATHEDRAL_ADMISSION_REGRESSION = Object.freeze({
  retainedPlayerDistanceWu: 4936.901,
  authoredApproachDistanceWu: 2400,
  failure: 'waited-for-authored-admission-before-framing',
});

export function createPq023CorridorCuesManifest(overrides = {}) {
  return {
    id: 'pq023-corridor-cues',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-pq023-corridor-cues.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'npm run check:pq023:corridor-cues',
      'npm run check:presentation',
      'npm run check:sim:compare',
      'node --test test/pq023-corridor-cues-h1-manifest.test.mjs',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [
      'test/pq023-corridor-cues-h1-manifest.test.mjs',
      'test/pq023-corridor-cues.test.mjs',
      'test/world-site-presentation.test.mjs',
      'test/vfx-accessibility-profile.test.mjs',
      'test/combat-vfx-presentation-contract.test.mjs',
    ],
    productionSourcePaths: [
      'package.json',
      'src/combat/damage.js',
      'src/data/worldSiteManifests.js',
      'src/presentation/cueArbitration.js',
      'src/presentation/cueRecipes.js',
      'src/presentation/cueSchema.js',
      'src/presentation/worldSiteDamageStates.js',
      'src/render/combat/phasedExplosions.js',
      'src/render/partsLibrary.js',
      'src/render/renderer.js',
      'src/render/vfx.js',
      'src/render/vfxProfiles.js',
      'src/render/worldSitePresentation.js',
      'src/systems/asteroidSites.js',
      'src/systems/presentationAdapters.js',
      'src/systems/presentationOrchestrator.js',
      'src/systems/world.js',
      'src/systems/worldSiteKernel.js',
      'src/systems/worldSiteRuntime.js',
    ],
    harnessSourcePaths: [
      'scripts/probe-pq023-corridor-cues.mjs',
      'scripts/check-pq023-corridor-cues-electron.mjs',
      'scripts/capture-combat-vfx-acceptance.mjs',
      'scripts/check-pq023-corridor-cues.mjs',
      'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
      'scripts/lib/electronTestIsolation.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/pq023CathedralFraming.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/visualProbeServer.mjs',
      'scripts/validation-broker-cli.mjs',
      'scripts/validation-manifests/pq023-corridor-cues.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 540_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq023-corridor-cues'),
    fixedSeed: PQ023_CORRIDOR_CUES_FIXED_SEED,
    requireFastReceipt: false,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq023CorridorCuesManifest = createPq023CorridorCuesManifest();

export default pq023CorridorCuesManifest;
