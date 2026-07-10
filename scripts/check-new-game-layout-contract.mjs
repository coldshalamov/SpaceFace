#!/usr/bin/env node
// Fast contract guard for the New Game browser geometry probe and its evidence modes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};
const probe = readFileSync(join(ROOT, 'scripts', 'check-new-game-layout.mjs'), 'utf8');

assert.equal(scripts['check:new-game-layout'], 'node scripts/check-new-game-layout.mjs',
  'headed New Game layout check must remain the visual-evidence default');
assert.match(scripts['check:new-game-layout:ci'] || '', /check-new-game-layout\.mjs --headless/,
  'CI New Game layout check must run the same real geometry probe headlessly');

for (const rootScript of ['check', 'check:ci']) {
  assert.equal(countTransitiveRuns(rootScript, 'check:new-game-layout:ci'), 1,
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

function countTransitiveRuns(scriptName, target, stack = []) {
  if (scriptName === target) return 1;
  assert(!stack.includes(scriptName), `npm script cycle: ${[...stack, scriptName].join(' -> ')}`);
  const command = String(scripts[scriptName] || '');
  let total = 0;
  for (const match of command.matchAll(/\bnpm run ([a-zA-Z0-9:_-]+)/g)) {
    total += countTransitiveRuns(match[1], target, [...stack, scriptName]);
  }
  return total;
}
