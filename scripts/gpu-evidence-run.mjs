#!/usr/bin/env node
// GPU evidence run — one command that produces the measurements the perf corpus's
// GATED items need (see design/perf/PERF_CORPUS_CLOSURE_2026-09-26.md §8 and
// design/perf/PERF_MASTER_PLAN_2026-09-26.md).
//
// WHY THIS EXISTS
// ---------------
// Several corpus items are gated on owner-GPU evidence because CI/dev VMs rasterize
// WebGL on SwiftShader (CPU), whose bottleneck profile is inverted vs. real hardware.
// This harness runs the repo's own probes HEADED on the machine you invoke it on,
// refuses to produce "evidence" on a software rasterizer, and collates one summary
// you can paste back (or attach) for adjudication.
//
// Usage (from repo root, on a machine with a real GPU):
//   node scripts/gpu-evidence-run.mjs                 # full run (~10-15 min)
//   node scripts/gpu-evidence-run.mjs --quick         # gpu-path + frame-solid only
//   node scripts/gpu-evidence-run.mjs --compare=<prior-frame-solid.json>
//
// Output: .devshots/gpu-evidence/<stamp>/summary.json (+ each probe's own artifacts).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUICK = process.argv.includes('--quick');
const COMPARE = (process.argv.find((a) => a.startsWith('--compare=')) || '').slice('--compare='.length) || null;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = join(ROOT, '.devshots', 'gpu-evidence', stamp);
mkdirSync(OUT_DIR, { recursive: true });

function run(label, script, args = []) {
  console.log(`\n=== ${label}: node ${script} ${args.join(' ')}`);
  const res = spawnSync(process.execPath, [join('scripts', script), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 20 * 60 * 1000,
  });
  return { label, script, exitCode: res.status, signal: res.signal || null };
}

function latest(dir, ext = '.json') {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(ext)).sort();
  return files.length ? join(dir, files[files.length - 1]) : null;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

// 1. Hardware gate — refuse to mint "evidence" on a software rasterizer.
const gpuPathOut = join(OUT_DIR, 'gpu-path.json');
run('gpu-path', 'probe-gpu-path.mjs', ['--headed', `--out=${gpuPathOut}`]);
const gpuPath = readJson(gpuPathOut);
if (!gpuPath) {
  console.error(`FAIL: gpu-path produced no report at ${gpuPathOut}`);
  process.exit(1);
}
if (!gpuPath.hardwareWebGL) {
  console.error('\nABORTED: this machine reports a SOFTWARE WebGL path.');
  console.error(`  renderer: ${gpuPath.webgl && gpuPath.webgl.unmaskedRenderer}`);
  console.error('  Re-run on a machine with a hardware GPU; SwiftShader numbers are not valid evidence.');
  process.exit(2);
}
console.log(`\nHardware GPU confirmed: ${gpuPath.webgl.unmaskedRenderer}`);

// 2. Frame-solidity + pop-in metrics (headed default).
const frameArgs = [];
if (COMPARE) frameArgs.push(`--compare=${COMPARE}`);
run('frame-solid', 'probe-frame-solid.mjs', frameArgs);
const frameSolidPath = latest(join(ROOT, '.devshots', 'frame-solid'));
const frameSolid = frameSolidPath ? readJson(frameSolidPath) : null;

// 3. Shader-compile timeline — program/link census for the progkeys residual.
const shaderOut = join(OUT_DIR, 'shader-compile-timeline.json');
if (!QUICK) run('shader-compile-timeline', 'probe-shader-compile-timeline.mjs', ['--headed', `--out=${shaderOut}`]);

// 4. renderer.info census — draw calls, triangles, memory counters, mid-flight compiles.
let rendererInfo = null;
if (!QUICK) {
  run('renderer-info', 'probe-renderer-info.mjs', ['--headful', '--duration=60']);
  const riPath = latest(join(ROOT, '.devshots', 'renderer-info'));
  rendererInfo = riPath ? readJson(riPath) : null;
}

const m = (frameSolid && frameSolid.metrics) || {};
const summary = {
  schema: 'spaceface.gpuEvidence.v1',
  generatedAt: new Date().toISOString(),
  outDir: OUT_DIR,
  machine: {
    unmaskedRenderer: gpuPath.webgl.unmaskedRenderer,
    unmaskedVendor: gpuPath.webgl.unmaskedVendor,
    gpuTier: gpuPath.gpu ? gpuPath.gpu.tier : null,
    userAgent: gpuPath.userAgent,
    viewport: gpuPath.viewport,
  },
  frameSolid: frameSolid ? { path: frameSolidPath, metrics: m } : null,
  shaderTimelinePath: QUICK ? null : shaderOut,
  rendererInfo,
  // What each gated corpus item needs out of this summary:
  gatedItems: {
    'PQ-129.12 opaque batching': 'frameSolid.metrics draw-call + state-change census (rendererCalls, programs) vs. master run',
    'PQ-129.14 tiny-LOD submit': 'frameSolid.metrics rendererTriangles/rendererCalls before vs after',
    'PERF-70 ANGLE backend': 'run again with SPACEFACE_ANGLE_BACKEND=d3d11|gl|vulkan; compare machine.unmaskedRenderer + frame p95',
    'check:perf strict 60fps p95': 'frameSolid.metrics frame p95 vs 16.7 ms on this GPU',
    'PERF-96/97 worker/WASM/WebGPU': 'frame-solid CPU-profile fields + main-thread busy share — copy-cost spike check',
  },
};
const summaryPath = join(OUT_DIR, 'summary.json');
writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');

console.log('\n=== GPU evidence summary ===');
console.log(`renderer: ${summary.machine.unmaskedRenderer}`);
if (m.missingFrames !== undefined) {
  console.log(`missingFrames=${m.missingFrames}  stuckMissing=${m.stuckMissing}  appearOnTime=${m.appearOnTimeRate}`);
  console.log(`frame p95=${m.frameP95ms ?? m.p95FrameMs ?? 'see report'}  rendererCalls=${m.rendererCalls ?? '?'}  triangles=${m.rendererTriangles ?? '?'}`);
}
console.log(`summary: ${summaryPath}`);
console.log('Paste or attach summary.json + the frame-solid report for adjudication.');
