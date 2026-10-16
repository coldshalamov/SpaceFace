#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';
import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { provisionElectronRuntime } from './lib/electronRuntimeProvisioning.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPORT_PATH = '.devshots/electron-new-game-launch.json';
const FLIGHT_TIMEOUT_MS = Number(process.env.SF_ELECTRON_NEW_GAME_TIMEOUT_MS) || 120000;
assert(Number.isInteger(FLIGHT_TIMEOUT_MS) && FLIGHT_TIMEOUT_MS >= 5_000,
  'SF_ELECTRON_NEW_GAME_TIMEOUT_MS must be an integer of at least 5000ms');
const processMessages = [];

async function main() {
const electronRuntime = provisionElectronRuntime({ root: ROOT });
const { _electron: electron } = await loadPlaywright();

let app = null;
let page = null;
let childProcess = null;
let processMonitor = null;
let canonicalUrlTracker = null;
let isolatedLaunch = null;
let rootUrl = null;
let pageIssues = null;
let primaryError = null;

try {
  isolatedLaunch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'electron-new-game' });
  app = await electron.launch(isolatedLaunch.options);
  childProcess = app.process();
  processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
  captureElectronProcess(app);

  page = await app.firstWindow({ timeout: 90000 });
  installCspSafePlaywrightPolling(page);
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(10_000));
  pageIssues = collectPageIssues(page, { ignoreProbeWarnings: true });

  await page.waitForLoadState('domcontentloaded', { timeout: 90000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 90000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 });
  }
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: FLIGHT_TIMEOUT_MS });
  await page.waitForTimeout(1200);

  const report = await page.evaluate(async () => {
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
    const render = state.render || {};
    let isInitialAuthoredCompositionEntity = null;
    try {
      // Reuse the renderer's live startup-owner predicate instead of copying its distance,
      // story, and current-sector rules into this diagnostic.
      ({ isInitialAuthoredCompositionEntity } = await import('/src/render/partsLibrary.js'));
    } catch {
      // A missing owner module is itself a fail-closed diagnostic condition: unknown meshless
      // entities are marked relevant below and cannot pass as an off-camera pending boundary.
    }
    const ownerPredicateReady = typeof isInitialAuthoredCompositionEntity === 'function';
    const requiredIds = new Set();
    const addRequiredIds = (ids) => {
      if (!ids || typeof ids.forEach !== 'function') return;
      ids.forEach((id) => requiredIds.add(id));
    };
    // These are the renderer's finite first-picture/current-sector admission sets.
    // They are intentionally narrower than the complete entity list: off-camera
    // pending ships may remain meshless until the player approaches them.
    addRequiredIds(render.liveSectorFirstFlightIds);
    const openingSubjects = Array.isArray(render.openingSubmissionPlan?.compileSubjects)
      ? render.openingSubmissionPlan.compileSubjects
      : [];
    const belongsToOpeningPlan = (mesh) => {
      if (!mesh || openingSubjects.length === 0) return false;
      return openingSubjects.some((subject) => {
        for (let cursor = subject; cursor; cursor = cursor.parent) {
          if (cursor === mesh) return true;
        }
        return false;
      });
    };
    const isRequired = (entity) => entity.id === state.playerId
      || (ownerPredicateReady && isInitialAuthoredCompositionEntity(entity, state) === true)
      || requiredIds.has(entity.id)
      || belongsToOpeningPlan(entity.mesh);
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
        .map((entity) => {
          const mesh = entity.mesh || null;
          const required = isRequired(entity);
          return {
            id: entity.id,
            defId: entity.data && entity.data.defId || null,
            alive: entity.alive !== false,
            isPlayer: entity.id === state.playerId,
            hasMesh: !!mesh,
            required,
            // Keep the owner decision explicit in the receipt so a meshless
            // pending ship cannot silently pass when it belongs to the first
            // picture/current-sector cohort.
            renderRelevance: required || !!mesh || (!mesh && !ownerPredicateReady),
            presentationAdmission: entity.presentationAdmission || null,
            authoredAssetState: mesh && mesh.userData
              ? mesh.userData.authoredAssetState || null
              : null,
            authoredAssetMode: mesh && mesh.userData
              ? mesh.userData.authoredAssetMode || null
              : null,
            presentationFallbackVisible: entity.presentationFallbackVisible === true
              || mesh?.userData?.presentationFallbackVisible === true,
          };
        }),
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
    launch: {
      mode: isolatedLaunch.mode,
      rootUrl,
      listenerPort: Number(new URL(rootUrl).port),
      userDataDir: isolatedLaunch.userDataDir,
      electronRuntime: {
        packageVersion: electronRuntime.packageVersion,
        runtimeVersion: electronRuntime.runtimeVersion,
        runtimePath: electronRuntime.runtimePath,
        provisioned: electronRuntime.provisioned === true,
      },
    },
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
} catch (error) {
  primaryError = error;
  if (page && !page.isClosed()) {
    const failureSnapshot = await collectFailureSnapshot(page).catch((snapshotError) => ({
      snapshotError: snapshotError?.message || String(snapshotError),
    }));
    writeReport({
      schema: 'spaceface.electronNewGameLaunch.v1',
      generatedAt: new Date().toISOString(),
      pass: false,
      failure: { name: error?.name || 'Error', message: error?.message || String(error) },
      launch: {
        mode: isolatedLaunch?.mode || null,
        rootUrl,
        electronRuntime: {
          packageVersion: electronRuntime.packageVersion,
          runtimeVersion: electronRuntime.runtimeVersion,
          runtimePath: electronRuntime.runtimePath,
          provisioned: electronRuntime.provisioned === true,
        },
      },
      failureSnapshot,
      pageIssues: summarizeIssues(pageIssues?.errorIssues?.() || []),
      ignoredPageIssues: summarizeIssues(pageIssues?.ignoredIssues || []),
      processMessages,
    });
  }
} finally {
  let cleanupReport = null;
  if (app) {
    try {
      cleanupReport = await closeOwnedElectronRuntime({
        page,
        electronApp: app,
        childProcess,
        canonicalUrlTracker,
        processMonitor,
        rootUrl,
      });
      if (cleanupReport.pass !== true) {
        const error = new Error(`owned Electron cleanup failed: ${cleanupReport.failures.join('; ')}`);
        error.cleanupReport = cleanupReport;
        throw error;
      }
    } catch (error) {
      if (!primaryError) primaryError = error;
      else primaryError.cleanupError = error;
    }
  }
  if (isolatedLaunch && cleanupReport?.pass === true) {
    try {
      isolatedLaunch.cleanup({ runtimeClosed: true });
    } catch (error) {
      if (!primaryError) primaryError = error;
      else primaryError.profileCleanupError = error;
    }
  }
}

if (primaryError) throw primaryError;
}

