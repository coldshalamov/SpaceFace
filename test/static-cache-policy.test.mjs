import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  ifNoneMatchSatisfied,
  isImmutableReleaseAsset,
  makeWeakEtag,
  resolveStaticCacheControl,
  resolveStaticCacheHeaders,
} = require('../scripts/lib/staticCachePolicy.cjs');

test('release assets are immutable; documents and saves stay no-cache', () => {
  assert.equal(
    resolveStaticCacheControl('assets/ships/release/parts/wholeships/wasp_production_v1.glb'),
    'public, max-age=31536000, immutable',
  );
  assert.equal(isImmutableReleaseAsset('assets/ships/release/parts/foo.ktx2'), true);
  assert.equal(resolveStaticCacheControl('index.html'), 'no-cache');
  assert.equal(resolveStaticCacheControl('src/main.js'), 'no-cache');
  assert.equal(resolveStaticCacheControl('saves/slot1.json'), 'no-cache');
});

test('game server 304s a warm immutable release asset without restaging bytes', async (t) => {
  const { createGameServer } = require('../scripts/lib/gameServer.cjs');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const root = await mkdtemp(join(tmpdir(), 'spaceface-cache-'));
  const dir = join(root, 'assets', 'ships', 'release', 'parts');
  await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }));
  const payload = Buffer.from('glb-bytes-for-cache-policy');
  await writeFile(join(dir, 'hull.glb'), payload);
  t.after(() => rm(root, { recursive: true, force: true }));

  const server = createGameServer({ root, async: false, devDiagnostics: false });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/assets/ships/release/parts/hull.glb`;
  const first = await fetch(url);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  const etag = first.headers.get('etag');
  assert.ok(etag);
  const second = await fetch(url, { headers: { 'If-None-Match': etag } });
  assert.equal(second.status, 304);
});

test('etag 304 uses the shipped header helper against real stats', () => {
  const stats = { size: 1048576, mtimeMs: 1_700_000_000_000, mtime: new Date(1_700_000_000_000) };
  const etag = makeWeakEtag(stats);
  assert.match(etag, /^W\/"/);
  const fresh = resolveStaticCacheHeaders(
    'assets/ships/release/parts/wholeships/wasp_production_v1.glb',
    stats,
    {},
  );
  assert.equal(fresh.notModified, false);
  assert.equal(fresh.headers.ETag, etag);
  assert.equal(fresh.headers['Cache-Control'], 'public, max-age=31536000, immutable');

  const cached = resolveStaticCacheHeaders(
    'assets/ships/release/parts/wholeships/wasp_production_v1.glb',
    stats,
    { 'if-none-match': etag },
  );
  assert.equal(cached.notModified, true);
  assert.equal(ifNoneMatchSatisfied(etag, etag), true);
  assert.equal(ifNoneMatchSatisfied('W/"dead"', etag), false);
});
