/**
 * Primary KPI: PhasedExplosionLifecycle.update when activeCount===0.
 * Before = capacity walk (prod 40) continuing on every dead slot.
 * After  = activeCount===0 early-out.
 * Soft-GPU fps not claimed. Picture unchanged (emit never runs for inactive).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const CAP = 40;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const CAP = ${CAP};
function make() {
  return {
    activeCount: 0,
    entries: Array.from({ length: CAP }, () => ({
      active: false, age: 0, phaseIndex: 0, classId: 'small', cause: 'generic',
    })),
  };
}
function explosionScheduleFor() {
  return { duration: 1, events: [{ at: 0, phase: 'ignition' }, { at: 0.2, phase: 'rupture' }] };
}
function updateBefore(life, dt, emit) {
  const step = Math.max(0, dt || 0);
  for (let entryIndex = 0; entryIndex < life.entries.length; entryIndex++) {
    const entry = life.entries[entryIndex];
    if (!entry.active) continue;
    entry.age += step;
    const scheduleDef = explosionScheduleFor();
    while (entry.phaseIndex < scheduleDef.events.length) {
      const event = scheduleDef.events[entry.phaseIndex];
      if (event.at > entry.age) break;
      if (emit) emit(event.phase, entry, entry.phaseIndex);
      entry.phaseIndex++;
    }
    if (entry.age >= scheduleDef.duration) {
      entry.active = false;
      life.activeCount = Math.max(0, life.activeCount - 1);
    }
  }
  return life.activeCount;
}
function updateAfter(life, dt, emit) {
  if (!(life.activeCount > 0)) return 0;
  return updateBefore(life, dt, emit);
}
const life = make();
const dt = 1/60;
const fn = ${JSON.stringify(mode)} === 'before' ? updateBefore : updateAfter;
for (let i = 0; i < 3000; i++) fn(life, dt, null);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(life, dt, null);
const ms = performance.now() - t0;
console.log(JSON.stringify({ ms, active: life.activeCount, mode: ${JSON.stringify(mode)} }));
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
  label: 'phased-explosion-quiet-active-skip',
  primary: 'quiet-explosion-active-zero-update',
  iters: ITERS,
  capacity: CAP,
  pairs,
  medianSpeedup: speeds[Math.floor(RUNS / 2)],
  minSpeedup: speeds[0],
  maxSpeedup: speeds[RUNS - 1],
  note: 'Picture unchanged: emit never runs for inactive entries.',
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(
  new URL('./phased-explosion-quiet-active-skip-microbench.json', import.meta.url),
  JSON.stringify(result, null, 2),
);
