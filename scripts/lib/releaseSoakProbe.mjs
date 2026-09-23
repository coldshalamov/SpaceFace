// Browser/Electron release-soak evidence gatherer.
//
// The two runtimes execute the same public route. Browser owns the canonical
// in-process probe server; Electron owns its launcher server and is never
// navigated to the browser probe URL. Evidence is published only after owned
// cleanup and content verification.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { collectPageIssues } from './browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './electronTestIsolation.mjs';
import { loadPlaywright } from './load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './playwrightCspPolling.mjs';
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
import { provisionElectronRuntime } from './electronRuntimeProvisioning.mjs';
import { runBrowserPublicRoute } from './alphaLiveBaselineRoute.mjs';
import { acquireVisualProbeServer } from './visualProbeServer.mjs';
import {
  PERFORMANCE_REGISTERED_SCENARIO_IDS,
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
  performanceScenarioPipelineSettleTimeoutMs,
  preparePerformanceScenario,
  restorePerformanceScenario,
  validateScenarioRestoration,
} from './performanceScenarioDriver.mjs';
import { PERFORMANCE_CLOSURE_ACCEPTANCE_SCHEMA } from './performanceFinalAcceptance.mjs';
import {
  evaluateMinSpecFloors,
  loadMinSpec,
} from './minSpecFloors.mjs';
import {
  readConsumedClaimLedgerEntry,
  requireBrokerClaimOrDiagnostic,
} from './validationBroker.mjs';

export const DEFAULT_VIEWPORT = Object.freeze({ width: 1440, height: 900 });
export const DEFAULT_CYCLES = Object.freeze({ browser: 2, electron: 2, local: 6 });
// Six hours — the acceptance soak is two hours; the bound catches a dropped
// or doubled digit in --min-duration-ms without forbidding a longer diagnostic.
export const MAX_MIN_DURATION_MS = 6 * 60 * 60 * 1000;
export const DYNAMIC_BUFFER_FULL_SPAN_VARIANT = 'dynamic_buffer_full_span';
// Get-Process CPU time advances in scheduler-sized quanta on Windows, so a near-zero threshold
// mistakes ordinary dormant desktop roots for foreground work. Sample long enough to average those
// ticks and reject sustained work (or churn); the route's no-op control and GPU validity checks remain
// the timing authority once the bounded admission sample passes.
export const PERFORMANCE_ACTIVITY_SAMPLE_MS = 5_000;
export const PERFORMANCE_ACTIVITY_MAX_AGGREGATE_CPU_CORE_FRACTION = 0.125;
export const PERFORMANCE_ACTIVITY_MAX_PROCESS_CPU_CORE_FRACTION = 0.075;

const PERFORMANCE_CONTAMINANT_PATTERN =
  /^(?:blender|blender-launcher|blender-mcp|chrome|msedge|msedgewebview2|electron)(?:\.exe)?$/i;
const PERFORMANCE_PROCESS_SNAPSHOT_SCRIPT = [
  "$names=@('blender','blender-launcher','blender-mcp','chrome','msedge','msedgewebview2','electron')",
  '$rows=@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $names -contains $_.ProcessName } | ForEach-Object {',
  "[pscustomobject]@{name=($_.ProcessName+'.exe');pid=[int]$_.Id;cpuSeconds=if($null -eq $_.CPU){0}else{[double]$_.CPU}}",
  '})',
  'ConvertTo-Json -Compress -InputObject $rows',
].join(';');

const WINDOWS_BROWSER_PROCESS_TREE_SCRIPT = [
  "$names=@('chrome.exe','msedge.exe')",
  '$rows=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $names -contains $_.Name } | ForEach-Object {',
  '[pscustomobject]@{name=[string]$_.Name;pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId}',
  '})',
  'ConvertTo-Json -Compress -InputObject $rows',
].join(';');

export function performanceAttributionRuntimePlan(runtimeKind) {
  assert(['browser', 'electron'].includes(runtimeKind), 'runtimeKind must be browser or electron');
  return runtimeKind === 'browser'
    ? {
      runtimeKind,
      canonicalRootOwner: 'visual-probe-server',
      launcher: 'system-browser',
      issueTracker: 'page',
      cleanupOwner: 'closeOwnedResources',
    }
    : {
      runtimeKind,
      canonicalRootOwner: 'isolated-electron-launcher',
      launcher: 'playwright-electron',
      issueTracker: 'electron-application',
      cleanupOwner: 'closeOwnedElectronRuntime',
    };
}

export function provisionPerformanceAttributionElectronRuntime(
  root,
  provision = provisionElectronRuntime,
) {
  assert(root, 'Electron attribution runtime provisioning requires a repository root');
  assert.equal(typeof provision, 'function', 'Electron attribution runtime provisioner must be callable');
  const runtime = provision({ root });
  assert.equal(runtime?.ready, true, 'Electron attribution requires a provisioned runtime');
  assert(
    runtime.packageVersion
      && runtime.packageVersion === runtime.declaredVersion
      && runtime.packageVersion === runtime.runtimeVersion,
    'Electron package and binary must match the declared Electron runtime',
  );
  assert(runtime.runtimePath, 'Electron attribution requires an exact runtime executable path');
  return {
    packageVersion: runtime.packageVersion,
    runtimeVersion: runtime.runtimeVersion,
    runtimePath: runtime.runtimePath,
    provisioned: runtime.provisioned === true,
  };
}

export async function runReleaseSoakProbe({
  root,
  runtime = 'browser',
  mode = 'browser',
  manifest = null,
  brokerClaimToken = process.env.SF_BROKER_CLAIM ?? null,
  cycles = DEFAULT_CYCLES[mode] ?? DEFAULT_CYCLES[runtime] ?? 2,
  viewport = DEFAULT_VIEWPORT,
  outputRoot = path.join(root, '.devshots', 'spec2'),
  taskId = `release-soak-${runtime}`,
  flightTimeoutMs = 150_000,
  dockTimeoutMs = 90_000,
  cycleTimeoutMs = 300_000,
  minDurationMs = 0,
  cycleScreenshots = true,
  log = () => {},
} = {}) {
  assert(['browser', 'electron'].includes(runtime), 'runtime must be browser or electron');
  assert(Number.isInteger(cycles) && cycles > 0, 'cycles must be a positive integer');
  assert(
    Number.isInteger(minDurationMs) && minDurationMs >= 0 && minDurationMs <= MAX_MIN_DURATION_MS,
    `minDurationMs must be an integer in [0, ${MAX_MIN_DURATION_MS}]`,
  );
  // Direct callers may pass 0/'0'/'false'; normalize so only an explicit
  // off-value suppresses per-cycle screenshots.
  const takeCycleScreenshots = ![false, 0, '0', 'false'].includes(cycleScreenshots);
  const authority = await authorizeReleaseSoak({
    root,
    runtime,
    outputRoot,
    manifest,
    brokerClaimToken,
  });
  const routeSeed = Number(authority.fixedSeed);
  const outputDir = await allocateOutputDir(outputRoot, taskId);
  const logLines = [];
  const doLog = (message) => {
    const line = `${new Date().toISOString()} ${message}`;
    logLines.push(line);
    log(line);
  };

  let ownedServer = null;
  let browserServer = null;
  let browserChildProcess = null;
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
  let packagedStartup = null;

  try {
    const startFingerprint = await strictWorktreeFingerprint(root);
    doLog(`worktree start ${startFingerprint.id}`);

    if (runtime === 'electron' && authority.primaryAcceptance) {
      assert.equal(
        manifest?.id,
        'performance-electron-modernization-electron',
        'promoting Electron release soak requires the packaged-modernization manifest',
      );
      packagedStartup = await runPackagedStartupSubroute({
        root,
        outputDir,
        authority,
        log: doLog,
      });
      doLog(`packaged startup ${packagedStartup.report.path} sha256=${packagedStartup.report.sha256}`);
    }

    // Boot floor (PQ-033.02): player-visible launch -> main-menu wall time.
    // Electron: host process launch -> menu. Browser: page navigation -> menu
    // (navigationStartedAt below); the full harness-inclusive number is still
    // emitted as bootToMenuMs for attribution.
    const runtimeLaunchAt = Date.now();
    let navigationStartedAt = null;

    if (runtime === 'browser') {
      ownedServer = await acquireVisualProbeServer({ root });
      assert.equal(ownedServer.ownsServer, true, 'browser soak must own its canonical in-process server');
      rootUrl = ownedServer.baseUrl;
      ({ page, browser, context, browserServer, browserChildProcess } = await launchBrowser(viewport));
      pageIssueTracker = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });
      canonicalUrlTracker = createCanonicalUrlTracker(page, rootUrl);
      await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      // Browser boot floor anchors at navigation start, not harness start: a web
      // player's boot is page-load -> menu; the harness's own server spin-up and
      // cold Chromium launch are measurement apparatus, not the game's boot.
      navigationStartedAt = await page.evaluate(() => new Date(performance.timeOrigin).toISOString()).catch(() => null);
    } else {
      const launched = await launchElectron(root, (owned) => {
        electronApp = owned.electronApp;
        childProcess = owned.childProcess;
        processMonitor = owned.processMonitor;
        pageIssueTracker = owned.pageIssueTracker;
        isolatedLaunch = owned.isolatedLaunch;
        page = owned.page || page;
        canonicalUrlTracker = owned.canonicalUrlTracker || canonicalUrlTracker;
        rootUrl = owned.rootUrl || rootUrl;
      });
      ({
        page,
        electronApp,
        childProcess,
        processMonitor,
        pageIssueTracker,
        isolatedLaunch,
        canonicalUrlTracker,
        rootUrl,
      } = launched);
    }

    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    await page.bringToFront();
    doLog(`${runtime} canonical root ${rootUrl}`);

    const routeResult = await runBrowserPublicRoute({
      page,
      outputDir,
      expectedRootUrl: rootUrl,
      log: doLog,
      flightTimeoutMs,
      dockTimeoutMs,
      seed: Number.isSafeInteger(routeSeed) && routeSeed > 0 ? routeSeed : null,
    });
    const baselineSettings = await readSettingsTruth(page);
    assert.equal(await isDocked(page), true, 'public route must finish docked for comparable retained-heap baseline');
    await ensureMarketOpen(page);
    // Warmup cycles before the baseline: a fresh dock never requests the station's
    // exterior-only content, so the first undock→flight→load→redock admits
    // ~250 MB of geometry/texture buffers once, and later cycles keep admitting
    // first-seen NPC hull variants. A single warmup cycle ends before that
    // warm-in completes, so its growth lands inside the measured window and the
    // retention slope reads it as a leak. Warmup therefore runs until a full
    // cycle is quiet — post-GC heap within the plateau bound AND zero net new
    // shader programs — which is exactly the steady state the contract's
    // start/end deltas intend to measure from. It is capped: a run whose
    // residency never settles takes its baseline after the last warmup cycle
    // and the strict contract measures the real remaining growth. Warmup frames
    // are not billed to the soak and warmup heap does not enter the growth
    // series; each cycle's save/load assertions still run.
    const WARMUP_PLATEAU_HEAP_BYTES = 12 * 1024 * 1024;
    // Resource counters oscillate by a few entries as pools churn; a plateau requires near-zero
    // net movement in ALL of them, not just heap+programs — diag22 declared plateau at warmup-2 on
    // a 2.5 MB heap delta while the measured window then grew geometries +27/+37 in later cycles.
    const WARMUP_PLATEAU_RESOURCE_DELTA = 8;
    const WARMUP_MAX_CYCLES = 6;
    // The soak recorder turns the game's per-frame instrumentation on mid-window
    // (system timing, render work, hitch attribution). Enabling it here lets the
    // warmup cycles absorb its one-time warm-in — newly hot code paths compile and
    // stat maps populate once — instead of billing that retained step to the first
    // measured cycle. installSoakRecorder re-enables idempotently and still records
    // the flags' prior state for its own restore bookkeeping.
    await page.evaluate(() => {
      const perf = window.__SPACEFACE_PERF__;
      try {
        if (typeof perf?.setRenderWorkEnabled === 'function') perf.setRenderWorkEnabled(true);
        if (typeof perf?.setSystemTimingEnabled === 'function') perf.setSystemTimingEnabled(true);
        if (typeof perf?.setHitchAttributionEnabled === 'function') perf.setHitchAttributionEnabled(true);
      } catch (_) { /* instrumentation hooks are optional */ }
    }).catch(() => {});
    let prevWarmupSnapshot = null;
    for (let warmupIndex = 0; warmupIndex < WARMUP_MAX_CYCLES; warmupIndex++) {
      try {
        await withTimeout(
          runSoakCycle(page, { index: `warmup-${warmupIndex}`, outputDir, log: doLog, screenshots: false }),
          cycleTimeoutMs,
          `release-soak warmup cycle ${warmupIndex}`,
        );
      } catch (warmupError) {
        // Same contract as measured cycles: a dead warmup must carry the live state
        // that killed it, not a bare waitForFunction timeout.
        const diag = await captureCycleStateDiag(page).catch(() => null);
        warmupError.message = `${warmupError.message} | cycle-state: ${JSON.stringify(diag)}`;
        const warmupConsoleHead = (pageIssueTracker?.issues || [])
          .filter((issue) => issue.type === 'error' || issue.type === 'pageerror')
          .slice(0, 6)
          .map((issue) => `${issue.type}: ${String(issue.text || '').slice(0, 300)}`);
        if (warmupConsoleHead.length > 0) {
          warmupError.message += ` | console-errors: ${JSON.stringify(warmupConsoleHead)}`;
        }
        throw warmupError;
      }
      // No ensureMarketOpen here: the warmup cycle ends in the same post-roundtrip
      // market state every measured cycle ends in, which is the state
      // docked-market-end is captured in — that is the comparability the floor needs.
      await page.waitForTimeout(1_500);
      const snap = await withTimeout(
        readPostGcMemorySnapshot(page, `docked-market-warmup-${warmupIndex}`),
        30_000,
        `release-soak warmup ${warmupIndex} memory snapshot`,
      );
      const snapDelta = (key) => prevWarmupSnapshot && Number.isFinite(snap[key])
        && Number.isFinite(prevWarmupSnapshot[key])
        ? snap[key] - prevWarmupSnapshot[key] : null;
      const heapDelta = snapDelta('heapBytes');
      const programDelta = snapDelta('programs');
      const geometryDelta = snapDelta('geometries');
      const textureDelta = snapDelta('textures');
      doLog(`warmup ${warmupIndex} snapshot: heap ${snap.heapBytes} B (delta ${heapDelta}), programs ${snap.programs} (delta ${programDelta}), geometries ${snap.geometries} (delta ${geometryDelta}), textures ${snap.textures} (delta ${textureDelta})`);
      if (prevWarmupSnapshot && snap.docked === true
          && Number.isFinite(heapDelta) && heapDelta <= WARMUP_PLATEAU_HEAP_BYTES
          && Number.isFinite(programDelta) && programDelta <= 0
          && Number.isFinite(geometryDelta) && geometryDelta <= WARMUP_PLATEAU_RESOURCE_DELTA
          && Number.isFinite(textureDelta) && textureDelta <= WARMUP_PLATEAU_RESOURCE_DELTA) {
        doLog(`warmup plateau reached after ${warmupIndex + 1} cycle(s)`);
        break;
      }
      prevWarmupSnapshot = snap;
      if (warmupIndex === WARMUP_MAX_CYCLES - 1) {
        doLog('warmup never plateaued; the baseline follows the last warmup cycle and the contract measures the remaining growth');
      }
    }
    const baselineMemory = await withTimeout(
      readPostGcMemorySnapshot(page, 'docked-market-start'),
      30_000,
      'release-soak baseline memory snapshot',
    );
    if (process.env.SF_SOAK_HEAP_SNAPSHOTS === '1' && outputDir) {
      await captureHeapSnapshot(page, path.join(outputDir, 'heap-start.heapsnapshot')).catch(() => {});
    }

    // The soak window opens after the public route lands docked on the market: every
    // frame gap >50 ms from here to the controlled context loss is recorded with its
    // transition tag so the floors checker can separate gameplay hitches from
    // save/load rebuild spans without discarding either count.
    const soakStartedAt = Date.now();
    const soakThreshold = readMinSpecHitchThreshold(root);
    await installSoakRecorder(page, { hitchThresholdMs: soakThreshold });
    doLog(`soak window opened (hitch threshold ${soakThreshold} ms; cycles >=${cycles}${minDurationMs > 0 ? `, wall >=${minDurationMs} ms` : ''})`);

    const cycleResults = [];
    const memoryCheckpoints = [];
    let index = 0;
    while (index < cycles || Date.now() - soakStartedAt < minDurationMs) {
      try {
        const cycle = await withTimeout(
          runSoakCycle(page, { index, outputDir, log: doLog, screenshots: takeCycleScreenshots }),
          cycleTimeoutMs,
          `release-soak cycle ${index}`,
        );
        cycleResults.push(cycle);
      } catch (cycleError) {
        // A dead cycle must carry the live state that killed it — a waitForFunction
        // timeout alone says nothing about whether the world restored, the ship is
        // wedged, or the page froze.
        const diag = await captureCycleStateDiag(page).catch(() => null);
        cycleError.message = `${cycleError.message} | cycle-state: ${JSON.stringify(diag)}`;
        // The runner quarantines itself on the first registry.step throw, so every later frame
        // reports only "SimulationRunner is closed". The original error survives only in the
        // console issue tracker — surface its head so the fail line names the real thrower.
        const consoleErrorHead = (pageIssueTracker?.issues || [])
          .filter((issue) => issue.type === 'error' || issue.type === 'pageerror')
          .slice(0, 6)
          .map((issue) => `${issue.type}: ${String(issue.text || '').slice(0, 300)}`);
        if (consoleErrorHead.length > 0) {
          cycleError.message += ` | console-errors: ${JSON.stringify(consoleErrorHead)}`;
        }
        // The position trail is the only witness that names the tick a far-field excursion
        // began; the cycle-state tail alone reads end state. Persist the whole ring plus
        // the writer-trap events, whose stacks name the exact write that moved the ship.
        try {
          const fullTrail = await page.evaluate(() => ({
            trail: window.__M6_RELEASE_SOAK_TRAIL__ || [],
            posTrapEvents: window.__M6_POS_TRAP_EVENTS__ || [],
          }));
          if (outputDir && fullTrail && (fullTrail.trail.length || fullTrail.posTrapEvents.length)) {
            await writeFile(path.join(outputDir, 'failure-trail.json'), JSON.stringify(fullTrail));
          }
        } catch { /* trail dump is best-effort over the primary diag */ }
        throw cycleError;
      } finally {
        // A cycle that throws mid-transition must not leave the tag armed — later
        // gameplay hitches would be misfiled as transition spans and pass leniently.
        await setSoakTransition(page, null);
      }
      memoryCheckpoints.push(await withTimeout(
        readPostGcMemorySnapshot(page, `docked-market-cycle-${index + 1}`),
        30_000,
        `release-soak memory checkpoint ${index + 1}`,
      ));
      index += 1;
    }
    doLog(`soak cycles complete: ${cycleResults.length} cycles in ${((Date.now() - soakStartedAt) / 60_000).toFixed(1)} min`);

    assert.equal(await isDocked(page), true, 'release-soak cycles must finish docked for comparable retained-heap evidence');
    await page.waitForTimeout(1_500);
    const finalMemory = await withTimeout(
      readPostGcMemorySnapshot(page, 'docked-market-end'),
      30_000,
      'release-soak final memory snapshot',
    );
    if (process.env.SF_SOAK_HEAP_SNAPSHOTS === '1' && outputDir) {
      await captureHeapSnapshot(page, path.join(outputDir, 'heap-end.heapsnapshot')).catch(() => {});
    }

    await setSoakTransition(page, 'undock');
    try {
      await undockForRecovery(page, doLog);
    } finally {
      await setSoakTransition(page, null, { settleMs: 3_000 });
    }
    const flightWindow = await sampleRafWindow(page, {
      phaseTag: 'flight_steady',
      warmupMs: 5_000,
      sampleMs: 5_000,
      enableGpuTimers: true,
    });
    const flightSamples = flightWindow.samples;
    // Stop the soak recorder before the induced context loss so the deliberate
    // WebGL teardown gap is not charged to the game.
    const soakWindow = await stopSoakRecorder(page, { startedAt: soakStartedAt });
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
    // Bounded resource trail — geo/tex/prog at 200 ms cadence through the cycle legs. Persisted
    // unconditionally so post-plateau resource growth attributes to a leg without a rerun; the
    // ring is already bounded in-page so this read cannot stall on history.
    try {
      const resourceTrail = await page.evaluate(() => (window.__M6_RELEASE_SOAK_TRAIL__ || []).slice(-4000));
      if (outputDir && Array.isArray(resourceTrail) && resourceTrail.length > 0) {
        await writeFile(path.join(outputDir, 'resource-trail.json'), JSON.stringify(resourceTrail));
      }
    } catch (_) { /* diagnostic-only; never block evidence assembly */ }
    // Read the armed program-query trap before cleanup closes the page: when warnings fail
    // validation these stacks name the exact caller issuing dead-handle getProgramParameter
    // calls, which the browser's own GL warning text cannot identify.
    const programQueryTrap = await readGlProgramQueryTrap(page);
    if (programQueryTrap.length > 0) {
      doLog(`program-query trap captured ${programQueryTrap.length} invalid getProgramParameter caller(s): ${
        programQueryTrap.slice(0, 4).map((entry) => `${entry.count}x ${String(entry.stack || '').split('\n')[2] || '?'}${entry.lost === true ? ' [context-lost]' : ''}`).join(' | ')
      }`);
    }
    // Same read for the delete trap: `delete: object does not belong to this context`
    // storms name no caller either, and the fix depends on which dispose path issues them.
    const glDeleteTrap = await readGlDeleteTrap(page);
    if (glDeleteTrap.length > 0) {
      doLog(`gl-delete trap captured ${glDeleteTrap.length} dead-handle delete caller(s): ${
        glDeleteTrap.slice(0, 4).map((entry) => `${entry.count}x ${entry.api} ${String(entry.stack || '').split('\n')[2] || '?'}`).join(' | ')
      }`);
    }

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
        'Soak-window frames carry the hitch-attribution instrumentation tax (system timing, render work, and per-frame owner bookkeeping enabled for the whole window).',
      ],
    };
    const memory = buildMemoryEvidence(baselineMemory, finalMemory, memoryCheckpoints);
    const quality = buildQualityEvidence(routeResult, baselineSettings, finalSettings);

    cleanupReport = runtime === 'electron'
      ? await closeOwnedElectronRuntime({ page, electronApp, childProcess, canonicalUrlTracker, processMonitor, rootUrl })
      : await closeOwnedResources({ page, context, browser, browserServer, browserChildProcess, server: ownedServer, canonicalUrlTracker });
    if (runtime === 'electron') cleanupIsolatedElectronProfile(isolatedLaunch, cleanupReport);
    const cleanup = normalizeCleanup(runtime, cleanupReport);
    const cleanupValidation = validateCleanupEvidence(cleanup, { runtimeKind: runtime });
    const errors = buildErrorEvidence(runtime, pageIssueTracker);
    errors.programQueryTrap = programQueryTrap;
    errors.glDeleteTrap = glDeleteTrap;
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
      { name: authority.primaryAcceptance ? 'broker claim consumed' : 'diagnostic evidence is non-promoting', status: 'pass' },
    ];
    if (runtime === 'electron' && authority.primaryAcceptance) {
      checks.push({ name: 'exact packaged startup subroute', status: packagedStartup?.pass === true ? 'pass' : 'fail' });
    }

    const telemetry = { performance, memory, errors, contextLoss };
    await writeTelemetry(outputDir, telemetry, `${logLines.join('\n')}\n`);
    const artifactDescriptors = buildArtifactDescriptors(
      root,
      outputDir,
      routeResult,
      cycleResults,
      packagedStartup,
    );
    const artifactValidation = await validateArtifactFiles(root, artifactDescriptors);
    checks.push({ name: 'artifact content integrity', status: artifactValidation.pass ? 'pass' : 'fail' });

    const menuMark = routeResult?.steps?.find((step) => step?.name === 'main-menu-visible') || null;
    const flightMark = routeResult?.steps?.find((step) => step?.name === 'authored-flight-ready') || null;
    const bootStartAt = runtime === 'browser' && navigationStartedAt
      ? Date.parse(navigationStartedAt)
      : runtimeLaunchAt;
    const boot = {
      launchedAt: new Date(runtimeLaunchAt).toISOString(),
      navigationStartedAt: navigationStartedAt ?? null,
      menuVisibleAt: menuMark?.at ?? null,
      bootToMenuMs: menuMark ? Date.parse(menuMark.at) - runtimeLaunchAt : null,
      gameBootToMenuMs: menuMark ? Date.parse(menuMark.at) - bootStartAt : null,
      flightReadyAt: flightMark?.at ?? null,
      launchToFlightMs: flightMark ? Date.parse(flightMark.at) - runtimeLaunchAt : null,
    };
    const routeGpu = routeResult?.gpu || null;
    const hardware = {
      gpu: routeGpu ? {
        vendor: routeGpu.runtimeGpu?.vendor || routeGpu.unmaskedVendor || null,
        renderer: routeGpu.runtimeGpu?.renderer || routeGpu.unmaskedRenderer || null,
        unmaskedVendor: routeGpu.unmaskedVendor || null,
        unmaskedRenderer: routeGpu.unmaskedRenderer || null,
        tier: routeGpu.runtimeGpu?.tier || null,
        software: routeGpu.runtimeGpu?.software ?? null,
        identity: routeGpu.identity || null,
        classificationPass: routeGpu.classification?.pass === true,
      } : null,
    };

    const evidence = {
      schema: RELEASE_SOAK_SCHEMA,
      taskId,
      generatedAt: new Date().toISOString(),
      worktreeId: startFingerprint.id,
      worktreeDigest: startFingerprint.digest,
      runtimeKind: runtime,
      mode,
      cycles: { count: cycleResults.length, results: cycleResults.map((cycle) => cycle.summary) },
      boot,
      hardware,
      soakWindow,
      pass: false,
      primaryAcceptance: authority.primaryAcceptance,
      manifestId: authority.manifestId,
      claimId: authority.claimId,
      sourceCandidateDigest: authority.digests?.sourceCandidateDigest ?? null,
      candidateDigest: authority.digests?.candidateDigest ?? null,
      digests: authority.digests,
      consumedClaim: authority.consumedClaim,
      fixedSeed: authority.fixedSeed,
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
      packagedStartup,
      fingerprints: { start: startFingerprint, end: endFingerprint },
    };
    const validation = validateReleaseSoakEvidence(evidence);
    if (!artifactValidation.pass) validation.failures.push(...artifactValidation.failures);
    validation.pass = validation.failures.length === 0;
    evidence.validation = { pass: validation.pass, failures: [...new Set(validation.failures)] };
    evidence.pass = evidence.validation.pass;
    // Advisory only: check-min-spec-floors.mjs recomputes the floors from the raw
    // fields above and never trusts this block.
    evidence.floors = evaluateFloorsSafely(root, evidence);
    const evidencePath = path.join(outputDir, 'evidence.json');
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    return {
      pass: evidence.validation.pass,
      outputDir,
      evidencePath,
      acceptedEvidencePath: null,
      evidence,
      routeResult,
      cleanupReport,
      startFingerprint,
    };
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
        cleanupReport = await closeOwnedResources({ page, context, browser, browserServer, browserChildProcess, server: ownedServer, canonicalUrlTracker }).catch(() => null);
      }
    }
    if (runtime === 'electron') cleanupIsolatedElectronProfile(isolatedLaunch, cleanupReport);
    pageIssueTracker?.stop?.();
    await writeFile(path.join(outputDir, 'run.log'), `${logLines.join('\n')}\n`, 'utf8').catch(() => {});
  }
}

