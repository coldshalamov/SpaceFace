/**
 * Primary KPI: RcsImpulseSystem.update when already empty (quiet settled flight).
 * Before = pool capacity slot-zero + eventLights begin/finalize + layer batch clear/commit/uniforms every tick.
 * After  = pool skip capacity zero when prevActive===0; system early-out when _quietEmpty.
 * Soft-GPU fps not claimed. Picture unchanged (already invisible/empty).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 80000;
const RUNS = 11;
const MAX_IMP = 16;
const LAYERS = 4;
const CAP = MAX_IMP * LAYERS;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
function make() {
  const slots = Array.from({ length: ${CAP} }, () => ({ alive: false }));
  const impulses = Array.from({ length: ${MAX_IMP} }, () => ({ alive: false, age: 0, strength: 1, origin: [0,0,0] }));
  const batches = Array.from({ length: ${LAYERS} }, () => ({
    writeCount: 0,
    dynamicBufferOwner: null,
    attrs: {
      instOffset: { needsUpdate: false },
      instAxis: { needsUpdate: false },
      instParams: { needsUpdate: false },
      instDynamics: { needsUpdate: false },
      instColor: { needsUpdate: false },
    },
    mesh: { count: 0, visible: false },
    uScratch: { time: 0, foldTime: 0, flowSpeed: 0 },
    material: {},
    baseIntensity: 1,
    role: 'core',
    layerIndex: 0,
  }));
  return {
    pool: {
      maxImpulses: ${MAX_IMP},
      capacity: ${CAP},
      impulses,
      slots,
      activeImpulseCount: 0,
      activeSlotCount: 0,
      _emptyA11y: {},
      _presentation: { intensityScale: 1, eventLightScale: 1, roles: [], roleCount: 0 },
      _result: {},
      _timing: { attack: 0.04 },
      recipe: { kind: 'impulse_burst', geometry: {}, accessibility: {} },
      _totalLife: 0.35,
      _layerCount: ${LAYERS},
      _layerEnabled: [1,1,1,1],
      _layerRole: ['a','b','c','d'],
      _layerLengthScale: [1,1,1,1],
      _layerWidthScale: [1,1,1,1],
      _layerIntensity: [1,1,1,1],
      _layerColor: new Float32Array(12),
      _findLayerIndex() { return 0; },
      beginFrame() {},
    },
    eventLights: { begins: 0, finals: 0, beginFrame() { this.begins++; }, finalize() { this.finals++; }, writeRcs() {} },
    layerBatches: batches,
    group: { visible: false },
    _time: 0,
    _disposed: false,
    _quietEmpty: false,
    _a11y: {},
    commits: 0,
    zeros: 0,
  };
}
function poolUpdateBefore(pool, dt) {
  let aliveImp = 0;
  for (let i = 0; i < pool.maxImpulses; i++) {
    const imp = pool.impulses[i];
    if (!imp.alive) continue;
    imp.age += dt;
    if (imp.age > pool._totalLife) { imp.alive = false; continue; }
    aliveImp++;
  }
  pool.activeImpulseCount = aliveImp;
  pool.activeSlotCount = 0;
  // no live impulses → skip build
  for (let i = pool.activeSlotCount; i < pool.capacity; i++) {
    pool.slots[i].alive = false;
  }
  pool._result.activeImpulseCount = 0;
  pool._result.activeSlotCount = 0;
  pool._result.presentation = pool._presentation;
  return pool._result;
}
function poolUpdateAfter(pool, dt) {
  let aliveImp = 0;
  for (let i = 0; i < pool.maxImpulses; i++) {
    const imp = pool.impulses[i];
    if (!imp.alive) continue;
    imp.age += dt;
    if (imp.age > pool._totalLife) { imp.alive = false; continue; }
    aliveImp++;
  }
  pool.activeImpulseCount = aliveImp;
  const prevActiveSlots = pool.activeSlotCount;
  pool.activeSlotCount = 0;
  for (let i = pool.activeSlotCount; i < prevActiveSlots; i++) {
    pool.slots[i].alive = false;
  }
  pool._result.activeImpulseCount = 0;
  pool._result.activeSlotCount = 0;
  pool._result.presentation = pool._presentation;
  return pool._result;
}
function setUniforms() { /* stand-in */ }
function sysUpdateBefore(sys, dt) {
  const result = poolUpdateBefore(sys.pool, dt);
  sys.eventLights.beginFrame();
  sys.eventLights.finalize();
  for (let b = 0; b < sys.layerBatches.length; b++) {
    const batch = sys.layerBatches[b];
    batch.writeCount = 0;
    batch.attrs.instOffset.needsUpdate = true;
    batch.attrs.instAxis.needsUpdate = true;
    batch.attrs.instParams.needsUpdate = true;
    batch.attrs.instDynamics.needsUpdate = true;
    batch.attrs.instColor.needsUpdate = true;
    batch.mesh.count = 0;
    batch.mesh.visible = false;
    batch.uScratch.time = sys._time;
    batch.uScratch.foldTime += dt;
    setUniforms();
    sys.commits++;
  }
  sys.group.visible = false;
  return result;
}
function sysUpdateAfter(sys, dt) {
  const result = poolUpdateAfter(sys.pool, dt);
  if (!(result.activeSlotCount > 0) && sys._quietEmpty) return result;
  sys.eventLights.beginFrame();
  sys.eventLights.finalize();
  for (let b = 0; b < sys.layerBatches.length; b++) {
    const batch = sys.layerBatches[b];
    batch.writeCount = 0;
    batch.attrs.instOffset.needsUpdate = true;
    batch.attrs.instAxis.needsUpdate = true;
    batch.attrs.instParams.needsUpdate = true;
    batch.attrs.instDynamics.needsUpdate = true;
    batch.attrs.instColor.needsUpdate = true;
    batch.mesh.count = 0;
    batch.mesh.visible = false;
    batch.uScratch.time = sys._time;
    batch.uScratch.foldTime += dt;
    setUniforms();
    sys.commits++;
  }
  sys.group.visible = false;
  sys._quietEmpty = !(result.activeSlotCount > 0);
  return result;
}
const sys = make();
const dt = 1/60;
const fn = ${JSON.stringify(mode)} === 'before' ? sysUpdateBefore : sysUpdateAfter;
// warm: first after-frame publishes once then goes quiet
for (let i = 0; i < 3000; i++) fn(sys, dt);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(sys, dt);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, mode: ${JSON.stringify(mode)}, commits: sys.commits,
  begins: sys.eventLights.begins, quiet: sys._quietEmpty,
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
    beforeCommits: before.commits, afterCommits: after.commits,
  });
}
const speedups = pairs.map(p => p.speedup);
const out = {
  name: 'rcs-impulse-quiet-empty-skip',
  primary: 'quiet-rcs-already-empty-update',
  iterations: ITERS, maxImpulses: MAX_IMP, layers: LAYERS, capacity: CAP, runs: RUNS, pairs,
  medianSpeedup: +median(speedups).toFixed(3),
  minSpeedup: +Math.min(...speedups).toFixed(3),
  maxSpeedup: +Math.max(...speedups).toFixed(3),
};
writeFileSync('artifacts/rcs-impulse-quiet-empty-skip-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
