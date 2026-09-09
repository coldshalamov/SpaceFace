import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ensurePerfRuntime,
  shouldSampleSystemTimingTick,
  SYSTEM_TIMING_SAMPLE_PERIOD_TICKS,
} from '../src/core/perfRuntime.js';
import { formatHitchAttributionDetailLines } from '../src/core/runtimeWitness.js';
import {
  accumulateHitch,
  classifyHitchFrame,
  createHitchHistogram,
  FRAME_DT_CLAMP_MS,
  hitchHistogramReport,
} from '../src/render/hitchClassifier.js';

const INTERVAL_DISAGREEMENT_RING_CAPACITY = 256;

function sumMap(map) {
  let total = 0;
  if (!map) return 0;
  for (const count of Object.values(map)) total += Number(count) || 0;
  return total;
}

function simOwnerInvariant(histogram) {
  return sumMap(histogram.bySimSystem)
    + sumMap(histogram.bySimSystemPartial)
    + (Number(histogram.simUnmeasuredFrames) || 0)
    + (Number(histogram.simZeroStepFrames) || 0);
}

test('a sim-owned hitch names the fattest sampled system', () => {
  const classified = classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: 'tacticalAI',
    simMaxSystemMs: 26,
    simSystemTotalMs: 28,
    simStepCount: 1,
  });
  assert.equal(classified.owner, 'sim');
  assert.equal(classified.simSystem, 'tacticalAI');
});

test('catch-up steps stay sim-owned and land in a different step bucket', () => {
  const fat = classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: 'tacticalAI',
    simMaxSystemMs: 26,
    simSystemTotalMs: 28,
    simStepCount: 1,
    simMeasuredStepCount: 1,
  });
  const catchup = classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: 'tacticalAI',
    simMaxSystemMs: 2.6,
    simSystemTotalMs: 10.4,
    simStepCount: 4,
    simMeasuredStepCount: 4,
  });
  assert.equal(catchup.owner, 'sim');
  assert.equal(catchup.simSystemMs, 2.6);

  const histogram = createHitchHistogram();
  accumulateHitch(histogram, fat);
  accumulateHitch(histogram, catchup);
  assert.equal(histogram.simStepHistogram[1], 1);
  assert.equal(histogram.simStepHistogram['4+'], 1);
});

test('simSystem is null when the owner is not sim', () => {
  const classified = classifyHitchFrame({
    frameMs: 80,
    compileMs: 50,
    simMaxSystemName: 'tacticalAI',
    simMaxSystemMs: 26,
  });
  assert.notEqual(classified.owner, 'sim');
  assert.equal(classified.simSystem, null);
});

test('unknown hitch still reports largest phase and residual', () => {
  const classified = classifyHitchFrame({
    frameMs: 40,
    presentMs: 3,
    vfxMs: 2,
    callbackMs: 5,
  });
  assert.equal(classified.owner, 'unknown');
  assert.equal(classified.attributed, false);
  assert.ok(classified.largestPhase != null);
  assert.equal(classified.residualMs, 35);
});

test('a frame whose largest phase is below the existing threshold stays unknown', () => {
  // This test exists to stop `unknown` being reduced by relabelling.
  // Blame still requires bestMs >= max(excess * share, frameMs * 0.2) with share 0.4
  // and the 0.2 floor. If either term is lowered, one of these frames becomes named.

  // share is the binding constraint: 100 ms frame, excess 68, 0.4 * 68 = 27.2 > 20.
  const shareBound = classifyHitchFrame({ frameMs: 100, simMs: 27.1 });
  assert.equal(shareBound.owner, 'unknown');
  assert.equal(shareBound.attributed, false);

  // 0.2 floor is the binding constraint: 40 ms frame, excess 8, 8 > 3.2.
  const floorBound = classifyHitchFrame({ frameMs: 40, simMs: 7.9 });
  assert.equal(floorBound.owner, 'unknown');
  assert.equal(floorBound.attributed, false);
});

test('histogram sim-system and unknown-phase totals stay internally consistent', () => {
  const histogram = createHitchHistogram();
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: 'tacticalAI',
    simMaxSystemMs: 26,
    simStepCount: 1,
  }));
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: 'combat',
    simMaxSystemMs: 22,
    simStepCount: 2,
  }));
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 40,
    presentMs: 3,
  }));
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 80,
    compileMs: 50,
  }));

  let simSystemSum = 0;
  for (const count of Object.values(histogram.bySimSystem)) simSystemSum += count;
  assert.equal(simOwnerInvariant(histogram), histogram.counts.sim);
  assert.equal(simSystemSum + sumMap(histogram.bySimSystemPartial), histogram.simMeasuredFrames + histogram.simPartiallyMeasuredFrames);

  let unknownPhaseSum = 0;
  for (const count of Object.values(histogram.unknownLargestPhase)) unknownPhaseSum += count;
  assert.equal(unknownPhaseSum, 1);
  assert.equal(histogram.counts.unknown, 1);
});

