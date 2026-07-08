#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DOC_PATH = 'docs/MASSLINE_MECHANICS.md';

const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const checks = [
  'check:massline:telemetry',
  'check:massline:release',
  'check:massline:release-feedback',
  'check:massline:load',
  'check:massline:snapcatch',
  'check:massline:reelpump',
  'check:massline:target-scoring',
  'check:massline:auto-target',
  'check:massline:threats',
  'check:massline:threat-feedback',
  'check:massline:arc-data',
  'check:massline:arc-render',
  'check:massline:whip-impact',
  'check:massline:whip-feedback',
  'check:impulse:authority',
  'check:impulse:massline-combos',
  'check:mining:bulk-guidance',
  'check:47a:spindle',
  'check:47a:scavenger-threat',
  'check:47a:debris-sling',
  'check:47a:recovery-contested',
  'check:47a:civilian-priority',
  'check:47a:physical-branches',
];

assert.equal(packageJson.scripts['check:massline'], 'node scripts/check-massline-aggregate.mjs',
  'package.json should expose this aggregate as check:massline');
for (const check of checks) {
  const script = packageJson.scripts[check];
  assert(script, `${check} should be registered in package.json`);
  const match = /^node (scripts\/[^ ]+\.mjs)(?:$| )/.exec(script);
  assert(match, `${check} should run a node scripts/*.mjs target`);
  assert(existsSync(join(ROOT, match[1])), `${check} should point at an existing script file: ${match[1]}`);
}

assert(existsSync(join(ROOT, DOC_PATH)), `${DOC_PATH} should exist`);
const doc = readFileSync(join(ROOT, DOC_PATH), 'utf8');
const docLower = doc.toLowerCase();
for (const term of [
  'Massline Mechanics',
  '60 Hz',
  'tether.load',
  'snap-catch',
  'reel-pump',
  'auto-target',
  'threat',
  'arc preview',
  'whip impact',
  'impulse charge',
  'bulk haul',
  '47-A',
]) {
  assert(docLower.includes(term.toLowerCase()), `${DOC_PATH} should document ${term}`);
}

const passed = [];
for (const check of checks) {
  const args = packageJson.scripts[check].split(/\s+/).slice(1);
  execFileSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    maxBuffer: 1024 * 1024 * 64,
  });
  passed.push(check);
}

console.log(`[check-massline] PASS - ${passed.length} child checks green`);
