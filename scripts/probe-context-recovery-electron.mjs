#!/usr/bin/env node

// One bounded native diagnostic for the context-loss cleanup path. It deliberately owns one
// isolated Electron application, walks the public title -> New Game -> Launch route once, and
// then exercises the renderer's existing WEBGL_lose_context recovery seam before the ordinary
// application close. This is diagnostic evidence, not a performance or gameplay gate.

import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import {
  awaitElectronInitialCanonicalLoad,
  buildPostTeardownGlDeleteTrapDiagnostic,
  cleanupIsolatedElectronProfile,
  installGlTrapsOnLivePage,
  installPostTeardownGlDeleteTrapCapture,
  launchIsolatedElectronApplication,
  probeWebGlContextLoss,
  readGlDeleteTrap,
  readPostTeardownGlDeleteTrapConsoleMessage,
} from './lib/releaseSoakProbe.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling, installFrameKeepalive } from './lib/playwrightCspPolling.mjs';
import { bootToAuthoredFlight } from './lib/professionalTravelPublicRoute.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, '.devshots', 'context-recovery-electron');
const TASK_ID = 'context-recovery-electron';
const SCHEMA = 'spaceface.contextRecoveryElectron.v1';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--out') args.out = argv[++index];
    else if (value === '--flight-timeout-ms') args.flightTimeoutMs = Number(argv[++index]);
    else if (value === '--task-id') args.taskId = String(argv[++index] || TASK_ID);
    else if (value === '--help' || value === '-h') args.help = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  return args;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeTaskId(value) {
  const normalized = String(value || TASK_ID).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return normalized || TASK_ID;
}

function runDirectory(outputRoot, taskId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(outputRoot, `${taskId}-${stamp}-${process.pid}`);
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: String(error.name || 'Error'),
    message: String(error.message || error).slice(0, 2_000),
    stack: error.stack ? String(error.stack).slice(0, 6_000) : null,
  };
}

function compactIssues(issues) {
  return (Array.isArray(issues) ? issues : []).slice(-24).map((issue) => ({
    source: issue?.source || null,
    level: issue?.level || null,
    text: String(issue?.text || '').slice(0, 500),
  }));
}

function compactCleanupReport(report) {
  if (!report) return null;
  return {
    pass: report.pass === true,
    failures: Array.isArray(report.failures) ? report.failures.slice(-24).map((value) => String(value).slice(0, 500)) : [],
    appCloseCompleted: report.appCloseCompleted === true,
    pageClosed: report.pageClosed === true,
    processExited: report.processExited === true,
    processCloseConfirmed: report.processCloseConfirmed === true,
    listenerReleased: report.listenerReleased === true,
    forceClose: report.forceClose ? {
      attempted: report.forceClose.attempted === true,
      ownershipProven: report.forceClose.ownershipProven === true,
      closeConfirmed: report.forceClose.closeConfirmed === true,
      method: report.forceClose.method || null,
      error: report.forceClose.error ? String(report.forceClose.error.message || report.forceClose.error).slice(0, 500) : null,
    } : null,
  };
}

function compactFlightSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    mode: snapshot.mode || null,
    tick: Number.isFinite(Number(snapshot.tick)) ? Number(snapshot.tick) : null,
    simTime: Number.isFinite(Number(snapshot.simTime)) ? Number(snapshot.simTime) : null,
    sectorId: snapshot.sectorId || null,
    player: snapshot.player ? {
      id: snapshot.player.id || null,
      alive: snapshot.player.alive !== false,
      pos: snapshot.player.pos ? {
        x: Number(snapshot.player.pos.x) || 0,
        z: Number(snapshot.player.pos.z) || 0,
      } : null,
    } : null,
    authoredReady: snapshot.authored?.ready === true,
  };
}

function compactPageState(state) {
  if (!state) return null;
  return {
    mode: state.mode || null,
    tick: Number.isFinite(Number(state.tick)) ? Number(state.tick) : null,
    simTime: Number.isFinite(Number(state.simTime)) ? Number(state.simTime) : null,
    timeScale: Number.isFinite(Number(state.timeScale)) ? Number(state.timeScale) : null,
    docked: state.ui?.docked === true,
    screenStack: Array.isArray(state.ui?.screenStack) ? state.ui.screenStack.slice(0, 12) : [],
    player: state.player ? {
      id: state.player.id || null,
      alive: state.player.alive !== false,
      pos: state.player.pos ? {
        x: Number(state.player.pos.x) || 0,
        z: Number(state.player.pos.z) || 0,
      } : null,
    } : null,
    contextRecovery: state.contextRecovery ? {
      losses: Number(state.contextRecovery.losses) || 0,
      restores: Number(state.contextRecovery.restores) || 0,
      generation: Number(state.contextRecovery.generation) || 0,
      pending: state.contextRecovery.pending === true,
      lastError: state.contextRecovery.lastError ? String(state.contextRecovery.lastError).slice(0, 500) : null,
    } : null,
    rendererContextLost: state.rendererContextLost === true,
  };
}

