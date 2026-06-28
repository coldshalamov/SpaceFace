#!/usr/bin/env node
// check-non-graphics-ci.mjs - derive a broad verification lane that skips graphics-owned art work.
//
// Use this while assets/ships/release.__lock or release.__building signal active graphics ownership.
// The script reads package.json, removes locked art/release validation segments from the existing
// check:ci/check command, and either prints or runs the resulting non-graphics gate.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = new Set(process.argv.slice(2));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};
const sourceName = scripts['check:ci'] ? 'check:ci' : 'check';
const source = scripts[sourceName];

if (!source) {
  throw new Error('package.json must define check:ci or check before deriving a non-graphics lane.');
}

const lockedPatterns = [
  { re: /\bcheck:art\b/, reason: 'graphics-owned art validation' },
  { re: /\bcheck:47a:visuals\b/, reason: 'visual asset validation' },
  { re: /\bbuild:sg04:release-assets\b/, reason: 'release asset builder' },
  { re: /\bcheck:assets:live\b/, reason: 'authored asset live probe' },
  { re: /assets[\\/]ships|release\.__lock|release\.__building/, reason: 'locked ship/release output path' },
  { re: /src[\\/]render/, reason: 'graphics renderer lane' },
];

const segments = source.split(/\s+&&\s+/).map((segment) => segment.trim()).filter(Boolean);
const kept = [];
const removed = [];

for (const segment of segments) {
  const hit = lockedPatterns.find((entry) => entry.re.test(segment));
  if (hit) removed.push({ segment, reason: hit.reason });
  else kept.push(segment);
}

if (!removed.length) {
  throw new Error(sourceName + ' did not include a removable graphics-owned segment; refusing to label it non-graphics.');
}
if (!kept.length) {
  throw new Error('Non-graphics lane derivation removed every segment; package.json check script is malformed.');
}

const command = kept.join(' && ');
for (const entry of lockedPatterns) {
  if (entry.re.test(command)) {
    throw new Error('Non-graphics lane still references a locked graphics surface: ' + entry.reason);
  }
}

if (args.has('--dry-run') || args.has('--plan')) {
  console.log('Non-graphics lane derived from package script: ' + sourceName);
  console.log('Removed locked graphics segment(s):');
  for (const item of removed) console.log('  - ' + item.segment + ' (' + item.reason + ')');
  console.log('\nCommand:');
  console.log(command);
  process.exit(0);
}

console.log('Running non-graphics lane from package script: ' + sourceName);
console.log('Skipping locked graphics segment(s): ' + removed.map((item) => item.segment).join('; '));
const result = spawnSync(command, {
  cwd: ROOT,
  shell: true,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error.message || result.error);
  process.exit(1);
}
if (result.signal) {
  console.error('Non-graphics lane terminated by signal: ' + result.signal);
  process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);
