import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const N = 40;
const RUNS = 5;
const PAIRS = 11;

function onePair() {
  const off = spawnSync(process.execPath, ['--expose-gc', 'artifacts/shield-bubble-quiet-latch-microbench.mjs'], {
    env: { ...process.env, N: String(N), MODE: 'off', ITERS: '30000' },
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  const on = spawnSync(process.execPath, ['--expose-gc', 'artifacts/shield-bubble-quiet-latch-microbench.mjs'], {
    env: { ...process.env, N: String(N), MODE: 'on', ITERS: '30000' },
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  if (off.status !== 0) throw new Error(off.stderr || off.stdout);
  if (on.status !== 0) throw new Error(on.stderr || on.stdout);
  const o = JSON.parse(off.stdout.trim().split('\n').pop());
  const n = JSON.parse(on.stdout.trim().split('\n').pop());
  return { offUs: o.us, onUs: n.us, speedup: o.us / n.us };
}

const runSummaries = [];
for (let r = 0; r < RUNS; r++) {
  const pairs = [];
  for (let i = 0; i < PAIRS; i++) pairs.push(onePair());
  const ups = pairs.map((p) => p.speedup).sort((a, b) => a - b);
  const offs = pairs.map((p) => p.offUs).sort((a, b) => a - b);
  runSummaries.push({
    run: r + 1,
    median: ups[Math.floor(ups.length / 2)],
    min: ups[0],
    max: ups[ups.length - 1],
    absBeforeMedian: offs[Math.floor(offs.length / 2)],
  });
}
const medians = runSummaries.map((s) => s.median);
const mins = runSummaries.map((s) => s.min);
const out = {
  N,
  RUNS,
  PAIRS,
  runSummaries,
  medianRange: [Math.min(...medians), Math.max(...medians)],
  floorMin: Math.min(...mins),
};
console.log(JSON.stringify(out, null, 2));
writeFileSync('artifacts/shield-bubble-quiet-latch-floor-summary.json', JSON.stringify(out, null, 2));
