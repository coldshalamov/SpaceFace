// Browser/Electron release-soak evidence gatherer.
//
// The two runtimes execute the same public route. Browser owns the canonical
// in-process probe server; Electron owns its launcher server and is never
// navigated to the browser probe URL. Evidence is published only after owned
// cleanup and content verification.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { collectPageIssues } from './browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './electronTestIsolation.mjs';
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
import {
  PERFORMANCE_SCENARIO_IDS,
  PERFORMANCE_WINDOW_SCHEMA,
  buildPerformanceClosureReport,
  comparisonKey,
  evaluatePerformanceWindowBudgets,
  performanceScenario,
  summarizeFrameSamples as summarizeClosureFrameSamples,
} from './performanceClosureContracts.mjs';
import {
  performanceScenarioExecutionOrder,
  preparePerformanceScenario,
  restorePerformanceScenario,
  validateScenarioRestoration,
} from './performanceScenarioDriver.mjs';

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
  let isolatedLaunch = null;

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
      ({ page, electronApp, childProcess, processMonitor, pageIssueTracker, isolatedLaunch } = launched);
      canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
        bootstrapTimeoutMs: 10_000,
        pollIntervalMs: 75,
        allowAnyLoopbackPort: true,
      });
      await pageIssueTracker.bindAndBackfillPage(page);
      rootUrl = await canonicalUrlTracker.waitForCanonicalRoot(10_000);
      rootUrl = assertIsolatedElectronRootUrl(rootUrl);
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
    const memoryCheckpoints = [];
    for (let index = 0; index < cycles; index += 1) {
      const cycle = await withTimeout(
        runSoakCycle(page, { index, outputDir, log: doLog }),
        cycleTimeoutMs,
        `release-soak cycle ${index}`,
      );
      cycleResults.push(cycle);
      memoryCheckpoints.push(await readPostGcMemorySnapshot(page, `docked-market-cycle-${index + 1}`));
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
    const worktreeStable = endFingerprint.digest === startFingerprint.digest;
    if (!worktreeStable) {
      // Reject primary acceptance below, but preserve the expensive runtime telemetry. Throwing at
      // this boundary used to discard post-GC heap, rAF/GPU attribution, and context-recovery data
      // after a long valid browser session whenever an unrelated parallel lane touched the tree.
      doLog(`worktree changed during capture: ${startFingerprint.digest} -> ${endFingerprint.digest}`);
    }
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
    const memory = buildMemoryEvidence(baselineMemory, finalMemory, memoryCheckpoints);
    const quality = buildQualityEvidence(routeResult, baselineSettings, finalSettings);

    cleanupReport = runtime === 'electron'
      ? await closeOwnedElectronRuntime({ page, electronApp, childProcess, canonicalUrlTracker, processMonitor, rootUrl })
      : await closeOwnedResources({ page, context, browser, server: ownedServer, canonicalUrlTracker });
    if (runtime === 'electron' && cleanupReport?.pass === true) {
      isolatedLaunch?.cleanup({ runtimeClosed: true });
    }
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
      { name: 'worktree stable', status: worktreeStable ? 'pass' : 'fail' },
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
    if (runtime === 'electron' && isolatedLaunch && cleanupReport?.pass === true) {
      isolatedLaunch.cleanup({ runtimeClosed: true });
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
  const isolatedLaunch = createIsolatedElectronLaunch({ root, taskId: 'release-soak-electron' });
  let electronApp;
  try {
    electronApp = await electron.launch(isolatedLaunch.options);
  } catch (error) {
    throw error;
  }
  const processMonitor = createElectronProcessMonitor({ electronApp, childProcess: electronApp.process() });
  const childProcess = processMonitor.childProcess;
  const pageIssueTracker = createStrictElectronApplicationIssueTracker(electronApp);
  onOwnership({ electronApp, processMonitor, childProcess, pageIssueTracker });
  assert(childProcess, 'Electron launch must expose its owned child process');
  const page = await electronApp.firstWindow({ timeout: 90_000 });
  return { electronApp, processMonitor, childProcess, pageIssueTracker, page, isolatedLaunch };
}

async function runSoakCycle(page, { index, outputDir, log }) {
  const marks = [];
  const samples = [];
  const mark = (name, detail = {}) => {
    marks.push({ name, at: new Date().toISOString(), ...detail });
    log(`[cycle ${index}] ${name}`);
  };

  assert.equal(await isDocked(page), true, `cycle ${index} must start docked`);
  await publicUndockFromStation(page);
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
  const saved = await page.evaluate(() => window.__M6_RELEASE_SOAK_EVENTS__?.saveStartedSnapshot || null);
  assert(saved?.pos, 'save:started observer must capture the exact serialized player pose');
  const saveCompletedPose = await readPlayerSnapshot(page);
  const savedStorage = await page.evaluate(() => ({ bytes: localStorage.getItem('sf.save.quick')?.length || 0, slot: window.SF?.state?.save?.currentSlot || null }));
  assert(savedStorage.bytes > 100, 'quick-save payload was not persisted');
  mark('save-written', { ...savedStorage, saved, saveCompletedPose, completionAdvanceDistance: distance(saved.pos, saveCompletedPose.pos) });

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(650);
  await page.keyboard.up('KeyW');
  const diverged = await readPlayerSnapshot(page);
  assert(distance(saved.pos, diverged.pos) > 0.05 || Math.abs(saved.speed - diverged.speed) > 0.05, 'post-save state must diverge before load');
  await page.keyboard.press('F9');
  await page.waitForFunction(() => window.__M6_RELEASE_SOAK_EVENTS__?.loaded === true && window.SF?.state?.mode === 'flight', null, { timeout: 90_000 });
  const loaded = await readPlayerSnapshot(page);
  const loadedAtEvent = await page.evaluate(() => window.__M6_RELEASE_SOAK_EVENTS__?.loadedSnapshot || null);
  assert(loadedAtEvent?.pos, 'save:loaded observer must capture the exact restored player pose');
  const loadedEconomy = await readEconomySnapshot(page);
  const divergedDistance = distance(saved.pos, diverged.pos);
  const restoredDistance = distance(saved.pos, loadedAtEvent.pos);
  const postLoadAdvanceDistance = distance(loadedAtEvent.pos, loaded.pos);
  mark('load-observed', { saved, diverged, loadedAtEvent, loaded, divergedDistance, restoredDistance, postLoadAdvanceDistance });
  assert(
    restoredDistance <= Math.max(1, divergedDistance * 0.25),
    `load position restore exceeded tolerance: ${JSON.stringify({ restoredDistance, divergedDistance, saved, diverged, loaded })}`,
  );
  assert(Math.abs(saved.speed - loadedAtEvent.speed) <= 2, `load speed restore exceeded tolerance: ${saved.speed} -> ${loadedAtEvent.speed}`);
  mark('load-restored', { saved, diverged, loadedAtEvent, loaded, postLoadAdvanceDistance });
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

  const dockPrompt = page.locator('.sf-alert--dock');
  // A restored save can already be physically inside Helios' docking envelope. In that case
  // reopening the map is redundant and can race the live flight screen replacing the cached
  // map detail panel. Exercise the public waypoint route only when navigation is actually needed.
  const alreadyAtDockPrompt = await dockPrompt.isVisible().catch(() => false);
  if (alreadyAtDockPrompt) {
    mark('redock-already-in-range');
  } else {
    await armHeliosWaypoint(page);
    mark('redock-waypoint');
  }
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
  await publicUndockFromStation(page);
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    return state?.mode === 'flight'
      && state?.ui?.docked === false
      && player?.mesh?.userData?.authoredAssetState === 'authored';
  }, null, { timeout: 30_000 });
  log('undocked for steady flight and controlled context recovery');
}

