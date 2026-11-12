#!/usr/bin/env node
// Focused native regression for PQ-020's Electron cold-Continue request boundary.
//
// This is deliberately much smaller than the 21-frame Ceres acceptance cell: public New Game,
// F5, document reload, public Continue, and production flight readiness are enough to reproduce the
// request-lifecycle seam. Context/page identity telemetry characterizes any failed request without
// turning a navigation cancellation into a blanket allowlist.

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';
import { summarizeIssues } from './lib/browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'pq020-electron-request-provenance');
const REPORT_PATH = path.join(OUT, 'report.json');
const FIXED_SEED = 47;

await mkdir(OUT, { recursive: true });

let phase = 'launch';
let app = null;
let childProcess = null;
let page = null;
let launch = null;
let processMonitor = null;
let canonicalUrlTracker = null;
let rootUrl = null;
let issueTracker = null;
let cleanupReport = null;
let primaryError = null;
let report = null;

const requestIds = new WeakMap();
const requestStarts = new Map();
const failures = [];
let nextRequestId = 1;

const read = (value, method, fallback = null) => {
  try { return typeof value?.[method] === 'function' ? value[method]() : fallback; }
  catch (_) { return fallback; }
};
const requestId = (request) => {
  if (!requestIds.has(request)) requestIds.set(request, nextRequestId++);
  return requestIds.get(request);
};
const observeRequest = (source, request) => {
  const id = requestId(request);
  if (!requestStarts.has(id)) {
    requestStarts.set(id, {
      id,
      source,
      phase,
      method: read(request, 'method', 'GET'),
      resourceType: read(request, 'resourceType', 'unknown'),
      url: read(request, 'url', ''),
    });
  }
};
const observeFailure = (source, request) => {
  const id = requestId(request);
  failures.push({
    id,
    source,
    phase,
    startObserved: requestStarts.has(id),
    started: requestStarts.get(id) || null,
    method: read(request, 'method', 'GET'),
    resourceType: read(request, 'resourceType', 'unknown'),
    url: read(request, 'url', ''),
    errorText: read(request, 'failure', null)?.errorText || 'unknown',
  });
};

