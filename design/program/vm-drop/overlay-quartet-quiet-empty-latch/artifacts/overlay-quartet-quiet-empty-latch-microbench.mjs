import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ITERS = 200000;
const PAIRS = 13;
const worker = 'artifacts/overlay-quartet-quiet-empty-latch-microbench-worker.mjs';

function runMode(mode) {
  const r = spawnSync(process.execPath, [worker, mode, String(ITERS)], {
    encoding: 'utf8', cwd: process.cwd(), timeout: 120000,
  });
  if (r.status !== 0) throw new Error(mode + ' ' + (r.stderr || r.stdout));
  const toks = (r.stdout || '').trim().split(/\s+/);
  const ms = Number(toks[toks.length - 1]);
  if (!Number.isFinite(ms)) throw new Error('bad ms ' + mode + ' ' + r.stdout);
  return ms;
}

const pairs = [];
for (let i = 0; i < PAIRS; i++) {
  const b = runMode('before');
  const a = runMode('after');
  pairs.push(b / a);
  console.log(`pair ${i}: before=${b.toFixed(2)} after=${a.toFixed(2)} x=${(b/a).toFixed(3)}`);
}
pairs.sort((x,y)=>x-y);
const out = {
  name: 'overlay-quartet-quiet-empty-latch',
  iters: ITERS,
  pairs: PAIRS,
  medianSpeedup: +pairs[(pairs.length-1)>>1].toFixed(3),
  minSpeedup: +Math.min(...pairs).toFixed(3),
  maxSpeedup: +Math.max(...pairs).toFixed(3),
  all: pairs.map(x => +x.toFixed(3)),
};
console.log(JSON.stringify(out, null, 2));
writeFileSync('artifacts/overlay-quartet-quiet-empty-latch-microbench.json', JSON.stringify(out, null, 2));
