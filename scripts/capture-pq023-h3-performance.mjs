#!/usr/bin/env node

// PQ-023 H3 — one brokered target-profile Browser cell. Every repetition starts from the accepted
// fixed-seed authored flight route, samples its ordinary ambient VFX floor, then sustains the
// accepted dense destruction/connected-beam composition in the same context without changing quality
// or pools.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  attachPq023SeparatedGpuAttribution,
  beginPq023Floor,
  bootPq023DensePerformanceRoute,
  cleanupPq023DensePerformanceScenario,
  installPq023DensePerformanceScenario,
  PQ023_H3_DENSE_SOURCE,
  prewarmPq023DenseScenario,
  readPq023DensePerformanceFacts,
  readPq023GpuContract,
  startPq023DenseTarget,
} from './lib/pq023DensePerformanceScenario.mjs';
import {
  PQ023_H3_PIPELINE_SETTLE_TIMEOUT_MS,
  PQ023_H3_PROFILE_IDS,
  PQ023_H3_RECEIPT_SCHEMA,
  PQ023_H3_REPETITIONS,
  validatePq023H3PerformanceReceipt,
} from './lib/pq023H3Performance.mjs';
import { sampleRafWindow } from './lib/releaseSoakProbe.mjs';
import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import manifest, {
  createPq023H3PerformanceManifest,
  PQ023_H3_FIXED_SEED,
  PQ023_H3_VIEWPORT,
} from './validation-manifests/pq023-h3-performance.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_ROOT = path.resolve(ROOT, manifest.artifactRoot);
const RECEIPT_PATH = path.join(ARTIFACT_ROOT, 'performance-receipt.json');
const DIAGNOSTIC = process.argv.includes('--diagnostic');
const FIXED_SEED = Number(process.env.SF_PROBE_SEED) > 0
  ? Number(process.env.SF_PROBE_SEED)
  : PQ023_H3_FIXED_SEED;

const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest: createPq023H3PerformanceManifest(),
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[pq023-h3-performance] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error('[pq023-h3-performance] invoke via: node scripts/validation-broker-cli.mjs --manifest pq023-h3-performance');
  console.error('[pq023-h3-performance] or pass --diagnostic for non-promoting local inspection');
  process.exit(2);
}

await mkdir(ARTIFACT_ROOT, { recursive: true });

let server = null;
let browser = null;
let activePage = null;
let activePhase = 'bootstrap';
let receipt = null;
let gpu = null;
let browserClosed = false;
let serverClosed = false;
const completed = [];

