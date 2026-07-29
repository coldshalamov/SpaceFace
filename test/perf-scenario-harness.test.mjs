import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  PERFORMANCE_SCENARIO_IDS,
} from '../scripts/lib/performanceClosureContracts.mjs';
import {
  compilePerformanceScenarioManifest,
  PERFORMANCE_FRAME_IDENTIFIERS,
  PERFORMANCE_SCENARIO_MANIFEST_SCHEMA,
} from '../scripts/lib/performanceScenarioManifest.mjs';
import {
  assertHarnessConsumesScenarioDeclaration,
  assertFingerprintUnchanged,
  assertTraceWindowInvocation,
  canonicalHarnessRunnabilitySummary,
  classifyPerformanceScenarioForHarness,
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
  PERF_SCENARIO_RUNNABILITY,
  planPerformanceScenarioMatrix,
  resolveScenarioLeadIn,
  scenarioMeasurementBoundarySignature,
  selectScenarioTapeEvents,
  shouldContinueScenarioMeasurementDrain,
  shouldYieldAfterScenarioFrame,
} from '../scripts/lib/perfScenarioHarnessContracts.mjs';
import { installDeterministicFramePump } from '../scripts/lib/deterministicFramePump.mjs';
import perfScenarioDeterminismManifest from '../scripts/validation-manifests/perf-scenario-determinism.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');

function scenarioFixture(id) {
  return {
    id,
    seed: 47,
    save: { kind: 'new-game' },
    inputTape: { events: [], frames: [] },
    cameraTape: [],
    entityMultiplier: 1,
    requiredTelemetry: [...PERFORMANCE_FRAME_IDENTIFIERS],
    measurementWindow: { startFrame: 0, frameCount: 60 },
    expectedRouteCompletion: { marker: 'frames:scenario-complete', value: 60 },
  };
}

function completeManifest() {
  return compilePerformanceScenarioManifest({
    schema: PERFORMANCE_SCENARIO_MANIFEST_SCHEMA,
    version: 1,
    id: 'perf-scenario-harness-test',
    scenarios: PERFORMANCE_SCENARIO_IDS.map(scenarioFixture),
  }, { requireCompleteMatrix: true });
}

test('determinism run count cannot degrade into a single-run or malformed false green', () => {
  assert.equal(parseDeterminismRuns(undefined), 2);
  assert.equal(parseDeterminismRuns('2'), 2);
  for (const invalid of [true, '', ' ', 0, 1, '1', 2.5, 3, 10, 'two', Number.NaN]) {
    assert.throws(() => parseDeterminismRuns(invalid), /--runs must be exactly 2/);
  }
});

test('trace-window evidence cannot masquerade as a shared Tier-1/Tier-2 schedule', () => {
  assert.equal(assertTraceWindowInvocation({
    traceWindow: false,
    diagnostic: false,
    includeTiming: true,
  }), true);
  assert.equal(assertTraceWindowInvocation({
    traceWindow: true,
    diagnostic: true,
    includeTiming: false,
  }), true);
  for (const invocation of [
    { traceWindow: true, diagnostic: false, includeTiming: false },
    { traceWindow: true, diagnostic: true, includeTiming: true },
    { traceWindow: true, diagnostic: false, includeTiming: true },
  ]) {
    assert.throws(
      () => assertTraceWindowInvocation(invocation),
      /diagnostic Tier-1 evidence only/,
    );
  }
});

test('half-open tape selection and interframe yield semantics are executable contracts', () => {
  const events = [
    { tick: 2, sequence: 0, code: 'KeyC' },
    { tick: 0, sequence: 1, code: 'KeyB' },
    { tick: 0, sequence: 0, code: 'KeyA' },
    { tick: 1, sequence: 0, code: 'KeyD' },
  ];
  assert.deepEqual(
    selectScenarioTapeEvents(events, 0, 2).map(({ tick, sequence, code }) => ({ tick, sequence, code })),
    [
      { tick: 0, sequence: 0, code: 'KeyA' },
      { tick: 0, sequence: 1, code: 'KeyB' },
      { tick: 1, sequence: 0, code: 'KeyD' },
    ],
  );
  assert.deepEqual(
    selectScenarioTapeEvents(events, 2, 3).map(({ code }) => code),
    ['KeyC'],
  );
  assert.equal(shouldYieldAfterScenarioFrame(1, 2), true);
  assert.equal(shouldYieldAfterScenarioFrame(2, 2), false);
  assert.throws(() => selectScenarioTapeEvents(events, 3, 2), /invalid scenario tape range/);
});

