import { summarizeFrameSamples } from './performanceClosureContracts.mjs';

export const PQ024_H3_RECEIPT_SCHEMA = 'spaceface.pq024AsteroidClaimH3Performance.v1';
export const PQ024_H3_PROFILE_IDS = Object.freeze([
  'committed-no-relay-floor',
  'producing-one-relay-target',
]);
export const PQ024_H3_REPETITIONS = 3;
export const PQ024_H3_PIPELINE_SETTLE_TIMEOUT_MS = 30_000;
export const PQ024_H3_MIN_RAW_INTERVALS = 120;
export const PQ024_H3_MAX_AUTHORED_HIT_STOP_INTERVALS = 6;
export const PQ024_H3_BUDGETS = Object.freeze({
  nominalTargetP95Ms: 16.7,
  targetSamplingEnvelopeP95Ms: 17.5,
  matchedP95ToleranceMs: 0.8,
  matchedP99ToleranceMs: 0.8,
  matchedCpuWorkP95ToleranceMs: 0.8,
  maxFrameMs: 50,
  maxBacklogSheddingFrames: 0,
  maxSeparatedGpuEnvelopeMs: 17.5,
});

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software rasterizer|microsoft basic render/i;
const RENDERER_ADMISSION_KEYS = Object.freeze([
  'geometries',
  'textures',
  'programs',
  'renderTargets',
]);
const GPU_FRAME_LABELS = Object.freeze([
  'bloomScene',
  'bloomDownsample',
  'bloomComposite',
]);
const MIN_CORRELATED_GPU_FRAMES = 40;

