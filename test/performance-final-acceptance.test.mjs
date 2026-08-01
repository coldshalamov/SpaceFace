import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PERFORMANCE_BUDGETS,
  PERFORMANCE_SCENARIO_IDS,
  PERFORMANCE_WINDOW_SCHEMA,
  buildPerformanceClosureReport,
  comparisonKey,
  evaluatePerformanceWindowBudgets,
  summarizeFrameSamples,
} from '../scripts/lib/performanceClosureContracts.mjs';
import { evaluatePerformanceFinalAcceptance } from '../scripts/lib/performanceFinalAcceptance.mjs';

const COMMIT = 'a'.repeat(40);
const BASELINE_COMMIT = '9'.repeat(40);
const BRANCH = 'codex/performance-final-test';
const DIGEST = 'b'.repeat(64);
const VIDEO = { renderScale: 0.85, bloom: true, shadows: false };

test('requires three clean, same-commit, directly comparable passing runs', () => {
  const result = evaluatePerformanceFinalAcceptance(fixture());
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.profiles.length, 3);
  assert.equal(result.baselineMatrices.length, 3);
  assert.equal(result.runtimePairs.length, 3);
  assert.equal(result.matrices.every((run) => run.scenarioCount === PERFORMANCE_SCENARIO_IDS.length), true);
  assert.equal(result.verdict.equivalence.pass, true);
  assert.equal(result.verdict.measurementValidity.pass, true);
  assert.equal(result.verdict.improvement.status, 'improved');
  assert.equal(result.verdict.absoluteBudget.pass, true);
});

test('requires source-paired Browser/Electron evidence with distinct candidates and raw traces', () => {
  const sourceMismatch = fixture();
  sourceMismatch.runtimePairs[0].electron.document.sourceCandidateDigest = 'f'.repeat(64);
  let result = evaluatePerformanceFinalAcceptance(sourceMismatch);
  assert.equal(result.pass, false);
  assert.match(result.failures.join('\n'), /sourceCandidateDigest must match/);

  const candidateAlias = fixture();
  candidateAlias.runtimePairs[1].electron.document.candidateDigest = candidateAlias.runtimePairs[1].browser.document.candidateDigest;
  result = evaluatePerformanceFinalAcceptance(candidateAlias);
  assert.equal(result.pass, false);
  assert.match(result.failures.join('\n'), /candidateDigest values must be distinct/);

  const traceAlias = fixture();
  traceAlias.runtimePairs[2].electron.document.rawTraceDigest = traceAlias.runtimePairs[2].browser.document.rawTraceDigest;
  result = evaluatePerformanceFinalAcceptance(traceAlias);
  assert.equal(result.pass, false);
  assert.match(result.failures.join('\n'), /rawTraceDigest values must be distinct/);
});

test('diagnostic matrix evidence cannot waive a primary 16.7 ms profile miss', () => {
  const input = fixture();
  const budget = input.profiles[1].document.scenarios[0].budgets.find((row) => row.name === 'raf.frame.p95.target');
  budget.value = 16.8;
  budget.pass = false;
  input.profiles[1].document.scenarios[0].pass = false;
  input.profiles[1].document.summary.pass = false;
  const result = evaluatePerformanceFinalAcceptance(input);
  assert.equal(result.pass, false);
  assert.match(result.failures.join('\n'), /literal <= 16\.7 contract/);
});

test('rejects missing scenarios, duplicate evidence, and dirty worktrees', () => {
  const input = fixture();
  input.currentWorktree.changedFileCount = 1;
  input.profiles[2].sha256 = input.profiles[1].sha256;
  input.matrices[0].document.windows = input.matrices[0].document.windows.slice(1);
  const result = evaluatePerformanceFinalAcceptance(input);
  assert.equal(result.pass, false);
  assert.match(result.failures.join('\n'), /current worktree must be clean/);
  assert.match(result.failures.join('\n'), /distinct capture artifacts/);
  assert.match(result.failures.join('\n'), /one baseline window for every performance scenario/);
});

test('fails closed when residency or admission metrics are absent', () => {
  const input = fixture();
  const window = input.matrices[0].document.windows.find((entry) => entry.scenarioId === 'flight_steady');
  delete window.memory.renderer.delta.programs;
  delete window.memory.heap.growthBytes;
  delete window.pipeline.start.activeAdmissionJobs;
  delete window.cpu.backgroundJobs;
  const result = evaluatePerformanceFinalAcceptance(input);
  assert.equal(result.pass, false);
  assert.match(result.failures.join('\n'), /lacks stable program residency/);
  assert.match(result.failures.join('\n'), /lacks finite heap evidence/);
  assert.match(result.failures.join('\n'), /active or uncontrolled asset admission/);
  assert.match(result.failures.join('\n'), /background-job evidence/);
});

