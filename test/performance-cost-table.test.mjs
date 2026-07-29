import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPerformanceCostTable,
  buildScenarioCostRows,
  compareCounterWindowDeltas,
  PERFORMANCE_COST_TABLE_LIMITATIONS,
  PERFORMANCE_COST_TABLE_SCHEMA,
  PERFORMANCE_COST_TABLE_TELEMETRY_COVERAGE,
  projectScenarioResultForCostTable,
  subtractCounterSnapshots,
  TIER1_COST_COUNT_FIELDS,
} from '../scripts/lib/performanceCostTable.mjs';

function stat(samples = 60, avg = 2) {
  return {
    avg,
    p50: avg - 0.5,
    p95: avg + 1,
    p99: avg + 2,
    p999: avg + 3,
    max: avg + 4,
    hitchesOver2xMedian: 1,
    samples,
    retainedSampleCapacity: 180,
  };
}

function counterSnapshot(offset = 0) {
  return {
    totals: Object.fromEntries(
      TIER1_COST_COUNT_FIELDS.map((field, index) => [field, offset + index]),
    ),
  };
}

function validGpuReport(queryCount = 60) {
  return {
    status: 'ok',
    captureValid: true,
    issuedQueries: queryCount,
    completedQueries: queryCount,
    pendingQueries: 0,
    droppedQueries: 0,
    rejectedQueries: 0,
    queryCounts: {
      issued: queryCount,
      completed: queryCount,
      pending: 0,
      dropped: 0,
      rejected: 0,
    },
    passes: {
      bloomScene: {
        avg: 5,
        completedAvg: 5,
        max: 7,
        last: 4,
        samples: queryCount,
        retainedSamples: queryCount,
        issuedQueries: queryCount,
        completedQueries: queryCount,
        droppedQueries: 0,
        rejectedQueries: 0,
      },
    },
  };
}

function validCpuReport(frameCount = 60) {
  return {
    frameCallback: stat(frameCount, 4),
    frameUntracked: stat(frameCount, 0.5),
    phases: { sim: stat(frameCount, 2), render: stat(frameCount, 3) },
    systems: { physics: stat(frameCount, 0.7) },
    renderWork: { bloomScene: stat(frameCount, 2.5) },
  };
}

function validMeasuredControls({
  scenarioId = 'flight_steady',
  gpuApplicable = true,
} = {}) {
  const ids = [
    'native-timing-clock',
    'tier1-disabled',
    'gl-uninstrumented',
    'system-timing-enabled',
    'render-work-enabled',
    'quiescence-freeze-pass',
    'quiescence-resume-pass',
    'mesh-reconcile-kick-pass',
    'presentation-clock-alignment-pass',
    'post-quiescence-arm-pass',
    'measurement-boundary-drain-pass',
    'comet-precondition-pass',
    'measurement-boundary-drain-fixed',
    'timing-sample-count-exact',
    'timing-samples-finite',
    'one-sim-step-per-frame',
    'measurement-pump-delta-exact',
    'measurement-tick-delta-exact',
    'frame-callback-samples-exact',
    'system-attribution-nonempty',
    'render-work-attribution-nonempty',
    'measurement-start-admission-quiet',
    'scenario-completion-receipt-pass',
    'pump-callback-errors-none',
    'page-errors-none',
    'console-errors-none',
    ...(gpuApplicable
      ? [
        'gpu-timers-enabled',
        'gpu-submissions-paused-at-close',
        'gpu-drain-complete',
        'gpu-capture-valid',
        'gpu-completed-query-positive',
        'gpu-query-loss-zero',
      ]
      : ['gpu-explicitly-not-applicable']),
    ...(scenarioId === 'context_recover_steady'
      ? ['context-route-staging-semantic-pass', 'context-measurement-program-count-parity']
      : []),
  ];
  return ids.map((id) => ({ id, pass: true }));
}

