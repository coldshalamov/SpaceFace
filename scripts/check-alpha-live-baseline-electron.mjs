#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  inspectCanonicalRootUrl,
  publishAcceptedArtifacts,
  worktreeFingerprint,
} from './lib/alphaLiveBaselineContracts.mjs';
import {
  assessElectronProcessHealth,
  assessElectronScreenshotDimensions,
  assessElectronViewportFloor,
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
  evaluateElectronPublicationReadiness,
  evaluateElectronUrlAcceptance,
  runGuardedElectronPublication,
  validateElectronEvidenceEnvelope,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import { runBrowserPublicRoute } from './lib/alphaLiveBaselineRoute.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TASK_ID = 'm0-live-baseline-electron';
const ALPHA_ROOT = path.join(ROOT, '.devshots', 'alpha');
const HISTORY_ROOT = path.join(ROOT, '.devshots', 'alpha-history');
const ACCEPTED_ROOT = path.join(ALPHA_ROOT, TASK_ID);
const STAGING_ROOT = path.join(
  ALPHA_ROOT,
  `.tmp-${TASK_ID}-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`,
);
const LOG_LINES = [];

let electronApp = null;
let childProcess = null;
let page = null;
let pageIssueTracker = null;
let canonicalUrlTracker = null;
let processMonitor = null;
let routeResult = null;
let rootUrl = null;
let rootUrlCheck = null;
let runtimeMetadata = null;
let screenshotTelemetry = null;
let viewportFloorAssessment = null;
let screenshotDimensionAssessment = null;
let startFingerprint = null;
let routeFingerprint = null;
let cleanupFingerprint = null;
let postFingerprintUrlCheck = null;
let routeProcessHealth = null;
let cleanupReport = null;
let primaryError = null;
let failureSnapshot = null;

await mkdir(ALPHA_ROOT, { recursive: true });
assertGuardedTaskPath(STAGING_ROOT, '.tmp-');
await mkdir(STAGING_ROOT, { recursive: false });

try {
  startFingerprint = await worktreeFingerprint(ROOT);
  log(`worktree start ${startFingerprint.id}`);

  const { _electron: electron } = await loadPlaywright();
  electronApp = await electron.launch({ args: ['.'], cwd: ROOT, timeout: 90_000 });
  processMonitor = createElectronProcessMonitor({ electronApp, childProcess: electronApp.process() });
  childProcess = processMonitor.childProcess;
  assert(childProcess, 'Playwright Electron launch must expose the owned child process');
  pageIssueTracker = createStrictElectronApplicationIssueTracker(electronApp);
  log(`electron process pid=${childProcess.pid || 'unknown'}`);

  page = await electronApp.firstWindow({ timeout: 90_000 });
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
  });
  await pageIssueTracker.bindAndBackfillPage(page);
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);

  rootUrl = await canonicalUrlTracker.waitForCanonicalRoot(10_000);
  rootUrl = assertElectronRootUrl(rootUrl);
  rootUrlCheck = { boundary: 'canonical-root-established', ...inspectCanonicalRootUrl(page.url(), rootUrl) };
  assert.deepEqual(rootUrlCheck.failures, [], `Electron launcher must establish the canonical slash root: ${JSON.stringify(rootUrlCheck)}`);
  log(`electron root ${rootUrl}`);

  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  await page.bringToFront();
  runtimeMetadata = await collectElectronRuntimeMetadata(electronApp, page, childProcess);
  viewportFloorAssessment = assessElectronViewportFloor(runtimeMetadata);
  assert.deepEqual(viewportFloorAssessment.failures, [],
    `Electron default CSS content viewport did not meet the common player floor: ${JSON.stringify(viewportFloorAssessment)}`);

  routeResult = await runBrowserPublicRoute({
    page,
    outputDir: STAGING_ROOT,
    expectedRootUrl: rootUrl,
    log,
    flightTimeoutMs: 150_000,
    dockTimeoutMs: 90_000,
  });

  const pageErrors = pageIssueTracker.errors();
  assert.deepEqual(pageErrors, [], `Electron public route emitted page/request/HTTP errors: ${JSON.stringify(pageErrors)}`);
  routeProcessHealth = assessElectronProcessHealth(processMonitor.snapshot());
  assert.deepEqual(routeProcessHealth.failures, [],
    `Electron public route emitted GPU/main-process failures: ${JSON.stringify(routeProcessHealth.failures)}`);

  screenshotTelemetry = await inspectAcceptanceScreenshots(routeResult.screenshots);
  screenshotDimensionAssessment = assessElectronScreenshotDimensions(screenshotTelemetry);
  assert.deepEqual(screenshotDimensionAssessment.failures, [],
    `Electron physical PNG evidence did not meet the screenshot floor: ${JSON.stringify(screenshotDimensionAssessment)}`);

  routeFingerprint = await worktreeFingerprint(ROOT);
  postFingerprintUrlCheck = canonicalUrlTracker.observeNow('post-worktree-fingerprint-live');
  assert.deepEqual(postFingerprintUrlCheck.failures, [],
    `post-worktree-fingerprint live Electron URL left the canonical root: ${JSON.stringify(postFingerprintUrlCheck)}`);
  assert.equal(
    routeFingerprint.digest,
    startFingerprint.digest,
    `tracked, staged, intent-to-add, or ordinary untracked worktree content changed during Electron capture: ${startFingerprint.id} -> ${routeFingerprint.id}`,
  );
  log(`worktree route ${routeFingerprint.id}`);
} catch (error) {
  primaryError = error;
  if (page && !page.isClosed()) {
    try {
      failureSnapshot = await captureFailureDiagnostics(page, STAGING_ROOT);
    } catch (captureError) {
      primaryError.failureCaptureError = serializeError(captureError);
    }
  }
} finally {
  try {
    cleanupReport = await closeOwnedElectronRuntime({
      page,
      electronApp,
      childProcess,
      canonicalUrlTracker,
      processMonitor,
      rootUrl,
    });
    log(`cleanup ${JSON.stringify(cleanupReport)}`);
    if (cleanupReport.pass !== true) {
      const cleanupError = new Error(`owned Electron cleanup failed: ${cleanupReport.failures.join('; ')}`);
      cleanupError.cleanupReport = cleanupReport;
      if (!primaryError) primaryError = cleanupError;
      else primaryError.cleanupError = serializeError(cleanupError);
    }
  } catch (error) {
    cleanupReport = error.cleanupReport || { pass: false, failures: [error.message || String(error)] };
    if (!primaryError) primaryError = error;
    else primaryError.cleanupError = serializeError(error);
  }
  pageIssueTracker?.stop?.();

  try {
    cleanupFingerprint = await worktreeFingerprint(ROOT);
    if (startFingerprint && cleanupFingerprint.digest !== startFingerprint.digest) {
      const drift = new Error(`tracked, staged, intent-to-add, or ordinary untracked worktree content changed before Electron cleanup completed: ${startFingerprint.id} -> ${cleanupFingerprint.id}`);
      if (!primaryError) primaryError = drift;
      else primaryError.worktreeDrift = serializeError(drift);
    }
    if (cleanupFingerprint) log(`worktree cleanup ${cleanupFingerprint.id}`);
  } catch (error) {
    if (!primaryError) primaryError = error;
    else primaryError.fingerprintError = serializeError(error);
  }
}

