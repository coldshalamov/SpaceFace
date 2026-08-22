// Name the owner of any display callback that misses two vsyncs (>32 ms).
//
// Production play does not call this unless a probe enables hitch attribution.
// The classifier is a pure function over already-collected phase samples so the
// default picture pays no extra clocks.

export const HITCH_THRESHOLD_MS = 32;

export const HITCH_OWNERS = Object.freeze([
  'compile',
  'upload',
  'compose',
  'meshBuild',
  'shadow',
  'speedLines',
  'bloom',
  'gc',
  'restore',
  'autosave',
  'present',
  'sim',
  'ui',
  'admission',
  'vfx',
  'feel',
  'callbackUntracked',
  'externalScheduling',
  'unknown',
]);

const PHASE_TO_OWNER = Object.freeze({
  compileMs: 'compile',
  uploadMs: 'upload',
  composeMs: 'compose',
  meshBuildMs: 'meshBuild',
  shadowMs: 'shadow',
  speedLinesMs: 'speedLines',
  bloomMs: 'bloom',
  gcMs: 'gc',
  restoreMs: 'restore',
  autosaveMs: 'autosave',
  presentMs: 'present',
  simMs: 'sim',
  uiMs: 'ui',
  admissionMs: 'admission',
  vfxMs: 'vfx',
  feelMs: 'feel',
  untrackedMs: 'callbackUntracked',
  scheduleMs: 'externalScheduling',
  renderMs: 'present',
  presentationMs: 'present',
});

const DETAILED_HITCH_OWNERS = new Set([
  'compile',
  'upload',
  'compose',
  'meshBuild',
  'shadow',
  'speedLines',
  'bloom',
  'gc',
  'restore',
  'autosave',
]);

export function isHitchFrame(frameMs, thresholdMs = HITCH_THRESHOLD_MS) {
  return Number.isFinite(Number(frameMs)) && Number(frameMs) > thresholdMs;
}

/**
 * Pick the largest named phase that accounts for at least `share` of the
 * excess over the hitch threshold. Unattributed leftovers stay `unknown`.
 */
export function classifyHitchFrame(sample = {}, options = {}) {
  const frameMs = Number(sample.frameMs);
  const thresholdMs = Number.isFinite(Number(options.thresholdMs))
    ? Number(options.thresholdMs)
    : HITCH_THRESHOLD_MS;
  if (!isHitchFrame(frameMs, thresholdMs)) return null;

  const share = Number.isFinite(Number(options.share)) ? Number(options.share) : 0.4;
  const excess = frameMs - thresholdMs;
  let bestOwner = 'unknown';
  let bestMs = 0;
  let bestDetailedOwner = 'unknown';
  let bestDetailedMs = 0;
  const phases = {};

  for (const [key, owner] of Object.entries(PHASE_TO_OWNER)) {
    const ms = Number(sample[key]);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    phases[owner] = (phases[owner] || 0) + ms;
    if (phases[owner] > bestMs) {
      bestMs = phases[owner];
      bestOwner = owner;
    }
    if (DETAILED_HITCH_OWNERS.has(owner) && phases[owner] > bestDetailedMs) {
      bestDetailedMs = phases[owner];
      bestDetailedOwner = owner;
    }
  }

  // Exact work (compile/upload/compose/etc.) can be nested inside a broader measured container.
  // Prefer it only when it explains nearly all of that container; a small detailed slice must not
  // steal a frame genuinely dominated by simulation, presentation, or scheduling.
  if (bestDetailedMs > 0 && bestDetailedMs >= bestMs * 0.75) {
    bestMs = bestDetailedMs;
    bestOwner = bestDetailedOwner;
  }

  // Blame a phase only if it owns a real share of the *frame*, not a sliver of
  // the 1–4 ms excess on a one-dropped-vsync hitch.
  const attributed = bestMs >= Math.max(excess * share, frameMs * 0.2)
    && bestOwner !== 'unknown';
  const owner = attributed ? bestOwner : 'unknown';
  const simMaxSystemMs = Number(sample.simMaxSystemMs);
  const simSystemTotalMs = Number(sample.simSystemTotalMs);
  const simStepCount = Number(sample.simStepCount);
  const simMeasuredStepCount = Number(sample.simMeasuredStepCount);
  const safeSimStepCount = Number.isFinite(simStepCount) ? simStepCount : 0;
  const safeSimMeasuredStepCount = Number.isFinite(simMeasuredStepCount) ? simMeasuredStepCount : 0;
  const callbackMs = Number(sample.callbackMs);
  const residualKnown = Number.isFinite(callbackMs);
  const scheduleMs = Number(sample.scheduleMs);
  const residualMs = residualKnown
    ? Math.max(0, frameMs - callbackMs - (Number.isFinite(scheduleMs) ? scheduleMs : 0))
    : 0;
  const callbackIntervalMs = Number(sample.callbackIntervalMs);
  const externalGapMs = Number(sample.externalGapMs);
  const dispatchLagMs = Number(sample.dispatchLagMs);
  const intervalKnown = Number.isFinite(callbackIntervalMs) && callbackIntervalMs > 0;
  const intervalDisagreementMs = intervalKnown ? frameMs - callbackIntervalMs : 0;
  return {
    owner,
    frameMs,
    excessMs: excess,
    ownerMs: attributed ? bestMs : 0,
    attributed,
    phases,
    simSystem: owner === 'sim'
      ? (typeof sample.simMaxSystemName === 'string' && sample.simMaxSystemName
        ? sample.simMaxSystemName
        : null)
      : null,
    simSystemMs: Number.isFinite(simMaxSystemMs) ? simMaxSystemMs : 0,
    simSystemTotalMs: Number.isFinite(simSystemTotalMs) ? simSystemTotalMs : 0,
    simStepCount: safeSimStepCount,
    simMeasuredStepCount: safeSimMeasuredStepCount,
    simFullyMeasured: safeSimStepCount > 0 && safeSimMeasuredStepCount === safeSimStepCount,
    residualMs,
    residualKnown,
    callbackIntervalMs: Number.isFinite(callbackIntervalMs) ? callbackIntervalMs : 0,
    externalGapMs: Number.isFinite(externalGapMs) ? externalGapMs : 0,
    dispatchLagMs: Number.isFinite(dispatchLagMs) ? dispatchLagMs : 0,
    intervalKnown,
    intervalDisagreementMs,
    largestPhase: bestMs > 0 ? bestOwner : null,
    largestPhaseMs: bestMs,
  };
}

