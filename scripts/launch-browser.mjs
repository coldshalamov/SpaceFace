#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { provisionElectronRuntime } from './lib/electronRuntimeProvisioning.mjs';

const require = createRequire(import.meta.url);
const { playerStoreHasSaves, resolvePlayerSaveDir } = require('./lib/playerSaveStore.cjs');

const PORT = Number(flagValue('--port') || process.env.PORT || 8123);
const HOST = '127.0.0.1';
const GAME_URL = `http://${HOST}:${PORT}/`;
const START_TIMEOUT_MS = 60000;
// When our server child dies because a second launcher won the bind race, the winner needs a
// moment to come up. Poll this long for it before declaring the launch failed.
const TAKEOVER_GRACE_MS = 4000;
const MIGRATE_TIMEOUT_MS = 25000;
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PLAYER_STORE_DIR = resolvePlayerSaveDir(process.env);
// Written into the player-save directory once the Electron localStorage migration has actually
// run. Not a save key (the store only reads sf.* names), so it is invisible to the game.
const MIGRATION_MARKER = 'electron-migration.done.json';

let serverChild = null;

try {
  // Reuse before anything else: probing the port is cheap, while the save migration below can
  // spawn a hidden Electron that holds the desktop single-instance lock for seconds.
  const existing = await probeSpaceFace(GAME_URL);
  if (existing.ok) {
    const store = await probePlayerStoreWithRetry(GAME_URL);
    if (!store.ok) {
      console.error('SpaceFace is already running, but that server cannot share desktop saves.');
      console.error('Close the other SpaceFace launcher window and run this again.');
      process.exit(1);
    }
    console.log(`SpaceFace is already running -> ${GAME_URL}`);
    openUrl(GAME_URL);
    process.exit(0);
  }
  if (existing.reachable) {
    console.error(`Port ${PORT} is already serving something else.`);
    console.error(`Stop that process or launch with a different port: node scripts/launch-browser.mjs --port 8124`);
    process.exit(1);
  }

  await migrateElectronSavesIfNeeded(PLAYER_STORE_DIR);

  console.log(`Starting SpaceFace server on ${GAME_URL}`);
  serverChild = spawn(process.execPath, ['server.js', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
    env: {
      ...process.env,
      SPACEFACE_PLAYER_STORE_DIR: PLAYER_STORE_DIR,
    },
  });

  let output = '';
  let serverUp = false;
  const capture = (chunk) => {
    const text = String(chunk);
    output = (output + text).slice(-6000);
    // Relay the server's own lines only once it owns the port. A bind-race loser's "could not
    // start" is noise next to the takeover reuse line; a real failure still shows it via the
    // error tail waitForSpaceFace attaches.
    if (serverUp) process.stdout.write(text);
  };
  serverChild.stdout.on('data', capture);
  serverChild.stderr.on('data', capture);
  // Attach the exit listener now: a child that dies during the startup wait must still take this
  // process down once ready is declared, instead of leaving a launcher that serves nothing.
  serverChild.on('exit', (code) => {
    if (!serverUp) return;
    serverChild = null;
    // A bind-race loser dies on EADDRINUSE only once it reaches listen — long after ready was
    // declared. If the port still serves SpaceFace, someone else is the server now: leaving
    // with 0 keeps the .bat from pausing on an error over a game that opened fine.
    void probeSpaceFace(GAME_URL).then((probe) => {
      if (probe.ok) {
        console.log(`SpaceFace is already running -> ${GAME_URL}`);
        process.exit(0);
      }
      process.exit(code == null ? 0 : code);
    }).catch(() => {
      process.exit(code == null ? 0 : code);
    });
  });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const start = await waitForSpaceFace(GAME_URL, serverChild, () => output);
  if (start === 'taken-over') {
    // Our server lost the bind race to a second launcher. That server IS SpaceFace: reuse it.
    const store = await probePlayerStoreWithRetry(GAME_URL);
    if (!store.ok) {
      console.error('SpaceFace is already running, but that server cannot share desktop saves.');
      console.error('Close the other SpaceFace launcher window and run this again.');
      process.exit(1);
    }
    console.log(`SpaceFace is already running -> ${GAME_URL}`);
    openUrl(GAME_URL);
    process.exit(0);
  }
  serverUp = true;
  console.log(`Opening SpaceFace -> ${GAME_URL}`);
  openUrl(GAME_URL);
  console.log('Server is running. Close this window or press Ctrl+C to stop it.');
} catch (error) {
  console.error(error && error.message ? error.message : error);
  shutdown(1);
}

function flagValue(name) {
  const arg = process.argv.find((item) => item === name || item.startsWith(name + '='));
  if (!arg) return null;
  if (arg.includes('=')) return arg.slice(arg.indexOf('=') + 1);
  const idx = process.argv.indexOf(arg);
  return process.argv[idx + 1] || null;
}

