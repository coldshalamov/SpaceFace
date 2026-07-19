import assert from 'node:assert/strict';
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
const BRANCH = 'codex/performance-final-test';
const DIGEST = 'b'.repeat(64);
const VIDEO = { renderScale: 0.85, bloom: true, shadows: false };

test('requires three clean, same-commit, directly comparable passing runs', () => {
  const result = evaluatePerformanceFinalAcceptance(fixture());
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.profiles.length, 3);
  assert.equal(result.matrices.every((run) => run.scenarioCount === PERFORMANCE_SCENARIO_IDS.length), true);
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
  const result = evaluatePerformanceFinalAcceptance(input);
  assert.equal(result.pass, false);
  assert.match(result.failures.join('\n'), /lacks stable program residency/);
  assert.match(result.failures.join('\n'), /lacks finite heap evidence/);
  assert.match(result.failures.join('\n'), /active or uncontrolled asset admission/);
});

function fixture() {
  return {
    expectedCommit: COMMIT,
    currentWorktree: fingerprint(),
    profiles: [0, 1, 2].map((index) => receipt(`profile-${index}`, profile(index))),
    matrices: [0, 1, 2].map((index) => ({
      ...receipt(`matrix-${index}`, matrix(index)),
      artifactValidation: { pass: true, failures: [], verified: [] },
    })),
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

function matrix(index) {
  const environment = {
    runtimeKind: 'browser',
    seed: 47,
    browser: { version: '150', userAgent: 'Chrome/150' },
    gpu: { api: 'webgl2', renderer: 'ANGLE test GPU' },
    viewport: { width: 1440, height: 900 },
    activity: {},
    defaultSettings: { video: VIDEO },
  };
  const windows = PERFORMANCE_SCENARIO_IDS.map((scenarioId) => performanceWindow(scenarioId, environment));
  const report = buildPerformanceClosureReport({
    taskId: `matrix-${index}`,
    fingerprints: { start: fingerprint(), end: fingerprint() },
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

function performanceWindow(scenarioId, environment) {
  const rawSamples = [{ frameMs: 16 }, { frameMs: 16.5 }];
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
    cpu: {},
    gpu: {},
    scene: {},
    pipeline: {
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
  };
}

function receipt(name, document) {
  return { path: `${name}.json`, bytes: 100, sha256: Buffer.from(name).toString('hex').padEnd(64, '0').slice(0, 64), document };
}

function fingerprint() {
  return { id: `${COMMIT.slice(0, 12)}-${DIGEST.slice(0, 16)}`, digest: DIGEST, head: COMMIT, branch: BRANCH, changedFileCount: 0 };
}

function budget(name, value, limit) {
  return { name, value, op: '<=', limit, pass: value <= limit, severity: 'required' };
}