let publicationFailureError = null;
const publicationOutcome = await runGuardedElectronPublication({
  acceptedPhase: async () => {
    if (primaryError) throw primaryError;
    assert(routeResult?.pass === true, 'shared public route must pass before Electron primary evidence is written');
    assert(cleanupReport?.pass === true, 'owned Electron cleanup must pass before primary evidence is written');
    assert.equal(cleanupFingerprint?.digest, startFingerprint?.digest, 'worktree must remain stable through Electron cleanup');

    const urlAcceptance = evaluateElectronUrlAcceptance({
      expectedRootUrl: rootUrl,
      observations: cleanupReport.urlTracker.observations,
      postFingerprintUrlCheck,
      precloseUrlCheck: cleanupReport.precloseUrlCheck,
    });
    assert.deepEqual(urlAcceptance.failures, [],
      `Electron canonical URL lifecycle rejected publication: ${JSON.stringify(urlAcceptance)}`);

    const finalArtifactBase = `.devshots/alpha/${TASK_ID}`;
    const evidence = {
      schema: 'spaceface.alphaEvidence.v1',
      taskId: TASK_ID,
      worktreeId: startFingerprint.id,
      route: `${rootUrl} public Electron root, no query: intro -> Main Menu -> New Game -> Launch -> ordinary flight input -> galaxy map -> Helios Station waypoint/autopilot -> physical dock prompt -> station hub`,
      viewport: runtimeMetadata.viewport,
      runtime: { kind: 'electron', gpu: routeResult.gpu.identity },
      captureKind: 'electron',
      inputSource: 'keyboard-mouse',
      injectedState: false,
      primaryAcceptance: true,
      checks: [
        { name: 'real Electron app and owned listener', status: 'pass' },
        { name: 'canonical root tracked from first-window acquisition through closure', status: 'pass' },
        { name: 'public intro/menu/new-game launch', status: 'pass' },
        { name: 'authored flight readiness', status: 'pass' },
        { name: 'ordinary keyboard-mouse causal flight response', status: 'pass' },
        { name: 'public galaxy-map station waypoint', status: 'pass' },
        { name: 'autopilot reaches physical dock prompt', status: 'pass' },
        { name: 'public dock input reaches settled station hub', status: 'pass' },
        { name: 'hardware WebGL', status: 'pass' },
        { name: 'page/request/HTTP errors absent', status: 'pass' },
        { name: 'pre-window observers and retained page histories covered', status: 'pass' },
        { name: 'GPU and main-process crashes absent', status: 'pass' },
        { name: '1280x720-or-larger CSS content viewport', status: 'pass' },
        { name: '1440x900-or-larger physical PNG screenshots', status: 'pass' },
        { name: 'route performance telemetry captured', status: 'pass' },
        { name: 'worktree stable', status: 'pass' },
        { name: 'Electron process and listener released', status: 'pass' },
      ],
      artifacts: [
        ...routeResult.screenshots.map((name) => ({ kind: 'screenshot', path: `${finalArtifactBase}/${name}` })),
        { kind: 'report', path: `${finalArtifactBase}/route-report.json` },
        { kind: 'telemetry', path: `${finalArtifactBase}/electron-runtime-telemetry.json` },
        { kind: 'telemetry', path: `${finalArtifactBase}/viewport-floor-telemetry.json` },
        { kind: 'telemetry', path: `${finalArtifactBase}/url-lifecycle-telemetry.json` },
        { kind: 'telemetry', path: `${finalArtifactBase}/process-telemetry.json` },
        { kind: 'telemetry', path: `${finalArtifactBase}/page-issue-telemetry.json` },
        { kind: 'telemetry', path: `${finalArtifactBase}/screenshot-dimensions.json` },
        { kind: 'telemetry', path: `${finalArtifactBase}/flight-input-telemetry.json` },
        { kind: 'telemetry', path: `${finalArtifactBase}/hardware-gpu-telemetry.json` },
        { kind: 'telemetry', path: `${finalArtifactBase}/station-settlement-telemetry.json` },
        { kind: 'telemetry', path: `${finalArtifactBase}/performance-telemetry.json` },
        { kind: 'log', path: `${finalArtifactBase}/run.log` },
      ],
      notes: [
        'Playwright launched the real repository Electron entrypoint and did not start a browser-side server.',
        'The visible route used only public keyboard, pointer, and UI controls; runtime reads were assertions and telemetry only.',
        'The first acquired window established the canonical loopback slash root and remained on that exact origin, path, empty search, and empty hash through closure.',
        'The Electron child process and its exact HTTP listener were both proven gone after application close.',
        'The default launcher window was not resized or zoomed; its CSS content viewport, outer window, screen, and device scale factor are recorded separately.',
        'Every accepted screenshot was parsed from its PNG header and measured at or above 1440x900 physical pixels.',
        'Performance samples include capture overhead and do not claim Milestone-6 thresholds.',
        'The accepted directory was promoted only after route, error, process, URL, worktree, and teardown acceptance passed.',
      ],
    };
    const evidenceValidation = validateElectronEvidenceEnvelope(evidence);
    const publicationReadiness = evaluateElectronPublicationReadiness({
      routeResult,
      urlAcceptance,
      processHealth: cleanupReport.processHealth,
      cleanup: cleanupReport,
      pageErrors: pageIssueTracker.errors(),
      pageIssueCoverage: pageIssueTracker.coverage(),
      viewportFloorAssessment,
      screenshotDimensionAssessment,
      fingerprints: {
        start: startFingerprint,
        afterRoute: routeFingerprint,
        afterCleanup: cleanupFingerprint,
      },
      evidenceValidation,
    });
    assert.deepEqual(publicationReadiness.failures, [],
      `Electron accepted publication is not ready: ${JSON.stringify(publicationReadiness)}`);

    const routeReport = {
      schema: 'spaceface.alphaLiveBaselineElectronRoute.v1',
      generatedAt: new Date().toISOString(),
      pass: true,
      rootUrl,
      rootPort: Number(new URL(rootUrl).port),
      launch: { api: "_electron.launch({ args: ['.'], cwd: ROOT })", separateBrowserServer: false },
      runtime: runtimeMetadata,
      viewport: runtimeMetadata.viewport,
      gpu: routeResult.gpu,
      rootUrlCheck,
      urlAcceptance,
      routeResult: {
        steps: routeResult.steps,
        launchSnapshot: routeResult.launchSnapshot,
        flightInput: routeResult.flightInput,
        navSnapshot: routeResult.navSnapshot,
        approachSnapshot: routeResult.approachSnapshot,
        stableStation: routeResult.stableStation,
      },
      screenshots: screenshotTelemetry,
      viewportFloorAssessment,
      screenshotDimensionAssessment,
      pageIssues: pageIssueTracker.all(),
      pageIssueCoverage: pageIssueTracker.coverage(),
      routeProcessHealth,
      cleanup: cleanupReport,
      worktree: {
        start: startFingerprint,
        afterRoute: routeFingerprint,
        afterCleanup: cleanupFingerprint,
        stable: true,
      },
      publicationReadiness,
    };

    await writeJsonAtomic(path.join(STAGING_ROOT, 'route-report.json'), routeReport);
    await writeJsonAtomic(path.join(STAGING_ROOT, 'electron-runtime-telemetry.json'), runtimeMetadata);
    await writeJsonAtomic(path.join(STAGING_ROOT, 'viewport-floor-telemetry.json'), viewportFloorAssessment);
    await writeJsonAtomic(path.join(STAGING_ROOT, 'url-lifecycle-telemetry.json'), urlAcceptance);
    await writeJsonAtomic(path.join(STAGING_ROOT, 'process-telemetry.json'), cleanupReport.processMonitor);
    await writeJsonAtomic(path.join(STAGING_ROOT, 'page-issue-telemetry.json'), {
      issues: pageIssueTracker.all(),
      coverage: pageIssueTracker.coverage(),
    });
    await writeJsonAtomic(path.join(STAGING_ROOT, 'screenshot-dimensions.json'), screenshotDimensionAssessment);
    await writeJsonAtomic(path.join(STAGING_ROOT, 'flight-input-telemetry.json'), routeResult.flightInput);
    await writeJsonAtomic(path.join(STAGING_ROOT, 'hardware-gpu-telemetry.json'), routeResult.gpu);
    await writeJsonAtomic(path.join(STAGING_ROOT, 'station-settlement-telemetry.json'), routeResult.stableStation);
    await writeJsonAtomic(path.join(STAGING_ROOT, 'performance-telemetry.json'), routeResult.performanceTelemetry);
    await writeTextAtomic(path.join(STAGING_ROOT, 'run.log'), `${LOG_LINES.join('\n')}\n`);
    await writeJsonAtomic(path.join(STAGING_ROOT, 'evidence.json'), evidence);

    const accepted = await publishAcceptedArtifacts({
      alphaRoot: ALPHA_ROOT,
      historyRoot: HISTORY_ROOT,
      stagingRoot: STAGING_ROOT,
      acceptedRoot: ACCEPTED_ROOT,
    });
    return {
      accepted,
      gpuIdentity: routeResult.gpu.identity,
      performanceTelemetry: routeResult.performanceTelemetry,
    };
  },
  failurePhase: async (error) => {
    publicationFailureError = error;
    return publishFailureArtifacts({
      stagingRoot: STAGING_ROOT,
      error,
      routeResult,
      pageIssues: pageIssueTracker?.all() || [],
      pageIssueCoverage: pageIssueTracker?.coverage?.() || null,
      cleanupReport,
      failureSnapshot,
      runtimeMetadata,
      screenshots: screenshotTelemetry,
      viewportFloorAssessment,
      screenshotDimensionAssessment,
      fingerprints: { start: startFingerprint, route: routeFingerprint, cleanup: cleanupFingerprint },
    });
  },
});

