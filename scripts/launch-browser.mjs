#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
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
const START_TIMEOUT_MS = 20000;
const MIGRATE_TIMEOUT_MS = 25000;
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PLAYER_STORE_DIR = resolvePlayerSaveDir(process.env);

let serverChild = null;

try {
  await migrateElectronSavesIfNeeded(PLAYER_STORE_DIR);

  const existing = await probeSpaceFace(GAME_URL);
  if (existing.ok) {
    const store = await probePlayerStore(GAME_URL);
    if (!store.ok) {
      console.log('SpaceFace is already running, but that server cannot share desktop saves.');
      console.log('Close the other SpaceFace launcher window and run this again.');
    } else {
      console.log(`SpaceFace is already running -> ${GAME_URL}`);
    }
    openUrl(GAME_URL);
    process.exit(0);
  }
  if (existing.reachable) {
    console.error(`Port ${PORT} is already serving something else.`);
    console.error(`Stop that process or launch with a different port: node scripts/launch-browser.mjs --port 8124`);
    process.exit(1);
  }

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
  const capture = (chunk) => {
    const text = String(chunk);
    output = (output + text).slice(-6000);
    process.stdout.write(text);
  };
  serverChild.stdout.on('data', capture);
  serverChild.stderr.on('data', capture);

  await waitForSpaceFace(GAME_URL, serverChild, () => output);
  console.log(`Opening SpaceFace -> ${GAME_URL}`);
  openUrl(GAME_URL);
  console.log('Server is running. Close this window or press Ctrl+C to stop it.');

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  serverChild.on('exit', (code) => {
    serverChild = null;
    process.exit(code == null ? 0 : code);
  });
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

async function waitForSpaceFace(url, child, outputForError) {
  const started = Date.now();
  while (Date.now() - started < START_TIMEOUT_MS) {
    if (child.exitCode != null) {
      throw new Error(`SpaceFace server exited before it became ready.\n${outputForError()}`);
    }
    const probe = await probeSpaceFace(url);
    if (probe.ok) return;
    await sleep(250);
  }
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

function probePlayerStore(gameUrl) {
  return new Promise((resolve) => {
    const url = new URL('__spaceface_player_store', gameUrl).href;
    const req = http.get(url, { timeout: 1500 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (body.length < 4096) body += chunk;
      });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch { parsed = null; }
        resolve({
          ok: res.statusCode === 200 && parsed && typeof parsed.keys === 'object',
          status: res.statusCode,
        });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    req.on('error', () => resolve({ ok: false }));
  });
}

async function migrateElectronSavesIfNeeded(playerStoreDir) {
  if (playerStoreHasSaves(playerStoreDir)) return;
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
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function shutdown(code = 0) {
  if (serverChild) {
    try { serverChild.kill(); } catch {}
  }
  process.exit(Number.isInteger(code) ? code : 0);
}
