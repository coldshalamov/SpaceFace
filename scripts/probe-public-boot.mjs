#!/usr/bin/env node
// Minimal boot check: public New Game -> Launch -> flight-ready predicate from
// professionalTravelPublicRoute. Times each phase so a stall localizes itself.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function findSystemBrowser() {
  const candidates = process.platform === 'win32' ? [
    process.env.SPACEFACE_BROWSER_EXE,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ] : [
    process.env.SPACEFACE_BROWSER_EXE,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), SF_PORT: String(port), SPACEFACE_PLAYER_STORE_DIR: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 25000);
    const tryFetch = async () => {
      for (let i = 0; i < 50; i++) {
        try {
          const r = await fetch(baseUrl);
          if (r.status) { clearTimeout(t); resolve(); return; }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 200));
      }
      clearTimeout(t);
      reject(new Error('server fetch timeout'));
    };
    tryFetch();
    child.on('error', reject);
    child.on('exit', (c) => reject(new Error('server exited ' + c)));
  });
  return { child, baseUrl };
}

const STATE_PROBE = `(() => {
  const state = window.SF && window.SF.state;
  const player = state && state.entities && state.entities.get(state.playerId);
  const readiness = typeof window.SF?.authoredVisualReadiness === 'function'
    ? window.SF.authoredVisualReadiness() : null;
  const modalOpen = document.body.classList.contains('ui-modal-open');
  const splash = document.getElementById('cinematic-splash');
  const splashStyle = splash ? getComputedStyle(splash) : null;
  const splashVisible = !!(splash && !splash.hidden && splashStyle && splashStyle.display !== 'none'
    && splashStyle.visibility !== 'hidden');
  const pending = readiness && readiness.openingPending || [];
  const assets = readiness && readiness.openingAssets || [];
  const notReady = assets.filter((a) => a.status !== 'authored' && a.status !== 'procedural-settled');
  return {
    mode: state && state.mode,
    tick: state && state.tick,
    alive: player ? player.alive !== false && Number(player.hull) > 0 : null,
    visualsReady: readiness ? !!readiness.ready : null,
    blockers: readiness && readiness.flightReadyBlockers || null,
    playerStatus: readiness && readiness.playerStatus,
    hubStatus: readiness && readiness.startingHubStatus,
    openingPending: pending,
    notReady,
    modalOpen,
    splashVisible,
    timeScale: state && state.timeScale,
    docked: state && state.ui && state.ui.docked,
    stack: state && state.ui && state.ui.screenStack,
    admission: state && state.render && state.render.sectorShellAdmission,
  };
})()`;

let server = null;
let browser = null;
try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  const executablePath = findSystemBrowser();
  browser = await chromium.launch({
    headless: false,
    ...(executablePath ? { executablePath } : {}),
    args: ['--incognito', '--no-first-run', '--no-default-browser-check', '--disable-extensions'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (err) => console.log('[pageerror]', String(err && err.message || err).slice(0, 300)));
  page.on('console', (msg) => {
    const text = msg.text();
    if (/error|stall|fail/i.test(text)) console.log('[console]', text.slice(0, 250));
  });
  const t0 = Date.now();
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  console.log(`[boot] domcontentloaded +${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  console.log(`[boot] SF ready +${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('[boot] state:', JSON.stringify(await page.evaluate(STATE_PROBE)));

  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await page.waitForSelector('[data-screen="newGame"]', { state: 'visible', timeout: 30_000 });
  console.log(`[boot] new-game-visible +${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  console.log(`[boot] launch-clicked +${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const deadline = Date.now() + 180_000;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(STATE_PROBE);
    if (last.mode === 'flight' && last.alive === true && last.visualsReady === true
      && !last.modalOpen && !last.splashVisible) break;
    console.log(`[boot] waiting +${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify({
      mode: last.mode, tick: last.tick, alive: last.alive, visualsReady: last.visualsReady,
      playerStatus: last.playerStatus, hubStatus: last.hubStatus,
      blockers: last.blockers, pending: last.openingPending, notReady: last.notReady,
      modalOpen: last.modalOpen, splashVisible: last.splashVisible, timeScale: last.timeScale,
      docked: last.docked, stack: last.stack, admission: last.admission,
    }));
    await page.waitForTimeout(5000);
  }
  console.log(`[boot] final +${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(last));
  const ready = last && last.mode === 'flight' && last.alive === true && last.visualsReady === true
    && !last.modalOpen && !last.splashVisible;
  console.log(ready ? '[boot] FLIGHT READY' : '[boot] NEVER READY');
  process.exitCode = ready ? 0 : 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server) server.child.kill(); } catch { /* ok */ }
}
