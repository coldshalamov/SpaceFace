#!/usr/bin/env node
// check-pq-164-02-deck.mjs — PQ-164.02 Steam Deck resolution capture (1280×800).
//
// Same class of proof as PQ-164.00: Chromium walks the shipped Settings sheet at Deck native
// size without booting the 3D picture. A GPU-hung window.SF boot cannot hide the capture.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { DECK_VIEWPORT, SEED } from './lib/pq16402-deck.mjs';
import { measureDeckCapture } from '../src/systems/touch.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WIDTH = DECK_VIEWPORT.width;
const HEIGHT = DECK_VIEWPORT.height;
const OUT_DIR = join(ROOT, '.devshots', 'pq-164-02');
const OUT = join(OUT_DIR, 'deck-1280x800.png');

function freePort() {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(baseUrl);
      if (r.status) return { child, baseUrl };
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error('server start timeout');
}

let server = null;
let browser = null;
try {
  let playwright;
  try {
    playwright = await loadPlaywright();
  } catch (err) {
    console.log(`DECK_CAPTURE=unavailable seed=${SEED} size=${WIDTH}x${HEIGHT} reason=playwright-load`);
    console.error(String(err && err.message || err));
    process.exit(2);
  }
  server = await startServer();
  browser = await playwright.chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(90000);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e).slice(0, 160)));
  await page.goto(`${server.baseUrl}scripts/pq-164-02-deck-harness.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(() => window.__sfDeckCaptureReady === true, null, { timeout: 90000 });
  const harness = await page.evaluate(() => window.__sfDeckCapture);
  if (harness && harness.error) {
    console.log(`DECK_CAPTURE=unavailable seed=${SEED} size=${WIDTH}x${HEIGHT} reason=harness`);
    console.error(harness.error);
    process.exit(1);
  }
  const size = page.viewportSize();
  mkdirSync(OUT_DIR, { recursive: true });
  const buf = await page.screenshot({ path: OUT, type: 'png' });
  const report = measureDeckCapture({
    width: size && size.width,
    height: size && size.height,
    uiScale: harness && harness.uiScale,
    overflowX: harness && harness.overflowX,
    overflowY: harness && harness.overflowY,
    noteVisible: harness && harness.noteVisible,
    noteInView: harness && harness.noteInView,
    bytes: buf.length,
  });
  writeFileSync(join(OUT_DIR, 'deck-meta.json'), JSON.stringify({
    seed: SEED,
    path: OUT,
    report,
    harness,
    pageErrors,
  }, null, 2));
  console.log(`DECK_CAPTURE=${report.ok ? 'ok' : 'fail'} seed=${SEED} size=${report.width}x${report.height} scale=${report.uiScale} overflowX=${report.overflowX} note=${report.noteVisible && report.noteInView} bytes=${report.bytes} path=${OUT}`);
  if (pageErrors.length) console.log(`page-errors(observed, not gated): ${pageErrors.length} — ${pageErrors[0] || ''}`);
  if (!report.ok) {
    console.error(`deck pin failed sizeOk=${report.sizeOk} scaleOk=${report.scaleOk} overflowOk=${report.overflowOk} noteOk=${report.noteOk}`);
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.log(`DECK_CAPTURE=unavailable seed=${SEED} size=${WIDTH}x${HEIGHT} reason=launch-or-walk`);
  console.error(err && err.stack ? err.stack : err);
  process.exit(2);
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server) server.child.kill(); } catch { /* ok */ }
}
