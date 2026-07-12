#!/usr/bin/env node
// PROFESSIONAL-TRAVEL-PUBLIC-ROUTE — headed Electron gate.
// Shares scripts/lib/professionalTravelPublicRoute.mjs with the Browser variant.
// Evidence: .devshots/professional-travel/electron/

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { inspectCanonicalRootUrl } from './lib/alphaLiveBaselineContracts.mjs';
import { travelRouteFingerprint } from './lib/professionalTravelFingerprint.mjs';
import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
  assessElectronProcessHealth,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  TASK_ID_ELECTRON,
  TRAVEL_ROUTE_SCHEMA,
  TRAVEL_SCREENSHOTS,
  runProfessionalTravelPublicRoute,
  repoRel,
} from './lib/professionalTravelPublicRoute.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_ROOT = path.join(ROOT, '.devshots', 'professional-travel');
const ACCEPTED = path.join(OUT_ROOT, 'electron');
const STAGING = path.join(
  OUT_ROOT,
  `.tmp-electron-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`,
);
const LOG = [];
const log = (m) => {
  const line = `${new Date().toISOString()} ${m}`;
  LOG.push(line);
  console.log(`[travel-electron] ${m}`);
};

let electronApp = null;
let childProcess = null;
let page = null;
let pageIssueTracker = null;
let processMonitor = null;
let canonicalUrlTracker = null;
let routeResult = null;
let rootUrl = null;
let startFp = null;
let routeFp = null;
let cleanupFp = null;
let cleanupReport = null;
let primaryError = null;
let routeProcessHealth = null;

await mkdir(OUT_ROOT, { recursive: true });
await mkdir(STAGING, { recursive: true });

try {
  startFp = await travelRouteFingerprint(ROOT);
  log(`fingerprint start ${startFp.id}`);

  const { _electron: electron } = await loadPlaywright();
  electronApp = await electron.launch({ args: ['.'], cwd: ROOT, timeout: 90_000 });
  processMonitor = createElectronProcessMonitor({ electronApp, childProcess: electronApp.process() });
  childProcess = processMonitor.childProcess;
  assert(childProcess, 'Electron launch must expose child process');
  pageIssueTracker = createStrictElectronApplicationIssueTracker(electronApp);
  log(`electron pid=${childProcess.pid || 'unknown'}`);

  page = await electronApp.firstWindow({ timeout: 90_000 });
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
  });
  await pageIssueTracker.bindAndBackfillPage(page);
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);

  rootUrl = await canonicalUrlTracker.waitForCanonicalRoot(10_000);
  assert.deepEqual(
    inspectCanonicalRootUrl(page.url(), rootUrl).failures,
    [],
    'Electron must establish canonical root',
  );
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  await page.bringToFront();
  log(`electron root ${rootUrl}`);

  routeResult = await runProfessionalTravelPublicRoute({
    page,
    outputDir: STAGING,
    expectedRootUrl: rootUrl,
    log,
  });

  const pageErrors = pageIssueTracker.errors();
  assert.deepEqual(pageErrors, [], `Electron route page errors: ${JSON.stringify(pageErrors)}`);
  routeProcessHealth = assessElectronProcessHealth(processMonitor.snapshot());
  assert.deepEqual(routeProcessHealth.failures, [],
    `Electron process health failures: ${JSON.stringify(routeProcessHealth.failures)}`);

  routeFp = await travelRouteFingerprint(ROOT);
  assert.equal(routeFp.digest, startFp.digest, 'travel-route source fingerprint changed during Electron capture');
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
    cleanupReport = await closeOwnedElectronRuntime({
      page,
      electronApp,
      childProcess,
      canonicalUrlTracker,
      processMonitor,
      rootUrl,
    });
    if (cleanupReport?.pass !== true) {
      primaryError ||= new Error(`Electron cleanup failed: ${(cleanupReport?.failures || []).join('; ')}`);
    }
  } catch (error) {
    cleanupReport = { pass: false, failures: [error.message || String(error)] };
    primaryError ||= error;
  }
  pageIssueTracker?.stop?.();
  try {
    cleanupFp = await travelRouteFingerprint(ROOT);
    if (startFp && cleanupFp.digest !== startFp.digest) {
      primaryError ||= new Error(`travel-route source fingerprint drifted before Electron cleanup: ${startFp.id} -> ${cleanupFp.id}`);
    }
  } catch (error) {
    primaryError ||= error;
  }
}

if (primaryError || routeResult?.pass !== true) {
  await writeFile(path.join(STAGING, 'run.log'), `${LOG.join('\n')}\n`, 'utf8').catch(() => {});
  console.error(`[travel-electron] FAIL: ${primaryError?.message || 'route did not pass'}`);
  console.error(`[travel-electron] staging: ${repoRel(ROOT, STAGING)}`);
  process.exit(1);
}

assert.equal(cleanupReport?.pass, true, 'owned Electron cleanup must pass');
assert.equal(cleanupFp?.digest, startFp.digest, 'travel-route source fingerprint must stay stable through cleanup');

const evidence = {
  schema: TRAVEL_ROUTE_SCHEMA,
  taskId: TASK_ID_ELECTRON,
  generatedAt: new Date().toISOString(),
  pass: true,
  runtimeKind: 'electron',
  primaryAcceptance: true,
  inputSource: 'keyboard-mouse',
  injectedState: false,
  fingerprintId: startFp.id,
  fingerprintDigest: startFp.digest,
  fingerprintKind: startFp.kind,
  destination: routeResult.destination,
  processHealth: routeProcessHealth,
  checks: [
    { name: 'shared public travel route', status: 'pass' },
    { name: 'authored flight launch', status: 'pass' },
    { name: 'physical gate approach', status: 'pass' },
    { name: 'public map jump arming', status: 'pass' },
    { name: 'jump align/commit/arrive receipts', status: 'pass' },
    { name: 'save/Continue destination restore', status: 'pass' },
    { name: 'Electron process health', status: 'pass' },
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
      path: `.devshots/professional-travel/electron/${name}`,
    })),
    { kind: 'report', path: '.devshots/professional-travel/electron/evidence.json' },
    { kind: 'log', path: '.devshots/professional-travel/electron/run.log' },
  ],
};

await writeFile(path.join(STAGING, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
await writeFile(path.join(STAGING, 'run.log'), `${LOG.join('\n')}\n`, 'utf8');

if (existsSync(ACCEPTED)) {
  const hist = path.join(OUT_ROOT, `electron-history-${Date.now()}`);
  await rename(ACCEPTED, hist).catch(() => {});
}
await rename(STAGING, ACCEPTED);
console.log(`[travel-electron] PASS`);
console.log(`[travel-electron] evidence: ${repoRel(ROOT, path.join(ACCEPTED, 'evidence.json'))}`);
console.log(`[travel-electron] destination: ${routeResult.destination.sectorId}`);
