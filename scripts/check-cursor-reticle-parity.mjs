import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const { chromium, _electron: electron } = await loadPlaywright();

const ROOT = new URL('../', import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);
const MOVE_TO = { x: 1100, y: 140 };

assertInputSourceContract();
await checkBrowserRoute();
await checkElectronRoute();

console.log('Cursor reticle parity OK - browser and Electron keep pointerScreen, aim reticle, and hidden OS cursor in sync.');

function assertInputSourceContract() {
  const inputSrc = readFileSync(new URL('src/systems/input.js', ROOT), 'utf8');
  assert.match(inputSrc, /addEventListener\('mousemove', handlePointerMove, \{ capture: true \}\)/,
    'pointer movement must be captured before UI overlays can swallow mousemove');
  assert.match(inputSrc, /addEventListener\('pointermove', handlePointerMove, \{ capture: true \}\)/,
    'pointer movement must be captured before UI overlays can swallow pointermove');
  assert.match(inputSrc, /pointerSurface\.addEventListener\('mousedown'[\s\S]*handlePointerMove\(e\)/,
    'mouse button input must seed pointerScreen before firing toward the cursor');
}

async function checkBrowserRoute() {
  const port = await findFreePort(8197);
  const server = await startServer(port);
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(`${server.baseUrl}?debug=flight`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await enterFlight(page, 'Browser Cursor Probe');
    await assertCursorTracks(page, 'browser');
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
}

async function checkElectronRoute() {
  const app = await electron.launch({ args: ['.'], cwd: ROOT_PATH, timeout: 60000 });
  try {
    const page = await app.firstWindow({ timeout: 60000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
    await enterFlight(page, 'Electron Cursor Probe');
    await assertCursorTracks(page, 'electron');
  } finally {
    await app.close().catch(() => {});
  }
}

async function enterFlight(page, name) {
  await page.waitForFunction(() => window.SF && window.SF.bus, null, { timeout: 60000 });
  await page.evaluate((probeName) => window.SF.bus.emit('game:new', { name: probeName, seed: 47 }), name);
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'flight', null, { timeout: 90000 });
}

async function assertCursorTracks(page, label) {
  await page.mouse.move(MOVE_TO.x, MOVE_TO.y);
  await page.waitForTimeout(250);
  const report = await page.evaluate(() => {
    const pointer = window.SF && window.SF.state && window.SF.state.input && window.SF.state.input.pointerScreen;
    const reticle = document.getElementById('aim-reticle');
    const canvas = document.getElementById('gl-canvas');
    const rect = reticle ? reticle.getBoundingClientRect() : null;
    const reticleStyle = reticle ? getComputedStyle(reticle) : null;
    return {
      mode: window.SF && window.SF.state && window.SF.state.mode,
      pointer: pointer && { x: pointer.x, y: pointer.y, active: pointer.active },
      reticle: rect && {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        display: reticleStyle.display,
        visibility: reticleStyle.visibility,
      },
      bodyCursor: getComputedStyle(document.body).cursor,
      canvasCursor: canvas ? getComputedStyle(canvas).cursor : '',
      bodyClass: document.body.className,
    };
  });

  assert.equal(report.mode, 'flight', `${label}: game must be in flight`);
  assert.equal(report.pointer && report.pointer.active, true, `${label}: pointerScreen must be active after mouse move`);
  assertNear(report.pointer.x, MOVE_TO.x, 0.6, `${label}: pointerScreen.x`);
  assertNear(report.pointer.y, MOVE_TO.y, 0.6, `${label}: pointerScreen.y`);
  assert.equal(report.reticle && report.reticle.display, 'block', `${label}: reticle must be visible in flight`);
  assert.equal(report.reticle && report.reticle.visibility, 'visible', `${label}: reticle must not be visibility-hidden`);
  assertNear(report.reticle.centerX, MOVE_TO.x, 1.2, `${label}: reticle center x`);
  assertNear(report.reticle.centerY, MOVE_TO.y, 1.2, `${label}: reticle center y`);
  assert.equal(report.bodyCursor, 'none', `${label}: OS cursor should be hidden while software reticle is active`);
  assert.equal(report.canvasCursor, 'none', `${label}: canvas cursor should be hidden while software reticle is active`);
  assert.match(report.bodyClass, /sf-flight-cursor/, `${label}: body must mark flight cursor mode`);
}

function assertNear(actual, expected, tolerance, label) {
  assert(Number.isFinite(actual), `${label} must be finite; got ${actual}`);
  assert(Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected} +/- ${tolerance}, got ${actual}`);
}

async function startServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT_PATH,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before ${baseUrl} became reachable\n${output}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return { baseUrl, kill: () => child.kill() };
    } catch {}
    await sleep(150);
  }
  child.kill();
  throw new Error(`Dev server did not become reachable at ${baseUrl}\n${output}`);
}

async function findFreePort(preferred) {
  if (await portAvailable(preferred)) return preferred;
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
