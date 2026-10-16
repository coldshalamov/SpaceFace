import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  createGameServer,
  loadSourceOverlayManifest,
  sourceOverlayDigest,
} = require('../scripts/lib/gameServer.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function manifest(files) {
  const entries = files.map(([filePath, body]) => {
    const bytes = Buffer.from(body);
    return {
      path: filePath,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      contentBase64: bytes.toString('base64'),
    };
  });
  return {
    schema: 'spaceface.sourceBaseline.v1',
    sourceCommit: 'a'.repeat(40),
    sourceOverlayDigest: sourceOverlayDigest(entries),
    files: entries,
  };
}

async function listen(t, root, sourceOverlay) {
  const server = createGameServer({ root, async: true, devDiagnostics: false, sourceOverlay });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('source overlay replaces only explicitly pinned runtime files and publishes identity', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'spaceface-source-overlay-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), 'current-index');
  await writeFile(path.join(root, 'src', 'pinned.js'), 'current-runtime');
  await writeFile(path.join(root, 'assets', 'live.bin'), 'current-asset');
  t.after(() => rm(root, { recursive: true, force: true }));

  const pinned = manifest([
    ['index.html', 'frozen-index'],
    ['src/pinned.js', 'frozen-runtime'],
  ]);
  const manifestPath = path.join(root, 'baseline.json');
  await writeFile(manifestPath, JSON.stringify(pinned), 'utf8');
  const baseUrl = await listen(t, root, manifestPath);

  const index = await fetch(`${baseUrl}/`);
  assert.equal(index.status, 200);
  assert.equal(await index.text(), 'frozen-index');
  assert.equal(index.headers.get('x-spaceface-source-file-sha256'), pinned.files[0].sha256);
  assert.equal(index.headers.get('x-spaceface-source-overlay-digest'), pinned.sourceOverlayDigest);

  const runtime = await fetch(`${baseUrl}/src/pinned.js`);
  assert.equal(await runtime.text(), 'frozen-runtime');
  const asset = await fetch(`${baseUrl}/assets/live.bin`);
  assert.equal(await asset.text(), 'current-asset');

  const identity = await fetch(`${baseUrl}/__source_overlay_identity`);
  assert.equal(identity.status, 200);
  assert.deepEqual(await identity.json(), {
    schema: 'spaceface.sourceBaseline.v1',
    sourceCommit: 'a'.repeat(40),
    sourceOverlayDigest: pinned.sourceOverlayDigest,
    fileCount: 2,
    totalBytes: 'frozen-indexfrozen-runtime'.length,
    files: pinned.files.map(({ path: filePath, bytes, sha256 }) => ({ path: filePath, bytes, sha256 })),
  });
});

test('source overlay fails closed on a tampered entry', () => {
  const bad = manifest([['src/pinned.js', 'frozen-runtime']]);
  bad.files[0].contentBase64 = Buffer.from('frozen-runtimx').toString('base64');
  assert.throws(() => loadSourceOverlayManifest(bad), /hash mismatch/i);
  assert.throws(() => loadSourceOverlayManifest({
    ...manifest([['assets/live.bin', 'must stay canonical']]),
  }), /allowlist/i);
});

test('only the exact Three vendor module can be pinned and served with verified frozen bytes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'spaceface-three-overlay-'));
  await mkdir(path.join(root, 'vendor'), { recursive: true });
  await writeFile(path.join(root, 'vendor', 'three.module.js'), 'export const version = "current";\n');
  await writeFile(path.join(root, 'vendor', 'three.core.js'), 'canonical-core');
  t.after(() => rm(root, { recursive: true, force: true }));
  const frozen = Buffer.from('export const version = "frozen";\n');
  const pinned = manifest([['vendor/three.module.js', frozen]]);
  const baseUrl = await listen(t, root, pinned);
  const response = await fetch(`${baseUrl}/vendor/three.module.js?version=old`);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), frozen);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.equal(response.headers.get('x-spaceface-source-file-sha256'), pinned.files[0].sha256);
  assert.equal(response.headers.get('x-spaceface-source-overlay-digest'), pinned.sourceOverlayDigest);
  assert.equal(await (await fetch(`${baseUrl}/vendor/three.core.js`)).text(), 'canonical-core');

  for (const filePath of [
    'vendor/three.core.js', 'vendor/three.module.js.map', 'vendor/addons/Other.js',
    '.env', 'vendor/.env', 'vendor/../secrets.json', '../vendor/three.module.js',
    'vendor/three.module.js/../../outside.js',
  ]) {
    assert.throws(() => loadSourceOverlayManifest(manifest([[filePath, 'forbidden']])), /allowlist/i, filePath);
  }
  const tampered = manifest([['vendor/three.module.js', frozen]]);
  tampered.files[0].contentBase64 = Buffer.from('export const version = "broken";\n').toString('base64');
  assert.throws(() => loadSourceOverlayManifest(tampered), /hash mismatch/i);
});

