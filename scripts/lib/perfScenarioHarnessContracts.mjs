import {
  PERFORMANCE_SCENARIO_IDS,
  performanceScenario,
} from './performanceClosureContracts.mjs';

export const DEFAULT_DETERMINISM_RUNS = 2;

const IMPLEMENTED_PUBLIC_ROUTE_ADAPTERS = new Set([
  'flight_steady',
  'context_recover_steady',
]);

const SCENARIO_FIRST_PLAYABLE_ANCHOR_TICKS = Object.freeze({
  flight_steady: 120,
  context_recover_steady: 180,
});

export const PERF_SCENARIO_RUNNABILITY = Object.freeze({
  RUNNABLE: 'runnable',
  NOT_RUNNABLE: 'not-runnable',
});

/**
 * Normalize route preparation onto one authored simulation age. Context restoration can complete
 * one tick earlier or later on the same host; a relative lead-in would preserve that boot jitter
 * and compare different worlds even though the measured interval itself is exact.
 */
export function resolveScenarioLeadIn(scenarioId, currentTick) {
  const anchorTick = SCENARIO_FIRST_PLAYABLE_ANCHOR_TICKS[scenarioId];
  if (!Number.isSafeInteger(anchorTick)) {
    throw new Error(`${String(scenarioId)}: no fixed first-playable anchor tick is declared`);
  }
  if (typeof currentTick !== 'number' || !Number.isSafeInteger(currentTick) || currentTick < 0) {
    throw new TypeError(`${scenarioId}: current first-playable tick must be a non-negative safe integer`);
  }
  const normalizedCurrentTick = currentTick;
  const leadInFrames = anchorTick - normalizedCurrentTick;
  if (leadInFrames < 2) {
    throw new Error(
      `${scenarioId}: first-playable lead-in cannot anchor tick ${normalizedCurrentTick} at ${anchorTick}`,
    );
  }
  return Object.freeze({
    anchorTick,
    currentTick: normalizedCurrentTick,
    leadInFrames,
  });
}


/**
 * A determinism check is a comparison, never a collection shortcut.
 * Keep collection-only probes separate so `--runs=1` cannot produce a vacuous pass.
 */
export function parseDeterminismRuns(value) {
  if (value == null) return DEFAULT_DETERMINISM_RUNS;
  if (typeof value === 'boolean' || (typeof value === 'string' && value.trim() === '')) {
    throw new TypeError('--runs must be exactly 2 for the determinism gate');
  }
  const parsed = Number(value);
  if (parsed !== DEFAULT_DETERMINISM_RUNS) {
    throw new TypeError('--runs must be exactly 2 for the determinism gate');
  }
  return parsed;
}

export function assertTraceWindowInvocation({ traceWindow, diagnostic, includeTiming } = {}) {
  if (traceWindow === true && (diagnostic !== true || includeTiming === true)) {
    throw new Error('--trace-window is diagnostic Tier-1 evidence only; require --diagnostic and omit --timing');
  }
  return true;
}