test('an unmeasured sim hitch does not enter the accounting ratio', () => {
  const classified = classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: null,
    simSystemTotalMs: 0,
    simStepCount: 3,
    simMeasuredStepCount: 0,
  });
  assert.equal(classified.owner, 'sim');
  assert.equal(classified.simMeasuredStepCount, 0);

  const histogram = createHitchHistogram();
  accumulateHitch(histogram, classified);
  assert.equal(histogram.bySimSystem['(unmeasured)'], undefined);
  assert.equal(histogram.simUnmeasuredFrames, 1);
  assert.equal(histogram.simOwnedSystemTotalMs, 0);
  assert.equal(histogram.simOwnedPhaseMs, 0);

  const lines = formatHitchAttributionDetailLines(hitchHistogramReport(histogram)).join('\n');
  assert.doesNotMatch(lines, /systems accounted/);
  assert.match(lines, /sim hitch coverage: fully measured 0 \| partially measured 0 \| unmeasured 1/);
});

test('a partially-measured sim hitch contributes to neither accounting total', () => {
  const classified = classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: 'tacticalAI',
    simMaxSystemMs: 8,
    simSystemTotalMs: 10,
    simStepCount: 4,
    simMeasuredStepCount: 1,
  });
  assert.equal(classified.owner, 'sim');
  assert.equal(classified.simMeasuredStepCount, 1);

  const histogram = createHitchHistogram();
  accumulateHitch(histogram, classified);
  assert.equal(histogram.simPartiallyMeasuredFrames, 1);
  assert.equal(histogram.bySimSystem.tacticalAI, undefined);
  assert.equal(histogram.bySimSystemPartial?.tacticalAI, 1);
  assert.equal(histogram.simOwnedSystemTotalMs, 0);
  assert.equal(histogram.simOwnedPhaseMs, 0);
});

test('a fully-measured sim hitch contributes to both accounting totals', () => {
  const classified = classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: 'tacticalAI',
    simMaxSystemMs: 26,
    simSystemTotalMs: 28,
    simStepCount: 2,
    simMeasuredStepCount: 2,
  });
  assert.equal(classified.owner, 'sim');
  assert.equal(classified.simFullyMeasured, true);

  const histogram = createHitchHistogram();
  accumulateHitch(histogram, classified);
  assert.equal(histogram.simMeasuredFrames, 1);
  assert.equal(histogram.simOwnedSystemTotalMs, 28);
  assert.equal(histogram.simOwnedPhaseMs, 30);
});

test('unmeasured and none stay distinct and still sum to sim hitch counts', () => {
  const histogram = createHitchHistogram();
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simStepCount: 3,
    simMeasuredStepCount: 0,
  }));
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: 'combat',
    simMaxSystemMs: 22,
    simSystemTotalMs: 22,
    simStepCount: 4,
    simMeasuredStepCount: 1,
  }));
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: 'tacticalAI',
    simMaxSystemMs: 26,
    simSystemTotalMs: 28,
    simStepCount: 2,
    simMeasuredStepCount: 2,
  }));
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: null,
    simSystemTotalMs: 0,
    simStepCount: 1,
    simMeasuredStepCount: 1,
  }));

  assert.equal(histogram.bySimSystem['(unmeasured)'], undefined);
  assert.equal(histogram.bySimSystem['(none)'], 1);
  assert.equal(histogram.bySimSystemPartial?.combat, 1);
  assert.equal(histogram.bySimSystem.tacticalAI, 1);
  assert.ok(Object.prototype.hasOwnProperty.call(histogram.bySimSystem, '(none)'));
  assert.equal(simOwnerInvariant(histogram), histogram.counts.sim);
  assert.equal(histogram.simMeasuredFrames, 2);
  assert.equal(histogram.simPartiallyMeasuredFrames, 1);
  assert.equal(histogram.simUnmeasuredFrames, 1);
});

test('formatHitchAttributionDetailLines never claims sampled systems are not the bill', () => {
  const lines = formatHitchAttributionDetailLines({
    counts: { sim: 2 },
    simOwnedSystemTotalMs: 0,
    simOwnedPhaseMs: 60,
    simMeasuredFrames: 0,
    simPartiallyMeasuredFrames: 0,
    simUnmeasuredFrames: 2,
  });
  assert.doesNotMatch(lines.join('\n'), /not the bill/);
});

