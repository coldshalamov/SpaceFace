import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ensurePerfRuntime } from '../src/core/perfRuntime.js';

import {
  PERFORMANCE_CLOSURE_SCHEMA,
  PERFORMANCE_SCENARIO_IDS,
  PERFORMANCE_WINDOW_SCHEMA,
  buildPerformanceClosureReport,
  comparePerformanceWindows,
  comparisonKey,
  evaluatePerformanceImprovement,
  evaluatePerformanceMeasurementValidity,
  evaluatePerformanceWindowBudgets,
  performanceScenario,
  resolvePerformanceScenarios,
  summarizeFrameSamples,
  validatePerformanceClosureReport,
} from '../scripts/lib/performanceClosureContracts.mjs';

const environment = {
  runtimeKind: 'browser',
  seed: 47,
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  browser: { name: 'Chrome', version: '150', userAgent: 'fixture' },
  gpu: {
    api: 'webgl2',
    renderer: 'ANGLE fixture',
    vendor: 'fixture',
    source: 'game-renderer',
  },
  activity: {
    start: { active: false },
    end: { active: false },
  },
  defaultSettings: {
    video: { renderScale: 0.85, pixelRatioCap: 2, bloom: true, shadows: false, particleQuality: 'medium' },
  },
};

const settings = {
  video: { renderScale: 0.85, pixelRatioCap: 2, bloom: true, shadows: false, particleQuality: 'medium' },
};

const routeIdentity = Object.freeze({
  manifestDigest: '1'.repeat(64),
  scenarioDigest: '2'.repeat(64),
  scenarioDefinitionDigest: '3'.repeat(64),
  saveDigest: '4'.repeat(64),
  inputDigest: '5'.repeat(64),
  cameraDigest: '6'.repeat(64),
});

function samples() {
  return [
    { frameMs: 16.6, stepsThisFrame: 1, shedBacklog: false },
    { frameMs: 16.8, stepsThisFrame: 2, shedBacklog: false },
    { frameMs: 33.4, stepsThisFrame: 1, shedBacklog: true, shedSteps: 1 },
    { frameMs: 50.1, stepsThisFrame: 1, shedBacklog: false },
  ];
}

function pipelineWarmupFixture() {
  return {
    schema: 'spaceface.performancePipelineWarmup.v1',
    pass: true,
    requiredStableMs: 5_000,
    maxWaitMs: 20_000,
    elapsedMs: 5_000,
    stableMs: 5_000,
    timedOut: false,
    observationCount: 301,
    transitionCount: 0,
  };
}

function windowFixture(overrides = {}) {
  const rawSamples = samples();
  const scenarioId = overrides.scenarioId || 'flight_steady';
  const fixture = {
    schema: PERFORMANCE_WINDOW_SCHEMA,
    scenarioId,
    evidenceKind: 'diagnostic',
    stateInjected: false,
    inputSource: 'diagnostic-controller',
    defaultQuality: true,
    rawSamples,
    summary: summarizeFrameSamples(rawSamples),
    settings: { start: settings, end: settings },
    comparisonKey: comparisonKey({ scenarioId, environment, settings }),
    cpu: {},
    gpu: gpuTimerFixture(),
    scene: {},
    pipeline: {
      warmup: pipelineWarmupFixture(),
      start: { activeAdmissionJobs: 0, meshBuildQueueRemaining: 0, programCount: 20 },
      end: { activeAdmissionJobs: 0, meshBuildQueueRemaining: 0, programCount: 20 },
    },
    memory: { comparableState: { pass: true } },
    restoration: { restored: true, measurementDisabled: true },
    pageErrors: [],
    ...overrides,
  };
  fixture.budgets ??= evaluatePerformanceWindowBudgets({
    scenarioId: fixture.scenarioId,
    summary: summarizeFrameSamples(fixture.rawSamples),
    autosave: fixture.autosave,
    evidenceKind: fixture.evidenceKind,
  });
  return fixture;
}

