#!/usr/bin/env node
// capture-asteroid-lab.mjs — LOOK-DEV proof for rendering the drill/works cutaway in the real 3D
// engine (src/render/asteroidInteriorPreview.js) instead of the flat Canvas2D playfield. Boots a
// real game so the nebula backdrop + baked PMREM env exist, grabs a flight-world reference frame for
// the congruence comparison, then runs the interior look lab and reads its composited frame back
// synchronously (renderFrame → toDataURL, the shipPreview readback trick). Evidence only.
// Output: .devshots/asteroid-lab/  (flight-world.png, 01-interior-3d.png, 02-interior-3d.png)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

let server = null;
let browser = null;
let issues = null;
const failures = [];

const writeDataUrl = (name, dataUrl) => {
  if (!dataUrl || !dataUrl.startsWith('data:image')) { failures.push(`${name}: no image data returned`); return; }
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  writeFileSync(join(OUT_DIR, name), Buffer.from(b64, 'base64'));
  console.log('[astlab] wrote', name);
};

try {
  server = await startFreshServer();
  const executablePath = findSystemBrowser();
  browser = await chromium.launch(executablePath ? {
    headless: false,
    executablePath,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--force-device-scale-factor=1'],
  } : { headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  issues = collectPageIssues(page);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      localStorage.setItem('sf.firstRunIntroSeen', '1');
    } catch (_) {}
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });

  // Let the authored ship library finish so the run starts cleanly.
  await page.evaluate(async () => {
    const ready = window.SF.state.render && window.SF.state.render.authoredPartLibraryReady;
    if (ready && typeof ready.then === 'function') await ready.catch(() => {});
  });

  // Boot into a run so the nebula backdrop + baked PMREM env exist (metallic machines want it).
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Look Dev', difficulty: 'standard' }));
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 120000 });
  await page.waitForTimeout(2000);

  // Reference: the flight world we want the cutaway to feel congruent with.
  await page.screenshot({ path: join(OUT_DIR, 'flight-world.png'), type: 'png' });
  console.log('[astlab] wrote flight-world.png');

  // Run the interior look lab (hides live entities, builds the cutaway into the live scene).
  const started = await page.evaluate(async () => {
    if (!window.SF.runAsteroidLab) return { ok: false, reason: 'runAsteroidLab not exposed' };
    const handle = await window.SF.runAsteroidLab();
    return { ok: !!handle };
  });
  if (!started.ok) throw new Error('lab did not start: ' + (started.reason || 'unknown'));
  await page.waitForFunction(() => window.__astlabReady === true, null, { timeout: 20000 });
  // let PMREM reflections, shadow maps, and the bump texture upload settle
  await page.waitForTimeout(2500);

  // Read the composited frame back synchronously (renderFrame → toDataURL in one task).
  const grab = () => page.evaluate(() => {
    const h = window.__astlab;
    if (!h) return null;
    h.renderFrame();
    return window.SF.state.render.renderer.domElement.toDataURL('image/png');
  });
  writeDataUrl('01-interior-3d.png', await grab());
  await page.waitForTimeout(1800); // camera parallax drifts — second angle
  writeDataUrl('02-interior-3d.png', await grab());

  const errors = issues.errorIssues();
  if (errors.length) failures.push('page errors: ' + errors.map((e) => e.text || e).join(' | '));
  console.log('[astlab] captures written to .devshots/asteroid-lab/');
} catch (err) {
  failures.push(err && err.message ? err.message : String(err));
  try {
    const errs = issues ? issues.errorIssues() : [];
    if (errs.length) failures.push('page errors: ' + errs.map((e) => e.text || e).join(' | '));
  } catch (_) {}
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.kill) await server.kill().catch(() => {});
}

if (failures.length) {
  console.error('capture-asteroid-lab FAIL:\n' + failures.join('\n'));
  process.exitCode = 1;
}

function findSystemBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean).find((candidate) => existsSync(candidate)) || null;
}

async function startFreshServer() {
  const port = await findFreePort(8230);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => {
    gameServer.once('error', reject);
    gameServer.once('listening', () => resolve());
    gameServer.listen(port, '127.0.0.1');
  });
  return {
    baseUrl,
    kill: () => new Promise((resolve, reject) => {
      if (!gameServer.listening) { resolve(); return; }
      gameServer.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function findFreePort(start) {
  for (let port = start; port < start + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free port found for asteroid lab capture');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