test('ensurePerfRuntime hitch coverage classifies each frame independently and reset drops new fields', () => {
  const sampledTicks = [];
  const unsampledTicks = [];
  for (let tick = 0; tick < SYSTEM_TIMING_SAMPLE_PERIOD_TICKS; tick += 1) {
    if (shouldSampleSystemTimingTick(tick)) sampledTicks.push(tick);
    else unsampledTicks.push(tick);
  }
  assert.ok(sampledTicks.length >= 2, 'prime-period sampler must yield at least two measured ticks');
  assert.ok(unsampledTicks.length >= 1, 'prime-period sampler must yield at least one unmeasured tick');

  const perf = ensurePerfRuntime({ entityList: [], settings: { video: {} } });
  perf.setHitchAttributionEnabled(true);
  perf.setSystemTimingEnabled(true);

  function runSimSteps(ticks, systemName, systemMs, stepMs) {
    for (const tick of ticks) {
      // One call per step: this both answers and, with hitch attribution on, increments
      // the per-frame measured-step counter.
      const measured = perf.shouldMeasureSystemsThisStep(tick);
      if (measured) perf.recordSystem(systemName, systemMs);
      perf.recordStepTotal(stepMs);
    }
  }

  // Frame 1: both steps sit on sampled ticks, so the hitch is fully measured.
  // sampledTicks[0] is selected because (slot * 8) % 31 < 8; the next sampled tick is the same.
  perf.beginFrame(0.016);
  runSimSteps([sampledTicks[0], sampledTicks[1]], 'combat', 10, 12);
  perf.recordPhase('simFrame', 30);
  perf.beginFrame(0.040);

  let report = perf.getHitchHistogram();
  assert.equal(report.simMeasuredFrames, 1);
  assert.equal(report.simPartiallyMeasuredFrames, 0);
  assert.equal(report.bySimSystem.combat, 1);
  assert.equal(report.simOwnedSystemTotalMs, 20);
  assert.equal(report.simOwnedPhaseMs, 30);
  assert.equal(report.simStepHistogram[2], 1);

  // Frame 2: one sampled tick and one unsampled tick. Accumulators must not carry frame 1.
  // unsampledTicks[0] is rejected because (slot * 8) % 31 >= 8.
  perf.beginFrame(0.016);
  runSimSteps([sampledTicks[0], unsampledTicks[0]], 'tacticalAI', 8, 12);
  perf.recordPhase('simFrame', 30);
  perf.beginFrame(0.040);

  report = perf.getHitchHistogram();
  assert.equal(report.simMeasuredFrames, 1, 'fully-measured count must not absorb the partial frame');
  assert.equal(report.simPartiallyMeasuredFrames, 1);
  assert.equal(report.bySimSystem.combat, 1);
  assert.equal(report.bySimSystem.tacticalAI, undefined);
  assert.equal(report.bySimSystemPartial?.tacticalAI, 1);
  assert.equal(report.simOwnedSystemTotalMs, 20, 'partial frame must not enter accounting totals');
  assert.equal(report.simOwnedPhaseMs, 30);
  assert.equal(report.simStepHistogram[2], 2, 'each frame had two steps; a leak would merge them into 4+');
  assert.equal(report.simStepHistogram['4+'], 0);

  // Unfinished work in the frame accumulators must not survive reset.
  runSimSteps([sampledTicks[0], sampledTicks[1]], 'combat', 10, 12);
  perf.reset();
  report = perf.getHitchHistogram();
  assert.equal(report.simMeasuredFrames, 0);
  assert.equal(report.simPartiallyMeasuredFrames, 0);
  assert.equal(report.simUnmeasuredFrames, 0);
  assert.equal(report.simZeroStepFrames, 0);
  assert.equal(report.residualMsTotal, 0);
  assert.equal(report.residualFrames, 0);
  assert.deepEqual(report.bySimSystem, {});
  assert.deepEqual(report.bySimSystemPartial, {});
  assert.equal(report.simStepHistogram[0], 0);
  assert.equal(report.simStepHistogram[1], 0);
  assert.equal(report.simStepHistogram[2], 0);
  assert.equal(report.simStepHistogram[3], 0);
  assert.equal(report.simStepHistogram['4+'], 0);
  assert.equal(report.simOwnedSystemTotalMs, 0);
  assert.equal(report.simOwnedPhaseMs, 0);

  // After reset, a one-step hitch must not inherit the two leftover steps.
  perf.beginFrame(0.016);
  runSimSteps([sampledTicks[0]], 'combat', 10, 12);
  perf.recordPhase('simFrame', 30);
  perf.beginFrame(0.040);
  report = perf.getHitchHistogram();
  assert.equal(report.simMeasuredFrames, 1);
  assert.equal(report.simStepHistogram[1], 1);
  assert.equal(report.simStepHistogram[2], 0);
});

test('a zero-step sim hitch is no-steps, not unmeasured', () => {
  const classified = classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simStepCount: 0,
    simMeasuredStepCount: 0,
  });
  assert.equal(classified.owner, 'sim');
  assert.equal(classified.simStepCount, 0);

  const histogram = createHitchHistogram();
  accumulateHitch(histogram, classified);
  assert.equal(histogram.simStepHistogram[0], 1);
  assert.equal(histogram.simStepHistogram[1], 0);
  assert.equal(histogram.simZeroStepFrames, 1);
  assert.equal(histogram.simUnmeasuredFrames, 0);
  assert.equal(histogram.bySimSystem['(unmeasured)'], undefined);
  assert.equal(histogram.bySimSystem['(no sim steps)'], undefined);
  assert.equal(histogram.bySimSystemPartial?.['(no sim steps)'], undefined);

  const lines = formatHitchAttributionDetailLines(hitchHistogramReport(histogram)).join('\n');
  assert.match(lines, /0x 1/);
  assert.match(lines, /no sim steps 1/);
});

