#!/usr/bin/env node
// Focused probe: boot → public New Game → map → Helios waypoint → autopilot dock approach.
// Reproduces the run-13 "player died during public autopilot approach" leg without the 30-min
// preamble, with the combat/law observer installed so a death names its killer.
// Usage: node scripts/probe-approach-death.mjs
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { runBrowserPublicRoute } from './lib/alphaLiveBaselineRoute.mjs';

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ }
  });
  page.on('pageerror', (err) => console.log('[pageerror]', String(err && err.message || err).slice(0, 300)));
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 180000 });

  // Same observer the check installs — records, never mutates.
  await page.evaluate(() => {
    window.__M3_DAMAGE_OBSERVER__ = { playerHits: [], outgoingHits: [], deaths: [], respawns: [], lawIncidents: [], fires: [] };
    window.SF.bus.on('combat:damage', (payload) => {
      if (payload?.targetId === window.SF.state.playerId) {
        window.__M3_DAMAGE_OBSERVER__.playerHits.push({ ...payload, atTick: window.SF.state.tick });
      }
    });
    window.SF.bus.on('player:death', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.deaths.push({ ...payload, atTick: window.SF.state.tick });
    });
    window.SF.bus.on('law:incidentOpened', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.lawIncidents.push({ ...payload, atTick: window.SF.state.tick });
    });
    window.SF.bus.on('law:dispatchStarted', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.lawIncidents.push({ ...payload, event: 'dispatch', atTick: window.SF.state.tick });
    });
    // Watch the ship's hull continuously so a non-combat kill (collision, hazard) is still
    // bracketed between snapshots — the observer alone only sees combat packets.
    window.__M3_HULL_WATCH__ = [];
    setInterval(() => {
      const st = window.SF && window.SF.state;
      const p = st && st.entities && st.entities.get(st.playerId);
      window.__M3_HULL_WATCH__.push({
        tick: st && st.tick, hull: p && p.hull, alive: p && p.alive !== false,
        speed: p && Math.round(Math.hypot(p.vel.x, p.vel.z)),
        threats: st ? [...st.entities.values()].filter((e) => e && e.alive !== false
          && e.id !== st.playerId && e.data && e.data.hostileToPlayer === true).length : null,
      });
    }, 400);
  });

  const result = await runBrowserPublicRoute({
    page,
    outputDir: fileURLToPath(new URL('../.devshots/probe-approach/', import.meta.url)),
    expectedRootUrl: server.baseUrl,
    log: (line) => process.stdout.write(`${line}\n`),
    flightTimeoutMs: 300_000,
    dockTimeoutMs: 360_000,
    skipStationHubAcceptance: true,
  });
  console.log('[probe] approach reached:', JSON.stringify(result.approachSnapshot && {
    distToBerth: result.approachSnapshot.corridor && result.approachSnapshot.corridor.distToBerth,
    phase: result.approachSnapshot.corridor && result.approachSnapshot.corridor.phase,
  }));
} catch (err) {
  console.error('probe failed:', err && err.message ? err.message : err);
  try {
    const dump = await (async () => {
      const pages = browser && await browser.contexts()[0].pages();
      const p = pages && pages[0];
      return p ? p.evaluate(() => ({
        obs: window.__M3_DAMAGE_OBSERVER__ && {
          playerHits: window.__M3_DAMAGE_OBSERVER__.playerHits.slice(-8),
          deaths: window.__M3_DAMAGE_OBSERVER__.deaths.slice(-3),
          lawIncidents: window.__M3_DAMAGE_OBSERVER__.lawIncidents.slice(-6),
        },
        hullTail: (window.__M3_HULL_WATCH__ || []).slice(-12),
      })) : null;
    })();
    console.error('[probe] death evidence:', JSON.stringify(dump, null, 1));
  } catch (e) {
    console.error('[probe] dump failed:', String(e && e.message || e));
  }
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server && server.child) server.child.kill(); } catch { /* ok */ }
}