// 'ready' — our child is alive and the port serves SpaceFace. 'taken-over' — our child lost the
// bind race but a second launcher's server came up on the port, which is just as good for the
// player. Anything else is a launch failure with the child's captured output as the cause.
async function waitForSpaceFace(url, child, outputForError) {
  const started = Date.now();
  let childDiedAt = null;
  while (Date.now() - started < START_TIMEOUT_MS) {
    if (child.exitCode != null && childDiedAt === null) childDiedAt = Date.now();
    const probe = await probeSpaceFace(url);
    if (probe.ok) {
      if (child.exitCode != null) return 'taken-over';
      // A still-unbound child can die on EADDRINUSE a beat after the winner's port answered.
      // Give it one settle window before believing our own server is the one serving.
      await sleep(350);
      if (child.exitCode != null) return 'taken-over';
      return 'ready';
    }
    if (childDiedAt !== null && Date.now() - childDiedAt > TAKEOVER_GRACE_MS) {
      throw new Error(`SpaceFace server exited before it became ready.\n${outputForError()}`);
    }
    await sleep(250);
  }
  // One last look: a server that was merely slow beats a timeout report.
  const probe = await probeSpaceFace(url);
  if (probe.ok) return 'taken-over';
  throw new Error(`Timed out waiting for SpaceFace at ${url}.\n${outputForError()}`);
}

function probeSpaceFace(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1500 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (body.length < 16384) body += chunk;
      });
      res.on('end', () => {
        const ok = res.statusCode === 200 && /<title>SpaceFace<\/title>|id="gl-canvas"/.test(body);
        resolve({ reachable: true, ok, status: res.statusCode });
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ reachable: false, ok: false }));
  });
}

// The store route exists only when the server mounted the shared player-save directory, so the
// status code alone answers "can this server share desktop saves". The old probe downloaded and
// parsed the full keys payload, truncated it at 4 KB, and failed JSON.parse for every player
// with real saves — a healthy server looked exactly like one that could not share.
function probePlayerStore(gameUrl) {
  return new Promise((resolve) => {
    const url = new URL('__spaceface_player_store', gameUrl).href;
    const req = http.get(url, { timeout: 2000 }, (res) => {
      resolve({ ok: res.statusCode === 200, status: res.statusCode });
      res.destroy();
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    req.on('error', () => resolve({ ok: false }));
  });
}

// A server that answers at all answers definitively (mounted or not). Only transport-level
// failures — a busy server missing the window — earn another try.
async function probePlayerStoreWithRetry(gameUrl, attempts = 4) {
  let probe = { ok: false };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    probe = await probePlayerStore(gameUrl);
    if (probe.ok || probe.status) return probe;
    await sleep(400);
  }
  return probe;
}

async function migrateElectronSavesIfNeeded(playerStoreDir) {
  if (playerStoreHasSaves(playerStoreDir) || electronMigrationDone(playerStoreDir)) return;
  let electronRuntime = null;
  try {
    electronRuntime = provisionElectronRuntime({ root: ROOT });
  } catch {
    return;
  }
  if (!electronRuntime) return;

  const launchRoot = path.join(os.tmpdir(), 'spaceface-launcher');
  mkdirSync(launchRoot, { recursive: true });
  const launchId = `migrate-${Date.now()}-${process.pid}`;
  const receiptPath = path.join(launchRoot, `${launchId}.jsonl`);
  const logPath = path.join(launchRoot, `${launchId}.log`);
  const logFd = openSync(logPath, 'a');
  let child;
  try {
    child = spawn(electronRuntime.runtimePath, ['.'], {
      cwd: ROOT,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        SPACEFACE_PLAYER_STORE_DIR: playerStoreDir,
        SPACEFACE_MIGRATE_PLAYER_STORE: '1',
        SPACEFACE_LAUNCH_RECEIPT: receiptPath,
        SPACEFACE_LAUNCH_LOG: logPath,
      },
    });
  } catch {
    closeSync(logFd);
    return;
  }
  closeSync(logFd);

  const deadline = Date.now() + MIGRATE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode != null) break;
    if (receiptHasMigrateResult(receiptPath)) break;
    await sleep(150);
  }
  if (child.exitCode == null) {
    try { child.kill(); } catch {}
  }
  // A completed migration (even one that found no keys) never needs to run again: post-migration
  // Electron saves already land in the shared store. Only 'existing-instance' retries next time —
  // the running game was in the way, and its own saves may still need a future pass.
  try {
    const text = readFileSync(receiptPath, 'utf8');
    if (text.includes('player-store-migrated')) {
      mkdirSync(playerStoreDir, { recursive: true });
      writeFileSync(
        path.join(playerStoreDir, MIGRATION_MARKER),
        `${JSON.stringify({ migratedAt: new Date().toISOString() })}\n`,
        'utf8',
      );
    }
  } catch { /* a missing marker only means one more migration attempt later */ }
}

function electronMigrationDone(playerStoreDir) {
  try { return statSync(path.join(playerStoreDir, MIGRATION_MARKER)).isFile(); }
  catch { return false; }
}

function receiptHasMigrateResult(receiptPath) {
  try {
    const text = readFileSync(receiptPath, 'utf8');
    return /player-store-migrated|existing-instance/.test(text);
  } catch {
    return false;
  }
}

function openUrl(url) {
  if (process.argv.includes('--no-open')) return;
  let child = null;
  try {
    if (process.platform === 'win32') {
      child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      child = spawn('open', [url], { detached: true, stdio: 'ignore' });
    } else {
      child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
  } catch { child = null; }
  if (child) {
    // A missing opener (no xdg-open, a stripped-down shell) must not crash a finished launch.
    child.on('error', () => {});
    child.unref();
  }
}

function shutdown(code = 0) {
  if (serverChild) {
    try { serverChild.kill(); } catch {}
  }
  process.exit(Number.isInteger(code) ? code : 0);
}