if (publicationOutcome.pass) {
  const telemetry = publicationOutcome.accepted.performanceTelemetry;
  console.log(`[alpha-electron-baseline] PASS ${publicationOutcome.accepted.gpuIdentity}`);
  console.log(`[alpha-electron-baseline] evidence: ${repoPath(path.join(ACCEPTED_ROOT, 'evidence.json'))}`);
  console.log(`[alpha-electron-baseline] frame samples=${telemetry.frameMs.sampleCount} p95=${telemetry.frameMs.p95} ms hitches>32=${telemetry.frameMs.hitchesOver32Ms}`);
} else {
  console.error(`[alpha-electron-baseline] FAIL at ${publicationFailureError?.routePhase || 'harness'}: ${publicationFailureError?.message || publicationOutcome.error.message}`);
  console.error(`[alpha-electron-baseline] failure packet: ${repoPath(publicationOutcome.failure)}`);
  process.exitCode = 1;
}

async function collectElectronRuntimeMetadata(targetApp, targetPage, targetProcess) {
  const [app, browser] = await Promise.all([
    targetApp.evaluate(({ app: electron }) => ({
      name: electron.getName(),
      appVersion: electron.getVersion(),
      isPackaged: electron.isPackaged,
      locale: electron.getLocale(),
      gpuFeatureStatus: electron.getGPUFeatureStatus(),
      process: {
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron || '',
        chromeVersion: process.versions.chrome || '',
        nodeVersion: process.versions.node || '',
        v8Version: process.versions.v8 || '',
      },
    })),
    targetPage.evaluate(() => ({
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: {
        width: Math.round(window.innerWidth),
        height: Math.round(window.innerHeight),
        outerWidth: Math.round(window.outerWidth),
        outerHeight: Math.round(window.outerHeight),
        deviceScaleFactor: window.devicePixelRatio,
      },
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
      },
      visibilityState: document.visibilityState,
      title: document.title,
    })),
  ]);
  return {
    app,
    process: { pid: Number(targetProcess?.pid) || null, ...app.process },
    browser: { userAgent: browser.userAgent, chromeVersion: app.process.chromeVersion },
    window: {
      outerWidth: browser.viewport.outerWidth,
      outerHeight: browser.viewport.outerHeight,
      visibilityState: browser.visibilityState,
      title: browser.title,
    },
    viewport: {
      width: browser.viewport.width,
      height: browser.viewport.height,
    },
    deviceScaleFactor: browser.viewport.deviceScaleFactor,
    screen: browser.screen,
    locale: browser.language,
  };
}

