import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

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
  forceCloseOwnedElectronTree,
  waitForElectronProcessClose,
} from './alphaLiveBaselineElectronContracts.mjs';
import { collectPageIssues } from './browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './electronTestIsolation.mjs';
import { loadPlaywright } from './load-playwright.mjs';
import lifecycleLaunchPolicy from './performanceLifecycleLaunchPolicy.cjs';
import {
  buildOwnedChromeLifecycleArgs,
  RawCdpLifecyclePage,
  RawCdpSession,
} from './rawCdpLifecycleBrowser.mjs';
import {
  PERFORMANCE_LIFECYCLE_FIXED_SEED,
  PERFORMANCE_LIFECYCLE_SCHEMA,
  foregroundWindowSequenceSettled,
  summarizeLifecycleDelta,
  validatePerformanceLifecycleEvidence,
} from './performanceLifecycleContracts.mjs';
import { requireBrokerClaimOrDiagnostic } from './validationBroker.mjs';
import { acquireVisualProbeServer } from './visualProbeServer.mjs';

const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const HIDDEN_SAMPLE_MS = 750;
const FOREGROUND_SAMPLE_MS = 650;
const FOREGROUND_WARMUP_MS = 5_000;
const FOREGROUND_SETTLE_ATTEMPTS = 18;
const TRANSITION_CYCLES = 4;
const ELECTRON_LIFECYCLE_POLICY_PRELOAD = fileURLToPath(
  new URL('./performanceLifecycleLaunchPolicy.cjs', import.meta.url),
);
const RAW_BROWSER_PROFILE_ROOT = path.join(tmpdir(), 'spaceface-performance-lifecycle-browser');

export const PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES = Object.freeze([
  ...lifecycleLaunchPolicy.PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES,
]);

export function createElectronLifecycleLaunchOptions(options = {}, {
  policyPreloadPath = ELECTRON_LIFECYCLE_POLICY_PRELOAD,
} = {}) {
  assert(path.isAbsolute(String(policyPreloadPath || '')),
    'Electron lifecycle policy preload requires an absolute path');
  return {
    ...options,
    args: ['-r', policyPreloadPath, ...(options.args || [])],
  };
}

export function findPresentLifecycleBackgroundSwitches(commandLine = []) {
  const args = Array.isArray(commandLine) ? commandLine.map(String) : [];
  return PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES.filter((name) => (
    args.some((argument) => argument === name || argument.startsWith(`${name}=`))
  ));
}

export function extractLifecycleClaimIdentity(claim) {
  if (!claim || typeof claim !== 'object') return null;
  const digests = claim.digests || {};
  const receipt = claim.receipt || {};
  return {
    claimId: claim.claimId || null,
    candidateDigest: digests.candidateDigest ?? receipt.candidateDigest ?? null,
    sourceCandidateDigest: digests.sourceCandidateDigest ?? receipt.sourceCandidateDigest ?? null,
    routeDigest: digests.routeDigest ?? digests.productionDigest
      ?? receipt.routeDigest ?? receipt.productionDigest ?? null,
    regressionDigest: digests.regressionDigest ?? receipt.regressionDigest ?? null,
  };
}

