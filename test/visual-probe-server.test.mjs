import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const HELPER_URL = new URL('../scripts/lib/visualProbeServer.mjs', import.meta.url);
const PROBE_PATH = path.join(PROJECT_ROOT, 'scripts', 'probe-ship-visual-stability.mjs');

let acquireVisualProbeServer;
try {
  ({ acquireVisualProbeServer } = await import(HELPER_URL));
} catch (error) {
  assert.fail(`visual probe server lifecycle helper must exist: ${error?.message || error}`);
}

assert.equal(typeof acquireVisualProbeServer, 'function', 'helper exports acquireVisualProbeServer()');

const tempRoot = await mkdtemp(path.join(tmpdir(), 'spaceface-visual-probe-'));
let port8123Decoy = null;
let externalDecoy = null;
let ownedServer = null;

try {
  await writeFile(path.join(tempRoot, 'index.html'), '<!doctype html><title>canonical-spaceface-test</title>\n');

  port8123Decoy = await tryStartDecoy(8123, 'occupied-8123');

  ownedServer = await acquireVisualProbeServer({ explicitUrl: '', root: tempRoot });
  assert.equal(ownedServer.ownsServer, true, 'default acquisition owns its in-process server');
  assert.equal(ownedServer.server?.listening, true, 'default acquisition returns a listening server');
  const ownedUrl = new URL(ownedServer.baseUrl);
  assert.equal(ownedUrl.hostname, '127.0.0.1', 'default server binds the loopback IPv4 interface');
  assert.notEqual(Number(ownedUrl.port), 8123, 'default server uses an OS-assigned port, not 8123');
  assert.equal(Number(ownedUrl.port), ownedServer.server.address().port, 'reported URL matches the actual bound port');

  const indexResponse = await fetch(ownedServer.baseUrl);
  assert.equal(indexResponse.status, 200, 'canonical static server serves the requested root');
  assert.match(indexResponse.headers.get('content-type') || '', /^text\/html\b/, 'canonical MIME policy serves HTML correctly');
  assert.match(await indexResponse.text(), /canonical-spaceface-test/, 'owned server serves the supplied game root');

  const freshnessResponse = await fetch(new URL('/__dev_freshness', ownedServer.baseUrl));
  assert.equal(freshnessResponse.status, 200, 'canonical dev-freshness route is present');
  assert.equal((await freshnessResponse.json()).dev, true, 'canonical dev-freshness payload is returned');

  const closedUrl = ownedServer.baseUrl;
  await ownedServer.close();
  assert.equal(ownedServer.server.listening, false, 'awaited close releases the owned listener');
  await assert.rejects(
    fetch(closedUrl, { signal: AbortSignal.timeout(1000) }),
    'the owned listener is unreachable after close resolves',
  );
  await ownedServer.close();
  ownedServer = null;

  externalDecoy = await startDecoy(0, 'explicit-external-server');
  const externalUrl = `http://127.0.0.1:${externalDecoy.address().port}/preserved?source=contract`;
  const externalServer = await acquireVisualProbeServer({ explicitUrl: externalUrl, root: tempRoot });
  assert.equal(externalServer.baseUrl, externalUrl, 'explicit external URL is preserved exactly');
  assert.equal(externalServer.ownsServer, false, 'explicit external URL remains externally owned');
  assert.equal(externalServer.server, null, 'external acquisition does not create an in-process server');
  await externalServer.close();
  const externalResponse = await fetch(externalUrl);
  assert.equal(await externalResponse.text(), 'explicit-external-server', 'closing the lifecycle record does not close an external server');

  const helperSource = await readFile(fileURLToPath(HELPER_URL), 'utf8');
  assert.match(helperSource, /createRequire\(import\.meta\.url\)/, 'helper uses the supported ESM-to-CJS bridge');
  assert.match(helperSource, /require\(['"]\.\/gameServer\.cjs['"]\)/, 'helper reuses the canonical game server module');
  assert.match(helperSource, /createGameServer\s*\(/, 'helper constructs the canonical server in process');
  assert.match(helperSource, /\.listen\(0,\s*['"]127\.0\.0\.1['"]/, 'helper asks the OS for an ephemeral loopback port');
  assert.doesNotMatch(helperSource, /MIME\s*=|server\.js|spawn\s*\(/, 'helper neither duplicates serving policy nor spawns the launcher');

  const probeSource = await readFile(PROBE_PATH, 'utf8');
  assert.match(probeSource, /acquireVisualProbeServer/, 'visual probe uses the lifecycle helper');
  assert.match(probeSource, /await\s+browser\.close\(\)/, 'visual probe awaits browser cleanup');
  assert.match(probeSource, /await\s+server\.close\(\)/, 'visual probe awaits owned-server cleanup in its finally path');
  assert.doesNotMatch(probeSource, /spawn\s*\(|server\.js|findFreePort|waitForHttp|server\.kill/, 'visual probe no longer spawns or probes an arbitrary server');
} finally {
  if (ownedServer) await ownedServer.close().catch(() => {});
  if (port8123Decoy) await closeHttpServer(port8123Decoy).catch(() => {});
  if (externalDecoy) await closeHttpServer(externalDecoy).catch(() => {});
  await rm(tempRoot, { recursive: true, force: true });
}

console.log('PASS visual probe server lifecycle: canonical ephemeral server, external URL preservation, awaited cleanup');

async function tryStartDecoy(port, body) {
  try {
    return await startDecoy(port, body);
  } catch (error) {
    if (error?.code === 'EADDRINUSE') return null;
    throw error;
  }
}

async function startDecoy(port, body) {
  const server = createHttpServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

async function closeHttpServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
