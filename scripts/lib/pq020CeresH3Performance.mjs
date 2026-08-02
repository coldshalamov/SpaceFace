import { summarizeFrameSamples } from './performanceClosureContracts.mjs';

export const PQ020_H3_RECEIPT_SCHEMA = 'spaceface.pq020CeresH3Performance.v1';
export const PQ020_H3_PROFILE_IDS = Object.freeze([
  'ceres-entry-floor',
  'cathedral-visible-target',
]);
export const PQ020_H3_REPETITIONS = 3;
export const PQ020_H3_PIPELINE_SETTLE_TIMEOUT_MS = 30_000;
export const PQ020_H3_MIN_RAW_INTERVALS = 120;
export const PQ020_H3_BUDGETS = Object.freeze({
  nominalTargetP95Ms: 16.7,
  targetSamplingEnvelopeP95Ms: 17.5,
  floorP95Ms: 33.3,
  floorSamplingEnvelopeP95Ms: 33.5,
  matchedP95ToleranceMs: 0.8,
  matchedP99ToleranceMs: 0.8,
  maxFrameMs: 50,
  maxMapOpenMs: 2_000,
  maxSectorEntryMs: 5_000,
  maxBacklogSheddingFrames: 0,
});

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software rasterizer|microsoft basic render/i;

export function validatePq020H3PerformanceReceipt(receipt = {}) {
  const failures = [];
  if (receipt?.schema !== PQ020_H3_RECEIPT_SCHEMA) {
    failures.push(`schema must be ${PQ020_H3_RECEIPT_SCHEMA}`);
  }
  if (receipt?.disposition !== 'PASS') failures.push('receipt disposition must be PASS');
  if (!Number.isInteger(receipt?.fixedSeed)) failures.push('fixedSeed must be an integer');
  validateViewport(receipt?.viewport, failures);
  validateRuntime(receipt, failures);
  validateQuality(receipt?.qualityPreserving, failures);
  validateCleanup(receipt?.cleanup, failures);
  validateRouteMetadata(receipt?.route, failures);
  if (!Array.isArray(receipt?.pageIssues)) failures.push('pageIssues must be an array');
  else if (receipt.pageIssues.length > 0) failures.push('pageIssues must be empty');

  const rows = Array.isArray(receipt?.profiles) ? receipt.profiles : [];
  const byId = new Map();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string') {
      failures.push('every performance profile must have an id');
      continue;
    }
    if (byId.has(row.id)) failures.push(`duplicate profile ${row.id}`);
    byId.set(row.id, row);
  }
  for (const id of PQ020_H3_PROFILE_IDS) {
    if (!byId.has(id)) failures.push(`missing required profile ${id}`);
  }
  for (const id of byId.keys()) {
    if (!PQ020_H3_PROFILE_IDS.includes(id)) failures.push(`unknown profile ${id}`);
  }

  const profiles = [];
  for (const id of PQ020_H3_PROFILE_IDS) {
    const profile = byId.get(id);
    if (!profile) continue;
    const repetitions = Array.isArray(profile.repetitions) ? profile.repetitions : [];
    if (repetitions.length !== PQ020_H3_REPETITIONS) {
      failures.push(`${id} must contain exactly ${PQ020_H3_REPETITIONS} repetitions`);
    }
    const validated = repetitions.map((run, index) => validateRun({
      id,
      run,
      expectedIndex: index + 1,
      expectedSeed: receipt?.fixedSeed,
      failures,
    }));
    profiles.push({
      id,
      repetitions: validated,
      median: medianSummary(validated.map((row) => row.summary)),
    });
  }

  const floor = byId.get(PQ020_H3_PROFILE_IDS[0]);
  const target = byId.get(PQ020_H3_PROFILE_IDS[1]);
  if (floor && target) validateMatchedProfiles(floor, target, failures);

  return {
    pass: failures.length === 0,
    failures: [...new Set(failures)],
    profiles,
    budgets: PQ020_H3_BUDGETS,
    absoluteBudget: evaluateAbsoluteTargetBudget(rows),
  };
}

