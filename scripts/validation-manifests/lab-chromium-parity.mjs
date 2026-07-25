// Phase 4 broker-authorized browser acceptance: lab Chromium parity receipt.
// Consumed exactly once after deterministic gates pass.

import path from 'node:path';

/** Deterministic seed for the acceptance cell (not wall-clock). */
export const LAB_CHROMIUM_PARITY_FIXED_SEED = 47;

export function createLabChromiumParityManifest(overrides = {}) {
  return {
    id: 'lab-chromium-parity',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-lab-chromium-acceptance.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'node --test test/lab-checkpoint.test.mjs test/lab-checkpoint-compare.test.mjs test/lab-bridge-absence.test.mjs',
    ],
    scenarioPaths: [
      'src/testing/scenarios/flight-fixed-input.scenario.json',
    ],
    regressionSourcePaths: [
      'test/lab-checkpoint.test.mjs',
      'test/lab-checkpoint-compare.test.mjs',
      'test/lab-bridge-absence.test.mjs',
      'test/lab-chromium-parity.test.mjs',
      'test/lab-browser-input-grammar.test.mjs',
    ],
    productionSourcePaths: [
      'package.json',
      'scripts/probe-lab-chromium-acceptance.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/validationFingerprint.mjs',
      'scripts/lib/validationProcessControl.mjs',
      'scripts/validation-manifests/lab-chromium-parity.mjs',
      'src/testing/lab/chromiumHost.js',
      'src/testing/lab/differentialReplay.js',
      'src/testing/lab/checkpointCompare.js',
      'src/testing/lab/liveRouteBridge.js',
      'src/testing/lab/browserScenarioHost.js',
      'src/testing/lab/checkpoint.js',
      'src/testing/lab/deterministicSurface.js',
      'src/runtime/createAuthoritativeRuntime.js',
      'src/main.js',
      'scripts/build-bundle.mjs',
    ],
    harnessSourcePaths: [
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/gameServer.cjs',
      'src/testing/lab/chromiumHostPage.html',
    ],
    runtimeProfile: 'default',
    timeoutMs: 300_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'lab-chromium-parity'),
    fixedSeed: LAB_CHROMIUM_PARITY_FIXED_SEED,
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

export const labChromiumParityManifest = createLabChromiumParityManifest();

export default labChromiumParityManifest;
