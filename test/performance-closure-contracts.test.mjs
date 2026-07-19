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
  evaluatePerformanceWindowBudgets,
  resolvePerformanceScenarios,
  summarizeFrameSamples,
  validatePerformanceClosureReport,
} from '../scripts/lib/performanceClosureContracts.mjs';

const environment = {
  runtimeKind: 'browser',
  seed: 47,
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  browser: { name: 'Chrome', version: '150', userAgent: 'fixture' },
  gpu: { renderer: 'ANGLE fixture', vendor: 'fixture' },
  activity: { releaseLock: null, releaseBuilding: null, processHints: [] },
  defaultSettings: {
    video: { renderScale: 0.85, pixelRatioCap: 2, bloom: true, shadows: false, particleQuality: 'medium' },
  },
};

const settings = {
  video: { renderScale: 0.85, pixelRatioCap: 2, bloom: true, shadows: false, particleQuality: 'medium' },
};

function samples() {
  return [
    { frameMs: 16.6, stepsThisFrame: 1, shedBacklog: false },
    { frameMs: 16.8, stepsThisFrame: 2, shedBacklog: false },
    { frameMs: 33.4, stepsThisFrame: 1, shedBacklog: true, shedSteps: 1 },
    { frameMs: 50.1, stepsThisFrame: 1, shedBacklog: false },
  ];
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
    gpu: {},
    scene: {},
    pipeline: {},
    memory: {},
    restoration: { restored: true },
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
    errors: { pageErrors: [], requestFailures: [], consoleErrors: [], httpErrors: [], warnings: [] },
  });
}

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
  assert.throws(() => resolvePerformanceScenarios(['unknown']), /unknown performance scenario/);
});

test('raw frame summaries include threshold, missed-vsync, multi-step, and shedding counts', () => {
  assert.deepEqual(summarizeFrameSamples(samples()), {
    sampleCount: 4,
    p50: 33.4,
    p95: 50.1,
    p99: 50.1,
    max: 50.1,
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
    autosave: { timing: { maxBlockingSliceMs: 13 } },
  });
  assert.equal(saveBudgets.results.find((entry) => entry.id === 'autosave.maxBlockingSlice.hard').pass, false);
  const missingSaveTiming = evaluatePerformanceWindowBudgets({ scenarioId: 'autosave_under_load', summary });
  assert.equal(missingSaveTiming.results.find((entry) => entry.id === 'autosave.maxBlockingSlice.hard').value, null);
  assert.equal(missingSaveTiming.results.find((entry) => entry.id === 'autosave.maxBlockingSlice.hard').pass, false);
});

test('perf runtime copies bounded per-frame scalars into caller-owned storage', () => {
  const perf = ensurePerfRuntime({ entityList: [], settings: { video: {} } });
  perf.beginFrame(0.02);
  perf.recordLoop(2, true, 0.005, 3);
  perf.recordSimFrame(1.5);
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
    simMs: 0,
    simFrameMs: 1.5,
    renderMs: 4.5,
    vfxMs: 0.5,
    feelMs: 0.25,
    uiMs: 0.75,
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

test('primary windows fail closed on injected state or non-player input', () => {
  const injected = reportFixture(windowFixture({ evidenceKind: 'primary', stateInjected: true, inputSource: 'keyboard-mouse' }));
  assert.equal(injected.validation.pass, false);
  assert.match(injected.validation.failures.join(' | '), /primary evidence may not inject state/);
  const syntheticInput = reportFixture(windowFixture({ evidenceKind: 'primary', stateInjected: false, inputSource: 'diagnostic-controller' }));
  assert.equal(syntheticInput.validation.pass, false);
  assert.match(syntheticInput.validation.failures.join(' | '), /requires keyboard-mouse input/);
});
