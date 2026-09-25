/**
 * Isolated floor capture for #163 combatOutcome quiet-latch.
 * Spawns child processes per pair (off/on) like #161.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const RUNS = Number(process.env.RUNS || 5);
const PAIRS = Number(process.env.PAIRS || 11);
const script = new URL('./combat-outcome-quiet-latch-microbench.mjs', import.meta.url).pathname;

const runMedians = [];
const runMins = [];
const all = [];

for (let r = 0; r < RUNS; r++) {
  const speeds = [];
  for (let p = 0; p < PAIRS; p++) {
    const env = { ...process.env, MODE: 'pair', ITERS: process.env.ITERS || '30000', OUT: '/tmp/co-pair.json', N: '40' };
    const res = spawnSync(process.execPath, ['--expose-gc', script], {
      encoding: 'utf8', env, cwd: process.cwd(),
    });
    if (res.status !== 0) {
      console.error(res.stderr || res.stdout);
      process.exit(res.status || 1);
    }
    const raw = res.stdout.trim();
    const start = raw.indexOf('{');
    const j = JSON.parse(raw.slice(start));
    if (!(j.speedup > 0) || !j.modes?.on?.quietLatched) {
      console.error('bad pair', j);
      process.exit(2);
    }
    speeds.push(j.speedup);
    all.push(j);
  }
  speeds.sort((a, b) => a - b);
  const med = speeds[Math.floor(speeds.length / 2)];
  const min = speeds[0];
  runMedians.push(med);
  runMins.push(min);
  console.log(JSON.stringify({ run: r, medians: med, min, speeds }));
}

runMedians.sort((a, b) => a - b);
runMins.sort((a, b) => a - b);
const summary = {
  RUNS, PAIRS,
  medians: runMedians,
  mins: runMins,
  medianOfMedians: runMedians[Math.floor(runMedians.length / 2)],
  floorMin: Math.min(...runMins),
};
writeFileSync(process.env.SUMMARY || 'artifacts/combat-outcome-quiet-latch-floor-summary.json', JSON.stringify(summary, null, 2));
console.log('SUMMARY', JSON.stringify(summary, null, 2));
