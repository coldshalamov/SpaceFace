#!/usr/bin/env node
// §5 deterministic perf scenario harness (Tier 1).
//
// WHAT THIS IS
// ------------
// Boots the REAL game route under a deterministic frame pump, drives one declared performance
// scenario by FRAMES (never milliseconds), collects the production Tier-1 counter snapshot
// (window.__SPACEFACE_PERF__.getCounterSnapshot()), and — as the harness's own acceptance — runs
// the SAME scenario twice on the SAME commit and asserts every field in DETERMINISTIC_FIELDS is
// identical via diffDeterministicCounters(). If the two runs differ, the harness is not
// deterministic yet and nothing built on it can be trusted; the diff is reported verbatim.
//
// REUSE, NOT REBUILD (see the packet's STEP 1 inventory)
// ------------------------------------------------------
//   - Scenario document: design/perf/scenario-manifest.json, validated/compiled UNMODIFIED by
//     scripts/lib/performanceScenarioManifest.mjs. Scenario ids come from the closed set in
//     scripts/lib/performanceClosureContracts.mjs — a validator rejection is the validator doing
//     its job, not an invitation to widen it.
//   - Frame pump: scripts/lib/deterministicFramePump.mjs, injected through the documented
//     presentationRunner fallback seam (deps.requestFrame/nowMs). No production file changes.
//   - Boot recipe: mirrors scripts/check-shader-compile.mjs / probe-shader-compile-timeline.mjs
//     (splash skip, New Game -> Launch, flight predicate). The seed is entered through the real
//     player affordance (#sf-ng-seed) — the same path a player uses, honored by resetRunState.
//   - Server/launch/claim: acquireVisualProbeServer + validation broker
//     (requireBrokerClaimOrDiagnostic) — no parallel launcher.
//   - Boot boundary: quiescence predicate evaluated HERE, never in shipped code.
//
// DETERMINISM CONSTRUCTION
// ------------------------
// Boot and route completion take their declared frame paths, but only the manifest's digest-bound
// measurement interval is comparable cost evidence. At its exact start the harness calls
// tier1.reset() + markBootBoundary(), snapshots at its exact end, then continues to the separate
// completion receipt. Every measured pump frame advances the synthetic clock by exactly 1000/60 ms,
// so it runs one fixed sim step and covers identical sim time on any host. Counters inside that
// interval are integers over a fixed scenario — comparable across machines and bisectable.
//
// POSITIVE CONTROLS (two identical zeros are not determinism)
// ----------------------------------------------------------
//   - The boot shader ramp must be observed BEFORE reset (shaderLinks >= MIN_BOOT_RAMP), or the
//     GL hooks are dead and every zero in the window is vacuous.
//   - framesObserved must equal the declared measurement frames exactly (the pump really drove).
//   - drawCalls and bufferPartialUploads must be > 0 inside the window (frames really rendered;
//     the per-frame upload path really moved).
// A control failure fails the run LOUDLY; it never reads as a pass.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import { strictWorktreeFingerprint } from './lib/releaseSoakContracts.mjs';
import {
  compilePerformanceScenarioManifest,
  validatePerformanceScenarioManifest,
} from './lib/performanceScenarioManifest.mjs';
import {
  assertHarnessConsumesScenarioDeclaration,
  assertFingerprintUnchanged,
  assertTraceWindowInvocation,
  deriveContextRouteReplay,
  evaluateBoundaryNetworkContinuity,
  evaluateContextRouteStagingReplay,
  evaluateDeterministicFieldCoverage,
  evaluateExactResumeState,
  evaluateExactScenarioWindow,
  evaluateTier1ZeroBudgets,
  isCompletedCometReset,
  isCometPhaseSafeForPresentationHorizon,
  isScenarioMeasurementBoundaryQuiet,
  parseDeterminismRuns,
  planPerformanceScenarioMatrix,
  resolveScenarioLeadIn,
  scenarioMeasurementBoundarySignature,
  selectScenarioTapeEvents,
  shouldContinueScenarioMeasurementDrain,
  shouldYieldAfterScenarioFrame,
} from './lib/perfScenarioHarnessContracts.mjs';
import { installDeterministicFramePump } from './lib/deterministicFramePump.mjs';
import {
  buildPerformanceCostTable,
  compareCounterWindowDeltas,
  projectScenarioResultForCostTable,
  subtractCounterSnapshots,
  TIER1_COST_COUNT_FIELDS,
} from './lib/performanceCostTable.mjs';
import { createPerfScenarioDeterminismManifest } from './validation-manifests/perf-scenario-determinism.mjs';
import {
  DETERMINISTIC_FIELDS,
  diffDeterministicCounters,
} from '../src/core/perfCounters.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = parseArgs(process.argv.slice(2));

const MANIFEST_PATH = argv.manifest || 'design/perf/scenario-manifest.json';
const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
const RUNS = parseDeterminismRuns(argv.runs);
const CHUNK_FRAMES = Math.max(1, Number(argv['chunk-frames'] || 60));
// Quiescence: the boot boundary is the first moment shader links AND texture/mipmap activity have
// both been zero for this many consecutive pumped frames. Frames, never milliseconds (handoff §9.9).
// The headed hardware route proved a 60-frame/1.5s silence tail could still admit one delayed
// texture lifecycle event. 180 one-frame samples with fixed 25ms gaps closed two-run determinism.
const QUIESCENCE_FRAMES = Math.max(10, Number(argv['quiescence-frames'] || 180));
const MAX_BOOT_FRAMES = Math.max(600, Number(argv['max-boot-frames'] || 9000));
const MAX_QUIESCENCE_FRAMES = Math.max(600, Number(argv['max-quiescence-frames'] || 9000));
// Quiescence is intentionally host-paced; scenario measurement is not. Once the public pause route
// has frozen simulation and every async owner is quiet, jump the synthetic presentation clock to
// one fixed future frame and present once. This removes boot-duration phase from cosmetic cadences
// without advancing the world or touching production state.
const PRESENTATION_ALIGNMENT_FRAME = 30_000;
// `flight_steady` is a steady-state row, so one-shot cold-open combat VFX must finish before its
// exact sim-frame measurement boundary. Drain those presentation-owned lifecycles while publicly
// paused, then normalize the future presentation phase without mutating a private VFX pool.
const MEASUREMENT_ALIGNMENT_FRAME = 40_000;
// Live context-recovery evidence settled its diagnosed VFX/admission owners after anywhere from
// 34 to 375 paused presentation frames. Exiting immediately at owner quiet preserved a different
// chase-camera/culling history and moved one already-resident Spindle draw across the window.
// Continue the public paused route for one exact interval above that observed tail before alignment.
// If the owners are not quiet at that fixed boundary, fail instead of extending the presentation
// history variably and moving a culling transition into or out of the measured window.
const FIXED_MEASUREMENT_DRAIN_FRAMES = 420;
const DETERMINISTIC_PUMP_FRAME_SECONDS = 16.666667 / 1000;
const MEASUREMENT_ALIGNMENT_COMET_SECONDS = 0.1;
// Helios's full comet reset is at least 32 s. An unsafe phase has at most the 11.1 s required
// runway left, then <3.2 s active duration: <858 deterministic frames to observe its reset.
const MAX_COMET_PRECONDITION_FRAMES = 900;
// Tier 1 counts and Tier 2 timings must observe the same presentation/macrotask schedule. Every
// scenario frame is therefore one browser task followed by one zero-delay host task, except the
// authored final frame whose snapshot/report is closed atomically in that same browser task.
const SCENARIO_INTERFRAME_YIELD_MS = 0;
const STEADY_MEASUREMENT_BOUNDARY_SCENARIOS = new Set([
  'flight_steady',
  'context_recover_steady',
]);
// Same vacuity floor as check:shader-compile / probe:shader-timeline: a boot that linked almost
// nothing means the render graph never came up, and every in-window zero would be meaningless.
const MIN_BOOT_RAMP_PROGRAMS = Math.max(1, Number(argv['min-boot-ramp'] || 8));
const HARD_DEADLINE_MS = Number(argv['hard-deadline-ms'] || 30 * 60 * 1000);
const HEADED = !!(argv.headed || argv.headless === 'false');
const DIAGNOSTIC = !!argv.diagnostic;
const INCLUDE_TIMING = !!argv.timing;
const TRACE_WINDOW = !!argv['trace-window'];
const ARTIFACT_ROOT = resolve(ROOT, argv['artifact-root'] || '.devshots/perf/scenarios');
const PAGE_NETWORK_ACTIVITY = new WeakMap();

assertTraceWindowInvocation({
  traceWindow: TRACE_WINDOW,
  diagnostic: DIAGNOSTIC,
  includeTiming: INCLUDE_TIMING,
});

