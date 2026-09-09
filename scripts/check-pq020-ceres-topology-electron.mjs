#!/usr/bin/env node
// PQ-020 Ceres functional route — ELECTRON half of the H1 acceptance cell.
//
// Run only after the broker-owned Browser half has closed and passed:
//
//   node scripts/check-pq020-ceres-topology-electron.mjs
//
// The Browser receipt is a launch prerequisite, not merely optional comparison data. Electron uses an
// isolated evidence profile, follows the normal about:blank -> canonical loopback-root bootstrap, and
// drives the same public route module. Runtime ids and numeric render details are deliberately absent
// from the parity projection; functional identities, owner terminal states, topology counts, save /
// Continue, and in-frame admitted Cathedral bands must agree.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
  createStrictElectronApplicationIssueTracker,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import { summarizeIssues } from './lib/browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  buildPq020ParityProjection,
  PQ020_FUNCTIONAL_SCREENSHOTS,
  readPq020FailureSnapshot,
  runPq020CeresFunctionalRoute,
} from './lib/pq020CeresFunctionalRoute.mjs';
import { PQ020_CERES_TOPOLOGY_FIXED_SEED } from './validation-manifests/pq020-ceres-topology.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_ROOT = path.join(ROOT, '.devshots', 'pq020-ceres-topology');
const ELECTRON_DIR = path.join(OUT_ROOT, 'electron');
const BROWSER_RECEIPT_PATH = path.join(OUT_ROOT, 'route-receipt.json');
const ELECTRON_RECEIPT_PATH = path.join(ELECTRON_DIR, 'route-receipt.json');

if (!existsSync(BROWSER_RECEIPT_PATH)) {
  console.error('[pq020-ceres-topology/electron] Browser receipt missing; run the broker cell first');
  process.exit(2);
}
const browserReceipt = JSON.parse(await readFile(BROWSER_RECEIPT_PATH, 'utf8'));
if (browserReceipt.disposition !== 'PASS') {
  console.error('[pq020-ceres-topology/electron] Browser route did not pass; Electron will not launch');
  process.exit(2);
}

await mkdir(ELECTRON_DIR, { recursive: true });

let app = null;
let childProcess = null;
let page = null;
let launch = null;
let canonicalUrlTracker = null;
let processMonitor = null;
let rootUrl = null;
let issueTracker = null;
let receipt = null;
const screenshots = [];