export async function runPerformanceLifecycleProbe({
  root,
  runtimeKind,
  manifest,
  mode = 'acceptance',
  brokerClaimToken = process.env.SF_BROKER_CLAIM ?? null,
  outputRoot = path.resolve(root, manifest.artifactRoot),
  log = () => {},
} = {}) {
  assert(path.isAbsolute(String(root || '')), 'performance lifecycle probe requires an absolute root');
  assert(['browser', 'electron'].includes(runtimeKind), 'runtimeKind must be browser or electron');
  assert.equal(manifest?.runtimeKind, runtimeKind, 'lifecycle manifest runtime must match the probe');
  assert(['acceptance', 'diagnostic'].includes(mode), 'mode must be acceptance or diagnostic');

  const diagnostic = mode === 'diagnostic';
  const gate = await requireBrokerClaimOrDiagnostic({
    outputRoot,
    manifest,
    tokenOrPath: brokerClaimToken,
    diagnostic,
    explicitDiagnostic: diagnostic,
    root,
    requiredMode: mode,
    requiredRuntimeKind: runtimeKind,
  });
  if (!gate.ok) {
    const error = new Error(`PERFORMANCE_LIFECYCLE_AUTHORITY_REJECTED: ${gate.reason}`);
    error.code = 'PERFORMANCE_LIFECYCLE_AUTHORITY_REJECTED';
    error.gate = gate;
    throw error;
  }

  const runId = safeSegment(gate.claim?.claimId || `diagnostic-${Date.now()}`);
  const outputDir = path.join(outputRoot, `run-${runId}`);
  await mkdir(outputDir, { recursive: true });
  const candidateCommit = readCommit(root);
  const runtime = runtimeKind === 'browser'
    ? await launchBrowser(root)
    : await launchElectron(root);
  let body = null;
  let primaryError = null;
  let cleanupReport = null;
  let failureDiagnostics = null;
  try {
    log(`[lifecycle] ${runtimeKind} canonical root ${runtime.rootUrl}`);
    const launchPolicy = await inspectNativeLifecycleLaunchPolicy(runtime);
    assert.equal(launchPolicy.nativeDefaultsRestored, true,
      `Playwright background execution switches survived launch: ${JSON.stringify(launchPolicy)}`);
    await enterPublicFlight(runtime, PERFORMANCE_LIFECYCLE_FIXED_SEED);
    await installGpuSubmissionObserver(runtime.page);
    const routeBefore = await readRouteIdentity(runtime.page);
    const gpu = await readGpuIdentity(runtime.page);
    assert.equal(gpu.hasContext, true, 'game renderer WebGL context is required');
    assert.equal(gpu.software, false, `software GPU is not acceptance evidence: ${gpu.renderer}`);

    await ensureRunningAudio(runtime);
    await focusRuntimeForLifecycleSample(runtime);
    const foregroundBaseline = await measureSettledForegroundWindow(runtime);
    let occlusion = null;
    if (runtimeKind === 'electron') occlusion = await exerciseElectronOcclusion(runtime);

    const soakStart = await readRuntimeObservation(runtime.page);
    const transitions = [];
    for (let cycle = 0; cycle < TRANSITION_CYCLES; cycle += 1) {
      const trigger = runtimeKind === 'browser'
        ? 'document-visibility'
        : (cycle % 2 === 0 ? 'window-minimize' : 'window-hide');
      transitions.push(await exerciseHiddenTransition(runtime, {
        id: `${runtimeKind}-${cycle + 1}`,
        trigger,
      }));
    }
    const soakEnd = await readRuntimeObservation(runtime.page);
    await focusRuntimeForLifecycleSample(runtime);
    const foregroundResumed = await measureForegroundWindow(runtime.page);
    const routeAfter = await readRouteIdentity(runtime.page);
    const errors = runtimeKind === 'browser'
      ? runtime.issueTracker.errorIssues()
      : runtime.issueTracker.errors();

    body = {
      schema: PERFORMANCE_LIFECYCLE_SCHEMA,
      pass: false,
      primaryAcceptance: gate.primaryAcceptance === true,
      runtimeKind,
      fixedSeed: PERFORMANCE_LIFECYCLE_FIXED_SEED,
      candidateCommit,
      claim: extractLifecycleClaimIdentity(gate.claim),
      route: {
        canonicalRoot: runtime.canonicalRootCheck().failures.length === 0,
        mode: routeAfter.mode,
        defaultSettings: routeBefore.defaultSettings && routeAfter.defaultSettings,
        authoredVisualReady: routeBefore.authoredVisualReady && routeAfter.authoredVisualReady,
        signatureBefore: digest(routeBefore.signature),
        signatureAfter: digest(routeAfter.signature),
        seed: routeAfter.seed,
        settings: routeAfter.settings,
      },
      gpu,
      launchPolicy,
      driver: runtimeKind === 'browser'
        ? {
          kind: 'browser-window-minimize',
          observedDocumentHidden: transitions.every((entry) => entry.documentVisibilityDuring === 'hidden'),
          synthetic: false,
        }
        : {
          kind: 'electron-browser-window',
          observedNativeWindowState: transitions.every((entry) => entry.nativeWindowDuring?.hidden === true),
          synthetic: false,
        },
      foreground: {
        baseline: foregroundBaseline.delta,
        resumed: foregroundResumed.delta,
        cadenceRatio: ratio(foregroundResumed.delta.executedFrames, foregroundBaseline.delta.executedFrames),
        sampleMs: FOREGROUND_SAMPLE_MS,
        warmupMs: foregroundBaseline.warmupMs,
        settleWindows: foregroundBaseline.settleWindows,
      },
      occlusion,
      transitions,
      soak: {
        cycles: TRANSITION_CYCLES,
        suspendDelta: soakEnd.loop.suspendCount - soakStart.loop.suspendCount,
        resumeDelta: soakEnd.loop.resumeCount - soakStart.loop.resumeCount,
        restoreFrameDelta: soakEnd.loop.restoreFrameCount - soakStart.loop.restoreFrameCount,
        duplicateShellCommandDelta: soakEnd.loop.duplicateShellCommandCount - soakStart.loop.duplicateShellCommandCount,
        staleShellCommandDelta: soakEnd.loop.staleShellCommandCount - soakStart.loop.staleShellCommandCount,
        invalidShellCommandDelta: soakEnd.loop.invalidShellCommandCount - soakStart.loop.invalidShellCommandCount,
        shedBacklogDelta: soakEnd.loop.shedBacklogFrames - soakStart.loop.shedBacklogFrames,
        maxStepsAfter: soakEnd.loop.maxStepsObserved,
        postRestoreFrameDelta: soakEnd.loop.postRestoreFrameCount - soakStart.loop.postRestoreFrameCount,
        postRestoreShedBacklogDelta: soakEnd.loop.postRestoreShedBacklogCount
          - soakStart.loop.postRestoreShedBacklogCount,
        postRestoreMaxStepsAfter: soakEnd.loop.postRestoreMaxStepsObserved,
      },
      physicalPower: {
        claimed: false,
        driver: null,
        synthetic: false,
        reason: 'OS suspend and workstation lock were not safely driven by this acceptance process; Electron publication remains covered by deterministic owner tests.',
      },
      errors,
      cleanup: null,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    primaryError = error;
    if (runtimeKind === 'electron') {
      failureDiagnostics = {
        nativeWindowAudit: await readElectronNativeWindowAudit(runtime.electronApp).catch((auditError) => ({
          unavailable: true,
          error: serializeError(auditError),
        })),
        nativeWindowState: await readElectronWindowState(runtime.electronApp, runtime.mainWindowId)
          .catch((stateError) => ({ unavailable: true, error: serializeError(stateError) })),
        processMonitor: runtime.processMonitor?.snapshot?.() || null,
        applicationIssues: runtime.issueTracker?.all?.() || [],
      };
    }
  } finally {
    try {
      cleanupReport = runtimeKind === 'browser'
        ? (runtime.rawBrowser
          ? await closeOwnedRawBrowserRuntime(runtime)
          : await closeOwnedResources({
            page: runtime.page,
            context: runtime.context,
            browser: runtime.browser,
            browserServer: runtime.browserServer,
            browserChildProcess: runtime.browserChildProcess,
            server: runtime.server,
            canonicalUrlTracker: runtime.canonicalUrlTracker,
          }))
        : await closeOwnedElectronLifecycleRuntime(runtime);
    } catch (error) {
      cleanupReport = error.cleanupReport || { pass: false, failures: [String(error?.message || error)] };
      if (!primaryError) primaryError = error;
    }
    runtime.issueTracker?.stop?.();
    if (runtimeKind === 'electron' && cleanupReport?.pass === true) {
      try {
        runtime.isolatedLaunch.cleanup({ runtimeClosed: true });
      } catch (error) {
        if (!primaryError) primaryError = error;
      }
    }
  }

  const cleanup = normalizeCleanup(runtimeKind, cleanupReport, runtime);
  if (body) body.cleanup = cleanup;
  if (primaryError) {
    await writeFile(path.join(outputDir, 'failure.json'), `${JSON.stringify({
      schema: 'spaceface.performanceLifecycleFailure.v1',
      runtimeKind,
      candidateCommit,
      error: serializeError(primaryError),
      cleanup,
      cleanupDetail: cleanupReport,
      failureDiagnostics,
      partialEvidence: body,
    }, null, 2)}\n`, 'utf8');
    throw primaryError;
  }

  const validation = validatePerformanceLifecycleEvidence(body, {
    runtimeKind,
    requirePrimaryAcceptance: !diagnostic,
  });
  body.validation = validation;
  body.pass = validation.pass;
  const evidencePath = path.join(outputDir, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  if (!validation.pass) {
    const error = new Error(`PERFORMANCE_LIFECYCLE_ACCEPTANCE_FAILED: ${validation.failures.join('; ')}`);
    error.code = 'PERFORMANCE_LIFECYCLE_ACCEPTANCE_FAILED';
    error.evidencePath = evidencePath;
    error.validation = validation;
    throw error;
  }
  return { pass: true, evidencePath, evidence: body, outputDir, gate };
}

async function launchBrowser(root) {
  const executablePath = findSystemBrowser();
  assert(executablePath, 'headed system Chrome or Edge is required for Browser lifecycle evidence');
  const server = await acquireVisualProbeServer({ root });
  await mkdir(RAW_BROWSER_PROFILE_ROOT, { recursive: true });
  const userDataDir = await mkdtemp(path.join(RAW_BROWSER_PROFILE_ROOT, 'probe-'));
  let browserChildProcess = null;
  let rawSession = null;
  let page = null;
  let canonicalUrlTracker = null;
  let windowActivator = null;
  try {
    const launchArgs = buildOwnedChromeLifecycleArgs({
      userDataDir,
      rootUrl: 'about:blank',
      viewport: VIEWPORT,
    });
    browserChildProcess = spawn(executablePath, launchArgs, {
      cwd: root,
      stdio: 'ignore',
      windowsHide: false,
    });
    const target = await waitForOwnedChromeTarget({ browserChildProcess, userDataDir });
    windowActivator = await OwnedNativeWindowActivator.create(browserChildProcess, { label: 'Chrome' });
    rawSession = await RawCdpSession.connect(target.webSocketDebuggerUrl);
    page = await new RawCdpLifecyclePage(rawSession, {
      initialUrl: target.url,
      activateWindow: () => windowActivator.activate(),
    }).initialize();
    canonicalUrlTracker = createCanonicalUrlTracker(page, server.baseUrl);
    const issueTracker = collectPageIssues(page, { includeWarnings: false, ignoreProbeWarnings: true });
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const browserWindowDriver = await createBrowserWindowLifecycleDriver(null, page);
    return {
      runtimeKind: 'browser',
      rawBrowser: true,
      server,
      browserChildProcess,
      rawSession,
      page,
      rootUrl: server.baseUrl,
      userDataDir,
      windowActivator,
      canonicalUrlTracker,
      issueTracker,
      browserWindowDriver,
      canonicalRootCheck: () => inspectCanonicalRootUrl(page.url(), server.baseUrl),
    };
  } catch (error) {
    rawSession?.notify?.('Browser.close');
    let closed = await waitForOwnedProcessClose(browserChildProcess, 5_000);
    if (!closed && Number.isSafeInteger(browserChildProcess?.pid)) {
      await forceCloseOwnedElectronTree({ pid: browserChildProcess.pid, platform: process.platform }).catch(() => {});
      closed = await waitForOwnedProcessClose(browserChildProcess, 5_000);
    }
    await rawSession?.close?.().catch(() => {});
    await canonicalUrlTracker?.stopAfterPageClose?.().catch(() => {});
    await windowActivator?.close?.().catch(() => {});
    await server?.close?.().catch(() => {});
    if (closed) await removeOwnedRawBrowserProfile(userDataDir).catch(() => {});
    throw error;
  }
}

async function launchElectron(root) {
  const { _electron: electron } = await loadPlaywright();
  const isolatedLaunch = createIsolatedElectronLaunch({ root, taskId: 'performance-lifecycle' });
  let electronApp = null;
  let childProcess = null;
  let processMonitor = null;
  let issueTracker = null;
  let windowActivator = null;
  try {
    const launchOptions = createElectronLifecycleLaunchOptions(isolatedLaunch.options);
    electronApp = await electron.launch(launchOptions);
    childProcess = electronApp.process();
    processMonitor = createElectronProcessMonitor({ electronApp, childProcess });
    issueTracker = createStrictElectronApplicationIssueTracker(electronApp);
    const page = await electronApp.firstWindow({ timeout: 90_000 });
    const focusEmulationSession = await disablePlaywrightFocusEmulation(page.context(), page);
    await issueTracker.bindAndBackfillPage(page);
    const canonicalUrlTracker = createElectronCanonicalUrlTracker(page, { allowAnyLoopbackPort: true });
    const rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(10_000));
    const mainWindowIdentity = await electronApp.evaluate(({ BrowserWindow }, viewport) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) throw new Error('SpaceFace BrowserWindow is missing');
      win.setContentSize(viewport.width, viewport.height);
      win.show();
      win.focus();
      const nativeHandle = win.getNativeWindowHandle();
      let nativeWindowHandle = 0n;
      for (let index = nativeHandle.length - 1; index >= 0; index -= 1) {
        nativeWindowHandle = (nativeWindowHandle << 8n) + BigInt(nativeHandle[index]);
      }
      return { mainWindowId: win.id, nativeWindowHandle: nativeWindowHandle.toString() };
    }, VIEWPORT);
    const { mainWindowId, nativeWindowHandle } = mainWindowIdentity || {};
    if (!Number.isSafeInteger(mainWindowId)) {
      throw new Error(`SpaceFace BrowserWindow identity is invalid: ${mainWindowId}`);
    }
    if (!/^[1-9]\d*$/.test(String(nativeWindowHandle || ''))) {
      throw new Error(`SpaceFace native HWND identity is invalid: ${nativeWindowHandle}`);
    }
    await installElectronNativeWindowAudit(electronApp, mainWindowId);
    windowActivator = await OwnedNativeWindowActivator.create(childProcess, {
      label: 'Electron',
      nativeWindowHandle,
    });
    await windowActivator.activate();
    return {
      runtimeKind: 'electron',
      electronApp,
      mainWindowId,
      nativeWindowHandle,
      windowActivator,
      childProcess,
      processMonitor,
      issueTracker,
      page,
      rootUrl,
      canonicalUrlTracker,
      isolatedLaunch,
      focusEmulationSession,
      focusEmulationDisabled: true,
      canonicalRootCheck: () => {
        try {
          assertIsolatedElectronRootUrl(page.url());
          return { failures: [] };
        } catch (error) {
          return { failures: [error.message] };
        }
      },
    };
  } catch (error) {
    issueTracker?.stop?.();
    await windowActivator?.close?.().catch(() => {});
    let runtimeClosed = electronApp == null;
    if (electronApp) {
      await electronApp.close().catch(() => {});
      const graceful = await waitForElectronProcessClose(childProcess, 5_000, processMonitor).catch(() => null);
      runtimeClosed = graceful?.closed === true;
      if (!runtimeClosed && Number.isSafeInteger(childProcess?.pid)) {
        await forceCloseOwnedElectronTree({ pid: childProcess.pid, platform: process.platform }).catch(() => {});
        const forced = await waitForElectronProcessClose(childProcess, 5_000, processMonitor).catch(() => null);
        runtimeClosed = forced?.closed === true;
      }
    }
    if (runtimeClosed) isolatedLaunch.cleanup({ runtimeClosed: true });
    throw error;
  }
}