export function deriveContextRouteReplay(tier1Runs) {
  if (!Array.isArray(tier1Runs) || tier1Runs.length !== DEFAULT_DETERMINISM_RUNS) {
    throw new TypeError('context timing replay requires both Tier-1 determinism runs');
  }
  const staging = tier1Runs.map((run, index) => {
    if (run?.route?.route !== 'webgl-context-loss-restore' || !run.route.sourceStaging) {
      throw new Error(`Tier-1 run ${index + 1} is missing context source-staging evidence`);
    }
    return run.route.sourceStaging;
  });
  const kicked = staging.map((entry, index) => {
    const decision = entry.sourceReconcileKick?.kicked;
    if (typeof decision !== 'boolean') {
      throw new Error(`Tier-1 run ${index + 1} is missing an explicit source reconcile decision`);
    }
    return decision;
  });
  if (new Set(kicked).size !== 1) {
    throw new Error(`Tier-1 context source reconcile decisions differ: ${kicked.join(',')}`);
  }
  const sourceReconcileKicked = kicked[0];
  const requiredStageFields = [
    'sourceInitialQuiescence',
    'recoverySourceQuiescence',
    'postRestoreQuiescence',
  ];
  for (const [index, entry] of staging.entries()) {
    const sourceFinalPresent = entry.sourceFinalQuiescence != null;
    if (sourceFinalPresent !== sourceReconcileKicked) {
      throw new Error(
        `Tier-1 run ${index + 1} sourceFinalQuiescence presence does not match reconcile decision`,
      );
    }
    for (const field of [
      ...requiredStageFields,
      ...(sourceReconcileKicked ? ['sourceFinalQuiescence'] : []),
    ]) {
      assertTier1ContextQuiescenceReceipt(entry[field], field, index);
    }
  }
  const quiescenceHorizons = new Set(staging.flatMap((entry) => [
    entry.sourceInitialQuiescence.quiescenceFrames,
    entry.recoverySourceQuiescence.quiescenceFrames,
    entry.postRestoreQuiescence.quiescenceFrames,
    ...(sourceReconcileKicked ? [entry.sourceFinalQuiescence.quiescenceFrames] : []),
  ]));
  if (quiescenceHorizons.size !== 1) {
    throw new Error(`Tier-1 context quiescence horizons differ: ${[...quiescenceHorizons].join(',')}`);
  }
  const quiescenceFrames = [...quiescenceHorizons][0];
  const maxFrames = (field) => Math.max(...staging.map((entry, index) => {
    const frames = entry?.[field]?.quiescencePumpedFrames;
    if (!Number.isSafeInteger(frames) || frames < 1) {
      throw new Error(`Tier-1 run ${index + 1} has invalid ${field} frame evidence`);
    }
    return frames;
  }));
  const observed = (field, label, read, valid) => Object.freeze([...new Set(
    staging.map((entry, index) => {
      const value = read(entry?.[field]);
      if (!valid(value)) {
        throw new Error(`Tier-1 run ${index + 1} has invalid ${field} ${label} evidence`);
      }
      return value;
    }),
  )].sort((a, b) => Number(a) - Number(b)));
  const stageEvidence = (field) => Object.freeze({
    rendererPrograms: observed(
      field,
      'renderer-program',
      (receipt) => receipt?.rendererProgramsAtBoundary,
      (value) => Number.isSafeInteger(value) && value > 0,
    ),
    meshReconcileDirty: observed(
      field,
      'mesh-reconcile',
      (receipt) => receipt?.admissionAtBoundary?.meshReconcileDirty,
      (value) => typeof value === 'boolean',
    ),
    networkTuples: Object.freeze([...new Map(staging.map((entry) => {
      const network = entry?.[field]?.networkAtBoundary;
      const tuple = Object.freeze({
        epoch: network.epoch,
        started: network.started,
        finished: network.finished,
        failed: network.failed,
      });
      return [JSON.stringify(tuple), tuple];
    })).values()]),
  });

  const replay = {
    framePolicy: 'tier1-max-as-minimum-with-one-quiet-horizon',
    quiescenceFrames,
    minimumFrames: Object.freeze({
      sourceInitial: maxFrames('sourceInitialQuiescence'),
      sourceFinal: sourceReconcileKicked ? maxFrames('sourceFinalQuiescence') : 0,
      recoverySource: maxFrames('recoverySourceQuiescence'),
      postRestore: maxFrames('postRestoreQuiescence'),
    }),
    sourceReconcileKicked,
    stageEvidence: Object.freeze({
      sourceInitial: stageEvidence('sourceInitialQuiescence'),
      sourceFinal: sourceReconcileKicked
        ? stageEvidence('sourceFinalQuiescence')
        : null,
      recoverySource: stageEvidence('recoverySourceQuiescence'),
      postRestore: stageEvidence('postRestoreQuiescence'),
    }),
  };
  return Object.freeze(replay);
}

