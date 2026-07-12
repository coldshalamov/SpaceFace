#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  mkdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  closeOwnedResources,
  createCanonicalUrlTracker,
  evaluateCanonicalUrlAcceptance,
  inspectCanonicalRootUrl,
  publishAcceptedArtifacts,
  worktreeFingerprint,
} from './lib/alphaLiveBaselineContracts.mjs';
import { runBrowserPublicRoute } from './lib/alphaLiveBaselineRoute.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TASK_ID = 'm0-live-baseline-browser';
const WIDTH = 1440;
const HEIGHT = 900;
const ALPHA_ROOT = path.join(ROOT, '.devshots', 'alpha');
const HISTORY_ROOT = path.join(ROOT, '.devshots', 'alpha-history');
const ACCEPTED_ROOT = path.join(ALPHA_ROOT, TASK_ID);
const STAGING_ROOT = path.join(
  ALPHA_ROOT,
  `.tmp-${TASK_ID}-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`,
);
const LOG_LINES = [];

let ownedServer = null;
let browser = null;
let context = null;
let page = null;
let pageIssueTracker = null;
let routeResult = null;
let executablePath = null;
let browserVersion = null;
let startFingerprint = null;
let routeFingerprint = null;
let cleanupFingerprint = null;
let cleanupReport = null;
let primaryError = null;
let failureSnapshot = null;
let navigationUrlChecks = [];
let canonicalUrlTracker = null;
let postFingerprintUrlCheck = null;

await mkdir(ALPHA_ROOT, { recursive: true });
assertGuardedTaskPath(STAGING_ROOT, '.tmp-');
await mkdir(STAGING_ROOT, { recursive: false });