async function launchBrowser(viewport, { enableTier1Counters = false } = {}) {
  const executablePath = findSystemBrowser();
  assert(executablePath, 'headed Chrome or Edge is required for browser release-soak evidence');
  const { chromium } = await loadPlaywright();
  let browserServer = null;
  let browser = null;
  try {
    // Browser.close() only proves the Playwright connection disconnected. LaunchServer gives this
    // harness the exact ChildProcess and a close() promise that resolves after Chrome terminates,
    // so the post-run activity census cannot mistake our own trailing process for outside work.
    browserServer = await chromium.launchServer({
      headless: false,
      executablePath,
      args: ['--incognito', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--window-size=${viewport.width},${viewport.height}`, '--force-device-scale-factor=1',
        // The browser route suspends the sim while document.hidden is true, and Chromium reports
        // hidden for a fully occluded window on Windows. A covered soak window used to freeze
        // state.tick while page timers kept running (the cycle-31 'flight input must advance
        // simulation ticks' false fail). Keep the page presenting under occlusion; a genuine
        // minimize still suspends, which remains correct product behavior.
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
    });
    const browserChildProcess = browserServer.process();
    assert(browserChildProcess, 'browser launch server must expose its owned child process');
    browser = await chromium.connect(browserServer.wsEndpoint());
    const context = await browser.newContext({ viewport, screen: viewport, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'dark' });
    // Context and page init scripts have the same pre-document guarantee. Keep the context-level
    // install so any replacement page inherits the immutable measurement authority; the causal
    // New Game failure was a product-side counter-owner swap, not Playwright injection ordering.
    if (enableTier1Counters) await installTier1CountersInitScript(context);
    await installGlProgramQueryTrap(context);
    await installGlDeleteTrap(context);
    const page = await context.newPage();
    return { browserServer, browserChildProcess, browser, context, page };
  } catch (error) {
    await browser?.close?.().catch(() => {});
    await browserServer?.close?.().catch(() => {});
    throw error;
  }
}

async function launchElectron(
  root,
  onOwnership = () => {},
  taskId = 'release-soak-electron',
  { enableTier1Counters = false } = {},
) {
  const runtimeProvisioning = provisionPerformanceAttributionElectronRuntime(root);
  const { _electron: electron } = await loadPlaywright();
  const isolatedLaunch = createIsolatedElectronLaunch({ root, taskId });
  // Omit executablePath intentionally. Playwright resolves this already-verified package and,
  // only on that package-resolution path, installs its Electron readiness loader before app
  // startup. Supplying the same binary path explicitly bypasses that loader in Playwright 1.61.
  const electronApp = await launchIsolatedElectronApplication(electron, isolatedLaunch);
  let childProcess = null;
  let processMonitor = null;
  let pageIssueTracker = null;
  const publishOwnership = (extra = {}) => onOwnership({
    electronApp,
    processMonitor,
    childProcess,
    pageIssueTracker,
    isolatedLaunch,
    runtimeProvisioning,
    ...extra,
  });
  // A successful Electron launch is already an owned live runtime. Publish the application/profile
  // before even asking for its process so any synchronous setup failure still reaches outer cleanup.
  publishOwnership();
  childProcess = electronApp.process();
  publishOwnership();
  processMonitor = createElectronProcessMonitor({ electronApp, childProcess });
  childProcess = processMonitor.childProcess;
  publishOwnership();
  pageIssueTracker = createStrictElectronApplicationIssueTracker(electronApp);
  // Publish every cleanup handle before firstWindow/init/reload can fail. The caller's outer finally
  // then owns both the runtime and its isolated profile even if setup never returns a launch record.
  publishOwnership();
  assert(childProcess, 'Electron launch must expose its owned child process');
  const page = await electronApp.firstWindow({ timeout: 90_000 });
  publishOwnership({ page });
  installCspSafePlaywrightPolling(page);
  const canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  // Publish the page and its single lifecycle tracker as soon as they exist. If canonical
  // acquisition fails, the caller can still close the exact window and stop the exact tracker.
  publishOwnership({
    page,
    canonicalUrlTracker,
  });
  await pageIssueTracker.bindAndBackfillPage(page);
  const rootUrl = assertIsolatedElectronRootUrl(
    await canonicalUrlTracker.waitForCanonicalRoot(10_000),
  );
  // The initial BrowserWindow.loadURL() is still owned by Electron main when firstWindow()
  // resolves. Publish its exact listener before any later setup can fail, then wait for the full
  // initial load to settle before an instrumentation reload is allowed to begin.
  publishOwnership({
    page,
    canonicalUrlTracker,
    rootUrl,
  });
  await awaitElectronInitialCanonicalLoad(page, electronApp, rootUrl);
  if (enableTier1Counters) {
    // Electron creates its first page as part of app startup, before Playwright can install an init
    // script. Reload the same canonical route once inside the same owned runtime after arming the
    // install-on-boot counter flag. This does not spend another runtime launch or change its URL.
    await reloadElectronWithTier1Counters(page, pageIssueTracker);
  }
  return {
    electronApp,
    processMonitor,
    childProcess,
    pageIssueTracker,
    page,
    canonicalUrlTracker,
    rootUrl,
    isolatedLaunch,
    runtimeProvisioning,
  };
}

export async function awaitElectronInitialCanonicalLoad(
  page,
  electronApp,
  rootUrl,
  { timeoutMs = 90_000 } = {},
) {
  assert(page && typeof page.waitForLoadState === 'function',
    'Electron initial-load ownership requires a page load-state seam');
  assert(electronApp && typeof electronApp.browserWindow === 'function',
    'Electron initial-load ownership requires a page-bound BrowserWindow seam');
  assertIsolatedElectronRootUrl(rootUrl);
  await page.waitForLoadState('load', { timeout: timeoutMs });
  // BrowserWindow.loadURL() resolves in Electron main after did-finish-load. Crossing one main-loop
  // turn makes that promise settlement an explicit prerequisite rather than racing it from the
  // Playwright renderer connection returned by firstWindow(). Resolve the BrowserWindow from that
  // exact page rather than accepting an unrelated same-root sibling, and always release the handle.
  const browserWindow = await electronApp.browserWindow(page);
  let observation;
  try {
    observation = await browserWindow.evaluate(async (win, expectedRootUrl) => {
      await new Promise((resolve) => setImmediate(resolve));
      return {
        url: win.webContents.getURL(),
        loadingMainFrame: win.webContents.isLoadingMainFrame(),
      };
    }, rootUrl);
  } finally {
    await browserWindow.dispose();
  }
  assert(observation, 'Electron initial canonical BrowserWindow disappeared before Tier-1 reload');
  assert.equal(observation.loadingMainFrame, false,
    'Electron initial canonical BrowserWindow was still loading before Tier-1 reload');
  assert.deepEqual(
    inspectCanonicalRootUrl(observation.url, rootUrl).failures,
    [],
    'Electron main-process window left its canonical root before Tier-1 reload',
  );
  assert.deepEqual(
    inspectCanonicalRootUrl(page.url(), rootUrl).failures,
    [],
    'Electron Playwright page left its canonical root before Tier-1 reload',
  );
  return observation;
}

export async function installTier1CountersInitScript(target) {
  assert(target && typeof target.addInitScript === 'function', 'Tier-1 counters require an init-script seam');
  await target.addInitScript(() => {
    Object.defineProperty(globalThis, '__SPACEFACE_PERF_COUNTERS__', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  });
}

// GL_INVALID_VALUE storms name no caller: Chrome reports the context id and the API, never the JS
// frame that issued the query. Dead-handle getProgramParameter calls are a known failure class here
// (compileAsync's uncancellable 10 ms poll, retire polls on force-lost preview contexts), so the
// soak arms a writer trap — same pattern as __M6_POS_TRAP_EVENTS__ — that records the stack of every
// program-parameter query the driver answered with null — the same condition the decoder reports as
// GL_INVALID_VALUE "Program object expected" (a JS-binding-level isProgram check is unsound: stale
// post-restore wrappers still belong to the context object and can pass it). The trap is read-only:
// it never filters, throws, or alters the return value, so product behaviour is untouched and the
// captured stacks travel with the evidence when warnings fail validation.
export async function installGlProgramQueryTrap(target) {
  assert(target && typeof target.addInitScript === 'function', 'program-query trap requires an init-script seam');
  await target.addInitScript(() => {
    const queries = [];
    const seen = new Map();
    const wrap = (proto, ctxKind) => {
      if (!proto || typeof proto.getProgramParameter !== 'function') return;
      const original = proto.getProgramParameter;
      if (original.__sfProgramQueryTrap === true) return;
      const wrapped = function (program, pname) {
        const result = original.call(this, program, pname);
        // The driver-level verdict is the only version-proof predicate: the JS binding accepts
        // stale wrappers that "belong" to this context object (post-restore pre-loss handles) and
        // forwards them to the decoder, which answers GL_INVALID_VALUE "Program object expected"
        // and returns null. isProgram() is unreliable here — it can still answer true for those
        // wrappers, which is how the earlier isProgram-based trap observed a 256-warning storm as
        // zero bad queries. A live same-context program never returns null for a valid pname.
        if (result === null) {
          try {
            const stack = (new Error('sf-program-query-trap')).stack || '';
            const key = stack.split('\n').slice(2, 8).join('|');
            const existing = seen.get(key);
            if (existing != null) {
              queries[existing].count += 1;
            } else if (queries.length < 64) {
              seen.set(key, queries.length);
              queries.push({
                count: 1,
                ctx: ctxKind,
                pname: Number(pname),
                isProgram: typeof this.isProgram === 'function' ? this.isProgram(program) : null,
                lost: typeof this.isContextLost === 'function' ? this.isContextLost() === true : null,
                at: Math.round(performance.now()),
                stack: stack.slice(0, 3000),
              });
            }
          } catch (_) { /* trap bookkeeping must never break the queried path */ }
        }
        return result;
      };
      wrapped.__sfProgramQueryTrap = true;
      proto.getProgramParameter = wrapped;
    };
    try {
      wrap(globalThis.WebGL2RenderingContext && globalThis.WebGL2RenderingContext.prototype, 'webgl2');
      wrap(globalThis.WebGLRenderingContext && globalThis.WebGLRenderingContext.prototype, 'webgl1');
    } catch (_) { /* prototypes may be locked down; the trap simply stays disarmed */ }
    Object.defineProperty(globalThis, '__SF_PROGRAM_QUERY_TRAP__', {
      value: queries,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  });
}

export async function readGlProgramQueryTrap(page) {
  try {
    return await page.evaluate(() => (
      Array.isArray(globalThis.__SF_PROGRAM_QUERY_TRAP__)
        ? globalThis.__SF_PROGRAM_QUERY_TRAP__.slice()
        : []
    ));
  } catch (_) {
    return [];
  }
}

// Dead-handle delete trap: `delete: object does not belong to this context` names the API
// but never the JS frame. A non-null handle that fails its own isX() check is dead or
// foreign — the same condition the decoder reports — so record the stack. Read-only like
// the query trap: it never filters, throws, or alters the delete itself.
export async function installGlDeleteTrap(target) {
  assert(target && typeof target.addInitScript === 'function', 'gl-delete trap requires an init-script seam');
  await target.addInitScript(() => {
    const deletes = [];
    const seen = new Map();
    const pairs = [
      ['deleteTexture', 'isTexture'], ['deleteBuffer', 'isBuffer'],
      ['deleteProgram', 'isProgram'], ['deleteShader', 'isShader'],
      ['deleteFramebuffer', 'isFramebuffer'], ['deleteRenderbuffer', 'isRenderbuffer'],
      ['deleteVertexArray', 'isVertexArray'],
    ];
    const wrap = (proto) => {
      if (!proto) return;
      for (const [del, is] of pairs) {
        if (typeof proto[del] !== 'function') continue;
        const original = proto[del];
        if (original.__sfGlDeleteTrap === true) continue;
        const wrapped = function (handle) {
          if (handle != null && typeof this[is] === 'function') {
            let alive = false;
            try { alive = this[is](handle) === true; } catch (_) { alive = false; }
            if (!alive) {
              try {
                const stack = (new Error('sf-gl-delete-trap')).stack || '';
                const key = `${del}|${stack.split('\n').slice(2, 8).join('|')}`;
                const existing = seen.get(key);
                if (existing != null) {
                  deletes[existing].count += 1;
                } else if (deletes.length < 64) {
                  seen.set(key, deletes.length);
                  deletes.push({
                    count: 1,
                    api: del,
                    lost: typeof this.isContextLost === 'function' ? this.isContextLost() === true : null,
                    at: Math.round(performance.now()),
                    stack: stack.slice(0, 3000),
                  });
                }
              } catch (_) { /* trap bookkeeping must never break the delete path */ }
            }
          }
          return original.call(this, handle);
        };
        wrapped.__sfGlDeleteTrap = true;
        proto[del] = wrapped;
      }
    };
    try {
      wrap(globalThis.WebGL2RenderingContext && globalThis.WebGL2RenderingContext.prototype);
      wrap(globalThis.WebGLRenderingContext && globalThis.WebGLRenderingContext.prototype);
    } catch (_) { /* prototypes may be locked down; the trap simply stays disarmed */ }
    Object.defineProperty(globalThis, '__SF_GL_DELETE_TRAP__', {
      value: deletes,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  });
}

export async function readGlDeleteTrap(page) {
  try {
    return await page.evaluate(() => (
      Array.isArray(globalThis.__SF_GL_DELETE_TRAP__)
        ? globalThis.__SF_GL_DELETE_TRAP__.slice()
        : []
    ));
  } catch (_) {
    return [];
  }
}

export async function assertTier1CountersBooted(page, { timeoutMs = 30_000, phase = 'boot' } = {}) {
  assert(page && typeof page.waitForFunction === 'function' && typeof page.evaluate === 'function',
    'Tier-1 counters require a page readiness seam');
  // Wait only for the runtime API to exist. If it exists but is disabled or owned by the wrong
  // state, waiting longer cannot heal it and merely burns the full route timeout.
  await page.waitForFunction(() => (
    typeof globalThis.__SPACEFACE_PERF__?.tier1?.isEnabled === 'function'
  ), null, { timeout: timeoutMs });
  const status = await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__SPACEFACE_PERF_COUNTERS__');
    return {
      flag: descriptor ? {
        value: descriptor.value,
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        writable: descriptor.writable,
      } : null,
      enabled: globalThis.__SPACEFACE_PERF__?.tier1?.isEnabled?.() === true,
    };
  });
  assert.deepEqual(status.flag, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  }, `Tier-1 ${phase} lost its immutable install-on-boot authority`);
  assert.equal(status.enabled, true, `Tier-1 ${phase} counter sink exists but is not enabled`);
  return status;
}

export async function reloadElectronWithTier1Counters(page, pageIssueTracker, { timeoutMs = 90_000 } = {}) {
  assert(pageIssueTracker
    && typeof pageIssueTracker.beginExpectedNavigation === 'function'
    && typeof pageIssueTracker.endExpectedNavigation === 'function',
  'Tier-1 Electron reload requires expected-navigation ownership');
  // Installing an init script is not navigation. Arm expected-cancellation authority only for the
  // exact reload so unrelated in-flight requests cannot inherit the waiver if installation fails.
  await installTier1CountersInitScript(page);
  await installGlProgramQueryTrap(page);
  await installGlDeleteTrap(page);
  const navigationToken = pageIssueTracker.beginExpectedNavigation('tier1-counter-install');
  try {
    return await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
  } finally {
    assert.equal(pageIssueTracker.endExpectedNavigation(navigationToken), true,
      'Tier-1 Electron reload must release its expected-navigation token');
  }
}

export async function launchIsolatedElectronApplication(electron, isolatedLaunch) {
  assert(electron && typeof electron.launch === 'function', 'isolated Electron launch requires Playwright Electron');
  assert(isolatedLaunch && isolatedLaunch.options && typeof isolatedLaunch.cleanup === 'function',
    'isolated Electron launch requires an owned profile');
  try {
    return await electron.launch(isolatedLaunch.options);
  } catch (error) {
    // A rejected Playwright launch returned no ElectronApplication owner. Match the canonical
    // lifecycle probe's proof: no runtime handle was published, so the owned profile is idle and
    // may be removed immediately rather than leaking from a failed pre-ownership launch.
    isolatedLaunch.cleanup({ runtimeClosed: true });
    throw error;
  }
}

export function cleanupIsolatedElectronProfile(isolatedLaunch, cleanupReport) {
  if (!isolatedLaunch || !cleanupReport) return false;
  // Profile deletion requires the canonical paired shutdown proof: process exit plus ChildProcess
  // close/stdio drain. Overall acceptance may still fail for route or evidence reasons, and a force
  // close may still provide this exact pair, but one partial lifecycle flag is never sufficient.
  const runtimeClosed = cleanupReport.processExited === true
    && cleanupReport.processCloseConfirmed === true;
  if (!runtimeClosed) return false;
  isolatedLaunch.cleanup({ runtimeClosed: true });
  return true;
}

// A dead cycle must carry the live state that killed it — a waitForFunction timeout alone says
// nothing about whether the world restored, the ship is wedged, or the page froze. Shared by the
// measured-cycle and warmup-cycle failure paths.
async function captureCycleStateDiag(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = (state?.entityList || []).find((e) => e?.id === state.playerId);
    const stations = (state?.entityList || []).filter((e) => e?.type === 'station').map((e) => e?.data?.stationId || e?.id);
    const trail = window.__M6_RELEASE_SOAK_TRAIL__ || [];
    return {
      mode: state?.mode || null,
      sectorId: state?.world?.currentSectorId || null,
      docked: state?.ui?.docked ?? null,
      playerPos: player?.pos ? { x: Number(player.pos.x.toFixed(0)), z: Number(player.pos.z.toFixed(0)) } : null,
      playerVel: player?.vel ? Number(Math.hypot(player.vel.x, player.vel.z).toFixed(1)) : null,
      entityCount: state?.entityList?.length ?? null,
      stations,
      loadedSlot: window.__M6_RELEASE_SOAK_EVENTS__?.loadedSlot ?? null,
      savedSlotWritten: !!localStorage.getItem('sf.save.quick'),
      saveErrors: window.__M6_RELEASE_SOAK_EVENTS__?.errors || [],
      dockInRange: state?.ui?.dockInRange ?? null,
      dockDeny: state?.ui?.dockDeny || null,
      fulfillmentBlackout: state?.ui?.fulfillmentBlackoutActive ?? null,
      boarding: state?.factionPresence?.boarding ? { phase: state.factionPresence.boarding.phase, holdingPos: state.factionPresence.boarding.holdingPos || null } : null,
      dockEvents: window.__M6_RELEASE_SOAK_EVENTS__?.dock || [],
      activeElement: typeof document !== 'undefined' ? (document.activeElement?.tagName + '.' + (document.activeElement?.className || '')).slice(0, 120) : null,
      navAutopilot: state?.nav?.autopilot ? { active: state.nav.autopilot.active, status: state.nav.autopilot.status } : null,
      navWaypoint: state?.nav?.waypoint ? { kind: state.nav.waypoint.kind, label: state.nav.waypoint.label, pos: state.nav.waypoint.pos || null, targetSectorId: state.nav.waypoint.targetSectorId || null } : null,
      navExecutor: state?.nav?.executor ? { status: state.nav.executor.status, engaged: state.nav.executor.engaged === true, legIndex: state.nav.executor.legIndex, destinationSectorId: state.nav.executor.destinationSectorId || null } : null,
      navEvents: (window.__M6_RELEASE_SOAK_EVENTS__?.nav || []).slice(-12),
      jump: state?.jump ? { state: state.jump.state, targetSectorId: state.jump.targetSectorId || null, via: state.jump.via || null } : null,
      bounds: state?.bounds ? { radius: state.bounds.radius, hardRadius: state.bounds.hardRadius, center: state.bounds.center || null } : null,
      frameOrigin: state?.world?.frameOrigin ? { x: state.world.frameOrigin.x, z: state.world.frameOrigin.z, seq: state.world.frameOriginSeq } : null,
      dockingCorridor: state?.dockingCorridor ? { phase: state.dockingCorridor.phase, distToBerth: state.dockingCorridor.distToBerth } : null,
      visibility: typeof document !== 'undefined' ? document.visibilityState : null,
      // Freeze forensics: a dead tick is either a held timeEffects request (timeScale 0)
      // or a suspended/destroyed presentation runner. Capture both so the failure dump
      // names the mechanism instead of just the symptom.
      timeScale: Number.isFinite(state?.timeScale) ? state.timeScale : null,
      accumulator: Number.isFinite(state?.accumulator) ? state.accumulator : null,
      tick: Number.isFinite(state?.tick) ? state.tick : null,
      // ui:pausing-screen is the most common sim-freeze owner: a leftover stack entry or a
      // docked flag that never cleared holds timeScale at 0 while mode reads 'flight'.
      screenStack: Array.isArray(state?.ui?.screenStack) ? [...state.ui.screenStack] : null,
      // Which timeEffects source still holds a request — names the freeze owner directly
      // (ui:pausing-screen, save:restore:<seq>, feel:hit-stop, runtime:loading, ...).
      timeRequests: typeof window.SF?.timeEffects?.describeRequests === 'function'
        ? window.SF.timeEffects.describeRequests() : null,
      runner: (() => {
        const w = window.__SF_WITNESS__;
        const recent = typeof w?.recent === 'function' ? w.recent() : [];
        const s = recent[recent.length - 1] || null;
        const v = typeof w?.verdict === 'function' ? w.verdict() : null;
        // Once the sim quarantines, lastFrameError only repeats "SimulationRunner is closed" —
        // closeCauseMessage retains the registry.step throw that actually tripped it.
        const simDiag = (() => {
          try { return window.SF?.loop?.getDiagnostics?.()?.simulation || null; } catch (_) { return null; }
        })();
        return {
          verdict: v ? { kind: v.kind, headline: v.headline } : null,
          lifecycle: s?.lifecycle ?? null,
          suspended: s?.suspended ?? null,
          documentHidden: s?.documentHidden ?? null,
          executedFrames: s?.executedFrames ?? null,
          renderUpdates: s?.renderUpdates ?? null,
          lastFrameError: s?.lastFrameError ?? null,
          frameErrorCount: s?.frameErrorCount ?? null,
          simClosed: simDiag?.closed ?? null,
          closeCause: simDiag?.closeCauseMessage ?? null,
          closeCauseSite: simDiag?.closeCauseSite ?? null,
        };
      })(),
      saveStartedSnapshot: window.__M6_RELEASE_SOAK_EVENTS__?.saveStartedSnapshot || null,
      trailTail: trail.slice(-60),
      posTrapEvents: (window.__M6_POS_TRAP_EVENTS__ || []).slice(-32),
    };
  });
}

async function runSoakCycle(page, { index, outputDir, log, screenshots = true }) {
  const marks = [];
  const samples = [];
  const mark = (name, detail = {}) => {
    marks.push({ name, at: new Date().toISOString(), ...detail });
    log(`[cycle ${index}] ${name}`);
  };
  const transition = async (name, opts) => setSoakTransition(page, name, opts);

  assert.equal(await isDocked(page), true, `cycle ${index} must start docked`);
  await transition('undock');
  await publicUndockFromStation(page);
  mark('undock');
  await transition(null, { settleMs: 2_500 });

  const beforeInput = await readPlayerSnapshot(page);
  const driveInput = async () => {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(450);
    await page.keyboard.up('KeyW');
    return readPlayerSnapshot(page);
  };
  let afterInput = await driveInput();
  // A suspended presentation (document.hidden) or a transient main-thread stall can starve one
  // 450 ms input window without being a gameplay defect — wait for visibility, then re-drive. The
  // Electron host has no equivalent of the browser's --disable-backgrounding-occluded-windows, so a
  // covering window can throttle its rAF; the sim is still the same sim. Bounded at three attempts:
  // a genuinely frozen sim still fails with the full diag.
  for (let attempt = 0; attempt < 2 && afterInput.tick <= beforeInput.tick; attempt += 1) {
    try {
      await page.waitForFunction(() => document.visibilityState === 'visible', null, { timeout: 10_000 });
    } catch (_) { /* the assert below reports the still-frozen state with the full diag */ }
    await page.waitForTimeout(500);
    afterInput = await driveInput();
  }
  assert(afterInput.tick > beforeInput.tick, 'flight input must advance simulation ticks');
  const movedEnough = (after) => distance(beforeInput.pos, after.pos) > 0.05
    || Math.abs(after.speed - beforeInput.speed) > 0.05;
  // A hull that just left the berth can be facing station structure: full thrust into a wall is
  // zero motion, and no player would call that a defect — they would turn. Re-drive with the public
  // turn key (KeyD = yawRight / contextual strafe) before failing the cycle; a hull that is
  // genuinely stuck inside geometry still fails. Soak cycle 151 (2026-09-19) died here with the
  // hull at 0 WU/s against a station plate, speed 0, berth 11.7 WU, corridor phase 'berthed'.
  for (let retry = 0; retry < 2 && !movedEnough(afterInput); retry += 1) {
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    afterInput = await readPlayerSnapshot(page);
    assert(afterInput.tick > beforeInput.tick, 'flight input must advance simulation ticks');
  }
  assert(movedEnough(afterInput), 'flight input must cause motion');
  mark('flight-input', { before: beforeInput, after: afterInput });
  await sampleDiagnostics(page, samples);

  await armSaveLoadObservers(page);
  await transition('save-write');
  await page.keyboard.press('F5');
  try {
    await page.waitForFunction(() => window.__M6_RELEASE_SOAK_EVENTS__?.saved === true && !!localStorage.getItem('sf.save.quick'), null, { timeout: 20_000 });
  } catch (saveWaitError) {
    const diag = await page.evaluate(() => {
      let storageBytes = 0;
      try { for (let i = 0; i < localStorage.length; i += 1) storageBytes += (localStorage.getItem(localStorage.key(i)) || '').length; } catch { /* ignore */ }
      const state = window.SF?.state;
      return {
        errors: window.__M6_RELEASE_SOAK_EVENTS__?.errors || [],
        startedSnapshotCaptured: !!window.__M6_RELEASE_SOAK_EVENTS__?.saveStartedSnapshot,
        storageBytes,
        mode: state?.mode || null,
        run: state?.run ? { kind: state.run.kind, phase: state.run.phase } : null,
        docked: state?.ui?.docked ?? null,
        playerId: state?.playerId || null,
        hasPlayerEntity: !!(state?.entities?.get?.(state.playerId)),
      };
    }).catch(() => null);
    throw new Error(`quick-save wait timed out: ${JSON.stringify(diag)} (cause: ${saveWaitError?.message || saveWaitError})`);
  }
  await transition(null);
  const saved = await page.evaluate(() => window.__M6_RELEASE_SOAK_EVENTS__?.saveStartedSnapshot || null);
  assert(saved?.pos, 'save:started observer must capture the exact serialized player pose');
  assert(saved?.economy, 'save:started observer must capture the serialized economy state');
  const saveCompletedPose = await readPlayerSnapshot(page);
  const savedStorage = await page.evaluate(() => ({ bytes: localStorage.getItem('sf.save.quick')?.length || 0, slot: window.SF?.state?.save?.currentSlot || null }));
  assert(savedStorage.bytes > 100, 'quick-save payload was not persisted');
  mark('save-written', { ...savedStorage, saved, saveCompletedPose, completionAdvanceDistance: distance(saved.pos, saveCompletedPose.pos) });

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(650);
  await page.keyboard.up('KeyW');
  const diverged = await readPlayerSnapshot(page);
  assert(distance(saved.pos, diverged.pos) > 0.05 || Math.abs(saved.speed - diverged.speed) > 0.05, 'post-save state must diverge before load');
  await transition('load-restore');
  await page.keyboard.press('F9');
  // The loaded-game visual gate legitimately owns up to ~180s of authored-visual staging on a
  // contended host (the app's own bound); a restore that outlives a 90s wait is slow, not
  // broken. A genuine wedge still surfaces early: a timed-out gate fails to mode 'menu' via
  // failGameStart, which this predicate never satisfies either way.
  await page.waitForFunction(() => window.__M6_RELEASE_SOAK_EVENTS__?.loaded === true && window.SF?.state?.mode === 'flight', null, { timeout: 210_000 });
  const loaded = await readPlayerSnapshot(page);
  const loadedAtEvent = await page.evaluate(() => window.__M6_RELEASE_SOAK_EVENTS__?.loadedSnapshot || null);
  const loadedSlot = await page.evaluate(() => window.__M6_RELEASE_SOAK_EVENTS__?.loadedSlot || null);
  assert(loadedAtEvent?.pos, 'save:loaded observer must capture the exact restored player pose');
  // F9 resolves 'latest' — a docking-triggered chunked autosave can land between the quick
  // save and the quick load, and the public load then legitimately restores the autosave.
  // The honest invariant is restore fidelity against the envelope that was actually loaded,
  // not the quick slot specifically.
  const loadedEnvelope = await page.evaluate((slot) => {
    const raw = slot ? localStorage.getItem('sf.save.' + slot) : null;
    if (!raw) return null;
    try {
      const env = JSON.parse(raw);
      const player = env?.data?.entities?.player;
      const items = env?.data?.cargo?.items || {};
      return {
        pos: player?.pos ? { x: Number(player.pos.x), z: Number(player.pos.z) } : null,
        speed: Math.hypot(Number(player?.vel?.x || 0), Number(player?.vel?.z || 0)),
        economy: {
          credits: Number(env?.data?.player?.credits),
          cargoItems: Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b))),
        },
      };
    } catch { return null; }
  }, loadedSlot);
  const restoreReference = loadedSlot === 'quick' ? saved : loadedEnvelope;
  assert(restoreReference?.pos, `loaded slot envelope must carry the restored pose (slot ${loadedSlot || 'unknown'})`);
  const loadedEconomy = await readEconomySnapshot(page);
  const divergedDistance = distance(saved.pos, diverged.pos);
  const restoredDistance = distance(restoreReference.pos, loadedAtEvent.pos);
  const postLoadAdvanceDistance = distance(loadedAtEvent.pos, loaded.pos);
  mark('load-observed', { saved, loadedSlot, diverged, loadedAtEvent, loaded, divergedDistance, restoredDistance, postLoadAdvanceDistance });
  assert(
    restoredDistance <= (loadedSlot === 'quick' ? Math.max(1, divergedDistance * 0.25) : 1),
    `load position restore exceeded tolerance: ${JSON.stringify({ loadedSlot, restoredDistance, divergedDistance, saved, diverged, loaded })}`,
  );
  assert(Math.abs(restoreReference.speed - loadedAtEvent.speed) <= 2, `load speed restore exceeded tolerance: ${restoreReference.speed} -> ${loadedAtEvent.speed}`);
  mark('load-restored', { saved, loadedSlot, diverged, loadedAtEvent, loaded, postLoadAdvanceDistance });
  // The honest roundtrip check: live economy at the save:loaded event instant must equal
  // the envelope that was loaded. The later readEconomySnapshot stays diagnostic-only —
  // gameplay keeps running after restore and can legitimately grant cargo before it.
  assert.deepEqual(loadedAtEvent.economy, restoreReference.economy, `credits and cargo must round-trip exactly through save/load (slot ${loadedSlot || 'unknown'})`);
  const postEventDrift = { credits: loadedEconomy.credits - loadedAtEvent.economy.credits, cargoDelta: Object.keys(loadedEconomy.cargoItems).filter((k) => loadedEconomy.cargoItems[k] !== loadedAtEvent.economy.cargoItems[k]).map((k) => `${k}:${loadedAtEvent.economy.cargoItems[k] || 0}->${loadedEconomy.cargoItems[k]}`) };
  if (postEventDrift.credits !== 0 || postEventDrift.cargoDelta.length) mark('post-load-economy-drift', postEventDrift);
  mark('economy-restored', { credits: loadedEconomy.credits, cargoKinds: Object.keys(loadedEconomy.cargoItems).length });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    return state?.mode === 'flight'
      && player?.mesh?.userData?.authoredAssetState === 'authored'
      && state.entityList.some((entity) => entity?.type === 'station' && entity?.data?.stationId === 'station_helios');
  }, null, { timeout: 90_000 });
  mark('loaded-world-ready');
  await transition(null, { settleMs: 3_000 });
  await sampleDiagnostics(page, samples);

  const dockPrompt = page.locator('.sf-alert--dock');
  // A restored save can already be physically inside Helios' docking envelope. In that case
  // reopening the map is redundant and can race the live flight screen replacing the cached
  // map detail panel. Worse, a ship already on the berth resolves the station's primary action
  // as 'RETURN TO SHIP' rather than 'Set Waypoint', so the arm click has no emit to witness.
  // Exercise the public waypoint route only when navigation is actually needed.
  const alreadyAtDockPrompt = await dockPrompt.isVisible().catch(() => false);
  const insideDockEnvelope = !alreadyAtDockPrompt && await page.evaluate(() => {
    const dc = window.SF?.state?.dockingCorridor;
    return !!(dc && (dc.inCapture === true || (Number.isFinite(dc.distToBerth) && dc.distToBerth <= 60)));
  }).catch(() => false);
  if (alreadyAtDockPrompt || insideDockEnvelope) {
    mark(alreadyAtDockPrompt ? 'redock-already-in-range' : 'redock-already-in-envelope');
  } else {
    await transition('waypoint');
    await armHeliosWaypoint(page, { log });
    // 'Set Waypoint' must arm the local autopilot; if the click missed, the ship drifts
    // on restored velocity and can wedge inside the station silhouette with no prompt.
    const navArmed = await page.waitForFunction(() => {
      const nav = window.SF?.state?.nav;
      // Transition evidence only — 'arrived' status and a persisted waypoint can
      // both be stale survivors of the previous cycle's approach, and the waypoint
      // can be retired after an instant arm→arrive, so neither a bare status read
      // nor waypoint!=null proves THIS arm landed. The nav tap's armed event is
      // the witness: it was emitted synchronously when the click ran setCourse.
      const mark = window.__M6_NAV_MARK__ || 0;
      const events = window.__M6_RELEASE_SOAK_EVENTS__?.nav || [];
      const freshArmed = events.some((e) => e.seq > mark && e.status === 'armed' && /Helios Station/i.test(String(e.label || '')));
      if (nav?.autopilot?.active === true) return true;
      // A fresh arm that already arrived leaves the ship at the berth — the dock
      // prompt path owns the rest. A fresh arm with a live waypoint still drives.
      return freshArmed && (nav?.autopilot?.status === 'arrived' || nav?.waypoint != null);
    }, null, { timeout: 8_000 }).then(() => true).catch(() => false);
    assert(navArmed, 'redock waypoint did not arm nav.waypoint/autopilot — the ship would drift unpowered');
    mark('redock-waypoint');
    await transition(null, { settleMs: 1_500 });
  }
  const readDockDiag = () => page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    const dc = state?.dockingCorridor || null;
    return {
      pos: player?.pos ? { x: Number(player.pos.x.toFixed(1)), z: Number(player.pos.z.toFixed(1)) } : null,
      speed: player?.vel ? Number(Math.hypot(player.vel.x, player.vel.z).toFixed(1)) : null,
      autopilot: state?.nav?.autopilot ? { active: state.nav.autopilot.active, status: state.nav.autopilot.status, label: state.nav.autopilot.label } : null,
      waypoint: state?.nav?.waypoint ? { kind: state.nav.waypoint.kind, label: state.nav.waypoint.label } : null,
      corridor: dc ? { phase: dc.phase, distToBerth: dc.distToBerth, distCenter: dc.distCenter, inCorridor: dc.inCorridor, inCapture: dc.inCapture, headingOk: dc.headingOk } : null,
      sectorId: state?.world?.currentSectorId || null,
      trail: (window.__M6_RELEASE_SOAK_TRAIL__ || []).slice(-40),
      posTrapEvents: (window.__M6_POS_TRAP_EVENTS__ || []).slice(-16),
    };
  }).catch(() => null);
  // A hull-vs-lawful collision inside a protected ring opens a player_assault incident and
  // patrols keep knocking the ship off the berth — the dock prompt can never convert while
  // flagged. Read the incident the sector-law card is presenting (observer only).
  const readLawFlag = () => page.evaluate(() => {
    const state = window.SF?.state;
    const incidents = state?.lawSecurity?.incidents;
    if (!incidents || typeof incidents !== 'object') return null;
    const inc = Object.values(incidents).find((i) => i
      && String(i.attackerId) === String(state.playerId)
      && i.status !== 'resolved');
    if (!inc) return null;
    const findStation = () => {
      if (inc.stationEntityId != null) return state.entities?.get?.(inc.stationEntityId) || null;
      return state.entityList?.find((e) => e?.type === 'station' && (e?.data?.stationId === inc.stationId || e?.stationId === inc.stationId)) || null;
    };
    const station = findStation();
    const victim = inc.victimId != null ? state.entities?.get?.(inc.victimId) : null;
    return {
      status: inc.status || null,
      cause: inc.cause || null,
      radius: Number.isFinite(inc.radius) ? inc.radius : 1400,
      stationPos: station?.pos ? { x: station.pos.x, z: station.pos.z } : null,
      victimPos: victim?.pos ? { x: victim.pos.x, z: victim.pos.z } : null,
      heat: Number.isFinite(state.player?.heat) ? state.player.heat : null,
    };
  }).catch(() => null);
  // Player-faithful break-contact: course out of the ring (the public ui:setCourse channel —
  // the map cannot target open space), hold past the clearance radius until the incident
  // disengages, then the caller re-arms Helios. A flag that never clears (e.g. WANTED heat
  // blocks 'disengaged') fails the cycle with the incident state on record.
  const disengageLawFlag = async (law) => {
    const escapePoint = await page.evaluate((l) => {
      const s = window.SF?.state;
      const p = s?.entities?.get?.(s.playerId);
      const origin = l?.victimPos || l?.stationPos || (p?.pos ? { x: p.pos.x, z: p.pos.z } : { x: 0, z: 0 });
      let dx = (p?.pos?.x ?? origin.x + 1) - origin.x;
      let dz = (p?.pos?.z ?? origin.z) - origin.z;
      const len = Math.hypot(dx, dz);
      if (len < 1) { dx = 1; dz = 0; } else { dx /= len; dz /= len; }
      const dist = Math.max(800, (l?.radius || 1400) + 700);
      return { x: origin.x + dx * dist, z: origin.z + dz * dist };
    }, law);
    await page.evaluate((point) => {
      (window.SF?.bus || window.SF?.ctx?.bus)?.emit('ui:setCourse', {
        pos: { x: point.x, z: point.z },
        label: 'Break contact',
        waypointKind: 'local',
        autopilot: true,
      });
    }, escapePoint);
    return page.waitForFunction(() => {
      const s = window.SF?.state;
      return !Object.values(s?.lawSecurity?.incidents || {}).some((i) => i
        && String(i.attackerId) === String(s.playerId)
        && i.status !== 'resolved');
    }, null, { timeout: 150_000 }).then(() => true).catch(() => false);
  };
  // Bounded approach loop. A still-driving autopilot can hold the ship in a tangential limit
  // cycle inside the capture volume, and a berth arrival can end with the compound proxy
  // expelling the ship back out at speed (dock:range flickers true→false) — a player whose
  // autopilot can't park takes the brake, and a player bounced off the berth flies back in and
  // tries again. The dock press lives inside the same budget: a ship that sails through the
  // envelope faster than the E tap can land gets another approach, not a terminal assert.
  let docked = false;
  let sawDockPrompt = false;
  let lawFlees = 0;
  const attemptDiags = [];
  for (let attempt = 0; attempt < 3 && !docked; attempt++) {
    if (attempt > 0) {
      const idleDiag = await readDockDiag();
      attemptDiags.push(idleDiag);
      const promptUp = await dockPrompt.isVisible().catch(() => false);
      // Only a player would re-issue the command — a still-driving AP gets the wait window,
      // not a re-arm fight for the ship. A live prompt needs the E press below, not motion.
      if (!promptUp && idleDiag?.autopilot?.active !== true) {
        const distToBerth = idleDiag?.corridor?.distToBerth;
        if (Number.isFinite(distToBerth) && distToBerth <= 60) {
          // Already inside the dock envelope: re-plotting a waypoint to the station the ship is
          // parked next to resolves RETURN TO SHIP, not a course — the Set Waypoint click has no
          // emit to witness (same hazard the insideDockEnvelope guard above avoids). A ship
          // carrying residual speed into the envelope can wedge on the proxy wall short of the
          // dock radius: the capture assist only re-engages once speed is under the gate, and a
          // W nudge just drives the hull deeper into the wedge. The player recovery is to brake
          // first so the assist's proportional pull can slide the ship to the berth, then nudge.
          const wedged = idleDiag?.speed > 4;
          mark(wedged ? 'redock-brake' : 'redock-nudge', idleDiag);
          if (wedged) {
            try {
              await page.keyboard.down('Digit0');
              await page.waitForTimeout(900);
            } finally {
              await page.keyboard.up('Digit0').catch(() => {});
            }
          }
          try {
            await page.keyboard.down('KeyW');
            await page.waitForTimeout(wedged ? 400 : 900);
          } finally {
            await page.keyboard.up('KeyW').catch(() => {});
          }
        } else {
          mark('redock-rearm', idleDiag);
          await armHeliosWaypoint(page, { log });
        }
      }
    }
    let dockPromptVisible = false;
    let waitDeadline = Date.now() + 60_000;
    let brakePulsed = false;
    while (Date.now() < waitDeadline) {
      dockPromptVisible = await dockPrompt.isVisible().catch(() => false);
      if (dockPromptVisible) break;
      if (lawFlees < 2) {
        const law = await readLawFlag();
        if (law) {
          lawFlees += 1;
          mark('dock-law-disengage', { law });
          await disengageLawFlag(law);
          // The return leg owns a fresh approach window — the clock restarted
          // when the waypoint back to Helios was armed, not when the flag rose.
          await armHeliosWaypoint(page, { log });
          waitDeadline = Date.now() + 60_000;
          brakePulsed = false;
          continue;
        }
      }
      if (!brakePulsed) {
        const stuckFast = await page.evaluate(() => {
          const s = window.SF?.state;
          const dc = s?.dockingCorridor;
          const p = s?.entities?.get?.(s.playerId);
          const v = p?.vel ? Math.hypot(p.vel.x, p.vel.z) : 0;
          if (!dc) return false;
          if ((dc.inCapture === true || dc.inCorridor === true)
              && s?.nav?.autopilot?.active === true && v > 26) return true;
          // Restored save already inside the dock envelope with no AP driving: a player
          // drifting across the berth too fast for the gate brakes down to it. The AP-active
          // case stays above — never disengage a driving approach from outside.
          return s?.nav?.autopilot?.active !== true
            && (dc.inCapture === true || (Number.isFinite(dc.distToBerth) && dc.distToBerth <= 60))
            && v > 12;
        }).catch(() => false);
        if (stuckFast) {
          brakePulsed = true;
          mark('dock-corridor-brake');
          try {
            await page.keyboard.down('Digit0');
            await page.waitForTimeout(900);
          } finally {
            await page.keyboard.up('Digit0').catch(() => {});
          }
        }
      }
      await page.waitForTimeout(250);
    }
    if (!dockPromptVisible) continue;
    sawDockPrompt = true;
    // Docking is a player-initiated loading span (station interior mount) — tag it like
    // save/load so the gameplay-hitch count stays honest about steady-state frames.
    await transition('dock-mount');
    // The berth prompt gates on proximity AND a speed gate; a still-driving autopilot can
    // carry the ship back out between the prompt wait and the key tap. Pulse the public
    // brake to disengage it and shed speed, then release so the corridor capture assist
    // (suppressed while any input is held) can pull an edge-parked ship back onto the berth.
    try {
      await page.keyboard.down('Digit0');
      await page.waitForTimeout(900);
    } finally {
      await page.keyboard.up('Digit0').catch(() => {});
    }
    await page.keyboard.press('KeyE');
    docked = await page.waitForFunction(() => window.SF?.state?.ui?.docked === true, null, { timeout: 20_000 })
      .then(() => true).catch(() => false);
    if (!docked && await dockPrompt.isVisible().catch(() => false)) {
      // A player with a live dock prompt and no response presses E again — one bounded
      // retry, then the cycle fails with the gate state already captured upstream.
      mark('dock-key-retry');
      await page.keyboard.press('KeyE');
      docked = await page.waitForFunction(() => window.SF?.state?.ui?.docked === true, null, { timeout: 15_000 })
        .then(() => true).catch(() => false);
    }
    // The ship sailed through the envelope (or the gate denied the press) — the next
    // iteration's diag decides between re-arm and in-envelope nudge, like a player
    // braking off a missed approach and flying back in.
    if (!docked) mark('dock-sailed-through', await readDockDiag());
  }
  if (!docked) {
    const diag = await readDockDiag();
    throw new Error(
      `${sawDockPrompt ? 'dock key did not dock within the retry window' : 'dock prompt never appeared'}: ${JSON.stringify({ attempts: attemptDiags, final: diag })}`,
    );
  }
  await page.locator('[data-screen="station"]').waitFor({ state: 'visible', timeout: 20_000 });
  mark('docked');

  const marketTab = page.locator('[role="tab"]', { hasText: /market/i }).first();
  await marketTab.waitFor({ state: 'visible', timeout: 20_000 });
  await transition('market');
  await marketTab.click();
  mark('market-opened');
  await page.waitForTimeout(500);
  const trade = await exerciseMarketRoundtrip(page);
  mark('trade-roundtrip', trade);
  await transition(null, { settleMs: 1_500 });
  await sampleDiagnostics(page, samples);
  // Per-cycle screenshots stall rAF for seconds on integrated GPUs (Playwright
  // readback is measurement apparatus, not game work). Pause the hitch register
  // around the readback so the stall is never billed to the game; floors runs
  // additionally pass cycleScreenshots=false so the register sees game frames only.
  let screenshot = null;
  if (screenshots !== false) {
    screenshot = `cycle-${String(index + 1).padStart(2, '0')}-market.png`;
    await setSoakPaused(page, true);
    try {
      await page.screenshot({ path: path.join(outputDir, screenshot), type: 'png', animations: 'disabled' });
    } finally {
      await setSoakPaused(page, false);
    }
  }

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

  // The active Orbital Command shell turns an implicit E exit into its visible Departure Check.
  // Complete that public confirmation when present. Keep the structural Undock routes below for
  // ready-state pointer recovery and the compatibility station shell; never inject dock state.
  const departureLaunch = page.locator('button[data-pop-launch]')
    .and(page.getByRole('button', { name: /\blaunch\b/i }));
  if (await departureLaunch.isVisible().catch(() => false)) {
    await departureLaunch.click();
  } else {
    const activeUndock = page.locator('button[data-act="undock"]')
      .and(page.getByRole('button', { name: /\bundock\b/i }));
    const legacyUndock = page.locator('button.st-undock')
      .and(page.getByRole('button', { name: /\bundock\b/i }));
    const legacyModalConfirm = page.locator('button.sf-confirm__ok')
      .and(page.getByRole('button', { name: /\bundock\b/i }));
    const candidates = [legacyModalConfirm, activeUndock, legacyUndock];
    let clicked = false;
    for (const candidate of candidates) {
      if (!await candidate.isVisible().catch(() => false)) continue;
      await candidate.click();
      clicked = true;
      break;
    }
    assert.equal(clicked, true, 'station recovery requires a visible public Departure Check or Undock action');

    // A risk/check Undock action may open Departure Check instead of committing immediately —
    // or commit with latency (soak cycle 186: the undock landed >1.5 s post-click and the 5 s
    // Launch-button wait raced the transition). Wait for whichever resolves first: the check's
    // Launch button can never appear once the hull has already left the berth.
    const leftAfterUndockAction = await page.waitForFunction(
      () => window.SF?.state?.ui?.docked === false,
      null,
      { timeout: 1_500 },
    ).then(() => true).catch(() => false);
    if (!leftAfterUndockAction) {
      const left = page.waitForFunction(() => window.SF?.state?.ui?.docked === false, null, { timeout: 20_000 })
        .then(() => 'left').catch(() => null);
      const launch = departureLaunch.waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => 'launch').catch(() => null);
      if ((await Promise.race([left, launch])) === 'launch') {
        await departureLaunch.click();
      }
    }
  }
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === false, null, { timeout: 20_000 });
}

async function armSaveLoadObservers(page) {
  await page.evaluate(() => {
    window.__M6_RELEASE_SOAK_EVENTS__ = {
      saved: false,
      loaded: false,
      saveStartedSnapshot: null,
      loadedSnapshot: null,
      loadedSlot: null,
      errors: [],
      dock: [],
    };
    // Persistent error tap (installed once): a save that fails never emits
    // save:completed, so the cycle's wait would otherwise time out with no
    // recorded reason.
    if (!window.__M6_RELEASE_SOAK_ERROR_TAP__) {
      window.__M6_RELEASE_SOAK_ERROR_TAP__ = true;
      window.SF.bus.on('save:error', (payload) => {
        const ev = window.__M6_RELEASE_SOAK_EVENTS__;
        if (ev && ev.errors.length < 32) ev.errors.push({ slot: payload?.slot, reason: payload?.reason || payload?.failure || 'unknown', ok: payload?.ok });
      });
      // Dock seam taps: a berthed ship that refuses E is only diagnosable if the attempt
      // and any denial were seen on the bus. The register is re-created each cycle, so the
      // array is created lazily here.
      const pushDock = (entry) => {
        const ev = window.__M6_RELEASE_SOAK_EVENTS__;
        if (!ev) return;
        if (!Array.isArray(ev.dock)) ev.dock = [];
        if (ev.dock.length < 32) ev.dock.push(entry);
      };
      // Nav arm tap: _onSetCourse emits nav:autopilot {status:'armed'} synchronously when a
      // waypoint click lands. When the ship is already inside the arrival radius the whole
      // arm->arrive round-trip completes inside one sim tick, so post-click nav state can be
      // indistinguishable from a missed click (status 'arrived' survives; the waypoint can be
      // retired by corridor/mission cleanup). The event stream is the only honest witness —
      // entries carry a monotonic seq so a pre-click mark survives the ring splice.
      window.__M6_NAV_SEQ__ = window.__M6_NAV_SEQ__ || 0;
      window.SF.bus.on('nav:autopilot', (p) => {
        const seq = ++window.__M6_NAV_SEQ__;
        const ev = window.__M6_RELEASE_SOAK_EVENTS__;
        if (!ev) return;
        if (!Array.isArray(ev.nav)) ev.nav = [];
        if (ev.nav.length >= 64) ev.nav.splice(0, 32);
        ev.nav.push({ seq, t: Math.round(performance.now()), status: p?.status || null, active: p?.active === true, label: p?.label || '' });
      });
      window.SF.bus.on('dock:attempt', (p) => pushDock({ kind: 'attempt', stationId: p?.stationId || null }));
      window.SF.bus.on('dock:denied', (p) => pushDock({ kind: 'denied', stationId: p?.stationId || null, reason: p?.reason || null }));
      window.SF.bus.on('dock:range', (p) => pushDock({ kind: 'range', stationId: p?.stationId || null, inRange: !!p?.inRange }));
      // Position/sector trail: a once-observed anomaly restored a clean pose then
      // later read the player at -1.1M in sector_kepler_scar during the dock wait.
      // The FAIL dump only saw the end state; a bounded trail names the tick the
      // position jumped and the jump/executor state that owned it.
      window.__M6_RELEASE_SOAK_TRAIL__ = [];
      // Write-trap on the player entity's pos/vel components. Every far-field
      // excursion theory ends at a writer; this names it. A per-instance accessor
      // shadows the own data property, so all writes (including SimVector3's own
      // set/copy/addScaledVector internals) funnel through it. When a single write
      // moves a pos component by more than POS_JUMP_WU — or a vel component by more
      // than VEL_JUMP_WU_S — the trap records the write AND the caller's stack.
      // Restore replaces the player object each cycle, so the sampler re-arms on
      // whichever pos/vel objects the live entity currently holds.
      window.__M6_POS_TRAP_EVENTS__ = [];
      const POS_JUMP_WU = 300;
      const VEL_JUMP_WU_S = 1500;
      const trapField = (owner, field, threshold, label, state) => {
        if (!owner || typeof owner !== 'object') return;
        const desc = Object.getOwnPropertyDescriptor(owner, field);
        if (!desc || desc.configurable === false) return;
        if (desc.set && desc.get && desc.get.__posTrap === true) return; // already armed
        let backing = Number(desc.value) || 0;
        Object.defineProperty(owner, field, {
          configurable: true,
          enumerable: true,
          get: Object.assign(function trappedGet() { return backing; }, { __posTrap: true }),
          set: function trappedSet(v) {
            const next = Number(v) || 0;
            const delta = next - backing;
            if (Math.abs(delta) > threshold) {
              const events = window.__M6_POS_TRAP_EVENTS__;
              if (events && events.length < 64) {
                const s = state && state();
                events.push({
                  t: Math.round(performance.now()),
                  tick: s ? Number(s.tick) : null,
                  simTime: s ? Number(s.simTime) : null,
                  field: label,
                  from: backing,
                  to: next,
                  mode: s?.mode || null,
                  sector: s?.world?.currentSectorId || null,
                  jump: s?.jump?.state || null,
                  exec: s?.nav?.executor ? `${s.nav.executor.status}:${s.nav.executor.engaged}` : null,
                  ap: s?.nav?.autopilot ? `${s.nav.autopilot.status}:${s.nav.autopilot.active}` : null,
                  stack: (new Error('pos-trap')).stack || null,
                });
              }
            }
            backing = next;
          },
        });
      };
      const armPosTrap = () => {
        const s = window.SF?.state;
        const p = s?.entities?.get?.(s.playerId);
        if (!p) return;
        const getState = () => window.SF?.state;
        for (const f of ['x', 'z']) trapField(p.pos, f, POS_JUMP_WU, `pos.${f}`, getState);
        for (const f of ['x', 'z']) trapField(p.vel, f, VEL_JUMP_WU_S, `vel.${f}`, getState);
      };
      armPosTrap();
      setInterval(() => {
        const trail = window.__M6_RELEASE_SOAK_TRAIL__;
        if (!trail) return;
        if (trail.length >= 4000) trail.splice(0, 2000); // ring: keep the recent half
        const s = window.SF?.state;
        const p = s?.entities?.get?.(s.playerId);
        if (!s || !p || !p.pos) return;
        armPosTrap(); // re-arm: restore/respawn replaces the pos object or the entity
        // Renderer resource counts ride the same 200 ms cadence: a post-plateau
        // geometry/texture/program climb is only diagnosable if the trail can point at the
        // cycle leg (undock / save / load / redock / market) where the count moved.
        const mem = s.render?.renderer?.info?.memory || null;
        trail.push({
          t: Math.round(performance.now()),
          sector: s.world?.currentSectorId || null,
          x: Math.round(p.pos.x), z: Math.round(p.pos.z),
          v: Math.round(Math.hypot(Number(p.vel?.x || 0), Number(p.vel?.z || 0))),
          mode: s.mode,
          jump: s.jump?.state || null,
          jumpTarget: s.jump?.targetSectorId || null,
          exec: s.nav?.executor ? `${s.nav.executor.status}:${s.nav.executor.engaged}` : null,
          ap: s.nav?.autopilot ? `${s.nav.autopilot.status}:${s.nav.autopilot.active}` : null,
          geo: mem?.geometries ?? null,
          tex: mem?.textures ?? null,
          prog: Array.isArray(s.render?.renderer?.info?.programs) ? s.render.renderer.info.programs.length : null,
        });
      }, 200);
    }
    // Autosaves fire on the sim clock every 120 s and will interleave over a long
    // soak; a one-shot observer bound to an autosave would snapshot the wrong write.
    // Handlers re-arm until the manual (non-autosave) event arrives.
    const onSaveStarted = (payload) => {
      if (payload?.autosave === true) { window.SF.bus.once('save:started', onSaveStarted); return; }
      const state = window.SF?.state;
      const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
      const items = state?.player?.cargo?.items || {};
      window.__M6_RELEASE_SOAK_EVENTS__.saveStartedSnapshot = player ? {
        tick: Number(state.tick),
        simTime: Number(state.simTime),
        pos: { x: Number(player.pos.x), z: Number(player.pos.z) },
        speed: Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0)),
        // The economy captured at save:started is what the save actually serializes;
        // comparing load output to a pre-save snapshot races legitimate mid-flight
        // cargo grants (deliveries, resupply) and produces false divergence.
        economy: {
          credits: Number(state?.player?.credits),
          cargoItems: Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b))),
        },
      } : null;
    };
    window.SF.bus.once('save:started', onSaveStarted);
    const onSaveCompleted = (payload) => {
      if (payload?.autosave === true) { window.SF.bus.once('save:completed', onSaveCompleted); return; }
      window.__M6_RELEASE_SOAK_EVENTS__.saved = true;
    };
    window.SF.bus.once('save:completed', onSaveCompleted);
    window.SF.bus.once('save:loaded', (payload) => {
      const state = window.SF?.state;
      const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
      const items = state?.player?.cargo?.items || {};
      window.__M6_RELEASE_SOAK_EVENTS__.loadedSnapshot = player ? {
        tick: Number(state.tick),
        simTime: Number(state.simTime),
        pos: { x: Number(player.pos.x), z: Number(player.pos.z) },
        speed: Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0)),
        // Economy at the event instant — grants that land after restore but before the
        // next probe read (resuming salvage drains, pickups, restore settlements) are
        // legitimate in-flight mutations, not envelope corruption.
        economy: {
          credits: Number(state?.player?.credits),
          cargoItems: Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b))),
        },
      } : null;
      window.__M6_RELEASE_SOAK_EVENTS__.loadedSlot = payload?.slot || null;
      window.__M6_RELEASE_SOAK_EVENTS__.loaded = true;
    });
  });
}

async function armHeliosWaypoint(page, { log = () => {} } = {}) {
  const deadline = Date.now() + 45_000;
  let lastError = null;
  const dockPrompt = page.locator('.sf-alert--dock');
  const readArmDiag = () => page.evaluate(() => {
    const def = window.SF?.ctx?.screenManager?.getActiveScreenDef?.();
    const t = def && def._selectedTarget;
    const btn = document.querySelector('#gm-set-course-btn');
    const rect = btn ? btn.getBoundingClientRect() : null;
    const hit = rect && rect.width > 2 && rect.height > 2 ? (() => {
      const el = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return el ? `${el.tagName}#${el.id || ''}.${String(el.className || '').slice(0, 60)}` : null;
    })() : null;
    const dc = window.SF?.state?.dockingCorridor;
    return {
      mapOpen: !!document.querySelector('#sf-galaxymap'),
      activeDef: def ? (def.id || def.screenId || null) : null,
      selected: t ? { kind: t.kind || null, name: t.name || t.label || null, hasPos: Number.isFinite(t.x) && Number.isFinite(t.z), courseDisabled: t.courseDisabled === true } : null,
      button: btn ? { text: btn.textContent, hidden: btn.hidden, disabled: btn.disabled, coveredBy: hit && !hit.includes('gm-set-course-btn') ? hit : null } : null,
      corridor: dc ? { phase: dc.phase, distToBerth: dc.distToBerth, inCapture: dc.inCapture } : null,
      searchRows: [...document.querySelectorAll('.gm-search-item')].slice(0, 6).map((el) => ({
        name: el.querySelector('.gm-search-item-name')?.textContent?.trim() || null,
        detail: el.querySelector('.gm-search-item-detail')?.textContent?.trim() || null,
      })),
      searchValue: document.querySelector('.gm-search-input')?.value || null,
      activeElement: document.activeElement ? `${document.activeElement.tagName}.${String(document.activeElement.className || '').slice(0, 40)}` : null,
    };
  }).catch((err) => ({ diagError: String(err) }));
  while (Date.now() < deadline) {
    // A ship that drifts back into the berth envelope mid-arm gets a live dock prompt —
    // the caller's dock loop owns that path, so abandon the arm instead of fighting the
    // map for the rest of the budget.
    if (await dockPrompt.isVisible().catch(() => false)) {
      log('arm abandoned: dock prompt appeared mid-arm (ship already at the berth)');
      if (await page.locator('#sf-galaxymap').isVisible().catch(() => false)) {
        // The map's Escape/M/N close only fires when the search input is not holding
        // focus — blur first so the key reaches the screen's own onKey.
        await page.evaluate(() => document.activeElement?.blur?.()).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
        const closed = await page.waitForFunction(() => {
          const screen = document.querySelector('#sf-galaxymap');
          return !screen || screen.hidden || getComputedStyle(screen).display === 'none';
        }, null, { timeout: 5_000 }).then(() => true).catch(() => false);
        if (!closed) await page.keyboard.press('KeyN').catch(() => {});
      }
      return;
    }
    // KeyN toggles the chart — press it only when it is not already open (a failed
    // attempt leaves it open; a successful non-Helios arm can also pop it closed).
    const mapVisible = await page.locator('#sf-galaxymap').isVisible().catch(() => false);
    if (!mapVisible) {
      await page.keyboard.press('KeyN');
      await page.locator('#sf-galaxymap').waitFor({ state: 'visible', timeout: 20_000 });
    }
    await page.keyboard.press('/');
    await page.waitForFunction(() => document.activeElement?.matches('.gm-search-input') === true, null, { timeout: 5_000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Helios Station');
    // Require the STATION-kind row, not just a name match: search rows whose text merely
    // contains "Helios Station" include courseDisabled targets (frontier rumor rings,
    // hidden-cache readouts, goal markers). Selecting one resolves to no course payload and
    // _activateSelectedCourse drops the click silently — zero nav:autopilot events, which
    // is exactly the cycle-12/22 failure signature. The detail line is "KIND · faction".
    const row = page.locator('.gm-search-item', {
      has: page.locator('.gm-search-item-name', { hasText: 'Helios Station' }),
      has: page.locator('.gm-search-item-detail', { hasText: 'STATION' }),
    }).first();
    const rowVisible = await row.waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true).catch(() => false);
    if (!rowVisible) {
      lastError = new Error(`Helios Station search row never appeared: ${JSON.stringify(await readArmDiag())}`);
      continue;
    }
    // Click the named row rather than pressing Enter. _searchSelectedIdx always resolves
    // filtered[0], and results sort by live-state priority — a mission marker or gate
    // matching "Helios" can sit above the station, so Enter arms the wrong target.
    await row.click();
    // Verify the selection actually resolved to the Helios station before clicking the
    // button — _activateSelectedCourse no-ops silently on a null _selectedTarget, and a
    // stray canvas click can clear the selection between row click and button click.
    const selected = await page.evaluate(() => {
      const def = window.SF?.ctx?.screenManager?.getActiveScreenDef?.();
      const target = def && def._selectedTarget;
      return target ? { name: target.name || target.label || '', kind: target.kind || null } : null;
    }).catch(() => null);
    if (!selected || selected.kind !== 'station' || !/Helios/i.test(String(selected.name))) {
      lastError = new Error(`search row selected ${JSON.stringify(selected)} instead of Helios Station: ${JSON.stringify(await readArmDiag())}`);
      continue;
    }
    const button = page.getByRole('button', { name: 'Set Waypoint', exact: true });
    const buttonVisible = await button.waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true).catch(() => false);
    if (!buttonVisible) {
      lastError = new Error(`Set Waypoint never became visible for the selected station: ${JSON.stringify(await readArmDiag())}`);
      continue;
    }
    try {
      await clickWaypointWithPointer(page, button, 6_000);
    } catch (err) {
      lastError = new Error(`${err.message || err} | arm-state: ${JSON.stringify(await readArmDiag())}`);
      continue;
    }
    lastError = null;
    break;
  }
  if (lastError) throw lastError;
  await page.waitForFunction(() => {
    const screen = document.querySelector('#sf-galaxymap');
    const hidden = !screen || screen.hidden || getComputedStyle(screen).display === 'none' || screen.getBoundingClientRect().width < 2;
    return window.SF?.state?.mode === 'flight' && hidden;
  }, null, { timeout: 10_000 });
}

