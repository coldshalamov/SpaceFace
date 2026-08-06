// Bounded PQ-024 committed-transition acceptance. This manifest reuses the default public route
// actor but retains exactly one screenshot and stops immediately after the Core presentation settles.

import path from 'node:path';

import {
  createPq024AsteroidClaimManifest,
  PQ024_ASTEROID_CLAIM_FIXED_SEED,
} from './pq024-asteroid-claim.mjs';

export const PQ024_COMMITTED_TRANSITION_FIXED_SEED = PQ024_ASTEROID_CLAIM_FIXED_SEED;

export function createPq024CommittedTransitionManifest(overrides = {}) {
  const base = createPq024AsteroidClaimManifest();
  return {
    ...base,
    id: 'pq024-committed-transition',
    commandArgs: [
      'scripts/probe-pq024-asteroid-claim.mjs',
      '--committed-transition',
    ],
    fastGateCommands: [
      'node --test test/pq024-survey-claim.test.mjs test/pq024-asteroid-claim-manifest.test.mjs test/station-docking-corridor.test.mjs',
    ],
    regressionSourcePaths: [...new Set([
      ...base.regressionSourcePaths,
      'test/pq024-asteroid-claim-manifest.test.mjs',
      'test/station-docking-corridor.test.mjs',
    ])],
    productionSourcePaths: [...new Set([
      ...base.productionSourcePaths,
      'src/systems/flightV3.js',
    ])],
    harnessSourcePaths: [...new Set([
      ...base.harnessSourcePaths,
      'scripts/check-pq024-committed-transition-electron.mjs',
      'scripts/lib/pq024CommittedPresentation.mjs',
      'scripts/validation-manifests/pq024-committed-transition.mjs',
    ])],
    timeoutMs: 300_000,
    artifactRoot: path.join('.devshots', 'pq024-committed-transition'),
    fixedSeed: PQ024_COMMITTED_TRANSITION_FIXED_SEED,
    ...overrides,
  };
}

export const pq024CommittedTransitionManifest = createPq024CommittedTransitionManifest();

export default pq024CommittedTransitionManifest;