function validateViewport(viewport, failures) {
  if (viewport?.width !== 1830 || viewport?.height !== 973 || viewport?.deviceScaleFactor !== 1) {
    failures.push('viewport must be the fixed 1830x973 target profile at deviceScaleFactor 1');
  }
}

function validateRuntime(receipt, failures) {
  if (receipt?.runtime !== 'browser-chromium-headed') {
    failures.push('runtime must be browser-chromium-headed');
  }
  const renderer = String(receipt?.gpu?.renderer || '');
  if (receipt?.gpu?.available !== true || !renderer || SOFTWARE_RENDERER.test(renderer)) {
    failures.push('acceptance requires a hardware GPU renderer');
  }
  if (!/intel/i.test(renderer) || !/D3D11/i.test(renderer)) {
    failures.push('target profile requires the bound Intel D3D11 renderer');
  }
  const broker = receipt?.broker || {};
  if (broker.primaryAcceptance !== true || broker.diagnostic === true || !broker.claimId) {
    failures.push('primary broker acceptance with a claim id is required');
  }
}

function validateQuality(quality, failures) {
  if (quality?.settingsOverridesApplied !== false || quality?.defaultQualityRetained !== true) {
    failures.push('default quality must remain active with no settings overrides');
  }
  if (quality?.performanceImprovementClaimed !== false) {
    failures.push('PQ-020 H3 profile differences must not claim an optimization improvement');
  }
  if (quality?.absoluteTargetClaimed !== false || quality?.absoluteBudgetWaiverGranted !== false) {
    failures.push('PQ-020 H3 must report the absolute target separately without claiming or waiving it');
  }
}

function validateCleanup(cleanup, failures) {
  if (cleanup?.browserClosed !== true || cleanup?.serverClosed !== true) {
    failures.push('owned Browser and server cleanup must both complete');
  }
}

function validateRouteMetadata(route, failures) {
  if (route?.pairCount !== PQ020_H3_REPETITIONS) {
    failures.push(`route must declare exactly ${PQ020_H3_REPETITIONS} matched pairs`);
  }
  if (typeof route?.declaredRoute !== 'string' || route.declaredRoute.trim().length < 20) {
    failures.push('route must describe the measured public owner path');
  }
  if (!Array.isArray(route?.retainedEvidenceReferences)
      || route.retainedEvidenceReferences.length < 2) {
    failures.push('route must retain the accepted PQ-020 H1 and H2 evidence references');
  }
  const pairs = Array.isArray(route?.pairs) ? route.pairs : [];
  if (pairs.length !== PQ020_H3_REPETITIONS) {
    failures.push(`route metadata must bind all ${PQ020_H3_REPETITIONS} matched pairs`);
  }
  for (let index = 0; index < pairs.length; index += 1) {
    const expected = index + 1;
    const row = pairs[index];
    if (row?.repetition !== expected || row?.pairId !== `pq020-h3-pair-${expected}`) {
      failures.push(`route metadata pair ${expected} identity differs`);
    }
    if (row?.publicRoute !== true) failures.push(`route metadata pair ${expected} must bind the public route`);
  }
}

function validateRun({ id, run, expectedIndex, expectedSeed, failures }) {
  const label = `${id}[${expectedIndex}]`;
  if (run?.index !== expectedIndex) failures.push(`${label} repetition index is not exact`);
  const rawSamples = Array.isArray(run?.rawSamples) ? run.rawSamples : [];
  if (rawSamples.length < PQ020_H3_MIN_RAW_INTERVALS) {
    failures.push(`${label} requires at least ${PQ020_H3_MIN_RAW_INTERVALS} raw frame intervals`);
  }
  const summary = summarizeFrameSamples(rawSamples);
  validateSummaryBinding(label, summary, run?.attribution?.frameMs, failures);
  validateRuntimeContinuity(label, rawSamples, failures);
  validateAttribution(label, run?.attribution, failures);
  validateRouteFacts(label, id, expectedIndex, expectedSeed, run?.routeFacts, failures);
  return { index: run?.index ?? null, summary, routeFacts: run?.routeFacts ?? null };
}