const brokerManifest = createPerfScenarioDeterminismManifest();
const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest: brokerManifest,
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});
if (!brokerGate.ok) {
  console.error(`[perf-scenario] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error('[perf-scenario] invoke via: node scripts/validation-broker-cli.mjs --manifest perf-scenario-determinism');
  console.error('[perf-scenario] or pass --diagnostic for the determinism run (Tier-1 counts are contention-invariant)');
  process.exit(2);
}

const startedAt = Date.now();
const deadline = startedAt + HARD_DEADLINE_MS;
let server = null;
const exitState = { code: 0, failures: [] };
let captureFingerprintStart = null;
let scenarioResultsForFailure = [];
let matrixPlanForFailure = null;

function stageLog(msg) {
  console.log(`[perf-scenario] ${msg}`);
}

function assertDeadline(label) {
  if (Date.now() > deadline) {
    throw new Error(`hard deadline (${HARD_DEADLINE_MS}ms) exceeded during ${label} — size waits in frames, and investigate the hang rather than raising this`);
  }
}

try {
  // --- Preflight: the manifest document must pass the UNMODIFIED validator -----------------------
  const manifestSource = resolve(ROOT, MANIFEST_PATH);
  const manifestDoc = JSON.parse(await readFile(manifestSource, 'utf8'));
  const manifestOptions = { requireCompleteMatrix: true, source: MANIFEST_PATH };
  const validation = validatePerformanceScenarioManifest(manifestDoc, manifestOptions);
  if (!validation.ok) {
    console.error(`[perf-scenario] manifest ${MANIFEST_PATH} failed validation (${validation.issueCount} issue(s)):`);
    for (const issue of validation.issues) console.error(`  - ${issue}`);
    throw new Error('invalid performance scenario manifest — fix the document, never the validator');
  }
  const compiled = compilePerformanceScenarioManifest(manifestDoc, manifestOptions);
  stageLog(`manifest ${MANIFEST_PATH} ok: id=${compiled.id} digest=${compiled.manifestDigest.slice(0, 12)}… scenarios=[${compiled.scenarios.map((s) => s.id).join(', ')}]`);

  const matrixPlan = planPerformanceScenarioMatrix(
    compiled,
    argv.scenario ? [String(argv.scenario)] : null,
  );
  matrixPlanForFailure = matrixPlan;

  captureFingerprintStart = await strictWorktreeFingerprint(ROOT);
  const commit = captureFingerprintStart.head;
  const dirty = captureFingerprintStart.changedFileCount > 0;
  stageLog(`commit ${commit.slice(0, 12)} dirty=${dirty} runs=${RUNS} `
    + `runnable=${matrixPlan.runnable.length} notRunnable=${matrixPlan.notRunnable.length} `
    + `broker=${brokerGate.diagnostic ? 'diagnostic-nonpromoting' : 'claimed'}`);

  await mkdir(ARTIFACT_ROOT, { recursive: true });
  let chromium = null;
  if (matrixPlan.runnable.length > 0) {
    server = await acquireVisualProbeServer({ root: ROOT });
    ({ chromium } = await loadPlaywright());
  }

  const scenarioResults = [];
  scenarioResultsForFailure = scenarioResults;
  for (const row of matrixPlan.notRunnable) {
    const report = createNotRunnableReport({
      row,
      compiled,
      commit,
      dirty,
      fingerprints: { start: captureFingerprintStart, end: captureFingerprintStart },
    });
    const outPath = resolve(ARTIFACT_ROOT, `${row.scenarioId}-not-runnable.json`);
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    stageLog(`scenario ${row.scenarioId}: NOT RUNNABLE — ${row.blocker}`);
    stageLog(`evidence: ${outPath}`);
    scenarioResults.push({
      scenarioId: row.scenarioId,
      status: 'not-runnable',
      ok: null,
      blockerCode: row.blockerCode,
      blocker: row.blocker,
      measurementWindow: row.scenario.measurementWindow,
      evidencePath: outPath,
    });
  }

  for (const row of matrixPlan.runnable) {
    const { scenario } = row;
    assertHarnessConsumesScenarioDeclaration(scenario);
    const frames = resolveScenarioFrames(scenario);
    stageLog(`scenario ${scenario.id}: ${frames} frames, seed=${scenario.seed}, runs=${RUNS}`);
    const runs = [];
    const outPath = resolve(ARTIFACT_ROOT, `${scenario.id}-determinism.json`);
    try {
      for (let runIndex = 0; runIndex < RUNS; runIndex++) {
        assertDeadline(`${scenario.id} run ${runIndex + 1}`);
        const fingerprintBeforeRun = await strictWorktreeFingerprint(ROOT);
        assertFingerprintUnchanged(
          captureFingerprintStart,
          fingerprintBeforeRun,
          `${scenario.id} run ${runIndex + 1} preflight`,
        );
        const run = await executeScenarioRun(chromium, server.baseUrl, {
          scenario,
          frames,
          runIndex,
        });
        const fingerprintAfterRun = await strictWorktreeFingerprint(ROOT);
        assertFingerprintUnchanged(
          captureFingerprintStart,
          fingerprintAfterRun,
          `${scenario.id} run ${runIndex + 1} completion`,
        );
        runs.push(run);
        stageLog(`  run ${runIndex + 1}: bootRamp=${run.boot.shaderLinksAtBoundary} links, `
          + `quiescedAfter=${run.boot.quiescencePumpedFrames} pumped frames, `
          + `window framesObserved=${run.snapshot.framesObserved}, `
          + `in-window links=${run.snapshot.totals.shaderLinks} draws=${run.snapshot.totals.drawCalls} `
          + `bufPartial=${run.snapshot.totals.bufferPartialUploads}`);
      }

      const differences = diffDeterministicCounters(runs[0].snapshot, runs[1].snapshot);
      const costCounterWindowDifferences = compareCounterWindowDeltas(
        runs[0].measurement.tier1CountDeltas,
        runs[1].measurement.tier1CountDeltas,
      );
      const controlFailures = runs.flatMap((run) => run.controlFailures);
      const ok = differences.length === 0
        && costCounterWindowDifferences.length === 0
        && controlFailures.length === 0;
      let timing = null;
      let timingPath = null;
      if (ok && INCLUDE_TIMING) {
        timingPath = resolve(ARTIFACT_ROOT, `${scenario.id}-timing.json`);
        try {
          const timingFingerprintStart = await strictWorktreeFingerprint(ROOT);
          assertFingerprintUnchanged(
            captureFingerprintStart,
            timingFingerprintStart,
            `${scenario.id} timing preflight`,
          );
          timing = await executeScenarioTimingRun(chromium, server.baseUrl, {
            scenario,
            frames,
            tier1Runs: runs,
          });
          const timingFingerprintEnd = await strictWorktreeFingerprint(ROOT);
          assertFingerprintUnchanged(
            captureFingerprintStart,
            timingFingerprintEnd,
            `${scenario.id} timing completion`,
          );
          timing.fingerprints = {
            start: timingFingerprintStart,
            end: timingFingerprintEnd,
          };
        } catch (timingError) {
          timing = createTimingFailureReport({
            scenario,
            frames,
            error: timingError,
            fingerprints: {
              start: captureFingerprintStart,
              end: await safeStrictWorktreeFingerprint(),
            },
          });
        }
        await writeFile(timingPath, `${JSON.stringify(timing, null, 2)}\n`, 'utf8');
        stageLog(`timing evidence: ${timingPath}`);
      }
      const fingerprintEnd = await strictWorktreeFingerprint(ROOT);
      assertFingerprintUnchanged(captureFingerprintStart, fingerprintEnd, `${scenario.id} comparison`);
      const report = createDeterminismReport({
        scenario,
        frames,
        compiled,
        commit,
        dirty,
        runs,
        differences,
        costCounterWindowDifferences,
        controlFailures,
        ok,
        fingerprints: { start: captureFingerprintStart, end: fingerprintEnd },
      });
      await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      stageLog(`evidence: ${outPath}`);
      printDeterminismTable(scenario.id, runs, differences, costCounterWindowDifferences);
      const scenarioOk = ok && (!INCLUDE_TIMING || timing?.status === 'measured');
      scenarioResults.push({
        scenarioId: scenario.id,
        status: scenarioOk ? 'deterministic' : 'failed',
        ok: scenarioOk,
        deterministic: ok,
        differences,
        costCounterWindowDifferences,
        controlFailures: [
          ...controlFailures,
          ...(timing?.controlFailures || []),
        ],
        measurementWindow: scenario.measurementWindow,
        tier1CountDeltas: runs[0].measurement.tier1CountDeltas,
        timing,
        timingPath,
        evidencePath: outPath,
      });
    } catch (error) {
      const failure = createRunFailureReport({
        scenario,
        frames,
        compiled,
        commit,
        dirty,
        runs,
        error,
        fingerprints: {
          start: captureFingerprintStart,
          end: await safeStrictWorktreeFingerprint(),
        },
      });
      await writeFile(outPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
      console.error(`[perf-scenario] FAIL ${scenario.id}: ${failure.failure.message}`);
      stageLog(`failure evidence: ${outPath}`);
      scenarioResults.push({
        scenarioId: scenario.id,
        status: 'failed',
        ok: false,
        deterministic: false,
        differences: [],
        controlFailures: [failure.failure.message],
        measurementWindow: scenario.measurementWindow,
        tier1CountDeltas: runs[0]?.measurement?.tier1CountDeltas ?? null,
        timing: null,
        timingPath: null,
        evidencePath: outPath,
      });
    }
  }

  const costTable = buildPerformanceCostTable({
    manifest: {
      path: MANIFEST_PATH,
      id: compiled.id,
      digest: compiled.manifestDigest,
    },
    candidate: captureFingerprintStart,
    scenarios: scenarioResults.map(projectScenarioResultForCostTable),
  });
  const costTablePath = resolve(ARTIFACT_ROOT, 'performance-cost-table.json');
  await writeFile(costTablePath, `${JSON.stringify(costTable, null, 2)}\n`, 'utf8');
  stageLog(`cost table: ${costTablePath} (${costTable.status}, ${costTable.counts.costRows} cost row(s))`);

  const failed = scenarioResults.filter((result) => result.status === 'failed');
  const costTableInvalid = costTable.rows.filter(
    (row) => row.status === 'invalid' || row.status === 'failed',
  );
  const failedScenarioIds = new Set([
    ...failed.map((result) => result.scenarioId),
    ...costTableInvalid.map((row) => row.scenarioId),
  ]);
  const matrixFingerprintEnd = await strictWorktreeFingerprint(ROOT);
  assertFingerprintUnchanged(captureFingerprintStart, matrixFingerprintEnd, 'matrix completion');
  const matrixStatus = failedScenarioIds.size > 0
    ? 'failed'
    : (matrixPlan.notRunnable.length > 0 ? 'runnable-pass-with-blocked' : 'pass');
  const matrixReport = {
    schema: 'spaceface.perfScenarioMatrixRun.v1',
    status: matrixStatus,
    manifest: {
      path: MANIFEST_PATH,
      id: compiled.id,
      manifestDigest: compiled.manifestDigest,
    },
    commit,
    worktreeDirty: dirty,
    fingerprints: { start: captureFingerprintStart, end: matrixFingerprintEnd },
    runtime: 'browser',
    broker: { diagnostic: brokerGate.diagnostic === true },
    runsRequired: RUNS,
    timingRequested: INCLUDE_TIMING,
    costTablePath,
    costTableStatus: costTable.status,
    costTableInvalidScenarioIds: costTableInvalid.map((row) => row.scenarioId),
    counts: {
      selected: scenarioResults.length,
      runnable: matrixPlan.runnable.length,
      notRunnable: matrixPlan.notRunnable.length,
      deterministic: scenarioResults.filter((result) => result.status === 'deterministic').length,
      failed: failedScenarioIds.size,
    },
    rows: scenarioResults,
  };
  const matrixPath = resolve(ARTIFACT_ROOT, 'perf-scenario-matrix.json');
  await writeFile(matrixPath, `${JSON.stringify(matrixReport, null, 2)}\n`, 'utf8');
  stageLog(`matrix evidence: ${matrixPath}`);

  if (failedScenarioIds.size > 0) {
    exitState.code = 1;
    for (const failure of failed) {
      exitState.failures.push(failure.scenarioId);
      console.error(`[perf-scenario] FAIL ${failure.scenarioId}: determinism not established (see table above and evidence JSON)`);
    }
    for (const invalid of costTableInvalid) {
      if (failed.some((failure) => failure.scenarioId === invalid.scenarioId)) continue;
      exitState.failures.push(invalid.scenarioId);
      console.error(
        `[perf-scenario] FAIL ${invalid.scenarioId}: cost-table evidence invalid: `
        + `${JSON.stringify(invalid.blocker || null)}`,
      );
    }
  } else if (matrixPlan.runnable.length === 0) {
    exitState.code = argv.scenario ? 2 : 0;
    stageLog(`NO RUNNABLE SCENARIOS selected; ${matrixPlan.notRunnable.length} honest not-runnable row(s) recorded`);
  } else if (matrixPlan.notRunnable.length > 0) {
    stageLog(`ALL ${matrixPlan.runnable.length} RUNNABLE SCENARIOS DETERMINISTIC across ${RUNS} runs; `
      + `${matrixPlan.notRunnable.length} blocked row(s) recorded without synthetic evidence`);
  } else {
    stageLog(`ALL SCENARIOS DETERMINISTIC across ${RUNS} runs (DETERMINISTIC_FIELDS identical, positive controls green)`);
  }
} catch (error) {
  exitState.code = 1;
  exitState.failures.push(String(error?.message || error));
  console.error(`[perf-scenario] FAIL: ${error?.message || error}`);
  try {
    await mkdir(ARTIFACT_ROOT, { recursive: true });
    const failurePath = resolve(ARTIFACT_ROOT, 'perf-scenario-matrix.json');
    const failure = {
      schema: 'spaceface.perfScenarioMatrixRun.v1',
      status: 'failed',
      runtime: 'browser',
      broker: { diagnostic: brokerGate.diagnostic === true },
      fingerprints: {
        start: captureFingerprintStart,
        end: await safeStrictWorktreeFingerprint(),
      },
      failure: {
        message: String(error?.message || error),
        stack: typeof error?.stack === 'string' ? error.stack.slice(0, 12_000) : null,
      },
      counts: {
        selected: scenarioResultsForFailure.length,
        runnable: matrixPlanForFailure?.runnable?.length || 0,
        notRunnable: matrixPlanForFailure?.notRunnable?.length || 0,
        deterministic: scenarioResultsForFailure.filter((row) => row.status === 'deterministic').length,
        failed: Math.max(1, scenarioResultsForFailure.filter((row) => row.status === 'failed').length),
      },
      rows: scenarioResultsForFailure,
    };
    await writeFile(failurePath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
    stageLog(`failure evidence: ${failurePath}`);
  } catch (artifactError) {
    console.error(`[perf-scenario] failed to write top-level failure artifact: ${artifactError?.message || artifactError}`);
  }
} finally {
  await server?.close?.().catch(() => {});
}

process.exit(exitState.code);

// ------------------------------------------------------------------------------------------------

function scenarioManifestIdentity(compiled, scenario) {
  return {
    path: MANIFEST_PATH,
    id: compiled.id,
    manifestDigest: compiled.manifestDigest,
    scenarioDigest: scenario.scenarioDigest,
    scenarioDefinitionDigest: scenario.scenarioDefinitionDigest,
    saveDigest: scenario.saveDigest,
    inputDigest: scenario.inputDigest,
    cameraDigest: scenario.cameraDigest,
  };
}

function serializeCompletedRuns(runs) {
  return runs.map((run) => ({
    runIndex: run.runIndex,
    boot: run.boot,
    route: run.route,
    completion: run.completion,
    measurement: run.measurement,
    positiveControls: run.positiveControls,
    controlFailures: run.controlFailures,
    pump: run.pump,
    pageErrors: run.pageErrors,
    consoleErrors: run.consoleErrors,
    snapshot: run.snapshot,
  }));
}

function createDeterminismReport({
  scenario,
  frames,
  compiled,
  commit,
  dirty,
  runs,
  differences,
  costCounterWindowDifferences,
  controlFailures,
  ok,
  fingerprints,
}) {
  return {
    schema: 'spaceface.perfScenarioDeterminism.v1',
    status: ok ? 'deterministic' : 'failed',
    tier: 1,
    scenarioId: scenario.id,
    seed: scenario.seed,
    frames,
    manifest: scenarioManifestIdentity(compiled, scenario),
    commit,
    worktreeDirty: dirty,
    fingerprints,
    runtime: 'browser',
    broker: { diagnostic: brokerGate.diagnostic === true },
    // Tier-1 counters are contention-invariant by construction (counts, not durations), so this
    // determinism cell does not require a quiet host. Any future Tier-2 fields added here must
    // carry "informational_contended": true unless the broker granted one — reuse that exact key.
    environment: runs[0]?.environment ?? null,
    deterministicFields: [...DETERMINISTIC_FIELDS],
    determinism: {
      ok,
      runsCompared: 2,
      additionalRunsCollected: Math.max(0, runs.length - 2),
      differences,
      costCounterWindow: {
        fields: [...TIER1_COST_COUNT_FIELDS],
        differences: costCounterWindowDifferences,
        ok: costCounterWindowDifferences.length === 0,
      },
      controlFailures,
    },
    runs: serializeCompletedRuns(runs),
  };
}

function createRunFailureReport({
  scenario,
  frames,
  compiled,
  commit,
  dirty,
  runs,
  error,
  fingerprints,
}) {
  const message = String(error?.message || error);
  return {
    schema: 'spaceface.perfScenarioDeterminism.v1',
    status: 'failed',
    tier: 1,
    scenarioId: scenario.id,
    seed: scenario.seed,
    frames,
    manifest: scenarioManifestIdentity(compiled, scenario),
    commit,
    worktreeDirty: dirty,
    fingerprints,
    runtime: 'browser',
    broker: { diagnostic: brokerGate.diagnostic === true },
    environment: runs[0]?.environment ?? null,
    deterministicFields: [...DETERMINISTIC_FIELDS],
    determinism: {
      ok: false,
      runsCompared: Math.min(runs.length, 2),
      additionalRunsCollected: Math.max(0, runs.length - 2),
      differences: [],
      controlFailures: [message],
    },
    failure: {
      message,
      stack: typeof error?.stack === 'string' ? error.stack.slice(0, 12_000) : null,
      completedRuns: runs.length,
      runtimeEvidence: error?.runtimeEvidence ?? null,
    },
    runs: serializeCompletedRuns(runs),
  };
}

function createTimingFailureReport({
  scenario,
  frames,
  error,
  fingerprints,
}) {
  const message = String(error?.message || error);
  return {
    schema: 'spaceface.perfScenarioTiming.v1',
    status: 'failed',
    tier: 2,
    scenarioId: scenario.id,
    seed: scenario.seed,
    frames,
    measurementWindow: scenario.measurementWindow,
    runtime: 'browser',
    broker: { diagnostic: brokerGate.diagnostic === true },
    informational_contended: brokerGate.diagnostic === true,
    fingerprints,
    controls: [],
    controlFailures: [message],
    cpuReport: null,
    gpuReport: null,
    failure: {
      message,
      stack: typeof error?.stack === 'string' ? error.stack.slice(0, 12_000) : null,
      runtimeEvidence: error?.runtimeEvidence ?? null,
    },
  };
}

function createNotRunnableReport({ row, compiled, commit, dirty, fingerprints }) {
  return {
    schema: 'spaceface.perfScenarioNotRunnable.v1',
    status: 'not-runnable',
    tier: 1,
    scenarioId: row.scenarioId,
    routeAuthority: {
      workloadClass: row.definition?.workloadClass ?? null,
      injectedState: row.definition?.injectedState === true,
      leaseGate: row.definition?.leaseGate ?? null,
    },
    manifest: scenarioManifestIdentity(compiled, row.scenario),
    commit,
    worktreeDirty: dirty,
    fingerprints,
    runtime: 'browser',
    blocker: {
      code: row.blockerCode,
      detail: row.blocker,
    },
    measurements: null,
    runs: [],
  };
}

function resolveScenarioFrames(scenario) {
  const completion = scenario.expectedRouteCompletion;
  if (completion?.marker === 'frames:scenario-complete' && Number.isSafeInteger(completion.value) && completion.value > 0) {
    return completion.value;
  }
  throw new Error(`scenario ${scenario.id}: expectedRouteCompletion marker must be "frames:scenario-complete" with a positive integer value (got ${JSON.stringify(completion)})`);
}

/**
 * One full isolated run: fresh browser, boot under the pump to flight, quiesce, reset, drive the
 * scenario window, snapshot. Never reuses a page across runs — cross-run state leakage would
 * manufacture agreement.
 */
async function executeScenarioRun(chromium, baseUrl, { scenario, frames, runIndex }) {
  const browser = await chromium.launch({
    headless: !HEADED,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      // Without these an occluded/backgrounded page throttles timers; the pump is harness-driven,
      // but boot asset fetches and decode work still ride real timers between pump chunks.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
    ],
  });
  const pageErrors = [];
  const consoleErrors = [];
  let page = null;
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 1 });
    page = await context.newPage();
    attachPageNetworkActivityTracker(page);
    page.setDefaultTimeout(900_000);
    page.on('pageerror', (error) => { pageErrors.push(String(error?.message || error)); });
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 500));
    });

    // Order matters: the pump must be installed before ANY page script can capture the real rAF.
    await page.addInitScript(installDeterministicFramePump);
    await page.addInitScript(installPerformanceScenarioBoundaryProbe);
    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* private mode */ }
      try { localStorage.setItem('sf.firstRunIntroSeen', '1'); } catch (_) { /* private mode */ }
      // Arm the PRODUCTION instrumentation seam before navigation: it is read once, at renderer
      // construction, and installs the GL wrappers there. After that point there is no mid-session
      // start that would not leave a report with invisible provenance.
      window.__SPACEFACE_PERF_COUNTERS__ = true;
    });

    let route = await bootScenarioToRoute(
      page,
      baseUrl,
      scenario,
      consoleErrors,
      `run ${runIndex + 1}`,
    );

    // --- Boot boundary by quiescence (the harness's call, never the runtime's) -------------------
    let quiescenceFreeze = await freezeScenarioForQuiescence(page, scenario);
    const initialBoot = await quiesce(page, { allowMeshReconcileDirty: true });
    const reconcileKick = await kickMeshReconcileIfNeeded(page, scenario, quiescenceFreeze);
    let boot = initialBoot;
    if (reconcileKick.kicked) {
      quiescenceFreeze = reconcileKick.freezeReceipt;
      const finalBoot = await quiesce(page);
      boot = {
        ...finalBoot,
        quiescencePumpedFrames: initialBoot.quiescencePumpedFrames
          + reconcileKick.pumpedFrames
          + finalBoot.quiescencePumpedFrames,
        passes: [initialBoot, finalBoot],
        reconcileKick,
      };
    }
    const presentationAlignment = await alignScenarioPresentationClock(page, scenario);
    const quiescenceResume = await resumeScenarioAfterQuiescence(page, quiescenceFreeze);
    const postQuiescenceArm = await armScenarioAfterQuiescence(page, scenario, route);
    route = {
      ...route,
      quiescenceFreeze,
      quiescenceResume,
      reconcileKick,
      presentationAlignment,
      postQuiescenceArm,
    };

    // Drive the complete route, but reset/snapshot Tier 1 only at the manifest's digest-bound
    // measurement interval. Completion frames remain a route control; they cannot contaminate the
    // cost row or manufacture nondeterminism outside the authored capture horizon.
    const scenarioStart = await captureScenarioStart(page);
    const measuredWindow = await driveScenarioWindow(page, scenario, frames, scenarioStart);
    const { measurement, snapshot } = measuredWindow;
    const completion = await collectScenarioCompletionReceipt(page, scenario, scenarioStart, frames);

    if (!snapshot) throw new Error('getCounterSnapshot() returned nothing — the production instrumentation seam never armed');
    const pump = await page.evaluate(() => ({
      frame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
      pending: window.__SF_DETERMINISTIC_PUMP__?.pending ?? null,
      errors: window.__SF_DETERMINISTIC_PUMP__?.errors ?? [],
    }));
    const environment = await captureEnvironment(page);

    const { positiveControls, controlFailures } = evaluatePositiveControls({
      snapshot, pump, pageErrors, consoleErrors, boot, route, completion, measurement,
    });
    return {
      runIndex,
      boot,
      route,
      completion,
      measurement,
      snapshot,
      pump,
      environment,
      pageErrors,
      consoleErrors,
      positiveControls,
      controlFailures,
    };
  } catch (error) {
    const runtimeEvidence = page ? await page.evaluate(() => {
      const dynamic = window.SF?.state?.render?.dynamicBufferRanges || null;
      return {
        mode: window.SF?.state?.mode ?? null,
        tick: window.SF?.state?.tick ?? null,
        pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
        recentBusEvents: (window.__PERF_SCENARIO_EVENTS__ || []).slice(-80),
        dynamicBufferRanges: dynamic ? JSON.parse(JSON.stringify(dynamic)) : null,
        counterSnapshot: window.__SPACEFACE_PERF__?.getCounterSnapshot?.() ?? null,
      };
    }).catch((evidenceError) => ({
      captureFailed: String(evidenceError?.message || evidenceError),
    })) : { captureFailed: 'page was not created before failure' };
    error.runtimeEvidence = {
      ...runtimeEvidence,
      pageErrors: pageErrors.slice(-16),
      consoleErrors: consoleErrors.slice(-16),
    };
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Tier 2 is deliberately a third fresh page. Tier-1's GL wrappers deoptimize the draw path, so
 * durations from either deterministic-count run are invalid timing evidence.
 */
async function executeScenarioTimingRun(chromium, baseUrl, { scenario, frames, tier1Runs }) {
  const browser = await chromium.launch({
    headless: !HEADED,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
    ],
  });
  const pageErrors = [];
  const consoleErrors = [];
  let page = null;
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 1 });
    page = await context.newPage();
    attachPageNetworkActivityTracker(page);
    page.setDefaultTimeout(900_000);
    page.on('pageerror', (error) => { pageErrors.push(String(error?.message || error)); });
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 500));
    });

    await page.addInitScript(installDeterministicFramePump, { clockMode: 'native-timing' });
    await page.addInitScript(installPerformanceScenarioBoundaryProbe);
    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* private mode */ }
      try { localStorage.setItem('sf.firstRunIntroSeen', '1'); } catch (_) { /* private mode */ }
      // Intentionally do NOT set __SPACEFACE_PERF_COUNTERS__. The positive control below verifies
      // that neither Tier-1 nor its GL wrappers leaked into this timing page.
    });

    const contextRouteReplay = scenario.id === 'context_recover_steady'
      ? deriveContextRouteReplay(tier1Runs)
      : null;
    let route = await bootScenarioToRoute(
      page,
      baseUrl,
      scenario,
      consoleErrors,
      'timing',
      { contextRouteReplay },
    );
    let quiescenceFreeze = await freezeScenarioForQuiescence(page, scenario);
    const settleFrames = Math.max(
      QUIESCENCE_FRAMES,
      ...tier1Runs.map((run) => Number(run?.boot?.quiescencePumpedFrames) || 0),
    );
    await pumpScenarioFrames(page, settleFrames, {
      chunkFrames: CHUNK_FRAMES,
      yieldMs: 25,
      label: 'timing-settle-replay',
    });
    // Let decoder/promise owners finish without advancing world time. Then give the render owner one
    // fixed block to consume any completed mesh work. Variable frame pumping here would make the
    // timing scenario start at a host-speed-dependent simulation age.
    await waitForAdmissionOwnersWithoutFrames(page, {
      label: 'timing-admission-owner-settle',
      timeoutMs: 120_000,
    });
    await pumpScenarioFrames(page, QUIESCENCE_FRAMES, {
      chunkFrames: 1,
      yieldMs: 25,
      label: 'timing-fixed-render-drain',
    });
    const reconcileKick = await kickMeshReconcileIfNeeded(page, scenario, quiescenceFreeze);
    if (reconcileKick.kicked) {
      quiescenceFreeze = reconcileKick.freezeReceipt;
      await waitForAdmissionOwnersWithoutFrames(page, {
        label: 'timing-post-reconcile-owner-settle',
        timeoutMs: 120_000,
      });
      await pumpScenarioFrames(page, QUIESCENCE_FRAMES, {
        chunkFrames: 1,
        yieldMs: 25,
        label: 'timing-post-reconcile-render-drain',
      });
    }
    const presentationAlignment = await alignScenarioPresentationClock(page, scenario);
    const quiescenceResume = await resumeScenarioAfterQuiescence(page, quiescenceFreeze);
    const postQuiescenceArm = await armScenarioAfterQuiescence(page, scenario, route);
    route = {
      ...route,
      quiescenceFreeze,
      quiescenceResume,
      reconcileKick,
      presentationAlignment,
      postQuiescenceArm,
    };

    const scenarioStart = await captureScenarioStart(page);
    const startFrame = scenario.measurementWindow.startFrame;
    const frameCount = scenario.measurementWindow.frameCount;
    const endFrame = startFrame + frameCount;
    await driveScenarioTapeRange(page, scenario, 0, startFrame, { timingSamples: null });
    const stabilizedBoundary = await stabilizeScenarioMeasurementBoundary(
      page,
      scenario,
      scenarioStart,
    );
    const activatedBoundary = await activateScenarioMeasurementBoundary(
      page,
      scenario,
      stabilizedBoundary,
      'tier2',
    );
    const measurementBoundaryDrain = activatedBoundary.receipt;
    const measurementStart = activatedBoundary.measurementStart;
    const arm = activatedBoundary.arm;

    const timingSamples = [];
    const timingWindow = await driveScenarioTapeRange(page, scenario, startFrame, endFrame, {
      timingSamples,
      closeTimingAtEnd: true,
    });
    const close = timingWindow.close;
    if (!close) throw new Error(`${scenario.id}: timing window did not close in its final pump task`);

    await driveScenarioTapeRange(page, scenario, endFrame, frames, { timingSamples: null });
    await releaseScenarioKeys(page, scenario);
    const completion = await collectScenarioCompletionReceipt(page, scenario, scenarioStart, frames);
    const gpuClose = await finalizeTimingGpuCapture(page);
    close.drain = gpuClose.drain;
    close.gpuReport = gpuClose.gpuReport;
    const pump = await page.evaluate(() => ({
      frame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
      pending: window.__SF_DETERMINISTIC_PUMP__?.pending ?? null,
      errors: window.__SF_DETERMINISTIC_PUMP__?.errors ?? [],
    }));
    const environment = await captureEnvironment(page);
    const telemetryCoverage = buildTimingTelemetryCoverage({
      scenario,
      cpuReport: close.cpuReport,
      gpuReport: close.gpuReport,
    });
    const { controls, controlFailures } = evaluateTimingControls({
      scenario,
      frameCount,
      route,
      measurementBoundaryDrain,
      measurementStart,
      arm,
      timingSamples,
      close,
      completion,
      pump,
      pageErrors,
      consoleErrors,
      tier1Runs,
    });
    return {
      schema: 'spaceface.perfScenarioTiming.v1',
      status: controlFailures.length === 0 ? 'measured' : 'invalid',
      tier: 2,
      scenarioId: scenario.id,
      seed: scenario.seed,
      frames,
      measurementWindow: { startFrame, frameCount, endFrame },
      frameTaskSchedule: timingWindow.frameTaskSchedule,
      settleReplayFrames: settleFrames,
      runtime: 'browser',
      broker: { diagnostic: brokerGate.diagnostic === true },
      informational_contended: brokerGate.diagnostic === true,
      route,
      completion,
      measurementBoundaryDrain,
      measurementStart,
      measurementEnd: close.boundary,
      arm,
      drain: close.drain,
      environment,
      telemetryCoverage,
      controls,
      controlFailures,
      cpuReport: close.cpuReport,
      gpuReport: close.gpuReport,
      timingSamples: {
        count: timingSamples.length,
        stepsPerFrameHistogram: histogramOf(timingSamples.map((sample) => sample.stepsThisFrame)),
      },
      pump,
      pageErrors,
      consoleErrors,
    };
  } catch (error) {
    const runtimeEvidence = page ? await page.evaluate(() => ({
      mode: window.SF?.state?.mode ?? null,
      tick: window.SF?.state?.tick ?? null,
      pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
      pumpClockMode: window.__SF_DETERMINISTIC_PUMP__?.clockMode ?? null,
      recentBusEvents: (window.__PERF_SCENARIO_EVENTS__ || []).slice(-80),
      perfReport: window.__SPACEFACE_PERF__?.getReport?.() ?? null,
      gpuReport: window.SF?.state?.render?.gpuTimers?.getReport?.() ?? null,
    })).catch((evidenceError) => ({
      captureFailed: String(evidenceError?.message || evidenceError),
    })) : { captureFailed: 'page was not created before timing failure' };
    error.runtimeEvidence = {
      ...runtimeEvidence,
      pageErrors: pageErrors.slice(-16),
      consoleErrors: consoleErrors.slice(-16),
    };
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function bootScenarioToRoute(
  page,
  baseUrl,
  scenario,
  consoleErrors,
  runLabel,
  routeOptions = {},
) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await assertPump(page);
  await pumpUntil(page, () => !!(window.SF?.state && window.SF?.registry && window.SF?.bus), {
    label: 'sf-global', maxFrames: 1200,
  });
  await page.evaluate(() => {
    const bus = window.SF?.bus;
    if (!bus || bus.__perfScenarioTapped) return;
    bus.__perfScenarioTapped = true;
    const original = bus.emit.bind(bus);
    window.__PERF_SCENARIO_EVENTS__ = [];
    bus.emit = (name, payload) => {
      const log = window.__PERF_SCENARIO_EVENTS__;
      log.push(String(name));
      if (log.length > 400) log.splice(0, log.length - 400);
      return original(name, payload);
    };
  });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) await page.keyboard.press('Space');
  await pumpUntil(page, isScreenVisible, { label: 'main-menu', maxFrames: MAX_BOOT_FRAMES, arg: 'mainMenu' });
  await clickButtonByText(page, 'New Game', { exact: true, label: 'main-menu' });
  await pumpUntil(page, isScreenVisible, { label: 'new-game-screen', maxFrames: 1200, arg: 'newGame' });
  const seedApplied = await page.evaluate((seedText) => {
    const input = document.querySelector('#sf-ng-seed');
    if (!input) return false;
    input.value = seedText;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value === seedText;
  }, String(scenario.seed));
  if (!seedApplied) throw new Error('#sf-ng-seed not found on the newGame screen — the public seed affordance moved');
  const launchClicked = await clickButtonByText(page, 'Launch', { exact: true, label: 'new-game-screen' });
  stageLog(`${runLabel}: launch clicked=${launchClicked}`);
  await pumpUntil(page, () => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    return state?.mode === 'flight' && player?.alive !== false && player?.hull > 0;
  }, {
    label: 'await-flight',
    maxFrames: MAX_BOOT_FRAMES,
    abort: () => (window.__PERF_SCENARIO_EVENTS__ || []).includes('game:startFailed'),
    abortReason: () => `game:startFailed fired — startup failed; recent console errors: ${
      JSON.stringify(consoleErrors.slice(-5))}`,
  });
  await clickButtonByText(page, 'begin', { exact: false, label: 'post-flight', optional: true });
  return prepareScenarioRoute(page, scenario, routeOptions);
}

async function prepareScenarioRoute(page, scenario, routeOptions = {}) {
  if (scenario.id === 'flight_steady') {
    const receipt = await page.evaluate(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state.playerId)
        || state?.entityList?.find?.((entity) => entity?.id === state.playerId);
      return {
        pass: state?.mode === 'flight' && state?.ui?.docked !== true && player?.alive !== false,
        route: 'new-game-flight',
        mode: state?.mode ?? null,
        docked: state?.ui?.docked === true,
        playerAlive: player?.alive !== false,
      };
    });
    if (!receipt.pass) throw new Error(`flight_steady route receipt failed: ${JSON.stringify(receipt)}`);
    return receipt;
  }

  if (scenario.id === 'context_recover_steady') {
    return prepareContextRecoveryRoute(page, routeOptions);
  }

  throw new Error(`scenario ${scenario.id} has no deterministic route adapter`);
}

async function prepareContextRecoveryRoute(page, { contextRouteReplay = null } = {}) {
  // Context recovery is a steady-state route, not an early-boot race. First settle the ordinary
  // public flight route at one exact world age, then advance to the context trigger while the
  // route-specific lead-in remains independently tracked. Loss/restore itself happens under the
  // public pause so host-dependent WebGL event latency cannot advance camera or simulation state.
  const sourceScenario = { id: 'flight_steady' };
  const recoveryScenario = { id: 'context_recover_steady' };
  let sourceFreeze = await freezeScenarioForQuiescence(page, sourceScenario);
  const sourceInitialQuiescence = await quiesce(page, {
    allowMeshReconcileDirty: true,
    minimumFrames: contextRouteReplay?.minimumFrames?.sourceInitial,
  });
  const sourceReconcileKick = await kickMeshReconcileIfNeeded(
    page,
    sourceScenario,
    sourceFreeze,
  );
  let sourceFinalQuiescence = null;
  if (sourceReconcileKick.kicked) {
    sourceFreeze = sourceReconcileKick.freezeReceipt;
    sourceFinalQuiescence = await quiesce(page, {
      minimumFrames: contextRouteReplay?.minimumFrames?.sourceFinal,
    });
  }
  const sourceResume = await resumeScenarioAfterQuiescence(page, sourceFreeze);
  if (!sourceResume.pass) {
    throw new Error(`context recovery source route could not resume: ${JSON.stringify(sourceResume)}`);
  }
  const recoveryFreeze = await freezeScenarioForQuiescence(page, recoveryScenario);
  const recoverySourceQuiescence = await quiesce(page, {
    minimumFrames: contextRouteReplay?.minimumFrames?.recoverySource,
  });
  const recoverySource = await page.evaluate(() => ({
    mode: window.SF?.state?.mode ?? null,
    timeScale: window.SF?.state?.timeScale ?? null,
    tick: window.SF?.state?.tick ?? null,
    simTime: window.SF?.state?.simTime ?? null,
    accumulator: window.SF?.state?.accumulator ?? null,
    pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
    topScreen: window.SF?.state?.ui?.screenStack?.at?.(-1) ?? null,
  }));
  if (recoverySource.mode !== 'paused'
    || Number(recoverySource.timeScale) !== 0
    || recoverySource.tick !== 180
    || recoverySource.topScreen !== 'pause') {
    throw new Error(
      `context recovery source is not fixed at paused tick 180: ${JSON.stringify(recoverySource)}`,
    );
  }

  const armed = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId)
      || state?.entityList?.find?.((entity) => entity?.id === state.playerId);
    const renderer = state?.render?.renderer || null;
    const canvas = renderer?.domElement || document.getElementById('gl-canvas');
    const gl = renderer?.getContext?.()
      || canvas?.getContext?.('webgl2')
      || canvas?.getContext?.('webgl');
    const extension = gl?.getExtension?.('WEBGL_lose_context');
    if (!canvas || !gl || !extension || !player?.mesh) {
      return { pass: false, reason: 'renderer/context/extension/player unavailable' };
    }
    const receipt = {
      lost: false,
      restored: false,
      beforeMeshUuid: player.mesh.uuid,
      lostAtPumpFrame: null,
      restoredAtPumpFrame: null,
    };
    canvas.addEventListener('webglcontextlost', () => {
      receipt.lost = true;
      receipt.lostAtPumpFrame = window.__SF_DETERMINISTIC_PUMP__?.frame ?? null;
    }, { once: true });
    canvas.addEventListener('webglcontextrestored', () => {
      receipt.restored = true;
      receipt.restoredAtPumpFrame = window.__SF_DETERMINISTIC_PUMP__?.frame ?? null;
    }, { once: true });
    window.__PERF_SCENARIO_CONTEXT_RECOVERY__ = { receipt, extension };
    extension.loseContext();
    return { pass: true, beforeMeshUuid: receipt.beforeMeshUuid };
  });
  if (!armed.pass) throw new Error(`context recovery route could not arm: ${armed.reason}`);

  await pumpUntil(page, () => (
    window.__PERF_SCENARIO_CONTEXT_RECOVERY__?.receipt?.lost === true
  ), {
    label: 'context-loss-event',
    maxFrames: 600,
  });
  const restoreRequested = await page.evaluate(() => {
    const lifecycle = window.__PERF_SCENARIO_CONTEXT_RECOVERY__;
    if (!lifecycle?.extension) return false;
    lifecycle.extension.restoreContext();
    return true;
  });
  if (!restoreRequested) throw new Error('context recovery route lost its WEBGL_lose_context extension');

  await pumpUntil(page, () => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId)
      || state?.entityList?.find?.((entity) => entity?.id === state.playerId);
    const renderer = state?.render?.renderer || null;
    const gl = renderer?.getContext?.();
    const lifecycle = window.__PERF_SCENARIO_CONTEXT_RECOVERY__;
    const data = player?.mesh?.userData || {};
    return lifecycle?.receipt?.lost === true
      && lifecycle?.receipt?.restored === true
      && gl?.isContextLost?.() === false
      && data.authoredAssetState === 'authored'
      && data.authoredVisualRoot === 'authored-root'
      && data.authoredReadableFallbackRetained === false;
  }, {
    label: 'context-restored-authored-flight',
    maxFrames: 5400,
  });

  const postRestoreQuiescence = await quiesce(page, {
    allowMeshReconcileDirty: true,
    minimumFrames: contextRouteReplay?.minimumFrames?.postRestore,
  });
  const receipt = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId)
      || state?.entityList?.find?.((entity) => entity?.id === state.playerId);
    const renderer = state?.render?.renderer || null;
    const gl = renderer?.getContext?.();
    const lifecycle = window.__PERF_SCENARIO_CONTEXT_RECOVERY__;
    const base = lifecycle?.receipt || {};
    const result = {
      pass: base.lost === true
        && base.restored === true
        && gl?.isContextLost?.() === false
        && state?.mode === 'paused'
        && Number(state?.timeScale) === 0
        && state?.tick === 180
        && state?.ui?.screenStack?.at?.(-1) === 'pause',
      route: 'webgl-context-loss-restore',
      lostEvent: base.lost === true,
      restoredEvent: base.restored === true,
      lostAtPumpFrame: base.lostAtPumpFrame ?? null,
      restoredAtPumpFrame: base.restoredAtPumpFrame ?? null,
      beforeMeshUuid: base.beforeMeshUuid ?? null,
      afterMeshUuid: player?.mesh?.uuid ?? null,
      authoredAssetState: player?.mesh?.userData?.authoredAssetState ?? null,
      authoredVisualRoot: player?.mesh?.userData?.authoredVisualRoot ?? null,
      contextLostAtEnd: gl?.isContextLost?.() ?? null,
      restoredMode: state?.mode ?? null,
      restoredTimeScale: state?.timeScale ?? null,
      restoredTick: state?.tick ?? null,
      restoredSimTime: state?.simTime ?? null,
      restoredAccumulator: state?.accumulator ?? null,
      restoredPumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
      restoredTopScreen: state?.ui?.screenStack?.at?.(-1) ?? null,
    };
    delete window.__PERF_SCENARIO_CONTEXT_RECOVERY__;
    return result;
  });
  if (!receipt.pass) throw new Error(`context recovery route receipt failed: ${JSON.stringify(receipt)}`);
  const recoveryResume = await resumeScenarioAfterQuiescence(page, recoveryFreeze);
  if (!recoveryResume.pass || recoveryResume.resumed !== true) {
    throw new Error(`context recovery route could not resume exactly: ${JSON.stringify(recoveryResume)}`);
  }
  const stagingReplay = evaluateContextRouteStagingReplay({
    expected: contextRouteReplay,
    actual: {
      sourceInitial: sourceInitialQuiescence,
      sourceFinal: sourceFinalQuiescence,
      recoverySource: recoverySourceQuiescence,
      postRestore: postRestoreQuiescence,
      sourceReconcileKicked: sourceReconcileKick.kicked,
    },
    quiescenceFrames: QUIESCENCE_FRAMES,
    maximumFrames: MAX_QUIESCENCE_FRAMES,
  });
  if (!stagingReplay.pass) {
    throw new Error(`context route timing replay diverged: ${JSON.stringify(stagingReplay)}`);
  }
  return {
    ...receipt,
    sourceStaging: {
      sourceFreeze,
      sourceInitialQuiescence,
      sourceReconcileKick,
      sourceFinalQuiescence,
      sourceResume,
      recoveryFreeze,
      recoverySourceQuiescence,
      recoverySource,
      postRestoreQuiescence,
      recoveryResume,
      stagingReplay,
    },
  };
}

async function captureScenarioStart(page) {
  const start = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId)
      || state?.entityList?.find?.((entity) => entity?.id === state.playerId);
    return {
      pass: state?.mode === 'flight' && state?.ui?.docked !== true && player?.alive !== false,
      mode: state?.mode ?? null,
      docked: state?.ui?.docked === true,
      playerAlive: player?.alive !== false,
      tick: state?.tick ?? null,
      simTime: state?.simTime ?? null,
      accumulator: state?.accumulator ?? null,
      pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
      position: {
        x: Number(player?.pos?.x ?? player?.x) || 0,
        z: Number(player?.pos?.z ?? player?.z) || 0,
      },
    };
  });
  if (!start.pass) throw new Error(`scenario pre-window route receipt failed: ${JSON.stringify(start)}`);
  return start;
}

async function collectScenarioCompletionReceipt(page, scenario, scenarioStart, frames) {
  const receipt = await page.evaluate(({ startTick, startPosition, expectedFrames }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId)
      || state?.entityList?.find?.((entity) => entity?.id === state.playerId);
    const endPosition = {
      x: Number(player?.pos?.x ?? player?.x) || 0,
      z: Number(player?.pos?.z ?? player?.z) || 0,
    };
    const dx = endPosition.x - (Number(startPosition?.x) || 0);
    const dz = endPosition.z - (Number(startPosition?.z) || 0);
    const distance = Math.hypot(dx, dz);
    const tickDelta = Number(state?.tick) - Number(startTick);
    const playerAlive = player?.alive !== false;
    const routeStable = state?.mode === 'flight' && state?.ui?.docked !== true && playerAlive;
    return {
      pass: tickDelta === expectedFrames && distance > 0.01 && routeStable,
      tickDelta,
      expectedFrames,
      distance,
      routeStable,
      mode: state?.mode ?? null,
      docked: state?.ui?.docked === true,
      endTick: state?.tick ?? null,
      endSimTime: state?.simTime ?? null,
      endPosition,
      playerAlive,
    };
  }, {
    startTick: scenarioStart?.tick,
    startPosition: scenarioStart?.position,
    expectedFrames: frames,
  });
  if (!receipt.pass) {
    throw new Error(`${scenario.id} completion receipt failed: ${JSON.stringify(receipt)}`);
  }
  return receipt;
}

async function assertPump(page) {
  const installed = await page.evaluate(() => {
    const pump = window.__SF_DETERMINISTIC_PUMP__;
    return !!(pump && typeof pump.step === 'function' && pump.frame === 0);
  });
  if (!installed) throw new Error('deterministic frame pump did not install — addInitScript ordering broke');
  const stepped = await page.evaluate(() => window.__SF_DETERMINISTIC_PUMP__.step(1));
  if (stepped !== 1) throw new Error(`deterministic pump step(1) returned ${stepped} — the synthetic clock is not driving`);
}

/**
 * Pump until a page predicate is true. The harness — never a wall-clock timeout — decides how many
 * frames a phase may take; a 25 ms macrotask gap between chunks lets fetches/decodes/timers run,
 * and that gap schedule is fixed and identical across runs.
 */
async function pumpUntil(page, predicate, { label, maxFrames, arg = null, abort = null, abortReason = null } = {}) {
  for (let pumped = 0; pumped < maxFrames;) {
    assertDeadline(label);
    // One presented frame per sample plus a fixed macrotask gap makes "60 quiet frames" a real
    // async-silence tail. Pumping all 60 synchronously gave fetch/decode/setTimeout owners no chance
    // to publish between samples, so a nominally quiet boundary could be followed by a late upload.
    await stepFrames(page, 1);
    pumped += 1;
    if (await page.evaluate(predicate, arg)) return { ok: true, pumped };
    if (abort && await page.evaluate(abort)) {
      const reason = abortReason ? await Promise.resolve().then(() => abortReason()) : 'abort predicate';
      throw new Error(`pumpUntil(${label}) aborted: ${reason}`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  const dump = await page.evaluate(() => ({
    mode: window.SF?.state?.mode ?? null,
    pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
    visibleScreens: Array.from(document.querySelectorAll('[data-screen]'))
      .filter((el) => el.offsetParent !== null)
      .map((el) => el.getAttribute('data-screen')),
    busEvents: (window.__PERF_SCENARIO_EVENTS__ || []).slice(-40),
    launchButtons: [...document.querySelectorAll('button')]
      .filter((b) => /launch/i.test(b.textContent || ''))
      .map((b) => ({ text: (b.textContent || '').trim().slice(0, 40), disabled: b.disabled })),
  })).catch((err) => ({ dumpFailed: String(err?.message || err) }));
  throw new Error(`pumpUntil(${label}): predicate not satisfied within ${maxFrames} frames; page state: ${JSON.stringify(dump)}`);
}

function stepFrames(page, n) {
  return page.evaluate((k) => window.__SF_DETERMINISTIC_PUMP__.step(k), n);
}

function stepFramesAndCaptureCounterSnapshot(page, n) {
  return page.evaluate(async (k) => {
    const pump = window.__SF_DETERMINISTIC_PUMP__;
    await pump.step(k);
    return window.__SPACEFACE_PERF__?.getCounterSnapshot?.() ?? null;
  }, n);
}

/**
 * Read-only page seam installed before navigation. Both evidence tiers call the same function in
 * their reset/arm browser task, so the actual boundary—not an earlier approximation—is recorded.
 */
function installPerformanceScenarioBoundaryProbe() {
  window.__PERF_SCENARIO_CAPTURE_BOUNDARY__ = () => {
    const state = window.SF?.state;
    const renderSystem = window.SF?.registry?.get?.('render') || null;
    const vfx = window.SF?.registry?.get?.('vfx') || null;
    const inspection = vfx?.inspect?.() || null;
    const renderer = state?.render?.renderer || null;
    const diagnostics = window.__THREE_GAME_DIAGNOSTICS__?.getReport?.() || null;
    const upgrades = state?.render?.scene?.userData?.authoredUpgradeDiagnostics
      || diagnostics?.scene?.userData?.authoredUpgradeDiagnostics
      || null;
    const meshQueueRemaining = Array.isArray(renderSystem?._meshBuildQueue)
      ? Math.max(0, renderSystem._meshBuildQueue.length - (renderSystem._meshBuildQueueHead || 0))
      : null;
    const admission = {
      activeAuthoredUpgradeJobs: upgrades?.activeJobs ?? null,
      pendingPipelineAdmissions: state?.render?.pendingPipelineAdmissions?.() ?? null,
      meshQueueRemaining,
      meshReconcileDirty: renderSystem?._meshReconcileDirty ?? null,
      environmentReady: state?.render?.envMap?.isTexture === true
        && state?.render?.scene?.environment === state.render.envMap,
    };
    const player = state?.entities?.get?.(state.playerId)
      || state?.entityList?.find?.((entity) => entity?.id === state.playerId);
    return {
      pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
      tick: state?.tick ?? null,
      simTime: state?.simTime ?? null,
      accumulator: state?.accumulator ?? null,
      mode: state?.mode ?? null,
      timeScale: state?.timeScale ?? null,
      topScreen: state?.ui?.screenStack?.at?.(-1) ?? null,
      docked: state?.ui?.docked === true,
      playerAlive: player?.alive !== false,
      position: {
        x: Number(player?.pos?.x ?? player?.x) || 0,
        z: Number(player?.pos?.z ?? player?.z) || 0,
      },
      video: { ...((state?.settings?.video) || {}) },
      render: {
        calls: renderer?.info?.render?.calls ?? null,
        triangles: renderer?.info?.render?.triangles ?? null,
        programs: renderer?.info?.programs?.length ?? null,
        post: diagnostics?.post || null,
      },
      admission,
      // Backward-compatible timing report name; it is the same object projection.
      background: { ...admission },
      transientVfx: {
        liveParticles: inspection?.liveParticles ?? null,
        liveSprites: inspection?.liveSprites ?? null,
        activeLights: inspection?.activeLights ?? null,
        doctrineTellsActive: inspection?.doctrineTells?.active ?? null,
        explosionsActive: inspection?.subsystems?.lastFrame?.explosions ?? null,
      },
      cometAdmission: state?.render?.spaceBg?.getCometAdmissionState?.() || null,
    };
  };
}

/**
 * DOM-level button click by visible label. Returns whether a matching enabled button was found and
 * clicked; throws (with a screen dump) when a required button is absent. Never touches pointer
 * geometry, so screen animations and off-viewport scroll state cannot eat the click.
 */
async function clickButtonByText(page, text, { exact = true, label, optional = false } = {}) {
  const clicked = await page.evaluate(({ text: wanted, exact: isExact }) => {
    const needle = wanted.toLowerCase();
    const btn = [...document.querySelectorAll('button')].find((candidate) => {
      if (candidate.disabled) return false;
      if (!candidate.offsetParent && !candidate.getClientRects().length) return false;
      const labelText = (candidate.textContent || '').trim().toLowerCase();
      return isExact ? labelText === needle : labelText.includes(needle);
    });
    if (!btn) return false;
    btn.click();
    return true;
  }, { text, exact });
  if (!clicked && !optional) {
    const dump = await page.evaluate(() => ({
      screens: [...document.querySelectorAll('[data-screen]')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => el.getAttribute('data-screen')),
      buttons: [...document.querySelectorAll('button')]
        .map((b) => ({ text: (b.textContent || '').trim().slice(0, 40), disabled: b.disabled }))
        .slice(0, 30),
    }));
    throw new Error(`clickButtonByText(${text}) on ${label}: no enabled visible button matched; page: ${JSON.stringify(dump)}`);
  }
  return clicked;
}

function isScreenVisible(name) {
  const el = document.querySelector(`[data-screen="${name}"]`);
  return !!el && el.offsetParent !== null;
}

async function freezeScenarioForQuiescence(page, scenario) {
  let leadIn = await page.evaluate((scenarioId) => ({
    alreadyDone: window.__PERF_SCENARIO_PLAYABLE_LEAD_INS__?.[scenarioId] === true,
    mode: window.SF?.state?.mode ?? null,
    timeScale: window.SF?.state?.timeScale ?? null,
    tick: window.SF?.state?.tick ?? null,
  }), scenario.id);
  if (!leadIn.alreadyDone && leadIn.mode === 'flight' && Number(leadIn.timeScale) > 0) {
    // Renderer.afterBrowserPaint is rAF -> setTimeout(0) -> rAF. Preserve that ordering explicitly,
    // then advance to a route-specific fixed simulation tick. In particular, WebGL restoration can
    // complete at tick 2 or 3 on the same host; a relative lead-in would compare different worlds.
    const { anchorTick, leadInFrames } = resolveScenarioLeadIn(scenario.id, leadIn.tick);
    await stepFrames(page, 1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    await stepFrames(page, 1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    await pumpScenarioFrames(page, leadInFrames - 2, {
      chunkFrames: Math.max(1, leadInFrames - 2),
      yieldMs: 0,
      label: `${scenario.id}:first-playable-lead-in`,
    });
    await page.waitForFunction(() => {
      const state = window.SF?.state;
      const renderSystem = window.SF?.registry?.get?.('render') || null;
      return Number.isFinite(state?.render?.firstPlayableFrameAt)
        && renderSystem?._deferNoncriticalMeshStreaming === false;
    }, null, { timeout: 10_000 });
    leadIn = await page.evaluate(({ scenarioId, pumpedFrames, targetTick }) => {
      const completed = window.__PERF_SCENARIO_PLAYABLE_LEAD_INS__
        || (window.__PERF_SCENARIO_PLAYABLE_LEAD_INS__ = Object.create(null));
      completed[scenarioId] = true;
      const renderSystem = window.SF?.registry?.get?.('render') || null;
      return {
        alreadyDone: false,
        pumpedFrames,
        anchorTick: targetTick,
        tick: window.SF?.state?.tick ?? null,
        firstPlayableFrameAt: window.SF?.state?.render?.firstPlayableFrameAt ?? null,
        noncriticalMeshStreamingDeferred: renderSystem?._deferNoncriticalMeshStreaming ?? null,
      };
    }, { scenarioId: scenario.id, pumpedFrames: leadInFrames, targetTick: anchorTick });
    if (leadIn.tick !== anchorTick) {
      throw new Error(`${scenario.id}: first-playable anchor drifted to tick ${leadIn.tick}, expected ${anchorTick}`);
    }
  } else {
    leadIn = {
      ...leadIn,
      pumpedFrames: 0,
    };
  }

  const before = await page.evaluate(() => ({
    mode: window.SF?.state?.mode ?? null,
    timeScale: window.SF?.state?.timeScale ?? null,
    tick: window.SF?.state?.tick ?? null,
    simTime: window.SF?.state?.simTime ?? null,
    accumulator: window.SF?.state?.accumulator ?? null,
    pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
    topScreen: window.SF?.state?.ui?.screenStack?.at?.(-1) ?? null,
  }));
  if (before.timeScale === 0) {
    return {
      pass: true,
      active: false,
      alreadyFrozen: true,
      scenarioId: scenario.id,
      leadIn,
      before,
      frozen: before,
    };
  }
  if (before.mode !== 'flight') {
    throw new Error(`${scenario.id}: cannot enter public pause from quiescence state ${JSON.stringify(before)}`);
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    return state?.mode === 'paused'
      && state?.timeScale === 0
      && state?.ui?.screenStack?.at?.(-1) === 'pause';
  }, null, { timeout: 10_000 });
  const frozen = await page.evaluate(() => ({
    mode: window.SF?.state?.mode ?? null,
    timeScale: window.SF?.state?.timeScale ?? null,
    tick: window.SF?.state?.tick ?? null,
    simTime: window.SF?.state?.simTime ?? null,
    accumulator: window.SF?.state?.accumulator ?? null,
    pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
    topScreen: window.SF?.state?.ui?.screenStack?.at?.(-1) ?? null,
  }));
  return {
    pass: frozen.mode === 'paused'
      && frozen.timeScale === 0
      && frozen.topScreen === 'pause'
      && frozen.tick === before.tick
      && frozen.simTime === before.simTime
      && frozen.accumulator === before.accumulator
      && frozen.pumpFrame === before.pumpFrame,
    active: true,
    alreadyFrozen: false,
    scenarioId: scenario.id,
    leadIn,
    before,
    frozen,
  };
}

async function resumeScenarioAfterQuiescence(page, freezeReceipt) {
  if (!freezeReceipt?.active) {
    return {
      pass: freezeReceipt?.pass === true,
      resumed: false,
      reason: freezeReceipt?.alreadyFrozen ? 'route-already-pauses-simulation' : 'no-freeze-request',
    };
  }
  const beforeResume = await page.evaluate(() => ({
    mode: window.SF?.state?.mode ?? null,
    timeScale: window.SF?.state?.timeScale ?? null,
    tick: window.SF?.state?.tick ?? null,
    simTime: window.SF?.state?.simTime ?? null,
    accumulator: window.SF?.state?.accumulator ?? null,
    pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
    topScreen: window.SF?.state?.ui?.screenStack?.at?.(-1) ?? null,
  }));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    return state?.mode === 'flight'
      && Number(state?.timeScale) > 0
      && state?.ui?.screenStack?.at?.(-1) !== 'pause';
  }, null, { timeout: 10_000 });
  const resumed = await page.evaluate(() => ({
    mode: window.SF?.state?.mode ?? null,
    timeScale: window.SF?.state?.timeScale ?? null,
    tick: window.SF?.state?.tick ?? null,
    simTime: window.SF?.state?.simTime ?? null,
    accumulator: window.SF?.state?.accumulator ?? null,
    pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
    topScreen: window.SF?.state?.ui?.screenStack?.at?.(-1) ?? null,
  }));
  const resumeContract = evaluateExactResumeState(beforeResume, resumed);
  const exactStatePreserved = resumeContract.pass;
  return {
    pass: resumed.mode === 'flight'
      && Number(resumed.timeScale) > 0
      && resumed.topScreen !== 'pause'
      && beforeResume.mode === 'paused'
      && Number(beforeResume.timeScale) === 0
      && beforeResume.topScreen === 'pause'
      && exactStatePreserved,
    resumed: true,
    beforeResume,
    exactStatePreserved,
    state: resumed,
  };
}

async function readPresentationAdmissionState(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const renderSystem = window.SF?.registry?.get?.('render') || null;
    const vfx = window.SF?.registry?.get?.('vfx') || null;
    const vfxInspection = vfx?.inspect?.() || null;
    const upgrades = state?.render?.scene?.userData?.authoredUpgradeDiagnostics || null;
    const queueRemaining = Array.isArray(renderSystem?._meshBuildQueue)
      ? Math.max(0, renderSystem._meshBuildQueue.length - (renderSystem._meshBuildQueueHead || 0))
      : null;
    return {
      tick: state?.tick ?? null,
      mode: state?.mode ?? null,
      timeScale: state?.timeScale ?? null,
      activeAuthoredUpgradeJobs: upgrades?.activeJobs ?? null,
      pendingPipelineAdmissions: state?.render?.pendingPipelineAdmissions?.() ?? null,
      meshQueueRemaining: queueRemaining,
      meshReconcileDirty: renderSystem?._meshReconcileDirty ?? null,
      environmentReady: state?.render?.envMap?.isTexture === true
        && state?.render?.scene?.environment === state.render.envMap,
      transientVfx: {
        liveParticles: vfxInspection?.liveParticles ?? null,
        liveSprites: vfxInspection?.liveSprites ?? null,
        activeLights: vfxInspection?.activeLights ?? null,
        doctrineTellsActive: vfxInspection?.doctrineTells?.active ?? null,
        explosionsActive: vfxInspection?.subsystems?.lastFrame?.explosions ?? null,
      },
    };
  });
}

async function kickMeshReconcileIfNeeded(page, scenario, freezeReceipt) {
  const before = await readPresentationAdmissionState(page);
  if (before.meshReconcileDirty !== true) {
    return {
      pass: true,
      kicked: false,
      pumpedFrames: 0,
      before,
      after: before,
      freezeReceipt,
    };
  }
  if (!freezeReceipt?.active) {
    throw new Error(
      `${scenario.id}: mesh reconcile remained dirty on a route the harness did not freeze; `
      + `cannot advance a hidden live tick safely (${JSON.stringify(before)})`,
    );
  }
  const resumeReceipt = await resumeScenarioAfterQuiescence(page, freezeReceipt);
  const tickBefore = await page.evaluate(() => window.SF?.state?.tick ?? null);
  await stepFrames(page, 1);
  const after = await readPresentationAdmissionState(page);
  const tickDelta = Number(after.tick) - Number(tickBefore);
  if (tickDelta !== 1) {
    throw new Error(`${scenario.id}: reconcile kick advanced ${tickDelta} sim ticks instead of exactly 1`);
  }
  const nextFreezeReceipt = await freezeScenarioForQuiescence(page, scenario);
  return {
    pass: resumeReceipt.pass === true && nextFreezeReceipt.pass === true,
    kicked: true,
    pumpedFrames: 1,
    before,
    after,
    tickDelta,
    resumeReceipt,
    freezeReceipt: nextFreezeReceipt,
  };
}

async function armScenarioAfterQuiescence(_page, scenario, _route) {
  return {
    pass: true,
    scenarioId: scenario.id,
    action: 'none',
  };
}

async function alignScenarioPresentationClock(page, scenario) {
  const before = await page.evaluate(() => ({
    pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
    tick: window.SF?.state?.tick ?? null,
    mode: window.SF?.state?.mode ?? null,
    timeScale: window.SF?.state?.timeScale ?? null,
  }));
  if (before.mode !== 'paused' || Number(before.timeScale) !== 0) {
    throw new Error(
      `${scenario.id}: presentation alignment requires the public paused route; before=${JSON.stringify(before)}`,
    );
  }
  if (!Number.isSafeInteger(before.pumpFrame) || before.pumpFrame >= PRESENTATION_ALIGNMENT_FRAME) {
    throw new Error(
      `${scenario.id}: boot consumed presentation frame ${before.pumpFrame}; `
      + `fixed alignment frame ${PRESENTATION_ALIGNMENT_FRAME} is no longer in the future`,
    );
  }
  const alignedFrame = await page.evaluate((targetFrame) => (
    window.__SF_DETERMINISTIC_PUMP__?.alignFrame?.(targetFrame) ?? null
  ), PRESENTATION_ALIGNMENT_FRAME);
  if (alignedFrame !== PRESENTATION_ALIGNMENT_FRAME) {
    throw new Error(`${scenario.id}: deterministic pump did not accept presentation alignment`);
  }
  await stepFrames(page, 1);
  const after = await readPresentationAdmissionState(page);
  const network = snapshotPageNetworkActivity(page);
  const pump = await page.evaluate(() => ({
    frame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
    errors: window.__SF_DETERMINISTIC_PUMP__?.errors ?? [],
  }));
  const pass = pump.frame === PRESENTATION_ALIGNMENT_FRAME + 1
    && pump.errors.length === 0
    && after.tick === before.tick
    && after.mode === 'paused'
    && Number(after.timeScale) === 0
    && after.activeAuthoredUpgradeJobs === 0
    && after.pendingPipelineAdmissions === 0
    && after.meshQueueRemaining === 0
    && after.meshReconcileDirty === false
    && after.transientVfx?.liveSprites === 0
    && after.transientVfx?.explosionsActive === 0
    && network.pending === 0;
  const receipt = {
    pass,
    targetFrame: PRESENTATION_ALIGNMENT_FRAME,
    before,
    after,
    pump,
    network,
  };
  if (!pass) {
    throw new Error(`${scenario.id}: presentation alignment controls failed: ${JSON.stringify(receipt)}`);
  }
  return receipt;
}

async function captureScenarioMeasurementBoundaryState(page) {
  const boundary = await page.evaluate(() => (
    window.__PERF_SCENARIO_CAPTURE_BOUNDARY__?.() ?? null
  ));
  if (!boundary) throw new Error('measurement boundary probe was not installed before navigation');
  boundary.network = snapshotPageNetworkActivity(page);
  return boundary;
}

/**
 * `flight_steady` must not measure the cold-open capital-explosion tail. Freeze the authoritative
 * world at the exact authored start frame, let presentation/admission owners settle, then normalize
 * the future presentation phase. No private pool is cleared and no sim tick is added.
 */
async function stabilizeScenarioMeasurementBoundary(page, scenario, scenarioStart) {
  if (!STEADY_MEASUREMENT_BOUNDARY_SCENARIOS.has(scenario.id)) {
    return {
      pass: true,
      applicable: false,
      scenarioId: scenario.id,
      action: 'not-applicable',
    };
  }

  const freeze = await freezeScenarioForQuiescence(page, scenario);
  if (!freeze?.active || freeze?.pass !== true) {
    throw new Error(
      `${scenario.id}: steady measurement drain could not enter the public pause route: `
      + JSON.stringify(freeze),
    );
  }
  const frozenTick = freeze.before?.tick;
  const expectedTick = Number(scenarioStart?.tick) + Number(scenario.measurementWindow.startFrame);
  if (!Number.isSafeInteger(frozenTick)
    || !Number.isSafeInteger(expectedTick)
    || frozenTick !== expectedTick) {
    throw new Error(
      `${scenario.id}: steady measurement boundary froze tick ${frozenTick}; `
      + `expected scenario start ${scenarioStart?.tick} + ${scenario.measurementWindow.startFrame} `
      + `= ${expectedTick}`,
    );
  }
  const cometHorizonSeconds = scenario.measurementWindow.frameCount / 60 + 1;
  let quietFrames = 0;
  let lastQuietSignature = null;
  let presentationFramesPumped = 0;
  const frozenState = await captureScenarioMeasurementBoundaryState(page);
  const frozenSimTime = frozenState.simTime;
  const frozenAccumulator = frozenState.accumulator;
  if (!Number.isFinite(frozenSimTime) || !Number.isFinite(frozenAccumulator)) {
    throw new Error(
      `${scenario.id}: steady measurement freeze lacks finite simTime/accumulator: `
      + JSON.stringify(frozenState),
    );
  }
  // The comet is presentation-owned and advances while the simulation is publicly paused. Prove
  // enough invisible idle runway for the exact 420-frame normalization tail, the 0.1 s clamped
  // alignment frame, and the full measured-window horizon. If the current phase cannot prove that
  // runway, observe one real active->idle production reset; never mutate the private comet state.
  const fixedTailSeconds = FIXED_MEASUREMENT_DRAIN_FRAMES
    * DETERMINISTIC_PUMP_FRAME_SECONDS;
  const requiredCometTimerSeconds = cometHorizonSeconds
    + fixedTailSeconds
    + MEASUREMENT_ALIGNMENT_COMET_SECONDS;
  const cometPreconditionBefore = frozenState.cometAdmission;
  const cometInitiallySafe = isCometPhaseSafeForPresentationHorizon(
    cometPreconditionBefore,
    requiredCometTimerSeconds,
  );
  let cometPreconditionFrames = 0;
  let cometResetObserved = false;
  let preconditionedState = frozenState;
  let previousComet = cometPreconditionBefore;
  while (!isCometPhaseSafeForPresentationHorizon(
    preconditionedState.cometAdmission,
    requiredCometTimerSeconds,
  )) {
    assertDeadline('steady-measurement-comet-precondition');
    if (cometPreconditionFrames >= MAX_COMET_PRECONDITION_FRAMES) {
      throw new Error(
        `${scenario.id}: no safe comet reset within ${MAX_COMET_PRECONDITION_FRAMES} `
        + `public-paused presentation frames: ${JSON.stringify(preconditionedState.cometAdmission)}`,
      );
    }
    await stepFrames(page, 1);
    cometPreconditionFrames++;
    const nextState = await captureScenarioMeasurementBoundaryState(page);
    if (nextState.tick !== frozenTick
      || nextState.simTime !== frozenSimTime
      || nextState.accumulator !== frozenAccumulator
      || nextState.mode !== 'paused'
      || Number(nextState.timeScale) !== 0
      || nextState.topScreen !== 'pause') {
      throw new Error(
        `${scenario.id}: comet precondition advanced or left the public pause route: `
        + JSON.stringify({ frozenTick, nextState }),
      );
    }
    cometResetObserved = isCompletedCometReset(
      previousComet,
      nextState.cometAdmission,
    );
    preconditionedState = nextState;
    previousComet = nextState.cometAdmission;
    if (cometResetObserved) {
      if (!isCometPhaseSafeForPresentationHorizon(
        nextState.cometAdmission,
        requiredCometTimerSeconds,
      )) {
        throw new Error(
          `${scenario.id}: completed comet reset lacks the required fixed-tail runway: `
          + JSON.stringify({
            requiredCometTimerSeconds,
            cometAdmission: nextState.cometAdmission,
          }),
        );
      }
      break;
    }
  }
  const cometPrecondition = {
    pass: isCometPhaseSafeForPresentationHorizon(
      preconditionedState.cometAdmission,
      requiredCometTimerSeconds,
    ) && (cometInitiallySafe || cometResetObserved),
    initiallySafe: cometInitiallySafe,
    resetObserved: cometResetObserved,
    framesPumped: cometPreconditionFrames,
    maxFrames: MAX_COMET_PRECONDITION_FRAMES,
    fixedTailSeconds,
    alignmentSeconds: MEASUREMENT_ALIGNMENT_COMET_SECONDS,
    measurementHorizonSeconds: cometHorizonSeconds,
    requiredTimerSeconds: requiredCometTimerSeconds,
    before: cometPreconditionBefore,
    after: preconditionedState.cometAdmission,
  };
  if (!cometPrecondition.pass) {
    throw new Error(
      `${scenario.id}: comet presentation precondition failed: `
      + JSON.stringify(cometPrecondition),
    );
  }

  let drained = preconditionedState;
  while (shouldContinueScenarioMeasurementDrain({
    presentationFramesPumped,
    fixedFrames: FIXED_MEASUREMENT_DRAIN_FRAMES,
  })) {
    assertDeadline('steady-measurement-admission-drain');
    await stepFrames(page, 1);
    presentationFramesPumped++;
    drained = await captureScenarioMeasurementBoundaryState(page);
    if (drained.tick !== frozenTick
      || drained.simTime !== frozenSimTime
      || drained.accumulator !== frozenAccumulator
      || drained.mode !== 'paused'
      || Number(drained.timeScale) !== 0
      || drained.topScreen !== 'pause') {
      throw new Error(
        `${scenario.id}: steady measurement drain advanced or left the public pause route: `
        + JSON.stringify({ frozenTick, drained }),
      );
    }
    const quiet = isScenarioMeasurementBoundaryQuiet(drained, cometHorizonSeconds);
    const signature = quiet ? scenarioMeasurementBoundarySignature(drained) : null;
    quietFrames = quiet
      ? (signature === lastQuietSignature ? Math.min(2, quietFrames + 1) : 1)
      : 0;
    lastQuietSignature = signature;
    if (quietFrames < 2) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (quietFrames < 2 || presentationFramesPumped !== FIXED_MEASUREMENT_DRAIN_FRAMES) {
    throw new Error(
      `${scenario.id}: presentation/admission owners were not quiet at the fixed `
      + `${FIXED_MEASUREMENT_DRAIN_FRAMES}-frame boundary: ${JSON.stringify(drained)}`,
    );
  }
  if (!Number.isSafeInteger(drained.pumpFrame)
    || drained.pumpFrame >= MEASUREMENT_ALIGNMENT_FRAME) {
    throw new Error(
      `${scenario.id}: steady measurement drain reached presentation frame ${drained.pumpFrame}; `
      + `fixed alignment frame ${MEASUREMENT_ALIGNMENT_FRAME} is no longer in the future`,
    );
  }

  const alignedFrame = await page.evaluate((targetFrame) => (
    window.__SF_DETERMINISTIC_PUMP__?.alignFrame?.(targetFrame) ?? null
  ), MEASUREMENT_ALIGNMENT_FRAME);
  if (alignedFrame !== MEASUREMENT_ALIGNMENT_FRAME) {
    throw new Error(`${scenario.id}: steady measurement presentation alignment failed`);
  }
  await stepFrames(page, 1);
  const aligned = await captureScenarioMeasurementBoundaryState(page);
  if (aligned.tick !== frozenTick
    || aligned.simTime !== frozenSimTime
    || aligned.accumulator !== frozenAccumulator
    || aligned.pumpFrame !== MEASUREMENT_ALIGNMENT_FRAME + 1
    || aligned.mode !== 'paused'
    || Number(aligned.timeScale) !== 0
    || aligned.topScreen !== 'pause'
    || !isScenarioMeasurementBoundaryQuiet(aligned, cometHorizonSeconds)) {
    throw new Error(
      `${scenario.id}: steady measurement alignment disturbed the quiet boundary: `
      + JSON.stringify({ frozenTick, aligned }),
    );
  }

  const pass = presentationFramesPumped === FIXED_MEASUREMENT_DRAIN_FRAMES
    && quietFrames >= 2
    && cometPrecondition.pass
    && aligned.tick === frozenTick
    && isScenarioMeasurementBoundaryQuiet(aligned, cometHorizonSeconds);
  const receipt = {
    pass,
    applicable: true,
    scenarioId: scenario.id,
    action: 'public-pause-presentation-admission-drain',
    frozenTick,
    expectedTick,
    frozenSimTime,
    frozenAccumulator,
    presentationFramesPumped,
    fixedPresentationFrames: FIXED_MEASUREMENT_DRAIN_FRAMES,
    quietFrames,
    cometHorizonSeconds,
    cometPrecondition,
    alignmentFrame: MEASUREMENT_ALIGNMENT_FRAME,
    frozenState,
    drained,
    aligned,
    freeze,
  };
  if (!pass) {
    throw new Error(`${scenario.id}: steady measurement boundary controls failed: ${JSON.stringify(receipt)}`);
  }
  return receipt;
}

/**
 * Resume through the public pause route, then re-read every page-owned boundary field in the same
 * browser task that resets Tier 1 or arms Tier 2. Node-owned request epochs bracket that task.
 */
async function activateScenarioMeasurementBoundary(page, scenario, stabilized, evidenceTier) {
  if (stabilized?.applicable !== true || stabilized?.pass !== true) {
    throw new Error(
      `${scenario.id}: measured steady scenario has no valid stabilized boundary: `
      + JSON.stringify(stabilized),
    );
  }
  if (evidenceTier !== 'tier1' && evidenceTier !== 'tier2') {
    throw new TypeError(`unknown measurement evidence tier ${evidenceTier}`);
  }
  const networkBefore = snapshotPageNetworkActivity(page);
  const alignedNetworkContinuity = evaluateBoundaryNetworkContinuity(
    stabilized.aligned?.network,
    networkBefore,
  );
  const resume = await resumeScenarioAfterQuiescence(page, stabilized.freeze);
  const activation = await page.evaluate(({ tier }) => {
    const state = window.SF?.state;
    const perf = window.__SPACEFACE_PERF__ || state?.perfRuntime || null;
    const renderer = state?.render?.renderer || null;
    const gl = renderer?.getContext?.() || null;
    const gpu = state?.render?.gpuTimers || null;
    const boundaryState = window.__PERF_SCENARIO_CAPTURE_BOUNDARY__?.() ?? null;
    if (tier === 'tier1') {
      const tier1 = window.__SPACEFACE_PERF__?.tier1;
      if (!tier1) return { boundaryState, tier1: null, arm: null };
      tier1.reset();
      const boundary = tier1.markBootBoundary();
      return {
        boundaryState,
        tier1: {
          boundary,
          snapshot: window.__SPACEFACE_PERF__?.getCounterSnapshot?.() ?? null,
        },
        arm: null,
      };
    }

    const tier1Disabled = perf?.tier1?.isEnabled?.() === false;
    const glUninstrumented = !gl?.__sfInstrumentation;
    if (perf?.setSystemTimingEnabled) perf.setSystemTimingEnabled(false);
    if (perf?.setRenderWorkEnabled) perf.setRenderWorkEnabled(false);
    perf?.reset?.();
    const systemTimingEnabled = perf?.setSystemTimingEnabled?.(true) === true;
    const renderWorkEnabled = perf?.setRenderWorkEnabled?.(true) === true;
    gpu?.reset?.();
    const gpuEnabled = gpu?.setEnabled?.(true) === true;
    return {
      boundaryState,
      tier1: null,
      arm: {
        pumpClockMode: window.__SF_DETERMINISTIC_PUMP__?.clockMode ?? null,
        pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
        tier1Disabled,
        glUninstrumented,
        systemTimingEnabled,
        renderWorkEnabled,
        gpuEnabled,
        gpuCapability: gpu?.getCapability?.() ?? null,
      },
    };
  }, { tier: evidenceTier });
  const networkAfter = snapshotPageNetworkActivity(page);
  const activationNetworkContinuity = evaluateBoundaryNetworkContinuity(
    networkBefore,
    networkAfter,
  );
  const activated = {
    ...(activation?.boundaryState || {}),
    network: networkAfter,
  };
  const exactActivatedState = Number.isSafeInteger(activated.tick)
    && Number.isFinite(activated.simTime)
    && Number.isFinite(activated.accumulator)
    && activated.tick === stabilized.frozenTick
    && activated.simTime === stabilized.frozenSimTime
    && activated.accumulator === stabilized.frozenAccumulator
    && activated.pumpFrame === MEASUREMENT_ALIGNMENT_FRAME + 1
    && activated.mode === 'flight'
    && Number(activated.timeScale) > 0
    && activated.topScreen !== 'pause';
  const tierEvidenceReady = evidenceTier === 'tier1'
    ? activation?.tier1?.boundary === 0 && !!activation?.tier1?.snapshot
    : !!activation?.arm;
  const pass = resume.pass === true
    && resume.exactStatePreserved === true
    && alignedNetworkContinuity.pass
    && activationNetworkContinuity.pass
    && isScenarioMeasurementBoundaryQuiet(
      activated,
      stabilized.cometHorizonSeconds,
    )
    && exactActivatedState
    && tierEvidenceReady;
  const receipt = {
    ...stabilized,
    pass,
    evidenceTier,
    resume,
    networkBeforeActivation: networkBefore,
    networkAfterActivation: networkAfter,
    alignedNetworkContinuity,
    activationNetworkContinuity,
    activated,
  };
  if (!pass) {
    throw new Error(
      `${scenario.id}: atomic measurement boundary activation failed: ${JSON.stringify(receipt)}`,
    );
  }
  return {
    receipt,
    startSnapshot: activation.tier1?.snapshot ?? null,
    measurementStart: evidenceTier === 'tier2' ? activated : null,
    arm: activation.arm ?? null,
  };
}

/**
 * Quiescence: pump one frame at a time until shader/texture activity and browser request
 * lifecycles have both been quiet for QUIESCENCE_FRAMES consecutive samples. The fixed browser
 * yield between samples gives decoders/promises a chance to publish work without advancing the
 * simulation by a host-dependent number of frames.
 */
async function quiesce(page, {
  allowMeshReconcileDirty = false,
  minimumFrames = QUIESCENCE_FRAMES,
} = {}) {
  const requiredFrames = minimumFrames == null ? QUIESCENCE_FRAMES : Number(minimumFrames);
  if (!Number.isSafeInteger(requiredFrames)
    || requiredFrames < QUIESCENCE_FRAMES
    || requiredFrames > MAX_QUIESCENCE_FRAMES) {
    throw new TypeError(
      `quiescence minimumFrames must be an integer in [${QUIESCENCE_FRAMES}, ${MAX_QUIESCENCE_FRAMES}]`,
    );
  }
  let lastActivityFrame = 0;
  let lastTotals = null;
  let lastTargetedVfxSignature = null;
  let lastNetworkEpoch = null;
  let lastProbe = null;
  let pumped = 0;
  for (;;) {
    assertDeadline('quiescence');
    if (pumped >= MAX_QUIESCENCE_FRAMES) {
      throw new Error(
        `quiescence not reached within ${MAX_QUIESCENCE_FRAMES} pumped frames — async work never settled; `
        + `the window would swallow in-flight uploads; last=${JSON.stringify({
          frame: lastProbe?.frame ?? null,
          admission: lastProbe?.admission ?? null,
          network: lastProbe?.network ?? null,
          totals: lastProbe?.totals ?? null,
        })}`,
      );
    }
    await stepFrames(page, 1);
    pumped++;
    const probe = await page.evaluate(() => {
      const state = window.SF?.state;
      const renderSystem = window.SF?.registry?.get?.('render') || null;
      const vfx = window.SF?.registry?.get?.('vfx') || null;
      const vfxInspection = vfx?.inspect?.() || null;
      const upgrades = state?.render?.scene?.userData?.authoredUpgradeDiagnostics || null;
      const queueRemaining = Array.isArray(renderSystem?._meshBuildQueue)
        ? Math.max(0, renderSystem._meshBuildQueue.length - (renderSystem._meshBuildQueueHead || 0))
        : null;
      return {
        frame: window.__SF_DETERMINISTIC_PUMP__.frame,
        totals: window.__SPACEFACE_PERF__?.getCounterSnapshot?.().totals ?? null,
        rendererPrograms: state?.render?.renderer?.info?.programs?.length ?? null,
        admission: {
          activeAuthoredUpgradeJobs: upgrades?.activeJobs ?? null,
          pendingPipelineAdmissions: state?.render?.pendingPipelineAdmissions?.() ?? null,
          meshQueueRemaining: queueRemaining,
          meshReconcileDirty: renderSystem?._meshReconcileDirty ?? null,
          environmentReady: state?.render?.envMap?.isTexture === true
            && state?.render?.scene?.environment === state.render.envMap,
          transientVfx: {
            liveParticles: vfxInspection?.liveParticles ?? null,
            liveSprites: vfxInspection?.liveSprites ?? null,
            activeLights: vfxInspection?.activeLights ?? null,
            doctrineTellsActive: vfxInspection?.doctrineTells?.active ?? null,
            explosionsActive: vfxInspection?.subsystems?.lastFrame?.explosions ?? null,
            presentationCuesApplied: vfxInspection?.presentation?.applied ?? null,
          },
        },
      };
    });
    probe.network = snapshotPageNetworkActivity(page);
    lastProbe = probe;
    if (!probe.totals) throw new Error('counter snapshot unavailable during quiescence — seam never armed');
    const activity = probe.totals.shaderLinks
      + probe.totals.textureUploads
      + probe.totals.textureSubUploads
      + probe.totals.mipmapGenerations
      + probe.totals.renderTargetAllocations
      + probe.totals.renderTargetResizes;
    const lastActivity = lastTotals == null ? null : lastTotals.shaderLinks
      + lastTotals.textureUploads
      + lastTotals.textureSubUploads
      + lastTotals.mipmapGenerations
      + lastTotals.renderTargetAllocations
      + lastTotals.renderTargetResizes;
    const targetedVfxSignature = JSON.stringify({
      liveSprites: probe.admission.transientVfx.liveSprites,
      explosionsActive: probe.admission.transientVfx.explosionsActive,
    });
    if (lastActivity == null
      || activity !== lastActivity
      || lastTargetedVfxSignature == null
      || targetedVfxSignature !== lastTargetedVfxSignature
      || lastNetworkEpoch == null
      || probe.network.epoch !== lastNetworkEpoch) {
      lastActivityFrame = probe.frame;
    }
    lastTotals = probe.totals;
    lastTargetedVfxSignature = targetedVfxSignature;
    lastNetworkEpoch = probe.network.epoch;
    const targetedVfxQuiet = probe.admission.transientVfx.liveSprites === 0
      && probe.admission.transientVfx.explosionsActive === 0;
    const admissionQuiet = probe.admission.activeAuthoredUpgradeJobs === 0
      && probe.admission.pendingPipelineAdmissions === 0
      && probe.admission.meshQueueRemaining === 0
      && probe.admission.environmentReady === true
      && targetedVfxQuiet
      && (probe.admission.meshReconcileDirty === false || allowMeshReconcileDirty);
    const networkQuiet = probe.network.pending === 0;
    if (probe.frame - lastActivityFrame >= QUIESCENCE_FRAMES
      && pumped >= requiredFrames
      && admissionQuiet
      && networkQuiet) {
      return {
        predicate: 'quiescence',
        quiescenceFrames: QUIESCENCE_FRAMES,
        minimumFrames: requiredFrames,
        quiescencePumpedFrames: pumped,
        activityQuietFrames: probe.frame - lastActivityFrame,
        pumpFrameAtBoundary: probe.frame,
        shaderLinksAtBoundary: probe.totals.shaderLinks,
        textureActivityAtBoundary: probe.totals.textureUploads + probe.totals.textureSubUploads,
        rendererProgramsAtBoundary: probe.rendererPrograms,
        admissionAtBoundary: probe.admission,
        networkAtBoundary: probe.network,
      };
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function waitForAdmissionOwnersWithoutFrames(page, {
  label = 'admission-owner-settle',
  timeoutMs = 120_000,
} = {}) {
  const expiresAt = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < expiresAt) {
    assertDeadline(label);
    last = await page.evaluate(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state.playerId)
        || state?.entityList?.find?.((entity) => entity?.id === state.playerId);
      const upgrades = state?.render?.scene?.userData?.authoredUpgradeDiagnostics || null;
      return {
        playerAlive: player?.alive !== false,
        activeAuthoredUpgradeJobs: upgrades?.activeJobs ?? null,
        pendingPipelineAdmissions: state?.render?.pendingPipelineAdmissions?.() ?? null,
        environmentReady: state?.render?.envMap?.isTexture === true
          && state?.render?.scene?.environment === state.render.envMap,
      };
    });
    last.network = snapshotPageNetworkActivity(page);
    if (last.playerAlive !== true) {
      throw new Error(`${label}: player died while async admission owners settled`);
    }
    if (last.activeAuthoredUpgradeJobs === 0
      && last.pendingPipelineAdmissions === 0
      && last.environmentReady === true
      && last.network.pending === 0) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${label}: async admission owners did not settle within ${timeoutMs}ms; last=${JSON.stringify(last)}`);
}

