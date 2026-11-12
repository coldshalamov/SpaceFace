// Harness-process freezes vs a real sim stall. No browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFrameTime, checkSimStalled, overall } from '../scripts/player-truth/checks.mjs';
import { createPlayWatch } from '../scripts/player-truth/playWatch.mjs';
import { renderVerdict } from '../scripts/player-truth/verdict.mjs';
import {
  HARNESS_FREEZE_MS, createFreezeWatch, hostPressureCovering, isHostPressureLine,
  overlappingHarnessFreezes, parseHostPressureLines,
} from '../scripts/player-truth/freezeWatch.mjs';
import { dmesgStampMs } from '../scripts/player-truth/browser.mjs';

const PUFF_0411 = '[Tue Oct 13 04:11:20 2026] virtio_balloon virtio0: Out of puff! Can\'t get 1 pages';
const PUFF_0512 = '[Tue Oct 13 05:12:42 2026] virtio_balloon virtio0: Out of puff! Can\'t get 1 pages';
const PUFF_0523 = '[Tue Oct 13 05:23:02 2026] virtio_balloon virtio0: Out of puff! Can\'t get 1 pages';
const HUNG = '[Tue Oct 13 05:22:10 2026] INFO: task chrome-headless:1234 blocked for more than 122 seconds.';
const OOM = '[Tue Oct 13 05:12:50 2026] Out of memory: Killed process 42 (chrome) total-vm:1000kB, anon-rss:1000kB, file-rss:0kB, shmem-rss:0kB, UID:1000 pgtables:1kB oom_score_adj:0';
const INVOKED = '[Tue Oct 13 05:12:57 2026] chrome-headless invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0';

const flight = (wall, sim, extra = {}) => ({ wall, sim, t: wall, phase: 'active', mode: 'flight', top: null, boot: false, ...extra });

function watchPair(start, end, sim0 = 10, sim1 = 10.1) {
  const watch = createPlayWatch();
  watch.observe(flight(start, sim0));
  const hit = watch.observe(flight(end, sim1));
  return { watch, hit };
}

test('the 1s timer records only a monotonic gap of at least 20s', () => {
  let wall = 0;
  let mono = 0;
  let cb = null;
  const watch = createFreezeWatch({
    now: () => wall,
    mono: () => mono,
    schedule(fn) { cb = fn; return { unref() {} }; },
    clear() { cb = null; },
  });
  watch.start();
  wall = 1_000; mono = 1_000; cb();
  assert.deepEqual(watch.snapshot(), []);
  wall = 1_000 + HARNESS_FREEZE_MS - 1; mono = 1_000 + HARNESS_FREEZE_MS - 1; cb();
  assert.deepEqual(watch.snapshot(), []);
  const before = wall;
  wall += HARNESS_FREEZE_MS; mono += HARNESS_FREEZE_MS; cb();
  const rows = watch.snapshot();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].lagMs, HARNESS_FREEZE_MS);
  assert.equal(rows[0].startWall, before);
  assert.equal(rows[0].endWall, wall);

  let late = null;
  const jumped = createFreezeWatch({
    now: () => wall,
    mono: () => mono,
    schedule(fn) { late = fn; return { unref() {} }; },
    clear() { late = null; },
  });
  wall = 50_000; mono = 50_000;
  jumped.start();
  wall = 75_000; mono = 75_000;
  jumped.stop();
  assert.equal(late, null);
  const gap = jumped.snapshot();
  assert.equal(gap.length, 1);
  assert.equal(gap[0].startWall, 50_000);
  assert.equal(gap[0].endWall, 75_000);
  assert.equal(gap[0].lagMs, 25_000);
  jumped.stop();
  assert.equal(jumped.snapshot().length, 1);
});

test('balloon and hung-task lines in the run window are kept, oom lines are not', () => {
  assert.equal(isHostPressureLine(PUFF_0512), true);
  assert.equal(isHostPressureLine(HUNG), true);
  assert.equal(isHostPressureLine('[Tue Oct 13 05:22:10 2026] hung_task: blocked tasks'), true);
  assert.equal(isHostPressureLine(OOM), false);
  assert.equal(isHostPressureLine(INVOKED), false);
  const since = Date.parse('Tue Oct 13 05:00:00 2026');
  const lines = parseHostPressureLines([PUFF_0411, PUFF_0512, PUFF_0523, HUNG, OOM, INVOKED, '[  10.0] virtio_balloon virtio0: Out of puff! Can\'t get 1 pages'].join('\n'), since);
  assert.deepEqual(lines, [PUFF_0512, PUFF_0523, HUNG]);
});

