#!/usr/bin/env node
// PQ-017 Persistent World Site — isolated Electron public-route gate.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectCanonicalRootUrl } from './lib/alphaLiveBaselineContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import {
  assessElectronProcessHealth,
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertPq017ProbeLaunch,
  completePq017ProbeClaim,
  derivePq017FailureIdentity,
  publishPq017AcceptanceFailure,
} from './lib/pq017ProbeIterationGuard.mjs';
import {
  classifyPq017PerformanceRun,
  PQ017_HISTORY_RETENTION,
  PQ017_ROUTE_SCHEMA,
  PQ017_SCREENSHOTS,
  prunePq017EvidenceHistory,
  repoRelative,
  runPq017WorldSitePublicRoute,
} from './lib/pq017WorldSitePublicRoute.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TASK_ID = 'pq017-world-site-electron';
const OUTPUT_ROOT = path.join(ROOT, '.devshots', 'pq017-world-site');
const ACCEPTED = path.join(OUTPUT_ROOT, 'electron');
const runMode = classifyPq017PerformanceRun({
  captureSystemTiming: process.env.SPACEFACE_PQ017_SYSTEM_TIMING === '1',
});
const STAGING = path.join(
  OUTPUT_ROOT,
  `.tmp-electron${runMode.primaryAcceptance ? '' : '-diagnostic'}`
    + `-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`,
);
const LOG = [];
const log = (message) => {
  const line = `${new Date().toISOString()} ${message}`;
  LOG.push(line);
  console.log(`[pq017-electron] ${message}`);
};

let isolatedLaunch = null;
let electronApp = null;
let childProcess = null;
let page = null;
let issueTracker = null;
let processMonitor = null;
let canonicalUrlTracker = null;
let rootUrl = null;
let routeResult = null;
let routeProcessHealth = null;
let cleanupReport = null;
let primaryError = null;

// G3: acceptance claim is caller-issued (probe / SF_BROKER_CLAIM), never self-minted in assert.
const electronMode = runMode.primaryAcceptance ? 'acceptance' : 'diagnostic';
let electronClaimToken = process.env.SF_BROKER_CLAIM || null;
if (electronMode === 'acceptance' && !electronClaimToken) {
  const { issuePq017AcceptanceClaim } = await import('./lib/pq017ProbeIterationGuard.mjs');
  const issued = await issuePq017AcceptanceClaim({ root: ROOT, outputRoot: OUTPUT_ROOT });
  electronClaimToken = issued.claimPath;
}
const gateLaunch = await assertPq017ProbeLaunch({
  root: ROOT,
  outputRoot: OUTPUT_ROOT,
  runtimeKind: 'electron',
  mode: electronMode,
  explicitAcceptance: process.argv.includes('--acceptance'),
  explicitDiagnostic: process.argv.includes('--diagnostic'),
  brokerClaimToken: electronClaimToken,
});
const { loadPlaywright } = await import('./lib/load-playwright.mjs');
await mkdir(STAGING, { recursive: true });

try {
  const { _electron: electron } = await loadPlaywright();
  isolatedLaunch = createIsolatedElectronLaunch({ root: ROOT, taskId: TASK_ID });
  isolatedLaunch.options.args.push(
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  );
  electronApp = await electron.launch(isolatedLaunch.options);
  processMonitor = createElectronProcessMonitor({ electronApp, childProcess: electronApp.process() });
  childProcess = processMonitor.childProcess;
  assert(childProcess, 'Electron launch must expose an owned child process');
  issueTracker = createStrictElectronApplicationIssueTracker(electronApp);

  page = await electronApp.firstWindow({ timeout: 90_000 });
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  await issueTracker.bindAndBackfillPage(page);
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  rootUrl = await canonicalUrlTracker.waitForCanonicalRoot(10_000);
  assertIsolatedElectronRootUrl(rootUrl);
  assert.deepEqual(inspectCanonicalRootUrl(page.url(), rootUrl).failures, [],
    'Electron must remain at its isolated canonical root');
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  await page.bringToFront();

  routeResult = await runPq017WorldSitePublicRoute({
    page,
    outputDir: STAGING,
    expectedRootUrl: rootUrl,
    log,
    // Electron shares the exact public route and performance floors with Browser. Its isolated
    // cold process can advance simulation time more slowly while shader/asset caches warm, so wall-
    // clock safety timeouts get headroom without changing any accepted gameplay condition.
    timeBudgetScale: 3,
    captureSystemTiming: runMode.captureSystemTiming,
    primaryAcceptance: runMode.primaryAcceptance,
  });
  assert.equal(routeResult.primaryAcceptance, runMode.primaryAcceptance,
    'route result must preserve the wrapper performance run mode');
  assert.deepEqual(issueTracker.errors(), [], 'Electron route emitted page errors');
  routeProcessHealth = assessElectronProcessHealth(processMonitor.snapshot());
  assert.deepEqual(routeProcessHealth.failures, [], 'Electron route process health failed');
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
  if (isolatedLaunch && cleanupReport?.pass === true) {
    try {
      isolatedLaunch.cleanup({ runtimeClosed: true });
    } catch (error) {
      primaryError ||= error;
    }
  }
  issueTracker?.stop?.();
}