try {
  server = await acquireVisualProbeServer({ root: ROOT });
  const executablePath = findSystemBrowser();
  assert(executablePath, 'headed Chrome or Edge is required for PQ-023 H3 acceptance');
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
      `--window-size=${PQ023_H3_VIEWPORT.width},${PQ023_H3_VIEWPORT.height}`,
      '--force-device-scale-factor=1',
    ],
  });

  const pairs = [];
  for (let repetition = 1; repetition <= PQ023_H3_REPETITIONS; repetition += 1) {
    activePhase = `pq023-h3-pair-${repetition}`;
    const context = await browser.newContext({
      viewport: { width: PQ023_H3_VIEWPORT.width, height: PQ023_H3_VIEWPORT.height },
      screen: { width: PQ023_H3_VIEWPORT.width, height: PQ023_H3_VIEWPORT.height },
      deviceScaleFactor: PQ023_H3_VIEWPORT.deviceScaleFactor,
      locale: 'en-US',
      colorScheme: 'dark',
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);
    const issueTracker = collectPageIssues(page, { includeWarnings: false });
    const screenshots = [];
    const screenshot = async (name) => {
      const record = await capturePng(page, name);
      screenshots.push(record);
      return record;
    };

    try {
      const pair = await runPq023H3PerformancePair({
        page,
        rootUrl: server.baseUrl,
        repetition,
        screenshot,
      });
      const pageIssues = issueTracker.errorIssues();
      assert.deepEqual(pageIssues, [], `pair ${repetition}: the live route emitted page errors`);
      pair.pageIssues = pageIssues;
      pair.screenshots = screenshots;
      pairs.push(pair);
      completed.push({ repetition, pairId: pair.route.pairId, pageIssues, screenshots });
    } catch (error) {
      await page.screenshot({
        path: path.join(ARTIFACT_ROOT, `failure-pair-${repetition}.png`),
        type: 'png',
        animations: 'allow',
      }).catch(() => {});
      error.routePhase ||= activePhase;
      throw error;
    } finally {
      activePage = null;
      await context.close().catch(() => {});
    }
  }

  receipt = {
    schema: PQ023_H3_RECEIPT_SCHEMA,
    disposition: 'PASS',
    fixedSeed: FIXED_SEED,
    viewport: { ...PQ023_H3_VIEWPORT },
    runtime: 'browser-chromium-headed',
    gpu,
    qualityPreserving: {
      settingsOverridesApplied: false,
      defaultQualityRetained: true,
      performanceImprovementClaimed: false,
      absoluteTargetClaimed: false,
      absoluteBudgetWaiverGranted: false,
    },
    broker: {
      reason: brokerGate.reason,
      diagnostic: !!brokerGate.diagnostic,
      primaryAcceptance: !!brokerGate.primaryAcceptance,
      claimId: brokerGate.claim?.claimId || brokerGate.claim?.id || null,
    },
    route: {
      pairCount: pairs.length,
      declaredRoute:
        'fixed-seed New Game -> authored Helios flight -> accepted live-hardpoint target floor '
        + '-> sustained accepted PQ-023 dense destruction/connected-beam target in the same context',
      retainedEvidenceReferences: [
        'design/program/roadmap/receipts/PQ-023-cues-h1-capture-REPORT.md',
        'design/program/roadmap/receipts/PQ-023-h2-cue-motion-accessibility-REPORT.md',
        'design/program/roadmap/receipts/PQ-023-combat-readability-review-REPORT.md',
        'design/program/roadmap/receipts/PQ-023-small-destruction-salience-review-REPORT.md',
      ],
      pairs: pairs.map((pair) => pair.route),
    },
    profiles: [
      { id: PQ023_H3_PROFILE_IDS[0], repetitions: pairs.map((pair) => pair.floor) },
      { id: PQ023_H3_PROFILE_IDS[1], repetitions: pairs.map((pair) => pair.target) },
    ],
    pageIssues: pairs.flatMap((pair) => pair.pageIssues),
    screenshots: pairs.flatMap((pair) => pair.screenshots),
    cleanup: { browserClosed: false, serverClosed: false },
  };
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({
      path: path.join(ARTIFACT_ROOT, 'failure-active.png'),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
  }
  receipt = {
    schema: PQ023_H3_RECEIPT_SCHEMA,
    runtime: 'browser-chromium-headed',
    disposition: 'FAIL',
    failureClass: 'UNCLASSIFIED_BY_PROBE',
    phase: error?.routePhase || activePhase,
    problems: [error?.message || String(error)],
    stack: error?.stack || null,
    fixedSeed: FIXED_SEED,
    gpu,
    completed,
    broker: {
      reason: brokerGate.reason,
      diagnostic: !!brokerGate.diagnostic,
      primaryAcceptance: !!brokerGate.primaryAcceptance,
      claimId: brokerGate.claim?.claimId || brokerGate.claim?.id || null,
    },
  };
} finally {
  if (browser) {
    try { await browser.close(); browserClosed = true; } catch (_) { browserClosed = false; }
  } else browserClosed = true;
  if (server) {
    try { await server.close(); serverClosed = true; } catch (_) { serverClosed = false; }
  } else serverClosed = true;
}

receipt.cleanup = { browserClosed, serverClosed };
if (receipt.disposition === 'PASS') {
  const validation = validatePq023H3PerformanceReceipt(receipt);
  receipt.validation = validation;
  if (!validation.pass) {
    receipt.disposition = 'FAIL';
    receipt.problems = [...new Set([...(receipt.problems || []), ...validation.failures])];
  }
}

await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

if (receipt.disposition !== 'PASS') {
  console.error(`[pq023-h3-performance] FAIL in ${receipt.phase || 'validation'}`);
  for (const problem of receipt.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('[pq023-h3-performance] PASS — three matched authored-flight and dense-cue windows');
if (receipt.validation?.absoluteBudget?.pass !== true) {
  console.log('[pq023-h3-performance] ABSOLUTE TARGET OPEN — matched feature result passes without a target waiver');
}
console.log(`  receipt: ${repoRel(RECEIPT_PATH)}`);

async function runPq023H3PerformancePair({ page, rootUrl, repetition, screenshot }) {
  const pairId = `pq023-h3-pair-${repetition}`;
  const boot = await bootPq023DensePerformanceRoute(page, rootUrl, FIXED_SEED);
  assert.equal(boot.recordedSeed, FIXED_SEED, `pair ${repetition}: fixed seed differs after New Game`);
  assert.equal(boot.sectorId, 'sector_helios_prime', `pair ${repetition}: route must start in Helios`);

  const pairGpu = await readPq023GpuContract(page);
  assert.equal(pairGpu.available, true, `pair ${repetition}: WebGL must be available`);
  assert.doesNotMatch(pairGpu.renderer || '', /SwiftShader|llvmpipe|software/i,
    `pair ${repetition}: acceptance requires a real GPU path, got ${pairGpu.renderer}`);
  if (!gpu) gpu = pairGpu;
  else assert.equal(pairGpu.renderer, gpu.renderer, `pair ${repetition}: GPU renderer changed`);

  await installPq023DensePerformanceScenario(page);
  const preflight = await prewarmPq023DenseScenario(page);
  await beginPq023Floor(page);
  const floorWindow = await sampleRafWindow(page, {
    phaseTag: 'flight_steady',
    warmupMs: 2_000,
    pipelineStableMs: 5_000,
    pipelineSettleTimeoutMs: PQ023_H3_PIPELINE_SETTLE_TIMEOUT_MS,
    sampleMs: 5_000,
    enableGpuTimers: false,
    requireAuthoredFlight: true,
    requireDocked: false,
  });
  await attachPq023SeparatedGpuAttribution(page, floorWindow);
  const floorFacts = await readPq023DensePerformanceFacts(page, {
    profileId: PQ023_H3_PROFILE_IDS[0], repetition, pairId,
  });
  await screenshot(`pair-${repetition}-authored-helios-flight-floor.png`);

  await startPq023DenseTarget(page);
  const targetWindow = await sampleRafWindow(page, {
    phaseTag: 'flight_steady',
    warmupMs: 2_000,
    pipelineStableMs: 5_000,
    pipelineSettleTimeoutMs: PQ023_H3_PIPELINE_SETTLE_TIMEOUT_MS,
    sampleMs: 5_000,
    enableGpuTimers: false,
    requireAuthoredFlight: true,
    requireDocked: false,
  });
  await attachPq023SeparatedGpuAttribution(page, targetWindow);
  const targetFacts = await readPq023DensePerformanceFacts(page, {
    profileId: PQ023_H3_PROFILE_IDS[1], repetition, pairId,
  });
  await screenshot(`pair-${repetition}-dense-cue-target.png`);
  const cleanup = await cleanupPq023DensePerformanceScenario(page);

  return {
    route: {
      pairId,
      repetition,
      sameContext: true,
      source: PQ023_H3_DENSE_SOURCE,
      preflight,
      recordedSeed: boot.recordedSeed,
      sectorId: boot.sectorId,
      cleanup,
      declaredCompressions: [
        'retained H1 owns Browser/Electron cue identity, motion, accessibility, and visual judgment',
        'H3 reuses the accepted live-hardpoint target and dense composition without replaying H1 captures',
      ],
    },
    floor: {
      index: repetition,
      routeFacts: floorFacts,
      rawSamples: floorWindow.samples,
      attribution: floorWindow.attribution,
    },
    target: {
      index: repetition,
      routeFacts: targetFacts,
      rawSamples: targetWindow.samples,
      attribution: targetWindow.attribution,
    },
  };
}

async function capturePng(page, name) {
  const fullPath = path.join(ARTIFACT_ROOT, name);
  await page.screenshot({ path: fullPath, type: 'png', animations: 'allow' });
  const bytes = await readFile(fullPath);
  return {
    path: repoRel(fullPath),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function findSystemBrowser() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function repoRel(value) {
  return path.relative(ROOT, value).replaceAll('\\', '/');
}
