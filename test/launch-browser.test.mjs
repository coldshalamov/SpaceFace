// scripts/launch-browser.mjs behavior through real child launches: reuse, port contention and
// the double-click bind race. Each case runs the actual launcher against an HTTP stub on a
// scratch port; no game boot required.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LAUNCHER = join(ROOT, 'scripts', 'launch-browser.mjs');
const BIG_STORE_KEYS = { keys: { 'sf.save.pad': 'x'.repeat(64 * 1024) } }; // > the old 4 KB cap

// A store dir holding one save key keeps launches out of the Electron save-migration path
// (which is allowed to spawn a hidden Electron for seconds). The tests are about the launcher's
// port decisions, not migration.
const FAKE_STORE_DIR = mkdtempSync(join(tmpdir(), 'sf-launch-test-'));
writeFileSync(join(FAKE_STORE_DIR, 'sf.save.test.json'), '{}', 'utf8');
const LAUNCH_ENV = { SPACEFACE_PLAYER_STORE_DIR: FAKE_STORE_DIR };

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Respond SpaceFace-like on / and choose what the player-store route answers.
function stubServer({ storeResponse }) {
  const srv = createServer((req, res) => {
    if (req.url.startsWith('/__spaceface_player_store')) {
      if (!storeResponse) { res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(storeResponse));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>SpaceFace</title>');
  });
  return srv;
}

function runLauncher(port, { timeoutMs = 30_000, env = {}, readyPattern = null } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [LAUNCHER, '--port', String(port), '--no-open'], {
      cwd: ROOT,
      env: { ...process.env, ...LAUNCH_ENV, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let settled = false;
    const finish = (code, note = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, out: out + note, pid: child.pid });
    };
    const onData = (c) => {
      out += c;
      if (readyPattern && readyPattern.test(out)) finish(null);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setTimeout(() => finish(null, '\n[test] launcher timed out'), timeoutMs);
    child.on('exit', (code) => finish(code));
  });
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else spawnSync('kill', ['-9', `-${pid}`], { stdio: 'ignore' });
}

// A healthy SpaceFace server with a real mounted store must be reused, even when the store's
// keys payload is far bigger than the probe's old 4 KB parse cap — the failure the owner hit.
{
  const port = await freePort();
  const srv = stubServer({ storeResponse: BIG_STORE_KEYS });
  srv.listen(port, '127.0.0.1');
  await once(srv, 'listening');
  const result = await runLauncher(port);
  srv.close();
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /already running/);
  assert.doesNotMatch(result.out, /cannot share desktop saves/);
}

// A SpaceFace-answering server WITHOUT the shared store route is honestly reported.
{
  const port = await freePort();
  const srv = stubServer({ storeResponse: null });
  srv.listen(port, '127.0.0.1');
  await once(srv, 'listening');
  const result = await runLauncher(port);
  srv.close();
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /cannot share desktop saves/);
  assert.doesNotMatch(result.out, /\bat\s+\S+\s+\(/, 'a plain message, not a stack trace');
}

// A foreign process on the port gets the plain port-busy sentence.
{
  const port = await freePort();
  const srv = createServer((req, res) => { res.writeHead(200); res.end('not spaceface'); });
  srv.listen(port, '127.0.0.1');
  await once(srv, 'listening');
  const result = await runLauncher(port);
  srv.close();
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /already serving something else/);
  assert.doesNotMatch(result.out, /\bat\s+\S+\s+\(/, 'a plain message, not a stack trace');
}

// Two launches racing one free port: the loser must reuse the winner's server — not die on
// EADDRINUSE with a stack, and not announce success over a dead child.
{
  const port = await freePort();
  // Only the winner's persistent line resolves early — "already running" is printed right
  // before a clean exit, and the exit code is the verdict being asserted.
  const ready = /Server is running/;
  const [a, b] = await Promise.all([
    runLauncher(port, { readyPattern: ready }),
    runLauncher(port, { readyPattern: ready }),
  ]);
  try {
    const outcomes = [a, b];
    const winner = outcomes.find((r) => r.out.includes('Server is running'));
    const loser = outcomes.find((r) => r !== winner);
    assert.ok(winner, `neither launch became the server:\nA:\n${a.out}\nB:\n${b.out}`);
    assert.equal(winner.code, null, 'the winning launcher keeps running');
    assert.ok(loser, 'both launches must resolve');
    assert.equal(loser.code, 0, loser.out);
    assert.match(loser.out, /already running/);
    assert.doesNotMatch(loser.out, /exited before it became ready/, 'loser reuse, not a dead-child error');
  } finally {
    killTree(a.pid);
    killTree(b.pid);
  }
}

console.log('PASS launch-browser: reuse survives real saves, races resolve to one server, failures stay plain');