function assertTier1ContextQuiescenceReceipt(receipt, field, index) {
  const fail = (detail) => {
    throw new Error(`Tier-1 run ${index + 1} has invalid ${field} ${detail} evidence`);
  };
  if (!receipt || typeof receipt !== 'object') fail('receipt');
  const horizon = receipt.quiescenceFrames;
  if (receipt.predicate !== 'quiescence'
    || !Number.isSafeInteger(horizon) || horizon < 1
    || !Number.isSafeInteger(receipt.minimumFrames) || receipt.minimumFrames < horizon
    || !Number.isSafeInteger(receipt.quiescencePumpedFrames)
    || receipt.quiescencePumpedFrames < receipt.minimumFrames
    || !Number.isSafeInteger(receipt.activityQuietFrames)
    || receipt.activityQuietFrames < horizon
    || receipt.activityQuietFrames > receipt.quiescencePumpedFrames) {
    fail('quiet-tail');
  }
  if (!Number.isSafeInteger(receipt.rendererProgramsAtBoundary)
    || receipt.rendererProgramsAtBoundary < 1) {
    fail('renderer-program');
  }
  const admission = receipt.admissionAtBoundary;
  const targetedVfx = admission?.transientVfx;
  if (admission?.activeAuthoredUpgradeJobs !== 0
    || admission?.pendingPipelineAdmissions !== 0
    || admission?.meshQueueRemaining !== 0
    || typeof admission?.meshReconcileDirty !== 'boolean'
    || admission?.environmentReady !== true
    || targetedVfx?.liveSprites !== 0
    || targetedVfx?.explosionsActive !== 0) {
    fail('admission-boundary');
  }
  const network = receipt.networkAtBoundary;
  if (!Number.isSafeInteger(network?.epoch) || network.epoch < 0
    || !Number.isSafeInteger(network?.started) || network.started < 0
    || !Number.isSafeInteger(network?.finished) || network.finished < 0
    || !Number.isSafeInteger(network?.failed) || network.failed < 0
    || network?.pending !== 0
    || network.failed !== 0
    || network.started !== network.finished
    || network.epoch !== network.started + network.finished + network.failed) {
    fail('network-boundary');
  }
}

