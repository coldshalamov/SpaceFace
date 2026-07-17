#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPORT_PATH = '.devshots/electron-new-game-launch.json';
const FLIGHT_TIMEOUT_MS = 120000;
// Serial authored admission (concurrency 1) plus Helios pocket traffic needs a drain window after
// flight starts; a fixed 1.2s sample raced the release-pool upgrade queue.
const AUTHORED_SHIP_DRAIN_TIMEOUT_MS = 45000;
// Must match renderer AUTHORED_SHIP_COMPOSITION_RADIUS / RENDER_STREAM_PREFETCH_RADIUS. Farther
// current-sector traffic keeps intentional procedural-fallback until the player approaches.
const AUTHORED_SHIP_SEAM_RADIUS = 5200;
const AUTHORED_SHIP_SEAM_RADIUS_SQ = AUTHORED_SHIP_SEAM_RADIUS * AUTHORED_SHIP_SEAM_RADIUS;

const { _electron: electron } = await loadPlaywright();

let app = null;
const processMessages = [];

try {
  app = await electron.launch({ args: ['.'], cwd: ROOT, timeout: 90000 });
  captureElectronProcess(app);

  const page = await app.firstWindow({ timeout: 90000 });
  const pageIssues = collectPageIssues(page, { ignoreProbeWarnings: true });

  await page.waitForLoadState('domcontentloaded', { timeout: 90000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 90000 });
  await page.locator('text=New Game').first().click({ timeout: 30000 });
  await page.locator('button', { hasText: /^Launch$/i }).click({ timeout: 30000 });
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const gpu = state && state.render && state.render.gpu;
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0 && gpu && gpu.renderer);
  }, null, { timeout: FLIGHT_TIMEOUT_MS });
  try {
    await page.waitForFunction((seamRadiusSq) => {
      const state = window.SF && window.SF.state;
      if (!state || state.mode !== 'flight') return false;
      const player = state.entities && state.entities.get(state.playerId);
      if (!player || !player.pos) return false;
      const ships = (state.entityList || []).filter((entity) => (
        entity && entity.alive !== false && entity.type === 'ship'
      ));
      if (ships.length === 0) return false;
      // Hard-fail path: asset errors anywhere. Seam path: only ships inside the authored runway
      // must finish release-mode authoring; farther sector traffic may remain procedural-fallback.
      return ships.every((entity) => {
        const data = entity.mesh && entity.mesh.userData;
        const stateName = data && data.authoredAssetState || null;
        if (stateName === 'fallback-after-error' || stateName === 'unavailable') return false;
        const dx = (entity.pos && entity.pos.x || 0) - player.pos.x;
        const dz = (entity.pos && entity.pos.z || 0) - player.pos.z;
        const inSeam = (dx * dx + dz * dz) <= seamRadiusSq;
        if (!inSeam) return true;
        return data
          && stateName === 'authored'
          && data.authoredAssetMode === 'release';
      });
    }, AUTHORED_SHIP_SEAM_RADIUS_SQ, { timeout: AUTHORED_SHIP_DRAIN_TIMEOUT_MS });
  } catch (error) {
    // Fall through to evaluate + assert so the report captures residual ship states/distances.
    processMessages.push(`[check] authored-ship drain timed out: ${error && error.message || error}`);
  }

  const report = await page.evaluate((seamRadius) => {
    function isVisible(el) {
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.01) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
    function visibleText(selector) {
      return Array.from(document.querySelectorAll(selector))
        .filter(isVisible)
        .map((el) => el.textContent || '')
        .join(' | ');
    }
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    const playerPos = {
      x: player && player.pos && player.pos.x || 0,
      z: player && player.pos && player.pos.z || 0,
    };
    const gpu = state.render && state.render.gpu || null;
    const loaderDiagnostics = state.render && state.render.loaderDiagnostics || state.render && state.render.authoredAssets || null;
    const visibleOverlayText = visibleText('.sf-toast, .toast, .sf-alert, [role="alert"], [role="status"]');
    const deathBanner = document.querySelector('.sf-death');
    return {
      mode: state.mode,
      tick: state.tick,
      simTime: state.simTime,
      player: player ? {
        id: player.id,
        alive: player.alive !== false,
        hull: player.hull,
        hullMax: player.hullMax,
        shield: player.shield,
        shieldMax: player.shieldMax,
        pos: playerPos,
      } : null,
      ships: (state.entityList || [])
        .filter((entity) => entity && entity.alive !== false && entity.type === 'ship')
        .map((entity) => {
          const px = entity.pos && entity.pos.x || 0;
          const pz = entity.pos && entity.pos.z || 0;
          const dx = px - playerPos.x;
          const dz = pz - playerPos.z;
          const data = entity.mesh && entity.mesh.userData || null;
          return {
            id: entity.id,
            defId: entity.data && entity.data.defId || null,
            isPlayer: entity.id === state.playerId,
            team: entity.team,
            trafficRole: entity.data && entity.data.trafficRole || null,
            hasMesh: !!entity.mesh,
            hasUpgradeRequest: !!(data && typeof data.requestAuthoredUpgrade === 'function'),
            authoredAssetState: data ? data.authoredAssetState || null : null,
            authoredAssetMode: data ? data.authoredAssetMode || null : null,
            authoredCompositionId: data ? data.authoredCompositionId || null : null,
            dist: Math.round(Math.hypot(dx, dz)),
            inAuthoredSeam: Math.hypot(dx, dz) <= seamRadius,
            pos: { x: Math.round(px), z: Math.round(pz) },
          };
        }),
      authoredSeamRadius: seamRadius,
      upgradeDiagnostics: state.render && state.render.scene && state.render.scene.userData
        ? state.render.scene.userData.authoredUpgradeDiagnostics || null
        : null,
      gpu,
      loaderDiagnostics,
      assetFailureVisible: /Game assets failed to load/i.test(visibleOverlayText),
      shipDestroyedVisible: isVisible(deathBanner),
      visibleOverlayText,
      url: location.href,
      title: document.title,
    };
  }, AUTHORED_SHIP_SEAM_RADIUS);

  const gpuProcessFailures = processMessages.filter((message) =>
    /GPU process exited unexpectedly|gpu-process-crashed|GPU process crashed|child-process-gone/i.test(message));
  const errorIssues = pageIssues.errorIssues();
  const assetErrorShips = report.ships.filter((ship) => (
    ship.authoredAssetState === 'fallback-after-error'
    || ship.authoredAssetState === 'unavailable'
  ));
  const unauthoredSeamShips = report.ships.filter((ship) => (
    ship.inAuthoredSeam
    && (ship.authoredAssetState !== 'authored' || ship.authoredAssetMode !== 'release')
  ));
  const dormantFarShips = report.ships.filter((ship) => (
    !ship.inAuthoredSeam && ship.authoredAssetState === 'procedural-fallback'
  ));

  writeReport({
    schema: 'spaceface.electronNewGameLaunch.v1',
    generatedAt: new Date().toISOString(),
    pass: report.mode === 'flight'
      && report.player && report.player.alive
      && report.ships.length > 0
      && assetErrorShips.length === 0
      && unauthoredSeamShips.length === 0
      && !report.assetFailureVisible
      && !report.shipDestroyedVisible
      && !(report.gpu && report.gpu.software)
      && errorIssues.length === 0
      && gpuProcessFailures.length === 0,
    report,
    assetErrorShips,
    unauthoredSeamShips,
    dormantFarShips,
    pageIssues: summarizeIssues(errorIssues),
    ignoredPageIssues: summarizeIssues(pageIssues.ignoredIssues),
    gpuProcessFailures,
  });

  assert.equal(report.mode, 'flight', 'Electron New Game must enter flight mode');
  assert(report.player && report.player.alive, 'Electron New Game must leave the player alive on launch');
  assert(report.ships.length > 0, 'Electron New Game must publish its live ship set');
  assert.deepEqual(
    assetErrorShips,
    [],
    `Electron New Game must not leave ships in asset-error states: ${JSON.stringify(assetErrorShips)}`,
  );
  assert.deepEqual(
    unauthoredSeamShips,
    [],
    `Electron New Game must author every ship inside the ${AUTHORED_SHIP_SEAM_RADIUS}wu seam runway: ${JSON.stringify(unauthoredSeamShips)} (all=${JSON.stringify(report.ships)})`,
  );
  assert.equal(report.assetFailureVisible, false, 'Electron New Game must not show the asset failure toast');
  assert.equal(report.shipDestroyedVisible, false, 'Electron New Game must not show the death banner during launch');
  assert(report.gpu && report.gpu.renderer, 'Electron New Game must publish GPU diagnostics');
  assert.equal(report.gpu.software, false, `Electron New Game should use hardware WebGL, got ${JSON.stringify(report.gpu)}`);
  assert.deepEqual(errorIssues, [], `Electron New Game should not report page errors: ${JSON.stringify(summarizeIssues(errorIssues))}`);
  assert.deepEqual(gpuProcessFailures, [], `Electron GPU process should not crash during New Game launch: ${JSON.stringify(gpuProcessFailures)}`);

  const authoredSeamCount = report.ships.filter((ship) => (
    ship.inAuthoredSeam && ship.authoredAssetState === 'authored'
  )).length;
  console.log(`Electron New Game launch OK - mode=${report.mode}, player=${report.player.id}, authoredSeamShips=${authoredSeamCount}/${report.ships.length}, dormantFar=${dormantFarShips.length}, gpu=${report.gpu.renderer}`);
  console.log(`[electron-new-game] report: ${REPORT_PATH}`);
} finally {
  if (app) await app.close().catch(() => {});
}

function captureElectronProcess(target) {
  const proc = target && typeof target.process === 'function' ? target.process() : null;
  if (!proc) return;
  const capture = (source) => (chunk) => {
    const text = String(chunk || '');
    if (!text) return;
    processMessages.push(...text.split(/\r?\n/).filter(Boolean).map((line) => `[${source}] ${line}`));
    if (processMessages.length > 120) processMessages.splice(0, processMessages.length - 120);
  };
  if (proc.stdout) proc.stdout.on('data', capture('stdout'));
  if (proc.stderr) proc.stderr.on('data', capture('stderr'));
}

function writeReport(report) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}
