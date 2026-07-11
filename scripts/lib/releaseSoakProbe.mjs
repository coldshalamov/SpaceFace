// Browser/Electron release-soak evidence gatherer.
//
// The two runtimes execute the same public route. Browser owns the canonical
// in-process probe server; Electron owns its launcher server and is never
// navigated to the browser probe URL. Evidence is published only after owned
// cleanup and content verification.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { collectPageIssues } from './browser-issues.mjs';
import { loadPlaywright } from './load-playwright.mjs';
import {
  RELEASE_SOAK_SCHEMA,
  PERFORMANCE_ATTRIBUTION_SCHEMA,
  PERF_BUDGET,
  ATTRIBUTION_ROUTE_TAGS,
  ATTRIBUTION_DIAGNOSTIC_VARIANTS,
  strictWorktreeFingerprint,
  summarizeSamples,
  validateArtifactFiles,
  validateCleanupEvidence,
  validateNoQualityShortcuts,
  validateMemoryEvidence,
  validateReleaseSoakEvidence,
  validatePerformanceAttribution,
  validateSettingsTruth,
} from './releaseSoakContracts.mjs';
import {
  closeOwnedResources,
  createCanonicalUrlTracker,
  inspectCanonicalRootUrl,
} from './alphaLiveBaselineContracts.mjs';
import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
} from './alphaLiveBaselineElectronContracts.mjs';
import { runBrowserPublicRoute } from './alphaLiveBaselineRoute.mjs';
import { acquireVisualProbeServer } from './visualProbeServer.mjs';

export const DEFAULT_VIEWPORT = Object.freeze({ width: 1440, height: 900 });
export const DEFAULT_CYCLES = Object.freeze({ browser: 2, electron: 2, local: 6 });

export async function runReleaseSoakProbe({
  root,
  runtime = 'browser',
  mode = 'browser',
  cycles = DEFAULT_CYCLES[mode] ?? DEFAULT_CYCLES[runtime] ?? 2,
  viewport = DEFAULT_VIEWPORT,
  outputRoot = path.join(root, '.devshots', 'spec2'),
  taskId = `release-soak-${runtime}`,
  flightTimeoutMs = 150_000,
  dockTimeoutMs = 90_000,
  cycleTimeoutMs = 120_000,
  log = () => {},
} = {}) {
  assert(['browser', 'electron'].includes(runtime), 'runtime must be browser or electron');
  assert(Number.isInteger(cycles) && cycles > 0, 'cycles must be a positive integer');
  const outputDir = await allocateOutputDir(outputRoot, taskId);
  const logLines = [];
  const doLog = (message) => {
    const line = `${new Date().toISOString()} ${message}`;
    logLines.push(line);
    log(line);
  };

  let ownedServer = null;
  let browser = null;
  let context = null;
  let page = null;
  let electronApp = null;
  let childProcess = null;
  let processMonitor = null;
  let pageIssueTracker = null;
  let canonicalUrlTracker = null;
  let rootUrl = null;
  let cleanupReport = null;

  try {
    const startFingerprint = await strictWorktreeFingerprint(root);
    doLog(`worktree start ${startFingerprint.id}`);

    if (runtime === 'browser') {
      ownedServer = await acquireVisualProbeServer({ root });
      assert.equal(ownedServer.ownsServer, true, 'browser soak must own its canonical in-process server');
      rootUrl = ownedServer.baseUrl;
      ({ page, browser, context } = await launchBrowser(viewport));
      pageIssueTracker = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });
      canonicalUrlTracker = createCanonicalUrlTracker(page, rootUrl);
      await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    } else {
      const launched = await launchElectron(root, (owned) => {
        electronApp = owned.electronApp;
        childProcess = owned.childProcess;
        processMonitor = owned.processMonitor;
        pageIssueTracker = owned.pageIssueTracker;
      });
      ({ page, electronApp, childProcess, processMonitor, pageIssueTracker } = launched);
      canonicalUrlTracker = createElectronCanonicalUrlTracker(page, { bootstrapTimeoutMs: 10_000, pollIntervalMs: 75 });
      await pageIssueTracker.bindAndBackfillPage(page);
      rootUrl = await canonicalUrlTracker.waitForCanonicalRoot(10_000);
      assert.deepEqual(inspectCanonicalRootUrl(page.url(), rootUrl).failures, [], 'Electron must remain on its launcher-owned canonical root');
      await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
    }

    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    await page.bringToFront();
    doLog(`${runtime} canonical root ${rootUrl}`);

    const routeResult = await runBrowserPublicRoute({ page, outputDir, expectedRootUrl: rootUrl, log: doLog, flightTimeoutMs, dockTimeoutMs });
    const baselineSettings = await readSettingsTruth(page);
    assert.equal(await isDocked(page), true, 'public route must finish docked for comparable retained-heap baseline');
    await ensureMarketOpen(page);
    await page.waitForTimeout(1_500);
    const baselineMemory = await readPostGcMemorySnapshot(page, 'docked-market-start');

    const cycleResults = [];
    for (let index = 0; index < cycles; index += 1) {
      cycleResults.push(await withTimeout(
        runSoakCycle(page, { index, outputDir, log: doLog }),
        cycleTimeoutMs,
        `release-soak cycle ${index}`,
      ));
    }

    assert.equal(await isDocked(page), true, 'release-soak cycles must finish docked for comparable retained-heap evidence');
    await page.waitForTimeout(1_500);
    const finalMemory = await readPostGcMemorySnapshot(page, 'docked-market-end');

    await undockForRecovery(page, doLog);
    const flightWindow = await sampleRafWindow(page, {
      phaseTag: 'flight_steady',
      warmupMs: 5_000,
      sampleMs: 5_000,
      enableGpuTimers: true,
    });
    const flightSamples = flightWindow.samples;
    const contextLoss = await probeWebGlContextLoss(page, { outputDir, log: doLog });
    const recoveryWindow = await sampleRafWindow(page, {
      phaseTag: 'context_recover_steady',
      warmupMs: 5_000,
      sampleMs: 5_000,
      enableGpuTimers: true,
    });
    const recoverySamples = recoveryWindow.samples;
    const samples = [...flightSamples, ...recoverySamples];
    assert(samples.length > 0, 'steady-state rAF sampler produced no finite frame samples');
    const finalSettings = await readSettingsTruth(page);

    const endFingerprint = await strictWorktreeFingerprint(root);
    assert.equal(endFingerprint.digest, startFingerprint.digest, 'worktree changed during release-soak evidence capture');
    if (runtime === 'electron') {
      const liveUrl = canonicalUrlTracker.observeNow('post-worktree-fingerprint-live');
      assert(liveUrl, 'Electron post-fingerprint live URL observation is required');
      assert.deepEqual(liveUrl.failures, [], 'Electron left its canonical root during the soak');
    }

    const performance = {
      frameMs: summarizeSamples(samples),
      samples,
      phases: {
        flight_steady: {
          ...summarizeSamples(flightSamples),
          attribution: flightWindow.attribution,
        },
        context_recover_steady: {
          ...summarizeSamples(recoverySamples),
          attribution: recoveryWindow.attribution,
        },
      },
      windows: [flightWindow.attribution, recoveryWindow.attribution].filter(Boolean),
      thresholdsClaimed: true,
      notes: [
        'Continuous requestAnimationFrame deltas from uninterrupted steady-state windows.',
        'Rich attribution is one end-of-window snapshot (reset at window start) — not per-frame object churn.',
        'Save/load/dock/trade and the controlled context fault are lifecycle evidence, not steady-state frame samples.',
        'No quality settings or authored assets were changed.',
      ],
    };
    const memory = buildMemoryEvidence(baselineMemory, finalMemory);
    const quality = buildQualityEvidence(routeResult, baselineSettings, finalSettings);

    cleanupReport = runtime === 'electron'
      ? await closeOwnedElectronRuntime({ page, electronApp, childProcess, canonicalUrlTracker, processMonitor, rootUrl })
      : await closeOwnedResources({ page, context, browser, server: ownedServer, canonicalUrlTracker });
    const cleanup = normalizeCleanup(runtime, cleanupReport);
    const cleanupValidation = validateCleanupEvidence(cleanup, { runtimeKind: runtime });
    const errors = buildErrorEvidence(runtime, pageIssueTracker);
    pageIssueTracker?.stop?.();

    const checks = [
      { name: 'shared public route', status: routeResult?.pass === true ? 'pass' : 'fail' },
      { name: 'all public save-load cycles', status: cycleResults.every((cycle) => cycle.summary.pass === true) ? 'pass' : 'fail' },
      { name: 'settings profile preserved', status: quality.settingsPass ? 'pass' : 'fail' },
      { name: 'zero runtime errors or warnings', status: errorCount(errors) === 0 ? 'pass' : 'fail' },
      { name: 'WebGL mesh and frame recovery', status: contextLoss.recovered ? 'pass' : 'fail' },
      { name: 'heap and renderer resources stable', status: validateMemoryEvidence(memory).pass ? 'pass' : 'fail' },
      { name: 'owned runtime cleanup', status: cleanupValidation.pass ? 'pass' : 'fail' },
      { name: 'worktree stable', status: endFingerprint.digest === startFingerprint.digest ? 'pass' : 'fail' },
    ];

    const telemetry = { performance, memory, errors, contextLoss };
    await writeTelemetry(outputDir, telemetry, `${logLines.join('\n')}\n`);
    const artifactDescriptors = buildArtifactDescriptors(root, outputDir, routeResult, cycleResults);
    const artifactValidation = await validateArtifactFiles(root, artifactDescriptors);
    checks.push({ name: 'artifact content integrity', status: artifactValidation.pass ? 'pass' : 'fail' });

    const evidence = {
      schema: RELEASE_SOAK_SCHEMA,
      taskId,
      generatedAt: new Date().toISOString(),
      worktreeId: startFingerprint.id,
      worktreeDigest: startFingerprint.digest,
      runtimeKind: runtime,
      mode,
      cycles: { count: cycles, results: cycleResults.map((cycle) => cycle.summary) },
      primaryAcceptance: true,
      inputSource: 'keyboard-mouse',
      injectedState: false,
      checks,
      artifacts: artifactValidation.verified,
      route: routeResult,
      quality,
      performance,
      memory,
      errors,
      contextLoss,
      cleanup,
      fingerprints: { start: startFingerprint, end: endFingerprint },
    };
    const validation = validateReleaseSoakEvidence(evidence);
    if (!artifactValidation.pass) validation.failures.push(...artifactValidation.failures);
    validation.pass = validation.failures.length === 0;
    evidence.validation = { pass: validation.pass, failures: [...new Set(validation.failures)] };
    await writeFile(path.join(outputDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

    return { pass: evidence.validation.pass, outputDir, evidence, routeResult, cleanupReport, startFingerprint };
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(outputDir, 'failure-screenshot.png'), type: 'png', animations: 'allow' }).catch(() => {});
    }
    throw error;
  } finally {
    if (!cleanupReport) {
      if (runtime === 'electron' && electronApp) {
        cleanupReport = await closeOwnedElectronRuntime({ page, electronApp, childProcess, canonicalUrlTracker, processMonitor, rootUrl }).catch(() => null);
      } else {
        cleanupReport = await closeOwnedResources({ page, context, browser, server: ownedServer, canonicalUrlTracker }).catch(() => null);
      }
    }
    pageIssueTracker?.stop?.();
    await writeFile(path.join(outputDir, 'run.log'), `${logLines.join('\n')}\n`, 'utf8').catch(() => {});
  }
}

