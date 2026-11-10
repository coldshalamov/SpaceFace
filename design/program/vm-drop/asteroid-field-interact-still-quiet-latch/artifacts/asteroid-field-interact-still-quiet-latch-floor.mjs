/**
 * Isolated child-process floor capture for still-player field-interact latch.
 * Soft-GPU fps not claimed.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const worker = join(__dirname, 'asteroid-field-interact-still-quiet-latch-microbench.mjs');
const N = 5;
const runs = [];

for (let i = 1; i <= N; i++) {
  const r = spawnSync(process.execPath, [worker, 'worker'], {
    encoding: 'utf8',
    cwd: join(__dirname, '..'),
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
  const parsed = JSON.parse(line);
  const near = parsed.quietParkedNearNonempty;
  runs.push(near);
  writeFileSync(
    join(__dirname, `asteroid-field-interact-still-quiet-latch-rebench${i}.json`),
    JSON.stringify(near, null, 2),
  );
  console.log(`rebench${i}: median=${near.medianSpeedup} min=${near.minSpeedup} max=${near.maxSpeedup}`);
}

const medians = runs.map((r) => r.medianSpeedup);
const mins = runs.map((r) => r.minSpeedup);
const summary = {
  name: 'asteroid-field-interact-still-quiet-latch-floor',
  packageRuns: N,
  medians,
  mins,
  floorMinSpeedup: Math.min(...mins),
  medianOfMedians: medians.slice().sort((a, b) => a - b)[(medians.length - 1) >> 1],
  clears15x: Math.min(...mins) >= 1.5,
};
console.log(JSON.stringify(summary, null, 2));
writeFileSync(
  join(__dirname, 'asteroid-field-interact-still-quiet-latch-floor-summary.json'),
  JSON.stringify(summary, null, 2),
);
