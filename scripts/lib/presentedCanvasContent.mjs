const MAX_ANALYSIS_FRAMES = 201;
const MAX_CONTIGUOUS_GAP_TICKS = 30;

export function selectPresentedCanvasFrames(frames, { startTick, endTick, limit = MAX_ANALYSIS_FRAMES } = {}) {
  if (!Array.isArray(frames) || !Number.isFinite(startTick) || !Number.isFinite(endTick)
      || endTick < startTick || !Number.isInteger(limit) || limit < 1) return [];
  const inWindow = frames
    .filter(frame => Number.isSafeInteger(frame?.tick) && frame.tick >= startTick && frame.tick <= endTick)
    .slice()
    .sort((a, b) => a.tick - b.tick)
    .filter((frame, index, rows) => index === 0 || frame.tick !== rows[index - 1].tick);
  if (inWindow.length <= limit) return inWindow;
  if (limit === 1) return [inWindow.at(-1)];
  const selected = [];
  for (let index = 0; index < limit; index++) {
    const sourceIndex = Math.round(index * (inWindow.length - 1) / (limit - 1));
    const frame = inWindow[sourceIndex];
    if (selected.at(-1)?.tick !== frame.tick) selected.push(frame);
  }
  return selected;
}

function validTick(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function summarizePresentedCanvasContent({
  captureSource,
  samples = [],
  startTick,
  endTick,
  openingDelayMs = 0,
  decodeFailures = 0,
  maxFrames = MAX_ANALYSIS_FRAMES,
  analysisCapped = false,
  eligibleFrameCount = null,
} = {}) {
  const ordered = Array.isArray(samples)
    ? samples.filter(row => validTick(row?.tick) && typeof row?.signature === 'string' && row.signature.length > 0)
      .slice().sort((a, b) => a.tick - b.tick)
    : [];
  const unique = ordered.filter((row, index) => index === 0 || row.tick !== ordered[index - 1].tick);
  const firstTick = unique[0]?.tick ?? null;
  const lastTick = unique.at(-1)?.tick ?? null;
  const coverageTicks = firstTick == null || lastTick == null ? 0 : lastTick - firstTick;
  const measuredTicks = validTick(startTick) && validTick(endTick) && endTick >= startTick
    ? endTick - startTick : 0;
  // Capture entries do not retain a wall-clock timestamp. State tick span is a coverage check only,
  // never a wall-time estimate or a freeze-duration claim.
  const minimumCoverageTicks = Math.floor(measuredTicks / 2);
  const gaps = [];
  const runs = [];
  let run = null;
  let equalAdjacentPairs = 0;
  let changedAdjacentPairs = 0;
  for (let index = 0; index < unique.length; index++) {
    const row = unique[index];
    if (index === 0) {
      run = { startTick: row.tick, endTick: row.tick, frameCount: 1 };
      continue;
    }
    const prior = unique[index - 1];
    const gapTicks = row.tick - prior.tick;
    gaps.push(gapTicks);
    const same = row.signature === prior.signature;
    if (same) equalAdjacentPairs++;
    else changedAdjacentPairs++;
    if (same && gapTicks <= MAX_CONTIGUOUS_GAP_TICKS) {
      run.endTick = row.tick;
      run.frameCount++;
    } else {
      runs.push(run);
      run = { startTick: row.tick, endTick: row.tick, frameCount: 1 };
    }
  }
  if (run) runs.push(run);
  const longestRun = runs.reduce((best, candidate) => {
    const durationTicks = candidate.endTick - candidate.startTick;
    const bestDurationTicks = best ? best.endTick - best.startTick : -1;
    return durationTicks > bestDurationTicks
      || (durationTicks === bestDurationTicks && candidate.frameCount > (best?.frameCount || 0))
      ? { ...candidate, durationTicks }
      : best;
  }, null);
  const maxGapTicks = gaps.length ? Math.max(...gaps) : null;
  const minGapTicks = gaps.length ? Math.min(...gaps) : null;
  const equalContentRuns = runs
    .filter(candidate => candidate.frameCount > 1)
    .map(candidate => ({ ...candidate, durationTicks: candidate.endTick - candidate.startTick }));
  const reasons = [];
  if (captureSource !== 'presented') reasons.push('actual capture source is not presented');
  if (!validTick(startTick) || !validTick(endTick) || endTick <= startTick) reasons.push('measured tick window unavailable');
  if (unique.length < 4) reasons.push('fewer than four decodable presented frames');
  if (coverageTicks < minimumCoverageTicks) reasons.push('presented footage does not cover enough measured simulation ticks');
  if (decodeFailures > 0) reasons.push('one or more selected frames failed to decode');
  const complete = reasons.length === 0;
  return {
    status: complete ? 'observed' : 'unknown',
    reason: complete ? null : reasons.join('; '),
    captureSource: captureSource || null,
    sampleCount: unique.length,
    eligibleFrameCount: Number.isSafeInteger(eligibleFrameCount) ? eligibleFrameCount : unique.length,
    sampleLimit: maxFrames,
    analysisCapped: analysisCapped === true,
    firstTick,
    lastTick,
    coverageTicks,
    minimumCoverageTicks,
    measuredStartTick: validTick(startTick) ? startTick : null,
    measuredEndTick: validTick(endTick) ? endTick : null,
    maxGapTicks,
    minGapTicks,
    samples: unique.map(row => ({ tick: row.tick, signature: row.signature })),
    equalAdjacentPairs,
    changedAdjacentPairs,
    equalContentRuns,
    longestEqualContentRun: longestRun,
    decodeFailures: Math.max(0, Number(decodeFailures) || 0),
    openingDelayMs: Math.max(0, Number(openingDelayMs) || 0),
    recorderCadenceTicks: 6,
    observedSampleGapTicks: { min: minGapTicks, max: maxGapTicks },
    maxContiguousGapTicks: MAX_CONTIGUOUS_GAP_TICKS,
    evidenceLayer: 'decoded thumbnails of captured presented-submit frames; display scanout unmeasured',
    timeBasis: 'simulation ticks only; the recorder does not retain wall-clock capture timestamps',
  };
}

export function formatPresentedCanvasContentSummary(summary = null) {
  if (!summary || typeof summary !== 'object') {
    return 'canvas content unknown: no report; frames 0/0; coverage 0 simulation ticks; changed pairs 0; longest equal run none; max sample gap unavailable; OS scanout unmeasured';
  }
  const status = summary.status === 'observed' ? 'observed' : 'unknown';
  const reason = status === 'unknown' && summary.reason ? ` (${summary.reason})` : '';
  const frames = `${Number.isFinite(summary.sampleCount) ? summary.sampleCount : 0}/${Number.isFinite(summary.eligibleFrameCount) ? summary.eligibleFrameCount : 0}`;
  const coverage = `${Number.isFinite(summary.coverageTicks) ? summary.coverageTicks : 0}/${Number.isFinite(summary.measuredStartTick) && Number.isFinite(summary.measuredEndTick) ? Math.max(0, summary.measuredEndTick - summary.measuredStartTick) : 0} simulation ticks`;
  const run = summary.longestEqualContentRun;
  const longest = run && Number.isFinite(run.startTick) && Number.isFinite(run.endTick)
    ? `${run.startTick}-${run.endTick} (${run.durationTicks} ticks)` : 'none';
  const maxGap = Number.isFinite(summary.maxGapTicks) ? `${summary.maxGapTicks} ticks` : 'unavailable';
  return `canvas content ${status}${reason}; frames ${frames}; coverage ${coverage}; changed pairs ${Number.isFinite(summary.changedAdjacentPairs) ? summary.changedAdjacentPairs : 0}; longest equal run ${longest}; max sample gap ${maxGap}; OS scanout unmeasured`;
}