try {
  const { _electron: electron } = await loadPlaywright();
  launch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'pq020-request-provenance' });
  app = await electron.launch(launch.options);
  childProcess = app.process();
  processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
  issueTracker = createStrictElectronApplicationIssueTracker(app);

  const context = app.context();
  context.on('request', (request) => observeRequest('context', request));
  context.on('requestfailed', (request) => observeFailure('context', request));

  page = await app.firstWindow({ timeout: 90_000 });
  page.on('request', (request) => observeRequest('page', request));
  page.on('requestfailed', (request) => observeFailure('page', request));
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  await issueTracker.bindAndBackfillPage(page);
  rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(10_000));
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);

  phase = 'initial-menu';
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus && window.SF?.ctx,
    null, { timeout: 60_000 });
  await dismissCinematic(page);
  const newGame = page.getByRole('button', { name: 'New Game', exact: true });
  await newGame.waitFor({ state: 'visible', timeout: 30_000 });
  await newGame.click();
  await page.fill('#sf-ng-seed', String(FIXED_SEED));
  await page.getByRole('button', { name: 'Launch', exact: true }).click();

  phase = 'initial-flight';
  await page.waitForFunction(flightReadyInPage, null, { timeout: 150_000 });
  await waitForScreenRegistrationSettled(page);
  await page.keyboard.press('F5');
  await page.waitForFunction(() => !!localStorage.getItem('sf.save.quick'), null, { timeout: 30_000 });

  phase = 'cold-reload';
  const navigationToken = issueTracker.beginExpectedNavigation('pq020-focused-cold-continue');
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  } finally {
    issueTracker.endExpectedNavigation(navigationToken);
  }
  assert.equal(new URL(page.url()).href, new URL(rootUrl).href);

  phase = 'restored-menu';
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus && window.SF?.ctx,
    null, { timeout: 60_000 });
  await dismissCinematic(page);
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor({ state: 'visible', timeout: 30_000 });
  await waitForScreenRegistrationSettled(page);
  await continueButton.click();

  phase = 'restored-flight';
  await page.waitForFunction(flightReadyInPage, null, { timeout: 150_000 });
  await waitForScreenRegistrationSettled(page);
  await page.waitForTimeout(750);

  const state = await page.evaluate(() => ({
    mode: window.SF?.state?.mode || null,
    seed: window.SF?.state?.meta?.seed ?? null,
    sectorId: window.SF?.state?.world?.currentSectorId || null,
    screenGeneration: window.SF?.registry?.get?.('ui')?._screenRegistrationGeneration ?? null,
    screenSettledGeneration:
      window.SF?.registry?.get?.('ui')?._screenRegistrationSettledGeneration ?? null,
  }));
  const canonicalDocumentRequests = [...requestStarts.values()].filter((request) => {
    if (request.resourceType !== 'document') return false;
    try { return new URL(request.url).href === new URL(rootUrl).href; }
    catch (_) { return false; }
  });
  report = {
    schema: 'spaceface.pq020ElectronRequestProvenance.v1',
    generatedAt: new Date().toISOString(),
    rootUrl,
    state,
    pageIssues: summarizeIssues(issueTracker.errors()),
    ignoredPageIssues: summarizeIssues(issueTracker.ignored()),
    ignoredNavigationIssues: issueTracker.ignored(),
    requestFailures: failures,
    canonicalDocumentRequests,
  };
  assert.equal(state.mode, 'flight');
  assert.equal(state.seed, FIXED_SEED);
  assert.equal(state.screenSettledGeneration, state.screenGeneration);
  assert.equal(canonicalDocumentRequests.length, 2,
    'the focused route must load the canonical first window once and reload it once, with no duplicate boot navigation');
  assert.ok(report.ignoredNavigationIssues.some((issue) => (
    issue.expectedNavigation?.includes('pq020-focused-cold-continue')
    && /net::ERR_ABORTED$/i.test(issue.text)
  )), 'the focused route must exercise one identity-tagged reload cancellation');
  const contextFailure = failures.find((failure) => (
    failure.source === 'context'
    && failure.phase === 'cold-reload'
    && failure.startObserved
    && /^net::ERR_ABORTED$/i.test(failure.errorText)
  ));
  assert(contextFailure, 'context authority must observe the request start and cold-reload failure');
  assert(failures.some((failure) => failure.source === 'page' && failure.id === contextFailure.id),
    'context and Page must agree on the exact failed request identity');
  assert.deepEqual(report.pageIssues, [],
    `cold Continue emitted page issues: ${JSON.stringify(report.pageIssues)}`);
} catch (error) {
  primaryError = error;
} finally {
  try {
    cleanupReport = await closeOwnedElectronRuntime({
      page,
      electronApp: app,
      childProcess,
      canonicalUrlTracker,
      processMonitor,
      rootUrl,
    });
  } catch (error) {
    cleanupReport = { pass: false, failures: [error?.message || String(error)] };
  }
  if (launch && cleanupReport?.pass === true) launch.cleanup({ runtimeClosed: true });
  report ||= {
    schema: 'spaceface.pq020ElectronRequestProvenance.v1',
    generatedAt: new Date().toISOString(),
    rootUrl,
    pageIssues: issueTracker ? summarizeIssues(issueTracker.errors()) : [],
    ignoredPageIssues: issueTracker ? summarizeIssues(issueTracker.ignored()) : [],
    ignoredNavigationIssues: issueTracker ? issueTracker.ignored() : [],
    requestFailures: failures,
  };
  report.cleanup = compactCleanup(cleanupReport);
  report.pass = !primaryError && cleanupReport?.pass === true;
  if (primaryError) report.error = {
    message: primaryError?.message || String(primaryError),
    stack: primaryError?.stack || null,
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

if (primaryError) throw primaryError;
assert.equal(cleanupReport?.pass, true, `owned Electron cleanup failed: ${cleanupReport?.failures?.join('; ')}`);
console.log('[pq020-electron-request-provenance] PASS — cold Continue has no unattributed failures');
console.log('  report: .devshots/pq020-electron-request-provenance/report.json');

async function dismissCinematic(targetPage) {
  const splash = targetPage.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await targetPage.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 });
  }
}

async function waitForScreenRegistrationSettled(targetPage) {
  await targetPage.waitForFunction(() => {
    const ui = window.SF?.registry?.get?.('ui');
    return !!ui
      && Number.isFinite(ui._screenRegistrationGeneration)
      && ui._screenRegistrationSettledGeneration === ui._screenRegistrationGeneration;
  }, null, { timeout: 60_000 });
}

function compactCleanup(value) {
  return {
    pass: value?.pass === true,
    failures: value?.failures || [],
    appCloseCompleted: value?.appCloseCompleted === true,
    pageClosed: value?.pageClosed === true,
    processExited: value?.processExited === true,
    listenerReleased: value?.listenerReleased === true,
  };
}