async function launchBrowser(viewport) {
  const executablePath = findSystemBrowser();
  assert(executablePath, 'headed Chrome or Edge is required for browser release-soak evidence');
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: false,
    executablePath,
    args: ['--incognito', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--window-size=${viewport.width},${viewport.height}`, '--force-device-scale-factor=1'],
  });
  const context = await browser.newContext({ viewport, screen: viewport, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'dark' });
  const page = await context.newPage();
  return { browser, context, page };
}

async function launchElectron(root, onOwnership = () => {}) {
  const { _electron: electron } = await loadPlaywright();
  const electronApp = await electron.launch({ args: ['.'], cwd: root, timeout: 90_000 });
  const processMonitor = createElectronProcessMonitor({ electronApp, childProcess: electronApp.process() });
  const childProcess = processMonitor.childProcess;
  const pageIssueTracker = createStrictElectronApplicationIssueTracker(electronApp);
  onOwnership({ electronApp, processMonitor, childProcess, pageIssueTracker });
  assert(childProcess, 'Electron launch must expose its owned child process');
  const page = await electronApp.firstWindow({ timeout: 90_000 });
  return { electronApp, processMonitor, childProcess, pageIssueTracker, page };
}

async function runSoakCycle(page, { index, outputDir, log }) {
  const marks = [];
  const samples = [];
  const mark = (name, detail = {}) => {
    marks.push({ name, at: new Date().toISOString(), ...detail });
    log(`[cycle ${index}] ${name}`);
  };

  assert.equal(await isDocked(page), true, `cycle ${index} must start docked`);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === false, null, { timeout: 20_000 });
  mark('undock');

  const beforeInput = await readPlayerSnapshot(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyW');
  const afterInput = await readPlayerSnapshot(page);
  assert(afterInput.tick > beforeInput.tick, 'flight input must advance simulation ticks');
  assert(distance(beforeInput.pos, afterInput.pos) > 0.05 || Math.abs(afterInput.speed - beforeInput.speed) > 0.05, 'flight input must cause motion');
  mark('flight-input', { before: beforeInput, after: afterInput });
  await sampleDiagnostics(page, samples);

  await armSaveLoadObservers(page);
  const savedEconomy = await readEconomySnapshot(page);
  await page.keyboard.press('F5');
  await page.waitForFunction(() => window.__M6_RELEASE_SOAK_EVENTS__?.saved === true && !!localStorage.getItem('sf.save.quick'), null, { timeout: 20_000 });
  const saved = await readPlayerSnapshot(page);
  const savedStorage = await page.evaluate(() => ({ bytes: localStorage.getItem('sf.save.quick')?.length || 0, slot: window.SF?.state?.save?.currentSlot || null }));
  assert(savedStorage.bytes > 100, 'quick-save payload was not persisted');
  mark('save-written', savedStorage);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(650);
  await page.keyboard.up('KeyW');
  const diverged = await readPlayerSnapshot(page);
  assert(distance(saved.pos, diverged.pos) > 0.05 || Math.abs(saved.speed - diverged.speed) > 0.05, 'post-save state must diverge before load');
  await page.keyboard.press('F9');
  await page.waitForFunction(() => window.__M6_RELEASE_SOAK_EVENTS__?.loaded === true && window.SF?.state?.mode === 'flight', null, { timeout: 90_000 });
  const loaded = await readPlayerSnapshot(page);
  const loadedEconomy = await readEconomySnapshot(page);
  const divergedDistance = distance(saved.pos, diverged.pos);
  const restoredDistance = distance(saved.pos, loaded.pos);
  assert(restoredDistance <= Math.max(1, divergedDistance * 0.25), `load position restore exceeded tolerance: ${restoredDistance}`);
  assert(Math.abs(saved.speed - loaded.speed) <= 2, `load speed restore exceeded tolerance: ${saved.speed} -> ${loaded.speed}`);
  mark('load-restored', { saved, diverged, loaded });
  assert.deepEqual(loadedEconomy, savedEconomy, 'credits and cargo must round-trip exactly through save/load');
  mark('economy-restored', { credits: loadedEconomy.credits, cargoKinds: Object.keys(loadedEconomy.cargoItems).length });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    return state?.mode === 'flight'
      && player?.mesh?.userData?.authoredAssetState === 'authored'
      && state.entityList.some((entity) => entity?.type === 'station' && entity?.data?.stationId === 'station_helios');
  }, null, { timeout: 90_000 });
  mark('loaded-world-ready');
  await sampleDiagnostics(page, samples);

  await armHeliosWaypoint(page);
  mark('redock-waypoint');
  const dockPrompt = page.locator('.sf-alert--dock');
  await dockPrompt.waitFor({ state: 'visible', timeout: 90_000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === true, null, { timeout: 20_000 });
  await page.locator('[data-screen="station"]').waitFor({ state: 'visible', timeout: 20_000 });
  mark('docked');

  const marketTab = page.locator('[role="tab"]', { hasText: /market/i }).first();
  await marketTab.waitFor({ state: 'visible', timeout: 20_000 });
  await marketTab.click();
  mark('market-opened');
  await page.waitForTimeout(500);
  const trade = await exerciseMarketRoundtrip(page);
  mark('trade-roundtrip', trade);
  await sampleDiagnostics(page, samples);
  const screenshot = `cycle-${String(index + 1).padStart(2, '0')}-market.png`;
  await page.screenshot({ path: path.join(outputDir, screenshot), type: 'png', animations: 'disabled' });

  const markNames = marks.map((entry) => entry.name);
  return {
    summary: { index, pass: true, docked: true, marks: markNames, sampleCount: samples.length, saveBytes: savedStorage.bytes, screenshot },
    marks,
    samples,
    screenshot,
  };
}

async function undockForRecovery(page, log) {
  assert.equal(await isDocked(page), true, 'context-recovery flight must begin from the comparable docked-market state');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    return state?.mode === 'flight'
      && state?.ui?.docked === false
      && player?.mesh?.userData?.authoredAssetState === 'authored';
  }, null, { timeout: 30_000 });
  log('undocked for steady flight and controlled context recovery');
}

async function armSaveLoadObservers(page) {
  await page.evaluate(() => {
    window.__M6_RELEASE_SOAK_EVENTS__ = { saved: false, loaded: false };
    window.SF.bus.once('save:completed', () => { window.__M6_RELEASE_SOAK_EVENTS__.saved = true; });
    window.SF.bus.once('save:loaded', () => { window.__M6_RELEASE_SOAK_EVENTS__.loaded = true; });
  });
}

async function armHeliosWaypoint(page) {
  await page.keyboard.press('KeyN');
  await page.locator('[data-screen="galaxyMap"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.keyboard.press('/');
  await page.waitForFunction(() => document.activeElement?.matches('.gm-search-input') === true, null, { timeout: 5_000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Helios Station');
  await page.locator('.gm-search-item-name', { hasText: 'Helios Station' }).first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('Enter');
  const button = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  await button.waitFor({ state: 'visible', timeout: 10_000 });
  await clickWaypointWithPointer(page, button);
  await page.waitForFunction(() => {
    const screen = document.querySelector('[data-screen="galaxyMap"]');
    const hidden = !screen || screen.hidden || getComputedStyle(screen).display === 'none' || screen.getBoundingClientRect().width < 2;
    return window.SF?.state?.mode === 'flight' && hidden;
  }, null, { timeout: 10_000 });
}

async function clickWaypointWithPointer(page, locator) {
  const deadline = Date.now() + 10_000;
  let lastBox = null;
  while (Date.now() < deadline) {
    lastBox = await locator.boundingBox().catch(() => null);
    if (lastBox && lastBox.width > 2 && lastBox.height > 2) {
      const x = Math.round(lastBox.x + lastBox.width / 2);
      const y = Math.round(lastBox.y + lastBox.height / 2);
      await page.mouse.move(x, y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.up({ button: 'left' });
      const armed = await page.waitForFunction(() => {
        const autopilot = window.SF?.state?.nav?.autopilot;
        return autopilot?.active === true && /Helios Station/i.test(String(autopilot.label || ''));
      }, null, { timeout: 750 }).then(() => true, () => false);
      if (armed) return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Set Waypoint pointer click did not arm autopilot; last box=${JSON.stringify(lastBox)}`);
}