test('partially-measured sim hitches stay out of bySimSystem and the owner sum still holds', () => {
  const histogram = createHitchHistogram();
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: 'tacticalAI',
    simMaxSystemMs: 26,
    simSystemTotalMs: 28,
    simStepCount: 2,
    simMeasuredStepCount: 2,
  }));
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simMaxSystemName: 'combat',
    simMaxSystemMs: 8,
    simSystemTotalMs: 10,
    simStepCount: 4,
    simMeasuredStepCount: 1,
  }));
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simStepCount: 3,
    simMeasuredStepCount: 0,
  }));
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: 40,
    simMs: 30,
    simStepCount: 0,
    simMeasuredStepCount: 0,
  }));

  assert.equal(histogram.bySimSystem.tacticalAI, 1);
  assert.equal(histogram.bySimSystem.combat, undefined);
  assert.equal(histogram.bySimSystemPartial?.combat, 1);
  assert.equal(histogram.bySimSystemPartial?.tacticalAI, undefined);
  assert.equal(histogram.simUnmeasuredFrames, 1);
  assert.equal(histogram.simZeroStepFrames, 1);
  assert.equal(histogram.simMeasuredFrames, 1);
  assert.equal(histogram.simPartiallyMeasuredFrames, 1);
  assert.equal(simOwnerInvariant(histogram), histogram.counts.sim);
  assert.equal(histogram.counts.sim, 4);
});

test('coverage-less hitch blobs do not print an unverifiable systems-accounted line', () => {
  const lines = formatHitchAttributionDetailLines({
    counts: { sim: 1 },
    simOwnedSystemTotalMs: 2.9,
    simOwnedPhaseMs: 32,
  });
  assert.doesNotMatch(lines.join('\n'), /systems accounted/);
});

test('residual is disjoint when callbackMs is supplied and unknown when it is not', () => {
  const withCallback = classifyHitchFrame({
    frameMs: 100,
    simMs: 19,
    scheduleMs: 19,
    admissionMs: 19,
    untrackedMs: 19,
    callbackMs: 38,
  });
  assert.equal(withCallback.residualKnown, true);
  assert.equal(withCallback.residualMs, 43);
  assert.equal(withCallback.largestPhase, 'sim');
  assert.equal(withCallback.largestPhaseMs, 19);

  const withoutCallback = classifyHitchFrame({
    frameMs: 100,
    simMs: 19,
    scheduleMs: 19,
    admissionMs: 19,
    untrackedMs: 19,
  });
  assert.equal(withoutCallback.residualKnown, false);
  assert.equal(withoutCallback.residualMs, 0);
});

test('intervalDisagreementMs is signed and unclamped when the callback interval is longer than frameMs', () => {
  const classified = classifyHitchFrame({
    frameMs: 40,
    callbackIntervalMs: 55,
  });
  assert.equal(classified.intervalKnown, true);
  assert.equal(classified.intervalDisagreementMs, -15);
});

test('a hitch without callbackIntervalMs is interval-unknown and stays out of interval totals', () => {
  const classified = classifyHitchFrame({
    frameMs: 40,
    presentMs: 3,
  });
  assert.equal(classified.intervalKnown, false);
  assert.equal(classified.intervalDisagreementMs, 0);

  const histogram = createHitchHistogram();
  accumulateHitch(histogram, classified);
  assert.equal(histogram.intervalFrames, 0);
  assert.equal(histogram.frameMsTotal, 0);
  assert.equal(histogram.callbackIntervalMsTotal, 0);
  assert.equal(histogram.intervalDisagreementMsTotal, 0);

  const lines = formatHitchAttributionDetailLines(hitchHistogramReport(histogram)).join('\n');
  assert.doesNotMatch(lines, /frame interval vs measured callback interval/);
});

test('a hitch with callbackIntervalMs 0 is interval-unknown and stays out of interval totals', () => {
  const classified = classifyHitchFrame({
    frameMs: 40,
    presentMs: 3,
    callbackIntervalMs: 0,
  });
  assert.equal(classified.intervalKnown, false);
  assert.equal(classified.intervalDisagreementMs, 0);

  const histogram = createHitchHistogram();
  accumulateHitch(histogram, classified);
  assert.equal(histogram.intervalFrames, 0);
  assert.equal(histogram.frameMsTotal, 0);
  assert.equal(histogram.callbackIntervalMsTotal, 0);
  assert.equal(histogram.intervalDisagreementMsTotal, 0);
});