test('fails closed when accepted runtime evidence or a matrix is measurement-invalid', () => {
  const input = fixture();
  input.runtimePairs[0].browser.document.closure.measurementValidity = {
    schema: 'spaceface.performanceMeasurementValidity.v1',
    pass: false,
    reasons: ['contaminating-process-or-authoring-activity'],
    checks: [],
  };
  input.matrices[1].document.environment.activity.end.active = true;
  const result = evaluatePerformanceFinalAcceptance(input);
  assert.equal(result.pass, false);
  assert.equal(result.verdict.equivalence.pass, true);
  assert.equal(result.verdict.measurementValidity.pass, false);
  assert.match(result.failures.join('\n'), /runtimePairs\[0\]\.browser measurement validity failed/);
  assert.match(result.failures.join('\n'), /contaminating-process-or-authoring-activity/);
  assert.match(result.failures.join('\n'), /matrices\[1\].*measurement invalid/);
});

test('keeps equivalence, validity, improvement, and absolute budget as independent final dimensions', () => {
  const semanticFailure = fixture();
  semanticFailure.equivalence.document.simulation.equivalent = false;
  semanticFailure.equivalence.document.simulation.firstDivergence = { tick: 47, field: 'player.hull' };
  let result = evaluatePerformanceFinalAcceptance(semanticFailure);
  assert.equal(result.pass, false);
  assert.equal(result.verdict.equivalence.pass, false);
  assert.equal(result.verdict.measurementValidity.pass, true);
  assert.equal(result.verdict.improvement.pass, true);

  const aliasedRaw = fixture();
  aliasedRaw.equivalence.document.artifacts[1].sha256 = aliasedRaw.equivalence.document.artifacts[0].sha256;
  result = evaluatePerformanceFinalAcceptance(aliasedRaw);
  assert.equal(result.pass, false);
  assert.match(result.failures.join('\n'), /four content-hashed raw artifacts/);

  const neutral = fixture();
  neutral.baselineMatrices = [0, 1, 2].map((index) => ({
    ...receipt(`baseline-matrix-neutral-${index}`, matrix(index, { commit: BASELINE_COMMIT, frameMs: 16.5 })),
    artifactValidation: { pass: true, failures: [], verified: [] },
  }));
  result = evaluatePerformanceFinalAcceptance(neutral);
  assert.equal(result.pass, false);
  assert.equal(result.status, 'neutral');
  assert.equal(result.verdict.equivalence.pass, true);
  assert.equal(result.verdict.measurementValidity.pass, true);
  assert.equal(result.verdict.improvement.status, 'neutral');
  assert.equal(result.verdict.absoluteBudget.pass, true);

  const missing = fixture();
  missing.baselineMatrices = [];
  result = evaluatePerformanceFinalAcceptance(missing);
  assert.equal(result.pass, false);
  assert.match(result.failures.join('\n'), /baselineMatrices must contain exactly 3 consecutive runs/);
});

function fixture() {
  return {
    expectedCommit: COMMIT,
    currentWorktree: fingerprint(),
    profiles: [0, 1, 2].map((index) => receipt(`profile-${index}`, profile(index))),
    baselineMatrices: [0, 1, 2].map((index) => ({
      ...receipt(`baseline-matrix-${index}`, matrix(index, { commit: BASELINE_COMMIT, frameMs: 18.5 })),
      artifactValidation: { pass: true, failures: [], verified: [] },
    })),
    matrices: [0, 1, 2].map((index) => ({
      ...receipt(`matrix-${index}`, matrix(index)),
      artifactValidation: { pass: true, failures: [], verified: [] },
    })),
    runtimePairs: [0, 1, 2].map(runtimePair),
    equivalence: equivalenceInput(),
    improvementScenarioId: 'flight_steady',
  };
}

function equivalenceInput() {
  const document = equivalenceEvidence();
  return {
    ...receipt('equivalence', document),
    artifactValidation: { pass: true, failures: [], verified: [] },
    recomputed: {
      simulation: structuredClone(document.simulation),
      presentation: structuredClone(document.presentation),
    },
  };
}

function equivalenceEvidence() {
  return {
    schema: 'spaceface.performanceEquivalenceEvidence.v1',
    generatedAt: new Date(Date.UTC(2026, 6, 19, 11, 0, 0)).toISOString(),
    baselineCommit: BASELINE_COMMIT,
    candidateCommit: COMMIT,
    comparisonIdentity: '8'.repeat(64),
    simulation: {
      schema: 'spaceface.performanceSimulationEquivalence.v1',
      valid: true,
      equivalent: true,
      firstDivergence: null,
      failures: [],
    },
    presentation: {
      schema: 'spaceface.presentationSemanticComparison.v1',
      valid: true,
      equivalent: true,
      firstDivergence: null,
      failures: [],
    },
    artifacts: [
      { kind: 'baseline-simulation', path: '.devshots/perf/baseline-sim.json', bytes: 10, sha256: '1'.repeat(64) },
      { kind: 'candidate-simulation', path: '.devshots/perf/candidate-sim.json', bytes: 10, sha256: '2'.repeat(64) },
      { kind: 'baseline-presentation', path: '.devshots/perf/baseline-presentation.json', bytes: 10, sha256: '3'.repeat(64) },
      { kind: 'candidate-presentation', path: '.devshots/perf/candidate-presentation.json', bytes: 10, sha256: '4'.repeat(64) },
    ],
  };
}