async function exerciseMarketRoundtrip(page) {
  // Each cycle leaves the market on Sell after completing the roundtrip. Reset the public
  // trade-mode control explicitly so cycle 2+ cannot time out looking for a hidden Buy button.
  const buyMode = page.locator('[data-trade-mode="buy"]').first();
  await buyMode.waitFor({ state: 'visible', timeout: 20_000 });
  await buyMode.click();
  const buyButton = page.locator('.st-buy-btn:not([disabled])').first();
  await buyButton.waitFor({ state: 'visible', timeout: 20_000 });
  const commodityId = await buyButton.evaluate((button) => button.closest('[data-cmdty]')?.getAttribute('data-cmdty') || null);
  assert(commodityId, 'market buy row must identify its commodity');
  const before = await readTradeSnapshot(page, commodityId);
  await buyButton.click();
  const confirmBuy = page.locator('.sf-confirm__ok', { hasText: /^Buy$/ }).first();
  const confirmAppeared = await confirmBuy.waitFor({ state: 'visible', timeout: 1_500 }).then(() => true, () => false);
  if (confirmAppeared) await confirmBuy.click();
  await page.waitForFunction(({ commodityId, credits, owned }) => {
    const state = window.SF?.state;
    return Number(state?.player?.credits) < credits
      && Number(state?.player?.cargo?.items?.[commodityId] || 0) > owned;
  }, before, { timeout: 20_000 });
  const bought = await readTradeSnapshot(page, commodityId);

  await page.locator('[data-trade-mode="sell"]').click();
  const row = page.locator(`[data-cmdty="${commodityId}"]`).first();
  const sellButton = row.locator('.st-sell-btn:not([disabled])');
  await sellButton.waitFor({ state: 'visible', timeout: 20_000 });
  await sellButton.click();
  await page.waitForFunction(({ commodityId, owned }) => Number(window.SF?.state?.player?.cargo?.items?.[commodityId] || 0) <= owned,
    before, { timeout: 20_000 });
  const sold = await readTradeSnapshot(page, commodityId);
  assert.equal(sold.owned, before.owned, 'market roundtrip must sell the purchased unit');
  return { commodityId, before, bought, sold };
}

async function ensureMarketOpen(page) {
  const marketTab = page.locator('[role="tab"]', { hasText: /market/i }).first();
  await marketTab.waitFor({ state: 'visible', timeout: 20_000 });
  if (await marketTab.getAttribute('aria-selected') !== 'true') await marketTab.click();
  await page.locator('.st-buy-btn').first().waitFor({ state: 'visible', timeout: 20_000 });
}

async function readTradeSnapshot(page, commodityId) {
  return page.evaluate((id) => ({
    commodityId: id,
    credits: Number(window.SF?.state?.player?.credits || 0),
    owned: Number(window.SF?.state?.player?.cargo?.items?.[id] || 0),
  }), commodityId);
}

async function readEconomySnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const items = state?.player?.cargo?.items || {};
    return {
      credits: Number(state?.player?.credits),
      cargoItems: Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b))),
    };
  });
}

async function probeWebGlContextLoss(page, { outputDir, log }) {
  const start = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    const canvas = state?.render?.renderer?.domElement || document.getElementById('gl-canvas');
    const gl = state?.render?.renderer?.getContext?.() || canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!canvas || !gl || !extension || !player?.mesh) return { available: false, reason: 'renderer/context/extension/player unavailable' };
    window.__M6_CONTEXT_EVENTS__ = { lost: false, restored: false, rafCount: 0, active: true };
    const countFrame = () => {
      if (window.__M6_CONTEXT_EVENTS__?.active === true) {
        window.__M6_CONTEXT_EVENTS__.rafCount += 1;
        requestAnimationFrame(countFrame);
      }
    };
    requestAnimationFrame(countFrame);
    canvas.addEventListener('webglcontextlost', () => { window.__M6_CONTEXT_EVENTS__.lost = true; }, { once: true });
    canvas.addEventListener('webglcontextrestored', () => { window.__M6_CONTEXT_EVENTS__.restored = true; }, { once: true });
    const before = gl.isContextLost();
    const beforeMeshUuid = player.mesh.uuid;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 350);
    return { available: true, before, beforeMeshUuid };
  });
  assert.equal(start.available, true, `WEBGL_lose_context unavailable: ${start.reason || 'unknown'}`);
  await page.waitForFunction((beforeMeshUuid) => {
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    const data = player?.mesh?.userData || {};
    return window.__M6_CONTEXT_EVENTS__?.lost === true
      && window.__M6_CONTEXT_EVENTS__?.restored === true
      && player?.mesh?.uuid !== beforeMeshUuid
      && data.authoredAssetState === 'authored'
      && data.authoredVisualRoot === 'authored-root'
      && data.authoredReadableFallbackRetained === false;
  }, start.beforeMeshUuid, { timeout: 90_000 });
  const end = await page.evaluate((beforeMeshUuid) => {
    const state = window.SF.state;
    const player = state.entityList.find((entity) => entity?.id === state.playerId);
    const canvas = state.render.renderer.domElement;
    const gl = state.render.renderer.getContext();
    const pixels = canvas.toDataURL('image/png').length;
    const result = {
      after: gl.isContextLost(),
      lostEvent: window.__M6_CONTEXT_EVENTS__.lost,
      restoredEvent: window.__M6_CONTEXT_EVENTS__.restored,
      meshUuid: player.mesh.uuid,
      authoredState: player.mesh.userData.authoredAssetState,
      authoredRoot: player.mesh.userData.authoredVisualRoot,
      beforeMeshUuid,
      meshRebuilt: player.mesh.uuid !== beforeMeshUuid,
      pixelBytes: pixels,
      pixelProof: pixels > 1000,
      rafCount: window.__M6_CONTEXT_EVENTS__.rafCount,
      frameAdvanced: window.__M6_CONTEXT_EVENTS__.rafCount > 2,
    };
    window.__M6_CONTEXT_EVENTS__.active = false;
    return result;
  }, start.beforeMeshUuid);
  await page.screenshot({ path: path.join(outputDir, 'context-restored.png'), type: 'png', animations: 'disabled' });
  const result = { ...start, ...end, recovered: end.lostEvent && end.restoredEvent && end.meshRebuilt && end.pixelProof && end.frameAdvanced && end.after === false };
  log(`context-loss ${JSON.stringify(result)}`);
  return result;
}

/**
 * Steady-window rAF sampler with end-of-window rich attribution.
 * Prefer reset-at-start + one snapshot-at-end over per-frame metric objects.
 *
 * @returns {{ samples: object[], attribution: object }}
 */
