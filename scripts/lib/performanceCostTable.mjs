export const PERFORMANCE_COST_TABLE_SCHEMA = 'spaceface.performanceCostTable.v1';

export const PERFORMANCE_COST_TABLE_TELEMETRY_COVERAGE = deepFreeze({
  cpu: {
    backgroundJob: {
      timingConsumption: 'not-generally-consumed',
    },
  },
  gpu: {
    unavailableOrInvalidTiming: {
      valueMs: null,
      zeroAllowed: false,
    },
    labelGranularity: 'coarse',
    labels: {
      bloomScene: {
        includes: ['scene', 'shadow', 'transmission'],
      },
      bloomDownsample: {
        aggregates: 'all-downsample-levels',
      },
      bloomUpsample: {
        status: 'retired',
      },
      drawPreparedFrame: {
        covers: ['straight', 'renderGraph'],
      },
    },
  },
  scenarioRows: {
    notRunnable: {
      measurements: null,
    },
    invalid: {
      measurements: null,
    },
  },
});

export const PERFORMANCE_COST_TABLE_LIMITATIONS = deepFreeze([
  'background-job-timing-not-generally-consumed',
  'gpu-labels-are-coarse-pass-groups',
  'gpu-unavailable-or-invalid-timing-is-null-never-zero',
  'not-runnable-rows-have-no-measurements',
  'invalid-rows-have-no-measurements',
]);

export const TIER1_COST_COUNT_FIELDS = Object.freeze([
  'shaderLinks',
  'shaderCompiles',
  'renderTargetAllocations',
  'renderTargetResizes',
  'textureUploads',
  'textureSubUploads',
  'mipmapGenerations',
  'bufferFullUploads',
  'bufferPartialUploads',
  'bufferUploadBytes',
  'drawCalls',
  'drawInstancedCalls',
  'programSwitches',
  'textureBinds',
]);

const CPU_PHASES = Object.freeze([
  'sim',
  'simFrame',
  'presentation',
  'render',
  'vfx',
  'feel',
  'ui',
  'admission',
]);

const TIER1_COUNT_GROUPS = Object.freeze({
  'tier1.shader': Object.freeze(['shaderLinks', 'shaderCompiles']),
  'tier1.render-target': Object.freeze(['renderTargetAllocations', 'renderTargetResizes']),
  'tier1.texture': Object.freeze(['textureUploads', 'textureSubUploads', 'mipmapGenerations']),
  'tier1.buffer': Object.freeze(['bufferFullUploads', 'bufferPartialUploads', 'bufferUploadBytes']),
  'tier1.draw-state': Object.freeze(['drawCalls', 'drawInstancedCalls', 'programSwitches', 'textureBinds']),
});

const CPU_DISTRIBUTION_FIELDS = Object.freeze([
  'avg',
  'p50',
  'p95',
  'p99',
  'p999',
  'max',
]);

const REQUIRED_MEASURED_CONTROL_IDS = Object.freeze([
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
]);

const REQUIRED_GPU_CONTROL_IDS = Object.freeze([
  'gpu-timers-enabled',
  'gpu-submissions-paused-at-close',
  'gpu-drain-complete',
  'gpu-capture-valid',
  'gpu-completed-query-positive',
  'gpu-query-loss-zero',
]);

const REQUIRED_CONTEXT_CONTROL_IDS = Object.freeze([
  'context-route-staging-semantic-pass',
  'context-measurement-program-count-parity',
]);

export function subtractCounterSnapshots(startSnapshot, endSnapshot, fields = TIER1_COST_COUNT_FIELDS) {
  const start = startSnapshot?.totals;
  const end = endSnapshot?.totals;
  if (!start || !end) throw new TypeError('start/end Tier-1 counter snapshots are required');
  const deltas = {};
  for (const field of fields) {
    const before = start[field];
    const after = end[field];
    if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(after) || after < before) {
      throw new Error(`counter ${field} cannot form a finite nonnegative window delta (${before} -> ${after})`);
    }
    deltas[field] = after - before;
  }
  return deltas;
}

