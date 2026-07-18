import assert from 'node:assert/strict';
import test from 'node:test';
import * as ciReport from '../scripts/check-ci-report.mjs';

const { classifyCommandResult } = ciReport;

function classify(overrides = {}) {
  return classifyCommandResult({
    id: 'fixture',
    command: 'node fixture.mjs',
    code: 1,
    signal: null,
    timedOut: false,
    stdout: '',
    stderr: '',
    structured: null,
    ...overrides,
  });
}

test('classifies an assertion failure', () => {
  const result = classify({ stderr: 'AssertionError [ERR_ASSERTION]: expected true' });
  assert.equal(result.category, 'assertion_failure');
});

test('classifies a deterministic candidate with expected-envelope diffs as a stale golden', () => {
  const result = classify({
    structured: {
      schema: 'spaceface.sfSimCompareResult.v1',
      comparison: {
        hashEqual: true,
        firstDivergentTick: null,
        diffs: [{ path: 'telemetry.projectileHits', expected: 1, actual: 2 }],
      },
    },
  });
  assert.equal(result.category, 'stale_golden');
});

test('treats a code-zero compare with expected-envelope diffs as non-passing verification debt', () => {
  const result = ciReport.createCommandResult({
    def: { id: 'sim-compare', command: 'npm run check:sim:compare' },
    code: 0,
    structured: {
      schema: 'spaceface.sfSimCompareResult.v1',
      comparison: {
        hashEqual: true,
        firstDivergentTick: null,
        diffs: [{ path: 'hash', expected: 'old', actual: 'current' }],
      },
    },
  });
  const report = ciReport.buildCiReport({ results: [result] });

  assert.equal(result.classification.category, 'stale_golden');
  assert.equal(result.ok, false);
  assert.match(result.reason, /stale expected envelope/);
  assert.equal(report.ok, false);
  assert.equal(report.failingCount, 1);
  assert.equal(report.failing[0].classification.category, 'stale_golden');
});

test('does not call an actual deterministic divergence a stale golden', () => {
  const result = classify({
    structured: {
      schema: 'spaceface.sfSimCompareResult.v1',
      comparison: {
        hashEqual: false,
        firstDivergentTick: 431,
        diffs: [{ path: 'hash', expected: 'a', actual: 'b' }],
      },
    },
  });
  assert.equal(result.category, 'generic_nonzero');
});

test('classifies a stale source pin', () => {
  const result = classify({ stderr: 'stale source pin: expected commit abc, found def' });
  assert.equal(result.category, 'stale_source_pin');
});

test('classifies an explicit browser launch failure', () => {
  const result = classify({ stderr: 'browserType.launch: Failed to launch the browser process' });
  assert.equal(result.category, 'browser_launch_failure');
});

test('classifies a connection reset as Electron-specific only with Electron context', () => {
  const electron = classify({
    command: 'node scripts/check-alpha-live-baseline-electron.mjs',
    stderr: 'Error: read ECONNRESET',
  });
  const browser = classify({
    command: 'node scripts/check-alpha-live-baseline-browser.mjs',
    stderr: 'Error: read ECONNRESET',
  });
  assert.equal(electron.category, 'electron_connection_reset');
  assert.equal(browser.category, 'generic_nonzero');
});

test('classifies runner-enforced timeouts ahead of their kill signal', () => {
  const result = classify({ timedOut: true, signal: 'SIGTERM', stderr: 'terminated' });
  assert.equal(result.category, 'timeout');
});

test('classifies a child signal and retains the specific signal', () => {
  const result = classify({ code: null, signal: 'SIGTERM' });
  assert.equal(result.category, 'child_signal');
  assert.equal(result.signal, 'SIGTERM');
});

test('classifies a performance budget regression', () => {
  const result = classify({ stderr: 'performance regression: frame p95 26ms exceeds budget 16.7ms' });
  assert.equal(result.category, 'performance_regression');
});

test('classifies missing required evidence', () => {
  const result = classify({ stderr: 'Missing required evidence: player-route.json' });
  assert.equal(result.category, 'missing_evidence');
});

test('classifies an explicitly detected orphan process', () => {
  const result = classify({ stderr: 'orphan process detected: electron.exe pid 4120' });
  assert.equal(result.category, 'orphan_process');
});

test('does not infer an orphan process from a port conflict alone', () => {
  const result = classify({ stderr: 'listen EADDRINUSE: address already in use :::8123' });
  assert.equal(result.category, 'generic_nonzero');
});

test('keeps an unrecognized nonzero exit honest', () => {
  const result = classify({ code: 9, stderr: 'fixture failed for an unknown reason' });
  assert.equal(result.category, 'generic_nonzero');
  assert.equal(result.flake.status, 'unknown');
  assert.equal(result.flake.attemptsObserved, 1);
});

