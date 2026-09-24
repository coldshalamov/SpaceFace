/**
 * Primary KPI: presentationQueries.query residual under syncEntityViews / prepareFrame.
 * Quiet settled: dirtyCount===0, identical cull rect + origin → retain visible set
 * (skip spatial collect / sort / exactVisible / hidden diff).
 * Before = retain off; after = retain on. Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import {
  createPresentationQueries,
  setPresentationQueryZeroDirtyRetainForBench,
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
  const entities = [];
  for (let i = 0; i < n; i++) {
    const type = i < ships ? 'ship' : 'asteroid';
    const e = entity(
      i + 1,
      ((i % 24) - 12) * 55,
      (Math.floor(i / 24) - 6) * 55,
      type,
    );
    entities.push(e);
    const handle = world.allocateEntity(e, 0);
    const mesh = { userData: {}, position: { x: e.pos.x, y: 0, z: e.pos.z } };
    world.bindMesh(handle, mesh, e, e.radius);
  }
  // Clear allocate/bind dirty so the quiet settled KPI starts at dirtyCount===0.
  const active = world.getDiagnostics().active;
  for (let a = 0; a < active; a++) world.clearDirty(world.activeSlots[a]);
  return { world, entities };
}

function clearAllDirty(world) {
  const active = world.getDiagnostics().active;
  for (let a = 0; a < active; a++) world.clearDirty(world.activeSlots[a]);
}

function runTimed(retainOn, n, iters, scenario) {
  setPresentationQueryZeroDirtyRetainForBench(retainOn);
  const { world, entities } = seed(n);
  const queries = createPresentationQueries(world);
  const bounds = { x: 0, z: 0, halfX: 420, halfZ: 320 };
  const origin = { x: 0, z: 0 };
  const playerId = 1;
  const opts = { bounds, origin, playerId };

  // Warm + prime retain cache.
  for (let i = 0; i < 32; i++) {
    clearAllDirty(world);
    queries.query(opts);
  }

  let sink = 0;
  const t0 = performance.now();
  if (scenario === 'settled') {
    for (let i = 0; i < iters; i++) {
      clearAllDirty(world);
      const r = queries.query(opts);
      sink += r.visibleCount + r.candidateCount + r.hiddenCount;
    }
  } else {
    // Moving camera — retain should miss (bounds change every call).
    for (let i = 0; i < iters; i++) {
      clearAllDirty(world);
      bounds.x = Math.sin(i * 0.01) * 3;
      bounds.z = Math.cos(i * 0.01) * 3;
      const r = queries.query(opts);
      sink += r.visibleCount + r.candidateCount;
    }
  }
  const ms = performance.now() - t0;
  const diag = queries.getDiagnostics();
  return {
    ms,
    sink,
    queries: diag.queries,
    visible: diag.visible,
    candidates: diag.candidates,
    dirtyCount: world.dirtyCount,
    layoutVersion: world.layoutVersion,
    n,
    entities: entities.length,
  };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

if (process.argv[2] === 'child') {
  const retainOn = process.argv[3] === '1';
  const scenario = process.argv[4] || 'settled';
  const n = Number(process.argv[5] || 180);
  const iters = Number(process.argv[6] || 20000);
  const result = runTimed(retainOn, n, iters, scenario);
  process.stdout.write(`${JSON.stringify({ retainOn, scenario, ...result })}\n`);
  process.exit(0);
}

function isolated(retainOn, scenario, n, iters) {
  const r = spawnSync(
    process.execPath,
    [__filename, 'child', retainOn ? '1' : '0', scenario, String(n), String(iters)],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'child failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const N = 180;
const ITERS = 20000;
const PAIR_RUNS = 7;
const settledPairs = [];
const movingPairs = [];

for (let i = 0; i < PAIR_RUNS; i++) {
  const before = isolated(false, 'settled', N, ITERS);
  const after = isolated(true, 'settled', N, ITERS);
  settledPairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: after.ms > 0 ? before.ms / after.ms : 0,
    beforeVisible: before.visible,
    afterVisible: after.visible,
    beforeCandidates: before.candidates,
    afterCandidates: after.candidates,
  });
}

for (let i = 0; i < 3; i++) {
  const before = isolated(false, 'moving', N, Math.floor(ITERS / 2));
  const after = isolated(true, 'moving', N, Math.floor(ITERS / 2));
  movingPairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: after.ms > 0 ? before.ms / after.ms : 0,
  });
}

const settledSpeedups = settledPairs.map((p) => p.speedup);
const out = {
  label: 'presentation-query-zero-dirty-retain',
  n: N,
  iters: ITERS,
  settled: {
    pairs: settledPairs,
    medianSpeedup: median(settledSpeedups),
    minSpeedup: Math.min(...settledSpeedups),
    maxSpeedup: Math.max(...settledSpeedups),
    medianBeforeMs: median(settledPairs.map((p) => p.beforeMs)),
    medianAfterMs: median(settledPairs.map((p) => p.afterMs)),
  },
  movingInformational: {
    pairs: movingPairs,
    medianSpeedup: median(movingPairs.map((p) => p.speedup)),
  },
};
writeFileSync(
  new URL('./presentation-query-zero-dirty-retain-microbench.json', import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(JSON.stringify(out, null, 2));
