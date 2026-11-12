/**
 * Primary KPI: WeaponDischargePool.update when activeCount===0.
 * Before = capacity walk (48) + batch.begin/end (assert + dirty.fill + commit(0)) every tick.
 * After  = activeCount===0 early-out (after first idle publish).
 * Soft-GPU fps not claimed. Picture unchanged (no strips when idle).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const CAP = 48;
const ATTRS = 9;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const CAP = ${CAP};
const ATTRS = ${ATTRS};
function make() {
  return {
    activeCount: 0,
    publishedIdle: false,
    time: 0,
    slots: Array.from({ length: CAP }, () => ({ alive: false, age: 0, life: 0.1 })),
    dirty: new Uint8Array(ATTRS),
    count: 0,
    meshCount: 0,
    commits: 0,
    asserts: 0,
  };
}
function updateBefore(pool, dt) {
  pool.asserts++;
  pool.count = 0;
  pool.dirty.fill(0);
  pool.time += dt;
  let live = 0;
  for (let i = 0; i < pool.slots.length; i++) {
    const s = pool.slots[i];
    if (!s.alive) continue;
    s.age += dt;
    if (s.age >= s.life) { s.alive = false; continue; }
    live++;
    pool.count++;
  }
  pool.commits++;
  pool.meshCount = pool.count;
  return live;
}
function updateAfter(pool, dt) {
  if (!(pool.activeCount > 0)) {
    if (pool.publishedIdle) return 0;
    pool.asserts++;
    pool.count = 0;
    pool.dirty.fill(0);
    pool.commits++;
    pool.meshCount = 0;
    pool.publishedIdle = true;
    return 0;
  }
  pool.publishedIdle = false;
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
  ms, active: pool.activeCount, mode: ${JSON.stringify(mode)},
  commits: pool.commits, asserts: pool.asserts, meshCount: pool.meshCount,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) throw new Error(`child failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  if (before.active !== 0 || after.active !== 0) throw new Error('active checksum fail');
  pairs.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / after.ms).toFixed(3),
  });
}
pairs.sort((a, b) => a.speedup - b.speedup);
const speeds = pairs.map((p) => p.speedup);
const result = {
  label: 'weapon-discharge-quiet-active-skip',
  primary: 'quiet-discharge-active-zero-update',
  iters: ITERS,
  capacity: CAP,
  pairs,
  medianSpeedup: speeds[Math.floor(RUNS / 2)],
  minSpeedup: speeds[0],
  maxSpeedup: speeds[RUNS - 1],
  note: 'Picture unchanged: no strips when idle; one idle publish then skip.',
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(
  new URL('./weapon-discharge-quiet-active-skip-microbench.json', import.meta.url),
  JSON.stringify(result, null, 2),
);