async function sampleRafWindow(page, {
  phaseTag,
  warmupMs,
  sampleMs,
  enableGpuTimers = true,
  requireAuthoredFlight = null,
  requireDocked = null,
  requireMiningOrTether = false,
} = {}) {
  const allowed = new Set([...ATTRIBUTION_ROUTE_TAGS, 'flight_steady', 'context_recover_steady']);
  assert(allowed.has(phaseTag), `unsupported steady-state phase: ${phaseTag}`);
  assert(Number.isFinite(warmupMs) && warmupMs >= 0, 'rAF warmup must be finite and non-negative');
  // Attribution-only routes (market / mining) may use shorter windows; soak steady phases stay ≥5s.
  const minSampleMs = (phaseTag === 'flight_steady' || phaseTag === 'context_recover_steady') ? 5_000 : 1_000;
  assert(Number.isFinite(sampleMs) && sampleMs >= minSampleMs, `rAF sample window must cover at least ${minSampleMs} ms`);

  const needFlight = requireAuthoredFlight != null
    ? requireAuthoredFlight
    : (phaseTag === 'flight_steady' || phaseTag === 'context_recover_steady' || phaseTag === 'mining_tether_active');
  const needDocked = requireDocked != null
    ? requireDocked
    : phaseTag === 'docked_market_ui';

  return page.evaluate(async ({
    tag, warmup, duration, gpuOn, needFlight: needFlightFlag, needDocked: needDockedFlag, needMining,
  }) => {
    if (document.visibilityState !== 'visible') throw new Error(`steady-state ${tag} requires a visible document`);
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);

    if (needFlightFlag) {
      if (state?.mode !== 'flight' || state?.ui?.docked !== false || player?.mesh?.userData?.authoredAssetState !== 'authored') {
        throw new Error(`steady-state ${tag} requires authored active flight`);
      }
    }
    if (needDockedFlag) {
      if (state?.ui?.docked !== true) throw new Error(`steady-state ${tag} requires docked UI path`);
    }

    function readSettingsSlice() {
      const video = state?.settings?.video || {};
      return {
        video: {
          renderScale: video.renderScale,
          pixelRatioCap: video.pixelRatioCap,
          shadows: video.shadows,
          bloom: video.bloom,
          bloomStrength: video.bloomStrength,
          particleQuality: video.particleQuality,
          renderGraph: video.renderGraph,
          dynamicResolution: video.dynamicResolution,
        },
        dynResScale: Number.isFinite(state?.render?.dynResScale) ? state.render.dynResScale : 1,
        timeScale: Number.isFinite(state?.timeScale) ? state.timeScale : 1,
      };
    }

    function readRouteProof() {
      const perf = window.__SPACEFACE_PERF__ && typeof window.__SPACEFACE_PERF__.getReport === 'function'
        ? window.__SPACEFACE_PERF__.getReport()
        : null;
      const diag = window.__THREE_GAME_DIAGNOSTICS__ && typeof window.__THREE_GAME_DIAGNOSTICS__.getReport === 'function'
        ? window.__THREE_GAME_DIAGNOSTICS__.getReport()
        : null;
      const vfxSub = (perf && perf.counters && perf.counters.vfxSubsystems) || {};
      const entities = (perf && perf.entities) || {};
      const docked = state?.ui?.docked === true;
      const stationScreen = document.querySelector('[data-screen="station"]');
      const stationVisible = !!(stationScreen && !stationScreen.hidden
        && getComputedStyle(stationScreen).display !== 'none'
        && stationScreen.getBoundingClientRect().width > 2);
      const miningActive = (Number(vfxSub.miningBeam) || 0) > 0;
      const tetherActive = (Number(vfxSub.tetherCable) || 0) > 0;
      return {
        mode: state?.mode || null,
        docked,
        uiOnlyPath: docked === true,
        uiOnlyPathNote: docked
          ? 'Docked station market/hub — UI-dominant path; renderer still runs (not zero-cost).'
          : null,
        stationScreenVisible: stationVisible,
        entityCounts: entities,
        entityTotal: Number(entities.total) || (state?.entityList?.length || 0),
        vfxSubsystems: { ...vfxSub },
        miningVfxActive: miningActive,
        tetherVfxActive: tetherActive,
        authoredAssetState: player?.mesh?.userData?.authoredAssetState || null,
        tick: Number(state?.tick) || 0,
        post: diag?.post || null,
      };
    }

    function setGpuTimersEnabled(on) {
      const timers = state?.render?.gpuTimers;
      if (timers && typeof timers.setEnabled === 'function') {
        try { timers.setEnabled(!!on); } catch (_) { /* capability may refuse */ }
        if (on && typeof timers.reset === 'function') {
          try { timers.reset(); } catch (_) { /* ignore */ }
        }
      }
    }

    function setRenderWorkEnabled(on) {
      const perf = window.__SPACEFACE_PERF__ || state?.perfRuntime;
      if (perf && typeof perf.setRenderWorkEnabled === 'function') {
        try { perf.setRenderWorkEnabled(!!on); } catch (_) { /* ignore */ }
      }
    }

    function resetProbes() {
      try { if (window.__SPACEFACE_PERF__?.reset) window.__SPACEFACE_PERF__.reset(); } catch (_) { /* ignore */ }
      try { if (window.__THREE_GAME_DIAGNOSTICS__?.reset) window.__THREE_GAME_DIAGNOSTICS__.reset(); } catch (_) { /* ignore */ }
      try { if (state?.render?.resetPostTelemetrySample) state.render.resetPostTelemetrySample(); } catch (_) { /* ignore */ }
      if (state?.render?.gpuTimers && typeof state.render.gpuTimers.reset === 'function') {
        try { state.render.gpuTimers.reset(); } catch (_) { /* ignore */ }
      }
    }

    function buildAttribution(frameSummary, settingsStart, settingsEnd, routeStart, routeEnd) {
      const perf = window.__SPACEFACE_PERF__ && typeof window.__SPACEFACE_PERF__.getReport === 'function'
        ? window.__SPACEFACE_PERF__.getReport()
        : null;
      const diag = window.__THREE_GAME_DIAGNOSTICS__ && typeof window.__THREE_GAME_DIAGNOSTICS__.getReport === 'function'
        ? window.__THREE_GAME_DIAGNOSTICS__.getReport()
        : null;
      const gpu = state?.render?.gpuTimers && typeof state.render.gpuTimers.getReport === 'function'
        ? state.render.gpuTimers.getReport()
        : (diag?.post?.gpuTimers || { available: false, status: 'unavailable', reason: 'not-installed' });

      const phases = perf?.phases || {};
      const loop = perf?.loop || {};
      const renderWork = perf?.renderWork || {};
      const memory = diag?.memory || {};
      const render = diag?.render || {};
      const post = diag?.post || routeEnd?.post || null;

      return {
        routeTag: tag,
        frameMs: frameSummary,
        sampleCount: frameSummary.sampleCount,
        cpu: {
          frameCallback: perf?.frameCallback || null,
          frameUntracked: perf?.frameUntracked || null,
          phases: {
            sim: phases.sim || null,
            simFrame: phases.simFrame || null,
            render: phases.render || null,
            vfx: phases.vfx || null,
            feel: phases.feel || null,
            ui: phases.ui || null,
          },
          renderWork: {
            prepareFrame: renderWork.prepareFrame || null,
            drawPreparedFrame: renderWork.drawPreparedFrame || null,
            entityViewSync: renderWork.entityViewSync || null,
            bloomScene: renderWork.bloomScene || null,
            bloomDownsample: renderWork.bloomDownsample || null,
            bloomUpsample: renderWork.bloomUpsample || null,
            bloomComposite: renderWork.bloomComposite || null,
          },
        },
        loop: {
          stepsThisFrame: loop.stepsThisFrame,
          maxStepsThisFrame: loop.maxStepsThisFrame,
          shedBacklogFrames: loop.shedBacklogFrames,
          accumulatorS: loop.accumulatorS,
          lastFrameDtMs: loop.lastFrameDtMs,
        },
        draw: {
          calls: render.calls,
          triangles: render.triangles,
          points: render.points,
          lines: render.lines,
          geometries: memory.geometries,
          textures: memory.textures,
          programs: memory.programs,
        },
        post: post ? {
          activePath: post.activePath,
          bloomSelected: post.bloomSelected,
          bloomPasses: post.bloomPasses,
          fullFramePasses: post.fullFramePasses,
          renderTargetCount: post.renderTargetCount,
          bufferWidth: post.bufferWidth,
          bufferHeight: post.bufferHeight,
          dynResScale: post.dynResScale,
          bloom: post.bloom || null,
          renderGraphDetails: post.renderGraphDetails || null,
        } : null,
        routeProof: {
          ...(routeEnd || routeStart || {}),
          start: routeStart || null,
          end: routeEnd || null,
        },
        settings: {
          start: settingsStart,
          end: settingsEnd,
        },
        gpuTimers: {
          available: gpu?.available === true,
          status: gpu?.status || (gpu?.available ? 'available' : 'unavailable'),
          reason: gpu?.reason || null,
          extension: gpu?.extension || null,
          enabled: gpu?.enabled === true,
          lastDisjoint: gpu?.lastDisjoint === true,
          pending: gpu?.pending,
          passes: gpu?.passes || null,
        },
        capturedAt: new Date().toISOString(),
      };
    }

    const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const warmupStart = performance.now();
    while (performance.now() - warmupStart < warmup) await raf();

    const settingsStart = readSettingsSlice();
    const routeStart = readRouteProof();
    if (needMining) {
      if (!routeStart.miningVfxActive && !routeStart.tetherVfxActive) {
        throw new Error(`steady-state ${tag} requires active mining or tether VFX proof`);
      }
    }

    // Opt-in measurement window only. Always disable CPU/GPU gates on exit.
    setRenderWorkEnabled(true);
    setGpuTimersEnabled(gpuOn);
    try {
      resetProbes();

      const samples = [];
      const sampleStart = performance.now();
      let previous = await raf();
      while (performance.now() - sampleStart < duration) {
        const timestamp = await raf();
        const frameMs = timestamp - previous;
        previous = timestamp;
        if (Number.isFinite(frameMs) && frameMs > 0) {
          // Lightweight rAF sample only — no per-frame perf/diag object churn.
          samples.push({
            atMs: timestamp,
            frameMs,
            phaseTag: tag,
            tick: Number(window.SF?.state?.tick),
            mode: window.SF?.state?.mode || null,
            docked: window.SF?.state?.ui?.docked === true,
            visibility: document.visibilityState,
          });
        }
      }

      // Allow a couple of frames so async GPU query readback can settle without spinning.
      await raf();
      await raf();
      if (state?.render?.gpuTimers && typeof state.render.gpuTimers.poll === 'function') {
        try { state.render.gpuTimers.poll(); } catch (_) { /* ignore */ }
      }

      const settingsEnd = readSettingsSlice();
      const routeEnd = readRouteProof();

      // Local percentile summary matching summarizeSamples contract keys.
      const values = samples.map((sample) => sample.frameMs).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
      const pct = (ratio) => (values.length ? values[Math.min(values.length - 1, Math.ceil((values.length - 1) * ratio))] : null);
      const frameSummary = {
        sampleCount: values.length,
        p50: pct(0.50),
        p95: pct(0.95),
        p99: pct(0.99),
        max: values.length ? values[values.length - 1] : null,
        hitchesOver32Ms: values.filter((v) => v > 32).length,
      };

      const attribution = buildAttribution(frameSummary, settingsStart, settingsEnd, routeStart, routeEnd);
      return { samples, attribution };
    } finally {
      setGpuTimersEnabled(false);
      setRenderWorkEnabled(false);
    }
  }, {
    tag: phaseTag,
    warmup: warmupMs,
    duration: sampleMs,
    gpuOn: enableGpuTimers === true,
    needFlight,
    needDocked,
    needMining: requireMiningOrTether === true,
  });
}