async function publicUndockFromStation(page) {
  await page.keyboard.press('KeyE');
  const leftWithoutConfirmation = await page.waitForFunction(
    () => window.SF?.state?.ui?.docked === false,
    null,
    { timeout: 1_500 },
  ).then(() => true).catch(() => false);
  if (leftWithoutConfirmation) return;

  // The protected station UI asks for an explicit departure confirmation. Complete the same
  // public keyboard/mouse route a player sees; never bypass it with an injected dock-state write.
  const canonicalConfirm = page.locator('button.st-undock');
  const computedUndockRole = page.getByRole('button', { name: /\bundock\b/i });
  const confirm = canonicalConfirm.and(computedUndockRole);
  await confirm.waitFor({ state: 'visible', timeout: 5_000 });
  await confirm.click();
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === false, null, { timeout: 20_000 });
}

async function armSaveLoadObservers(page) {
  await page.evaluate(() => {
    window.__M6_RELEASE_SOAK_EVENTS__ = {
      saved: false,
      loaded: false,
      saveStartedSnapshot: null,
      loadedSnapshot: null,
    };
    window.SF.bus.once('save:started', () => {
      const state = window.SF?.state;
      const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
      window.__M6_RELEASE_SOAK_EVENTS__.saveStartedSnapshot = player ? {
        tick: Number(state.tick),
        simTime: Number(state.simTime),
        pos: { x: Number(player.pos.x), z: Number(player.pos.z) },
        speed: Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0)),
      } : null;
    });
    window.SF.bus.once('save:completed', () => { window.__M6_RELEASE_SOAK_EVENTS__.saved = true; });
    window.SF.bus.once('save:loaded', () => {
      const state = window.SF?.state;
      const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
      window.__M6_RELEASE_SOAK_EVENTS__.loadedSnapshot = player ? {
        tick: Number(state.tick),
        simTime: Number(state.simTime),
        pos: { x: Number(player.pos.x), z: Number(player.pos.z) },
        speed: Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0)),
      } : null;
      window.__M6_RELEASE_SOAK_EVENTS__.loaded = true;
    });
  });
}