test('measurement drain executes one exact presentation-history interval', () => {
  assert.equal(shouldContinueScenarioMeasurementDrain({
    presentationFramesPumped: 419,
    fixedFrames: 420,
  }), true);
  assert.equal(shouldContinueScenarioMeasurementDrain({
    presentationFramesPumped: 420,
    fixedFrames: 420,
  }), false);
  assert.equal(shouldContinueScenarioMeasurementDrain({
    presentationFramesPumped: 421,
    fixedFrames: 420,
  }), false);
  assert.throws(() => shouldContinueScenarioMeasurementDrain({
    presentationFramesPumped: -1,
    fixedFrames: 420,
  }), /presentationFramesPumped must be/);
});

test('comet phase preconditioning requires runway or one observed production reset', () => {
  const idle = {
    applicable: true,
    textureWarmReady: false,
    state: 'idle',
    timer: 11.2,
    visible: false,
  };
  assert.equal(isCometPhaseSafeForPresentationHorizon(idle, 11.1), true,
    'texture admission is independent from the phase-runway proof');
  assert.equal(isCometPhaseSafeForPresentationHorizon({ ...idle, timer: 11.1 }, 11.1), false);
  assert.equal(isCometPhaseSafeForPresentationHorizon({ ...idle, state: 'active', visible: true }, 11.1), false);
  assert.equal(isCometPhaseSafeForPresentationHorizon({ applicable: false }, 11.1), true);

  const active = {
    applicable: true,
    state: 'active',
    timer: -0.01,
    visible: true,
  };
  const reset = {
    applicable: true,
    textureWarmReady: false,
    state: 'idle',
    timer: 32,
    visible: false,
  };
  assert.equal(isCompletedCometReset(active, reset), true);
  assert.equal(isCompletedCometReset({ ...active, state: 'idle', visible: false }, reset), false,
    'two idle samples cannot masquerade as a reset edge');
  assert.equal(isCompletedCometReset({ ...active, timer: null }, reset), false);
  assert.equal(isCompletedCometReset(active, { ...reset, timer: null }), false);
});

test('runnable routes converge on fixed simulation-age lead-in anchors', () => {
  assert.deepEqual(resolveScenarioLeadIn('flight_steady', 0), {
    anchorTick: 120,
    currentTick: 0,
    leadInFrames: 120,
  });
  assert.deepEqual(resolveScenarioLeadIn('context_recover_steady', 2), {
    anchorTick: 180,
    currentTick: 2,
    leadInFrames: 178,
  });
  assert.deepEqual(resolveScenarioLeadIn('context_recover_steady', 3), {
    anchorTick: 180,
    currentTick: 3,
    leadInFrames: 177,
  });
  assert.throws(
    () => resolveScenarioLeadIn('context_recover_steady', 179),
    /cannot anchor tick 179 at 180/,
  );
  assert.throws(
    () => resolveScenarioLeadIn('invented', 0),
    /no fixed first-playable anchor tick/,
  );
  assert.throws(
    () => resolveScenarioLeadIn('flight_steady', null),
    /must be a non-negative safe integer/,
  );
});