function gpuTimerFixture(overrides = {}) {
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
      attempted: 300,
      issued: 300,
      completed: 300,
      pending: 0,
      dropped: 0,
      rejected: 0,
    },
    terminals: [
      { queryId: 1, state: 'completed' },
      { queryId: 2, state: 'completed' },
    ],
    passes: {},
    ...overrides,
  };
}

function reportFixture(window = windowFixture()) {
  const fingerprint = {
    id: 'a'.repeat(12) + '-' + 'b'.repeat(16),
    digest: 'c'.repeat(64),
    head: 'd'.repeat(40),
    branch: 'codex/performance-closure-test',
    changedFileCount: 0,
  };
  return buildPerformanceClosureReport({
    taskId: 'performance-closure-test',
    fingerprints: { start: fingerprint, end: fingerprint },
    environment,
    windows: [window],
    artifacts: [{ kind: 'run-log', path: '.devshots/perf/run.log', bytes: 12, sha256: 'e'.repeat(64) }],
    cleanup: {
      pass: true,
      pageClosed: true,
      browserClosed: true,
      serverReleased: true,
      portsReleased: true,
      measurementDisabled: true,
    },
    errors: { pageErrors: [], requestFailures: [], consoleErrors: [], httpErrors: [], glErrors: [], warnings: [] },
  });
}

test('Electron closure evidence is bound to the exact provisioned package and binary', () => {
  const missing = structuredClone(reportFixture());
  missing.environment.runtimeKind = 'electron';
  assert.match(
    validatePerformanceClosureReport(missing).failures.join('\n'),
    /Electron package\/binary runtime identity is required/,
  );

  missing.environment.electronRuntime = {
    packageVersion: '43.2.0',
    runtimeVersion: '43.2.0',
    runtimePath: 'C:\\electron-43\\electron.exe',
    provisioned: false,
  };
  missing.environment.browser.userAgent = 'fixture Electron/43.2.0';
  missing.windows[0].comparisonKey = comparisonKey({
    scenarioId: missing.windows[0].scenarioId,
    environment: missing.environment,
    settings,
  });
  assert.equal(validatePerformanceClosureReport(missing).pass, true);

  missing.environment.electronRuntime.runtimeVersion = '31.7.7';
  assert.match(
    validatePerformanceClosureReport(missing).failures.join('\n'),
    /Electron package and binary versions must match/,
  );
});

test('scenario matrix covers every closure workload and exact fleet scales', () => {
  for (const id of [
    'flight_steady', 'mining_tether_active', 'docked_market_ui', 'context_recover_steady',
    'fleet_full_render_10', 'fleet_full_render_25', 'fleet_full_render_50',
    'fleet_transparent_heavy', 'station_arrival_approach', 'station_visible_steady',
    'combat_vfx_burst', 'jump_asset_admission', 'autosave_under_load',
    'map_open', 'map_interaction_steady', 'map_to_flight_transition',
  ]) assert.ok(PERFORMANCE_SCENARIO_IDS.includes(id), id);
  assert.deepEqual(
    resolvePerformanceScenarios(['fleet_full_render_10', 'fleet_full_render_25', 'fleet_full_render_50']).map((entry) => entry.fleetCount),
    [10, 25, 50],
  );
  assert.equal(performanceScenario('docked_market_ui').gpuTimingPolicy, 'idle-3d');
  assert.equal(performanceScenario('jump_asset_admission').pipelinePolicy, 'admission');
  assert.equal(performanceScenario('flight_steady').gpuTimingPolicy, 'required');
  assert.equal(performanceScenario('flight_steady').pipelinePolicy, 'stable');
  assert.throws(() => resolvePerformanceScenarios(['unknown']), /unknown performance scenario/);
});

test('scenario resolution ignores mutable Array.prototype lookup hooks', () => {
  const targetId = PERFORMANCE_SCENARIO_IDS[1];
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'find');
  let hookCalls = 0;
  let resolved;
  try {
    Object.defineProperty(Array.prototype, 'find', {
      configurable: true,
      writable: true,
      value() {
        hookCalls += 1;
        return this[0];
      },
    });
    resolved = resolvePerformanceScenarios([targetId]);
  } finally {
    if (descriptor) Object.defineProperty(Array.prototype, 'find', descriptor);
    else delete Array.prototype.find;
  }

  assert.equal(hookCalls, 0);
  assert.equal(resolved[0].id, targetId);
});