export function compareCounterWindowDeltas(left, right, fields = TIER1_COST_COUNT_FIELDS) {
  const differences = [];
  for (const field of fields) {
    const a = left?.[field];
    const b = right?.[field];
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a !== b) {
      differences.push({ field, left: Number.isSafeInteger(a) ? a : null, right: Number.isSafeInteger(b) ? b : null });
    }
  }
  return differences;
}

/**
 * Project one harness result into cost-table evidence. A failed Tier-1 comparison is not a
 * counts-only capture: even a complete first run is inadmissible once its paired control fails.
 * Timing failures likewise invalidate the combined row instead of leaking plausible partial cost.
 */
export function projectScenarioResultForCostTable(result) {
  if (!result || typeof result.scenarioId !== 'string' || !result.scenarioId) {
    throw new TypeError('scenario result with scenarioId is required');
  }
  const common = {
    scenarioId: result.scenarioId,
    measurementWindow: result.measurementWindow,
    tier1EvidencePath: result.evidencePath || null,
  };
  if (result.status === 'not-runnable') {
    return {
      ...common,
      status: 'not-runnable',
      blocker: {
        code: result.blockerCode || 'not-runnable',
        detail: result.blocker || 'scenario is not runnable',
      },
    };
  }

  const timingStatus = result.timing?.status ?? null;
  const timingExplicitlyInvalid = timingStatus === 'failed' || timingStatus === 'invalid';
  const tier1Valid = result.deterministic === true
    && ((result.status === 'deterministic' && result.ok === true)
      || (result.status === 'failed' && timingExplicitlyInvalid));
  const timingValid = (timingStatus == null || timingStatus === 'measured')
    && !hasControlFailures(result.controlFailures)
    && !hasControlFailures(result.timing?.controlFailures)
    && !hasFailingControls(result.timing?.controls);
  if (!tier1Valid || !timingValid) {
    const tier = tier1Valid ? 'tier2' : 'tier1';
    const detail = tier === 'tier2'
      ? (result.timing?.controlFailures || result.timing?.failure?.message || 'timing evidence is invalid')
      : (result.controlFailures || result.differences || 'deterministic Tier-1 evidence is invalid');
    return {
      ...common,
      status: 'invalid',
      blocker: { code: `${tier}-invalid`, detail },
      controls: result.timing?.controls || [],
      environment: result.timing?.environment || null,
      telemetryCoverage: result.timing?.telemetryCoverage || null,
      cpuReport: null,
      gpuReport: null,
      tier1Counts: null,
    };
  }

  const projected = {
    ...common,
    status: timingStatus === 'measured' ? 'measured' : 'counts-only',
    blocker: null,
    controls: result.timing?.controls || [],
    controlFailures: result.timing?.controlFailures || [],
    environment: result.timing?.environment || null,
    telemetryCoverage: result.timing?.telemetryCoverage || null,
    cpuReport: result.timing?.cpuReport || null,
    gpuReport: result.timing?.gpuReport || null,
    tier1Counts: result.tier1CountDeltas || null,
  };
  const evidenceFailures = validateScenarioMeasurementEvidence(projected);
  if (evidenceFailures.length > 0) {
    return {
      ...common,
      status: 'invalid',
      blocker: {
        code: 'cost-evidence-invalid',
        detail: evidenceFailures,
      },
      controls: projected.controls,
      controlFailures: projected.controlFailures,
      environment: projected.environment,
      telemetryCoverage: projected.telemetryCoverage,
      cpuReport: null,
      gpuReport: null,
      tier1Counts: null,
    };
  }
  return projected;
}

