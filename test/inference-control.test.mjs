import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('active INFERENCE control surface remains production-first without proof bureaucracy', () => {
  const result = spawnSync(process.execPath, ['scripts/check-inference-control.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `checker failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
});
