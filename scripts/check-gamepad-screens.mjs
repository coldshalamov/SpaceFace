#!/usr/bin/env node
// check-gamepad-screens.mjs — PQ-164.00 "Every screen on a pad".
//
// Walks the live SCREEN_MODULES catalog plus the station through the shipped pad route
// (createGamepad + createUiInput + createScreenManager) inside a real DOM. The harness page
// does not boot the 3D game, so a GPU-hung live boot cannot hide the pad walk.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { SEED } from './lib/pq16400-gamepad-screens.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function printReport(label, report) {
  if (report.error) {
    console.log(`${label} error: ${report.error}`);
    return;
  }
  console.log(`${label} seed=${report.seed} catalog=${report.catalog}`);
  if (report.loadFailed && report.loadFailed.length) {
    for (const f of report.loadFailed) console.log(`LOAD ${f.name} ${f.error}`);
  }
  for (const r of report.results || []) {
    console.log(`SCREEN ${r.id} pad=${r.pad ? 'yes' : 'no'} ${r.pad ? r.detail : '(' + r.detail + ')'}`);
  }
  const n = (report.results || []).length;
  const passed = report.passed ?? (report.results || []).filter((r) => r.pad).length;
  console.log(`\n${passed}/${n} screens pad=yes seed=${report.seed}`);
}

let report;
try {
  report = await runChromiumWalk();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
printReport('chromium', report);
if (report.error) {
  console.log(`FAIL harness: ${report.error}`);
  process.exit(1);
}
const failed = (report.failed && report.failed.length)
  ? report.failed
  : (report.results || []).filter((r) => !r.pad);
if (failed.length) {
  for (const f of failed) console.log(`FAIL ${f.id}: ${f.detail}`);
  process.exit(1);
}
console.log(`ok gamepad screens: every listed screen accepts pad dpad/accept/back (${report.passed}/${report.catalog} seed=${SEED})`);
process.exit(0);

async function runChromiumWalk() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(baseUrl); if (r.status) up = true; } catch { /* retry */ }
      if (!up) await new Promise((r) => setTimeout(r, 200));
    }
    if (!up) throw new Error('server start timeout');
    const { loadPlaywright } = await import('./lib/load-playwright.mjs');
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.setDefaultTimeout(90000);
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e).slice(0, 160)));
      await page.goto(`${baseUrl}scripts/gamepad-screens-harness.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => window.__sfPadWalkReady === true, null, { timeout: 90000 });
      const result = await page.evaluate(() => window.__sfPadWalk);
      if (pageErrors.length) console.log(`page-errors(observed, not gated): ${pageErrors.length} — ${pageErrors[0] || ''}`);
      return result;
    } finally {
      await browser.close();
    }
  } finally {
    try { child.kill(); } catch { /* ok */ }
  }
}

function freePort() {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
