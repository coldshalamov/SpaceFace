/**
 * Probe: quiet docking cradle residual under prepareFrame / vfx.
 * Before = proxy scan + updateDockingCradle + writeGeometry early + a11y every tick
 *   after fade-out (visible01≈0, phase none).
 * After  = quiet latch; cheap phase/berth maybe-awake; skip until wake.
 * Soft-GPU fps not claimed. Picture unchanged (mesh already hidden).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const PROXY_N = 12;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const ITERS = ${ITERS};
const PROXY_N = ${PROXY_N};
const FADE_S = 0.28;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
}
function updateCradle(cradle, dt, readout, proxy) {
  const phase = readout && readout.phase || 'none';
  const engaged = phase !== 'none' && phase !== 'approach' && !!(readout && readout.berth);
  const preview = phase === 'approach' && !!(readout && readout.berth);
  const target = engaged ? 1 : preview ? 0.38 : 0;
  const step = dt > 0 ? dt / FADE_S : 1;
  cradle.visible01 += clamp(target - cradle.visible01, -step, step);
  cradle.phase = phase;
  if (readout && readout.berth) {
    cradle.berthX = readout.berth.x;
    cradle.berthZ = readout.berth.z;
  }
  if (proxy) {
    cradle.axisX = Math.cos(proxy.rot || 0);
    cradle.axisZ = Math.sin(proxy.rot || 0);
    cradle.radius = clamp((proxy.lane || 8) * 1.7, 6, 40);
  }
  cradle.pulseT += Math.max(0, dt);
  return cradle;
}
function writeGeometry(out, cradle) {
  out.indexCount = 0;
  if (!cradle || !(cradle.visible01 > 0.004)) return out;
  // Active path not modeled — quiet KPI is the idle early-out.
  out.indexCount = 6;
  return out;
}
function resolveA11y(settings) {
  const video = settings && settings.video;
  return { flashOpacityScale: video && video.flashReduce ? 0.3 : 1 };
}
function maybeAwake(readout) {
  if (!readout) return false;
  const phase = readout.phase || 'none';
  if (phase === 'none') return false;
  return !!(readout.berth);
}
function findProxy(readout, rows) {
  if (!readout || (readout.stationId == null && readout.proxyId == null) || !rows) return null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (readout.stationId != null && row.stationId === readout.stationId) return row;
    if (readout.stationId == null && readout.proxyId != null && row.proxyId === readout.proxyId) return row;
  }
  return null;
}
function makeHost() {
  const rows = [];
  for (let i = 0; i < PROXY_N; i++) {
    rows.push({ stationId: 100 + i, proxyId: 200 + i, rot: 0.1 * i, lane: 8 });
  }
  return {
    cradle: { visible01: 0, phase: 'none', berthX: 0, berthZ: 0, axisX: 1, axisZ: 0, radius: 14, pulseT: 0 },
    scratch: { indexCount: 0 },
    mesh: { visible: false, material: { opacity: 0 }, geometry: { setDrawRange() {} } },
    quiet: false,
    skips: 0,
    walks: 0,
    rows,
    settings: { video: { motionReduce: false, flashReduce: false } },
    readout: { phase: 'none', berth: null, stationId: null, proxyId: null },
  };
}
function before(h, dt) {
  h.walks++;
  const proxy = findProxy(h.readout, h.rows);
  updateCradle(h.cradle, dt, h.readout, proxy);
  const a11y = resolveA11y(h.settings);
  writeGeometry(h.scratch, h.cradle);
  if (!(h.scratch.indexCount > 0)) {
    if (h.mesh.visible) {
      h.mesh.visible = false;
      h.mesh.material.opacity = 0;
    }
  }
  void a11y;
}
function after(h, dt) {
  if (h.quiet && !maybeAwake(h.readout)) { h.skips++; return; }
  if (h.quiet) h.quiet = false;
  h.walks++;
  const proxy = findProxy(h.readout, h.rows);
  updateCradle(h.cradle, dt, h.readout, proxy);
  const a11y = resolveA11y(h.settings);
  writeGeometry(h.scratch, h.cradle);
  if (!(h.scratch.indexCount > 0)) {
    if (h.mesh.visible) {
      h.mesh.visible = false;
      h.mesh.material.opacity = 0;
    }
    if (h.cradle.visible01 <= 0.004 && !maybeAwake(h.readout)) h.quiet = true;
  }
  void a11y;
}
const mode = ${JSON.stringify(mode)};
const h = makeHost();
const dt = 1 / 60;
// Prime: one idle walk so after latches.
after(h, dt);
if (mode === 'after' && !h.quiet) throw new Error('failed to latch');
const fn = mode === 'before' ? before : after;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) fn(h, dt);
const ms = performance.now() - t0;
console.log(JSON.stringify({ mode, ms, walks: h.walks, skips: h.skips, quiet: h.quiet }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`child failed (${mode}): ${r.stderr || r.stdout}`);
  }
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function dirtyWakeProof() {
  const script = `
import { performance } from 'node:perf_hooks';
function maybeAwake(readout) {
  if (!readout) return false;
  const phase = readout.phase || 'none';
  if (phase === 'none') return false;
  return !!(readout.berth);
}
const readout = { phase: 'none', berth: null };
let quiet = true;
let woke = false;
// Quiet: no wake
if (quiet && !maybeAwake(readout)) { /* skip */ } else { woke = true; }
const quietHeld = quiet && !woke;
// Engage approach with berth
readout.phase = 'approach';
readout.berth = { x: 10, z: 20 };
if (quiet && !maybeAwake(readout)) { /* skip */ } else { quiet = false; woke = true; }
console.log(JSON.stringify({ ok: quietHeld && woke && quiet === false }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`wake proof failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: before.ms / after.ms,
    beforeWalks: before.walks,
    afterWalks: after.walks,
    afterSkips: after.skips,
  });
}
const speedups = pairs.map((p) => p.speedup).sort((a, b) => a - b);
const median = speedups[Math.floor(speedups.length / 2)];
const minSpeedup = speedups[0];
const wake = dirtyWakeProof();
const out = {
  name: 'docking-cradle-quiet-skip',
  primary: 'quiet-docking-cradle-idle-latch',
  iterations: ITERS,
  runs: RUNS,
  proxyN: PROXY_N,
  pairs,
  median,
  minSpeedup,
  dirtyWake: wake,
};
writeFileSync('artifacts/docking-cradle-quiet-skip-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  median: Number(median.toFixed(3)),
  minSpeedup: Number(minSpeedup.toFixed(3)),
  dirtyWake: wake,
  sample: pairs[0],
}, null, 2));
