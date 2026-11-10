/**
 * Primary KPI: DistortionField.update when live===0 && mesh.count===0.
 * Before = capacity walk (64) + 3-attr needsUpdate every tick.
 * After  = live===0 && mesh.count===0 early-out (uTime still advances).
 * Soft-GPU fps not claimed. Picture unchanged (no haze when idle).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const CAP = 64;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const CAP = ${CAP};
function make() {
  return {
    live: 0,
    meshCount: 0,
    uTime: 0,
    slots: Array.from({ length: CAP }, () => ({ alive: 0, age: 0, life: 0.12 })),
    needsUpdate: 0,
    writes: 0,
  };
}
function updateBefore(pool, dt) {
  pool.uTime += dt;
  let live = 0;
  for (let i = 0; i < pool.slots.length; i++) {
    const s = pool.slots[i];
    if (!s.alive) continue;
    s.age += dt;
    if (s.age >= s.life) { s.alive = 0; continue; }
    pool.writes++;
    live++;
  }
  pool.live = live;
  pool.meshCount = live;
  pool.needsUpdate += 3;
  return live;
}
function updateAfter(pool, dt) {
  pool.uTime += dt;
  if (!(pool.live > 0) && !(pool.meshCount > 0)) return 0;
  return updateBefore(pool, 0); // uTime already advanced
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
  needsUpdate: pool.needsUpdate, writes: pool.writes, meshCount: pool.meshCount, uTime: pool.uTime,
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
  label: 'distortion-field-quiet-live-skip',
  primary: 'quiet-distortion-live-zero-update',
  iters: ITERS,
  capacity: CAP,
  pairs,
  medianSpeedup: speeds[Math.floor(RUNS / 2)],
  minSpeedup: speeds[0],
  maxSpeedup: speeds[RUNS - 1],
  note: 'Picture unchanged: no haze when idle; uTime advances; one idle publish then skip.',
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(
  new URL('./distortion-field-quiet-live-skip-microbench.json', import.meta.url),
  JSON.stringify(result, null, 2),
);
