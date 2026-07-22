#!/usr/bin/env node
// PQ-013 Electron smoke subset: the real desktop shell reaches the planet vertical.
// Menu route (New Game -> Launch, the check-electron-new-game-launch idiom), then the capture-rig
// teleport to The Anvil: registration transaction fires, bands classify, the sheath subsystem
// wakes, one screenshot. (The full sequence evidence lives in the browser route capture; this
// proves the vertical is not browser-only. Note: the user profile in Electron binds the tether
// latch to KeyF — irrelevant here; this smoke presses only Digit8.)
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'pq013-planet');
mkdirSync(OUT, { recursive: true });

const { _electron: electron } = await loadPlaywright();
let app = null;
try {
  app = await electron.launch({ args: ['.'], cwd: ROOT, timeout: 90000 });
  const page = await app.firstWindow({ timeout: 90000 });
  const pageIssues = collectPageIssues(page, { ignoreProbeWarnings: true });
  await page.waitForLoadState('domcontentloaded', { timeout: 90000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 90000 });
  await page.locator('text=New Game').first().click({ timeout: 30000 });
  await page.locator('button', { hasText: /^Launch$/i }).click({ timeout: 30000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: 120000 });
  await page.waitForTimeout(1200);

  // Teleport to the working band of The Anvil (pose-resync path; residency flips the sector).
  await page.evaluate(async () => {
    const SF = window.SF, state = SF.state, THREE = SF.THREE;
    const { PLANET_SITE } = await import('./src/data/planets.js');
    const { ZONE_TETHYS_ANVIL } = await import('./src/data/authoredPlaces.js');
    const { sectorLocalToGlobalForSector } = await import('./src/data/sectorCoordinates.js');
    const centre = sectorLocalToGlobalForSector(ZONE_TETHYS_ANVIL.center, PLANET_SITE.sectorId);
    const dir = new THREE.Vector3();
    state.render.camera.getWorldDirection(dir);
    const l = Math.hypot(dir.x, dir.z) || 1;
    const up = { x: dir.x / l, z: dir.z / l };
    const p = state.entities.get(state.playerId);
    p.pos.x = centre.x - up.x * 950;
    p.pos.z = centre.z - up.z * 950;
    const tX = -up.z, tZ = up.x;
    p.vel.x = tX * 50; p.vel.z = tZ * 50;
    p.rot = Math.atan2(p.vel.z, p.vel.x);
  });
  await page.waitForFunction(() => {
    const s = window.SF.state;
    return s.world.currentSectorId === 'sector_tethys_junction' && s.planet && s.planet.active;
  }, null, { timeout: 30000 });
  await page.waitForTimeout(2200);

  const report = await page.evaluate(() => {
    const s = window.SF.state;
    const vfx = window.SF.registry.get('vfx');
    return {
      schema: 'spaceface.pq013ElectronSmoke.v1',
      mode: s.mode,
      sector: s.world.currentSectorId,
      planet: {
        active: s.planet.active, zoneId: s.planet.zoneId, siteId: s.planet.siteId,
        region: s.planet.player.region, heat: s.planet.player.heat,
      },
      fieldOnSnapshot: !!(s.fields.snapshot || []).find((f) => f.tag === 'external'),
      sheathPool: !!(vfx && vfx._planetSkim),
      pill: (document.querySelector('.sf-planet-pill') || {}).textContent || null,
    };
  });
  await page.screenshot({ path: path.join(OUT, 'electron-smoke-skim.png') });
  writeFileSync(path.join(OUT, 'electron-smoke-report.json'), JSON.stringify({ report, issues: summarizeIssues(pageIssues.issues || pageIssues.errorIssues || []) }, null, 2));

  assert.equal(report.mode, 'flight');
  assert.equal(report.sector, 'sector_tethys_junction');
  assert.equal(report.planet.active, true, 'planet registers under Electron');
  assert.equal(report.planet.zoneId, 'zone_tethys_anvil', 'same canonical identity');
  assert.ok(['skim', 'danger', 'sling'].includes(report.planet.region), `band classified (got ${report.planet.region})`);
  assert.equal(report.fieldOnSnapshot, true, 'influence profile on the predictor snapshot');
  console.log('[pq013-electron] report:', JSON.stringify(report.planet), 'pill=', report.pill);
  console.log('PQ013_ELECTRON_SMOKE_OK');
} finally {
  if (app) await app.close().catch(() => {});
}
