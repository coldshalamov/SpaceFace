#!/usr/bin/env node
// Public Plan 44 route: New Game -> real outfitting berth -> Shipworks -> commission coat ->
// settled authored turntable. This captures the exact UI and rendered appearance state together.
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
const OUT = join(ROOT, '.devshots', 'plan44-ship-paint');
const IMAGE = join(OUT, 'shipworks-dockyard-bone.png');
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
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Paint Route', seed: 4401 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    return sf?.state?.mode === 'flight' && sf.state.entities?.get?.(sf.state.playerId)?.alive;
  }, null, { timeout: 90_000 });

  const dockTarget = await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList.find((entity) => entity && entity.alive !== false
      && entity.type === 'station' && entity.data?.stationId
      && (entity.data.services || []).includes('shipyard'));
    if (!station) throw new Error('no live Shipworks berth');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return station.data.stationId;
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15_000 });
  await page.locator('[data-screen="station"] [data-nav="shipworks"]').click();
  await page.waitForSelector('[data-screen="station"] .sx-sw-paint', { timeout: 15_000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-screen="station"] .sx-sw__canvas');
    const visible = canvas?.__sfPreviewDiagnostics?.().filter((row) => row.inCurrent && row.displayed) || [];
    return canvas?.dataset.previewReady === 'true' && visible.length > 4;
  }, null, { timeout: 30_000 });

  await page.locator('[data-paint-scheme="dockyard_bone"]').click();
  await page.waitForFunction(() => {
    const sf = window.SF;
    const appearance = sf?.state?.player?.ownedShips?.[0]?.appearance;
    const canvas = document.querySelector('[data-screen="station"] .sx-sw__canvas');
    return appearance?.hullColor === '#efe5c8' && appearance?.accentColor === '#182b31'
      && canvas?.dataset.previewReady === 'true'
      && canvas.dataset.previewAppearance?.includes('#efe5c8|#182b31|worn|0.620');
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(450);

  const route = await page.evaluate(() => {
    const sf = window.SF;
    const canvas = document.querySelector('[data-screen="station"] .sx-sw__canvas');
    const booth = document.querySelector('[data-screen="station"] .sx-sw-paint');
    const selected = booth?.querySelector('.sx-sw-paint__scheme.is-selected');
    const visible = canvas?.__sfPreviewDiagnostics?.().filter((row) => row.inCurrent && row.displayed) || [];
    const bounds = booth?.getBoundingClientRect();
    return {
      docked: sf.state.ui.docked === true,
      stationId: sf.state.ui.dockedStationId,
      appearance: sf.state.player.ownedShips[0].appearance,
      previewAppearance: canvas?.dataset.previewAppearance || null,
      previewReady: canvas?.dataset.previewReady === 'true',
      previewAssetState: canvas?.dataset.previewAssetState || null,
      visiblePreviewSurfaces: visible.length,
      previewSurfaces: visible.map((row) => ({
        name: row.name,
        geometry: row.geometry,
        worldRadius: row.worldRadius,
        worldPosition: row.worldPosition,
        material: row.material,
        materialColor: row.materialColor,
        previewTintRole: row.previewTintRole,
        tags: row.tags,
      })),
      selectedScheme: selected?.dataset.paintScheme || null,
      schemeCount: booth?.querySelectorAll('[data-paint-scheme]').length || 0,
      boothInViewport: !!bounds && bounds.left >= 0 && bounds.right <= innerWidth
        && bounds.top >= 0 && bounds.bottom <= innerHeight,
    };
  });
  if (!route.docked || route.stationId !== dockTarget || route.previewReady !== true
    || route.visiblePreviewSurfaces < 5 || route.selectedScheme !== 'dockyard_bone'
    || route.schemeCount !== 3 || route.boothInViewport !== true
    || route.appearance?.hullColor !== '#efe5c8' || route.appearance?.accentColor !== '#182b31') {
    throw new Error('paint booth route incomplete: ' + JSON.stringify(route));
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
    route: 'root -> game:new -> real dock:docked -> Shipworks -> Dockyard Bone -> settled turntable',
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
  throw new Error('no free local port for ship paint capture');
}
