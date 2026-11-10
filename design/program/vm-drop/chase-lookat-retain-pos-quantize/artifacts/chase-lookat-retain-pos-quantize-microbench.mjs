/**
 * Primary KPI: applyChaseLookAt under quiet chase drift after #72.
 * Before = retain on, pos-quantize OFF (bit-identical keys — drift misses every frame).
 * After  = retain on, pos-quantize ON (0.25 WU cell — drift hits within cell).
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import {
  applyChaseLookAt,
  setChaseLookAtRetainForBench,
  setChaseLookAtRetainPosQuantizeForBench,
} from '../src/render/camera.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ITERS = 200000;

function runTimed(quantizeOn) {
  setChaseLookAtRetainForBench(true);
  setChaseLookAtRetainPosQuantizeForBench(quantizeOn);

  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const cache = {
    eyeX: NaN, eyeY: NaN, eyeZ: NaN, targetX: NaN, targetZ: NaN, baseQuat: null,
  };
  const _rollQ = new THREE.Quaternion();
  const _FORWARD = new THREE.Vector3(0, 0, -1);

  // Quiet chase: base eye/target; drift ≪ 0.25 WU cell (half-cell = 0.125).
  const base = { x: 12, y: 90, z: -50, tx: 3, tz: -2 };

  for (let i = 0; i < 32; i++) {
    cam.position.set(base.x, base.y, base.z);
    applyChaseLookAt(cam, base.x, base.y, base.z, base.tx, base.tz, cache);
    _rollQ.setFromAxisAngle(_FORWARD, 0);
    cam.quaternion.multiply(_rollQ);
  }

  let ranLookAt = 0;
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    const ex = base.x + ((i * 0.011) % 0.12);
    const ey = base.y + ((i * 0.003) % 0.12);
    const ez = base.z + ((i * 0.007) % 0.12);
    const tx = base.tx + ((i * 0.005) % 0.12);
    const tz = base.tz + ((i * 0.009) % 0.12);
    cam.position.set(ex, ey, ez);
    if (applyChaseLookAt(cam, ex, ey, ez, tx, tz, cache)) ranLookAt += 1;
    _rollQ.setFromAxisAngle(_FORWARD, 0);
    cam.quaternion.multiply(_rollQ);
  }
  const ms = performance.now() - t0;
  return { ms, ranLookAt, quantizeOn, iters: ITERS };
}

if (process.argv[2] === 'child') {
  const quantizeOn = process.argv[3] === '1';
  const result = runTimed(quantizeOn);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

function isolated(quantizeOn) {
  const r = spawnSync(
    process.execPath,
    [__filename, 'child', quantizeOn ? '1' : '0'],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'child failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const PAIR_RUNS = 11;
const pairs = [];
for (let i = 0; i < PAIR_RUNS; i++) {
  const before = isolated(false);
  const after = isolated(true);
  const speedup = after.ms > 0 ? before.ms / after.ms : 0;
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup,
    beforeRanLookAt: before.ranLookAt,
    afterRanLookAt: after.ranLookAt,
  });
  console.log(
    `pair ${i}: before=${before.ms.toFixed(1)}ms after=${after.ms.toFixed(1)}ms `
    + `speedup=${speedup.toFixed(3)}× ran ${before.ranLookAt}/${after.ranLookAt}`,
  );
}

const speedups = pairs.map((p) => p.speedup).sort((a, b) => a - b);
const median = speedups[Math.floor(speedups.length / 2)];
const floorMin = Math.min(...speedups);
const out = {
  label: 'chase-lookat-retain-pos-quantize',
  scenario: 'quiet-chase-drift',
  iters: ITERS,
  pairs,
  medianSpeedup: median,
  floorMinSpeedup: floorMin,
  note: 'Before=retain+bit-identical (drift miss); After=retain+0.25WU quantize (drift hit). Soft-GPU fps not claimed.',
};
writeFileSync(
  join(__dirname, 'chase-lookat-retain-pos-quantize-microbench.json'),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(JSON.stringify({ medianSpeedup: median, floorMinSpeedup: floorMin }, null, 2));
if (median < 1.5 || floorMin < 1.35) {
  console.error('BELOW BAR');
  process.exit(2);
}