test('scenario identity rejects non-string coercion hooks', () => {
  let hookCalls = 0;
  const objectId = {
    [Symbol.toPrimitive]() {
      hookCalls += 1;
      return 'flight_steady';
    },
  };

  assert.equal(performanceScenario(objectId), null);
  assert.throws(
    () => resolvePerformanceScenarios([objectId]),
    /scenario ids must be strings|unknown performance scenario/,
  );

  const invalid = reportFixture(windowFixture({
    scenarioId: objectId,
    comparisonKey: comparisonKey({
      scenarioId: objectId,
      environment,
      settings,
    }),
  }));
  assert.equal(invalid.validation.pass, false);
  assert.match(invalid.validation.failures.join(' | '), /scenarioId is unknown/);
  assert.equal(hookCalls, 0);
});

test('digest-less v1 comparison keys remain backward compatible', () => {
  const legacyKey = 'decab6bdca2a64e8556e94834c3f7c564dc43f4e2981680cf767584bed0e47fc';
  assert.equal(comparisonKey({
    scenarioId: 'flight_steady',
    environment: {
      runtimeKind: 'browser',
      seed: 47,
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
      browser: { name: 'Chrome', version: '150', userAgent: 'fixture' },
      gpu: { renderer: 'ANGLE fixture', vendor: 'fixture' },
      activity: { releaseLock: null, releaseBuilding: null, processHints: [] },
      defaultSettings: environment.defaultSettings,
    },
    settings,
  }), legacyKey);

  const legacy = reportFixture(windowFixture());
  assert.equal(legacy.validation.pass, true, legacy.validation.failures.join('\n'));
});

test('digest-less reports ignore inherited route digest fields', () => {
  const legacyKey = comparisonKey({ scenarioId: 'flight_steady', environment, settings });
  const window = windowFixture({ comparisonKey: legacyKey });
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'manifestDigest',
  );

  try {
    Object.defineProperty(Object.prototype, 'manifestDigest', {
      configurable: true,
      value: 'a'.repeat(64),
    });
    const report = reportFixture(window);
    assert.equal(report.validation.pass, true, report.validation.failures.join('\n'));
  } finally {
    if (descriptor) {
      Object.defineProperty(Object.prototype, 'manifestDigest', descriptor);
    } else {
      delete Object.prototype.manifestDigest;
    }
  }
});

test('raw frame summaries include threshold, missed-vsync, multi-step, and shedding counts', () => {
  assert.deepEqual(summarizeFrameSamples(samples()), {
    sampleCount: 4,
    p50: 33.4,
    p95: 50.1,
    p99: 50.1,
    p999: 50.1,
    max: 50.1,
    hitchesOver2xMedian: 0,
    framesAbove16_7Ms: 3,
    framesAbove32Ms: 2,
    framesAbove50Ms: 1,
    estimatedMissedVsyncs: 6,
    multiStepSimulationFrames: 1,
    backlogSheddingFrames: 1,
  });
});

