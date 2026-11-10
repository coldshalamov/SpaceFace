/**
 * Package floor: 5× isolated 11-pair microbenches @ 60k.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROUNDS = 5;
const rounds = [];
for (let r = 0; r < ROUNDS; r++) {
  const out = spawnSync(process.execPath, ['--expose-gc', 'artifacts/bark-director-quiet-latch-microbench.mjs'], {
    encoding: 'utf8',
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (out.status !== 0) {
    console.error(out.stderr || out.stdout);
    throw new Error(`floor round ${r} failed`);
  }
  const text = out.stdout || '';
  const start = text.lastIndexOf('{');
  // find matching top-level JSON by parsing from each '{' near the end
  let parsed = null;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] !== '{') continue;
    try {
      parsed = JSON.parse(text.slice(i));
      if (parsed && typeof parsed.medianSpeedup === 'number') break;
      parsed = null;
    } catch {}
  }
  // Also try: the microbench writes artifacts/bark-director-quiet-latch-microbench.json
  if (!parsed) {
    parsed = JSON.parse(readFileSync('artifacts/bark-director-quiet-latch-microbench.json', 'utf8'));
  }
  rounds.push(parsed);
  console.error(`floor round ${r}: median=${parsed.medianSpeedup} min=${parsed.minSpeedup} beforeUs=${parsed.medianBeforeUs} wake=${parsed.dirtyWake?.dirtyWakeOk}`);
  writeFileSync(`artifacts/bark-director-quiet-latch-rebench${r + 1}.json`, JSON.stringify(parsed, null, 2));
}

const medians = rounds.map((x) => x.medianSpeedup);
const mins = rounds.map((x) => x.minSpeedup);
const summary = {
  rounds: ROUNDS,
  medians,
  mins,
  floorMin: Math.min(...mins),
  floorMedianOfMedians: medians.slice().sort((a, b) => a - b)[(medians.length - 1) >> 1],
  absBeforeUs: rounds.map((x) => x.medianBeforeUs),
  dirtyWakeOk: rounds.every((x) => x.dirtyWake && x.dirtyWake.dirtyWakeOk === true),
};
writeFileSync('artifacts/bark-director-quiet-latch-floor-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