async function clickWaypointWithPointer(page, locator, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastBox = null;
  // arm evidence must be a TRANSITION, not a state: autopilot status/label persist
  // 'arrived'+'Helios Station' from the previous cycle's approach, and an instant
  // arm→arrive (ship already inside the arrival radius) mutates the new autopilot
  // back to identical values within one tick while the waypoint can be retired by
  // corridor/mission cleanup. The synchronous nav:autopilot 'armed' emit is the
  // only witness that survives that round-trip — mark the stream, then require a
  // fresh Helios arm event after the mark.
  await page.evaluate(() => { window.__M6_NAV_MARK__ = window.__M6_NAV_SEQ__ || 0; });
  while (Date.now() < deadline) {
    // Same fix as alphaLiveBaselineRoute.clickWaypointWithPointer: the button is
    // rendered under the chart layer until scrolled into the inspector's clear
    // band; without this the raw pointer click hits the covering screen.
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    lastBox = await locator.boundingBox().catch(() => null);
    if (lastBox && lastBox.width > 2 && lastBox.height > 2) {
      // The action band is a scrollable clip: when the inspector spends its column on
      // tabs/details/legend, the button's laid-out rect can straddle the clip edge and
      // a center click lands on the parity legend below (soak cycle 100). Worse, a focused
      // sibling action keeps the band scrolled to IT — focus-following re-snaps the clip on
      // the next frame and Set Waypoint never paints (cycle 56: coveredBy the inspector
      // itself). Taking focus first makes the browser scroll this button into view and
      // keep it there; then click a point that actually hit-tests to it — where a player
      // would click.
      const point = await page.evaluate(() => {
        const btn = document.querySelector('#gm-set-course-btn');
        if (!btn || btn.hidden || btn.disabled) return null;
        try { btn.focus(); } catch (_) { /* focus is best-effort */ }
        btn.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = btn.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85]) {
          for (const fx of [0.5, 0.3, 0.7]) {
            const x = r.x + r.width * fx;
            const y = r.y + r.height * fy;
            const el = document.elementFromPoint(x, y);
            if (el === btn || btn.contains(el)) return { x: Math.round(x), y: Math.round(y) };
          }
        }
        return null;
      }).catch(() => null);
      if (point) {
        await page.mouse.move(point.x, point.y);
        await page.mouse.down({ button: 'left' });
        await page.mouse.up({ button: 'left' });
      } else {
        // The pointer could not resolve a painted point inside the clip band — activate the
        // focused button with Enter, the public keyboard path for the same control.
        const focused = await page.evaluate(() => document.activeElement?.id === 'gm-set-course-btn').catch(() => false);
        if (focused) await page.keyboard.press('Enter');
      }
      const armed = await page.waitForFunction(() => {
        const autopilot = window.SF?.state?.nav?.autopilot;
        if (/Helios Station/i.test(String(autopilot?.label || '')) && autopilot?.active === true) return true;
        const mark = window.__M6_NAV_MARK__ || 0;
        const events = window.__M6_RELEASE_SOAK_EVENTS__?.nav || [];
        return events.some((e) => e.seq > mark && e.status === 'armed' && /Helios Station/i.test(String(e.label || '')));
      }, null, { timeout: 750 }).then(() => true, () => false);
      if (armed) return;
      // A click that landed on the chart canvas instead of the button clears the map's
      // _selectedTarget — every later click is then an inert no-op. Bail so the caller
      // can re-run the search selection instead of burning the rest of the budget.
      const selectionLost = await page.evaluate(() => {
        const def = window.SF?.ctx?.screenManager?.getActiveScreenDef?.();
        return def != null && def._selectedTarget == null;
      }).catch(() => false);
      if (selectionLost) throw new Error('Set Waypoint click cleared the map selection (canvas hit)');
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Set Waypoint pointer click did not arm autopilot; last box=${JSON.stringify(lastBox)}`);
}

async function reopenMarketTabWhenShellLost(page) {
  // A stray keypress can back the station screen out of the market tab — the trade shell
  // is then absent entirely and every commit dies blind with an all-null diag. Re-open
  // the market tab through the public control; bounded, and the walk's own asserts still
  // report a market that truly will not open.
  for (let attempts = 0; attempts < 3; attempts++) {
    if (await page.locator('.sx-trade:visible').count().catch(() => 0) > 0) return true;
    const marketTab = page.locator('[role="tab"]', { hasText: /market/i }).first();
    if (!(await marketTab.isVisible().catch(() => false))) return false;
    await marketTab.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  return page.locator('.sx-trade:visible').count().catch(() => 0) > 0;
}

async function exerciseMarketRoundtrip(page) {
  await reopenMarketTabWhenShellLost(page);
  // The live market is the orbital-command trade console (.sx-trade + data-mode segment buttons).
  // The legacy .st-buy-btn/[data-trade-mode] shell no longer exists — one current-UI path only.
  // Each roundtrip ends in Sell mode, which narrows the register to held cargo ("IN HOLD").
  // After the load+redock the hold can be empty, which collapses the console into the
  // HOLD_EMPTY data state — its public "Switch to Buy" verb is the designed way out.
  const holdEmptyVerb = page.locator('.sf-state[data-sf-state="empty"] .sf-state__verb', { hasText: /switch to buy/i }).first();
  if (await holdEmptyVerb.isVisible().catch(() => false)) await holdEmptyVerb.click();
  const activeTradeShell = page.locator('.sx-trade:visible').first();
  // Live station chrome refreshes under the pointer; when a pointer-path click loses the
  // hit test, dispatch the click on the node itself — the same event the delegated
  // handler consumes. Nothing is committed without a state verify downstream.
  const clickWithFallback = async (locator, timeout = 5_000) => {
    const ok = await locator.click({ timeout }).then(() => true, () => false);
    if (ok) return true;
    return locator.dispatchEvent('click').then(() => true, () => false);
  };
  const modeIsOn = (locator) => locator.getAttribute('class')
    .then((value) => String(value || '').includes('is-on')).catch(() => false);
  // A mode click that never lands would trade in the wrong direction — retry the public
  // control until the console itself reports the mode active.
  const ensureMode = async (locator) => {
    for (let attempt = 0; attempt < 3 && !(await modeIsOn(locator)); attempt++) {
      await clickWithFallback(locator);
    }
    return modeIsOn(locator);
  };
  // Reset the public trade-mode control explicitly so cycle 2+ cannot time out looking for
  // a hidden Buy action.
  const buyMode = activeTradeShell.locator('button[data-mode="buy"]').first();
  await buyMode.waitFor({ state: 'visible', timeout: 20_000 });
  const ensureBuyMode = () => ensureMode(buyMode);
  await ensureBuyMode();
  const sellMode = activeTradeShell.locator('button[data-mode="sell"]').first();
  const tradeGo = activeTradeShell.locator('.sx-trade__go[data-go]:not([disabled])').first();
  const qtyInput = activeTradeShell.locator('input.sx-qty__in').first();
  const rows = page.locator('[data-cmdty][role="tab"]');
  // Observer tap: a row that refuses to commit is only diagnosable if the bus says why.
  // tradeFailed carries the rejection reason (price_changed, cargo_full, no_stock, …) and
  // tradeCompleted distinguishes "rejected" from "landed where the verify could not see it".
  await page.evaluate(() => {
    const w = window;
    if (w.__SOAK_TRADE_TAP__ || !w.SF?.bus?.on) return;
    w.__SOAK_TRADE_TAP__ = true;
    w.__SOAK_TRADE_EVENTS__ = [];
    const push = (kind) => (p) => {
      const log = w.__SOAK_TRADE_EVENTS__;
      log.push({ kind, at: Date.now(), ...(p && typeof p === 'object' ? p : { p }) });
      if (log.length > 40) log.splice(0, log.length - 40);
    };
    w.SF.bus.on('economy:tradeFailed', push('failed'));
    w.SF.bus.on('economy:tradeCompleted', push('completed'));
  }).catch(() => {});
  const tradeConsoleDiag = () => page.evaluate(() => {
    const shell = document.querySelector('.sx-trade');
    const liveMode = shell?.querySelector('.sx-trade__go.is-on')?.getAttribute('data-mode') || null;
    return {
      mode: liveMode,
      note: shell?.querySelector('.sx-trade__note')?.textContent?.trim() || null,
      noteHidden: shell?.querySelector('.sx-trade__note')?.hidden ?? null,
      qtyValue: shell?.querySelector('.sx-qty__in')?.value ?? null,
      goDisabled: shell?.querySelector('[data-go]')?.disabled ?? null,
      selectedCommodity: document.querySelector('.sx-mkt-row.is-active')?.getAttribute('data-cmdty')
        || document.querySelector('[data-cmdty][aria-selected="true"]')?.getAttribute('data-cmdty') || null,
      tradeEvents: (window.__SOAK_TRADE_EVENTS__ || []).slice(-6),
    };
  }).catch(() => null);
  // market.js execute() emits ui:buy/ui:sell directly — there is no .sf-confirm
  // dialog in the trade path, so waiting for one is dead time inside the tag.
  // The commodity rows (.sx-mkt-row[data-cmdty]) live in the market table, not inside the
  // .sx-trade trade panel — scope the query to the page.
  // Commit one unit of a row through the public GO control, then verify the trade
  // actually landed in state — a GO that flickers enabled on a stale quote settles
  // disabled once the console re-prices it (full hold, thin credits, no stock), so
  // "the button enabled once during the walk" is not proof the row is actionable.
  // commitQty null skips the fill and takes the console default (the whole held
  // stack in Sell mode) — the hold-drain path only. walkDeadline bounds the whole
  // market leg; a row attempt never outlives it.
  const attemptRowCommit = async (row, id, verifyFn, { commitQty = '1', walkDeadline = Infinity } = {}) => {
    let clickErr = null;
    if (await row.getAttribute('aria-selected').catch(() => null) !== 'true') {
      // The register rebuilds its row nodes on every price tick and the list lives in a
      // short scroll rail: Playwright's pointer-path click can lose the hit test to
      // sibling chrome while a real pilot's click reaches the row's delegated handler.
      // Try the real click first; fall back to dispatching click on the row itself —
      // the same event the screen's delegated listener consumes. Selection is still
      // verified below before any commit is attempted — never trade blind.
      clickErr = await row.click({ timeout: 1_500 }).then(() => null, (e) => String(e && e.message || e).split('\n').slice(0, 4).join(' | '));
      if (await row.getAttribute('aria-selected').catch(() => null) !== 'true') {
        await row.dispatchEvent('click').catch((e) => { clickErr = `${clickErr} | dispatch:${String(e && e.message || e).split('\n')[0]}`; });
      }
      if (await row.getAttribute('aria-selected').catch(() => null) !== 'true') {
        const box = await row.boundingBox().catch(() => null);
        const hitStack = box ? await page.evaluate(({ x, y }) => {
          return (document.elementsFromPoint(x, y) || []).slice(0, 4)
            .map((el) => `${el.tagName}.${String(el.className || '').split(' ').slice(0, 2).join('.')}`);
        }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }).catch(() => null) : null;
        console.log(`[trade-walk] row ${id} never selected clickErr=${clickErr} box=${JSON.stringify(box)} hit=${JSON.stringify(hitStack)}`);
        return null;
      }
    }
    // Bound every trade to exactly one unit: the hold can carry freight of the same
    // commodity, and Sell mode defaults qty to the whole held stack — selling the
    // stack is not a roundtrip of the traded unit.
    // Every action in the walk carries its own timeout: with a full hold (a fresh
    // approach scoops ~250 ore before warmup-0) no buy row is actionable, and one
    // unbounded fill/click per row burns the whole cycle budget instead of failing
    // fast into the sell-first fallback (PQ-033.02, 2026-09-22: three runs died at
    // market-opened with the cycle timeout and no diag). Landing is still proven by
    // the state verify below, never by the click.
    // A console quoting a disabled GO is saying "not actionable" — a pilot reads
    // the note and moves to the next row. But the register re-renders on every
    // price tick and GO flickers disabled inside each rebuild: poll for a live
    // window (~2.4s covers the tick cadence) before calling the row dead. Dead
    // rows still skip in ~2.5s instead of ~8s of retry budget, so a full-hold
    // walk cannot eat the whole 300s cycle (PQ-033.02 cycle-42 death).
    if (commitQty != null) await qtyInput.fill(commitQty, { timeout: 1_500 }).catch(() => {});
    const enableDeadline = Math.min(Date.now() + 2_400, walkDeadline);
    while (Date.now() < enableDeadline) {
      if (await tradeGo.isEnabled().catch(() => false)) break;
      await page.waitForTimeout(400);
    }
    if (!(await tradeGo.isEnabled().catch(() => false))) return null;
    const before = await readTradeSnapshot(page, id);
    // The console re-renders on every price tick: a GO node resolved before the click can be
    // detached by the time the event dispatches, and a transient disabled/tradeBusy instant eats
    // the handler silently (no trade event either way). A pilot just clicks again — so does the
    // probe: bounded click→verify attempts inside the same ~8s budget, re-arming qty each time.
    const deadline = Math.min(Date.now() + 8_000, walkDeadline);
    let landed = false;
    let attempts = 0;
    while (!landed && Date.now() < deadline && attempts < 3) {
      attempts += 1;
      if (commitQty != null) await qtyInput.fill(commitQty, { timeout: 1_500 }).catch(() => {});
      const enabled = await tradeGo.waitFor({ state: 'visible', timeout: 1_500 }).then(() => true, () => false);
      if (!enabled) continue;
      // Same live-refresh hazard as the register rows: try the pointer click first,
      // then dispatch the click on the node — the same event its handler consumes.
      let clicked = await tradeGo.click({ timeout: 2_000 }).then(() => true, () => false);
      if (!clicked) clicked = await tradeGo.dispatchEvent('click').then(() => true, () => false);
      if (!clicked) continue;
      const remainMs = Math.max(500, deadline - Date.now());
      landed = await page.waitForFunction(verifyFn, before, { timeout: Math.min(3_000, remainMs) }).then(() => true, () => false);
    }
    return landed ? { commodityId: id, before } : null;
  };
  // Walk register rows the way a pilot does: select each and try the commit until one
  // lands. A row can list while its quote fails (no market entry at this berth, locked
  // cargo, empty stock), so "listed" is not "actionable".
  const walkRowsForCommit = async (verifyFn, limit = 14, options = {}) => {
    const walkDeadline = Number.isFinite(options.walkDeadline) ? options.walkDeadline : Infinity;
    let count = await rows.count().catch(() => 0);
    if (count === 0 && await reopenMarketTabWhenShellLost(page)) {
      count = await rows.count().catch(() => 0);
    }
    for (let i = 0; i < Math.min(count, limit); i++) {
      if (Date.now() >= walkDeadline) return null;
      const row = rows.nth(i);
      const id = await row.getAttribute('data-cmdty').catch(() => null);
      if (!id) continue;
      const t0 = Date.now();
      const committed = await attemptRowCommit(row, id, verifyFn, options);
      // Success is one line per walk (the roundtrip mark); only dead rows narrate,
      // with the console state that explains them.
      if (!committed) console.log(`[trade-walk] row ${i} ${id} ms=${Date.now() - t0} diag=${JSON.stringify(await tradeConsoleDiag())}`);
      if (committed) return committed;
      // A dead row is quotable-detail; the shell itself vanishing is a stray-key
      // back-out — re-open the tab once and restart the walk on the live rows.
      if (!options.__reopened && await page.locator('.sx-trade:visible').count().catch(() => 0) === 0
          && await reopenMarketTabWhenShellLost(page)) {
        return walkRowsForCommit(verifyFn, limit, { ...options, __reopened: true });
      }
    }
    return null;
  };
  const readHoldFreeVolume = () => page.evaluate(() => {
    const c = window.SF?.state?.player?.cargo;
    if (!c || !(c.capVolume > 0)) return null;
    return c.capVolume - (c.usedVolume || 0);
  }).catch(() => null);
  const BUY_VERIFY = ({ commodityId, credits, owned }) => {
    const s = window.SF?.state;
    return Number(s?.player?.credits) < credits
      && Number(s?.player?.cargo?.items?.[commodityId] || 0) > owned;
  };
  const SELL_VERIFY = ({ commodityId, owned }) =>
    Number(window.SF?.state?.player?.cargo?.items?.[commodityId] || 0) < owned;
  // Long soaks bleed the bid-ask spread on every roundtrip and in-flight pickups can
  // overfill the hold far past cap (a fresh approach scoops 300+ ore) — credits and
  // free space are not guaranteed. Try the buy leg first; when no buyable row
  // exists, sell down until one unit of volume is free and then buy through
  // whichever register row is stocked. The roundtrip contract is one landed buy +
  // one landed sell, not same-unit bookkeeping.
  // The market leg is one leg of a ~300s cycle. Every walk below shares this hard
  // deadline — past it the legs return empty and the asserts narrate a real market
  // failure instead of the route dying quietly at the cycle budget (PQ-033.02:
  // cycle 42 burned all 300s inside the walk on a full-hold register).
  const marketDeadline = Date.now() + 160_000;
  const walkBudget = () => ({ walkDeadline: marketDeadline });
  let direction = 'buy-first';
  let buy = await walkRowsForCommit(BUY_VERIFY, 14, walkBudget());
  let sell = null;
  if (buy) {
    await sellMode.waitFor({ state: 'visible', timeout: 20_000 });
    await ensureMode(sellMode);
    // Prefer selling back exactly the bought unit so cargo stays neutral; when the
    // register won't buy that commodity here, any held unit still lands the leg.
    const sameRow = page.locator(`[data-cmdty="${buy.commodityId}"]`).first();
    const sameRowPresent = await sameRow.count().catch(() => 0) > 0;
    sell = (sameRowPresent ? await attemptRowCommit(sameRow, buy.commodityId, SELL_VERIFY, walkBudget()) : null)
      || await walkRowsForCommit(SELL_VERIFY, 14, walkBudget());
    assert(sell, `buy leg landed but no sell commits: ${JSON.stringify(await tradeConsoleDiag())}`);
  } else {
    direction = 'sell-first';
    await sellMode.waitFor({ state: 'visible', timeout: 20_000 });
    await ensureMode(sellMode);
    sell = await walkRowsForCommit(SELL_VERIFY, 14, walkBudget());
    assert(sell, `market register must offer a sellable held row: ${JSON.stringify(await tradeConsoleDiag())}`);
    // One sold unit does not free a 60-deep overfill. Drain whole sellable stacks —
    // the console defaults Sell qty to the held stack — until the buy leg below has
    // room. Bounded: each commit clears a stack, and the loop stops when no row
    // commits or every held row has been drained twice over.
    let drainedStacks = 0;
    for (let drained = 0; drained < 24; drained++) {
      const free = await readHoldFreeVolume();
      if (free == null || free >= 1) break;
      const extra = await walkRowsForCommit(SELL_VERIFY, 45, { commitQty: null, ...walkBudget() });
      if (!extra) break;
      drainedStacks += 1;
    }
    await ensureBuyMode();
    buy = await walkRowsForCommit(BUY_VERIFY, 14, walkBudget());
    // A freed hold is not yet a funded one: the roundtrip bleeds bid-ask spread
    // every cycle while in-flight pickups pile high-value ore into the hold, so
    // late-soak saves can sit on 200+ u of cargo with single-digit credits. A
    // pilot just sells what they hauled — keep liquidating held stacks (each
    // whole-stack sale funds the next attempt) until a buy commits or the
    // register stops buying. Same bound as the space drain.
    for (let attempts = 0; !buy && attempts < 24; attempts++) {
      await ensureMode(sellMode);
      const extra = await walkRowsForCommit(SELL_VERIFY, 45, { commitQty: null, ...walkBudget() });
      if (!extra) break;
      drainedStacks += 1;
      await ensureBuyMode();
      buy = await walkRowsForCommit(BUY_VERIFY, 14, walkBudget());
    }
    assert(buy, `a drained hold must offer a buyable row: ${JSON.stringify(await tradeConsoleDiag())}`);
    if (drainedStacks > 0) sell.drainedStacks = drainedStacks;
  }
  return { shell: 'orbital-command', direction, buy, sell };
}

async function ensureMarketOpen(page) {
  const marketTab = page.locator('[role="tab"]', { hasText: /market/i }).first();
  await marketTab.waitFor({ state: 'visible', timeout: 20_000 });
  // The pointer-path click can lose the hit test to adjacent chrome on a live-refreshing
  // station shell; verify the tab actually selected and fall back to dispatching the
  // click on the tab node — the same event its handler consumes.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await marketTab.getAttribute('aria-selected').catch(() => null) === 'true') break;
    await marketTab.click({ timeout: 4_000 }).catch(() => {});
    if (await marketTab.getAttribute('aria-selected').catch(() => null) === 'true') break;
    await marketTab.dispatchEvent('click').catch(() => {});
    if (await marketTab.getAttribute('aria-selected').catch(() => null) === 'true') break;
  }
  // The trade console is hidden while the register is empty (HOLD_EMPTY/EXCHANGE_DARK);
  // give the live market-open tick room to populate before calling it absent.
  await page.locator('.sx-trade:visible .sx-trade__go').first().waitFor({ state: 'visible', timeout: 20_000 });
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
      && data.authoredReadableFallbackRetained === false
      // The async restore rebuild (post-route recompile, PMREM re-bake) must be
      // done too — sampling while contextRecovery.pending is still true would
      // record the rebuild's own stalls as post-recovery steady-state.
      && state?.render?.contextRecovery?.pending === false
      && Number(state?.render?.contextRecovery?.restores) >= 1;
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
      contextRecovery: state.render.contextRecovery ? {
        losses: state.render.contextRecovery.losses,
        restores: state.render.contextRecovery.restores,
        generation: state.render.contextRecovery.generation,
        pending: state.render.contextRecovery.pending,
        detachedStaleDisposeListeners: state.render.contextRecovery.detachedStaleDisposeListeners,
        detachedContextResources: state.render.contextRecovery.detachedContextResources,
      } : null,
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
  pipelineStableMs = 5_000,
  pipelineSettleTimeoutMs = 20_000,
  sampleMs,
  enableGpuTimers = true,
  requireAuthoredFlight = null,
  requireDocked = null,
  requireMiningOrTether = false,
  triggerAutosave = false,
  scenarioAction = null,
} = {}) {
  const allowed = new Set([...ATTRIBUTION_ROUTE_TAGS, ...PERFORMANCE_REGISTERED_SCENARIO_IDS, 'flight_steady', 'context_recover_steady']);
  assert(allowed.has(phaseTag), `unsupported steady-state phase: ${phaseTag}`);
  assert(Number.isFinite(warmupMs) && warmupMs >= 0, 'rAF warmup must be finite and non-negative');
  assert(Number.isFinite(pipelineStableMs) && pipelineStableMs >= 5_000,
    'pipeline readiness must remain stable for at least 5000 ms');
  assert(Number.isFinite(pipelineSettleTimeoutMs)
    && pipelineSettleTimeoutMs >= Math.max(warmupMs, pipelineStableMs)
    && pipelineSettleTimeoutMs <= 30_000,
  'pipeline readiness timeout must bound warmup between its minimum and 30000 ms');
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
    tag, warmup, pipelineStable, pipelineTimeout, duration, gpuOn,
    needFlight: needFlightFlag, needDocked: needDockedFlag, needMining,
    autosaveUnderLoad, action,
  }) => {
    if (document.visibilityState !== 'visible') throw new Error(`steady-state ${tag} requires a visible document`);
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    const {
      collectPerformancePipelineReadiness,
      collectPerformanceProgramInventory,
      collectPerformanceSceneStructure,
      comparePerformanceProgramInventories,
      isPerformancePipelineSettled,
      performanceAdmissionHorizonMs,
      performancePipelineFingerprint,
      PERFORMANCE_PIPELINE_WARMUP_SCHEMA,
    } = await import('/scripts/lib/performanceSceneMetrics.mjs');

    if (needFlightFlag) {
      if (state?.mode !== 'flight' || state?.ui?.docked !== false || player?.mesh?.userData?.authoredAssetState !== 'authored') {
        throw new Error(`steady-state ${tag} requires authored active flight`);
      }
    }
    if (needDockedFlag) {
      if (state?.ui?.docked !== true) throw new Error(`steady-state ${tag} requires docked UI path`);
    }
    const admissionMeasurementHorizonMs = performanceAdmissionHorizonMs(duration, state?.timeScale);

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

    function readDynamicBufferSlice() {
      const source = state?.render?.dynamicBufferRanges;
      const owners = Array.isArray(source?.owners) ? source.owners.map((owner) => ({
        id: owner.id || null,
        activeCount: Number(owner.activeCount) || 0,
        capacity: Number(owner.capacity) || 0,
        logicalBytesChanged: Number(owner.logicalBytesChanged) || 0,
        requestedUploadBytes: Number(owner.requestedUploadBytes) || 0,
        uploadRangeCount: Number(owner.uploadRangeCount) || 0,
        forceFullUploads: Number(owner.forceFullUploads) || 0,
        partialUploads: Number(owner.partialUploads) || 0,
        probeFullUploads: Number(owner.probeFullUploads) || 0,
      })) : [];
      const totals = owners.reduce((sum, owner) => {
        for (const field of [
          'logicalBytesChanged',
          'requestedUploadBytes',
          'uploadRangeCount',
          'forceFullUploads',
          'partialUploads',
          'probeFullUploads',
        ]) sum[field] += owner[field];
        return sum;
      }, {
        logicalBytesChanged: 0,
        requestedUploadBytes: 0,
        uploadRangeCount: 0,
        forceFullUploads: 0,
        partialUploads: 0,
        probeFullUploads: 0,
      });
      return {
        available: !!source,
        probeForceFullUploads: source?.probeForceFullUploads === true,
        registeredOwners: Number(source?.registeredOwners) || owners.length,
        totals,
        owners,
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
          ? 'Docked station market/hub — rAF and UI remain live while the 3D renderer is deliberately idle.'
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

    function setBackgroundJobTrackingEnabled(on) {
      const perf = window.__SPACEFACE_PERF__ || state?.perfRuntime;
      if (perf && typeof perf.setBackgroundJobTrackingEnabled === 'function') {
        try { perf.setBackgroundJobTrackingEnabled(!!on); } catch (_) { /* ignore */ }
      }
    }

    function resetProbes() {
      try { if (window.__SPACEFACE_PERF__?.reset) window.__SPACEFACE_PERF__.reset(); } catch (_) { /* ignore */ }
      try {
        if (window.__SPACEFACE_PERF__?.tier1?.reset) {
          window.__SPACEFACE_PERF__.tier1.reset();
          window.__SPACEFACE_PERF__.tier1.markBootBoundary();
        }
      } catch (_) { /* ignore */ }
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
      pipelineWarmup,
      pipelineStart,
      pipelineEnd,
      programInventoryStart,
      programInventoryEnd,
      heapStart,
      heapEnd,
      longTasks,
      gcSignals,
      saveEvents,
      actionReceipt,
      transitionBreakdown,
      gpuDrain,
      dynamicBufferStart,
      dynamicBufferEnd,
    }) {
      const perfApi = window.__SPACEFACE_PERF__ || state?.perfRuntime || null;
      const perf = perfApi && typeof perfApi.getReport === 'function'
        ? perfApi.getReport()
        : null;
      const tier1 = perfApi && typeof perfApi.getCounterSnapshot === 'function'
        ? perfApi.getCounterSnapshot()
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
          backgroundJobs: perf?.backgroundJobs || null,
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
        pipeline: {
          warmup: pipelineWarmup,
          start: pipelineStart,
          end: pipelineEnd,
          programs: {
            start: programInventoryStart,
            end: programInventoryEnd,
            delta: comparePerformanceProgramInventories(programInventoryStart, programInventoryEnd),
          },
        },
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
          lastInvalidation: gpu?.lastInvalidation || null,
          queryCounts: gpu?.queryCounts || null,
          captureValid: gpu?.captureValid === true,
          drain: gpuDrain || null,
          terminals: gpu?.terminals || null,
          passes: gpu?.passes || null,
        },
        dynamicBuffers: {
          available: dynamicBufferStart?.available === true && dynamicBufferEnd?.available === true,
          probeForceFullUploads: dynamicBufferEnd?.probeForceFullUploads === true,
          start: dynamicBufferStart || null,
          end: dynamicBufferEnd || null,
          delta: metricDelta(dynamicBufferStart?.totals, dynamicBufferEnd?.totals),
        },
        tier1,
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

    // Per-interval hitch verdicts from the game's own classifier (PQ-129.02). The
    // release contract excludes only gaps the page did not consume, so every
    // over-threshold interval sampled below must carry its owner verdict.
    const perfApi = window.__SPACEFACE_PERF__ || state?.perfRuntime || null;
    const hitchAttribution = { armed: false, wasEnabled: null };
    if (perfApi && typeof perfApi.setHitchAttributionEnabled === 'function'
        && typeof perfApi.getHitchVerdicts === 'function') {
      try {
        hitchAttribution.wasEnabled = perfApi.hitchAttributionEnabled === true;
        perfApi.setHitchAttributionEnabled(true);
        hitchAttribution.armed = true;
      } catch (_) { hitchAttribution.armed = false; }
    }
    // Verdicts can land a boundary after the sampler's own read (callback order),
    // so requests queue until the ring reports the matching atMs. Unresolved
    // requests stay unowned — the contract counts them, never launders them.
    const pendingVerdicts = [];
    function drainHitchVerdicts() {
      if (!hitchAttribution.armed || pendingVerdicts.length === 0) return;
      let verdicts;
      try { verdicts = perfApi.getHitchVerdicts(); } catch (_) { return; }
      if (!Array.isArray(verdicts)) return;
      for (const verdict of verdicts) {
        if (!verdict || !Number.isFinite(verdict.atMs)) continue;
        const index = pendingVerdicts.findIndex((p) => Math.abs(p.atMs - verdict.atMs) <= 0.51);
        if (index < 0) continue;
        const pending = pendingVerdicts.splice(index, 1)[0];
        pending.onVerdict(verdict.owner || 'unknown');
      }
    }
    function requestHitchVerdict(atMs, onVerdict) {
      if (!hitchAttribution.armed) return;
      pendingVerdicts.push({ atMs, onVerdict });
      // A pending request whose verdict never lands is an instrumentation gap —
      // the sample stays unowned and counted. Cap the queue so a pathological
      // run cannot accumulate stale requests; rAF atMs is monotone so the
      // oldest entries are the least likely to ever match.
      if (pendingVerdicts.length > 64) pendingVerdicts.splice(0, pendingVerdicts.length - 64);
      drainHitchVerdicts();
    }

    async function awaitPipelinePrerequisites(timeoutMs) {
      const candidates = [
        ['authoredPartLibraryReady', state?.render?.authoredPartLibraryReady],
        ['pipelinePrecompileReady', state?.render?.pipelinePrecompileReady],
        ['backgroundPipelinePrecompileReady', state?.render?.backgroundPipelinePrecompileReady],
        ['exactPipelineWarmupReady', state?.render?.exactPipelineWarmupReady],
      ].filter(([, promise]) => promise && typeof promise.then === 'function');
      const startedAt = performance.now();
      let timeoutId = null;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(
          `steady-state ${tag} pipeline prerequisite timeout after ${timeoutMs} ms`,
        )), timeoutMs);
      });
      try {
        await Promise.race([
          Promise.all(candidates.map(([, promise]) => promise)),
          timeoutPromise,
        ]);
      } finally {
        if (timeoutId != null) clearTimeout(timeoutId);
      }
      return {
        labels: candidates.map(([label]) => label),
        elapsedMs: performance.now() - startedAt,
      };
    }

    // A Promise's presence is not readiness. In particular, context recovery republishes the
    // procedural precompile gate; begin the stable observation only after the exact live promises
    // captured for this route have settled.
    const pipelinePrerequisiteBarrier = await awaitPipelinePrerequisites(pipelineTimeout);
    const pipelineObservationIntervalMs = 100;
    const pipelineWarmupStartedAt = performance.now();
    // Frame quiescence: the measured window must not open while catch-up debt from
    // a pre-window stall is still landing. A >32 ms interval is suspect until the
    // game's classifier resolves it — externalScheduling (a gap the page did not
    // consume) does not block; every other owner, an unarmed classifier, or a
    // verdict that never lands does. Unarmed is fail-closed: evidence without
    // attribution cannot claim the exemption downstream anyway.
    const frameQuietRequiredMs = 500;
    let prevWarmupRafTs = null;
    let lastFrameBreakMs = -Infinity;
    let warmupStallCount = 0;
    let pendingWarmupStalls = [];
    let pipelineReadiness = collectPerformancePipelineReadiness({
      state,
      registry: window.SF?.registry,
      resourceStartTime: pipelineWarmupStartedAt,
      measurementHorizonMs: admissionMeasurementHorizonMs,
    });
    let pipelineFingerprint = performancePipelineFingerprint(pipelineReadiness);
    const pipelineStartFingerprint = pipelineFingerprint;
    let pipelineFingerprintKey = JSON.stringify(pipelineFingerprint);
    let pipelineStableSince = pipelineWarmupStartedAt;
    let pipelineObservationCount = 1;
    let pipelineTransitionCount = 0;
    let pipelineWarmupPassed = false;
    let nextPipelineObservationAt = pipelineWarmupStartedAt + pipelineObservationIntervalMs;
    while (true) {
      const rafTs = await raf();
      const now = performance.now();
      const elapsedMs = now - pipelineWarmupStartedAt;
      if (prevWarmupRafTs != null) {
        const delta = rafTs - prevWarmupRafTs;
        drainHitchVerdicts();
        if (delta > 32) {
          warmupStallCount += 1;
          const stall = { endMs: rafTs, resolved: false, external: false };
          pendingWarmupStalls.push(stall);
          requestHitchVerdict(rafTs, (owner) => {
            stall.resolved = true;
            if (owner === 'externalScheduling') stall.external = true;
          });
          if (!hitchAttribution.armed) {
            stall.resolved = true;
          }
        }
        pendingWarmupStalls = pendingWarmupStalls.filter((stall) => {
          if (!stall.resolved) {
            // A verdict never landing is an instrumentation gap — fail closed by
            // treating the interval as game-owned after a bounded grace period.
            if (now - stall.endMs > 2_000) {
              stall.resolved = true;
            } else {
              return true;
            }
          }
          if (!stall.external) lastFrameBreakMs = Math.max(lastFrameBreakMs, stall.endMs);
          return false;
        });
      }
      prevWarmupRafTs = rafTs;
      let frameQuietBlockedUntil = lastFrameBreakMs;
      for (const stall of pendingWarmupStalls) {
        frameQuietBlockedUntil = Math.max(frameQuietBlockedUntil, stall.endMs);
      }
      if (now >= nextPipelineObservationAt) {
        pipelineReadiness = collectPerformancePipelineReadiness({
          state,
          registry: window.SF?.registry,
          resourceStartTime: pipelineWarmupStartedAt,
          measurementHorizonMs: admissionMeasurementHorizonMs,
        });
        const nextFingerprint = performancePipelineFingerprint(pipelineReadiness);
        const nextFingerprintKey = JSON.stringify(nextFingerprint);
        pipelineObservationCount++;
        if (nextFingerprintKey !== pipelineFingerprintKey) {
          pipelineTransitionCount++;
          pipelineStableSince = now;
          pipelineFingerprint = nextFingerprint;
          pipelineFingerprintKey = nextFingerprintKey;
        }
        nextPipelineObservationAt = now + pipelineObservationIntervalMs;
      }
      const stableMs = now - pipelineStableSince;
      if (elapsedMs >= warmup
          && stableMs >= pipelineStable
          && isPerformancePipelineSettled(pipelineReadiness)
          && now - frameQuietBlockedUntil >= frameQuietRequiredMs) {
        pipelineWarmupPassed = true;
        break;
      }
      if (elapsedMs >= pipelineTimeout) break;
    }
    const pipelineWarmupEndedAt = performance.now();
    const pipelineWarmup = {
      schema: PERFORMANCE_PIPELINE_WARMUP_SCHEMA,
      pass: pipelineWarmupPassed,
      requiredStableMs: pipelineStable,
      maxWaitMs: pipelineTimeout,
      minimumWarmupMs: warmup,
      observationIntervalMs: pipelineObservationIntervalMs,
      elapsedMs: pipelineWarmupEndedAt - pipelineWarmupStartedAt,
      stableMs: pipelineWarmupEndedAt - pipelineStableSince,
      timedOut: pipelineWarmupPassed !== true,
      observationCount: pipelineObservationCount,
      transitionCount: pipelineTransitionCount,
      frameQuietRequiredMs,
      warmupStallCount,
      frameQuietWaitMs: Number.isFinite(lastFrameBreakMs)
        ? Math.max(0, pipelineWarmupEndedAt - lastFrameBreakMs)
        : null,
      hitchAttributionArmed: hitchAttribution.armed,
      prerequisiteBarrier: pipelinePrerequisiteBarrier,
      startFingerprint: pipelineStartFingerprint,
      endFingerprint: pipelineFingerprint,
    };

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
    setBackgroundJobTrackingEnabled(true);
    setGpuTimersEnabled(gpuOn);
    const resourceStartTime = performance.now();
    const sceneStart = collectPerformanceSceneStructure({ state });
    const pipelineStart = collectPerformancePipelineReadiness({
      state,
      registry: window.SF?.registry,
      resourceStartTime,
      measurementHorizonMs: admissionMeasurementHorizonMs,
    });
    const programInventoryStart = collectPerformanceProgramInventory({ state });
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
      const dynamicBufferStart = readDynamicBufferSlice();

      try {
        longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, durationMs: entry.duration });
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      } catch (_) { longTaskObserver = null; }
      try {
        if (PerformanceObserver.supportedEntryTypes?.includes('gc')) {
          gcObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) gcSignals.push({ startTime: entry.startTime, durationMs: entry.duration, kind: entry.kind || null });
          });
          gcObserver.observe({ entryTypes: ['gc'] });
        }
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
      // The floor contract needs 150 policy-relevant frames. Gaps the classifier stamps
      // externalScheduling never produced a gameplay frame, so under host contention the
      // window extends (bounded) until enough real frames exist — it never fakes them.
      const floorSamplesRequired = (tag === 'flight_steady' || tag === 'context_recover_steady') ? 150 : 0;
      const sampleDeadlineMs = duration * 3;
      const floorEligibleCount = () => {
        drainHitchVerdicts();
        return samples.reduce((count, sample) => count + (sample.hitchOwner !== 'externalScheduling' ? 1 : 0), 0);
      };
      while (performance.now() - sampleStart < duration) {
        const timestamp = await raf();
        const frameMs = timestamp - previous;
        previous = timestamp;
        drainHitchVerdicts();
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
            // timeScale is authored transient runtime state (hit-stop/focus), not a quality
            // setting. Bind it to every raw interval so route validators can distinguish visible
            // gameplay dilation from a pause or settings shortcut without hiding either.
            timeScale: Number.isFinite(window.SF?.state?.timeScale) ? window.SF.state.timeScale : null,
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
          if (frameMs > 32) {
            requestHitchVerdict(timestamp, (owner) => {
              sample.hitchOwner = owner;
            });
          }
        }
      }
      // Let one more rAF boundary pass so a classifier verdict for the final
      // sampled interval can land before the window closes.
      await raf();
      drainHitchVerdicts();
      while (floorEligibleCount() < floorSamplesRequired
          && performance.now() - sampleStart < sampleDeadlineMs) {
        // Bounded rAF: a fully starved page must not park the window past its deadline.
        const timestamp = await Promise.race([
          raf(),
          new Promise((resolve) => setTimeout(resolve, 2_000, null)),
        ]);
        if (timestamp == null) continue;
        const frameMs = timestamp - previous;
        previous = timestamp;
        if (!(Number.isFinite(frameMs) && frameMs > 0)) continue;
        const sample = {
          atMs: timestamp,
          frameMs,
          phaseTag: tag,
          tick: Number(window.SF?.state?.tick),
          mode: window.SF?.state?.mode || null,
          timeScale: Number.isFinite(window.SF?.state?.timeScale) ? window.SF.state.timeScale : null,
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
        if (frameMs > 32) {
          requestHitchVerdict(timestamp, (owner) => {
            sample.hitchOwner = owner;
          });
        }
        await Promise.race([raf(), new Promise((resolve) => setTimeout(resolve, 500, null))]);
        drainHitchVerdicts();
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

      // Close the timing window before reading it. Merely polling twice leaves a
      // normal multi-frame driver queue unresolved and makes every otherwise
      // valid window fail. drainPending pauses new submissions, performs only
      // non-blocking availability checks, and fails closed on its bounded
      // two-second deadline without ever calling gl.finish().
      const timers = state?.render?.gpuTimers;
      let gpuDrain = null;
      if (gpuOn && timers && typeof timers.drainPending === 'function') {
        gpuDrain = await timers.drainPending({
          maxPolls: 120,
          timeoutMs: 2_000,
          yieldFn: raf,
        });
      } else if (timers && typeof timers.poll === 'function') {
        timers.poll();
        gpuDrain = { drained: false, timedOut: false, pending: null, reason: 'drain-unavailable' };
      }

      const settingsEnd = readSettingsSlice();
      const routeEnd = readRouteProof();
      const sceneEnd = collectPerformanceSceneStructure({ state });
      const pipelineEnd = collectPerformancePipelineReadiness({
        state,
        registry: window.SF?.registry,
        resourceStartTime,
        measurementHorizonMs: admissionMeasurementHorizonMs,
      });
      const programInventoryEnd = collectPerformanceProgramInventory({ state });
      const heapEnd = readHeapSlice();
      const dynamicBufferEnd = readDynamicBufferSlice();

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
        pipelineWarmup,
        pipelineStart,
        pipelineEnd,
        programInventoryStart,
        programInventoryEnd,
        heapStart,
        heapEnd,
        longTasks,
        gcSignals,
        saveEvents,
        actionReceipt,
        transitionBreakdown,
        gpuDrain,
        dynamicBufferStart,
        dynamicBufferEnd,
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
      setBackgroundJobTrackingEnabled(false);
      if (hitchAttribution.armed && hitchAttribution.wasEnabled !== true) {
        try { perfApi.setHitchAttributionEnabled(false); } catch (_) { /* ignore */ }
      }
    }
  }, {
    tag: phaseTag,
    warmup: warmupMs,
    pipelineStable: pipelineStableMs,
    pipelineTimeout: pipelineSettleTimeoutMs,
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
    dynamicBufferProbeForceFullUploads:
      state?.render?.dynamicBufferRanges?.probeForceFullUploads === true,
    label: 'DIAGNOSTIC-ONLY — not a shippable fix',
  };
}

function applyDiagnosticVariantToState(state, snap, variantId) {
  assert(
    ATTRIBUTION_DIAGNOSTIC_VARIANTS.includes(variantId)
      || variantId === DYNAMIC_BUFFER_FULL_SPAN_VARIANT,
    `unknown diagnostic variant: ${variantId}`,
  );
  if (!state) throw new Error('state unavailable for diagnostic variant');
  const label = 'DIAGNOSTIC-ONLY — not a shippable fix';
  if (variantId === 'baseline') {
    state.timeScale = snap.timeScale;
    if (state.settings?.video) state.settings.video.bloom = snap.bloom;
    if (state.render?.spaceBg?.group) state.render.spaceBg.group.visible = snap.spaceBgVisible;
    state.render?.perfEntityIsolation?.restore?.();
    state.render?.perfVfxIsolation?.restore?.();
    state.render?.perfMaterialIsolation?.restore?.();
    state.render?.dynamicBufferRanges?.setProbeForceFullUploads?.(
      snap.dynamicBufferProbeForceFullUploads === true,
    );
    return { id: variantId, diagnostic: false, label: 'baseline (restored defaults)', applied: true };
  }
  if (variantId === DYNAMIC_BUFFER_FULL_SPAN_VARIANT) {
    const control = state.render?.dynamicBufferRanges;
    if (typeof control?.setProbeForceFullUploads !== 'function') {
      throw new Error('dynamic buffer full-span probe control unavailable');
    }
    control.setProbeForceFullUploads(true);
    return {
      id: variantId,
      diagnostic: true,
      label,
      applied: control.probeForceFullUploads === true,
      dynamicBufferProbeForceFullUploads: control.probeForceFullUploads === true,
    };
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
  state.render?.dynamicBufferRanges?.setProbeForceFullUploads?.(
    snap.dynamicBufferProbeForceFullUploads === true,
  );
  const videoBloom = state.settings?.video?.bloom;
  const spaceBgVisible = state.render?.spaceBg?.group?.visible !== false;
  const ok = state.timeScale === snap.timeScale && videoBloom === snap.bloom
    && spaceBgVisible === snap.spaceBgVisible
    && state.render?.perfEntityIsolation?.inspect?.().active !== true
    && state.render?.perfVfxIsolation?.inspect?.().active !== true
    && state.render?.perfMaterialIsolation?.inspect?.().active !== true
    && (state.render?.dynamicBufferRanges?.probeForceFullUploads === true)
      === (snap.dynamicBufferProbeForceFullUploads === true);
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
  assert(
    ATTRIBUTION_DIAGNOSTIC_VARIANTS.includes(variantId)
      || variantId === DYNAMIC_BUFFER_FULL_SPAN_VARIANT,
    `unknown diagnostic variant: ${variantId}`,
  );
  const applied = await page.evaluate((id) => {
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
        dynamicBufferProbeForceFullUploads:
          state.render?.dynamicBufferRanges?.probeForceFullUploads === true,
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
      state.render?.dynamicBufferRanges?.setProbeForceFullUploads?.(
        snap.dynamicBufferProbeForceFullUploads === true,
      );
      try { window.SF?.bus?.emit('settings:changed', { section: 'video', key: 'bloom' }); } catch (_) { /* ignore */ }
      return { id, diagnostic: false, label: 'baseline (restored defaults)', applied: true };
    }
    if (id === 'dynamic_buffer_full_span') {
      const control = state.render?.dynamicBufferRanges;
      if (typeof control?.setProbeForceFullUploads !== 'function') {
        throw new Error('dynamic buffer full-span probe control unavailable');
      }
      control.setProbeForceFullUploads(true);
      return {
        id,
        diagnostic: true,
        label,
        applied: control.probeForceFullUploads === true,
        dynamicBufferProbeForceFullUploads: control.probeForceFullUploads === true,
      };
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
  const pipelineWarmup = await page.evaluate(async () => {
    const compileCurrent = window.SF?.state?.render?.compileCurrentPipelines;
    if (typeof compileCurrent !== 'function') {
      throw new Error('current-scene pipeline compiler unavailable after diagnostic variant');
    }
    return compileCurrent();
  });
  return { ...applied, pipelineWarmup };
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
    state.render?.dynamicBufferRanges?.setProbeForceFullUploads?.(
      snap.dynamicBufferProbeForceFullUploads === true,
    );
    try { window.SF?.bus?.emit('settings:changed', { section: 'video', key: 'bloom' }); } catch (_) { /* ignore */ }
    const videoBloom = state.settings?.video?.bloom;
    const spaceBgVisible = state.render?.spaceBg?.group?.visible !== false;
    const ok = state.timeScale === snap.timeScale && videoBloom === snap.bloom
      && spaceBgVisible === snap.spaceBgVisible
      && state.render?.perfEntityIsolation?.inspect?.().active !== true
      && state.render?.perfVfxIsolation?.inspect?.().active !== true
      && state.render?.perfMaterialIsolation?.inspect?.().active !== true
      && (state.render?.dynamicBufferRanges?.probeForceFullUploads === true)
        === (snap.dynamicBufferProbeForceFullUploads === true);
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
      if (perf && typeof perf.setBackgroundJobTrackingEnabled === 'function') {
        perf.setBackgroundJobTrackingEnabled(false);
      }
    } catch (_) { /* ignore */ }
    try {
      const timers = window.SF?.state?.render?.gpuTimers;
      if (timers && typeof timers.setEnabled === 'function') timers.setEnabled(false);
    } catch (_) { /* ignore */ }
    try {
      window.SF?.state?.render?.dynamicBufferRanges?.setProbeForceFullUploads?.(false);
    } catch (_) { /* ignore */ }
    const timers = window.SF?.state?.render?.gpuTimers;
    const gpuReport = timers && typeof timers.getReport === 'function' ? timers.getReport() : null;
    return {
      renderWorkEnabled: perf?.renderWorkEnabled === true || perf?.isRenderWorkEnabled?.() === true,
      systemTimingEnabled: perf?.systemTimingEnabled === true || perf?.isSystemTimingEnabled?.() === true,
      backgroundJobTrackingEnabled: perf?.backgroundJobTrackingEnabled === true
        || perf?.isBackgroundJobTrackingEnabled?.() === true,
      gpuTimersEnabled: gpuReport?.enabled === true,
      dynamicBufferProbeForceFullUploads:
        window.SF?.state?.render?.dynamicBufferRanges?.probeForceFullUploads === true,
      restoreJournalPresent: window.__SF_PERF_ATTRIBUTION_RESTORE__ != null,
    };
  }).catch(() => ({
    renderWorkEnabled: false,
    systemTimingEnabled: false,
    backgroundJobTrackingEnabled: false,
    gpuTimersEnabled: false,
    dynamicBufferProbeForceFullUploads: false,
    restoreJournalPresent: false,
  }));
}

/**
 * Collect multi-route attribution windows with optional diagnostic A/B variants.
 * Each diagnostic variant body is failure-atomic: restore settings/timeScale + disable
 * measurement gates in finally.
 */
const POST_DIAGNOSTIC_ATTRIBUTION_ROUTE_ORDER = Object.freeze([
  'context_recover_steady',
  'jump_asset_admission',
]);
const POST_DIAGNOSTIC_ATTRIBUTION_ROUTES = new Set(POST_DIAGNOSTIC_ATTRIBUTION_ROUTE_ORDER);

function performanceAttributionExecutionPlan({
  routes = ['flight_steady', 'docked_market_ui'],
  variants = ['baseline'],
  variantScenarioIds = ['flight_steady'],
} = {}) {
  const ordinary = [];
  const postDiagnosticByRoute = new Map(
    POST_DIAGNOSTIC_ATTRIBUTION_ROUTE_ORDER.map((routeTag) => [routeTag, []]),
  );
  for (const variantId of variants) {
    for (const routeTag of routes) {
      if (variantId !== 'baseline' && !variantScenarioIds.includes(routeTag)) continue;
      if (POST_DIAGNOSTIC_ATTRIBUTION_ROUTES.has(routeTag) && variantId !== 'baseline') {
        throw new Error(`post-diagnostic attribution route ${routeTag} only supports the baseline variant`);
      }
      const cell = { variantId, routeTag };
      const postDiagnostic = postDiagnosticByRoute.get(routeTag);
      (postDiagnostic || ordinary).push(cell);
    }
  }
  return [
    ...ordinary,
    ...POST_DIAGNOSTIC_ATTRIBUTION_ROUTE_ORDER.flatMap((routeTag) => postDiagnosticByRoute.get(routeTag)),
  ];
}

function groupAttributionExecutionPasses(cells) {
  const passes = [];
  for (const cell of cells) {
    let pass = passes[passes.length - 1];
    if (!pass || pass.variantId !== cell.variantId) {
      pass = { variantId: cell.variantId, routeTags: [] };
      passes.push(pass);
    }
    pass.routeTags.push(cell.routeTag);
  }
  return passes;
}

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
  captureWindow = null,
} = {}) {
  const windows = [];
  const variantResultsById = new Map(variants.map((variantId) => [variantId, {
    id: variantId,
    diagnostic: variantId !== 'baseline',
    applied: true,
    restored: true,
    label: variantId === 'baseline' ? 'baseline (restored defaults)' : 'DIAGNOSTIC-ONLY',
    measuredRoutes: 0,
  }]));
  const executionPasses = groupAttributionExecutionPasses(performanceAttributionExecutionPlan({
    routes,
    variants,
    variantScenarioIds,
  }));

  for (const { variantId, routeTags } of executionPasses) {
    log(`[attribution] diagnostic variant ${variantId}`);
    let appliedAll = true;
    let restoredAll = true;
    let variantLabel = variantId === 'baseline' ? 'baseline (restored defaults)' : 'DIAGNOSTIC-ONLY';
    let measuredRoutes = 0;
    for (const routeTag of routeTags) {
      measuredRoutes++;
      log(`[attribution] route ${routeTag} @ ${variantId}`);
      if (typeof navigateToRoute === 'function') {
        await navigateToRoute(page, routeTag, log);
      } else {
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
          pipelineSettleTimeoutMs: performanceScenarioPipelineSettleTimeoutMs(routeTag),
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
          if (typeof captureWindow === 'function') {
            await captureWindow(page, { routeTag, variantId, attribution });
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
    const aggregate = variantResultsById.get(variantId);
    aggregate.applied = aggregate.applied && appliedAll;
    aggregate.restored = aggregate.restored && restoredAll;
    aggregate.label = variantLabel;
    aggregate.measuredRoutes += measuredRoutes;
  }
  const variantResults = variants.map((variantId) => variantResultsById.get(variantId));

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

/**
 * Diagnostic heapsnapshot capture — opt-in via SF_SOAK_HEAP_SNAPSHOTS=1. A retained-growth
 * failure otherwise only reports byte deltas; a start/end pair diffed offline names the exact
 * retained constructor and retaining path. Never runs during acceptance: the snapshot is heavy
 * and its only consumer is the operator comparing the two files.
 */
async function captureHeapSnapshot(page, filePath) {
  const cdp = await page.context().newCDPSession(page);
  const chunks = [];
  cdp.on('HeapProfiler.addHeapSnapshotChunk', (event) => { chunks.push(event.chunk || ''); });
  try {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    await writeFile(filePath, chunks.join(''));
  } finally {
    await cdp.detach().catch(() => {});
  }
}

async function readPostGcMemorySnapshot(page, phaseTag) {
  // The forced GC is measurement apparatus: pause the soak-window hitch register so a
  // stop-the-world collect is not billed to the game as a gameplay hitch.
  await setSoakPaused(page, true);
  let cdp = null;
  try {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
  } finally {
    // The recorder must unpause even if the CDP attach failed — a leaked pause would
    // starve the frame counter and quietly void the rest of the soak window.
    await cdp?.detach().catch(() => {});
    await setSoakPaused(page, false);
  }
  return page.evaluate((tag) => {
    const report = window.__THREE_GAME_DIAGNOSTICS__?.getReport?.();
    const heap = performance?.memory;
    const state = window.SF?.state;
    return {
      phaseTag: tag,
      at: new Date().toISOString(),
      mode: state?.mode || null,
      docked: state?.ui?.docked === true,
      heapBytes: Number.isFinite(heap?.usedJSHeapSize) ? heap.usedJSHeapSize : null,
      totalHeapBytes: Number.isFinite(heap?.totalJSHeapSize) ? heap.totalJSHeapSize : null,
      heapLimitBytes: Number.isFinite(heap?.jsHeapSizeLimit) ? heap.jsHeapSizeLimit : null,
      geometries: finiteOrNull(report?.memory?.geometries),
      textures: finiteOrNull(report?.memory?.textures),
      programs: finiteOrNull(report?.memory?.programs),
      // Identity detail so a nonzero programs delta names the exact variants that linked
      // mid-cycle instead of only counting them.
      programIdentities: Array.isArray(state?.render?.renderer?.info?.programs)
        ? state.render.renderer.info.programs.map((program) => {
          const key = String(program?.cacheKey || '');
          // Head carries the drifting parameter block (light/shadow counts, envMap mode,
          // boolean masks); tail carries the custom program cache key (material family).
          return `${String(program?.name || '?')}|${key.slice(0, 160)}|${key.slice(-40)}`;
        })
        : null,
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

// ── PQ-033.02 soak-window recorder ──────────────────────────────────────────
// An in-page rAF register counts every frame gap over the threshold and buckets
// all deltas, so the floors checker can recompute the whole-window median and
// the per-minute hitch count instead of trusting steady-state windows alone.
// Hitches ending inside a marked save/load transition carry that tag; nothing
// is dropped from the raw event list.

async function installSoakRecorder(page, { hitchThresholdMs = 50 } = {}) {
  await page.evaluate((threshold) => {
    const register = {
      active: true,
      startedAt: performance.now(),
      frames: 0,
      last: null,
      paused: false,
      thresholdMs: threshold,
      hitches: [],
      // Bounded log: the register stays window-reachable for the whole soak, so an
      // unbounded hitch array would grow the page heap the probe itself measures.
      // Counters stay authoritative when the log saturates.
      maxHitchEvents: 4000,
      hitchCount: 0,
      hitchGameplayCount: 0,
      hitchTransitionCount: 0,
      hitchExternalCount: 0,
      hitchUnattributedCount: 0,
      hitchMaxDeltaMs: 0,
      hitchMaxTransitionDeltaMs: 0,
      hitchOwnerCounts: {},
      pausedMs: 0,
      // Quarter-ms buckets keep the median source honest: a 1 ms floor(delta)
      // grid reads a true 16.9 ms median as 16.5 and would pass the 16.7 ms
      // floor on rounding alone.
      frameBucketScaleMs: 0.25,
      frameBuckets: {},
    };
    window.__SF_MIN_SPEC_SOAK__ = register;
    // The game's own hitch classifier (PQ-129.02) attributes each classified frame
    // to an owner — sim, presentation, compile, upload, admission, externalScheduling,
    // or unknown. The recorder diffs the histogram only on frames that could have been
    // classified (delta above the game threshold), so each read shows exactly one grown
    // owner for the frame that just elapsed. externalScheduling means the gap was not
    // consumed by in-page work — machine noise, recorded but not a product stall.
    const perf = window.__SPACEFACE_PERF__ || null;
    const attribution = {
      enabled: false,
      lastCounts: null,
    };
    if (perf && typeof perf.getHitchHistogram === 'function'
      && typeof perf.setHitchAttributionEnabled === 'function') {
      try {
        register.attributionWasEnabled = perf.hitchAttributionEnabled === true;
        register.renderWorkWasEnabled = typeof perf.isRenderWorkEnabled === 'function'
          ? perf.isRenderWorkEnabled() === true : false;
        register.systemTimingWasEnabled = typeof perf.isSystemTimingEnabled === 'function'
          ? perf.isSystemTimingEnabled() === true : false;
        if (typeof perf.setRenderWorkEnabled === 'function') perf.setRenderWorkEnabled(true);
        if (typeof perf.setSystemTimingEnabled === 'function') perf.setSystemTimingEnabled(true);
        perf.setHitchAttributionEnabled(true);
        attribution.lastCounts = { ...perf.getHitchHistogram().counts };
        attribution.enabled = true;
      } catch (_) { attribution.enabled = false; }
    }
    register.hitchAttributionEnabled = attribution.enabled;
    // If the page hides/shows, the game's rAF chain can die and re-register — the
    // recorder's read then runs before the game's classify for a frame, so an
    // externalScheduling verdict could attach one frame late and launder a real
    // hitch. For a bounded window after any visibility change, no hitch may claim
    // the external exemption.
    register.orderUncertainUntil = 0;
    register.onVisibilityChange = () => { register.orderUncertainUntil = performance.now() + 3_000; };
    try { document.addEventListener('visibilitychange', register.onVisibilityChange); } catch (_) { /* optional */ }
    const tick = (t) => {
      const current = window.__SF_MIN_SPEC_SOAK__;
      if (current !== register || !current.active) return;
      // While paused (measurement apparatus forcing GC pauses), keep the rAF chain
      // alive and rebase `last` so the stall is not charged to the game. The first
      // tick after the flag clears also rebases — the unpause evaluate resolves
      // before that tick, so without this the GC gap would still be recorded.
      if (current.paused) {
        if (current.last != null) current.pausedMs += t - current.last;
        current.last = t;
        current.wasPaused = true;
        requestAnimationFrame(tick);
        return;
      }
      if (current.wasPaused) {
        current.wasPaused = false;
        current.last = t;
        // The game's classifier kept accumulating through the pause; rebase the diff
        // baseline so paused-period owners cannot bleed into the next frame's verdict.
        if (attribution.enabled) {
          try { attribution.lastCounts = { ...perf.getHitchHistogram().counts }; } catch (_) { /* keep prior baseline */ }
        }
        requestAnimationFrame(tick);
        return;
      }
      if (current.last != null) {
        const delta = t - current.last;
        current.frames += 1;
        const scale = current.frameBucketScaleMs || 1;
        const bucket = delta < 10_000 ? Math.floor(delta / scale) : Math.floor(10_000 / scale);
        current.frameBuckets[bucket] = (current.frameBuckets[bucket] || 0) + 1;
        // A transition tag can carry a bounded settle expiry: the tag stays armed
        // for settleMs after the probe marks the transition complete, covering the
        // teardown/rebind tail the transition caused, then self-clears so chronic
        // hitches cannot hide inside an open-ended transition span.
        let tag = window.__SF_MIN_SPEC_TRANSITION__ || null;
        if (tag) {
          const clearAt = window.__SF_MIN_SPEC_TRANSITION_CLEAR__;
          if (clearAt != null && t >= clearAt) {
            delete window.__SF_MIN_SPEC_TRANSITION__;
            delete window.__SF_MIN_SPEC_TRANSITION_CLEAR__;
            tag = null;
          }
        }
        // pendingPipelines is recorded on every event for audit, but a positive
        // count never reclasses the hitch: the deferred-flush hold can keep the
        // queue non-empty for ~20 s after each load, which would launder real
        // gameplay stalls into the transition class without bound.
        let pendingPipelines = 0;
        try {
          pendingPipelines = Number(window.SF?.state?.render?.pendingPipelineAdmissions?.()) || 0;
        } catch { pendingPipelines = 0; }
        // Read the game's classifier only on frames it could have classified
        // (its threshold is 32 ms). Between reads, at most one such frame elapsed,
        // so a single grown owner names this frame's cause. A total count that
        // dropped since the last read means a measurement window called
        // perf.reset() mid-soak — re-baseline instead of attributing.
        let hitchOwner = null;
        if (attribution.enabled && delta > 30) {
          try {
            const counts = perf.getHitchHistogram().counts;
            let countTotal = 0;
            let lastTotal = 0;
            const grown = [];
            for (const owner of Object.keys(counts)) {
              const value = counts[owner] || 0;
              countTotal += value;
              lastTotal += attribution.lastCounts[owner] || 0;
              if (value - (attribution.lastCounts[owner] || 0) > 0) grown.push(owner);
            }
            attribution.lastCounts = counts;
            if (countTotal < lastTotal) {
              attribution.resets = (attribution.resets || 0) + 1;
            } else if (grown.length === 1) hitchOwner = grown[0];
            else if (grown.length > 1) hitchOwner = 'ambiguous';
          } catch (_) { /* attribution stays null */ }
        }
        if (delta > current.thresholdMs) {
          current.hitchCount += 1;
          if (delta > current.hitchMaxDeltaMs) current.hitchMaxDeltaMs = delta;
          if (hitchOwner) {
            current.hitchOwnerCounts[hitchOwner] = (current.hitchOwnerCounts[hitchOwner] || 0) + 1;
          }
          if (tag) {
            current.hitchTransitionCount += 1;
            if (delta > current.hitchMaxTransitionDeltaMs) current.hitchMaxTransitionDeltaMs = delta;
          } else if (hitchOwner === 'externalScheduling' && t >= current.orderUncertainUntil) {
            current.hitchExternalCount += 1;
          } else {
            current.hitchGameplayCount += 1;
            if (!hitchOwner) current.hitchUnattributedCount += 1;
          }
          if (current.hitches.length < current.maxHitchEvents) {
            current.hitches.push({
              atMs: t - current.startedAt,
              deltaMs: delta,
              transition: tag,
              pendingPipelines,
              owner: hitchOwner,
            });
          } else {
            current.hitchEventsTruncated = true;
          }
        }
      }
      current.last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, hitchThresholdMs);
}

async function setSoakTransition(page, name, { settleMs = 0 } = {}) {
  try {
    await page.evaluate(({ value, settle }) => {
      if (value == null) {
        if (settle > 0 && window.__SF_MIN_SPEC_TRANSITION__) {
          // Keep the current tag armed for the bounded settle window; the recorder
          // clears it in-page when the deadline passes.
          window.__SF_MIN_SPEC_TRANSITION_CLEAR__ = performance.now() + settle;
          return;
        }
        delete window.__SF_MIN_SPEC_TRANSITION__;
        delete window.__SF_MIN_SPEC_TRANSITION_CLEAR__;
        return;
      }
      window.__SF_MIN_SPEC_TRANSITION__ = value;
      delete window.__SF_MIN_SPEC_TRANSITION_CLEAR__;
    }, { value: name, settle: settleMs });
  } catch { /* page may be mid-navigation; transition tagging is best-effort */ }
}

async function setSoakPaused(page, paused) {
  try {
    await page.evaluate((value) => {
      const register = window.__SF_MIN_SPEC_SOAK__;
      if (!register) return;
      register.paused = value === true;
      if (value !== true) {
        // Arm the rebase unconditionally: if the apparatus stall resolved before
        // any tick observed `paused`, the gap would otherwise still be recorded.
        register.wasPaused = true;
      }
    }, paused);
  } catch { /* recorder absent is fine — nothing to pause */ }
}

async function stopSoakRecorder(page, { startedAt } = {}) {
  const snapshot = await page.evaluate(() => {
    const register = window.__SF_MIN_SPEC_SOAK__;
    if (!register) return null;
    register.active = false;
    const snapshot = {
      durationMs: performance.now() - register.startedAt,
      frameCount: register.frames,
      hitchThresholdMs: register.thresholdMs,
      hitchEvents: register.hitches,
      hitchCount: register.hitchCount,
      hitchGameplayCount: register.hitchGameplayCount,
      hitchTransitionCount: register.hitchTransitionCount,
      hitchExternalCount: register.hitchExternalCount,
      hitchUnattributedCount: register.hitchUnattributedCount,
      hitchMaxDeltaMs: register.hitchMaxDeltaMs,
      hitchMaxTransitionDeltaMs: register.hitchMaxTransitionDeltaMs,
      hitchEventsTruncated: register.hitchEventsTruncated === true,
      hitchOwnerCounts: register.hitchOwnerCounts,
      pausedMs: register.pausedMs,
      frameBucketScaleMs: register.frameBucketScaleMs,
      frameBuckets: register.frameBuckets,
      hitchAttributionEnabled: register.hitchAttributionEnabled === true,
    };
    // Soak-level owner totals from the game's own classifier, for audit. The
    // register's per-event owner counts are the authoritative soak totals — the
    // histogram may have been reset by measurement windows mid-soak.
    try {
      const perf = window.__SPACEFACE_PERF__;
      if (snapshot.hitchAttributionEnabled && perf?.getHitchHistogram) {
        snapshot.hitchAttribution = perf.getHitchHistogram();
      }
      if (perf?.setHitchAttributionEnabled) {
        perf.setHitchAttributionEnabled(register.attributionWasEnabled === true);
      }
      if (perf?.setRenderWorkEnabled) perf.setRenderWorkEnabled(register.renderWorkWasEnabled === true);
      if (perf?.setSystemTimingEnabled) perf.setSystemTimingEnabled(register.systemTimingWasEnabled === true);
    } catch (_) { /* attribution stays absent */ }
    if (register.onVisibilityChange) {
      try { document.removeEventListener('visibilitychange', register.onVisibilityChange); } catch (_) { /* ignore */ }
    }
    // Release the register so it cannot linger in post-soak heap evidence.
    delete window.__SF_MIN_SPEC_SOAK__;
    return snapshot;
  }).catch(() => null);
  if (!snapshot) return null;
  return {
    ...snapshot,
    startedAt: startedAt ? new Date(startedAt).toISOString() : null,
    endedAt: new Date().toISOString(),
  };
}

function readMinSpecHitchThreshold(root) {
  try {
    const threshold = Number(loadMinSpec(root)?.floors?.hitchThresholdMs);
    return Number.isFinite(threshold) && threshold > 0 ? threshold : 50;
  } catch {
    return 50;
  }
}

function evaluateFloorsSafely(root, evidence) {
  try {
    return evaluateMinSpecFloors(evidence, loadMinSpec(root));
  } catch (error) {
    return { pass: false, failures: [`min-spec floor evaluation unavailable: ${error?.message || error}`], floors: {} };
  }
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
    at: issue.at || undefined,
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
    browserClosed: report?.browserServerClosed === true || report?.browserClosed === true,
    serverReleased: report?.serverReleased === true,
    processExited: report?.browserProcessExited === true,
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

function buildArtifactDescriptors(root, outputDir, routeResult, cycleResults, packagedStartup = null) {
  const entries = [
    ['telemetry', 'performance-telemetry.json'],
    ['telemetry', 'performance-attribution.json'],
    ['telemetry', 'memory-telemetry.json'],
    ['telemetry', 'error-telemetry.json'],
    ['telemetry', 'context-loss-telemetry.json'],
    ['log', 'run.log'],
    ['screenshot', 'context-restored.png'],
    ...(packagedStartup ? [['packaged-startup', path.basename(packagedStartup.report.path)]] : []),
    ...(routeResult?.screenshots || []).map((name) => ['screenshot', name]),
    ...cycleResults.filter((cycle) => cycle.screenshot).map((cycle) => ['screenshot', cycle.screenshot]),
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

async function inspectPerformanceActivity(root, {
  processSampleMs = PERFORMANCE_ACTIVITY_SAMPLE_MS,
  processSnapshotReader = readPerformanceProcessSnapshot,
  processWaitFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  settleTransientProcessChurn = false,
} = {}) {
  const lockRoot = path.join(root, 'assets', 'ships', 'release.__lock');
  const buildingPath = path.join(root, 'assets', 'ships', 'release.__building');
  const [releaseLock, releaseBuilding, processes] = await Promise.all([
    inspectActivityPath(lockRoot, path.join(lockRoot, 'owner.json')),
    inspectActivityPath(buildingPath, buildingPath),
    inspectPerformanceContaminants({
      sampleMs: processSampleMs,
      snapshotReader: processSnapshotReader,
      waitFn: processWaitFn,
      maxAttempts: settleTransientProcessChurn ? 3 : 1,
    }),
  ]);
  const active = releaseLock.active === true || releaseBuilding.active === true || processes.active === true
    ? true
    : (releaseLock.active === false && releaseBuilding.active === false
      && processes.available === true && processes.active === false ? false : null);
  return {
    capturedAt: new Date().toISOString(),
    releaseLock,
    releaseBuilding,
    contaminatingProcesses: processes,
    active,
  };
}

async function authorizeReleaseSoak({
  root,
  runtime,
  outputRoot,
  manifest,
  brokerClaimToken,
}) {
  if (!manifest) {
    return Object.freeze({
      mode: 'diagnostic',
      primaryAcceptance: false,
      manifestId: null,
      claimId: null,
      digests: null,
      consumedClaim: null,
      fixedSeed: null,
    });
  }
  assert.equal(manifest.runtimeKind, runtime, 'release-soak manifest runtime must match its locked wrapper');
  assert.equal(manifest.mode, 'acceptance', 'release-soak manifest must request acceptance mode');
  const gate = await requireBrokerClaimOrDiagnostic({
    outputRoot,
    manifest,
    tokenOrPath: brokerClaimToken,
    diagnostic: false,
    explicitDiagnostic: false,
    root,
    requiredMode: 'acceptance',
    requiredRuntimeKind: runtime,
    consume: true,
  });
  if (!gate.ok || gate.primaryAcceptance !== true) {
    const error = new Error(`RELEASE_SOAK_AUTHORITY_REJECTED: ${gate.reason}`);
    error.code = 'RELEASE_SOAK_AUTHORITY_REJECTED';
    error.reason = gate.reason;
    throw error;
  }
  const claimId = gate.claim?.claimId;
  const ledgerEntry = await readConsumedClaimLedgerEntry(outputRoot, claimId);
  assert(ledgerEntry, 'consumed broker claim ledger entry is required before runtime launch');
  assert.equal(ledgerEntry.claimId, claimId, 'consumed ledger claim id must match broker authority');
  assert.equal(ledgerEntry.runtimeKind, runtime, 'consumed ledger runtime must match the locked wrapper');
  assert.equal(ledgerEntry.mode, 'acceptance', 'consumed ledger mode must be acceptance');
  const ledgerPath = path.join(
    outputRoot,
    'broker-claims',
    '.consumed',
    `${String(claimId).replace(/[^a-zA-Z0-9._-]/g, '')}.json`,
  );
  const ledgerBytes = await readFile(ledgerPath);
  const digests = gate.claim?.digests ?? null;
  assert(digests?.sourceCandidateDigest, 'release-soak claim requires sourceCandidateDigest');
  assert(digests?.candidateDigest, 'release-soak claim requires candidateDigest');
  assert.equal(ledgerEntry.candidateDigest, digests.candidateDigest,
    'consumed ledger candidate digest must match broker authority');
  return Object.freeze({
    mode: 'acceptance',
    primaryAcceptance: true,
    manifestId: manifest.id,
    claimId,
    digests,
    consumedClaim: Object.freeze({
      claimId,
      path: relativeTo(root, ledgerPath),
      bytes: ledgerBytes.length,
      sha256: createHash('sha256').update(ledgerBytes).digest('hex'),
    }),
    fixedSeed: Number(manifest.fixedSeed ?? process.env.SF_PROBE_SEED ?? 47),
  });
}

async function runPackagedStartupSubroute({ root, outputDir, authority, log = () => {} }) {
  const reportPath = path.join(outputDir, 'packaged-startup-report.json');
  const stdout = await captureProcessOutput(
    process.execPath,
    [path.join(root, 'scripts', 'check-electron-packaged-startup.mjs')],
    4 * 1024 * 1024,
    {
      cwd: root,
      env: {
        ...process.env,
        SF_PACKAGED_STARTUP_REPORT_PATH: reportPath,
      },
    },
  );
  log(`[packaged-startup] ${stdout.trim().split(/\r?\n/).at(-1) || 'completed'}`);
  const reportBytes = await readFile(reportPath);
  const report = JSON.parse(reportBytes.toString('utf8'));
  assert.equal(report.pass, true, `packaged startup failed: ${report.failure?.message || 'unknown failure'}`);
  assert.equal(report.mainIdentity?.packaged, true, 'packaged startup must prove app.isPackaged');
  assert.equal(report.cleanup?.pass, true, 'packaged startup must prove owned cleanup');
  assert(/^[a-f0-9]{64}$/i.test(report.artifactIdentity?.executable?.sha256 || ''),
    'packaged startup executable digest is required');
  assert(/^[a-f0-9]{64}$/i.test(report.artifactIdentity?.appArchive?.sha256 || ''),
    'packaged startup app archive digest is required');
  return Object.freeze({
    schema: 'spaceface.electronPackagedStartupSubreceipt.v1',
    pass: true,
    claimId: authority.claimId,
    report: Object.freeze({
      path: relativeTo(root, reportPath),
      bytes: reportBytes.length,
      sha256: createHash('sha256').update(reportBytes).digest('hex'),
    }),
    packageIdentity: report.artifactIdentity,
    runtimeIdentity: report.mainIdentity,
    timing: report.timing || null,
    cleanup: report.cleanup,
  });
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

async function inspectPerformanceContaminants({
  sampleMs = PERFORMANCE_ACTIVITY_SAMPLE_MS,
  snapshotReader = readPerformanceProcessSnapshot,
  waitFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxAttempts = 1,
  platform = process.platform,
} = {}) {
  if (platform !== 'win32') {
    return {
      available: false,
      active: null,
      names: [],
      entries: [],
      reasons: [`unsupported-platform:${platform}`],
    };
  }
  try {
    assert(Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 3,
      'performance activity attempts must be an integer from 1 to 3');
    assert.equal(typeof waitFn, 'function', 'performance activity waitFn must be callable');
    const attempts = [];
    let sawTransientChurn = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const before = await snapshotReader();
      await waitFn(sampleMs);
      const after = await snapshotReader();
      const result = classifyPerformanceProcessActivity({ before, after, sampleMs });
      attempts.push({
        attempt,
        available: result.available,
        active: result.active,
        processCount: result.processCount,
        aggregateCpuDeltaSeconds: result.aggregateCpuDeltaSeconds,
        aggregateCpuCoreFraction: result.aggregateCpuCoreFraction,
        started: result.started,
        ended: result.ended,
        reasons: result.reasons,
      });
      const transientChurnOnly = result.available === true
        && result.active === true
        && result.reasons.length === 1
        && result.reasons[0] === 'process-churn';
      if (transientChurnOnly && attempt < maxAttempts) {
        // A terminated process has unknowable post-snapshot CPU, so never accept this sample.
        // Preflight may instead require a wholly new bounded sample; end-of-run callers use one try.
        sawTransientChurn = true;
        continue;
      }
      return {
        ...result,
        attemptCount: attempt,
        settledAfterTransientChurn: sawTransientChurn && result.active === false,
        attempts,
      };
    }
    throw new Error('performance activity census exhausted without a terminal result');
  } catch (error) {
    return {
      available: false,
      active: null,
      sampleMs: Number.isFinite(sampleMs) ? sampleMs : null,
      names: [],
      entries: [],
      attemptCount: 0,
      settledAfterTransientChurn: false,
      attempts: [],
      reasons: [error?.message || String(error)],
    };
  }
}

async function readPerformanceProcessSnapshot() {
  const stdout = await captureProcessOutput('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    PERFORMANCE_PROCESS_SNAPSHOT_SCRIPT,
  ]);
  const parsed = JSON.parse(stdout || '[]');
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function readWindowsBrowserProcessTreeSnapshot() {
  const stdout = await captureProcessOutput('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    WINDOWS_BROWSER_PROCESS_TREE_SCRIPT,
  ]);
  const parsed = JSON.parse(stdout || '[]');
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function collectOwnedProcessTreePids(snapshot, rootPid) {
  const root = Number(rootPid);
  if (!Number.isSafeInteger(root) || root <= 0) return [];
  const rows = (Array.isArray(snapshot) ? snapshot : []).map((entry) => ({
    pid: Number(entry?.pid),
    parentPid: Number(entry?.parentPid),
  })).filter((entry) => Number.isSafeInteger(entry.pid) && entry.pid > 0
    && Number.isSafeInteger(entry.parentPid) && entry.parentPid >= 0);
  const owned = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!owned.has(row.pid) && owned.has(row.parentPid)) {
        owned.add(row.pid);
        changed = true;
      }
    }
  }
  return [...owned].sort((a, b) => a - b);
}

export async function waitForOwnedProcessTreeExit({
  rootPid,
  initialPids = [],
  platform = process.platform,
  snapshotReader = readWindowsBrowserProcessTreeSnapshot,
  waitFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 5_000,
  pollMs = 250,
} = {}) {
  const root = Number(rootPid);
  if (platform !== 'win32') {
    return { available: false, pass: true, rootPid: Number.isSafeInteger(root) ? root : null, observedPids: [], lingeringPids: [], attempts: 0 };
  }
  assert(Number.isSafeInteger(root) && root > 0, 'owned browser process tree requires a positive root pid');
  assert.equal(typeof snapshotReader, 'function', 'owned browser process tree snapshot reader must be callable');
  assert.equal(typeof waitFn, 'function', 'owned browser process tree wait function must be callable');
  assert(Number.isFinite(timeoutMs) && timeoutMs >= 250 && timeoutMs <= 10_000,
    'owned browser process tree timeout must be between 250 and 10000 ms');
  assert(Number.isFinite(pollMs) && pollMs >= 25 && pollMs <= timeoutMs,
    'owned browser process tree poll interval must be bounded by its timeout');

  const observed = new Set([root, ...(Array.isArray(initialPids) ? initialPids : [])]
    .map(Number).filter((pid) => Number.isSafeInteger(pid) && pid > 0));
  const maxAttempts = Math.ceil(timeoutMs / pollMs) + 1;
  let attempts = 0;
  let lingeringPids = [];
  while (attempts < maxAttempts) {
    attempts += 1;
    const snapshot = await snapshotReader();
    for (const pid of collectOwnedProcessTreePids(snapshot, root)) observed.add(pid);
    const livePids = new Set((Array.isArray(snapshot) ? snapshot : [])
      .map((entry) => Number(entry?.pid))
      .filter((pid) => Number.isSafeInteger(pid) && pid > 0));
    lingeringPids = [...observed].filter((pid) => livePids.has(pid)).sort((a, b) => a - b);
    if (lingeringPids.length === 0) {
      return {
        available: true,
        pass: true,
        rootPid: root,
        observedPids: [...observed].sort((a, b) => a - b),
        lingeringPids: [],
        attempts,
      };
    }
    if (attempts >= maxAttempts) break;
    await waitFn(pollMs);
  }

  return {
    available: true,
    pass: false,
    rootPid: root,
    observedPids: [...observed].sort((a, b) => a - b),
    lingeringPids,
    attempts,
  };
}

export function classifyPerformanceProcessActivity({
  before,
  after,
  sampleMs,
  maxAggregateCpuCoreFraction = PERFORMANCE_ACTIVITY_MAX_AGGREGATE_CPU_CORE_FRACTION,
  maxProcessCpuCoreFraction = PERFORMANCE_ACTIVITY_MAX_PROCESS_CPU_CORE_FRACTION,
} = {}) {
  const reasons = [];
  if (!Array.isArray(before) || !Array.isArray(after)
    || !Number.isFinite(sampleMs) || sampleMs < 100
    || !Number.isFinite(maxAggregateCpuCoreFraction) || maxAggregateCpuCoreFraction < 0
    || !Number.isFinite(maxProcessCpuCoreFraction) || maxProcessCpuCoreFraction < 0) {
    return {
      available: false,
      active: null,
      sampleMs: Number.isFinite(sampleMs) ? sampleMs : null,
      processCount: 0,
      names: [],
      entries: [],
      aggregateCpuDeltaSeconds: null,
      aggregateCpuCoreFraction: null,
      started: [],
      ended: [],
      reasons: ['snapshot-unavailable-or-invalid'],
    };
  }

  const normalize = (entries) => entries.map((entry) => ({
    name: String(entry?.name || '').trim().toLowerCase(),
    pid: Number(entry?.pid),
    cpuSeconds: Number(entry?.cpuSeconds),
  })).filter((entry) => PERFORMANCE_CONTAMINANT_PATTERN.test(entry.name));
  const normalizedBefore = normalize(before);
  const normalizedAfter = normalize(after);
  const snapshotsValid = [...normalizedBefore, ...normalizedAfter].every((entry) => (
    entry.name && Number.isInteger(entry.pid) && entry.pid > 0
    && Number.isFinite(entry.cpuSeconds) && entry.cpuSeconds >= 0
  ));
  if (!snapshotsValid) {
    return {
      available: false,
      active: null,
      sampleMs,
      processCount: 0,
      names: [],
      entries: [],
      aggregateCpuDeltaSeconds: null,
      aggregateCpuCoreFraction: null,
      started: [],
      ended: [],
      reasons: ['snapshot-invalid-process-record'],
    };
  }

  const byPidBefore = new Map(normalizedBefore.map((entry) => [entry.pid, entry]));
  const byPidAfter = new Map(normalizedAfter.map((entry) => [entry.pid, entry]));
  const started = normalizedAfter.filter((entry) => !byPidBefore.has(entry.pid)
    || byPidBefore.get(entry.pid).name !== entry.name);
  const ended = normalizedBefore.filter((entry) => !byPidAfter.has(entry.pid)
    || byPidAfter.get(entry.pid).name !== entry.name);
  if (started.length > 0 || ended.length > 0) reasons.push('process-churn');

  const entries = normalizedAfter.map((entry) => {
    const prior = byPidBefore.get(entry.pid);
    const rawDelta = prior && prior.name === entry.name ? entry.cpuSeconds - prior.cpuSeconds : 0;
    if (rawDelta < -1e-6) reasons.push(`process-cpu-regressed:${entry.name}:${entry.pid}`);
    return {
      name: entry.name,
      pid: entry.pid,
      cpuDeltaSeconds: Number(Math.max(0, rawDelta).toFixed(6)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.pid - b.pid);
  const aggregateCpuDeltaSeconds = Number(entries
    .reduce((sum, entry) => sum + entry.cpuDeltaSeconds, 0).toFixed(6));
  const sampleSeconds = sampleMs / 1_000;
  const aggregateCpuCoreFraction = aggregateCpuDeltaSeconds / sampleSeconds;
  if (aggregateCpuCoreFraction > maxAggregateCpuCoreFraction) reasons.push('aggregate-cpu-delta');
  for (const entry of entries) {
    if (entry.cpuDeltaSeconds / sampleSeconds > maxProcessCpuCoreFraction) {
      reasons.push(`process-cpu-delta:${entry.name}:${entry.pid}`);
    }
  }

  return {
    available: true,
    active: reasons.length > 0,
    sampleMs,
    thresholds: {
      maxAggregateCpuCoreFraction,
      maxProcessCpuCoreFraction,
    },
    processCount: entries.length,
    names: [...new Set(entries.map((entry) => entry.name))].sort((a, b) => a.localeCompare(b)),
    entries,
    aggregateCpuDeltaSeconds,
    aggregateCpuCoreFraction,
    started,
    ended,
    reasons: [...new Set(reasons)],
  };
}

function captureProcessOutput(command, args, maxBytes = 4 * 1024 * 1024, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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

async function readAttributionEnvironment(
  page,
  browser,
  viewport,
  seed,
  activity,
  runtimeKind,
  electronRuntime = null,
) {
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
    runtimeKind,
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
    ...(runtimeKind === 'electron' ? { electronRuntime } : {}),
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

async function closeAttributionResources({
  runtimeKind,
  page,
  context,
  browser,
  browserServer,
  browserChildProcess,
  ownedServer,
  canonicalUrlTracker,
  electronApp,
  childProcess,
  processMonitor,
  rootUrl,
}) {
  try {
    if (runtimeKind === 'electron') {
      return await closeOwnedElectronRuntime({
        page,
        electronApp,
        childProcess,
        canonicalUrlTracker,
        processMonitor,
        rootUrl,
      });
    }
    let processTree = null;
    if (process.platform === 'win32' && Number.isSafeInteger(Number(browserChildProcess?.pid))) {
      // BrowserServer.close() awaits its direct Chrome child, but Windows may retain a renderer or
      // GPU descendant for another scheduler turn. Capture the owned tree while its parent links
      // are still intact, then prove every descendant is gone before the one-shot end census.
      const snapshot = await readWindowsBrowserProcessTreeSnapshot();
      processTree = {
        rootPid: Number(browserChildProcess.pid),
        initialPids: collectOwnedProcessTreePids(snapshot, browserChildProcess.pid),
      };
    }
    const report = await closeOwnedResources({
      page,
      context,
      browser,
      browserServer,
      browserChildProcess,
      server: ownedServer,
      canonicalUrlTracker,
    });
    if (processTree) {
      report.browserProcessTree = await waitForOwnedProcessTreeExit(processTree);
      if (report.browserProcessTree.pass !== true) {
        report.pass = false;
        report.failures.push({
          name: 'browser-process-tree-exit',
          error: { message: `owned Chrome descendants remained after bounded cleanup: ${report.browserProcessTree.lingeringPids.join(', ')}` },
        });
        const error = new AggregateError(
          report.failures.map((failure) => new Error(`${failure.name}: ${failure.error.message}`)),
          'owned runtime cleanup failed',
        );
        error.cleanupReport = report;
        throw error;
      }
    }
    return report;
  } catch (error) {
    if (runtimeKind === 'electron') {
      return error?.cleanupReport || {
        pass: false,
        pageClosed: page?.isClosed?.() === true,
        appCloseCompleted: false,
        processExited: false,
        listenerReleased: false,
        failures: [{ name: 'cleanup', error: { message: error?.message || String(error) } }],
      };
    }
    return error?.cleanupReport || {
      pass: false,
      pageClosed: page?.isClosed?.() === true,
      browserDisconnected: browser ? !browser.isConnected() : true,
      browserServerClosed: browserServer ? false : true,
      browserProcessExited: browserServer ? false : true,
      serverReleased: ownedServer?.server?.listening === false,
      failures: [{ name: 'cleanup', error: { message: error?.message || String(error) } }],
    };
  }
}

async function finalizePerformanceAttributionRun({
  root,
  outputRoot,
  outputDir,
  taskId,
  seed,
  viewport,
  document,
  routeResult,
  startFingerprint,
  activity,
  runtimeKind,
  electronRuntime,
  authority,
  pageIssueTracker,
  page,
  context,
  browser,
  browserServer,
  browserChildProcess,
  ownedServer,
  canonicalUrlTracker,
  electronApp,
  childProcess,
  processMonitor,
  rootUrl,
  logLines,
  additionalDocumentValidator,
  setCleanupReport,
}) {
  const measurementState = await disableMeasurementGates(page);
  const measurementDisabled = measurementState.renderWorkEnabled !== true
    && measurementState.systemTimingEnabled !== true
    && measurementState.backgroundJobTrackingEnabled !== true
    && measurementState.gpuTimersEnabled !== true
    && measurementState.dynamicBufferProbeForceFullUploads !== true
    && measurementState.restoreJournalPresent !== true;
  const environment = await readAttributionEnvironment(
    page,
    browser,
    viewport,
    seed,
    { start: activity, end: null },
    runtimeKind,
    electronRuntime,
  );
  await page.screenshot({
    path: path.join(outputDir, 'performance-closure-overview.png'),
    type: 'png',
    animations: 'disabled',
  });
  const ownedCleanup = await closeAttributionResources({
    runtimeKind,
    page,
    context,
    browser,
    browserServer,
    browserChildProcess,
    ownedServer,
    canonicalUrlTracker,
    electronApp,
    childProcess,
    processMonitor,
    rootUrl,
  });
  setCleanupReport(ownedCleanup);

  const errors = buildErrorEvidence(runtimeKind, pageIssueTracker);
  const closureWindows = buildClosureWindows(document, environment, errors, measurementDisabled);
  await writeFile(path.join(outputDir, 'performance-windows.json'), `${JSON.stringify(closureWindows, null, 2)}\n`, 'utf8');
  pageIssueTracker?.stop?.();

  const normalizedCleanup = normalizeCleanup(runtimeKind, ownedCleanup);
  const cleanupValidation = validateCleanupEvidence(normalizedCleanup, { runtimeKind });
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

  document.runtimeKind = runtimeKind;
  document.authority = authority;
  document.primaryAcceptance = authority.primaryAcceptance === true;
  document.taskId = taskId;
  document.worktree = closureReport.worktree;
  document.environment = environment;
  document.artifacts = artifactValidation.verified;
  document.cleanup = cleanup;
  document.errors = errors;
  document.route = routeResult;
  document.closure = closureReport;
  document.validation = validatePerformanceAttribution(document);

  const baseFailures = [
    ...document.validation.failures,
    ...closureReport.validation.failures,
    ...artifactValidation.failures,
    ...cleanupValidation.failures,
  ];
  if (routeResult?.pass !== true) baseFailures.push('shared public route did not pass');
  if (errorCount(errors) > 0) baseFailures.push('page/runtime errors or warnings were observed');
  document.baseValidation = {
    pass: baseFailures.length === 0,
    failures: [...new Set(baseFailures)],
  };
  document.pass = document.baseValidation.pass;
  const specializedValidation = typeof additionalDocumentValidator === 'function'
    ? await additionalDocumentValidator(document)
    : null;
  if (specializedValidation) document.specializedValidation = specializedValidation;
  const failures = [
    ...baseFailures,
    ...(specializedValidation?.pass === false
      ? specializedValidation.failures || ['specialized acceptance validation failed']
      : []),
  ];
  const validation = { pass: failures.length === 0, failures: [...new Set(failures)] };
  const pass = validation.pass;
  document.pass = pass;

  const outPath = path.join(outputDir, 'performance-attribution.json');
  const closurePath = path.join(outputDir, 'performance-closure.json');
  await Promise.all([
    writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8'),
    writeFile(closurePath, `${JSON.stringify(closureReport, null, 2)}\n`, 'utf8'),
  ]);
  const acceptedEvidencePath = authority.primaryAcceptance === true && pass
    ? await publishPerformanceAttributionAuthorityEvidence({
      root,
      outputRoot,
      runtimeKind,
      authority,
      outPath,
      closurePath,
      closureReport,
    })
    : null;
  return {
    pass,
    outPath,
    closurePath,
    acceptedEvidencePath,
    outputDir,
    document,
    closureReport,
    validation,
  };
}

async function publishPerformanceAttributionAuthorityEvidence({
  root,
  outputRoot,
  runtimeKind,
  authority,
  outPath,
  closurePath,
  closureReport,
}) {
  assert.equal(authority.primaryAcceptance, true, 'primary evidence requires acceptance authority');
  assert(authority.claimId, 'primary evidence requires consumed claim identity');
  assert(authority.digests?.candidateDigest, 'primary evidence requires candidate-bound digests');
  assert(authority.digests?.sourceCandidateDigest, 'primary evidence requires source-candidate identity');
  const rawTrace = closureReport.artifacts?.find((artifact) => artifact.kind === 'raw-evidence');
  assert(rawTrace && /^[a-f0-9]{64}$/i.test(rawTrace.sha256), 'primary evidence requires a content-hashed raw trace');
  const evidence = {
    schema: PERFORMANCE_CLOSURE_ACCEPTANCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    pass: true,
    primaryAcceptance: true,
    runtimeKind,
    claimId: authority.claimId,
    sourceCandidateDigest: authority.digests.sourceCandidateDigest,
    candidateDigest: authority.digests.candidateDigest,
    rawTraceDigest: rawTrace.sha256,
    digests: authority.digests,
    artifacts: {
      attribution: relativeTo(root, outPath),
      closure: relativeTo(root, closurePath),
      rawTrace,
    },
    closure: {
      schema: closureReport.schema,
      taskId: closureReport.taskId,
      generatedAt: closureReport.generatedAt,
      worktree: closureReport.worktree,
      measurementValidity: closureReport.measurementValidity,
      validation: closureReport.validation,
    },
  };
  const evidenceDir = path.join(outputRoot, runtimeKind);
  await mkdir(evidenceDir, { recursive: true });
  const evidencePath = path.join(evidenceDir, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidencePath;
}

/**
 * Full headed attribution matrix on the shared canonical Browser/Electron game route.
 * Writes performance-attribution.json under outputDir. Does not fork game serving policy.
 */
async function runPerformanceAttributionProbe({
  root,
  runtimeKind = 'browser',
  manifest,
  mode = 'diagnostic',
  brokerClaimToken = process.env.SF_BROKER_CLAIM ?? null,
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
  enableTier1Counters = false,
  activityInspector = inspectPerformanceActivity,
  log = () => {},
  additionalDocumentValidator = null,
} = {}) {
  assert(root, 'runPerformanceAttributionProbe requires root');
  const runtimePlan = performanceAttributionRuntimePlan(runtimeKind);
  assert(manifest?.id, 'runPerformanceAttributionProbe requires its tracked manifest');
  assert.equal(manifest.runtimeKind, runtimeKind, 'manifest runtime must match attribution runtime');
  assert(['diagnostic', 'acceptance'].includes(mode), 'mode must be diagnostic or acceptance');
  const outRoot = outputRoot || path.join(root, '.devshots', 'perf');
  let gate = await requireBrokerClaimOrDiagnostic({
    outputRoot: outRoot,
    manifest,
    tokenOrPath: brokerClaimToken,
    diagnostic: mode === 'diagnostic',
    explicitDiagnostic: mode === 'diagnostic',
    root,
    requiredMode: mode,
    requiredRuntimeKind: runtimeKind,
    consume: mode !== 'acceptance',
  });
  if (!gate.ok) {
    const error = new Error(`PERFORMANCE_ATTRIBUTION_AUTHORITY_REJECTED: ${gate.reason}`);
    error.code = 'PERFORMANCE_ATTRIBUTION_AUTHORITY_REJECTED';
    error.reason = gate.reason;
    throw error;
  }
  let activity = null;
  if (mode === 'acceptance') {
    try {
      // Settle churn only before consuming the claim. The retained start authority is the fresh
      // quiet sample; end-of-run activity remains a single fail-closed observation.
      activity = await activityInspector(root, { settleTransientProcessChurn: true });
    } catch (error) {
      activity = { capturedAt: new Date().toISOString(), active: null, error: error?.message || String(error) };
    }
    if (activity?.active !== false) {
      const error = new Error('PERFORMANCE_ATTRIBUTION_ENVIRONMENT_BLOCKED: performance activity census is active or unavailable');
      error.code = 'PERFORMANCE_ATTRIBUTION_ENVIRONMENT_BLOCKED';
      error.activity = activity;
      throw error;
    }
    gate = await requireBrokerClaimOrDiagnostic({
      outputRoot: outRoot,
      manifest,
      tokenOrPath: brokerClaimToken,
      diagnostic: false,
      explicitDiagnostic: false,
      root,
      requiredMode: mode,
      requiredRuntimeKind: runtimeKind,
      consume: true,
    });
    if (!gate.ok) {
      const error = new Error(`PERFORMANCE_ATTRIBUTION_AUTHORITY_REJECTED: ${gate.reason}`);
      error.code = 'PERFORMANCE_ATTRIBUTION_AUTHORITY_REJECTED';
      error.reason = gate.reason;
      throw error;
    }
  }
  const authority = Object.freeze({
    mode: gate.diagnostic ? 'diagnostic' : 'acceptance',
    primaryAcceptance: gate.primaryAcceptance === true,
    claimId: gate.claim?.claimId ?? null,
    digests: gate.claim?.digests ?? null,
  });
  const outputDir = await allocateOutputDir(outRoot, taskId);
  const startFingerprint = await strictWorktreeFingerprint(root);
  activity ||= await activityInspector(root);
  const logLines = [];
  const doLog = (message) => {
    const line = `${new Date().toISOString()} ${message}`;
    logLines.push(line);
    log(line);
  };

  let ownedServer = null;
  let browserServer = null;
  let browserChildProcess = null;
  let browser = null;
  let context = null;
  let page = null;
  let canonicalUrlTracker = null;
  let cleanupReport = null;
  let contextLossDone = false;
  let pageIssueTracker = null;
  let routeResult = null;
  let electronApp = null;
  let childProcess = null;
  let processMonitor = null;
  let isolatedLaunch = null;
  let electronRuntime = null;
  let rootUrl = null;

  try {
    if (runtimeKind === 'browser') {
      ownedServer = await acquireVisualProbeServer({ root });
      assert.equal(ownedServer.ownsServer, true, 'attribution probe must own its canonical in-process server');
      rootUrl = ownedServer.baseUrl;
      ({ page, browser, context, browserServer, browserChildProcess } = await launchBrowser(viewport, {
        enableTier1Counters,
      }));
      pageIssueTracker = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });
      canonicalUrlTracker = createCanonicalUrlTracker(page, rootUrl);
      await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (enableTier1Counters) await assertTier1CountersBooted(page, { phase: 'initial boot' });
    } else {
      const launched = await launchElectron(root, (owned) => {
        electronApp = owned.electronApp;
        childProcess = owned.childProcess;
        processMonitor = owned.processMonitor;
        pageIssueTracker = owned.pageIssueTracker;
        isolatedLaunch = owned.isolatedLaunch;
        electronRuntime = owned.runtimeProvisioning;
        page = owned.page || page;
        canonicalUrlTracker = owned.canonicalUrlTracker || canonicalUrlTracker;
        rootUrl = owned.rootUrl || rootUrl;
      }, taskId, { enableTier1Counters });
      ({
        page,
        electronApp,
        childProcess,
        processMonitor,
        pageIssueTracker,
        isolatedLaunch,
        runtimeProvisioning: electronRuntime,
        canonicalUrlTracker,
        rootUrl,
      } = launched);
      assert.deepEqual(
        inspectCanonicalRootUrl(page.url(), rootUrl).failures,
        [],
        'Electron attribution must remain on its launcher-owned canonical root',
      );
      if (enableTier1Counters) await assertTier1CountersBooted(page, { phase: 'initial boot' });
    }
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    await page.bringToFront();
    doLog(`${runtimePlan.runtimeKind} canonical root ${rootUrl}`);

    try {
      routeResult = await runBrowserPublicRoute({
        page,
        outputDir,
        expectedRootUrl: rootUrl,
        log: doLog,
        flightTimeoutMs,
        dockTimeoutMs,
        seed,
        // The performance route validates the active station shell through its Market tab and
        // trade controls below. Do not apply the shared baseline's legacy stationHub DOM contract.
        skipStationHubAcceptance: true,
        onAuthoredFlightReady: enableTier1Counters
          ? () => assertTier1CountersBooted(page, { phase: 'authored flight admission' })
          : null,
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
    // The route hook above checks the exact admission boundary. Reassert once more after the full
    // public route so no later UI/travel transition can publish a vacuous attribution sample.
    if (enableTier1Counters) await assertTier1CountersBooted(page, { phase: 'post-public-route' });
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
      if (PERFORMANCE_REGISTERED_SCENARIO_IDS.includes(routeTag) || ATTRIBUTION_ROUTE_TAGS.includes(routeTag)) {
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
      captureWindow: async (pg, { routeTag, variantId }) => {
        const name = `scenario-${routeTag}-${variantId}.png`.replace(/[^a-z0-9_.-]+/gi, '-');
        await pg.screenshot({ path: path.join(outputDir, name), type: 'png', animations: 'disabled' });
        routeResult.screenshots = [...new Set([...(routeResult.screenshots || []), name])];
      },
    });
    return await finalizePerformanceAttributionRun({
      root,
      outputRoot: outRoot,
      outputDir,
      taskId,
      seed,
      viewport,
      document,
      routeResult,
      startFingerprint,
      activity,
      runtimeKind,
      electronRuntime,
      authority,
      pageIssueTracker,
      page,
      context,
      browser,
      browserServer,
      browserChildProcess,
      ownedServer,
      canonicalUrlTracker,
      electronApp,
      childProcess,
      processMonitor,
      rootUrl,
      logLines,
      additionalDocumentValidator,
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
      && measurementState.dynamicBufferProbeForceFullUploads !== true
      && measurementState.restoreJournalPresent !== true;
    cleanupReport = await closeAttributionResources({
      runtimeKind,
      page,
      context,
      browser,
      browserServer,
      browserChildProcess,
      ownedServer,
      canonicalUrlTracker,
      electronApp,
      childProcess,
      processMonitor,
      rootUrl,
    });
    const errors = buildErrorEvidence(runtimeKind, pageIssueTracker);
    pageIssueTracker?.stop?.();
    const normalizedCleanup = normalizeCleanup(runtimeKind, cleanupReport);
    const cleanupValidation = validateCleanupEvidence(normalizedCleanup, { runtimeKind });
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
      runtimeKind,
      primaryAcceptance: false,
      authority,
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
      cleanupReport = await closeAttributionResources({
        runtimeKind,
        page,
        context,
        browser,
        browserServer,
        browserChildProcess,
        ownedServer,
        canonicalUrlTracker,
        electronApp,
        childProcess,
        processMonitor,
        rootUrl,
      }).catch(() => null);
    }
    if (runtimeKind === 'electron') cleanupIsolatedElectronProfile(isolatedLaunch, cleanupReport);
    await writeFile(path.join(outputDir, 'run.log'), `${logLines.join('\n')}\n`, 'utf8').catch(() => {});
  }
}

export {
  allocateOutputDir,
  sampleRafWindow,
  samplePerformanceAttribution,
  performanceAttributionExecutionPlan,
  applyDiagnosticVariant,
  restoreDiagnosticVariant,
  buildPerformanceAttributionDocument,
  snapshotDiagnosticSettings,
  applyDiagnosticVariantToState,
  restoreDiagnosticVariantToState,
  disableMeasurementGates,
  buildClosureWindows,
  inspectPerformanceActivity,
  inspectPerformanceContaminants,
  readPerformanceRouteFailureState,
  runPerformanceAttributionProbe,
};