test('counter windows subtract exactly and comparisons fail closed on missing or changed fields', () => {
  const start = counterSnapshot(10);
  const end = {
    totals: Object.fromEntries(
      TIER1_COST_COUNT_FIELDS.map((field, index) => [field, start.totals[field] + index + 1]),
    ),
  };
  const delta = subtractCounterSnapshots(start, end);
  assert.equal(delta.shaderLinks, 1);
  assert.equal(delta.textureBinds, TIER1_COST_COUNT_FIELDS.length);
  assert.deepEqual(compareCounterWindowDeltas(delta, { ...delta }), []);
  assert.deepEqual(compareCounterWindowDeltas(delta, { ...delta, drawCalls: delta.drawCalls + 1 }), [{
    field: 'drawCalls',
    left: delta.drawCalls,
    right: delta.drawCalls + 1,
  }]);
  assert.throws(
    () => subtractCounterSnapshots(start, { totals: { ...end.totals, shaderLinks: 0 } }),
    /cannot form.*window delta/,
  );
});

test('scenario rows merge exact CPU/GPU labels and use the uncapped completed-query average', () => {
  const rows = buildScenarioCostRows({
    scenarioId: 'flight_steady',
    measurementWindow: { startFrame: 60, frameCount: 180 },
    cpuReport: {
      frame: stat(),
      frameCallback: stat(180, 4),
      frameUntracked: stat(180, 0.5),
      phases: { sim: stat(180, 2), render: stat(180, 3) },
      systems: { physics: stat(180, 0.7) },
      renderWork: { bloomScene: stat(180, 2.5) },
      counters: { spatialHash: { queries: 300, candidates: 900 } },
      entities: { ship: 12, total: 20 },
    },
    gpuReport: {
      status: 'ok',
      captureValid: true,
      completedQueries: 180,
      passes: {
        bloomScene: {
          avg: 7,
          completedAvg: 5,
          max: 9,
          last: 6,
          samples: 64,
          retainedSamples: 64,
          issuedQueries: 180,
          completedQueries: 180,
          droppedQueries: 0,
          rejectedQueries: 0,
        },
      },
    },
    tier1Counts: Object.fromEntries(TIER1_COST_COUNT_FIELDS.map((field) => [field, 1])),
  });
  assert.equal(rows.some((row) => row.subsystem === 'frame'), false, 'synthetic frame interval is not CPU cost');
  const bloom = rows.find((row) => row.subsystem === 'bloomScene');
  assert.equal(bloom.cpu.samples, 180);
  assert.equal(bloom.gpu.avgMs, 5);
  assert.equal(bloom.gpu.retainedAvgMs, 7);
  assert.equal(bloom.gpu.completedQueries, 180);
  assert.equal(bloom.gpu.retainedSamples, 64);
  assert.ok(rows.some((row) => row.subsystem === 'physics'));
  assert.ok(rows.some((row) => row.subsystem === 'tier1.draw-state'));
  assert.ok(rows.some((row) => row.subsystem === 'runtime.spatialHash'));
});

test('invalid or dead GPU evidence always publishes null time', () => {
  const [row] = buildScenarioCostRows({
    scenarioId: 'flight_steady',
    measurementWindow: { startFrame: 0, frameCount: 60 },
    cpuReport: {},
    gpuReport: {
      status: 'zero-result',
      captureValid: false,
      completedQueries: 0,
      passes: {
        drawPreparedFrame: {
          avg: 0,
          completedAvg: null,
          max: 0,
          last: 0,
          samples: 0,
          issuedQueries: 1,
          completedQueries: 0,
          droppedQueries: 1,
          rejectedQueries: 0,
        },
      },
    },
  });
  assert.equal(row.gpu.valid, false);
  assert.equal(row.gpu.avgMs, null);
  assert.equal(row.gpu.maxMs, null);
});