function attachPageNetworkActivityTracker(page) {
  const state = {
    active: new Set(),
    epoch: 0,
    started: 0,
    finished: 0,
    failed: 0,
    recent: [],
  };
  const record = (request, outcome) => {
    let path = String(request?.url?.() || '');
    try {
      const url = new URL(path);
      path = `${url.pathname}${url.search}`;
    } catch (_) {
      // Keep non-URL request identifiers as diagnostic text.
    }
    state.recent.push({
      epoch: state.epoch,
      outcome,
      resourceType: request?.resourceType?.() || null,
      path,
    });
    if (state.recent.length > 20) state.recent.splice(0, state.recent.length - 20);
  };
  page.on('request', (request) => {
    state.active.add(request);
    state.started++;
    state.epoch++;
    record(request, 'started');
  });
  page.on('requestfinished', (request) => {
    state.active.delete(request);
    state.finished++;
    state.epoch++;
    record(request, 'finished');
  });
  page.on('requestfailed', (request) => {
    state.active.delete(request);
    state.failed++;
    state.epoch++;
    record(request, 'failed');
  });
  PAGE_NETWORK_ACTIVITY.set(page, state);
}

function snapshotPageNetworkActivity(page) {
  const state = PAGE_NETWORK_ACTIVITY.get(page);
  if (!state) {
    throw new Error('page network activity tracker was not attached before navigation');
  }
  return {
    pending: state.active.size,
    epoch: state.epoch,
    started: state.started,
    finished: state.finished,
    failed: state.failed,
    recent: state.recent.slice(),
  };
}