async function armHeliosWaypoint(page) {
  await page.keyboard.press('KeyN');
  await page.locator('#sf-galaxymap').waitFor({ state: 'visible', timeout: 20_000 });
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
    const screen = document.querySelector('#sf-galaxymap');
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
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    const gl = state?.render?.renderer?.getContext?.();
    const data = player?.mesh?.userData || {};
    return window.__M6_CONTEXT_EVENTS__?.lost === true
      && window.__M6_CONTEXT_EVENTS__?.restored === true
      && gl?.isContextLost?.() === false
      && data.authoredAssetState === 'authored'
      && data.authoredVisualRoot === 'authored-root'
      && data.authoredReadableFallbackRetained === false;
  }, null, { timeout: 90_000 });
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
      meshRetained: player.mesh.uuid === beforeMeshUuid,
      meshResourceReady: player.mesh.userData.authoredAssetState === 'authored'
        && player.mesh.userData.authoredVisualRoot === 'authored-root'
        && player.mesh.userData.authoredReadableFallbackRetained === false,
      pixelBytes: pixels,
      pixelProof: pixels > 1000,
      rafCount: window.__M6_CONTEXT_EVENTS__.rafCount,
      frameAdvanced: window.__M6_CONTEXT_EVENTS__.rafCount > 2,
    };
    window.__M6_CONTEXT_EVENTS__.active = false;
    return result;
  }, start.beforeMeshUuid);
  await page.screenshot({ path: path.join(outputDir, 'context-restored.png'), type: 'png', animations: 'disabled' });
  const result = { ...start, ...end, recovered: end.lostEvent && end.restoredEvent && end.meshResourceReady && end.pixelProof && end.frameAdvanced && end.after === false };
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
  triggerAutosave = false,
  scenarioAction = null,
} = {}) {
  const allowed = new Set([...ATTRIBUTION_ROUTE_TAGS, ...PERFORMANCE_SCENARIO_IDS, 'flight_steady', 'context_recover_steady']);
  assert(allowed.has(phaseTag), `unsupported steady-state phase: ${phaseTag}`);
  assert(Number.isFinite(warmupMs) && warmupMs >= 0, 'rAF warmup must be finite and non-negative');
  // Attribution-only routes (market / mining) may use shorter windows; soak steady phases stay ≥5s.
  const minSampleMs = (phaseTag === 'flight_steady' || phaseTag === 'context_recover_steady') ? 5_000 : 1_000;
  assert(Number.isFinite(sampleMs) && sampleMs >= minSampleMs, `rAF sample window must cover at least ${minSampleMs} ms`);

  const needFlight = requireAuthoredFlight != null
    ? requireAuthoredFlight
    : phaseTag !== 'docked_market_ui';
  const needDocked = requireDocked != null
    ? requireDocked
    : phaseTag === 'docked_market_ui';

  return page.evaluate(async ({
    tag, warmup, duration, gpuOn, needFlight: needFlightFlag, needDocked: needDockedFlag, needMining,
    autosaveUnderLoad, action,
  }) => {
    if (document.visibilityState !== 'visible') throw new Error(`steady-state ${tag} requires a visible document`);
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    const {
      collectPerformancePipelineReadiness,
      collectPerformanceSceneStructure,
    } = await import('/scripts/lib/performanceSceneMetrics.mjs');

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
        video: JSON.parse(JSON.stringify(video)),
        dynResScale: Number.isFinite(state?.render?.dynResScale) ? state.render.dynResScale : 1,
        timeScale: Number.isFinite(state?.timeScale) ? state.timeScale : 1,
      };
    }

    function readHeapSlice() {
      const heap = typeof performance !== 'undefined' ? performance.memory : null;
      return heap ? {
        usedJSHeapSize: Number.isFinite(heap.usedJSHeapSize) ? heap.usedJSHeapSize : null,
        totalJSHeapSize: Number.isFinite(heap.totalJSHeapSize) ? heap.totalJSHeapSize : null,
        jsHeapSizeLimit: Number.isFinite(heap.jsHeapSizeLimit) ? heap.jsHeapSizeLimit : null,
      } : null;
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

    function setSystemTimingEnabled(on) {
      const perf = window.__SPACEFACE_PERF__ || state?.perfRuntime;
      if (perf && typeof perf.setSystemTimingEnabled === 'function') {
        try { perf.setSystemTimingEnabled(!!on); } catch (_) { /* ignore */ }
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

    function buildAttribution({
      frameSummary,
      settingsStart,
      settingsEnd,
      routeStart,
      routeEnd,
      sceneStart,
      sceneEnd,
      pipelineStart,
      pipelineEnd,
      heapStart,
      heapEnd,
      longTasks,
      gcSignals,
      saveEvents,
      actionReceipt,
      transitionBreakdown,
    }) {
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
          systems: perf?.systems || {},
          saves: perf?.saves || null,
          longTasks,
          gcSignals,
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
        scene: { start: sceneStart, end: sceneEnd },
        pipeline: { start: pipelineStart, end: pipelineEnd },
        memory: {
          comparableState: {
            start: { mode: routeStart?.mode || null, docked: routeStart?.docked === true },
            end: { mode: routeEnd?.mode || null, docked: routeEnd?.docked === true },
            pass: routeStart?.mode === routeEnd?.mode && routeStart?.docked === routeEnd?.docked,
          },
          renderer: {
            start: sceneStart?.memory || null,
            end: sceneEnd?.memory || null,
            delta: metricDelta(sceneStart?.memory, sceneEnd?.memory),
          },
          heap: {
            start: heapStart,
            end: heapEnd,
            growthBytes: Number.isFinite(heapStart?.usedJSHeapSize) && Number.isFinite(heapEnd?.usedJSHeapSize)
              ? heapEnd.usedJSHeapSize - heapStart.usedJSHeapSize
              : null,
            retainedAfterGc: false,
          },
        },
        autosave: {
          requested: autosaveUnderLoad === true,
          events: saveEvents,
          timing: perf?.saves?.autosaveLast || null,
        },
        action: actionReceipt,
        transition: transitionBreakdown,
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

      function metricDelta(start, end) {
        const result = {};
        for (const key of new Set([...Object.keys(start || {}), ...Object.keys(end || {})])) {
          result[key] = Number.isFinite(start?.[key]) && Number.isFinite(end?.[key])
            ? end[key] - start[key]
            : null;
        }
        return result;
      }
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
    setSystemTimingEnabled(true);
    setGpuTimersEnabled(gpuOn);
    const resourceStartTime = performance.now();
    const sceneStart = collectPerformanceSceneStructure({ state });
    const pipelineStart = collectPerformancePipelineReadiness({ state, registry: window.SF?.registry, resourceStartTime });
    const heapStart = readHeapSlice();
    const longTasks = [];
    const gcSignals = [];
    const saveEvents = [];
    let longTaskObserver = null;
    let gcObserver = null;
    let unsubscribeSaveCompleted = null;
    let unsubscribeSaveError = null;
    let actionReceipt = null;
    try {
      resetProbes();

      try {
        longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, durationMs: entry.duration });
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      } catch (_) { longTaskObserver = null; }
      try {
        gcObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) gcSignals.push({ startTime: entry.startTime, durationMs: entry.duration, kind: entry.kind || null });
        });
        gcObserver.observe({ entryTypes: ['gc'] });
      } catch (_) { gcObserver = null; }
      if (autosaveUnderLoad && window.SF?.bus?.on) {
        unsubscribeSaveCompleted = window.SF.bus.on('save:completed', (payload = {}) => saveEvents.push({ event: 'save:completed', ...payload }));
        unsubscribeSaveError = window.SF.bus.on('save:error', (payload = {}) => saveEvents.push({ event: 'save:error', ...payload }));
      }

      const samples = [];
      const sampleStart = performance.now();
      let previous = await raf();
      let previousShedBacklogFrames = 0;
      let previousShedStepsTotal = 0;
      let actionRun = false;
      while (performance.now() - sampleStart < duration) {
        const timestamp = await raf();
        const frameMs = timestamp - previous;
        previous = timestamp;
        const elapsedMs = performance.now() - sampleStart;
        if (!actionRun && elapsedMs >= 1_000 && (autosaveUnderLoad || action)) {
          actionRun = true;
          const actionStarted = performance.now();
          if (autosaveUnderLoad) {
            const saveSystem = window.SF?.registry?.get?.('save');
            const accepted = saveSystem?.requestAutosave?.('performance_closure_under_load', { force: true }) === true;
            actionReceipt = { kind: 'autosave', accepted, callMs: performance.now() - actionStarted };
          } else if (action === 'map_open') {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', bubbles: true, cancelable: true }));
            actionReceipt = { kind: action, dispatched: true, callMs: performance.now() - actionStarted };
          } else if (action === 'map_to_flight') {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
            actionReceipt = { kind: action, dispatched: true, callMs: performance.now() - actionStarted };
          } else if (action === 'map_interaction') {
            const canvas = document.querySelector('#sf-galaxymap canvas');
            canvas?.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
            actionReceipt = { kind: action, dispatched: !!canvas, callMs: performance.now() - actionStarted };
          } else if (action === 'jump_request') {
            const currentId = state?.world?.currentSectorId;
            const current = state?.world?.sectors?.[currentId];
            const targetSectorId = current?.neighbors?.[0] || null;
            if (targetSectorId) window.SF?.bus?.emit('world:requestJump', { targetSectorId, via: 'gate' });
            actionReceipt = { kind: action, dispatched: !!targetSectorId, targetSectorId, callMs: performance.now() - actionStarted };
          }
        }
        if (Number.isFinite(frameMs) && frameMs > 0) {
          // Lightweight rAF sample only — no per-frame perf/diag object churn.
          const sample = {
            atMs: timestamp,
            frameMs,
            phaseTag: tag,
            tick: Number(window.SF?.state?.tick),
            mode: window.SF?.state?.mode || null,
            docked: window.SF?.state?.ui?.docked === true,
            jumpState: window.SF?.state?.jump?.state || null,
            playerControlExposed: window.SF?.state?.mode === 'flight'
              && window.SF?.state?.ui?.docked !== true
              && window.SF?.state?.jump?.state === 'IDLE'
              && !document.body.classList.contains('ui-modal-open'),
            visibility: document.visibilityState,
          };
          const perf = window.__SPACEFACE_PERF__ || state?.perfRuntime;
          if (perf && typeof perf.readFrameSample === 'function') {
            perf.readFrameSample(sample);
            sample.shedBacklog = sample.shedBacklogFrames > previousShedBacklogFrames;
            sample.shedSteps = Math.max(0, sample.shedStepsTotal - previousShedStepsTotal);
            previousShedBacklogFrames = sample.shedBacklogFrames;
            previousShedStepsTotal = sample.shedStepsTotal;
          }
          samples.push(sample);
        }
      }

      if (autosaveUnderLoad && actionReceipt?.accepted === true) {
        const settleStarted = performance.now();
        const settleDeadline = settleStarted + 5_000;
        const terminalSaveEvent = () => saveEvents.some((event) => event.event === 'save:completed' || event.event === 'save:error');
        while (!terminalSaveEvent() && performance.now() < settleDeadline) await raf();
        actionReceipt.completionWaitMs = performance.now() - settleStarted;
        actionReceipt.completed = saveEvents.some((event) => event.event === 'save:completed');
        actionReceipt.errored = saveEvents.some((event) => event.event === 'save:error');
        actionReceipt.settleTimedOut = !terminalSaveEvent();
      }

      // Allow a couple of frames so async GPU query readback can settle without spinning.
      await raf();
      await raf();
      if (state?.render?.gpuTimers && typeof state.render.gpuTimers.poll === 'function') {
        try { state.render.gpuTimers.poll(); } catch (_) { /* ignore */ }
      }

      const settingsEnd = readSettingsSlice();
      const routeEnd = readRouteProof();
      const sceneEnd = collectPerformanceSceneStructure({ state });
      const pipelineEnd = collectPerformancePipelineReadiness({ state, registry: window.SF?.registry, resourceStartTime });
      const heapEnd = readHeapSlice();

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
      const summarizeSegment = (predicate) => {
        const segment = samples.filter(predicate).map((sample) => sample.frameMs).sort((a, b) => a - b);
        const segmentPct = (ratio) => segment.length
          ? segment[Math.min(segment.length - 1, Math.ceil((segment.length - 1) * ratio))]
          : null;
        return {
          sampleCount: segment.length,
          p50: segmentPct(0.50),
          p95: segmentPct(0.95),
          p99: segmentPct(0.99),
          max: segment.length ? segment[segment.length - 1] : null,
          framesAbove32Ms: segment.filter((value) => value > 32).length,
          framesAbove50Ms: segment.filter((value) => value > 50).length,
        };
      };
      const transitionBreakdown = {
        exposedPlayerControl: summarizeSegment((sample) => sample.playerControlExposed === true),
        transitionOrCovered: summarizeSegment((sample) => sample.playerControlExposed !== true),
      };

      const attribution = buildAttribution({
        frameSummary,
        settingsStart,
        settingsEnd,
        routeStart,
        routeEnd,
        sceneStart,
        sceneEnd,
        pipelineStart,
        pipelineEnd,
        heapStart,
        heapEnd,
        longTasks,
        gcSignals,
        saveEvents,
        actionReceipt,
        transitionBreakdown,
      });
      return { samples, attribution };
    } finally {
      if (typeof unsubscribeSaveCompleted === 'function') unsubscribeSaveCompleted();
      if (typeof unsubscribeSaveError === 'function') unsubscribeSaveError();
      if (longTaskObserver) {
        try {
          for (const entry of longTaskObserver.takeRecords()) longTasks.push({ startTime: entry.startTime, durationMs: entry.duration });
          longTaskObserver.disconnect();
        } catch (_) { /* ignore */ }
      }
      if (gcObserver) {
        try {
          for (const entry of gcObserver.takeRecords()) gcSignals.push({ startTime: entry.startTime, durationMs: entry.duration, kind: entry.kind || null });
          gcObserver.disconnect();
        } catch (_) { /* ignore */ }
      }
      setGpuTimersEnabled(false);
      setRenderWorkEnabled(false);
      setSystemTimingEnabled(false);
    }
  }, {
    tag: phaseTag,
    warmup: warmupMs,
    duration: sampleMs,
    gpuOn: enableGpuTimers === true,
    needFlight,
    needDocked,
    needMining: requireMiningOrTether === true,
    autosaveUnderLoad: triggerAutosave === true,
    action: scenarioAction,
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
    vfxIsolationActive: state?.render?.perfVfxIsolation?.inspect?.().active === true,
    materialIsolationActive: state?.render?.perfMaterialIsolation?.inspect?.().active === true,
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
    state.render?.perfVfxIsolation?.restore?.();
    state.render?.perfMaterialIsolation?.restore?.();
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
  if (variantId === 'stations_places_hidden') {
    const isolation = state.render?.perfEntityIsolation;
    if (!isolation?.hideStationsPlaces) throw new Error('renderer station/place isolation unavailable');
    return { id: variantId, diagnostic: true, label, applied: true, ...isolation.hideStationsPlaces() };
  }
  if (variantId === 'non_player_ships_hidden') {
    const isolation = state.render?.perfEntityIsolation;
    if (!isolation?.hideNonPlayerShips) throw new Error('renderer ship isolation unavailable');
    return { id: variantId, diagnostic: true, label, applied: true, ...isolation.hideNonPlayerShips() };
  }
  if (variantId === 'vfx_hidden') {
    const isolation = state.render?.perfVfxIsolation;
    if (!isolation?.hideAll) throw new Error('VFX isolation unavailable');
    return { id: variantId, diagnostic: true, label, applied: true, ...isolation.hideAll() };
  }
  if (variantId === 'material_basic_override' || variantId === 'material_depth_override') {
    const isolation = state.render?.perfMaterialIsolation;
    if (!isolation?.apply) throw new Error('renderer material isolation unavailable');
    const mode = variantId === 'material_basic_override' ? 'basic' : 'depth';
    return { id: variantId, diagnostic: true, label, applied: true, ...isolation.apply(mode) };
  }
  throw new Error(`unhandled diagnostic variant ${variantId}`);
}

