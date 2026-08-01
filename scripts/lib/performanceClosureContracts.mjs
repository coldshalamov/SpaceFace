import { createHash } from 'node:crypto';

export const PERFORMANCE_CLOSURE_SCHEMA = 'spaceface.performanceClosure.v1';
export const PERFORMANCE_WINDOW_SCHEMA = 'spaceface.performanceWindow.v1';
export const PERFORMANCE_SCENARIO_SCHEMA = 'spaceface.performanceScenarioMatrix.v1';
export const PERFORMANCE_MEASUREMENT_VALIDITY_SCHEMA = 'spaceface.performanceMeasurementValidity.v1';
export const PERFORMANCE_BUDGETS = Object.freeze({
  targetFrameP95Ms: 16.7,
  floorFrameP95Ms: 33.3,
  maxFramesAbove32Ms: 0,
  maxFramesAbove50Ms: 0,
  autosaveTargetBlockingSliceMs: 8,
  autosaveHardBlockingSliceMs: 12,
});

const FULL_RENDER_FLEET_COUNTS = Object.freeze([10, 25, 50]);
const PERFORMANCE_ROUTE_DIGEST_FIELDS = Object.freeze([
  'manifestDigest',
  'scenarioDigest',
  'scenarioDefinitionDigest',
  'saveDigest',
  'inputDigest',
  'cameraDigest',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|software rasterizer|microsoft basic render/i;
const ARRAY_SORT = Function.call.bind(Array.prototype.sort);
const REGEXP_TEST = Function.call.bind(RegExp.prototype.test);
const STRING_TRIM = Function.call.bind(String.prototype.trim);
const JSON_STRINGIFY = JSON.stringify;

const SCENARIOS = [
  scenario('flight_steady', 'steady-flight', { primaryCapable: true }),
  scenario('mining_tether_active', 'mining-tether', { injectedState: true }),
  scenario('docked_market_ui', 'docked-ui', { primaryCapable: true }),
  scenario('context_recover_steady', 'context-recovery', { primaryCapable: true }),
  ...FULL_RENDER_FLEET_COUNTS.map((count) => scenario(`fleet_full_render_${count}`, 'full-render-fleet', {
    injectedState: true,
    fleetCount: count,
    actualRenderedEntitiesRequired: true,
  })),
  scenario('fleet_transparent_heavy', 'transparent-heavy-fleet', {
    injectedState: true,
    fleetCount: 25,
    actualRenderedEntitiesRequired: true,
  }),
  scenario('station_arrival_approach', 'station-arrival', {
    injectedState: true,
    transitionWindow: true,
    primaryCapable: true,
  }),
  scenario('station_visible_steady', 'station-visible-steady', {
    injectedState: true,
    primaryCapable: true,
  }),
  scenario('combat_vfx_burst', 'combat-vfx-burst', {
    injectedState: true,
    actualRenderedEntitiesRequired: true,
  }),
  scenario('jump_asset_admission', 'jump-asset-admission', {
    transitionWindow: true,
    primaryCapable: true,
  }),
  scenario('autosave_under_load', 'autosave-under-load', {
    injectedState: true,
    fleetCount: 25,
    actualRenderedEntitiesRequired: true,
  }),
  scenario('map_open', 'map-open', {
    transitionWindow: true,
    primaryCapable: true,
    leaseGate: 'map-ui-integration',
  }),
  scenario('map_interaction_steady', 'map-interaction-steady', {
    primaryCapable: true,
    leaseGate: 'map-ui-integration',
  }),
  scenario('map_to_flight_transition', 'map-to-flight-transition', {
    transitionWindow: true,
    primaryCapable: true,
    leaseGate: 'map-ui-integration',
  }),
];

export const PERFORMANCE_SCENARIOS = Object.freeze(SCENARIOS.map((entry) => Object.freeze(entry)));
export const PERFORMANCE_SCENARIO_IDS = Object.freeze(PERFORMANCE_SCENARIOS.map((entry) => entry.id));

const PERFORMANCE_SCENARIO_BY_ID = createPerformanceScenarioIndex();

export function performanceScenario(id) {
  if (typeof id !== 'string') return null;
  const descriptor = Object.getOwnPropertyDescriptor(PERFORMANCE_SCENARIO_BY_ID, id);
  return descriptor && Object.hasOwn(descriptor, 'value')
    ? descriptor.value
    : null;
}

export function resolvePerformanceScenarios(ids = PERFORMANCE_SCENARIO_IDS) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('at least one performance scenario is required');
  const seen = new Set();
  return ids.map((id) => {
    if (typeof id !== 'string') throw new Error('performance scenario ids must be strings');
    if (seen.has(id)) throw new Error(`duplicate performance scenario: ${id}`);
    seen.add(id);
    const definition = performanceScenario(id);
    if (!definition) throw new Error(`unknown performance scenario: ${id}`);
    return definition;
  });
}

export function summarizeFrameSamples(samples, { vsyncMs = 1000 / 60 } = {}) {
  const rows = Array.isArray(samples) ? samples : [];
  const values = rows
    .map((sample) => Number(sample?.frameMs))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const over = (threshold) => values.filter((value) => value > threshold).length;
  const p50 = percentile(values, 0.50);
  return {
    sampleCount: values.length,
    p50,
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    p999: percentile(values, 0.999),
    max: values.length ? values[values.length - 1] : null,
    hitchesOver2xMedian: p50 == null ? 0 : over(p50 * 2),
    framesAbove16_7Ms: over(16.7),
    framesAbove32Ms: over(32),
    framesAbove50Ms: over(50),
    estimatedMissedVsyncs: values.reduce((sum, value) => sum + Math.max(0, Math.ceil(value / vsyncMs) - 1), 0),
    multiStepSimulationFrames: rows.filter((sample) => Number(sample?.stepsThisFrame) > 1).length,
    backlogSheddingFrames: rows.filter((sample) => sample?.shedBacklog === true || Number(sample?.shedSteps) > 0).length,
  };
}

export function comparisonKey(options = {}) {
  const scenarioId = options?.scenarioId;
  const environment = options?.environment;
  const settings = options?.settings;
  const routeIdentity = routeIdentityFrom(options);
  const comparable = {
    scenarioId,
    runtimeKind: environment?.runtimeKind ?? null,
    browser: environment?.browser ?? null,
    gpu: environment?.gpu ?? null,
    viewport: environment?.viewport ?? null,
    seed: environment?.seed ?? null,
    settings: {
      video: settings?.video ?? null,
      timeScale: settings?.timeScale ?? null,
    },
    scenarioSchema: PERFORMANCE_SCENARIO_SCHEMA,
  };
  if (routeIdentitySupplied(routeIdentity)) {
    comparable.routeIdentity = routeIdentity;
  }
  return sha256(stableStringify(comparable));
}

export function evaluatePerformanceWindowBudgets({ scenarioId, summary, autosave = null, evidenceKind = 'diagnostic' } = {}) {
  const results = [
    budget('frame.p95.target', summary?.p95, PERFORMANCE_BUDGETS.targetFrameP95Ms),
    budget('frame.p95.floor', summary?.p95, PERFORMANCE_BUDGETS.floorFrameP95Ms),
    budget('frame.framesAbove32.max', summary?.framesAbove32Ms, PERFORMANCE_BUDGETS.maxFramesAbove32Ms),
    budget('frame.framesAbove50.max', summary?.framesAbove50Ms, PERFORMANCE_BUDGETS.maxFramesAbove50Ms),
  ];
  if (scenarioId === 'autosave_under_load') {
    const maxBlockingSliceMs = finiteOrNull(autosave?.timing?.maxBlockingSliceMs);
    const completed = Array.isArray(autosave?.events)
      && autosave.events.some((event) => event?.event === 'save:completed');
    results.push(
      truthBudget('autosave.completed', completed),
      budget('autosave.maxBlockingSlice.target', maxBlockingSliceMs, PERFORMANCE_BUDGETS.autosaveTargetBlockingSliceMs),
      budget('autosave.maxBlockingSlice.hard', maxBlockingSliceMs, PERFORMANCE_BUDGETS.autosaveHardBlockingSliceMs),
    );
  }
  return {
    profile: 'target-desktop-default-quality',
    acceptanceEligible: evidenceKind === 'primary',
    // Eight milliseconds is the optimization target and remains visible as a
    // miss; the measured production acceptance gate is the 12 ms hard limit.
    pass: results
      .filter((result) => result.id !== 'autosave.maxBlockingSlice.target')
      .every((result) => result.pass),
    results,
  };
}

export function comparePerformanceWindows(before, after) {
  const failures = [];
  if (!before || !after) failures.push('before and after windows are required');
  validateRouteIdentity(before, 'before', failures);
  validateRouteIdentity(after, 'after', failures);
  if (before?.scenarioId !== after?.scenarioId) failures.push('scenario ids differ');
  if (stableStringify(routeIdentityFrom(before)) !== stableStringify(routeIdentityFrom(after))) {
    failures.push('route digest identities differ; scenarios are not directly comparable');
  }
  if (!nonempty(before?.comparisonKey) || before?.comparisonKey !== after?.comparisonKey) {
    failures.push('comparison keys differ; environments are not directly comparable');
  }
  if (failures.length) return { comparable: false, failures };
  const beforeSummary = summarizeFrameSamples(before.rawSamples);
  const afterSummary = summarizeFrameSamples(after.rawSamples);
  return {
    comparable: true,
    failures: [],
    before: beforeSummary,
    after: afterSummary,
    delta: {
      p50: delta(afterSummary.p50, beforeSummary.p50),
      p95: delta(afterSummary.p95, beforeSummary.p95),
      p99: delta(afterSummary.p99, beforeSummary.p99),
      max: delta(afterSummary.max, beforeSummary.max),
      framesAbove32Ms: afterSummary.framesAbove32Ms - beforeSummary.framesAbove32Ms,
      framesAbove50Ms: afterSummary.framesAbove50Ms - beforeSummary.framesAbove50Ms,
      estimatedMissedVsyncs: afterSummary.estimatedMissedVsyncs - beforeSummary.estimatedMissedVsyncs,
    },
  };
}

export function evaluatePerformanceMeasurementValidity(report) {
  const checks = [];
  const add = (id, pass, reason) => {
    checks.push({ id, pass: pass === true });
    return pass === true ? null : reason;
  };
  const reasons = [];
  const worktree = report?.worktree;
  const start = worktree?.fingerprints?.start;
  const end = worktree?.fingerprints?.end;
  const stableWorktree = worktree?.dirty === false
    && start?.changedFileCount === 0
    && end?.changedFileCount === 0
    && nonempty(start?.id)
    && start.id === end?.id
    && start.digest === end?.digest
    && start.head === end?.head
    && start.branch === end?.branch;
  reasons.push(add('worktree.clean-stable', stableWorktree, 'worktree-not-clean-and-stable'));

  const activity = report?.environment?.activity;
  const quietActivity = activity?.start?.active === false && activity?.end?.active === false;
  reasons.push(add(
    'environment.activity-quiet',
    quietActivity,
    'contaminating-process-or-authoring-activity',
  ));

  const gpu = report?.environment?.gpu;
  const renderer = nonempty(gpu?.renderer) ? gpu.renderer : '';
  const rendererValid = gpu?.source === 'game-renderer'
    && nonempty(gpu?.vendor)
    && nonempty(renderer)
    && !REGEXP_TEST(SOFTWARE_RENDERER_PATTERN, renderer);
  reasons.push(add('environment.game-renderer', rendererValid, 'wrong-or-fallback-renderer'));

  const cleanup = report?.cleanup;
  const cleanupValid = cleanup?.pass === true
    && ['pageClosed', 'browserClosed', 'serverReleased', 'portsReleased', 'measurementDisabled']
      .every((key) => cleanup?.[key] === true);
  reasons.push(add('cleanup.complete', cleanupValid, 'cleanup-or-measurement-gate-incomplete'));

  const errorKeys = ['pageErrors', 'requestFailures', 'consoleErrors', 'httpErrors', 'glErrors', 'warnings'];
  const errorsValid = errorKeys.every((key) => Array.isArray(report?.errors?.[key]) && report.errors[key].length === 0);
  reasons.push(add('runtime.errors-empty', errorsValid, 'runtime-errors-observed-or-unreported'));

  const windows = Array.isArray(report?.windows) ? report.windows : [];
  reasons.push(add('windows.present', windows.length > 0, 'measurement-windows-missing'));
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    const timer = window?.gpu;
    const queryCounts = timer?.queryCounts;
    const gpuTimerValid = timer?.available === true
      && timer?.captureValid === true
      && timer?.lastDisjoint === false
      && timer?.lastInvalidation == null
      && timer?.pending === 0
      && Number.isFinite(queryCounts?.completed)
      && queryCounts.completed > 0
      && queryCounts.pending === 0
      && queryCounts.dropped === 0
      && queryCounts.rejected === 0
      && Array.isArray(timer?.terminals)
      && timer.terminals.length > 0;
    reasons.push(add(
      `windows[${index}].gpu-timer-valid`,
      gpuTimerValid,
      `windows[${index}]-gpu-timer-invalid`,
    ));

    const pipelineStart = window?.pipeline?.start;
    const pipelineEnd = window?.pipeline?.end;
    const pipelineStable = finiteOrNull(pipelineStart?.programCount) != null
      && finiteOrNull(pipelineEnd?.programCount) != null
      && Number(pipelineStart.programCount) === Number(pipelineEnd.programCount)
      && Number(pipelineStart.activeAdmissionJobs) === 0
      && Number(pipelineEnd.activeAdmissionJobs) === 0
      && Number(pipelineStart.meshBuildQueueRemaining) === 0
      && Number(pipelineEnd.meshBuildQueueRemaining) === 0;
    reasons.push(add(
      `windows[${index}].pipeline-cache-stable`,
      pipelineStable,
      `windows[${index}]-pipeline-cache-mismatch`,
    ));

    const routeStable = window?.memory?.comparableState?.pass === true
      && window?.restoration?.restored === true
      && window?.restoration?.measurementDisabled === true;
    reasons.push(add(
      `windows[${index}].route-state-stable`,
      routeStable,
      `windows[${index}]-route-state-diverged`,
    ));
  }

  const boundedReasons = reasons.filter(Boolean);
  return {
    schema: PERFORMANCE_MEASUREMENT_VALIDITY_SCHEMA,
    pass: boundedReasons.length === 0,
    reasons: boundedReasons,
    checks,
  };
}