function validateSummaryBinding(label, summary, observed, failures) {
  if (!observed || typeof observed !== 'object') {
    failures.push(`${label} attribution frame summary is missing`);
    return;
  }
  for (const key of ['sampleCount', 'p50', 'p95', 'p99', 'max']) {
    if (!sameNumber(summary[key], observed[key])) {
      failures.push(`${label} attribution ${key} does not match recomputed raw intervals`);
    }
  }
  if (summary.framesAbove32Ms !== Number(observed.hitchesOver32Ms)) {
    failures.push(`${label} attribution hitch count does not match recomputed raw intervals`);
  }
}

function validateRuntimeContinuity(label, samples, failures) {
  if (samples.some((sample) => sample?.mode !== 'flight'
    || sample?.docked !== false
    || sample?.playerControlExposed !== true
    || sample?.visibility !== 'visible')) {
    failures.push(`${label} raw intervals left visible controllable flight`);
  }
  if (samples.some((sample) => !finiteUnitScale(sample?.timeScale))) {
    failures.push(`${label} raw intervals require bounded time-scale evidence`);
  }
}

function validateAttribution(label, attribution, failures) {
  if (attribution?.pipeline?.warmup?.pass !== true || attribution?.pipeline?.warmup?.timedOut === true) {
    failures.push(`${label} pipeline warmup/stability did not pass`);
  }
  if (attribution?.memory?.comparableState?.pass !== true) {
    failures.push(`${label} route state changed during measurement`);
  }
  if (attribution?.gpuTimers?.available !== true
      || attribution?.gpuTimers?.captureValid !== true
      || attribution?.gpuTimers?.lastDisjoint === true) {
    failures.push(`${label} GPU timer capture is unavailable, invalid, or disjoint`);
  }
  const startSettings = attribution?.settings?.start;
  const endSettings = attribution?.settings?.end;
  if (!startSettings || !endSettings
      || stableStringify(qualitySettingsSlice(startSettings))
        !== stableStringify(qualitySettingsSlice(endSettings))) {
    failures.push(`${label} settings changed during measurement`);
  }
  if (startSettings?.dynResScale !== 1 || startSettings?.timeScale !== 1) {
    failures.push(`${label} requires default dynamic resolution and time scale at measurement start`);
  }
  if (!finiteUnitScale(endSettings?.timeScale)) {
    failures.push(`${label} end time scale is missing or outside the runtime authority range`);
  }
  for (const key of ['calls', 'triangles', 'geometries', 'textures', 'programs']) {
    if (!finiteNonnegative(attribution?.draw?.[key])) failures.push(`${label} draw.${key} is missing`);
  }
  for (const key of ['sim', 'render', 'vfx', 'ui']) {
    if (!finiteNonnegative(attribution?.cpu?.phases?.[key]?.p95)) {
      failures.push(`${label} cpu phase ${key}.p95 is missing`);
    }
  }
  if (!attribution?.cpu?.systems || typeof attribution.cpu.systems !== 'object') {
    failures.push(`${label} system attribution is missing`);
  }
}