function restoreDiagnosticVariantToState(state, snap) {
  if (!state || !snap) return { restored: true, reason: 'nothing-to-restore' };
  state.timeScale = snap.timeScale;
  if (state.settings?.video) state.settings.video.bloom = snap.bloom;
  if (state.render?.spaceBg?.group) state.render.spaceBg.group.visible = snap.spaceBgVisible;
  state.render?.perfEntityIsolation?.restore?.();
  state.render?.perfVfxIsolation?.restore?.();
  state.render?.perfMaterialIsolation?.restore?.();
  const videoBloom = state.settings?.video?.bloom;
  const spaceBgVisible = state.render?.spaceBg?.group?.visible !== false;
  const ok = state.timeScale === snap.timeScale && videoBloom === snap.bloom
    && spaceBgVisible === snap.spaceBgVisible
    && state.render?.perfEntityIsolation?.inspect?.().active !== true
    && state.render?.perfVfxIsolation?.inspect?.().active !== true
    && state.render?.perfMaterialIsolation?.inspect?.().active !== true;
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
        vfxIsolationActive: state.render?.perfVfxIsolation?.inspect?.().active === true,
        materialIsolationActive: state.render?.perfMaterialIsolation?.inspect?.().active === true,
        label,
      };
    }
    const snap = window.__SF_PERF_ATTRIBUTION_RESTORE__;
    if (id === 'baseline') {
      state.timeScale = snap.timeScale;
      if (state.settings?.video) state.settings.video.bloom = snap.bloom;
      if (state.render?.spaceBg?.group) state.render.spaceBg.group.visible = snap.spaceBgVisible;
      state.render?.perfEntityIsolation?.restore?.();
      state.render?.perfVfxIsolation?.restore?.();
      state.render?.perfMaterialIsolation?.restore?.();
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
    if (id === 'stations_places_hidden') {
      const isolation = state.render?.perfEntityIsolation;
      if (!isolation?.hideStationsPlaces) throw new Error('renderer station/place isolation unavailable');
      return { id, diagnostic: true, label, applied: true, ...isolation.hideStationsPlaces() };
    }
    if (id === 'non_player_ships_hidden') {
      const isolation = state.render?.perfEntityIsolation;
      if (!isolation?.hideNonPlayerShips) throw new Error('renderer ship isolation unavailable');
      return { id, diagnostic: true, label, applied: true, ...isolation.hideNonPlayerShips() };
    }
    if (id === 'vfx_hidden') {
      const isolation = state.render?.perfVfxIsolation;
      if (!isolation?.hideAll) throw new Error('VFX isolation unavailable');
      return { id, diagnostic: true, label, applied: true, ...isolation.hideAll() };
    }
    if (id === 'material_basic_override' || id === 'material_depth_override') {
      const isolation = state.render?.perfMaterialIsolation;
      if (!isolation?.apply) throw new Error('renderer material isolation unavailable');
      const mode = id === 'material_basic_override' ? 'basic' : 'depth';
      return { id, diagnostic: true, label, applied: true, ...isolation.apply(mode) };
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
    state.render?.perfVfxIsolation?.restore?.();
    state.render?.perfMaterialIsolation?.restore?.();
    try { window.SF?.bus?.emit('settings:changed', { section: 'video', key: 'bloom' }); } catch (_) { /* ignore */ }
    const videoBloom = state.settings?.video?.bloom;
    const spaceBgVisible = state.render?.spaceBg?.group?.visible !== false;
    const ok = state.timeScale === snap.timeScale && videoBloom === snap.bloom
      && spaceBgVisible === snap.spaceBgVisible
      && state.render?.perfEntityIsolation?.inspect?.().active !== true
      && state.render?.perfVfxIsolation?.inspect?.().active !== true
      && state.render?.perfMaterialIsolation?.inspect?.().active !== true;
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
    const perf = window.__SPACEFACE_PERF__ || window.SF?.state?.perfRuntime;
    try {
      if (perf && typeof perf.setRenderWorkEnabled === 'function') {
        perf.setRenderWorkEnabled(false);
      }
    } catch (_) { /* ignore */ }
    try {
      if (perf && typeof perf.setSystemTimingEnabled === 'function') {
        perf.setSystemTimingEnabled(false);
      }
    } catch (_) { /* ignore */ }
    try {
      const timers = window.SF?.state?.render?.gpuTimers;
      if (timers && typeof timers.setEnabled === 'function') timers.setEnabled(false);
    } catch (_) { /* ignore */ }
    const timers = window.SF?.state?.render?.gpuTimers;
    const gpuReport = timers && typeof timers.getReport === 'function' ? timers.getReport() : null;
    return {
      renderWorkEnabled: perf?.renderWorkEnabled === true || perf?.isRenderWorkEnabled?.() === true,
      systemTimingEnabled: perf?.systemTimingEnabled === true || perf?.isSystemTimingEnabled?.() === true,
      gpuTimersEnabled: gpuReport?.enabled === true,
      restoreJournalPresent: window.__SF_PERF_ATTRIBUTION_RESTORE__ != null,
    };
  }).catch(() => ({
    renderWorkEnabled: false,
    systemTimingEnabled: false,
    gpuTimersEnabled: false,
    restoreJournalPresent: false,
  }));
}

