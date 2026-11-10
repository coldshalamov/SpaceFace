import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const BENCH = '/tmp/sf-parley-bench/microbench.mjs';
const FLOORS = 5;
const results = [];
for (let i = 1; i <= FLOORS; i++) {
  const out = `/tmp/sf-parley-bench/rebench${i}.json`;
  const r = spawnSync(process.execPath, [BENCH, out], { cwd: ROOT, encoding: 'utf8', env: process.env });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  results.push({
    i,
    medianSpeedup: j.medianSpeedup,
    minSpeedup: j.minSpeedup,
    medianBeforeAbsUs: j.medianBeforeAbsUs,
    dirtyWakeOk: j.dirtyWake?.ok === true,
  });
  console.log(`floor ${i}: median=${j.medianSpeedup.toFixed(2)}× min=${j.minSpeedup.toFixed(2)}× dirty=${j.dirtyWake?.ok}`);
}
const summary = {
  floors: results,
  floorMinAcross: Math.min(...results.map((r) => r.minSpeedup)),
  floorMedianRange: [
    Math.min(...results.map((r) => r.medianSpeedup)),
    Math.max(...results.map((r) => r.medianSpeedup)),
  ],
  allDirtyOk: results.every((r) => r.dirtyWakeOk),
};
writeFileSync('/tmp/sf-parley-bench/floor-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