test('context timing derives one fail-closed replay budget from both Tier-1 routes', () => {
  const receipt = ({
    pumped,
    minimum = 180,
    programs = 60,
    dirty = false,
    network = { epoch: 20, started: 10, finished: 10, failed: 0 },
  }) => ({
    predicate: 'quiescence',
    quiescenceFrames: 180,
    minimumFrames: minimum,
    quiescencePumpedFrames: pumped,
    activityQuietFrames: 180,
    rendererProgramsAtBoundary: programs,
    admissionAtBoundary: {
      activeAuthoredUpgradeJobs: 0,
      pendingPipelineAdmissions: 0,
      meshQueueRemaining: 0,
      meshReconcileDirty: dirty,
      environmentReady: true,
      transientVfx: {
        liveSprites: 0,
        explosionsActive: 0,
      },
    },
    networkAtBoundary: {
      pending: 0,
      ...network,
    },
  });
  const run = ({
    sourceInitial,
    sourceFinal = null,
    recoverySource,
    postRestore,
    kicked = false,
    programs = 60,
  }) => ({
    route: {
      route: 'webgl-context-loss-restore',
      sourceStaging: {
        sourceInitialQuiescence: receipt({ pumped: sourceInitial, programs, dirty: kicked }),
        sourceFinalQuiescence: sourceFinal == null
          ? null
          : receipt({ pumped: sourceFinal, programs }),
        sourceReconcileKick: { kicked },
        recoverySourceQuiescence: receipt({ pumped: recoverySource, programs }),
        postRestoreQuiescence: receipt({ pumped: postRestore, programs }),
      },
    },
  });
  const replay = deriveContextRouteReplay([
    run({ sourceInitial: 205, recoverySource: 217, postRestore: 181 }),
    run({ sourceInitial: 209, recoverySource: 217, postRestore: 181 }),
  ]);
  assert.equal(replay.framePolicy, 'tier1-max-as-minimum-with-one-quiet-horizon');
  assert.equal(replay.quiescenceFrames, 180);
  assert.deepEqual(replay.minimumFrames, {
    sourceInitial: 209,
    sourceFinal: 0,
    recoverySource: 217,
    postRestore: 181,
  });
  assert.deepEqual({
    sourceReconcileKicked: replay.sourceReconcileKicked,
    sourceInitialPrograms: replay.stageEvidence.sourceInitial.rendererPrograms,
    sourceInitialDirty: replay.stageEvidence.sourceInitial.meshReconcileDirty,
    sourceInitialNetworks: replay.stageEvidence.sourceInitial.networkTuples,
  }, {
    sourceReconcileKicked: false,
    sourceInitialPrograms: [60],
    sourceInitialDirty: [false],
    sourceInitialNetworks: [{ epoch: 20, started: 10, finished: 10, failed: 0 }],
  });
  assert.throws(
    () => deriveContextRouteReplay([
      run({ sourceInitial: 205, recoverySource: 217, postRestore: 181 }),
      run({
        sourceInitial: 209,
        sourceFinal: 181,
        recoverySource: 217,
        postRestore: 181,
        kicked: true,
      }),
    ]),
    /reconcile decisions differ/,
  );
  assert.throws(
    () => deriveContextRouteReplay([
      run({ sourceInitial: 0, recoverySource: 217, postRestore: 181 }),
      run({ sourceInitial: 209, recoverySource: 217, postRestore: 181 }),
    ]),
    /invalid sourceInitialQuiescence quiet-tail evidence/,
  );
  const malformedAuthority = run({
    sourceInitial: 209,
    recoverySource: 217,
    postRestore: 181,
  });
  malformedAuthority.route.sourceStaging.sourceInitialQuiescence.activityQuietFrames = 179;
  assert.throws(
    () => deriveContextRouteReplay([
      malformedAuthority,
      run({ sourceInitial: 209, recoverySource: 217, postRestore: 181 }),
    ]),
    /invalid sourceInitialQuiescence quiet-tail evidence/,
  );
  const missingDecision = run({
    sourceInitial: 209,
    recoverySource: 217,
    postRestore: 181,
  });
  delete missingDecision.route.sourceStaging.sourceReconcileKick.kicked;
  assert.throws(
    () => deriveContextRouteReplay([
      missingDecision,
      run({ sourceInitial: 209, recoverySource: 217, postRestore: 181 }),
    ]),
    /missing an explicit source reconcile decision/,
  );

  const timingReceipt = (stage, pumped, overrides = {}) => ({
    ...receipt({
      pumped,
      minimum: replay.minimumFrames[stage],
      programs: 60,
    }),
    ...overrides,
  });
  const actual = {
    sourceInitial: timingReceipt('sourceInitial', 210),
    sourceFinal: null,
    recoverySource: timingReceipt('recoverySource', 217),
    postRestore: timingReceipt('postRestore', 181),
    sourceReconcileKicked: false,
  };
  const evaluate = (candidate) => evaluateContextRouteStagingReplay({
    expected: replay,
    actual: candidate,
    quiescenceFrames: 180,
    maximumFrames: 9000,
  });
  const semanticOvershoot = evaluate(actual);
  assert.equal(semanticOvershoot.pass, true, 'semantic +1 overshoot is valid');
  assert.equal(semanticOvershoot.stages.sourceInitial.minimumFrames, 209);
  assert.equal(semanticOvershoot.stages.sourceInitial.minimumReceiptMatches, true);
  assert.equal(semanticOvershoot.stages.sourceInitial.overrunFrames, 1);
  assert.equal(evaluate({
    ...actual,
    sourceInitial: timingReceipt('sourceInitial', 389),
  }).pass, true, 'one complete quiet-horizon overshoot is valid');
  assert.equal(evaluate({
    ...actual,
    sourceInitial: timingReceipt('sourceInitial', 208),
  }).pass, false, 'under-replay fails');
  assert.equal(evaluate({
    ...actual,
    sourceInitial: timingReceipt('sourceInitial', 390),
  }).pass, false, 'a second staging epoch fails');
  assert.equal(evaluate({
    ...actual,
    sourceInitial: timingReceipt('sourceInitial', 210, { minimumFrames: 180 }),
  }).pass, false, 'wrong replay floor fails');
  assert.equal(evaluate({
    ...actual,
    sourceInitial: timingReceipt('sourceInitial', 210, { activityQuietFrames: 999 }),
  }).pass, false, 'impossible quiet-tail receipt fails');
  assert.equal(evaluate({
    ...actual,
    sourceInitial: timingReceipt('sourceInitial', 210, { rendererProgramsAtBoundary: 61 }),
  }).pass, false, 'program mismatch fails');
  assert.equal(evaluate({ ...actual, sourceReconcileKicked: true }).pass, false,
    'reconcile mismatch fails');
  assert.equal(evaluate({
    ...actual,
    sourceFinal: timingReceipt('sourceInitial', 210),
  }).pass, false, 'unexpected final stage fails');
  assert.equal(evaluate({
    ...actual,
    sourceInitial: timingReceipt('sourceInitial', 210, {
      networkAtBoundary: { epoch: 22, started: 11, finished: 11, failed: 0, pending: 0 },
    }),
  }).pass, false, 'changed network tuple fails');
  assert.equal(evaluate({
    ...actual,
    sourceInitial: timingReceipt('sourceInitial', 210, {
      admissionAtBoundary: {
        ...actual.sourceInitial.admissionAtBoundary,
        transientVfx: { liveSprites: 1, explosionsActive: 0 },
      },
    }),
  }).pass, false, 'nonquiet targeted VFX fails');
});