export function validatePq024H3PerformanceReceipt(receipt = {}) {
  const failures = [];
  if (receipt?.schema !== PQ024_H3_RECEIPT_SCHEMA) {
    failures.push(`schema must be ${PQ024_H3_RECEIPT_SCHEMA}`);
  }
  if (receipt?.disposition !== 'PASS') failures.push('receipt disposition must be PASS');
  if (receipt?.fixedSeed !== 24024) failures.push('receipt must bind fixed seed 24024');
  validateViewport(receipt?.viewport, failures);
  validateRuntime(receipt, failures);
  validateQuality(receipt?.qualityPreserving, failures);
  validateCleanup(receipt?.cleanup, failures);
  validateRouteMetadata(receipt?.route, failures);
  if (!Array.isArray(receipt?.pageIssues) || receipt.pageIssues.length !== 0) {
    failures.push('headed route must report an empty page-issue list');
  }

  const profiles = Array.isArray(receipt?.profiles) ? receipt.profiles : [];
  if (profiles.length !== PQ024_H3_PROFILE_IDS.length) {
    failures.push(`receipt must contain exactly ${PQ024_H3_PROFILE_IDS.length} profiles`);
  }
  const byId = new Map();
  for (const profile of profiles) {
    if (!PQ024_H3_PROFILE_IDS.includes(profile?.id)) failures.push(`unknown profile ${profile?.id}`);
    if (byId.has(profile?.id)) failures.push(`duplicate profile ${profile?.id}`);
    byId.set(profile?.id, profile);
  }

  const summariesById = new Map();
  for (const id of PQ024_H3_PROFILE_IDS) {
    const runs = Array.isArray(byId.get(id)?.repetitions) ? byId.get(id).repetitions : [];
    if (runs.length !== PQ024_H3_REPETITIONS) {
      failures.push(`${id} must contain exactly ${PQ024_H3_REPETITIONS} repetitions`);
    }
    const summaries = runs.map((run, index) => validateRun({
      id,
      run,
      expectedIndex: index + 1,
      expectedSeed: receipt?.fixedSeed,
      failures,
    }));
    summariesById.set(id, summaries);
  }

  const floor = byId.get(PQ024_H3_PROFILE_IDS[0]);
  const target = byId.get(PQ024_H3_PROFILE_IDS[1]);
  const hitchAttribution = floor && target
    ? validateMatchedProfiles(floor, target, failures)
    : null;
  const absoluteBudget = evaluateAbsoluteTargetBudget(summariesById);

  return {
    pass: failures.length === 0,
    failures: [...new Set(failures)],
    profiles: PQ024_H3_PROFILE_IDS.map((id) => ({
      id,
      median: medianSummary(summariesById.get(id) || []),
    })),
    budgets: PQ024_H3_BUDGETS,
    hitchAttribution,
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
  if (quality?.playerDefeatIsolationDisclosed !== true
      || quality?.playerContactIsolationDisclosed !== true) {
    failures.push('benchmark-scoped player defeat and contact isolation must be disclosed');
  }
  if (quality?.relayVisualQualityClaimed !== false) {
    failures.push('PQ-024 H3 must not claim relay visual quality');
  }
  if (quality?.performanceImprovementClaimed !== false) {
    failures.push('PQ-024 H3 profile differences must not claim an optimization improvement');
  }
  if (quality?.absoluteTargetClaimed !== false || quality?.absoluteBudgetWaiverGranted !== false) {
    failures.push('PQ-024 H3 must report the absolute target separately without claiming or waiving it');
  }
}

function validateCleanup(cleanup, failures) {
  if (cleanup?.browserClosed !== true || cleanup?.serverClosed !== true) {
    failures.push('owned Browser and server cleanup must both complete');
  }
}

function validateRouteMetadata(route, failures) {
  if (route?.pairCount !== PQ024_H3_REPETITIONS) {
    failures.push(`route must declare exactly ${PQ024_H3_REPETITIONS} matched pairs`);
  }
  if (typeof route?.declaredRoute !== 'string' || route.declaredRoute.trim().length < 40) {
    failures.push('route must describe the measured public owner path');
  }
  if (!Array.isArray(route?.retainedEvidenceReferences)
      || !route.retainedEvidenceReferences.includes(
        'design/program/roadmap/receipts/PQ-024-survey-h1-capture-REPORT.md',
      )) {
    failures.push('route must retain the accepted PQ-024 H1 route evidence');
  }
  const pairs = Array.isArray(route?.pairs) ? route.pairs : [];
  if (pairs.length !== PQ024_H3_REPETITIONS) {
    failures.push(`route metadata must bind all ${PQ024_H3_REPETITIONS} matched pairs`);
  }
  pairs.forEach((pair, index) => {
    const expected = index + 1;
    if (pair?.pairId !== `pq024-h3-pair-${expected}` || pair?.repetition !== expected) {
      failures.push(`route metadata pair ${expected} identity differs`);
    }
    if (pair?.sameContext !== true || pair?.publicRoute !== true) {
      failures.push(`route metadata pair ${expected} must bind one same-context public route`);
    }
    if (pair?.recordedSeed !== 24024) failures.push(`route metadata pair ${expected} seed differs`);
    if (pair?.cleanup?.playerSafetyRestored !== true
        || pair?.cleanup?.timeEffectListenersRemoved !== true
        || pair?.cleanup?.masslineReleased !== true) {
      failures.push(`route metadata pair ${expected} did not restore benchmark isolation and Massline state`);
    }
  });
}

function validateRun({ id, run, expectedIndex, expectedSeed, failures }) {
  const label = `${id}[${expectedIndex}]`;
  if (run?.index !== expectedIndex) failures.push(`${label} repetition index is not exact`);
  const rawSamples = Array.isArray(run?.rawSamples) ? run.rawSamples : [];
  if (rawSamples.length < PQ024_H3_MIN_RAW_INTERVALS) {
    failures.push(`${label} requires at least ${PQ024_H3_MIN_RAW_INTERVALS} raw frame intervals`);
  }
  const summary = summarizeFrameSamples(rawSamples);
  validateSummaryBinding(label, summary, run?.attribution?.frameMs, failures);
  validateRuntimeContinuity(label, rawSamples, run?.routeFacts?.timeEffects, failures);
  const gpuFrame = validateAttribution(label, run?.attribution, failures);
  validateRouteFacts(label, id, expectedIndex, expectedSeed, run?.routeFacts, failures);
  return { ...summary, gpuFrame };
}

function validateSummaryBinding(label, summary, observed, failures) {
  for (const key of ['sampleCount', 'p50', 'p95', 'p99', 'max']) {
    if (!sameNumber(summary?.[key], observed?.[key])) {
      failures.push(`${label} attribution ${key} does not match recomputed raw intervals`);
    }
  }
  if (summary.framesAbove32Ms !== Number(observed?.hitchesOver32Ms)) {
    failures.push(`${label} attribution hitch count does not match recomputed raw intervals`);
  }
}

function validateRuntimeContinuity(label, samples, timeEffects, failures) {
  if (samples.some((sample) => sample?.mode !== 'flight'
    || sample?.docked !== false
    || sample?.playerControlExposed !== true
    || sample?.visibility !== 'visible')) {
    failures.push(`${label} raw intervals left visible controllable flight`);
  }
  const nonUnitSamples = samples.filter((sample) => sample?.timeScale !== 1);
  if (!nonUnitSamples.length) return;
  if (nonUnitSamples.some((sample) => sample?.timeScale !== 0.12)) {
    failures.push(`${label} raw intervals contain a non-hit-stop time-scale change`);
  }
  if (nonUnitSamples.length > PQ024_H3_MAX_AUTHORED_HIT_STOP_INTERVALS) {
    failures.push(`${label} exceeds the bounded gameplay hit-stop interval allowance`);
  }
  const tracedSamples = Array.isArray(timeEffects?.samples) ? timeEffects.samples : [];
  const tracedEvents = Array.isArray(timeEffects?.events) ? timeEffects.events : [];
  const attributed = nonUnitSamples.every((sample) => tracedSamples.some((trace) => (
    trace?.source === 'feel:hit-stop'
      && trace?.scale === 0.12
      && trace?.tick === sample?.tick
      && finiteNumber(trace?.atMs)
      && finiteNumber(sample?.atMs)
      && Math.abs(trace.atMs - sample.atMs) <= 0.25
  )));
  const causal = nonUnitSamples.every((sample) => tracedEvents.some((event) => (
    event?.hitStopActive === true
      && ['combat:damage', 'entity:killed', 'player:death'].includes(event?.event)
      && finiteNumber(event?.atMs)
      && event.atMs >= sample.atMs - 120
      && event.atMs <= sample.atMs + 25
  )));
  if (!attributed || !causal) {
    failures.push(`${label} time-scale change is not source-attributed to an authored feel:hit-stop event`);
  }
}

function validateAttribution(label, attribution, failures) {
  if (attribution?.pipeline?.warmup?.pass !== true
      || attribution?.pipeline?.warmup?.timedOut === true) {
    failures.push(`${label} pipeline warmup/stability did not pass`);
  }
  if (attribution?.memory?.comparableState?.pass !== true) {
    failures.push(`${label} route state changed during measurement`);
  }
  const settingsStart = attribution?.settings?.start;
  const settingsEnd = attribution?.settings?.end;
  if (!settingsStart || !settingsEnd
      || stableStringify(settingsStart) !== stableStringify(settingsEnd)
      || settingsStart?.dynResScale !== 1
      || settingsStart?.timeScale !== 1
      || settingsStart?.video?.particleQuality !== 'medium'
      || settingsStart?.video?.motionReduce !== false
      || settingsStart?.video?.dynamicResolution !== false) {
    failures.push(`${label} settings changed or differ from the default target profile`);
  }
  const gpu = attribution?.gpuTimers;
  const isolation = attribution?.measurementIsolation;
  const counts = gpu?.queryCounts;
  if (gpu?.available !== true || gpu?.captureValid !== true || gpu?.lastDisjoint === true
      || gpu?.enabled !== true || gpu?.drain?.drained !== true || Number(gpu?.pending) !== 0
      || isolation?.frameTimingGpuTimersEnabled !== false
      || isolation?.gpuAttributionSeparated !== true
      || isolation?.gpuAttributionFrameCount !== 150
      || !finitePositive(isolation?.gpuAttributionDurationMs)
      || isolation?.settingsStable !== true || isolation?.routeStable !== true
      || counts?.attempted !== 450 || counts?.issued !== 450 || counts?.completed !== 450
      || counts?.dropped !== 0 || counts?.rejected !== 0) {
    failures.push(`${label} requires isolated GPU attribution with exactly 450 fully drained queries`);
  }
  for (const key of ['calls', 'triangles', 'geometries', 'textures', 'programs']) {
    if (!finiteNonnegative(attribution?.draw?.[key])) failures.push(`${label} draw.${key} is missing`);
  }
  for (const key of ['sim', 'render', 'vfx', 'ui']) {
    if (!finiteNonnegative(attribution?.cpu?.phases?.[key]?.p95)) {
      failures.push(`${label} cpu phase ${key}.p95 is missing`);
    }
  }
  if (!finiteNonnegative(attribution?.cpu?.frameCallback?.p95)) {
    failures.push(`${label} cpu frameCallback.p95 is missing`);
  }
  if (!attribution?.cpu?.systems || typeof attribution.cpu.systems !== 'object') {
    failures.push(`${label} system attribution is missing`);
  }
  const rendererDelta = attribution?.memory?.renderer?.delta || attribution?.resourceDelta;
  for (const key of RENDERER_ADMISSION_KEYS) {
    const value = rendererDelta?.[key];
    if (!Number.isInteger(value) || value < 0) {
      failures.push(`${label} renderer ${key} admission delta is missing or negative`);
    }
  }
  if (Number(rendererDelta?.programs) !== 0 || Number(rendererDelta?.renderTargets) !== 0) {
    failures.push(`${label} renderer programs and render targets must remain stable`);
  }
  const gpuFrame = correlatedGpuFrameSummary(gpu?.terminals);
  if (gpuFrame.sampleCount < MIN_CORRELATED_GPU_FRAMES) {
    failures.push(`${label} requires at least ${MIN_CORRELATED_GPU_FRAMES} complete correlated GPU frames`);
  }
  return gpuFrame;
}

function validateRouteFacts(label, id, expectedIndex, expectedSeed, facts, failures) {
  if (facts?.profileId !== id || facts?.repetition !== expectedIndex
      || facts?.pairId !== `pq024-h3-pair-${expectedIndex}`) {
    failures.push(`${label} route identity differs`);
  }
  if (facts?.recordedSeed !== expectedSeed) failures.push(`${label} fixed seed differs`);
  if (facts?.sectorId !== 'sector_helios_prime' || facts?.mode !== 'flight'
      || facts?.docked !== false || facts?.playerControlExposed !== true) {
    failures.push(`${label} must remain in controllable Helios flight`);
  }
  if (!facts?.siteId || facts?.asteroidTargetId == null) {
    failures.push(`${label} must bind the public asteroid and site identity`);
  }
  if (!finiteNumber(facts?.pose?.x) || !finiteNumber(facts?.pose?.z)
      || !finiteNumber(facts?.pose?.rot) || facts?.pose?.cameraZoom !== 88) {
    failures.push(`${label} must bind the fixed accepted claim-camera pose`);
  }
  if (facts?.performanceIsolation?.playerDefeatSuppressed !== true
      || facts?.performanceIsolation?.playerContactSuppressed !== true
      || facts?.performanceIsolation?.npcCombatRetained !== true
      || facts?.performanceIsolation?.ambientVfxRetained !== true) {
    failures.push(`${label} must disclose benchmark isolation while retaining ambient combat and VFX`);
  }
  if (!(Number(facts?.survey?.revealed) > 0)
      || Number(facts?.survey?.cells) < Number(facts?.survey?.revealed)) {
    failures.push(`${label} must bind the public positive survey reveal`);
  }
  if (facts?.core?.anchored !== true || facts?.core?.lifecycle == null
      || !Number.isInteger(facts?.core?.cell?.col) || !Number.isInteger(facts?.core?.cell?.row)) {
    failures.push(`${label} must bind the anchored public Core placement`);
  }
  const site = facts?.site || {};
  const production = facts?.production || {};
  const relay = facts?.relay || {};
  if (id === PQ024_H3_PROFILE_IDS[0]) {
    if (site.lifecycle !== 'committed' || site.anchored !== true
        || site.machineCount !== 1 || site.coreCount !== 1 || site.extractorCount !== 0) {
      failures.push(`${label} floor must be one committed Core with no extractor`);
    }
    if (production.receipt != null || production.eventCount !== 0 || relay.count !== 0) {
      failures.push(`${label} floor must contain no production receipt or exterior relay`);
    }
    return;
  }
  if (site.lifecycle !== 'producing' || site.anchored !== true
      || site.machineCount !== 2 || site.coreCount !== 1 || site.extractorCount !== 1) {
    failures.push(`${label} target must be one producing Core plus one real extractor`);
  }
  if (!production.receipt?.outputId || !(Number(production.receipt?.positiveQuantity) > 0)
      || production.eventCount !== 1) {
    failures.push(`${label} target must bind exactly one authoritative positive production event`);
  }
  if (relay.count !== 1 || relay.placeId !== 'place_claim_outpost_relay'
      || relay.siteId !== facts.siteId || relay.presentationAdmission !== 'ready'
      || relay.assetState !== 'authored') {
    failures.push(`${label} target must bind exactly one admitted authored exterior relay`);
  }
  const rendering = relay.rendering || {};
  const materialPolicy = rendering.materialPolicy || {};
  if (rendering.appliedLod !== 'lod1'
      || rendering.visibleMeshes !== 1
      || rendering.visibleIndexedMeshes !== 1
      || rendering.visibleDrawCalls !== 5
      || rendering.visibleTriangles !== 21_532
      || rendering.visibleVertices !== 42_786
      || rendering.visibleIndices !== 64_596
      || rendering.visibleMaterialCount !== 5
      || rendering.packedOrmMaterialCount !== 5
      || rendering.closedFrontMaterialCount !== 5
      || materialPolicy.assetId !== 'place_claim_outpost_relay'
      || materialPolicy.surfaceContract !== 'closed-authored-primitives-front-sided'
      || materialPolicy.packedOrmContract !== 'one-shared-fetch-for-ao-roughness-metalness'
      || materialPolicy.materialCount !== 5
      || materialPolicy.packedOrmMaterialCount !== 5) {
    failures.push(`${label} target must bind the exact optimized authored relay LOD1 material path`);
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
    const leftFacts = left?.routeFacts;
    const rightFacts = right?.routeFacts;
    if (leftFacts?.pairId !== rightFacts?.pairId || leftFacts?.siteId !== rightFacts?.siteId
        || leftFacts?.asteroidTargetId !== rightFacts?.asteroidTargetId
        || stableStringify(leftFacts?.survey) !== stableStringify(rightFacts?.survey)
        || stableStringify(leftFacts?.core?.cell) !== stableStringify(rightFacts?.core?.cell)) {
      failures.push(`matched pair ${index + 1} changed asteroid, site, survey, or Core identity`);
    }
    validateStablePose(leftFacts?.pose, rightFacts?.pose, index + 1, failures);
  }

  const rendererAdmission = { floor: {}, target: {} };
  for (const key of RENDERER_ADMISSION_KEYS) {
    rendererAdmission.floor[key] = medianValue(floorRuns.map((run) => Number(
      (run?.attribution?.memory?.renderer?.delta || run?.attribution?.resourceDelta)?.[key],
    )));
    rendererAdmission.target[key] = medianValue(targetRuns.map((run) => Number(
      (run?.attribution?.memory?.renderer?.delta || run?.attribution?.resourceDelta)?.[key],
    )));
    if (rendererAdmission.target[key] > rendererAdmission.floor[key]) {
      failures.push(`relay target median renderer ${key} admission exceeds the committed floor median`);
    }
  }

  const floorSummaries = floorRuns.map((run) => summarizeFrameSamples(run?.rawSamples || []));
  const targetSummaries = targetRuns.map((run) => summarizeFrameSamples(run?.rawSamples || []));
  const floorMedian = medianSummary(floorSummaries);
  const targetMedian = medianSummary(targetSummaries);
  if (finiteNumber(floorMedian.p95) && finiteNumber(targetMedian.p95)
      && targetMedian.p95 > floorMedian.p95 + PQ024_H3_BUDGETS.matchedP95ToleranceMs) {
    failures.push(`relay target median p95 regresses by more than ${PQ024_H3_BUDGETS.matchedP95ToleranceMs} ms`);
  }
  if (finiteNumber(floorMedian.p99) && finiteNumber(targetMedian.p99)
      && targetMedian.p99 > floorMedian.p99 + PQ024_H3_BUDGETS.matchedP99ToleranceMs) {
    failures.push(`relay target median p99 regresses by more than ${PQ024_H3_BUDGETS.matchedP99ToleranceMs} ms`);
  }
  const floorHitches = summarizeHitchAttribution(floorRuns);
  const targetHitches = summarizeHitchAttribution(targetRuns);
  if (targetHitches.medianProductAttributedRate > floorHitches.medianProductAttributedRate) {
    failures.push('relay target median product-attributed hitch rate increases from the committed floor');
  }
  const cpuWorkEnvelope = summarizeCpuWorkEnvelope(floorRuns, targetRuns);
  for (const [key, row] of Object.entries(cpuWorkEnvelope)) {
    if (finiteNumber(row.floorMedianP95) && finiteNumber(row.targetMedianP95)
        && row.targetMedianP95 > row.floorMedianP95 + PQ024_H3_BUDGETS.matchedCpuWorkP95ToleranceMs) {
      failures.push(`relay target median ${key} CPU p95 regresses by more than ${PQ024_H3_BUDGETS.matchedCpuWorkP95ToleranceMs} ms`);
    }
  }
  if (sum(targetSummaries, 'framesAbove50Ms') > 0) {
    failures.push('relay target contains one or more frames above 50 ms');
  }
  if (sum(targetSummaries, 'backlogSheddingFrames') > PQ024_H3_BUDGETS.maxBacklogSheddingFrames) {
    failures.push('relay target contains backlog-shedding frames');
  }
  const floorGpuFrames = floorRuns.map((run) => correlatedGpuFrameSummary(
    run?.attribution?.gpuTimers?.terminals,
  ));
  const targetGpuFrames = targetRuns.map((run) => correlatedGpuFrameSummary(
    run?.attribution?.gpuTimers?.terminals,
  ));
  const gpuFrameEnvelope = {
    floor: { perRun: floorGpuFrames, medianP95: medianValue(floorGpuFrames.map((row) => row.p95)) },
    target: { perRun: targetGpuFrames, medianP95: medianValue(targetGpuFrames.map((row) => row.p95)) },
  };
  if (!finiteNumber(gpuFrameEnvelope.target.medianP95)
      || gpuFrameEnvelope.target.medianP95 > PQ024_H3_BUDGETS.maxSeparatedGpuEnvelopeMs) {
    failures.push(`relay target correlated GPU-frame median p95 exceeds ${PQ024_H3_BUDGETS.maxSeparatedGpuEnvelopeMs} ms`);
  }
  return { floor: floorHitches, target: targetHitches, cpuWorkEnvelope, rendererAdmission, gpuFrameEnvelope };
}

function validateStablePose(left, right, pairIndex, failures) {
  const positionDelta = Math.hypot(Number(right?.x) - Number(left?.x), Number(right?.z) - Number(left?.z));
  const rotationDelta = Math.abs(Number(right?.rot) - Number(left?.rot));
  if (!finiteNumber(positionDelta) || positionDelta > 0.5
      || !finiteNumber(rotationDelta) || rotationDelta > 0.01
      || left?.cameraZoom !== right?.cameraZoom
      || left?.selectedTargetId !== right?.selectedTargetId) {
    failures.push(`matched pair ${pairIndex} changed player pose, camera, or target selection`);
  }
}

function summarizeHitchAttribution(runs) {
  const perRun = runs.map((run) => {
    const samples = Array.isArray(run?.rawSamples) ? run.rawSamples : [];
    const hitches = samples
      .filter((sample) => Number(sample?.frameMs) > 32);
    const externalScheduling = hitches.filter((sample) => (
      finiteNonnegative(sample?.callbackMs)
      && sample.callbackMs <= PQ024_H3_BUDGETS.targetSamplingEnvelopeP95Ms
      && finiteNonnegative(sample?.simFrameMs)
      && sample.simFrameMs <= PQ024_H3_BUDGETS.targetSamplingEnvelopeP95Ms
      && finiteNonnegative(sample?.presentationMs)
      && sample.presentationMs <= PQ024_H3_BUDGETS.targetSamplingEnvelopeP95Ms
      && sample?.shedBacklog !== true
      && (Number(sample?.externalCallbackGapMs) > 0 || Number(sample?.callbackDispatchLagMs) > 0)
    )).length;
    const productAttributed = hitches.length - externalScheduling;
    const denominator = Math.max(1, samples.length);
    return {
      sampleCount: samples.length,
      raw: hitches.length,
      rawRate: hitches.length / denominator,
      externalScheduling,
      externalSchedulingRate: externalScheduling / denominator,
      productAttributed,
      productAttributedRate: productAttributed / denominator,
    };
  });
  return {
    raw: sum(perRun, 'raw'),
    externalScheduling: sum(perRun, 'externalScheduling'),
    productAttributed: sum(perRun, 'productAttributed'),
    medianExternalScheduling: medianValue(perRun.map((row) => row.externalScheduling)),
    medianExternalSchedulingRate: medianValue(perRun.map((row) => row.externalSchedulingRate)),
    medianProductAttributed: medianValue(perRun.map((row) => row.productAttributed)),
    medianProductAttributedRate: medianValue(perRun.map((row) => row.productAttributedRate)),
    perRun,
  };
}

function summarizeCpuWorkEnvelope(floorRuns, targetRuns) {
  const selectors = {
    frameCallback: (run) => run?.attribution?.cpu?.frameCallback?.p95,
    renderPhase: (run) => run?.attribution?.cpu?.phases?.render?.p95,
    simPhase: (run) => run?.attribution?.cpu?.phases?.sim?.p95,
  };
  return Object.fromEntries(Object.entries(selectors).map(([key, select]) => [key, {
    floorMedianP95: medianValue(floorRuns.map((run) => Number(select(run)))),
    targetMedianP95: medianValue(targetRuns.map((run) => Number(select(run)))),
  }]));
}

function correlatedGpuFrameSummary(terminals) {
  const groups = new Map();
  for (const terminal of Array.isArray(terminals) ? terminals : []) {
    if (terminal?.state !== 'completed' || !Number.isSafeInteger(terminal?.displayFrameId)
        || !GPU_FRAME_LABELS.includes(terminal?.label) || !finiteNonnegative(terminal?.elapsedMs)) continue;
    let group = groups.get(terminal.displayFrameId);
    if (!group) {
      group = { labels: new Set(), totalMs: 0, duplicate: false };
      groups.set(terminal.displayFrameId, group);
    }
    if (group.labels.has(terminal.label)) group.duplicate = true;
    group.labels.add(terminal.label);
    group.totalMs += Number(terminal.elapsedMs);
  }
  const values = [...groups.values()]
    .filter((group) => !group.duplicate && GPU_FRAME_LABELS.every((label) => group.labels.has(label)))
    .map((group) => group.totalMs)
    .sort((left, right) => left - right);
  return {
    sampleCount: values.length,
    p50: percentileValue(values, 0.50),
    p95: percentileValue(values, 0.95),
    p99: percentileValue(values, 0.99),
    max: values.length ? values.at(-1) : null,
  };
}

function evaluateAbsoluteTargetBudget(summariesById) {
  const profiles = [];
  const failures = [];
  for (const id of PQ024_H3_PROFILE_IDS) {
    const median = medianSummary(summariesById.get(id) || []);
    const targetP95Pass = finiteNumber(median.p95)
      && median.p95 <= PQ024_H3_BUDGETS.targetSamplingEnvelopeP95Ms;
    profiles.push({ id, median, targetP95Pass });
    if (!targetP95Pass) {
      failures.push(`${id} median p95 misses the ${PQ024_H3_BUDGETS.targetSamplingEnvelopeP95Ms} ms sampling envelope`);
    }
  }
  return { pass: failures.length === 0, failures, profiles };
}

function medianSummary(summaries) {
  const result = {};
  for (const key of [
    'p50', 'p95', 'p99', 'max', 'framesAbove32Ms', 'framesAbove50Ms',
    'estimatedMissedVsyncs', 'backlogSheddingFrames',
  ]) result[key] = medianValue(summaries.map((summary) => summary?.[key]));
  return result;
}

function medianValue(values) {
  const finite = values.filter(finiteNumber).sort((left, right) => left - right);
  return finite.length ? finite[Math.floor(finite.length / 2)] : null;
}

function percentileValue(sortedValues, quantile) {
  if (!sortedValues.length) return null;
  const index = Math.max(0, Math.min(sortedValues.length - 1,
    Math.ceil(quantile * sortedValues.length) - 1));
  return sortedValues[index];
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row?.[key]) || 0), 0);
}

function sameNumber(left, right) {
  if (left == null || right == null) return left === right;
  return finiteNumber(left) && finiteNumber(right) && Math.abs(left - right) <= 1e-6;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function finitePositive(value) {
  return finiteNumber(value) && Number(value) > 0;
}

function finiteNonnegative(value) {
  return finiteNumber(value) && Number(value) >= 0;
}

function stableStringify(value) {
  return JSON.stringify(value, objectKeySorter);
}

function objectKeySorter(_key, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
}
