import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { sourceOverlayDigest } = createRequire(import.meta.url)('../scripts/lib/gameServer.cjs');

function runCreator(name, extraArgs = []) {
  const output = path.join(ROOT, '.devshots', 'source-baselines', `${name}.json`);
  execFileSync(process.execPath, [
    'scripts/create-source-baseline.mjs',
    `--name=${name}`,
    ...extraArgs,
  ], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return output;
}

function gitPaths(commit, prefix, include = () => true) {
  return String(execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', commit, '--', prefix], {
    cwd: ROOT, encoding: 'utf8', windowsHide: true,
  })).split('\0')
    .map((entry) => entry.replace(/\\/g, '/'))
    .filter((entry) => entry.startsWith(`${prefix}/`) && include(entry))
    .sort();
}

function frozenBytes(commit, relativePath) {
  return execFileSync('git', ['show', `${commit}:${relativePath}`], {
    cwd: ROOT, encoding: 'buffer', windowsHide: true,
  });
}

function assertExactEntry(manifest, relativePath, expected) {
  const entry = manifest.files.find((candidate) => candidate.path === relativePath);
  assert.ok(entry, `manifest should include ${relativePath}`);
  assert.equal(entry.bytes, expected.length, relativePath);
  assert.equal(entry.sha256, createHash('sha256').update(expected).digest('hex'), relativePath);
  assert.deepEqual(Buffer.from(entry.contentBase64, 'base64'), expected, relativePath);
}

test('all-runtime frozen baselines include the command channel and complete style/runtime closure', async (t) => {
  const name = `source-baseline-closure-${process.pid}-${Date.now()}`;
  const output = runCreator(name, ['--commit=HEAD~1', '--all-runtime']);
  t.after(() => rm(output, { force: true }));
  const manifest = JSON.parse(await readFile(output, 'utf8'));
  const byPath = new Set(manifest.files.map((entry) => entry.path));

  assert.equal(manifest.sourceMode, 'git-commit-all-runtime');
  assert.equal(manifest.captureScope, 'all-runtime');
  assert.equal(manifest.workingTree, false);
  assert.equal(
    manifest.runtimePathPolicy,
    'index.html + src/**/*.js + scripts/lib/**/*.{js,mjs,cjs} + styles/**/*',
  );
  assert.deepEqual(manifest.omittedPaths, []);
  assert.equal(manifest.sourceOverlayDigest, sourceOverlayDigest(manifest.files));

  const commandChannel = 'scripts/lib/simCommandChannel.mjs';
  const knownCss = 'styles/ui.css';
  assertExactEntry(manifest, commandChannel, frozenBytes(manifest.sourceCommit, commandChannel));
  assertExactEntry(manifest, knownCss, frozenBytes(manifest.sourceCommit, knownCss));

  for (const relativePath of gitPaths(manifest.sourceCommit, 'scripts/lib', (entry) =>
    /\.(?:js|mjs|cjs)$/i.test(entry))) {
    assert.ok(byPath.has(relativePath), `runtime dependency omitted: ${relativePath}`);
  }
  for (const relativePath of gitPaths(manifest.sourceCommit, 'styles')) {
    assert.ok(byPath.has(relativePath), `style resource omitted: ${relativePath}`);
  }
});

test('all-runtime working-tree baselines pin current command-channel and style bytes', async (t) => {
  const name = `source-baseline-working-tree-${process.pid}-${Date.now()}`;
  const output = runCreator(name, ['--working-tree', '--all-runtime']);
  t.after(() => rm(output, { force: true }));
  const manifest = JSON.parse(await readFile(output, 'utf8'));
  const currentCommandChannel = await readFile(path.join(ROOT, 'scripts/lib/simCommandChannel.mjs'));
  const currentCss = await readFile(path.join(ROOT, 'styles/ui.css'));

  assert.equal(manifest.sourceMode, 'working-tree-all-runtime');
  assert.equal(manifest.captureScope, 'all-runtime');
  assert.equal(manifest.workingTree, true);
  assert.equal(manifest.sourceOverlayDigest, sourceOverlayDigest(manifest.files));
  assertExactEntry(manifest, 'scripts/lib/simCommandChannel.mjs', currentCommandChannel);
  assertExactEntry(manifest, 'styles/ui.css', currentCss);
});
