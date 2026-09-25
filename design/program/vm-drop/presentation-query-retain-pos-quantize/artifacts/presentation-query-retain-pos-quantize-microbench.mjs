/**
 * Primary KPI: presentationQueries.query under quiet chase drift (dirtyCount===0,
 * focus/origin creep ≪ glass). Before = retain-key quantize OFF (bit-identical —
 * misses every frame). After = 0.25 WU retain-key quantize ON — hits within a cell.
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import {
  createPresentationQueries,
  setPresentationQueryZeroDirtyRetainForBench,
  setPresentationQueryRetainPosQuantizeForBench,
} from '../src/render/presentationQueries.js';

const __filename = fileURLToPath(import.meta.url);

function entity(id, x, z, type = 'asteroid') {
  return {
    id,
    type,
    alive: true,
    pos: { x, y: 0, z },
    prevPos: { x, y: 0, z },
    rot: 0,
    prevRot: 0,
    bank: 0,
    prevBank: 0,
    pitch: 0,
    prevPitch: 0,
    radius: type === 'ship' ? 8 : 6,
    flags: {},
    presentationVisualRevision: 0,
  };
}

function seed(n, ships = 12) {
  const world = createPresentationWorld({ capacity: Math.max(64, n + 8), cellSize: 128 });
  for (let i = 0; i < n; i++) {
    const type = i < ships ? 'ship' : 'asteroid';
    const e = entity(
      i + 1,
      ((i % 24) - 12) * 55,
      (Math.floor(i / 24) - 6) * 55,
      type,
    );
    const handle = world.allocateEntity(e, 0);
    const mesh = { userData: {}, position: { x: e.pos.x, y: 0, z: e.pos.z } };
    world.bindMesh(handle, mesh, e, e.radius);
  }
  const active = world.getDiagnostics().active;
  for (let a = 0; a < active; a++) world.clearDirty(world.activeSlots[a]);
  return world;
}

function clearAllDirty(world) {
  const active = world.getDiagnostics().active;
  for (let a = 0; a < active; a++) world.clearDirty(world.activeSlots[a]);
}

function runTimed(quantizeOn, n, iters) {
  setPresentationQueryZeroDirtyRetainForBench(true);
  setPresentationQueryRetainPosQuantizeForBench(quantizeOn);
  const world = seed(n);
  const queries = createPresentationQueries(world);
  const bounds = { x: 0, z: 0, halfX: 420, halfZ: 320 };
  const origin = { x: 0, z: 0 };
  const opts = { bounds, origin, playerId: 1 };

  for (let i = 0; i < 32; i++) {
    clearAllDirty(world);
    queries.query(opts);
  }

  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) {
    clearAllDirty(world);
    // Quiet chase drift well under the 0.25 WU cell.
    bounds.x = (i * 0.011) % 0.24;
    bounds.z = (i * 0.007) % 0.24;
    origin.x = (i * 0.003) % 0.24;
    origin.z = (i * 0.005) % 0.24;
    const r = queries.query(opts);
    sink += r.visibleCount + r.candidateCount + r.hiddenCount;
  }
  const ms = performance.now() - t0;
  return { ms, sink, dirtyCount: world.dirtyCount, n };
}

if (process.argv[2] === 'child') {
  const quantizeOn = process.argv[3] === '1';
  const n = Number(process.argv[4] || 180);
  const iters = Number(process.argv[5] || 20000);
  const result = runTimed(quantizeOn, n, iters);
  process.stdout.write(`${JSON.stringify({ quantizeOn, ...result })}\n`);
  process.exit(0);
}

function isolated(quantizeOn, n, iters) {
  const r = spawnSync(
    process.execPath,
    [__filename, 'child', quantizeOn ? '1' : '0', String(n), String(iters)],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'child failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const N = 180;
const ITERS = 20000;
const PAIR_RUNS = 9;
const pairs = [];

for (let i = 0; i < PAIR_RUNS; i++) {
  const before = isolated(false, N, ITERS);
  const after = isolated(true, N, ITERS);
  const speedup = after.ms > 0 ? before.ms / after.ms : 0;
  pairs.push({ beforeMs: before.ms, afterMs: after.ms, speedup, beforeSink: before.sink, afterSink: after.sink });
  console.log(`pair ${i}: ${speedup.toFixed(3)}×  ${before.ms.toFixed(1)}ms → ${after.ms.toFixed(1)}ms`);
}

const speedups = pairs.map((p) => p.speedup).sort((a, b) => a - b);
const med = speedups[Math.floor(speedups.length / 2)];
const floor = speedups[0];
const out = {
  label: 'presentation-query-retain-pos-quantize',
  n: N,
  iters: ITERS,
  driftPerStep: 0.011,
  quantWu: 0.25,
  pairRuns: PAIR_RUNS,
  medianSpeedup: med,
  floorMinSpeedup: floor,
  pairs,
  primary: `~${med.toFixed(2)}×`,
  ship_bar: 1.5,
  clears_bar: med >= 1.5 && floor >= 1.5,
};
writeFileSync(
  new URL('./presentation-query-retain-pos-quantize-microbench.json', import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(JSON.stringify({ medianSpeedup: med, floorMinSpeedup: floor, clears_bar: out.clears_bar }, null, 2));
