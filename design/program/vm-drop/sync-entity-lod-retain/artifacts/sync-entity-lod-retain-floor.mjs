/** 5 × 11-pair isolated floor for #157 sync-entity-lod-retain. */
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RUNS = 5;
const PAIRS = 11;
const results = [];

for (let run = 0; run < RUNS; run++) {
  const speedups = [];
  for (let p = 0; p < PAIRS; p++) {
    const outPath = join(tmpdir(), `sf-lod-retain-${run}-${p}.json`);
    const r = spawnSync(process.execPath, [
      '--expose-gc',
      'artifacts/sync-entity-lod-retain-microbench.mjs',
      '--child-pair', outPath,
    ], { encoding: 'utf8', cwd: process.cwd() });
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      process.exit(1);
    }
    const pair = JSON.parse(readFileSync(outPath, 'utf8'));
    try { unlinkSync(outPath); } catch (_) {}
    speedups.push(pair.speedup);
  }
  speedups.sort((a, b) => a - b);
  const median = speedups[Math.floor(speedups.length / 2)];
  const floor = speedups[0];
  results.push({ run: run + 1, median, floor, speedups });
  console.log(`run ${run + 1}: median=${median} floor=${floor}`);
}

const medians = results.map((r) => r.median);
const floors = results.map((r) => r.floor);
const summary = {
  runs: results,
  packageMedianRange: [Math.min(...medians), Math.max(...medians)],
  packageFloorMin: Math.min(...floors),
  clears15x: Math.min(...floors) >= 1.5,
};
writeFileSync('artifacts/sync-entity-lod-retain-floor-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
