// PQ-025 Phase-4/5 NATIVE QUALIFICATION validation manifest.
//
// This is the only manifest permitted to back an acceptance claim for the held-out Gold Corridor
// qualification. It binds one fixed matrix to candidate + harness + profile manifest.
//
// Phase-1 status: CREATED, NEVER EXECUTED. `registryEnabled: false` keeps the dynamic broker
// registry fail-closed. Enabling it is an integrator step and is legal only when EVERY entry
// condition in design/program/roadmap/active/PQ-025.md is true — including the Phase-0
// stop conditions recorded in the semantic map (perf p50/p99/missed-vsync/residency/draw counts
// currently have no owner surface).

import path from 'node:path';

/**
 * The seed is NOT fixed here. Qualification seeds are derived per cell by
 * deriveHeldOutSeed() in scripts/lib/goldCorridorAcceptanceContracts.mjs from the committed
 * held-out salt after reveal; a manifest-level fixed seed would defeat the held-out property.
 */
export const PQ025_QUALIFICATION_SEED_POLICY = Object.freeze({
  kind: 'held-out-commit-reveal',
  derivation: 'pq025.seed.v1',
  module: 'scripts/lib/goldCorridorAcceptanceContracts.mjs',
  runtimeIndependent: true,
});

export function createPq025GoldCorridorQualificationManifest(overrides = {}) {
  return {
    id: 'pq025-gold-corridor-qualification',
    registryEnabled: false,
    // Assigned per cell by the matrix; both browser and electron are represented at each horizon.
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-pq025-gold-corridor-qualification.mjs'],
    mode: 'acceptance',
    acceptanceEligible: true,
    phase: 'Phase4Native30+Phase5Native90',
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
      'scripts/validation-manifests/pq025-gold-corridor-qualification.mjs',
    ],
    harnessSourcePaths: [
      'scripts/lib/browser-issues.mjs',
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/gameServer.cjs',
      'scripts/lib/electronLaunchProtocol.cjs',
      'scripts/lib/electronTestIsolation.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/validationFingerprint.mjs',
      'scripts/lib/validationProcessControl.mjs',
    ],
    runtimeProfile: 'default',
    // A native 90-minute cell plus cold Continue and teardown. Wall-clock bound, not a budget to spend.
    timeoutMs: 7_200_000,
    // Packet budget: acceptanceAttemptsPerCellPerCandidateDigest: 1, plus at most one qualified
    // ENVIRONMENT replacement. Rerun legality is decided by evaluateRerunRequest(), not by count.
    maxLaunchesPerCandidate: 2,
    artifactRoot: path.join('.devshots', 'pq025-gold-corridor-qualification'),
    fixedSeed: null,
    seedPolicy: PQ025_QUALIFICATION_SEED_POLICY,
    receiptSchema: 'spaceface.validation-fast-gate.v1',
    lockSchema: 'spaceface.validation-run-lock.v1',
    inflightSchema: 'spaceface.validation-probe-inflight.v1',
    claimSchema: 'spaceface.validation-broker-claim.v1',
    requireFastReceipt: true,
    requireBrokerClaim: true,
    cleanupPolicy: 'kill-tree',
    // Entry conditions the integrator must satisfy before this manifest may be registered/run.
    entryConditionsUnmet: Object.freeze([
      'PQ-019/020/021/022/023/024 integrated receipts at the exact candidate revision',
      'owner read seam for perf p50/p99/missed-vsync/residency/draw-counts',
      'frozen matrix + rubric + profile manifest',
      'held-out salt committed and unrevealed',
    ]),
    ...overrides,
  };
}

export const pq025GoldCorridorQualificationManifest = createPq025GoldCorridorQualificationManifest();

export default pq025GoldCorridorQualificationManifest;
