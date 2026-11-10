// scripts/lib/rendererTraceSummary.mjs — the pure half of the --trace option of probe-main-thread-profile.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findGameMainThread,
  renderTraceSummaryMarkdown,
  selfTimes,
  summarizeMainThread,
  threadSlices,
  traceEventsOf,
} from '../scripts/lib/rendererTraceSummary.mjs';

const meta = (pid, tid, name) => ({ ph: 'M', name: 'thread_name', pid, tid, args: { name } });
const slice = (pid, tid, name, ts, dur) => ({ ph: 'X', name, pid, tid, ts, dur });

const FIXTURE = [
  meta(10, 1, 'CrRendererMain'), // a helper renderer: little work
  meta(20, 2, 'CrRendererMain'), // the game window: most work
  meta(20, 3, 'Compositor'),
  slice(10, 1, 'RunTask', 0, 100),
  slice(20, 2, 'RunTask', 1000, 10_000),
  slice(20, 2, 'FunctionCall', 1100, 3000),
  slice(20, 2, 'UpdateLayoutTree', 5000, 2000),
  slice(20, 2, 'Layout', 7200, 1000),
  slice(20, 2, 'RunTask', 20_000, 5000),
  slice(20, 2, 'Paint', 20_500, 1500),
  slice(20, 3, 'RunTask', 1000, 99_999), // not the main thread: must be ignored
];

test('the game renderer is the one whose main thread did the most work', () => {
  const thread = findGameMainThread(FIXTURE);
  assert.deepEqual({ pid: thread.pid, tid: thread.tid }, { pid: 20, tid: 2 });
  assert.equal(findGameMainThread([]), null);
});

test('events come bare or wrapped, and begin/end pairs fold into one slice', () => {
  assert.equal(traceEventsOf({ traceEvents: FIXTURE }).length, FIXTURE.length);
  assert.equal(traceEventsOf(FIXTURE).length, FIXTURE.length);
  assert.deepEqual(traceEventsOf(null), []);
  const folded = threadSlices([
    { ph: 'B', name: 'Outer', pid: 1, tid: 1, ts: 100 },
    { ph: 'E', name: 'Outer', pid: 1, tid: 1, ts: 400 },
  ], 1, 1);
  assert.deepEqual(folded, [{ name: 'Outer', ts: 100, dur: 300 }]);
});

test('self time subtracts direct children and never double counts nesting', () => {
  const selves = selfTimes(threadSlices(FIXTURE, 20, 2));
  const get = (name, ts) => selves.find((s) => s.name === name && (ts == null || s.ts === ts));
  assert.equal(get('RunTask', 1000).selfUs, 10_000 - 3000 - 2000 - 1000, 'task keeps only what no child explains');
  assert.equal(get('FunctionCall').selfUs, 3000);
  assert.equal(get('RunTask', 20_000).selfUs, 5000 - 1500);
  const total = selves.reduce((sum, s) => sum + s.selfUs, 0);
  assert.equal(total, 10_000 + 5000, 'self times add up to the top-level task time, once');
});

test('windows are cut by start time and rank the non-JS work the CPU profile calls (program)', () => {
  const summary = summarizeMainThread(FIXTURE, {
    windows: [
      { id: 'first', fromUs: 0, toUs: 15_000 },
      { id: 'second', fromUs: 15_000, toUs: 30_000 },
    ],
  });
  const [first, second] = summary.windows;
  assert.equal(first.busyUs, 10_000);
  assert.equal(first.rows[0].name, '(task overhead)', 'the biggest unexplained slice ranks first');
  assert.equal(first.rows[1].name, 'FunctionCall');
  assert.equal(first.rows.find((r) => r.name === 'UpdateLayoutTree').selfUs, 2000);
  assert.equal(first.rows.find((r) => r.name === '(task overhead)').selfUs, 4000);
  assert.equal(second.busyUs, 5000);
  assert.equal(second.rows[0].name, '(task overhead)');
  assert.ok(Math.abs(first.rows.reduce((sum, r) => sum + r.share, 0) - 1) < 1e-9);
});

test('the markdown names the thread, each window, and every ranked event', () => {
  const md = renderTraceSummaryMarkdown(summarizeMainThread(FIXTURE, { windows: [{ id: 'all', fromUs: 0, toUs: 30_000 }] }));
  assert.match(md, /pid 20/);
  assert.match(md, /## all — 0\.03 s wall, 0\.01 s busy/);
  assert.match(md, /`UpdateLayoutTree`/);
  assert.match(renderTraceSummaryMarkdown({ pid: null, windows: [] }), /No CrRendererMain thread/);
});
