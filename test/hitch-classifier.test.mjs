import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HITCH_THRESHOLD_MS,
  accumulateHitch,
  classifyHitchFrame,
  createHitchHistogram,
  hitchCoverage,
  hitchHistogramReport,
  isHitchFrame,
} from '../src/render/hitchClassifier.js';
import { ensurePerfRuntime } from '../src/core/perfRuntime.js';

test('frames inside two vsyncs are not hitches', () => {
  assert.equal(isHitchFrame(16.6), false);
  assert.equal(isHitchFrame(32), false);
  assert.equal(isHitchFrame(32.1), true);
  assert.equal(classifyHitchFrame({ frameMs: 16.8, compileMs: 12 }), null);
});

test('a named phase that owns the excess is the hitch owner', () => {
  const compile = classifyHitchFrame({
    frameMs: 80,
    compileMs: 50,
    presentMs: 8,
    simMs: 4,
  });
  assert.equal(compile.owner, 'compile');
  assert.equal(compile.attributed, true);
  assert.ok(compile.ownerMs >= 50);

  const compose = classifyHitchFrame({
    frameMs: 180,
    composeMs: 140,
    presentMs: 10,
  });
  assert.equal(compose.owner, 'compose');

  const unknown = classifyHitchFrame({
    frameMs: 90,
    presentMs: 4,
    simMs: 3,
  });
  assert.equal(unknown.owner, 'unknown');
  assert.equal(unknown.attributed, false);
});

test('histogram coverage is the share of named hitch owners', () => {
  const histogram = createHitchHistogram();
  accumulateHitch(histogram, null);
  accumulateHitch(histogram, classifyHitchFrame({ frameMs: 90, compileMs: 60 }));
  accumulateHitch(histogram, classifyHitchFrame({ frameMs: 70, uploadMs: 40 }));
  accumulateHitch(histogram, classifyHitchFrame({ frameMs: 80 }));
  const report = hitchHistogramReport(histogram);
  assert.equal(report.frames, 4);
  assert.equal(report.hitches, 3);
  assert.equal(report.named, 2);
  assert.equal(report.unknown, 1);
  assert.ok(hitchCoverage(histogram) > 0.6);
  assert.equal(report.counts.compile, 1);
  assert.equal(report.counts.upload, 1);
  assert.ok(HITCH_THRESHOLD_MS > 16);
});

test('vfx-owned hitches are named vfx', () => {
  const classified = classifyHitchFrame({ frameMs: 50, vfxMs: 30, simMs: 2 });
  assert.equal(classified.owner, 'vfx');
  assert.equal(classified.attributed, true);
});

test('a one-vsync hitch is unknown unless one phase owns the frame', () => {
  const classified = classifyHitchFrame({ frameMs: 36, presentMs: 6, simMs: 5 });
  assert.equal(classified.owner, 'unknown');
  assert.equal(classified.attributed, false);
});

test('live hitch attribution pairs the interval with the previous frame phases', () => {
  const state = { entityList: [], settings: { video: {} } };
  const perf = ensurePerfRuntime(state);
  perf.setHitchAttributionEnabled(true);
  perf.beginFrame(0.016);
  perf.recordPhase('sim', 60);
  perf.recordFrameCallback(60);
  perf.beginFrame(0.062);
  const report = perf.getHitchHistogram();
  assert.equal(report.hitches, 1);
  assert.equal(report.counts.sim, 1);
});

test('live hitch attribution is off by default and reset clears the ring', () => {
  const state = { entityList: [], settings: { video: {} } };
  const perf = ensurePerfRuntime(state);
  assert.equal(perf.hitchAttributionEnabled, false);
  perf.setHitchAttributionEnabled(true);
  perf.recordLoop(1, false, 0, 0);
  state.accumulator = 0;
  perf.beginFrame?.(0.05, 0, 0, 16.7);
  if (typeof perf.recordFrameDt === 'function') perf.recordFrameDt(40);
  // Interval comes from lastFrameDtMs when the loop has one.
  perf.recordFrameCallback(5);
  perf.reset();
  const report = perf.getHitchHistogram();
  assert.equal(report.frames, 0);
  assert.equal(report.hitches, 0);
});