export function evaluateContextRouteStagingReplay({
  expected,
  actual,
  quiescenceFrames,
  maximumFrames,
} = {}) {
  if (!Number.isSafeInteger(quiescenceFrames) || quiescenceFrames < 1
    || !Number.isSafeInteger(maximumFrames) || maximumFrames < quiescenceFrames) {
    throw new TypeError('context staging replay requires valid quiescence/max frame bounds');
  }
  const summarize = (receipt) => (receipt ? {
    predicate: receipt.predicate ?? null,
    quiescenceFrames: receipt.quiescenceFrames ?? null,
    minimumFrames: receipt.minimumFrames ?? null,
    quiescencePumpedFrames: receipt.quiescencePumpedFrames ?? null,
    activityQuietFrames: receipt.activityQuietFrames ?? null,
    rendererProgramsAtBoundary: receipt.rendererProgramsAtBoundary ?? null,
    admissionAtBoundary: receipt.admissionAtBoundary ?? null,
    networkAtBoundary: receipt.networkAtBoundary ?? null,
  } : null);
  const summarizedActual = {
    sourceInitial: summarize(actual?.sourceInitial),
    sourceFinal: summarize(actual?.sourceFinal),
    recoverySource: summarize(actual?.recoverySource),
    postRestore: summarize(actual?.postRestore),
    sourceReconcileKicked: actual?.sourceReconcileKicked === true,
  };
  if (!expected) {
    return Object.freeze({
      applicable: false,
      expected: null,
      actual: summarizedActual,
      stages: null,
      pass: true,
    });
  }
  if (expected.quiescenceFrames !== quiescenceFrames) {
    return Object.freeze({
      applicable: true,
      policy: expected.framePolicy,
      expected,
      actual: summarizedActual,
      reconcileDecisionMatches: false,
      stages: null,
      pass: false,
    });
  }

  const stageDefinitions = [
    ['sourceInitial', true],
    ['sourceFinal', expected.sourceReconcileKicked === true],
    ['recoverySource', true],
    ['postRestore', true],
  ];
  const stageChecks = {};
  for (const [stage, required] of stageDefinitions) {
    const receipt = actual?.[stage] ?? null;
    if (!required) {
      stageChecks[stage] = Object.freeze({
        required: false,
        present: receipt != null,
        pass: receipt == null,
      });
      continue;
    }
    const minimum = expected?.minimumFrames?.[stage];
    const upperBound = Number.isSafeInteger(minimum)
      ? Math.min(maximumFrames, minimum + quiescenceFrames)
      : null;
    const admission = receipt?.admissionAtBoundary;
    const targetedVfx = admission?.transientVfx;
    const network = receipt?.networkAtBoundary;
    const observed = expected?.stageEvidence?.[stage];
    const checks = {
      present: receipt != null,
      predicate: receipt?.predicate === 'quiescence',
      quiescenceFrames: receipt?.quiescenceFrames === quiescenceFrames,
      minimumReceiptMatches: receipt?.minimumFrames === minimum,
      boundedFrames: Number.isSafeInteger(receipt?.quiescencePumpedFrames)
        && Number.isSafeInteger(minimum)
        && receipt.quiescencePumpedFrames >= minimum
        && receipt.quiescencePumpedFrames <= upperBound,
      activityQuiet: Number.isSafeInteger(receipt?.activityQuietFrames)
        && receipt.activityQuietFrames >= quiescenceFrames
        && receipt.activityQuietFrames <= receipt.quiescencePumpedFrames,
      admissionQuiet: admission?.activeAuthoredUpgradeJobs === 0
        && admission?.pendingPipelineAdmissions === 0
        && admission?.meshQueueRemaining === 0
        && admission?.environmentReady === true
        && targetedVfx?.liveSprites === 0
        && targetedVfx?.explosionsActive === 0,
      meshReconcileParity: observed?.meshReconcileDirty?.includes(
        admission?.meshReconcileDirty,
      ) === true,
      networkQuiet: Number.isSafeInteger(network?.epoch)
        && Number.isSafeInteger(network?.started)
        && Number.isSafeInteger(network?.finished)
        && Number.isSafeInteger(network?.failed)
        && network.pending === 0
        && network.failed === 0
        && network.started === network.finished
        && network.epoch === network.started + network.finished + network.failed,
      networkParity: observed?.networkTuples?.some((tuple) => (
        tuple.epoch === network?.epoch
        && tuple.started === network?.started
        && tuple.finished === network?.finished
        && tuple.failed === network?.failed
      )) === true,
      programParity: observed?.rendererPrograms?.includes(
        receipt?.rendererProgramsAtBoundary,
      ) === true,
    };
    stageChecks[stage] = Object.freeze({
      required: true,
      minimumFrames: minimum,
      maximumFrames: upperBound,
      overrunFrames: Number.isSafeInteger(receipt?.quiescencePumpedFrames)
        && Number.isSafeInteger(minimum)
        ? receipt.quiescencePumpedFrames - minimum
        : null,
      ...checks,
      pass: Object.values(checks).every((value) => value === true),
    });
  }
  const reconcileDecisionMatches = typeof actual?.sourceReconcileKicked === 'boolean'
    && actual.sourceReconcileKicked === expected.sourceReconcileKicked;
  const pass = reconcileDecisionMatches
    && Object.values(stageChecks).every((stage) => stage.pass === true);
  return Object.freeze({
    applicable: true,
    policy: expected.framePolicy,
    expected,
    actual: summarizedActual,
    reconcileDecisionMatches,
    stages: Object.freeze(stageChecks),
    pass,
  });
}