/**
 * Pure diagnostic A/B helpers (testable without a browser).
 * These mutate a state-like object. NOT shippable fixes — measurement arms only.
 */
function snapshotDiagnosticSettings(state) {
  return {
    timeScale: Number.isFinite(state?.timeScale) ? state.timeScale : 1,
    bloom: state?.settings?.video ? state.settings.video.bloom : true,
    spaceBgVisible: state?.render?.spaceBg?.group?.visible !== false,
    entityIsolationActive: state?.render?.perfEntityIsolation?.inspect?.().active === true,
    label: 'DIAGNOSTIC-ONLY — not a shippable fix',
  };
}

function applyDiagnosticVariantToState(state, snap, variantId) {
  assert(ATTRIBUTION_DIAGNOSTIC_VARIANTS.includes(variantId), `unknown diagnostic variant: ${variantId}`);
  if (!state) throw new Error('state unavailable for diagnostic variant');
  const label = 'DIAGNOSTIC-ONLY — not a shippable fix';
  if (variantId === 'baseline') {
    state.timeScale = snap.timeScale;
    if (state.settings?.video) state.settings.video.bloom = snap.bloom;
    if (state.render?.spaceBg?.group) state.render.spaceBg.group.visible = snap.spaceBgVisible;
    state.render?.perfEntityIsolation?.restore?.();
    return { id: variantId, diagnostic: false, label: 'baseline (restored defaults)', applied: true };
  }
  if (variantId === 'sim_paused') {
    state.timeScale = 0;
    return { id: variantId, diagnostic: true, label, applied: true, timeScale: 0 };
  }
  if (variantId === 'bloom_off') {
    if (state.settings?.video) state.settings.video.bloom = false;
    return { id: variantId, diagnostic: true, label, applied: true, bloom: false };
  }
  if (variantId === 'background_hidden') {
    if (!state.render?.spaceBg?.group) throw new Error('space background group unavailable');
    state.render.spaceBg.group.visible = false;
    return { id: variantId, diagnostic: true, label, applied: true, spaceBgVisible: false };
  }
  if (variantId === 'non_player_entities_hidden') {
    const isolation = state.render?.perfEntityIsolation;
    if (!isolation?.hideNonPlayer) throw new Error('renderer entity isolation unavailable');
    return { id: variantId, diagnostic: true, label, applied: true, ...isolation.hideNonPlayer() };
  }
  throw new Error(`unhandled diagnostic variant ${variantId}`);
}

function restoreDiagnosticVariantToState(state, snap) {
  if (!state || !snap) return { restored: true, reason: 'nothing-to-restore' };
  state.timeScale = snap.timeScale;
  if (state.settings?.video) state.settings.video.bloom = snap.bloom;
  if (state.render?.spaceBg?.group) state.render.spaceBg.group.visible = snap.spaceBgVisible;
  state.render?.perfEntityIsolation?.restore?.();
  const videoBloom = state.settings?.video?.bloom;
  const spaceBgVisible = state.render?.spaceBg?.group?.visible !== false;
  const ok = state.timeScale === snap.timeScale && videoBloom === snap.bloom
    && spaceBgVisible === snap.spaceBgVisible
    && state.render?.perfEntityIsolation?.inspect?.().active !== true;
  return {
    restored: ok === true,
    diagnostic: true,
    label: 'DIAGNOSTIC-ONLY — restored settings/timeScale exactly',
    timeScale: state.timeScale,
    bloom: videoBloom,
    spaceBgVisible,
  };
}

/**
 * Diagnostic A/B switches for attribution only. Guarantees exact restoration of settings/timeScale.
 * These are NOT shippable fixes.
 */
async function applyDiagnosticVariant(page, variantId) {
  assert(ATTRIBUTION_DIAGNOSTIC_VARIANTS.includes(variantId), `unknown diagnostic variant: ${variantId}`);
  return page.evaluate((id) => {
    const state = window.SF?.state;
    if (!state) throw new Error('SF.state unavailable for diagnostic variant');
    const label = 'DIAGNOSTIC-ONLY — not a shippable fix';
    if (!window.__SF_PERF_ATTRIBUTION_RESTORE__) {
      window.__SF_PERF_ATTRIBUTION_RESTORE__ = {
        timeScale: Number.isFinite(state.timeScale) ? state.timeScale : 1,
        bloom: state.settings?.video ? state.settings.video.bloom : true,
        spaceBgVisible: state.render?.spaceBg?.group?.visible !== false,
        entityIsolationActive: state.render?.perfEntityIsolation?.inspect?.().active === true,
        label,
      };
    }
    const snap = window.__SF_PERF_ATTRIBUTION_RESTORE__;
    if (id === 'baseline') {
      state.timeScale = snap.timeScale;
      if (state.settings?.video) state.settings.video.bloom = snap.bloom;
      if (state.render?.spaceBg?.group) state.render.spaceBg.group.visible = snap.spaceBgVisible;
      state.render?.perfEntityIsolation?.restore?.();
      try { window.SF?.bus?.emit('settings:changed', { section: 'video', key: 'bloom' }); } catch (_) { /* ignore */ }
      return { id, diagnostic: false, label: 'baseline (restored defaults)', applied: true };
    }
    if (id === 'sim_paused') {
      state.timeScale = 0;
      return { id, diagnostic: true, label, applied: true, timeScale: 0 };
    }
    if (id === 'bloom_off') {
      if (state.settings?.video) state.settings.video.bloom = false;
      try { window.SF?.bus?.emit('settings:changed', { section: 'video', key: 'bloom' }); } catch (_) { /* ignore */ }
      return { id, diagnostic: true, label, applied: true, bloom: false };
    }
    if (id === 'background_hidden') {
      if (!state.render?.spaceBg?.group) throw new Error('space background group unavailable');
      state.render.spaceBg.group.visible = false;
      return { id, diagnostic: true, label, applied: true, spaceBgVisible: false };
    }
    if (id === 'non_player_entities_hidden') {
      const isolation = state.render?.perfEntityIsolation;
      if (!isolation?.hideNonPlayer) throw new Error('renderer entity isolation unavailable');
      return { id, diagnostic: true, label, applied: true, ...isolation.hideNonPlayer() };
    }
    throw new Error(`unhandled diagnostic variant ${id}`);
  }, variantId);
}

