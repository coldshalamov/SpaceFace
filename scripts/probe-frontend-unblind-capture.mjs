// Capture probe for the frontend §6 batch (items 1/3/5/8, 2026-08-15).
// Boots the real browser route, enters flight, then captures the affected screens at 1440x900:
//   01 techTree (canvas font fix), 02 galaxyMap (sf-select + live overlay), 03 galaxyMap select
//   open, 04 automationPanel, 05 automationPanel select open, 06 starmap, 07 starmap select open,
//   08 missionLog live overlay over flight (HUD half-dim evidence).
// Also records DOM truth (body classes, #hud opacity, canvas font strings) to report.json.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('../.devshots/frontend-unblind-2026-08-15/', import.meta.url));
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;
const report = { frames: [], dom: {} };

async function waitForVisible(page, selector, timeoutMs, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, selector, { timeout: timeoutMs }).catch((err) => {
    throw new Error('Timed out waiting for ' + label + ': ' + err.message);
  });
}

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
  const port = await findFreePort(8290);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('Dev server exited before reachable');
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}
async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) if (await isPortFree(port)) return port;
  throw new Error('no free port');
}
function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function reachable(url) {
  try { const res = await fetch(url, { method: 'GET' }); return !!res.ok; } catch (_) { return false; }
}

async function shot(page, name) {
  const file = OUT + name + '.png';
  await page.screenshot({ path: file });
  report.frames.push(name + '.png');
  console.log('captured', name);
}

try {
  mkdirSync(OUT, { recursive: true });
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  // Headless boot is roughly TWICE as slow as a real GPU here, and not because the game is slow:
  // SwiftShader does not expose KHR_parallel_shader_compile, so THREE compiles every program
  // serially on the main thread. Measured on this machine: window.SF.ctx ready at 11,977 ms
  // headless against this 15,000 ms budget — an 80% margin that any load at all tips over, and
  // it did, intermittently, across five checks. A real GPU HAS the extension (verified), so
  // this is an environment allowance, not a behavioural assertion being loosened. Everything
  // these checks actually assert happens after boot and is untouched.
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');
  if (!(await clickButton(page, 'New Game'))) throw new Error('New Game button not found');
  await waitForVisible(page, '[data-screen="newGame"] .sf-ng-route', 10000, 'new-game rail');
  if (!(await clickButton(page, 'Launch'))) throw new Error('Launch button not found');
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0);
  }, null, { timeout: 90000 });
  await page.waitForTimeout(1500);

  // ---- 01 tech tree (canvas fonts) ----
  await page.keyboard.press('KeyT');
  await waitForVisible(page, '[data-screen="techTree"]', 8000, 'tech tree');
  await page.waitForTimeout(600);
  report.dom.techTreeFonts = await page.evaluate(() => {
    const canvas = document.querySelector('#sf-techtree canvas');
    const g = canvas && canvas.getContext('2d');
    if (!g) return null;
    const before = g.font;
    g.font = '12px "___never___", monospace';
    return { canvasW: canvas.getBoundingClientRect().width, probeFontAccepted: g.font !== before, sampleFont: before };
  });
  // Select a mid node so the sidebar shows content, then screenshot.
  await page.evaluate(() => {
    const c = document.querySelector('#sf-techtree canvas');
    const r = c.getBoundingClientRect();
    const ev = new MouseEvent('click', { clientX: r.left + 90, clientY: r.top + 200, bubbles: true });
    c.dispatchEvent(ev);
  });
  await page.waitForTimeout(300);
  await shot(page, '01-techtree');

  // Live-overlay DOM truth while a non-pausing screen is open.
  report.dom.liveOverlay = await page.evaluate(() => ({
    bodyClasses: document.body.className,
    hudOpacity: getComputedStyle(document.getElementById('hud')).opacity,
    hudPointerEvents: getComputedStyle(document.getElementById('hud')).pointerEvents,
    backdropHidden: document.getElementById('modal-backdrop').hidden,
    reticleDisplay: (() => { const el = document.getElementById('aim-reticle'); return el ? getComputedStyle(el).display : 'absent'; })(),
    simMode: window.SF.state.mode,
    simTimeAdvanced: window.SF.state.simTime > 0,
  }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  report.dom.afterClose = await page.evaluate(() => ({
    bodyClasses: document.body.className,
    hudOpacity: getComputedStyle(document.getElementById('hud')).opacity,
  }));

  // ---- 02/03 galaxy map (sf-select + live overlay) ----
  await page.keyboard.press('KeyM');
  await waitForVisible(page, '[data-screen="galaxyMap"]', 12000, 'galaxy map');
  await page.waitForTimeout(900);
  await shot(page, '02-galaxymap');
  report.dom.galaxySelect = await page.evaluate(() => {
    const root = document.querySelector('#gm-commodity-select');
    if (!root) return { present: false };
    return {
      present: true, tag: root.tagName, cls: root.className,
      isWidget: typeof root.sfSetOptions === 'function',
      value: root.value,
      fieldLabel: (root.querySelector('.sf-select__value') || {}).textContent || null,
      optionCount: root.querySelectorAll('.sf-select__opt').length,
    };
  });
  // Open the select dropdown and capture it.
  await page.evaluate(() => { const f = document.querySelector('#gm-commodity-select .sf-select__field'); if (f) f.click(); });
  await page.waitForTimeout(300);
  await shot(page, '03-galaxymap-select-open');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ---- 04/05 automation panel ----
  await page.evaluate(() => window.SF.ctx.screenManager.pushScreen('automation'));
  await waitForVisible(page, '[data-screen="automation"]', 8000, 'automation panel');
  await page.waitForTimeout(700);
  await shot(page, '04-automation');
  report.dom.automationSelect = await page.evaluate(() => {
    const sel = document.querySelector('.au-program');
    if (!sel) return { present: false, note: 'no drone rows on a fresh save (expected) — widget only exists with drones deployed' };
    return { present: true, tag: sel.tagName, isWidget: typeof sel.sfSetOptions === 'function', value: sel.value };
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---- 06/07 starmap (registered legacy screen; select swap evidence) ----
  await page.evaluate(() => window.SF.ctx.screenManager.pushScreen('starmap'));
  await waitForVisible(page, '[data-screen="starmap"]', 8000, 'starmap');
  await page.waitForTimeout(700);
  await shot(page, '06-starmap');
  report.dom.starmapSelect = await page.evaluate(() => {
    const root = document.querySelector('[data-commodity]');
    if (!root) return { present: false };
    return {
      present: true, tag: root.tagName, isWidget: typeof root.sfSetOptions === 'function',
      value: root.value, fieldLabel: (root.querySelector('.sf-select__value') || {}).textContent || null,
    };
  });
  await page.evaluate(() => { const f = document.querySelector('[data-commodity] .sf-select__field'); if (f) f.click(); });
  await page.waitForTimeout(300);
  await shot(page, '07-starmap-select-open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---- 08 mission log as the live-overlay composition specimen ----
  await page.evaluate(() => window.SF.ctx.screenManager.pushScreen('missionLog'));
  await waitForVisible(page, '[data-screen="missionLog"]', 8000, 'mission log');
  await page.waitForTimeout(700);
  await shot(page, '08-missionlog-live');

  writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 2));
  console.log('DOM EVIDENCE:', JSON.stringify(report.dom, null, 2));
  console.log('CAPTURE OK ->', OUT);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}