test('measurement-boundary owner, signature, resume, and network contracts fail closed behaviorally', () => {
  const quiet = {
    admission: {
      activeAuthoredUpgradeJobs: 0,
      pendingPipelineAdmissions: 0,
      meshQueueRemaining: 0,
      meshReconcileDirty: false,
      environmentReady: true,
    },
    network: { pending: 0, epoch: 42 },
    transientVfx: {
      liveParticles: 9,
      liveSprites: 0,
      activeLights: 3,
      doctrineTellsActive: 2,
      explosionsActive: 0,
    },
    cometAdmission: {
      applicable: true,
      textureWarmReady: true,
      state: 'idle',
      visible: false,
      timer: 8,
    },
  };
  assert.equal(isScenarioMeasurementBoundaryQuiet(quiet, 4), true);
  for (const mutate of [
    (value) => { value.admission.activeAuthoredUpgradeJobs = 1; },
    (value) => { value.admission.pendingPipelineAdmissions = 1; },
    (value) => { value.admission.meshQueueRemaining = 1; },
    (value) => { value.admission.meshReconcileDirty = true; },
    (value) => { value.admission.environmentReady = false; },
    (value) => { value.network.pending = 1; },
    (value) => { value.transientVfx.liveSprites = 1; },
    (value) => { value.transientVfx.explosionsActive = 1; },
    (value) => { value.cometAdmission.textureWarmReady = false; },
    (value) => { value.cometAdmission.state = 'active'; },
    (value) => { value.cometAdmission.visible = true; },
    (value) => { value.cometAdmission.timer = 4; },
  ]) {
    const violating = structuredClone(quiet);
    mutate(violating);
    assert.equal(isScenarioMeasurementBoundaryQuiet(violating, 4), false);
  }
  const diagnosticChange = structuredClone(quiet);
  diagnosticChange.transientVfx.liveParticles = 999;
  diagnosticChange.transientVfx.activeLights = 999;
  diagnosticChange.cometAdmission.timer = 99;
  assert.equal(
    scenarioMeasurementBoundarySignature(diagnosticChange),
    scenarioMeasurementBoundarySignature(quiet),
  );

  const frozen = { tick: 210, simTime: 3.5, accumulator: 1e-8, pumpFrame: 40001 };
  assert.equal(evaluateExactResumeState(frozen, { ...frozen }).pass, true);
  for (const resumed of [
    { ...frozen, tick: 211 },
    { ...frozen, simTime: 3.6 },
    { ...frozen, accumulator: 0 },
    { ...frozen, pumpFrame: 40002 },
    { ...frozen, simTime: null },
    { ...frozen, accumulator: null },
  ]) {
    assert.equal(evaluateExactResumeState(frozen, resumed).pass, false);
  }
  assert.equal(evaluateExactResumeState(
    { tick: 210, simTime: null, accumulator: null, pumpFrame: 40001 },
    { tick: 210, simTime: null, accumulator: null, pumpFrame: 40001 },
  ).pass, false);
  assert.equal(evaluateBoundaryNetworkContinuity(
    { pending: 0, epoch: 42 },
    { pending: 0, epoch: 42 },
  ).pass, true);
  assert.equal(evaluateBoundaryNetworkContinuity(
    { pending: 0, epoch: 42 },
    { pending: 0, epoch: 43 },
  ).pass, false);
});

