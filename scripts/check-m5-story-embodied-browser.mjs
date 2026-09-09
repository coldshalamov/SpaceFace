#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { runEmbodiedStoryRoute } from './check-m5-story-embodied-runtime.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RECEIPT = resolve(ROOT, '.campaign', 'PRO-STORY-RUNTIME-PROOF-001', 'browser-result.json');
const writeReceipt = (value) => {
  mkdirSync(dirname(RECEIPT), { recursive: true });
  writeFileSync(RECEIPT, JSON.stringify(value, null, 2));
};
let exitCode = 0;
let server = null;
let browser = null;
let pendingReceipt = { ok: false, stage: 'module_loaded' };
writeReceipt({ ok: false, stage: 'module_loaded' });

try {
  const { chromium } = await loadPlaywright();
  writeReceipt({ ok: false, stage: 'playwright_loaded' });
  server = await startServer();
  writeReceipt({ ok: false, stage: 'server_ready', route: server.baseUrl });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  writeReceipt({ ok: false, stage: 'page_ready', route: server.baseUrl });
  const report = await runEmbodiedStoryRoute(page, { root: ROOT, routeName: 'browser' });
  assert.deepEqual(issues.errorIssues(), [], 'embodied Browser route emitted page errors');
  pendingReceipt = { ok: true, report };
  process.stdout.write(`M5 embodied story Browser PASS\n${JSON.stringify({ ...report, route: server.baseUrl }, null, 2)}\n`);
} catch (error) {
  exitCode = 1;
  const detail = String(error && error.stack || error);
  pendingReceipt = { ok: false, stage: 'error', error: detail };
  process.stderr.write(`${detail}\n`);
} finally {
  const cleanup = {
    browserClosed: browser == null,
    serverPid: server?.child?.pid || null,
    serverExited: server == null,
    serverRouteUnreachable: server == null,
  };
  const cleanupFailures = [];
  if (browser) {
    try {
      await browser.close();
      cleanup.browserClosed = !browser.isConnected();
      if (!cleanup.browserClosed) cleanupFailures.push('owned Browser remained connected after close');
    } catch (error) {
      cleanupFailures.push(`owned Browser close failed: ${String(error && error.message || error)}`);
    }
  }
  if (server) {
    try {
      const stopped = await stopOwnedServer(server);
      cleanup.serverExited = stopped.exited;
      cleanup.serverRouteUnreachable = stopped.routeUnreachable;
      if (!stopped.exited) cleanupFailures.push(`owned server pid ${cleanup.serverPid} did not exit`);
      if (!stopped.routeUnreachable) cleanupFailures.push(`owned server route ${server.baseUrl} remained reachable`);
    } catch (error) {
      cleanupFailures.push(`owned server close failed: ${String(error && error.message || error)}`);
    }
  }
  cleanup.pass = cleanupFailures.length === 0;
  cleanup.failures = cleanupFailures;
  if (!cleanup.pass) {
    exitCode = 1;
    process.stderr.write(`M5 Browser cleanup failed: ${cleanupFailures.join('; ')}\n`);
  }
  writeReceipt({ ...pendingReceipt, cleanup });
  process.stdout.write(`M5 embodied story Browser cleanup ${cleanup.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(cleanup)}\n`);
  process.exitCode = exitCode;
}

async function startServer() {
  for (let port = 8680; port < 8760; port++) {
    if (!(await isPortFree(port))) continue;
    try {
      return await startServerAtPort(port);
    } catch (error) {
      if (/EADDRINUSE|already in use/i.test(String(error && error.message || error))) continue;
      throw error;
    }
  }
  throw new Error('No free Browser proof port');
}

async function startServerAtPort(port) {
  const baseUrl = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
  for (let i = 0; i < 120; i++) {
    if (child.exitCode != null) throw new Error(`M5 server exited early\n${output}`);
    if (output.includes(`SpaceFace dev server running -> http://localhost:${port}/`)) {
      try {
        const response = await fetch(baseUrl);
        if (response.ok) return { baseUrl, child };
      } catch {}
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  child.kill();
  await waitForExit(child, 5_000);
  throw new Error(`M5 server unavailable\n${output}`);
}

async function stopOwnedServer(server) {
  const { child, baseUrl } = server;
  if (child.exitCode == null && child.signalCode == null) child.kill();
  const exited = await waitForExit(child, 5_000);
  let routeUnreachable = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await fetch(baseUrl, { signal: AbortSignal.timeout(250) });
    } catch {
      routeUnreachable = true;
      break;
    }
    await new Promise((done) => setTimeout(done, 50));
  }
  return { exited, routeUnreachable };
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode != null || child.signalCode != null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolveExit(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once('exit', onExit);
  });
}

function isPortFree(port) {
  return new Promise((done) => {
    const server = createNetServer();
    server.once('error', () => done(false));
    server.once('listening', () => server.close(() => done(true)));
    server.listen(port, '127.0.0.1');
  });
}
