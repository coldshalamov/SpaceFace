#!/usr/bin/env node
// PQ-017 Persistent World Site — headed Browser public-route gate.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeOwnedResources,
  createCanonicalUrlTracker,
  inspectCanonicalRootUrl,
} from './lib/alphaLiveBaselineContracts.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { collectPageIssues } from './lib/browser-issues.mjs';
import {
  assertPq017ProbeLaunch,
  completePq017ProbeClaim,
  derivePq017FailureIdentity,
  publishPq017AcceptanceFailure,
} from './lib/pq017ProbeIterationGuard.mjs';
import {
  PQ017_HISTORY_RETENTION,
  PQ017_ROUTE_SCHEMA,
  PQ017_SCREENSHOTS,
  prunePq017EvidenceHistory,
  repoRelative,
  runPq017WorldSitePublicRoute,
} from './lib/pq017WorldSitePublicRoute.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT_ROOT = path.join(ROOT, '.devshots', 'pq017-world-site');
const ACCEPTED = path.join(OUTPUT_ROOT, 'browser');
const STAGING = path.join(
  OUTPUT_ROOT,
  `.tmp-browser-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`,
);
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const LOG = [];
const log = (message) => {
  const line = `${new Date().toISOString()} ${message}`;
  LOG.push(line);
  console.log(`[pq017-browser] ${message}`);
};

let ownedServer = null;
let browser = null;
let context = null;
let page = null;
let issueTracker = null;
let canonicalUrlTracker = null;
let routeResult = null;
let cleanupReport = null;
let primaryError = null;

const gateLaunch = await assertPq017ProbeLaunch({
  root: ROOT,
  outputRoot: OUTPUT_ROOT,
  runtimeKind: 'browser',
  mode: 'acceptance',
  explicitAcceptance: process.argv.includes('--acceptance'),
});
const { loadPlaywright } = await import('./lib/load-playwright.mjs');
await mkdir(STAGING, { recursive: true });

try {
  ownedServer = await acquireVisualProbeServer({ root: ROOT });
  assert.equal(ownedServer.ownsServer, true, 'browser probe must own its canonical server');
  const rootUrl = ownedServer.baseUrl;
  assert.equal(new URL(rootUrl).search, '', 'canonical root must not carry debug query flags');

  const executablePath = findSystemBrowser();
  assert(executablePath, 'headed Chrome or Edge is required');
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: false,
    executablePath,
    args: [
      '--incognito',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--force-device-scale-factor=1',
    ],
  });
  context = await browser.newContext({
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'dark',
  });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  issueTracker = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });
  canonicalUrlTracker = createCanonicalUrlTracker(page, rootUrl);

  const response = await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  assert(response, 'canonical navigation must return a response');
  await page.bringToFront();
  assert.deepEqual(inspectCanonicalRootUrl(page.url(), rootUrl).failures, [],
    'browser left the canonical root during navigation');

  routeResult = await runPq017WorldSitePublicRoute({
    page,
    outputDir: STAGING,
    expectedRootUrl: rootUrl,
    log,
  });
  assert.deepEqual(issueTracker.errorIssues(), [], 'browser route emitted runtime errors');
} catch (error) {
  primaryError = error;
  if (page && !page.isClosed()) {
    await page.screenshot({
      path: path.join(STAGING, 'failure-screenshot.png'),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
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
  } catch (error) {
    cleanupReport = { pass: false, failures: [error.message || String(error)] };
    primaryError ||= error;
  }
}

if (primaryError || routeResult?.pass !== true || cleanupReport?.pass !== true) {
  const failure = {
    schema: PQ017_ROUTE_SCHEMA,
    generatedAt: new Date().toISOString(),
    pass: false,
    runtimeKind: 'browser',
    primaryAcceptance: true,
    regressionDigest: gateLaunch.regressionDigest,
    routeDigest: gateLaunch.routeDigest,
    error: primaryError?.message || 'route or cleanup did not pass',
    stack: primaryError?.stack || null,
    phase: primaryError?.routePhase || null,
    progress: primaryError?.routeProgress || null,
    performance: primaryError?.routePerformance || null,
    lifecycle: primaryError?.routeLifecycle || null,
    failureSnapshot: primaryError?.routeFailureSnapshot || null,
    cleanup: cleanupReport,
  };
  const failureIdentity = derivePq017FailureIdentity(failure);
  Object.assign(failure, {
    family: failureIdentity.family,
    failureFingerprint: failureIdentity.fingerprint,
  });
  const failureReportPath = path.join(STAGING, 'failure-report.json');
  await writeFile(failureReportPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  await publishPq017AcceptanceFailure({
    outputRoot: OUTPUT_ROOT,
    failure,
    artifactPath: repoRelative(ROOT, failureReportPath),
  });
  await completePq017ProbeClaim({
    outputRoot: OUTPUT_ROOT,
    claimToken: gateLaunch.claimToken,
  });
  await writeFile(path.join(STAGING, 'run.log'), `${LOG.join('\n')}\n`, 'utf8');
  console.error(`[pq017-browser] FAIL: ${failure.error}`);
  console.error(`[pq017-browser] staging: ${repoRelative(ROOT, STAGING)}`);
  process.exitCode = 1;
} else {
  const evidence = {
    schema: PQ017_ROUTE_SCHEMA,
    generatedAt: new Date().toISOString(),
    pass: true,
    runtimeKind: 'browser',
    primaryAcceptance: true,
    inputSource: routeResult.inputSource,
    injectedGameState: routeResult.injectedGameState,
    checks: routeResult.steps,
    screenshots: Object.values(PQ017_SCREENSHOTS),
    performance: routeResult.performance,
    lifecycle: routeResult.lifecycle,
    finalSnapshot: routeResult.finalSnapshot,
    cleanup: cleanupReport,
  };
  await writeFile(path.join(STAGING, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await writeFile(path.join(STAGING, 'run.log'), `${LOG.join('\n')}\n`, 'utf8');
  if (existsSync(ACCEPTED)) {
    await rename(ACCEPTED, path.join(OUTPUT_ROOT, `browser-history-${Date.now()}`));
  }
  await rename(STAGING, ACCEPTED);
  await completePq017ProbeClaim({
    outputRoot: OUTPUT_ROOT,
    claimToken: gateLaunch.claimToken,
  });
  const historyRetention = await prunePq017EvidenceHistory({
    outputRoot: OUTPUT_ROOT,
    runtimeKind: 'browser',
    retain: PQ017_HISTORY_RETENTION,
  });
  if (historyRetention.pruned.length) {
    console.log(`[pq017-browser] pruned history: ${historyRetention.pruned.join(', ')}`);
  }
  console.log('[pq017-browser] PASS');
  console.log(`[pq017-browser] evidence: ${repoRelative(ROOT, path.join(ACCEPTED, 'evidence.json'))}`);
}

function findSystemBrowser() {
  const candidates = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    : process.platform === 'darwin'
      ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
      : ['/usr/bin/google-chrome', '/usr/bin/microsoft-edge', '/usr/bin/chromium'];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}