export function createHitchHistogram() {
  const counts = Object.create(null);
  for (const owner of HITCH_OWNERS) counts[owner] = 0;
  return {
    frames: 0,
    hitches: 0,
    named: 0,
    unknown: 0,
    firstHitches: 0,
    echoHitches: 0,
    currentStreak: 0,
    longestStreak: 0,
    previousWasHitch: false,
    counts,
    bySimSystem: Object.create(null),
    bySimSystemPartial: Object.create(null),
    simStepHistogram: { 0: 0, 1: 0, 2: 0, 3: 0, '4+': 0 },
    unknownLargestPhase: Object.create(null),
    residualMsTotal: 0,
    residualFrames: 0,
    intervalFrames: 0,
    frameMsTotal: 0,
    callbackIntervalMsTotal: 0,
    intervalDisagreementMsTotal: 0,
    schedulingFrames: 0,
    schedulingExternalGapMsTotal: 0,
    schedulingDispatchLagMsTotal: 0,
    schedulingGapDominant: 0,
    schedulingDispatchDominant: 0,
    simOwnedSystemTotalMs: 0,
    simOwnedPhaseMs: 0,
    simMeasuredFrames: 0,
    simPartiallyMeasuredFrames: 0,
    simUnmeasuredFrames: 0,
    simZeroStepFrames: 0,
  };
}