test('budget results are recomputed from raw frame and autosave evidence', () => {
  const summary = summarizeFrameSamples([{ frameMs: 16 }, { frameMs: 20 }, { frameMs: 34 }]);
  const frameBudgets = evaluatePerformanceWindowBudgets({ scenarioId: 'flight_steady', summary });
  assert.equal(frameBudgets.acceptanceEligible, false);
  assert.equal(frameBudgets.results.find((entry) => entry.id === 'frame.p95.target').pass, false);
  assert.equal(frameBudgets.results.find((entry) => entry.id === 'frame.framesAbove32.max').value, 1);

  const saveBudgets = evaluatePerformanceWindowBudgets({
    scenarioId: 'autosave_under_load',
    summary,
    autosave: { events: [{ event: 'save:completed' }], timing: { maxBlockingSliceMs: 13 } },
  });
  assert.equal(saveBudgets.results.find((entry) => entry.id === 'autosave.completed').pass, true);
  assert.equal(saveBudgets.results.find((entry) => entry.id === 'autosave.maxBlockingSlice.hard').pass, false);
  const targetMissWithinHardLimit = evaluatePerformanceWindowBudgets({
    scenarioId: 'autosave_under_load',
    summary: summarizeFrameSamples([{ frameMs: 16 }, { frameMs: 16.5 }]),
    autosave: { events: [{ event: 'save:completed' }], timing: { maxBlockingSliceMs: 10 } },
  });
  assert.equal(targetMissWithinHardLimit.results.find((entry) => entry.id === 'autosave.maxBlockingSlice.target').pass, false);
  assert.equal(targetMissWithinHardLimit.results.find((entry) => entry.id === 'autosave.maxBlockingSlice.hard').pass, true);
  assert.equal(targetMissWithinHardLimit.pass, true, 'the 8 ms target must not replace the measured 12 ms hard gate');
  const missingSaveTiming = evaluatePerformanceWindowBudgets({ scenarioId: 'autosave_under_load', summary });
  assert.equal(missingSaveTiming.results.find((entry) => entry.id === 'autosave.maxBlockingSlice.hard').value, null);
  assert.equal(missingSaveTiming.results.find((entry) => entry.id === 'autosave.maxBlockingSlice.hard').pass, false);
});

test('perf runtime copies bounded per-frame scalars into caller-owned storage', () => {
  const perf = ensurePerfRuntime({ entityList: [], settings: { video: {} } });
  perf.recordAdmissionWork(1.25);
  perf.beginFrame(0.02, 100, 99.5, 1000 / 60);
  perf.recordLoop(2, true, 0.005, 3);
  perf.recordSimFrame(1.5);
  perf.recordPresentationFrame(6);
  perf.recordPhase('render', 4.5);
  perf.recordPhase('vfx', 0.5);
  perf.recordPhase('feel', 0.25);
  perf.recordPhase('ui', 0.75);
  perf.recordFrameCallback(8);
  const target = {};
  assert.equal(perf.readFrameSample(target), target);
  assert.deepEqual(target, {
    frameDtMs: 20,
    stepsThisFrame: 2,
    shedBacklogFrames: 1,
    shedStepsTotal: 3,
    callbackMs: 8,
    untrackedMs: 0.5,
    callbackIntervalMs: 0,
    externalCallbackGapMs: 0,
    callbackDispatchLagMs: 0.5,
    backlogCause: 'admission',
    simMs: 0,
    simFrameMs: 1.5,
    presentationMs: 6,
    renderMs: 4.5,
    vfxMs: 0.5,
    feelMs: 0.25,
    uiMs: 0.75,
    admissionMs: 1.25,
  });
});

test('comparison rejects mismatched environments and recomputes deltas from raw samples', () => {
  const before = windowFixture();
  const after = windowFixture({
    rawSamples: [{ frameMs: 10 }, { frameMs: 12 }],
    summary: summarizeFrameSamples([{ frameMs: 10 }, { frameMs: 12 }]),
  });
  const comparison = comparePerformanceWindows(before, after);
  assert.equal(comparison.comparable, true);
  assert.equal(comparison.after.p95, 12);
  assert.equal(comparison.delta.p95, 12 - 50.1);
  assert.equal(comparePerformanceWindows(before, { ...after, comparisonKey: 'f'.repeat(64) }).comparable, false);
});