try {
  const { _electron: electron } = await loadPlaywright();
  launch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'pq020-ceres-topology' });
  app = await electron.launch(launch.options);
  childProcess = app.process();
  processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
  issueTracker = createStrictElectronApplicationIssueTracker(app);
  issueTracker.setPhase('electron-first-window');
  page = await app.firstWindow({ timeout: 90_000 });
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  await issueTracker.bindAndBackfillPage(page);
  issueTracker.setPhase('electron-canonical-root');
  rootUrl = await canonicalUrlTracker.waitForCanonicalRoot(10_000);
  rootUrl = assertIsolatedElectronRootUrl(rootUrl);
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  const screenshot = async (name) => {
    const record = await capturePng(page, name);
    screenshots.push(record);
    return record;
  };

  receipt = await runPq020CeresFunctionalRoute({
    page,
    rootUrl,
    outputDir: ELECTRON_DIR,
    runtimeLabel: 'electron',
    fixedSeed: PQ020_CERES_TOPOLOGY_FIXED_SEED,
    screenshot,
    pageIssueTracker: issueTracker,
    navigateInitialRoot: false,
  });
  receipt.screenshots = screenshots;
  receipt.expectedScreenshots = [...PQ020_FUNCTIONAL_SCREENSHOTS];
  receipt.pageIssues = summarizeIssues(issueTracker.errors());
  receipt.ignoredPageIssues = summarizeIssues(issueTracker.ignored());
  receipt.pageIssueDetails = issueTracker.errors();
  receipt.ignoredPageIssueDetails = issueTracker.ignored();
  if (receipt.pageIssues.length) {
    receipt.disposition = 'FAIL';
    receipt.failureClass = 'UNCLASSIFIED_BY_PROBE';
    receipt.problems.push(`the live Electron route emitted ${receipt.pageIssues.length} page issue(s)`);
  }

  const browserProjection = buildPq020ParityProjection(browserReceipt);
  const electronProjection = buildPq020ParityProjection(receipt);
  assert.deepEqual(electronProjection, browserProjection,
    'Electron and Browser must agree on normalized PQ-020 functional facts');
  receipt.crossRuntimeParity = {
    comparedAgainst: '.devshots/pq020-ceres-topology/route-receipt.json',
    pass: true,
    projection: electronProjection,
  };
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({
      path: path.join(ELECTRON_DIR, 'failure-row5-electron.png'),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
  }
  receipt = {
    schema: 'spaceface.pq020-ceres-functional-route.v1',
    runtime: 'electron',
    disposition: 'FAIL',
    failureClass: 'UNCLASSIFIED_BY_PROBE',
    phase: error?.routePhase || null,
    problems: [error?.message || String(error)],
    stack: error?.stack || null,
    fixedSeed: PQ020_CERES_TOPOLOGY_FIXED_SEED,
    screenshots,
    expectedScreenshots: [...PQ020_FUNCTIONAL_SCREENSHOTS],
    pageIssues: issueTracker ? summarizeIssues(issueTracker.errors()) : [],
    ignoredPageIssues: issueTracker ? summarizeIssues(issueTracker.ignored()) : [],
    pageIssueDetails: issueTracker ? issueTracker.errors() : [],
    ignoredPageIssueDetails: issueTracker ? issueTracker.ignored() : [],
    failureSnapshot: await readPq020FailureSnapshot(page),
    crossRuntimeParity: {
      comparedAgainst: '.devshots/pq020-ceres-topology/route-receipt.json',
      pass: false,
      browserProjection: buildPq020ParityProjection(browserReceipt),
    },
    noPerformanceEvidence: true,
    noPerformanceEvidenceNote:
      'The failure record contains functional simulation state only. Matched performance remains Phase H3.',
  };
} finally {
  let cleanupReport = null;
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
  if (cleanupReport?.pass !== true) {
    receipt ||= {
      schema: 'spaceface.pq020-ceres-functional-route.v1',
      runtime: 'electron',
      disposition: 'FAIL',
      problems: [],
      noPerformanceEvidence: true,
    };
    receipt.disposition = 'FAIL';
    receipt.failureClass ||= 'UNCLASSIFIED_BY_PROBE';
    receipt.problems ||= [];
    receipt.problems.push(`owned Electron cleanup failed: ${(cleanupReport?.failures || []).join('; ')}`);
    receipt.ownedRuntimeClosed = false;
  } else {
    receipt.ownedRuntimeClosed = true;
  }
  if (launch && cleanupReport?.pass === true) {
    try { launch.cleanup({ runtimeClosed: true }); }
    catch (error) {
      receipt.disposition = 'FAIL';
      receipt.failureClass ||= 'UNCLASSIFIED_BY_PROBE';
      receipt.problems.push(`isolated profile cleanup failed: ${error?.message || String(error)}`);
    }
  }
}

await writeFile(ELECTRON_RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

if (receipt.disposition !== 'PASS') {
  console.error(`[pq020-ceres-topology/electron] FAIL in ${receipt.phase || 'route contract'}`);
  for (const problem of receipt.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('[pq020-ceres-topology/electron] PASS — Electron matches the Browser functional route');
console.log('  receipt: .devshots/pq020-ceres-topology/electron/route-receipt.json');

async function capturePng(targetPage, name) {
  assert(PQ020_FUNCTIONAL_SCREENSHOTS.includes(name), `undeclared PQ-020 screenshot: ${name}`);
  const file = path.join(ELECTRON_DIR, name);
  await targetPage.screenshot({ path: file, type: 'png', animations: 'allow' });
  const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} must be a real PNG`);
  return {
    path: path.relative(ROOT, file).replace(/\\/g, '/'),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