test('canonical matrix exposes only implemented public adapters and records every blocker', () => {
  assert.deepEqual(canonicalHarnessRunnabilitySummary(), {
    scenarioCount: 16,
    runnableCount: 2,
    notRunnableCount: 14,
    injectedStateCount: 9,
    leaseGateCount: 3,
    missingRouteAdapterCount: 2,
  });

  for (const id of ['flight_steady', 'context_recover_steady']) {
    const row = classifyPerformanceScenarioForHarness(id);
    assert.equal(row.status, PERF_SCENARIO_RUNNABILITY.RUNNABLE, id);
    assert.equal(row.blocker, null);
  }
  for (const id of ['docked_market_ui', 'jump_asset_admission']) {
    assert.equal(classifyPerformanceScenarioForHarness(id).blockerCode, 'route-adapter-missing', id);
  }
  assert.equal(classifyPerformanceScenarioForHarness('combat_vfx_burst').blockerCode, 'injected-state');
  assert.equal(classifyPerformanceScenarioForHarness('map_open').blockerCode, 'lease-gate');
  assert.equal(classifyPerformanceScenarioForHarness('invented').blockerCode, 'unknown-scenario');
});

test('matrix planner keeps blocked scenarios as rows instead of throwing or promoting them', () => {
  const compiled = completeManifest();
  const plan = planPerformanceScenarioMatrix(compiled);
  assert.equal(plan.rows.length, PERFORMANCE_SCENARIO_IDS.length);
  assert.equal(plan.runnable.length, 2);
  assert.equal(plan.notRunnable.length, 14);
  assert.deepEqual(plan.rows.map((row) => row.scenarioId), PERFORMANCE_SCENARIO_IDS);
  assert.ok(plan.notRunnable.every((row) => row.blocker && row.status === 'not-runnable'));
});

test('matrix planner rejects unknown and duplicate selectors before any browser launch', () => {
  const compiled = completeManifest();
  assert.throws(
    () => planPerformanceScenarioMatrix(compiled, ['flight_steady', 'flight_steady']),
    /duplicate performance scenario selection/,
  );
  assert.throws(
    () => planPerformanceScenarioMatrix(compiled, ['invented']),
    /not in manifest/,
  );
});

test('checked-in complete matrix is canonical and every runnable field has a harness consumer', () => {
  const document = JSON.parse(read('design/perf/scenario-manifest.json'));
  const compiled = compilePerformanceScenarioManifest(document, {
    requireCompleteMatrix: true,
    source: 'design/perf/scenario-manifest.json',
  });
  assert.deepEqual(compiled.scenarios.map((scenario) => scenario.id), PERFORMANCE_SCENARIO_IDS);
  const plan = planPerformanceScenarioMatrix(compiled);
  for (const row of plan.runnable) {
    assert.equal(assertHarnessConsumesScenarioDeclaration(row.scenario), true, row.scenarioId);
  }
  for (const row of plan.notRunnable) {
    assert.ok(row.blockerCode);
    assert.ok(row.blocker);
  }
});

test('validation broker registers the deterministic matrix and fingerprints its contracts', () => {
  const cli = read('scripts/validation-broker-cli.mjs');
  assert.ok(cli.includes(
    "'perf-scenario-determinism': () => import('./validation-manifests/perf-scenario-determinism.mjs')",
  ));
  assert.ok(cli.includes('perf-scenario-determinism'));
  for (const path of [
    ...perfScenarioDeterminismManifest.regressionSourcePaths,
    ...perfScenarioDeterminismManifest.productionSourcePaths,
    ...perfScenarioDeterminismManifest.harnessSourcePaths,
    ...perfScenarioDeterminismManifest.scenarioPaths,
  ]) {
    assert.equal(existsSync(new URL(path, ROOT)), true, `broker fingerprint path must exist: ${path}`);
  }
  assert.ok(
    perfScenarioDeterminismManifest.productionSourcePaths.includes(
      'scripts/lib/perfScenarioHarnessContracts.mjs',
    ),
  );
  assert.ok(
    perfScenarioDeterminismManifest.productionSourcePaths.includes(
      'scripts/lib/performanceCostTable.mjs',
    ),
  );
  assert.ok(
    perfScenarioDeterminismManifest.regressionSourcePaths.includes(
      'test/performance-cost-table.test.mjs',
    ),
  );
  assert.ok(
    perfScenarioDeterminismManifest.harnessSourcePaths.includes(
      'scripts/lib/releaseSoakContracts.mjs',
    ),
  );
  assert.ok(perfScenarioDeterminismManifest.productionSourcePaths.includes('src/render/vfx.js'));
  assert.ok(
    perfScenarioDeterminismManifest.regressionSourcePaths.includes(
      'test/vfx-projectile-wake-cadence.test.mjs',
    ),
  );
});