test('invalid completed GPU passes publish null rather than plausible zero timing', () => {
  const [row] = buildScenarioCostRows({
    scenarioId: 'flight_steady',
    measurementWindow: { startFrame: 0, frameCount: 60 },
    cpuReport: {},
    gpuReport: {
      status: 'invalid',
      captureValid: true,
      completedQueries: 1,
      passes: {
        drawPreparedFrame: {
          avg: 0,
          completedAvg: 0,
          max: 0,
          last: 0,
          samples: 1,
          issuedQueries: 2,
          completedQueries: 1,
          droppedQueries: 1,
          rejectedQueries: 0,
        },
      },
    },
  });

  assert.equal(row.gpu.valid, false);
  assert.deepEqual(
    {
      avgMs: row.gpu.avgMs,
      retainedAvgMs: row.gpu.retainedAvgMs,
      maxMs: row.gpu.maxMs,
      lastMs: row.gpu.lastMs,
    },
    {
      avgMs: null,
      retainedAvgMs: null,
      maxMs: null,
      lastMs: null,
    },
  );
});

test('table retains blocked scenarios as measurement-null rows and cannot call a partial matrix complete', () => {
  const table = buildPerformanceCostTable({
    manifest: { id: 'perf-scenarios-core', digest: 'a'.repeat(64) },
    candidate: { digest: 'b'.repeat(64) },
    generatedAt: '2026-07-29T00:00:00.000Z',
    scenarios: [
      {
        scenarioId: 'flight_steady',
        status: 'measured',
        measurementWindow: { startFrame: 60, frameCount: 60 },
        cpuReport: validCpuReport(60),
        gpuReport: validGpuReport(60),
        controls: validMeasuredControls(),
        controlFailures: [],
        tier1Counts: Object.fromEntries(TIER1_COST_COUNT_FIELDS.map((field) => [field, 0])),
      },
      {
        scenarioId: 'combat_vfx_burst',
        status: 'not-runnable',
        blocker: { code: 'injected-state', detail: 'requires injected state' },
        measurementWindow: { startFrame: 180, frameCount: 180 },
      },
    ],
  });
  assert.equal(table.schema, PERFORMANCE_COST_TABLE_SCHEMA);
  assert.equal(table.status, 'partial');
  assert.deepEqual(table.counts, {
    scenarios: 2,
    measured: 1,
    blocked: 1,
    invalid: 0,
    costRows: 11,
  });
  assert.equal(table.rows[1].measurements, null);
});

test('counts-only rows retain exact counters while measured rows require explicit timing evidence', () => {
  const base = {
    manifest: { id: 'perf-scenarios-core', digest: 'a'.repeat(64) },
    generatedAt: '2026-07-29T00:00:00.000Z',
  };
  const tier1Counts = Object.fromEntries(
    TIER1_COST_COUNT_FIELDS.map((field) => [field, 1]),
  );
  const countsOnly = buildPerformanceCostTable({
    ...base,
    scenarios: [{
      scenarioId: 'flight_steady',
      status: 'counts-only',
      measurementWindow: { startFrame: 90, frameCount: 180 },
      cpuReport: null,
      gpuReport: null,
      tier1Counts,
    }],
  });

  assert.equal(countsOnly.status, 'partial');
  assert.equal(countsOnly.rows[0].status, 'counts-only');
  assert.equal(countsOnly.rows[0].measurements.costRows.length, 5);
  assert.ok(countsOnly.rows[0].measurements.costRows.every(
    (row) => row.cpu === null && row.gpu === null,
  ));
  assert.deepEqual(countsOnly.counts, {
    scenarios: 1,
    measured: 0,
    blocked: 0,
    invalid: 0,
    costRows: 5,
  });

  const timed = buildPerformanceCostTable({
    ...base,
    scenarios: [{
      scenarioId: 'flight_steady',
      status: 'measured',
      measurementWindow: { startFrame: 90, frameCount: 180 },
      cpuReport: validCpuReport(180),
      gpuReport: null,
      tier1Counts,
    }],
  });
  assert.equal(timed.status, 'failed');
  assert.equal(timed.rows[0].status, 'invalid');
  assert.equal(timed.rows[0].measurements, null);
  assert.match(timed.rows[0].blocker.detail.join('\n'), /gpuReport must be valid/);

  const validTimed = buildPerformanceCostTable({
    ...base,
    scenarios: [{
      scenarioId: 'flight_steady',
      status: 'measured',
      measurementWindow: { startFrame: 90, frameCount: 180 },
      cpuReport: validCpuReport(180),
      gpuReport: validGpuReport(180),
      controls: validMeasuredControls(),
      controlFailures: [],
      tier1Counts,
    }],
  });
  assert.equal(validTimed.status, 'complete');
  assert.equal(validTimed.rows[0].status, 'measured');
  assert.ok(validTimed.rows[0].measurements.costRows.length > 0);
});

