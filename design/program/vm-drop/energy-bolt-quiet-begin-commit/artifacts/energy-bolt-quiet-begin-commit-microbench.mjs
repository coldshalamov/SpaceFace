/**
 * Primary KPI: EnergyBoltPool beginFrame+commit when already empty (quiet flight).
 * Before = Map.clear + uniform writes + sort gate + 7 attr needsUpdate every tick.
 * After  = latch after first empty commit; skip begin+commit while still empty.
 * Soft-GPU fps not claimed. Picture unchanged (mesh already count 0 / invisible).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
function make() {
  return {
    writeCount: 0,
    _time: 0,
    _quietEmpty: false,
    mesh: { count: 0, visible: false },
    material: { uniforms: { uBoltTime: { value: 0 }, uBoltFlicker: { value: 1 } } },
    byEntity: new Map(),
    pos: { needsUpdate: false },
    prev: { needsUpdate: false },
    axis: { needsUpdate: false },
    size: { needsUpdate: false },
    color: { needsUpdate: false },
    sheath: { needsUpdate: false },
    minPixels: { needsUpdate: false },
    begins: 0,
    commits: 0,
  };
}
function beginBefore(sys, dt) {
  sys._time += Math.min(dt, 0.1);
  sys.material.uniforms.uBoltTime.value = sys._time;
  sys.material.uniforms.uBoltFlicker.value = 1;
  sys.writeCount = 0;
  sys.byEntity.clear();
  sys.begins++;
}
function commitBefore(sys) {
  // sort: count < 2 → early
  if (sys.writeCount >= 2) { /* sort */ }
  sys.mesh.count = sys.writeCount;
  sys.pos.needsUpdate = true;
  sys.prev.needsUpdate = true;
  sys.axis.needsUpdate = true;
  sys.size.needsUpdate = true;
  sys.color.needsUpdate = true;
  sys.sheath.needsUpdate = true;
  sys.minPixels.needsUpdate = true;
  sys.mesh.visible = sys.writeCount > 0;
  sys.commits++;
}
function stepBefore(sys, dt) {
  beginBefore(sys, dt);
  // no writes (quiet)
  commitBefore(sys);
}
function stepAfter(sys, dt) {
  if (sys._quietEmpty && sys.writeCount === 0 && sys.mesh.count === 0 && !sys.mesh.visible) {
    return;
  }
  beginBefore(sys, dt);
  commitBefore(sys);
  sys._quietEmpty = sys.writeCount === 0 && sys.mesh.count === 0 && !sys.mesh.visible;
}
const sys = make();
const fn = ${JSON.stringify(mode)} === 'before' ? stepBefore : stepAfter;
const dt = 1/60;
for (let i = 0; i < 3000; i++) fn(sys, dt);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(sys, dt);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, mode: ${JSON.stringify(mode)}, begins: sys.begins, commits: sys.commits,
  quiet: !!sys._quietEmpty, mapSize: sys.byEntity.size,
}));
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
  pairs.push({
    beforeMs: before.ms, afterMs: after.ms,
    speedup: before.ms / Math.max(1e-9, after.ms),
    beforeBegins: before.begins, afterBegins: after.begins,
  });
}
const speedups = pairs.map(p => p.speedup);
const out = {
  name: 'energy-bolt-quiet-begin-commit',
  primary: 'quiet-energy-bolt-begin-commit-latch',
  iterations: ITERS, runs: RUNS, pairs,
  medianSpeedup: +median(speedups).toFixed(3),
  minSpeedup: +Math.min(...speedups).toFixed(3),
  maxSpeedup: +Math.max(...speedups).toFixed(3),
};
writeFileSync('artifacts/energy-bolt-quiet-begin-commit-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
