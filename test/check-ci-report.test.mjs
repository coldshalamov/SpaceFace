import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as ciReport from '../scripts/check-ci-report.mjs';
import { ciMatrixSourceCommand } from '../scripts/lib/ciGateGraph.mjs';

const { classifyCommandResult } = ciReport;

const packageScripts = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).scripts || {};

/** The real thing CI partitions — not a fixture. These tests are worthless against a toy matrix. */
function realMatrix() {
  return ciReport.buildCommandMatrix(ciMatrixSourceCommand(packageScripts), packageScripts);
}

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

// ---------------------------------------------------------------------------
// Partition: shards and groups
// ---------------------------------------------------------------------------
// CI runs this matrix as four parallel jobs. If the partition is not exact, a command either runs
// twice (wasted minutes) or — the failure that matters — runs in NO job while the gate goes green.

test('shards partition the whole matrix exactly: union is the matrix, and no two shards overlap', () => {
  const matrix = realMatrix();
  assert.ok(matrix.length > 50, 'the real check matrix should be large; a tiny one means expansion broke');

  for (const total of [1, 2, 3, 4, 7]) {
    const shards = [];
    for (let index = 1; index <= total; index++) {
      shards.push(ciReport.selectShard(matrix, { index, total }));
    }

    const union = shards.flat();
    assert.equal(union.length, matrix.length, `shards of ${total} must cover every command exactly once`);
    assert.deepEqual(
      union.map((c) => c.id).sort(),
      matrix.map((c) => c.id).sort(),
      `shards of ${total} must reconstruct the matrix`,
    );

    for (let a = 0; a < total; a++) {
      for (let b = a + 1; b < total; b++) {
        const left = new Set(shards[a].map((c) => c.id));
        const overlap = shards[b].filter((c) => left.has(c.id)).map((c) => c.id);
        assert.deepEqual(overlap, [], `shard ${a + 1} and shard ${b + 1} of ${total} must be disjoint`);
      }
    }
  }
});

