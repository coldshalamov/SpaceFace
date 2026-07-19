import {
  PERFORMANCE_BUDGETS,
  PERFORMANCE_SCENARIO_IDS,
  validatePerformanceClosureReport,
} from './performanceClosureContracts.mjs';

export const PERFORMANCE_FINAL_ACCEPTANCE_SCHEMA = 'spaceface.performanceFinalAcceptance.v1';
export const PERFORMANCE_FINAL_ACCEPTANCE_RUNS = 3;

const PROFILE_SCHEMA = 'spaceface.performanceProfile.v1';
const STEADY_RESIDENCY_SCENARIOS = new Set([
  'flight_steady',
  'station_visible_steady',
  'map_interaction_steady',
]);

export function evaluatePerformanceFinalAcceptance({
  expectedCommit,
  currentWorktree,
  profiles = [],
  matrices = [],
} = {}) {
  const failures = [];
  if (!/^[a-f0-9]{40}$/i.test(String(expectedCommit || ''))) {
    failures.push('expectedCommit must be an exact 40-character commit');
  }
  validateCurrentWorktree(currentWorktree, expectedCommit, failures);
  requireExactRunCount('profiles', profiles, failures);
  requireExactRunCount('matrices', matrices, failures);

  const profileRuns = profiles.map((input, index) => validateProfile(input, index, expectedCommit, failures));
  const matrixRuns = matrices.map((input, index) => validateMatrix(input, index, expectedCommit, failures));

  validateUniqueReceipts('profiles', profiles, failures);
  validateUniqueReceipts('matrices', matrices, failures);
  validateChronology('profiles', profileRuns, failures);
  validateChronology('matrices', matrixRuns, failures);
  validateComparableProfiles(profileRuns, failures);
  validateComparableMatrices(matrixRuns, failures);

  return {
    schema: PERFORMANCE_FINAL_ACCEPTANCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    expectedCommit: expectedCommit || null,
    requiredConsecutiveRuns: PERFORMANCE_FINAL_ACCEPTANCE_RUNS,
    evidenceSemantics: {
      profiles: 'primary-player-route-acceptance',
      matrices: 'diagnostic-controlled-scenario-coverage',
      diagnosticCannotWaivePrimaryBudgets: true,
    },
    worktree: currentWorktree || null,
    profiles: profileRuns,
    matrices: matrixRuns,
    pass: failures.length === 0,
    failures: [...new Set(failures)],
  };
}

function validateCurrentWorktree(worktree, expectedCommit, failures) {
  if (!worktree || typeof worktree !== 'object') {
    failures.push('current clean worktree fingerprint is required');
    return;
  }
  if (worktree.head !== expectedCommit) failures.push('current worktree commit does not match expectedCommit');
  if (!nonempty(worktree.branch)) failures.push('current worktree branch is required');
  if (worktree.changedFileCount !== 0) failures.push('current worktree must be clean');
  if (!/^[a-f0-9]{64}$/i.test(String(worktree.digest || ''))) failures.push('current worktree SHA-256 digest is required');
}

