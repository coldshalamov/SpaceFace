import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ROOT = process.cwd();
const FLOORS = 5;
const results = [];
for (let f = 1; f <= FLOORS; f++) {
  const r = spawnSync(process.execPath, ['artifacts/flyby-focus-empty-quiet-latch-microbench.mjs'], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  // microbench overwrites json each run — read it
  const j = JSON.parse(readFileSync('artifacts/flyby-focus-empty-quiet-latch-microbench.json', 'utf8'));
  results.push({
    floor: f,
    median: j.median,
    minSpeedup: j.minSpeedup,
    absBeforeUsMedian: j.absBeforeUsMedian,
    dirtyWakeOk: !!(j.dirtyWake && j.dirtyWake.ok),
  });
  console.log(JSON.stringify(results[results.length - 1]));
}
const medians = results.map((x) => x.median);
const mins = results.map((x) => x.minSpeedup);
const summary = {
  name: 'flyby-focus-empty-quiet-latch-floor',
  floors: results,
  packageFloor: {
    medians,
    mins,
    floorMinSpeedup: Math.min(...mins),
    medianOfMedians: [...medians].sort((a, b) => a - b)[Math.floor(medians.length / 2)],
  },
  dirtyWakeAllOk: results.every((x) => x.dirtyWakeOk),
};
writeFileSync('artifacts/flyby-focus-empty-quiet-latch-floor-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary.packageFloor, null, 2));
