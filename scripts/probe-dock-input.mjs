#!/usr/bin/env node
// Focused repro for the M3 dock-input failure: berth the real ship at Helios, tap E, and
// sample the transition at 100ms. Usage: node scripts/probe-dock-input.mjs
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
    env: { ...process.env, PORT: String(port), SF_PORT: String(port) },
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

const sample = () => {
  const state = window.SF?.state;
  const player = state?.entities?.get?.(state.playerId);
  const corridor = state?.dockingCorridor || null;
  const dockAlert = document.querySelector('.sf-alert--dock');
  return {
    docked: state?.ui?.docked === true,
    mode: state?.mode || null,
    prompt: !!(dockAlert && !dockAlert.hidden),
    speed: player?.vel ? Number(Math.hypot(player.vel.x, player.vel.z).toFixed(1)) : null,
    pos: player?.pos ? { x: Number(player.pos.x.toFixed(1)), z: Number(player.pos.z.toFixed(1)) } : null,
    distToBerth: corridor ? Number(corridor.distToBerth?.toFixed(1)) : null,
    corridorPhase: corridor ? corridor.phase : null,
    dockInRange: state?.ui?.dockInRange === true,
    deny: state?.ui?.dockDeny || null,
    confirmOpen: !!document.querySelector('.sf-confirm, [data-screen="confirm"], .k-confirm'),
    autopilot: state?.nav?.autopilot
      ? { active: state.nav.autopilot.active, status: state.nav.autopilot.status,
          label: state.nav.autopilot.label, target: state.nav.autopilot.target }
      : null,
    controls: state?.input?.controls ? { ...state.input.controls } : null,
    actions: state?.input?.actions ? { ...state.input.actions } : null,
    navTarget: state?.nav?.target || null,
    screens: [...document.querySelectorAll('[data-screen]')]
      .filter((el) => !el.hidden && getComputedStyle(el).display !== 'none')
      .map((el) => el.getAttribute('data-screen')),
    modalOpen: document.body.classList.contains('ui-modal-open'),
    toasts: [...document.querySelectorAll('.sf-toast, .toast')].map((t) => String(t.innerText || '').slice(0, 80)),
  };
};

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
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ }
  });
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') console.log('[page:' + t + ']', msg.text().slice(0, 240));
  });
  page.on('pageerror', (err) => console.log('[pageerror]', String(err && err.message || err).slice(0, 300)));

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Dock Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 240000 });

  // Watch the untouched ship for 3s first — if it is already runaway before any input, the
  // dock-input ejection is a spawn-time physics bug, not a dock-path bug.
  for (let i = 0; i < 10; i++) {
    const s = await page.evaluate(sample);
    console.log(`[idle${i * 300}ms]`, JSON.stringify(s));
    await page.waitForTimeout(300);
  }

  // Teleport beside the Helios berth so the real corridor captures the ship — same state the
  // route reaches via autopilot, without the 60s approach.
  const berth = await page.evaluate(() => {
    const st = window.SF.state;
    const station = st.entityList.find((e) =>
      e && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('no station');
    const player = st.entities.get(st.playerId);
    const sx = station.pos.x, sz = station.pos.z;
    // Park ~18 WU from the station center along +x, nearly stopped.
    player.pos.x = sx + 18;
    player.pos.z = sz;
    player.vel.x = 0;
    player.vel.z = 0;
    return { stationId: station.data.stationId, sx, sz };
  });
  console.log('[berth]', JSON.stringify(berth));

  // Wait for the corridor to berth + the dock alert to appear.
  await page.waitForFunction(() => {
    const st = window.SF.state;
    const c = st.dockingCorridor;
    const alert = document.querySelector('.sf-alert--dock');
    return c && (c.phase === 'berthed' || c.inCapture) && alert && !alert.hidden;
  }, null, { timeout: 30000 }).catch(() => console.log('[warn] berth+prompt wait timed out'));

  const pre = await page.evaluate(sample);
  console.log('[pre]', JSON.stringify(pre));

  // Route-identical input: hold E 250ms, then sample every ~100ms for 4s.
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyE').catch(() => {});
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(sample);
    console.log(`[t${(i * 100)}ms]`, JSON.stringify(s));
    if (s.docked && s.screens.includes('station')) break;
    await page.waitForTimeout(100);
  }
} catch (err) {
  console.error('probe failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server && server.child) server.child.kill(); } catch { /* ok */ }
}
