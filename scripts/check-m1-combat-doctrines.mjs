#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts['check:m1:combat-doctrines'], 'node scripts/check-m1-combat-doctrines.mjs');
for (const aggregate of ['check:ai', 'check:sg06']) {
  const matches = pkg.scripts[aggregate].match(/npm run check:m1:combat-doctrines/g) || [];
  assert.equal(matches.length, 1, `${aggregate} wires the M1.5 doctrine gate exactly once`);
}

const result = spawnSync(process.execPath, ['test/combat-doctrines.test.mjs'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status || 1);
console.log('M1 combat doctrine checks OK');
