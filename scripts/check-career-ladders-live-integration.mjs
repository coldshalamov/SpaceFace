#!/usr/bin/env node
// Headless acceptance gate for live Hauler + Hunter + Prospector ladder integration.
// Runs test/career-ladders-live-integration.test.mjs only.
// Does not edit package.json / production. Never inspects SAFE-001.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const testFile = join(root, 'test/career-ladders-live-integration.test.mjs');
const compositeFile = join(root, 'src/careers/ladders/liveCareerLadderBranches.js');

assert.equal(typeof window, 'undefined', 'career ladders live integration check must run headless');
assert.ok(existsSync(testFile), 'test/career-ladders-live-integration.test.mjs must exist');

// Brief poll: composite may land from a parallel agent before this gate runs.
async function ensureComposite(maxWaitMs = 8000, stepMs = 250) {
  const deadline = Date.now() + maxWaitMs;
  while (!existsSync(compositeFile) && Date.now() < deadline) {
    await delay(stepMs);
  }
  assert.ok(
    existsSync(compositeFile),
    'src/careers/ladders/liveCareerLadderBranches.js must export createLiveCareerLadderBranchesSystem',
  );
}

await ensureComposite();

const result = spawnSync(
  process.execPath,
  ['--test', testFile],
  { cwd: root, stdio: 'inherit', env: process.env },
);

if (result.status !== 0) {
  console.error('[check-career-ladders-live-integration] FAIL');
  process.exit(result.status || 1);
}

console.log('[check-career-ladders-live-integration] PASS');