async function readPageState(page) {
  if (!page || page.isClosed()) return null;
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf?.state;
    const player = state?.entities?.get?.(state.playerId)
      || state?.entityList?.find?.((entity) => entity?.id === state.playerId);
    const recovery = state?.render?.contextRecovery || state?.contextRecovery || null;
    const renderer = state?.render?.renderer || null;
    return {
      mode: state?.mode || null,
      tick: Number(state?.tick || 0),
      simTime: Number(state?.simTime || 0),
      timeScale: Number(state?.timeScale ?? 0),
      ui: {
        docked: state?.ui?.docked === true,
        screenStack: Array.isArray(state?.ui?.screenStack) ? state.ui.screenStack.slice(0, 12) : [],
      },
      player: player ? {
        id: player.id || null,
        alive: player.alive !== false,
        pos: { x: Number(player.pos?.x || 0), z: Number(player.pos?.z || 0) },
      } : null,
      contextRecovery: recovery ? {
        losses: Number(recovery.losses || 0),
        restores: Number(recovery.restores || 0),
        generation: Number(recovery.generation || 0),
        pending: recovery.pending === true,
        lastError: recovery.lastError ? String(recovery.lastError) : null,
      } : null,
      rendererContextLost: renderer?.getContext?.()?.isContextLost?.() === true,
    };
  }).then(compactPageState);
}

async function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, filePath);
}

/**
 * Wrap an asynchronous lifecycle operation so all callers share one promise and one invocation.
 * The context probe uses this for ordinary app close; it is exported for the focused contract test.
 */
export function createOneShotAsync(operation) {
  if (typeof operation !== 'function') throw new TypeError('one-shot operation must be a function');
  let promise = null;
  let callCount = 0;
  return {
    invoke() {
      if (!promise) {
        callCount += 1;
        promise = Promise.resolve().then(operation);
      }
      return promise;
    },
    get callCount() { return callCount; },
  };
}

export function buildContextRecoveryReceipt({
  outputDir,
  taskId = TASK_ID,
  routeSnapshot = null,
  preRecovery = null,
  postRecovery = null,
  contextLoss = null,
  liveGlDeleteTrap = null,
  postTeardown = null,
  postTeardownInstall = null,
  cleanupReport = null,
  closeCallCount = 0,
  profileCleanup = false,
  primaryError = null,
  pageIssues = [],
  milestones = [],
  runtime = {},
} = {}) {
  const cleanup = compactCleanupReport(cleanupReport);
  const receipt = {
    schema: SCHEMA,
    taskId,
    generatedAt: new Date().toISOString(),
    status: 'pending',
    pass: false,
    runtimeKind: 'electron',
    route: {
      sequence: 'isolated Electron canonical root -> public New Game -> Launch -> authored flight',
      snapshot: compactFlightSnapshot(routeSnapshot),
    },
    milestones: Array.isArray(milestones) ? milestones.slice(-32) : [],
    runtime: {
      rootUrl: runtime.rootUrl || null,
      pid: Number.isInteger(Number(runtime.pid)) ? Number(runtime.pid) : null,
      isolated: runtime.isolated === true,
    },
    preRecovery,
    postRecovery,
    contextLoss,
    glDeleteTrap: {
      live: liveGlDeleteTrap,
      postTeardown: buildPostTeardownGlDeleteTrapDiagnostic({
        runtimeKind: 'electron',
        install: postTeardownInstall,
        snapshot: postTeardown,
      }),
    },
    teardown: {
      closeCallCount: Number(closeCallCount) || 0,
      cleanup,
      isolatedProfileRemoved: profileCleanup === true,
    },
    issues: compactIssues(pageIssues),
    error: serializeError(primaryError),
    artifacts: {
      receipt: path.relative(ROOT, path.join(outputDir || ROOT, 'receipt.json')).replace(/\\/g, '/'),
    },
  };
  receipt.pass = contextLoss?.recovered === true
    && postTeardownInstall?.installed === true
    && postTeardown != null
    && cleanup?.pass === true;
  receipt.status = receipt.pass ? 'pass' : 'fail';
  return receipt;
}

