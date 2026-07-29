import assert from 'node:assert/strict';
import {
  analyzeRafCadence,
  classifyPresentEvidence,
  summarizeGpuTimerReport,
} from '../scripts/lib/perf-present-evidence.mjs';

const smooth = analyzeRafCadence([16.5, 16.7, 16.8, 16.6]);
assert.equal(smooth.bins.oneVsync, 4);
assert.equal(smooth.estimatedMissedVsyncs, 0);

const quantized = analyzeRafCadence([16.7, 33.4, 16.6, 33.2]);
assert.equal(quantized.bins.oneVsync, 2);
assert.equal(quantized.bins.twoVsync, 2);
assert.equal(quantized.ratios.twoVsync, 0.5);
assert.equal(quantized.estimatedMissedVsyncs, 2);

const gpu = summarizeGpuTimerReport({
  available: true,
  enabled: true,
  status: 'ok',
  passes: {
    bloomScene: { avg: 3, max: 4, last: 2.5, samples: 10 },
    bloomDownsample: { avg: 2, max: 3, last: 2, samples: 10 },
    bloomUpsample: { avg: 2, max: 3, last: 2, samples: 10 },
    bloomComposite: { avg: 2, max: 3, last: 2, samples: 10 },
  },
});
assert.equal(gpu.frameGpuAvgMs, 9);
assert.deepEqual(gpu.frameLabels, ['bloomScene', 'bloomDownsample', 'bloomUpsample', 'bloomComposite']);
assert.equal(gpu.captureValid, true, 'legacy sampled reports infer validity without losing compatibility');

const compositor = classifyPresentEvidence({
  rafP95: 33.4,
  callbackP95: 10.6,
  noopRafP95: 16.9,
  cadence: quantized,
  gpu,
});
assert.equal(compositor.classification, 'compositor-vsync-cadence');
assert.equal(compositor.confidence, 'high');

const saturated = classifyPresentEvidence({
  rafP95: 33.4,
  callbackP95: 10,
  noopRafP95: 16.8,
  cadence: quantized,
  gpu: { ...gpu, frameGpuAvgMs: 20 },
});
assert.equal(saturated.classification, 'gpu-work-saturation');

const unavailable = classifyPresentEvidence({
  rafP95: 33.4,
  callbackP95: 10,
  noopRafP95: 16.8,
  cadence: quantized,
  gpu: summarizeGpuTimerReport({ available: false, status: 'unavailable', passes: {} }),
});
assert.equal(unavailable.classification, 'insufficient-gpu-timing');

const invalid = summarizeGpuTimerReport({
  available: true,
  enabled: true,
  status: 'backpressure',
  captureValid: false,
  invalidation: 'backpressure',
  queryCounts: { issued: 49, completed: 48, pending: 0, dropped: 0, rejected: 1 },
  passes: {
    drawPreparedFrame: { avg: 20, max: 25, last: 19, samples: 48 },
  },
});
assert.equal(invalid.frameGpuAvgMs, null, 'invalid captures never collapse to a numeric GPU time');
assert.equal(invalid.completedQueries, 48);
assert.equal(invalid.rejectedQueries, 1);
const invalidClassification = classifyPresentEvidence({
  rafP95: 33.4,
  callbackP95: 10,
  noopRafP95: 16.8,
  cadence: quantized,
  gpu: invalid,
});
assert.equal(invalidClassification.classification, 'gpu-timing-invalid');
assert.equal(invalidClassification.evidence.gpuFrameAvgMs, null);

console.log('performance-profile-present-evidence: PASS');