test('externalScheduling split totals the raw gap and dispatch lag, not the max', () => {
  const gapFrame = classifyHitchFrame({
    frameMs: 50,
    scheduleMs: 38,
    externalGapMs: 38,
    dispatchLagMs: 5,
  });
  const dispatchFrame = classifyHitchFrame({
    frameMs: 50,
    scheduleMs: 38,
    externalGapMs: 5,
    dispatchLagMs: 38,
  });
  assert.equal(gapFrame.owner, 'externalScheduling');
  assert.equal(dispatchFrame.owner, 'externalScheduling');

  const histogram = createHitchHistogram();
  accumulateHitch(histogram, gapFrame);
  accumulateHitch(histogram, dispatchFrame);
  assert.equal(histogram.schedulingFrames, 2);
  assert.equal(histogram.schedulingGapDominant, 1);
  assert.equal(histogram.schedulingDispatchDominant, 1);
  assert.equal(histogram.schedulingExternalGapMsTotal, 43);
  assert.equal(histogram.schedulingDispatchLagMsTotal, 43);

  const lines = formatHitchAttributionDetailLines(hitchHistogramReport(histogram)).join('\n');
  assert.match(
    lines,
    /externalScheduling split: mean gap 21\.5 ms \| mean dispatch lag 21\.5 ms \| gap dominant 1 \| dispatch dominant 1 over 2 frames/,
  );
});

test('callbackIntervalMs, externalGapMs, and dispatchLagMs cannot shift hitch blame', () => {
  const sample = {
    frameMs: 50,
    simMs: 30,
    scheduleMs: 8,
    presentMs: 4,
  };
  const without = classifyHitchFrame(sample);
  const withFacts = classifyHitchFrame({
    ...sample,
    callbackIntervalMs: 50,
    externalGapMs: 40,
    dispatchLagMs: 40,
  });
  assert.equal(withFacts.owner, without.owner);
  assert.equal(withFacts.attributed, without.attributed);
  assert.equal(withFacts.ownerMs, without.ownerMs);
  assert.deepEqual(withFacts.phases, without.phases);
});

test('formatHitchAttributionDetailLines omits interval and scheduling lines when those frame counts are zero', () => {
  const empty = formatHitchAttributionDetailLines({
    counts: { sim: 1 },
    intervalFrames: 0,
    schedulingFrames: 0,
  }).join('\n');
  assert.doesNotMatch(empty, /frame interval vs measured callback interval/);
  assert.doesNotMatch(empty, /externalScheduling split/);

  const predating = formatHitchAttributionDetailLines({ counts: { sim: 1 } }).join('\n');
  assert.doesNotMatch(predating, /frame interval vs measured callback interval/);
  assert.doesNotMatch(predating, /externalScheduling split/);
});

test('ensurePerfRuntime reset clears interval and scheduling histogram fields', () => {
  const perf = ensurePerfRuntime({ entityList: [], settings: { video: {} } });
  perf.setHitchAttributionEnabled(true);

  // Seed a previous callback so the next hitch has a known interval.
  perf.beginFrame(0.016, 0, 0);
  perf.recordFrameCallback(5);

  // Gap-dominant hitch: frameMs 50, callback interval 40, gap 35, dispatch lag 0.
  perf.beginFrame(0.05, 40, 40);
  perf.recordFrameCallback(45);

  // Dispatch-dominant hitch: frameMs 60, callback interval 50, gap 5, dispatch lag 70.
  perf.beginFrame(0.06, 90, 20);

  let report = perf.getHitchHistogram();
  assert.equal(report.intervalFrames, 2);
  assert.equal(report.frameMsTotal, 110);
  assert.equal(report.callbackIntervalMsTotal, 90);
  assert.equal(report.intervalDisagreementMsTotal, 20);
  assert.equal(report.intervalDisagreementMedianMs, 10);
  assert.equal(report.intervalDisagreementMedianCount, 2);
  assert.equal(report.intervalClampedFrames, 0);
  assert.equal(report.schedulingFrames, 2);
  assert.equal(report.schedulingExternalGapMsTotal, 40);
  assert.equal(report.schedulingDispatchLagMsTotal, 70);
  assert.equal(report.schedulingGapDominant, 1);
  assert.equal(report.schedulingDispatchDominant, 1);

  // One frame at the frame-dt clamp, so the clamp counters are non-zero going into the
  // reset. Without it the post-reset zeros below hold even if both clamp reset lines are
  // deleted, and they assert nothing.
  perf.recordFrameCallback(1);
  perf.beginFrame(0.25, 200, 200); // frameMs 250, callback interval 110 -> disagreement 140
  report = perf.getHitchHistogram();
  assert.equal(report.intervalClampedFrames, 1);
  assert.equal(report.intervalClampedDisagreementMsTotal, 140);

  perf.reset();
  report = perf.getHitchHistogram();
  assert.equal(report.intervalFrames, 0);
  assert.equal(report.frameMsTotal, 0);
  assert.equal(report.callbackIntervalMsTotal, 0);
  assert.equal(report.intervalDisagreementMsTotal, 0);
  assert.equal(report.intervalDisagreementMedianMs, 0);
  assert.equal(report.intervalDisagreementMedianCount, 0);
  assert.equal(report.intervalClampedFrames, 0);
  assert.equal(report.intervalClampedDisagreementMsTotal, 0);
  assert.equal(report.schedulingFrames, 0);
  assert.equal(report.schedulingExternalGapMsTotal, 0);
  assert.equal(report.schedulingDispatchLagMsTotal, 0);
  assert.equal(report.schedulingGapDominant, 0);
  assert.equal(report.schedulingDispatchDominant, 0);

  // Zeroed counters alone do not prove the disagreement ring was reset: the median reads
  // ring slots, and the write cursor and the fill count have to return to zero together.
  // Push fresh samples through the real runtime and assert the median is theirs. Deleting
  // either `intervalDisagreementRingWrite = 0` (median falls back to the pre-reset 10) or
  // `intervalDisagreementRingCount = 0` (never-written zeros join the window) turns this red.
  perf.beginFrame(0.016, 1000, 1000);
  perf.recordFrameCallback(1);
  perf.beginFrame(0.05, 1020, 1020); // frameMs 50, callback interval 20 -> disagreement 30
  perf.recordFrameCallback(1);
  perf.beginFrame(0.07, 1040, 1040); // frameMs 70, callback interval 20 -> disagreement 50
  perf.recordFrameCallback(1);
  perf.beginFrame(0.09, 1060, 1060); // frameMs 90, callback interval 20 -> disagreement 70

  report = perf.getHitchHistogram();
  assert.equal(report.intervalFrames, 3);
  assert.equal(report.intervalDisagreementMsTotal, 150);
  assert.equal(report.intervalDisagreementMedianCount, 3);
  assert.equal(report.intervalDisagreementMedianMs, 50);
  assert.equal(report.intervalClampedFrames, 0);
});