export function accumulateHitch(histogram, classification) {
  if (!histogram) return histogram;
  histogram.frames += 1;
  if (!classification) {
    histogram.currentStreak = 0;
    histogram.previousWasHitch = false;
    return histogram;
  }
  histogram.hitches += 1;
  if (histogram.previousWasHitch) histogram.echoHitches += 1;
  else histogram.firstHitches += 1;
  histogram.currentStreak += 1;
  histogram.longestStreak = Math.max(histogram.longestStreak, histogram.currentStreak);
  histogram.previousWasHitch = true;
  const owner = HITCH_OWNERS.includes(classification.owner)
    ? classification.owner
    : 'unknown';
  histogram.counts[owner] += 1;
  if (owner === 'unknown') histogram.unknown += 1;
  else histogram.named += 1;
  if (owner === 'sim') {
    if (!histogram.bySimSystem) histogram.bySimSystem = Object.create(null);
    if (!histogram.bySimSystemPartial) histogram.bySimSystemPartial = Object.create(null);
    if (!histogram.simStepHistogram) histogram.simStepHistogram = { 0: 0, 1: 0, 2: 0, 3: 0, '4+': 0 };
    const measuredSteps = Number.isFinite(Number(classification.simMeasuredStepCount))
      ? Number(classification.simMeasuredStepCount)
      : 0;
    const steps = Number(classification.simStepCount);
    const safeSteps = Number.isFinite(steps) ? steps : 0;
    const bucket = safeSteps <= 0 ? 0
      : safeSteps === 1 ? 1
      : safeSteps === 2 ? 2
      : safeSteps === 3 ? 3
      : '4+';
    histogram.simStepHistogram[bucket] = (histogram.simStepHistogram[bucket] || 0) + 1;
    if (safeSteps <= 0) {
      histogram.simZeroStepFrames = (histogram.simZeroStepFrames || 0) + 1;
    } else {
      const fullyMeasured = measuredSteps === safeSteps;
      const unmeasured = measuredSteps === 0;
      const systemKey = classification.simSystem || '(none)';
      if (fullyMeasured) {
        histogram.bySimSystem[systemKey] = (histogram.bySimSystem[systemKey] || 0) + 1;
        histogram.simMeasuredFrames = (histogram.simMeasuredFrames || 0) + 1;
        const accounted = Number(classification.simSystemTotalMs);
        if (Number.isFinite(accounted)) {
          histogram.simOwnedSystemTotalMs = (histogram.simOwnedSystemTotalMs || 0) + accounted;
        }
        const simPhase = Number(classification.phases && classification.phases.sim);
        if (Number.isFinite(simPhase)) {
          histogram.simOwnedPhaseMs = (histogram.simOwnedPhaseMs || 0) + simPhase;
        }
      } else if (unmeasured) {
        histogram.simUnmeasuredFrames = (histogram.simUnmeasuredFrames || 0) + 1;
      } else {
        histogram.bySimSystemPartial[systemKey] = (histogram.bySimSystemPartial[systemKey] || 0) + 1;
        histogram.simPartiallyMeasuredFrames = (histogram.simPartiallyMeasuredFrames || 0) + 1;
      }
    }
  } else if (owner === 'unknown') {
    if (!histogram.unknownLargestPhase) histogram.unknownLargestPhase = Object.create(null);
    const phase = classification.largestPhase;
    if (phase) {
      histogram.unknownLargestPhase[phase] = (histogram.unknownLargestPhase[phase] || 0) + 1;
    }
    if (classification.residualKnown === true) {
      const residual = Number(classification.residualMs);
      if (Number.isFinite(residual)) {
        histogram.residualMsTotal = (histogram.residualMsTotal || 0) + residual;
      }
      histogram.residualFrames = (histogram.residualFrames || 0) + 1;
    }
  }
  if (classification.intervalKnown === true) {
    histogram.intervalFrames = (histogram.intervalFrames || 0) + 1;
    const hitchFrameMs = Number(classification.frameMs);
    if (Number.isFinite(hitchFrameMs)) {
      histogram.frameMsTotal = (histogram.frameMsTotal || 0) + hitchFrameMs;
    }
    const callbackIntervalMs = Number(classification.callbackIntervalMs);
    if (Number.isFinite(callbackIntervalMs)) {
      histogram.callbackIntervalMsTotal = (histogram.callbackIntervalMsTotal || 0) + callbackIntervalMs;
    }
    const disagreement = Number(classification.intervalDisagreementMs);
    if (Number.isFinite(disagreement)) {
      histogram.intervalDisagreementMsTotal = (histogram.intervalDisagreementMsTotal || 0) + disagreement;
    }
  }
  if (owner === 'externalScheduling') {
    histogram.schedulingFrames = (histogram.schedulingFrames || 0) + 1;
    const gap = Number(classification.externalGapMs);
    const lag = Number(classification.dispatchLagMs);
    if (Number.isFinite(gap)) {
      histogram.schedulingExternalGapMsTotal = (histogram.schedulingExternalGapMsTotal || 0) + gap;
    }
    if (Number.isFinite(lag)) {
      histogram.schedulingDispatchLagMsTotal = (histogram.schedulingDispatchLagMsTotal || 0) + lag;
    }
    const gapMs = Number.isFinite(gap) ? gap : 0;
    const lagMs = Number.isFinite(lag) ? lag : 0;
    if (gapMs > lagMs) {
      histogram.schedulingGapDominant = (histogram.schedulingGapDominant || 0) + 1;
    } else if (lagMs > gapMs) {
      histogram.schedulingDispatchDominant = (histogram.schedulingDispatchDominant || 0) + 1;
    }
  }
  return histogram;
}

