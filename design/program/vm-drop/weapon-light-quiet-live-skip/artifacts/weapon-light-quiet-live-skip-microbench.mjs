/**
 * Primary KPI: WeaponLightPool.update when live===0 (CAP=2).
 * Before = always walk 2 slots + intensity=0.
 * After  = _live===0 early-out.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 400000;
const RUNS = 11;
const CAP = 2;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
function make() {
  return {
    slots: Array.from({ length: ${CAP} }, () => ({
      alive: 0, age: 0, life: 0.12, peak: 0, priority: 0,
      light: { intensity: 0 },
    })),
    _live: 0,
  };
}
function updateBefore(sys, dt) {
  for (let i = 0; i < sys.slots.length; i++) {
    const slot = sys.slots[i];
    if (!slot.alive) { slot.light.intensity = 0; continue; }
    slot.age += dt;
    if (slot.age >= slot.life) {
      slot.alive = 0; slot.priority = 0; slot.light.intensity = 0; continue;
    }
    const t = slot.age / slot.life;
    slot.light.intensity = slot.peak * (1 - t) * (1 - t) * (0.62 + 0.38 * Math.exp(-t * 11));
  }
}
function updateAfter(sys, dt) {
  if (!(sys._live > 0)) return;
  updateBefore(sys, dt);
}
const sys = make();
const dt = 1/60;
const fn = ${JSON.stringify(mode)} === 'before' ? updateBefore : updateAfter;
for (let i = 0; i < 3000; i++) fn(sys, dt);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(sys, dt);
const ms = performance.now() - t0;
console.log(JSON.stringify({ ms, mode: ${JSON.stringify(mode)}, live: sys._live }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'spawn failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}
function median(xs) { const a = [...xs].sort((x,y)=>x-y); return a[Math.floor(a.length/2)]; }
const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({ beforeMs: before.ms, afterMs: after.ms, speedup: before.ms / Math.max(1e-9, after.ms) });
}
const speedups = pairs.map(p => p.speedup);
const out = {
  name: 'weapon-light-quiet-live-skip',
  primary: 'quiet-weapon-light-live-zero-update',
  iterations: ITERS, capacity: CAP, runs: RUNS, pairs,
  medianSpeedup: +median(speedups).toFixed(3),
  minSpeedup: +Math.min(...speedups).toFixed(3),
  maxSpeedup: +Math.max(...speedups).toFixed(3),
};
writeFileSync('artifacts/weapon-light-quiet-live-skip-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
