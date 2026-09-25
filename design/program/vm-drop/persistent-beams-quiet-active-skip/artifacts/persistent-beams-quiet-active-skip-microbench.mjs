/**
 * Primary KPI: PersistentCombatBeamPool.update when activeCount===0.
 * Before = capacity walk (prod 16) + shader uniform writes every tick.
 * After  = activeCount===0 early-out (group.visible already false).
 * Soft-GPU fps not claimed. Picture unchanged.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 300000;
const RUNS = 11;
const CAP = 16;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const CAP = ${CAP};
function make() {
  return {
    activeCount: 0,
    group: { visible: false },
    _beamShaderShared: { time: { value: 0 }, pulse: { value: 1 } },
    _entries: Array.from({ length: CAP }, (_, slot) => ({
      slot, active: false, lastSeen: -Infinity, ownerId: null,
      fromX: 0, fromZ: 0, toX: 0, toZ: 0, y: 0.35, widthMul: 1, bornAt: -Infinity,
    })),
    _localA: { x: 0, z: 0 },
    _localB: { x: 0, z: 0 },
  };
}
function updateBefore(pool, timeS) {
  const now = timeS || 0;
  pool._beamShaderShared.time.value = now;
  pool._beamShaderShared.pulse.value = 1;
  let matricesChanged = false;
  for (let entryIndex = 0; entryIndex < pool._entries.length; entryIndex++) {
    const entry = pool._entries[entryIndex];
    if (!entry.active) continue;
    if (now - entry.lastSeen > 0.14) {
      entry.active = false;
      pool.activeCount = Math.max(0, pool.activeCount - 1);
      matricesChanged = true;
      continue;
    }
    // busy path omitted on quiet bench
    matricesChanged = true;
  }
  if (matricesChanged) { /* commit noop */ }
  pool.group.visible = pool.activeCount > 0;
  return pool.activeCount;
}
function updateAfter(pool, timeS) {
  if (!(pool.activeCount > 0)) {
    pool.group.visible = false;
    return 0;
  }
  return updateBefore(pool, timeS);
}
const pool = make();
const fn = ${JSON.stringify(mode)} === 'before' ? updateBefore : updateAfter;
for (let i = 0; i < 3000; i++) fn(pool, i * 0.016);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(pool, i * 0.016);
const ms = performance.now() - t0;
console.log(JSON.stringify({ ms, active: pool.activeCount, visible: pool.group.visible, mode: ${JSON.stringify(mode)} }));
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
  if (before.visible !== false || after.visible !== false) throw new Error('visible checksum fail');
  pairs.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / after.ms).toFixed(3),
  });
}
pairs.sort((a, b) => a.speedup - b.speedup);
const speeds = pairs.map((p) => p.speedup);
const result = {
  label: 'persistent-beams-quiet-active-skip',
  primary: 'quiet-beams-active-zero-update',
  iters: ITERS,
  capacity: CAP,
  pairs,
  medianSpeedup: speeds[Math.floor(RUNS / 2)],
  minSpeedup: speeds[0],
  maxSpeedup: speeds[RUNS - 1],
  note: 'Picture unchanged: group.visible already false after last release.',
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(
  new URL('./persistent-beams-quiet-active-skip-microbench.json', import.meta.url),
  JSON.stringify(result, null, 2),
);