test('malformed measured evidence is demoted to invalid instead of completing an empty table', () => {
  const base = {
    manifest: { id: 'perf-scenarios-core', digest: 'a'.repeat(64) },
    generatedAt: '2026-07-29T00:00:00.000Z',
  };
  const completeCounts = Object.fromEntries(
    TIER1_COST_COUNT_FIELDS.map((field) => [field, 0]),
  );
  const cases = [
    {
      name: 'all evidence missing',
      entry: {
        scenarioId: 'flight_steady',
        status: 'measured',
        measurementWindow: { startFrame: 0, frameCount: 60 },
        cpuReport: null,
        gpuReport: null,
        tier1Counts: null,
      },
      expected: /tier1Counts|cpuReport|gpuReport/,
    },
    {
      name: 'one Tier-1 count missing',
      entry: {
        scenarioId: 'flight_steady',
        status: 'counts-only',
        measurementWindow: { startFrame: 0, frameCount: 60 },
        tier1Counts: Object.fromEntries(
          Object.entries(completeCounts).filter(([field]) => field !== 'drawCalls'),
        ),
      },
      expected: /tier1Counts\.drawCalls/,
    },
    {
      name: 'sampled CPU distribution incomplete',
      entry: {
        scenarioId: 'flight_steady',
        status: 'measured',
        measurementWindow: { startFrame: 0, frameCount: 60 },
        cpuReport: {
          ...validCpuReport(60),
          frameCallback: { ...stat(60, 4), p999: null },
        },
        gpuReport: validGpuReport(60),
        tier1Counts: completeCounts,
      },
      expected: /frameCallback\.p999/,
    },
    {
      name: 'subsystem attribution missing',
      entry: {
        scenarioId: 'flight_steady',
        status: 'measured',
        measurementWindow: { startFrame: 0, frameCount: 60 },
        cpuReport: { frameCallback: stat(60, 4) },
        gpuReport: validGpuReport(60),
        tier1Counts: completeCounts,
      },
      expected: /cpuReport\.systems|cpuReport\.renderWork/,
    },
    {
      name: 'GPU timer dead',
      entry: {
        scenarioId: 'flight_steady',
        status: 'measured',
        measurementWindow: { startFrame: 0, frameCount: 60 },
        cpuReport: validCpuReport(60),
        gpuReport: {
          status: 'zero-result',
          captureValid: false,
          issuedQueries: 1,
          completedQueries: 0,
          pendingQueries: 0,
          droppedQueries: 1,
          rejectedQueries: 0,
          passes: {},
        },
        tier1Counts: completeCounts,
      },
      expected: /captureValid|completedQueries|droppedQueries/,
    },
    {
      name: 'GPU status invalid despite plausible counts',
      entry: {
        scenarioId: 'flight_steady',
        status: 'measured',
        measurementWindow: { startFrame: 0, frameCount: 60 },
        cpuReport: validCpuReport(60),
        gpuReport: { ...validGpuReport(60), status: 'invalid' },
        tier1Counts: completeCounts,
      },
      expected: /gpuReport\.status must be ok/,
    },
    {
      name: 'GPU coverage contradicts report',
      entry: {
        scenarioId: 'flight_steady',
        status: 'measured',
        measurementWindow: { startFrame: 0, frameCount: 60 },
        cpuReport: validCpuReport(60),
        gpuReport: validGpuReport(60),
        telemetryCoverage: {
          gpuPass: {
            applicable: true,
            status: 'invalid',
            completedQueries: 60,
          },
        },
        tier1Counts: completeCounts,
      },
      expected: /telemetry coverage must be captured/,
    },
    {
      name: 'GPU pass totals contradict top-level counts',
      entry: {
        scenarioId: 'flight_steady',
        status: 'measured',
        measurementWindow: { startFrame: 0, frameCount: 60 },
        cpuReport: validCpuReport(60),
        gpuReport: {
          ...validGpuReport(60),
          issuedQueries: 1,
          completedQueries: 1,
          queryCounts: {
            issued: 1,
            completed: 1,
            pending: 0,
            dropped: 0,
            rejected: 0,
          },
        },
        tier1Counts: completeCounts,
      },
      expected: /GPU pass issued query total|GPU pass completed query total/,
    },
    {
      name: 'malformed control failure receipt',
      entry: {
        scenarioId: 'flight_steady',
        status: 'measured',
        measurementWindow: { startFrame: 0, frameCount: 60 },
        cpuReport: validCpuReport(60),
        gpuReport: validGpuReport(60),
        tier1Counts: completeCounts,
        controlFailures: 'GPU query dropped',
      },
      expected: /controlFailures is non-empty/,
    },
  ];

  for (const { name, entry, expected } of cases) {
    const table = buildPerformanceCostTable({ ...base, scenarios: [entry] });
    assert.equal(table.status, 'failed', name);
    assert.deepEqual(table.counts, {
      scenarios: 1,
      measured: 0,
      blocked: 0,
      invalid: 1,
      costRows: 0,
    }, name);
    assert.equal(table.rows[0].status, 'invalid', name);
    assert.equal(table.rows[0].measurements, null, name);
    assert.match(table.rows[0].blocker.detail.join('\n'), expected, name);
  }
});