function validateRouteFacts(label, id, expectedIndex, expectedSeed, facts, failures) {
  if (facts?.profileId !== id) failures.push(`${label} route profile identity differs`);
  if (facts?.repetition !== expectedIndex) failures.push(`${label} route repetition identity differs`);
  if (facts?.pairId !== `pq020-h3-pair-${expectedIndex}`) failures.push(`${label} route pair identity differs`);
  if (facts?.recordedSeed !== expectedSeed) failures.push(`${label} fixed seed differs from the receipt`);
  if (facts?.sectorId !== 'sector_ceres_belt') failures.push(`${label} must remain in sector_ceres_belt`);
  if (facts?.mode !== 'flight' || facts?.docked !== false) failures.push(`${label} must retain controllable flight`);
  if (facts?.trafficRuntime !== 'ordinary-sector-traffic') {
    failures.push(`${label} must retain ordinary sector traffic`);
  }
  if (!Array.isArray(facts?.ambientTrafficIds)
      || facts.ambientTrafficIds.length !== Number(facts?.ambientTrafficCount)) {
    failures.push(`${label} ambient traffic ids must bind the measured count`);
  }
  for (const key of ['ambientTrafficCount', 'entityCount', 'colliderCount']) {
    if (!finitePositive(facts?.[key])) failures.push(`${label} ${key} must be measured and positive`);
  }
  for (const key of ['queries', 'candidates']) {
    if (!finitePositive(facts?.spatialHash?.[key])) {
      failures.push(`${label} spatialHash.${key} must be measured and positive`);
    }
  }
  if (!finiteNonnegative(facts?.mapOpenMs) || facts.mapOpenMs > PQ020_H3_BUDGETS.maxMapOpenMs) {
    failures.push(`${label} map-open span exceeds ${PQ020_H3_BUDGETS.maxMapOpenMs} ms`);
  }
  if (!finiteNonnegative(facts?.sectorEntryMs)
      || facts.sectorEntryMs > PQ020_H3_BUDGETS.maxSectorEntryMs) {
    failures.push(`${label} sector-entry span exceeds ${PQ020_H3_BUDGETS.maxSectorEntryMs} ms`);
  }

  const cathedral = facts?.cathedral || {};
  if (cathedral.siteId !== 'world_site_wreck_cathedral' || cathedral.entityCount !== 15) {
    failures.push(`${label} must bind the exact 15-entity Wreck Cathedral identity`);
  }
  const expectedRole = id === 'cathedral-visible-target' ? 'cathedral-root' : 'ceres-entry-floor';
  if (facts?.performanceSubject?.role !== expectedRole
      || facts?.performanceSubject?.entityId == null
      || facts?.performanceSubject?.admission !== 'ready'
      || facts?.performanceSubject?.assetState !== 'authored') {
    failures.push(`${label} requires authored ready performance subject ${expectedRole}`);
  }
  if (id === 'cathedral-visible-target') {
    if (cathedral.rootAdmission !== 'ready' || cathedral.rootAssetState !== 'authored'
        || cathedral.admittedComponentCount !== 7) {
      failures.push(`${label} requires the authored admitted Cathedral root and seven components`);
    }
    if (cathedral.inFrame !== true || cathedral.cameraZoom !== 72) {
      failures.push(`${label} Cathedral must be in frame at the public default zoom 72`);
    }
    if (typeof cathedral.appliedLod !== 'string' || cathedral.appliedLod.length === 0) {
      failures.push(`${label} Cathedral applied LOD must be recorded`);
    }
  }
}

function validateMatchedProfiles(floor, target, failures) {
  const floorRuns = Array.isArray(floor?.repetitions) ? floor.repetitions : [];
  const targetRuns = Array.isArray(target?.repetitions) ? target.repetitions : [];
  for (let index = 0; index < Math.min(floorRuns.length, targetRuns.length); index += 1) {
    const left = floorRuns[index];
    const right = targetRuns[index];
    if (stableStringify(left?.attribution?.settings?.start)
        !== stableStringify(right?.attribution?.settings?.start)) {
      failures.push(`matched pair ${index + 1} uses different settings`);
    }
    if (!left?.routeFacts?.pairId || left.routeFacts.pairId !== right?.routeFacts?.pairId) {
      failures.push(`matched pair ${index + 1} route identity changed at the Cathedral target`);
    }
    if (!Number.isInteger(left?.routeFacts?.recordedSeed)
        || left.routeFacts.recordedSeed !== right?.routeFacts?.recordedSeed) {
      failures.push(`matched pair ${index + 1} fixed-seed route identity changed`);
    }
    if (left?.routeFacts?.mapOpenMs !== right?.routeFacts?.mapOpenMs
        || left?.routeFacts?.sectorEntryMs !== right?.routeFacts?.sectorEntryMs) {
      failures.push(`matched pair ${index + 1} timing identity changed across profiles`);
    }
  }

  const floorSummaries = floorRuns.map((run) => summarizeFrameSamples(run?.rawSamples || []));
  const targetSummaries = targetRuns.map((run) => summarizeFrameSamples(run?.rawSamples || []));
  const floorMedian = medianSummary(floorSummaries);
  const targetMedian = medianSummary(targetSummaries);
  if (Number.isFinite(floorMedian.p95) && Number.isFinite(targetMedian.p95)
      && targetMedian.p95 > floorMedian.p95 + PQ020_H3_BUDGETS.matchedP95ToleranceMs) {
    failures.push(`Cathedral target median p95 regresses by more than ${PQ020_H3_BUDGETS.matchedP95ToleranceMs} ms`);
  }
  if (Number.isFinite(floorMedian.p99) && Number.isFinite(targetMedian.p99)
      && targetMedian.p99 > floorMedian.p99 + PQ020_H3_BUDGETS.matchedP99ToleranceMs) {
    failures.push(`Cathedral target median p99 regresses by more than ${PQ020_H3_BUDGETS.matchedP99ToleranceMs} ms`);
  }
  if (Number.isFinite(targetMedian.p95)
      && targetMedian.p95 > PQ020_H3_BUDGETS.floorSamplingEnvelopeP95Ms) {
    failures.push(`Cathedral target p95 exceeds the ${PQ020_H3_BUDGETS.floorP95Ms} ms floor plus sampling envelope`);
  }
  if (sum(targetSummaries, 'framesAbove32Ms') > sum(floorSummaries, 'framesAbove32Ms')) {
    failures.push('Cathedral target hitch count increases from the matched Ceres entry floor');
  }
  if (sum(targetSummaries, 'framesAbove50Ms') > sum(floorSummaries, 'framesAbove50Ms')) {
    failures.push('Cathedral target >50 ms frame count increases from the matched Ceres entry floor');
  }
  if (sum(targetSummaries, 'backlogSheddingFrames') > sum(floorSummaries, 'backlogSheddingFrames')) {
    failures.push('Cathedral target backlog shedding increases from the matched Ceres entry floor');
  }
}

