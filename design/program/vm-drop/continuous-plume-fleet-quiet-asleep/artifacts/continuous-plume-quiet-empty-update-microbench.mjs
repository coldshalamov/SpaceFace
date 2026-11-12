/**
 * Secondary KPI: ContinuousPlumeSystem.update when already empty (single-entity path).
 * Before = pool update + full _commitGpu (eventLights + 5-layer clear/uniforms) every tick.
 * After  = early-out when activeCount===0 && _quietEmpty.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const LAYERS = 5;
function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
function make() {
  const batches = Array.from({ length: ${LAYERS} }, () => ({
    writeCount: 0, dynamicBufferOwner: null,
    mesh: { count: 0, visible: false },
    uScratch: { time: 0, foldTime: 0 },
    material: {}, baseIntensity: 1, role: 'core', layerIndex: 0,
    offset: new Float32Array(3), axisScale: new Float32Array(4),
    params: new Float32Array(4), dynamics: new Float32Array(4),
    color: new Float32Array(3), spin: new Float32Array(2),
    backing: { array: new Float32Array(64), needsUpdate: false },
    capacity: 4,
  }));
  return {
    pool: {
      _result: { activeCount: 0, drive: 0, boostBlend: 0, presentation: { eventLightScale: 1, intensityScale: 1, softEdgeBoost: 0 }, sample: { flowSpeed: 1, turbulence: 0.5, coreSheathBalance: 0.8, dissipation: 1 }, entityWrites: 0 },
      _fallbackSocket: { x: 0, y: 0, z: 0 },
      _layerEnabled: [1,1,1,1,1], _layerScroll: [2.4,2.4,2.4,2.4,2.4],
      _layerOpacity: [1,1,1,1,1], _layerSoftEdge: [0,0,0,0,0],
      _layerFlipbook: [0,0,0,0,0], _layerFlipCols: [1,1,1,1,1],
      _layerFlipRows: [1,1,1,1,1], _layerFlipFps: [0,0,0,0,0],
      update() { return this._result; },
    },
    eventLights: { begins: 0, finals: 0, beginFrame(){this.begins++}, writeMain(){}, finalize(){this.finals++} },
    layerBatches: batches, group: { visible: false },
    recipe: { identity: { flowCharacter: { swirl:0, fork:0, noiseScale:1 } }, throttle: { idle: 0 }, accessibility: {} },
    _time: 0, _disposed: false, _quietEmpty: false, _initGpu: true, _a11y: {},
    _emptyOpts: Object.freeze({ boost: 0, a11y: null }),
    _nozzleScratch: { x:0,y:0,z:0 }, commits: 0,
  };
}
function commit(sys) {
  sys.commits++;
  sys.eventLights.beginFrame();
  sys.eventLights.writeMain(0, sys._nozzleScratch, 1, 0);
  sys.eventLights.finalize();
  for (let b = 0; b < sys.layerBatches.length; b++) {
    const batch = sys.layerBatches[b];
    batch.writeCount = 0;
    batch.mesh.count = 0;
    batch.mesh.visible = false;
    batch.uScratch.time = sys._time;
    batch.uScratch.foldTime += 0.016;
  }
  sys.group.visible = false;
}
function updateBefore(sys, dt) {
  sys._time += dt;
  const result = sys.pool.update();
  commit(sys);
  return result;
}
function updateAfter(sys, dt) {
  sys._time += dt;
  const result = sys.pool.update();
  if (!(result.activeCount > 0) && sys._quietEmpty) return result;
  commit(sys);
  sys._quietEmpty = !(result.activeCount > 0);
  return result;
}
const sys = make();
const before = ${JSON.stringify(mode)} === 'before';
const step = before ? updateBefore : updateAfter;
for (let i = 0; i < 3000; i++) step(sys, 0.016);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) step(sys, 0.016);
const ms = performance.now() - t0;
console.log(JSON.stringify({ ms, mode: ${JSON.stringify(mode)}, commits: sys.commits, begins: sys.eventLights.begins }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8', env: process.env });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'spawn failed');
  return JSON.parse(r.stdout.trim().split('\\n').pop());
}
const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = runOnce('before'); const a = runOnce('after');
  pairs.push({ beforeMs: b.ms, afterMs: a.ms, speedup: b.ms / a.ms });
}
pairs.sort((x, y) => x.speedup - y.speedup);
const median = pairs[Math.floor(pairs.length / 2)].speedup;
const out = {
  name: 'continuous-plume-quiet-empty-update',
  primary: 'quiet-continuous-plume-active-zero-update',
  iterations: ITERS, runs: RUNS, pairs,
  medianSpeedup: Math.round(median * 1000) / 1000,
  minSpeedup: Math.round(pairs[0].speedup * 1000) / 1000,
  maxSpeedup: Math.round(pairs[pairs.length - 1].speedup * 1000) / 1000,
};
writeFileSync('artifacts/continuous-plume-quiet-empty-update-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ medianSpeedup: out.medianSpeedup, minSpeedup: out.minSpeedup, maxSpeedup: out.maxSpeedup }));
