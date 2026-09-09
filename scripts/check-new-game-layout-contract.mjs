#!/usr/bin/env node
// Fast contract guard for the New Game browser geometry probe and its evidence modes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { countGateInvocations } from './lib/ciGateGraph.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};
const probe = readFileSync(join(ROOT, 'scripts', 'check-new-game-layout.mjs'), 'utf8');

assert.equal(scripts['check:new-game-layout'], 'node scripts/check-new-game-layout.mjs',
  'headed New Game layout check must remain the visual-evidence default');
assert.match(scripts['check:new-game-layout:ci'] || '', /check-new-game-layout\.mjs --headless/,
  'CI New Game layout check must run the same real geometry probe headlessly');

// Both aggregates must run the headless geometry probe exactly once. `check:ci` is a one-line
// delegation to the ci-report runner, so counting `npm run` strings inside its body sees nothing;
// countGateInvocations resolves that delegation to the matrix the runner actually expands. Exactly
// once in each — not "at least once", because a duplicated probe is wasted browser time in CI.
for (const rootScript of ['check', 'check:ci']) {
  assert.equal(countGateInvocations(scripts, rootScript, 'check:new-game-layout:ci'), 1,
    `${rootScript} must reach the headless New Game geometry gate exactly once`);
}

assert.match(probe, /--headless/, 'layout probe must expose explicit headless mode');
assert.match(probe, /--headed/, 'layout probe must retain explicit headed mode');
assert.match(probe, /--force-record-red/, 'RED evidence overwrite must require an explicit force option');
assert.match(probe, /existsSync/, 'RED evidence mode must check for existing immutable artifacts');
assert.match(probe, /Refusing to overwrite historical RED evidence/,
  'RED evidence guard must fail with a clear immutability message');
for (const artifact of [
  'red-layout-report.json',
  'tdd-red.log',
  'before-1024x768.png',
  'before-1280x720.png',
  'before-1440x900.png',
]) {
  assert.match(probe, new RegExp(artifact.replaceAll('.', '\\.')),
    `RED overwrite guard must cover ${artifact}`);
}

console.log('PASS New Game layout contract - headed evidence, headless CI, and immutable RED artifacts.');
