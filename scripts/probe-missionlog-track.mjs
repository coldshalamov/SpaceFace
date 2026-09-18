#!/usr/bin/env node
// Focused probe: new game → flight → KeyJ → accept hunter origin → dump mission list/focus/stage.
// Usage: node scripts/probe-missionlog-track.mjs
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
  page.on('pageerror', (err) => console.log('[pageerror]', String(err && err.message || err).slice(0, 300)));

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Mlog Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });

  await page.keyboard.press('KeyJ');
  await page.waitForSelector('[data-screen="missionLog"]', { state: 'visible', timeout: 20000 });

  const before = await page.evaluate(() => ({
    active: (window.SF.state.missions.active || []).map((m) => ({ id: m.id, title: m.title, status: m.status, career: m.originCareer })),
  }));
  console.log('[before]', JSON.stringify(before));

  const hunterCard = page.locator('[data-screen="missionLog"] [data-testid="mission-log-career-chip"][data-career-id="hunter"]');
  await hunterCard.waitFor({ state: 'visible', timeout: 20000 });
  const acceptBtn = hunterCard.locator('button[data-career-act="originAccept"]');
  await acceptBtn.click();
  await page.waitForTimeout(1500);

  const after = await page.evaluate(() => {
    const root = document.querySelector('[data-screen="missionLog"]');
    return {
      active: (window.SF.state.missions.active || []).map((m) => ({ id: m.id, title: m.title, status: m.status, career: m.originCareer, contract: m.originContractId })),
      trackButtons: [...root.querySelectorAll('button[data-act="track"]')].map((b) => ({
        mid: b.getAttribute('data-mid'),
        visible: !!(b.offsetParent || b.getClientRects().length),
        text: String(b.innerText || '').trim(),
      })),
      stageCardMid: root.querySelector('.sf-mlog-card')?.dataset?.mid || null,
      stageEmpty: !!root.querySelector('.sf-mlog-empty'),
      listRows: [...root.querySelectorAll('.k-row')].map((r) => ({
        id: r.dataset && r.dataset.id,
        selected: r.getAttribute('aria-selected'),
        text: String(r.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      })),
      tracked: window.SF.state.ui && window.SF.state.ui.trackedMissionId,
    };
  });
  console.log('[after]', JSON.stringify(after, null, 2));
} catch (err) {
  console.error('probe failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server && server.child) server.child.kill(); } catch { /* ok */ }
}
