/**
 * Primary KPI: quiet _updateMomentumSinkPresentation when combat.entities has
 * no MOMENTUM_SINK statuses (settled flight residual under prepareFrame / vfx).
 * Before = for-in combat.entities + status probe every cadence tick.
 * After  = latch after first empty collect; wake on statusNextPendingSeq.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const ENTITIES = 48;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const ITERS = ${ITERS};
const ENTITIES = ${ENTITIES};
const MOMENTUM_SINK_STATUS_ID = 'momentum_sink';
const CAP = 6;

function makeRuntimes() {
  const runtimes = Object.create(null);
  for (let i = 0; i < ENTITIES; i++) {
    runtimes['e' + i] = {
      statuses: i === 7 ? { other: { expiresTick: 1e9 } } : {},
    };
  }
  return runtimes;
}

function collectBefore(host) {
  const runtimes = host.runtimes;
  let count = 0;
  for (const id in runtimes) {
    const rt = runtimes[id];
    if (!rt || !rt.statuses || !rt.statuses[MOMENTUM_SINK_STATUS_ID]) continue;
    count++;
    if (count >= CAP) break;
  }
  host.walks++;
  return count;
}

function collectAfter(host) {
  const seq = host.statusNextPendingSeq;
  if (host.quietEmpty && seq === host.quietSeq) {
    host.skips++;
    return 0;
  }
  const count = collectBefore(host);
  if (count === 0) {
    host.quietEmpty = true;
    host.quietSeq = seq;
  } else {
    host.quietEmpty = false;
  }
  return count;
}

const host = {
  runtimes: makeRuntimes(),
  statusNextPendingSeq: 1,
  quietEmpty: false,
  quietSeq: -1,
  walks: 0,
  skips: 0,
};
const fn = ${JSON.stringify(mode)} === 'before' ? collectBefore : collectAfter;
for (let i = 0; i < 3000; i++) fn(host);
host.walks = 0; host.skips = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) fn(host);
console.log(JSON.stringify({
  ms: performance.now() - t0,
  walks: host.walks,
  skips: host.skips,
  quiet: !!host.quietEmpty,
  mode: ${JSON.stringify(mode)},
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout.trim().split('\\n').pop());
}

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  return a[(a.length - 1) >> 1];
}

const pairs = [];
for (let run = 0; run < RUNS; run++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: before.ms / Math.max(1e-9, after.ms),
    beforeWalks: before.walks,
    afterWalks: after.walks,
    afterSkips: after.skips,
  });
}
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'momentum-sink-quiet-empty-latch',
  primary: 'quiet-momentum-sink-empty-combat-walk',
  iterations: ITERS,
  runs: RUNS,
  entities: ENTITIES,
  pairs,
  medianSpeedup: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
};
writeFileSync('artifacts/momentum-sink-quiet-empty-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  medianSpeedup: out.medianSpeedup,
  minSpeedup: out.minSpeedup,
  maxSpeedup: out.maxSpeedup,
  pairs: pairs.map((p) => +p.speedup.toFixed(3)),
}, null, 2));