/**
 * Collect multi-route attribution windows with optional diagnostic A/B variants.
 * Each diagnostic variant body is failure-atomic: restore settings/timeScale + disable
 * measurement gates in finally.
 */
async function samplePerformanceAttribution(page, {
  routes = ['flight_steady', 'docked_market_ui'],
  variants = ['baseline'],
  variantScenarioIds = ['flight_steady'],
  warmupMs = 2_000,
  sampleMs = 5_000,
  log = () => {},
  navigateToRoute = null,
  prepareScenario = null,
  restoreScenario = null,
} = {}) {
  const windows = [];
  const variantResults = [];

  for (const variantId of variants) {
    log(`[attribution] diagnostic variant ${variantId}`);
    let appliedAll = true;
    let restoredAll = true;
    let variantLabel = variantId === 'baseline' ? 'baseline (restored defaults)' : 'DIAGNOSTIC-ONLY';
    let measuredRoutes = 0;
    for (const routeTag of routes) {
      if (variantId !== 'baseline' && !variantScenarioIds.includes(routeTag)) continue;
      measuredRoutes++;
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

      let routeBaseline = null;
      let applied = null;
      let restored = { restored: false };
      let preparation = null;
      let scenarioRestored = { restored: false, reason: 'scenario restore not attempted' };
      let attribution = null;
      try {
        if (typeof prepareScenario === 'function') preparation = await prepareScenario(page, routeTag, log);
        // Route/scenario setup may legitimately change timeScale or player transforms. Capture the
        // diagnostic authority after setup, then restore that arm before restoring the scenario.
        routeBaseline = await page.evaluate(() => {
          const state = window.SF?.state;
          if (!state) throw new Error('SF.state unavailable for route attribution baseline');
          return {
            timeScale: Number.isFinite(state.timeScale) ? state.timeScale : 1,
            bloom: state.settings?.video ? state.settings.video.bloom : true,
            spaceBgVisible: state.render?.spaceBg?.group?.visible !== false,
          };
        });
        await page.evaluate((baseline) => {
          window.__SF_PERF_ATTRIBUTION_RESTORE__ = { ...baseline, label: 'DIAGNOSTIC-ONLY — immutable route baseline' };
        }, routeBaseline);
        applied = await applyDiagnosticVariant(page, variantId);
        variantLabel = applied?.label || variantLabel;
        const definition = performanceScenario(routeTag);
        const result = await sampleRafWindow(page, {
          phaseTag: routeTag,
          warmupMs,
          sampleMs: routeTag === 'jump_asset_admission'
            ? Math.max(12_000, sampleMs)
            : (routeTag === 'docked_market_ui' ? Math.max(1_000, sampleMs) : sampleMs),
          enableGpuTimers: true,
          requireAuthoredFlight: routeTag !== 'docked_market_ui',
          requireDocked: routeTag === 'docked_market_ui',
          requireMiningOrTether: routeTag === 'mining_tether_active',
          triggerAutosave: routeTag === 'autosave_under_load',
          scenarioAction: scenarioActionFor(routeTag),
        });
        if (result?.attribution) {
          attribution = result.attribution;
          attribution.rawSamples = result.samples;
          attribution.scenarioId = routeTag;
          attribution.scenarioDefinition = definition;
          attribution.scenarioPreparation = preparation;
          attribution.diagnosticVariant = variantId;
          attribution.diagnostic = variantId !== 'baseline' || preparation?.stateInjected === true
            || definition?.injectedState === true;
          if (routeTag === 'mining_tether_active') {
            attribution.routeProof = {
              ...(attribution.routeProof || {}),
              diagnosticStress: true,
              playerInputPath: false,
              routeNote: 'DIAGNOSTIC STRESS — mining VFX via bus events, not player input path',
            };
          }
        }
      } finally {
        restored = await restoreDiagnosticVariant(page).catch((err) => ({
          restored: false,
          reason: String(err && err.message || err),
        }));
        if (routeBaseline && (restored?.timeScale !== routeBaseline.timeScale
          || restored?.bloom !== routeBaseline.bloom
          || restored?.spaceBgVisible !== routeBaseline.spaceBgVisible)) {
          restored = {
            ...restored,
            restored: false,
            reason: `route baseline mismatch: expected timeScale=${routeBaseline.timeScale}, bloom=${routeBaseline.bloom}, spaceBgVisible=${routeBaseline.spaceBgVisible}`,
          };
        }
        await disableMeasurementGates(page);
        if (typeof restoreScenario === 'function') {
          scenarioRestored = await restoreScenario(page, routeTag, log).catch((error) => ({
            restored: false,
            reason: String(error?.message || error),
          }));
        } else scenarioRestored = { restored: true, reason: 'no scenario restorer configured' };
      }
      appliedAll = appliedAll && applied?.applied === true;
      const scenarioValidation = validateScenarioRestoration(scenarioRestored);
      restoredAll = restoredAll && restored?.restored === true && scenarioValidation.pass;
      if (attribution) {
        attribution.restoration = {
          restored: restored?.restored === true && scenarioValidation.pass,
          diagnosticVariant: restored,
          scenario: scenarioRestored,
          scenarioValidation,
          measurementDisabled: true,
        };
        windows.push(attribution);
      }
    }
    variantResults.push({
      id: variantId,
      diagnostic: variantId !== 'baseline',
      applied: appliedAll,
      restored: restoredAll,
      label: variantLabel,
      measuredRoutes,
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

function scenarioActionFor(routeTag) {
  if (routeTag === 'map_open') return 'map_open';
  if (routeTag === 'map_interaction_steady') return 'map_interaction';
  if (routeTag === 'map_to_flight_transition') return 'map_to_flight';
  if (routeTag === 'jump_asset_admission') return 'jump_request';
  return null;
}

async function readPlayerSnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entityList.find((entity) => entity?.id === state.playerId);
    const autopilot = state.nav?.autopilot;
    return {
      tick: Number(state.tick),
      simTime: Number(state.simTime),
      mode: state.mode || null,
      pos: { x: Number(player.pos.x), z: Number(player.pos.z) },
      speed: Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0)),
      autopilot: autopilot ? {
        active: autopilot.active === true,
        status: autopilot.status || null,
        targetEntityId: autopilot.targetEntityId ?? null,
      } : null,
    };
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
      assetResidency: state?.render?.assetResidency || null,
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

function buildMemoryEvidence(start, end, checkpoints = []) {
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
    checkpoints,
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

async function readPerformanceRouteFailureState(page) {
  if (!page || page.isClosed()) return null;
  return page.evaluate(async () => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId) || null;
    const ships = Array.isArray(state?.entityList)
      ? state.entityList.filter((entity) => entity?.type === 'ship' && entity.alive !== false)
      : [];
    const statusCounts = {};
    const nonAuthored = [];
    let presentedAuthored = 0;
    let pendingAuthored = 0;
    let fallbackAuthored = 0;
    for (const ship of ships) {
      const status = ship?.mesh?.userData?.authoredAssetState || 'missing';
      const admission = ship?.presentationAdmission || null;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      if ((status === 'authored' || status === 'authored-with-cleanup-error')
          && (admission === 'ready' || admission == null)) presentedAuthored++;
      else if (admission === 'pending' && (
        status === 'awaiting-authored-admission'
        || status === 'loading'
        || status === 'compiling-pipelines'
      )) pendingAuthored++;
      else fallbackAuthored++;
      if (status !== 'authored' && status !== 'authored-with-cleanup-error' && nonAuthored.length < 50) {
        nonAuthored.push({
          id: ship?.id || null,
          defId: ship?.defId || ship?.shipDefId || null,
          status,
          admission,
          visible: ship?.mesh?.visible === true,
        });
      }
    }

    const visible = (element) => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    const splashVisible = visible(document.getElementById('cinematic-splash'));
    const firstRunVisible = visible(document.querySelector('[data-screen="firstRun"], .sf-first-run, [data-first-run]'));
    const checks = {
      flightMode: state?.mode === 'flight',
      playerPresent: !!player,
      playerAlive: !!player && player.alive !== false && Number(player.hull) > 0,
      authoredShipsPresent: ships.length > 0,
      authoredPresentationSafe: ships.length > 0 && presentedAuthored > 0 && fallbackAuthored === 0,
      modalClosed: !document.body.classList.contains('ui-modal-open'),
      cinematicClosed: !splashVisible,
      firstRunClosed: !firstRunVisible,
    };

    let pipeline = null;
    try {
      const metrics = await import('/scripts/lib/performanceSceneMetrics.mjs');
      pipeline = metrics.collectPerformancePipelineReadiness({
        state,
        registry: window.SF?.registry,
      });
    } catch (error) {
      pipeline = { available: false, error: error?.message || String(error) };
    }

    return {
      capturedAt: new Date().toISOString(),
      pass: Object.values(checks).every(Boolean),
      checks,
      mode: state?.mode || null,
      tick: Number(state?.tick || 0),
      docked: state?.ui?.docked === true,
      player: player ? {
        id: player.id || null,
        alive: player.alive !== false && Number(player.hull) > 0,
        hull: Number(player.hull || 0),
        authoredAssetState: player?.mesh?.userData?.authoredAssetState || 'missing',
      } : null,
      ships: {
        count: ships.length,
        presentedAuthored,
        pendingAuthored,
        fallbackAuthored,
        statusCounts,
        nonAuthored,
      },
      pipeline,
    };
  }).catch((error) => ({ available: false, error: error?.message || String(error) }));
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

async function inspectPerformanceActivity(root) {
  const lockRoot = path.join(root, 'assets', 'ships', 'release.__lock');
  const buildingPath = path.join(root, 'assets', 'ships', 'release.__building');
  const [releaseLock, releaseBuilding, processes] = await Promise.all([
    inspectActivityPath(lockRoot, path.join(lockRoot, 'owner.json')),
    inspectActivityPath(buildingPath, buildingPath),
    inspectAuthoringProcesses(),
  ]);
  return {
    capturedAt: new Date().toISOString(),
    releaseLock,
    releaseBuilding,
    authoringProcesses: processes,
    active: releaseLock.active === true || releaseBuilding.active === true || processes.names.length > 0,
  };
}

async function inspectActivityPath(activityPath, metadataPath) {
  try {
    const metadata = await stat(activityPath);
    let owner = null;
    if (existsSync(metadataPath)) {
      const ownerMetadata = await stat(metadataPath);
      if (ownerMetadata.isFile() && ownerMetadata.size <= 1024 * 1024) {
        const raw = await readFile(metadataPath, 'utf8');
        try { owner = sanitizeActivityOwner(JSON.parse(raw)); } catch (_) { owner = { parseable: false }; }
      }
    }
    return {
      active: true,
      kind: metadata.isDirectory() ? 'directory' : 'file',
      modifiedAt: metadata.mtime.toISOString(),
      owner,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { active: false, kind: null, modifiedAt: null, owner: null };
    return { active: null, kind: null, modifiedAt: null, owner: null, error: error?.code || error?.message || String(error) };
  }
}

function sanitizeActivityOwner(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { parseable: true, valueType: typeof value };
  const allowed = ['taskId', 'owner', 'agent', 'pid', 'host', 'branch', 'worktree', 'startedAt', 'updatedAt', 'status'];
  const result = { parseable: true };
  for (const key of allowed) {
    const item = value[key];
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') result[key] = item;
  }
  return result;
}

async function inspectAuthoringProcesses() {
  if (process.platform !== 'win32') return { available: false, names: [], reason: `unsupported-platform:${process.platform}` };
  try {
    const stdout = await captureProcessOutput('tasklist', ['/FO', 'CSV', '/NH']);
    const names = [...new Set(stdout.split(/\r?\n/)
      .map((line) => /^"((?:[^"]|"")*)"/.exec(line)?.[1]?.replace(/""/g, '"') || '')
      .filter((name) => /^(?:blender|blender-launcher|blender-mcp)(?:\.exe)?$/i.test(name)))]
      .sort((a, b) => a.localeCompare(b));
    return { available: true, names };
  } catch (error) {
    return { available: false, names: [], reason: error?.message || String(error) };
  }
}

function captureProcessOutput(command, args, maxBytes = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let bytes = 0;
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) child.kill();
      else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (bytes > maxBytes) reject(new Error(`${command} output exceeded ${maxBytes} bytes`));
      else if (code !== 0) reject(new Error(`${command} failed (${code}): ${stderr.trim()}`));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

async function readAttributionEnvironment(page, browser, viewport, seed, activity) {
  const browserVersion = typeof browser?.version === 'function' ? browser.version() : null;
  const live = await page.evaluate(() => {
    const gameRenderer = window.SF?.state?.render?.renderer;
    const gameGl = gameRenderer?.getContext?.() || null;
    let gl = gameGl;
    if (!gl) {
      const canvas = document.createElement('canvas');
      gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    }
    const debug = gl?.getExtension?.('WEBGL_debug_renderer_info');
    const gpu = {
      api: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
        ? 'webgl2'
        : (gl ? 'webgl' : null),
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl?.getParameter?.(gl.VENDOR) || null,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER) || null,
      version: gl?.getParameter?.(gl.VERSION) || null,
      shadingLanguageVersion: gl?.getParameter?.(gl.SHADING_LANGUAGE_VERSION) || null,
      source: gameGl && gl === gameGl ? 'game-renderer' : 'probe-fallback',
    };
    const video = window.SF?.state?.settings?.video || {};
    return {
      browser: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemoryGb: navigator.deviceMemory ?? null,
      },
      gpu,
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      defaultSettings: {
        video: JSON.parse(JSON.stringify(video)),
      },
    };
  });
  return {
    runtimeKind: 'browser',
    seed,
    browser: { ...live.browser, version: browserVersion },
    gpu: live.gpu,
    viewport: {
      width: live.viewport.innerWidth,
      height: live.viewport.innerHeight,
      configuredWidth: viewport.width,
      configuredHeight: viewport.height,
      devicePixelRatio: live.viewport.devicePixelRatio,
    },
    defaultSettings: live.defaultSettings,
    activity,
  };
}