function runtimePair(index) {
  const sourceCandidateDigest = 'c'.repeat(64);
  return {
    browser: receipt(`browser-evidence-${index}`, runtimeEvidence({
      index,
      runtimeKind: 'browser',
      sourceCandidateDigest,
      candidateDigest: `${index + 1}`.repeat(64),
      rawTraceDigest: `${index + 4}`.repeat(64),
    })),
    electron: receipt(`electron-evidence-${index}`, runtimeEvidence({
      index,
      runtimeKind: 'electron',
      sourceCandidateDigest,
      candidateDigest: `${index + 7}`.repeat(64),
      rawTraceDigest: ['d', 'e', 'f'][index].repeat(64),
    })),
  };
}

function runtimeEvidence({ index, runtimeKind, sourceCandidateDigest, candidateDigest, rawTraceDigest }) {
  return {
    schema: 'spaceface.performanceClosureAcceptance.v2',
    generatedAt: new Date(Date.UTC(2026, 6, 19, 14, index, runtimeKind === 'browser' ? 0 : 30)).toISOString(),
    pass: true,
    primaryAcceptance: true,
    runtimeKind,
    claimId: `claim-${runtimeKind}`,
    sourceCandidateDigest,
    candidateDigest,
    rawTraceDigest,
    digests: { sourceCandidateDigest, candidateDigest },
    artifacts: { rawTrace: { kind: 'raw-evidence', path: `${runtimeKind}-${index}.json`, bytes: 100, sha256: rawTraceDigest } },
    closure: {
      worktree: { commit: COMMIT },
      measurementValidity: {
        schema: 'spaceface.performanceMeasurementValidity.v1',
        pass: true,
        reasons: [],
        checks: [],
      },
    },
  };
}

function profile(index) {
  const generatedAt = new Date(Date.UTC(2026, 6, 19, 12, index, 0)).toISOString();
  const browser = {
    userAgent: 'Chrome/150',
    viewport: { width: 1440, height: 900, dpr: 1 },
    gpu: 'ANGLE test GPU',
  };
  const budgets = [
    budget('raf.frame.p95.target', 16.5, 16.7),
    budget('raf.frame.hitchesOver32.max', 0, 0),
    budget('raf.frame.p95.floor', 16.5, 34.3),
    budget('autosave.maxBlockingSlice.max', 10, 12),
    budget('heap.growth.mb', 1, 30),
    budget('content.authoredShipFallbacks.max', 0, 0),
    budget('post.renderTargetAllocationsDuringSample.max', 0, 0),
  ];
  const worktree = {
    commit: COMMIT,
    branch: BRANCH,
    dirty: false,
    stable: true,
    start: fingerprint(),
    end: fingerprint(),
  };
  return {
    schema: 'spaceface.performanceProfile.v1',
    generatedAt,
    runner: {
      width: 1440,
      height: 900,
      seed: 47,
      strict: true,
      headless: false,
      renderScale: { requested: null, applied: null, restored: null, profileRestored: null },
    },
    qualityPreserving: { settingsOverridesApplied: false, appliedOverrides: {} },
    worktree,
    scenarios: [{
      name: 'crowded-flight',
      pass: true,
      browser,
      budgets,
      qualityAssertions: {
        pass: true,
        settingsChanged: false,
        noValueReducingOverrides: true,
        settingsBefore: VIDEO,
        settingsAfter: VIDEO,
      },
    }],
    summary: { pass: true, failedBudgets: [] },
  };
}

