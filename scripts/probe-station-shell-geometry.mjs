#!/usr/bin/env node
// After force-dock, print geometry of hub chrome vs market board (shell visibility forensics).
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { loadPlaywright } from './lib/load-playwright.mjs';

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
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), SF_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(baseUrl);
      if (r.status) return { child, baseUrl };
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error('server start failed');
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

let server = null;
let browser = null;
try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ }
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 20000 });
  await page.waitForSelector('[data-screen="mainMenu"]', { timeout: 20000 });
  if (!await clickButton(page, 'New Game')) throw new Error('no New Game');
  await page.waitForSelector('[data-screen="newGame"]', { timeout: 15000 });
  if (!await clickButton(page, 'Launch')) throw new Error('no Launch');
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 180000 });

  await page.evaluate(() => {
    const st = window.SF.state;
    const s = st.entityList.find((e) =>
      e && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!s) throw new Error('no station');
    window.SF.bus.emit('dock:docked', { stationId: s.data.stationId });
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15000 });
  await page.waitForTimeout(700);

  const info = await page.evaluate(() => {
    const root = document.querySelector('[data-screen="station"]');
    const q = (sel) => root && root.querySelector(sel);
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        left: Math.round(r.left),
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        z: cs.zIndex,
        position: cs.position,
        cls: String(el.className || '').slice(0, 120),
      };
    };
    const rail = q('.st-rail');
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      root: box(root),
      hub: box(q('.st-hub')),
      topbar: box(q('.st-topbar')),
      stationName: (q('.st-station-name') || {}).textContent || null,
      undock: (q('.st-undock') || {}).textContent || null,
      airlock: box(q('.st-airlock')),
      rail: box(rail),
      tabLabels: rail
        ? [...rail.querySelectorAll('.st-tab, [data-tab], [role="tab"]')].slice(0, 14).map((t) => ({
          tab: t.getAttribute('data-tab'),
          text: (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
          box: box(t),
        }))
        : [],
      body: box(q('.st-body')),
      content: box(q('.st-content')),
      tabpanel: box(q('.st-tabpanel')),
      market: box(q('.st-market')),
      catRail: box(q('.st-market-category-rail')),
      hubChildren: root
        ? [...(q('.st-hub') || root).children].map((c) => ({
          cls: String(c.className || '').slice(0, 80),
          box: box(c),
        }))
        : [],
    };
  });
  console.log(JSON.stringify(info, null, 2));
} catch (err) {
  console.error('probe failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server && server.child) server.child.kill(); } catch { /* ok */ }
}
