#!/usr/bin/env node
// Plan 44 public route: fresh player -> real Helios Shipworks form -> berth session log -> F5 ->
// Pause/Main Menu/Continue -> the same filed vessel name on the default Shipworks route.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, '.devshots', 'plan44-ship-registry');
const BEFORE = join(OUT, 'shipworks-borrowed-ghost.png');
const AFTER = join(OUT, 'shipworks-borrowed-ghost-after-continue.png');
const REPORT = join(OUT, 'report.json');
const FILED_NAME = 'Borrowed Ghost';
mkdirSync(OUT, { recursive: true });

let server = null;
let browser = null;
try {
  server = await startFreshServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus && window.SF?.registry,
    null, { timeout: 30_000 });
  await page.evaluate(() => {
    window.__plan44RegistryEvents = [];
    for (const type of ['ship:registryFiled', 'save:completed', 'save:loaded']) {
      window.SF.bus.on(type, (payload) => window.__plan44RegistryEvents.push({
        type,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
      }));
    }
    window.SF.bus.emit('game:new', { name: 'Registry Route', seed: 4402 });
  });
  await page.waitForFunction(() => window.SF?.state?.mode === 'flight'
    && window.SF.state.entities?.get?.(window.SF.state.playerId)?.alive, null, { timeout: 90_000 });

  await dockAndOpenShipworks(page);
  const registryInput = page.locator('[data-ship-registry-name]');
  await registryInput.fill(FILED_NAME);
  await registryInput.press('Enter');
  await page.waitForFunction((name) => {
    const sf = window.SF;
    const owned = sf.state.player.ownedShips[sf.state.player.activeShipIndex];
    const rail = document.querySelector('.sx-sw-row.is-active .sx-sw-row__name');
    const plate = document.querySelector('.sx-sw__nameplate h2');
    return owned?.registryName === name && rail?.textContent?.trim() === name
      && plate?.textContent?.trim() === name;
  }, FILED_NAME, { timeout: 15_000 });
  await page.locator('.sx-comms__toggle').click();
  await page.waitForFunction((name) => {
    const history = document.querySelector('.sx-comms__history');
    return history && !history.hidden && history.textContent.includes('REGISTRY FILED')
      && history.textContent.includes(name);
  }, FILED_NAME, { timeout: 10_000 });
  await page.screenshot({ path: BEFORE, fullPage: false });

  await page.locator('.sxb-launch').click();
  await page.waitForFunction(() => window.SF?.state?.mode === 'flight' && !window.SF.state.ui?.docked,
    null, { timeout: 20_000 });
  await quickSave(page);
  await openPause(page);
  await returnToMainMenu(page);
  const continueSummary = await page.locator('.sf-menu-save-summary').innerText();
  assert.match(continueSummary, /Borrowed Ghost/i, 'Continue summary names the filed vessel');
  await publicContinue(page);
  await page.waitForFunction((name) => {
    const sf = window.SF;
    const owned = sf.state.player.ownedShips[sf.state.player.activeShipIndex];
    const entity = sf.state.entities?.get?.(sf.state.playerId);
    return owned?.registryName === name && entity?.data?.shipName === name;
  }, FILED_NAME, { timeout: 30_000 });

  await dockAndOpenShipworks(page);
  await page.waitForFunction((name) => {
    const input = document.querySelector('[data-ship-registry-name]');
    const plate = document.querySelector('.sx-sw__nameplate h2');
    return input?.value === name && plate?.textContent?.trim() === name;
  }, FILED_NAME, { timeout: 20_000 });
  await page.screenshot({ path: AFTER, fullPage: false });

  const actionableIssues = (issues.issues || []).filter((issue) => !(issue && issue.type === 'error'
    && /HTTP 404 .*\/__spaceface_player_store\b/.test(String(issue.text || ''))));
  const report = {
    ok: actionableIssues.length === 0,
    route: 'fresh game -> real Helios Shipworks registry form -> berth log -> F5 -> Pause -> Main Menu -> Continue -> Shipworks',
    viewport: { width: 1600, height: 1000 },
    filedName: FILED_NAME,
    continueSummaryIncludesName: /Borrowed Ghost/i.test(continueSummary),
    events: await page.evaluate(() => window.__plan44RegistryEvents || []),
    issues: actionableIssues,
    images: {
      filed: { path: BEFORE, sha256: sha256(BEFORE) },
      continued: { path: AFTER, sha256: sha256(AFTER) },
    },
    sourceSha256: sha256(join(ROOT, 'src', 'ui', 'station', 'screens', 'shipworks.js')),
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  if (!report.ok) throw new Error('browser issues: ' + JSON.stringify(actionableIssues));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.kill().catch(() => {});
}

async function dockAndOpenShipworks(page) {
  await page.evaluate(() => window.SF.bus.emit('dock:docked', { stationId: 'station_helios' }));
  await page.waitForSelector('[data-screen="station"]', { timeout: 15_000 });
  await page.locator('[data-screen="station"] [data-nav="shipworks"]').click();
  await page.waitForSelector('[data-screen="station"] [data-ship-registry-name]', { timeout: 15_000 });
}

async function quickSave(page) {
  const before = await page.evaluate(() => (window.__plan44RegistryEvents || [])
    .filter((event) => event.type === 'save:completed').length);
  await page.keyboard.press('F5');
  await page.waitForFunction((previous) => (window.__plan44RegistryEvents || [])
    .filter((event) => event.type === 'save:completed').length > previous
    && !!localStorage.getItem('sf.save.quick'), before, { timeout: 60_000 });
}

async function openPause(page) {
  // Shipworks leaves its last text field as the focus owner until the station DOM is detached.
  // Blur it explicitly, then use the public P binding so text-entry suppression cannot swallow the
  // pause request after undocking.
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Main Menu', exact: true }).first()
    .waitFor({ state: 'visible', timeout: 10_000 });
}

async function returnToMainMenu(page) {
  const menuButtons = page.getByRole('button', { name: 'Main Menu', exact: true });
  await menuButtons.first().click();
  await menuButtons.last().waitFor({ state: 'visible', timeout: 10_000 });
  await menuButtons.last().click();
  await page.waitForFunction(() => window.SF?.state?.mode === 'menu', null, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).waitFor({ state: 'visible' });
}

async function publicContinue(page) {
  const before = await page.evaluate(() => (window.__plan44RegistryEvents || [])
    .filter((event) => event.type === 'save:loaded').length);
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await page.waitForFunction(() => {
    const candidate = [...document.querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === 'Continue');
    return !!candidate && !candidate.disabled;
  }, null, { timeout: 20_000 });
  await button.click();
  await page.waitForFunction((previous) => window.SF?.state?.mode === 'flight'
    && (window.__plan44RegistryEvents || []).filter((event) => event.type === 'save:loaded').length > previous,
  before, { timeout: 90_000 });
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function startFreshServer() {
  const port = await findFreePort(8560);
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => {
    gameServer.once('error', reject);
    gameServer.once('listening', resolve);
    gameServer.listen(port, '127.0.0.1');
  });
  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    kill: () => new Promise((resolve, reject) => {
      if (!gameServer.listening) { resolve(); return; }
      gameServer.close((error) => error ? reject(error) : resolve());
    }),
  };
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
  throw new Error('no free local port for ship registry capture');
}