test('a sim stall while the harness clock kept ticking stays FAIL, even if the host ballooned earlier', () => {
  const stamp = dmesgStampMs(PUFF_0512);
  const { watch, hit } = watchPair(stamp - 60_000, stamp);
  assert.equal(hit.kind, 'stall');
  assert.equal(hit.wallStart, stamp - 60_000);
  assert.equal(hit.wallEnd, stamp);
  const trace = {
    meta: {
      playStartSim: 1,
      harnessFreezes: [{ startWall: stamp + 120_000, endWall: stamp + 150_000, lagMs: 30_000 }],
      hostPressure: [PUFF_0512],
    },
    playWatch: watch.snapshot(),
  };
  const row = checkSimStalled(trace);
  assert.equal(row.status, 'FAIL');
  assert.match(row.value, /0\.10 s \/ 60 s wall/);
  assert.doesNotMatch(row.detail, /harness clock frozen/);
  assert.equal(overall([row, { status: 'PASS', id: 'route' }]), 'FAIL');
});

test('a sim stall that overlaps a harness freeze is ENVIRONMENT and keeps the measurement', () => {
  const stamp = dmesgStampMs(PUFF_0512);
  const { watch } = watchPair(stamp - 30_000, stamp + 538_000, 12, 12);
  const freeze = { startWall: stamp - 1_000, endWall: stamp + 567_000, lagMs: 568_000 };
  const trace = {
    meta: { playStartSim: 1, harnessFreezes: [freeze], hostPressure: [PUFF_0512, PUFF_0523, OOM] },
    playWatch: watch.snapshot(),
  };
  const row = checkSimStalled(trace);
  assert.equal(row.status, 'ENVIRONMENT');
  assert.match(row.value, /0\.00 s \/ 568 s wall/);
  assert.match(row.threshold, /≥0\.5 s sim per 60 s wall/);
  assert.match(row.detail, /harness clock frozen 568 s/);
  assert.match(row.detail, new RegExp(new Date(freeze.startWall).toISOString().replace(/[.]/g, '\\.')));
  assert.match(row.detail, /host pressure: \[Tue Oct 13 05:12:42 2026\] virtio_balloon/);
  assert.doesNotMatch(row.detail, /Out of memory/);
  assert.equal(overall([row, { status: 'FAIL', id: 'readability' }]), 'FAIL');
  const outside = hostPressureCovering([PUFF_0411], { start: freeze.startWall, end: freeze.endWall }, [freeze]);
  assert.deepEqual(outside, []);
  const md = renderVerdict({
    meta: { label: 'swarm', mode: 'swarm', seed: 4242, ...trace.meta, stopReason: 'play interrupted' },
    results: [row], overall: 'ENVIRONMENT', paths: {},
  });
  assert.match(md, /Harness clock freezes \(≥20 s\): 568 s/);
  assert.match(md, /Host pressure \(dmesg, run window\): 3 line/);
  assert.match(md, /sim_stalled \| \*\*ENVIRONMENT\*\*/);
});

test('a stall with no wall stamps is not upgraded, and frame_time thresholds stay', () => {
  const stamp = dmesgStampMs(PUFF_0512);
  const trace = {
    meta: {
      playStartSim: 1,
      harnessFreezes: [{ startWall: stamp, endWall: stamp + 30_000, lagMs: 30_000 }],
      hostPressure: [PUFF_0512],
    },
    playWatch: {
      watched: true,
      simAdvanced: 0,
      wallMs: 568_000,
      interrupts: [{ kind: 'stall', simAdvanced: 0, wallMs: 568_000, top: null, sim: 10, t: stamp, lastInput: null, lastClick: null }],
    },
  };
  const row = checkSimStalled(trace);
  assert.equal(row.status, 'FAIL');
  assert.equal(overlappingHarnessFreezes(trace.playWatch.interrupts[0], trace.meta.harnessFreezes).length, 0);

  const samples = [];
  for (let i = 0; i < 12; i++) samples.push({ f: i, t: i * 100, dt: 16, sim: 10 + i * 0.1, mode: 'flight', run: { ph: 'active', w: 1 }, vw: 960, vh: 540, p: {}, e: [] });
  const calm = checkFrameTime({ meta: { mode: 'swarm', rounds: true }, samples, events: [], longTasks: [], keys: [] });
  assert.equal(calm.status, 'PASS');
  const slow = checkFrameTime({
    meta: { mode: 'swarm', rounds: true },
    samples: samples.map((s) => ({ ...s, dt: 80 })),
    events: [],
    longTasks: [{ t: 200, d: 338, sim: 10.2, f: 2 }],
    keys: [],
  });
  assert.equal(slow.status, 'FAIL');
  assert.match(slow.value, /long tasks ≥250 ms/);
  assert.match(slow.threshold, /p99 ≤50 ms/);
});