function validateProfile(input, index, expectedCommit, failures) {
  const prefix = `profiles[${index}]`;
  validateInputReceipt(input, prefix, failures);
  const profile = input?.document;
  if (!profile || typeof profile !== 'object') {
    failures.push(`${prefix} document is required`);
    return profileSummary(input, null, false, null);
  }
  if (profile.schema !== PROFILE_SCHEMA) failures.push(`${prefix}.schema must be ${PROFILE_SCHEMA}`);
  if (!isIso8601(profile.generatedAt)) failures.push(`${prefix}.generatedAt must be ISO 8601`);
  if (profile.runner?.strict !== true) failures.push(`${prefix} must be a strict profile`);
  if (profile.runner?.headless !== false) failures.push(`${prefix} must use a headed browser`);
  if (!Number.isInteger(profile.runner?.seed)) failures.push(`${prefix} runner seed is required`);
  if (!positive(profile.runner?.width) || !positive(profile.runner?.height)) failures.push(`${prefix} viewport is required`);
  if (profile.qualityPreserving?.settingsOverridesApplied !== false) failures.push(`${prefix} changed default quality settings`);
  if (Object.keys(profile.qualityPreserving?.appliedOverrides || {}).length !== 0) failures.push(`${prefix} applied quality overrides`);
  const renderScale = profile.runner?.renderScale || {};
  for (const key of ['requested', 'applied', 'restored', 'profileRestored']) {
    if (renderScale[key] != null) failures.push(`${prefix}.runner.renderScale.${key} must be null at default quality`);
  }
  validateProfileWorktree(profile.worktree, prefix, expectedCommit, failures);

  if (!Array.isArray(profile.scenarios) || profile.scenarios.length !== 1) {
    failures.push(`${prefix} must contain exactly one primary crowded-flight scenario`);
  }
  const scenario = profile.scenarios?.find((entry) => entry?.name === 'crowded-flight') || profile.scenarios?.[0];
  if (scenario?.name !== 'crowded-flight') failures.push(`${prefix} must capture crowded-flight`);
  if (scenario?.pass !== true) failures.push(`${prefix} crowded-flight scenario did not pass`);
  if (scenario?.qualityAssertions?.pass !== true
    || scenario?.qualityAssertions?.settingsChanged !== false
    || scenario?.qualityAssertions?.noValueReducingOverrides !== true) {
    failures.push(`${prefix} did not preserve authored default quality`);
  }
  if (!nonempty(scenario?.browser?.userAgent) || !nonempty(scenario?.browser?.gpu)) {
    failures.push(`${prefix} browser/GPU identity is required`);
  }
  if (profile.summary?.pass !== true) failures.push(`${prefix}.summary.pass must be true`);

  requireProfileBudget(scenario, 'raf.frame.p95.target', '<=', PERFORMANCE_BUDGETS.targetFrameP95Ms, prefix, failures);
  requireProfileBudget(scenario, 'raf.frame.hitchesOver32.max', '<=', 0, prefix, failures, { prefixMatch: true });
  requireProfileBudget(scenario, 'raf.frame.p95.floor', '<=', 34.3, prefix, failures);
  requireProfileBudget(scenario, 'autosave.maxBlockingSlice.max', '<=', PERFORMANCE_BUDGETS.autosaveHardBlockingSliceMs, prefix, failures);
  requireProfileBudget(scenario, 'heap.growth.mb', '<=', 30, prefix, failures);
  requireProfileBudget(scenario, 'content.authoredShipFallbacks.max', '<=', 0, prefix, failures);
  requireProfileBudget(scenario, 'post.renderTargetAllocationsDuringSample.max', '<=', 0, prefix, failures);

  const runPass = !failures.some((failure) => failure.startsWith(prefix));
  return profileSummary(input, profile, runPass, profileComparisonKey(profile, scenario));
}

function validateProfileWorktree(worktree, prefix, expectedCommit, failures) {
  if (!worktree || typeof worktree !== 'object') {
    failures.push(`${prefix} exact worktree binding is required`);
    return;
  }
  if (worktree.commit !== expectedCommit) failures.push(`${prefix} commit does not match expectedCommit`);
  if (!nonempty(worktree.branch)) failures.push(`${prefix} branch is required`);
  if (worktree.dirty !== false || worktree.stable !== true) failures.push(`${prefix} worktree must be clean and stable`);
  const start = worktree.start;
  const end = worktree.end;
  if (!start || !end) failures.push(`${prefix} start/end worktree fingerprints are required`);
  else if (start.head !== expectedCommit || end.head !== expectedCommit
    || start.branch !== end.branch || start.digest !== end.digest
    || start.changedFileCount !== 0 || end.changedFileCount !== 0) {
    failures.push(`${prefix} worktree identity changed during capture`);
  }
}

