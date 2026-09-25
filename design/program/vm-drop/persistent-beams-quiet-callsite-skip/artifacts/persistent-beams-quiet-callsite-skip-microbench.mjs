/**
 * #121 persistent-beams-quiet-callsite-skip — portable quiet CPU.
 * Before = camDist hypot + resolveVfxAccessibilityProfile + worldSizeForPixels
 *   + PersistentCombatBeamPool.update early-out (activeCount===0).
 * After  = activeCount===0 branch at call site (skip prep entirely).
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ITERS = 400000;
const RUNS = 13;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
import { resolveVfxAccessibilityProfile } from './src/render/vfxAccessibility.js';
import { worldSizeForPixels } from './src/render/weapons/pixelFloor.js';

const ITERS = ${ITERS};
const SETTINGS = { video: { motionReduce: false, flashReduce: false }, accessibility: {} };
const cam = { position: { x: 10, y: 40, z: 80 }, fov: 50 };
const viewportH = 1000;
const pool = { activeCount: 0, updateCalls: 0, updates() {
  this.updateCalls++;
  if (!(this.activeCount > 0)) { this.visible = false; return 0; }
  return this.activeCount;
}};

function before() {
  const camDist = Math.hypot(cam.position.x, cam.position.y, cam.position.z);
  const a11y = resolveVfxAccessibilityProfile(SETTINGS);
  const floor = worldSizeForPixels(camDist, 8, cam.fov, viewportH);
  // Mirror call-site: always invoke update; pool early-outs when empty.
  return pool.updates() + (a11y && floor ? 0 : 0);
}
function after() {
  if (!(pool.activeCount > 0)) return 0;
  return before();
}
const fn = ${mode === 'before' ? 'before' : 'after'};
pool.updateCalls = 0;
for (let i = 0; i < 20000; i++) fn();
pool.updateCalls = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) fn();
const ms = performance.now() - t0;
process.stdout.write(JSON.stringify({
  ms,
  mode: '${mode}',
  updateCalls: pool.updateCalls,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || 'bench child failed');
  }
  return JSON.parse(r.stdout);
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = runOnce('before');
  const a = runOnce('after');
  pairs.push({
    beforeMs: b.ms,
    afterMs: a.ms,
    speedup: b.ms / a.ms,
    beforeUpdateCalls: b.updateCalls,
    afterUpdateCalls: a.updateCalls,
  });
}
pairs.sort((x, y) => x.speedup - y.speedup);
const median = pairs[(pairs.length - 1) >> 1].speedup;
const out = {
  name: 'persistent-beams-quiet-callsite-skip',
  primary: 'quiet-combat-beams-callsite-prep',
  iterations: ITERS,
  runs: RUNS,
  pairs,
  medianSpeedup: median,
  minSpeedup: pairs[0].speedup,
  maxSpeedup: pairs[pairs.length - 1].speedup,
};
writeFileSync(
  'artifacts/persistent-beams-quiet-callsite-skip-microbench.json',
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify({
  medianSpeedup: +median.toFixed(3),
  minSpeedup: +pairs[0].speedup.toFixed(3),
  maxSpeedup: +pairs[pairs.length - 1].speedup.toFixed(3),
}, null, 2));
