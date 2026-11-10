#!/usr/bin/env node
// Targeted production economy coverage; --wide also runs the five baseline-blocked files.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const wide = process.argv.includes('--wide');
const extra = [
  'nxi-102-106-quote-accepts-capacity.test.mjs', 'nxi-106-partial-fill-receipt.test.mjs',
  'trade-settlement-invariants.test.mjs', 'ending-choice-a-station-surcharge.test.mjs',
  'world-remembers-stations.test.mjs', 'adventure-decisions.test.mjs',
  'dead-wire-offline-receipt.test.mjs', 'infer-b-world-teach.test.mjs',
  'first-hour-economy-floor.test.mjs', 'first-trade-contract.test.mjs',
  'market-driver-presenter.test.mjs', 'market-intel-presenter.test.mjs',
];
const baselineBlocked = new Set([
  'adventure-decisions.test.mjs', 'economy-trade-receipts.test.mjs',
  'economy-trade-refusal.test.mjs', 'inf-086-hold-handling.test.mjs', 'infer-b-world-teach.test.mjs',
]);
const selected = [...new Set([...readdirSync('test').filter(n => /^(economy-|inf-08).*\.test\.mjs$/.test(n)), ...extra])]
  .sort().filter(n => wide || !baselineBlocked.has(n)).map(n => `test/${n}`);
if (!wide) console.log('Targeted suite: --wide includes the five separately recorded baseline-blocked files; see VERIFICATION.md.');
console.log(`Running ${selected.length} files against the production owners.`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...selected], { stdio: 'inherit' });
if (result.error) { console.error(result.error.message); process.exitCode = 1; }
else process.exitCode = result.status ?? 1;
