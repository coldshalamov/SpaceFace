/**
 * Primary KPI: ArcadeStructuralFx / StructuralPool quiet update when live===0.
 * Before = capacity scan of all 272 slots (alive check) every tick.
 * After  = early-out when live===0 (and composite gate when all pools idle).
 * Soft-GPU fps not claimed. Picture unchanged (mesh.visible already live-gated).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const ROOT = process.cwd();
const ITERS = 100000;
const RUNS = 11;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const CAP = { blades: 128, arcs: 48, shards: 64, plates: 32 };
function makePool(n) {
  return { capacity: n, live: 0, slots: Array.from({ length: n }, () => ({ alive: false, age: 0 })) };
}
function updateBefore(pool, dt) {
  const step = Math.max(0, Math.min(0.05, dt));
  for (let i = 0; i < pool.capacity; i++) {
    const slot = pool.slots[i];
    if (!slot.alive) continue;
    slot.age += step;
  }
}
function updateAfter(pool, dt) {
  if (!(pool.live > 0)) return;
  updateBefore(pool, dt);
}
function makeFx() {
  return {
    blades: makePool(CAP.blades),
    arcs: makePool(CAP.arcs),
    shards: makePool(CAP.shards),
    plates: makePool(CAP.plates),
  };
}
function fxBefore(fx, dt) {
  updateBefore(fx.blades, dt); updateBefore(fx.arcs, dt);
  updateBefore(fx.shards, dt); updateBefore(fx.plates, dt);
}
function fxAfter(fx, dt) {
  if (!(fx.blades.live > 0 || fx.arcs.live > 0 || fx.shards.live > 0 || fx.plates.live > 0)) return;
  updateAfter(fx.blades, dt); updateAfter(fx.arcs, dt);
  updateAfter(fx.shards, dt); updateAfter(fx.plates, dt);
}
const fx = makeFx();
const dt = 1/60;
const fn = ${JSON.stringify(mode)} === 'before' ? fxBefore : fxAfter;
for (let i = 0; i < 3000; i++) fn(fx, dt);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(fx, dt);
const ms = performance.now() - t0;
// checksum: quiet path must leave live at 0
let live = fx.blades.live + fx.arcs.live + fx.shards.live + fx.plates.live;
console.log(JSON.stringify({ ms, live, mode: ${JSON.stringify(mode)} }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`child failed: ${r.stderr || r.stdout}`);
  }
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  if (before.live !== 0 || after.live !== 0) throw new Error('live checksum fail');
  const speedup = before.ms / after.ms;
  pairs.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +speedup.toFixed(3),
  });
}
pairs.sort((a, b) => a.speedup - b.speedup);
const speeds = pairs.map((p) => p.speedup);
const result = {
  label: 'arcade-structural-fx-quiet-live-skip',
  primary: 'quiet-four-pool-live-zero-update',
  iters: ITERS,
  capacity: { blades: 128, arcs: 48, shards: 64, plates: 32 },
  pairs,
  medianSpeedup: speeds[Math.floor(RUNS / 2)],
  minSpeedup: speeds[0],
  maxSpeedup: speeds[RUNS - 1],
  note: 'Picture unchanged: mesh.visible already gated on live>0.',
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(
  new URL('./arcade-structural-fx-quiet-live-skip-microbench.json', import.meta.url),
  JSON.stringify(result, null, 2),
);
