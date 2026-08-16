// Capture probe for THE SHIP promotion (frontend program §11 / SCREENS_B build step 1).
// Boots the real route, enters flight, opens F2, captures the flight host; docks, captures the
// dock host; reopens F2 and asserts the one-mount invariant (§1.11.10) plus DOM truth.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('../.devshots/ship-screen-2026-08-15/', import.meta.url));
const { chromium } = await loadPlaywright();
const report = { frames: [], dom: {} };

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const exact = [...document.querySelectorAll('button')].find((b) => normalize(b.textContent) === normalize(wanted));
    const button = exact || [...document.querySelectorAll('button')].find((b) => normalize(b.textContent).includes(normalize(wanted)));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, label);
}
async function startFreshServer() {
  const port = await findFreePort(8330);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('server exited');
    try { const r = await fetch(url); if (r.ok) return { baseUrl: url, kill: () => child.kill() }; } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('server unreachable');
}
async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    const free = await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free port');
}
async function shot(page, name) {
  await page.screenshot({ path: OUT + name + '.png' });
  report.frames.push(name + '.png');
  console.log('captured', name);
}

let server = null, browser = null;
try {
  mkdirSync(OUT, { recursive: true });
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="mainMenu"]');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 15000 });
  if (!(await clickButton(page, 'New Game'))) throw new Error('New Game missing');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="newGame"] .sf-ng-route');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 10000 });
  if (!(await clickButton(page, 'Launch'))) throw new Error('Launch missing');
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive);
  }, null, { timeout: 90000 });
  await page.waitForTimeout(2000);

  // ---- THE SHIP from flight (F2) ----
  await page.keyboard.press('F2');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="ship"]');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 15000 });
  await page.waitForTimeout(2600); // authored hull settle
  report.dom.flightHost = await page.evaluate(() => ({
    bodyClasses: document.body.className,
    paused: window.SF.state.mode,
    hostClass: !!document.querySelector('.sx-sw--flight'),
    stationSheets: ['sx-station-css', 'sx-station-workbench-css', 'sx-station-berth-css']
      .every((id) => !!document.getElementById(id)),
    rects: (() => {
      const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width) }; };
      return {
        screen: r('[data-screen="ship"]'),
        stage: r('#sf-ship .sx-sw__stage'),
        rail: r('#sf-ship .sx-sw__rail'),
        stats: r('#sf-hip .sx-sw__stats, #sf-ship .sx-sw__stats'),
      };
    })(),
    segHidden: (() => { const s = document.querySelector('#sf-ship .sx-seg'); return s ? getComputedStyle(s).display === 'none' : 'absent'; })(),
    makeActivePresent: !!document.querySelector('#sf-ship [data-activate-ship]'),
    previewReady: document.querySelector('#sf-ship canvas')?.dataset.previewReady,
    previewAssetState: document.querySelector('#sf-ship canvas')?.dataset.previewAssetState,
    acquiringVisible: (() => { const a = document.querySelector('#sf-ship .sx-sw__acquiring'); return a ? getComputedStyle(a).display !== 'none' && getComputedStyle(a).opacity !== '0' : 'absent'; })(),
    slotCallouts: document.querySelectorAll('#sf-hip [data-spatial-slot], #sf-ship [data-spatial-slot]').length,
  }));
  await shot(page, '01-ship-flight-host');
  // Select a fitted slot so the constellation + chooser (read-only) show. floating-ui positions
  // and sizes the panel asynchronously — wait for the panel rect to be present and stable before
  // shooting, or the frame catches a mid-settle layout the reviewers rightly flagged.
  await page.evaluate(() => {
    const node = document.querySelector('#sf-ship [data-spatial-slot]');
    if (node) node.click();
  });
  await page.waitForFunction(() => {
    const panel = document.querySelector('#sf-ship .sx-chooser__panel');
    if (!panel) return false;
    const r = panel.getBoundingClientRect();
    return r.height > 200 && r.bottom <= innerHeight + 1;
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, '02-ship-flight-chooser');
  report.dom.flightChooser = await page.evaluate(() => {
    const chooser = document.querySelector('#sf-ship .sx-sw__chooser');
    if (!chooser || chooser.hidden) return { open: false };
    const buyButtons = [...chooser.querySelectorAll('[data-buyfit]')];
    const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width) }; };
    return {
      open: true,
      buyButtonCount: buyButtons.length,
      allDisabled: buyButtons.every((b) => b.disabled),
      reasonSample: buyButtons[0] ? buyButtons[0].getAttribute('aria-label') : null,
      rowCount: chooser.querySelectorAll('.sx-modrow').length,
      panelRect: rect(chooser.querySelector('.sx-chooser__panel')),
      rowHeights: [...chooser.querySelectorAll('.sx-modrow')].map((el) => Math.round(el.getBoundingClientRect().height)),
      rowOverlap: (() => {
        const rows = [...chooser.querySelectorAll('.sx-modrow')].map((el) => el.getBoundingClientRect());
        for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 2) return true;
        return false;
      })(),
    };
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // ---- Dock host (station shipworks destination) ----
  await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList.find((e) => e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="station"]');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 15000 });
  await page.evaluate(() => {
    const tab = document.querySelector('[data-screen="station"] [data-nav="shipworks"]');
    if (tab) tab.click();
  });
  await page.waitForTimeout(2600);
  await shot(page, '03-shipworks-dock-host');
  report.dom.dockHost = await page.evaluate(() => ({
    hostClass: !!document.querySelector('[data-screen="station"] .sx-sw--flight'),
    segVisible: (() => { const s = document.querySelector('[data-screen="station"] .sx-seg'); return s ? getComputedStyle(s).display !== 'none' : 'absent'; })(),
    previewReady: document.querySelector('[data-screen="station"] .sx-sw__canvas')?.dataset.previewReady,
  }));
  // Committed undock (the real swap path uiRoot owns), then reopen F2: one mount must survive
  // both hosts (SCREENS_B §1.11.10).
  await page.evaluate(() => { window.SF.bus.emit('dock:undocked', { committed: true, source: 'probe', intent: 'explicit' }); });
  await page.waitForTimeout(1400);
  // The station exit gate can leave a transient modal + paused mode behind; clear it before F2.
  for (let i = 0; i < 5; i++) {
    const st = await page.evaluate(() => ({
      open: !!(window.SF.ctx.screenManager && window.SF.ctx.screenManager.isOpen()),
      mode: window.SF.state.mode,
    }));
    if (!st.open && st.mode === 'flight') break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(600);
  console.log('postUndockState:', JSON.stringify(await page.evaluate(() => ({
    mode: window.SF.state.mode,
    docked: window.SF.state.ui.docked,
    body: document.body.className,
    stationVis: (() => { const el = document.querySelector('[data-screen="station"]'); return el ? getComputedStyle(el).display : null; })(),
    active: document.activeElement && document.activeElement.tagName,
  }))));
  await page.keyboard.press('F2');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="ship"]');
    return el && getComputedStyle(el).display !== 'none';
  }, null, { timeout: 15000 });
  await page.waitForTimeout(1800);
  report.dom.afterBothHosts = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')].filter((c) => {
      try { return !!c.getContext('webgl2'); } catch (_) { return false; }
    });
    const preview = document.querySelector('#sf-ship canvas');
    return {
      liveWebGLCanvases: canvases.length,
      previewReady: preview?.dataset.previewReady,
      previewDefId: preview?.dataset.previewDefId,
      diagnostics: (() => { try { return preview && preview.__sfPreviewDiagnostics ? preview.__sfPreviewDiagnostics().length : null; } catch (_) { return null; } })(),
    };
  });
  await shot(page, '04-ship-flight-after-dock');

  writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 2));
  console.log('DOM EVIDENCE:', JSON.stringify(report.dom, null, 2));
  console.log('CAPTURE OK ->', OUT);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}
