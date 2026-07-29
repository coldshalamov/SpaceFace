#!/usr/bin/env node
// PQ-020 Ceres functional route — broker-authorized headed Browser acceptance.
//
// The shared route drives visible New Game, the public galaxy-map controls, production jump and
// local-autopilot owners, F5, reload, and visible Continue. It never calls world.enterSector, emits
// gameplay intents directly, assigns player/sector/camera state, or creates a flattering fixture.
//
// One headed system-Chrome process owns the entire Browser half. This is H1 functional evidence only:
// state, DOM semantics, counts, admission booleans, coordinates, and screenshot hashes. Matched
// performance remains Phase H3 and no performance sample is created here.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  PQ020_FUNCTIONAL_SCREENSHOTS,
  readPq020FailureSnapshot,
  runPq020CeresFunctionalRoute,
} from './lib/pq020CeresFunctionalRoute.mjs';
import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import manifest, {
  createPq020CeresTopologyManifest,
  PQ020_CERES_TOPOLOGY_FIXED_SEED,
} from './validation-manifests/pq020-ceres-topology.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_ROOT = path.join(ROOT, '.devshots', 'pq020-ceres-topology');
const VIEWPORT = Object.freeze({ width: 1460, height: 900 });
const DIAGNOSTIC = process.argv.includes('--diagnostic');
const FIXED_SEED = Number(process.env.SF_PROBE_SEED) > 0
  ? Number(process.env.SF_PROBE_SEED)
  : PQ020_CERES_TOPOLOGY_FIXED_SEED;

const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest: createPq020CeresTopologyManifest(),
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[pq020-ceres-topology] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error('[pq020-ceres-topology] invoke via: node scripts/validation-broker-cli.mjs --manifest pq020-ceres-topology');
  console.error('[pq020-ceres-topology] or pass --diagnostic for non-promoting local inspection');
  process.exit(2);
}

await mkdir(ARTIFACT_ROOT, { recursive: true });

let server = null;
let browser = null;
let page = null;
let receipt = null;
let issueTracker = null;
const screenshots = [];

try {
  server = await acquireVisualProbeServer({ root: ROOT });
  const executablePath = findSystemBrowser();
  assert(executablePath, 'headed Chrome or Edge is required for PQ-020 acceptance');
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: false,
    executablePath,
    args: [
      '--incognito',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--force-device-scale-factor=1',
    ],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  issueTracker = collectPageIssues(page, { includeWarnings: false });

  const screenshot = async (name) => {
    const record = await capturePng(page, name);
    screenshots.push(record);
    return record;
  };

  receipt = await runPq020CeresFunctionalRoute({
    page,
    rootUrl: server.baseUrl,
    outputDir: ARTIFACT_ROOT,
    runtimeLabel: 'browser-chromium-headed',
    fixedSeed: FIXED_SEED,
    screenshot,
  });
  receipt.brokerManifestId = manifest.id;
  receipt.launchContract = 'one headed system-Browser process; one route; Electron runs only after Browser closes';
  receipt.screenshots = screenshots;
  receipt.expectedScreenshots = [...PQ020_FUNCTIONAL_SCREENSHOTS];
  receipt.pageIssues = summarizeIssues(issueTracker.errorIssues());
  if (receipt.pageIssues.length) {
    receipt.disposition = 'FAIL';
    receipt.failureClass = 'UNCLASSIFIED_BY_PROBE';
    receipt.problems.push(`the live route emitted ${receipt.pageIssues.length} page issue(s)`);
  }
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({
      path: path.join(ARTIFACT_ROOT, 'failure-row5.png'),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
  }
  receipt = {
    schema: 'spaceface.pq020-ceres-functional-route.v1',
    runtime: 'browser-chromium-headed',
    disposition: 'FAIL',
    failureClass: 'UNCLASSIFIED_BY_PROBE',
    phase: error?.routePhase || null,
    problems: [error?.message || String(error)],
    stack: error?.stack || null,
    fixedSeed: FIXED_SEED,
    brokerManifestId: manifest.id,
    screenshots,
    expectedScreenshots: [...PQ020_FUNCTIONAL_SCREENSHOTS],
    pageIssues: issueTracker ? summarizeIssues(issueTracker.errorIssues()) : [],
    failureSnapshot: await readPq020FailureSnapshot(page),
    noPerformanceEvidence: true,
    noPerformanceEvidenceNote:
      'The failure record contains functional simulation state only. Matched performance remains Phase H3.',
  };
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}

await writeFile(path.join(ARTIFACT_ROOT, 'route-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

if (receipt.disposition !== 'PASS') {
  console.error(`[pq020-ceres-topology] FAIL in ${receipt.phase || 'route contract'}`);
  for (const problem of receipt.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('[pq020-ceres-topology] PASS — Browser public route crossed both Ceres endpoint directions');
console.log(`  receipt: ${repoRel(path.join(ARTIFACT_ROOT, 'route-receipt.json'))}`);

async function capturePng(targetPage, name) {
  assert(PQ020_FUNCTIONAL_SCREENSHOTS.includes(name), `undeclared PQ-020 screenshot: ${name}`);
  const file = path.join(ARTIFACT_ROOT, name);
  await targetPage.screenshot({ path: file, type: 'png', animations: 'allow' });
  const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} must be a real PNG`);
  return {
    path: repoRel(file),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function repoRel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
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
