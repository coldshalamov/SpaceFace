import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePerformanceRuns, selectPerformanceDiagnostic } from '../scripts/lib/performanceCampaignComparison.mjs';
test('diagnosis selects a frozen simulation even when its callback p99 looks better', () => {
  const callback = { cell: 'callback', summary: { callbackGaps: { p99: 120 },
    healthyCallbacksFrozenSimulation: 0, maxSimStaleMs: 1000 } };
  const frozen = { cell: 'frozen', summary: { callbackGaps: { p99: 83 },
    healthyCallbacksFrozenSimulation: 120, maxSimStaleMs: 238 } };
  assert.equal(selectPerformanceDiagnostic([callback, { status: 'probe-failed' }, frozen]), frozen);
  assert.equal(selectPerformanceDiagnostic([]), null);
});
const run = (fps, p95) => ({ metadata: { cpu: 'Intel CPU', platform: 'win32', gpu: 'Intel',
  userAgent: 'Electron', viewport: [1280, 720], buffer: [1280, 720],
  simLane: 'worker', mode: 'adventure', seed: 47, sampleMs: 20000, settleMs: 0, travelMs: 0,
  observer: 'cadence-only', displayHz: 60, settings: { bloom: true } }, summary: {
  submissionObserved: true, wallMs: 20000, activeMs: 20000, healthyCallbacksFrozenWorld: 0, healthyCallbacksFrozenSimulation: 0,
  worldSubmitFps: fps, simWallRatio: 1, callbackGaps: { p99: p95, max: p95 * 2, over50: fps === 20 ? 30 : 3 }, submissionGaps: { p95 },
} });
test('a matched hitch reduction and lower tail meets the owner-selected target', () => {
  assert.equal(comparePerformanceRuns(run(20, 50), run(60, 16)).targetMet, true);
});
test('hitch improvements below the measured display limit do not satisfy the whole target', () => {
  assert.equal(comparePerformanceRuns(run(20, 50), run(40, 16)).targetMet, false);
});
test('quality cuts cannot establish the performance target', () => {
  const after = run(60, 16); after.metadata.settings.bloom = false;
  assert.equal(comparePerformanceRuns(run(20, 50), after).targetMet, false);
});
test('a live HUD with a frozen world cannot pass even with high reported FPS', () => {
  const after = run(60, 16); after.summary.healthyCallbacksFrozenWorld = 1;
  assert.equal(comparePerformanceRuns(run(20, 50), after).targetMet, false);
});
test('empty samples and unavailable submission evidence never pass', () => {
  const after = run(60, 16); after.summary.submissionObserved = false; after.summary.wallMs = 0;
  assert.equal(comparePerformanceRuns(run(20, 50), after).targetMet, false);
});
test('missing identity in both arms cannot establish a comparable measurement', () => {
  const before = run(20, 50), after = run(60, 16);
  delete before.metadata.gpu; delete after.metadata.gpu;
  const comparison = comparePerformanceRuns(before, after);
  assert.equal(comparison.comparable, false);
  assert.equal(comparison.targetMet, false);
});
