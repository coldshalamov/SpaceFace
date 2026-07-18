import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('release asset build help exits before lock acquisition', () => {
  const result = spawnSync(process.execPath, ['scripts/build-sg04-release-assets.mjs', '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /--only <id\[,id\.\.\.\]>/);
  assert.match(result.stdout, /without acquiring the release lock/);
  assert.doesNotMatch(result.stderr, /release build lock/i);
});