function requireProfileBudget(scenario, name, operator, limit, prefix, failures, { prefixMatch = false } = {}) {
  const row = scenario?.budgets?.find((entry) => prefixMatch ? entry?.name?.startsWith(name) : entry?.name === name);
  if (!row) {
    failures.push(`${prefix} missing required budget ${name}`);
    return;
  }
  if (row.pass !== true || row.op !== operator || !Number.isFinite(row.value) || row.value > limit || row.limit > limit) {
    failures.push(`${prefix} budget ${row.name} failed the literal ${operator} ${limit} contract`);
  }
}

function validateMatrix(input, index, expectedCommit, failures) {
  const prefix = `matrices[${index}]`;
  validateInputReceipt(input, prefix, failures);
  const report = input?.document;
  if (!report || typeof report !== 'object') {
    failures.push(`${prefix} document is required`);
    return matrixSummary(input, null, false, new Map());
  }
  const validation = validatePerformanceClosureReport(report);
  for (const failure of validation.failures) failures.push(`${prefix}: ${failure}`);
  if (input.artifactValidation?.pass !== true) {
    failures.push(`${prefix} referenced artifacts failed content-hash validation`);
    for (const failure of input.artifactValidation?.failures || []) failures.push(`${prefix}: ${failure}`);
  }
  const worktree = report.worktree;
  if (worktree?.commit !== expectedCommit) failures.push(`${prefix} commit does not match expectedCommit`);
  if (worktree?.dirty !== false
    || worktree?.fingerprints?.start?.changedFileCount !== 0
    || worktree?.fingerprints?.end?.changedFileCount !== 0) {
    failures.push(`${prefix} worktree must be clean throughout capture`);
  }
  for (const key of ['pageErrors', 'requestFailures', 'httpErrors', 'consoleErrors', 'glErrors', 'warnings']) {
    if (!Array.isArray(report.errors?.[key]) || report.errors[key].length !== 0) failures.push(`${prefix} contains ${key}`);
  }

  const baselines = (report.windows || []).filter((window) => window?.diagnosticVariant === 'baseline');
  const ids = baselines.map((window) => window?.scenarioId);
  if (!sameSet(ids, PERFORMANCE_SCENARIO_IDS) || ids.length !== PERFORMANCE_SCENARIO_IDS.length) {
    failures.push(`${prefix} must contain one baseline window for every performance scenario`);
  }
  const keys = new Map();
  for (const scenarioId of PERFORMANCE_SCENARIO_IDS) {
    const matching = baselines.filter((window) => window?.scenarioId === scenarioId);
    if (matching.length !== 1) continue;
    const window = matching[0];
    const windowPrefix = `${prefix}.${scenarioId}`;
    keys.set(scenarioId, window.comparisonKey);
    if (window.evidenceKind !== 'diagnostic') failures.push(`${windowPrefix} must remain labeled diagnostic`);
    if (window.defaultQuality !== true) failures.push(`${windowPrefix} must use default quality`);
    if (window.budgets?.pass !== true) failures.push(`${windowPrefix} performance budgets did not pass`);
    requireWindowBudget(window, 'frame.p95.target', PERFORMANCE_BUDGETS.targetFrameP95Ms, windowPrefix, failures);
    requireWindowBudget(window, 'frame.p95.floor', PERFORMANCE_BUDGETS.floorFrameP95Ms, windowPrefix, failures);
    requireWindowBudget(window, 'frame.framesAbove32.max', 0, windowPrefix, failures);
    requireWindowBudget(window, 'frame.framesAbove50.max', 0, windowPrefix, failures);
    if (scenarioId === 'autosave_under_load') {
      requireWindowBudget(window, 'autosave.maxBlockingSlice.hard', PERFORMANCE_BUDGETS.autosaveHardBlockingSliceMs, windowPrefix, failures);
    }
    if (window.memory?.comparableState?.pass !== true) failures.push(`${windowPrefix} memory endpoints are not comparable`);
    const rendererDelta = window.memory?.renderer?.delta;
    if (!rendererDelta || Number(rendererDelta.programs) > 0) failures.push(`${windowPrefix} compiled novel GPU programs`);
    if (STEADY_RESIDENCY_SCENARIOS.has(scenarioId)
      && (Number(rendererDelta?.geometries) > 0 || Number(rendererDelta?.textures) > 0 || Number(rendererDelta?.renderTargets) > 0)) {
      failures.push(`${windowPrefix} steady-state GPU residency grew`);
    }
    if (Number(window.memory?.heap?.growthBytes) > 30 * 1024 * 1024) failures.push(`${windowPrefix} heap grew by more than 30 MB`);
    if (window.pipeline?.start?.activeAdmissionJobs !== 0 || window.pipeline?.end?.activeAdmissionJobs !== 0
      || window.pipeline?.start?.meshBuildQueueRemaining !== 0 || window.pipeline?.end?.meshBuildQueueRemaining !== 0) {
      failures.push(`${windowPrefix} captured active or uncontrolled asset admission work`);
    }
    if (window.pipeline?.start?.programCount !== window.pipeline?.end?.programCount) {
      failures.push(`${windowPrefix} program residency changed during capture`);
    }
    if (window.restoration?.restored !== true || window.restoration?.measurementDisabled !== true) {
      failures.push(`${windowPrefix} did not restore scenario/instrumentation state`);
    }
    if (Array.isArray(window.pageErrors) && window.pageErrors.length !== 0) failures.push(`${windowPrefix} contains page errors`);
  }
  const runPass = !failures.some((failure) => failure.startsWith(prefix));
  return matrixSummary(input, report, runPass, keys);
}