/**
 * Classify from the canonical scenario authority. These blockers are evidence, not failures:
 * the harness records them as explicit not-runnable rows and never synthesizes their state.
 */
export function classifyPerformanceScenarioForHarness(scenarioId) {
  const definition = performanceScenario(scenarioId);
  if (!definition) {
    return Object.freeze({
      scenarioId,
      status: PERF_SCENARIO_RUNNABILITY.NOT_RUNNABLE,
      blockerCode: 'unknown-scenario',
      blocker: `scenario ${String(scenarioId)} is not in the canonical performance matrix`,
      definition: null,
    });
  }
  if (definition.leaseGate) {
    return Object.freeze({
      scenarioId,
      status: PERF_SCENARIO_RUNNABILITY.NOT_RUNNABLE,
      blockerCode: 'lease-gate',
      blocker: `lease-gated on "${definition.leaseGate}"`,
      definition,
    });
  }
  if (definition.injectedState) {
    return Object.freeze({
      scenarioId,
      status: PERF_SCENARIO_RUNNABILITY.NOT_RUNNABLE,
      blockerCode: 'injected-state',
      blocker: 'requires injected state; the deterministic public-route harness does not synthesize it',
      definition,
    });
  }
  if (!IMPLEMENTED_PUBLIC_ROUTE_ADAPTERS.has(scenarioId)) {
    return Object.freeze({
      scenarioId,
      status: PERF_SCENARIO_RUNNABILITY.NOT_RUNNABLE,
      blockerCode: 'route-adapter-missing',
      blocker: `canonical public route "${scenarioId}" has no deterministic harness adapter yet`,
      definition,
    });
  }
  return Object.freeze({
    scenarioId,
    status: PERF_SCENARIO_RUNNABILITY.RUNNABLE,
    blockerCode: null,
    blocker: null,
    definition,
  });
}

/**
 * Select and classify compiled manifest rows without throwing merely because a declared scenario
 * is blocked. Unknown or duplicate selectors still fail: those are caller errors, not evidence.
 */
export function planPerformanceScenarioMatrix(compiledManifest, requestedIds = null) {
  if (!compiledManifest || !Array.isArray(compiledManifest.scenarios)) {
    throw new TypeError('compiled performance scenario manifest with scenarios is required');
  }
  const byId = new Map(compiledManifest.scenarios.map((scenario) => [scenario.id, scenario]));
  const ids = requestedIds == null
    ? compiledManifest.scenarios.map((scenario) => scenario.id)
    : requestedIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new TypeError('at least one performance scenario must be selected');
  }

  const seen = new Set();
  const rows = ids.map((scenarioId) => {
    if (typeof scenarioId !== 'string' || !scenarioId) {
      throw new TypeError('selected performance scenario ids must be non-empty strings');
    }
    if (seen.has(scenarioId)) throw new Error(`duplicate performance scenario selection: ${scenarioId}`);
    seen.add(scenarioId);
    const scenario = byId.get(scenarioId);
    if (!scenario) {
      throw new Error(
        `scenario selection ${scenarioId} is not in manifest [${[...byId.keys()].join(', ')}]`,
      );
    }
    return Object.freeze({
      scenario,
      ...classifyPerformanceScenarioForHarness(scenarioId),
    });
  });

  return Object.freeze({
    rows: Object.freeze(rows),
    runnable: Object.freeze(rows.filter((row) => row.status === PERF_SCENARIO_RUNNABILITY.RUNNABLE)),
    notRunnable: Object.freeze(rows.filter((row) => row.status === PERF_SCENARIO_RUNNABILITY.NOT_RUNNABLE)),
  });
}

/**
 * Fail closed when a runnable manifest declares a field this browser adapter would otherwise hash
 * and silently ignore. Expand this contract only in the same change that adds the real consumer.
 */