test('frame pump keeps synthetic rAF timestamps while native timing mode preserves performance.now', async () => {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let nativeClock = 100;
  const nativeNow = () => ++nativeClock;
  const fakeWindow = { performance: { now: nativeNow } };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: fakeWindow,
  });
  try {
    installDeterministicFramePump({ clockMode: 'native-timing' });
    const pump = fakeWindow.__SF_DETERMINISTIC_PUMP__;
    assert.equal(pump.clockMode, 'native-timing');
    assert.equal(fakeWindow.performance.now, nativeNow);
    const timestamps = [];
    let accumulator = 0;
    let lastTimestamp = 0;
    const stepsPerFrame = [];
    const fixedDt = 1 / 60;
    const onFrame = (timestamp) => {
      timestamps.push(timestamp);
      accumulator += (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      let steps = 0;
      while (accumulator >= fixedDt) {
        accumulator -= fixedDt;
        steps++;
      }
      stepsPerFrame.push(steps);
      fakeWindow.requestAnimationFrame(onFrame);
    };
    fakeWindow.requestAnimationFrame(onFrame);
    await pump.step(10_000);
    assert.equal(timestamps[0], 16.666667);
    assert.equal(pump.now(), 166666.67);
    assert.deepEqual([...new Set(stepsPerFrame)], [1]);
    assert.ok(pump.timingNow() > 100);
    assert.equal(pump.alignFrame(12_000), 12_000);
    assert.ok(Math.abs(pump.now() - 200000.004) < 1e-9);
    assert.throws(() => pump.alignFrame(11_999), /at or after 12000/);
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow);
    else delete globalThis.window;
  }
});

test('Tier-1 zero budgets have a positive violating snapshot control', () => {
  const green = evaluateTier1ZeroBudgets({
    totals: { shaderLinks: 0, renderTargetAllocations: 0, renderTargetResizes: 0 },
  });
  assert.equal(green.pass, true);
  assert.ok(green.results.every((result) => result.pass));

  const violating = evaluateTier1ZeroBudgets({
    totals: { shaderLinks: 1, renderTargetAllocations: 2, renderTargetResizes: 3 },
  });
  assert.equal(violating.pass, false);
  assert.deepEqual(
    violating.results.filter((result) => !result.pass).map((result) => [result.field, result.value]),
    [['shaderLinks', 1], ['renderTargetAllocations', 2], ['renderTargetResizes', 3]],
  );
});

test('deterministic fields and the exact scenario window fail closed on missing or loose evidence', () => {
  const fields = ['shaderLinks', 'bufferFullUploads'];
  assert.equal(evaluateDeterministicFieldCoverage({
    totals: { shaderLinks: 0, bufferFullUploads: 4 },
  }, fields).pass, true);
  const missing = evaluateDeterministicFieldCoverage({
    totals: { shaderLinks: 0 },
  }, fields);
  assert.equal(missing.pass, false);
  assert.deepEqual(missing.invalid, ['bufferFullUploads']);

  const exact = evaluateExactScenarioWindow({
    postBootFrames: 600,
    stepsPerFrameHistogram: { 1: 600 },
    totals: { shaderLinks: 0, drawCalls: 12 },
    postBoot: { shaderLinks: 0, drawCalls: 12 },
  }, 600);
  assert.equal(exact.pass, true);

  for (const loose of [
    { postBootFrames: 600, stepsPerFrameHistogram: { 0: 1, 1: 599 }, totals: { a: 1 }, postBoot: { a: 1 } },
    { postBootFrames: 599, stepsPerFrameHistogram: { 1: 600 }, totals: { a: 1 }, postBoot: { a: 1 } },
    { postBootFrames: 600, stepsPerFrameHistogram: { 1: 600 }, totals: { a: 1 }, postBoot: { a: 0 } },
  ]) {
    assert.equal(evaluateExactScenarioWindow(loose, 600).pass, false);
  }
});

test('candidate binding rejects a changed or malformed worktree fingerprint', () => {
  const a = { digest: 'a'.repeat(64) };
  const same = { digest: 'a'.repeat(64) };
  const changed = { digest: 'b'.repeat(64) };
  assert.equal(assertFingerprintUnchanged(a, same, 'test capture'), true);
  assert.throws(() => assertFingerprintUnchanged(a, changed, 'test capture'), /changed during capture/);
  assert.throws(() => assertFingerprintUnchanged(null, same, 'test capture'), /valid start\/end/);
});

