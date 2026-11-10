import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { assertReleasePathSafe, renameReleasePathWithRetry } from '../scripts/lib/releasePackaging.mjs';

const buildSource = await readFile(new URL('../scripts/build-bundle.mjs', import.meta.url), 'utf8');
const begin = buildSource.indexOf('async function recoverPublishedOutput()');
const end = buildSource.indexOf('// Build the production index.html:', begin);
assert.ok(begin >= 0 && end > begin);

function failure(code) { return Object.assign(new Error(`injected ${code}`), { code }); }

async function publisher(t, rejectRename = () => null) {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-publish-retry-'));
  assert.equal(dirname(root), resolve(tmpdir()), 'cleanup owns exactly one created temporary directory');
  t.after(() => rm(root, { recursive: true, force: true }));
  const final = join(root, 'build', 'web');
  const staging = join(root, 'build', 'web.__building');
  const previous = join(root, 'build', 'web.__previous');
  await mkdir(final, { recursive: true });
  await mkdir(staging, { recursive: true });
  await writeFile(join(final, 'release.txt'), 'previous validated release');
  await writeFile(join(staging, 'release.txt'), 'new validated release');
  let elapsed = 0;
  const attempts = [];
  const retry = (from, to) => renameReleasePathWithRetry(from, to, {
    now: () => elapsed,
    wait: async ms => { elapsed += ms; },
    renamePath: async (source, destination) => {
      attempts.push([source, destination]);
      const error = rejectRename(source, destination);
      if (error) throw error;
      await rename(source, destination);
    },
  });
  const operations = new Function('resolve', 'ROOT', 'FINAL_OUT', 'OUT', 'PREVIOUS_OUT',
    'assertReleasePathSafe', 'existsSync', 'renameReleasePathWithRetry', 'rm', 'mkdir',
    `${buildSource.slice(begin, end)}\nreturn { publishOutputDir, recoverPublishedOutput };`)(
    resolve, root, final, staging, previous, assertReleasePathSafe, existsSync, retry, rm, mkdir,
  );
  return { ...operations, final, staging, previous, attempts, elapsed: () => elapsed };
}

test('transient locks on both publication renames retain the atomic validated-output swap', async t => {
  const failed = new Set();
  const f = await publisher(t, (from) => {
    if (failed.has(from)) return null;
    failed.add(from);
    return failure(from.endsWith('web.__building') ? 'EBUSY' : 'EPERM');
  });
  await f.publishOutputDir();
  assert.equal(await readFile(join(f.final, 'release.txt'), 'utf8'), 'new validated release');
  assert.equal(existsSync(f.previous), false);
  assert.equal(existsSync(f.staging), false);
  assert.equal(f.attempts.length, 4);
  assert.equal(f.elapsed(), 200);
});

test('a failed candidate rename restores the prior output through the same bounded retry', async t => {
  const original = failure('EIO');
  let restoreLocked = true;
  const f = await publisher(t, from => {
    if (from.endsWith('web.__building')) return original;
    if (from.endsWith('web.__previous') && restoreLocked) {
      restoreLocked = false;
      return failure('EPERM');
    }
    return null;
  });
  await assert.rejects(f.publishOutputDir(), error => error === original);
  assert.equal(await readFile(join(f.final, 'release.txt'), 'utf8'), 'previous validated release');
  assert.equal(await readFile(join(f.staging, 'release.txt'), 'utf8'), 'new validated release');
  assert.equal(existsSync(f.previous), false);
  assert.equal(f.elapsed(), 100);
});

test('persistent sharing failures expire at three seconds and leave both generations intact', async t => {
  const original = failure('EPERM');
  const f = await publisher(t, () => original);
  await assert.rejects(f.publishOutputDir(), error => error === original);
  assert.equal(f.elapsed(), 3000);
  assert.equal(await readFile(join(f.final, 'release.txt'), 'utf8'), 'previous validated release');
  assert.equal(await readFile(join(f.staging, 'release.txt'), 'utf8'), 'new validated release');
  assert.equal(existsSync(f.previous), false);
});

test('interrupted-publication recovery retries a temporary backup lock', async t => {
  let locked = true;
  const f = await publisher(t, () => {
    if (!locked) return null;
    locked = false;
    return failure('EBUSY');
  });
  await rename(f.final, f.previous);
  await f.recoverPublishedOutput();
  assert.equal(await readFile(join(f.final, 'release.txt'), 'utf8'), 'previous validated release');
  assert.equal(existsSync(f.previous), false);
  assert.equal(f.elapsed(), 100);
});

test('permanent rename errors do not wait or retry', async () => {
  for (const code of ['ENOENT', 'EACCES', 'EEXIST', 'EIO']) {
    const original = failure(code);
    let calls = 0;
    await assert.rejects(renameReleasePathWithRetry('from', 'to', {
      renamePath: async () => { calls++; throw original; },
      wait: () => assert.fail('a permanent rename failure must not wait'),
    }), error => error === original);
    assert.equal(calls, 1);
  }
});