function requireWindowBudget(window, id, limit, prefix, failures) {
  const row = window?.budgets?.results?.find((entry) => entry?.id === id);
  if (!row || row.pass !== true || row.operator !== '<=' || row.limit !== limit
    || !Number.isFinite(row.value) || row.value > limit) {
    failures.push(`${prefix} budget ${id} failed the literal <= ${limit} contract`);
  }
}

function validateInputReceipt(input, prefix, failures) {
  if (!nonempty(input?.path)) failures.push(`${prefix} path is required`);
  if (!Number.isInteger(input?.bytes) || input.bytes < 1) failures.push(`${prefix} byte count is required`);
  if (!/^[a-f0-9]{64}$/i.test(String(input?.sha256 || ''))) failures.push(`${prefix} SHA-256 is required`);
}

function validateUniqueReceipts(label, inputs, failures) {
  const hashes = inputs.map((input) => input?.sha256).filter(Boolean);
  if (hashes.length !== new Set(hashes).size) failures.push(`${label} must be three distinct capture artifacts`);
}

function validateChronology(label, runs, failures) {
  const times = runs.map((run) => Date.parse(run.generatedAt));
  if (times.some((value) => !Number.isFinite(value))) return;
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] <= times[index - 1]) failures.push(`${label} must be supplied in strictly consecutive chronological order`);
  }
}

function validateComparableProfiles(runs, failures) {
  const keys = runs.map((run) => run.comparisonKey).filter(Boolean);
  if (keys.length === PERFORMANCE_FINAL_ACCEPTANCE_RUNS && new Set(keys).size !== 1) {
    failures.push('profiles are not directly comparable across all three runs');
  }
}