function evaluateAbsoluteTargetBudget(rows) {
  const profiles = [];
  const failures = [];
  for (const id of PQ020_H3_PROFILE_IDS) {
    const row = rows.find((candidate) => candidate?.id === id);
    const summaries = (row?.repetitions || []).map((run) => summarizeFrameSamples(run?.rawSamples || []));
    const median = medianSummary(summaries);
    const framesAbove50Ms = sum(summaries, 'framesAbove50Ms');
    const backlogSheddingFrames = sum(summaries, 'backlogSheddingFrames');
    const targetP95Pass = Number.isFinite(median.p95)
      && median.p95 <= PQ020_H3_BUDGETS.targetSamplingEnvelopeP95Ms;
    profiles.push({ id, median, targetP95Pass, framesAbove50Ms, backlogSheddingFrames });
    if (!targetP95Pass) {
      failures.push(`${id} median p95 misses the ${PQ020_H3_BUDGETS.nominalTargetP95Ms} ms target`
        + ` plus bounded sampling envelope (${PQ020_H3_BUDGETS.targetSamplingEnvelopeP95Ms} ms)`);
    }
    if (framesAbove50Ms > 0) failures.push(`${id} contains ${framesAbove50Ms} frame(s) above 50 ms`);
    if (backlogSheddingFrames > 0) {
      failures.push(`${id} contains ${backlogSheddingFrames} backlog-shedding frame(s)`);
    }
  }
  return { pass: failures.length === 0, failures, profiles };
}

function qualitySettingsSlice(settings) {
  if (!settings || typeof settings !== 'object') return null;
  return { video: settings.video || null, dynResScale: settings.dynResScale };
}

function medianSummary(summaries) {
  const out = {};
  for (const key of [
    'p50', 'p95', 'p99', 'max', 'framesAbove32Ms', 'framesAbove50Ms',
    'estimatedMissedVsyncs', 'backlogSheddingFrames',
  ]) {
    const values = summaries.map((summary) => summary?.[key]).filter(Number.isFinite).sort((a, b) => a - b);
    out[key] = values.length ? values[Math.floor(values.length / 2)] : null;
  }
  return out;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);
}

function sameNumber(left, right) {
  return Number.isFinite(left) && Number.isFinite(Number(right))
    && Math.abs(left - Number(right)) <= 1e-6;
}

function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function finiteNonnegative(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function finiteUnitScale(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function stableStringify(value) {
  return JSON.stringify(value, objectKeySorter);
}

function objectKeySorter(key, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const sorted = {};
  for (const name of Object.keys(value).sort()) sorted[name] = value[name];
  return sorted;
}