/**
 * Drive exactly `frames` pump frames, dispatching tape keyboard events at their authored frames.
 * Tick t maps to "dispatch immediately before pumping frame t+1" (0-indexed frame t), and the
 * browser-task schedule between events is fixed and shared by Tier 1/Tier 2.
 */
async function driveScenarioWindow(page, scenario, frames, scenarioStart) {
  const startFrame = scenario.measurementWindow.startFrame;
  const frameCount = scenario.measurementWindow.frameCount;
  const endFrame = startFrame + frameCount;
  if (endFrame > frames) {
    throw new Error(`scenario ${scenario.id}: measurement window ${startFrame}+${frameCount} exceeds ${frames}`);
  }
  const tracePoints = [];
  await driveScenarioTapeRange(page, scenario, 0, startFrame, {
    timingSamples: null,
    tracePoints,
  });

  // The window is [startFrame, endFrame): freeze before same-frame tape events so an event at start
  // belongs to the window and an event at end belongs to the completion tail.
  const stabilizedBoundary = await stabilizeScenarioMeasurementBoundary(
    page,
    scenario,
    scenarioStart,
  );
  const activatedBoundary = await activateScenarioMeasurementBoundary(
    page,
    scenario,
    stabilizedBoundary,
    'tier1',
  );
  const measurementBoundaryDrain = activatedBoundary.receipt;
  const startSnapshot = activatedBoundary.startSnapshot;
  if (TRACE_WINDOW) {
    tracePoints.push(await captureWindowTracePoint(page, 'measurement-start', startFrame));
  }

  const measuredRange = await driveScenarioTapeRange(page, scenario, startFrame, endFrame, {
    timingSamples: null,
    captureCounterAtEnd: true,
    tracePoints,
  });
  const endSnapshot = measuredRange.counterSnapshot;
  if (!endSnapshot) {
    throw new Error(`${scenario.id}: measurement-end snapshot was not captured in the final pump task`);
  }
  await driveScenarioTapeRange(page, scenario, endFrame, frames, {
    timingSamples: null,
    tracePoints,
  });
  await releaseScenarioKeys(page, scenario);

  if (!startSnapshot || !endSnapshot) throw new Error(`scenario ${scenario.id}: measurement boundary snapshots are missing`);
  if (startSnapshot.framesObserved !== 0 || endSnapshot.framesObserved !== frameCount) {
    throw new Error(
      `scenario ${scenario.id}: measurement boundary drift `
      + `(observed ${startSnapshot.framesObserved}->${endSnapshot.framesObserved}, expected 0->${frameCount})`,
    );
  }
  return {
    snapshot: endSnapshot,
    measurement: {
      startFrame,
      frameCount,
      endFrame,
      scenarioFramesAtStart: startFrame,
      scenarioFramesAtEnd: endFrame,
      startFramesObserved: startSnapshot.framesObserved,
      endFramesObserved: endSnapshot.framesObserved,
      measurementBoundaryDrain,
      frameTaskSchedule: {
        framesPerBrowserTask: 1,
        interframeYieldMs: SCENARIO_INTERFRAME_YIELD_MS,
        finalFrameClosedAtomically: true,
      },
      tier1CountFields: [...TIER1_COST_COUNT_FIELDS],
      tier1CountDeltas: subtractCounterSnapshots(startSnapshot, endSnapshot),
      ...(TRACE_WINDOW ? { tracePoints } : {}),
    },
  };
}

