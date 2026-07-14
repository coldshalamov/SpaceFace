#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runM6PlatformMatrix,
  validateM6PlatformMatrix,
} from './lib/m6PlatformMatrix.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const supported = new Set(['--capture-headed', '--json']);
for (const argument of args) {
  if (!supported.has(argument)) throw new Error(`unknown argument: ${argument}`);
}

const result = await runM6PlatformMatrix({
  root: ROOT,
  captureHeaded: args.includes('--capture-headed'),
  log: (line) => console.log(line),
});
const validation = validateM6PlatformMatrix(result);
if (!validation.pass) {
  result.pass = false;
  result.failures.push(...validation.failures.map((failure) => `matrix-contract: ${failure}`));
}

const outputPath = path.join(ROOT, '.devshots', 'spec2', 'm6-platform-matrix.json');
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

if (args.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`[check-m6-platform] ${result.pass ? 'PASS' : 'FAIL'} ${result.matrixDigest}`);
  for (const wave of result.waves) {
    console.log(`  ${wave.pass ? 'PASS' : 'FAIL'} ${wave.id} (${wave.checks.filter((check) => check.pass).length}/${wave.checks.length})`);
  }
  for (const failure of result.failures.slice(0, 20)) console.error(`  - ${failure}`);
  console.log(`[check-m6-platform] receipt: ${path.relative(ROOT, outputPath)}`);
}

process.exitCode = result.pass ? 0 : 1;