test('closure comparison binds the complete route digest chain', () => {
  const candidateIdentity = {
    ...routeIdentity,
    inputDigest: '7'.repeat(64),
  };
  const before = windowFixture({
    ...routeIdentity,
    comparisonKey: comparisonKey({
      scenarioId: 'flight_steady',
      environment,
      settings,
      ...routeIdentity,
    }),
  });
  const after = windowFixture({
    ...candidateIdentity,
    comparisonKey: comparisonKey({
      scenarioId: 'flight_steady',
      environment,
      settings,
      ...candidateIdentity,
    }),
  });

  assert.equal(reportFixture(before).validation.pass, true);
  assert.equal(reportFixture(after).validation.pass, true);
  assert.notEqual(before.comparisonKey, after.comparisonKey);
  assert.equal(comparePerformanceWindows(before, after).comparable, false);
  const forgedKey = comparePerformanceWindows(before, {
    ...after,
    comparisonKey: before.comparisonKey,
  });
  assert.equal(forgedKey.comparable, false);
  assert.match(forgedKey.failures.join(' | '), /route.*digest|digest.*identity/i);

  const incomplete = windowFixture({
    manifestDigest: routeIdentity.manifestDigest,
    comparisonKey: comparisonKey({
      scenarioId: 'flight_steady',
      environment,
      settings,
      manifestDigest: routeIdentity.manifestDigest,
    }),
  });
  const incompleteValidation = reportFixture(incomplete).validation;
  assert.equal(incompleteValidation.pass, false);
  assert.match(incompleteValidation.failures.join(' | '), /route.*digest|digest.*required|complete route/i);
});

test('direct comparison rejects malformed route digest identities', () => {
  const partialIdentity = {
    manifestDigest: routeIdentity.manifestDigest,
  };
  const partialComparisonKey = comparisonKey({
    scenarioId: 'flight_steady',
    environment,
    settings,
    ...partialIdentity,
  });
  const partial = comparePerformanceWindows(
    windowFixture({
      ...partialIdentity,
      comparisonKey: partialComparisonKey,
    }),
    windowFixture({
      ...partialIdentity,
      comparisonKey: partialComparisonKey,
    }),
  );

  assert.equal(partial.comparable, false);
  assert.match(partial.failures.join(' | '), /complete.*route.*digest|route.*digest.*complete/i);

  let getterCalls = 0;
  const accessorBefore = windowFixture();
  const accessorAfter = windowFixture();
  for (const window of [accessorBefore, accessorAfter]) {
    Object.defineProperty(window, 'manifestDigest', {
      configurable: true,
      get() {
        getterCalls += 1;
        return routeIdentity.manifestDigest;
      },
    });
  }

  const accessor = comparePerformanceWindows(
    accessorBefore,
    accessorAfter,
  );

  assert.equal(accessor.comparable, false);
  assert.match(accessor.failures.join(' | '), /manifestDigest must be an own data property/);
  assert.equal(getterCalls, 0);
});

test('comparison identity ignores mutable Array.prototype canonicalization hooks', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'sort');
  let hookCalls = 0;
  let first;
  let second;
  try {
    Object.defineProperty(Array.prototype, 'sort', {
      configurable: true,
      writable: true,
      value() {
        hookCalls += 1;
        this.length = 0;
        return this;
      },
    });
    first = comparisonKey({
      scenarioId: 'flight_steady',
      environment,
      settings,
      ...routeIdentity,
    });
    second = comparisonKey({
      scenarioId: 'combat_vfx_burst',
      environment,
      settings,
      ...routeIdentity,
    });
  } finally {
    if (descriptor) Object.defineProperty(Array.prototype, 'sort', descriptor);
    else delete Array.prototype.sort;
  }

  assert.equal(hookCalls, 0);
  assert.notEqual(first, second);
});

test('closure report validates identity, hashes, cleanup, raw-summary truth, and comparability key', () => {
  const report = reportFixture();
  assert.equal(report.schema, PERFORMANCE_CLOSURE_SCHEMA);
  assert.deepEqual(report.validation, { pass: true, failures: [] });
  assert.deepEqual(validatePerformanceClosureReport(report), { pass: true, failures: [] });

  const mismatched = reportFixture(windowFixture({
    summary: { ...summarizeFrameSamples(samples()), p95: 1 },
  }));
  assert.equal(mismatched.validation.pass, false);
  assert.match(mismatched.validation.failures.join(' | '), /summary\.p95 does not match raw samples/);

  const missingCleanup = { ...report, cleanup: null };
  assert.equal(validatePerformanceClosureReport(missingCleanup).pass, false);
  const missingArtifacts = { ...report, artifacts: [] };
  assert.equal(validatePerformanceClosureReport(missingArtifacts).pass, false);
});