async function inspectNativeLifecycleLaunchPolicy(runtime) {
  const forbiddenSwitches = [...PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES];
  if (runtime.runtimeKind === 'browser') {
    const commandLine = Array.isArray(runtime.browserChildProcess?.spawnargs)
      ? runtime.browserChildProcess.spawnargs.map(String)
      : [];
    const presentAfter = findPresentLifecycleBackgroundSwitches(commandLine);
    return {
      schema: lifecycleLaunchPolicy.POLICY_SCHEMA,
      driver: 'owned-chrome-raw-cdp',
      forbiddenSwitches,
      presentBefore: presentAfter,
      presentAfter,
      observedCommandLine: commandLine.length > 0,
      focusEmulationDisabled: runtime.browserWindowDriver.focusEmulationDisabled === true,
      appliedBeforeAppReady: true,
      productRuntimeOverride: false,
      nativeDefaultsRestored: commandLine.length > 0 && presentAfter.length === 0,
    };
  }
  const observation = await runtime.electronApp.evaluate(({ app }, {
    policyGlobal,
    switchNames,
  }) => {
    const record = globalThis[policyGlobal] || null;
    const presentAfter = switchNames.filter((name) => app.commandLine.hasSwitch(name.slice(2)));
    return { record, presentAfter };
  }, {
    policyGlobal: lifecycleLaunchPolicy.POLICY_GLOBAL,
    switchNames: forbiddenSwitches,
  });
  const record = observation?.record || {};
  const presentAfter = Array.isArray(observation?.presentAfter) ? observation.presentAfter : forbiddenSwitches;
  return {
    schema: lifecycleLaunchPolicy.POLICY_SCHEMA,
    driver: record.driver || null,
    forbiddenSwitches,
    presentBefore: Array.isArray(record.presentBefore) ? record.presentBefore : [],
    presentAfter,
    observedCommandLine: true,
    focusEmulationDisabled: runtime.focusEmulationDisabled === true,
    appliedBeforeAppReady: record.appliedBeforeAppReady === true,
    productRuntimeOverride: record.productRuntimeOverride === true,
    nativeDefaultsRestored: record.schema === lifecycleLaunchPolicy.POLICY_SCHEMA
      && record.appliedBeforeAppReady === true
      && record.productRuntimeOverride === false
      && presentAfter.length === 0,
  };
}

async function waitForOwnedChromeTarget({ browserChildProcess, userDataDir, timeoutMs = 20_000 }) {
  const activePortPath = path.join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  let latestError = null;
  while (Date.now() < deadline) {
    if (browserChildProcess?.exitCode != null || browserChildProcess?.signalCode != null) {
      throw new Error(`owned Chrome exited before DevTools attachment: ${browserChildProcess.exitCode ?? browserChildProcess.signalCode}`);
    }
    try {
      if (existsSync(activePortPath)) {
        const [port] = (await readFile(activePortPath, 'utf8')).trim().split(/\r?\n/);
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.timeout(1_000),
        });
        const targets = await response.json();
        const target = targets.find((entry) => entry?.type === 'page' && entry.webSocketDebuggerUrl);
        if (target) return { ...target, port: Number(port) };
      }
    } catch (error) {
      latestError = error;
    }
    await delay(50);
  }
  throw new Error(`owned Chrome DevTools target did not appear: ${latestError?.message || 'no target'}`);
}

