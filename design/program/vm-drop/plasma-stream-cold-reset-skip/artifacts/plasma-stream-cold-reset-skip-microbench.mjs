/**
 * Primary KPI: PlasmaStreamSystem.update when already fully cold + !commanded.
 * Before = integrateDriveEnvelope + boost + socket math + trailLive walk + reset() every tick.
 * After  = early return when !commanded && !_active && !sampler.hasLive && !group.visible.
 * Soft-GPU fps not claimed. Picture unchanged (already hidden/reset).
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
  const throats = Array.from({ length: 4 }, () => ({ visible: false }));
  const trails = Array.from({ length: 4 }, () => ({
    live: 0,
    liveSampleCount() { return this.live; },
    reset() { this.live = 0; },
  }));
  return {
    _disposed: false,
    group: { visible: false },
    _active: false,
    sampler: { hasLive: false, clear() { this.hasLive = false; } },
    _throats: throats,
    _trails: trails,
    _ribbons: { reset() {} },
    _env: { spool: 0, boost: 0, dash: 0, dashAge: -1 },
    _time: 0,
    _boostBlend: 0,
    _ignition: 0,
    _lastDrive: 0,
    _lastBoost: 0,
    _pointCount: 0,
    _pathErase: 0,
    _hasNozzle: false,
    resets: 0,
  };
}
function trailLiveCount(sys) {
  let n = 0;
  for (let i = 0; i < sys._trails.length; i++) {
    const live = sys._trails[i].liveSampleCount();
    if (live > n) n = live;
  }
  return n;
}
function reset(sys) {
  sys.resets++;
  sys.sampler.clear();
  sys._active = false;
  sys._pointCount = 0;
  sys._pathErase = 0;
  sys._ignition = 0;
  sys._hasNozzle = false;
  for (let i = 0; i < sys._throats.length; i++) sys._throats[i].visible = false;
  sys._ribbons.reset();
  for (let i = 0; i < sys._trails.length; i++) sys._trails[i].reset();
  sys._env.spool = 0; sys._env.boost = 0; sys._env.dash = 0; sys._env.dashAge = -1;
  sys.group.visible = false;
}
function integrateEnv(env, input, dt) {
  // cheap stand-in for integrateDriveEnvelope spool decay
  const target = Math.max(input.throttle, 0);
  env.spool += (target - env.spool) * (1 - Math.exp(-dt / 0.18));
}
function updateBefore(sys, dt, driveInfo) {
  if (sys._disposed || !sys.group) return 0;
  const frameDt = dt;
  const drive = Math.max(0, driveInfo.drive || 0);
  const throttle = Math.max(0, driveInfo.throttle || 0);
  const boost = Math.max(0, driveInfo.boost || 0);
  integrateEnv(sys._env, { throttle: Math.max(throttle, drive) }, frameDt);
  const activeDrive = sys._env.spool;
  sys._time += frameDt;
  sys._lastDrive = activeDrive;
  const boostTarget = Math.max(0, Math.min(1, boost));
  const boostTau = boostTarget > sys._boostBlend ? 0.09 : 0.3;
  sys._boostBlend += (boostTarget - sys._boostBlend) * (1 - Math.exp(-frameDt / Math.max(1e-3, boostTau)));
  sys._ignition = Math.max(0, sys._ignition - frameDt * 3.6);
  const emitting = activeDrive >= 0.081;
  const commanded = Math.max(throttle, drive, boost) > 0.001;
  if (!commanded && !emitting && !sys.sampler.hasLive && trailLiveCount(sys) < 2) {
    reset(sys);
    return 0;
  }
  return 1;
}
function updateAfter(sys, dt, driveInfo) {
  if (sys._disposed || !sys.group) return 0;
  const drive = Math.max(0, driveInfo.drive || 0);
  const throttle = Math.max(0, driveInfo.throttle || 0);
  const boost = Math.max(0, driveInfo.boost || 0);
  const commanded = Math.max(throttle, drive, boost) > 0.001;
  // Already fully cold: skip envelope/reset work.
  if (!commanded && !sys._active && !sys.sampler.hasLive && !sys.group.visible) {
    return 0;
  }
  return updateBefore(sys, dt, driveInfo);
}
const sys = make();
const dt = 1/60;
const driveInfo = { drive: 0, throttle: 0, boost: 0, speed: 0 };
const fn = ${JSON.stringify(mode)} === 'before' ? updateBefore : updateAfter;
for (let i = 0; i < 3000; i++) fn(sys, dt, driveInfo);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(sys, dt, driveInfo);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, mode: ${JSON.stringify(mode)}, resets: sys.resets, visible: sys.group.visible,
}));
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
  pairs.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / after.ms).toFixed(3),
  });
}
pairs.sort((a, b) => a.speedup - b.speedup);
const speeds = pairs.map((p) => p.speedup);
const result = {
  label: 'plasma-stream-cold-reset-skip',
  primary: 'quiet-plasma-already-cold-update',
  iters: ITERS,
  pairs,
  medianSpeedup: speeds[Math.floor(RUNS / 2)],
  minSpeedup: speeds[0],
  maxSpeedup: speeds[RUNS - 1],
  note: 'Picture unchanged: already reset/hidden; skip repeated reset().',
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(
  new URL('./plasma-stream-cold-reset-skip-microbench.json', import.meta.url),
  JSON.stringify(result, null, 2),
);