test('failure evidence capture keeps page in catch scope and top-level failures write a matrix artifact', () => {
  const source = read('scripts/probe-perf-scenario.mjs');
  assert.match(source, /let page = null;\s*try\s*\{[\s\S]*page = await context\.newPage\(\);/);
  assert.match(source, /const runtimeEvidence = page \? await page\.evaluate/);
  assert.match(source, /spaceface\.perfScenarioMatrixRun\.v1[\s\S]*failed to write top-level failure artifact/);
});

test('quiescence samples single frames and owns outstanding browser requests', () => {
  const source = read('scripts/probe-perf-scenario.mjs');
  const quiescence = source.slice(
    source.indexOf('async function quiesce('),
    source.indexOf('async function waitForAdmissionOwnersWithoutFrames('),
  );
  assert.match(quiescence, /await stepFrames\(page, 1\);\s*pumped\+\+;/);
  assert.doesNotMatch(quiescence, /stepFrames\(page, CHUNK_FRAMES\)/);
  assert.match(quiescence, /probe\.network = snapshotPageNetworkActivity\(page\)/);
  assert.match(quiescence, /probe\.network\.pending === 0/);
  assert.match(quiescence, /probe\.admission\.environmentReady === true/);
  assert.match(quiescence, /targetedVfxSignature !== lastTargetedVfxSignature/);
  assert.match(
    quiescence,
    /const targetedVfxQuiet = probe\.admission\.transientVfx\.liveSprites === 0\s*&& probe\.admission\.transientVfx\.explosionsActive === 0/,
  );
  assert.doesNotMatch(quiescence, /const targetedVfxQuiet =[\s\S]{0,300}liveParticles/);
  assert.doesNotMatch(quiescence, /const targetedVfxQuiet =[\s\S]{0,300}activeLights/);
  assert.doesNotMatch(quiescence, /const targetedVfxQuiet =[\s\S]{0,300}doctrineTellsActive/);
  assert.match(source, /page\.on\('requestfinished'/);
  assert.match(source, /page\.on\('requestfailed'/);
  assert.match(source, /alignScenarioPresentationClock\(page, scenario\)/);
});

test('Tier-1 reset and snapshot are scoped to the digest-bound measurement interval', () => {
  const source = read('scripts/probe-perf-scenario.mjs');
  assert.match(
    source,
    /function stepFramesAndCaptureCounterSnapshot[\s\S]*page\.evaluate\(async \(k\)[\s\S]*await pump\.step\(k\);[\s\S]*getCounterSnapshot/,
  );
  const drive = source.slice(
    source.indexOf('async function driveScenarioWindow('),
    source.indexOf('function captureWindowTracePoint('),
  );
  assert.match(drive, /driveScenarioTapeRange\(page, scenario, 0, startFrame/);
  assert.match(
    drive,
    /stabilizeScenarioMeasurementBoundary\([\s\S]*scenarioStart[\s\S]*activateScenarioMeasurementBoundary\([\s\S]*'tier1'/,
  );
  assert.match(
    drive,
    /driveScenarioTapeRange\(page, scenario, startFrame, endFrame,[\s\S]*captureCounterAtEnd: true/,
  );
  assert.match(drive, /const endSnapshot = measuredRange\.counterSnapshot/);
  assert.match(drive, /driveScenarioTapeRange\(page, scenario, endFrame, frames/);
  assert.match(drive, /snapshot: endSnapshot/);
  assert.match(drive, /startSnapshot\.framesObserved !== 0 \|\| endSnapshot\.framesObserved !== frameCount/);

  const execute = source.slice(
    source.indexOf('async function executeScenarioRun('),
    source.indexOf('async function executeScenarioTimingRun('),
  );
  assert.match(execute, /const \{ measurement, snapshot \} = measuredWindow;\s*const completion/);
  assert.doesNotMatch(execute, /const snapshot = await page\.evaluate/);
});

test('Tier-1 and Tier-2 share one frame-per-task macrotask schedule', () => {
  const source = read('scripts/probe-perf-scenario.mjs');
  const drive = source.slice(
    source.indexOf('async function driveScenarioTapeRange('),
    source.indexOf('async function finalizeTimingGpuCapture('),
  );
  assert.match(drive, /captureCounterAtEnd/);
  assert.match(drive, /await stepFramesAndCaptureCounterSnapshot\(page, 1\)/);
  assert.match(drive, /await pump\?\.step\?\.\(1\)/);
  assert.match(
    drive,
    /if \(shouldYieldAfterScenarioFrame\(cursor, toFrame\)\) \{\s*await new Promise\(\(resolve\) => setTimeout\(resolve, SCENARIO_INTERFRAME_YIELD_MS\)\)/,
  );
  assert.doesNotMatch(drive, /pumpScenarioFrames/);
  assert.doesNotMatch(drive, /setTimeout\(resolve, 25\)/);
});

test('Tier-2 disables timing submission in the authored final-frame task', () => {
  const source = read('scripts/probe-perf-scenario.mjs');
  const drive = source.slice(
    source.indexOf('async function driveScenarioTapeRange('),
    source.indexOf('async function finalizeTimingGpuCapture('),
  );
  assert.match(drive, /await pump\?\.step\?\.\(1\);[\s\S]*if \(!shouldClose\)/);
  assert.match(drive, /pauseSubmissions[\s\S]*getReport[\s\S]*setSystemTimingEnabled\?\.\(false\)/);
  assert.doesNotMatch(drive, /drainPending/);

  const gpuFinalize = source.slice(
    source.indexOf('async function finalizeTimingGpuCapture('),
    source.indexOf('async function releaseScenarioKeys('),
  );
  assert.match(gpuFinalize, /drainPending[\s\S]*gpu\?\.setEnabled\?\.\(false\)/);

  const timing = source.slice(
    source.indexOf('async function executeScenarioTimingRun('),
    source.indexOf('async function bootScenarioToRoute('),
  );
  assert.match(timing, /closeTimingAtEnd: true/);
  assert.match(
    timing,
    /driveScenarioTapeRange\(page, scenario, 0, startFrame[\s\S]*stabilizeScenarioMeasurementBoundary\([\s\S]*scenarioStart[\s\S]*activateScenarioMeasurementBoundary\([\s\S]*'tier2'/,
  );
  assert.match(
    timing,
    /driveScenarioTapeRange\(page, scenario, endFrame, frames[\s\S]*collectScenarioCompletionReceipt[\s\S]*finalizeTimingGpuCapture\(page\)/,
  );
  assert.doesNotMatch(timing, /const close = await page\.evaluate/);
});

test('all runnable steady routes revalidate every owner in the atomic reset or arm task', () => {
  const source = read('scripts/probe-perf-scenario.mjs');
  const drain = source.slice(
    source.indexOf('async function captureScenarioMeasurementBoundaryState('),
    source.indexOf('/**\n * Quiescence:'),
  );
  assert.match(
    source,
    /STEADY_MEASUREMENT_BOUNDARY_SCENARIOS = new Set\(\[\s*'flight_steady',\s*'context_recover_steady'/,
  );
  assert.match(drain, /STEADY_MEASUREMENT_BOUNDARY_SCENARIOS\.has\(scenario\.id\)/);
  assert.match(drain, /freezeScenarioForQuiescence\(page, scenario\)/);
  assert.match(drain, /boundary\.network = snapshotPageNetworkActivity\(page\)/);
  assert.match(drain, /isScenarioMeasurementBoundaryQuiet\(drained, cometHorizonSeconds\)/);
  assert.match(drain, /frozenTick !== expectedTick/);
  assert.match(drain, /Number\.isFinite\(frozenSimTime\)/);
  assert.match(drain, /Number\.isFinite\(frozenAccumulator\)/);
  assert.match(drain, /signature === lastQuietSignature/);
  assert.match(drain, /quietFrames < 2/);
  assert.match(drain, /alignFrame\?\.\(targetFrame\)/);
  assert.match(drain, /aligned\.tick !== frozenTick/);
  assert.match(drain, /resumeScenarioAfterQuiescence\(page, stabilized\.freeze\)/);
  assert.match(drain, /const boundaryState = window\.__PERF_SCENARIO_CAPTURE_BOUNDARY__\?\.\(\)/);
  assert.match(drain, /tier1\.reset\(\)[\s\S]*tier1\.markBootBoundary\(\)/);
  assert.match(drain, /perf\?\.reset\?\.\(\)[\s\S]*gpu\?\.reset\?\.\(\)/);
  assert.match(drain, /evaluateBoundaryNetworkContinuity/);
  assert.match(drain, /isScenarioMeasurementBoundaryQuiet\(\s*activated/);
  assert.match(drain, /resume\.exactStatePreserved === true/);
  assert.match(drain, /activated\.pumpFrame === MEASUREMENT_ALIGNMENT_FRAME \+ 1/);
});
