// Harness reader tasks (pixel redraw + readback) are excluded from frame_time and reported as harness_overhead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFrameTime, splitHarnessOverhead, readerWindows, regradeSoftwareFrameTime, THRESHOLDS } from '../scripts/player-truth/checks.mjs';
import { applyBaselineToHead, compareVerdicts } from '../scripts/player-truth/compare.mjs';
import { renderVerdict } from '../scripts/player-truth/verdict.mjs';

// 100 flight frames, 40 ms apart; every 24th sample ran the 1200 ms pixel reader.
function playTrace({ reader = true, gameTask = true, meta = {} } = {}) {
  const samples = []; let t = 1000;
  for (let f = 1; f <= 100; f++) {
    const prev = samples[samples.length - 1];
    const rwPrev = prev && prev.rw ? prev.rw : (prev && prev.px && !reader ? 1200 : 0);
    const dt = f === 1 ? 0 : 40 + rwPrev;
    t += dt;
    const px = f % 24 === 0;
    const s = { f, t, dt, sim: f * 0.04, mode: 'flight', run: null, e: [], ...(px ? { px: { c: 0 } } : {}) };
    if (reader) s.rw = px ? 1200 : 2;
    samples.push(s);
  }
  const longTasks = samples.filter((s) => s.px).map((s) => ({ t: s.t - 5, d: 1210, sim: s.sim, f: s.f }));
  if (gameTask) longTasks.push({ t: samples[50].t + 10, d: 600, sim: 2, f: 51 });
  return { meta: { mode: 'adventure', softwareGl: true, ...meta }, samples, events: [], longTasks, keys: [] };
}

test('reader windows come from sample.rw; old traces have none', () => {
  assert.equal(readerWindows(playTrace()).length, 100);
  assert.equal(readerWindows(playTrace({ reader: false })).length, 0);
});

test('long tasks inside a reader window are harness overhead; the game long task stays graded', () => {
  const row = checkFrameTime(playTrace());
  assert.equal(row.frame.harnessFiltered, true);
  assert.equal(row.frame.longTasks, 1, 'only the 600 ms game task is graded');
  assert.equal(row.harness_overhead.count, 4);
  assert.equal(row.harness_overhead.maxMs, 1210);
  assert.equal(row.harness_overhead.totalMs, 4840);
  assert.equal(row.frame.raw.longTasks, 5);
  assert.ok(row.frame.p99 < 100, `game p99 ${row.frame.p99}`);
  assert.ok(row.frame.raw.p99 >= 1240, `raw p99 ${row.frame.raw.p99}`);
  assert.match(row.detail, /harness reader excluded: 4 long tasks/);
});

test('a long task that is mostly game work is trimmed, not excluded', () => {
  const tr = playTrace({ gameTask: false });
  const px = tr.samples.find((s) => s.px);
  tr.longTasks = [{ t: px.t - 900, d: 2100, sim: 1, f: px.f }];
  const split = splitHarnessOverhead(tr, tr.samples.filter((s) => s.dt > 0), tr.longTasks, THRESHOLDS.longTaskMs);
  assert.equal(split.longs.length, 1);
  assert.ok(split.longs[0].d > 800 && split.longs[0].d <= 900, `remainder ${split.longs[0].d}`);
  assert.equal(split.longs[0].rawD, 2100);
  assert.equal(split.overhead.trimmedLongTasks, 1);
  assert.equal(split.overhead.count, 0);
});

test('old traces without reader windows grade exactly as before', () => {
  const row = checkFrameTime(playTrace({ reader: false }));
  assert.equal(row.frame.harnessFiltered, undefined);
  assert.equal(row.harness_overhead, undefined);
  assert.equal(row.frame.longTasks, 5);
});

test('compare: an old baseline without harness filtering is graded like-for-like on raw numbers', () => {
  const head = { overall: 'INCOMPLETE', meta: { commit: 'head' }, results: [checkFrameTime(playTrace())] };
  // Old baseline: same game, reader inside its numbers.
  const oldBase = { meta: { commit: 'old' }, results: [checkFrameTime(playTrace({ reader: false }))] };
  assert.equal(oldBase.results[0].frame.harnessFiltered, undefined);
  applyBaselineToHead(head, oldBase);
  assert.equal(head.results[0].status, 'PASS');
  assert.match(head.results[0].detail, /predates harness filtering/);
  assert.equal(compareVerdicts(oldBase, head).regressed, 0);
  // A new, filtered baseline compares filtered numbers.
  const head2 = { overall: 'INCOMPLETE', meta: { commit: 'head' }, results: [checkFrameTime(playTrace())] };
  applyBaselineToHead(head2, { meta: { commit: 'new' }, results: [checkFrameTime(playTrace())] });
  assert.equal(head2.results[0].status, 'PASS');
  assert.doesNotMatch(head2.results[0].detail, /predates/);
  assert.match(head2.results[0].detail, /harness reader excluded/);
});

test('compare: a real game regression still fails against a filtered baseline', () => {
  const slow = playTrace();
  for (const s of slow.samples) if (s.dt > 0) s.dt += 400;
  const head = { overall: 'INCOMPLETE', meta: { commit: 'head' }, results: [checkFrameTime(slow)] };
  regradeSoftwareFrameTime(head.results, checkFrameTime(playTrace()).frame, { commit: 'base' });
  assert.equal(head.results[0].status, 'FAIL');
});

test('verdict.md prints the harness overhead line', () => {
  const row = checkFrameTime(playTrace());
  const md = renderVerdict({ meta: { label: 'x', mode: 'adventure', commit: 'c', renderer: 'r', resolution: '960x540' }, results: [row], overall: 'INCOMPLETE' });
  assert.match(md, /Harness overhead \(reader tasks excluded from frame_time\): harness reader excluded: 4 long tasks \(total 4840 ms, max 1210 ms\)/);
});
