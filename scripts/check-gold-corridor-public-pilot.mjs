#!/usr/bin/env node
// GOLD-CORRIDOR-PUBLIC-PILOT — headed Browser diagnosis driver.
//
// Usage:
//   node scripts/check-gold-corridor-public-pilot.mjs --career=hauler --stop=first-station
//
// This is a DIAGNOSIS harness, not a green-only gate. It starts from the title route, drives the
// game with public input only, and emits a JSON receipt with build identity, input actions,
// semantic milestones, the classified blocker (if any), the save slot, page/console errors, and
// artifact paths. A route that cannot reach a milestone still exits with an EXACT semantic blocker
// and a clean teardown — that is a successful harness run of a failing route.
//
// Evidence: .devshots/gold-corridor/<career>-<stop>/
// Shared pilot core: scripts/lib/goldCorridorPublicPilot.mjs

import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  closeOwnedResources,
  createCanonicalUrlTracker,
  worktreeFingerprint,
} from './lib/alphaLiveBaselineContracts.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { collectPageIssues } from './lib/browser-issues.mjs';
import {
  GOLD_CORRIDOR_ARTIFACT_ROOT,
  GOLD_CORRIDOR_TASK_ID,
  buildCleanupReceipt,
  buildPilotReceipt,
  buildRouteIdentity,
  classifyStall,
  markCleanTeardown,
  parsePilotArgv,
  repoRel,
  runGoldCorridorPublicPilot,
} from './lib/goldCorridorPublicPilot.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });

const options = parsePilotArgv(process.argv.slice(2));
if (!options.ok) {
  for (const error of options.errors) console.error(`[gold-corridor] ${error}`);
  process.exit(2);
}

const OUT_ROOT = path.join(ROOT, ...GOLD_CORRIDOR_ARTIFACT_ROOT.split('/'));
const ACCEPTED = path.join(OUT_ROOT, `${options.career}-${options.stop}`);
const STAGING = path.join(
  OUT_ROOT,
  `.tmp-${options.career}-${options.stop}-${process.pid}-${randomBytes(4).toString('hex')}`,
);

const LOG = [];
const log = (message) => {
  LOG.push(`${new Date().toISOString()} ${message}`);
  console.log(`[gold-corridor] ${message}`);
};

let ownedServer = null;
let browser = null;
let context = null;
let page = null;
let pageIssues = null;
let canonicalUrlTracker = null;
let pilotResult = null;
let identity = null;
let rawCleanup = null;
let cleanupReceipt = null;
let harnessError = null;

await mkdir(STAGING, { recursive: true });

try {
  const fingerprint = await worktreeFingerprint(ROOT).catch(() => null);
  ownedServer = await acquireVisualProbeServer({ root: ROOT });
  const rootUrl = ownedServer.baseUrl;
  log(`server ${rootUrl}`);

  const executablePath = findSystemBrowser();
  if (!executablePath) throw new Error('headed Chrome/Edge is required for the gold corridor pilot');
  log(`browser ${executablePath}`);

  identity = buildRouteIdentity({
    fingerprint,
    rootUrl,
    career: options.career,
    stop: options.stop,
    runtimeKind: 'browser',
    nodeVersion: process.version,
    platform: process.platform,
    browserExecutable: executablePath,
  });
  log(`identity ${identity.worktree.id || 'unknown'} career=${options.career} stop=${options.stop}`);

  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: options.headless,
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
  pageIssues = collectPageIssues(page, { includeWarnings: false, ignoreProbeWarnings: true });
  canonicalUrlTracker = createCanonicalUrlTracker(page, rootUrl);

  await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.bringToFront().catch(() => {});

  pilotResult = await runGoldCorridorPublicPilot({
    page,
    outputDir: STAGING,
    expectedRootUrl: rootUrl,
    career: options.career,
    stop: options.stop,
    timeoutScale: options.timeoutScale,
    log,
  });
} catch (error) {
  harnessError = error;
  log(`harness error: ${error?.message || error}`);
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(STAGING, 'harness-failure.png'), type: 'png' })
      .catch(() => {});
  }
} finally {
  try {
    rawCleanup = await closeOwnedResources({
      page,
      context,
      browser,
      server: ownedServer,
      canonicalUrlTracker,
    });
  } catch (error) {
    rawCleanup = error?.cleanupReport || { failures: [{ name: 'cleanup', error: { message: error?.message || String(error) } }] };
    log(`cleanup error: ${error?.message || error}`);
  }
  cleanupReceipt = buildCleanupReceipt(rawCleanup);
  if (cleanupReceipt.pass && pilotResult) markCleanTeardown(pilotResult, cleanupReceipt);
  log(`cleanup ${cleanupReceipt.pass ? 'OK' : `FAILED: ${cleanupReceipt.leakedResources.join(', ') || cleanupReceipt.failures.join('; ')}`}`);
}

