import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const HELPER_URL = new URL('../scripts/lib/visualProbeServer.mjs', import.meta.url);
const CLEANUP_HELPER_URL = new URL('../scripts/lib/visualProbeCleanup.mjs', import.meta.url);
const PROBE_PATH = path.join(PROJECT_ROOT, 'scripts', 'probe-ship-visual-stability.mjs');
const PACKAGE_PATH = path.join(PROJECT_ROOT, 'package.json');
const CLEANUP_FAILURE_FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'visual-probe-cleanup-failure.mjs');

let acquireVisualProbeServer;
try {
  ({ acquireVisualProbeServer } = await import(HELPER_URL));
} catch (error) {
  assert.fail(`visual probe server lifecycle helper must exist: ${error?.message || error}`);
}

assert.equal(typeof acquireVisualProbeServer, 'function', 'helper exports acquireVisualProbeServer()');

const pkg = JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));
const lifecycleCommand = 'node test/visual-probe-server.test.mjs';
const browserProbeCommand = 'node scripts/probe-ship-visual-stability.mjs';
assert.equal(
  pkg.scripts['check:visual-stability'],
  `${lifecycleCommand} && ${browserProbeCommand}`,
  'check:visual-stability runs the fast lifecycle contract before the full browser probe',
);
assert.equal(countCommand(pkg.scripts['check:art'], 'npm run check:visual-stability'), 1,
  'check:art reaches the combined visual-stability gate exactly once');
for (const aggregate of ['check', 'check:ci']) {
  assert.equal(countCommand(pkg.scripts[aggregate], 'npm run check:art'), 1,
    `${aggregate} reaches visual stability through check:art exactly once`);
  assert.equal(countCommand(pkg.scripts[aggregate], 'npm run check:visual-stability'), 0,
    `${aggregate} must not duplicate the visual-stability gate outside check:art`);
}
for (const [scriptName, command] of Object.entries(pkg.scripts)) {
  if (scriptName === 'check:visual-stability') continue;
  assert.equal(countCommand(command, lifecycleCommand), 0,
    `${scriptName} must not directly duplicate the lifecycle contract`);
  assert.equal(countCommand(command, browserProbeCommand), 0,
    `${scriptName} must not directly duplicate the full browser probe`);
}

let finalizeVisualProbeResources;
try {
  ({ finalizeVisualProbeResources } = await import(CLEANUP_HELPER_URL));
} catch (error) {
  assert.fail(`visual probe cleanup helper must exist: ${error?.message || error}`);
}
assert.equal(typeof finalizeVisualProbeResources, 'function', 'cleanup helper exports finalizeVisualProbeResources()');

const browserCloseError = new Error('browser-close-contract-failure');
const serverCloseError = new Error('server-close-contract-failure');
const cleanupCalls = [];
const cleanupLogs = [];
let aggregateFailure = null;
try {
  await finalizeVisualProbeResources({
    browser: { close: async () => { cleanupCalls.push('browser'); throw browserCloseError; } },
    server: { close: async () => { cleanupCalls.push('server'); throw serverCloseError; } },
    logError: (message) => cleanupLogs.push(String(message)),
  });
} catch (error) {
  aggregateFailure = error;
}
assert.deepEqual(cleanupCalls, ['browser', 'server'], 'browser and server cleanup are both attempted in order');
assert.ok(aggregateFailure instanceof AggregateError, 'cleanup-only failures reject with AggregateError');
assert.deepEqual(aggregateFailure.errors, [browserCloseError, serverCloseError], 'aggregate retains both cleanup errors');
assert.match(cleanupLogs.join('\n'), /browser cleanup failed.*browser-close-contract-failure/i,
  'browser cleanup failure is logged with resource context');
assert.match(cleanupLogs.join('\n'), /server cleanup failed.*server-close-contract-failure/i,
  'server cleanup failure is logged with resource context');

const originalProbeError = new Error('original-probe-contract-failure');
const preservingCalls = [];
const preservingLogs = [];
let preservedFailure = null;
try {
  await finalizeVisualProbeResources({
    browser: { close: async () => { preservingCalls.push('browser'); throw browserCloseError; } },
    server: { close: async () => { preservingCalls.push('server'); throw serverCloseError; } },
    primaryError: originalProbeError,
    logError: (message) => preservingLogs.push(String(message)),
  });
} catch (error) {
  preservedFailure = error;
}
assert.deepEqual(preservingCalls, ['browser', 'server'], 'both cleanups run even when a primary probe failure exists');
assert.equal(preservedFailure, originalProbeError, 'cleanup failures preserve the original probe error object');
assert.match(preservingLogs.join('\n'), /browser cleanup failed/i, 'browser cleanup remains logged beside a primary failure');
assert.match(preservingLogs.join('\n'), /server cleanup failed/i, 'server cleanup remains logged beside a primary failure');

const cleanupFailureProcess = spawnSync(process.execPath, [CLEANUP_FAILURE_FIXTURE], {
  cwd: PROJECT_ROOT,
  encoding: 'utf8',
});
assert.notEqual(cleanupFailureProcess.status, 0, 'uncaught cleanup failures produce a nonzero process exit');
assert.match(cleanupFailureProcess.stderr, /browser cleanup failed.*fixture-browser-close/i,
  'failure fixture logs browser cleanup context');
assert.match(cleanupFailureProcess.stderr, /server cleanup failed.*fixture-server-close/i,
  'failure fixture logs server cleanup context');

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
  assert.match(probeSource, /finalizeVisualProbeResources/, 'visual probe delegates cleanup and failure handling to the tested helper');
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

function countCommand(command, needle) {
  return String(command || '').split(needle).length - 1;
}
