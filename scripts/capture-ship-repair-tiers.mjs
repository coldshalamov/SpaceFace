#!/usr/bin/env node
// Public Plans 44/58 route: New Game -> real repair berth -> Station OS hull fascia.
// The capture binds the two repair identities to the live serviceQuote used by the shipped shell.
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
const OUT = join(ROOT, '.devshots', 'plan44-repair-tiers');
const IMAGE = join(OUT, 'station-hull-repair-choice.png');
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
  await page.waitForFunction(() => window.SF?.state && window.SF?.ctx?.screenManager, null, { timeout: 20_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Repair Route', seed: 4458 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    return sf?.state?.mode === 'flight' && sf.state.entities?.get?.(sf.state.playerId)?.alive;
  }, null, { timeout: 90_000 });

  const setup = await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    const owned = sf.state.player.ownedShips[sf.state.player.activeShipIndex || 0];
    const station = sf.state.entityList.find((entity) => entity && entity.alive !== false
      && entity.type === 'station' && entity.data?.stationId
      && (entity.data.services || []).includes('repair'));
    if (!player || !owned || !station) throw new Error('repair route setup unavailable');
    sf.state.simTime = Math.max(2400, Number(sf.state.simTime) || 0);
    owned.livingHull = {
      killTally: 6,
      repairPatches: 2,
      heatScorch: 2,
      lastWashAtT: 0,
      washCount: 0,
      graffitiLine: 'BORROWED, NOT BROKEN',
      graffitiAuthor: 'Iri March',
      updatedAtT: sf.state.simTime - 300,
    };
    player.livingHull = owned.livingHull;
    player.hull = Math.max(1, Math.floor((Number(player.hullMax) || 100) * 0.58));
    player.armorHp = Math.max(0, Math.floor((Number(player.armorMax) || 0) * 0.45));
    sf.state.player.credits = 25_000;
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return { stationId: station.data.stationId };
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15_000 });
  await page.waitForSelector('[data-screen="station"] [data-vital-act="repair"]', { timeout: 15_000 });
  await page.waitForSelector('[data-screen="station"] [data-vital-act="showroom"]', { timeout: 15_000 });
  await page.waitForTimeout(250);

  const route = await page.evaluate(() => {
    const sf = window.SF;
    const hull = document.querySelector('[data-screen="station"] .sxb-vital--hull');
    const repair = hull?.querySelector('[data-vital-act="repair"]');
    const showroom = hull?.querySelector('[data-vital-act="showroom"]');
    const wash = hull?.querySelector('[data-vital-act="wash"]');
    const bounds = hull?.getBoundingClientRect();
    return {
      docked: sf.state.ui.docked === true,
      stationId: sf.state.ui.dockedStationId,
      credits: sf.state.player.credits,
      repair: repair ? { text: repair.textContent.trim(), title: repair.title } : null,
      showroom: showroom ? { text: showroom.textContent.trim(), title: showroom.title } : null,
      washVisible: !!wash,
      hullInViewport: !!bounds && bounds.left >= 0 && bounds.right <= innerWidth
        && bounds.top >= 0 && bounds.bottom <= innerHeight,
    };
  });
  if (!route.docked || route.stationId !== setup.stationId || !route.repair || !route.showroom
    || route.credits !== 25_000 || route.hullInViewport !== true
    || !/Field/.test(route.repair.text) || !/Showroom/.test(route.showroom.text)
    || !/hull history stays/i.test(route.repair.title)
    || !/paint and fitted systems stay/i.test(route.showroom.title)) {
    throw new Error('repair-tier route incomplete: ' + JSON.stringify(route));
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
    route: 'root -> game:new -> real repair dock:docked -> Station OS hull fascia',
    viewport: { width: 1600, height: 1000 },
    routeState: route,
    issues: { issues: actionableIssues, ignoredIssues: [...(issues.ignoredIssues || []), ...expectedIssues] },
    image: IMAGE,
    imageSha256: sha256(IMAGE),
    sourceSha256: sha256(join(ROOT, 'src', 'ui', 'station', 'stationApp.js')),
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  if (!report.ok) throw new Error('browser issues: ' + JSON.stringify(report.issues));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.kill().catch(() => {});
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function startFreshServer() {
  const port = await findFreePort(8640);
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
  throw new Error('no free local port for repair-tier capture');
}