test('explicit GPU not-applicable evidence is admissible without inventing zero milliseconds', () => {
  const table = buildPerformanceCostTable({
    manifest: { id: 'perf-scenarios-core', digest: 'a'.repeat(64) },
    generatedAt: '2026-07-29T00:00:00.000Z',
    scenarios: [{
      scenarioId: 'docked_market_ui',
      status: 'measured',
      measurementWindow: { startFrame: 0, frameCount: 60 },
      cpuReport: validCpuReport(60),
      gpuReport: null,
      telemetryCoverage: {
        gpuPass: {
          applicable: false,
          status: 'not-applicable',
        },
      },
      controls: validMeasuredControls({
        scenarioId: 'docked_market_ui',
        gpuApplicable: false,
      }),
      controlFailures: [],
      tier1Counts: Object.fromEntries(TIER1_COST_COUNT_FIELDS.map((field) => [field, 0])),
    }],
  });
  assert.equal(table.status, 'complete');
  assert.equal(table.rows[0].status, 'measured');
  assert.ok(table.rows[0].measurements.costRows.every((row) => row.gpu === null));
});

test('a rendering route cannot spoof GPU not-applicable coverage', () => {
  const table = buildPerformanceCostTable({
    manifest: { id: 'perf-scenarios-core', digest: 'a'.repeat(64) },
    generatedAt: '2026-07-29T00:00:00.000Z',
    scenarios: [{
      scenarioId: 'flight_steady',
      status: 'measured',
      measurementWindow: { startFrame: 0, frameCount: 60 },
      cpuReport: validCpuReport(60),
      gpuReport: null,
      telemetryCoverage: {
        gpuPass: {
          applicable: false,
          status: 'not-applicable',
        },
      },
      controls: [{
        id: 'gpu-explicitly-not-applicable',
        pass: true,
      }],
      tier1Counts: Object.fromEntries(TIER1_COST_COUNT_FIELDS.map((field) => [field, 0])),
    }],
  });
  assert.equal(table.status, 'failed');
  assert.equal(table.rows[0].status, 'invalid');
  assert.equal(table.rows[0].measurements, null);
  assert.match(table.rows[0].blocker.detail.join('\n'), /docked_market_ui route authority/);
});

