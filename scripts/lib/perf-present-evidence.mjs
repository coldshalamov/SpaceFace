const DEFAULT_VSYNC_MS = 1000 / 60;
const GPU_FRAME_LABELS = Object.freeze([
  'bloomScene',
  'bloomDownsample',
  'bloomUpsample',
  'bloomComposite',
]);

export function analyzeRafCadence(frames, vsyncMs = DEFAULT_VSYNC_MS) {
  const values = Array.isArray(frames)
    ? frames.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const bins = { oneVsync: 0, twoVsync: 0, threePlusVsync: 0 };
  let estimatedMissedVsyncs = 0;
  for (const value of values) {
    if (value < vsyncMs * 1.5) bins.oneVsync++;
    else if (value < vsyncMs * 2.5) bins.twoVsync++;
    else bins.threePlusVsync++;
    estimatedMissedVsyncs += Math.max(0, Math.round(value / vsyncMs) - 1);
  }
  const count = values.length;
  return {
    vsyncMs,
    samples: count,
    bins,
    ratios: {
      oneVsync: count ? bins.oneVsync / count : 0,
      twoVsync: count ? bins.twoVsync / count : 0,
      threePlusVsync: count ? bins.threePlusVsync / count : 0,
    },
    estimatedMissedVsyncs,
    estimatedMissedVsyncRatio: count ? estimatedMissedVsyncs / count : 0,
  };
}

export function summarizeGpuTimerReport(report) {
  const passes = report && report.passes && typeof report.passes === 'object'
    ? report.passes
    : {};
  const sampledPasses = Object.fromEntries(Object.entries(passes)
    .filter(([, pass]) => Number(pass && pass.samples) > 0)
    .map(([label, pass]) => [label, {
      avg: finiteOrZero(pass.avg),
      max: finiteOrZero(pass.max),
      last: finiteOrZero(pass.last),
      samples: Number(pass.samples) || 0,
    }]));
  const bloomPasses = GPU_FRAME_LABELS.filter((label) => sampledPasses[label]);
  const frameLabels = bloomPasses.length
    ? bloomPasses
    : (sampledPasses.drawPreparedFrame ? ['drawPreparedFrame'] : []);
  const sampleCount = Object.values(sampledPasses)
    .reduce((total, pass) => total + (Number(pass.samples) || 0), 0);
  const queryCounts = {
    issued: finiteCount(report?.queryCounts?.issued ?? report?.issuedQueries),
    completed: finiteCount(report?.queryCounts?.completed ?? report?.completedQueries),
    pending: finiteCount(report?.queryCounts?.pending ?? report?.pendingQueries ?? report?.pending),
    dropped: finiteCount(report?.queryCounts?.dropped ?? report?.droppedQueries),
    rejected: finiteCount(report?.queryCounts?.rejected ?? report?.rejectedQueries),
  };
  const inferredLegacyValidity = !!(report?.available)
    && report?.status === 'ok'
    && sampleCount > 0
    && !report?.lastDisjoint;
  const captureValid = typeof report?.captureValid === 'boolean'
    ? report.captureValid
    : inferredLegacyValidity;
  const frameGpuAvgMs = captureValid && frameLabels.length
    ? sumLabels(sampledPasses, frameLabels, 'avg')
    : null;
  const frameGpuMaxPassSumMs = captureValid && frameLabels.length
    ? sumLabels(sampledPasses, frameLabels, 'max')
    : null;
  return {
    available: !!(report && report.available),
    live: report?.live !== false,
    enabled: !!(report && report.enabled),
    status: report && report.status || 'unavailable',
    reason: report && report.reason || null,
    extension: report && report.extension || null,
    disjoint: !!(report && report.lastDisjoint),
    pending: queryCounts.pending,
    captureValid,
    invalidation: report?.invalidation ?? null,
    invalidations: report?.invalidations && typeof report.invalidations === 'object'
      ? { ...report.invalidations }
      : {},
    queryCounts,
    issuedQueries: queryCounts.issued,
    completedQueries: queryCounts.completed,
    pendingQueries: queryCounts.pending,
    droppedQueries: queryCounts.dropped,
    rejectedQueries: queryCounts.rejected,
    sampledPasses,
    frameLabels,
    frameGpuAvgMs,
    frameGpuMaxPassSumMs,
  };
}

export function classifyPresentEvidence({
  rafP95,
  callbackP95,
  noopRafP95,
  cadence,
  gpu,
  frameBudgetMs = DEFAULT_VSYNC_MS,
} = {}) {
  const gpuMs = finiteOrNull(gpu && gpu.frameGpuAvgMs);
  const gpuSamples = Object.values(gpu && gpu.sampledPasses || {})
    .reduce((total, pass) => total + (Number(pass && pass.samples) || 0), 0);
  const evidence = {
    rafP95: finiteOrNull(rafP95),
    callbackP95: finiteOrNull(callbackP95),
    noopRafP95: finiteOrNull(noopRafP95),
    frameBudgetMs,
    gpuFrameAvgMs: gpuMs,
    gpuSamples,
    gpuCaptureValid: gpu?.captureValid === true,
    gpuStatus: gpu?.status ?? 'unavailable',
    gpuCompletedQueries: finiteCount(gpu?.completedQueries ?? gpu?.queryCounts?.completed),
    gpuDroppedQueries: finiteCount(gpu?.droppedQueries ?? gpu?.queryCounts?.dropped),
    gpuRejectedQueries: finiteCount(gpu?.rejectedQueries ?? gpu?.queryCounts?.rejected),
    twoVsyncRatio: finiteOrZero(cadence && cadence.ratios && cadence.ratios.twoVsync),
  };
  if (!gpu || !gpu.available) {
    return { classification: 'insufficient-gpu-timing', confidence: 'low', evidence };
  }
  if (gpu.captureValid !== true) {
    return { classification: 'gpu-timing-invalid', confidence: 'low', evidence };
  }
  if (gpuSamples === 0 || gpuMs === null) {
    return { classification: 'insufficient-gpu-timing', confidence: 'low', evidence };
  }
  if (gpu.disjoint) {
    return { classification: 'gpu-timing-disjoint', confidence: 'low', evidence };
  }
  if (gpuMs >= frameBudgetMs) {
    return { classification: 'gpu-work-saturation', confidence: 'high', evidence };
  }
  const submitSensitive = Number(rafP95) >= frameBudgetMs * 1.8
    && Number(noopRafP95) > 0
    && Number(noopRafP95) < frameBudgetMs * 1.2;
  const cpuWithinBudget = Number(callbackP95) > 0 && Number(callbackP95) < frameBudgetMs;
  const cadenceQuantized = evidence.twoVsyncRatio >= 0.2;
  if (submitSensitive && cpuWithinBudget && cadenceQuantized) {
    return { classification: 'compositor-vsync-cadence', confidence: 'high', evidence };
  }
  return { classification: 'mixed-or-within-budget', confidence: 'medium', evidence };
}

function sumLabels(passes, labels, field) {
  return labels.reduce((total, label) => total + finiteOrZero(passes[label] && passes[label][field]), 0);
}

function finiteOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function finiteCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function finiteOrNull(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
