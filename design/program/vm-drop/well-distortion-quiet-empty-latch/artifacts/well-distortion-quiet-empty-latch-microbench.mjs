/**
 * #120 well-distortion-quiet-empty-latch — portable quiet CPU.
 * Before = resolveVfxAccessibilityProfile + reducedMotionProfile + empty active walk
 *   + CAP slot zero + DistortionField.update (uTime write + live early-out).
 * After  = latch after first empty sync; wake on fields.active ref/len.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 400000;
const RUNS = 13;
const CAP = 6;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
import { resolveVfxAccessibilityProfile } from './src/render/vfxAccessibility.js';
const ITERS = ${ITERS};
const CAP = ${CAP};
function reducedMotionProfile(profile) {
  const id = profile && profile.id;
  return id === 'reduced-motion' || id === 'reduced-motion-and-flash';
}
const SETTINGS = { video: { motionReduce: false, flashReduce: false }, accessibility: {} };
function make() {
  return {
    capacity: CAP, live: 0, mesh: { count: 0 },
    slots: Array.from({ length: CAP }, () => ({ alive: 0 })),
    material: { uniforms: { uTime: { value: 0 } } },
    quietEmpty: false, quietActiveLen: -1, quietActiveRef: null,
    state: { settings: SETTINGS, fields: { active: [] }, simTime: 0 },
    updates: 0, skips: 0, uTimeWrites: 0,
  };
}
function fieldUpdate(host, dt, clock) {
  host.material.uniforms.uTime.value = Number.isFinite(clock)
    ? clock
    : host.material.uniforms.uTime.value + (Number.isFinite(dt) ? dt : 0);
  host.uTimeWrites++;
  if (!(host.live > 0) && !(host.mesh.count > 0)) return 0;
  return host.live;
}
function syncBefore(host) {
  host.updates++;
  let live = 0;
  if (!reducedMotionProfile(resolveVfxAccessibilityProfile(host.state.settings))) {
    const active = host.state.fields && host.state.fields.active;
    if (active) {
      for (let i = 0; i < active.length && live < CAP; i++) {
        const rec = active[i];
        if (!rec || rec.kind !== 'well') continue;
        host.slots[live].alive = 1;
        live++;
      }
    }
  }
  for (let i = live; i < CAP; i++) host.slots[i].alive = 0;
  host.live = live;
  fieldUpdate(host, 0, host.state.simTime);
  return live;
}
function syncAfter(host) {
  const active = host.state.fields && host.state.fields.active;
  const activeLen = active ? active.length : 0;
  if (host.quietEmpty && active === host.quietActiveRef && activeLen === host.quietActiveLen
    && host.live === 0 && !(host.mesh.count > 0)) {
    host.skips++;
    return 0;
  }
  const live = syncBefore(host);
  if (live === 0 && activeLen === 0) {
    host.quietEmpty = true;
    host.quietActiveLen = activeLen;
    host.quietActiveRef = active;
  } else host.quietEmpty = false;
  return live;
}
const host = make();
const fn = ${JSON.stringify(mode)} === 'before' ? syncBefore : syncAfter;
for (let i = 0; i < 5000; i++) { host.state.simTime = i * 0.016; fn(host); }
host.updates = 0; host.skips = 0; host.uTimeWrites = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) { host.state.simTime = i * 0.016; fn(host); }
const ms = performance.now() - t0;
console.log(JSON.stringify({ ms, updates: host.updates, skips: host.skips, uTimeWrites: host.uTimeWrites, live: host.live, mode: ${JSON.stringify(mode)} }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'spawn failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function median(xs) {
  const a = xs.slice().sort((x, y) => x - y);
  const m = (a.length - 1) / 2;
  return a.length % 2 ? a[m | 0] : (a[m | 0] + a[(m | 0) + 1]) / 2;
}

const pairs = [];
for (let run = 0; run < RUNS; run++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: before.ms / after.ms,
    afterSkips: after.skips,
    beforeUTime: before.uTimeWrites,
    afterUTime: after.uTimeWrites,
  });
}
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'well-distortion-quiet-empty-latch',
  primary: 'quiet-well-distortion-empty-active-a11y-utime',
  note: 'isolated child; real a11y resolve + DistortionField uTime; empty-active-only latch; dirty-wake on active ref/len',
  iterations: ITERS,
  runs: RUNS,
  capacity: CAP,
  pairs,
  medianSpeedup: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
};
writeFileSync('artifacts/well-distortion-quiet-empty-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  medianSpeedup: out.medianSpeedup,
  minSpeedup: out.minSpeedup,
  maxSpeedup: out.maxSpeedup,
}, null, 2));
