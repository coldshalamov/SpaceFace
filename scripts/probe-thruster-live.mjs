#!/usr/bin/env node
// Diagnostic (one-use) live-route thruster look-dev probe.
// Launches the real game (browser route), starts a new game, and captures plain screenshots
// during idle / thrust / boost / turn while recording a short motion clip.
// No frame barrier: this is look-dev evidence, not acceptance.
//
// Usage: node scripts/probe-thruster-live.mjs [--out <dir>]

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const OUT = path.resolve(arg('out', path.join(ROOT, '.devshots', 'graphics', 'thruster-live')));
const WIDTH = 1440;
const HEIGHT = 900;

function findSystemBrowser() {
  return [
    process.env.SF_BROWSER_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find((c) => existsSync(c)) || null;
}

async function dismissTutorial(page) {
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="button"], .dismiss, .close')];
    for (const node of nodes) {
      if (/skip|dismiss|close|got it/i.test(node.textContent || '')) {
        node.click();
      }
    }
  });
}

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required');
const ownedServer = await acquireVisualProbeServer({ explicitUrl: process.env.SF_PROBE_URL || '', root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
});
const page = await context.newPage();
const issues = [];
page.on('pageerror', (error) => issues.push(String(error?.message || error)));

try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Thruster LookDev', seed: 47 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf && sf.state && sf.state.entities.get(sf.state.playerId);
    return sf.state.mode === 'flight' && player && player.mesh;
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);
  await page.waitForTimeout(800);

  await page.screenshot({ path: path.join(OUT, 'live-01-idle.png') });

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'live-02-accel.png') });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'live-03-cruise.png') });

  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'live-04-boost.png') });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'live-05-boost-sustained.png') });
  await page.keyboard.up('ShiftLeft');

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(OUT, 'live-06-turn.png') });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(OUT, 'live-07-turn-sustained.png') });
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'live-08-coast.png') });

  const diag = await page.evaluate(() => {
    const sf = window.SF;
    const vfx = sf.registry?.get?.('vfx');
    const energy = vfx && vfx._energy;
    const info = energy && energy.plasmaStream && energy.plasmaStream.inspect
      ? energy.plasmaStream.inspect() : null;
    return { plasma: info, boostBlend: energy?.boostBlend ?? null, plumeDrive: energy?.plumeDrive ?? null };
  });
  await writeFile(path.join(OUT, 'live-probe.json'), JSON.stringify({ diag, issues }, null, 2));
  console.log('plasma inspect:', JSON.stringify(diag, null, 1));
} finally {
  await context.close();
  await browser.close();
  if (ownedServer && typeof ownedServer.close === 'function') await ownedServer.close().catch(() => {});
}
console.log(`wrote ${OUT}`);
process.exit(0);
