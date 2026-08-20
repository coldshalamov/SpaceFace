import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  MIME,
  createGameServer,
  decodeRequestPath,
  isAllowedLoopbackHost,
  isInsideRoot,
  resolveContainedFile,
} = require('../scripts/lib/gameServer.cjs');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function request(port, { urlPath, headers, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        type: res.headers['content-type'] || '',
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function listenServer(t, opts) {
  const server = createGameServer(opts);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}

test('malformed percent-encoding is 400 without leaking a 500 message', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'spaceface-gs-uri-'));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>SpaceFace</title>');
  t.after(() => rm(root, { recursive: true, force: true }));
  const port = await listenServer(t, { root, async: true, devDiagnostics: false });

  for (const urlPath of ['/%ZZ', '/%', '/%E0%A4%A']) {
    const response = await request(port, { urlPath });
    assert.equal(response.status, 400, urlPath);
    assert.equal(response.body, '400 Bad Request');
    assert.doesNotMatch(response.body, /URI malformed|500/);
  }
});

test('foreign Host headers cannot read the loopback tree or save store', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'spaceface-gs-host-'));
  const store = await mkdtemp(path.join(tmpdir(), 'spaceface-gs-store-'));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>SpaceFace</title>');
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(store, { recursive: true, force: true }));
  const port = await listenServer(t, {
    root,
    async: true,
    devDiagnostics: false,
    playerStoreDir: store,
  });

  const blocked = await request(port, {
    urlPath: '/__spaceface_player_store',
    headers: { Host: 'evil.example:8123' },
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body, 'Forbidden');

  const allowed = await request(port, { urlPath: '/__spaceface_player_store' });
  assert.equal(allowed.status, 200);
  assert.match(allowed.body, /"keys"/);
});

test('Windows drive-shaped and parent URL paths stay contained', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'spaceface-gs-path-'));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>SpaceFace</title>');
  await writeFile(path.join(root, 'secret.txt'), 'inside-secret');
  t.after(() => rm(root, { recursive: true, force: true }));
  const port = await listenServer(t, { root, async: true, devDiagnostics: false });

  const drive = await request(port, { urlPath: '/C:/Windows/win.ini' });
  assert.equal(drive.status, 403);
  assert.doesNotMatch(drive.body, /Windows|win\.ini|:/);

  const encodedParent = await request(port, { urlPath: '/%2e%2e/%2e%2e/windows/win.ini' });
  assert.ok(encodedParent.status === 403 || encodedParent.status === 404);
  assert.doesNotMatch(encodedParent.body, /500|URI malformed/);

  const nested = await request(port, { urlPath: '/does-not-exist.glb' });
  assert.equal(nested.status, 404);
  assert.equal(nested.body, '404 Not Found');

  const inside = await request(port, { urlPath: '/secret.txt' });
  assert.equal(inside.status, 200);
  assert.equal(inside.body, 'inside-secret');
});

test('authored cinematic MP4 is served as video/mp4, not octet-stream', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'spaceface-gs-mp4-'));
  const dir = path.join(root, 'assets', 'cinematics');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'C-INTRO-01_6s.mp4'), 'mp4bytes');
  t.after(() => rm(root, { recursive: true, force: true }));
  const port = await listenServer(t, { root, async: true, devDiagnostics: false });

  const response = await request(port, { urlPath: '/assets/cinematics/C-INTRO-01_6s.mp4' });
  assert.equal(response.status, 200);
  assert.equal(response.type, 'video/mp4');
  assert.equal(MIME['.mp4'], 'video/mp4');
  assert.equal(MIME['.webm'], 'video/webm');
});

test('containment helpers reject other-drive and malformed URLs', () => {
  const root = path.resolve('C:\\game');
  assert.equal(isInsideRoot(path.join(root, 'assets', 'ok.glb'), root), true);
  assert.equal(isInsideRoot('C:\\Windows\\win.ini', root), false);
  assert.equal(isInsideRoot('D:\\x', root), false);
  assert.equal(decodeRequestPath('/%ZZ'), null);
  assert.equal(decodeRequestPath('/assets/ok.glb%00.txt'), null);
  assert.equal(decodeRequestPath('/assets/ok.glb'), '/assets/ok.glb');
  assert.equal(resolveContainedFile(root, '/C:/Windows/win.ini'), null);
  assert.equal(isAllowedLoopbackHost('127.0.0.1:8123'), true);
  assert.equal(isAllowedLoopbackHost('localhost:41788'), true);
  assert.equal(isAllowedLoopbackHost('[::1]:8123'), true);
  assert.equal(isAllowedLoopbackHost('evil.example:8123'), false);
  assert.equal(isAllowedLoopbackHost(''), false);
});

test('browser launcher refuses a live server that cannot share desktop saves', async () => {
  const launcher = await readFile(path.join(ROOT, 'scripts', 'launch-browser.mjs'), 'utf8');
  const reuse = launcher.match(/if \(existing\.ok\) \{[\s\S]*?process\.exit\(0\);/)?.[0] || '';
  assert.match(reuse, /process\.exit\(1\)/);
  assert.match(reuse, /cannot share desktop saves/);
  assert.ok(reuse.indexOf('process.exit(1)') < reuse.indexOf('openUrl(GAME_URL)'));
});

test('browser server binds loopback so the save store is not on the LAN', async () => {
  const source = await readFile(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(source, /server\.listen\(PORT, '127\.0\.0\.1'/);
  assert.match(source, /resolveMountedPlayerStoreDir/);
});
