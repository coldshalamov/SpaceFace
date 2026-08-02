import { summarizeFrameSamples } from './performanceClosureContracts.mjs';

export const PQ023_H3_RECEIPT_SCHEMA = 'spaceface.pq023DenseCueH3Performance.v1';
export const PQ023_H3_PROFILE_IDS = Object.freeze([
  'authored-helios-flight-floor',
  'dense-cue-target',
]);
export const PQ023_H3_REPETITIONS = 3;
export const PQ023_H3_PIPELINE_SETTLE_TIMEOUT_MS = 30_000;
// A five-second window at the 30 fps floor yields about 150 intervals. Requiring a 60 fps-sized
// count would reject the negative evidence before the timing distribution could be evaluated.
export const PQ023_H3_MIN_RAW_INTERVALS = 120;
export const PQ023_H3_POOL_CAPACITIES = Object.freeze({
  particles: 3_000,
  sprites: 256,
  trailStreaks: 96,
  combatBeams: 16,
  explosions: 24,
});
export const PQ023_H3_DENSE_MINIMA = Object.freeze({
  particles: 50,
  sprites: 62,
  trailStreaks: 31,
  combatBeams: 1,
  explosions: 6,
});
// H3 repeats the one accepted H1 representative; it must not manufacture extra pressure by stacking
// several ordinary explosion lifecycles. The explosion bound is the causal overlap guard, while the
// other bounds protect the same cue from saturating a default pool through a harness regression.
export const PQ023_H3_DENSE_MAXIMA = Object.freeze({
  particles: 300,
  sprites: 128,
  trailStreaks: 96,
  combatBeams: 1,
  explosions: 6,
});
const PQ023_H3_RENDERER_ADMISSION_LIMITS = Object.freeze({
  geometries: 2,
  textures: 1,
  programs: 0,
  renderTargets: 0,
});
const PQ023_H3_GPU_FRAME_LABELS = Object.freeze([
  'bloomScene',
  'bloomDownsample',
  'bloomComposite',
]);
const PQ023_H3_MIN_CORRELATED_GPU_FRAMES = 40;
export const PQ023_H3_BUDGETS = Object.freeze({
  nominalTargetP95Ms: 16.7,
  targetSamplingEnvelopeP95Ms: 17.5,
  matchedP95ToleranceMs: 0.8,
  matchedP99ToleranceMs: 0.8,
  maxFrameMs: 50,
  maxBacklogSheddingFrames: 0,
  maxExternalSchedulingMedianHitchDelta: 2,
  maxSeparatedGpuEnvelopeMs: 17.5,
});