export function buildScenarioCostRows({
  scenarioId,
  measurementWindow,
  cpuReport,
  gpuReport,
  tier1Counts,
} = {}) {
  if (typeof scenarioId !== 'string' || !scenarioId) throw new TypeError('scenarioId is required');
  const rows = [];
  const renderRows = new Map();

  pushCpuRow(rows, {
    scenarioId,
    subsystem: 'frameCallback',
    source: 'frame',
    stat: cpuReport?.frameCallback,
    measurementWindow,
  });
  pushCpuRow(rows, {
    scenarioId,
    subsystem: 'frameUntracked',
    source: 'frame',
    stat: cpuReport?.frameUntracked,
    measurementWindow,
  });

  for (const phase of CPU_PHASES) {
    pushCpuRow(rows, {
      scenarioId,
      subsystem: phase,
      source: 'phase',
      stat: cpuReport?.phases?.[phase],
      measurementWindow,
    });
  }
  for (const [name, stat] of Object.entries(cpuReport?.systems || {})) {
    pushCpuRow(rows, {
      scenarioId,
      subsystem: name,
      source: 'system',
      stat,
      measurementWindow,
    });
  }
  for (const [name, stat] of Object.entries(cpuReport?.renderWork || {})) {
    const row = pushCpuRow(rows, {
      scenarioId,
      subsystem: name,
      source: 'render-work',
      stat,
      measurementWindow,
    });
    if (row) renderRows.set(name, row);
  }

  const gpuCaptureValid = gpuReport?.captureValid === true
    && Number(gpuReport?.completedQueries ?? gpuReport?.queryCounts?.completed) > 0;
  for (const [name, pass] of Object.entries(gpuReport?.passes || {})) {
    const issued = finiteCount(pass?.issuedQueries);
    const completed = finiteCount(pass?.completedQueries);
    const dropped = finiteCount(pass?.droppedQueries);
    const rejected = finiteCount(pass?.rejectedQueries);
    if (issued + completed + dropped + rejected === 0 && finiteCount(pass?.samples) === 0) continue;
    const passCaptureValid = gpuCaptureValid
      && completed > 0
      && dropped === 0
      && rejected === 0;
    const gpu = {
      applicable: true,
      valid: passCaptureValid,
      status: gpuReport?.status || 'unknown',
      avgMs: passCaptureValid
        ? finiteOrNull(pass?.completedAvg ?? pass?.avg)
        : null,
      retainedAvgMs: passCaptureValid ? finiteOrNull(pass?.avg) : null,
      maxMs: passCaptureValid ? finiteOrNull(pass?.max) : null,
      lastMs: passCaptureValid ? finiteOrNull(pass?.last) : null,
      retainedSamples: finiteCount(pass?.retainedSamples ?? pass?.samples),
      issuedQueries: issued,
      completedQueries: completed,
      droppedQueries: dropped,
      rejectedQueries: rejected,
    };
    const existing = renderRows.get(name);
    if (existing) {
      existing.gpu = gpu;
    } else {
      rows.push({
        scenarioId,
        subsystem: name,
        source: 'gpu-pass',
        measurementWindow: normalizeMeasurementWindow(measurementWindow),
        cpu: null,
        gpu,
        counts: {
          issuedQueries: issued,
          completedQueries: completed,
          droppedQueries: dropped,
          rejectedQueries: rejected,
        },
      });
    }
  }

  if (tier1Counts && typeof tier1Counts === 'object') {
    const invalidTier1Counts = validateTier1CountCoverage(tier1Counts);
    if (invalidTier1Counts.length > 0) {
      throw new Error(`invalid Tier-1 cost counts: ${invalidTier1Counts.join('; ')}`);
    }
    for (const [subsystem, fields] of Object.entries(TIER1_COUNT_GROUPS)) {
      const counts = {};
      for (const field of fields) counts[field] = finiteCount(tier1Counts[field]);
      rows.push({
        scenarioId,
        subsystem,
        source: 'tier1-counter-family',
        measurementWindow: normalizeMeasurementWindow(measurementWindow),
        cpu: null,
        gpu: null,
        counts,
      });
    }
  }

  for (const [subsystem, counts] of Object.entries(cpuReport?.counters || {})) {
    rows.push({
      scenarioId,
      subsystem: `runtime.${subsystem}`,
      source: 'runtime-counter',
      measurementWindow: normalizeMeasurementWindow(measurementWindow),
      cpu: null,
      gpu: null,
      counts: normalizeCountBag(counts),
    });
  }
  if (cpuReport?.entities && typeof cpuReport.entities === 'object') {
    rows.push({
      scenarioId,
      subsystem: 'runtime.entities',
      source: 'runtime-gauge',
      measurementWindow: normalizeMeasurementWindow(measurementWindow),
      cpu: null,
      gpu: null,
      counts: normalizeCountBag(cpuReport.entities),
    });
  }

  return rows;
}