export function validatePerformanceClosureReport(report) {
  const failures = [];
  if (!report || typeof report !== 'object') return { pass: false, failures: ['report must be an object'] };
  if (report.schema !== PERFORMANCE_CLOSURE_SCHEMA) failures.push(`schema must be ${PERFORMANCE_CLOSURE_SCHEMA}`);
  if (!isIso8601(report.generatedAt)) failures.push('generatedAt must be ISO 8601');
  validateWorktree(report, failures);
  validateEnvironment(report.environment, failures);
  if (!Array.isArray(report.windows) || report.windows.length === 0) failures.push('windows must be non-empty');
  else report.windows.forEach((window, index) => validateWindow(window, index, report.environment, failures));
  validateArtifacts(report.artifacts, failures);
  validateCleanup(report.cleanup, failures);
  validateErrors(report.errors, failures);
  const measurementValidity = evaluatePerformanceMeasurementValidity(report);
  for (const reason of measurementValidity.reasons) failures.push(`measurement invalid: ${reason}`);
  if (stableStringify(report.measurementValidity) !== stableStringify(measurementValidity)) {
    failures.push('measurementValidity verdict does not match recomputed evidence');
  }
  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

export function buildPerformanceClosureReport({
  taskId,
  fingerprints,
  environment,
  windows,
  artifacts,
  cleanup,
  errors,
  notes = [],
}) {
  const report = {
    schema: PERFORMANCE_CLOSURE_SCHEMA,
    scenarioSchema: PERFORMANCE_SCENARIO_SCHEMA,
    generatedAt: new Date().toISOString(),
    taskId,
    worktree: {
      id: fingerprints?.start?.id ?? null,
      digest: fingerprints?.start?.digest ?? null,
      commit: fingerprints?.start?.head ?? null,
      branch: fingerprints?.start?.branch ?? null,
      dirty: Number(fingerprints?.start?.changedFileCount) > 0,
      fingerprints,
    },
    environment,
    windows,
    artifacts,
    cleanup,
    errors,
    notes,
  };
  report.measurementValidity = evaluatePerformanceMeasurementValidity(report);
  report.validation = validatePerformanceClosureReport(report);
  return report;
}

function validateWorktree(report, failures) {
  const worktree = report.worktree;
  if (!worktree || typeof worktree !== 'object') {
    failures.push('worktree identity is required');
    return;
  }
  if (!nonempty(worktree.id) || !REGEXP_TEST(SHA256_PATTERN, String(worktree.digest || ''))) {
    failures.push('worktree id and SHA-256 digest are required');
  }
  if (!REGEXP_TEST(COMMIT_PATTERN, String(worktree.commit || ''))) failures.push('exact 40-character commit is required');
  if (!nonempty(worktree.branch)) failures.push('worktree branch is required');
  if (typeof worktree.dirty !== 'boolean') failures.push('worktree dirty state is required');
  const start = worktree.fingerprints?.start;
  const end = worktree.fingerprints?.end;
  if (!start || !end) failures.push('start and end worktree fingerprints are required');
  else if (start.id !== end.id || start.digest !== end.digest || start.head !== end.head || start.branch !== end.branch) {
    failures.push('worktree changed during performance capture');
  }
}

function validateEnvironment(environment, failures) {
  if (!environment || typeof environment !== 'object') {
    failures.push('environment is required');
    return;
  }
  if (!['browser', 'electron'].includes(environment.runtimeKind)) failures.push('runtimeKind must be browser or electron');
  if (!Number.isInteger(environment.seed)) failures.push('environment seed is required');
  if (!Number.isFinite(environment.viewport?.width) || !Number.isFinite(environment.viewport?.height)) failures.push('environment viewport is required');
  if (!environment.browser || typeof environment.browser !== 'object') failures.push('browser/runtime identity is required');
  if (!environment.gpu || typeof environment.gpu !== 'object') failures.push('GPU/ANGLE identity is required');
  if (!environment.activity || typeof environment.activity !== 'object') failures.push('release/authoring activity state is required');
  if (!environment.defaultSettings?.video || typeof environment.defaultSettings.video !== 'object') failures.push('default video settings are required');
}

function validateWindow(window, index, environment, failures) {
  const prefix = `windows[${index}]`;
  if (!window || typeof window !== 'object') {
    failures.push(`${prefix} must be an object`);
    return;
  }
  if (window.schema !== PERFORMANCE_WINDOW_SCHEMA) failures.push(`${prefix}.schema must be ${PERFORMANCE_WINDOW_SCHEMA}`);
  const definition = performanceScenario(window.scenarioId);
  if (!definition) failures.push(`${prefix}.scenarioId is unknown`);
  if (!['diagnostic', 'primary'].includes(window.evidenceKind)) failures.push(`${prefix}.evidenceKind must be diagnostic or primary`);
  if (typeof window.stateInjected !== 'boolean') failures.push(`${prefix}.stateInjected must be boolean`);
  if (window.evidenceKind === 'primary' && window.stateInjected !== false) failures.push(`${prefix} primary evidence may not inject state`);
  if (window.evidenceKind === 'primary' && window.inputSource !== 'keyboard-mouse') failures.push(`${prefix} primary evidence requires keyboard-mouse input`);
  if (typeof window.defaultQuality !== 'boolean') failures.push(`${prefix}.defaultQuality truth must be boolean`);
  if (window.evidenceKind === 'primary' && window.defaultQuality !== true) failures.push(`${prefix} primary evidence requires default quality`);
  if (window.defaultQuality === true
    && stableStringify(window.settings?.start?.video) !== stableStringify(environment?.defaultSettings?.video)) {
    failures.push(`${prefix}.defaultQuality does not match captured environment defaults`);
  }
  if (!Array.isArray(window.rawSamples) || window.rawSamples.length === 0) failures.push(`${prefix}.rawSamples must be non-empty`);
  const computed = summarizeFrameSamples(window.rawSamples);
  for (const key of Object.keys(computed)) {
    if (!sameMetric(window.summary?.[key], computed[key])) failures.push(`${prefix}.summary.${key} does not match raw samples`);
  }
  validateRouteIdentity(window, prefix, failures);
  const expectedComparisonKey = comparisonKey({
    scenarioId: window.scenarioId,
    environment,
    settings: window.settings?.start,
    ...routeIdentityFrom(window),
  });
  if (window.comparisonKey !== expectedComparisonKey) failures.push(`${prefix}.comparisonKey does not match the comparable environment`);
  if (!window.settings?.start || !window.settings?.end) failures.push(`${prefix}.settings start/end truth is required`);
  if (stableStringify(window.settings?.start?.video) !== stableStringify(window.settings?.end?.video)
    || window.settings?.start?.timeScale !== window.settings?.end?.timeScale) {
    failures.push(`${prefix} settings changed during capture`);
  }
  const expectedBudgets = evaluatePerformanceWindowBudgets({
    scenarioId: window.scenarioId,
    summary: computed,
    autosave: window.autosave,
    evidenceKind: window.evidenceKind,
  });
  if (stableStringify(window.budgets) !== stableStringify(expectedBudgets)) failures.push(`${prefix}.budgets do not match measured evidence`);
  for (const key of ['cpu', 'gpu', 'scene', 'pipeline', 'memory']) {
    if (!window[key] || typeof window[key] !== 'object') failures.push(`${prefix}.${key} is required`);
  }
  if (!window.restoration || window.restoration.restored !== true) failures.push(`${prefix}.restoration must prove restored=true`);
  if (!Array.isArray(window.pageErrors)) failures.push(`${prefix}.pageErrors must be an array`);
}

function routeIdentityFrom(value) {
  const identity = Object.create(null);
  for (let index = 0; index < PERFORMANCE_ROUTE_DIGEST_FIELDS.length; index += 1) {
    const field = PERFORMANCE_ROUTE_DIGEST_FIELDS[index];
    const descriptor = ownPropertyDescriptor(value, field);
    identity[field] = descriptor && Object.hasOwn(descriptor, 'value')
      ? descriptor.value ?? null
      : null;
  }
  return identity;
}

function routeIdentitySupplied(identity) {
  for (let index = 0; index < PERFORMANCE_ROUTE_DIGEST_FIELDS.length; index += 1) {
    if (identity[PERFORMANCE_ROUTE_DIGEST_FIELDS[index]] != null) return true;
  }
  return false;
}

function validateRouteIdentity(window, prefix, failures) {
  let supplied = 0;
  for (let index = 0; index < PERFORMANCE_ROUTE_DIGEST_FIELDS.length; index += 1) {
    const field = PERFORMANCE_ROUTE_DIGEST_FIELDS[index];
    const descriptor = ownPropertyDescriptor(window, field);
    if (!descriptor) continue;
    if (!Object.hasOwn(descriptor, 'value')) {
      failures.push(`${prefix}.${field} must be an own data property`);
      continue;
    }
    const value = descriptor.value;
    if (value == null) continue;
    supplied += 1;
    if (typeof value !== 'string' || !REGEXP_TEST(SHA256_PATTERN, value)) {
      failures.push(`${prefix}.${field} must be a full SHA-256 digest`);
    }
  }
  if (supplied > 0 && supplied !== PERFORMANCE_ROUTE_DIGEST_FIELDS.length) {
    failures.push(`${prefix} route digest identity must provide the complete manifest, scenario, definition, save, input, and camera chain`);
  }
}

function ownPropertyDescriptor(value, key) {
  if ((typeof value !== 'object' || value == null) && typeof value !== 'function') return null;
  return Object.getOwnPropertyDescriptor(value, key) || null;
}

function validateArtifacts(artifacts, failures) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    failures.push('content-hashed artifacts are required');
    return;
  }
  for (const artifact of artifacts) {
    if (!nonempty(artifact?.kind) || !nonempty(artifact?.path)) failures.push('each artifact needs kind and path');
    if (!Number.isInteger(artifact?.bytes) || artifact.bytes < 1) failures.push(`artifact ${artifact?.path || '<missing>'} needs positive bytes`);
    if (!REGEXP_TEST(SHA256_PATTERN, String(artifact?.sha256 || ''))) failures.push(`artifact ${artifact?.path || '<missing>'} needs SHA-256`);
  }
}