function captureWindowTracePoint(page, stage, scenarioFrame) {
  return page.evaluate(({ stage: pointStage, scenarioFrame: pointFrame }) => {
    const state = window.SF?.state;
    const vfx = window.SF?.registry?.get?.('vfx') || null;
    const snapshot = window.__SPACEFACE_PERF__?.getCounterSnapshot?.() || null;
    const bufferFullUploads = Number(snapshot?.totals?.bufferFullUploads) || 0;
    const priorBufferFullUploads = Number.isFinite(window.__PERF_SCENARIO_TRACE_FULL_UPLOADS__)
      ? window.__PERF_SCENARIO_TRACE_FULL_UPLOADS__
      : bufferFullUploads;
    const bufferFullUploadDelta = Math.max(0, bufferFullUploads - priorBufferFullUploads);
    window.__PERF_SCENARIO_TRACE_FULL_UPLOADS__ = bufferFullUploads;
    const activeInstancedMeshes = [];
    const smallVisibleGeometry = [];
    state?.render?.scene?.traverse?.((object) => {
      if (object?.isInstancedMesh && object.visible !== false && object.count > 0) {
        activeInstancedMeshes.push({
          name: object.name || '',
          parent: object.parent?.name || '',
          count: object.count,
        });
      }
      if (bufferFullUploadDelta <= 0 || !object?.geometry || object.visible === false) return;
      for (let parent = object.parent; parent; parent = parent.parent) {
        if (parent.visible === false) return;
      }
      const attributes = Object.entries(object.geometry.attributes || {})
        .map(([name, attribute]) => ({
          name,
          bytes: Number(attribute?.array?.byteLength) || 0,
          count: Number(attribute?.count) || 0,
          itemSize: Number(attribute?.itemSize) || 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const indexBytes = Number(object.geometry.index?.array?.byteLength) || 0;
      const totalBytes = indexBytes + attributes.reduce((sum, attribute) => sum + attribute.bytes, 0);
      if (totalBytes > 8192) return;
      const materials = (Array.isArray(object.material) ? object.material : [object.material])
        .filter(Boolean)
        .map((material) => material.name || material.type || '')
        .sort();
      smallVisibleGeometry.push({
        name: object.name || '',
        parent: object.parent?.name || '',
        type: object.type || '',
        geometryType: object.geometry.type || '',
        totalBytes,
        indexBytes,
        attributes,
        materials,
        count: object.isInstancedMesh ? object.count : null,
      });
    });
    activeInstancedMeshes.sort((a, b) => (
      a.name.localeCompare(b.name) || a.parent.localeCompare(b.parent) || a.count - b.count
    ));
    smallVisibleGeometry.sort((a, b) => (
      a.totalBytes - b.totalBytes
      || a.name.localeCompare(b.name)
      || a.parent.localeCompare(b.parent)
      || a.type.localeCompare(b.type)
    ));
    return {
      stage: pointStage,
      scenarioFrame: pointFrame,
      pumpFrame: window.__SF_DETERMINISTIC_PUMP__?.frame ?? null,
      tick: state?.tick ?? null,
      totals: snapshot?.totals ? {
        bufferFullUploads,
        bufferPartialUploads: snapshot.totals.bufferPartialUploads,
        bufferUploadBytes: snapshot.totals.bufferUploadBytes,
        drawCalls: snapshot.totals.drawCalls,
        drawInstancedCalls: snapshot.totals.drawInstancedCalls,
      } : null,
      bufferFullUploadDelta,
      smallVisibleGeometry: bufferFullUploadDelta > 0 ? smallVisibleGeometry : null,
      activeInstancedMeshes,
      vfx: {
        inspect: vfx?.inspect?.() ?? null,
        fleetDiag: vfx?._energy?.fleetDiag ? { ...vfx._energy.fleetDiag } : null,
        plumeDrive: vfx?._energy?.plumeDrive ?? null,
        boostBlend: vfx?._energy?.boostBlend ?? null,
      },
    };
  }, { stage, scenarioFrame });
}

/**
 * Pump a bounded number of presentation frames with a fixed macrotask cadence. The final chunk
 * intentionally has no trailing yield so callers can snapshot or close a measurement at the exact
 * authored boundary before timers, decode callbacks, or other background work are admitted.
 */
async function pumpScenarioFrames(page, frameCount, {
  chunkFrames = CHUNK_FRAMES,
  yieldMs = 25,
  label = 'scenario-frames',
} = {}) {
  const total = Number(frameCount);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new TypeError(`${label}: frameCount must be a nonnegative integer (got ${frameCount})`);
  }
  const chunk = Math.max(1, Math.floor(Number(chunkFrames) || 1));
  let pumped = 0;
  while (pumped < total) {
    assertDeadline(label);
    const n = Math.min(chunk, total - pumped);
    await stepFrames(page, n);
    pumped += n;
    if (pumped < total && yieldMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, yieldMs));
    }
  }
  return pumped;
}

