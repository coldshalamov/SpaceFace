#!/usr/bin/env node
// CHECK:JOURNEY:TEXTILE — the program finish line (ADR D11).
//
// The full acceptance journey, extended from the professional-travel public route:
//   accept mission → open map → identify position/mission/destination/next leg → inspect destination
//   and arrival reason → compare and plot → engage SEPARATELY → observe truthful instruments →
//   interrupt → recover the itinerary → arrive and complete the cargo action → save/load.
//
// Eleven graded steps, each with an assertion on a PLAYER-VISIBLE OUTCOME. This check exits non-zero
// unless all eleven pass. It never stubs a step to green: `fail`, `blocked` and `not-implemented` are
// legitimate, useful results and are reported as such, because a green check that lied about the
// journey would defeat the only purpose this gate has.
//
// Evidence: .devshots/journey-textile/
//
// Instrumentation OBSERVES state/events and drives the public keyboard/mouse surface only. It emits
// no gameplay bus events, assigns no simulation fields, and uses no debug flags or query parameters.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rename, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { closeOwnedResources, createCanonicalUrlTracker, inspectCanonicalRootUrl } from './lib/alphaLiveBaselineContracts.mjs';
import { travelRouteFingerprint } from './lib/professionalTravelFingerprint.mjs';
import { bootToAuthoredFlight, TRAVEL_PUBLIC_HELPERS, repoRel } from './lib/professionalTravelPublicRoute.mjs';
import {
  JOURNEY_TEXTILE_SCHEMA,
  TASK_ID_JOURNEY_TEXTILE,
  JOURNEY_STEPS,
  runTextileJourney,
} from './lib/journeyTextileSteps.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { collectPageIssues } from './lib/browser-issues.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const OUT_ROOT = path.join(ROOT, '.devshots', 'journey-textile');
const ACCEPTED = path.join(OUT_ROOT, 'latest');
const STAGING = path.join(OUT_ROOT, `.tmp-journey-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`);
const LOG = [];
const log = (m) => {
  const line = `${new Date().toISOString()} ${m}`;
  LOG.push(line);
  console.log(`[journey-textile] ${m}`);
};

let ownedServer = null;
let browser = null;
let context = null;
let page = null;
let pageIssues = null;
let canonicalUrlTracker = null;
let journeyResult = null;
let startFp = null;
let cleanupReport = null;
let primaryError = null;
let bootSnapshot = null;

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
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: false,
    executablePath,
    args: [
      '--incognito', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--force-device-scale-factor=1',
    ],
  });
  context = await browser.newContext({
    viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'dark',
  });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);
  pageIssues = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });
  canonicalUrlTracker = createCanonicalUrlTracker(page, rootUrl);

  const nav = await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.bringToFront();
  assert(nav, 'navigation must return a response');
  assert.deepEqual(inspectCanonicalRootUrl(page.url(), rootUrl).failures, [], 'post-navigation left canonical root');

  bootSnapshot = await bootToAuthoredFlight({ page, outputDir: STAGING, log });

  journeyResult = await runTextileJourney({
    page,
    outputDir: STAGING,
    log,
    helpers: TRAVEL_PUBLIC_HELPERS,
  });
} catch (error) {
  primaryError = error;
  log(`ERROR ${error && error.message ? error.message : String(error)}`);
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(STAGING, 'failure-screenshot.png'), type: 'png', animations: 'allow' }).catch(() => {});
    await writeFile(
      path.join(STAGING, 'failure-report.json'),
      `${JSON.stringify({ message: error.message, stack: error.stack }, null, 2)}\n`,
      'utf8',
    ).catch(() => {});
  }
} finally {
  try {
    cleanupReport = await closeOwnedResources({ page, context, browser, server: ownedServer, canonicalUrlTracker });
  } catch (error) {
    cleanupReport = { pass: false, failures: [error.message || String(error)] };
    primaryError ||= error;
  }
}

// ── Evidence is written whether the journey passed or not ────────────────────────────────────────
// A failing journey's per-step record is the most valuable artifact this check produces, so it is
// never discarded on failure.
const runtimeErrors = pageIssues ? pageIssues.errorIssues() : [];
const steps = journeyResult ? journeyResult.steps : JOURNEY_STEPS.map((s) => ({
  id: s.id,
  title: s.title,
  outcome: 'blocked',
  evidence: `the journey never reached this step: ${primaryError ? primaryError.message : 'run did not start'}`,
}));

