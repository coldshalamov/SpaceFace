#!/usr/bin/env node
// check-non-graphics-ci.mjs - derive a CI lane that skips graphics-owned asset/art checks.
//
// Use this for gameplay/UI/sim polish PRs while art/release outputs are locked. The script never
// edits assets, manifests, release outputs, or render code; it reads package.json and runs the
// existing check:ci/check chain with locked graphics-owned segments removed.
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
  throw new Error('package.json must define check:ci or check before a non-graphics CI lane can be derived.');
}

const lockedPatterns = [
  { re: /\bcheck:art\b/, reason: 'graphics-owned art validation' },
  { re: /\bbuild:sg04:release-assets\b/, reason: 'release asset builder' },
  { re: /\bcheck:assets:live\b/, reason: 'authored asset live probe' },
  { re: /assets\/ships|release\.__lock|release\.__building/, reason: 'locked ship/release output path' },
];

const segments = source.split(/\s+&&\s+/).map((part) => part.trim()).filter(Boolean);
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
  throw new Error('Non-graphics CI derivation removed every segment; package.json check script is malformed.');
}

const command = kept.join(' && ');
for (const entry of lockedPatterns) {
  if (entry.re.test(command)) {
    throw new Error('Non-graphics CI command still references a locked graphics lane: ' + entry.reason);
  }
}

if (args.has('--dry-run') || args.has('--plan')) {
  console.log('Non-graphics CI lane derived from package script: ' + sourceName);
  console.log('Removed locked graphics segment(s):');
  for (const item of removed) console.log('  - ' + item.segment + ' (' + item.reason + ')');
  console.log('\nCommand:');
  console.log(command);
  process.exit(0);
}

console.log('Running non-graphics CI lane from package script: ' + sourceName);
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
  console.error('Non-graphics CI terminated by signal: ' + result.signal);
  process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);