class OwnedNativeWindowActivator {
  static async create(browserChildProcess, { label = 'runtime', nativeWindowHandle = null } = {}) {
    const pid = Number(browserChildProcess?.pid);
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      throw new Error(`owned ${label} PID is unavailable for native activation`);
    }
    const normalizedNativeWindowHandle = nativeWindowHandle == null ? null : String(nativeWindowHandle);
    if (normalizedNativeWindowHandle != null && !/^[1-9]\d*$/.test(normalizedNativeWindowHandle)) {
      throw new Error(`owned ${label} native window handle is invalid: ${normalizedNativeWindowHandle}`);
    }
    if (process.platform !== 'win32') {
      return new OwnedNativeWindowActivator({
        pid,
        child: null,
        lines: null,
        stderr: [],
        label,
        nativeWindowHandle: normalizedNativeWindowHandle,
      });
    }
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class SfLifecycleWindow { [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern bool BringWindowToTop(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern IntPtr SetActiveWindow(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern IntPtr SetFocus(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); [DllImport(\"kernel32.dll\")] public static extern uint GetCurrentThreadId(); [DllImport(\"user32.dll\")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach); public static bool Activate(IntPtr target) { IntPtr foreground = GetForegroundWindow(); uint ignored; uint foregroundThread = GetWindowThreadProcessId(foreground, out ignored); uint targetThread = GetWindowThreadProcessId(target, out ignored); uint currentThread = GetCurrentThreadId(); bool attachedForeground = foregroundThread != 0 && AttachThreadInput(currentThread, foregroundThread, true); bool attachedTarget = targetThread != 0 && targetThread != foregroundThread && AttachThreadInput(currentThread, targetThread, true); try { ShowWindowAsync(target, 9); BringWindowToTop(target); SetForegroundWindow(target); SetActiveWindow(target); SetFocus(target); uint foregroundPid; GetWindowThreadProcessId(GetForegroundWindow(), out foregroundPid); uint targetPid; GetWindowThreadProcessId(target, out targetPid); return foregroundPid == targetPid; } finally { if (attachedTarget) AttachThreadInput(currentThread, targetThread, false); if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false); } } }'",
      `$ownedPid = ${pid}`,
      `$ownedHandleValue = '${normalizedNativeWindowHandle || ''}'`,
      "[Console]::Out.WriteLine('READY')",
      '[Console]::Out.Flush()',
      'while (($driverCommand = [Console]::In.ReadLine()) -ne $null) { if ($driverCommand -eq \'exit\') { break }; if ($driverCommand -ne \'activate\') { continue }; try { $ownedProcess = Get-Process -Id $ownedPid -ErrorAction Stop; $ownedHandle = if ([string]::IsNullOrEmpty($ownedHandleValue)) { $ownedProcess.MainWindowHandle } else { [IntPtr]::new([int64]$ownedHandleValue) }; if ($ownedHandle -eq 0) { throw \'owned runtime MainWindowHandle is zero\' }; $activated = [SfLifecycleWindow]::Activate($ownedHandle); $foregroundHandle = [SfLifecycleWindow]::GetForegroundWindow(); $foregroundProcessId = [uint32]0; [void][SfLifecycleWindow]::GetWindowThreadProcessId($foregroundHandle, [ref]$foregroundProcessId); $targetProcessId = [uint32]0; [void][SfLifecycleWindow]::GetWindowThreadProcessId($ownedHandle, [ref]$targetProcessId); $foreground = $foregroundHandle -eq $ownedHandle; $json = [pscustomobject]@{ pid = $ownedProcess.Id; handle = $ownedHandle.ToInt64().ToString(); activated = [bool]$activated; foreground = [bool]$foreground; foregroundProcessId = $foregroundProcessId; targetProcessId = $targetProcessId; foregroundHandle = $foregroundHandle.ToInt64().ToString() } | ConvertTo-Json -Compress; [Console]::Out.WriteLine(\'RESULT \' + $json) } catch { [Console]::Out.WriteLine(\'ERROR \' + $_.Exception.Message) }; [Console]::Out.Flush() }',
    ].join('; ');
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      script,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const lines = createInterface({ input: child.stdout });
    const stderr = [];
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => stderr.push(String(chunk)));
    const driver = new OwnedNativeWindowActivator({
      pid,
      child,
      lines,
      stderr,
      label,
      nativeWindowHandle: normalizedNativeWindowHandle,
    });
    await driver.waitForLine((line) => line === 'READY', 10_000, 'native window driver readiness');
    return driver;
  }

  constructor({ pid, child, lines, stderr, label, nativeWindowHandle }) {
    this.pid = pid;
    this.child = child;
    this.lines = lines;
    this.stderr = stderr;
    this.label = label;
    this.nativeWindowHandle = nativeWindowHandle;
    this.closedCleanly = child == null;
  }

  async activate() {
    if (!this.child) return { pid: this.pid, platform: process.platform, activated: true, foreground: true };
    if (this.child.exitCode != null || this.child.signalCode != null) {
      throw new Error(`native window driver exited before activation: ${this.stderr.join('').trim()}`);
    }
    this.child.stdin.write('activate\n');
    const line = await this.waitForLine((value) => value.startsWith('RESULT ') || value.startsWith('ERROR '),
      5_000, 'native window activation');
    if (line.startsWith('ERROR ')) throw new Error(`owned ${this.label} native activation failed: ${line.slice(6)}`);
    const result = JSON.parse(line.slice(7));
    if (result.pid !== this.pid || !/^[1-9]\d*$/.test(String(result.handle || ''))
      || (this.nativeWindowHandle != null && result.handle !== this.nativeWindowHandle)
      || result.foregroundHandle !== result.handle || result.foreground !== true) {
      throw new Error(`owned ${this.label} native activation failed: ${JSON.stringify(result)}`);
    }
    return result;
  }

  async close() {
    if (!this.child || this.child.exitCode != null || this.child.signalCode != null) {
      this.lines?.close?.();
      this.closedCleanly = true;
      return true;
    }
    this.child.stdin.write('exit\n');
    this.child.stdin.end();
    const closed = await waitForOwnedProcessClose(this.child, 5_000);
    if (!closed) {
      this.child.kill();
      await waitForOwnedProcessClose(this.child, 2_000);
    }
    this.lines?.close?.();
    this.closedCleanly = closed;
    return closed;
  }

  waitForLine(predicate, timeoutMs, label) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.lines.off('line', onLine);
        this.child.off('close', onClose);
      };
      const onLine = (line) => {
        if (!predicate(line)) return;
        cleanup();
        resolve(line);
      };
      const onClose = () => {
        cleanup();
        reject(new Error(`${label} driver exited: ${this.stderr.join('').trim()}`));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${label} timed out: ${this.stderr.join('').trim()}`));
      }, timeoutMs);
      this.lines.on('line', onLine);
      this.child.once('close', onClose);
    });
  }
}

async function closeOwnedRawBrowserRuntime(runtime) {
  const failures = [];
  const precloseUrlCheck = runtime.canonicalUrlTracker?.observeNow('immediately-preclose-live') || null;
  if (precloseUrlCheck?.pass !== true) failures.push('immediately-preclose live URL check failed');

  const browserCloseSent = runtime.rawSession?.notify?.('Browser.close') === true;
  if (!browserCloseSent) failures.push('raw CDP Browser.close command was not sent');
  let processClosed = await waitForOwnedProcessClose(runtime.browserChildProcess, 15_000);
  if (!processClosed && Number.isSafeInteger(runtime.browserChildProcess?.pid)) {
    failures.push('owned Chrome required exact-process-tree force-close fallback');
    await forceCloseOwnedElectronTree({
      pid: runtime.browserChildProcess.pid,
      platform: process.platform,
    }).catch((error) => failures.push(`owned Chrome force-close failed: ${error.message}`));
    processClosed = await waitForOwnedProcessClose(runtime.browserChildProcess, 5_000);
  }
  if (!processClosed) failures.push('owned Chrome process close was not confirmed');

  await runtime.rawSession?.close?.().catch((error) => failures.push(`raw CDP close failed: ${error.message}`));
  const windowDriverClosed = await runtime.windowActivator?.close?.()
    .catch((error) => {
      failures.push(`native window driver close failed: ${error.message}`);
      return false;
    });
  if (windowDriverClosed !== true) failures.push('native window driver did not close cleanly');
  const urlTracker = await runtime.canonicalUrlTracker?.stopAfterPageClose()
    .catch((error) => {
      failures.push(`canonical URL tracker close failed: ${error.message}`);
      return null;
    });
  if (urlTracker?.pass !== true) failures.push('canonical URL lifecycle did not close cleanly');

  await runtime.server?.close?.().catch((error) => failures.push(`owned game server close failed: ${error.message}`));
  let serverReleased = runtime.server?.server?.listening === false;
  if (serverReleased) {
    try {
      await fetch(runtime.rootUrl, { signal: AbortSignal.timeout(1_000) });
      serverReleased = false;
      failures.push('owned game server remained reachable after close');
    } catch (_) {
      serverReleased = true;
    }
  }

  let profileRemoved = false;
  if (processClosed) {
    try {
      profileRemoved = await removeOwnedRawBrowserProfile(runtime.userDataDir);
    } catch (error) {
      failures.push(`owned Chrome profile cleanup failed: ${error.message}`);
    }
  }
  if (!profileRemoved) failures.push('owned Chrome profile was not removed');

  const pageClosed = runtime.page?.isClosed() === true;
  if (!pageClosed) failures.push('raw CDP page remained open after Chrome close');
  return {
    pass: failures.length === 0,
    pageClosed,
    contextClosed: processClosed,
    browserDisconnected: runtime.rawSession?.closed === true,
    browserServerClosed: processClosed,
    browserProcessExited: processClosed,
    serverReleased,
    profileRemoved,
    windowDriverClosed,
    failures,
  };
}

async function closeOwnedElectronLifecycleRuntime(runtime) {
  const windowDriverClosed = await runtime.windowActivator?.close?.().catch(() => false);
  const report = await closeOwnedElectronRuntime({
    page: runtime.page,
    electronApp: runtime.electronApp,
    childProcess: runtime.childProcess,
    canonicalUrlTracker: runtime.canonicalUrlTracker,
    processMonitor: runtime.processMonitor,
    rootUrl: runtime.rootUrl,
  });
  report.windowDriverClosed = windowDriverClosed === true;
  if (!report.windowDriverClosed) {
    report.failures = [...(report.failures || []), 'native Electron window driver did not close cleanly'];
    report.pass = false;
  }
  return report;
}

async function waitForOwnedProcessClose(childProcess, timeoutMs) {
  if (!childProcess) return true;
  if (childProcess.exitCode != null || childProcess.signalCode != null) return true;
  return new Promise((resolve) => {
    const onClose = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      childProcess.off('close', onClose);
      resolve(false);
    }, timeoutMs);
    childProcess.once('close', onClose);
  });
}

async function removeOwnedRawBrowserProfile(userDataDir) {
  const resolvedRoot = path.resolve(RAW_BROWSER_PROFILE_ROOT);
  const resolvedProfile = path.resolve(String(userDataDir || ''));
  if (path.dirname(resolvedProfile) !== resolvedRoot || !path.basename(resolvedProfile).startsWith('probe-')) {
    throw new Error(`refusing to remove unowned Chrome profile ${resolvedProfile}`);
  }
  await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  return !existsSync(resolvedProfile);
}

export async function enterPublicFlight(runtime, seed = PERFORMANCE_LIFECYCLE_FIXED_SEED) {
  const page = runtime.page;
  await focusRuntimeWindow(runtime);
  await page.waitForFunction(() => document.hasFocus() && document.visibilityState === 'visible', null, { timeout: 10_000 });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.loop), null, { timeout: 30_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    if (page instanceof RawCdpLifecyclePage) {
      await page.evaluate(() => {
        const events = [];
        const handler = (event) => events.push({
          type: event.type,
          targetId: event.target?.id || null,
          targetClass: event.target?.className || null,
          x: event.clientX,
          y: event.clientY,
          defaultPrevented: event.defaultPrevented,
        });
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
          document.addEventListener(type, handler, true);
        }
        window.__sfLifecycleSplashClickAudit = {
          events,
          remove() {
            for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
              document.removeEventListener(type, handler, true);
            }
          },
        };
      });
    }
    await splash.click({ timeout: 8_000 });
    try {
      await splash.waitFor({ state: 'hidden', timeout: 8_000 });
    } catch (error) {
      const audit = page instanceof RawCdpLifecyclePage
        ? await page.evaluate(() => ({
          focused: document.hasFocus(),
          visibility: document.visibilityState,
          viewport: { width: innerWidth, height: innerHeight },
          splashRect: (() => {
            const rect = document.getElementById('cinematic-splash')?.getBoundingClientRect();
            return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
          })(),
          events: window.__sfLifecycleSplashClickAudit?.events || [],
        }))
        : null;
      throw new Error(`cinematic pointer dismissal failed: ${JSON.stringify(audit)}; ${error.message}`);
    } finally {
      if (page instanceof RawCdpLifecyclePage) {
        await page.evaluate(() => {
          window.__sfLifecycleSplashClickAudit?.remove?.();
          delete window.__sfLifecycleSplashClickAudit;
        }).catch(() => {});
      }
    }
  }
  await page.waitForFunction(() => {
    const visible = (element) => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    return visible(document.querySelector('[data-screen="mainMenu"]'))
      || visible(document.querySelector('[data-screen="newGame"]'));
  }, null, { timeout: 30_000 });
  if (await page.locator('[data-screen="mainMenu"]').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  }
  await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30_000 });
  const seedInput = page.locator('#sf-ng-seed');
  await seedInput.fill(String(seed));
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf?.state;
    const playerId = state?.player?.entityId;
    const player = state?.entities?.get?.(playerId);
    const readiness = typeof sf?.authoredVisualReadiness === 'function'
      ? sf.authoredVisualReadiness()
      : null;
    return state?.mode === 'flight' && player?.alive !== false && !!document.getElementById('gl-canvas')
      && readiness?.ready === true;
  }, null, { timeout: 90_000 });
  await page.locator('#gl-canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await delay(1_000);
}

async function installGpuSubmissionObserver(page) {
  const report = await page.evaluate(() => {
    const canvas = document.getElementById('gl-canvas');
    const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    if (!gl) return { installed: false, wrapped: [], reason: 'game-context-missing' };
    if (window.__sfLifecycleGpuObserver?.installed) return window.__sfLifecycleGpuObserver.report();
    const counters = { total: 0, byMethod: {} };
    const wrapped = [];
    for (const name of [
      'drawArrays',
      'drawElements',
      'drawArraysInstanced',
      'drawElementsInstanced',
      'clear',
      'blitFramebuffer',
      'flush',
    ]) {
      const original = gl[name];
      if (typeof original !== 'function') continue;
      try {
        Object.defineProperty(gl, name, {
          configurable: true,
          value(...args) {
            counters.total++;
            counters.byMethod[name] = (counters.byMethod[name] || 0) + 1;
            return original.apply(gl, args);
          },
        });
        wrapped.push(name);
      } catch (_) { /* validation rejects an observer with no wrapped draw path */ }
    }
    const api = {
      installed: wrapped.some((name) => name.startsWith('draw')),
      report: () => ({ installed: api.installed, wrapped: wrapped.slice(), total: counters.total, byMethod: { ...counters.byMethod } }),
    };
    Object.defineProperty(window, '__sfLifecycleGpuObserver', { configurable: true, value: api });
    return api.report();
  });
  assert.equal(report.installed, true, `WebGL submission observer failed: ${JSON.stringify(report)}`);
  return report;
}

export async function ensureRunningAudio(runtime) {
  const page = runtime.page;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await focusRuntimeForLifecycleSample(runtime);
    const observation = await readRuntimeObservation(page);
    if (observation.audio.contextState === 'running') return observation.audio;
    await unlockAudioWithKeyboard(page);
    await delay(250);
  }
  const observation = await readRuntimeObservation(page);
  assert.equal(observation.audio.contextState, 'running', `audio context did not unlock: ${JSON.stringify(observation.audio)}`);
  return observation.audio;
}

export async function unlockAudioWithKeyboard(page) {
  const canvas = page.locator('#gl-canvas');
  await canvas.focus();
  // F13 is an ordinary trusted key gesture with no SpaceFace binding and no Windows accessibility
  // shortcut. Repeated Shift unlock attempts can summon Sticky Keys and steal/minimize the native
  // foreground window, contaminating the lifecycle sample they are meant to prepare.
  await page.keyboard.press('F13');
}

async function measureForegroundWindow(page) {
  await waitForObservation(page, (value) => value.lifecycleState === 'foreground-visible'
    && value.audio.contextState === 'running', 'foreground readiness');
  const before = await readRuntimeObservation(page);
  await delay(FOREGROUND_SAMPLE_MS);
  const after = await readRuntimeObservation(page);
  assert.equal(after.lifecycleState, 'foreground-visible',
    `foreground cadence sample lost native foreground ownership: ${JSON.stringify(after.loop)}`);
  assert.equal(after.audio.contextState, 'running',
    `foreground cadence sample lost running audio: ${JSON.stringify(after.audio)}`);
  return { before, after, delta: summarizeLifecycleDelta(before, after) };
}

export async function measureSettledForegroundWindow(runtime, {
  waitForWarmup = delay,
  focusAfterWarmup = focusRuntimeForLifecycleSample,
  measureWindow = measureForegroundWindow,
  warmupMs = FOREGROUND_WARMUP_MS,
  settleAttempts = FOREGROUND_SETTLE_ATTEMPTS,
} = {}) {
  await waitForWarmup(warmupMs);
  await focusAfterWarmup(runtime);
  const settleWindows = [];
  for (let attempt = 0; attempt < settleAttempts; attempt += 1) {
    const measurement = await measureWindow(runtime.page);
    settleWindows.push(measurement.delta);
    if (foregroundWindowSequenceSettled(settleWindows)) {
      return { ...measurement, warmupMs, settleWindows };
    }
  }
  throw new Error(`foreground cadence did not settle: ${JSON.stringify(settleWindows)}`);
}

export async function focusRuntimeForLifecycleSample(runtime, {
  waitForForeground = waitForObservation,
} = {}) {
  await focusRuntimeWindow(runtime);
  return waitForForeground(runtime.page, (value) => value.lifecycleState === 'foreground-visible',
    `${runtime.runtimeKind} foreground sample focus`);
}

export async function focusRuntimeWindow(runtime) {
  await restoreRuntime(runtime, 'window-minimize');
  if (runtime.runtimeKind === 'electron') await runtime.windowActivator.activate();
}

export function isHiddenLifecycleReady(value, runtimeKind) {
  return value?.lifecycleState === 'hidden-or-minimized'
    && value?.audio?.lifecycleSuspended === true
    && value?.audio?.frameOwner === false
    && value?.audio?.contextState !== 'running'
    && value?.input?.ownerNeutral === true
    && (runtimeKind !== 'browser' || value?.documentVisibility === 'hidden');
}

async function exerciseElectronOcclusion(runtime) {
  await focusRuntimeWindow(runtime);
  await waitForObservation(runtime.page, (value) => value.lifecycleState === 'foreground-visible', 'Electron focus');
  let focusTransfer = null;
  let nativeWindowDuring = null;
  let sinkNativeDuring = null;
  let delta = null;
  const errors = [];
  try {
    focusTransfer = await createElectronFocusSink(runtime.electronApp, runtime.mainWindowId);
    await waitForObservation(runtime.page, (value) => value.lifecycleState === 'foreground-occluded',
      'Electron native focus transfer');
    nativeWindowDuring = await readElectronWindowState(runtime.electronApp, runtime.mainWindowId);
    sinkNativeDuring = await readElectronWindowState(runtime.electronApp, focusTransfer.sinkWindowId);
    const before = await readRuntimeObservation(runtime.page);
    await delay(500);
    const after = await readRuntimeObservation(runtime.page);
    delta = summarizeLifecycleDelta(before, after);
  } catch (error) {
    errors.push(error);
  } finally {
    if (Number.isSafeInteger(focusTransfer?.sinkWindowId)) {
      try {
        focusTransfer.cleanup = await destroyElectronFocusSink(
          runtime.electronApp,
          runtime.mainWindowId,
          focusTransfer.sinkWindowId,
        );
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      await focusRuntimeWindow(runtime);
      await waitForObservation(runtime.page, (value) => value.lifecycleState === 'foreground-visible',
        'Electron refocus after native focus transfer');
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Electron native focus-transfer occlusion failed');
  }
  return {
    trigger: 'native-focus-transfer',
    native: true,
    state: 'foreground-occluded',
    restoredState: 'foreground-visible',
    executedFrames: delta.executedFrames,
    renderUpdates: delta.renderUpdates,
    simulationCompletedTicks: delta.simulationCompletedTicks,
    nativeWindowDuring,
    focusTransfer: {
      ...focusTransfer,
      sinkNativeDuring,
    },
  };
}

async function exerciseHiddenTransition(runtime, { id, trigger }) {
  await restoreRuntime(runtime, trigger);
  await waitForObservation(runtime.page, (value) => value.lifecycleState === 'foreground-visible'
    && value.audio.contextState === 'running', `${id} precondition`);
  await runtime.page.keyboard.down('KeyW');
  await waitForObservation(runtime.page, (value) => value.input.held === true, `${id} held input`);
  const before = await readRuntimeObservation(runtime.page);

  const nativeWindowBefore = runtime.runtimeKind === 'electron'
    ? await readElectronWindowState(runtime.electronApp, runtime.mainWindowId)
    : null;
  await hideRuntime(runtime, trigger);
  await waitForObservation(runtime.page, (value) => isHiddenLifecycleReady(value, runtime.runtimeKind),
    `${id} hidden state`);
  const hiddenStart = await readRuntimeObservation(runtime.page);
  const nativeWindowDuring = runtime.runtimeKind === 'electron'
    ? await readElectronWindowState(runtime.electronApp, runtime.mainWindowId)
    : null;
  await delay(HIDDEN_SAMPLE_MS);
  const hiddenEnd = await readRuntimeObservation(runtime.page);
  await runtime.page.keyboard.up('KeyW').catch(() => {});

  await restoreRuntime(runtime, trigger);
  await waitForObservation(runtime.page, (value) => value.lifecycleState === 'foreground-visible'
    && value.audio.lifecycleSuspended === false
    && value.audio.contextState === 'running'
    && value.input.neutral === true
    && value.loop.postRestoreFrameCount > before.loop.postRestoreFrameCount, `${id} restored state`);
  const after = await readRuntimeObservation(runtime.page);
  const nativeWindowAfter = runtime.runtimeKind === 'electron'
    ? await readElectronWindowState(runtime.electronApp, runtime.mainWindowId)
    : null;

  return {
    id,
    trigger,
    native: true,
    hiddenState: hiddenStart.lifecycleState,
    documentVisibilityDuring: hiddenStart.documentVisibility,
    hiddenDurationMs: HIDDEN_SAMPLE_MS,
    hiddenDelta: summarizeLifecycleDelta(hiddenStart, hiddenEnd),
    suspendDelta: hiddenStart.loop.suspendCount - before.loop.suspendCount,
    resumeDelta: after.loop.resumeCount - before.loop.resumeCount,
    restoreFrameDelta: after.loop.restoreFrameCount - before.loop.restoreFrameCount,
    timestampResetDelta: after.loop.timestampResetCount - before.loop.timestampResetCount,
    shedBacklogDelta: after.loop.shedBacklogFrames - before.loop.shedBacklogFrames,
    maxStepsAfter: after.loop.maxStepsObserved,
    postRestoreFrameDelta: after.loop.postRestoreFrameCount - before.loop.postRestoreFrameCount,
    postRestoreShedBacklogDelta: after.loop.postRestoreShedBacklogCount
      - before.loop.postRestoreShedBacklogCount,
    postRestoreMaxStepsAfter: after.loop.postRestoreMaxStepsObserved,
    input: {
      heldBefore: before.input.held,
      neutralWhileHidden: hiddenStart.input.ownerNeutral && hiddenEnd.input.ownerNeutral,
      neutralAfterRestore: after.input.neutral,
    },
    audio: {
      contextWasRunning: before.audio.contextState === 'running',
      lifecycleSuspendedWhileHidden: hiddenStart.audio.lifecycleSuspended && hiddenEnd.audio.lifecycleSuspended,
      frameOwnerWhileHidden: hiddenStart.audio.frameOwner || hiddenEnd.audio.frameOwner,
      contextSuspendedWhileHidden: hiddenStart.audio.contextState !== 'running' && hiddenEnd.audio.contextState !== 'running',
      lifecycleSuspendedAfterRestore: after.audio.lifecycleSuspended,
      contextRunningAfterRestore: after.audio.contextState === 'running',
    },
    nativeWindowBefore,
    nativeWindowDuring,
    nativeWindowAfter,
  };
}

async function hideRuntime(runtime, trigger) {
  if (runtime.runtimeKind === 'browser') {
    await setBrowserWindowLifecycleState(runtime.browserWindowDriver, 'minimized');
    return;
  }
  await driveElectronWindow(runtime.electronApp, trigger === 'window-minimize' ? 'minimize' : 'hide',
    runtime.mainWindowId);
}

async function restoreRuntime(runtime, trigger) {
  if (runtime.runtimeKind === 'browser') {
    await setBrowserWindowLifecycleState(runtime.browserWindowDriver, 'normal');
    await runtime.page.bringToFront();
    return;
  }
  await driveElectronWindow(runtime.electronApp, trigger === 'window-minimize' ? 'restore' : 'show',
    runtime.mainWindowId);
}

export async function createBrowserWindowLifecycleDriver(context, page) {
  const rawCdp = page instanceof RawCdpLifecyclePage;
  const cdp = rawCdp ? page.session : await disablePlaywrightFocusEmulation(context, page);
  const identity = await cdp.send('Browser.getWindowForTarget');
  if (!Number.isSafeInteger(identity?.windowId)) {
    throw new Error(`owned Chrome window identity is unavailable: ${JSON.stringify(identity)}`);
  }
  return {
    cdp,
    windowId: identity.windowId,
    initialBounds: identity.bounds || null,
    focusEmulationDisabled: true,
    rawCdp,
  };
}

export async function disablePlaywrightFocusEmulation(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  return cdp;
}

export async function setBrowserWindowLifecycleState(driver, windowState) {
  if (!driver?.cdp || !Number.isSafeInteger(driver.windowId)) {
    throw new Error('owned Chrome lifecycle driver is incomplete');
  }
  if (!['minimized', 'normal'].includes(windowState)) {
    throw new Error(`unsupported Chrome window lifecycle state ${windowState}`);
  }
  await driver.cdp.send('Browser.setWindowBounds', {
    windowId: driver.windowId,
    bounds: { windowState },
  });
}

export async function driveElectronWindow(electronApp, action, windowId) {
  if (!Number.isSafeInteger(windowId)) throw new Error(`invalid SpaceFace BrowserWindow id ${windowId}`);
  return electronApp.evaluate(({ BrowserWindow }, { requestedAction, targetWindowId }) => {
    const win = BrowserWindow.fromId(targetWindowId);
    if (!win || win.isDestroyed()) throw new Error('SpaceFace BrowserWindow is unavailable');
    if (requestedAction === 'minimize') win.minimize();
    else if (requestedAction === 'restore') {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else if (requestedAction === 'hide') win.hide();
    else if (requestedAction === 'show') {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else if (requestedAction === 'focus') {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else throw new Error(`unknown BrowserWindow lifecycle action ${requestedAction}`);
    return {
      windowId: win.id,
      action: requestedAction,
      minimized: win.isMinimized(),
      visible: win.isVisible(),
      focused: win.isFocused(),
    };
  }, { requestedAction: action, targetWindowId: windowId });
}

export async function readElectronWindowState(electronApp, windowId) {
  if (!Number.isSafeInteger(windowId)) throw new Error(`invalid Electron BrowserWindow id ${windowId}`);
  return electronApp.evaluate(({ BrowserWindow }, targetWindowId) => {
    const win = BrowserWindow.fromId(targetWindowId);
    if (!win || win.isDestroyed()) return { available: false, windowId: targetWindowId, hidden: null };
    const minimized = win.isMinimized();
    const visible = win.isVisible();
    return {
      available: true,
      windowId: win.id,
      minimized,
      visible,
      focused: win.isFocused(),
      hidden: minimized || !visible,
    };
  }, windowId);
}

export async function installElectronNativeWindowAudit(electronApp, mainWindowId) {
  if (!Number.isSafeInteger(mainWindowId)) throw new Error(`invalid SpaceFace BrowserWindow id ${mainWindowId}`);
  return electronApp.evaluate(({ BrowserWindow }, targetWindowId) => {
    const win = BrowserWindow.fromId(targetWindowId);
    if (!win || win.isDestroyed()) throw new Error('SpaceFace BrowserWindow is unavailable');
    const events = [];
    const record = (event) => {
      const bounds = win.isDestroyed() ? null : win.getBounds();
      events.push({
        sequence: events.length + 1,
        at: Date.now(),
        event,
        windowId: targetWindowId,
        destroyed: win.isDestroyed(),
        minimized: win.isDestroyed() ? null : win.isMinimized(),
        visible: win.isDestroyed() ? null : win.isVisible(),
        focused: win.isDestroyed() ? null : win.isFocused(),
        bounds,
      });
      if (events.length > 128) events.splice(0, events.length - 128);
    };
    for (const event of ['show', 'hide', 'minimize', 'restore', 'focus', 'blur', 'close', 'closed']) {
      win.on(event, () => record(event));
    }
    globalThis.__sfPerformanceLifecycleNativeWindowAudit = {
      schema: 'spaceface.performanceLifecycleNativeWindowAudit.v1',
      mainWindowId: targetWindowId,
      events,
      record,
    };
    record('audit-installed');
    return { mainWindowId: targetWindowId, installed: true };
  }, mainWindowId);
}

export async function readElectronNativeWindowAudit(electronApp) {
  return electronApp.evaluate(() => {
    const audit = globalThis.__sfPerformanceLifecycleNativeWindowAudit || null;
    if (!audit) return { unavailable: true, reason: 'native window audit was not installed' };
    audit.record('audit-read');
    return {
      schema: audit.schema,
      mainWindowId: audit.mainWindowId,
      events: audit.events.map((event) => ({ ...event, bounds: event.bounds ? { ...event.bounds } : null })),
    };
  });
}

export async function createElectronFocusSink(electronApp, mainWindowId) {
  if (!Number.isSafeInteger(mainWindowId)) throw new Error(`invalid SpaceFace BrowserWindow id ${mainWindowId}`);
  return electronApp.evaluate(({ BrowserWindow, screen }, targetWindowId) => {
    const mainWindow = BrowserWindow.fromId(targetWindowId);
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('SpaceFace BrowserWindow is unavailable');
    const workArea = screen.getPrimaryDisplay().workArea;
    const sink = new BrowserWindow({
      width: 2,
      height: 2,
      x: workArea.x + workArea.width - 2,
      y: workArea.y + workArea.height - 2,
      show: false,
      frame: false,
      focusable: true,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: '#000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    sink.setMenuBarVisibility(false);
    sink.show();
    sink.moveTop();
    sink.focus();
    return {
      driver: 'harness-native-browser-window',
      synthetic: false,
      mainWindowId: mainWindow.id,
      sinkWindowId: sink.id,
    };
  }, mainWindowId);
}

export async function destroyElectronFocusSink(electronApp, mainWindowId, sinkWindowId) {
  if (!Number.isSafeInteger(mainWindowId) || !Number.isSafeInteger(sinkWindowId)
    || mainWindowId === sinkWindowId) {
    throw new Error(`invalid Electron focus-sink identity ${mainWindowId}/${sinkWindowId}`);
  }
  return electronApp.evaluate(({ BrowserWindow }, identities) => {
    const sink = BrowserWindow.fromId(identities.sinkWindowId);
    const existed = !!sink && !sink.isDestroyed();
    if (existed) sink.destroy();
    return {
      mainWindowId: identities.mainWindowId,
      sinkWindowId: identities.sinkWindowId,
      existed,
      destroyed: !BrowserWindow.fromId(identities.sinkWindowId),
    };
  }, { mainWindowId, sinkWindowId });
}

async function readRuntimeObservation(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    if (!sf?.state || !sf?.loop) throw new Error('SpaceFace debug observation surface is unavailable');
    const state = sf.state;
    const loop = sf.loop.getDiagnostics();
    const audioOwner = sf.registry?.get?.('audio');
    const inputOwner = sf.registry?.get?.('input');
    const audio = audioOwner?.rt || null;
    const gpuObserver = window.__sfLifecycleGpuObserver?.report?.() || null;
    const input = state.input || {};
    const actionActive = Object.values(input.actions || {}).some((value) => {
      if (typeof value === 'boolean') return value;
      if (!value || typeof value !== 'object') return Number(value) > 0.01;
      return value.held === true || value.pressed === true || Number(value.value) > 0.01;
    });
    const held = Math.abs(Number(input.moveZ || 0)) > 0.1;
    const neutral = !held
      && Math.abs(Number(input.moveX || 0)) <= 0.01
      && Math.abs(Number(input.turnIntent || 0)) <= 0.01
      && input.boost !== true
      && !actionActive;
    const touch = inputOwner?.touch;
    const inputOwnerHeld = Object.values(inputOwner?._keys || {}).some((value) => value === true)
      || inputOwner?._m0 === true
      || inputOwner?._m1 === true
      || inputOwner?._m2 === true
      || inputOwner?._travelEdge === true
      || inputOwner?._cmHeld === true
      || Object.values(touch?._btnHeld || {}).some((value) => value === true)
      || Object.values(touch?.actions || {}).some((value) => value?.held === true)
      || Object.values(touch?.axes || {}).some((value) => Math.abs(Number(value || 0)) > 0.01);
    return {
      capturedAtMs: performance.now(),
      documentVisibility: document.visibilityState,
      lifecycleState: sf.loop.getLifecycleState(),
      suspended: sf.loop.isSuspended(),
      tick: Number(state.tick || 0),
      simTime: Number(state.simTime || 0),
      accumulator: Number(state.accumulator || 0),
      gpuSubmissions: Number(gpuObserver?.total || 0),
      gpuObserver,
      loop,
      simulation: loop.simulation || {},
      input: {
        moveX: Number(input.moveX || 0),
        moveZ: Number(input.moveZ || 0),
        boost: input.boost === true,
        held,
        neutral,
        ownerNeutral: !inputOwnerHeld,
      },
      audio: {
        available: !!audio,
        lifecycleSuspended: audio?._lifecycleSuspended === true,
        lifecycleReason: audio?._lifecycleReason || null,
        frameOwner: Number(audio?._rafId || 0) !== 0,
        contextState: audio?.ctx?.state || null,
        contextEverRan: audio?._contextEverRan === true,
        resumeAfterLifecycle: audio?._resumeAfterLifecycle === true,
      },
    };
  });
}

async function readRouteIdentity(page) {
  return page.evaluate(async () => {
    const sf = window.SF;
    const state = sf?.state;
    if (!state) throw new Error('SpaceFace state is unavailable');
    const defaultsModule = await import('/src/core/gameState.js');
    const defaults = defaultsModule.createGameState(1).settings;
    const playerId = state.player?.entityId;
    const player = state.entities?.get?.(playerId) || null;
    const settings = {
      video: { ...(state.settings?.video || {}) },
      gameplay: { ...(state.settings?.gameplay || {}) },
      audio: { ...(state.settings?.audio || {}) },
    };
    const defaultSettings = JSON.stringify(settings.video) === JSON.stringify(defaults.video)
      && JSON.stringify(settings.gameplay) === JSON.stringify(defaults.gameplay)
      && JSON.stringify(settings.audio) === JSON.stringify(defaults.audio);
    const authoredVisualReadiness = typeof sf.authoredVisualReadiness === 'function'
      ? sf.authoredVisualReadiness()
      : null;
    return {
      mode: state.mode,
      seed: state.meta?.seed ?? null,
      defaultSettings,
      authoredVisualReady: authoredVisualReadiness?.ready === true,
      settings,
      signature: {
        mode: state.mode,
        seed: state.meta?.seed ?? null,
        playerShipId: state.player?.shipId || player?.data?.shipDefId || null,
        flightBackend: state.settings?.gameplay?.flightBackend || null,
        aiBackend: state.settings?.gameplay?.aiBackend || null,
        physicsBackend: state.settings?.gameplay?.physicsBackend || null,
        settings,
      },
    };
  });
}

async function readGpuIdentity(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('gl-canvas');
    const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    if (!gl) return { hasContext: false, source: null, vendor: '', renderer: '', software: null };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = String(debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) || '');
    const renderer = String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    const runtimeGpu = window.SF?.state?.render?.gpu || null;
    return {
      hasContext: true,
      source: 'game-renderer',
      vendor,
      renderer,
      version: String(gl.getParameter(gl.VERSION) || ''),
      runtimeGpu,
      software: runtimeGpu?.software === true || /swiftshader|llvmpipe|software raster|software renderer/i.test(renderer),
    };
  });
}

async function waitForObservation(page, predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  let latestError = null;
  while (Date.now() < deadline) {
    try {
      latest = await readRuntimeObservation(page);
      if (predicate(latest)) return latest;
    } catch (error) {
      latestError = error;
    }
    await delay(50);
  }
  throw new Error(`${label} timed out; latest=${JSON.stringify(latest)} error=${latestError?.message || 'none'}`);
}

function normalizeCleanup(runtimeKind, report, runtime) {
  if (runtimeKind === 'browser') {
    return {
      pass: report?.pass === true,
      pageClosed: report?.pageClosed === true,
      contextClosed: report?.contextClosed === true,
      runtimeClosed: report?.browserDisconnected === true
        && report?.browserServerClosed === true
        && report?.browserProcessExited === true,
      serverClosed: report?.serverReleased === true,
      profileRemoved: report?.profileRemoved === true,
      windowDriverClosed: report?.windowDriverClosed === true,
      failures: report?.failures || [],
    };
  }
  return {
    pass: report?.pass === true,
    pageClosed: report?.pageClosed === true,
    runtimeClosed: report?.processExited === true && report?.processCloseConfirmed === true,
    listenerClosed: report?.listenerReleased === true,
    profileRemoved: !existsSync(runtime.isolatedLaunch.userDataDir),
    windowDriverClosed: report?.windowDriverClosed === true,
    failures: report?.failures || [],
  };
}

function findSystemBrowser() {
  const candidates = process.platform === 'win32' ? [
    process.env.SPACEFACE_BROWSER_EXE,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ] : [
    process.env.SPACEFACE_BROWSER_EXE,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
}

function readCommit(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function digest(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function ratio(numerator, denominator) {
  return Number(denominator) > 0 ? Number(numerator) / Number(denominator) : 0;
}

function safeSegment(value) {
  return String(value || 'run').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 120);
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    code: error?.code || null,
    message: error?.message || String(error),
    stack: error?.stack || null,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