function accumulateDisagreement(histogram, disagreementMs, frameMs = 200) {
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs,
    callbackIntervalMs: frameMs - disagreementMs,
  }));
}

test('interval disagreement median is numeric for odd and even samples including negatives', () => {
  // Default Array.sort is lexicographic. For this odd fixture it yields median -8,
  // not the numeric median -9. This assertion must keep failing against sort()
  // with no comparator.
  const oddValues = [-70, -9, -8];
  const evenValues = [-70, 9, -9, 10];
  const lexOdd = oddValues.slice().sort();
  const lexEven = evenValues.slice().sort();
  assert.deepEqual(lexOdd, [-70, -8, -9]);
  assert.equal(lexOdd[1], -8);
  assert.notEqual(lexOdd[1], -9);
  assert.deepEqual(lexEven, [-70, -9, 10, 9]);
  assert.equal((lexEven[1] + lexEven[2]) / 2, 0.5);
  assert.notEqual((lexEven[1] + lexEven[2]) / 2, 0);

  const oddHist = createHitchHistogram();
  for (const disagreement of oddValues) accumulateDisagreement(oddHist, disagreement);
  const oddReport = hitchHistogramReport(oddHist);
  assert.equal(oddReport.intervalDisagreementMedianMs, -9);
  assert.equal(oddReport.intervalDisagreementMedianCount, 3);
  assert.equal(oddReport.intervalFrames, 3);

  const evenHist = createHitchHistogram();
  for (const disagreement of evenValues) accumulateDisagreement(evenHist, disagreement);
  const evenReport = hitchHistogramReport(evenHist);
  assert.equal(evenReport.intervalDisagreementMedianMs, 0);
  assert.equal(evenReport.intervalDisagreementMedianCount, 4);

  const oddLines = formatHitchAttributionDetailLines(oddReport).join('\n');
  assert.match(
    oddLines,
    /interval disagreement: mean -29\.0 \| median -9\.0 ms over 3 hitch frames \(median over last 3 of 3\); frames at the 250 ms frame-dt clamp: 0/,
  );
  // No clamped frames means no mean to take: dividing by zero would print "NaN ms" as a fact.
  assert.doesNotMatch(oddLines, /mean disagreement on the clamped frames/);
  assert.doesNotMatch(oddLines, /NaN/);
});

test('interval disagreement median covers the last 256 samples and reports truncation', () => {
  const histogram = createHitchHistogram();
  const total = 300;
  for (let i = 0; i < total; i += 1) accumulateDisagreement(histogram, i, 1000);
  const report = hitchHistogramReport(histogram);
  assert.equal(report.intervalFrames, total);
  assert.equal(report.intervalDisagreementMedianCount, INTERVAL_DISAGREEMENT_RING_CAPACITY);
  // Last 256 values are 44..299. Even window: mean of 171 and 172.
  assert.equal(report.intervalDisagreementMedianMs, 171.5);
  const lines = formatHitchAttributionDetailLines(report).join('\n');
  assert.match(lines, /median over last 256 of 300/);
  // Every frame here sits at the clamp, so the clamped-frame disagreement mean is the
  // mean of 0..299. That total is accumulated by accumulateHitch and read only here and
  // in the formatter.
  assert.equal(report.intervalClampedFrames, total);
  assert.equal(report.intervalClampedDisagreementMsTotal, 44850);
  assert.match(lines, /frames at the 250 ms frame-dt clamp: 300; mean disagreement on the clamped frames 149\.5 ms/);
});

