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

test('a current-art candidate serves its hash-pinned file and rejects a same-size edit', async (t) => {
  const { root, commit, large } = await fixture(t);
  const file = path.join(root, LARGE);
  const candidate = Buffer.from(large);
  candidate[0] = 2;
  await writeFile(file, candidate);
  const videoPath = 'assets/cinematics/loading.mp4';
  const video = Buffer.from('pinned loading movie bytes');
  await mkdir(path.dirname(path.join(root, videoPath)), { recursive: true });
  await writeFile(path.join(root, videoPath), video);
  const sourceOverlay = manifest(commit, [['index.html', 'candidate runtime']]);
  sourceOverlay.workingTree = true;
  sourceOverlay.assetPins = manifest(commit, [[LARGE, candidate], [videoPath, video]])
    .files.map(({ contentBase64, ...pin }) => pin);
  sourceOverlay.sourceOverlayDigest = sourceOverlayDigest([...sourceOverlay.files, ...sourceOverlay.assetPins]);
  const baseUrl = await listen(t, root, sourceOverlay);
  const identity = await (await fetch(`${baseUrl}/__source_overlay_identity`)).json();
  assert.equal(identity.assetPinCount, 2);
  assert.equal(identity.sourceOverlayDigest, sourceOverlay.sourceOverlayDigest);
  const original = await fetch(`${baseUrl}/${LARGE}`);
  assert.equal(original.status, 200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), candidate);
  const videoUrl = `${baseUrl}/${videoPath}`;
  const segment = await fetch(videoUrl, { headers: { Range: 'bytes=7-13' } });
  assert.equal(segment.status, 206);
  assert.equal(segment.headers.get('accept-ranges'), 'bytes');
  assert.equal(segment.headers.get('content-range'), `bytes 7-13/${video.length}`);
  assert.deepEqual(Buffer.from(await segment.arrayBuffer()), video.subarray(7, 14));
  assert.equal((await fetch(videoUrl, { headers: { Range: 'bytes=99-' } })).status, 416);
  const verified = await verifyHarnessEnvironment({ root, baseUrl, sourceOverlay, candidateAssets: true });
  assert.equal(verified.ok, true, JSON.stringify(verified.problems));
  assert.equal(verified.candidateAssets, 2);
  await assert.rejects(verifyHarnessEnvironment({ root, baseUrl, sourceOverlay }), /require --candidate-source/);

  await writeFile(file, large);
  assert.equal((await fetch(`${baseUrl}/${LARGE}`)).status, 412);
  const changed = await verifyHarnessEnvironment({ root, baseUrl, sourceOverlay, candidateAssets: true });
  assert.equal(changed.ok, false);
  assert.ok(changed.problems.some((problem) => problem.path === LARGE && problem.kind === 'hash'));
});
