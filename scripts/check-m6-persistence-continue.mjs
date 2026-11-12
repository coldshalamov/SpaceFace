#!/usr/bin/env node
// M6 cold title-Continue persistence — public-input browser gate.
//
// Sequence:
//   acquireVisualProbeServer → headed Chrome → runBrowserPublicRoute (dock Helios)
//   → Missions tab → accept first enabled offer → undock → F5
//   → assert RAM ↔ sf.save.quick economy+mission
//   → page.reload → real title Continue → save:loaded + authored flight
//   → assert economy+mission+trackedMissionId
//
// Writes content-hashed evidence + screenshots under
//   .devshots/spec2/m6-persistence-continue-<stamp>/
//
// Constraints: no npm-script wiring, no game/render/settings changes, no injection.
// Run: node scripts/check-m6-persistence-continue.mjs

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeOwnedResources,
  createCanonicalUrlTracker,
  inspectCanonicalRootUrl,
} from './lib/alphaLiveBaselineContracts.mjs';
import { runBrowserPublicRoute } from './lib/alphaLiveBaselineRoute.mjs';
import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  M6_REQUIRED_MARKS,
  runM6PersistenceContinue,
  writeM6Evidence,
} from './lib/m6PersistenceContinue.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TASK_ID = 'm6-persistence-continue';
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const OUTPUT_ROOT = path.join(ROOT, '.devshots', 'spec2');

const logLines = [];
const log = (message) => {
  const line = `${new Date().toISOString()} ${message}`;
  logLines.push(line);
  console.log(`[m6-persist] ${message}`);
};

main().catch(async (error) => {
  console.error(`[m6-persist] FAIL ${error && error.stack || error}`);
  process.exitCode = 1;
});

