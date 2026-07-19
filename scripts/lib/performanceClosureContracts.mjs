import { createHash } from 'node:crypto';

export const PERFORMANCE_CLOSURE_SCHEMA = 'spaceface.performanceClosure.v1';
export const PERFORMANCE_WINDOW_SCHEMA = 'spaceface.performanceWindow.v1';
export const PERFORMANCE_SCENARIO_SCHEMA = 'spaceface.performanceScenarioMatrix.v1';
export const PERFORMANCE_BUDGETS = Object.freeze({
  targetFrameP95Ms: 16.7,
  floorFrameP95Ms: 33.3,
  maxFramesAbove32Ms: 0,
  maxFramesAbove50Ms: 0,
  autosaveTargetBlockingSliceMs: 8,
  autosaveHardBlockingSliceMs: 12,
});

const FULL_RENDER_FLEET_COUNTS = Object.freeze([10, 25, 50]);

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

export function performanceScenario(id) {
  return PERFORMANCE_SCENARIOS.find((entry) => entry.id === id) || null;
}

export function resolvePerformanceScenarios(ids = PERFORMANCE_SCENARIO_IDS) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('at least one performance scenario is required');
  const seen = new Set();
  return ids.map((id) => {
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
  return {
    sampleCount: values.length,
    p50: percentile(values, 0.50),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length ? values[values.length - 1] : null,
    framesAbove16_7Ms: over(16.7),
    framesAbove32Ms: over(32),
    framesAbove50Ms: over(50),
    estimatedMissedVsyncs: values.reduce((sum, value) => sum + Math.max(0, Math.ceil(value / vsyncMs) - 1), 0),
    multiStepSimulationFrames: rows.filter((sample) => Number(sample?.stepsThisFrame) > 1).length,
    backlogSheddingFrames: rows.filter((sample) => sample?.shedBacklog === true || Number(sample?.shedSteps) > 0).length,
  };
}

export function comparisonKey({ scenarioId, environment, settings }) {
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
  if (before?.scenarioId !== after?.scenarioId) failures.push('scenario ids differ');
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
  report.validation = validatePerformanceClosureReport(report);
  return report;
}

function validateWorktree(report, failures) {
  const worktree = report.worktree;
  if (!worktree || typeof worktree !== 'object') {
    failures.push('worktree identity is required');
    return;
  }
  if (!nonempty(worktree.id) || !/^[a-f0-9]{64}$/i.test(String(worktree.digest || ''))) {
    failures.push('worktree id and SHA-256 digest are required');
  }
  if (!/^[a-f0-9]{40}$/i.test(String(worktree.commit || ''))) failures.push('exact 40-character commit is required');
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
  const expectedComparisonKey = comparisonKey({
    scenarioId: window.scenarioId,
    environment,
    settings: window.settings?.start,
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

function validateArtifacts(artifacts, failures) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    failures.push('content-hashed artifacts are required');
    return;
  }
  for (const artifact of artifacts) {
    if (!nonempty(artifact?.kind) || !nonempty(artifact?.path)) failures.push('each artifact needs kind and path');
    if (!Number.isInteger(artifact?.bytes) || artifact.bytes < 1) failures.push(`artifact ${artifact?.path || '<missing>'} needs positive bytes`);
    if (!/^[a-f0-9]{64}$/i.test(String(artifact?.sha256 || ''))) failures.push(`artifact ${artifact?.path || '<missing>'} needs SHA-256`);
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
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isIso8601(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value);
}

function sameMetric(actual, expected) {
  if (actual == null || expected == null) return actual === expected;
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= 0.001;
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
