/** 5× isolated 11-pair floor captures for postPhysics quiet skip. */
import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const captures = [];
for (let c = 1; c <= 5; c++) {
  const r = spawnSync(process.execPath, ['artifacts/combat-postphysics-quiet-skip-microbench.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`capture ${c} failed`);
  }
  const raw = JSON.parse(readFileSync('artifacts/combat-postphysics-quiet-skip-microbench.json', 'utf8'));
  writeFileSync(`artifacts/combat-postphysics-quiet-skip-rebench${c}.json`, JSON.stringify(raw, null, 2));
  captures.push({
    capture: c,
    medianSpeedup: raw.medianSpeedup,
    minSpeedup: raw.minSpeedup,
    maxSpeedup: raw.maxSpeedup,
    absBeforeUsMedian: raw.absBeforeUsMedian,
    absAfterUsMedian: raw.absAfterUsMedian,
    dirtyWakeOk: raw.dirtyWakeOk,
  });
  console.log(`capture ${c}: median=${raw.medianSpeedup.toFixed(3)}× min=${raw.minSpeedup.toFixed(3)}× absBefore=${raw.absBeforeUsMedian.toFixed(2)}µs dirtyWake=${raw.dirtyWakeOk}`);
}

const medians = captures.map(c => c.medianSpeedup);
const mins = captures.map(c => c.minSpeedup);
const summary = {
  captures,
  packageMedianRange: [Math.min(...medians), Math.max(...medians)],
  packageFloorMin: Math.min(...mins),
  allDirtyWakeOk: captures.every(c => c.dirtyWakeOk === true),
};
writeFileSync('artifacts/combat-postphysics-quiet-skip-floor-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
