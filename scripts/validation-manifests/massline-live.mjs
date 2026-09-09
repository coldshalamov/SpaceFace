// Massline live probe validation manifest (Phase 1 second consumer).
// Fixed seed is required on the automated New Game path (no wall-clock seed).

import path from 'node:path';

/** Deterministic universe seed recorded by the migrated live probe. */
export const MASSLINE_LIVE_FIXED_SEED = 47017;

export function createMasslineLiveManifest(overrides = {}) {
  return {
    id: 'massline-live',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-massline2-live.mjs'],
    mode: 'acceptance',
    requiresScenario: {
      path: 'src/testing/scenarios/massline-latch-reel.scenario.json',
      command: 'node scripts/sf-lab.mjs run src/testing/scenarios/massline-latch-reel.scenario.json',
    },
    fastGateCommands: [
      'node --test test/massline-input-grammar.test.mjs',
    ],
    scenarioPaths: [
      'src/testing/scenarios/massline-latch-reel.scenario.json',
    ],
    regressionSourcePaths: [
      'test/massline-input-grammar.test.mjs',
      'test/massline-orbit-assist.test.mjs',
      'test/massline-acquisition-preview.test.mjs',
    ],
    productionSourcePaths: [
      'package.json',
      'scripts/probe-massline2-live.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/validationFingerprint.mjs',
      'scripts/lib/validationProcessControl.mjs',
      'scripts/validation-manifests/massline-live.mjs',
      'src/core/flight/orbitAssist.js',
      'src/systems/flightV3.js',
      'src/systems/input.js',
      'src/systems/masslineInputGrammar.js',
      'src/systems/tetherGameplay.js',
      'src/ui/masslineHud.js',
    ],
    harnessSourcePaths: [
      'scripts/lib/browser-issues.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/gameServer.cjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 300_000,
    maxLaunchesPerCandidate: 2,
    artifactRoot: path.join('.devshots', 'massline-live'),
    fixedSeed: MASSLINE_LIVE_FIXED_SEED,
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

export const masslineLiveManifest = createMasslineLiveManifest();

export default masslineLiveManifest;