test('source overlay accepts the complete runtime budget and rejects totals above 128 MiB', () => {
  const payload = Buffer.alloc(8 * 1024 * 1024, 0x5a);
  const makeLargeManifest = (fileCount, byteLength) => {
    const bytes = payload.subarray(0, byteLength);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const contentBase64 = bytes.toString('base64');
    const files = Array.from({ length: fileCount }, (_, index) => ({
      path: `src/overlay-budget-${index}.js`,
      bytes: byteLength,
      sha256,
      contentBase64,
    }));
    return {
      schema: 'spaceface.sourceBaseline.v1',
      sourceCommit: 'a'.repeat(40),
      sourceOverlayDigest: sourceOverlayDigest(files),
      files,
    };
  };

  const accepted = loadSourceOverlayManifest(makeLargeManifest(9, payload.length));
  assert.equal(accepted.identity.totalBytes, 9 * payload.length);
  assert.ok(accepted.identity.totalBytes > 64 * 1024 * 1024);
  assert.throws(
    () => loadSourceOverlayManifest(makeLargeManifest(17, 7_900_000)),
    /exceeds the total byte limit/i,
  );
});

test('frozen stylesheet bytes are served with the same immutable overlay identity', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'spaceface-style-overlay-'));
  await mkdir(path.join(root, 'styles'), { recursive: true });
  await writeFile(path.join(root, 'styles', 'kit.css'), 'body { color: red }');
  t.after(() => rm(root, { recursive: true, force: true }));
  const pinned = manifest([['styles/kit.css', 'body { color: blue }']]);
  const baseUrl = await listen(t, root, pinned);
  const response = await fetch(`${baseUrl}/styles/kit.css`);
  assert.equal(await response.text(), 'body { color: blue }');
  assert.equal(response.headers.get('x-spaceface-source-overlay-digest'), pinned.sourceOverlayDigest);
  assert.throws(() => loadSourceOverlayManifest(manifest([['styles/../../outside.css', 'bad']])), /allowlist/i);
});

test('ordinary server launches remain canonical and expose no overlay identity', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'spaceface-source-overlay-default-'));
  await writeFile(path.join(root, 'index.html'), 'current-index');
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseUrl = await listen(t, root, undefined);
  const page = await fetch(`${baseUrl}/`);
  assert.equal(await page.text(), 'current-index');
  const identity = await fetch(`${baseUrl}/__source_overlay_identity`);
  assert.equal(identity.status, 404);
});

test('creator captures exact frozen git bytes into an ignored manifest', async (t) => {
  const name = `source-overlay-${process.pid}-${Date.now()}`;
  const output = path.join(ROOT, '.devshots', 'source-baselines', `${name}.json`);
  t.after(() => rm(output, { force: true }));
  execFileSync(process.execPath, [
    'scripts/create-source-baseline.mjs',
    '--name=' + name,
    '--path=index.html',
    '--path=src/main.js',
    '--path=vendor/three.module.js',
  ], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  const created = JSON.parse(await readFile(output, 'utf8'));
  assert.match(created.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(created.files.length, 3);
  for (const entry of created.files) {
    const expected = execFileSync('git', ['show', `${created.sourceCommit}:${entry.path}`], {
      cwd: ROOT, encoding: 'buffer', windowsHide: true,
    });
    assert.equal(entry.contentBase64, expected.toString('base64'), entry.path);
    assert.equal(entry.sha256, createHash('sha256').update(expected).digest('hex'), entry.path);
  }
  assert.doesNotThrow(() => loadSourceOverlayManifest(created));
});
