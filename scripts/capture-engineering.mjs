#!/usr/bin/env node
// capture-engineering.mjs — screenshot harness for the Shipyard + Outfitting engineering screens.
// Boots the game, docks at a shipyard station, opens each tab, and screenshots the 3D stage.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, '.devshots', 'engineering');
const VIEW = process.argv[2] || 'all';
mkdirSync(OUT_DIR, { recursive: true });
let server, browser;
try {
  const { baseUrl } = await startServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state, null, { timeout: 15000 });
  await page.waitForSelector('[data-screen="mainMenu"]', { timeout: 15000 });
  await clickBtn(page, 'New Game');
  await page.waitForSelector('[data-screen="newGame"] .sf-ng-route', { timeout: 10000 });
  await clickBtn(page, 'Launch');
  await page.waitForFunction(() => { const s = window.SF.state; const p = s.entities.get(s.playerId); return s.mode === 'flight' && p && p.alive; }, null, { timeout: 90000 });

  // find a station WITH a shipyard service so the Shipyard/Outfitting tabs are available
  const dockTarget = await page.evaluate(() => {
    const sf = window.SF; const state = sf.state;
    // prefer a station with shipyard service; fall back to any dockable station
    let pick = null;
    for (const e of state.entityList) {
      if (e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate) {
        const services = (e.data.services || []);
        if (services.includes('shipyard') || services.includes('module_craft')) { pick = e; break; }
        if (!pick) pick = e;
      }
    }
    if (!pick) pick = state.entityList.find((e) => e.type === 'station' && e.data && e.data.stationId);
    sf.bus.emit('dock:docked', { stationId: pick.data.stationId });
    return { stationId: pick.data.stationId, services: pick.data.services || [] };
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15000 });
  await page.waitForTimeout(500);

  async function openTab(tabId) {
    await page.evaluate((t) => {
      const el = [...document.querySelectorAll('[data-screen="station"] [data-tab]')].find((e) => e.getAttribute('data-tab') === t);
      if (el) el.click();
    }, tabId);
    await page.waitForTimeout(500);
  }
  async function shotStage(name, panelSelector) {
    // wait for the 3D stage to mark itself ready (shipPreviewMount adds .is-ready on first frame)
    try {
      await page.waitForFunction((sel) => !!document.querySelector(sel + ' .st-eng-stage.is-ready'), panelSelector, { timeout: 20000 });
    } catch (error) {
      const diagnostics = await page.evaluate((sel) => {
        const stage = document.querySelector(sel + ' .st-eng-stage');
        const canvas = stage && stage.querySelector('canvas');
        const frame = stage && stage.querySelector('.st-eng-stage__frame');
        const rectOf = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return {
          selector: sel,
          panelExists: !!document.querySelector(sel),
          stageExists: !!stage,
          stageClass: stage && stage.className,
          stageText: stage && stage.textContent,
          stageRect: rectOf(stage),
          frameRect: rectOf(frame),
          canvasRect: rectOf(canvas),
          canvasWidth: canvas && canvas.width,
          canvasHeight: canvas && canvas.height,
        };
      }, panelSelector);
      throw new Error('engineering stage did not become ready for ' + panelSelector + ': ' + JSON.stringify(diagnostics));
    }
    await page.waitForTimeout(1200); // extra warm for asset swap + gauge settle
    // screenshot the whole station content area so the full engineering layout is captured
    await page.screenshot({ path: join(OUT_DIR, name), fullPage: false });
    console.log('saved', name);
  }

  if (VIEW === 'shipyard' || VIEW === 'all') {
    await openTab('shipyard');
    await shotStage('shipyard.png', '[data-screen="station"] .st-shipyard');
  }
  if (VIEW === 'outfit' || VIEW === 'all') {
    await openTab('outfit');
    await shotStage('outfitting.png', '[data-screen="station"] .st-outfit');
  }
  console.log('capture complete; docked at', dockTarget.stationId, 'services:', JSON.stringify(dockTarget.services));
} catch (e) { console.error('capture failed:', e.message); process.exitCode = 1; }
finally { if (browser) await browser.close().catch(() => {}); if (server) server.kill(); }

async function clickBtn(page, text) {
  return page.evaluate((t) => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === t); if (b) { b.click(); return true; } return false; }, text);
}
async function startServer() {
  const port = await findPort(8310);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server = { kill: () => child.kill() };
  child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
  for (let i = 0; i < 80; i++) { if (child.exitCode != null) throw new Error('server exited'); try { const r = await fetch(url); if (r.ok) return { baseUrl: url, kill: () => child.kill() }; } catch (_) {} await new Promise((r) => setTimeout(r, 250)); }
  child.kill(); throw new Error('no server');
}
async function findPort(start) { for (let p = start; p < start + 40; p++) { const f = await new Promise((res) => { const s = createNetServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); }); if (f) return p; } throw new Error('no port'); }