async function inspectAcceptanceScreenshots(names) {
  const records = [];
  for (const name of names) {
    const filePath = path.join(STAGING_ROOT, name);
    const contents = await readFile(filePath);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert(contents.length >= 24 && contents.subarray(0, 8).equals(pngSignature), `${name} is not a real PNG`);
    records.push({
      name,
      width: contents.readUInt32BE(16),
      height: contents.readUInt32BE(20),
      bytes: contents.length,
    });
  }
  return records;
}

function assertElectronRootUrl(actual) {
  const url = new URL(actual);
  assert.equal(url.protocol, 'http:', `Electron first window must use HTTP, got ${url.protocol}`);
  assert.equal(url.hostname, '127.0.0.1', `Electron first window must bind IPv4 loopback, got ${url.hostname}`);
  assert.equal(url.pathname, '/', `Electron first window must use slash root, got ${url.pathname}`);
  assert.equal(url.search, '', `Electron first window must not use query state, got ${url.search}`);
  assert.equal(url.hash, '', `Electron first window must not use fragment state, got ${url.hash}`);
  assert.equal(url.username, '', 'Electron first window must not use URL credentials');
  assert.equal(url.password, '', 'Electron first window must not use URL credentials');
  const port = Number(url.port);
  assert(Number.isSafeInteger(port) && port > 0 && port <= 65_535, `Electron first window must expose a concrete listener port, got ${url.port}`);
  assert.equal(port, 41_788,
    `Electron primary evidence requires the stable save-origin port 41788; launcher fallback port ${port} is availability-only`);
  return url.href;
}

