#!/usr/bin/env node
// Public Plan 54 route: new game -> real station berth -> Shipworks -> save two fits -> recall one.
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
const OUT = join(ROOT, '.devshots', 'plan54-loadout-presets');
const IMAGE = join(OUT, 'loadout-presets-default-route.png');
const REPORT = join(OUT, 'report.json');
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
  await page.waitForFunction(() => window.SF?.state && window.SF?.ctx?.screenManager, null, { timeout: 20000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Loadout Route', seed: 5406 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get?.(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.alive;
  }, null, { timeout: 90000 });

  const dockTarget = await page.evaluate(() => {
    const sf = window.SF;
    const ships = sf.registry.get('ships');
    ships.grantModule({ defId: 'mod_cargo_scanner_s', reason: 'plan54_capture' });
    ships.grantModule({ defId: 'mod_market_data_s', reason: 'plan54_capture' });
    const station = sf.state.entityList.find((entity) => entity && entity.alive !== false
      && entity.type === 'station' && entity.data?.stationId
      && (entity.data.services || []).some((service) => service === 'shipyard' || service === 'module_craft'));
    if (!station) throw new Error('no live outfitting berth');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return { stationId: station.data.stationId, services: station.data.services || [] };
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15000 });

  await page.evaluate(() => {
    const sf = window.SF;
    const scanner = sf.state.player.moduleInventory.find((item) => item.defId === 'mod_cargo_scanner_s');
    sf.bus.emit('ui:fitModule', { shipIndex: 0, slotIndex: 5, instanceId: scanner.instanceId });
  });
  await page.locator('[data-screen="station"] [data-nav="shipworks"]').click();
  await page.waitForSelector('[data-screen="station"] .sx-sw-presets', { timeout: 15000 });

  await savePreset(page, 'Ceres Survey', 'reserve_quarter');
  await page.waitForFunction(() => window.SF.state.player.loadoutPresets?.length === 1);
  await page.evaluate(() => {
    const sf = window.SF;
    const market = sf.state.player.moduleInventory.find((item) => item.defId === 'mod_market_data_s');
    sf.bus.emit('ui:fitModule', { shipIndex: 0, slotIndex: 5, instanceId: market.instanceId });
  });
  await page.waitForTimeout(120);
  await savePreset(page, 'Market Runner', 'carry_current');
  await page.waitForFunction(() => window.SF.state.player.loadoutPresets?.length === 2);

  const surveyRow = page.locator('.sx-sw-preset', { hasText: 'Ceres Survey' });
  await surveyRow.getByRole('button', { name: 'Apply' }).click();
  await page.waitForFunction(() => window.SF.state.player.ownedShips[0].fittings[5] === 'mod_cargo_scanner_s');
  await page.waitForTimeout(3400);

  const route = await page.evaluate(() => {
    const sf = window.SF;
    const root = document.querySelector('[data-screen="station"] .sx-sw-presets');
    const presets = sf.state.player.loadoutPresets || [];
    const inventory = sf.state.player.moduleInventory || [];
    return {
      mode: sf.state.mode,
      docked: sf.state.ui.docked === true,
      screen: sf.ctx.screenManager.top(),
      operation: document.querySelector('[data-screen="station"] .sx-app')?.dataset.operation || null,
      activeHull: sf.state.player.ownedShips[0].defId,
      fittedUtility: sf.state.player.ownedShips[0].fittings[5],
      presetNames: presets.map((preset) => preset.name),
      presetPolicies: presets.map((preset) => preset.cargoPolicy),
      inventoryDefIds: inventory.map((item) => item.defId),
      uniqueInventoryIds: new Set(inventory.map((item) => item.instanceId)).size === inventory.length,
      capabilitySentences: [...root.querySelectorAll('.sx-sw-preset__copy span')].map((node) => node.textContent.trim()),
      visibleRows: root.querySelectorAll('.sx-sw-preset:not(.sx-sw-preset--empty)').length,
    };
  });
  if (route.docked !== true || route.screen !== 'station' || route.operation !== 'shipworks'
    || route.fittedUtility !== 'mod_cargo_scanner_s' || route.visibleRows !== 2
    || route.uniqueInventoryIds !== true || !route.inventoryDefIds.includes('mod_market_data_s')
    || !route.presetPolicies.includes('reserve_quarter')
    || route.capabilitySentences.some((sentence) => !/fit with .*handling.*operating mass.*\d+u hold/i.test(sentence))) {
    throw new Error('loadout preset route incomplete: ' + JSON.stringify(route));
  }

  await page.screenshot({ path: IMAGE, fullPage: false });
  const expectedIssues = [];
  const actionableIssues = [];
  for (const issue of issues.issues || []) {
    if (issue && issue.type === 'error'
      && /HTTP 404 .*\/__spaceface_player_store\b/.test(String(issue.text || ''))) expectedIssues.push(issue);
    else actionableIssues.push(issue);
  }
  const report = {
    ok: actionableIssues.length === 0,
    route: 'root -> game:new -> real dock:docked -> Shipworks -> save two named fits -> Apply Ceres Survey',
    dockTarget,
    viewport: { width: 1600, height: 1000 },
    routeState: route,
    issues: { issues: actionableIssues, ignoredIssues: [...(issues.ignoredIssues || []), ...expectedIssues] },
    image: IMAGE,
    imageSha256: sha256(IMAGE),
    sourceSha256: sha256(join(ROOT, 'src', 'ui', 'station', 'screens', 'shipworks.js')),
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  if (!report.ok) throw new Error('browser issues: ' + JSON.stringify(report.issues));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.kill().catch(() => {});
}

async function savePreset(page, name, policy) {
  const form = page.locator('.sx-sw-presets__form');
  await form.locator('[data-loadout-name]').fill(name);
  await form.locator('[data-loadout-policy]').selectOption(policy);
  await form.getByRole('button', { name: 'Save Current' }).click();
  await page.waitForTimeout(120);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function startFreshServer() {
  const port = await findFreePort(8520);
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
  throw new Error('no free local port for loadout preset capture');
}
