#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPORT_PATH = '.devshots/electron-new-game-launch.json';
const FLIGHT_TIMEOUT_MS = 120000;

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
  await page.waitForFunction(flightReadyInPage, null, { timeout: FLIGHT_TIMEOUT_MS });
  await page.waitForTimeout(1200);

  const report = await page.evaluate(() => {
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
        pos: { x: player.pos && player.pos.x || 0, z: player.pos && player.pos.z || 0 },
      } : null,
      ships: (state.entityList || [])
        .filter((entity) => entity && entity.alive !== false && entity.type === 'ship')
        .map((entity) => ({
          id: entity.id,
          defId: entity.data && entity.data.defId || null,
          isPlayer: entity.id === state.playerId,
          presentationAdmission: entity.presentationAdmission || null,
          authoredAssetState: entity.mesh && entity.mesh.userData
            ? entity.mesh.userData.authoredAssetState || null
            : null,
          authoredAssetMode: entity.mesh && entity.mesh.userData
            ? entity.mesh.userData.authoredAssetMode || null
            : null,
        })),
      gpu,
      loaderDiagnostics,
      assetFailureVisible: /Game assets failed to load/i.test(visibleOverlayText),
      shipDestroyedVisible: isVisible(deathBanner),
      visibleOverlayText,
      url: location.href,
      title: document.title,
    };
  });

  const gpuProcessFailures = processMessages.filter((message) =>
    /GPU process exited unexpectedly|gpu-process-crashed|GPU process crashed|child-process-gone/i.test(message));
  const errorIssues = pageIssues.errorIssues();

  writeReport({
    schema: 'spaceface.electronNewGameLaunch.v1',
    generatedAt: new Date().toISOString(),
    pass: report.mode === 'flight'
      && report.player && report.player.alive
      && report.ships.length > 0
      && report.ships.every(hasAcceptableAuthoredPresentation)
      && !report.assetFailureVisible
      && !report.shipDestroyedVisible
      && !(report.gpu && report.gpu.software)
      && errorIssues.length === 0
      && gpuProcessFailures.length === 0,
    report,
    pageIssues: summarizeIssues(errorIssues),
    ignoredPageIssues: summarizeIssues(pageIssues.ignoredIssues),
    gpuProcessFailures,
  });

  assert.equal(report.mode, 'flight', 'Electron New Game must enter flight mode');
  assert(report.player && report.player.alive, 'Electron New Game must leave the player alive on launch');
  assert(report.ships.length > 0, 'Electron New Game must publish its live ship set');
  assert.deepEqual(
    report.ships.filter((ship) => !hasAcceptableAuthoredPresentation(ship)),
    [],
    `Electron New Game must use authored release presentation or an explicit pending admission without fallback: ${JSON.stringify(report.ships)}`,
  );
  assert.equal(report.assetFailureVisible, false, 'Electron New Game must not show the asset failure toast');
  assert.equal(report.shipDestroyedVisible, false, 'Electron New Game must not show the death banner during launch');
  assert(report.gpu && report.gpu.renderer, 'Electron New Game must publish GPU diagnostics');
  assert.equal(report.gpu.software, false, `Electron New Game should use hardware WebGL, got ${JSON.stringify(report.gpu)}`);
  assert.deepEqual(errorIssues, [], `Electron New Game should not report page errors: ${JSON.stringify(summarizeIssues(errorIssues))}`);
  assert.deepEqual(gpuProcessFailures, [], `Electron GPU process should not crash during New Game launch: ${JSON.stringify(gpuProcessFailures)}`);

  console.log(`Electron New Game launch OK - mode=${report.mode}, player=${report.player.id}, authoredShips=${report.ships.length}, gpu=${report.gpu.renderer}`);
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

function hasAcceptableAuthoredPresentation(ship) {
  if (!ship || ship.authoredAssetMode !== 'release') return false;
  if ((ship.authoredAssetState === 'authored' || ship.authoredAssetState === 'authored-with-cleanup-error')
      && (ship.presentationAdmission === 'ready' || ship.presentationAdmission == null)) return true;
  return ship.presentationAdmission === 'pending' && (
    ship.authoredAssetState === 'awaiting-authored-admission'
    || ship.authoredAssetState === 'loading'
    || ship.authoredAssetState === 'compiling-pipelines'
  );
}

function writeReport(report) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}
