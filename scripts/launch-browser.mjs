#!/usr/bin/env node
import { spawn } from 'node:child_process';
import http from 'node:http';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PORT = Number(flagValue('--port') || process.env.PORT || 8123);
const HOST = '127.0.0.1';
const GAME_URL = `http://${HOST}:${PORT}/`;
const START_TIMEOUT_MS = 20000;
const ROOT = fileURLToPath(new URL('../', import.meta.url));

let serverChild = null;

try {
  const existing = await probeSpaceFace(GAME_URL);
  if (existing.ok) {
    console.log(`SpaceFace is already running -> ${GAME_URL}`);
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
