import { summarizeFrameSamples } from './performanceClosureContracts.mjs';

export const PQ019_H3_RECEIPT_SCHEMA = 'spaceface.pq019H3Performance.v1';
export const PQ019_H3_PROFILE_IDS = Object.freeze([
  'facility-normal',
  'traffic-loaded-heist',
]);
export const PQ019_H3_REPETITIONS = 3;
// A five-second window at the 30 fps floor yields about 150 intervals. Keep enough tail samples to
// recompute p95 while allowing a genuine below-floor result to remain valid negative evidence.
export const PQ019_H3_MIN_RAW_INTERVALS = 120;

// requestAnimationFrame timestamps are quantized around the 60 Hz display interval. Preserve the
// authored 16.7 ms target and grant only a bounded 0.8 ms sampling envelope; the raw 16.7 threshold
// count remains in every summary. The loaded heist arm must still hold the unmodified 33.3 ms floor.
export const PQ019_H3_BUDGETS = Object.freeze({
  nominalTargetP95Ms: 16.7,
  targetSamplingEnvelopeP95Ms: 17.5,
  floorP95Ms: 33.3,
  floorSamplingEnvelopeP95Ms: 33.5,
  maxFrameMs: 50,
  maxBacklogSheddingFrames: 0,
});

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software rasterizer|microsoft basic render/i;
export const PQ019_H3_FACILITY_VISUAL_ROLES = Object.freeze([
  'heist_launcher_visual',
  'lawful_catcher_visual',
  'fence_receiver_visual',
]);

export function validatePq019H3PerformanceReceipt(receipt = {}) {
  const failures = [];
  if (receipt?.schema !== PQ019_H3_RECEIPT_SCHEMA) {
    failures.push(`schema must be ${PQ019_H3_RECEIPT_SCHEMA}`);
  }
  if (receipt?.disposition !== 'PASS') failures.push('receipt disposition must be PASS');
  if (!Number.isInteger(receipt?.fixedSeed)) failures.push('fixedSeed must be an integer');
  validateViewport(receipt?.viewport, failures);
  validateRuntime(receipt, failures);
  validateQuality(receipt?.qualityPreserving, failures);
  validateCleanup(receipt?.cleanup, failures);
  validateRouteMetadata(receipt?.route, failures);
  if (Array.isArray(receipt?.pageIssues) && receipt.pageIssues.length > 0) {
    failures.push('pageIssues must be empty');
  } else if (!Array.isArray(receipt?.pageIssues)) failures.push('pageIssues must be an array');

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
  for (const id of PQ019_H3_PROFILE_IDS) {
    if (!byId.has(id)) failures.push(`missing required profile ${id}`);
  }
  for (const id of byId.keys()) {
    if (!PQ019_H3_PROFILE_IDS.includes(id)) failures.push(`unknown profile ${id}`);
  }

  const summaries = [];
  for (const id of PQ019_H3_PROFILE_IDS) {
    const profile = byId.get(id);
    if (!profile) continue;
    const repetitions = Array.isArray(profile.repetitions) ? profile.repetitions : [];
    if (repetitions.length !== PQ019_H3_REPETITIONS) {
      failures.push(`${id} must contain exactly ${PQ019_H3_REPETITIONS} repetitions`);
    }
    const runSummaries = repetitions.map((run, index) => validateRun({
      id,
      run,
      expectedIndex: index + 1,
      expectedSeed: receipt?.fixedSeed,
      failures,
    }));
    summaries.push({
      id,
      repetitions: runSummaries,
      median: medianSummary(runSummaries.map((row) => row.summary)),
    });
  }

  const normal = byId.get('facility-normal');
  const loaded = byId.get('traffic-loaded-heist');
  if (normal && loaded) validateMatchedProfiles(normal, loaded, failures);

  const absoluteBudget = evaluateAbsoluteTargetBudget(rows);
  return {
    pass: failures.length === 0,
    failures: [...new Set(failures)],
    profiles: summaries,
    budgets: PQ019_H3_BUDGETS,
    absoluteBudget,
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
    failures.push('PQ-019 H3 profile load differences must not claim an optimization improvement');
  }
  if (quality?.absoluteTargetClaimed !== false || quality?.absoluteBudgetWaiverGranted !== false) {
    failures.push('PQ-019 H3 must report the absolute target separately without claiming or waiving it');
  }
}

function validateCleanup(cleanup, failures) {
  if (cleanup?.browserClosed !== true || cleanup?.serverClosed !== true) {
    failures.push('owned Browser and server cleanup must both complete');
  }
}

