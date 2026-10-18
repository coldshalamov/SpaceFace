import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HASH_BYTE_CAP, verifyHarnessEnvironment } from '../scripts/player-truth/environment.mjs';

const { createGameServer, sourceOverlayDigest } = createRequire(import.meta.url)('../scripts/lib/gameServer.cjs');
const STARTER = 'assets/ships/release/render-packages/kestrel/render-package.json';
const LARGE = 'assets/art/frozen.bin';

function manifest(commit, files) {
  const entries = files.map(([filePath, body]) => {
    const bytes = Buffer.from(body);
    return { path: filePath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      contentBase64: bytes.toString('base64') };
  });
  return { schema: 'spaceface.sourceBaseline.v1', sourceCommit: commit,
    sourceOverlayDigest: sourceOverlayDigest(entries), files: entries };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'spaceface-env-overlay-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  const starter = Buffer.from('{"canonical":true}\n');
  const large = Buffer.alloc(HASH_BYTE_CAP + 1, 1);
  for (const [file, body] of [[STARTER, starter], [LARGE, large]]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), body);
  }
  git('init', '--quiet');
  git('add', '--', STARTER, LARGE);
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.autocrlf=false', 'commit', '--quiet', '-m', 'canonical assets');
  const commit = git('rev-parse', 'HEAD').trim();
  return { root, commit, starter, large };
}

async function listen(t, root, sourceOverlay) {
  const server = createGameServer({ root, devDiagnostics: false, sourceOverlay });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('HEAD overlays pass with dirty asset files while ordinary verification fails', async (t) => {
  const { root, commit, starter, large } = await fixture(t);
  await writeFile(path.join(root, STARTER), 'foreign work in progress');
  await writeFile(path.join(root, LARGE), 'another foreign asset');
  const pinned = manifest(commit, [[STARTER, starter], [LARGE, large]]);
  const manifestPath = path.join(root, 'baseline.json');
  await writeFile(manifestPath, JSON.stringify(pinned));
  const baseUrl = await listen(t, root, manifestPath);
  const canonical = await verifyHarnessEnvironment({ root, baseUrl, sourceOverlay: manifestPath });
  assert.equal(canonical.ok, true, JSON.stringify(canonical.problems));
  assert.equal(canonical.checked, 2);
  assert.equal(canonical.hashed, 2, 'large overlaid bytes also receive the canonical Git blob check');
  const unpinned = await verifyHarnessEnvironment({ root, baseUrl });
  assert.equal(unpinned.ok, false, 'dirty disk cannot pass without the exact validated overlay');
  assert.ok(unpinned.problems.some((p) => p.path === STARTER));
});

test('non-HEAD asset bytes and assets absent from HEAD still fail with a valid overlay manifest', async (t) => {
  const { root, commit, starter, large } = await fixture(t);
  const changed = Buffer.from(large);
  changed[changed.length - 1] = 2;
  const sourceOverlay = manifest(commit, [[STARTER, starter], [LARGE, changed], ['assets/not-in-head.bin', 'extra']]);
  const baseUrl = await listen(t, root, sourceOverlay);
  const result = await verifyHarnessEnvironment({ root, baseUrl, sourceOverlay });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.path === LARGE && p.kind === 'hash'),
    'matching large byte counts cannot hide noncanonical overlay content');
  assert.ok(result.problems.some((p) => p.path === 'assets/not-in-head.bin'));
});

test('canonical overlays do not excuse a wrong server response or other dirty asset paths', async (t) => {
  const { root, commit, starter } = await fixture(t);
  const sourceOverlay = manifest(commit, [[STARTER, starter]]);
  await writeFile(path.join(root, STARTER), 'foreign starter bytes');
  await writeFile(path.join(root, LARGE), 'uncovered dirty asset');
  const baseUrl = await listen(t, root, null);
  const result = await verifyHarnessEnvironment({ root, baseUrl, sourceOverlay });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.path === STARTER), 'the actual served sample remains canonical');
  assert.ok(result.problems.some((p) => p.path === LARGE), 'unpinned disk assets retain their existing checks');
});