/**
 * Drive one half-open slice of a scenario tape, [fromFrame, toFrame). Events at fromFrame are
 * dispatched before its first presentation frame; events at toFrame belong to the next slice.
 *
 * Both evidence tiers deliberately pump one frame per page task with the same host-task yield.
 * Timing mode additionally reads the production scalar sample immediately after that frame. The
 * synthetic rAF timestamp keeps exactly one fixed simulation step per presentation frame.
 */
async function driveScenarioTapeRange(
  page,
  scenario,
  fromFrame,
  toFrame,
  {
    timingSamples = null,
    closeTimingAtEnd = false,
    captureCounterAtEnd = false,
    tracePoints = null,
  } = {},
) {
  if (!Number.isSafeInteger(fromFrame) || !Number.isSafeInteger(toFrame)
    || fromFrame < 0 || toFrame < fromFrame) {
    throw new TypeError(`scenario ${scenario.id}: invalid tape range [${fromFrame}, ${toFrame})`);
  }
  if (timingSamples != null && !Array.isArray(timingSamples)) {
    throw new TypeError('timingSamples must be an array or null');
  }
  if (closeTimingAtEnd && timingSamples == null) {
    throw new TypeError('closeTimingAtEnd requires timingSamples');
  }
  if (captureCounterAtEnd && timingSamples != null) {
    throw new TypeError('captureCounterAtEnd is only valid for the Tier-1 count path');
  }
  if (captureCounterAtEnd && fromFrame === toFrame) {
    throw new TypeError('captureCounterAtEnd requires at least one presentation frame');
  }
  if (tracePoints != null && !Array.isArray(tracePoints)) {
    throw new TypeError('tracePoints must be an array or null');
  }

  const events = selectScenarioTapeEvents(
    scenario.inputTape?.events || [],
    fromFrame,
    toFrame,
  );
  const eventsByTick = new Map();
  for (const event of events) {
    const batch = eventsByTick.get(event.tick) || [];
    batch.push(event);
    eventsByTick.set(event.tick, batch);
  }

  let cursor = fromFrame;
  let close = null;
  let counterSnapshot = null;
  const pumpTo = async (target) => {
    while (cursor < target) {
      assertDeadline(`${scenario.id}:scenario-frame-${cursor}`);
      if (timingSamples == null) {
        const captureAfterFrame = captureCounterAtEnd && cursor + 1 === toFrame;
        if (captureAfterFrame) {
          // The authored final frame and Tier-1 snapshot share one browser task.
          counterSnapshot = await stepFramesAndCaptureCounterSnapshot(page, 1);
        } else {
          await stepFrames(page, 1);
        }
      } else {
        const closeAfterFrame = closeTimingAtEnd && cursor + 1 === toFrame;
        const result = await page.evaluate(async ({ closeAfterFrame: shouldClose }) => {
          const pump = window.__SF_DETERMINISTIC_PUMP__;
          const state = window.SF?.state;
          const perf = window.__SPACEFACE_PERF__ || state?.perfRuntime || null;
          const beforePumpFrame = pump?.frame ?? null;
          const beforeTick = state?.tick ?? null;
          await pump?.step?.(1);
          const sample = {
            ...(perf?.readFrameSample?.({}) || {}),
            beforePumpFrame,
            pumpFrame: pump?.frame ?? null,
            beforeTick,
            tick: state?.tick ?? null,
          };
          if (!shouldClose) return { sample, close: null };

          // Close CPU and GPU submission in the SAME browser task as the authored final frame.
          // Returning to Node first would admit timers/network work between the boundary and report.
          const gpu = state?.render?.gpuTimers || null;
          const paused = gpu?.pauseSubmissions?.() === true;
          const cpuReport = perf?.getReport?.() ?? null;
          const boundary = {
            tick: state?.tick ?? null,
            simTime: state?.simTime ?? null,
            pumpFrame: pump?.frame ?? null,
            mode: state?.mode ?? null,
            docked: state?.ui?.docked === true,
          };
          perf?.setSystemTimingEnabled?.(false);
          perf?.setRenderWorkEnabled?.(false);
          return {
            sample,
            close: { paused, cpuReport, boundary },
          };
        }, { closeAfterFrame });
        timingSamples.push(result.sample);
        if (result.close) close = result.close;
      }
      cursor++;
      if (TRACE_WINDOW
        && tracePoints
        && cursor >= scenario.measurementWindow.startFrame
        && cursor <= scenario.measurementWindow.startFrame + scenario.measurementWindow.frameCount) {
        tracePoints.push(await captureWindowTracePoint(page, 'frame-task-end', cursor));
      }
      // Both tiers admit one identical host task between authored frames. Never yield after the
      // authored final frame: its counter snapshot or timing report owns that exact boundary.
      if (shouldYieldAfterScenarioFrame(cursor, toFrame)) {
        await new Promise((resolve) => setTimeout(resolve, SCENARIO_INTERFRAME_YIELD_MS));
      }
    }
  };

  for (const tick of [...eventsByTick.keys()].sort((a, b) => a - b)) {
    await pumpTo(tick);
    for (const event of eventsByTick.get(tick)) {
      if (!event.code) continue;
      if (event.pressed) await page.keyboard.down(event.code);
      else await page.keyboard.up(event.code);
    }
  }
  await pumpTo(toFrame);
  return {
    fromFrame,
    toFrame,
    pumpedFrames: toFrame - fromFrame,
    frameTaskSchedule: {
      framesPerBrowserTask: 1,
      interframeYieldMs: SCENARIO_INTERFRAME_YIELD_MS,
      finalFrameClosedAtomically: captureCounterAtEnd || closeTimingAtEnd,
    },
    counterSnapshot,
    close,
  };
}