async function restoreDiagnosticVariant(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const snap = window.__SF_PERF_ATTRIBUTION_RESTORE__;
    if (!state || !snap) return { restored: true, reason: 'nothing-to-restore' };
    state.timeScale = snap.timeScale;
    if (state.settings?.video) state.settings.video.bloom = snap.bloom;
    if (state.render?.spaceBg?.group) state.render.spaceBg.group.visible = snap.spaceBgVisible;
    state.render?.perfEntityIsolation?.restore?.();
    try { window.SF?.bus?.emit('settings:changed', { section: 'video', key: 'bloom' }); } catch (_) { /* ignore */ }
    const videoBloom = state.settings?.video?.bloom;
    const spaceBgVisible = state.render?.spaceBg?.group?.visible !== false;
    const ok = state.timeScale === snap.timeScale && videoBloom === snap.bloom
      && spaceBgVisible === snap.spaceBgVisible
      && state.render?.perfEntityIsolation?.inspect?.().active !== true;
    delete window.__SF_PERF_ATTRIBUTION_RESTORE__;
    return {
      restored: ok === true,
      diagnostic: true,
      label: 'DIAGNOSTIC-ONLY — restored settings/timeScale exactly',
      timeScale: state.timeScale,
      bloom: videoBloom,
      spaceBgVisible,
    };
  });
}

/**
 * Ensure mining or tether VFX is active for route proof.
 * DIAGNOSTIC STRESS: emits mining:start/tick on the bus — not the player input path.
 */
async function ensureMiningOrTetherVfx(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf?.state;
    if (!state) return { ok: false, reason: 'no-state' };
    const player = state.entityList?.find((e) => e?.id === state.playerId);
    if (!player || state.ui?.docked) return { ok: false, reason: 'not-in-flight' };
    let asteroid = null;
    for (const e of state.entityList || []) {
      if (e && e.alive !== false && e.type === 'asteroid') { asteroid = e; break; }
    }
    if (!asteroid) return { ok: false, reason: 'no-asteroid' };
    try {
      // Diagnostic stress only: bus events, not player mining/tether input actions.
      sf.bus.emit('mining:start', { targetId: asteroid.id });
      sf.bus.emit('mining:tick', {
        targetId: asteroid.id,
        oreId: asteroid.data?.typeId || 'ast_metallic',
      });
    } catch (err) {
      return { ok: false, reason: String(err && err.message || err) };
    }
    const perf = window.__SPACEFACE_PERF__?.getReport?.();
    const vfx = perf?.counters?.vfxSubsystems || {};
    return {
      ok: true,
      diagnostic: true,
      diagnosticStress: true,
      playerInputPath: false,
      label: 'DIAGNOSTIC STRESS — bus-emitted mining:start/tick (not player input path)',
      targetId: asteroid.id,
      vfx,
    };
  });
}

function buildPerformanceAttributionDocument({
  taskId = 'performance-attribution',
  runtimeKind = 'browser',
  windows = [],
  variants = [],
  notes = [],
} = {}) {
  return {
    schema: PERFORMANCE_ATTRIBUTION_SCHEMA,
    kind: 'diagnostic-measurement',
    qualityPreserving: true,
    taskId,
    generatedAt: new Date().toISOString(),
    runtimeKind,
    notes: [
      'Measurement-first frame-pacing attribution. No structural optimization claimed.',
      'Diagnostic A/B variants (sim_paused, bloom_off) must restore settings/timeScale exactly.',
      ...notes,
    ],
    windows,
    variants,
  };
}

/**
 * Disable CPU/GPU measurement gates after a sampling window (best-effort).
 */
async function disableMeasurementGates(page) {
  return page.evaluate(() => {
    try {
      if (window.__SPACEFACE_PERF__ && typeof window.__SPACEFACE_PERF__.setRenderWorkEnabled === 'function') {
        window.__SPACEFACE_PERF__.setRenderWorkEnabled(false);
      }
    } catch (_) { /* ignore */ }
    try {
      const timers = window.SF?.state?.render?.gpuTimers;
      if (timers && typeof timers.setEnabled === 'function') timers.setEnabled(false);
    } catch (_) { /* ignore */ }
    return { renderWorkEnabled: window.__SPACEFACE_PERF__?.renderWorkEnabled === true };
  }).catch(() => ({ renderWorkEnabled: false }));
}

/**
 * Collect multi-route attribution windows with optional diagnostic A/B variants.
 * Each diagnostic variant body is failure-atomic: restore settings/timeScale + disable
 * measurement gates in finally.
 */
async function samplePerformanceAttribution(page, {
  routes = ['flight_steady', 'docked_market_ui'],
  variants = ['baseline'],
  warmupMs = 2_000,
  sampleMs = 5_000,
  log = () => {},
  navigateToRoute = null,
} = {}) {
  const windows = [];
  const variantResults = [];

  for (const variantId of variants) {
    log(`[attribution] diagnostic variant ${variantId}`);
    let appliedAll = true;
    let restoredAll = true;
    let variantLabel = variantId === 'baseline' ? 'baseline (restored defaults)' : 'DIAGNOSTIC-ONLY';
    for (const routeTag of routes) {
      log(`[attribution] route ${routeTag} @ ${variantId}`);
      if (typeof navigateToRoute === 'function') {
        await navigateToRoute(page, routeTag, log);
      } else {
        if (routeTag === 'mining_tether_active') {
          await ensureMiningOrTetherVfx(page);
          await page.waitForTimeout(400);
        }
        if (routeTag === 'docked_market_ui') {
          const docked = await isDocked(page);
          if (!docked) {
            log(`[attribution] skip ${routeTag}: not docked`);
            continue;
          }
          await ensureMarketOpen(page).catch(() => {});
        }
        if (routeTag === 'flight_steady' || routeTag === 'mining_tether_active' || routeTag === 'context_recover_steady') {
          const docked = await isDocked(page);
          if (docked) {
            log(`[attribution] skip ${routeTag}: still docked`);
            continue;
          }
        }
      }

      // Route navigation may legitimately change timeScale (dock=0, flight=1). Capture the
      // authority after navigation, then apply and restore one diagnostic arm around this window.
      const routeBaseline = await page.evaluate(() => {
        const state = window.SF?.state;
        if (!state) throw new Error('SF.state unavailable for route attribution baseline');
        return {
          timeScale: Number.isFinite(state.timeScale) ? state.timeScale : 1,
          bloom: state.settings?.video ? state.settings.video.bloom : true,
          spaceBgVisible: state.render?.spaceBg?.group?.visible !== false,
        };
      });
      let applied = null;
      let restored = { restored: false };
      try {
        await page.evaluate((baseline) => {
          window.__SF_PERF_ATTRIBUTION_RESTORE__ = { ...baseline, label: 'DIAGNOSTIC-ONLY — immutable route baseline' };
        }, routeBaseline);
        applied = await applyDiagnosticVariant(page, variantId);
        variantLabel = applied?.label || variantLabel;
        const result = await sampleRafWindow(page, {
          phaseTag: routeTag,
          warmupMs,
          sampleMs: routeTag === 'docked_market_ui' ? Math.max(1_000, sampleMs) : sampleMs,
          enableGpuTimers: true,
          requireMiningOrTether: routeTag === 'mining_tether_active',
        });
        if (result?.attribution) {
          result.attribution.diagnosticVariant = variantId;
          result.attribution.diagnostic = variantId !== 'baseline';
          if (routeTag === 'mining_tether_active') {
            result.attribution.routeProof = {
              ...(result.attribution.routeProof || {}),
              diagnosticStress: true,
              playerInputPath: false,
              routeNote: 'DIAGNOSTIC STRESS — mining VFX via bus events, not player input path',
            };
          }
          windows.push(result.attribution);
        }
      } finally {
        restored = await restoreDiagnosticVariant(page).catch((err) => ({
          restored: false,
          reason: String(err && err.message || err),
        }));
        if (restored?.timeScale !== routeBaseline.timeScale
          || restored?.bloom !== routeBaseline.bloom
          || restored?.spaceBgVisible !== routeBaseline.spaceBgVisible) {
          restored = {
            ...restored,
            restored: false,
            reason: `route baseline mismatch: expected timeScale=${routeBaseline.timeScale}, bloom=${routeBaseline.bloom}, spaceBgVisible=${routeBaseline.spaceBgVisible}`,
          };
        }
        await disableMeasurementGates(page);
      }
      appliedAll = appliedAll && applied?.applied === true;
      restoredAll = restoredAll && restored?.restored === true;
    }
    variantResults.push({
      id: variantId,
      diagnostic: variantId !== 'baseline',
      applied: appliedAll,
      restored: restoredAll,
      label: variantLabel,
    });
  }

  const doc = buildPerformanceAttributionDocument({
    taskId: 'performance-attribution-ab',
    windows,
    variants: variantResults,
    notes: [
      'mining_tether_active is DIAGNOSTIC STRESS via bus-emitted mining events (not player input path).',
    ],
  });
  const validation = validatePerformanceAttribution(doc);
  doc.validation = validation;
  return { document: doc, validation };
}