test('baseline noise classification reports variance without manufacturing improvement', () => {
  const windows = (values) => values.map((value) => windowFixture({
    rawSamples: [{ frameMs: value - 0.1 }, { frameMs: value }],
    summary: summarizeFrameSamples([{ frameMs: value - 0.1 }, { frameMs: value }]),
  }));
  const baseline = windows([16, 16.1, 15.9]);
  const neutral = evaluatePerformanceImprovement({
    baselineWindows: baseline,
    candidateWindows: structuredClone(baseline),
  });
  assert.equal(neutral.pass, false);
  assert.equal(neutral.status, 'neutral');
  assert.equal(neutral.metrics.improvementMs, 0);
  assert.ok(neutral.metrics.noiseFloorMs > 0);

  const improved = evaluatePerformanceImprovement({
    baselineWindows: baseline,
    candidateWindows: windows([14, 14.1, 13.9]),
  });
  assert.equal(improved.pass, true);
  assert.equal(improved.status, 'improved');
  assert.ok(improved.metrics.improvementMs > improved.metrics.noiseFloorMs);

  const regressed = evaluatePerformanceImprovement({
    baselineWindows: baseline,
    candidateWindows: windows([18, 18.1, 17.9]),
  });
  assert.equal(regressed.pass, false);
  assert.equal(regressed.status, 'regressed');

  const mismatched = evaluatePerformanceImprovement({
    baselineWindows: baseline,
    candidateWindows: windows([14, 14.1, 13.9]).map((window) => ({
      ...window,
      comparisonKey: 'f'.repeat(64),
    })),
  });
  assert.equal(mismatched.pass, false);
  assert.equal(mismatched.status, 'invalid');
  assert.match(mismatched.reasons.join(' | '), /not directly comparable/);
});

