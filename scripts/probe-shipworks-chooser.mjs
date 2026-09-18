#!/usr/bin/env node
// Focused probe: force-dock, open Shipworks, click the first loadout hardpoint, dump chooser rows.
// Usage: node scripts/probe-shipworks-chooser.mjs
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
  page.on('requestfailed', (req) => console.log('[reqfail]', req.url().slice(0, 160)));
  page.on('response', (res) => {
    if (res.status() >= 400) console.log('[http' + res.status() + ']', res.url().slice(0, 160));
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  } catch (e) {
    const snap = await page.evaluate(() => ({
      title: document.title,
      bodyText: String(document.body && document.body.innerText || '').slice(0, 500),
      hasSf: typeof window.SF,
      scripts: [...document.scripts].length,
    })).catch(() => ({}));
    console.log('[boot-snap]', JSON.stringify(snap));
    throw e;
  }
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Chooser Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });

  await page.evaluate(() => {
    const st = window.SF.state;
    const station = st.entityList.find((e) =>
      e && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('no station');
    window.SF.bus.emit('dock:docked', { stationId: station.data.stationId });
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15000 });
  await page.evaluate(() => {
    const root = document.querySelector('[data-screen="station"]');
    const nav = root && root.querySelector('[data-nav="shipworks"]');
    if (nav) nav.click();
  });
  await page.waitForSelector('[data-spatial-slot]', { timeout: 15000 });

  const canvasMeta = await page.evaluate(() => {
    const c = document.querySelector('[data-screen="station"] .sx-sw__canvas');
    return c ? { ...c.dataset } : null;
  });
  console.log('[canvas]', JSON.stringify(canvasMeta));

  // Same interaction the route uses: mouse click on the first hardpoint's box.
  const slot = page.locator('.sx-hardpoint[data-spatial-slot]').first();
  const slotBox = await slot.boundingBox();
  console.log('[slotbox]', JSON.stringify(slotBox));
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  await page.waitForTimeout(600);

  const dump = await page.evaluate(() => {
    const chooser = document.querySelector('.sx-sw__chooser');
    const rows = [...document.querySelectorAll('.sx-modrow')].map((li) => ({
      cls: li.className,
      previewModule: li.getAttribute('data-preview-module'),
      refused: li.getAttribute('data-refused-module'),
      text: String(li.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 110),
    }));
    return {
      chooserHidden: chooser ? chooser.hidden : null,
      chooserOpen: chooser ? chooser.classList.contains('is-open') : null,
      chooserEmptyText: chooser ? String(chooser.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300) : null,
      rowCount: rows.length,
      rows,
      eligible: rows.filter((r) => r.previewModule && !r.cls.includes('is-eq') && !r.cls.includes('is-locked')).length,
      slotCount: document.querySelectorAll('.sx-hardpoint[data-spatial-slot]').length,
    };
  });
  console.log(JSON.stringify(dump, null, 2));

  // Same hover the route performs on the first non-equipped previewable row.
  const row = page.locator('.sx-modrow[data-preview-module]:not(.is-eq)').first();
  const moduleId = await row.getAttribute('data-preview-module');
  console.log('[hover-module]', moduleId);
  await row.hover();
  await page.waitForTimeout(800);
  const ghost = await page.evaluate(() => {
    const preview = document.querySelector('[data-screen="station"] .sx-sw__canvas');
    const stats = document.querySelector('[data-screen="station"] .sx-sw__stats');
    return {
      previewMode: preview && preview.dataset.previewMode,
      previewModule: preview && preview.dataset.previewModule,
      previewReady: preview && preview.dataset.previewReady,
      previewAssetState: preview && preview.dataset.previewAssetState,
      previewSource: stats && stats.dataset.previewSource,
      metrics: Object.fromEntries([...stats.querySelectorAll('[data-metric][data-value]')]
        .map((el) => [el.dataset.metric, Number(el.dataset.value)])),
    };
  });
  console.log('[ghost]', JSON.stringify(ghost, null, 2));
} catch (err) {
  console.error('probe failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server && server.child) server.child.kill(); } catch { /* ok */ }
}
