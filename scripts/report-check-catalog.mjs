import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { buildCheckCatalog } from './lib/checkCatalog.mjs';

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
if (outputIndex >= 0 && !outputPath) {
  console.error('Usage: node scripts/report-check-catalog.mjs [--output <path>]');
  process.exitCode = 2;
} else {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const catalog = buildCheckCatalog(packageJson);
  const json = `${JSON.stringify(catalog, null, 2)}\n`;
  if (outputPath) {
    const resolvedOutput = resolve(outputPath);
    await mkdir(dirname(resolvedOutput), { recursive: true });
    await writeFile(resolvedOutput, json, 'utf8');
  }
  else process.stdout.write(json);
}