function matrix(index, { commit = COMMIT, frameMs = 16.5 } = {}) {
  const environment = {
    runtimeKind: 'browser',
    seed: 47,
    browser: { version: '150', userAgent: 'Chrome/150' },
    gpu: {
      api: 'webgl2',
      renderer: 'ANGLE test GPU',
      vendor: 'test vendor',
      source: 'game-renderer',
    },
    viewport: { width: 1440, height: 900 },
    activity: { start: { active: false }, end: { active: false } },
    defaultSettings: { video: VIDEO },
  };
  const windows = PERFORMANCE_SCENARIO_IDS.map((scenarioId) => performanceWindow(scenarioId, environment, frameMs));
  const report = buildPerformanceClosureReport({
    taskId: `matrix-${index}`,
    fingerprints: { start: fingerprint(commit), end: fingerprint(commit) },
    environment,
    windows,
    artifacts: [{ kind: 'json', path: `.devshots/perf/matrix-${index}.json`, bytes: 10, sha256: `${index + 1}`.repeat(64) }],
    cleanup: {
      pass: true,
      pageClosed: true,
      browserClosed: true,
      serverReleased: true,
      portsReleased: true,
      measurementDisabled: true,
    },
    errors: { pageErrors: [], requestFailures: [], httpErrors: [], consoleErrors: [], glErrors: [], warnings: [] },
  });
  report.generatedAt = new Date(Date.UTC(2026, 6, 19, 13, index, 0)).toISOString();
  return report;
}

function performanceWindow(scenarioId, environment, frameMs = 16.5) {
  const rawSamples = [{ frameMs: frameMs - 0.5 }, { frameMs }];
  const summary = summarizeFrameSamples(rawSamples);
  const autosave = scenarioId === 'autosave_under_load'
    ? { timing: { maxBlockingSliceMs: 10 }, events: [{ event: 'save:completed' }] }
    : null;
  const settings = { video: VIDEO, timeScale: 1 };
  return {
    schema: PERFORMANCE_WINDOW_SCHEMA,
    scenarioId,
    evidenceKind: 'diagnostic',
    stateInjected: true,
    inputSource: 'probe',
    defaultQuality: true,
    diagnosticVariant: 'baseline',
    rawSamples,
    summary,
    comparisonKey: comparisonKey({ scenarioId, environment, settings }),
    settings: { start: settings, end: settings },
    cpu: {
      backgroundJobs: {
        schema: 'spaceface.performanceBackgroundJobs.v1',
        enabled: true,
        capacity: 128,
        activeCount: 0,
        droppedRecords: 0,
        overwrittenActiveRecords: 0,
        refusedStarts: 0,
        records: [],
      },
    },
    gpu: gpuTimer(),
    scene: {},
    pipeline: {
      warmup: {
        schema: 'spaceface.performancePipelineWarmup.v1',
        pass: true,
        requiredStableMs: 5_000,
        maxWaitMs: 20_000,
        elapsedMs: 5_000,
        stableMs: 5_000,
        timedOut: false,
        observationCount: 301,
        transitionCount: 0,
      },
      start: { activeAdmissionJobs: 0, meshBuildQueueRemaining: 0, programCount: 20 },
      end: { activeAdmissionJobs: 0, meshBuildQueueRemaining: 0, programCount: 20 },
    },
    memory: {
      comparableState: { pass: true },
      renderer: { delta: { geometries: 0, textures: 0, programs: 0, renderTargets: 0 } },
      heap: { growthBytes: 1024 },
    },
    budgets: evaluatePerformanceWindowBudgets({ scenarioId, summary, autosave, evidenceKind: 'diagnostic' }),
    restoration: { restored: true, measurementDisabled: true },
    pageErrors: [],
    autosave,
    action: scenarioId === 'jump_asset_admission'
      ? { kind: 'jump_request', dispatched: true }
      : null,
  };
}

function receipt(name, document) {
  return {
    path: `${name}.json`,
    bytes: 100,
    sha256: Buffer.from(name).toString('hex').padEnd(64, '0').slice(0, 64),
    document,
    ...(name.includes('evidence-') ? { artifactValidation: { pass: true, failures: [], verified: [] } } : {}),
  };
}

function gpuTimer() {
  return {
    available: true,
    status: 'available',
    enabled: true,
    lastDisjoint: false,
    pending: 0,
    lastInvalidation: null,
    captureValid: true,
    drain: { drained: true, timedOut: false, polls: 1, pending: 0 },
    queryCounts: {
      attempted: 1,
      issued: 1,
      completed: 1,
      pending: 0,
      dropped: 0,
      rejected: 0,
    },
    terminals: [{ queryId: 1, state: 'completed' }],
    passes: {},
  };
}

function fingerprint(commit = COMMIT) {
  return { id: `${commit.slice(0, 12)}-${DIGEST.slice(0, 16)}`, digest: DIGEST, head: commit, branch: BRANCH, changedFileCount: 0 };
}

function budget(name, value, limit) {
  return { name, value, op: '<=', limit, pass: value <= limit, severity: 'required' };
}

test('final CLI loads baseline matrices and recomputes declared semantic equivalence', async () => {
  const source = await readFile(new URL('../scripts/check-performance-final-acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /readList\('baseline-matrices'\)/);
  assert.match(source, /readArg\('equivalence'/);
  assert.match(source, /compareAuthoritativeSimulationRecords/);
  assert.match(source, /comparePresentationSemanticRecords/);
  assert.match(source, /improvement-scenario/);
});
