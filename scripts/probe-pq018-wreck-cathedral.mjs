#!/usr/bin/env node
// PQ-018 serialized Browser + Electron public-route campaign.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeOwnedResources,
  createCanonicalUrlTracker,
  inspectCanonicalRootUrl,
} from './lib/alphaLiveBaselineContracts.mjs';
import {
  assessElectronProcessHealth,
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import { collectPageIssues } from './lib/browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import {
  evaluatePq018MatchedPerformance,
  PQ018_ROUTE_SCHEMA,
  repoRelative,
  runPq018WreckCathedralPublicRoute,
} from './lib/pq018WreckCathedralPublicRoute.mjs';
import { evaluatePq018CoordinateReservation } from './lib/pq018CoordinateReservation.mjs';
import {
  loadValidatedPq018Baseline,
  PQ018_CAMPAIGN_SCHEMA,
  PQ018_RUNTIME_PROFILE,
  PQ018_VIEWPORT,
} from './check-pq018-baseline.mjs';
import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import {
  createPq018WreckCathedralManifest,
  PQ018_AUTHORIZED_BASE_SHA,
  PQ018_FIXED_SEED,
} from './validation-manifests/pq018-wreck-cathedral.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT_ROOT = path.join(ROOT, '.devshots', 'pq018-wreck-cathedral');
const VIEWPORT = PQ018_VIEWPORT;
const DIAGNOSTIC = process.argv.includes('--diagnostic');
const BASELINE_ONLY = process.argv.includes('--baseline-only');
const BASELINE_ROOT = readArg('--baseline-root');
const TARGET_ROOT = BASELINE_ONLY
  ? path.resolve(BASELINE_ROOT || '')
  : ROOT;

if (BASELINE_ONLY && (!BASELINE_ROOT || !existsSync(TARGET_ROOT))) {
  console.error('[pq018] --baseline-only requires an existing --baseline-root');
  process.exit(2);
}
if (BASELINE_ONLY && !DIAGNOSTIC) {
  console.error('[pq018] baseline collection is diagnostic-only');
  process.exit(2);
}

