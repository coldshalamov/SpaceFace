// Economic red team.
//   node tools/economic-redteam/cli.mjs
//   node tools/economic-redteam/cli.mjs --seed 1845 --sequences 500
//   node tools/economic-redteam/cli.mjs --smoke

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCampaign } from './campaign.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return fallback;
}

const smoke = process.argv.includes('--smoke');
const seed = Number(arg('seed', '1845')) >>> 0;
const sequences = smoke ? 12 : Number(arg('sequences', '500'));
const outputDir = resolve(here, '../../.devshots/economic-redteam');
const outPath = resolve(arg('out', resolve(outputDir, 'report.json')));

mkdirSync(dirname(outPath), { recursive: true });
const report = runCampaign({
  seed,
  sequences,
  outPath,
  receiptPath: resolve(outputDir, 'search-receipt.json'),
});

const lines = [
  `campaign ${report.campaign} ${report.status}`,
  `exploits ${report.exploits.join(', ') || 'none'}`,
  `clean ${report.clean.join(', ') || 'none'}`,
  `unavailable ${report.unavailable.join(', ') || 'none'}`,
  `search ${report.search.sequences} traces, findings ${report.search.findingCount}, mutations ${report.search.mutationCount}`,
  `strategies ${report.strategies.rows.map((row) => `${row.id}:${row.earned}${row.degenerate ? '!' : ''}`).join(' ')}`,
  `critique ${report.critique.holds ? 'holds' : 'FAILED'}`,
  `wrote ${outPath}`,
];
writeFileSync(resolve(outputDir, 'summary.txt'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
if (!report.critique.holds) process.exitCode = 1;
