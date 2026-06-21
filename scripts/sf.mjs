#!/usr/bin/env node
// SpaceFace agent CLI skeleton (SG-07). Every command emits versioned JSON so agents can consume
// results without scraping human logs.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateEvidenceCorpus } from '../src/contracts/evidenceSchemas.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const command = args.shift() || 'help';

if (command === 'help' || command === '--help' || command === '-h') usage(0);
if (command !== 'validate') usage(1, `Unknown command: ${command}`);

const paths = args.filter((arg) => !arg.startsWith('--'));
if (paths.length === 0) {
  paths.push('test/47a.inputs.json', 'test/47a.telemetry.expected.json');
}

const entries = paths.map((path) => readJsonEntry(path));
const validation = validateEvidenceCorpus(entries);
const result = {
  schema: 'spaceface.sfCliResult.v1',
  ok: validation.ok,
  command: 'validate',
  result: validation,
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(validation.ok ? 0 : 1);

function readJsonEntry(path) {
  const rel = path.replace(/\\/g, '/');
  try {
    return {
      path: rel,
      data: JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')),
    };
  } catch (err) {
    return {
      path: rel,
      error: err && err.message ? err.message : String(err),
    };
  }
}

function usage(code, message) {
  if (message) process.stderr.write(message + '\n');
  process.stderr.write('Usage: node scripts/sf.mjs validate [test/47a.inputs.json test/47a.telemetry.expected.json]\n');
  process.exit(code);
}