test('projected measured results fail closed before crossing the cost-table boundary', () => {
  const base = {
    scenarioId: 'flight_steady',
    status: 'deterministic',
    ok: true,
    deterministic: true,
    controlFailures: [],
    measurementWindow: { startFrame: 0, frameCount: 60 },
    tier1CountDeltas: Object.fromEntries(TIER1_COST_COUNT_FIELDS.map((field) => [field, 0])),
    evidencePath: 'flight.json',
  };
  const missing = projectScenarioResultForCostTable({
    ...base,
    timing: {
      status: 'measured',
      controls: [],
      controlFailures: [],
      cpuReport: null,
      gpuReport: null,
    },
  });
  assert.equal(missing.status, 'invalid');
  assert.equal(missing.blocker.code, 'cost-evidence-invalid');
  assert.equal(missing.tier1Counts, null);

  const valid = projectScenarioResultForCostTable({
    ...base,
    timing: {
      status: 'measured',
      controls: validMeasuredControls(),
      controlFailures: [],
      cpuReport: validCpuReport(60),
      gpuReport: validGpuReport(60),
    },
  });
  assert.equal(valid.status, 'measured');
  assert.equal(valid.tier1Counts.drawCalls, 0);
});

test('every required measured control receipt is fail-closed', () => {
  const completeCounts = Object.fromEntries(
    TIER1_COST_COUNT_FIELDS.map((field) => [field, 0]),
  );
  const runCase = (scenarioId, controls) => buildPerformanceCostTable({
    manifest: { id: 'perf-scenarios-core', digest: 'a'.repeat(64) },
    generatedAt: '2026-07-29T00:00:00.000Z',
    scenarios: [{
      scenarioId,
      status: 'measured',
      measurementWindow: { startFrame: 0, frameCount: 60 },
      cpuReport: validCpuReport(60),
      gpuReport: validGpuReport(60),
      controls,
      controlFailures: [],
      tier1Counts: completeCounts,
    }],
  });

  const flightControls = validMeasuredControls();
  assert.equal(runCase('flight_steady', flightControls).status, 'complete');
  for (const removed of flightControls) {
    const table = runCase(
      'flight_steady',
      flightControls.filter((control) => control.id !== removed.id),
    );
    assert.equal(table.status, 'failed', removed.id);
    assert.match(table.rows[0].blocker.detail.join('\n'), new RegExp(removed.id), removed.id);
  }

  const contextControls = validMeasuredControls({ scenarioId: 'context_recover_steady' });
  for (const id of ['context-route-staging-semantic-pass', 'context-measurement-program-count-parity']) {
    const table = runCase(
      'context_recover_steady',
      contextControls.filter((control) => control.id !== id),
    );
    assert.equal(table.status, 'failed', id);
    assert.match(table.rows[0].blocker.detail.join('\n'), new RegExp(id), id);
  }
});

test('failed Tier-1 evidence cannot leak a usable counts-only cost row', () => {
  const tier1Counts = Object.fromEntries(
    TIER1_COST_COUNT_FIELDS.map((field) => [field, 1]),
  );
  const projected = projectScenarioResultForCostTable({
    scenarioId: 'flight_steady',
    status: 'failed',
    ok: false,
    deterministic: false,
    controlFailures: ['run 2 drawCalls changed'],
    measurementWindow: { startFrame: 90, frameCount: 180 },
    tier1CountDeltas: tier1Counts,
    evidencePath: 'failed-flight.json',
    timing: null,
  });
  assert.equal(projected.status, 'invalid');
  assert.equal(projected.blocker.code, 'tier1-invalid');
  assert.equal(projected.tier1Counts, null);

  const table = buildPerformanceCostTable({
    manifest: { id: 'perf-scenarios-core', digest: 'a'.repeat(64) },
    generatedAt: '2026-07-29T00:00:00.000Z',
    scenarios: [projected],
  });
  assert.equal(table.status, 'failed');
  assert.deepEqual(table.counts, {
    scenarios: 1,
    measured: 0,
    blocked: 0,
    invalid: 1,
    costRows: 0,
  });
  assert.equal(table.rows[0].status, 'invalid');
  assert.equal(table.rows[0].measurements, null);
});