async function publishFailureArtifacts({
  stagingRoot,
  error,
  routeResult: failedRoute,
  pageIssues,
  pageIssueCoverage,
  cleanupReport: failedCleanup,
  failureSnapshot: capturedFailure,
  runtimeMetadata: failedRuntime,
  screenshots,
  viewportFloorAssessment: failedViewportFloorAssessment,
  screenshotDimensionAssessment: failedScreenshotDimensionAssessment,
  fingerprints,
}) {
  assertGuardedTaskPath(stagingRoot, '.tmp-');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let failureRoot = path.join(ALPHA_ROOT, `${TASK_ID}-failure-${stamp}`);
  let suffix = 1;
  while (await pathExists(failureRoot)) {
    failureRoot = path.join(ALPHA_ROOT, `${TASK_ID}-failure-${stamp}-${suffix++}`);
  }
  assertGuardedTaskPath(failureRoot, `${TASK_ID}-failure-`);
  const stagedEvidence = path.join(stagingRoot, 'evidence.json');
  const quarantinedStagedEvidence = await pathExists(stagedEvidence);
  if (quarantinedStagedEvidence) {
    await rename(stagedEvidence, path.join(stagingRoot, 'rejected-primary-evidence.json'));
  }
  await writeJsonAtomic(path.join(stagingRoot, 'failure-report.json'), {
    schema: 'spaceface.alphaLiveBaselineElectronFailure.v1',
    generatedAt: new Date().toISOString(),
    pass: false,
    primaryAcceptance: false,
    acceptedEvidenceWritten: false,
    quarantinedStagedEvidence,
    phase: error.routePhase || 'harness',
    error: serializeError(error),
    routeProgress: error.routeProgress || failedRoute?.steps || [],
    rootUrl,
    runtime: failedRuntime,
    screenshots,
    viewportFloorAssessment: failedViewportFloorAssessment,
    screenshotDimensionAssessment: failedScreenshotDimensionAssessment,
    pageIssues,
    pageIssueCoverage,
    process: failedCleanup?.processMonitor || processMonitor?.snapshot?.() || null,
    cleanup: failedCleanup,
    fingerprints,
    failureSnapshot: capturedFailure,
    acceptedElectronDirectoryPreserved: await pathExists(ACCEPTED_ROOT),
    acceptedBrowserDirectoryUntouched: await pathExists(path.join(ALPHA_ROOT, 'm0-live-baseline-browser')),
  });
  if (failedRoute?.performanceTelemetry || error.performanceTelemetry) {
    await writeJsonAtomic(
      path.join(stagingRoot, 'performance-telemetry.json'),
      error.performanceTelemetry || failedRoute.performanceTelemetry,
    );
  }
  await writeTextAtomic(path.join(stagingRoot, 'run.log'), `${LOG_LINES.join('\n')}\nFAIL ${error.message || error}\n`);
  await rename(stagingRoot, failureRoot);
  return failureRoot;
}

