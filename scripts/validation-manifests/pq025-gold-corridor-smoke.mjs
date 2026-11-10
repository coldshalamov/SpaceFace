// PQ-025 Phase-2 CALIBRATION/SMOKE validation manifest.
//
// NOT ACCEPTANCE. This manifest authorizes one short visible smoke per career/runtime to validate
// actor reachability, observer completeness, checkpointing, evidence streaming, and cleanup. A
// green result here proves the HARNESS works; it can never be read as 30/90-minute qualification.
//
// Phase-1 status: this file is CREATED, NEVER EXECUTED. `registryEnabled: false` keeps the dynamic
// broker registry fail-closed until the Phase-0 stop conditions and entry conditions are true.

import path from 'node:path';

/** Deterministic seed for the smoke route; the held-out qualification seed is NOT used here. */
export const PQ025_SMOKE_FIXED_SEED = 25047;

export function createPq025GoldCorridorSmokeManifest(overrides = {}) {
  return {
    id: 'pq025-gold-corridor-smoke',
    registryEnabled: false,
    runtimeKind: 'browser',
    command: process.execPath,
    // Phase-2 probe. The adapter does not exist yet (Phase 1 is pure contracts only).
    commandArgs: ['scripts/probe-pq025-gold-corridor-smoke.mjs'],
    // `diagnostic` keeps a smoke result structurally ineligible to back an acceptance claim.
    // NOTE: `mode` and `maxLaunchesPerCandidate` are what actually constrain this manifest —
    // normalizeManifest (scripts/lib/validationBroker.mjs:561-613) does not carry `acceptanceEligible`
    // or `phase` through, so those two are documentation for human readers, not broker-enforced.
    mode: 'diagnostic',
    acceptanceEligible: false,
    phase: 'Phase2Calibration',
    fastGateCommands: [
      'node --test test/pq025-acceptance-contracts.test.mjs',
      'node --test test/pq025-acceptance-session.test.mjs',
      'node --test test/pq025-acceptance-aggregate.test.mjs',
    ],
    scenarioPaths: [],
    regressionSourcePaths: [
      'test/pq025-acceptance-contracts.test.mjs',
      'test/pq025-acceptance-session.test.mjs',
      'test/pq025-acceptance-aggregate.test.mjs',
    ],
    productionSourcePaths: [
      'scripts/lib/goldCorridorAcceptanceContracts.mjs',
      'scripts/lib/goldCorridorAcceptanceSession.mjs',
      'scripts/lib/goldCorridorAcceptanceAggregate.mjs',
      'scripts/validation-manifests/pq025-gold-corridor-smoke.mjs',
    ],
    harnessSourcePaths: [
      'scripts/lib/browser-issues.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/gameServer.cjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/validationFingerprint.mjs',
      'scripts/lib/validationProcessControl.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 600_000,
    // Packet Phase-2 budget: smokeLaunchesPerRuntimeCareer: 1.
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'pq025-gold-corridor-smoke'),
    fixedSeed: PQ025_SMOKE_FIXED_SEED,
    receiptSchema: 'spaceface.validation-fast-gate.v1',
    lockSchema: 'spaceface.validation-run-lock.v1',
    inflightSchema: 'spaceface.validation-probe-inflight.v1',
    claimSchema: 'spaceface.validation-broker-claim.v1',
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    ...overrides,
  };
}

export const pq025GoldCorridorSmokeManifest = createPq025GoldCorridorSmokeManifest();

export default pq025GoldCorridorSmokeManifest;
