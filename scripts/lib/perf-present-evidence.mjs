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
  return {
    available: !!(report && report.available),
    enabled: !!(report && report.enabled),
    status: report && report.status || 'unavailable',
    reason: report && report.reason || null,
    extension: report && report.extension || null,
    disjoint: !!(report && report.lastDisjoint),
    pending: Number(report && report.pending) || 0,
    sampledPasses,
    frameLabels,
    frameGpuAvgMs: sumLabels(sampledPasses, frameLabels, 'avg'),
    frameGpuMaxPassSumMs: sumLabels(sampledPasses, frameLabels, 'max'),
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
  const gpuMs = Number(gpu && gpu.frameGpuAvgMs) || 0;
  const gpuSamples = Object.values(gpu && gpu.sampledPasses || {})
    .reduce((total, pass) => total + (Number(pass && pass.samples) || 0), 0);
  const evidence = {
    rafP95: finiteOrNull(rafP95),
    callbackP95: finiteOrNull(callbackP95),
    noopRafP95: finiteOrNull(noopRafP95),
    frameBudgetMs,
    gpuFrameAvgMs: gpuMs,
    gpuSamples,
    twoVsyncRatio: finiteOrZero(cadence && cadence.ratios && cadence.ratios.twoVsync),
  };
  if (!gpu || !gpu.available || gpuSamples === 0) {
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

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
