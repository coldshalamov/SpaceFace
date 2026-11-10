// One-shot bug-hunt sweep: run each test file, log failures with attribution.
// Synchronous fs writes only — the spawnSync loop starves the event loop, so a
// createWriteStream never opens. Usage: node scripts/bughunt-sweep.mjs <shard> <count> <outLog>
import { readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const [shard, count, out] = process.argv.slice(2);
const si = Number(shard), sc = Number(count);
const files = readdirSync('test').filter((f) => f.endsWith('.test.mjs')).sort();
const mine = files.filter((_, i) => i % sc === si);
const outPath = resolve(out);
writeFileSync(outPath, `shard ${si}/${sc}: ${mine.length} files\n`);
console.log(`shard ${si}/${sc}: ${mine.length} files -> ${outPath}`);

let fail = 0, done = 0;
for (const f of mine) {
  const r = spawnSync(process.execPath, ['--test', `test/${f}`], {
    encoding: 'utf8', timeout: 120000, shell: false,
  });
  done++;
  const text = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) {
    fail++;
    let block = `\n=== FAIL test/${f} (exit ${r.status}, signal ${r.signal || 'none'}) ===\n`;
    for (const line of text.split('\n')) {
      if (/not ok|Error|error:|✖|expected|assert/i.test(line)) block += line + '\n';
    }
    appendFileSync(outPath, block);
  }
  if (done % 100 === 0) console.log(`shard ${si}: ${done}/${mine.length} (${fail} fails)`);
}
appendFileSync(outPath, `\n=== SHARD ${si} DONE: ${fail}/${mine.length} files failed ===\n`);
console.log(`done: ${fail} failures`);
