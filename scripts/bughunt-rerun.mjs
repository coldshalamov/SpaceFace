#!/usr/bin/env node
// Re-run a list of test files, logging only failures. Usage:
//   node scripts/bughunt-rerun.mjs <list-file> <shard-index> <shard-count> <out-log>
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [listFile, shardIdx, shardCount, outLog] = process.argv.slice(2);
const files = readFileSync(listFile, 'utf8').split(/\r?\n/).filter(Boolean);
const mine = files.filter((_, i) => i % Number(shardCount) === Number(shardIdx));
writeFileSync(outLog, `# rerun shard ${shardIdx}/${shardCount} — ${mine.length} files\n`);
for (const f of mine) {
  const r = spawnSync(process.execPath, ['--test', f], { encoding: 'utf8', timeout: 90000 });
  if (r.status !== 0) {
    const tail = (r.stdout || '').split(/\r?\n/).filter((l) => /✖|AssertionError|Error:|failing tests/.test(l)).slice(0, 14).join('\n');
    appendFileSync(outLog, `\n=== FAIL ${f} (exit ${r.status}, signal ${r.signal}) ===\n${tail}\n`);
  }
}
appendFileSync(outLog, `\n# shard done\n`);
