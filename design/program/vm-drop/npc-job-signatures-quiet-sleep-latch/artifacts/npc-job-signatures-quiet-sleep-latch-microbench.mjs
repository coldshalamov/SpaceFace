/**
 * Primary KPI: vfx npc-job relevant+sleep composite on consecutive quiet frames.
 * Before = existence probe + 12-slot sleep clear every idle tick.
 * After  = latch after first empty; skip both until revision bump.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 400000;
const RUNS = 13;
const CAP = 12;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const CAP = ${CAP};
function makeSlots() {
  return Array.from({ length: CAP }, () => ({
    jobId: null, profileId: null, lastEmitStep: -1, elapsed: 0,
  }));
}
function relevant(byId) {
  for (const key in byId) { if (byId[key]) return true; break; }
  return false;
}
function sleep(host) {
  const slots = host.slots;
  for (let i = 0; i < slots.length; i++) {
    slots[i].jobId = null;
    slots[i].profileId = null;
    slots[i].lastEmitStep = -1;
    slots[i].elapsed = 0;
  }
  host.active = 0;
  host.drawn = 0;
  host.cadence = 0;
  host.pirate.elapsed = 0;
  host.pirate.contactRef = null;
  host.pirate.contactTarget = null;
  host.sleeps++;
}
function before(host, bag) {
  if (relevant(bag.byId)) { host.wakes++; return; }
  sleep(host);
}
function after(host, bag) {
  const rev = bag.revision | 0;
  if (host.quietAsleep && rev === host.quietRev) {
    host.skips++;
    return;
  }
  if (relevant(bag.byId)) {
    host.quietAsleep = false;
    host.wakes++;
    return;
  }
  sleep(host);
  host.quietAsleep = true;
  host.quietRev = rev;
}
const bag = { byId: {}, revision: 0 };
const host = {
  slots: makeSlots(), active: 0, drawn: 0, cadence: 0,
  pirate: { elapsed: 0, contactRef: null, contactTarget: null },
  quietAsleep: false, quietRev: -1,
  sleeps: 0, skips: 0, wakes: 0,
};
const fn = ${JSON.stringify(mode)} === 'before' ? before : after;
for (let i = 0; i < 3000; i++) fn(host, bag);
host.sleeps = 0; host.skips = 0; host.wakes = 0;
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(host, bag);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, sleeps: host.sleeps, skips: host.skips, wakes: host.wakes,
  asleep: !!host.quietAsleep, mode: ${JSON.stringify(mode)},
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
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
    beforeMs: before.ms, afterMs: after.ms, speedup: before.ms / after.ms,
    beforeSleeps: before.sleeps, afterSkips: after.skips,
  });
}
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'npc-job-signatures-quiet-sleep-latch',
  primary: 'quiet-npc-job-signatures-relevant-sleep-composite',
  iterations: ITERS, runs: RUNS, capacity: CAP, pairs,
  medianSpeedup: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
};
writeFileSync('artifacts/npc-job-signatures-quiet-sleep-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ medianSpeedup: out.medianSpeedup, minSpeedup: out.minSpeedup, maxSpeedup: out.maxSpeedup }, null, 2));
