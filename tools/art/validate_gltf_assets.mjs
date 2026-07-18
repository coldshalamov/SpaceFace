#!/usr/bin/env node
// Small reproducible wrapper around the official Khronos glTF Validator npm module.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const args = parseArgs(process.argv.slice(2));
const modulePath = resolve(args.module || 'C:/Users/93rob/AppData/Local/Temp/spaceface-gltf-validator/node_modules/gltf-validator');
const inputs = String(args.input || '').split(',').map((value) => resolve(value.trim())).filter(Boolean);
const outputDir = resolve(args.out || '.devshots/graphics/gltf-validator');
if (!inputs.length) throw new Error('--input requires a comma-separated GLB list');
const validator = require(modulePath);
mkdirSync(outputDir, { recursive: true });
const reports = [];
for (const input of inputs) {
  const bytes = readFileSync(input);
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri: input,
    format: 'glb',
    writeTimestamp: false,
    maxIssues: 0,
  });
  const file = resolve(outputDir, `${input.replaceAll('\\', '/').split('/').pop()}.report.json`);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  reports.push({ input, report: file, counts: report.issues?.numErrors === undefined ? null : {
    errors: report.issues.numErrors,
    warnings: report.issues.numWarnings,
    infos: report.issues.numInfos,
    hints: report.issues.numHints,
  } });
}
const summary = { validatorVersion: validator.version(), reports };
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (reports.some((entry) => entry.counts && (entry.counts.errors || entry.counts.warnings))) process.exitCode = 1;

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    if (!values[index].startsWith('--')) continue;
    const key = values[index].slice(2);
    result[key] = values[index + 1] && !values[index + 1].startsWith('--') ? values[++index] : true;
  }
  return result;
}