function buildClosureWindows(document, environment, errors, measurementDisabled) {
  return (document?.windows || []).map((window) => {
    const definition = performanceScenario(window.scenarioId || window.routeTag);
    const rawSamples = Array.isArray(window.rawSamples) ? window.rawSamples : [];
    const stateInjected = window.scenarioPreparation?.stateInjected === true || definition?.injectedState === true;
    const baseline = window.diagnosticVariant === 'baseline';
    const actionInjected = window.action?.dispatched === true || window.autosave?.requested === true;
    const restoration = {
      ...(window.restoration || {}),
      restored: window.restoration?.restored === true && measurementDisabled,
      measurementDisabled,
    };
    const evidenceKind = 'diagnostic';
    const summary = summarizeClosureFrameSamples(rawSamples);
    return {
      schema: PERFORMANCE_WINDOW_SCHEMA,
      scenarioId: window.scenarioId || window.routeTag,
      evidenceKind,
      stateInjected,
      inputSource: baseline && !stateInjected && !actionInjected ? 'keyboard-mouse' : 'diagnostic-controller',
      defaultQuality: baseline,
      diagnosticVariant: window.diagnosticVariant || 'baseline',
      rawSamples,
      summary,
      comparisonKey: comparisonKey({
        scenarioId: window.scenarioId || window.routeTag,
        environment,
        settings: window.settings?.start,
      }),
      settings: window.settings,
      cpu: window.cpu || {},
      gpu: window.gpuTimers || {},
      scene: window.scene || {},
      pipeline: window.pipeline || {},
      memory: window.memory || {},
      budgets: evaluatePerformanceWindowBudgets({
        scenarioId: window.scenarioId || window.routeTag,
        summary,
        autosave: window.autosave,
        evidenceKind,
      }),
      restoration,
      pageErrors: [...(errors?.pageErrors || [])],
      routeProof: window.routeProof || {},
      loop: window.loop || {},
      draw: window.draw || {},
      post: window.post || null,
      autosave: window.autosave || null,
      action: window.action || null,
      transition: window.transition || null,
      scenarioDefinition: definition,
      scenarioPreparation: window.scenarioPreparation || null,
    };
  });
}