export function buildPerformanceCostTable({
  manifest,
  candidate,
  scenarios,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!manifest || typeof manifest !== 'object') throw new TypeError('compiled manifest identity is required');
  if (!Array.isArray(scenarios) || scenarios.length === 0) throw new TypeError('scenario rows are required');
  const seen = new Set();
  const rows = scenarios.map((entry) => {
    if (!entry || typeof entry.scenarioId !== 'string' || !entry.scenarioId) {
      throw new TypeError('each cost-table scenario requires scenarioId');
    }
    if (seen.has(entry.scenarioId)) throw new Error(`duplicate cost-table scenario: ${entry.scenarioId}`);
    seen.add(entry.scenarioId);
    if (entry.status === 'not-runnable') {
      return {
        scenarioId: entry.scenarioId,
        status: 'not-runnable',
        blocker: entry.blocker || null,
        measurementWindow: entry.measurementWindow ? normalizeMeasurementWindow(entry.measurementWindow) : null,
        measurements: null,
      };
    }
    if (entry.status === 'invalid' || entry.status === 'failed') {
      return {
        scenarioId: entry.scenarioId,
        status: 'invalid',
        blocker: entry.blocker || null,
        measurementWindow: entry.measurementWindow ? normalizeMeasurementWindow(entry.measurementWindow) : null,
        controls: Array.isArray(entry.controls) ? entry.controls : [],
        controlFailures: Array.isArray(entry.controlFailures) ? entry.controlFailures : [],
        environment: entry.environment || null,
        telemetryCoverage: entry.telemetryCoverage || null,
        tier1EvidencePath: entry.tier1EvidencePath || null,
        measurements: null,
      };
    }
    const evidenceFailures = validateScenarioMeasurementEvidence(entry);
    if (evidenceFailures.length > 0) {
      return {
        scenarioId: entry.scenarioId,
        status: 'invalid',
        blocker: {
          code: 'cost-evidence-invalid',
          detail: evidenceFailures,
        },
        measurementWindow: entry.measurementWindow
          ? normalizeMeasurementWindow(entry.measurementWindow)
          : null,
        controls: Array.isArray(entry.controls) ? entry.controls : [],
        controlFailures: Array.isArray(entry.controlFailures) ? entry.controlFailures : [],
        environment: entry.environment || null,
        telemetryCoverage: entry.telemetryCoverage || null,
        tier1EvidencePath: entry.tier1EvidencePath || null,
        measurements: null,
      };
    }
    const costRows = buildScenarioCostRows(entry);
    if (costRows.length === 0) {
      return {
        scenarioId: entry.scenarioId,
        status: 'invalid',
        blocker: {
          code: 'cost-evidence-invalid',
          detail: ['measured evidence produced zero cost rows'],
        },
        measurementWindow: normalizeMeasurementWindow(entry.measurementWindow),
        controls: Array.isArray(entry.controls) ? entry.controls : [],
        controlFailures: Array.isArray(entry.controlFailures) ? entry.controlFailures : [],
        environment: entry.environment || null,
        telemetryCoverage: entry.telemetryCoverage || null,
        tier1EvidencePath: entry.tier1EvidencePath || null,
        measurements: null,
      };
    }
    return {
      scenarioId: entry.scenarioId,
      status: entry.status || 'measured',
      blocker: entry.blocker || null,
      measurementWindow: normalizeMeasurementWindow(entry.measurementWindow),
      controls: Array.isArray(entry.controls) ? entry.controls : [],
      controlFailures: Array.isArray(entry.controlFailures) ? entry.controlFailures : [],
      environment: entry.environment || null,
      telemetryCoverage: entry.telemetryCoverage || null,
      tier1EvidencePath: entry.tier1EvidencePath || null,
      measurements: {
        cpuReport: entry.cpuReport || null,
        gpuReport: entry.gpuReport || null,
        tier1Counts: entry.tier1Counts || null,
        costRows,
      },
    };
  });
  const measured = rows.filter((row) => row.status === 'measured').length;
  const invalid = rows.filter((row) => row.status === 'invalid' || row.status === 'failed').length;
  const blocked = rows.filter((row) => row.status === 'not-runnable').length;
  const table = {
    schema: PERFORMANCE_COST_TABLE_SCHEMA,
    telemetryCoverage: PERFORMANCE_COST_TABLE_TELEMETRY_COVERAGE,
    limitations: PERFORMANCE_COST_TABLE_LIMITATIONS,
    status: invalid > 0 ? 'failed' : (measured < rows.length ? 'partial' : 'complete'),
    generatedAt,
    manifest,
    candidate: candidate || null,
    counts: {
      scenarios: rows.length,
      measured,
      blocked,
      invalid,
      costRows: rows.reduce((total, row) => total + (row.measurements?.costRows?.length || 0), 0),
    },
    rows,
  };
  Object.defineProperties(table, {
    telemetryCoverage: {
      value: PERFORMANCE_COST_TABLE_TELEMETRY_COVERAGE,
      enumerable: true,
      configurable: false,
      writable: false,
    },
    limitations: {
      value: PERFORMANCE_COST_TABLE_LIMITATIONS,
      enumerable: true,
      configurable: false,
      writable: false,
    },
  });
  return table;
}

