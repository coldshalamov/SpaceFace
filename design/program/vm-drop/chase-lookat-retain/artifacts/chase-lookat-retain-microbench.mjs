/**
 * Primary KPI: applyChaseLookAt residual under camera.follow after clearance cuts.
 * Settled eye+target (quiet hover / parked focus): before = retain off (Three lookAt
 * every call); after = retain on (cached base quat). Soft-GPU fps not claimed.
 * Moving chase is informational (retain rarely hits).
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');

async function runChild(mode, scenario, iters) {
  const {
    applyChaseLookAt,
    setChaseLookAtRetainForBench,
  } = await import('../src/render/camera.js');

  setChaseLookAtRetainForBench(mode === 'after');

  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const cache = {
    eyeX: NaN, eyeY: NaN, eyeZ: NaN, targetX: NaN, targetZ: NaN, baseQuat: null,
  };
  const _rollQ = new THREE.Quaternion();
  const _FORWARD = new THREE.Vector3(0, 0, -1);

  const settledEye = { x: 12, y: 90, z: -50 };
  const settledTarget = { x: 3, z: -2 };

  function oneSettled() {
    cam.position.set(settledEye.x, settledEye.y, settledEye.z);
    applyChaseLookAt(
      cam,
      settledEye.x, settledEye.y, settledEye.z,
      settledTarget.x, settledTarget.z,
      cache,
    );
    // Match follow(): post-multiply a settled roll (~0).
    _rollQ.setFromAxisAngle(_FORWARD, 0);
    cam.quaternion.multiply(_rollQ);
  }

  function oneMoving(i) {
    const t = i * 0.01;
    const ex = 12 + Math.sin(t) * 2;
    const ey = 90;
    const ez = -50 + Math.cos(t) * 2;
    const tx = 3 + Math.sin(t * 0.3);
    const tz = -2 + Math.cos(t * 0.3);
    cam.position.set(ex, ey, ez);
    applyChaseLookAt(cam, ex, ey, ez, tx, tz, cache);
    _rollQ.setFromAxisAngle(_FORWARD, Math.sin(t) * 0.02);
    cam.quaternion.multiply(_rollQ);
  }

  const fn = scenario === 'moving' ? oneMoving : oneSettled;
  for (let i = 0; i < 2000; i++) fn(i);

  // Seed cache for after/settled so the timed loop is all retains.
  if (mode === 'after' && scenario === 'settled') {
    for (let i = 0; i < 8; i++) oneSettled();
  }

  let ranLookAt = 0;
  const t0 = performance.now();
  if (scenario === 'settled') {
    for (let i = 0; i < iters; i++) {
      cam.position.set(settledEye.x, settledEye.y, settledEye.z);
      if (applyChaseLookAt(
        cam,
        settledEye.x, settledEye.y, settledEye.z,
        settledTarget.x, settledTarget.z,
        cache,
      )) ranLookAt++;
      _rollQ.setFromAxisAngle(_FORWARD, 0);
      cam.quaternion.multiply(_rollQ);
    }
  } else {
    for (let i = 0; i < iters; i++) {
      const t = i * 0.01;
      const ex = 12 + Math.sin(t) * 2;
      const ey = 90;
      const ez = -50 + Math.cos(t) * 2;
      const tx = 3 + Math.sin(t * 0.3);
      const tz = -2 + Math.cos(t * 0.3);
      cam.position.set(ex, ey, ez);
      if (applyChaseLookAt(cam, ex, ey, ez, tx, tz, cache)) ranLookAt++;
      _rollQ.setFromAxisAngle(_FORWARD, Math.sin(t) * 0.02);
      cam.quaternion.multiply(_rollQ);
    }
  }
  const ms = performance.now() - t0;

  // Oracle: retain on/off must agree on final quat for a short settled+moving mix.
  setChaseLookAtRetainForBench(false);
  const camA = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const cacheA = { eyeX: NaN, eyeY: NaN, eyeZ: NaN, targetX: NaN, targetZ: NaN, baseQuat: null };
  setChaseLookAtRetainForBench(true);
  const camB = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const cacheB = { eyeX: NaN, eyeY: NaN, eyeZ: NaN, targetX: NaN, targetZ: NaN, baseQuat: null };
  const samples = [];
  for (let i = 0; i < 40; i++) {
    const settled = i % 5 !== 0;
    const t = i * 0.07;
    const ex = settled ? 12 : 12 + Math.sin(t);
    const ey = 90;
    const ez = settled ? -50 : -50 + Math.cos(t);
    const tx = settled ? 3 : 3 + Math.sin(t * 0.2);
    const tz = settled ? -2 : -2 + Math.cos(t * 0.2);
    const roll = settled ? 0 : Math.sin(t) * 0.03;
    setChaseLookAtRetainForBench(false);
    camA.position.set(ex, ey, ez);
    applyChaseLookAt(camA, ex, ey, ez, tx, tz, cacheA);
    _rollQ.setFromAxisAngle(_FORWARD, roll);
    camA.quaternion.multiply(_rollQ);
    setChaseLookAtRetainForBench(true);
    camB.position.set(ex, ey, ez);
    applyChaseLookAt(camB, ex, ey, ez, tx, tz, cacheB);
    _rollQ.setFromAxisAngle(_FORWARD, roll);
    camB.quaternion.multiply(_rollQ);
    samples.push(1 - Math.abs(camA.quaternion.dot(camB.quaternion)));
  }
  const maxQuatDelta = Math.max(...samples);

  return {
    mode, scenario, iters, ms, ranLookAt, maxQuatDelta,
    retainEnabled: mode === 'after',
  };
}

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  return a[(a.length / 2) | 0];
}

function runPair(scenario, iters) {
  const before = spawnSync(process.execPath, [__filename, 'child', 'before', scenario, String(iters)], {
    cwd: ROOT, encoding: 'utf8',
  });
  const after = spawnSync(process.execPath, [__filename, 'child', 'after', scenario, String(iters)], {
    cwd: ROOT, encoding: 'utf8',
  });
  if (before.status !== 0) throw new Error(before.stderr || before.stdout);
  if (after.status !== 0) throw new Error(after.stderr || after.stdout);
  return {
    before: JSON.parse(before.stdout.trim().split('\n').pop()),
    after: JSON.parse(after.stdout.trim().split('\n').pop()),
  };
}

const args = process.argv.slice(2);
if (args[0] === 'child') {
  const [, mode, scenario, iters] = args;
  const result = await runChild(mode, scenario, Number(iters));
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

const scenarios = [
  { name: 'settled-lookat', scenario: 'settled', iters: 200000, primary: true },
  { name: 'moving-lookat-informational', scenario: 'moving', iters: 200000, primary: false },
];

const report = { scenarios: {}, floorMinSpeedup: Infinity, primary: 'settled-lookat' };
const PAIRS = 7;

for (const sc of scenarios) {
  const speedups = [];
  const pairs = [];
  for (let r = 0; r < PAIRS; r++) {
    const pair = runPair(sc.scenario, sc.iters);
    const speedup = pair.before.ms / pair.after.ms;
    speedups.push(speedup);
    pairs.push({
      beforeMs: pair.before.ms,
      afterMs: pair.after.ms,
      speedup,
      beforeRanLookAt: pair.before.ranLookAt,
      afterRanLookAt: pair.after.ranLookAt,
      maxQuatDelta: Math.max(pair.before.maxQuatDelta, pair.after.maxQuatDelta),
    });
  }
  const med = median(speedups);
  const floor = Math.min(...speedups);
  report.scenarios[sc.name] = {
    primary: sc.primary,
    iters: sc.iters,
    medianSpeedup: med,
    minSpeedup: floor,
    pairs,
  };
  if (sc.primary) report.floorMinSpeedup = floor;
  console.log(`${sc.name}: median ${med.toFixed(2)}×  min ${floor.toFixed(2)}×`);
}

writeFileSync(join(ROOT, 'artifacts/chase-lookat-retain-microbench.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  primaryMedian: report.scenarios['settled-lookat'].medianSpeedup,
  primaryFloor: report.floorMinSpeedup,
}, null, 2));