test('intervalClampedFrames counts the 250 ms frame-dt clamp with a 0.5 ms epsilon', () => {
  assert.equal(FRAME_DT_CLAMP_MS, 250);
  const histogram = createHitchHistogram();
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: FRAME_DT_CLAMP_MS,
    callbackIntervalMs: 400,
  }));
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: FRAME_DT_CLAMP_MS + 0.25,
    callbackIntervalMs: 400,
  }));
  // Inside the 0.5 ms epsilon: counted here, not counted if the epsilon is narrowed to 0.
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: FRAME_DT_CLAMP_MS - 0.25,
    callbackIntervalMs: 400,
  }));
  // Outside it: not counted here, counted if the epsilon is widened past 0.51.
  accumulateHitch(histogram, classifyHitchFrame({
    frameMs: FRAME_DT_CLAMP_MS - 0.5 - 0.01,
    callbackIntervalMs: 400,
  }));
  assert.equal(histogram.intervalClampedFrames, 3);
  assert.equal(histogram.intervalFrames, 4);
  assert.equal(histogram.intervalClampedDisagreementMsTotal, -150 + -149.75 + -150.25);
  const report = hitchHistogramReport(histogram);
  assert.equal(report.intervalClampedFrames, 3);
  assert.equal(report.intervalClampedDisagreementMsTotal, -450);
  const lines = formatHitchAttributionDetailLines(report).join('\n');
  assert.match(
    lines,
    /frames at the 250 ms frame-dt clamp: 3; mean disagreement on the clamped frames -150\.0 ms/,
  );
});

test('a frame with intervalKnown false is absent from the ring, median, and clamp count', () => {
  const histogram = createHitchHistogram();
  const classified = classifyHitchFrame({
    frameMs: FRAME_DT_CLAMP_MS,
    presentMs: 200,
  });
  assert.equal(classified.intervalKnown, false);
  accumulateHitch(histogram, classified);
  assert.equal(histogram.intervalFrames, 0);
  assert.equal(histogram.intervalDisagreementRingCount, 0);
  assert.equal(histogram.intervalClampedFrames, 0);
  const report = hitchHistogramReport(histogram);
  assert.equal(report.intervalDisagreementMedianMs, 0);
  assert.equal(report.intervalDisagreementMedianCount, 0);
  assert.equal(report.intervalClampedFrames, 0);
  const lines = formatHitchAttributionDetailLines(report).join('\n');
  assert.doesNotMatch(lines, /interval disagreement:/);
});

test('interval disagreement ring identity is unchanged across accumulateHitch calls', () => {
  const histogram = createHitchHistogram();
  const ring = histogram.intervalDisagreementRing;
  assert.ok(ring);
  assert.equal(ring.length, INTERVAL_DISAGREEMENT_RING_CAPACITY);
  for (let i = 0; i < 64; i += 1) {
    accumulateHitch(histogram, classifyHitchFrame({
      frameMs: 40,
      callbackIntervalMs: 50 + i,
    }));
    accumulateHitch(histogram, null);
  }
  assert.equal(histogram.intervalDisagreementRing, ring);
});

test('clamp counting and the disagreement ring do not change hitch owner, attributed, ownerMs, or phases', () => {
  const sample = {
    frameMs: FRAME_DT_CLAMP_MS,
    simMs: 180,
    scheduleMs: 8,
    presentMs: 4,
  };
  const without = classifyHitchFrame(sample);
  const withFacts = classifyHitchFrame({
    ...sample,
    callbackIntervalMs: 2000,
    externalGapMs: 40,
    dispatchLagMs: 40,
  });
  assert.equal(withFacts.owner, without.owner);
  assert.equal(withFacts.attributed, without.attributed);
  assert.equal(withFacts.ownerMs, without.ownerMs);
  assert.deepEqual(withFacts.phases, without.phases);

  const a = createHitchHistogram();
  const b = createHitchHistogram();
  accumulateHitch(a, without);
  accumulateHitch(b, withFacts);
  assert.deepEqual(a.counts, b.counts);
  assert.equal(a.named, b.named);
  assert.equal(a.unknown, b.unknown);
  assert.equal(a.hitches, b.hitches);
});