const evidence = {
  schema: JOURNEY_TEXTILE_SCHEMA,
  taskId: TASK_ID_JOURNEY_TEXTILE,
  generatedAt: new Date().toISOString(),
  pass: !!(journeyResult && journeyResult.pass)
    && !primaryError
    && runtimeErrors.length === 0
    && cleanupReport?.pass === true,
  runtimeKind: 'browser',
  inputSource: 'keyboard-mouse',
  injectedState: false,
  fingerprintId: startFp ? startFp.id : null,
  bootSnapshot: bootSnapshot ? {
    mode: bootSnapshot.mode, sectorId: bootSnapshot.sectorId, tick: bootSnapshot.tick,
    authoredReady: bootSnapshot.authored ? bootSnapshot.authored.ready : null,
  } : null,
  summary: journeyResult ? journeyResult.summary : null,
  steps,
  journey: journeyResult ? journeyResult.journey : null,
  runtimeErrors,
  cleanup: cleanupReport,
  error: primaryError ? { message: primaryError.message, stack: String(primaryError.stack || '').split('\n').slice(0, 8).join('\n') } : null,
};

await writeFile(path.join(STAGING, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8').catch(() => {});
await writeFile(path.join(STAGING, 'run.log'), `${LOG.join('\n')}\n`, 'utf8').catch(() => {});
const published = await publishEvidence(STAGING, ACCEPTED);

// ── Report ───────────────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('[journey-textile] ── 11-step acceptance journey ──');
for (const s of steps) {
  const badge = s.outcome === 'pass' ? 'PASS' : s.outcome === 'fail' ? 'FAIL'
    : s.outcome === 'blocked' ? 'BLOCKED' : 'NOT-IMPLEMENTED';
  console.log(`[journey-textile] ${badge.padEnd(15)} ${s.id} — ${String(s.evidence || '').slice(0, 220)}`);
}
if (evidence.summary) {
  const x = evidence.summary;
  console.log(`[journey-textile] ${x.passed}/${x.total} pass · ${x.failed} fail · ${x.blocked} blocked · ${x.notImplemented} not-implemented`);
}
console.log(`[journey-textile] evidence: ${repoRel(ROOT, path.join(published.dir, 'evidence.json'))}`);
if (!published.ok) console.log(`[journey-textile] note: evidence published in place (${published.reason})`);

if (!evidence.pass) {
  const why = primaryError ? primaryError.message
    : runtimeErrors.length ? `runtime errors: ${JSON.stringify(runtimeErrors).slice(0, 300)}`
      : cleanupReport?.pass !== true ? `cleanup failed: ${JSON.stringify(cleanupReport?.failures || [])}`
      : 'one or more journey steps did not pass';
  console.error(`[journey-textile] FAIL: ${why}`);
  process.exit(1);
}
console.log('[journey-textile] PASS');

/**
 * Publish the staging directory to the accepted path.
 *
 * The sibling travel check does `rename(STAGING, ACCEPTED)` bare, and on Windows that rename raises
 * EPERM whenever any handle is still open under the staging tree as the browser tears down — which
 * crashes the process AFTER a fully successful run and leaves an orphan `.tmp-*` directory behind.
 * Publishing evidence must never be able to fail a run whose journey succeeded, so this retries,
 * then falls back to a copy, then to reporting the staging path as the evidence location.
 */
async function publishEvidence(staging, accepted) {
  if (existsSync(accepted)) {
    await rename(accepted, path.join(OUT_ROOT, `latest-history-${Date.now()}`)).catch(() => {});
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(staging, accepted);
      return { ok: true, dir: accepted };
    } catch (error) {
      if (attempt === 4) {
        try {
          await cp(staging, accepted, { recursive: true });
          await rm(staging, { recursive: true, force: true }).catch(() => {});
          return { ok: true, dir: accepted };
        } catch (copyError) {
          return { ok: false, dir: staging, reason: `${error.code || error.message}; copy fallback: ${copyError.message}` };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  return { ok: false, dir: staging, reason: 'unreachable' };
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
      : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/microsoft-edge'];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}