async function finalizeTimingGpuCapture(page) {
  return page.evaluate(async () => {
    const gpu = window.SF?.state?.render?.gpuTimers || null;
    const drain = await gpu?.drainPending?.({ maxPolls: 240, timeoutMs: 5_000 }) ?? {
      drained: false,
      timedOut: true,
      status: 'unavailable',
    };
    const gpuReport = gpu?.getReport?.() ?? null;
    gpu?.setEnabled?.(false);
    return { drain, gpuReport };
  });
}

async function releaseScenarioKeys(page, scenario) {
  const codes = [...new Set((scenario.inputTape?.events || [])
    .map((event) => event.code)
    .filter(Boolean))];
  for (const code of codes) await page.keyboard.up(code).catch(() => {});
}

async function captureEnvironment(page) {
  return page.evaluate(() => {
    const renderer = window.SF?.state?.render?.renderer || null;
    const gl = renderer?.getContext?.() || null;
    const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info') || null;
    return {
      unmaskedRenderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '',
      unmaskedVendor: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : '',
      gpuTier: window.SF?.state?.render?.gpu?.tier || '',
      software: !!window.SF?.state?.render?.gpu?.software,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      programsAtEnd: renderer?.info?.programs?.length ?? 0,
    };
  });
}

function histogramOf(values) {
  const histogram = {};
  for (const value of values || []) {
    const key = Number.isFinite(Number(value)) ? String(Number(value)) : 'invalid';
    histogram[key] = (histogram[key] || 0) + 1;
  }
  return histogram;
}

function buildTimingTelemetryCoverage({ scenario, cpuReport, gpuReport }) {
  const gpuApplicable = scenario.id !== 'docked_market_ui';
  const completedGpuQueries = Number(
    gpuReport?.completedQueries ?? gpuReport?.queryCounts?.completed ?? 0,
  );
  return {
    displayFrame: {
      status: Number(cpuReport?.frameCallback?.samples) > 0 ? 'captured' : 'missing',
      source: 'perfRuntime.frameCallback',
    },
    simulationTick: {
      status: Object.keys(cpuReport?.systems || {}).length > 0 ? 'captured' : 'missing',
      source: 'perfRuntime.systems',
    },
    renderWork: {
      status: Object.keys(cpuReport?.renderWork || {}).length > 0 ? 'captured' : 'missing',
      source: 'perfRuntime.renderWork',
    },
    gpuPass: {
      applicable: gpuApplicable,
      status: !gpuApplicable
        ? 'not-applicable'
        : (gpuReport?.captureValid === true && completedGpuQueries > 0 ? 'captured' : 'invalid'),
      source: 'gpuTimers',
      completedQueries: completedGpuQueries,
    },
    backgroundJob: {
      status: 'limited',
      source: null,
      note: 'No general background-job timing consumer exists; admission counters and boundary diagnostics are recorded, but CPU time cannot be attributed to a background-job row.',
    },
  };
}