if (primaryError || routeResult?.pass !== true || cleanupReport?.pass !== true) {
  const failure = {
    schema: PQ017_ROUTE_SCHEMA,
    generatedAt: new Date().toISOString(),
    pass: false,
    runtimeKind: 'electron',
    artifactKind: runMode.artifactKind,
    primaryAcceptance: runMode.primaryAcceptance,
    regressionDigest: gateLaunch.regressionDigest,
    routeDigest: gateLaunch.routeDigest,
    error: primaryError?.message || 'route or cleanup did not pass',
    stack: primaryError?.stack || null,
    phase: primaryError?.routePhase || null,
    progress: primaryError?.routeProgress || null,
    performance: primaryError?.routePerformance || null,
    lifecycle: primaryError?.routeLifecycle || null,
    failureSnapshot: primaryError?.routeFailureSnapshot || null,
    processHealth: routeProcessHealth,
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
  console.error(`[pq017-electron] FAIL: ${failure.error}`);
  console.error(`[pq017-electron] staging: ${repoRelative(ROOT, STAGING)}`);
  process.exitCode = 1;
} else {
  const evidence = {
    schema: PQ017_ROUTE_SCHEMA,
    generatedAt: new Date().toISOString(),
    pass: true,
    runtimeKind: 'electron',
    artifactKind: runMode.artifactKind,
    primaryAcceptance: runMode.primaryAcceptance,
    inputSource: routeResult.inputSource,
    injectedGameState: routeResult.injectedGameState,
    processHealth: routeProcessHealth,
    checks: routeResult.steps,
    screenshots: Object.values(PQ017_SCREENSHOTS),
    performance: routeResult.performance,
    lifecycle: routeResult.lifecycle,
    finalSnapshot: routeResult.finalSnapshot,
    cleanup: cleanupReport,
  };
  const evidenceName = runMode.primaryAcceptance ? 'evidence.json' : 'diagnostic-evidence.json';
  await writeFile(path.join(STAGING, evidenceName), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await writeFile(path.join(STAGING, 'run.log'), `${LOG.join('\n')}\n`, 'utf8');
  if (runMode.promoteAcceptedArtifact) {
    if (existsSync(ACCEPTED)) {
      await rename(ACCEPTED, path.join(OUTPUT_ROOT, `electron-history-${Date.now()}`));
    }
    await rename(STAGING, ACCEPTED);
    await completePq017ProbeClaim({
      outputRoot: OUTPUT_ROOT,
      claimToken: gateLaunch.claimToken,
    });
    const historyRetention = await prunePq017EvidenceHistory({
      outputRoot: OUTPUT_ROOT,
      runtimeKind: 'electron',
      retain: PQ017_HISTORY_RETENTION,
    });
    if (historyRetention.pruned.length) {
      console.log(`[pq017-electron] pruned history: ${historyRetention.pruned.join(', ')}`);
    }
    console.log('[pq017-electron] PASS');
    console.log(`[pq017-electron] evidence: ${repoRelative(ROOT, path.join(ACCEPTED, evidenceName))}`);
  } else {
    await completePq017ProbeClaim({
      outputRoot: OUTPUT_ROOT,
      claimToken: gateLaunch.claimToken,
    });
    console.log('[pq017-electron] DIAGNOSTIC PASS (accepted evidence unchanged)');
    console.log(`[pq017-electron] diagnostic evidence: ${repoRelative(ROOT, path.join(STAGING, evidenceName))}`);
  }
}
