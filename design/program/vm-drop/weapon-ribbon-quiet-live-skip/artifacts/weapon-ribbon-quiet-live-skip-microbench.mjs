/**
 * Primary KPI: WeaponRibbonPool.update when live===0.
 * Before = capacity linger walk (256) + _writeVertices cleared-slot scan every tick.
 * After  = live===0 early-out.
 * Soft-GPU fps not claimed. Picture unchanged (no wakes when idle).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const CAP = 256;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const CAP = ${CAP};
function make() {
  return {
    live: 0,
    alive: new Uint8Array(CAP),
    cleared: new Uint8Array(CAP),
    lingerAge: new Float32Array(CAP),
    linger: new Float32Array(CAP),
    walks: 0,
    writes: 0,
  };
}
make().cleared.fill(1);
function updateBefore(pool, dt) {
  pool.walks++;
  for (let i = 0; i < CAP; i++) {
    if (!pool.alive[i]) continue;
    if (pool.lingerAge[i] > 0) {
      pool.lingerAge[i] += dt;
      if (pool.lingerAge[i] >= pool.linger[i]) {
        pool.alive[i] = 0;
        pool.live = Math.max(0, pool.live - 1);
      }
    }
  }
  // _writeVertices cleared-slot scan
  let live = 0;
  for (let i = 0; i < CAP; i++) {
    if (!pool.alive[i]) {
      if (pool.cleared[i]) continue;
      pool.cleared[i] = 1;
      pool.writes++;
      continue;
    }
    live++;
    pool.writes++;
  }
  pool.live = live;
  return live;
}
function updateAfter(pool, dt) {
  if (!(pool.live > 0)) return 0;
  return updateBefore(pool, dt);
}
const pool = make();
pool.cleared.fill(1);
const dt = 1/60;
const fn = ${JSON.stringify(mode)} === 'before' ? updateBefore : updateAfter;
for (let i = 0; i < 3000; i++) fn(pool, dt);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(pool, dt);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, live: pool.live, mode: ${JSON.stringify(mode)},
  walks: pool.walks, writes: pool.writes,
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
  label: 'weapon-ribbon-quiet-live-skip',
  primary: 'quiet-weapon-ribbon-live-zero-update',
  iters: ITERS,
  capacity: CAP,
  pairs,
  medianSpeedup: speeds[Math.floor(RUNS / 2)],
  minSpeedup: speeds[0],
  maxSpeedup: speeds[RUNS - 1],
  note: 'Picture unchanged: no wakes when idle; last-retire frame still clears alphas.',
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(
  new URL('./weapon-ribbon-quiet-live-skip-microbench.json', import.meta.url),
  JSON.stringify(result, null, 2),
);