function pushCpuRow(rows, {
  scenarioId,
  subsystem,
  source,
  stat,
  measurementWindow,
}) {
  const cpu = normalizeCpuStat(stat);
  if (!cpu) return null;
  const row = {
    scenarioId,
    subsystem,
    source,
    measurementWindow: normalizeMeasurementWindow(measurementWindow),
    cpu,
    gpu: null,
    counts: { invocations: cpu.samples },
  };
  rows.push(row);
  return row;
}

function normalizeCpuStat(stat) {
  const samples = finiteCount(stat?.samples);
  if (samples === 0) return null;
  const invalid = validateCpuStatEvidence(stat, 'CPU stat');
  if (invalid.length > 0) {
    throw new Error(`invalid sampled CPU distribution: ${invalid.join('; ')}`);
  }
  return {
    avgMs: finiteOrNull(stat?.avg),
    p50Ms: finiteOrNull(stat?.p50),
    p95Ms: finiteOrNull(stat?.p95),
    p99Ms: finiteOrNull(stat?.p99),
    p999Ms: finiteOrNull(stat?.p999),
    maxMs: finiteOrNull(stat?.max),
    hitchesOver2xMedian: finiteCount(stat?.hitchesOver2xMedian),
    samples,
    retainedSampleCapacity: finiteCount(stat?.retainedSampleCapacity),
  };
}

function validateScenarioMeasurementEvidence(entry) {
  const failures = [];
  if (entry?.status !== 'measured' && entry?.status !== 'counts-only') {
    failures.push(`unsupported measurement status ${JSON.stringify(entry?.status)}`);
    return failures;
  }
  failures.push(...validateTier1CountCoverage(entry.tier1Counts));
  if (hasControlFailures(entry.controlFailures)) {
    failures.push('controlFailures is non-empty');
  }
  if (hasFailingControls(entry.controls)) {
    failures.push('controls contains a failing control');
  }
  if (entry.status === 'measured') {
    failures.push(...validateMeasuredControlReceipts(entry));
    failures.push(...validateCpuReportEvidence(entry.cpuReport, entry.measurementWindow));
    failures.push(...validateGpuReportEvidence(
      entry.gpuReport,
      entry.telemetryCoverage,
      entry.scenarioId,
      entry.controls,
    ));
  }
  return failures;
}