export function assertHarnessConsumesScenarioDeclaration(scenario) {
  if (scenario?.save?.kind !== 'new-game') {
    throw new Error(`scenario ${scenario?.id}: harness route adapter only consumes save.kind="new-game"`);
  }
  if (scenario.entityMultiplier !== 1) {
    throw new Error(`scenario ${scenario.id}: entityMultiplier=${scenario.entityMultiplier} has no public-route consumer`);
  }
  if ((scenario.inputTape?.frames || []).length > 0) {
    throw new Error(`scenario ${scenario.id}: inputTape.frames are declared but this browser adapter does not consume them`);
  }
  if ((scenario.cameraTape || []).length > 0) {
    throw new Error(`scenario ${scenario.id}: cameraTape records are declared but this browser adapter does not consume them`);
  }
  const measurementStart = Number(scenario.measurementWindow?.startFrame);
  const measurementFrames = Number(scenario.measurementWindow?.frameCount);
  const completionFrames = Number(scenario.expectedRouteCompletion?.value);
  if (!Number.isSafeInteger(measurementStart) || measurementStart < 0
    || !Number.isSafeInteger(measurementFrames) || measurementFrames < 1 || measurementFrames > 180
    || measurementStart + measurementFrames > completionFrames) {
    throw new Error(`scenario ${scenario.id}: measurementWindow is not a consumed completion-contained <=180-frame window`);
  }
  for (const event of scenario.inputTape?.events || []) {
    if (!event.code || typeof event.pressed !== 'boolean' || event.keys != null) {
      throw new Error(`scenario ${scenario.id}: only explicit keyboard code/pressed events are consumed`);
    }
  }
  return true;
}

export function evaluateTier1ZeroBudgets(snapshot) {
  const totals = snapshot?.totals || {};
  const definitions = [
    ['post-boot-shader-links-zero', 'shaderLinks', 0],
    ['post-boot-render-target-allocations-zero', 'renderTargetAllocations', 0],
    ['post-boot-render-target-resizes-zero', 'renderTargetResizes', 0],
  ];
  const results = definitions.map(([id, field, limit]) => {
    const value = Number(totals[field]);
    return Object.freeze({
      id,
      field,
      value: Number.isFinite(value) ? value : null,
      operator: '<=',
      limit,
      pass: Number.isFinite(value) && value <= limit,
    });
  });
  return Object.freeze({
    pass: results.every((result) => result.pass),
    results: Object.freeze(results),
  });
}

export function evaluateDeterministicFieldCoverage(snapshot, fields) {
  const totals = snapshot?.totals;
  const required = Array.isArray(fields) ? fields : [];
  const invalid = required.filter((field) => {
    const value = totals?.[field];
    return !Number.isSafeInteger(value) || value < 0;
  });
  return Object.freeze({
    pass: invalid.length === 0,
    requiredCount: required.length,
    invalid: Object.freeze(invalid),
  });
}