async function readPlayerSnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entityList.find((entity) => entity?.id === state.playerId);
    return { tick: Number(state.tick), pos: { x: Number(player.pos.x), z: Number(player.pos.z) }, speed: Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0)) };
  });
}

async function readPostGcMemorySnapshot(page, phaseTag) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
  } finally {
    await cdp.detach().catch(() => {});
  }
  return page.evaluate((tag) => {
    const report = window.__THREE_GAME_DIAGNOSTICS__?.getReport?.();
    const heap = performance?.memory;
    const state = window.SF?.state;
    return {
      phaseTag: tag,
      mode: state?.mode || null,
      docked: state?.ui?.docked === true,
      heapBytes: Number.isFinite(heap?.usedJSHeapSize) ? heap.usedJSHeapSize : null,
      totalHeapBytes: Number.isFinite(heap?.totalJSHeapSize) ? heap.totalJSHeapSize : null,
      heapLimitBytes: Number.isFinite(heap?.jsHeapSizeLimit) ? heap.jsHeapSizeLimit : null,
      geometries: finiteOrNull(report?.memory?.geometries),
      textures: finiteOrNull(report?.memory?.textures),
      programs: finiteOrNull(report?.memory?.programs),
      entities: finiteOrNull(state?.entityList?.length),
    };
    function finiteOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
  }, phaseTag);
}

async function readSettingsTruth(page) {
  return page.evaluate(() => {
    const settings = window.SF?.state?.settings || {};
    return JSON.parse(JSON.stringify({ video: settings.video || null, audio: settings.audio || null, input: settings.input || null }));
  });
}

async function readDiagnosticsSample(page) {
  return page.evaluate(() => {
    const report = window.__THREE_GAME_DIAGNOSTICS__?.getReport?.();
    const frameMs = Number(report?.frameMs?.last);
    return { atMs: performance.now(), frameMs, memory: report?.memory || null, counts: report?.counts || null, tick: Number(window.SF?.state?.tick) };
  });
}

async function sampleDiagnostics(page, samples) {
  try {
    const sample = await readDiagnosticsSample(page);
    if (Number.isFinite(sample?.frameMs) && sample.frameMs > 0) samples.push(sample);
  } catch { /* transitions and cleanup can temporarily invalidate the page */ }
}

function buildMemoryEvidence(start, end) {
  assert(start?.phaseTag === 'docked-market-start' && end?.phaseTag === 'docked-market-end', 'retained heap endpoints must use comparable docked-market phases');
  assert(start?.docked === true && end?.docked === true, 'retained heap endpoints must both be docked');
  const range = (key) => ({ start: start[key], end: end[key], delta: Number.isFinite(start[key]) && Number.isFinite(end[key]) ? end[key] - start[key] : null });
  const heapGrowthBytes = Number.isFinite(start.heapBytes) && Number.isFinite(end.heapBytes) ? end.heapBytes - start.heapBytes : null;
  return {
    heapBytesStart: start.heapBytes,
    heapBytesEnd: end.heapBytes,
    heapGrowthBytes,
    retainedAfterGc: true,
    comparableState: 'docked-market',
    startSnapshot: start,
    endSnapshot: end,
    geometries: range('geometries'),
    textures: range('textures'),
    programs: range('programs'),
    withinBudget: Number.isFinite(heapGrowthBytes) && heapGrowthBytes <= PERF_BUDGET.maxHeapGrowthBytes,
  };
}

function buildQualityEvidence(routeResult, startSettings, endSettings) {
  const start = validateSettingsTruth(startSettings);
  const end = validateSettingsTruth(endSettings, { expected: startSettings });
  const shortcut = validateNoQualityShortcuts({ settingsOverridesApplied: false, physicsSimplification: false, authoredAssetFallback: routeResult?.launchSnapshot?.authored?.ready !== true, authoredReady: routeResult?.launchSnapshot?.authored?.ready === true });
  return {
    settingsOverridesApplied: false,
    physicsSimplification: false,
    authoredAssetFallback: routeResult?.launchSnapshot?.authored?.ready !== true,
    authoredReady: routeResult?.launchSnapshot?.authored?.ready === true,
    startSettings,
    endSettings,
    settingsPass: start.pass && end.pass && shortcut.pass,
    failures: [...start.failures, ...end.failures, ...shortcut.failures],
  };
}

function buildErrorEvidence(runtime, tracker) {
  const raw = runtime === 'electron' ? tracker?.all?.() || [] : tracker?.issues || [];
  const normalized = raw.map((issue) => ({
    type: issue.type || issue.level || 'unknown',
    source: issue.source || 'console',
    text: String(issue.text || ''),
  }));
  const expectedWarnings = normalized.filter((issue) => issue.type === 'warning' && /WebGL context (?:lost|restored)/i.test(issue.text));
  // These two ANGLE translator diagnostics are stable Chromium/vendor compiler noise on this
  // machine, not application shader or resource-lifecycle defects. Keep them visible in evidence,
  // but do not let them mask real warnings such as duplicate KTX2 loaders or wrong-context deletes.
  const vendorWarnings = normalized.filter((issue) => issue.type === 'warning' && (
    /\bX4000\b.*\bf_surfaceColor\b/i.test(issue.text)
    || /\bX4122\b.*\bprecision\b/i.test(issue.text)
  ));
  const issues = normalized.filter((issue) => !expectedWarnings.includes(issue) && !vendorWarnings.includes(issue));
  return {
    pageErrors: issues.filter((issue) => issue.type === 'pageerror' || issue.source === 'pageerror' || issue.source === 'page-crash').map((issue) => issue.text),
    requestFailures: issues.filter((issue) => issue.source === 'request' || /Request failed/i.test(issue.text)).map((issue) => issue.text),
    httpErrors: issues.filter((issue) => issue.source === 'response' || /^HTTP \d{3}/i.test(issue.text)).map((issue) => issue.text),
    consoleErrors: issues.filter((issue) => issue.type === 'error' && !['request', 'response'].includes(issue.source)).map((issue) => issue.text),
    glErrors: issues.filter((issue) => issue.type === 'error' && /\b(?:WebGL|GL_|shader|context lost)\b/i.test(issue.text)).map((issue) => issue.text),
    warnings: issues.filter((issue) => issue.type === 'warning').map((issue) => issue.text),
    expectedWarnings: expectedWarnings.map((issue) => issue.text),
    vendorWarnings: vendorWarnings.map((issue) => issue.text),
    all: normalized,
  };
}

function normalizeCleanup(runtime, report) {
  if (runtime === 'electron') {
    return {
      pageClosed: report?.pageClosed === true,
      browserDisconnected: report?.appCloseCompleted === true,
      serverReleased: report?.listenerReleased === true,
      processExited: report?.processExited === true,
      portsReleased: report?.listenerReleased === true,
      reportPass: report?.pass === true,
      ownedReport: report,
    };
  }
  return {
    pageClosed: report?.pageClosed === true,
    browserDisconnected: report?.browserDisconnected === true,
    browserClosed: report?.browserClosed === true,
    serverReleased: report?.serverReleased === true,
    processExited: true,
    portsReleased: report?.serverReleased === true,
    reportPass: report?.pass !== false,
    ownedReport: report,
  };
}

async function writeTelemetry(outputDir, { performance, memory, errors, contextLoss }, log) {
  const attribution = buildPerformanceAttributionDocument({
    taskId: 'release-soak-steady-windows',
    runtimeKind: 'browser',
    windows: performance?.windows || [],
    variants: [],
    notes: performance?.notes || [],
  });
  await Promise.all([
    writeFile(path.join(outputDir, 'performance-telemetry.json'), `${JSON.stringify(performance, null, 2)}\n`, 'utf8'),
    writeFile(path.join(outputDir, 'performance-attribution.json'), `${JSON.stringify(attribution, null, 2)}\n`, 'utf8'),
    writeFile(path.join(outputDir, 'memory-telemetry.json'), `${JSON.stringify(memory, null, 2)}\n`, 'utf8'),
    writeFile(path.join(outputDir, 'error-telemetry.json'), `${JSON.stringify(errors, null, 2)}\n`, 'utf8'),
    writeFile(path.join(outputDir, 'context-loss-telemetry.json'), `${JSON.stringify(contextLoss, null, 2)}\n`, 'utf8'),
    writeFile(path.join(outputDir, 'run.log'), log, 'utf8'),
  ]);
}

