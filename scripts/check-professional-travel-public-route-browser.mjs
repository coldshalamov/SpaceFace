#!/usr/bin/env node
// PROFESSIONAL-TRAVEL-PUBLIC-ROUTE — headed Browser gate.
// Shared route core: scripts/lib/professionalTravelPublicRoute.mjs
// Evidence: .devshots/professional-travel/browser/

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  closeOwnedResources,
  createCanonicalUrlTracker,
  inspectCanonicalRootUrl,
} from './lib/alphaLiveBaselineContracts.mjs';
import { travelRouteFingerprint } from './lib/professionalTravelFingerprint.mjs';
import {
  TASK_ID_BROWSER,
  TRAVEL_ROUTE_SCHEMA,
  TRAVEL_SCREENSHOTS,
  runProfessionalTravelPublicRoute,
  repoRel,
} from './lib/professionalTravelPublicRoute.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { collectPageIssues } from './lib/browser-issues.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const OUT_ROOT = path.join(ROOT, '.devshots', 'professional-travel');
const ACCEPTED = path.join(OUT_ROOT, 'browser');
const STAGING = path.join(
  OUT_ROOT,
  `.tmp-browser-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`,
);
const LOG = [];
const log = (m) => {
  const line = `${new Date().toISOString()} ${m}`;
  LOG.push(line);
  console.log(`[travel-browser] ${m}`);
};

let ownedServer = null;
let browser = null;
let context = null;
let page = null;
let pageIssues = null;
let canonicalUrlTracker = null;
let routeResult = null;
let startFp = null;
let routeFp = null;
let cleanupFp = null;
let cleanupReport = null;
let primaryError = null;

await mkdir(OUT_ROOT, { recursive: true });
await mkdir(STAGING, { recursive: true });

try {
  startFp = await travelRouteFingerprint(ROOT);
  log(`fingerprint start ${startFp.id}`);

  ownedServer = await acquireVisualProbeServer({ root: ROOT });
  assert.equal(ownedServer.ownsServer, true, 'must own canonical in-process server');
  const rootUrl = ownedServer.baseUrl;
  assert.equal(new URL(rootUrl).search, '', 'no query flags on root');
  log(`server ${rootUrl}`);

  const executablePath = findSystemBrowser();
  assert(executablePath, 'headed Chrome/Edge required');
  log(`browser ${executablePath}`);
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: false,
    executablePath,
    args: [
      '--incognito',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
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
  page.setDefaultNavigationTimeout(60_000);
  pageIssues = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });
  canonicalUrlTracker = createCanonicalUrlTracker(page, rootUrl);

  const nav = await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.bringToFront();
  assert(nav, 'navigation must return a response');
  assert.deepEqual(
    inspectCanonicalRootUrl(page.url(), rootUrl).failures,
    [],
    'post-navigation left canonical root',
  );

  routeResult = await runProfessionalTravelPublicRoute({
    page,
    outputDir: STAGING,
    expectedRootUrl: rootUrl,
    log,
  });

  const errors = pageIssues.errorIssues();
  assert.deepEqual(errors, [], `runtime errors: ${JSON.stringify(errors)}`);

  routeFp = await travelRouteFingerprint(ROOT);
  assert.equal(routeFp.digest, startFp.digest, 'travel-route source fingerprint changed during browser capture');
  log(`fingerprint route ${routeFp.id}`);
} catch (error) {
  primaryError = error;
  if (page && !page.isClosed()) {
    await page.screenshot({
      path: path.join(STAGING, 'failure-screenshot.png'),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
    await writeFile(
      path.join(STAGING, 'failure-report.json'),
      `${JSON.stringify({
        message: error.message,
        stack: error.stack,
        phase: error.routePhase || null,
        progress: error.routeProgress || null,
      }, null, 2)}\n`,
      'utf8',
    ).catch(() => {});
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
  try {
    cleanupFp = await travelRouteFingerprint(ROOT);
    if (startFp && cleanupFp.digest !== startFp.digest) {
      primaryError ||= new Error(`travel-route source fingerprint drifted before cleanup: ${startFp.id} -> ${cleanupFp.id}`);
    }
  } catch (error) {
    primaryError ||= error;
  }
}

if (primaryError || routeResult?.pass !== true) {
  await writeFile(path.join(STAGING, 'run.log'), `${LOG.join('\n')}\n`, 'utf8').catch(() => {});
  console.error(`[travel-browser] FAIL: ${primaryError?.message || 'route did not pass'}`);
  console.error(`[travel-browser] staging: ${repoRel(ROOT, STAGING)}`);
  process.exit(1);
}

assert.equal(cleanupReport?.pass, true, 'owned cleanup must pass');
assert.equal(cleanupFp?.digest, startFp.digest, 'travel-route source fingerprint must stay stable through cleanup');

const evidence = {
  schema: TRAVEL_ROUTE_SCHEMA,
  taskId: TASK_ID_BROWSER,
  generatedAt: new Date().toISOString(),
  pass: true,
  runtimeKind: 'browser',
  primaryAcceptance: true,
  inputSource: 'keyboard-mouse',
  injectedState: false,
  fingerprintId: startFp.id,
  fingerprintDigest: startFp.digest,
  fingerprintKind: startFp.kind,
  destination: routeResult.destination,
  checks: [
    { name: 'shared public travel route', status: 'pass' },
    { name: 'authored flight launch', status: 'pass' },
    { name: 'physical gate approach', status: 'pass' },
    { name: 'public map jump arming', status: 'pass' },
    { name: 'jump align/commit/arrive receipts', status: 'pass' },
    { name: 'save/Continue destination restore', status: 'pass' },
    { name: 'runtime errors absent', status: 'pass' },
    { name: 'travel-route sources stable', status: 'pass' },
    { name: 'owned cleanup', status: 'pass' },
  ],
  screenshots: Object.values(TRAVEL_SCREENSHOTS),
  route: {
    steps: routeResult.steps,
    jumpReceipts: routeResult.jumpReceipts,
    arrivalSnapshot: routeResult.arrivalSnapshot,
    continueSnapshot: routeResult.continueSnapshot,
  },
  cleanup: cleanupReport,
  fingerprints: { start: startFp, route: routeFp, cleanup: cleanupFp },
  artifacts: [
    ...Object.values(TRAVEL_SCREENSHOTS).map((name) => ({
      kind: 'screenshot',
      path: `.devshots/professional-travel/browser/${name}`,
    })),
    { kind: 'report', path: '.devshots/professional-travel/browser/evidence.json' },
    { kind: 'log', path: '.devshots/professional-travel/browser/run.log' },
  ],
};

await writeFile(path.join(STAGING, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
await writeFile(path.join(STAGING, 'run.log'), `${LOG.join('\n')}\n`, 'utf8');

if (existsSync(ACCEPTED)) {
  const hist = path.join(OUT_ROOT, `browser-history-${Date.now()}`);
  await rename(ACCEPTED, hist).catch(() => {});
}
await rename(STAGING, ACCEPTED);
console.log(`[travel-browser] PASS`);
console.log(`[travel-browser] evidence: ${repoRel(ROOT, path.join(ACCEPTED, 'evidence.json'))}`);
console.log(`[travel-browser] destination: ${routeResult.destination.sectorId}`);

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
      : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/microsoft-edge'];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}
