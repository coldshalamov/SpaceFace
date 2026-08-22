import assert from 'node:assert/strict';
import test from 'node:test';

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
  hitchHistogramReport,
} from '../src/render/hitchClassifier.js';

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
  assert.equal(report.schedulingFrames, 2);
  assert.equal(report.schedulingExternalGapMsTotal, 40);
  assert.equal(report.schedulingDispatchLagMsTotal, 70);
  assert.equal(report.schedulingGapDominant, 1);
  assert.equal(report.schedulingDispatchDominant, 1);

  perf.reset();
  report = perf.getHitchHistogram();
  assert.equal(report.intervalFrames, 0);
  assert.equal(report.frameMsTotal, 0);
  assert.equal(report.callbackIntervalMsTotal, 0);
  assert.equal(report.intervalDisagreementMsTotal, 0);
  assert.equal(report.schedulingFrames, 0);
  assert.equal(report.schedulingExternalGapMsTotal, 0);
  assert.equal(report.schedulingDispatchLagMsTotal, 0);
  assert.equal(report.schedulingGapDominant, 0);
  assert.equal(report.schedulingDispatchDominant, 0);
});
