// §5 deterministic perf scenario harness: broker manifest for the determinism cell.
// The determinism run (same scenario twice, DETERMINISTIC_FIELDS identical) is valid on a
// contended host by construction — counts, not durations — so the npm gate runs it with
// --diagnostic. Broker-claimed acceptance launches remain available for quiet-host evidence
// via: node scripts/validation-broker-cli.mjs --manifest perf-scenario-determinism

import path from 'node:path';

/** Fixed scenario seed for the cell; must match design/perf/scenario-manifest.json. */
export const PERF_SCENARIO_DETERMINISM_FIXED_SEED = 47;

export function createPerfScenarioDeterminismManifest(overrides = {}) {
  return {
    id: 'perf-scenario-determinism',
    runtimeKind: 'browser',
    command: process.execPath,
    commandArgs: ['scripts/probe-perf-scenario.mjs'],
    mode: 'acceptance',
    fastGateCommands: [
      'node --test test/perf-counters.test.mjs',
      'npm run check:gpu-timers',
      'node --test test/perf-scenario-harness.test.mjs test/performance-scenario-manifest.test.mjs test/performance-cost-table.test.mjs test/vfx-projectile-wake-cadence.test.mjs',
    ],
    scenarioPaths: [
      'design/perf/scenario-manifest.json',
    ],
    regressionSourcePaths: [
      'test/perf-counters.test.mjs',
      'test/gpu-timers.test.mjs',
      'test/performance-profile-present-evidence.test.mjs',
      'test/perf-scenario-harness.test.mjs',
      'test/performance-scenario-manifest.test.mjs',
      'test/performance-cost-table.test.mjs',
      'test/vfx-projectile-wake-cadence.test.mjs',
    ],
    productionSourcePaths: [
      'package.json',
      'scripts/probe-perf-scenario.mjs',
      'scripts/lib/deterministicFramePump.mjs',
      'scripts/lib/perfScenarioHarnessContracts.mjs',
      'scripts/lib/performanceCostTable.mjs',
      'scripts/lib/performanceScenarioManifest.mjs',
      'scripts/lib/performanceClosureContracts.mjs',
      'scripts/lib/perf-present-evidence.mjs',
      'scripts/lib/validationBroker.mjs',
      'scripts/lib/validationFingerprint.mjs',
      'scripts/lib/validationProcessControl.mjs',
      'scripts/validation-manifests/perf-scenario-determinism.mjs',
      'design/perf/scenario-manifest.json',
      'src/core/perfCounters.js',
      'src/core/perfRuntime.js',
      'src/core/presentationRunner.js',
      'src/core/loop.js',
      'src/render/glInstrumentation.js',
      'src/render/gpuTimers.js',
      'src/render/bloom.js',
      'src/render/renderer.js',
      'src/render/vfx.js',
      'src/main.js',
    ],
    harnessSourcePaths: [
      'scripts/lib/load-playwright.mjs',
      'scripts/lib/gameServer.cjs',
      'scripts/lib/visualProbeServer.mjs',
      'scripts/lib/releaseSoakContracts.mjs',
    ],
    runtimeProfile: 'default',
    timeoutMs: 1_800_000,
    maxLaunchesPerCandidate: 1,
    artifactRoot: path.join('.devshots', 'perf', 'scenarios'),
    fixedSeed: PERF_SCENARIO_DETERMINISM_FIXED_SEED,
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

export const perfScenarioDeterminismManifest = createPerfScenarioDeterminismManifest();

export default perfScenarioDeterminismManifest;
