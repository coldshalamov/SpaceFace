/**
 * Proxy: quiet massline swing-trace residual under prepareFrame / vfx.
 * Before = tether resolve + a11y + writeMasslineSwingTraceGeometry every idle tick
 *   (fade===0, count===0, no live latch).
 * After  = quiet latch; cheap tether.active maybe-awake; skip until wake.
 * Soft-GPU fps not claimed. Picture unchanged (mesh already hidden).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const CAPACITY = 96;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const ITERS = ${ITERS};
const CAPACITY = ${CAPACITY};

function resolveA11y(settings) {
  const video = settings && settings.video || {};
  const accessibility = settings && settings.accessibility || {};
  const flash = !!(video.flashReduce || accessibility.flashReduce);
  return { flashOpacityScale: flash ? 0.3 : 1 };
}
function writeGeometry(out, trace, opts) {
  out.indexCount = 0;
  if (!out.segmentCapacity || !trace || trace.count < 2) return out;
  const fade = opts && opts.fade;
  if (!(fade > 0)) return out;
  // Active path not modeled — quiet KPI is the idle early-out.
  out.indexCount = 6;
  return out;
}
function maybeAwake(player) {
  if (!player) return false;
  const pt = player.tether;
  if (pt && pt.active && pt.targetId != null) return true;
  const rt = player.remoteMassline;
  if (rt && rt.active && rt.sourceId != null && rt.targetId != null) return true;
  return false;
}
function resolveLive(player) {
  const pt = player && player.tether;
  const rt = player && player.remoteMassline;
  const remote = !!(rt && rt.active && rt.sourceId != null && rt.targetId != null);
  const tether = remote ? rt : pt;
  return !!(tether && tether.active && tether.targetId != null);
}
function makeHost() {
  return {
    quiet: false,
    skips: 0,
    walks: 0,
    mesh: { visible: false, material: { opacity: 0 }, geometry: { setDrawRange() {} } },
    trace: {
      capacity: CAPACITY,
      xs: new Float32Array(CAPACITY),
      zs: new Float32Array(CAPACITY),
      times: new Float32Array(CAPACITY),
      head: 0,
      count: 0,
      targetId: null,
      fade: 0,
    },
    scratch: { segmentCapacity: CAPACITY - 1, indexCount: 0 },
    settings: { video: {}, accessibility: {} },
    player: {
      tether: { active: false, targetId: null },
      remoteMassline: { active: false, sourceId: null, targetId: null },
    },
    t: 0,
  };
}
function before(h, dt) {
  h.walks++;
  const live = resolveLive(h.player);
  const trace = h.trace;
  if (live) {
    // Active path not modeled for quiet KPI.
    trace.fade = Math.min(1, trace.fade + dt * 8);
  } else {
    trace.fade = Math.max(0, trace.fade - dt * 3.5);
    if (trace.fade <= 0 && trace.count > 0) {
      trace.head = 0; trace.count = 0; trace.targetId = null; trace.fade = 0;
    }
  }
  const a11y = resolveA11y(h.settings);
  writeGeometry(h.scratch, trace, {
    nowS: h.t,
    fade: trace.fade * a11y.flashOpacityScale,
  });
  if (!(h.scratch.indexCount > 0)) {
    if (h.mesh.visible) {
      h.mesh.visible = false;
      h.mesh.material.opacity = 0;
    }
  }
  h.t += dt;
}
function after(h, dt) {
  if (h.quiet && !maybeAwake(h.player)) { h.skips++; return; }
  if (h.quiet) h.quiet = false;
  h.walks++;
  const live = resolveLive(h.player);
  const trace = h.trace;
  if (live) {
    trace.fade = Math.min(1, trace.fade + dt * 8);
  } else {
    trace.fade = Math.max(0, trace.fade - dt * 3.5);
    if (trace.fade <= 0 && trace.count > 0) {
      trace.head = 0; trace.count = 0; trace.targetId = null; trace.fade = 0;
    }
  }
  const a11y = resolveA11y(h.settings);
  writeGeometry(h.scratch, trace, {
    nowS: h.t,
    fade: trace.fade * a11y.flashOpacityScale,
  });
  if (!(h.scratch.indexCount > 0)) {
    if (h.mesh.visible) {
      h.mesh.visible = false;
      h.mesh.material.opacity = 0;
    }
    if (!(trace.fade > 0) && !(trace.count > 0) && !maybeAwake(h.player)) {
      h.quiet = true;
    }
  } else {
    h.quiet = false;
  }
  h.t += dt;
}
const mode = ${JSON.stringify(mode)};
const h = makeHost();
const dt = 1 / 60;
// Prime: latch for after mode
for (let i = 0; i < 4; i++) (mode === 'after' ? after : before)(h, dt);
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) (mode === 'after' ? after : before)(h, dt);
const ms = performance.now() - t0;
// Dirty-wake proof (after only)
let wakeOk = true;
if (mode === 'after') {
  if (!h.quiet) wakeOk = false;
  h.player.tether = { active: true, targetId: 42 };
  after(h, dt);
  if (h.quiet) wakeOk = false;
  // Clear tether and drain to re-latch
  h.player.tether = { active: false, targetId: null };
  h.trace.fade = 0; h.trace.count = 0;
  for (let i = 0; i < 4; i++) after(h, dt);
  if (!h.quiet) wakeOk = false;
}
console.log(JSON.stringify({
  mode, ms, walks: h.walks, skips: h.skips, quiet: h.quiet, wakeOk,
  nsPerOp: (ms * 1e6) / ITERS,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`run failed (${mode}): ${r.stderr || r.stdout}`);
  }
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  const m = (a.length - 1) >> 1;
  return a.length % 2 ? a[m] : (a[m] + a[m + 1]) / 2;
}

const beforeRuns = [];
const afterRuns = [];
const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = runOnce('before');
  const a = runOnce('after');
  beforeRuns.push(b);
  afterRuns.push(a);
  pairs.push({
    i,
    beforeMs: b.ms,
    afterMs: a.ms,
    speedup: b.ms / a.ms,
    wakeOk: a.wakeOk,
    afterSkips: a.skips,
  });
}
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'swing-trace-quiet-idle-skip',
  iters: ITERS,
  runs: RUNS,
  capacity: CAPACITY,
  medianSpeedup: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
  medianBeforeMs: median(beforeRuns.map((r) => r.ms)),
  medianAfterMs: median(afterRuns.map((r) => r.ms)),
  dirtyWakeOk: afterRuns.every((r) => r.wakeOk === true),
  pairs,
};
writeFileSync(
  `${ROOT}/artifacts/swing-trace-quiet-idle-skip-microbench.json`,
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify({
  medianSpeedup: out.medianSpeedup,
  minSpeedup: out.minSpeedup,
  maxSpeedup: out.maxSpeedup,
  dirtyWakeOk: out.dirtyWakeOk,
  medianBeforeMs: out.medianBeforeMs,
  medianAfterMs: out.medianAfterMs,
}, null, 2));