test('measurement validity fails closed on contamination, fallback GPU identity, disjoint timing, and cache drift', () => {
  const valid = reportFixture();
  assert.deepEqual(evaluatePerformanceMeasurementValidity(valid), valid.measurementValidity);
  assert.equal(valid.measurementValidity.pass, true, valid.measurementValidity.reasons.join('\n'));

  const contaminated = structuredClone(valid);
  contaminated.environment.activity.start.active = true;
  let verdict = evaluatePerformanceMeasurementValidity(contaminated);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.reasons.includes('contaminating-process-or-authoring-activity'));
  assert.equal(validatePerformanceClosureReport(contaminated).pass, false);

  const fallbackRenderer = structuredClone(valid);
  fallbackRenderer.environment.gpu.source = 'probe-fallback';
  verdict = evaluatePerformanceMeasurementValidity(fallbackRenderer);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.reasons.includes('wrong-or-fallback-renderer'));

  const disjoint = structuredClone(valid);
  disjoint.windows[0].gpu.captureValid = false;
  disjoint.windows[0].gpu.lastDisjoint = true;
  disjoint.windows[0].gpu.lastInvalidation = { reason: 'gpu-disjoint' };
  verdict = evaluatePerformanceMeasurementValidity(disjoint);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.reasons.includes('windows[0]-gpu-timer-invalid'));

  const cacheDrift = structuredClone(valid);
  cacheDrift.windows[0].pipeline.end.programCount += 1;
  verdict = evaluatePerformanceMeasurementValidity(cacheDrift);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.reasons.includes('windows[0]-pipeline-cache-mismatch'));

  const unsettledWarmup = structuredClone(valid);
  unsettledWarmup.windows[0].pipeline.warmup.pass = false;
  unsettledWarmup.windows[0].pipeline.warmup.timedOut = true;
  unsettledWarmup.windows[0].pipeline.warmup.stableMs = 750;
  verdict = evaluatePerformanceMeasurementValidity(unsettledWarmup);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.reasons.includes('windows[0]-pipeline-warmup-unsettled'));

  const dockedIdle = reportFixture(windowFixture({
    scenarioId: 'docked_market_ui',
    routeProof: { mode: 'flight', docked: true, uiOnlyPath: true },
    gpu: gpuTimerFixture({
      captureValid: false,
      queryCounts: {
        attempted: 0,
        issued: 0,
        completed: 0,
        pending: 0,
        dropped: 0,
        rejected: 0,
      },
      terminals: [],
    }),
  }));
  verdict = evaluatePerformanceMeasurementValidity(dockedIdle);
  assert.equal(verdict.pass, true, verdict.reasons.join('\n'));

  const mislabeledIdle = structuredClone(dockedIdle);
  mislabeledIdle.windows[0].scenarioId = 'flight_steady';
  verdict = evaluatePerformanceMeasurementValidity(mislabeledIdle);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.reasons.includes('windows[0]-gpu-timer-invalid'));

  const jumpAdmission = reportFixture(windowFixture({
    scenarioId: 'jump_asset_admission',
    action: { kind: 'jump_request', dispatched: true },
    pipeline: {
      warmup: pipelineWarmupFixture(),
      start: {
        activeAdmissionJobs: 0,
        meshBuildQueueRemaining: 0,
        programCount: 20,
        recentAdmissions: [{ sequence: 40, status: 'authored', endedAtMs: 100 }],
      },
      end: {
        activeAdmissionJobs: 0,
        meshBuildQueueRemaining: 0,
        programCount: 28,
        recentAdmissions: [
          { sequence: 40, status: 'authored', endedAtMs: 100 },
          { sequence: 41, status: 'authored', endedAtMs: 200 },
        ],
      },
    },
  }));
  verdict = evaluatePerformanceMeasurementValidity(jumpAdmission);
  assert.equal(verdict.pass, true, verdict.reasons.join('\n'));

  const boundedTerminalWarmup = structuredClone(jumpAdmission);
  boundedTerminalWarmup.windows[0].pipeline.warmup.maxWaitMs = 30_000;
  verdict = evaluatePerformanceMeasurementValidity(boundedTerminalWarmup);
  assert.equal(verdict.pass, true, verdict.reasons.join('\n'));

  const oversizedOrdinaryWarmup = structuredClone(valid);
  oversizedOrdinaryWarmup.windows[0].pipeline.warmup.maxWaitMs = 30_000;
  verdict = evaluatePerformanceMeasurementValidity(oversizedOrdinaryWarmup);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.reasons.includes('windows[0]-pipeline-warmup-unsettled'));

  const releaseDominantAdmission = structuredClone(jumpAdmission);
  releaseDominantAdmission.windows[0].pipeline.end.programCount = 19;
  verdict = evaluatePerformanceMeasurementValidity(releaseDominantAdmission);
  assert.equal(verdict.pass, true,
    'a route transition may release more old-sector programs than its completed admission adds');

  const missingAdmission = structuredClone(jumpAdmission);
  missingAdmission.windows[0].pipeline.end.recentAdmissions =
    missingAdmission.windows[0].pipeline.start.recentAdmissions;
  verdict = evaluatePerformanceMeasurementValidity(missingAdmission);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.reasons.includes('windows[0]-pipeline-cache-mismatch'));
});

test('primary windows fail closed on injected state or non-player input', () => {
  const injected = reportFixture(windowFixture({ evidenceKind: 'primary', stateInjected: true, inputSource: 'keyboard-mouse' }));
  assert.equal(injected.validation.pass, false);
  assert.match(injected.validation.failures.join(' | '), /primary evidence may not inject state/);
  const syntheticInput = reportFixture(windowFixture({ evidenceKind: 'primary', stateInjected: false, inputSource: 'diagnostic-controller' }));
  assert.equal(syntheticInput.validation.pass, false);
  assert.match(syntheticInput.validation.failures.join(' | '), /requires keyboard-mouse input/);
});