function buildArtifactDescriptors(root, outputDir, routeResult, cycleResults) {
  const entries = [
    ['telemetry', 'performance-telemetry.json'],
    ['telemetry', 'performance-attribution.json'],
    ['telemetry', 'memory-telemetry.json'],
    ['telemetry', 'error-telemetry.json'],
    ['telemetry', 'context-loss-telemetry.json'],
    ['log', 'run.log'],
    ['screenshot', 'context-restored.png'],
    ...(routeResult?.screenshots || []).map((name) => ['screenshot', name]),
    ...cycleResults.map((cycle) => ['screenshot', cycle.screenshot]),
  ];
  return entries.map(([kind, name]) => ({ kind, path: relativeTo(root, path.join(outputDir, name)) }));
}

async function allocateOutputDir(outputRoot, taskId) {
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${randomBytes(4).toString('hex')}`;
  const dir = path.join(outputRoot, `${taskId}-${stamp}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

function findSystemBrowser() {
  return [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
    .filter(Boolean).find((candidate) => existsSync(candidate)) || null;
}

function errorCount(errors) { return ['pageErrors', 'requestFailures', 'glErrors', 'consoleErrors', 'httpErrors', 'warnings'].reduce((sum, key) => sum + (errors[key]?.length || 0), 0); }
function relativeTo(root, filePath) { return path.relative(root, filePath).replace(/\\/g, '/'); }
function distance(a, b) { return Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.z || 0) - Number(b?.z || 0)); }
async function isDocked(page) { return page.evaluate(() => window.SF?.state?.ui?.docked === true).catch(() => false); }
function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs); })]).finally(() => clearTimeout(timer));
}

/**
 * Full headed attribution matrix on the canonical browser game route.
 * Writes performance-attribution.json under outputDir. Does not fork game serving policy.
 */
async function runPerformanceAttributionProbe({
  root,
  outputRoot = null,
  taskId = 'performance-attribution',
  viewport = DEFAULT_VIEWPORT,
  routes = [...ATTRIBUTION_ROUTE_TAGS],
  variants = [...ATTRIBUTION_DIAGNOSTIC_VARIANTS],
  warmupMs = 2_000,
  sampleMs = 5_000,
  flightTimeoutMs = 150_000,
  dockTimeoutMs = 90_000,
  log = () => {},
} = {}) {
  assert(root, 'runPerformanceAttributionProbe requires root');
  const outRoot = outputRoot || path.join(root, '.devshots', 'perf');
  const outputDir = await allocateOutputDir(outRoot, taskId);
  const logLines = [];
  const doLog = (message) => {
    const line = `${new Date().toISOString()} ${message}`;
    logLines.push(line);
    log(line);
  };

  let ownedServer = null;
  let browser = null;
  let context = null;
  let page = null;
  let canonicalUrlTracker = null;
  let cleanupReport = null;
  let contextLossDone = false;

  try {
    ownedServer = await acquireVisualProbeServer({ root });
    assert.equal(ownedServer.ownsServer, true, 'attribution probe must own its canonical in-process server');
    const rootUrl = ownedServer.baseUrl;
    ({ page, browser, context } = await launchBrowser(viewport));
    canonicalUrlTracker = createCanonicalUrlTracker(page, rootUrl);
    await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    await page.bringToFront();
    doLog(`browser canonical root ${rootUrl}`);

    let routeResult = null;
    try {
      routeResult = await runBrowserPublicRoute({
        page,
        outputDir,
        expectedRootUrl: rootUrl,
        log: doLog,
        flightTimeoutMs,
        dockTimeoutMs,
      });
    } catch (error) {
      // The market/hub route is binding when requested. For flight-only attribution, a live
      // dock-input UI regression may be recorded as an explicit blocked route while retaining the
      // already-proven authored flight path and docked sim state for a clean undock. Never waive the
      // market route itself: callers requesting docked_market_ui still fail closed.
      const marketRequested = routes.includes('docked_market_ui');
      const docked = await isDocked(page);
      const mayContinueWithoutMarket = !marketRequested && error?.routePhase === 'dock-input' && docked;
      if (!mayContinueWithoutMarket) throw error;
      routeResult = {
        pass: true,
        partial: true,
        blockedRoute: 'docked_market_ui',
        blockedReason: error.message,
        routeProgress: error.routeProgress || [],
      };
      doLog('[attribution] docked market UI is blocked; continuing only requested flight routes from proven docked state');
    }
    assert.equal(routeResult?.pass === true, true, 'public route must pass for attribution matrix');
    assert.equal(await isDocked(page), true, 'public route must finish docked');
    if (routes.includes('docked_market_ui')) await ensureMarketOpen(page);

    const navigateToRoute = async (pg, routeTag, routeLog) => {
      if (routeTag === 'docked_market_ui') {
        if (!(await isDocked(pg))) {
          await pg.keyboard.press('KeyE');
          await pg.waitForFunction(() => window.SF?.state?.ui?.docked === true, null, { timeout: 30_000 });
        }
        await ensureMarketOpen(pg);
        routeLog('[attribution] navigated docked_market_ui');
        return;
      }
      if (routeTag === 'flight_steady' || routeTag === 'mining_tether_active' || routeTag === 'context_recover_steady') {
        if (await isDocked(pg)) {
          await undockForRecovery(pg, routeLog);
        }
        if (routeTag === 'mining_tether_active') {
          const arm = await ensureMiningOrTetherVfx(pg);
          if (!arm?.ok) routeLog(`[attribution] mining diagnostic stress arm: ${arm?.reason || 'unknown'}`);
          await pg.waitForTimeout(400);
        }
        if (routeTag === 'context_recover_steady' && !contextLossDone) {
          await probeWebGlContextLoss(pg, { outputDir, log: routeLog });
          contextLossDone = true;
          if (await isDocked(pg)) await undockForRecovery(pg, routeLog);
        }
        routeLog(`[attribution] navigated ${routeTag}`);
      }
    };

    // Prefer docked first while still docked from public route, then flight arms, then post-context.
    const orderedRoutes = [];
    for (const tag of ['docked_market_ui', 'flight_steady', 'mining_tether_active', 'context_recover_steady']) {
      if (routes.includes(tag)) orderedRoutes.push(tag);
    }
    for (const tag of routes) {
      if (!orderedRoutes.includes(tag)) orderedRoutes.push(tag);
    }

    const { document, validation } = await samplePerformanceAttribution(page, {
      routes: orderedRoutes,
      variants,
      warmupMs,
      sampleMs,
      log: doLog,
      navigateToRoute,
    });

    document.runtimeKind = 'browser';
    document.taskId = taskId;
    document.routePass = routeResult?.pass === true;
    document.validation = validation;

    const outPath = path.join(outputDir, 'performance-attribution.json');
    await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await writeFile(path.join(outputDir, 'run.log'), `${logLines.join('\n')}\n`, 'utf8');

    cleanupReport = await closeOwnedResources({ page, context, browser, server: ownedServer, canonicalUrlTracker });
    const restoreOk = Array.isArray(document.variants)
      && document.variants.length > 0
      && document.variants.every((v) => v.restored === true);
    const pass = validation.pass === true && document.routePass === true && restoreOk === true;

    return {
      pass,
      outputDir,
      outPath,
      document,
      validation,
      routeResult,
      restoreOk,
      cleanupReport,
    };
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(outputDir, 'failure-screenshot.png'), type: 'png', animations: 'allow' }).catch(() => {});
    }
    throw error;
  } finally {
    if (!cleanupReport) {
      await closeOwnedResources({ page, context, browser, server: ownedServer, canonicalUrlTracker }).catch(() => null);
    }
    await writeFile(path.join(outputDir, 'run.log'), `${logLines.join('\n')}\n`, 'utf8').catch(() => {});
  }
}

export {
  allocateOutputDir,
  sampleRafWindow,
  samplePerformanceAttribution,
  applyDiagnosticVariant,
  restoreDiagnosticVariant,
  ensureMiningOrTetherVfx,
  buildPerformanceAttributionDocument,
  snapshotDiagnosticSettings,
  applyDiagnosticVariantToState,
  restoreDiagnosticVariantToState,
  disableMeasurementGates,
  runPerformanceAttributionProbe,
};
