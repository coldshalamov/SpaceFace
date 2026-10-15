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
  observer: 'cadence-only', displayHz: 60, sourceStable: true, settings: { bloom: true } }, summary: {
  submissionObserved: true, wallMs: 20000, activeMs: 20000, healthyCallbacksFrozenWorld: 0, healthyCallbacksFrozenSimulation: 0,
  worldSubmitFps: fps, worldMotionFps: fps, simWallRatio: 1,
  motionSubmissionGaps: { p99: p95, max: p95 * 2, over50: fps === 20 ? 30 : 3 },
  callbackGaps: { p99: p95, max: p95 * 2, over50: fps === 20 ? 30 : 3 }, submissionGaps: { p95 },
  actualMeshStatus: 'observed', actualMeshObserved: true, actualMeshEligibleSamples: 1200,
  actualMeshMissingSamples: 0,
  actualMeshPoseChangeGaps: { count: 1200, p99: p95, max: p95 * 2, over50: fps === 20 ? 30 : 3 },
  actualMeshStaleMs: { count: 1200, p99: p95, max: p95 * 2, over50: fps === 20 ? 30 : 3 },
} });
test('a matched hitch reduction and lower tail meets the owner-selected target', () => {
  assert.equal(comparePerformanceRuns(run(20, 50), run(60, 16)).targetMet, true);
});
test('a source edit during a capture prevents target promotion', () => {
  const after = run(60, 16); after.metadata.sourceStable = false;
  assert.equal(comparePerformanceRuns(run(20, 50), after).targetMet, false);
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

test('snapshot gaps remain informational when actual mesh pose evidence is healthy', () => {
  const after = run(60, 16);
  after.summary.motionSubmissionGaps = { p99: 150, max: 300, over50: 60 };
  const result = comparePerformanceRuns(run(20, 50), after);
  assert.equal(result.targetMet, true);
  assert.equal(result.snapshotCadenceStatus, 'informational-measured');
  assert.equal(result.snapshotTailLower, false);
});

test('old captures without distinct world cadence retain an actual-pose verdict', () => {
  const before = run(20, 50);
  delete before.summary.worldMotionFps;
  assert.equal(comparePerformanceRuns(before, run(60, 16)).targetMet, true);
});

test('missing actual mesh pose evidence is incomplete rather than proxy-green', () => {
  const before = run(20, 50), after = run(60, 16);
  delete before.summary.actualMeshStatus;
  delete before.summary.actualMeshObserved;
  delete before.summary.actualMeshEligibleSamples;
  delete before.summary.actualMeshPoseChangeGaps;
  delete before.summary.actualMeshStaleMs;
  const result = comparePerformanceRuns(before, after);
  assert.equal(result.targetMet, false);
  assert.equal(result.actualPoseStatus, 'incomplete');
  assert.match(result.actualPoseReason, /before: actual mesh pose unmeasured/);
  assert.ok(result.failures.some(failure => failure.startsWith('actual mesh pose target incomplete:')));
});

test('healthy callbacks and advancing snapshots still fail for a frozen actual mesh pose', () => {
  const before = run(20, 50), after = run(60, 16);
  after.summary.actualMeshPoseChangeGaps = { count: 0, p99: null, max: null, over50: 0 };
  after.summary.actualMeshStaleMs = { count: 1200, p99: 140, max: 140, over50: 300 };
  const result = comparePerformanceRuns(before, after);
  assert.equal(result.targetMet, false);
  assert.equal(result.actualPoseStatus, 'measured');
  assert.ok(result.failures.includes('actual mesh stale-pose exposure did not improve 3x'));
  assert.ok(result.failures.includes('actual mesh pose tail did not improve'));
});

test('known mesh disappearance is a measured failure rather than incomplete coverage', () => {
  const before = run(20, 50), after = run(60, 16);
  before.summary.actualMeshMissingSamples = 1;
  const result = comparePerformanceRuns(before, after);
  assert.equal(result.targetMet, false);
  assert.equal(result.actualPoseStatus, 'measured-with-missing');
  assert.match(result.actualPoseReason, /measured with missing samples/);
  assert.ok(result.failures.includes('actual mesh missing samples: before 1; after 0'));
  assert.equal(result.failures.some(failure => failure.startsWith('actual mesh pose target incomplete:')), false);
});

test('known disappearance remains a measured failure even with no eligible pose sample', () => {
  const before = run(20, 50), after = run(60, 16);
  before.summary.actualMeshStatus = 'unavailable-no-eligible-samples';
  before.summary.actualMeshObserved = false;
  before.summary.actualMeshEligibleSamples = null;
  before.summary.actualMeshPoseChangeGaps = { count: 0, p99: null, max: null, over50: 0 };
  before.summary.actualMeshStaleMs = { count: 0, p99: null, max: null, over50: 0 };
  before.summary.actualMeshMissingSamples = 2;
  const result = comparePerformanceRuns(before, after);
  assert.equal(result.targetMet, false);
  assert.equal(result.actualPoseStatus, 'measured-with-missing');
  assert.match(result.actualPoseReason, /measured disappearance/);
  assert.ok(result.failures.includes('actual mesh missing samples: before 2; after 0'));
  assert.equal(result.failures.some(failure => failure.startsWith('actual mesh pose target incomplete:')), false);
});

test('already smooth zero-hitch routes preserve their floor', () => {
  const before = run(60, 16), after = run(60, 16);
  for (const candidate of [before, after]) {
    candidate.summary.callbackGaps.over50 = 0;
    candidate.summary.motionSubmissionGaps.over50 = 0;
    candidate.summary.actualMeshPoseChangeGaps.over50 = 0;
    candidate.summary.actualMeshStaleMs.over50 = 0;
  }
  assert.equal(comparePerformanceRuns(before, after).targetMet, true);
});