function evaluateTimingControls({
  scenario,
  frameCount,
  route,
  measurementBoundaryDrain,
  measurementStart,
  arm,
  timingSamples,
  close,
  completion,
  pump,
  pageErrors,
  consoleErrors,
  tier1Runs,
}) {
  const controls = [];
  const controlFailures = [];
  const control = (id, pass, detail) => {
    controls.push({ id, pass, detail });
    if (!pass) controlFailures.push(`${id}: ${detail}`);
  };
  const cpuReport = close?.cpuReport || null;
  const gpuReport = close?.gpuReport || null;
  const queryCounts = gpuReport?.queryCounts || {};
  const gpuApplicable = scenario.id !== 'docked_market_ui';
  const stepHistogram = histogramOf(timingSamples.map((sample) => sample?.stepsThisFrame));
  const systemSamples = Object.values(cpuReport?.systems || {})
    .reduce((total, stat) => total + (Number(stat?.samples) || 0), 0);
  const renderWorkSamples = Object.values(cpuReport?.renderWork || {})
    .reduce((total, stat) => total + (Number(stat?.samples) || 0), 0);
  const finiteSamples = timingSamples.every((sample) => [
    'frameDtMs',
    'callbackMs',
    'untrackedMs',
    'simFrameMs',
    'presentationMs',
    'renderMs',
  ].every((field) => Number.isFinite(sample?.[field]) && sample[field] >= 0));

  control('native-timing-clock', arm?.pumpClockMode === 'native-timing',
    `pump clock mode=${arm?.pumpClockMode ?? 'missing'}`);
  control('tier1-disabled', arm?.tier1Disabled === true,
    `Tier-1 counter seam disabled=${arm?.tier1Disabled === true}`);
  control('gl-uninstrumented', arm?.glUninstrumented === true,
    `GL Tier-1 wrappers absent=${arm?.glUninstrumented === true}`);
  control('system-timing-enabled', arm?.systemTimingEnabled === true,
    `system timing enabled=${arm?.systemTimingEnabled === true}`);
  control('render-work-enabled', arm?.renderWorkEnabled === true,
    `render-work timing enabled=${arm?.renderWorkEnabled === true}`);
  control('quiescence-freeze-pass', route?.quiescenceFreeze?.pass === true,
    `freeze=${JSON.stringify(route?.quiescenceFreeze || null)}`);
  control('quiescence-resume-pass', route?.quiescenceResume?.pass === true,
    `resume=${JSON.stringify(route?.quiescenceResume || null)}`);
  control('mesh-reconcile-kick-pass', route?.reconcileKick?.pass === true,
    `reconcileKick=${JSON.stringify(route?.reconcileKick || null)}`);
  control('presentation-clock-alignment-pass', route?.presentationAlignment?.pass === true,
    `alignment=${JSON.stringify(route?.presentationAlignment || null)}`);
  control('post-quiescence-arm-pass', route?.postQuiescenceArm?.pass === true,
    `postArm=${JSON.stringify(route?.postQuiescenceArm || null)}`);
  control('measurement-boundary-drain-pass', measurementBoundaryDrain?.pass === true,
    `measurementBoundaryDrain=${JSON.stringify(measurementBoundaryDrain || null)}`);
  control('comet-precondition-pass',
    measurementBoundaryDrain?.cometPrecondition?.pass === true,
    `cometPrecondition=${JSON.stringify(measurementBoundaryDrain?.cometPrecondition || null)}`);
  control(
    'measurement-boundary-drain-fixed',
    measurementBoundaryDrain?.presentationFramesPumped === FIXED_MEASUREMENT_DRAIN_FRAMES
      && measurementBoundaryDrain?.fixedPresentationFrames === FIXED_MEASUREMENT_DRAIN_FRAMES,
    `presentationFramesPumped=${measurementBoundaryDrain?.presentationFramesPumped ?? 'missing'} `
      + `fixedPresentationFrames=${measurementBoundaryDrain?.fixedPresentationFrames ?? 'missing'} `
      + `expected=${FIXED_MEASUREMENT_DRAIN_FRAMES}`,
  );
  control('timing-sample-count-exact', timingSamples.length === frameCount,
    `captured ${timingSamples.length}/${frameCount} authored frames`);
  control('timing-samples-finite', finiteSamples,
    `${timingSamples.length} samples contain finite nonnegative production durations`);
  control('one-sim-step-per-frame',
    Object.keys(stepHistogram).length === 1 && stepHistogram['1'] === frameCount,
    `stepsThisFrame histogram=${JSON.stringify(stepHistogram)}`);
  control('measurement-pump-delta-exact',
    Number(close?.boundary?.pumpFrame) - Number(measurementStart?.pumpFrame) === frameCount,
    `pump ${measurementStart?.pumpFrame ?? 'missing'}->${close?.boundary?.pumpFrame ?? 'missing'} expected ${frameCount}`);
  control('measurement-tick-delta-exact',
    Number(close?.boundary?.tick) - Number(measurementStart?.tick) === frameCount,
    `tick ${measurementStart?.tick ?? 'missing'}->${close?.boundary?.tick ?? 'missing'} expected ${frameCount}`);
  control('frame-callback-samples-exact', cpuReport?.frameCallback?.samples === frameCount,
    `frameCallback.samples=${cpuReport?.frameCallback?.samples ?? 'missing'} expected ${frameCount}`);
  control('system-attribution-nonempty', systemSamples > 0,
    `system timing samples=${systemSamples}`);
  control('render-work-attribution-nonempty', renderWorkSamples > 0,
    `render-work timing samples=${renderWorkSamples}`);
  const backgroundAtStart = measurementStart?.background || {};
  control('measurement-start-admission-quiet',
    backgroundAtStart.activeAuthoredUpgradeJobs === 0
      && backgroundAtStart.pendingPipelineAdmissions === 0
      && backgroundAtStart.meshQueueRemaining === 0
      && backgroundAtStart.meshReconcileDirty === false
      && backgroundAtStart.environmentReady === true,
    `background=${JSON.stringify(backgroundAtStart)}`);
  if (scenario.id === 'context_recover_steady') {
    const stagingReplay = route?.sourceStaging?.stagingReplay || null;
    control('context-route-staging-semantic-pass',
      stagingReplay?.applicable === true && stagingReplay?.pass === true,
      `stagingReplay=${JSON.stringify(stagingReplay)}`);
    const tier1ProgramCounts = [...new Set((tier1Runs || []).map((run) => (
      run?.measurement?.measurementBoundaryDrain?.activated?.render?.programs
    )).filter(Number.isSafeInteger))];
    const timingProgramCount = measurementBoundaryDrain?.activated?.render?.programs;
    control('context-measurement-program-count-parity',
      tier1ProgramCounts.length === 1 && timingProgramCount === tier1ProgramCounts[0],
      `Tier1=${JSON.stringify(tier1ProgramCounts)} Tier2=${timingProgramCount ?? 'missing'}`);
  }
  control('scenario-completion-receipt-pass', completion?.pass === true,
    `completion pass=${completion?.pass === true} tickDelta=${completion?.tickDelta ?? 'missing'}`);
  control('pump-callback-errors-none', (pump?.errors || []).length === 0,
    `${(pump?.errors || []).length} pump callback error(s)`);
  control('page-errors-none', pageErrors.length === 0,
    `${pageErrors.length} page error(s)${pageErrors[0] ? `: ${pageErrors[0]}` : ''}`);
  control('console-errors-none', consoleErrors.length === 0,
    `${consoleErrors.length} console error(s)${consoleErrors[0] ? `: ${consoleErrors[0].slice(0, 160)}` : ''}`);

  if (gpuApplicable) {
    control('gpu-timers-enabled', arm?.gpuEnabled === true,
      `GPU timers enabled=${arm?.gpuEnabled === true}; capability=${JSON.stringify(arm?.gpuCapability || null)}`);
    control('gpu-submissions-paused-at-close', close?.paused === true,
      `pauseSubmissions returned ${close?.paused}`);
    control('gpu-drain-complete', close?.drain?.drained === true && close?.drain?.timedOut === false,
      `drain=${JSON.stringify(close?.drain || null)}`);
    control('gpu-capture-valid', gpuReport?.captureValid === true,
      `status=${gpuReport?.status ?? 'missing'} invalidation=${gpuReport?.invalidation ?? 'none'}`);
    control('gpu-completed-query-positive', Number(queryCounts.completed) > 0,
      `completed=${queryCounts.completed ?? 'missing'}`);
    control('gpu-query-loss-zero',
      Number(queryCounts.pending) === 0
        && Number(queryCounts.dropped) === 0
        && Number(queryCounts.rejected) === 0,
      `pending=${queryCounts.pending ?? 'missing'} dropped=${queryCounts.dropped ?? 'missing'} rejected=${queryCounts.rejected ?? 'missing'}`);
  } else {
    control('gpu-explicitly-not-applicable', true,
      'docked station UI suppresses world rendering; GPU pass timing is not applicable');
  }

  return { controls, controlFailures };
}

function evaluatePositiveControls({
  snapshot,
  pump,
  pageErrors,
  consoleErrors,
  boot,
  route,
  completion,
  measurement,
}) {
  const positiveControls = [];
  const controlFailures = [];
  const control = (id, pass, detail) => {
    positiveControls.push({ id, pass, detail });
    if (!pass) controlFailures.push(`${id}: ${detail}`);
  };
  const transientVfx = boot?.admissionAtBoundary?.transientVfx;

  control('boot-ramp-nonvacuous', boot.shaderLinksAtBoundary >= MIN_BOOT_RAMP_PROGRAMS,
    `boot shader ramp reached ${boot.shaderLinksAtBoundary} links before reset (floor ${MIN_BOOT_RAMP_PROGRAMS}) — proves the GL hooks were alive`);
  control('boot-admission-quiescent',
    boot?.admissionAtBoundary?.activeAuthoredUpgradeJobs === 0
      && boot?.admissionAtBoundary?.pendingPipelineAdmissions === 0
      && boot?.admissionAtBoundary?.meshQueueRemaining === 0
      && boot?.admissionAtBoundary?.meshReconcileDirty === false
      && boot?.admissionAtBoundary?.environmentReady === true
      && transientVfx?.liveSprites === 0
      && transientVfx?.explosionsActive === 0,
    `admissionAtBoundary=${JSON.stringify(boot?.admissionAtBoundary || null)}`);
  control('boot-network-quiescent', boot?.networkAtBoundary?.pending === 0,
    `networkAtBoundary=${JSON.stringify(boot?.networkAtBoundary || null)}`);
  control('route-receipt-pass', route?.pass === true,
    `route=${route?.route || 'missing'} receipt pass=${route?.pass === true}`);
  control('quiescence-freeze-pass', route?.quiescenceFreeze?.pass === true,
    `freeze=${JSON.stringify(route?.quiescenceFreeze || null)}`);
  control('quiescence-resume-pass', route?.quiescenceResume?.pass === true,
    `resume=${JSON.stringify(route?.quiescenceResume || null)}`);
  control('mesh-reconcile-kick-pass', route?.reconcileKick?.pass === true,
    `reconcileKick=${JSON.stringify(route?.reconcileKick || null)}`);
  control('presentation-clock-alignment-pass', route?.presentationAlignment?.pass === true,
    `alignment=${JSON.stringify(route?.presentationAlignment || null)}`);
  control('post-quiescence-arm-pass', route?.postQuiescenceArm?.pass === true,
    `postArm=${JSON.stringify(route?.postQuiescenceArm || null)}`);
  control('measurement-boundary-drain-pass',
    measurement?.measurementBoundaryDrain?.pass === true,
    `measurementBoundaryDrain=${JSON.stringify(measurement?.measurementBoundaryDrain || null)}`);
  control('comet-precondition-pass',
    measurement?.measurementBoundaryDrain?.cometPrecondition?.pass === true,
    `cometPrecondition=${JSON.stringify(
      measurement?.measurementBoundaryDrain?.cometPrecondition || null,
    )}`);
  control(
    'measurement-boundary-drain-fixed',
    measurement?.measurementBoundaryDrain?.presentationFramesPumped
      === FIXED_MEASUREMENT_DRAIN_FRAMES
      && measurement?.measurementBoundaryDrain?.fixedPresentationFrames
        === FIXED_MEASUREMENT_DRAIN_FRAMES,
    `presentationFramesPumped=${measurement?.measurementBoundaryDrain?.presentationFramesPumped ?? 'missing'} `
      + `fixedPresentationFrames=${measurement?.measurementBoundaryDrain?.fixedPresentationFrames ?? 'missing'} `
      + `expected=${FIXED_MEASUREMENT_DRAIN_FRAMES}`,
  );
  control('scenario-completion-receipt-pass', completion?.pass === true,
    `tickDelta=${completion?.tickDelta ?? 'missing'} distance=${completion?.distance ?? 'missing'}`);
  control(
    'measurement-window-frame-count-exact',
    measurement?.endFramesObserved - measurement?.startFramesObserved === measurement?.frameCount,
    `observed ${measurement?.startFramesObserved ?? 'missing'}->${measurement?.endFramesObserved ?? 'missing'} `
      + `for ${measurement?.frameCount ?? 'missing'} authored frames`,
  );
  control('window-frame-count-exact', snapshot.framesObserved === measurement?.frameCount,
    `framesObserved=${snapshot.framesObserved} vs measured ${measurement?.frameCount ?? 'missing'} — `
      + `the pump drove exactly the digest-bound cost window`);
  control('boot-boundary-at-zero', snapshot.bootBoundaryFrame === 0,
    `bootBoundaryFrame=${snapshot.bootBoundaryFrame} (reset then markBootBoundary must anchor at 0)`);
  control('frames-rendered', snapshot.totals.drawCalls > 0,
    `drawCalls=${snapshot.totals.drawCalls} — a zero here is a dead hook, not a quiet frame`);
  control('per-frame-uploads-moved', snapshot.totals.bufferPartialUploads > 0,
    `bufferPartialUploads=${snapshot.totals.bufferPartialUploads} — the per-frame upload path must move inside the window or the run executed nothing`);
  const zeroBudgets = evaluateTier1ZeroBudgets(snapshot);
  for (const result of zeroBudgets.results) {
    control(
      result.id,
      result.pass,
      `${result.field}=${result.value ?? 'missing'} must be ${result.operator} ${result.limit}`,
    );
  }
  const deterministicCoverage = evaluateDeterministicFieldCoverage(snapshot, DETERMINISTIC_FIELDS);
  control(
    'deterministic-fields-complete',
    deterministicCoverage.pass,
    deterministicCoverage.pass
      ? `${deterministicCoverage.requiredCount} deterministic fields are finite nonnegative integers`
      : `missing/invalid fields: ${deterministicCoverage.invalid.join(', ')}`,
  );
  const exactWindow = evaluateExactScenarioWindow(snapshot, measurement?.frameCount);
  for (const result of exactWindow.results) control(result.id, result.pass, result.detail);
  control('pump-callback-errors-none', (pump.errors || []).length === 0,
    `${(pump.errors || []).length} pump callback error(s)${pump.errors?.[0] ? ` (first at frame ${pump.errors[0].frame}: ${pump.errors[0].message})` : ''}`);
  control('page-errors-none', pageErrors.length === 0,
    `${pageErrors.length} page error(s)${pageErrors[0] ? `: ${pageErrors[0]}` : ''}`);
  control('console-errors-none', consoleErrors.length === 0,
    `${consoleErrors.length} console error(s)${consoleErrors[0] ? `: ${consoleErrors[0].slice(0, 160)}` : ''}`);

  return { positiveControls, controlFailures };
}

async function safeStrictWorktreeFingerprint() {
  try {
    return await strictWorktreeFingerprint(ROOT);
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

function printDeterminismTable(scenarioId, runs, differences, costCounterWindowDifferences = []) {
  console.log('');
  console.log(`[perf-scenario] DETERMINISTIC_FIELDS, scenario ${scenarioId}:`);
  console.log(`  ${'field'.padEnd(26)} ${'run 1'.padStart(14)} ${'run 2'.padStart(14)}`);
  for (const field of DETERMINISTIC_FIELDS) {
    const a = runs[0]?.snapshot?.totals?.[field];
    const b = runs[1]?.snapshot?.totals?.[field];
    console.log(`  ${field.padEnd(26)} ${String(a).padStart(14)} ${String(b ?? '(not run)').padStart(14)}`);
  }
  console.log('');
  if (RUNS < 2) {
    console.log('[perf-scenario] single run requested — determinism comparison skipped (collection mode)');
  } else if (differences.length === 0) {
    console.log('[perf-scenario] diffDeterministicCounters(run1, run2): [] — IDENTICAL');
  } else {
    console.log('[perf-scenario] diffDeterministicCounters(run1, run2):');
    for (const diff of differences) {
      console.log(`  ${diff.field}: run1=${diff.left} run2=${diff.right}`);
    }
  }
  if (costCounterWindowDifferences.length === 0) {
    console.log('[perf-scenario] Tier-1 authored cost-window deltas: IDENTICAL');
  } else {
    console.log('[perf-scenario] Tier-1 authored cost-window differences:');
    for (const diff of costCounterWindowDifferences) {
      console.log(`  ${diff.field}: run1=${diff.left} run2=${diff.right}`);
    }
  }
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq > -1) out[token.slice(2, eq)] = token.slice(eq + 1);
    else if (args[i + 1] && !args[i + 1].startsWith('--')) out[token.slice(2)] = args[++i];
    else out[token.slice(2)] = true;
  }
  return out;
}