async function captureFailureDiagnostics(targetPage, stagingRoot) {
  const screenshotName = 'failure-screenshot.png';
  await targetPage.screenshot({ path: path.join(stagingRoot, screenshotName), type: 'png', animations: 'allow' });
  const snapshot = await targetPage.evaluate(() => {
    const state = window.SF?.state;
    const active = document.activeElement;
    return {
      url: location.href,
      mode: state?.mode || null,
      tick: Number(state?.tick || 0),
      screenStack: Array.isArray(state?.ui?.screenStack) ? state.ui.screenStack.slice() : [],
      cinematicVisible: isVisible(document.getElementById('cinematic-splash')),
      modalOpen: document.body.classList.contains('ui-modal-open'),
      focusedTag: active?.tagName || null,
      focusedText: String(active?.textContent || '').trim().slice(0, 160),
    };

    function isVisible(element) {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01
        && rect.width > 1 && rect.height > 1;
    }
  });
  await writeJsonAtomic(path.join(stagingRoot, 'failure-state.json'), snapshot);
  return { screenshot: screenshotName, report: 'failure-state.json', snapshot };
}

async function writeJsonAtomic(filePath, value) {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(filePath, value) {
  assertGuardedArtifactPath(filePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  assertGuardedArtifactPath(temporary);
  await writeFile(temporary, value, 'utf8');
  await rename(temporary, filePath);
}

function assertGuardedArtifactPath(candidate) {
  const resolved = path.resolve(candidate);
  const relative = path.relative(path.resolve(ALPHA_ROOT), resolved);
  assert(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `artifact path escaped the alpha evidence root: ${resolved}`);
}

function assertGuardedTaskPath(candidate, expectedPrefix) {
  assertGuardedArtifactPath(candidate);
  assert(path.basename(candidate).startsWith(expectedPrefix), `guarded task path must start with ${expectedPrefix}`);
}

async function pathExists(candidate) {
  try {
    const metadata = await stat(candidate);
    return metadata.isDirectory() || metadata.isFile();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function serializeError(error) {
  if (!error) return null;
  const out = {
    name: error.name || 'Error',
    message: error.message || String(error),
    stack: error.stack || null,
  };
  for (const key of [
    'routePhase',
    'routeProgress',
    'performanceTelemetry',
    'urlChecks',
    'cleanupError',
    'worktreeDrift',
    'fingerprintError',
    'failureCaptureError',
  ]) {
    if (error[key] != null) out[key] = error[key];
  }
  return out;
}

function repoPath(candidate) {
  return path.relative(ROOT, candidate).replace(/\\/g, '/');
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  LOG_LINES.push(line);
  console.log(`[alpha-electron-baseline] ${message}`);
}
