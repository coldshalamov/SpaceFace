#!/usr/bin/env node
// Force-dock and screenshot every station tab into .devshots/station-restore/
// Usage: node scripts/capture-station-tabs.mjs
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CAPTURE_WIDTH = Math.max(1024, Number(process.env.SF_CAPTURE_WIDTH) || 1440);
const CAPTURE_HEIGHT = Math.max(700, Number(process.env.SF_CAPTURE_HEIGHT) || 900);
const CAPTURE_DPR = Math.max(1, Math.min(2, Number(process.env.SF_CAPTURE_DPR) || 1));
const CAPTURE_PROFILE = String(process.env.SF_CAPTURE_PROFILE || '').replace(/[^a-z0-9@._-]/gi, '');
const OUT = join(ROOT, '.devshots', 'station-restore', CAPTURE_PROFILE);
mkdirSync(OUT, { recursive: true });

const TABS = ['market', 'shipworks', 'industry', 'contracts', 'factions', 'bar'];

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

async function clickButton(page, label) {
  return page.evaluate((label) => {
    const b = [...document.querySelectorAll('button')].find((el) =>
      new RegExp(label, 'i').test((el.textContent || '').trim()));
    if (!b) return false;
    b.click();
    return true;
  }, label);
}

async function clickTab(page, id) {
  return page.evaluate((id) => {
    const root = document.querySelector('[data-screen="station"]');
    if (!root) return false;
    const destination = root.querySelector(`[data-nav="${id}"]`);
    if (destination) { destination.click(); return true; }
    const exact = root.querySelector(`[data-tab="${id}"]`);
    if (exact) { exact.click(); return true; }
    const re = new RegExp('^\\s*' + id + '\\b', 'i');
    const t = [...root.querySelectorAll('[role="tab"], button, [data-tab]')]
      .find((el) => re.test((el.textContent || '').trim()) || el.getAttribute('data-tab') === id);
    if (t) { t.click(); return true; }
    return false;
  }, id);
}

let server = null;
let browser = null;
try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  // Headless Playwright often fails authored GLB preload on this machine; headed matches assets-live.
  const headless = process.env.SF_CAPTURE_HEADLESS === '1';
  browser = await chromium.launch({ headless, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({
    viewport: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
    deviceScaleFactor: CAPTURE_DPR,
  });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ }
  });

  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') console.log('[page:' + t + ']', msg.text().slice(0, 240));
  });
  page.on('pageerror', (err) => console.log('[pageerror]', String(err && err.message || err).slice(0, 240)));

  // Same boot path as probe-authored-assets-live: bus game:new (not UI click race).
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Station Capture', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });

  try {
    await page.waitForFunction(() => {
      const st = window.SF && window.SF.state;
      const p = st && st.entities && st.entities.get(st.playerId);
      return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
    }, null, { timeout: 120000 });
  } catch (e) {
    const snap = await page.evaluate(() => {
      const st = window.SF && window.SF.state;
      return {
        mode: st && st.mode,
        playerId: st && st.playerId,
        hasPlayer: !!(st && st.entities && st.entities.get(st.playerId)),
        body: (document.body && document.body.innerText || '').slice(0, 400),
      };
    }).catch(() => ({}));
    console.error('flight wait failed; snap=', JSON.stringify(snap));
    await page.screenshot({ path: join(OUT, 'fail-boot.png') }).catch(() => {});
    throw e;
  }

  const dockId = await page.evaluate(() => {
    const st = window.SF.state;
    const station = st.entityList.find((e) =>
      e && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('no station');
    window.SF.bus.emit('dock:docked', { stationId: station.data.stationId });
    return station.data.stationId;
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15000 });
  await page.waitForTimeout(500);

  await page.screenshot({ path: join(OUT, '00-station-default.png') });
  console.log('saved 00-station-default.png @', dockId);

  for (const tab of TABS) {
    const ok = await clickTab(page, tab);
    await page.waitForTimeout(400);
    const name = `tab-${tab}${ok ? '' : '-miss'}.png`;
    await page.screenshot({ path: join(OUT, name) });
    console.log('saved', name, ok ? 'ok' : 'MISS');
    if (ok && tab === 'shipworks') {
      await page.waitForSelector('[data-spatial-slot]', { timeout: 15000 });
      const firstSlot = page.locator('[data-spatial-slot]').first();
      await firstSlot.focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('.sx-sw__chooser.is-open', { timeout: 5000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUT, 'tab-shipworks-focus.png') });
      console.log('saved tab-shipworks-focus.png ok');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }
  }

  console.log('done →', OUT);
} catch (err) {
  console.error('capture-station-tabs failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server && server.child) server.child.kill(); } catch { /* ok */ }
}