async function collectFailureSnapshot(targetPage) {
  return targetPage.evaluate(async () => {
    const state = window.SF?.state;
    const readyPromise = state?.render?.authoredPartLibraryReady;
    let preload = { requested: !!readyPromise, status: 'missing' };
    if (readyPromise && typeof readyPromise.then === 'function') {
      const pending = Symbol('pending');
      const raced = await Promise.race([
        Promise.resolve(readyPromise).then(
          (value) => ({ status: 'resolved', valueKind: value == null ? 'null' : typeof value }),
          (reason) => ({ status: 'rejected', reason: reason?.message || String(reason) }),
        ),
        new Promise((resolve) => queueMicrotask(() => resolve(pending))),
      ]);
      preload = raced === pending ? { requested: true, status: 'pending' } : { requested: true, ...raced };
    }
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    return {
      userAgent: navigator.userAgent,
      mode: state?.mode || null,
      tick: Number(state?.tick || 0),
      player: player ? {
        id: player.id,
        alive: player.alive !== false,
        authoredAssetState: player.mesh?.userData?.authoredAssetState || null,
      } : null,
      preload,
      pipeline: {
        activeAdmissionJobs: Number(state?.render?.pipelineReadiness?.activeAdmissionJobs || 0),
        meshBuildQueueRemaining: Number(state?.render?.pipelineReadiness?.meshBuildQueueRemaining || 0),
        contextLost: state?.render?.renderer?.getContext?.()?.isContextLost?.() ?? null,
      },
      recentResources: performance.getEntriesByType('resource').slice(-20).map((entry) => ({
        name: entry.name,
        durationMs: entry.duration,
        transferSize: entry.transferSize,
      })),
      visibleText: document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 1_000) || '',
    };
  });
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

export function hasAcceptableAuthoredPresentation(ship) {
  if (!ship || ship.alive === false || ship.presentationFallbackVisible === true) return false;
  const meshlessPending = ship.hasMesh === false
    && ship.presentationAdmission === 'pending'
    && ship.isPlayer !== true
    && ship.required !== true
    && ship.renderRelevance === false
    && ship.authoredAssetState == null
    && ship.authoredAssetMode == null;
  if (meshlessPending) return true;
  if (ship.authoredAssetMode !== 'release') return false;
  if (ship.hasMesh !== true) return false;
  if (ship.isPlayer === true || ship.required === true) {
    return (ship.authoredAssetState === 'authored'
      || ship.authoredAssetState === 'authored-with-cleanup-error')
      && (ship.presentationAdmission === 'ready' || ship.presentationAdmission == null);
  }
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

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
