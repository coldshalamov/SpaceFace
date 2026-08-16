#!/usr/bin/env node
// Canonical public-route capture for Plan 54 pause-time cargo/module management.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, '.devshots', 'plan54-pause-inventory');
const IMAGE = join(OUT, 'pause-inventory-default-route.png');
const REPORT = join(OUT, 'report.json');
mkdirSync(OUT, { recursive: true });

let server = null;
let browser = null;
try {
  server = await startFreshServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF?.state && window.SF?.ctx?.screenManager, null, { timeout: 20000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Pause Inventory Route', seed: 54 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get?.(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.alive;
  }, null, { timeout: 90000 });

  await page.evaluate(() => {
    const sf = window.SF;
    sf.registry.get('cargo').addCargo('cmdty_scrap_metal', 6);
    sf.registry.get('cargo').addCargo('cmdty_ore_copper', 3);
    sf.registry.get('ships').grantModule({ defId: 'mod_cargo_scanner_s', reason: 'plan54_capture' });
  });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-screen="pause"]', { timeout: 10000 });
  await page.getByRole('button', { name: 'Cargo & Modules' }).click();
  await page.waitForSelector('[data-screen="pauseInventory"] .sf-pause-inventory', { timeout: 10000 });
  await page.waitForTimeout(180);

  const route = await page.evaluate(() => {
    const sf = window.SF;
    const root = document.querySelector('[data-screen="pauseInventory"]');
    return {
      mode: sf.state.mode,
      top: sf.ctx.screenManager.top(),
      cargoRows: root?.querySelectorAll('[data-jet]').length || 0,
      fitButtons: root?.querySelectorAll('[data-fit]').length || 0,
      unfitButtons: root?.querySelectorAll('[data-unfit]').length || 0,
      title: root?.querySelector('h1')?.textContent || null,
    };
  });
  if (route.mode !== 'paused' || route.top !== 'pauseInventory' || route.cargoRows < 2 || route.fitButtons < 1) {
    throw new Error('pause inventory route incomplete: ' + JSON.stringify(route));
  }
  await page.screenshot({ path: IMAGE, fullPage: false });
  const expectedIssues = [];
  const actionableIssues = [];
  for (const issue of issues.issues || []) {
    if (issue && issue.type === 'error'
      && /HTTP 404 .*\/__spaceface_player_store\b/.test(String(issue.text || ''))) {
      // sharedPlayerStore explicitly supports a store-less HTTP server as a local-only fallback.
      // Keep the receipt, but do not misclassify the documented fallback as a pause-route bug.
      expectedIssues.push(issue);
    } else {
      actionableIssues.push(issue);
    }
  }
  const report = {
    ok: actionableIssues.length === 0,
    route: 'root -> game:new -> Escape pause -> Cargo & Modules',
    viewport: { width: 1440, height: 900 },
    routeState: route,
    issues: {
      issues: actionableIssues,
      ignoredIssues: [...(issues.ignoredIssues || []), ...expectedIssues],
    },
    image: IMAGE,
    imageSha256: sha256(IMAGE),
    sourceSha256: sha256(join(ROOT, 'src', 'ui', 'screens', 'pauseInventory.js')),
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  if (!report.ok) throw new Error('browser issues: ' + JSON.stringify(report.issues));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function startFreshServer() {
  const port = await findFreePort(8460);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode != null) throw new Error('dev server exited before becoming reachable');
    try { const response = await fetch(url); if (response.ok) return { baseUrl: url, kill: () => child.kill() }; } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port += 1) {
    const free = await new Promise((resolve) => {
      const probe = createNetServer();
      probe.once('error', () => resolve(false));
      probe.once('listening', () => probe.close(() => resolve(true)));
      probe.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free local port for pause inventory capture');
}