test('reports a flake only when repeated attempts contain both pass and failure', () => {
  const result = classify({
    stderr: 'fixture failed for an unknown reason',
    attempts: [{ ok: false }, { ok: true }, { ok: true }],
  });
  assert.equal(result.category, 'flake');
  assert.equal(result.underlyingCategory, 'generic_nonzero');
  assert.equal(result.flake.status, 'observed');
  assert.equal(result.flake.attemptsObserved, 3);
});

test('expands the broad check chain into a complete independently runnable matrix', () => {
  assert.equal(typeof ciReport.buildCommandMatrix, 'function');
  const matrix = ciReport.buildCommandMatrix(
    'node scripts/check-data.mjs && npm run check:sim:long && npm run check:sim:long',
  );
  assert.deepEqual(matrix, [
    {
      id: 'check-data',
      command: 'node scripts/check-data.mjs',
      timeoutMs: 180000,
    },
    {
      id: 'check-sim-long',
      command: 'npm run check:sim:long',
      timeoutMs: 420000,
    },
    {
      id: 'check-sim-long-2',
      command: 'npm run check:sim:long',
      timeoutMs: 420000,
    },
  ]);
});

test('recursively expands composite npm scripts so nested failures do not hide sibling checks', () => {
  const matrix = ciReport.buildCommandMatrix(
    'npm run check:outer && node scripts/final.mjs',
    {
      'check:outer': 'npm run check:inner && node scripts/outer.mjs',
      'check:inner': 'node scripts/first.mjs && node scripts/second.mjs',
    },
  );
  assert.deepEqual(matrix.map(({ id, command }) => ({ id, command })), [
    { id: 'first', command: 'node scripts/first.mjs' },
    { id: 'second', command: 'node scripts/second.mjs' },
    { id: 'outer', command: 'node scripts/outer.mjs' },
    { id: 'final', command: 'node scripts/final.mjs' },
  ]);
});

test('builds a stable ignored artifact path from the run time and command id', () => {
  assert.equal(typeof ciReport.buildArtifactPath, 'function');
  assert.equal(
    ciReport.buildArtifactPath('2026-07-18T14:15:16.123Z', 'flight clean/special'),
    'scratch/check-ci-report/2026-07-18T14-15-16-123Z/flight-clean-special.log',
  );
});

test('builds a command result with classification, duration, and artifact path', () => {
  assert.equal(typeof ciReport.createCommandResult, 'function');
  const result = ciReport.createCommandResult({
    def: { id: 'save-schema', command: 'npm run check:save-schema' },
    code: 1,
    signal: null,
    timedOut: false,
    durationMs: 2345,
    stdout: '',
    stderr: 'AssertionError [ERR_ASSERTION]: invalid save',
    artifactPath: 'scratch/check-ci-report/run/save-schema.log',
  });

  assert.equal(result.durationMs, 2345);
  assert.equal(result.artifactPath, 'scratch/check-ci-report/run/save-schema.log');
  assert.equal(result.classification.category, 'assertion_failure');
  assert.equal(result.ok, false);
});

test('builds a schema-v2 complete diagnostic matrix with compact failing entries', () => {
  assert.equal(typeof ciReport.buildCiReport, 'function');
  const passed = ciReport.createCommandResult({
    def: { id: 'passed', command: 'node passed.mjs' },
    code: 0,
    durationMs: 12,
    artifactPath: 'scratch/check-ci-report/run/passed.log',
  });
  const failed = ciReport.createCommandResult({
    def: { id: 'failed', command: 'node failed.mjs' },
    code: 1,
    durationMs: 34,
    stderr: 'Missing required evidence: route.json',
    artifactPath: 'scratch/check-ci-report/run/failed.log',
  });
  const report = ciReport.buildCiReport({
    startedAt: '2026-07-18T14:15:16.123Z',
    finishedAt: '2026-07-18T14:15:17.123Z',
    artifactRoot: 'scratch/check-ci-report/2026-07-18T14-15-16-123Z',
    results: [passed, failed],
  });

  assert.equal(report.schema, 'spaceface.ciReport.v2');
  assert.equal(report.failFast, false);
  assert.equal(report.executionMode, 'complete_matrix');
  assert.equal(report.commandCount, 2);
  assert.equal(report.failingCount, 1);
  assert.equal(report.classificationCounts.passed, 1);
  assert.equal(report.classificationCounts.missing_evidence, 1);
  assert.deepEqual(report.failing[0], {
    id: 'failed',
    command: 'node failed.mjs',
    code: 1,
    signal: null,
    timedOut: false,
    durationMs: 34,
    reason: 'Missing required evidence: route.json',
    artifactPath: 'scratch/check-ci-report/run/failed.log',
    classification: failed.classification,
  });
});