try {
  startFingerprint = await worktreeFingerprint(ROOT);
  log(`worktree start ${startFingerprint.id}`);

  ownedServer = await acquireVisualProbeServer({ root: ROOT });
  assert.equal(ownedServer.ownsServer, true, 'baseline must own the canonical in-process server');
  assert.equal(ownedServer.server?.listening, true, 'canonical in-process server must be listening');
  const rootUrl = new URL(ownedServer.baseUrl);
  assert.equal(rootUrl.hostname, '127.0.0.1', 'canonical baseline server must bind IPv4 loopback');
  assert.equal(rootUrl.search, '', 'canonical baseline server URL must not include a query');
  assert.notEqual(Number(rootUrl.port), 0, 'OS must assign an ephemeral loopback port');
  log(`server ${rootUrl.href}`);

  executablePath = findSystemBrowser();
  assert(executablePath, 'headed system Chrome or Edge is required for the browser baseline');
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: false,
    executablePath,
    args: [
      '--incognito',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--window-size=${WIDTH},${HEIGHT}`,
      '--force-device-scale-factor=1',
    ],
  });
  browserVersion = browser.version();
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    screen: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'dark',
  });
  page = await context.newPage();
  canonicalUrlTracker = createCanonicalUrlTracker(page, ownedServer.baseUrl);
  pageIssueTracker = collectStrictPageIssues(page);
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);

  const navigationResponse = await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.bringToFront();
  assert(navigationResponse, 'canonical root navigation must return an HTTP response');
  const redirectChain = navigationRedirectChain(navigationResponse);
  navigationUrlChecks = [
    {
      boundary: 'navigation-redirect-chain',
      pass: redirectChain.length === 0,
      expected: new URL(ownedServer.baseUrl).href,
      actual: navigationResponse.url(),
      origin: new URL(navigationResponse.url()).origin,
      pathname: new URL(navigationResponse.url()).pathname,
      search: new URL(navigationResponse.url()).search,
      hash: new URL(navigationResponse.url()).hash,
      failures: redirectChain.length === 0 ? [] : [`navigation redirected through ${redirectChain.join(' -> ')}`],
      redirectChain,
    },
    { boundary: 'navigation-response', ...inspectCanonicalRootUrl(navigationResponse.url(), ownedServer.baseUrl) },
    { boundary: 'post-navigation-page', ...inspectCanonicalRootUrl(page.url(), ownedServer.baseUrl) },
  ];
  for (const check of navigationUrlChecks) {
    assert.deepEqual(check.failures, [], `${check.boundary} left the requested canonical root: ${JSON.stringify(check)}`);
  }
  const postNavigationTrackerCheck = canonicalUrlTracker.observeNow('post-navigation-live');
  assert.deepEqual(postNavigationTrackerCheck.failures, [],
    `post-navigation live URL left the requested canonical root: ${JSON.stringify(postNavigationTrackerCheck)}`);

  routeResult = await runBrowserPublicRoute({
    page,
    outputDir: STAGING_ROOT,
    expectedRootUrl: ownedServer.baseUrl,
    log,
    flightTimeoutMs: 150_000,
    dockTimeoutMs: 90_000,
  });

  const runtimeErrors = pageIssueTracker.errors();
  assert.deepEqual(runtimeErrors, [], `public route emitted runtime/page/request errors: ${JSON.stringify(runtimeErrors)}`);

  routeFingerprint = await worktreeFingerprint(ROOT);
  postFingerprintUrlCheck = canonicalUrlTracker.observeNow('post-worktree-fingerprint-live');
  assert.deepEqual(postFingerprintUrlCheck.failures, [],
    `post-worktree-fingerprint live URL left the canonical root: ${JSON.stringify(postFingerprintUrlCheck)}`);
  assert.equal(
    routeFingerprint.digest,
    startFingerprint.digest,
    `tracked, staged, intent-to-add, or ordinary untracked worktree content changed during browser capture: ${startFingerprint.id} -> ${routeFingerprint.id}`,
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
    cleanupReport = await closeOwnedResources({
      page,
      context,
      browser,
      server: ownedServer,
      canonicalUrlTracker,
    });
    log(`cleanup ${JSON.stringify(cleanupReport)}`);
  } catch (error) {
    cleanupReport = error.cleanupReport || { pass: false, failures: [serializeError(error)] };
    if (!primaryError) primaryError = error;
    else primaryError.cleanupError = serializeError(error);
  }

  try {
    cleanupFingerprint = await worktreeFingerprint(ROOT);
    if (startFingerprint && cleanupFingerprint.digest !== startFingerprint.digest) {
      const drift = new Error(`tracked, staged, intent-to-add, or ordinary untracked worktree content changed before cleanup completed: ${startFingerprint.id} -> ${cleanupFingerprint.id}`);
      if (!primaryError) primaryError = drift;
      else primaryError.worktreeDrift = serializeError(drift);
    }
    if (cleanupFingerprint) log(`worktree cleanup ${cleanupFingerprint.id}`);
  } catch (error) {
    if (!primaryError) primaryError = error;
    else primaryError.fingerprintError = serializeError(error);
  }
}

if (primaryError) {
  const failureRoot = await publishFailureArtifacts({
    stagingRoot: STAGING_ROOT,
    error: primaryError,
    routeResult,
    performanceTelemetry: primaryError.performanceTelemetry || routeResult?.performanceTelemetry || null,
    pageIssues: pageIssueTracker?.all() || [],
    cleanupReport,
    failureSnapshot,
    fingerprints: { start: startFingerprint, route: routeFingerprint, cleanup: cleanupFingerprint },
  });
  console.error(`[alpha-browser-baseline] FAIL at ${primaryError.routePhase || 'harness'}: ${primaryError.message || primaryError}`);
  console.error(`[alpha-browser-baseline] failure packet: ${repoPath(failureRoot)}`);
  process.exitCode = 1;
} else {
  assert(routeResult?.pass === true, 'public route must pass before primary evidence is written');
  assert(cleanupReport?.pass === true, 'owned cleanup must pass before primary evidence is written');
  assert.equal(cleanupFingerprint?.digest, startFingerprint?.digest, 'worktree must remain stable through cleanup');

  const runtimeErrors = pageIssueTracker.errors();
  assert.deepEqual(runtimeErrors, [], 'runtime/page/request errors must remain absent through cleanup');
  const publicationUrlCheck = assertPublicationUrlContract({
    expectedRootUrl: ownedServer.baseUrl,
    navigationUrlChecks,
    routeUrlChecks: routeResult.urlChecks,
    finalUrlCheck: routeResult.finalUrlCheck,
    trackerReport: cleanupReport.urlTracker,
    postFingerprintUrlCheck,
    precloseUrlCheck: cleanupReport.precloseUrlCheck,
  });

  const routeReport = {
    schema: 'spaceface.alphaLiveBaselineRoute.v1',
    generatedAt: new Date().toISOString(),
    pass: true,
    route: `${new URL(ownedServer.baseUrl).href}intro -> Main Menu -> New Game -> Launch -> flight input -> galaxy map -> Helios Station waypoint -> autopilot -> dock prompt -> station hub`,
    canonicalRootWithoutQuery: true,
    urlContract: {
      navigation: navigationUrlChecks,
      route: routeResult.urlChecks,
      tracker: cleanupReport.urlTracker,
      postFingerprintLive: postFingerprintUrlCheck,
      immediatelyPrecloseLive: cleanupReport.precloseUrlCheck,
      publication: publicationUrlCheck,
    },
    viewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
    browser: { executablePath, version: browserVersion, headed: true, incognitoContext: true },
    gpu: routeResult.gpu,
    routeResult: {
      steps: routeResult.steps,
      launchSnapshot: routeResult.launchSnapshot,
      flightInput: routeResult.flightInput,
      navSnapshot: routeResult.navSnapshot,
      approachSnapshot: routeResult.approachSnapshot,
      stableStation: routeResult.stableStation,
    },
    pageIssues: pageIssueTracker.all(),
    cleanup: cleanupReport,
    worktree: {
      start: startFingerprint,
      afterRoute: routeFingerprint,
      afterCleanup: cleanupFingerprint,
      stable: true,
    },
  };

  await writeJsonAtomic(path.join(STAGING_ROOT, 'route-report.json'), routeReport);
  await writeJsonAtomic(path.join(STAGING_ROOT, 'url-lifecycle-telemetry.json'), routeReport.urlContract);
  await writeJsonAtomic(path.join(STAGING_ROOT, 'flight-input-telemetry.json'), routeResult.flightInput);
  await writeJsonAtomic(path.join(STAGING_ROOT, 'hardware-gpu-telemetry.json'), routeResult.gpu);
  await writeJsonAtomic(path.join(STAGING_ROOT, 'station-settlement-telemetry.json'), routeResult.stableStation);
  await writeJsonAtomic(path.join(STAGING_ROOT, 'performance-telemetry.json'), routeResult.performanceTelemetry);
  await writeTextAtomic(path.join(STAGING_ROOT, 'run.log'), `${LOG_LINES.join('\n')}\n`);

  const finalArtifactBase = `.devshots/alpha/${TASK_ID}`;
  const evidence = {
    schema: 'spaceface.alphaEvidence.v1',
    taskId: TASK_ID,
    worktreeId: startFingerprint.id,
    route: `${new URL(ownedServer.baseUrl).href} public root, no query: intro -> Main Menu -> New Game -> Launch -> ordinary flight input -> galaxy map -> Helios Station waypoint/autopilot -> physical dock prompt -> station hub`,
    viewport: { width: WIDTH, height: HEIGHT },
    runtime: { kind: 'browser', gpu: routeResult.gpu.identity },
    captureKind: 'browser',
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: true,
    checks: [
      { name: 'canonical root tracked from page creation through closure', status: 'pass' },
      { name: 'public intro/menu/new-game launch', status: 'pass' },
      { name: 'authored flight readiness', status: 'pass' },
      { name: 'ordinary keyboard-mouse causal flight response', status: 'pass' },
      { name: 'public galaxy-map station waypoint', status: 'pass' },
      { name: 'autopilot reaches physical dock prompt', status: 'pass' },
      { name: 'public dock input reaches settled station hub', status: 'pass' },
      { name: 'hardware WebGL', status: 'pass' },
      { name: 'runtime/page errors absent', status: 'pass' },
      { name: 'route performance telemetry captured', status: 'pass' },
      { name: 'worktree stable', status: 'pass' },
      { name: 'owned runtime cleanup', status: 'pass' },
    ],
    artifacts: [
      ...routeResult.screenshots.map((name) => ({ kind: 'screenshot', path: `${finalArtifactBase}/${name}` })),
      { kind: 'report', path: `${finalArtifactBase}/route-report.json` },
      { kind: 'telemetry', path: `${finalArtifactBase}/url-lifecycle-telemetry.json` },
      { kind: 'telemetry', path: `${finalArtifactBase}/flight-input-telemetry.json` },
      { kind: 'telemetry', path: `${finalArtifactBase}/hardware-gpu-telemetry.json` },
      { kind: 'telemetry', path: `${finalArtifactBase}/station-settlement-telemetry.json` },
      { kind: 'telemetry', path: `${finalArtifactBase}/performance-telemetry.json` },
      { kind: 'log', path: `${finalArtifactBase}/run.log` },
    ],
    notes: [
      'The headed system-browser route used only visible UI, pointer motion, and keyboard input.',
      'Runtime state and diagnostics were observed read-only for assertions and descriptive telemetry.',
      'Flight-input telemetry records released baseline, W-held, W+Shift-held, and post-release snapshots with causal comparisons.',
      'The requested root origin and slash path, plus empty search and hash, were rechecked at every major boundary and immediately before publication.',
      'Main-frame navigation events and Node-side live URL polls remained active through page closure; post-fingerprint and immediately-preclose observations are recorded in route-report.json.',
      'The worktree fingerprint covers tracked, staged, intent-to-add, and every ordinary nonignored untracked file; only Git ignore rules exclude task evidence staging.',
      'Any prior accepted packet is retained under the sibling .devshots/alpha-history directory, outside the alpha evidence scanner root.',
      'Performance samples include capture overhead and do not claim Milestone-6 thresholds.',
      'The accepted directory was promoted only after the route, error scan, worktree comparison, and owned cleanup passed.',
    ],
  };
  await writeJsonAtomic(path.join(STAGING_ROOT, 'evidence.json'), evidence);

  await publishAcceptedArtifacts({
    alphaRoot: ALPHA_ROOT,
    historyRoot: HISTORY_ROOT,
    stagingRoot: STAGING_ROOT,
    acceptedRoot: ACCEPTED_ROOT,
  });
  console.log(`[alpha-browser-baseline] PASS ${routeResult.gpu.identity}`);
  console.log(`[alpha-browser-baseline] evidence: ${repoPath(path.join(ACCEPTED_ROOT, 'evidence.json'))}`);
  console.log(`[alpha-browser-baseline] frame samples=${routeResult.performanceTelemetry.frameMs.sampleCount} p95=${routeResult.performanceTelemetry.frameMs.p95} ms hitches>32=${routeResult.performanceTelemetry.frameMs.hitchesOver32Ms}`);
}

function collectStrictPageIssues(targetPage) {
  const issues = [];
  const push = (issue) => issues.push({ at: new Date().toISOString(), ...issue });
  targetPage.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      push({ source: 'console', level: message.type(), text: message.text() });
    }
  });
  targetPage.on('pageerror', (error) => {
    push({ source: 'pageerror', level: 'error', text: String(error?.message || error) });
  });
  targetPage.on('requestfailed', (request) => {
    push({
      source: 'request',
      level: 'error',
      text: `${request.method()} ${request.url()} failed: ${request.failure()?.errorText || 'unknown'}`,
    });
  });
  targetPage.on('response', (response) => {
    if (response.status() >= 400) {
      push({ source: 'response', level: 'error', text: `HTTP ${response.status()} ${response.url()}` });
    }
  });
  return {
    all: () => issues.slice(),
    errors: () => issues.filter((issue) => issue.level === 'error'),
  };
}

function navigationRedirectChain(response) {
  const chain = [];
  let request = response?.request?.() || null;
  while (request && typeof request.redirectedFrom === 'function') {
    request = request.redirectedFrom();
    if (request) chain.unshift(request.url());
  }
  return chain;
}

function assertPublicationUrlContract({
  expectedRootUrl,
  navigationUrlChecks: navigationChecks,
  routeUrlChecks,
  finalUrlCheck,
  trackerReport,
  postFingerprintUrlCheck: postFingerprintCheck,
  precloseUrlCheck,
}) {
  const requiredRouteBoundaries = [
    'boot-ready',
    'main-menu',
    'new-game',
    'authored-flight-ready',
    'ordinary-flight-input',
    'galaxy-map',
    'helios-waypoint-armed',
    'physical-dock-prompt',
    'station-hub-settled',
    'before-route-return',
  ];
  assert(Array.isArray(navigationChecks) && navigationChecks.length >= 3,
    'publication requires redirect-chain, navigation-response, and post-navigation URL checks');
  assert(Array.isArray(routeUrlChecks), 'publication requires route-boundary URL checks');
  for (const check of [...navigationChecks, ...routeUrlChecks]) {
    assert.deepEqual(check?.failures, [], `publication rejected URL drift at ${check?.boundary}: ${JSON.stringify(check)}`);
    assert.equal(check?.pass, true, `publication requires passing URL check at ${check?.boundary}`);
  }
  for (const boundary of requiredRouteBoundaries) {
    assert(routeUrlChecks.some((check) => check?.boundary === boundary), `publication is missing URL check ${boundary}`);
  }
  assert.equal(finalUrlCheck?.boundary, 'before-route-return', 'publication requires the final live route URL observation');
  assert(trackerReport, 'publication requires the page-lifecycle URL tracker report');
  assert.equal(trackerReport.pageClosedWhenStopped, true, 'URL tracker must stay active through page closure');
  assert.equal(trackerReport.pass, true, `URL tracker rejected lifecycle drift: ${JSON.stringify(trackerReport.violations || [])}`);
  const lifecycleAcceptance = evaluateCanonicalUrlAcceptance({
    expectedRootUrl,
    observations: trackerReport.observations,
    postFingerprintUrlCheck: postFingerprintCheck,
    precloseUrlCheck,
  });
  assert.deepEqual(lifecycleAcceptance.failures, [],
    `canonical URL lifecycle rejected accepted publication: ${JSON.stringify(lifecycleAcceptance)}`);
  return {
    pass: true,
    checkedAt: new Date().toISOString(),
    expectedRootUrl: new URL(expectedRootUrl).href,
    navigationCheckCount: navigationChecks.length,
    routeCheckCount: routeUrlChecks.length,
    finalRouteObservation: finalUrlCheck,
    lifecycleAcceptance,
  };
}

async function publishFailureArtifacts({
  stagingRoot,
  error,
  routeResult: failedRoute,
  performanceTelemetry,
  pageIssues,
  cleanupReport: failedCleanup,
  fingerprints,
  failureSnapshot: capturedFailure,
}) {
  assertGuardedTaskPath(stagingRoot, '.tmp-');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let failureRoot = path.join(ALPHA_ROOT, `${TASK_ID}-failure-${stamp}`);
  let suffix = 1;
  while (await pathExists(failureRoot)) {
    failureRoot = path.join(ALPHA_ROOT, `${TASK_ID}-failure-${stamp}-${suffix++}`);
  }
  assertGuardedTaskPath(failureRoot, `${TASK_ID}-failure-`);
  await writeJsonAtomic(path.join(stagingRoot, 'failure-report.json'), {
    schema: 'spaceface.alphaLiveBaselineFailure.v1',
    generatedAt: new Date().toISOString(),
    pass: false,
    primaryAcceptance: false,
    acceptedEvidenceWritten: false,
    phase: error.routePhase || 'harness',
    error: serializeError(error),
    routeProgress: error.routeProgress || failedRoute?.steps || [],
    pageIssues,
    cleanup: failedCleanup,
    fingerprints,
    failureSnapshot: capturedFailure,
    acceptedDirectoryPreserved: await pathExists(ACCEPTED_ROOT),
  });
  if (performanceTelemetry) {
    await writeJsonAtomic(path.join(stagingRoot, 'performance-telemetry.json'), performanceTelemetry);
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
    const visibleScreens = Array.from(document.querySelectorAll('[data-screen]'))
      .filter(isVisible)
      .map((element) => element.getAttribute('data-screen'));
    const active = document.activeElement;
    return {
      url: location.href,
      mode: state?.mode || null,
      tick: Number(state?.tick || 0),
      screenStack: Array.isArray(state?.ui?.screenStack) ? state.ui.screenStack.slice() : [],
      visibleScreens,
      cinematicVisible: isVisible(document.getElementById('cinematic-splash')),
      modalOpen: document.body.classList.contains('ui-modal-open'),
      focusedTag: active?.tagName || null,
      focusedText: String(active?.textContent || '').trim().slice(0, 160),
      visibleButtons: Array.from(document.querySelectorAll('button')).filter(isVisible)
        .map((button) => String(button.textContent || '').trim()).filter(Boolean).slice(0, 24),
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

function findSystemBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
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
  for (const key of ['routePhase', 'routeProgress', 'performanceTelemetry', 'urlChecks', 'cleanupError', 'worktreeDrift', 'fingerprintError', 'failureCaptureError']) {
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
  console.log(`[alpha-browser-baseline] ${message}`);
}