function validateRouteMetadata(route, failures) {
  if (route?.pairCount !== PQ019_H3_REPETITIONS) {
    failures.push(`route must declare exactly ${PQ019_H3_REPETITIONS} matched pairs`);
  }
  if (typeof route?.declaredRoute !== 'string' || route.declaredRoute.trim().length < 20) {
    failures.push('route must describe the measured public owner path');
  }
  if (!Array.isArray(route?.retainedEvidenceReferences) || route.retainedEvidenceReferences.length < 1) {
    failures.push('route must retain the accepted facility H1 evidence reference');
  }
  const pairs = Array.isArray(route?.pairs) ? route.pairs : [];
  if (pairs.length !== PQ019_H3_REPETITIONS) {
    failures.push(`route metadata must bind all ${PQ019_H3_REPETITIONS} matched pairs`);
  }
  for (let index = 0; index < pairs.length; index += 1) {
    const expected = index + 1;
    if (pairs[index]?.repetition !== expected || pairs[index]?.pairId !== `pq019-h3-pair-${expected}`) {
      failures.push(`route metadata pair ${expected} identity differs`);
    }
  }
}

function validateRun({ id, run, expectedIndex, expectedSeed, failures }) {
  const label = `${id}[${expectedIndex}]`;
  if (run?.index !== expectedIndex) failures.push(`${label} repetition index is not exact`);
  const rawSamples = Array.isArray(run?.rawSamples) ? run.rawSamples : [];
  if (rawSamples.length < PQ019_H3_MIN_RAW_INTERVALS) {
    failures.push(`${label} requires at least ${PQ019_H3_MIN_RAW_INTERVALS} raw frame intervals`);
  }
  const summary = summarizeFrameSamples(rawSamples);
  validateSummaryBinding(label, summary, run?.attribution?.frameMs, failures);
  validateBudgets(label, id, summary, failures);
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

function validateBudgets(label, id, summary, failures) {
  if (id === 'traffic-loaded-heist'
      && !(summary.p95 <= PQ019_H3_BUDGETS.floorSamplingEnvelopeP95Ms)) {
    failures.push(`${label} loaded-route p95 exceeds the ${PQ019_H3_BUDGETS.floorP95Ms} ms floor`
      + ` plus bounded sampling envelope (${PQ019_H3_BUDGETS.floorSamplingEnvelopeP95Ms} ms)`);
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
  if (!startSettings || !endSettings || stableStringify(startSettings) !== stableStringify(endSettings)) {
    failures.push(`${label} settings changed during measurement`);
  }
  if (startSettings?.dynResScale !== 1 || startSettings?.timeScale !== 1) {
    failures.push(`${label} requires default dynamic resolution and time scale`);
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
  if (facts?.repetition !== expectedIndex) {
    failures.push(`${label} route repetition identity differs`);
  }
  if (facts?.pairId !== `pq019-h3-pair-${facts?.repetition}`) {
    failures.push(`${label} route pair identity differs`);
  }
  if (facts?.recordedSeed !== expectedSeed) failures.push(`${label} fixed seed differs from the receipt`);
  if (facts?.sectorId !== 'sector_tethys_junction') failures.push(`${label} must remain in sector_tethys_junction`);
  if (facts?.mode !== 'flight' || facts?.docked !== false) failures.push(`${label} must retain controllable flight`);
  const roles = Array.isArray(facts?.facilityRoles) ? facts.facilityRoles : [];
  for (const role of PQ019_H3_FACILITY_VISUAL_ROLES) {
    const facility = roles.find((row) => row?.role === role);
    if (!facility || facility.entityId == null) {
      failures.push(`${label} requires live facility entity ${role}`);
    }
  }
  const expectedSubject = id === 'facility-normal' ? 'heist_launcher_visual' : 'cargo_capsule';
  if (facts?.performanceSubject?.role !== expectedSubject
      || facts?.performanceSubject?.admission !== 'ready'
      || facts?.performanceSubject?.assetState !== 'authored') {
    failures.push(`${label} requires authored ready performance subject ${expectedSubject}`);
  }
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
    if (!finitePositive(facts?.spatialHash?.[key])) failures.push(`${label} spatialHash.${key} must be measured and positive`);
  }
  if (id === 'facility-normal') {
    if (facts?.activeHeistCount !== 0 || facts?.capsulePresent !== false) {
      failures.push(`${label} normal profile must precede the active heist and capsule`);
    }
  } else {
    if (facts?.activeHeistCount !== 1 || facts?.capsulePresent !== true
        || facts?.capsuleAdmission !== 'ready' || facts?.capsuleAssetState !== 'authored') {
      failures.push(`${label} loaded profile requires one authored ready live capsule and active heist`);
    }
    if (facts?.possessed !== true || !facts?.lawIncidentReceiptId || !(facts?.responderLeaseCount >= 1)) {
      failures.push(`${label} loaded profile requires witnessed possession and at least one responder lease`);
    }
    if (!(facts?.heat > 0)) failures.push(`${label} loaded profile requires owner-controlled heat`);
  }
}

function validateMatchedProfiles(normal, loaded, failures) {
  const normalRuns = Array.isArray(normal?.repetitions) ? normal.repetitions : [];
  const loadedRuns = Array.isArray(loaded?.repetitions) ? loaded.repetitions : [];
  for (let index = 0; index < Math.min(normalRuns.length, loadedRuns.length); index += 1) {
    const left = normalRuns[index];
    const right = loadedRuns[index];
    const normalSettings = left?.attribution?.settings?.start;
    const loadedSettings = right?.attribution?.settings?.start;
    if (stableStringify(normalSettings) !== stableStringify(loadedSettings)) {
      failures.push(`matched pair ${index + 1} uses different settings`);
    }
    if (!left?.routeFacts?.pairId || left.routeFacts.pairId !== right?.routeFacts?.pairId) {
      failures.push(`matched pair ${index + 1} route identity changed across the heist transition`);
    }
    if (!Number.isInteger(left?.routeFacts?.recordedSeed)
        || left.routeFacts.recordedSeed !== right?.routeFacts?.recordedSeed) {
      failures.push(`matched pair ${index + 1} fixed-seed route identity changed`);
    }
  }

  const normalSummary = medianSummary(normalRuns.map((run) => summarizeFrameSamples(run?.rawSamples || [])));
  const loadedSummary = medianSummary(loadedRuns.map((run) => summarizeFrameSamples(run?.rawSamples || [])));
  if (Number.isFinite(normalSummary.p95) && Number.isFinite(loadedSummary.p95)
      && loadedSummary.p95 > normalSummary.p95 * 1.05) {
    failures.push('loaded-route median p95 regresses more than 5% from the matched normal route');
  }
  const normalHitches = normalRuns.reduce((sum, run) => (
    sum + summarizeFrameSamples(run?.rawSamples || []).framesAbove32Ms
  ), 0);
  const loadedHitches = loadedRuns.reduce((sum, run) => (
    sum + summarizeFrameSamples(run?.rawSamples || []).framesAbove32Ms
  ), 0);
  if (loadedHitches > normalHitches) {
    failures.push('loaded-route hitch count increases from the matched normal route');
  }
  const count = (runs, key) => runs.reduce((sum, run) => (
    sum + Number(summarizeFrameSamples(run?.rawSamples || [])[key] || 0)
  ), 0);
  if (count(loadedRuns, 'framesAbove50Ms') > count(normalRuns, 'framesAbove50Ms')) {
    failures.push('loaded-route >50 ms frame count increases from the matched normal route');
  }
  if (count(loadedRuns, 'backlogSheddingFrames') > count(normalRuns, 'backlogSheddingFrames')) {
    failures.push('loaded-route backlog shedding increases from the matched normal route');
  }
}

function evaluateAbsoluteTargetBudget(rows) {
  const observations = [];
  for (const id of PQ019_H3_PROFILE_IDS) {
    const profile = rows.find((row) => row?.id === id);
    const runs = Array.isArray(profile?.repetitions) ? profile.repetitions : [];
    const summaries = runs.map((run) => summarizeFrameSamples(run?.rawSamples || []));
    const median = medianSummary(summaries);
    observations.push({
      id,
      median,
      targetP95Pass: Number.isFinite(median.p95)
        && median.p95 <= PQ019_H3_BUDGETS.targetSamplingEnvelopeP95Ms,
      framesAbove50Ms: summaries.reduce((sum, row) => sum + Number(row.framesAbove50Ms || 0), 0),
      backlogSheddingFrames: summaries.reduce((sum, row) => sum + Number(row.backlogSheddingFrames || 0), 0),
    });
  }
  const failures = [];
  for (const row of observations) {
    if (!row.targetP95Pass) {
      failures.push(`${row.id} median p95 misses the ${PQ019_H3_BUDGETS.nominalTargetP95Ms} ms target`
        + ` plus bounded sampling envelope (${PQ019_H3_BUDGETS.targetSamplingEnvelopeP95Ms} ms)`);
    }
    if (row.framesAbove50Ms > 0) failures.push(`${row.id} contains ${row.framesAbove50Ms} frame(s) above 50 ms`);
    if (row.backlogSheddingFrames > 0) {
      failures.push(`${row.id} contains ${row.backlogSheddingFrames} backlog-shedding frame(s)`);
    }
  }
  return { pass: failures.length === 0, failures, profiles: observations };
}

function medianSummary(summaries) {
  const valid = summaries.filter(Boolean);
  const out = {};
  for (const key of ['p50', 'p95', 'p99', 'max', 'framesAbove32Ms', 'framesAbove50Ms', 'estimatedMissedVsyncs']) {
    const values = valid.map((summary) => summary?.[key]).filter(Number.isFinite).sort((a, b) => a - b);
    out[key] = values.length ? values[Math.floor(values.length / 2)] : null;
  }
  return out;
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

function stableStringify(value) {
  return JSON.stringify(value, objectKeySorter);
}

function objectKeySorter(key, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const sorted = {};
  for (const name of Object.keys(value).sort()) sorted[name] = value[name];
  return sorted;
}