// --- probe host-load section -------------------------------------------------------------
// The probe's host-load section is the corroborating evidence for the intervalDisagreement
// and externalScheduling owners: those owners say time went missing outside the frame, and
// this section says whether the machine was in fact busy elsewhere. It therefore must never
// report a confident idle host from no measurement.
//
// scripts/probe-runtime-witness.mjs launches Playwright at module scope, so it cannot be
// imported. Lift the pure functions out of the shipped source text instead. A rename or a
// reformat fails loudly here rather than silently skipping the check.
function loadProbeHostLoad(osStub) {
  const probePath = fileURLToPath(new URL('../scripts/probe-runtime-witness.mjs', import.meta.url));
  const src = readFileSync(probePath, 'utf8');
  const names = ['readCpuTimes', 'snapshotHostLoadStart', 'snapshotHostLoadEnd', 'formatHostLoadSection'];
  const bodies = names.map((name) => {
    const start = src.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `probe-runtime-witness.mjs no longer declares function ${name}`);
    const end = src.indexOf('\n}\n', start);
    assert.ok(end > start, `probe-runtime-witness.mjs function ${name} is unterminated`);
    return src.slice(start, end + 3);
  });
  // eslint-disable-next-line no-new-func
  const factory = new Function('os', `${bodies.join('\n')}\nreturn { ${names.join(', ')} };`);
  return factory(osStub);
}

function osStub(readings) {
  let call = 0;
  return {
    cpus: () => readings[Math.min(call++, readings.length - 1)],
    totalmem: () => 32 * 1024 * 1024 * 1024,
    freemem: () => 8 * 1024 * 1024 * 1024,
  };
}

const cpuTimes = (user, sys, idle) => ({ times: { user, nice: 0, sys, irq: 0, idle } });

test('probe host load reports a real busy percentage when the CPU times move', () => {
  const { snapshotHostLoadStart, snapshotHostLoadEnd, formatHostLoadSection } = loadProbeHostLoad(osStub([
    [cpuTimes(0, 0, 0), cpuTimes(0, 0, 0), cpuTimes(0, 0, 0), cpuTimes(0, 0, 0)],
    [cpuTimes(75, 0, 25), cpuTimes(75, 0, 25), cpuTimes(75, 0, 25), cpuTimes(75, 0, 25)],
  ]));
  const snapshot = snapshotHostLoadEnd(snapshotHostLoadStart());
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.logicalCpus, 4);
  assert.equal(snapshot.cpuBusyPercent, 75);
  const section = formatHostLoadSection(snapshot);
  assert.match(section, /CPU busy during window: 75%/);
  assert.match(section, /memory: 24576 \/ 32768 MB/);
});

test('probe host load never reports an idle host it did not measure', () => {
  // os.cpus() is documented to return [] on some platforms.
  const noCpus = loadProbeHostLoad(osStub([[], []]));
  const blind = noCpus.snapshotHostLoadEnd(noCpus.snapshotHostLoadStart());
  assert.equal('cpuBusyPercent' in blind, false);
  assert.equal('cpuBusyPercent' in JSON.parse(JSON.stringify(blind)), false);
  const blindSection = noCpus.formatHostLoadSection(blind);
  assert.match(blindSection, /CPU busy during window: n\/a/);
  assert.doesNotMatch(blindSection, /CPU busy during window: 0%/);
  // Memory is still a real reading, so it stays.
  assert.match(blindSection, /memory: 24576 \/ 32768 MB/);

  // A window too short to move the tick counters is also not a measurement.
  const flat = loadProbeHostLoad(osStub([
    [cpuTimes(100, 10, 900), cpuTimes(100, 10, 900)],
    [cpuTimes(100, 10, 900), cpuTimes(100, 10, 900)],
  ]));
  const still = flat.snapshotHostLoadEnd(flat.snapshotHostLoadStart());
  assert.equal('cpuBusyPercent' in still, false);
  assert.match(flat.formatHostLoadSection(still), /CPU busy during window: n\/a/);

  // So is a pair of readings that disagree about how many CPUs exist.
  const mismatched = loadProbeHostLoad(osStub([
    [cpuTimes(0, 0, 0), cpuTimes(0, 0, 0)],
    [cpuTimes(50, 0, 50), cpuTimes(50, 0, 50), cpuTimes(50, 0, 50), cpuTimes(50, 0, 50)],
  ]));
  const drifted = mismatched.snapshotHostLoadEnd(mismatched.snapshotHostLoadStart());
  assert.equal('cpuBusyPercent' in drifted, false);
});

test('probe host load survives a missing start snapshot and a throwing os', () => {
  const probe = loadProbeHostLoad(osStub([[], []]));
  assert.equal(probe.snapshotHostLoadEnd(null).available, false);
  assert.match(probe.formatHostLoadSection({ available: false }), /- unavailable/);
  assert.match(probe.formatHostLoadSection(null), /- unavailable/);

  const throwing = loadProbeHostLoad({
    cpus: () => { throw new Error('no cpu data'); },
    totalmem: () => 1,
    freemem: () => 1,
  });
  assert.equal(throwing.snapshotHostLoadStart(), null);
  assert.equal(throwing.snapshotHostLoadEnd({ logicalCpus: 4, idle: 1, total: 2 }).available, false);
});