export function evaluateExactScenarioWindow(snapshot, frames) {
  const expectedFrames = Number(frames);
  const histogram = snapshot?.stepsPerFrameHistogram || {};
  const nonZeroBuckets = Object.entries(histogram)
    .filter(([, count]) => Number(count) !== 0)
    .map(([steps, count]) => [String(steps), Number(count)]);
  const oneStepCount = Number(histogram['1'] || 0);
  const totals = snapshot?.totals && typeof snapshot.totals === 'object' ? snapshot.totals : {};
  const postBoot = snapshot?.postBoot && typeof snapshot.postBoot === 'object' ? snapshot.postBoot : {};
  const counterKeys = [...new Set([...Object.keys(totals), ...Object.keys(postBoot)])].sort();
  const mismatchedCounterKeys = counterKeys.filter((key) => totals[key] !== postBoot[key]);
  const results = [
    Object.freeze({
      id: 'one-step-per-frame-exact',
      pass: Number.isSafeInteger(expectedFrames)
        && oneStepCount === expectedFrames
        && nonZeroBuckets.length === 1
        && nonZeroBuckets[0][0] === '1',
      detail: `stepsPerFrameHistogram=${JSON.stringify(histogram)} expected exactly {"1":${expectedFrames}}`,
    }),
    Object.freeze({
      id: 'post-boot-frame-count-exact',
      pass: snapshot?.postBootFrames === expectedFrames,
      detail: `postBootFrames=${snapshot?.postBootFrames ?? 'missing'} vs declared ${expectedFrames}`,
    }),
    Object.freeze({
      id: 'window-is-entirely-post-boot',
      pass: counterKeys.length > 0 && mismatchedCounterKeys.length === 0,
      detail: mismatchedCounterKeys.length === 0
        ? `${counterKeys.length} totals fields equal postBoot`
        : `totals/postBoot mismatch: ${mismatchedCounterKeys.join(', ')}`,
    }),
  ];
  return Object.freeze({
    pass: results.every((result) => result.pass),
    results: Object.freeze(results),
  });
}

export function assertFingerprintUnchanged(expected, current, label = 'candidate') {
  const before = expected?.digest;
  const after = current?.digest;
  if (!/^[a-f0-9]{64}$/i.test(before || '') || !/^[a-f0-9]{64}$/i.test(after || '')) {
    throw new Error(`${label}: valid start/end worktree fingerprints are required`);
  }
  if (before !== after) {
    throw new Error(`${label}: worktree fingerprint changed during capture (${before} -> ${after})`);
  }
  return true;
}

/**
 * Select the events consumed by one half-open scenario slice. Keeping this rule pure and shared
 * makes boundary events executable contract evidence instead of a source-shape convention.
 */
export function selectScenarioTapeEvents(events, fromFrame, toFrame) {
  if (!Number.isSafeInteger(fromFrame) || !Number.isSafeInteger(toFrame)
    || fromFrame < 0 || toFrame < fromFrame) {
    throw new TypeError(`invalid scenario tape range [${fromFrame}, ${toFrame})`);
  }
  if (!Array.isArray(events)) throw new TypeError('scenario tape events must be an array');
  return Object.freeze(events
    .filter((event) => Number.isSafeInteger(event?.tick)
      && event.tick >= fromFrame
      && event.tick < toFrame)
    .sort((a, b) => (a.tick - b.tick) || (a.sequence - b.sequence)));
}

export function shouldYieldAfterScenarioFrame(cursor, toFrame) {
  if (!Number.isSafeInteger(cursor) || !Number.isSafeInteger(toFrame)) {
    throw new TypeError('scenario frame cursor and range end must be safe integers');
  }
  return cursor < toFrame;
}