function validateCleanup(cleanup, failures) {
  if (!cleanup || cleanup.pass !== true) failures.push('cleanup receipt must report pass=true');
  for (const key of ['pageClosed', 'browserClosed', 'serverReleased', 'portsReleased', 'measurementDisabled']) {
    if (cleanup?.[key] !== true) failures.push(`cleanup.${key} must be true`);
  }
}

function validateErrors(errors, failures) {
  if (!errors || typeof errors !== 'object') {
    failures.push('page/runtime error evidence is required');
    return;
  }
  for (const key of ['pageErrors', 'requestFailures', 'consoleErrors', 'httpErrors', 'warnings']) {
    if (!Array.isArray(errors[key])) failures.push(`errors.${key} must be an array`);
  }
}

function createPerformanceScenarioIndex() {
  const result = Object.create(null);
  for (let index = 0; index < PERFORMANCE_SCENARIOS.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(
      PERFORMANCE_SCENARIOS,
      String(index),
    );
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('performance scenarios must contain own data values');
    }
    const definition = descriptor.value;
    const idDescriptor = Object.getOwnPropertyDescriptor(definition, 'id');
    if (!idDescriptor || !Object.hasOwn(idDescriptor, 'value')) {
      throw new TypeError('performance scenario definitions must contain own id values');
    }
    Object.defineProperty(result, idDescriptor.value, {
      value: definition,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(result);
}

function scenario(id, workloadClass, extra = {}) {
  return {
    schema: PERFORMANCE_SCENARIO_SCHEMA,
    id,
    workloadClass,
    injectedState: false,
    primaryCapable: false,
    transitionWindow: false,
    actualRenderedEntitiesRequired: false,
    leaseGate: null,
    ...extra,
  };
}

function budget(id, value, limit) {
  const measured = finiteOrNull(value);
  return {
    id,
    value: measured,
    operator: '<=',
    limit,
    pass: measured != null && measured <= limit,
  };
}

function truthBudget(id, value) {
  return { id, value: value === true, operator: '==', limit: true, pass: value === true };
}

function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * ratio))];
}

function delta(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? a - b : null;
}

function nonempty(value) {
  return typeof value === 'string' && STRING_TRIM(value).length > 0;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isIso8601(value) {
  return typeof value === 'string' && REGEXP_TEST(ISO_8601_PATTERN, value);
}

function sameMetric(actual, expected) {
  if (actual == null || expected == null) return actual === expected;
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= 0.001;
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON_STRINGIFY(value);
  if (Array.isArray(value)) {
    let result = '[';
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) result += ',';
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError('stable JSON arrays must contain own data values');
      }
      const serialized = stableStringify(descriptor.value);
      if (serialized !== undefined) result += serialized;
    }
    return `${result}]`;
  }

  const keys = Object.keys(value);
  ARRAY_SORT(keys);
  let result = '{';
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) result += ',';
    const keyDescriptor = Object.getOwnPropertyDescriptor(keys, String(index));
    if (!keyDescriptor || !Object.hasOwn(keyDescriptor, 'value')) {
      throw new TypeError('stable JSON object keys must contain own data values');
    }
    const key = keyDescriptor.value;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('stable JSON objects must contain own data values');
    }
    result += `${JSON_STRINGIFY(key)}:${stableStringify(descriptor.value)}`;
  }
  return `${result}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