export function hitchCoverage(histogram) {
  if (!histogram || histogram.hitches <= 0) return 1;
  return histogram.named / histogram.hitches;
}

export function hitchHistogramReport(histogram) {
  return {
    frames: histogram ? histogram.frames : 0,
    hitches: histogram ? histogram.hitches : 0,
    named: histogram ? histogram.named : 0,
    unknown: histogram ? histogram.unknown : 0,
    firstHitches: histogram ? histogram.firstHitches : 0,
    echoHitches: histogram ? histogram.echoHitches : 0,
    longestStreak: histogram ? histogram.longestStreak : 0,
    coverage: hitchCoverage(histogram),
    counts: { ...(histogram && histogram.counts) },
    bySimSystem: { ...(histogram && histogram.bySimSystem) },
    bySimSystemPartial: { ...(histogram && histogram.bySimSystemPartial) },
    simStepHistogram: { ...(histogram && histogram.simStepHistogram) },
    unknownLargestPhase: { ...(histogram && histogram.unknownLargestPhase) },
    residualMsTotal: histogram && Number.isFinite(Number(histogram.residualMsTotal))
      ? Number(histogram.residualMsTotal)
      : 0,
    residualFrames: histogram && Number.isFinite(Number(histogram.residualFrames))
      ? Number(histogram.residualFrames)
      : 0,
    intervalFrames: histogram && Number.isFinite(Number(histogram.intervalFrames))
      ? Number(histogram.intervalFrames)
      : 0,
    frameMsTotal: histogram && Number.isFinite(Number(histogram.frameMsTotal))
      ? Number(histogram.frameMsTotal)
      : 0,
    callbackIntervalMsTotal: histogram && Number.isFinite(Number(histogram.callbackIntervalMsTotal))
      ? Number(histogram.callbackIntervalMsTotal)
      : 0,
    intervalDisagreementMsTotal: histogram && Number.isFinite(Number(histogram.intervalDisagreementMsTotal))
      ? Number(histogram.intervalDisagreementMsTotal)
      : 0,
    schedulingFrames: histogram && Number.isFinite(Number(histogram.schedulingFrames))
      ? Number(histogram.schedulingFrames)
      : 0,
    schedulingExternalGapMsTotal: histogram && Number.isFinite(Number(histogram.schedulingExternalGapMsTotal))
      ? Number(histogram.schedulingExternalGapMsTotal)
      : 0,
    schedulingDispatchLagMsTotal: histogram && Number.isFinite(Number(histogram.schedulingDispatchLagMsTotal))
      ? Number(histogram.schedulingDispatchLagMsTotal)
      : 0,
    schedulingGapDominant: histogram && Number.isFinite(Number(histogram.schedulingGapDominant))
      ? Number(histogram.schedulingGapDominant)
      : 0,
    schedulingDispatchDominant: histogram && Number.isFinite(Number(histogram.schedulingDispatchDominant))
      ? Number(histogram.schedulingDispatchDominant)
      : 0,
    simOwnedSystemTotalMs: histogram && Number.isFinite(Number(histogram.simOwnedSystemTotalMs))
      ? Number(histogram.simOwnedSystemTotalMs)
      : 0,
    simOwnedPhaseMs: histogram && Number.isFinite(Number(histogram.simOwnedPhaseMs))
      ? Number(histogram.simOwnedPhaseMs)
      : 0,
    simMeasuredFrames: histogram && Number.isFinite(Number(histogram.simMeasuredFrames))
      ? Number(histogram.simMeasuredFrames)
      : 0,
    simPartiallyMeasuredFrames: histogram && Number.isFinite(Number(histogram.simPartiallyMeasuredFrames))
      ? Number(histogram.simPartiallyMeasuredFrames)
      : 0,
    simUnmeasuredFrames: histogram && Number.isFinite(Number(histogram.simUnmeasuredFrames))
      ? Number(histogram.simUnmeasuredFrames)
      : 0,
    simZeroStepFrames: histogram && Number.isFinite(Number(histogram.simZeroStepFrames))
      ? Number(histogram.simZeroStepFrames)
      : 0,
  };
}