function validateMeasuredControlReceipts(entry) {
  if (!Array.isArray(entry.controls)) {
    return ['measured controls must be an explicit array'];
  }
  if (!Array.isArray(entry.controlFailures)) {
    return ['measured controlFailures must be an explicit array'];
  }
  const failures = [];
  const passed = new Set();
  for (const control of entry.controls) {
    if (!control || typeof control.id !== 'string' || !control.id) {
      failures.push('every measured control must have an id');
      continue;
    }
    if (passed.has(control.id)) {
      failures.push(`measured control ${control.id} must appear exactly once`);
      continue;
    }
    if (control.pass === true) passed.add(control.id);
  }
  const gpuNotApplicable = entry.telemetryCoverage?.gpuPass?.applicable === false
    && entry.telemetryCoverage?.gpuPass?.status === 'not-applicable';
  const required = [
    ...REQUIRED_MEASURED_CONTROL_IDS,
    ...(gpuNotApplicable ? ['gpu-explicitly-not-applicable'] : REQUIRED_GPU_CONTROL_IDS),
    ...(entry.scenarioId === 'context_recover_steady' ? REQUIRED_CONTEXT_CONTROL_IDS : []),
  ];
  for (const id of required) {
    if (!passed.has(id)) failures.push(`required measured control ${id} is missing or failed`);
  }
  return failures;
}

function validateTier1CountCoverage(counts) {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
    return ['tier1Counts must be an object with every Tier-1 cost field'];
  }
  const failures = [];
  for (const field of TIER1_COST_COUNT_FIELDS) {
    const value = counts[field];
    if (!Number.isSafeInteger(value) || value < 0) {
      failures.push(`tier1Counts.${field} must be a non-negative safe integer`);
    }
  }
  return failures;
}

function validateCpuReportEvidence(cpuReport, measurementWindow) {
  if (!cpuReport || typeof cpuReport !== 'object' || Array.isArray(cpuReport)) {
    return ['cpuReport must be an explicit timing report'];
  }
  const failures = validateCpuStatEvidence(
    cpuReport.frameCallback,
    'cpuReport.frameCallback',
    { required: true },
  );
  const expectedSamples = Number(measurementWindow?.frameCount);
  if (Number.isSafeInteger(expectedSamples)
    && cpuReport.frameCallback?.samples !== expectedSamples) {
    failures.push(
      `cpuReport.frameCallback.samples=${cpuReport.frameCallback?.samples ?? 'missing'} `
      + `must equal measurement frameCount=${expectedSamples}`,
    );
  }

  const optionalStats = [
    ['cpuReport.frameUntracked', cpuReport.frameUntracked],
    ...Object.entries(cpuReport.phases || {}).map(([name, stat]) => [`cpuReport.phases.${name}`, stat]),
    ...Object.entries(cpuReport.systems || {}).map(([name, stat]) => [`cpuReport.systems.${name}`, stat]),
    ...Object.entries(cpuReport.renderWork || {}).map(([name, stat]) => [`cpuReport.renderWork.${name}`, stat]),
  ];
  for (const [label, stat] of optionalStats) {
    failures.push(...validateCpuStatEvidence(stat, label));
  }
  const sampledSystems = Object.values(cpuReport.systems || {}).filter(
    (stat) => Number.isSafeInteger(stat?.samples) && stat.samples > 0,
  ).length;
  const sampledRenderWork = Object.values(cpuReport.renderWork || {}).filter(
    (stat) => Number.isSafeInteger(stat?.samples) && stat.samples > 0,
  ).length;
  if (sampledSystems === 0) {
    failures.push('cpuReport.systems must contain sampled subsystem attribution');
  }
  if (sampledRenderWork === 0) {
    failures.push('cpuReport.renderWork must contain sampled render-work attribution');
  }
  return failures;
}

