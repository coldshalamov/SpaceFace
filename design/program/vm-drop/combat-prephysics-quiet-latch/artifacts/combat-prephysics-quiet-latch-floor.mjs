import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROUNDS = 5;
const medians = [];
const mins = [];
const absBefores = [];
let dirtyWakeOk = true;

for (let r = 0; r < ROUNDS; r++) {
  const out = spawnSync(process.execPath, ['artifacts/combat-prephysics-quiet-latch-microbench.mjs'], {
    encoding: 'utf8',
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (out.status !== 0) {
    console.error(out.stderr || out.stdout);
    throw new Error(`round ${r} failed`);
  }
  const json = JSON.parse(readFileSync('artifacts/combat-prephysics-quiet-latch-microbench.json', 'utf8'));
  writeFileSync(`artifacts/combat-prephysics-quiet-latch-rebench${r + 1}.json`, JSON.stringify(json, null, 2));
  medians.push(json.medianSpeedup);
  mins.push(json.minSpeedup);
  absBefores.push(json.absBeforeUs);
  if (!json.dirtyWake?.dirtyWakeOk) dirtyWakeOk = false;
  console.error(`floor round ${r}: median=${json.medianSpeedup} min=${json.minSpeedup} absBefore=${json.absBeforeUs}`);
}

const summary = {
  rounds: ROUNDS,
  medians,
  mins,
  absBefores,
  floorMin: Math.min(...mins),
  medianRange: [Math.min(...medians), Math.max(...medians)],
  absBeforeRange: [Math.min(...absBefores), Math.max(...absBefores)],
  dirtyWakeOk,
};
writeFileSync('artifacts/combat-prephysics-quiet-latch-floor-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