test('failed Tier-2 evidence invalidates otherwise deterministic Tier-1 counts', () => {
  const projected = projectScenarioResultForCostTable({
    scenarioId: 'flight_steady',
    status: 'failed',
    ok: false,
    deterministic: true,
    controlFailures: ['GPU query dropped'],
    measurementWindow: { startFrame: 90, frameCount: 180 },
    tier1CountDeltas: Object.fromEntries(
      TIER1_COST_COUNT_FIELDS.map((field) => [field, 1]),
    ),
    timing: {
      status: 'invalid',
      controlFailures: ['GPU query dropped'],
      cpuReport: { frameCallback: stat() },
    },
  });
  assert.equal(projected.status, 'invalid');
  assert.equal(projected.blocker.code, 'tier2-invalid');
  assert.equal(projected.tier1Counts, null);
  assert.equal(projected.cpuReport, null);
});

test('table publishes an immutable, machine-readable telemetry coverage and limitations contract', () => {
  const table = buildPerformanceCostTable({
    manifest: { id: 'perf-scenarios-core', digest: 'a'.repeat(64) },
    generatedAt: '2026-07-29T00:00:00.000Z',
    scenarios: [{
      scenarioId: 'combat_vfx_burst',
      status: 'not-runnable',
      blocker: { code: 'injected-state' },
      measurementWindow: { startFrame: 90, frameCount: 180 },
      cpuReport: { frameCallback: stat(180, 4) },
      gpuReport: { captureValid: true, completedQueries: 1 },
      tier1Counts: Object.fromEntries(TIER1_COST_COUNT_FIELDS.map((field) => [field, 1])),
    }],
  });

  assert.equal(table.telemetryCoverage, PERFORMANCE_COST_TABLE_TELEMETRY_COVERAGE);
  assert.equal(table.limitations, PERFORMANCE_COST_TABLE_LIMITATIONS);
  assert.equal(
    table.telemetryCoverage.cpu.backgroundJob.timingConsumption,
    'not-generally-consumed',
  );
  assert.equal(table.telemetryCoverage.gpu.labelGranularity, 'coarse');
  assert.deepEqual(
    table.telemetryCoverage.gpu.labels.bloomScene.includes,
    ['scene', 'shadow', 'transmission'],
  );
  assert.equal(
    table.telemetryCoverage.gpu.labels.bloomDownsample.aggregates,
    'all-downsample-levels',
  );
  assert.equal(table.telemetryCoverage.gpu.labels.bloomUpsample.status, 'retired');
  assert.deepEqual(
    table.telemetryCoverage.gpu.labels.drawPreparedFrame.covers,
    ['straight', 'renderGraph'],
  );
  assert.deepEqual(table.telemetryCoverage.gpu.unavailableOrInvalidTiming, {
    valueMs: null,
    zeroAllowed: false,
  });
  assert.equal(table.telemetryCoverage.scenarioRows.notRunnable.measurements, null);
  assert.equal(table.telemetryCoverage.scenarioRows.invalid.measurements, null);
  assert.deepEqual(table.limitations, [
    'background-job-timing-not-generally-consumed',
    'gpu-labels-are-coarse-pass-groups',
    'gpu-unavailable-or-invalid-timing-is-null-never-zero',
    'not-runnable-rows-have-no-measurements',
    'invalid-rows-have-no-measurements',
  ]);
  assert.equal(table.rows[0].measurements, null, 'blocked input evidence must be discarded');

  assert.equal(Object.isFrozen(table.telemetryCoverage), true);
  assert.equal(Object.isFrozen(table.telemetryCoverage.gpu.labels), true);
  assert.equal(Object.isFrozen(table.telemetryCoverage.gpu.labels.bloomScene.includes), true);
  assert.equal(Object.isFrozen(table.limitations), true);
  assert.equal(Object.getOwnPropertyDescriptor(table, 'telemetryCoverage').writable, false);
  assert.equal(Object.getOwnPropertyDescriptor(table, 'limitations').writable, false);
  assert.throws(() => {
    table.telemetryCoverage.gpu.labels.bloomUpsample.status = 'active';
  }, TypeError);
  assert.throws(() => {
    table.telemetryCoverage = {};
  }, TypeError);
  assert.throws(() => {
    table.limitations.push('invented');
  }, TypeError);
});
