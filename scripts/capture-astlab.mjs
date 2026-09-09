#!/usr/bin/env node
// capture-astlab.mjs — verify + photograph the INTERACTIVE build lab (_astlab.html). Headed system
// Chrome (the embedded preview pane freezes rAF on hidden tabs). Loads the page, drives it through
// its window.__lab API (select/place/remove/toggle view), and captures: the starter build view, a
// hand-built layout, and the angled beauty view. Proves the grid snaps and construction works.
// Output: .devshots/asteroid-lab/build-*.png
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = join(ROOT, '.devshots', 'asteroid-lab');
const VIEWPORT = { width: 1500, height: 940 };

const { chromium } = await loadPlaywright();
mkdirSync(OUT_DIR, { recursive: true });

let server = null, browser = null, issues = null;
const failures = [];

try {
  server = await startFreshServer();
  const executablePath = findSystemBrowser();
  browser = await chromium.launch(executablePath ? {
    headless: false, executablePath,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--force-device-scale-factor=1'],
  } : { headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  issues = collectPageIssues(page);
  const shot = (name) => page.screenshot({ path: join(OUT_DIR, name), type: 'png' });

  await page.goto(server.baseUrl + '_astlab.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__labReady === true, null, { timeout: 30000 });
  await page.waitForTimeout(1600); // shadows + bump texture upload
  const startCount = await page.evaluate(() => window.__lab.count());
  await shot('build-01-start.png');

  // Build a small factory by hand through the API: a conduit spine + machines snapped to cells.
  const built = await page.evaluate(() => {
    const L = window.__lab;
    // lateral drift row 8/9 (cols 19-24 are open) — lay a conduit run and cap it with an extractor
    for (let c = 19; c <= 23; c++) L.place(c, 8, 'conduit');
    L.place(24, 8, 'extractor');
    L.place(20, 9, 'fabricator');
    // lower gallery (rows 13-14, cols 8-16) — a second line
    for (let c = 9; c <= 14; c++) L.place(c, 13, 'conduit');
    L.place(8, 13, 'extractor'); L.place(15, 13, 'cargo_port');
    // try an illegal placement into solid rock — must be refused
    const illegal = L.place(2, 2, 'core');
    L.cursor(24, 8);
    return { count: L.count(), illegalRefused: illegal === false };
  });
  await page.waitForTimeout(500);
  await shot('build-02-constructed.png');

  // toggle to the angled beauty view to show the same layout with depth
  await page.evaluate(() => window.__lab.toggleView());
  await page.waitForTimeout(900);
  await shot('build-03-beauty.png');

  console.log('[astlab-build] start machines:', startCount, '→ after build:', built.count,
    '| illegal placement refused:', built.illegalRefused);
  if (built.count <= startCount) failures.push('placement did not add machines');
  if (!built.illegalRefused) failures.push('illegal placement into solid rock was NOT refused');

  const errors = issues.errorIssues();
  if (errors.length) failures.push('page errors: ' + errors.map((e) => e.text || e).join(' | '));
  console.log('[astlab-build] captures written to .devshots/asteroid-lab/');
} catch (err) {
  failures.push(err && err.message ? err.message : String(err));
  try { const e = issues ? issues.errorIssues() : []; if (e.length) failures.push('page errors: ' + e.map((x) => x.text || x).join(' | ')); } catch (_) {}
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.kill) await server.kill().catch(() => {});
}

if (failures.length) { console.error('capture-astlab FAIL:\n' + failures.join('\n')); process.exitCode = 1; }

function findSystemBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean).find((c) => existsSync(c)) || null;
}
async function startFreshServer() {
  const port = await findFreePort(8250);
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => { gameServer.once('error', reject); gameServer.once('listening', () => resolve()); gameServer.listen(port, '127.0.0.1'); });
  return { baseUrl: `http://127.0.0.1:${port}/`, kill: () => new Promise((res, rej) => { if (!gameServer.listening) { res(); return; } gameServer.close((e) => (e ? rej(e) : res())); }) };
}
async function findFreePort(start) { for (let p = start; p < start + 100; p++) if (await isPortFree(p)) return p; throw new Error('no free port'); }
function isPortFree(port) { return new Promise((resolve) => { const probe = createNetServer(); probe.once('error', () => resolve(false)); probe.once('listening', () => probe.close(() => resolve(true))); probe.listen(port, '127.0.0.1'); }); }