async function main() {
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${randomBytes(4).toString('hex')}`;
  const outputDir = path.join(OUTPUT_ROOT, `${TASK_ID}-${stamp}`);
  await mkdir(outputDir, { recursive: true });

  let ownedServer = null;
  let browser = null;
  let context = null;
  let page = null;
  let pageIssueTracker = null;
  let canonicalUrlTracker = null;
  let cleanupReport = null;
  let routeResult = null;
  let persistResult = null;
  let primaryError = null;
  let executablePath = null;
  let browserVersion = null;

  try {
    ownedServer = await acquireVisualProbeServer({ root: ROOT });
    assert.equal(ownedServer.ownsServer, true, 'M6 check must own the canonical in-process server');
    const rootUrl = ownedServer.baseUrl;
    assert.equal(new URL(rootUrl).search, '', 'canonical root must have no query flags');
    log(`server ${rootUrl}`);

    executablePath = findSystemBrowser();
    assert(executablePath, 'headed system Chrome or Edge is required for M6 persistence evidence');
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
    browserVersion = browser.version();
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
    pageIssueTracker = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });
    canonicalUrlTracker = createCanonicalUrlTracker(page, rootUrl);

    const navigationResponse = await page.goto(rootUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.bringToFront();
    assert(navigationResponse, 'canonical root navigation must return an HTTP response');
    assert.deepEqual(
      inspectCanonicalRootUrl(page.url(), rootUrl).failures,
      [],
      'post-navigation URL left the canonical root',
    );

    routeResult = await runBrowserPublicRoute({
      page,
      outputDir,
      expectedRootUrl: rootUrl,
      log,
      flightTimeoutMs: 150_000,
      dockTimeoutMs: 90_000,
    });
    assert.equal(routeResult?.pass, true, 'public route must pass before M6 persistence sequence');

    persistResult = await runM6PersistenceContinue(page, {
      outputDir,
      expectedRootUrl: rootUrl,
      log,
      flightTimeoutMs: 150_000,
      saveTimeoutMs: 20_000,
    });
    assert.equal(persistResult.pass, true, 'M6 persistence sequence must pass');

    const runtimeErrors = pageIssueTracker.errorIssues();
    assert.deepEqual(
      runtimeErrors,
      [],
      `M6 path emitted runtime/page/request errors: ${JSON.stringify(runtimeErrors)}`,
    );
  } catch (error) {
    primaryError = error;
    if (page && !page.isClosed()) {
      await page.screenshot({
        path: path.join(outputDir, 'failure-screenshot.png'),
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
      log(`cleanup ${JSON.stringify({ pass: cleanupReport?.pass })}`);
    } catch (error) {
      cleanupReport = { pass: false, failures: [String(error && error.message || error)] };
      if (!primaryError) primaryError = error;
    }
    pageIssueTracker?.stop?.();
    await writeFile(path.join(outputDir, 'run.log'), `${logLines.join('\n')}\n`, 'utf8').catch(() => {});
  }

  const issues = pageIssueTracker?.errorIssues?.() || pageIssueTracker?.issues || [];
  const allIssues = Array.isArray(issues) ? issues : [];

  if (primaryError) {
    const failurePacket = {
      schema: 'spaceface.m6PersistenceContinue.v1',
      taskId: TASK_ID,
      generatedAt: new Date().toISOString(),
      pass: false,
      error: serializeError(primaryError),
      routeResult: routeResult
        ? { pass: routeResult.pass, steps: routeResult.steps?.map((s) => s.name) }
        : null,
      persistResult: persistResult
        ? { pass: persistResult.pass, markNames: persistResult.markNames }
        : null,
      pageIssues: allIssues,
      cleanup: cleanupReport,
    };
    await writeFile(
      path.join(outputDir, 'failure.json'),
      `${JSON.stringify(failurePacket, null, 2)}\n`,
      'utf8',
    ).catch(() => {});
    throw primaryError;
  }

  assert(cleanupReport?.pass !== false, 'owned cleanup must succeed');
  assert.deepEqual(allIssues, [], `zero issues required; got ${JSON.stringify(allIssues)}`);

  for (const required of M6_REQUIRED_MARKS) {
    assert.ok(
      persistResult.markNames.includes(required),
      `evidence missing required mark: ${required}`,
    );
  }

  const checks = [
    { name: 'public route docked', status: routeResult?.pass === true ? 'pass' : 'fail' },
    { name: 'cold title continue persistence', status: persistResult.pass ? 'pass' : 'fail' },
    { name: 'zero runtime errors', status: allIssues.length === 0 ? 'pass' : 'fail' },
    { name: 'owned cleanup', status: cleanupReport?.pass !== false ? 'pass' : 'fail' },
    {
      name: 'injectedState false',
      status: persistResult.injectedState === false ? 'pass' : 'fail',
    },
    {
      name: 'keyboard-mouse input',
      status: persistResult.inputSource === 'keyboard-mouse' ? 'pass' : 'fail',
    },
  ];

  const evidence = {
    schema: 'spaceface.m6PersistenceContinue.v1',
    taskId: TASK_ID,
    generatedAt: new Date().toISOString(),
    pass: true,
    inputSource: 'keyboard-mouse',
    injectedState: false,
    marks: persistResult.marks,
    markNames: persistResult.markNames,
    preSave: persistResult.preSave,
    envelope: persistResult.envelope,
    postContinue: persistResult.postContinue,
    urlChecks: [
      ...(routeResult.urlChecks || []),
      ...(persistResult.urlChecks || []),
    ],
    route: {
      pass: routeResult.pass,
      steps: (routeResult.steps || []).map((step) => step.name),
      screenshots: routeResult.screenshots || [],
    },
    checks,
    errors: { pageIssues: allIssues },
    cleanup: cleanupReport,
    browser: {
      executablePath,
      version: browserVersion,
      headed: true,
      viewport: VIEWPORT,
    },
  };

  const written = await writeM6Evidence({
    root: ROOT,
    outputDir,
    evidence,
    screenshots: [
      ...(routeResult.screenshots || []),
      ...(persistResult.screenshots || []),
    ].filter((name) => existsSync(path.join(outputDir, name))),
  });

  const relativeOut = path.relative(ROOT, outputDir).replace(/\\/g, '/');
  const relativeReport = path.relative(ROOT, written.reportPath).replace(/\\/g, '/');
  log(`PASS ${relativeReport} contentHash=${written.contentHash.slice(0, 16)}…`);
  console.log(JSON.stringify({
    pass: true,
    outputDir: relativeOut,
    report: relativeReport,
    contentHash: written.contentHash,
    reportSha256: written.reportSha256,
    markNames: persistResult.markNames,
    missionId: persistResult.postContinue?.mission?.id ?? null,
    credits: persistResult.postContinue?.economy?.credits ?? null,
    screenshots: written.screenshots.map((s) => s.name),
  }));
}

function findSystemBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean).find((candidate) => existsSync(candidate)) || null;
}

function serializeError(error) {
  if (!error) return null;
  return {
    message: String(error.message || error),
    stack: error.stack || null,
    routePhase: error.routePhase || null,
  };
}