const manifest = createPq018WreckCathedralManifest();
const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: OUTPUT_ROOT,
  manifest,
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});
if (!brokerGate.ok) {
  console.error(`[pq018] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  process.exit(2);
}

const targetCommit = gitHead(TARGET_ROOT);
if (BASELINE_ONLY) {
  assert.equal(
    targetCommit,
    PQ018_AUTHORIZED_BASE_SHA,
    'baseline collection must run against the exact authorized immutable base',
  );
}
const candidateDigest = brokerGate.claim?.digests?.candidateDigest
  ?? brokerGate.claim?.receipt?.candidateDigest
  ?? null;
if (!DIAGNOSTIC) {
  assert(candidateDigest, 'acceptance evidence requires the broker claim candidate digest');
}
const baselineScenarioDigest = brokerGate.claim?.digests?.scenarioDigest ?? null;
const modeName = BASELINE_ONLY ? 'baseline' : DIAGNOSTIC ? 'diagnostic' : 'accepted';
const modeRoot = path.join(OUTPUT_ROOT, modeName);
const campaignStaging = path.join(
  OUTPUT_ROOT,
  `.tmp-${modeName}-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`,
);
await mkdir(campaignStaging, { recursive: true });
const validatedBaseline = BASELINE_ONLY
  ? null
  : await loadValidatedPq018Baseline({ outputRoot: OUTPUT_ROOT });
const coordinateReservation = evaluatePq018CoordinateReservation();
assert.equal(coordinateReservation.pass, true, 'PQ-018 coordinate reservation must pass');
const cells = [];
let primaryError = null;

for (const runtimeKind of ['browser', 'electron']) {
  try {
    const cell = runtimeKind === 'browser'
      ? await runBrowserCell(runtimeKind)
      : await runElectronCell(runtimeKind);
    cells.push(cell);
  } catch (error) {
    primaryError = error;
    break;
  }
}

if (!primaryError && !BASELINE_ONLY) {
  try {
    for (const cell of cells) {
      const baseline = validatedBaseline.cells.get(cell.runtimeKind);
      cell.matchedPerformance = evaluatePq018MatchedPerformance(cell.route, baseline.route);
      assert.deepEqual(
        cell.matchedPerformance.failures,
        [],
        `${cell.runtimeKind} matched performance failed`,
      );
      await writeFile(
        path.join(campaignStaging, cell.runtimeKind, 'evidence.json'),
        `${JSON.stringify(cell, null, 2)}\n`,
        'utf8',
      );
    }
  } catch (error) {
    primaryError = error;
  }
}

if (primaryError) {
  const failure = {
    schema: PQ018_ROUTE_SCHEMA,
    generatedAt: new Date().toISOString(),
    pass: false,
    primaryAcceptance: !DIAGNOSTIC,
    baselineOnly: BASELINE_ONLY,
    targetRoot: TARGET_ROOT,
    targetCommit,
    candidateDigest,
    phase: primaryError.routePhase || null,
    error: primaryError.message || String(primaryError),
    stack: primaryError.stack || null,
    progress: primaryError.routeProgress || null,
    completedCells: cells.map((cell) => cell.runtimeKind),
    stagedArtifacts: repoRelative(ROOT, campaignStaging),
  };
  const failurePath = path.join(
    OUTPUT_ROOT,
    `.failure-${Date.now()}-${randomBytes(4).toString('hex')}.json`,
  );
  await writeFile(failurePath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  console.error(`[pq018] FAIL: ${failure.error}`);
  console.error(`[pq018] failure: ${repoRelative(ROOT, failurePath)}`);
  process.exitCode = 1;
} else {
  const aggregate = {
    schema: PQ018_CAMPAIGN_SCHEMA,
    generatedAt: new Date().toISOString(),
    pass: true,
    primaryAcceptance: !DIAGNOSTIC && !BASELINE_ONLY,
    baselineOnly: BASELINE_ONLY,
    targetCommit,
    candidateDigest,
    baselineScenarioDigest,
    baselineTargetCommit: BASELINE_ONLY ? null : validatedBaseline.aggregate.targetCommit,
    seed: PQ018_FIXED_SEED,
    viewport: VIEWPORT,
    runtimeProfile: PQ018_RUNTIME_PROFILE,
    coordinateReservation,
    performanceComparisonScope: {
      matched: 'sector entry, asset admission, and ordinary-control Ceres coordinate approach',
      absoluteFloor: ['active operations', 'leave/return lifecycle', 'save/Continue recovery'],
      limitation: 'baseline-only mode does not execute Cathedral-only interactions absent at the authorized base',
    },
    runtimeKinds: cells.map((cell) => cell.runtimeKind),
    cells: cells.map((cell) => ({
      runtimeKind: cell.runtimeKind,
      evidence: repoRelative(ROOT, path.join(modeRoot, cell.runtimeKind, 'evidence.json')),
      matchedPerformance: cell.matchedPerformance || null,
    })),
  };
  await writeFile(
    path.join(campaignStaging, 'aggregate.json'),
    `${JSON.stringify(aggregate, null, 2)}\n`,
    'utf8',
  );
  await promote(campaignStaging, modeRoot);
  console.log(`[pq018] ${BASELINE_ONLY ? 'DIAGNOSTIC BASELINE' : 'ACCEPTANCE'} PASS`);
  console.log(`[pq018] aggregate: ${repoRelative(ROOT, path.join(modeRoot, 'aggregate.json'))}`);
}

async function runBrowserCell(runtimeKind) {
  const staging = path.join(campaignStaging, runtimeKind);
  await mkdir(staging, { recursive: true });
  let server = null;
  let browser = null;
  let context = null;
  let page = null;
  let issueTracker = null;
  let urlTracker = null;
  let route = null;
  let cleanup = null;
  let error = null;
  try {
    server = await acquireVisualProbeServer({ root: TARGET_ROOT });
    assert.equal(server.ownsServer, true, 'Browser cell must own its canonical server');
    const { chromium } = await import('./lib/load-playwright.mjs').then((mod) => mod.loadPlaywright());
    const executablePath = findSystemBrowser();
    assert(executablePath, 'headed Chrome or Edge is required');
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
      reducedMotion: 'reduce',
    });
    page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);
    issueTracker = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });
    urlTracker = createCanonicalUrlTracker(page, server.baseUrl);
    const response = await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    assert(response);
    assert.deepEqual(inspectCanonicalRootUrl(page.url(), server.baseUrl).failures, []);
    route = await runPq018WreckCathedralPublicRoute({
      page,
      outputDir: staging,
      expectedRootUrl: server.baseUrl,
      fixedSeed: PQ018_FIXED_SEED,
      runtimeKind,
      baselineOnly: BASELINE_ONLY,
      log: (message) => console.log(`[pq018-browser] ${message}`),
    });
    assert.deepEqual(issueTracker.errorIssues(), []);
  } catch (caught) {
    error = caught;
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(staging, 'failure.png'), type: 'png' }).catch(() => {});
    }
  } finally {
    cleanup = await closeOwnedResources({
      page,
      context,
      browser,
      server,
      canonicalUrlTracker: urlTracker,
    }).catch((caught) => ({ pass: false, failures: [caught.message || String(caught)] }));
    if (cleanup?.pass !== true) error ||= new Error(`Browser cleanup failed: ${cleanup.failures.join('; ')}`);
  }
  if (error) throw error;
  const evidence = evidenceRecord({ runtimeKind, route, cleanup });
  await writeFile(path.join(staging, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidence;
}

async function runElectronCell(runtimeKind) {
  const staging = path.join(campaignStaging, runtimeKind);
  await mkdir(staging, { recursive: true });
  let isolatedLaunch = null;
  let electronApp = null;
  let childProcess = null;
  let page = null;
  let issueTracker = null;
  let processMonitor = null;
  let urlTracker = null;
  let rootUrl = null;
  let route = null;
  let processHealth = null;
  let cleanup = null;
  let error = null;
  try {
    const { _electron: electron } = await import('./lib/load-playwright.mjs').then((mod) => mod.loadPlaywright());
    isolatedLaunch = createIsolatedElectronLaunch({
      root: TARGET_ROOT,
      taskId: BASELINE_ONLY ? 'pq018-baseline-electron' : 'pq018-acceptance-electron',
    });
    isolatedLaunch.options.args.push(
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    );
    electronApp = await electron.launch(isolatedLaunch.options);
    processMonitor = createElectronProcessMonitor({ electronApp, childProcess: electronApp.process() });
    childProcess = processMonitor.childProcess;
    assert(childProcess);
    issueTracker = createStrictElectronApplicationIssueTracker(electronApp);
    page = await electronApp.firstWindow({ timeout: 90_000 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    urlTracker = createElectronCanonicalUrlTracker(page, {
      bootstrapTimeoutMs: 10_000,
      pollIntervalMs: 75,
      allowAnyLoopbackPort: true,
    });
    await issueTracker.bindAndBackfillPage(page);
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);
    rootUrl = await urlTracker.waitForCanonicalRoot(10_000);
    assertIsolatedElectronRootUrl(rootUrl);
    assert.deepEqual(inspectCanonicalRootUrl(page.url(), rootUrl).failures, []);
    await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
    route = await runPq018WreckCathedralPublicRoute({
      page,
      outputDir: staging,
      expectedRootUrl: rootUrl,
      fixedSeed: PQ018_FIXED_SEED,
      runtimeKind,
      baselineOnly: BASELINE_ONLY,
      log: (message) => console.log(`[pq018-electron] ${message}`),
      timeBudgetScale: 3,
    });
    assert.deepEqual(issueTracker.errors(), []);
    processHealth = assessElectronProcessHealth(processMonitor.snapshot());
    assert.deepEqual(processHealth.failures, []);
  } catch (caught) {
    error = caught;
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(staging, 'failure.png'), type: 'png' }).catch(() => {});
    }
  } finally {
    cleanup = await closeOwnedElectronRuntime({
      page,
      electronApp,
      childProcess,
      canonicalUrlTracker: urlTracker,
      processMonitor,
      rootUrl,
    }).catch((caught) => ({ pass: false, failures: [caught.message || String(caught)] }));
    if (cleanup?.pass !== true) error ||= new Error(`Electron cleanup failed: ${cleanup.failures.join('; ')}`);
    if (isolatedLaunch && cleanup?.pass === true) {
      try { isolatedLaunch.cleanup({ runtimeClosed: true }); } catch (caught) { error ||= caught; }
    }
    issueTracker?.stop?.();
  }
  if (error) throw error;
  const evidence = evidenceRecord({ runtimeKind, route, cleanup, processHealth });
  await writeFile(path.join(staging, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidence;
}

function evidenceRecord({ runtimeKind, route, cleanup, processHealth = null }) {
  return {
    schema: PQ018_ROUTE_SCHEMA,
    generatedAt: new Date().toISOString(),
    pass: true,
    primaryAcceptance: !DIAGNOSTIC && !BASELINE_ONLY,
    baselineOnly: BASELINE_ONLY,
    runtimeKind,
    targetCommit,
    candidateDigest,
    seed: PQ018_FIXED_SEED,
    viewport: VIEWPORT,
    runtimeProfile: manifest.runtimeProfile,
    route,
    cleanup,
    processHealth,
  };
}

async function promote(staging, destination) {
  if (existsSync(destination)) {
    await rename(destination, `${destination}-history-${Date.now()}`);
  }
  await rename(staging, destination);
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

function gitHead(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || null : null;
}