function validateComparableMatrices(runs, failures) {
  if (runs.length !== PERFORMANCE_FINAL_ACCEPTANCE_RUNS) return;
  const environmentKeys = runs.map((run) => run.environmentKey).filter(Boolean);
  if (environmentKeys.length === PERFORMANCE_FINAL_ACCEPTANCE_RUNS && new Set(environmentKeys).size !== 1) {
    failures.push('matrices do not share the same browser/GPU/default-quality environment');
  }
  for (const scenarioId of PERFORMANCE_SCENARIO_IDS) {
    const keys = runs.map((run) => run.comparisonKeys?.[scenarioId]).filter(Boolean);
    if (keys.length === PERFORMANCE_FINAL_ACCEPTANCE_RUNS && new Set(keys).size !== 1) {
      failures.push(`matrix scenario ${scenarioId} is not comparable across all three runs`);
    }
  }
}

function requireExactRunCount(label, values, failures) {
  if (!Array.isArray(values) || values.length !== PERFORMANCE_FINAL_ACCEPTANCE_RUNS) {
    failures.push(`${label} must contain exactly ${PERFORMANCE_FINAL_ACCEPTANCE_RUNS} consecutive runs`);
  }
}

function profileSummary(input, profile, pass, comparisonKey) {
  const scenario = profile?.scenarios?.find((entry) => entry?.name === 'crowded-flight') || profile?.scenarios?.[0];
  return {
    path: input?.path || null,
    bytes: input?.bytes || null,
    sha256: input?.sha256 || null,
    generatedAt: profile?.generatedAt || null,
    commit: profile?.worktree?.commit || null,
    comparisonKey,
    metrics: {
      frameP95Ms: budgetValue(scenario, 'raf.frame.p95.target'),
      framesAbove32Ms: budgetValue(scenario, 'raf.frame.hitchesOver32.max', true),
      autosaveMaxBlockingSliceMs: budgetValue(scenario, 'autosave.maxBlockingSlice.max'),
      heapGrowthMb: budgetValue(scenario, 'heap.growth.mb'),
    },
    pass,
  };
}

function matrixSummary(input, report, pass, comparisonKeys) {
  const baselines = (report?.windows || []).filter((window) => window?.diagnosticVariant === 'baseline');
  return {
    path: input?.path || null,
    bytes: input?.bytes || null,
    sha256: input?.sha256 || null,
    generatedAt: report?.generatedAt || null,
    commit: report?.worktree?.commit || null,
    scenarioCount: baselines.length,
    environmentKey: report ? stableStringify(matrixEnvironment(report.environment)) : null,
    comparisonKeys: Object.fromEntries(comparisonKeys),
    metrics: Object.fromEntries(baselines.map((window) => [window.scenarioId, {
      frameP95Ms: window.summary?.p95 ?? null,
      framesAbove32Ms: window.summary?.framesAbove32Ms ?? null,
      autosaveMaxBlockingSliceMs: window.autosave?.timing?.maxBlockingSliceMs ?? null,
    }])),
    pass,
  };
}

function profileComparisonKey(profile, scenario) {
  if (!profile || !scenario) return null;
  return stableStringify({
    runner: {
      width: profile.runner?.width,
      height: profile.runner?.height,
      seed: profile.runner?.seed,
      headless: profile.runner?.headless,
      strict: profile.runner?.strict,
    },
    browser: scenario.browser,
    settings: scenario.qualityAssertions?.settingsBefore,
  });
}

function matrixEnvironment(environment) {
  return {
    runtimeKind: environment?.runtimeKind,
    seed: environment?.seed,
    browser: environment?.browser,
    gpu: environment?.gpu,
    viewport: environment?.viewport,
    defaultSettings: environment?.defaultSettings,
  };
}

function budgetValue(scenario, name, prefixMatch = false) {
  const row = scenario?.budgets?.find((entry) => prefixMatch ? entry?.name?.startsWith(name) : entry?.name === name);
  return row?.value ?? null;
}

function sameSet(actual, expected) {
  return actual.length === new Set(actual).size
    && actual.length === expected.length
    && expected.every((value) => actual.includes(value));
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function positive(value) { return Number.isFinite(value) && value > 0; }
function isIso8601(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