const issues = pageIssues ? pageIssues.errorIssues() : [];
const consoleErrors = issues.filter((issue) => issue.type === 'console').map(describeIssue);
const pageErrors = issues.filter((issue) => issue.type !== 'console').map(describeIssue);

let classification = pilotResult?.classification || null;
if (!classification && harnessError) {
  classification = classifyStall({
    milestones: pilotResult?.milestones || [],
    stop: options.stop,
    cause: 'harness-error',
    message: harnessError?.message || String(harnessError),
  });
}
if (!classification && !cleanupReceipt.pass) {
  classification = classifyStall({
    milestones: pilotResult?.milestones || [],
    stop: options.stop,
    blockedMilestone: 'clean-teardown',
    cause: 'cleanup',
    message: cleanupReceipt.failures.join('; ') || `leaked: ${cleanupReceipt.leakedResources.join(', ')}`,
  });
}

const acceptedRel = `${GOLD_CORRIDOR_ARTIFACT_ROOT}/${options.career}-${options.stop}`;
const artifacts = [
  ...(pilotResult?.screenshots || []).map((name) => `${acceptedRel}/${name}`),
  `${acceptedRel}/receipt.json`,
  `${acceptedRel}/run.log`,
];

const receipt = buildPilotReceipt({
  identity,
  milestones: pilotResult?.milestones || [],
  actions: pilotResult?.actions || [],
  classification,
  consoleErrors,
  pageErrors,
  cleanup: rawCleanup,
  artifacts,
  generatedAt: new Date().toISOString(),
  saveSlot: pilotResult?.saveSlot || null,
});

await writeFile(path.join(STAGING, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
await writeFile(path.join(STAGING, 'run.log'), `${LOG.join('\n')}\n`, 'utf8');

if (existsSync(ACCEPTED)) await rm(ACCEPTED, { recursive: true, force: true }).catch(() => {});
await rename(STAGING, ACCEPTED).catch(async (error) => {
  log(`could not publish evidence: ${error?.message || error}`);
});

console.log(`[gold-corridor] receipt: ${repoRel(ROOT, path.join(ACCEPTED, 'receipt.json'))}`);
console.log(`[gold-corridor] milestones reached: ${receipt.milestones.map((m) => m.id).join(' -> ') || '(none)'}`);
console.log(`[gold-corridor] cleanup: ${receipt.cleanup.pass ? 'clean' : 'LEAKED'}`);

if (receipt.pass) {
  console.log('[gold-corridor] PASS — full corridor reached with no outstanding milestone');
  process.exit(0);
}

console.error(`[gold-corridor] ${classification?.blocker || 'GOLD-CORRIDOR-BLOCKER milestone=unknown cause=unknown'}`);
console.error(`[gold-corridor] failure stage: ${receipt.failureStage || 'unknown'}`);
process.exit(1);

function describeIssue(issue) {
  return {
    type: String(issue?.type || ''),
    text: String(issue?.text || issue?.message || '').slice(0, 500),
    location: issue?.location ? String(issue.location) : null,
  };
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
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
