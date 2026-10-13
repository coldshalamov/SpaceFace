// scripts/lib/loadingSmoothness.mjs — the arithmetic behind the loading-screen smoothness section.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  frameGapStats,
  loafOffenders,
  smoothnessMarkdown,
  summarizeLoadingSmoothness,
  videoDrops,
} from '../scripts/lib/loadingSmoothness.mjs';

// 60 fps for one second, then a 120 ms freeze, then 60 fps again.
const STEADY = Array.from({ length: 61 }, (_, i) => i * (1000 / 60));
const FROZEN = [...STEADY, STEADY[STEADY.length - 1] + 120, ...Array.from({ length: 30 }, (_, i) => STEADY[STEADY.length - 1] + 120 + (i + 1) * (1000 / 60))];

test('a steady 60 fps window has no stall; a freeze is counted once at every bar it crosses', () => {
  const steady = frameGapStats(STEADY, 0, 1000);
  assert.equal(steady.over33, 0);
  assert.ok(steady.stallMs < 1);
  assert.ok(Math.abs(steady.p50 - 16.7) < 0.1);
  const frozen = frameGapStats(FROZEN, 0, 5000);
  assert.equal(frozen.over33, 1);
  assert.equal(frozen.over50, 1);
  assert.equal(frozen.over100, 1);
  assert.ok(Math.abs(frozen.worst - 120) < 0.01);
  assert.ok(frozen.stallMs > 100 && frozen.stallMs < 105, `stall is the 120 ms gap beyond one frame, got ${frozen.stallMs}`);
});

test('windows only see the frames inside them', () => {
  const late = frameGapStats(FROZEN, 1100, 5000);
  assert.equal(late.over100, 0, 'the freeze starts before this window');
  assert.equal(frameGapStats([], 0, 1000).frames, 0);
  assert.equal(frameGapStats([5], 0, 1000).worst, 0, 'one frame has no gap');
});

test('long animation frames are attributed to the scripts that ran, biggest first', () => {
  const loaf = [
    { startTime: 100, duration: 180, blockingDuration: 130, scripts: [
      { sourceURL: 'http://127.0.0.1:1/src/render/renderer.js', sourceFunctionName: 'cook', duration: 120, forcedStyleAndLayoutDuration: 4 },
      { sourceURL: 'http://127.0.0.1:1/src/ui/hud.js', invoker: 'frame', duration: 30 },
    ] },
    { startTime: 400, duration: 90, blockingDuration: 40, scripts: [
      { sourceURL: 'http://127.0.0.1:1/src/render/renderer.js', sourceFunctionName: 'cook', duration: 60 },
    ] },
    { startTime: 9000, duration: 500, blockingDuration: 450, scripts: [] },
  ];
  const window = loafOffenders(loaf, 0, 1000);
  assert.equal(window.frames, 2);
  assert.equal(window.blockingMs, 170);
  assert.equal(window.offenders[0].key, 'cook @ src/render/renderer.js');
  assert.equal(window.offenders[0].ms, 180);
  assert.equal(window.offenders[0].count, 2);
  assert.equal(window.offenders[1].key, 'frame @ src/ui/hud.js');
});

test('dropped video frames are the delta across the window, and need two samples to mean anything', () => {
  const video = [
    { t: 0, total: 0, dropped: 0 },
    { t: 500, total: 15, dropped: 1 },
    { t: 1000, total: 30, dropped: 4 },
    { t: 2000, total: 60, dropped: 4 },
  ];
  assert.deepEqual(videoDrops(video, 0, 1000), { samples: 3, played: 30, dropped: 4 });
  assert.deepEqual(videoDrops(video, 1500, 1900), { samples: 0, played: 0, dropped: 0 });
  assert.equal(videoDrops([], 0, 1).dropped, 0);
});

test('the markdown has one row per window and a table of offenders only where frames were long', () => {
  const rows = summarizeLoadingSmoothness({
    rafStamps: FROZEN,
    loaf: [{ startTime: 1000, duration: 130, blockingDuration: 80, scripts: [{ sourceURL: 'x/src/a.js', sourceFunctionName: 'f', duration: 70 }] }],
    video: [{ t: 0, total: 0, dropped: 0 }, { t: 900, total: 27, dropped: 2 }],
    windows: [{ id: 'first', fromMs: 0, toMs: 1100 }, { id: 'second', fromMs: 1100, toMs: 5000 }],
  });
  const md = smoothnessMarkdown(rows).join('\n');
  assert.match(md, /\| first \|/);
  assert.match(md, /\| second \|/);
  assert.match(md, /Long animation frames in first/);
  assert.doesNotMatch(md, /Long animation frames in second/);
  assert.match(md, /`f @ src\/a\.js`/);
});