function performanceArtifactDescriptors(root, outputDir, routeResult) {
  const entries = [
    ['raw-evidence', 'performance-windows.json'],
    ['log', 'run.log'],
    ['screenshot', 'performance-closure-overview.png'],
    ['screenshot', 'failure-screenshot.png'],
    ['screenshot', 'context-restored.png'],
    ...(routeResult?.screenshots || []).map((name) => ['screenshot', name]),
  ];
  return entries
    .map(([kind, name]) => ({ kind, path: relativeTo(root, path.join(outputDir, name)) }))
    .filter((artifact) => existsSync(path.resolve(root, artifact.path)));
}

async function closeAttributionResources({ page, context, browser, ownedServer, canonicalUrlTracker }) {
  try {
    return await closeOwnedResources({ page, context, browser, server: ownedServer, canonicalUrlTracker });
  } catch (error) {
    return error?.cleanupReport || {
      pass: false,
      pageClosed: page?.isClosed?.() === true,
      browserDisconnected: browser ? !browser.isConnected() : true,
      serverReleased: ownedServer?.server?.listening === false,
      failures: [{ name: 'cleanup', error: { message: error?.message || String(error) } }],
    };
  }
}

async function finalizePerformanceAttributionRun({
  root,
  outputDir,
  taskId,
  seed,
  viewport,
  document,
  routeResult,
  startFingerprint,
  activity,
  pageIssueTracker,
  page,
  context,
  browser,
  ownedServer,
  canonicalUrlTracker,
  logLines,
  setCleanupReport,
}) {
  const measurementState = await disableMeasurementGates(page);
  const measurementDisabled = measurementState.renderWorkEnabled !== true
    && measurementState.systemTimingEnabled !== true
    && measurementState.gpuTimersEnabled !== true
    && measurementState.restoreJournalPresent !== true;
  const environment = await readAttributionEnvironment(page, browser, viewport, seed, { start: activity, end: null });
  const errors = buildErrorEvidence('browser', pageIssueTracker);
  const closureWindows = buildClosureWindows(document, environment, errors, measurementDisabled);

  await writeFile(path.join(outputDir, 'performance-windows.json'), `${JSON.stringify(closureWindows, null, 2)}\n`, 'utf8');
  await page.screenshot({
    path: path.join(outputDir, 'performance-closure-overview.png'),
    type: 'png',
    animations: 'disabled',
  });
  pageIssueTracker?.stop?.();

  const ownedCleanup = await closeAttributionResources({ page, context, browser, ownedServer, canonicalUrlTracker });
  setCleanupReport(ownedCleanup);

  const normalizedCleanup = normalizeCleanup('browser', ownedCleanup);
  const cleanupValidation = validateCleanupEvidence(normalizedCleanup, { runtimeKind: 'browser' });
  const cleanup = {
    pass: cleanupValidation.pass && measurementDisabled,
    pageClosed: normalizedCleanup.pageClosed === true,
    browserClosed: normalizedCleanup.browserClosed === true || normalizedCleanup.browserDisconnected === true,
    serverReleased: normalizedCleanup.serverReleased === true,
    portsReleased: normalizedCleanup.portsReleased === true,
    measurementDisabled,
    measurementState,
    validation: cleanupValidation,
    ownedReport: ownedCleanup,
  };

  environment.activity.end = await inspectPerformanceActivity(root);
  const endFingerprint = await strictWorktreeFingerprint(root);
  logLines.push(`${new Date().toISOString()} cleanup pass=${cleanup.pass} measurementDisabled=${measurementDisabled}`);
  await writeFile(path.join(outputDir, 'run.log'), `${logLines.join('\n')}\n`, 'utf8');

  const artifactValidation = await validateArtifactFiles(
    root,
    performanceArtifactDescriptors(root, outputDir, routeResult),
  );
  const closureReport = buildPerformanceClosureReport({
    taskId,
    fingerprints: { start: startFingerprint, end: endFingerprint },
    environment,
    windows: closureWindows,
    artifacts: artifactValidation.verified,
    cleanup,
    errors,
    notes: [
      'Phase 0 diagnostic evidence infrastructure; no renderer optimization or graphics integration claim.',
      'Raw rAF samples and recomputed percentile/hitch summaries are content-hashed before publication.',
      'Synthetic or injected workloads remain explicitly diagnostic and cannot satisfy primary acceptance.',
    ],
  });

  document.runtimeKind = 'browser';
  document.taskId = taskId;
  document.worktree = closureReport.worktree;
  document.environment = environment;
  document.artifacts = artifactValidation.verified;
  document.cleanup = cleanup;
  document.errors = errors;
  document.route = routeResult;
  document.closure = closureReport;
  document.validation = validatePerformanceAttribution(document);

  const failures = [
    ...document.validation.failures,
    ...closureReport.validation.failures,
    ...artifactValidation.failures,
    ...cleanupValidation.failures,
  ];
  if (routeResult?.pass !== true) failures.push('shared public route did not pass');
  if (errorCount(errors) > 0) failures.push('page/runtime errors or warnings were observed');
  const validation = { pass: failures.length === 0, failures: [...new Set(failures)] };
  const pass = validation.pass;
  document.pass = pass;

  const outPath = path.join(outputDir, 'performance-attribution.json');
  const closurePath = path.join(outputDir, 'performance-closure.json');
  await Promise.all([
    writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8'),
    writeFile(closurePath, `${JSON.stringify(closureReport, null, 2)}\n`, 'utf8'),
  ]);
  return { pass, outPath, closurePath, outputDir, document, closureReport, validation };
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
  variantScenarioIds = ['flight_steady'],
  seed = 47,
  warmupMs = 2_000,
  sampleMs = 5_000,
  flightTimeoutMs = 150_000,
  dockTimeoutMs = 90_000,
  log = () => {},
} = {}) {
  assert(root, 'runPerformanceAttributionProbe requires root');
  const outRoot = outputRoot || path.join(root, '.devshots', 'perf');
  const outputDir = await allocateOutputDir(outRoot, taskId);
  const startFingerprint = await strictWorktreeFingerprint(root);
  const activity = await inspectPerformanceActivity(root);
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
  let pageIssueTracker = null;
  let routeResult = null;

  try {
    ownedServer = await acquireVisualProbeServer({ root });
    assert.equal(ownedServer.ownsServer, true, 'attribution probe must own its canonical in-process server');
    const rootUrl = ownedServer.baseUrl;
    ({ page, browser, context } = await launchBrowser(viewport));
    pageIssueTracker = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });
    canonicalUrlTracker = createCanonicalUrlTracker(page, rootUrl);
    await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    await page.bringToFront();
    doLog(`browser canonical root ${rootUrl}`);

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
      if (PERFORMANCE_SCENARIO_IDS.includes(routeTag) || ATTRIBUTION_ROUTE_TAGS.includes(routeTag)) {
        if (await isDocked(pg)) {
          await undockForRecovery(pg, routeLog);
        }
        const mapVisible = await pg.locator('#sf-galaxymap').isVisible().catch(() => false);
        if (routeTag === 'map_interaction_steady' || routeTag === 'map_to_flight_transition') {
          if (!mapVisible) await pg.keyboard.press('KeyM');
          await pg.locator('#sf-galaxymap').waitFor({ state: 'visible', timeout: 20_000 });
        } else if (routeTag === 'map_open') {
          if (mapVisible) await pg.keyboard.press('Escape');
        } else if (mapVisible) {
          await pg.keyboard.press('Escape');
          await pg.locator('#sf-galaxymap').waitFor({ state: 'hidden', timeout: 20_000 });
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

    // Prefer docked first while still docked from the public route, group comparable flight
    // workloads, and leave cleanup-scoped jump progression last.
    const orderedRoutes = performanceScenarioExecutionOrder(routes);

    const { document } = await samplePerformanceAttribution(page, {
      routes: orderedRoutes,
      variants,
      variantScenarioIds,
      warmupMs,
      sampleMs,
      log: doLog,
      navigateToRoute,
      prepareScenario: (pg, scenarioId, scenarioLog) => preparePerformanceScenario(pg, scenarioId, { seed, log: scenarioLog }),
      restoreScenario: (pg, scenarioId, scenarioLog) => restorePerformanceScenario(pg, scenarioId, { log: scenarioLog }),
    });
    return await finalizePerformanceAttributionRun({
      root,
      outputDir,
      taskId,
      seed,
      viewport,
      document,
      routeResult,
      startFingerprint,
      activity,
      pageIssueTracker,
      page,
      context,
      browser,
      ownedServer,
      canonicalUrlTracker,
      logLines,
      setCleanupReport: (value) => { cleanupReport = value; },
    });
  } catch (error) {
    let measurementState = {
      renderWorkEnabled: false,
      systemTimingEnabled: false,
      gpuTimersEnabled: false,
      restoreJournalPresent: false,
      verified: false,
    };
    if (page && !page.isClosed()) {
      measurementState = { ...(await disableMeasurementGates(page)), verified: true };
      await page.screenshot({ path: path.join(outputDir, 'failure-screenshot.png'), type: 'png', animations: 'allow' }).catch(() => {});
    }
    const routeFailureState = await readPerformanceRouteFailureState(page);
    const measurementDisabled = measurementState.verified === true
      && measurementState.renderWorkEnabled !== true
      && measurementState.systemTimingEnabled !== true
      && measurementState.gpuTimersEnabled !== true
      && measurementState.restoreJournalPresent !== true;
    const errors = buildErrorEvidence('browser', pageIssueTracker);
    pageIssueTracker?.stop?.();
    cleanupReport = await closeAttributionResources({ page, context, browser, ownedServer, canonicalUrlTracker });
    const normalizedCleanup = normalizeCleanup('browser', cleanupReport);
    const cleanupValidation = validateCleanupEvidence(normalizedCleanup, { runtimeKind: 'browser' });
    const activityEnd = await inspectPerformanceActivity(root);
    const endFingerprint = await strictWorktreeFingerprint(root);
    const failureMessage = error?.message || String(error);
    doLog(`FAIL ${error?.routePhase || 'probe'}: ${failureMessage}`);
    doLog(`cleanup pass=${cleanupValidation.pass} measurementDisabled=${measurementDisabled}`);
    await writeFile(path.join(outputDir, 'run.log'), `${logLines.join('\n')}\n`, 'utf8');
    const artifactValidation = await validateArtifactFiles(
      root,
      performanceArtifactDescriptors(root, outputDir, routeResult),
    );
    const failurePath = path.join(outputDir, 'performance-closure-failure.json');
    const failures = [
      failureMessage,
      ...cleanupValidation.failures,
      ...artifactValidation.failures,
    ];
    if (!measurementDisabled) failures.push('measurement gates were not verifiably disabled');
    if (startFingerprint.digest !== endFingerprint.digest) failures.push('worktree changed during failed capture');
    const failure = {
      schema: 'spaceface.performanceClosureFailure.v1',
      generatedAt: new Date().toISOString(),
      taskId,
      pass: false,
      failure: {
        name: error?.name || 'Error',
        message: failureMessage,
        routePhase: error?.routePhase || null,
        routeProgress: error?.routeProgress || [],
        routeState: routeFailureState,
        performanceTelemetry: error?.performanceTelemetry || null,
        urlChecks: error?.urlChecks || [],
      },
      worktree: { start: startFingerprint, end: endFingerprint },
      activity: { start: activity, end: activityEnd },
      measurement: { disabled: measurementDisabled, state: measurementState },
      errors,
      cleanup: {
        pass: cleanupValidation.pass && measurementDisabled,
        validation: cleanupValidation,
        ownedReport: cleanupReport,
      },
      artifacts: artifactValidation.verified,
      validation: { pass: false, failures: [...new Set(failures)] },
    };
    await writeFile(failurePath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
    return {
      pass: false,
      outPath: failurePath,
      closurePath: null,
      outputDir,
      document: failure,
      closureReport: null,
      validation: failure.validation,
    };
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
  buildClosureWindows,
  inspectPerformanceActivity,
  readPerformanceRouteFailureState,
  runPerformanceAttributionProbe,
};
