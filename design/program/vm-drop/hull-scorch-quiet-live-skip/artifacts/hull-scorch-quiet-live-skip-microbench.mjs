/**
 * Primary KPI: HullScorchPool.update when live===0.
 * Before = capacity walk (32) + 5-attr mark/commit(0) every tick.
 * After  = live===0 && mesh.count===0 early-out.
 * Soft-GPU fps not claimed. Picture unchanged (no marks when idle).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const CAP = 32;
const ATTRS = 5;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const CAP = ${CAP};
const ATTRS = ${ATTRS};
function make() {
  return {
    live: 0,
    meshCount: 0,
    slots: Array.from({ length: CAP }, () => ({ alive: 0, age: 0, life: 4 })),
    dirty: new Uint8Array(ATTRS),
    marks: 0,
    commits: 0,
  };
}
function updateBefore(pool, dt) {
  let live = 0;
  pool.dirty.fill(0);
  for (let i = 0; i < pool.slots.length; i++) {
    const s = pool.slots[i];
    if (!s.alive) continue;
    s.age += dt;
    if (s.age >= s.life) { s.alive = 0; continue; }
    for (let a = 0; a < ATTRS; a++) { pool.dirty[a] = 1; pool.marks++; }
    live++;
  }
  pool.live = live;
  pool.commits++;
  pool.meshCount = live;
  return live;
}
function updateAfter(pool, dt) {
  if (!(pool.live > 0) && !(pool.meshCount > 0)) return 0;
  return updateBefore(pool, dt);
}
const pool = make();
const dt = 1/60;
const fn = ${JSON.stringify(mode)} === 'before' ? updateBefore : updateAfter;
for (let i = 0; i < 3000; i++) fn(pool, dt);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(pool, dt);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, live: pool.live, mode: ${JSON.stringify(mode)},
  commits: pool.commits, marks: pool.marks, meshCount: pool.meshCount,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) throw new Error(`child failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout.trim().split('\\n').pop());
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  if (before.live !== 0 || after.live !== 0) throw new Error('live checksum fail');
  pairs.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / after.ms).toFixed(3),
  });
}
pairs.sort((a, b) => a.speedup - b.speedup);
const speeds = pairs.map((p) => p.speedup);
const result = {
  label: 'hull-scorch-quiet-live-skip',
  primary: 'quiet-hull-scorch-live-zero-update',
  iters: ITERS,
  capacity: CAP,
  pairs,
  medianSpeedup: speeds[Math.floor(RUNS / 2)],
  minSpeedup: speeds[0],
  maxSpeedup: speeds[RUNS - 1],
  note: 'Picture unchanged: no scorch marks when idle; one idle publish then skip.',
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(
  new URL('./hull-scorch-quiet-live-skip-microbench.json', import.meta.url),
  JSON.stringify(result, null, 2),
);
