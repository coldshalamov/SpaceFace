/**
 * Primary KPI: QuarksVfxSystem.update when all 11 families already particleNum===0.
 * Before = BatchedParticleRenderer.update every quiet tick (11 empty systems).
 * After  = trust _quietEmpty after first empty observe; skip renderer.update.
 * Soft-GPU fps not claimed. Picture unchanged (already empty).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 80000;
const RUNS = 11;
const FAMILIES = 11;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
import { BatchedParticleRenderer, ParticleSystem, ConstantValue, ConeEmitter, IntervalValue, ColorRange, RenderMode } from 'three.quarks';
import * as THREE from 'three';

const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
const mat = new THREE.MeshBasicMaterial();
function makePS() {
  return new ParticleSystem({
    duration: 1, looping: false,
    startLife: new IntervalValue(0.1, 0.2),
    startSpeed: new IntervalValue(1, 2),
    startSize: new ConstantValue(1),
    startColor: new ColorRange(new THREE.Vector4(1,1,1,1), new THREE.Vector4(1,1,1,1)),
    worldSpace: true,
    emissionOverTime: new ConstantValue(0),
    shape: new ConeEmitter({ radius: 0.05, angle: 0.5 }),
    material: mat,
    renderMode: RenderMode.Mesh,
    instancingGeometry: geo,
    behaviors: [],
  });
}

function make() {
  const renderer = new BatchedParticleRenderer();
  const systems = [];
  for (let i = 0; i < ${FAMILIES}; i++) {
    const ps = makePS();
    renderer.addSystem(ps);
    systems.push(ps);
  }
  return {
    scene: true,
    renderer,
    _systems: systems,
    _quietEmpty: false,
    updates: 0,
  };
}

function anyLive(sys) {
  const systems = sys._systems;
  for (let i = 0; i < systems.length; i++) {
    if (systems[i].particleNum > 0) return true;
  }
  return false;
}

function updateBefore(sys, dt) {
  if (!sys.scene) return;
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));
  sys.renderer.update(clampedDt);
  sys.updates++;
}

function updateAfter(sys, dt) {
  if (!sys.scene) return;
  if (!anyLive(sys) && sys._quietEmpty) return;
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));
  sys.renderer.update(clampedDt);
  sys._quietEmpty = !anyLive(sys);
  sys.updates++;
}

const sys = make();
// Warm + settle empty (no spawns → particleNum stays 0)
for (let i = 0; i < 2000; i++) updateBefore(sys, 0.016);
sys.updates = 0;
sys._quietEmpty = false;
// Prime after-path quiet latch the same way production does: one empty observe.
if (${JSON.stringify(mode)} === 'after') {
  updateAfter(sys, 0.016);
  sys.updates = 0;
}
const fn = ${JSON.stringify(mode)} === 'before' ? updateBefore : updateAfter;
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(sys, 0.016);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, mode: ${JSON.stringify(mode)}, updates: sys.updates,
  live: sys._systems.reduce((n, s) => n + s.particleNum, 0),
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'spawn failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: before.ms / Math.max(1e-9, after.ms),
    beforeUpdates: before.updates,
    afterUpdates: after.updates,
  });
}
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'quarks-quiet-empty-update',
  primary: 'quiet-quarks-all-families-empty-update',
  iterations: ITERS,
  families: FAMILIES,
  runs: RUNS,
  pairs,
  medianSpeedup: +median(speedups).toFixed(3),
  minSpeedup: +Math.min(...speedups).toFixed(3),
  maxSpeedup: +Math.max(...speedups).toFixed(3),
};
writeFileSync('artifacts/quarks-quiet-empty-update-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
