#!/usr/bin/env node
// Isolated M3 Hunter origin gate. Not wired in package.json (lead owns integration).
// Run: node scripts/check-hunter-origin.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, ['test/hunter-origin.test.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status || 1);
console.log('[check-hunter-origin] PASS');