function validateCpuStatEvidence(stat, label, { required = false } = {}) {
  if (!stat || typeof stat !== 'object' || Array.isArray(stat)) {
    return required ? [`${label} must be a sampled CPU distribution`] : [];
  }
  const samples = stat.samples;
  if (!Number.isSafeInteger(samples) || samples < 0) {
    return [`${label}.samples must be a non-negative safe integer`];
  }
  if (samples === 0) {
    return required ? [`${label}.samples must be positive`] : [];
  }
  const failures = [];
  for (const field of CPU_DISTRIBUTION_FIELDS) {
    const value = stat[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      failures.push(`${label}.${field} must be finite and non-negative`);
    }
  }
  if (!Number.isSafeInteger(stat.hitchesOver2xMedian) || stat.hitchesOver2xMedian < 0) {
    failures.push(`${label}.hitchesOver2xMedian must be a non-negative safe integer`);
  }
  if (!Number.isSafeInteger(stat.retainedSampleCapacity) || stat.retainedSampleCapacity < 1) {
    failures.push(`${label}.retainedSampleCapacity must be a positive safe integer`);
  }
  return failures;
}

function validateGpuReportEvidence(gpuReport, telemetryCoverage, scenarioId, controls) {
  const gpuCoverage = telemetryCoverage?.gpuPass;
  if (gpuCoverage?.applicable === false && gpuCoverage?.status === 'not-applicable') {
    const authorizedScenario = scenarioId === 'docked_market_ui';
    const explicitControl = Array.isArray(controls) && controls.some(
      (control) => control?.id === 'gpu-explicitly-not-applicable' && control?.pass === true,
    );
    if (!authorizedScenario || !explicitControl) {
      return [
        'GPU not-applicable evidence requires docked_market_ui route authority '
        + 'and a passing gpu-explicitly-not-applicable control',
      ];
    }
    if (gpuReport?.captureValid === true) {
      return ['GPU timing cannot be both not-applicable and captureValid'];
    }
    return [];
  }
  if (!gpuReport || typeof gpuReport !== 'object' || Array.isArray(gpuReport)) {
    return ['gpuReport must be valid timing evidence or explicitly not-applicable'];
  }

  const failures = [];
  if (gpuReport.status !== 'ok') failures.push('gpuReport.status must be ok');
  const counts = {
    issued: gpuReport.issuedQueries,
    completed: gpuReport.completedQueries,
    pending: gpuReport.pendingQueries,
    dropped: gpuReport.droppedQueries,
    rejected: gpuReport.rejectedQueries,
  };
  const nestedCounts = gpuReport.queryCounts;
  if (gpuReport.captureValid !== true) failures.push('gpuReport.captureValid must be true');
  for (const [field, value] of Object.entries(counts)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      failures.push(`gpuReport.${field}Queries must be a non-negative safe integer`);
    }
  }
  if (!nestedCounts || typeof nestedCounts !== 'object' || Array.isArray(nestedCounts)) {
    failures.push('gpuReport.queryCounts must be an explicit count receipt');
  } else {
    for (const [field, value] of Object.entries(counts)) {
      if (nestedCounts[field] !== value) {
        failures.push(`gpuReport.queryCounts.${field} must match gpuReport.${field}Queries`);
      }
    }
  }
  if (Number.isSafeInteger(counts.issued) && counts.issued < 1) {
    failures.push('gpuReport.issuedQueries must be positive');
  }
  if (Number.isSafeInteger(counts.completed) && counts.completed < 1) {
    failures.push('gpuReport.completedQueries must be positive');
  }
  if (Number.isSafeInteger(counts.issued)
    && Number.isSafeInteger(counts.completed)
    && counts.issued !== counts.completed) {
    failures.push('gpuReport issued/completed query counts must match');
  }
  for (const field of ['pending', 'dropped', 'rejected']) {
    if (Number.isSafeInteger(counts[field]) && counts[field] !== 0) {
      failures.push(`gpuReport.${field}Queries must be zero`);
    }
  }

  if (gpuCoverage != null) {
    if (gpuCoverage?.applicable !== true || gpuCoverage?.status !== 'captured') {
      failures.push('applicable GPU telemetry coverage must be captured');
    }
    if (gpuCoverage?.completedQueries !== counts.completed) {
      failures.push('GPU telemetry coverage completedQueries must match gpuReport');
    }
  }

  let activePasses = 0;
  const passTotals = {
    issued: 0,
    completed: 0,
    dropped: 0,
    rejected: 0,
  };
  for (const [name, pass] of Object.entries(gpuReport.passes || {})) {
    const issued = pass?.issuedQueries;
    const completed = pass?.completedQueries;
    const dropped = pass?.droppedQueries;
    const rejected = pass?.rejectedQueries;
    const samples = pass?.samples;
    const active = [issued, completed, dropped, rejected, samples]
      .some((value) => Number.isSafeInteger(value) && value > 0);
    if (!active) continue;
    activePasses++;
    passTotals.issued += Number.isSafeInteger(issued) ? issued : 0;
    passTotals.completed += Number.isSafeInteger(completed) ? completed : 0;
    passTotals.dropped += Number.isSafeInteger(dropped) ? dropped : 0;
    passTotals.rejected += Number.isSafeInteger(rejected) ? rejected : 0;
    for (const [field, value] of Object.entries({
      issuedQueries: issued,
      completedQueries: completed,
      droppedQueries: dropped,
      rejectedQueries: rejected,
      samples,
    })) {
      if (!Number.isSafeInteger(value) || value < 0) {
        failures.push(`gpuReport.passes.${name}.${field} must be a non-negative safe integer`);
      }
    }
    if (Number.isSafeInteger(issued) && Number.isSafeInteger(completed)
      && (issued < 1 || issued !== completed)) {
      failures.push(`gpuReport.passes.${name} issued/completed query counts must match and be positive`);
    }
    if (dropped !== 0 || rejected !== 0) {
      failures.push(`gpuReport.passes.${name} dropped/rejected query counts must be zero`);
    }
    for (const field of ['completedAvg', 'avg', 'max', 'last']) {
      const value = pass?.[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        failures.push(`gpuReport.passes.${name}.${field} must be finite and non-negative`);
      }
    }
  }
  if (activePasses === 0) failures.push('gpuReport must contain at least one completed pass');
  for (const field of ['issued', 'completed', 'dropped', 'rejected']) {
    if (Number.isSafeInteger(counts[field]) && passTotals[field] !== counts[field]) {
      failures.push(`GPU pass ${field} query total must match gpuReport`);
    }
  }
  return failures;
}

function hasControlFailures(controlFailures) {
  if (controlFailures == null) return false;
  return !Array.isArray(controlFailures) || controlFailures.length > 0;
}

function hasFailingControls(controls) {
  if (controls == null) return false;
  return !Array.isArray(controls)
    || controls.some((control) => !control || typeof control !== 'object' || control.pass !== true);
}

function normalizeMeasurementWindow(window) {
  const startFrame = Number(window?.startFrame);
  const frameCount = Number(window?.frameCount);
  if (!Number.isSafeInteger(startFrame) || startFrame < 0
    || !Number.isSafeInteger(frameCount) || frameCount < 1 || frameCount > 180) {
    throw new Error(`invalid measurement window: ${JSON.stringify(window)}`);
  }
  return { startFrame, frameCount, endFrame: startFrame + frameCount };
}

function normalizeCountBag(input) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) output[key] = value;
  }
  return output;
}

function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function finiteOrNull(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function deepFreeze(value) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
