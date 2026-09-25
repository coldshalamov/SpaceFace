import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bench = join(__dirname, 'decode-runway-empty-far-quiet-latch-microbench.mjs');
const runs = [];
for (let i = 0; i < 5; i++) {
  const res = spawnSync(process.execPath, [bench], {
    encoding: 'utf8',
    cwd: join(__dirname, '..'),
    maxBuffer: 4 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  const json = JSON.parse(res.stdout);
  runs.push(json.empty);
  writeFileSync(join(__dirname, `decode-runway-empty-far-quiet-latch-rebench${i + 1}.json`), JSON.stringify(json, null, 2));
  console.log(`rebench${i + 1}`, json.empty.medianSpeedup, json.empty.minSpeedup);
}
const primary = JSON.parse(
  readFileSync(join(__dirname, 'decode-runway-empty-far-quiet-latch-microbench.json'), 'utf8'),
).empty;
const all = [primary, ...runs];
const summary = {
  primary,
  rebenches: runs,
  medians: all.map((r) => r.medianSpeedup),
  mins: all.map((r) => r.minSpeedup),
  floorMinAcrossPackage: Math.min(...all.map((r) => r.minSpeedup)),
  medianBand: [Math.min(...all.map((r) => r.medianSpeedup)), Math.max(...all.map((r) => r.medianSpeedup))],
};
console.log(JSON.stringify(summary, null, 2));
writeFileSync(join(__dirname, 'decode-runway-empty-far-quiet-latch-floor-summary.json'), JSON.stringify(summary, null, 2));