test('shard selection is stable across calls and preserves matrix order', () => {
  const matrix = realMatrix();
  const first = ciReport.selectShard(matrix, { index: 2, total: 3 }).map((c) => c.id);
  const second = ciReport.selectShard(matrix, { index: 2, total: 3 }).map((c) => c.id);
  assert.deepEqual(first, second);

  const positions = first.map((id) => matrix.findIndex((c) => c.id === id));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test('rejects a shard argument that cannot name a partition', () => {
  assert.equal(ciReport.parseShardArg(null), null);
  assert.deepEqual(ciReport.parseShardArg('2/4'), { index: 2, total: 4 });
  assert.throws(() => ciReport.parseShardArg('0/4'), /between 1 and 4/);
  assert.throws(() => ciReport.parseShardArg('5/4'), /between 1 and 4/);
  assert.throws(() => ciReport.parseShardArg('2'), /expected <index>\/<total>/);
  assert.throws(() => ciReport.parseShardArg('a/b'), /expected <index>\/<total>/);
});

test('groups partition the whole matrix exactly, and every command is classified', () => {
  const matrix = realMatrix();

  // Fails closed the moment someone adds a check the classifier cannot place. That is the point: an
  // unplaced command would run in none of the four parallel jobs while the gate still went green.
  assert.deepEqual(
    ciReport.findUnclassifiedCommands(matrix, packageScripts).map((c) => `${c.id}: ${c.command}`),
    [],
    'every check matrix command must belong to exactly one group',
  );

  const groups = ciReport.COMMAND_GROUPS.map(
    (group) => ciReport.selectGroup(matrix, group, packageScripts),
  );
  const union = groups.flat();
  assert.equal(union.length, matrix.length, 'the four groups must cover every command exactly once');
  assert.deepEqual(
    union.map((c) => c.id).sort(),
    matrix.map((c) => c.id).sort(),
    'the four groups must reconstruct the matrix',
  );

  for (let a = 0; a < groups.length; a++) {
    for (let b = a + 1; b < groups.length; b++) {
      const left = new Set(groups[a].map((c) => c.id));
      const overlap = groups[b].filter((c) => left.has(c.id)).map((c) => c.id);
      assert.deepEqual(
        overlap,
        [],
        `${ciReport.COMMAND_GROUPS[a]} and ${ciReport.COMMAND_GROUPS[b]} must be disjoint`,
      );
    }
  }

  // Every group must be non-empty, or its CI job is a green box that proves nothing. Deliberately no
  // hardcoded counts — those rot on the first added check.
  for (const [index, members] of groups.entries()) {
    assert.ok(members.length > 0, `group ${ciReport.COMMAND_GROUPS[index]} must not be empty`);
  }
});

test('an unrecognized command shape fails closed instead of defaulting into static', () => {
  const rogue = { id: 'rogue', command: 'npx some-thing --do-it' };
  assert.equal(ciReport.classifyCommandGroup(rogue, {}), null);
  assert.deepEqual(
    ciReport.findUnclassifiedCommands([rogue], {}).map((c) => c.id),
    ['rogue'],
  );
  assert.match(ciReport.formatGroupTable([rogue], {}), /unclassified — FAIL/);
});

test('classifies by what a command actually runs, not by what its name suggests', () => {
  const scripts = {
    'check:looks-live': 'node scripts/probe-flight-visual.mjs --no-write',
    'check:live-shadow': 'node scripts/check-sg06-live-shadow.mjs',
  };
  // "live" in the name proves nothing; the leaf script is what launches a browser.
  assert.equal(
    ciReport.classifyCommandGroup({ id: 'check-looks-live', command: 'npm run check:looks-live' }, scripts),
    'browser',
  );
  assert.equal(
    ciReport.classifyCommandGroup({ id: 'check-live-shadow', command: 'npm run check:live-shadow' }, scripts),
    'static',
  );
  // A brand-new browser check nobody has added to the leaf list is still caught by its command text.
  assert.equal(
    ciReport.classifyCommandGroup(
      { id: 'check-ui-grammar-matrix-headed', command: 'node scripts/check-ui-grammar-matrix.mjs --headed' },
      {},
    ),
    'browser',
  );
});

test('the browser group holds the whole Playwright/Chromium surface and resolves to real leaves', () => {
  const matrix = realMatrix();
  const browser = ciReport.selectGroup(matrix, 'browser', packageScripts);

  // This group is the only CI job that installs Chromium and the only one that needs the browser
  // cache, so a member that leaks into another group makes that job fail for a missing browser.
  for (const def of browser) {
    const leaves = ciReport.resolveLeafCommands(def.command, packageScripts).join(' ');
    assert.match(leaves, /\.(?:m|c)?js/, `${def.id} should resolve to a runnable leaf script, got: ${leaves}`);
  }
  assert.ok(browser.length >= 10, 'the browser group should hold the whole Playwright/Chromium surface');
});

test('--list-groups output is stable and orders groups canonically', () => {
  const matrix = realMatrix();
  const first = ciReport.formatGroupTable(matrix, packageScripts);
  const second = ciReport.formatGroupTable(matrix, packageScripts);
  assert.equal(first, second, 'the group table is committed evidence; identical input must give identical bytes');

  const headings = [...first.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(headings, [...ciReport.COMMAND_GROUPS]);
  assert.match(first, /\| \(unclassified\) \| 0 \|/, 'a clean matrix reports zero unclassified commands');
});

test('a named group and shard are recorded in the report so a failure names its job', () => {
  const result = ciReport.createCommandResult({
    def: { id: 'passed', command: 'node passed.mjs' },
    code: 0,
    durationMs: 5,
  });
  const report = ciReport.buildCiReport({
    startedAt: '2026-09-05T00:00:00.000Z',
    finishedAt: '2026-09-05T00:01:00.000Z',
    group: 'browser',
    shard: { index: 2, total: 3 },
    matrixCommandCount: 280,
    results: [result],
  });

  assert.equal(report.schema, 'spaceface.ciReport.v2');
  assert.equal(report.group, 'browser');
  assert.deepEqual(report.shard, { index: 2, total: 3 });
  assert.equal(report.matrixCommandCount, 280);
  assert.equal(report.commandCount, 1);

  const markdown = ciReport.formatCiReportMarkdown(report);
  assert.match(markdown, /- Group: `browser`/);
  assert.match(markdown, /- Shard: `2\/3`/);
  assert.match(markdown, /Selected: \*\*1\*\* of \*\*280\*\*/);

  // The whole-matrix run keeps its old shape: no group, no shard, nothing extra in the header.
  const whole = ciReport.buildCiReport({ results: [result] });
  assert.equal(whole.group, null);
  assert.equal(whole.shard, null);
  assert.doesNotMatch(ciReport.formatCiReportMarkdown(whole), /- (?:Group|Shard):/);
});

test('rejects an unknown group name rather than silently running nothing', () => {
  assert.throws(
    () => ciReport.selectGroup(realMatrix(), 'graphics', packageScripts),
    /unknown --group "graphics"/,
  );
});