export function validatePq023H3PerformanceReceipt(receipt = {}) {
  const failures = [];
  if (receipt?.schema !== PQ023_H3_RECEIPT_SCHEMA) failures.push('receipt schema differs');
  if (receipt?.disposition !== 'PASS') failures.push('receipt disposition must be PASS');
  if (receipt?.fixedSeed !== 47) failures.push('receipt must bind fixed seed 47');
  validateViewport(receipt?.viewport, failures);
  validateRuntime(receipt, failures);
  validateQuality(receipt?.qualityPreserving, failures);
  validateBroker(receipt?.broker, failures);
  validateCleanup(receipt?.cleanup, failures);
  if (!Array.isArray(receipt?.pageIssues) || receipt.pageIssues.length !== 0) {
    failures.push('headed route must report an empty page-issue list');
  }

  const routePairs = Array.isArray(receipt?.route?.pairs) ? receipt.route.pairs : [];
  if (receipt?.route?.pairCount !== PQ023_H3_REPETITIONS
      || routePairs.length !== PQ023_H3_REPETITIONS) {
    failures.push(`route must contain exactly ${PQ023_H3_REPETITIONS} matched pairs`);
  }
  routePairs.forEach((pair, index) => validatePair(pair, index + 1, failures));

  const profiles = Array.isArray(receipt?.profiles) ? receipt.profiles : [];
  if (profiles.length !== PQ023_H3_PROFILE_IDS.length) {
    failures.push(`receipt must contain exactly ${PQ023_H3_PROFILE_IDS.length} profiles`);
  }
  const byId = new Map();
  for (const profile of profiles) {
    if (!PQ023_H3_PROFILE_IDS.includes(profile?.id)) failures.push(`unknown profile ${profile?.id}`);
    if (byId.has(profile?.id)) failures.push(`duplicate profile ${profile?.id}`);
    byId.set(profile?.id, profile);
  }

  const summariesById = new Map();
  for (const id of PQ023_H3_PROFILE_IDS) {
    const profile = byId.get(id);
    const runs = Array.isArray(profile?.repetitions) ? profile.repetitions : [];
    if (runs.length !== PQ023_H3_REPETITIONS) {
      failures.push(`${id} must contain exactly ${PQ023_H3_REPETITIONS} repetitions`);
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

  const floor = byId.get(PQ023_H3_PROFILE_IDS[0]);
  const target = byId.get(PQ023_H3_PROFILE_IDS[1]);
  const hitchAttribution = floor && target
    ? validateMatchedProfiles(floor, target, failures)
    : null;
  const absoluteBudget = evaluateAbsoluteTargetBudget(summariesById);

  return {
    pass: failures.length === 0,
    failures,
    profiles: PQ023_H3_PROFILE_IDS.map((id) => ({
      id,
      median: medianSummary(summariesById.get(id) || []),
    })),
    budgets: PQ023_H3_BUDGETS,
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
    failures.push('runtime must be headed Chromium');
  }
  if (receipt?.gpu?.available !== true
      || !/Intel/i.test(receipt?.gpu?.renderer || '')
      || !/D3D11/i.test(receipt?.gpu?.renderer || '')
      || /SwiftShader|llvmpipe|software/i.test(receipt?.gpu?.renderer || '')) {
    failures.push('target profile requires the bound Intel D3D11 renderer');
  }
}

function validateQuality(quality, failures) {
  if (quality?.settingsOverridesApplied !== false
      || quality?.defaultQualityRetained !== true) {
    failures.push('PQ-023 H3 must retain default quality without settings overrides');
  }
  if (quality?.performanceImprovementClaimed !== false
      || quality?.absoluteTargetClaimed !== false
      || quality?.absoluteBudgetWaiverGranted !== false) {
    failures.push('PQ-023 H3 must report matched performance without inventing an A/B gain or waiver');
  }
}

function validateBroker(broker, failures) {
  if (broker?.diagnostic === true && broker?.primaryAcceptance === false && !broker?.claimId) return;
  if (broker?.primaryAcceptance !== true || broker?.diagnostic !== false || !broker?.claimId) {
    failures.push('receipt must bind one primary non-diagnostic broker claim');
  }
}

function validateCleanup(cleanup, failures) {
  if (cleanup?.browserClosed !== true || cleanup?.serverClosed !== true) {
    failures.push('owned Browser and server cleanup must both pass');
  }
}

function validatePair(pair, expectedIndex, failures) {
  const label = `pair ${expectedIndex}`;
  if (pair?.pairId !== `pq023-h3-pair-${expectedIndex}` || pair?.repetition !== expectedIndex) {
    failures.push(`${label} identity differs`);
  }
  if (pair?.sameContext !== true) failures.push(`${label} floor and target must share one context`);
  if (pair?.source !== 'accepted-pq023-dense-representative') {
    failures.push(`${label} must bind the accepted PQ-023 dense representative`);
  }
  const preflight = pair?.preflight || {};
  if (preflight.denseSurfacesWarmed !== true || preflight.pulseCount !== 1
      || !allPoolsZero(preflight.cleanupPools)
      || !sameCapacities(preflight.poolCapacities)) {
    failures.push(`${label} preflight must warm one dense representative and clean every owned pool`);
  }
  for (const [key, minimum] of Object.entries(PQ023_H3_DENSE_MINIMA)) {
    if (Number(preflight?.peakPools?.[key]) < minimum) {
      failures.push(`${label} preflight did not warm the ${key} dense surface`);
    }
  }
  for (const [key, maximum] of Object.entries(PQ023_H3_DENSE_MAXIMA)) {
    if (Number(preflight?.peakPools?.[key]) > maximum) {
      failures.push(`${label} preflight multiplies the accepted dense ${key} representative above ${maximum}`);
    }
  }
  const cleanup = pair?.cleanup || {};
  if (cleanup.driverStopped !== true || cleanup.targetRemoved !== true
      || !allPoolsZero(cleanup.livePools)) {
    failures.push(`${label} cleanup must stop the driver, remove its target, and empty every owned pool`);
  }
  if (!sameCapacities(cleanup.poolCapacities)) {
    failures.push(`${label} cleanup pool capacities differ from the accepted default profile`);
  }
}

function validateRun({ id, run, expectedIndex, expectedSeed, failures }) {
  const label = `${id} repetition ${expectedIndex}`;
  if (run?.index !== expectedIndex) failures.push(`${label} repetition index is not exact`);
  const rawSamples = Array.isArray(run?.rawSamples) ? run.rawSamples : [];
  if (rawSamples.length < PQ023_H3_MIN_RAW_INTERVALS) {
    failures.push(`${label} requires at least ${PQ023_H3_MIN_RAW_INTERVALS} raw frame intervals`);
  }
  const summary = summarizeFrameSamples(rawSamples);
  validateSummaryBinding(label, summary, run?.attribution?.frameMs, failures);
  validateRuntimeContinuity(label, rawSamples, failures);
  validateAttribution(label, run?.attribution, failures);
  validateRouteFacts(label, id, expectedIndex, expectedSeed, run?.routeFacts, failures);
  return summary;
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
  if (samples.some((sample) => sample?.timeScale !== 1)) {
    failures.push(`${label} raw intervals must retain timeScale 1`);
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
      || settingsStart?.video?.motionReduce !== false) {
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
  if (!attribution?.cpu?.systems || typeof attribution.cpu.systems !== 'object') {
    failures.push(`${label} system attribution is missing`);
  }
  const rendererDelta = attribution?.memory?.renderer?.delta || attribution?.resourceDelta;
  for (const [key, maximum] of Object.entries(PQ023_H3_RENDERER_ADMISSION_LIMITS)) {
    const value = Number(rendererDelta?.[key]);
    if (!Number.isInteger(value) || value < 0 || value > maximum) {
      const subject = key === 'geometries' ? 'geometry' : key;
      failures.push(`${label} renderer ${subject} admission exceeds the ambient bound ${maximum}`);
    }
  }
  const gpuFrame = correlatedGpuFrameSummary(gpu?.terminals);
  if (gpuFrame.sampleCount < PQ023_H3_MIN_CORRELATED_GPU_FRAMES) {
    failures.push(`${label} requires at least ${PQ023_H3_MIN_CORRELATED_GPU_FRAMES} complete correlated GPU frames`);
  }
  return gpuFrame;
}

function validateRouteFacts(label, id, expectedIndex, expectedSeed, facts, failures) {
  if (facts?.profileId !== id || facts?.repetition !== expectedIndex
      || facts?.pairId !== `pq023-h3-pair-${expectedIndex}`) {
    failures.push(`${label} route identity differs`);
  }
  if (facts?.recordedSeed !== expectedSeed) failures.push(`${label} fixed seed differs`);
  if (facts?.sectorId !== 'sector_helios_prime' || facts?.mode !== 'flight'
      || facts?.docked !== false || facts?.playerControlExposed !== true) {
    failures.push(`${label} must remain in controllable Helios flight`);
  }
  if (facts?.player?.entityId == null || facts?.player?.admission !== 'ready'
      || facts?.player?.assetState !== 'authored') {
    failures.push(`${label} requires the authored ready player`);
  }
  if (!finiteNumber(facts?.pose?.x) || !finiteNumber(facts?.pose?.z)
      || !finiteNumber(facts?.pose?.rot) || facts?.pose?.cameraZoom !== 88) {
    failures.push(`${label} must bind the accepted combat-camera pose`);
  }
  if (facts?.spatialContract?.sourceEntityId !== facts?.player?.entityId
      || !facts?.spatialContract?.fittedWeaponId
      || Number(facts?.spatialContract?.pathLength) <= 10) {
    failures.push(`${label} must bind the accepted live-hardpoint spatial contract`);
  }
  if (!sameCapacities(facts?.poolCapacities)) {
    failures.push(`${label} pool capacities differ from the accepted default profile`);
  }
  for (const [key, value] of Object.entries(facts?.livePools || {})) {
    if (!finiteNonnegative(value) || Number(value) > Number(facts?.poolCapacities?.[key])) {
      failures.push(`${label} live ${key} count is missing or exceeds capacity`);
    }
  }

  const dense = facts?.dense || {};
  if (id === PQ023_H3_PROFILE_IDS[0]) {
    if (dense.active !== false || dense.pulseCount !== 0 || dense.beamRefreshCount !== 0
        || dense.criticalAttempted !== 0 || dense.flavorAttempted !== 0) {
      failures.push(`${label} floor must contain no acceptance-owned dense driver work`);
    }
    return;
  }

  if (dense.active !== true || dense.source !== 'accepted-pq023-dense-representative'
      || !Number.isInteger(dense.pulseCount) || dense.pulseCount < 6) {
    failures.push(`${label} dense pulse driver is missing or not sustained`);
  }
  if (!Number.isInteger(dense.beamRefreshCount) || dense.beamRefreshCount < 30) {
    failures.push(`${label} connected beam was not sustained through the target window`);
  }
  if (dense.criticalAttempted !== dense.pulseCount * 3
      || dense.criticalEmitted !== dense.criticalAttempted
      || dense.criticalSuppressed !== 0) {
    failures.push(`${label} critical cue survival is incomplete under saturation`);
  }
  if (dense.flavorAttempted !== dense.pulseCount * 10 || !(dense.flavorSuppressed > 0)) {
    failures.push(`${label} flavor lane did not prove real dense saturation`);
  }
  for (const [key, minimum] of Object.entries(PQ023_H3_DENSE_MINIMA)) {
    if (Number(dense?.peakPools?.[key]) < minimum) {
      const subject = key === 'combatBeams' ? 'connected beam' : key;
      failures.push(`${label} dense ${subject} peak is below the accepted representative minimum ${minimum}`);
    }
  }
  for (const [key, maximum] of Object.entries(PQ023_H3_DENSE_MAXIMA)) {
    if (Number(dense?.peakPools?.[key]) > maximum) {
      failures.push(`${label} harness multiplies the accepted dense ${key} representative above ${maximum}`);
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
    if (left?.routeFacts?.pairId !== right?.routeFacts?.pairId) {
      failures.push(`matched pair ${index + 1} route identity changed`);
    }
    validateStablePose(left?.routeFacts?.pose, right?.routeFacts?.pose, index + 1, failures);
    if (!sameCapacities(left?.routeFacts?.poolCapacities)
        || stableStringify(left?.routeFacts?.poolCapacities)
          !== stableStringify(right?.routeFacts?.poolCapacities)) {
      failures.push(`matched pair ${index + 1} pool capacities changed`);
    }
    const floorRenderer = left?.attribution?.memory?.renderer?.delta || left?.attribution?.resourceDelta;
    const targetRenderer = right?.attribution?.memory?.renderer?.delta || right?.attribution?.resourceDelta;
    for (const key of Object.keys(PQ023_H3_RENDERER_ADMISSION_LIMITS)) {
      if (Number(targetRenderer?.[key]) > Number(floorRenderer?.[key])) {
        failures.push(`matched pair ${index + 1} dense target renderer ${key} admission exceeds its ambient floor`);
      }
    }
  }

  const floorSummaries = floorRuns.map((run) => summarizeFrameSamples(run?.rawSamples || []));
  const targetSummaries = targetRuns.map((run) => summarizeFrameSamples(run?.rawSamples || []));
  const floorMedian = medianSummary(floorSummaries);
  const targetMedian = medianSummary(targetSummaries);
  if (Number.isFinite(floorMedian.p95) && Number.isFinite(targetMedian.p95)
      && targetMedian.p95 > floorMedian.p95 + PQ023_H3_BUDGETS.matchedP95ToleranceMs) {
    failures.push(`dense target median p95 regresses by more than ${PQ023_H3_BUDGETS.matchedP95ToleranceMs} ms`);
  }
  if (Number.isFinite(floorMedian.p99) && Number.isFinite(targetMedian.p99)
      && targetMedian.p99 > floorMedian.p99 + PQ023_H3_BUDGETS.matchedP99ToleranceMs) {
    failures.push(`dense target median p99 regresses by more than ${PQ023_H3_BUDGETS.matchedP99ToleranceMs} ms`);
  }

  const floorHitches = summarizeHitchAttribution(floorRuns);
  const targetHitches = summarizeHitchAttribution(targetRuns);
  if (targetHitches.productAttributed > floorHitches.productAttributed) {
    failures.push('dense target product-attributed hitch count increases from the matched floor');
  }
  if (targetHitches.medianExternalScheduling
      > floorHitches.medianExternalScheduling
        + PQ023_H3_BUDGETS.maxExternalSchedulingMedianHitchDelta) {
    failures.push('dense target median external-scheduling hitch count exceeds the matched noise envelope');
  }
  if (sum(targetSummaries, 'framesAbove50Ms') > 0) {
    failures.push('dense target contains one or more frames above 50 ms');
  }
  if (sum(targetSummaries, 'backlogSheddingFrames') > PQ023_H3_BUDGETS.maxBacklogSheddingFrames) {
    failures.push('dense target contains backlog-shedding frames');
  }
  const floorGpuFrames = floorRuns.map((run) => correlatedGpuFrameSummary(
    run?.attribution?.gpuTimers?.terminals,
  ));
  const targetGpuFrames = targetRuns.map((run) => correlatedGpuFrameSummary(
    run?.attribution?.gpuTimers?.terminals,
  ));
  const gpuFrameEnvelope = {
    floor: {
      perRun: floorGpuFrames,
      medianP95: medianValue(floorGpuFrames.map((summary) => summary.p95)),
    },
    target: {
      perRun: targetGpuFrames,
      medianP95: medianValue(targetGpuFrames.map((summary) => summary.p95)),
    },
  };
  if (!Number.isFinite(gpuFrameEnvelope.target.medianP95)
      || gpuFrameEnvelope.target.medianP95 > PQ023_H3_BUDGETS.maxSeparatedGpuEnvelopeMs) {
    failures.push(`dense target correlated GPU-frame median p95 exceeds ${PQ023_H3_BUDGETS.maxSeparatedGpuEnvelopeMs} ms`);
  }
  return { floor: floorHitches, target: targetHitches, gpuFrameEnvelope };
}

function validateStablePose(left, right, pairIndex, failures) {
  const positionDelta = Math.hypot(
    Number(right?.x) - Number(left?.x),
    Number(right?.z) - Number(left?.z),
  );
  const rotationDelta = Math.abs(Number(right?.rot) - Number(left?.rot));
  if (!Number.isFinite(positionDelta) || positionDelta > 0.5
      || !Number.isFinite(rotationDelta) || rotationDelta > 0.01
      || left?.cameraZoom !== right?.cameraZoom
      || left?.selectedTargetId !== right?.selectedTargetId) {
    failures.push(`matched pair ${pairIndex} changed player pose, camera, or target selection`);
  }
}

function summarizeHitchAttribution(runs) {
  const perRun = runs.map((run) => {
    const hitches = (Array.isArray(run?.rawSamples) ? run.rawSamples : [])
      .filter((sample) => Number(sample?.frameMs) > 32);
    const externalScheduling = hitches.filter((sample) => (
      finiteNonnegative(sample?.callbackMs)
      && sample.callbackMs <= PQ023_H3_BUDGETS.targetSamplingEnvelopeP95Ms
      && finiteNonnegative(sample?.simFrameMs)
      && sample.simFrameMs <= PQ023_H3_BUDGETS.targetSamplingEnvelopeP95Ms
      && finiteNonnegative(sample?.presentationMs)
      && sample.presentationMs <= PQ023_H3_BUDGETS.targetSamplingEnvelopeP95Ms
      && sample?.shedBacklog !== true
      && (Number(sample?.externalCallbackGapMs) > 0 || Number(sample?.callbackDispatchLagMs) > 0)
    )).length;
    return {
      raw: hitches.length,
      externalScheduling,
      productAttributed: hitches.length - externalScheduling,
    };
  });
  return {
    raw: sum(perRun, 'raw'),
    externalScheduling: sum(perRun, 'externalScheduling'),
    productAttributed: sum(perRun, 'productAttributed'),
    medianExternalScheduling: medianValue(perRun.map((run) => run.externalScheduling)),
    medianProductAttributed: medianValue(perRun.map((run) => run.productAttributed)),
    perRun,
  };
}

function correlatedGpuFrameSummary(terminals) {
  const groups = new Map();
  for (const terminal of Array.isArray(terminals) ? terminals : []) {
    if (terminal?.state !== 'completed'
        || !Number.isSafeInteger(terminal?.displayFrameId)
        || !PQ023_H3_GPU_FRAME_LABELS.includes(terminal?.label)
        || !finiteNonnegative(terminal?.elapsedMs)) continue;
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
    .filter((group) => !group.duplicate
      && PQ023_H3_GPU_FRAME_LABELS.every((label) => group.labels.has(label)))
    .map((group) => group.totalMs)
    .sort((left, right) => left - right);
  return {
    sampleCount: values.length,
    p50: percentileValue(values, 0.50),
    p95: percentileValue(values, 0.95),
    p99: percentileValue(values, 0.99),
    max: values.length ? values[values.length - 1] : null,
    framesAbove17_5Ms: values.filter((value) => value > PQ023_H3_BUDGETS.maxSeparatedGpuEnvelopeMs).length,
  };
}

function evaluateAbsoluteTargetBudget(summariesById) {
  const profiles = [];
  const failures = [];
  for (const id of PQ023_H3_PROFILE_IDS) {
    const median = medianSummary(summariesById.get(id) || []);
    const targetP95Pass = Number.isFinite(median.p95)
      && median.p95 <= PQ023_H3_BUDGETS.targetSamplingEnvelopeP95Ms;
    profiles.push({ id, median, targetP95Pass });
    if (!targetP95Pass) {
      failures.push(`${id} median p95 misses the ${PQ023_H3_BUDGETS.targetSamplingEnvelopeP95Ms} ms sampling envelope`);
    }
  }
  return { pass: failures.length === 0, failures, profiles };
}

function medianSummary(summaries) {
  const out = {};
  for (const key of [
    'p50', 'p95', 'p99', 'max', 'framesAbove32Ms', 'framesAbove50Ms',
    'estimatedMissedVsyncs', 'backlogSheddingFrames',
  ]) {
    const values = summaries.map((summary) => summary?.[key])
      .filter(Number.isFinite).sort((left, right) => left - right);
    out[key] = values.length ? values[Math.floor(values.length / 2)] : null;
  }
  return out;
}

function medianValue(values) {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  return finite.length ? finite[Math.floor(finite.length / 2)] : null;
}

function percentileValue(sortedValues, quantile) {
  if (!sortedValues.length) return null;
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.ceil(quantile * sortedValues.length) - 1));
  return sortedValues[index];
}

function allPoolsZero(pools) {
  return ['particles', 'sprites', 'trailStreaks', 'combatBeams', 'explosions']
    .every((key) => Number(pools?.[key]) === 0);
}

function sameCapacities(capacities) {
  return stableStringify(capacities) === stableStringify(PQ023_H3_POOL_CAPACITIES);
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);
}

function sameNumber(left, right) {
  return Number.isFinite(left) && Number.isFinite(Number(right))
    && Math.abs(left - Number(right)) <= 1e-6;
}

function finiteNumber(value) {
  return Number.isFinite(Number(value));
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
