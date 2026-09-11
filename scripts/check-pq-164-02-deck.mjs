#!/usr/bin/env node
// check-pq-164-02-deck.mjs — PQ-164.02 Steam Deck resolution capture (1280×800).
//
// Launches the live route at Deck native resolution and writes one still. Headless Chromium
// via Playwright when available; otherwise prints the launcher failure and exits 2 so the
// Node trackpad pin can still close.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SEED = 16402;
const WIDTH = 1280;
const HEIGHT = 800;
const OUT_DIR = join(ROOT, '.devshots', 'pq-164-02');
const OUT = join(OUT_DIR, 'deck-1280x800.png');

function freePort() {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
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
    args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ }
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });
  await page.evaluate((seed) => { window.SF.bus.emit('game:new', { name: 'Deck Capture', seed }); }, SEED);
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false);
  }, null, { timeout: 120000 });
  await page.waitForTimeout(600);
  const size = page.viewportSize();
  mkdirSync(OUT_DIR, { recursive: true });
  const buf = await page.screenshot({ path: OUT, type: 'png' });
  writeFileSync(join(OUT_DIR, 'deck-meta.json'), JSON.stringify({
    seed: SEED, width: size && size.width, height: size && size.height, path: OUT, bytes: buf.length,
  }, null, 2));
  console.log(`DECK_CAPTURE=ok seed=${SEED} size=${size.width}x${size.height} path=${OUT} bytes=${buf.length}`);
  if (size.width !== WIDTH || size.height !== HEIGHT) {
    console.error(`viewport was ${size.width}x${size.height}, expected ${WIDTH}x${HEIGHT}`);
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
