import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ROOT = process.cwd();
const FLOORS = 5;
const medians = [];
const mins = [];
for (let f = 0; f < FLOORS; f++) {
  const r = spawnSync(process.execPath, ['artifacts/bounty-hunt-empty-quiet-latch-microbench.mjs'], {
    cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  const j = JSON.parse(readFileSync('artifacts/bounty-hunt-empty-quiet-latch-microbench.json', 'utf8'));
  medians.push(+j.medianSpeedup.toFixed(3));
  mins.push(+j.minSpeedup.toFixed(3));
  console.error(`floor ${f}: median=${j.medianSpeedup.toFixed(3)} min=${j.minSpeedup.toFixed(3)} dirty=${j.dirtyWake && j.dirtyWake.ok}`);
  writeFileSync(`artifacts/bounty-hunt-empty-quiet-latch-rebench${f + 1}.json`, JSON.stringify(j, null, 2));
}
const out = {
  name: 'bounty-hunt-empty-quiet-latch',
  floors: FLOORS,
  medians,
  mins,
  floorMinSpeedup: Math.min(...mins),
  floorMedianOfMedians: [...medians].sort((a, b) => a - b)[Math.floor(medians.length / 2)],
};
writeFileSync('artifacts/bounty-hunt-empty-quiet-latch-floor-summary.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