export function shouldContinueScenarioMeasurementDrain({
  presentationFramesPumped,
  fixedFrames,
} = {}) {
  for (const [name, value] of Object.entries({
    presentationFramesPumped,
    fixedFrames,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative safe integer`);
    }
  }
  return presentationFramesPumped < fixedFrames;
}

export function isCometPhaseSafeForPresentationHorizon(comet, horizonSeconds) {
  const horizon = Number(horizonSeconds);
  if (!Number.isFinite(horizon) || horizon < 0) return false;
  if (comet?.applicable === false) return true;
  return comet?.applicable === true
    && comet.state === 'idle'
    && comet.visible === false
    && typeof comet.timer === 'number'
    && Number.isFinite(comet.timer)
    && comet.timer > horizon;
}

export function isCompletedCometReset(before, after) {
  const beforeTimer = before?.timer;
  const afterTimer = after?.timer;
  return before?.applicable === true
    && before?.state === 'active'
    && before?.visible === true
    && typeof beforeTimer === 'number'
    && Number.isFinite(beforeTimer)
    && after?.applicable === true
    && after?.state === 'idle'
    && after?.visible === false
    && typeof afterTimer === 'number'
    && Number.isFinite(afterTimer)
    && afterTimer > beforeTimer;
}

/**
 * Exact combined owner predicate at a measured steady-state boundary. Particles, lights, and
 * doctrine tells are intentionally diagnostic-only: only the diagnosed sprite/explosion one-shot
 * owners are zero-gated.
 */
export function isScenarioMeasurementBoundaryQuiet(state, cometHorizonSeconds = 0) {
  const horizon = Number(cometHorizonSeconds);
  if (!Number.isFinite(horizon) || horizon < 0) return false;
  const comet = state?.cometAdmission;
  const cometReady = isCometPhaseSafeForPresentationHorizon(comet, horizon)
    && (comet?.applicable === false || comet?.textureWarmReady === true);
  return state?.admission?.activeAuthoredUpgradeJobs === 0
    && state?.admission?.pendingPipelineAdmissions === 0
    && state?.admission?.meshQueueRemaining === 0
    && state?.admission?.meshReconcileDirty === false
    && state?.admission?.environmentReady === true
    && state?.network?.pending === 0
    && state?.transientVfx?.liveSprites === 0
    && state?.transientVfx?.explosionsActive === 0
    && cometReady;
}

export function scenarioMeasurementBoundarySignature(state) {
  const comet = state?.cometAdmission;
  return JSON.stringify({
    admission: state?.admission ?? null,
    network: {
      pending: state?.network?.pending ?? null,
      epoch: state?.network?.epoch ?? null,
    },
    targetedVfx: {
      liveSprites: state?.transientVfx?.liveSprites ?? null,
      explosionsActive: state?.transientVfx?.explosionsActive ?? null,
    },
    comet: {
      applicable: comet?.applicable ?? null,
      textureWarmReady: comet?.textureWarmReady ?? null,
      state: comet?.state ?? null,
      visible: comet?.visible ?? null,
    },
  });
}

export function evaluateExactResumeState(beforeResume, resumed) {
  const requiredFinite = [
    beforeResume?.simTime,
    beforeResume?.accumulator,
    resumed?.simTime,
    resumed?.accumulator,
  ].every(Number.isFinite);
  const exactStatePreserved = Number.isSafeInteger(beforeResume?.tick)
    && Number.isSafeInteger(beforeResume?.pumpFrame)
    && Number.isSafeInteger(resumed?.tick)
    && Number.isSafeInteger(resumed?.pumpFrame)
    && requiredFinite
    && resumed.tick === beforeResume.tick
    && resumed.simTime === beforeResume.simTime
    && resumed.accumulator === beforeResume.accumulator
    && resumed.pumpFrame === beforeResume.pumpFrame;
  return Object.freeze({
    pass: exactStatePreserved,
    exactStatePreserved,
  });
}

export function evaluateBoundaryNetworkContinuity(before, after) {
  const pass = Number.isSafeInteger(before?.epoch)
    && Number.isSafeInteger(after?.epoch)
    && before.pending === 0
    && after.pending === 0
    && before.epoch === after.epoch;
  return Object.freeze({ pass });
}

export function canonicalHarnessRunnabilitySummary() {
  const rows = PERFORMANCE_SCENARIO_IDS.map(classifyPerformanceScenarioForHarness);
  return Object.freeze({
    scenarioCount: rows.length,
    runnableCount: rows.filter((row) => row.status === PERF_SCENARIO_RUNNABILITY.RUNNABLE).length,
    notRunnableCount: rows.filter((row) => row.status === PERF_SCENARIO_RUNNABILITY.NOT_RUNNABLE).length,
    injectedStateCount: rows.filter((row) => row.blockerCode === 'injected-state').length,
    leaseGateCount: rows.filter((row) => row.blockerCode === 'lease-gate').length,
    missingRouteAdapterCount: rows.filter((row) => row.blockerCode === 'route-adapter-missing').length,
  });
}