export async function runContextRecoveryElectronDiagnostic({
  outputDir,
  taskId = TASK_ID,
  flightTimeoutMs = positiveInteger(process.env.SF_CONTEXT_RECOVERY_FLIGHT_TIMEOUT_MS, 240_000),
} = {}) {
  const normalizedTaskId = safeTaskId(taskId);
  const resolvedOutputDir = path.resolve(outputDir || runDirectory(DEFAULT_OUTPUT_ROOT, normalizedTaskId));
  await mkdir(resolvedOutputDir, { recursive: true });
  const receiptPath = path.join(resolvedOutputDir, 'receipt.json');
  const logLines = [];
  const log = (message) => {
    const line = `${new Date().toISOString()} ${message}`;
    logLines.push(line);
    console.log(`[context-recovery-electron] ${message}`);
  };
  const milestones = [];
  const mark = (name, detail = {}) => {
    const record = { name, at: new Date().toISOString(), ...detail };
    milestones.push(record);
    log(`milestone ${name}`);
    return record;
  };

  let electronApp = null;
  let childProcess = null;
  let page = null;
  let isolatedLaunch = null;
  let canonicalUrlTracker = null;
  let processMonitor = null;
  let pageIssueTracker = null;
  let rootUrl = null;
  let primaryError = null;
  let routeSnapshot = null;
  let preRecovery = null;
  let postRecovery = null;
  let contextLoss = null;
  let liveGlDeleteTrap = null;
  let postTeardownInstall = null;
  let postTeardown = null;
  let cleanupReport = null;
  let profileCleanup = false;
  const consoleMessages = [];
  const postTeardownConsoleHandler = (message) => {
    const snapshot = readPostTeardownGlDeleteTrapConsoleMessage(message);
    if (snapshot && postTeardown == null) postTeardown = snapshot;
    if (consoleMessages.length < 24) {
      const type = typeof message?.type === 'function' ? message.type() : null;
      const text = typeof message?.text === 'function' ? message.text() : String(message || '');
      if (type === 'error' || type === 'warning') consoleMessages.push({ type, text: String(text).slice(0, 500) });
    }
  };

  const closeOnce = createOneShotAsync(async () => {
    if (!electronApp) return null;
    return closeOwnedElectronRuntime({
      page,
      electronApp,
      childProcess,
      canonicalUrlTracker,
      processMonitor,
      rootUrl,
    });
  });

  try {
    const { _electron: electron } = await loadPlaywright();
    isolatedLaunch = createIsolatedElectronLaunch({ root: ROOT, taskId: normalizedTaskId });
    electronApp = await launchIsolatedElectronApplication(electron, isolatedLaunch);
    childProcess = electronApp.process();
    processMonitor = createElectronProcessMonitor({ electronApp, childProcess });
    pageIssueTracker = createStrictElectronApplicationIssueTracker(electronApp, {
      playerStoreMounted: false,
      allowCancelledMedia: true,
    });

    page = await electronApp.firstWindow({ timeout: 90_000 });
    await pageIssueTracker.bindAndBackfillPage(page);
    page.on('console', postTeardownConsoleHandler);
    electronApp.on?.('console', postTeardownConsoleHandler);
    installCspSafePlaywrightPolling(page);
    await installFrameKeepalive(page);
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
      bootstrapTimeoutMs: 10_000,
      pollIntervalMs: 75,
      allowAnyLoopbackPort: true,
    });
    rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(10_000));
    await awaitElectronInitialCanonicalLoad(page, electronApp, rootUrl);
    await page.bringToFront();
    mark('canonical-root', { rootUrl });

    // This helper is the same public New Game -> Launch implementation used by the travel route;
    // no debug route, injected game event, save cycle, docking cycle, or alternate launcher is used.
    routeSnapshot = await bootToAuthoredFlight({
      page,
      outputDir: resolvedOutputDir,
      log,
      flightTimeoutMs,
      onMilestone: async (name, detail) => mark(name, detail),
    });
    mark('authored-flight-ready', { tick: routeSnapshot?.tick ?? null });

    await page.waitForFunction(
      () => typeof window.SF?.registry?.destroy === 'function',
      null,
      { timeout: 30_000 },
    );
    // Arm only after the real registry exists. The wrappers are read-only and the post-teardown
    // wrapper captures the ordinary destroy result without initiating a second teardown.
    await installGlTrapsOnLivePage(page);
    postTeardownInstall = await installPostTeardownGlDeleteTrapCapture(page);
    mark('teardown-observer-armed', postTeardownInstall);
    preRecovery = await readPageState(page);
    contextLoss = await probeWebGlContextLoss(page, {
      outputDir: resolvedOutputDir,
      log,
    });
    postRecovery = await readPageState(page);
    liveGlDeleteTrap = await readGlDeleteTrap(page);
    mark('context-recovery-complete', {
      recovered: contextLoss?.recovered === true,
      restores: contextLoss?.contextRecovery?.restores ?? null,
    });
    if (contextLoss?.recovered !== true) {
      throw new Error(`controlled WebGL context recovery did not pass: ${JSON.stringify(contextLoss)}`);
    }
  } catch (error) {
    primaryError = error;
    log(`FAIL ${error?.message || error}`);
  } finally {
    if (page && !page.isClosed()) {
      preRecovery ||= await readPageState(page).catch(() => null);
    }
    try {
      cleanupReport = await closeOnce.invoke();
    } catch (error) {
      if (!primaryError) primaryError = error;
      log(`cleanup FAIL ${error?.message || error}`);
    }
    // closeOwnedElectronRuntime owns the single ordinary app close. The console listener above
    // may receive the immutable post-destroy snapshot during that close; do not call destroy or
    // close again if it did not arrive.
    if (isolatedLaunch && cleanupReport?.pass === true) {
      try {
        profileCleanup = cleanupIsolatedElectronProfile(isolatedLaunch, cleanupReport);
      } catch (error) {
        if (!primaryError) primaryError = error;
        log(`profile cleanup FAIL ${error?.message || error}`);
      }
    }
    page?.off?.('console', postTeardownConsoleHandler);
    electronApp?.off?.('console', postTeardownConsoleHandler);
    const issues = pageIssueTracker?.stop?.() || [];
    issues.push(...consoleMessages.map((entry) => ({ source: 'diagnostic-console', level: entry.type, text: entry.text })));
    const receipt = buildContextRecoveryReceipt({
      outputDir: resolvedOutputDir,
      taskId: normalizedTaskId,
      routeSnapshot,
      preRecovery,
      postRecovery,
      contextLoss,
      liveGlDeleteTrap,
      postTeardown,
      postTeardownInstall,
      cleanupReport,
      closeCallCount: electronApp ? closeOnce.callCount : 0,
      profileCleanup,
      primaryError,
      pageIssues: issues,
      milestones,
      runtime: { rootUrl, pid: childProcess?.pid ?? null, isolated: true },
    });
    try {
      await writeJsonAtomic(receiptPath, receipt);
      await writeFile(path.join(resolvedOutputDir, 'run.log'), `${logLines.join('\n')}\n`, 'utf8');
    } catch (error) {
      if (!primaryError) primaryError = error;
      console.error(`[context-recovery-electron] receipt write failed: ${error?.message || error}`);
    }
    if (receipt.pass !== true && !primaryError) {
      primaryError = new Error('context recovery diagnostic failed; see receipt.json');
    }
    if (primaryError) {
      // The receipt is the bounded caller artifact even on failure; the CLI reports the failure
      // after cleanup so the native caller can always inspect it.
      console.error(`[context-recovery-electron] receipt: ${path.relative(ROOT, receiptPath).replace(/\\/g, '/')}`);
    } else {
      console.log(`[context-recovery-electron] PASS receipt: ${path.relative(ROOT, receiptPath).replace(/\\/g, '/')}`);
    }
    return receipt;
  }
}

function isEntrypoint() {
  if (!process.argv[1]) return false;
  try {
    return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
  } catch (_) {
    return false;
  }
}

if (isEntrypoint()) {
  const args = parseArgs();
  if (args.help) {
    console.log('Usage: node scripts/probe-context-recovery-electron.mjs [--out DIR] [--flight-timeout-ms N] [--task-id ID]');
  } else {
    const report = await runContextRecoveryElectronDiagnostic({
      outputDir: args.out ? path.resolve(ROOT, args.out) : undefined,
      taskId: args.taskId || TASK_ID,
      flightTimeoutMs: positiveInteger(args.flightTimeoutMs, positiveInteger(process.env.SF_CONTEXT_RECOVERY_FLIGHT_TIMEOUT_MS, 240_000)),
    });
    if (report.pass !== true) process.exitCode = 1;
  }
}
