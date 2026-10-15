import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatPresentedCanvasContentSummary,
  selectPresentedCanvasFrames,
  summarizePresentedCanvasContent,
} from '../scripts/lib/presentedCanvasContent.mjs';

test('frame selection is chronological, in-window, unique by tick, and capped with coverage', () => {
  const frames = Array.from({ length: 500 }, (_, index) => ({ tick: index * 6, id: index }));
  frames.push({ tick: 300, id: 'duplicate' }, { tick: 4000, id: 'outside' });
  const selected = selectPresentedCanvasFrames(frames, { startTick: 100, endTick: 2500 });
  assert.equal(selected.length, 201);
  assert.equal(selected[0].tick, 102);
  assert.equal(selected.at(-1).tick, 2496);
  assert.equal(new Set(selected.map(frame => frame.tick)).size, selected.length);
  assert.ok(selected.every((frame, index) => index === 0 || frame.tick > selected[index - 1].tick));
});

test('content summary reports changed frames, equal runs, and long sample gaps separately', () => {
  const samples = [
    { tick: 300, signature: 'moving-a' },
    { tick: 306, signature: 'moving-b' },
    { tick: 312, signature: 'still' },
    { tick: 318, signature: 'still' },
    { tick: 324, signature: 'still' },
    { tick: 900, signature: 'still' },
  ];
  const result = summarizePresentedCanvasContent({
    captureSource: 'presented', samples, startTick: 0, endTick: 1200,
    openingDelayMs: 5_000,
  });
  assert.equal(result.status, 'observed');
  assert.equal(result.sampleCount, 6);
  assert.equal(result.eligibleFrameCount, 6);
  assert.equal(result.equalAdjacentPairs, 3);
  assert.equal(result.changedAdjacentPairs, 2);
  assert.equal(result.maxGapTicks, 576);
  assert.deepEqual(result.longestEqualContentRun, {
    startTick: 312, endTick: 324, frameCount: 3, durationTicks: 12,
  });
  assert.deepEqual(result.equalContentRuns, [{
    startTick: 312, endTick: 324, frameCount: 3, durationTicks: 12,
  }]);
  const line = formatPresentedCanvasContentSummary(result);
  assert.match(line, /canvas content observed/);
  assert.match(line, /frames 6\/6/);
  assert.match(line, /longest equal run 312-324 \(12 ticks\)/);
  assert.match(line, /OS scanout unmeasured/);
  assert.equal(result.evidenceLayer, 'decoded thumbnails of captured presented-submit frames; display scanout unmeasured');
});

test('insufficient coverage, unavailable pixels, and fallback source remain unknown', () => {
  const samples = [
    { tick: 300, signature: 'same' },
    { tick: 306, signature: 'same' },
    { tick: 312, signature: 'same' },
    { tick: 318, signature: 'same' },
  ];
  const incomplete = summarizePresentedCanvasContent({
    captureSource: 'presented', samples, startTick: 0, endTick: 1200,
    decodeFailures: 1,
  });
  assert.equal(incomplete.status, 'unknown');
  assert.match(incomplete.reason, /failed to decode/);

  const fallback = summarizePresentedCanvasContent({
    captureSource: 'video', samples, startTick: 0, endTick: 1200,
  });
  assert.equal(fallback.status, 'unknown');
  assert.match(fallback.reason, /not presented/);
  assert.match(formatPresentedCanvasContentSummary(fallback), /canvas content unknown \(actual capture source is not presented;/);

  const short = summarizePresentedCanvasContent({
    captureSource: 'presented', samples: samples.slice(0, 3),
    startTick: 0, endTick: 1200,
  });
  assert.equal(short.status, 'unknown');
  assert.match(short.reason, /fewer than four/);
});
