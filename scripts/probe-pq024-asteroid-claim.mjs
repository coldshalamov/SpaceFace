#!/usr/bin/env node
// PQ-024 default-route asteroid claim acceptance.
//
// Run only through the validation broker:
//   node scripts/validation-broker-cli.mjs --manifest pq024-asteroid-claim
//
// The actor uses shipped DOM/pointer/keyboard controls. Page observers choose a rendered map dot,
// read placement validity, and collect system receipts; they never write cargo, survey, producing,
// site, or exterior state. Default and Electron modes produce functional H1 evidence; the explicit
// H3 mode measures a matched Core-only/producing-relay pair without replacing that retained H1.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  PQ024_H3_PIPELINE_SETTLE_TIMEOUT_MS,
  PQ024_H3_PROFILE_IDS,
  PQ024_H3_RECEIPT_SCHEMA,
  PQ024_H3_REPETITIONS,
  validatePq024H3PerformanceReceipt,
} from './lib/pq024H3Performance.mjs';
import {
  formatPq024DockApproachTimeout,
  formatPq024MasslineLatchTimeout,
  formatPq024MasslineReleaseTimeout,
  observePq024DockPrompt,
  projectPq024RouteSemantics,
} from './lib/pq024AsteroidClaimParity.mjs';
import {
  assessPq024CommittedElectronPrelaunch,
  assessPq024CommittedPresentation,
  assessPq024CommittedTransitionReceipt,
  PQ024_COMMITTED_TRANSITION_ROUTE_SCHEMA,
  projectPq024CommittedIdentityDigests,
} from './lib/pq024CommittedPresentation.mjs';
import { sampleRafWindow } from './lib/releaseSoakProbe.mjs';
import {
  computeGateDigestsFromManifest,
  requireBrokerClaimOrDiagnostic,
} from './lib/validationBroker.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import manifest, {
  createPq024AsteroidClaimManifest,
  PQ024_ASTEROID_CLAIM_FIXED_SEED,
} from './validation-manifests/pq024-asteroid-claim.mjs';
import h3Manifest, {
  createPq024H3PerformanceManifest,
  PQ024_H3_VIEWPORT,
} from './validation-manifests/pq024-h3-performance.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ELECTRON_PARITY = process.argv.includes('--electron-parity');
const H3_PERFORMANCE = process.argv.includes('--h3-performance');
const COMMITTED_TRANSITION = process.argv.includes('--committed-transition');
assert(!(ELECTRON_PARITY && H3_PERFORMANCE), 'PQ-024 H3 is Browser-only and cannot run as Electron parity');
assert(!(COMMITTED_TRANSITION && H3_PERFORMANCE),
  'PQ-024 committed transition and H3 performance are distinct broker cells');
const committedManifestModule = COMMITTED_TRANSITION
  ? await import('./validation-manifests/pq024-committed-transition.mjs')
  : null;
const committedManifest = committedManifestModule?.default || null;
const BASE_ARTIFACT_ROOT = path.join(ROOT, '.devshots', 'pq024-asteroid-claim');
const COMMITTED_ARTIFACT_ROOT = COMMITTED_TRANSITION
  ? path.resolve(ROOT, committedManifest.artifactRoot)
  : null;
const ACTIVE_ROUTE_ARTIFACT_ROOT = COMMITTED_ARTIFACT_ROOT || BASE_ARTIFACT_ROOT;
const ARTIFACT_ROOT = H3_PERFORMANCE
  ? path.resolve(ROOT, h3Manifest.artifactRoot)
  : ELECTRON_PARITY
    ? path.join(ACTIVE_ROUTE_ARTIFACT_ROOT, 'electron')
    : ACTIVE_ROUTE_ARTIFACT_ROOT;
const BROWSER_RECEIPT_PATH = path.join(
  ACTIVE_ROUTE_ARTIFACT_ROOT,
  COMMITTED_TRANSITION ? 'committed-transition-receipt.json' : 'route-receipt.json',
);
const RECEIPT_PATH = path.join(
  ARTIFACT_ROOT,
  H3_PERFORMANCE
    ? 'performance-receipt.json'
    : COMMITTED_TRANSITION
      ? 'committed-transition-receipt.json'
      : 'route-receipt.json',
);
const VIEWPORT = H3_PERFORMANCE
  ? PQ024_H3_VIEWPORT
  : Object.freeze({ width: 1460, height: 900, deviceScaleFactor: 1 });
const DIAGNOSTIC = process.argv.includes('--diagnostic');
const FIXED_SEED = Number(process.env.SF_PROBE_SEED) > 0
  ? Number(process.env.SF_PROBE_SEED)
  : COMMITTED_TRANSITION
    ? Number(committedManifest.fixedSeed)
    : PQ024_ASTEROID_CLAIM_FIXED_SEED;
const ROUTE_SCREENSHOTS = Object.freeze([
  '01-market-materials.png',
  '02-survey-reveal.png',
  '03-core-committed.png',
  '04-producing-relay.png',
  '05-continue-reentered.png',
]);
const COMMITTED_TRANSITION_SCREENSHOTS = Object.freeze(['03-core-committed.png']);
const SCREENSHOTS = COMMITTED_TRANSITION
  ? COMMITTED_TRANSITION_SCREENSHOTS
  : ROUTE_SCREENSHOTS;

const brokerGate = ELECTRON_PARITY ? { ok: true } : await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest: H3_PERFORMANCE
    ? createPq024H3PerformanceManifest()
    : COMMITTED_TRANSITION
      ? committedManifestModule.createPq024CommittedTransitionManifest()
      : createPq024AsteroidClaimManifest(),
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  const id = H3_PERFORMANCE
    ? 'pq024-h3-performance'
    : COMMITTED_TRANSITION
      ? 'pq024-committed-transition'
      : 'pq024-asteroid-claim';
  console.error(`[${id}] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error(`[${id}] invoke via: node scripts/validation-broker-cli.mjs --manifest ${id}`);
  console.error(`[${id}] or pass --diagnostic for non-promoting inspection`);
  process.exit(2);
}

await mkdir(ARTIFACT_ROOT, { recursive: true });

let server = null;
let browser = null;
let electronApp = null;
let electronChildProcess = null;
let electronLaunch = null;
let electronUrlTracker = null;
let electronProcessMonitor = null;
let page = null;
let issueTracker = null;
let receipt = null;
let browserReceipt = null;
let browserCommittedPrelaunch = null;
let rootUrl = null;
let browserClosed = false;
let serverClosed = false;
let activePhase = 'bootstrap';
let h3Gpu = null;
const h3Completed = [];
const screenshots = [];

try {
  if (ELECTRON_PARITY) {
    browserReceipt = JSON.parse(await readFile(BROWSER_RECEIPT_PATH, 'utf8'));
    if (COMMITTED_TRANSITION) {
      const currentDigests = await computeGateDigestsFromManifest({
        root: ROOT,
        manifest: committedManifestModule.createPq024CommittedTransitionManifest(),
      });
      browserCommittedPrelaunch = assessPq024CommittedElectronPrelaunch(browserReceipt, {
        expectedFixedSeed: committedManifest.fixedSeed,
        expectedManifestId: committedManifest.id,
        currentDigests,
      });
      assert.equal(browserCommittedPrelaunch.pass, true,
        `committed-transition Electron prelaunch refused Browser evidence: ${browserCommittedPrelaunch.failures.join('; ')}`);
    } else {
      assert.equal(browserReceipt.disposition, 'PASS',
        'PQ-024 Electron parity requires a passing Browser route receipt');
    }
    const { _electron: electron } = await loadPlaywright();
    electronLaunch = createIsolatedElectronLaunch({
      root: ROOT,
      taskId: COMMITTED_TRANSITION ? 'pq024-committed-transition' : 'pq024-asteroid-claim',
    });
    electronApp = await electron.launch(electronLaunch.options);
    electronChildProcess = electronApp.process();
    electronProcessMonitor = createElectronProcessMonitor({
      electronApp,
      childProcess: electronChildProcess,
    });
    page = await electronApp.firstWindow({ timeout: 90_000 });
    electronUrlTracker = createElectronCanonicalUrlTracker(page, {
      bootstrapTimeoutMs: 10_000,
      pollIntervalMs: 75,
      allowAnyLoopbackPort: true,
    });
    rootUrl = assertIsolatedElectronRootUrl(await electronUrlTracker.waitForCanonicalRoot(10_000));
    await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  } else {
    server = await acquireVisualProbeServer({ root: ROOT });
    rootUrl = server.baseUrl;
    const executablePath = findSystemBrowser();
    assert(executablePath, 'headed Chrome or Edge is required for PQ-024 route acceptance');
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
    if (!H3_PERFORMANCE) {
      const context = await browser.newContext({
        viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
        screen: { width: VIEWPORT.width, height: VIEWPORT.height },
        deviceScaleFactor: VIEWPORT.deviceScaleFactor,
        locale: 'en-US',
        colorScheme: 'dark',
        reducedMotion: 'no-preference',
      });
      page = await context.newPage();
    }
  }
  if (H3_PERFORMANCE) {
    receipt = await runPq024H3PerformanceCampaign(browser, rootUrl);
  } else {
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);
    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    });
    issueTracker = collectPageIssues(page, { includeWarnings: false });
    const screenshot = async (name) => {
      assert(SCREENSHOTS.includes(name), `undeclared PQ-024 screenshot ${name}`);
      const file = path.join(ARTIFACT_ROOT, name);
      await page.screenshot({ path: file, type: 'png', animations: 'allow' });
      const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} must be a PNG`);
      const row = {
        path: repoRel(file),
        bytes: info.size,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      screenshots.push(row);
      return row;
    };

    receipt = await runDefaultRoute(page, rootUrl, screenshot, {
      runtime: ELECTRON_PARITY ? 'electron' : 'browser-chromium-headed',
      navigateInitialRoot: !ELECTRON_PARITY,
      pageIssueTracker: issueTracker,
      stopAfterCore: COMMITTED_TRANSITION,
      brokerManifestId: COMMITTED_TRANSITION ? committedManifest.id : manifest.id,
    });
    receipt.screenshots = screenshots;
    receipt.pageIssues = summarizeIssues(issueTracker.errorIssues());
    assert.equal(receipt.pageIssues.length, 0, `page issues: ${JSON.stringify(receipt.pageIssues)}`);
    if (COMMITTED_TRANSITION) {
      const validation = assessPq024CommittedTransitionReceipt(receipt, {
        expectedFixedSeed: committedManifest.fixedSeed,
        expectedManifestId: committedManifest.id,
        expectedRuntime: ELECTRON_PARITY ? 'electron' : 'browser-chromium-headed',
      });
      receipt.validation = {
        schema: validation.schema,
        pass: validation.pass,
        failures: validation.failures,
      };
      assert.equal(validation.pass, true,
        `PQ-024 committed transition failed closed: ${validation.failures.join('; ')}`);
      receipt.semanticProjection = validation.projection;
      if (ELECTRON_PARITY) {
        assert.deepEqual(
          receipt.semanticProjection,
          browserCommittedPrelaunch.projection,
          'PQ-024 Electron committed presentation must match the accepted Browser semantics',
        );
        receipt.crossRuntimeParity = {
          pass: true,
          comparedAgainst: repoRel(BROWSER_RECEIPT_PATH),
        };
      } else {
        receipt.broker = {
          manifestId: committedManifest.id,
          reason: brokerGate.reason,
          diagnostic: !!brokerGate.diagnostic,
          primaryAcceptance: !!brokerGate.primaryAcceptance,
          claimId: brokerGate.claim?.claimId || null,
          digests: projectPq024CommittedIdentityDigests(brokerGate.claim?.digests),
        };
      }
    } else {
      receipt.semanticProjection = projectPq024RouteSemantics(receipt);
      if (ELECTRON_PARITY) {
        assert.deepEqual(
          receipt.semanticProjection,
          projectPq024RouteSemantics(browserReceipt),
          'PQ-024 Electron route semantics must match the accepted Browser route',
        );
        receipt.crossRuntimeParity = {
          pass: true,
          comparedAgainst: repoRel(BROWSER_RECEIPT_PATH),
        };
      }
    }
  }
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({
      path: path.join(ARTIFACT_ROOT, 'failure.png'),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
  }
  receipt = {
    schema: H3_PERFORMANCE
      ? PQ024_H3_RECEIPT_SCHEMA
      : COMMITTED_TRANSITION
        ? PQ024_COMMITTED_TRANSITION_ROUTE_SCHEMA
        : 'spaceface.pq024-asteroid-claim-route.v1',
    runtime: ELECTRON_PARITY ? 'electron' : 'browser-chromium-headed',
    disposition: 'FAIL',
    phase: error?.routePhase || activePhase || null,
    problems: [error?.message || String(error)],
    stack: error?.stack || null,
    fixedSeed: FIXED_SEED,
    brokerManifestId: H3_PERFORMANCE
      ? h3Manifest.id
      : COMMITTED_TRANSITION
        ? committedManifest.id
        : manifest.id,
    screenshots,
    pageIssues: issueTracker ? summarizeIssues(issueTracker.errorIssues()) : [],
    noPerformanceEvidence: !H3_PERFORMANCE,
    gpu: h3Gpu,
    completed: h3Completed,
    broker: H3_PERFORMANCE ? {
      reason: brokerGate.reason,
      diagnostic: !!brokerGate.diagnostic,
      primaryAcceptance: !!brokerGate.primaryAcceptance,
      claimId: brokerGate.claim?.claimId || brokerGate.claim?.id || null,
    } : undefined,
  };
} finally {
  if (ELECTRON_PARITY) {
    let cleanup = null;
    try {
      cleanup = await closeOwnedElectronRuntime({
        page,
        electronApp,
        childProcess: electronChildProcess,
        canonicalUrlTracker: electronUrlTracker,
        processMonitor: electronProcessMonitor,
        rootUrl,
      });
    } catch (error) {
      cleanup = { pass: false, failures: [error?.message || String(error)] };
    }
    receipt ||= {
      schema: COMMITTED_TRANSITION
        ? PQ024_COMMITTED_TRANSITION_ROUTE_SCHEMA
        : 'spaceface.pq024-asteroid-claim-route.v1',
      runtime: 'electron',
      disposition: 'FAIL',
      problems: [],
      fixedSeed: FIXED_SEED,
      noPerformanceEvidence: true,
    };
    if (cleanup?.pass === true) {
      receipt.ownedRuntimeClosed = true;
      try { electronLaunch?.cleanup({ runtimeClosed: true }); }
      catch (error) {
        receipt.disposition = 'FAIL';
        receipt.problems ||= [];
        receipt.problems.push(`isolated profile cleanup failed: ${error?.message || String(error)}`);
      }
    } else {
      receipt.disposition = 'FAIL';
      receipt.ownedRuntimeClosed = false;
      receipt.problems ||= [];
      receipt.problems.push(`owned Electron cleanup failed: ${(cleanup?.failures || []).join('; ')}`);
    }
  } else {
    if (browser) {
      try { await browser.close(); browserClosed = true; } catch (_) { browserClosed = false; }
    } else browserClosed = true;
    if (server) {
      try { await server.close(); serverClosed = true; } catch (_) { serverClosed = false; }
    } else serverClosed = true;
  }
}

if (H3_PERFORMANCE) {
  receipt.cleanup = { browserClosed, serverClosed };
  if (receipt.disposition === 'PASS') {
    const validation = validatePq024H3PerformanceReceipt(receipt);
    receipt.validation = validation;
    if (!validation.pass) {
      receipt.disposition = 'FAIL';
      receipt.problems = [...new Set([...(receipt.problems || []), ...validation.failures])];
    }
  }
}

await writeFile(
  RECEIPT_PATH,
  `${JSON.stringify(receipt, null, 2)}\n`,
  'utf8',
);

if (receipt.disposition !== 'PASS') {
  const id = H3_PERFORMANCE
    ? 'pq024-h3-performance'
    : COMMITTED_TRANSITION
      ? 'pq024-committed-transition'
      : 'pq024-asteroid-claim';
  console.error(`[${id}] FAIL in ${receipt.phase || 'route contract'}`);
  for (const problem of receipt.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}

if (H3_PERFORMANCE) {
  console.log('[pq024-h3-performance] PASS — three matched committed-Core and producing-relay windows');
  if (receipt.validation?.absoluteBudget?.pass !== true) {
    console.log('[pq024-h3-performance] ABSOLUTE TARGET OPEN — matched feature result passes without a target waiver');
  }
} else if (COMMITTED_TRANSITION) {
  console.log(`[pq024-committed-transition/${ELECTRON_PARITY ? 'electron' : 'browser'}] PASS — Core presentation settled before downstream production`);
} else {
  console.log(`[pq024-asteroid-claim/${ELECTRON_PARITY ? 'electron' : 'browser'}] PASS — public claim route survived save/Continue/re-entry`);
}
console.log(`  receipt: ${repoRel(RECEIPT_PATH)}`);

async function runDefaultRoute(page, rootUrl, screenshot, options = {}) {
  let phase = 'boot';
  try {
    const runtime = options.runtime || 'browser-chromium-headed';
    const boot = await bootSeededFlight(page, rootUrl, {
      navigateInitialRoot: options.navigateInitialRoot !== false,
    });
    const gpu = await readGpuContract(page);
    assert.equal(gpu.available, true, 'PQ-024 headed route requires WebGL');
    assert.doesNotMatch(gpu.renderer || '', /SwiftShader|llvmpipe|software/i,
      `PQ-024 headed route requires a real GPU path, got ${gpu.renderer}`);
    await installObservers(page);

    phase = 'dock-helios';
    await dockAtHelios(page);
    phase = 'market-materials';
    await openStationMarket(page);
    const cargo = await buyConstructionCargo(page);
    if (!options.stopAfterCore) await screenshot('01-market-materials.png');
    await publicUndock(page);

    phase = 'asteroid-course';
    const asteroid = await selectAsteroidOnLocalMap(page);
    await waitForAutopilotArrival(page, asteroid);
    await enterAsteroidOps(page, asteroid.targetEntityId);

    phase = 'survey-reveal';
    await carveCoreBuildCorridor(page);
    const surveyReveal = await pulseSurveyReveal(page);
    if (!options.stopAfterCore) await screenshot('02-survey-reveal.png');

    phase = 'core-commit';
    const corePlan = await planCorePlacement(page);
    const core = await placeSiteMachine(page, 'sm_massline_core', corePlan);
    const committedPresentation = await waitForCommittedPresentation(page, core);
    await screenshot('03-core-committed.png');

    if (options.stopAfterCore) {
      return {
        schema: PQ024_COMMITTED_TRANSITION_ROUTE_SCHEMA,
        runtime,
        disposition: 'PASS',
        problems: [],
        fixedSeed: FIXED_SEED,
        recordedSeed: boot.recordedSeed,
        brokerManifestId: options.brokerManifestId,
        gpu,
        routeContract:
          'New Game -> Helios public market -> public local-map asteroid course -> Massline '
          + '-> Asteroid Ops -> survey reveal -> Core -> settled committed presentation',
        noPerformanceEvidence: true,
        noPerformanceEvidenceNote:
          'Bounded functional transition receipt only: public controls, owner state, visible DOM, '
          + 'and one screenshot. No downstream production or performance claim is recorded.',
        actorControls: [
          'New Game and Launch buttons',
          'N galaxy map search and Set Waypoint',
          'held E dock and canonical Undock',
          'Market search, commodity tabs, quantity input, and Confirm Purchase',
          'M local-map asteroid dot and production autopilot',
          'Space Massline, B Asteroid Ops, Pulse survey, command-card Core, arrows, Enter, Escape',
        ],
        observations: {
          cargo,
          asteroid,
          surveyReveal,
          core,
          committedPresentation,
        },
      };
    }

    phase = 'extractor-install';
    const extractorPlan = await planExtractorPlacement(page, core);
    const extractor = await placeSiteMachine(page, 'sm_extractor', extractorPlan);
    await exitAsteroidOps(page);

    phase = 'positive-production';
    const production = await waitForPositiveProduction(page, core.siteId);
    const relay = await assertExactlyOneExteriorRelay(page, core.siteId);
    await screenshot('04-producing-relay.png');
    await releaseMassline(page);

    phase = 'quick-save';
    const saved = await quickSave(page);
    phase = 'cold-continue';
    const continued = await coldContinue(
      page,
      rootUrl,
      core.siteId,
      production.receipt,
      options.pageIssueTracker,
    );

    phase = 'public-re-entry';
    const restoredAsteroid = await selectAsteroidOnLocalMap(page, { siteId: core.siteId });
    await waitForAutopilotArrival(page, restoredAsteroid);
    const reentered = await reenterAsteroidOps(page, restoredAsteroid.targetEntityId, core.siteId);
    const restoredRelay = await assertExactlyOneExteriorRelay(page, core.siteId);
    await screenshot('05-continue-reentered.png');

    return {
      schema: 'spaceface.pq024-asteroid-claim-route.v1',
      runtime,
      disposition: 'PASS',
      problems: [],
      fixedSeed: FIXED_SEED,
      recordedSeed: boot.recordedSeed,
      brokerManifestId: manifest.id,
      gpu,
      routeContract:
        'New Game -> Helios public market -> public local-map asteroid course -> Massline -> Asteroid Ops '
        + '-> survey reveal -> Core -> real extractor output -> one relay -> F5 -> cold Continue -> public re-entry',
      noPerformanceEvidence: true,
      noPerformanceEvidenceNote:
        'Functional H1 receipt only: visible controls, owner receipts, identity, counts, and screenshots. '
        + 'No frame timing, percentile, hitch, or speed claim is recorded.',
      informational_contended: true,
      actorControls: [
        'New Game and Launch buttons',
        'N galaxy map search and Set Waypoint',
        'held E dock and canonical Undock',
        'Market search, commodity tabs, quantity input, and Confirm Purchase',
        'M local-map asteroid dot and production autopilot',
        'Space Massline, B Asteroid Ops, Pulse survey, command-card machine keys, cursor arrows, Enter',
        'F5, Continue, and the same public asteroid-entry chain after restore',
      ],
      observations: {
        cargo,
        asteroid,
        surveyReveal,
        core,
        committedPresentation,
        extractor,
        production,
        relay,
        saved,
        continued,
        restoredAsteroid,
        reentered,
        restoredRelay,
      },
    };
  } catch (error) {
    error.routePhase ||= phase;
    throw error;
  }
}

async function runPq024H3PerformanceCampaign(browserHandle, rootUrl) {
  const pairs = [];
  for (let repetition = 1; repetition <= PQ024_H3_REPETITIONS; repetition += 1) {
    activePhase = `pq024-h3-pair-${repetition}`;
    const context = await browserHandle.newContext({
      viewport: { width: PQ024_H3_VIEWPORT.width, height: PQ024_H3_VIEWPORT.height },
      screen: { width: PQ024_H3_VIEWPORT.width, height: PQ024_H3_VIEWPORT.height },
      deviceScaleFactor: PQ024_H3_VIEWPORT.deviceScaleFactor,
      locale: 'en-US',
      colorScheme: 'dark',
      reducedMotion: 'no-preference',
    });
    const pairPage = await context.newPage();
    page = pairPage;
    pairPage.setDefaultTimeout(30_000);
    pairPage.setDefaultNavigationTimeout(90_000);
    await pairPage.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    });
    const pairIssueTracker = collectPageIssues(pairPage, { includeWarnings: false });
    issueTracker = pairIssueTracker;
    const pairScreenshots = [];
    const screenshot = async (name) => {
      const row = await capturePq024H3Png(pairPage, name);
      pairScreenshots.push(row);
      return row;
    };
    try {
      const pair = await runPq024H3PerformancePair({
        page: pairPage,
        rootUrl,
        repetition,
        screenshot,
      });
      const pageIssues = summarizeIssues(pairIssueTracker.errorIssues());
      assert.deepEqual(pageIssues, [], `pair ${repetition}: the live route emitted page errors`);
      pair.pageIssues = pageIssues;
      pair.screenshots = pairScreenshots;
      pairs.push(pair);
      h3Completed.push({
        repetition,
        pairId: pair.route.pairId,
        pageIssues,
        screenshots: pairScreenshots,
      });
    } catch (error) {
      await pairPage.screenshot({
        path: path.join(ARTIFACT_ROOT, `failure-pair-${repetition}.png`),
        type: 'png',
        animations: 'allow',
      }).catch(() => {});
      error.routePhase ||= activePhase;
      throw error;
    } finally {
      page = null;
      issueTracker = null;
      await context.close().catch(() => {});
    }
  }

  return {
    schema: PQ024_H3_RECEIPT_SCHEMA,
    disposition: 'PASS',
    fixedSeed: FIXED_SEED,
    viewport: { ...PQ024_H3_VIEWPORT },
    runtime: 'browser-chromium-headed',
    gpu: h3Gpu,
    qualityPreserving: {
      settingsOverridesApplied: false,
      defaultQualityRetained: true,
      playerDefeatIsolationDisclosed: true,
      playerContactIsolationDisclosed: true,
      relayVisualQualityClaimed: false,
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
        'New Game -> Helios public market -> local-map asteroid course -> Massline -> Asteroid Ops '
        + '-> public survey + committed Core -> same-pose no-relay flight floor -> public Asteroid Ops '
        + 're-entry -> real extractor output -> exactly one admitted exterior relay target',
      retainedEvidenceReferences: [
        'design/program/roadmap/receipts/PQ-024-survey-h1-capture-REPORT.md',
      ],
      pairs: pairs.map((pair) => pair.route),
    },
    profiles: [
      { id: PQ024_H3_PROFILE_IDS[0], repetitions: pairs.map((pair) => pair.floor) },
      { id: PQ024_H3_PROFILE_IDS[1], repetitions: pairs.map((pair) => pair.target) },
    ],
    pageIssues: pairs.flatMap((pair) => pair.pageIssues),
    screenshots: pairs.flatMap((pair) => pair.screenshots),
    cleanup: { browserClosed: false, serverClosed: false },
  };
}

async function runPq024H3PerformancePair({ page, rootUrl, repetition, screenshot }) {
  const pairId = `pq024-h3-pair-${repetition}`;
  let isolationInstalled = false;
  let pairResult = null;
  let pairCleanup = null;
  let asteroid = null;
  let surveyReveal = null;
  let core = null;
  let extractor = null;
  let production = null;
  let relay = null;
  try {
    activePhase = `${pairId}:boot`;
    const boot = await bootSeededFlight(page, rootUrl);
    const pairGpu = await readGpuContract(page);
    assert.equal(pairGpu.available, true, `pair ${repetition}: WebGL must be available`);
    assert.doesNotMatch(pairGpu.renderer || '', /SwiftShader|llvmpipe|software/i,
      `pair ${repetition}: acceptance requires a real GPU path, got ${pairGpu.renderer}`);
    if (!h3Gpu) h3Gpu = pairGpu;
    else assert.equal(pairGpu.renderer, h3Gpu.renderer, `pair ${repetition}: GPU renderer changed`);
    await installObservers(page);

    activePhase = `${pairId}:dock-helios`;
    await dockAtHelios(page);
    await openStationMarket(page);
    const cargo = await buyConstructionCargo(page);
    await publicUndock(page);

    activePhase = `${pairId}:asteroid-course`;
    asteroid = await selectAsteroidOnLocalMap(page);
    await waitForAutopilotArrival(page, asteroid);
    await enterAsteroidOps(page, asteroid.targetEntityId);

    activePhase = `${pairId}:survey-core`;
    await carveCoreBuildCorridor(page);
    surveyReveal = await pulseSurveyReveal(page);
    const corePlan = await planCorePlacement(page);
    core = await placeSiteMachine(page, 'sm_massline_core', corePlan);
    await exitAsteroidOps(page);
    const floorRelay = await assertNoExteriorRelay(page, core.siteId);

    activePhase = `${pairId}:isolate-floor`;
    await installPq024H3PerformanceIsolation(page);
    isolationInstalled = true;
    await setPq024H3ClaimCamera(page, 88);
    const floorWindow = await sampleRafWindow(page, {
      phaseTag: 'flight_steady',
      warmupMs: 2_000,
      pipelineStableMs: 5_000,
      pipelineSettleTimeoutMs: PQ024_H3_PIPELINE_SETTLE_TIMEOUT_MS,
      sampleMs: 5_000,
      enableGpuTimers: false,
      requireAuthoredFlight: true,
      requireDocked: false,
    });
    await attachPq024SeparatedGpuAttribution(page, floorWindow);
    const floorFacts = await readPq024H3RouteFacts(page, {
      profileId: PQ024_H3_PROFILE_IDS[0],
      repetition,
      pairId,
      asteroid,
      surveyReveal,
      core,
      measurementStartMs: floorWindow.samples[0]?.atMs,
      measurementEndMs: floorWindow.samples.at(-1)?.atMs,
    });
    assert.equal(floorFacts.relay.count, floorRelay.count,
      `pair ${repetition}: floor relay count changed before evidence was bound`);
    await screenshot(`pair-${repetition}-committed-no-relay-floor.png`);

    activePhase = `${pairId}:public-extractor`;
    await enterAsteroidOps(page, asteroid.targetEntityId);
    const extractorPlan = await planExtractorPlacement(page, core, { fromAvatar: true });
    extractor = await placeSiteMachine(page, 'sm_extractor', extractorPlan);
    await exitAsteroidOps(page);
    production = await waitForPositiveProduction(page, core.siteId);
    relay = await waitForAdmittedExteriorRelay(page, core.siteId);
    await restorePq024H3MatchedPose(page, floorFacts.pose);
    await setPq024H3ClaimCamera(page, 88);

    activePhase = `${pairId}:producing-relay-target`;
    const targetWindow = await sampleRafWindow(page, {
      phaseTag: 'flight_steady',
      warmupMs: 2_000,
      pipelineStableMs: 5_000,
      pipelineSettleTimeoutMs: PQ024_H3_PIPELINE_SETTLE_TIMEOUT_MS,
      sampleMs: 5_000,
      enableGpuTimers: false,
      requireAuthoredFlight: true,
      requireDocked: false,
    });
    await attachPq024SeparatedGpuAttribution(page, targetWindow);
    const targetFacts = await readPq024H3RouteFacts(page, {
      profileId: PQ024_H3_PROFILE_IDS[1],
      repetition,
      pairId,
      asteroid,
      surveyReveal,
      core,
      measurementStartMs: targetWindow.samples[0]?.atMs,
      measurementEndMs: targetWindow.samples.at(-1)?.atMs,
    });
    await screenshot(`pair-${repetition}-producing-one-relay-target.png`);

    pairResult = {
      route: {
        pairId,
        repetition,
        recordedSeed: boot.recordedSeed,
        sameContext: true,
        publicRoute: true,
        asteroid,
        surveyReveal,
        core,
        extractor,
        production,
        relay,
        cargo,
        declaredCompressions: [
          'retained H1 owns save/Continue, Electron parity, and re-entry persistence',
          'H3 stops after live relay admission and makes no relay visual-quality claim',
        ],
        cleanup: null,
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
  } catch (error) {
    error.routePhase ||= activePhase;
    throw error;
  } finally {
    activePhase = `${pairId}:cleanup`;
    let masslineReleased = false;
    let isolationCleanup = {
      playerSafetyRestored: isolationInstalled !== true,
      timeEffectListenersRemoved: isolationInstalled !== true,
    };
    try {
      await releaseMassline(page);
      masslineReleased = await page.evaluate(() => window.SF?.state?.player?.tether?.active !== true);
    } finally {
      if (isolationInstalled) isolationCleanup = await cleanupPq024H3PerformanceIsolation(page);
    }
    pairCleanup = { ...isolationCleanup, masslineReleased };
  }
  assert(pairResult, `pair ${repetition}: no matched result was produced`);
  pairResult.route.cleanup = pairCleanup;
  return pairResult;
}

async function installPq024H3PerformanceIsolation(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf?.state;
    const player = state?.entities?.get(state.playerId);
    const feel = sf?.registry?.get?.('feel');
    const physicsOwner = sf?.registry?.get?.('physics')?._sg02;
    const playerBody = physicsOwner?.records?.get?.(player?.id)?.body;
    const fixedBodyType = physicsOwner?.RAPIER?.RigidBodyType?.Fixed;
    if (!state || !player || !feel || !playerBody || !Number.isInteger(fixedBodyType)
        || typeof playerBody.setBodyType !== 'function') {
      throw new Error('PQ-024 H3 requires the live player, feel owner, and SG-02 physics authority');
    }
    window.__PQ024_H3__?.cleanup?.();
    const safety = {
      invulnHadOwn: Object.hasOwn(player.flags || {}, 'invuln'),
      invuln: player.flags?.invuln,
      invulnUntil: player._invulnUntil,
      bodyType: playerBody.bodyType(),
      bodyTranslation: { ...playerBody.translation() },
      bodyRotation: { ...playerBody.rotation() },
      bodyLinvel: { ...playerBody.linvel() },
      bodyAngvel: { ...playerBody.angvel() },
      entityPos: { x: Number(player.pos?.x) || 0, y: Number(player.pos?.y) || 0, z: Number(player.pos?.z) || 0 },
      entityPrevPos: {
        x: Number(player.prevPos?.x) || 0,
        y: Number(player.prevPos?.y) || 0,
        z: Number(player.prevPos?.z) || 0,
      },
      entityVel: { x: Number(player.vel?.x) || 0, y: Number(player.vel?.y) || 0, z: Number(player.vel?.z) || 0 },
      entityRot: Number(player.rot) || 0,
      entityPrevRotHadOwn: Object.hasOwn(player, 'prevRot'),
      entityPrevRot: player.prevRot,
      entityAngVelHadOwn: Object.hasOwn(player, 'angVel'),
      entityAngVel: player.angVel,
      cameraZoom: Number(state.camera?.zoom) || null,
    };
    player.flags ||= {};
    player.flags.invuln = true;
    player._invulnUntil = Infinity;
    playerBody.setBodyType(fixedBodyType, true);
    playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    playerBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    player.vel.set(0, 0, 0);
    player.prevPos.copy(player.pos);
    if (playerBody.bodyType() !== fixedBodyType) {
      throw new Error('PQ-024 H3 could not isolate the benchmark player from contact drift');
    }

    const trace = { samples: [], events: [] };
    const unsubs = [];
    const harness = {
      safety,
      trace,
      unsubs,
      monitorFrame: null,
      disposed: false,
      recordEvent(event, payload = {}) {
        const row = {
          atMs: performance.now(),
          tick: Number(state.tick) || 0,
          event,
          hitStopActive: Number(feel._hsTimer) > 0,
        };
        if (event === 'combat:damage') {
          row.targetId = payload.targetId ?? null;
          row.attackerId = payload.attackerId ?? null;
          row.amount = Number(payload.amount) || 0;
        }
        trace.events.push(row);
        if (trace.events.length > 256) trace.events.shift();
      },
      recordSample(atMs) {
        const scale = Number(state.timeScale);
        if (!Number.isFinite(scale) || scale === 1) return;
        const feelScale = Number(feel._hsRequest?.scale);
        let source = 'unattributed';
        if (Number(feel._hsTimer) > 0 && Number.isFinite(feelScale)
            && Math.abs(feelScale - scale) <= 1e-9) source = 'feel:hit-stop';
        else if (state.player?.flybyFocus?.active === true && scale === 0.5) source = 'flyby-focus';
        else if (state.massline2?.bulletTime?.active === true && scale === 0.35) source = 'player:bullet-time';
        trace.samples.push({
          atMs,
          tick: Number(state.tick) || 0,
          scale,
          source,
          remainingMs: source === 'feel:hit-stop' ? Math.max(0, Number(feel._hsTimer) * 1_000) : null,
        });
        if (trace.samples.length > 256) trace.samples.shift();
      },
      snapshotTimeEffects(startMs, endMs) {
        const start = Number(startMs);
        const end = Number(endMs);
        return {
          measurementStartMs: start,
          measurementEndMs: end,
          samples: structuredClone(trace.samples.filter((row) => (
            Number.isFinite(start) && Number.isFinite(end)
              && row.atMs >= start - 0.25 && row.atMs <= end + 0.25
          ))),
          events: structuredClone(trace.events.filter((row) => (
            Number.isFinite(start) && Number.isFinite(end)
              && row.atMs >= start - 120 && row.atMs <= end + 25
          ))),
        };
      },
      restoreMatchedPose(pose) {
        if (this.disposed) throw new Error('PQ-024 H3 isolation is already disposed');
        const x = Number(pose?.x);
        const z = Number(pose?.z);
        const rot = Number(pose?.rot);
        if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rot)) {
          throw new Error('PQ-024 H3 matched pose must be finite');
        }
        const selectedTargetId = state.targetId ?? state.ui?.targetId ?? state.combat?.targetId ?? null;
        if (selectedTargetId !== (pose?.selectedTargetId ?? null)) {
          throw new Error('PQ-024 H3 target selection changed before matched-pose restore');
        }
        const local = physicsOwner._globalPointToFrameLocal?.({ x, y: 0, z }, playerBody.translation());
        if (!local || !Number.isFinite(local.x) || !Number.isFinite(local.z)) {
          throw new Error('PQ-024 H3 could not project the matched pose into the physics frame');
        }
        const halfYaw = rot * 0.5;
        player.pos.set(x, Number(player.pos?.y) || 0, z);
        player.prevPos.copy(player.pos);
        player.vel.set(0, 0, 0);
        player.rot = rot;
        player.prevRot = rot;
        player.angVel = 0;
        playerBody.setTranslation({ x: local.x, y: 0, z: local.z }, true);
        playerBody.setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) }, true);
        playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        playerBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.matchedPoseRestore = { x, z, rot, selectedTargetId, tick: Number(state.tick) || 0 };
        return { ...this.matchedPoseRestore };
      },
      cleanup() {
        if (this.disposed) return this.cleanupReceipt;
        this.disposed = true;
        if (this.monitorFrame != null) cancelAnimationFrame(this.monitorFrame);
        this.monitorFrame = null;
        for (const unsub of unsubs) unsub();
        unsubs.length = 0;
        if (safety.invulnHadOwn) player.flags.invuln = safety.invuln;
        else delete player.flags.invuln;
        player._invulnUntil = safety.invulnUntil;
        player.pos.set(safety.entityPos.x, safety.entityPos.y, safety.entityPos.z);
        player.prevPos.set(safety.entityPrevPos.x, safety.entityPrevPos.y, safety.entityPrevPos.z);
        player.vel.set(safety.entityVel.x, safety.entityVel.y, safety.entityVel.z);
        player.rot = safety.entityRot;
        if (safety.entityPrevRotHadOwn) player.prevRot = safety.entityPrevRot;
        else delete player.prevRot;
        if (safety.entityAngVelHadOwn) player.angVel = safety.entityAngVel;
        else delete player.angVel;
        playerBody.setBodyType(safety.bodyType, true);
        playerBody.setTranslation(safety.bodyTranslation, true);
        playerBody.setRotation(safety.bodyRotation, true);
        playerBody.setLinvel(safety.bodyLinvel, true);
        playerBody.setAngvel(safety.bodyAngvel, true);
        if (Number.isFinite(safety.cameraZoom)) sf.bus.emit('camera:zoom', { level: safety.cameraZoom });
        const invulnRestored = safety.invulnHadOwn
          ? Object.hasOwn(player.flags, 'invuln') && Object.is(player.flags.invuln, safety.invuln)
          : !Object.hasOwn(player.flags, 'invuln');
        this.cleanupReceipt = {
          playerSafetyRestored: invulnRestored
            && Object.is(player._invulnUntil, safety.invulnUntil)
            && playerBody.bodyType() === safety.bodyType
            && physicsOwner.records?.get?.(player.id)?.body === playerBody,
          timeEffectListenersRemoved: unsubs.length === 0 && this.monitorFrame == null,
        };
        return this.cleanupReceipt;
      },
    };
    for (const event of ['combat:damage', 'entity:killed', 'player:death']) {
      unsubs.push(sf.bus.on(event, (payload) => harness.recordEvent(event, payload)));
    }
    const monitor = (atMs) => {
      if (harness.disposed) return;
      harness.recordSample(atMs);
      harness.monitorFrame = requestAnimationFrame(monitor);
    };
    harness.monitorFrame = requestAnimationFrame(monitor);
    window.__PQ024_H3__ = harness;
    return {
      playerDefeatSuppressed: player.flags.invuln === true && player._invulnUntil === Infinity,
      playerContactSuppressed: playerBody.bodyType() === fixedBodyType,
      npcCombatRetained: true,
      ambientVfxRetained: true,
    };
  });
}

async function cleanupPq024H3PerformanceIsolation(page) {
  return page.evaluate(() => window.__PQ024_H3__?.cleanup?.() || {
    playerSafetyRestored: false,
    timeEffectListenersRemoved: false,
  });
}

async function setPq024H3ClaimCamera(page, cameraZoom) {
  await page.evaluate((level) => window.SF?.bus?.emit('camera:zoom', { level }), cameraZoom);
  await page.waitForFunction((level) => Math.abs(Number(window.SF?.state?.camera?.zoom) - level) < 1e-9,
    cameraZoom, { timeout: 10_000 });
}

async function restorePq024H3MatchedPose(page, pose) {
  const restored = await page.evaluate((expected) => (
    window.__PQ024_H3__?.restoreMatchedPose?.(expected) || null
  ), pose);
  assert(restored, 'PQ-024 H3 matched-pose isolation must be installed');
  await page.waitForFunction((expected) => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    const currentTargetId = state?.targetId ?? state?.ui?.targetId ?? state?.combat?.targetId ?? null;
    return Number(state?.tick) > expected.tick
      && Math.hypot(Number(player?.pos?.x) - expected.x, Number(player?.pos?.z) - expected.z) <= 0.01
      && Math.abs(Number(player?.rot) - expected.rot) <= 0.001
      && currentTargetId === expected.selectedTargetId;
  }, restored, { timeout: 10_000 });
}

async function assertNoExteriorRelay(page, siteId) {
  const row = await page.evaluate((id) => {
    const relays = [...(window.SF?.state?.entities?.values?.() || [])].filter((entity) => (
      entity?.alive !== false
      && entity.data?.siteBeacon === id
      && entity.data?.placeId === 'place_claim_outpost_relay'
    ));
    return { count: relays.length };
  }, siteId);
  assert.equal(row.count, 0, 'committed Core floor must contain no exterior relay');
  return row;
}

async function waitForAdmittedExteriorRelay(page, siteId) {
  const handle = await page.waitForFunction((id) => {
    const relays = [...(window.SF?.state?.entities?.values?.() || [])].filter((entity) => (
      entity?.alive !== false
      && entity.data?.siteBeacon === id
      && entity.data?.placeId === 'place_claim_outpost_relay'
    ));
    if (relays.length !== 1) return null;
    const relayEntity = relays[0];
    const root = relayEntity.mesh || relayEntity.view?.root || null;
    const rawAssetState = root?.userData?.authoredAssetState || null;
    const materialPolicy = root?.userData?.hull?.userData?.claimRelayMaterialPolicy || null;
    if (relayEntity.presentationAdmission !== 'ready'
        || !String(rawAssetState || '').startsWith('authored')
        || materialPolicy?.materialCount !== 5
        || materialPolicy?.packedOrmMaterialCount !== 5) return null;
    return {
      count: 1,
      entityId: relayEntity.id,
      placeId: relayEntity.data.placeId,
      siteId: relayEntity.data.siteBeacon,
      presentationAdmission: relayEntity.presentationAdmission,
      assetState: 'authored',
      rawAssetState,
      materialPolicy,
    };
  }, siteId, { timeout: 90_000 });
  return handle.jsonValue();
}

async function readPq024H3RouteFacts(page, {
  profileId,
  repetition,
  pairId,
  asteroid,
  surveyReveal,
  core,
  measurementStartMs,
  measurementEndMs,
}) {
  return page.evaluate((input) => {
    const state = window.SF.state;
    const owner = window.SF.registry.get('asteroidSites');
    const site = owner.getSite(input.core.siteId);
    const playerEntity = state.entities.get(state.playerId);
    const relays = [...state.entities.values()].filter((entity) => (
      entity?.alive !== false
      && entity.data?.siteBeacon === site.id
      && entity.data?.placeId === 'place_claim_outpost_relay'
    ));
    const relayEntity = relays[0] || null;
    const relayRoot = relayEntity?.mesh || relayEntity?.view?.root || null;
    const relayRawAssetState = relayRoot?.userData?.authoredAssetState || null;
    const relayAuthoredRoot = relayRoot?.userData?.hull || null;
    const relayRendering = relayAuthoredRoot ? (() => {
      const materials = new Set();
      let visibleMeshes = 0;
      let visibleIndexedMeshes = 0;
      let visibleDrawCalls = 0;
      let visibleTriangles = 0;
      let visibleVertices = 0;
      let visibleIndices = 0;
      relayAuthoredRoot.traverse((object) => {
        if (!object.isMesh || object.userData?.spacefaceStaticBatch !== true) return;
        let visible = object.visible !== false;
        for (let parent = object.parent; visible && parent && parent !== relayAuthoredRoot.parent; parent = parent.parent) {
          if (parent.visible === false) visible = false;
        }
        if (!visible) return;
        visibleMeshes += 1;
        if (object.geometry?.index) visibleIndexedMeshes += 1;
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) if (material) materials.add(material);
        const groups = Array.isArray(object.geometry?.groups) ? object.geometry.groups : [];
        visibleDrawCalls += Array.isArray(object.material) && groups.length > 0 ? groups.length : 1;
        const indices = Number(object.geometry?.index?.count);
        const positions = Number(object.geometry?.getAttribute?.('position')?.count);
        visibleVertices += Number.isFinite(positions) ? positions : 0;
        visibleIndices += Number.isFinite(indices) ? indices : 0;
        visibleTriangles += Number.isFinite(indices) && indices > 0
          ? indices / 3
          : (Number.isFinite(positions) ? positions / 3 : 0);
      });
      const materialPolicy = relayAuthoredRoot.userData?.claimRelayMaterialPolicy || null;
      return {
        appliedLod: relayRoot?.userData?.lod?.level || null,
        visibleMeshes,
        visibleIndexedMeshes,
        visibleDrawCalls,
        visibleTriangles,
        visibleVertices,
        visibleIndices,
        visibleMaterialCount: materials.size,
        packedOrmMaterialCount: [...materials].filter((material) => (
          material?.userData?.spacefacePackedOrmSingleSample === true
        )).length,
        closedFrontMaterialCount: [...materials].filter((material) => (
          material?.userData?.spacefaceClaimRelayClosedSurface === true
            && material.side === 0
        )).length,
        materialPolicy,
      };
    })() : null;
    const events = window.__PQ024_H1_TRACE__?.production || [];
    const physicsOwner = window.SF.registry.get('physics')?._sg02;
    const playerBody = physicsOwner?.records?.get?.(playerEntity.id)?.body;
    const fixedBodyType = physicsOwner?.RAPIER?.RigidBodyType?.Fixed;
    const machineCount = (defId) => site.machines.filter((machine) => machine.defId === defId).length;
    return {
      profileId: input.profileId,
      repetition: input.repetition,
      pairId: input.pairId,
      recordedSeed: state.meta?.seed ?? null,
      sectorId: state.world?.currentSectorId || null,
      mode: state.mode || null,
      docked: state.ui?.docked === true,
      playerControlExposed: state.mode === 'flight'
        && state.ui?.docked !== true
        && state.jump?.state === 'IDLE',
      asteroidTargetId: input.asteroid.targetEntityId,
      siteId: site.id,
      survey: input.surveyReveal,
      core: input.core,
      pose: {
        x: Number(playerEntity.pos?.x),
        z: Number(playerEntity.pos?.z),
        rot: Number(playerEntity.rot) || 0,
        cameraZoom: Number(state.camera?.zoom) || null,
        selectedTargetId: state.targetId ?? state.ui?.targetId ?? state.combat?.targetId ?? null,
      },
      performanceIsolation: {
        playerDefeatSuppressed: playerEntity.flags?.invuln === true
          && playerEntity._invulnUntil === Infinity,
        playerContactSuppressed: playerBody?.bodyType?.() === fixedBodyType,
        npcCombatRetained: true,
        ambientVfxRetained: true,
      },
      site: {
        lifecycle: site.survey?.lifecycle || null,
        anchored: site.anchored === true,
        machineCount: site.machines.length,
        coreCount: machineCount('sm_massline_core'),
        extractorCount: machineCount('sm_extractor'),
      },
      production: {
        receipt: site.survey?.receipt ? { ...site.survey.receipt } : null,
        eventCount: events.filter((event) => event.siteId === site.id).length,
      },
      relay: relayEntity ? {
        count: relays.length,
        entityId: relayEntity.id,
        placeId: relayEntity.data.placeId,
        siteId: relayEntity.data.siteBeacon,
        presentationAdmission: relayEntity.presentationAdmission || null,
        assetState: String(relayRawAssetState || '').startsWith('authored')
          ? 'authored'
          : relayRawAssetState,
        rawAssetState: relayRawAssetState,
        rendering: relayRendering,
      } : { count: 0 },
      timeEffects: window.__PQ024_H3__.snapshotTimeEffects(
        input.measurementStartMs,
        input.measurementEndMs,
      ),
    };
  }, {
    profileId,
    repetition,
    pairId,
    asteroid,
    surveyReveal,
    core,
    measurementStartMs,
    measurementEndMs,
  });
}

async function attachPq024SeparatedGpuAttribution(page, timingWindow) {
  const gpuCapture = await page.evaluate(async ({ requiredFrames }) => {
    const state = window.SF?.state;
    const timers = state?.render?.gpuTimers;
    if (!timers || typeof timers.reset !== 'function' || typeof timers.setEnabled !== 'function'
        || typeof timers.drainPending !== 'function' || typeof timers.getReport !== 'function') {
      throw new Error('PQ-024 H3 requires the live GPU timer capability');
    }
    const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const settingsSlice = () => JSON.stringify({
      video: state?.settings?.video || null,
      dynResScale: Number.isFinite(state?.render?.dynResScale) ? state.render.dynResScale : null,
      timeScale: Number.isFinite(state?.timeScale) ? state.timeScale : null,
    });
    const routeSlice = () => {
      const siteId = window.__PQ024_H1_TRACE__?.commitments?.at(-1)?.siteId || null;
      const site = siteId ? window.SF?.registry?.get?.('asteroidSites')?.getSite?.(siteId) : null;
      const relayCount = siteId ? [...(state?.entities?.values?.() || [])].filter((entity) => (
        entity?.alive !== false && entity.data?.siteBeacon === siteId
      )).length : 0;
      return JSON.stringify({
        mode: state?.mode || null,
        docked: state?.ui?.docked === true,
        visibility: document.visibilityState,
        siteId,
        lifecycle: site?.survey?.lifecycle || null,
        relayCount,
      });
    };
    const settingsStart = settingsSlice();
    const routeStart = routeSlice();
    const startedAt = performance.now();
    let frameCount = 0;
    let drain = null;
    let report = null;
    try {
      timers.reset();
      timers.setEnabled(true);
      while (frameCount < requiredFrames) {
        await raf();
        frameCount += 1;
      }
      drain = await timers.drainPending({ maxPolls: 120, timeoutMs: 2_000, yieldFn: raf });
      report = timers.getReport();
    } finally {
      timers.setEnabled(false);
    }
    return {
      frameCount,
      durationMs: performance.now() - startedAt,
      settingsStable: settingsSlice() === settingsStart,
      routeStable: routeSlice() === routeStart,
      gpuTimers: {
        available: report?.available === true,
        status: report?.status || (report?.available ? 'available' : 'unavailable'),
        reason: report?.reason || null,
        extension: report?.extension || null,
        enabled: report?.enabled === true,
        lastDisjoint: report?.lastDisjoint === true,
        pending: report?.pending,
        lastInvalidation: report?.lastInvalidation || null,
        queryCounts: report?.queryCounts || null,
        captureValid: report?.captureValid === true,
        drain,
        terminals: report?.terminals || null,
        passes: report?.passes || null,
      },
    };
  }, { requiredFrames: 150 });
  assert(timingWindow?.attribution, 'PQ-024 H3 timing-window attribution is required');
  timingWindow.attribution.gpuTimers = gpuCapture.gpuTimers;
  timingWindow.attribution.measurementIsolation = {
    frameTimingGpuTimersEnabled: false,
    gpuAttributionSeparated: true,
    gpuAttributionFrameCount: gpuCapture.frameCount,
    gpuAttributionDurationMs: gpuCapture.durationMs,
    settingsStable: gpuCapture.settingsStable,
    routeStable: gpuCapture.routeStable,
  };
}

async function capturePq024H3Png(page, name) {
  const file = path.join(ARTIFACT_ROOT, name);
  await page.screenshot({ path: file, type: 'png', animations: 'allow' });
  const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} must be a PNG`);
  return {
    path: repoRel(file),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function bootSeededFlight(page, rootUrl, { navigateInitialRoot = true } = {}) {
  if (navigateInitialRoot) {
    await page.goto(rootUrl, { waitUntil: 'domcontentloaded' });
  } else {
    assert.equal(
      new URL(page.url()).href,
      new URL(rootUrl).href,
      'PQ-024 Electron parity must continue from the already-loaded canonical first window',
    );
  }
  const url = new URL(page.url());
  assert.equal(url.search, '', 'PQ-024 uses the canonical root without debug flags');
  assert.equal(url.hash, '', 'PQ-024 uses the canonical root without hash flags');
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry && window.SF?.ctx),
    null, { timeout: 60_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }
  await waitVisible(page, '[data-screen="mainMenu"]', 'main menu');
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await waitVisible(page, '[data-screen="newGame"]', 'New Game');
  await page.fill('#sf-ng-seed', String(FIXED_SEED));
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  const begin = page.getByRole('button', { name: /^Begin$/i });
  if (await begin.isVisible().catch(() => false)) await begin.click();
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight' && player?.alive !== false && Number(player?.hull) > 0;
  }, null, { timeout: 120_000 });
  const recordedSeed = await page.evaluate(() => window.SF.state.meta?.seed ?? null);
  assert.equal(recordedSeed, FIXED_SEED, 'New Game consumed the broker seed');
  return { recordedSeed };
}

async function installObservers(page) {
  await page.evaluate(() => {
    const clone = (value) => {
      try { return JSON.parse(JSON.stringify(value)); } catch (_) { return { uncloneable: true }; }
    };
    const trace = window.__PQ024_H1_TRACE__ = {
      surveys: [],
      commitments: [],
      production: [],
      saves: [],
      massline: [],
    };
    const bus = window.SF.bus;
    bus.on('site:surveyDetected', (payload) => trace.surveys.push(clone(payload)));
    bus.on('site:surveyCommitted', (payload) => trace.commitments.push(clone(payload)));
    bus.on('site:producing', (payload) => trace.production.push(clone(payload)));
    bus.on('save:completed', (payload) => trace.saves.push(clone(payload)));
    for (const name of ['tether:latched', 'tether:latchDenied', 'tether:broke', 'tether:released']) {
      bus.on(name, (payload) => trace.massline.push({
        name,
        tick: Number(window.SF?.state?.tick) || 0,
        payload: clone(payload),
      }));
    }
  });
}

async function dockAtHelios(page) {
  await page.keyboard.press('KeyN');
  await waitVisible(page, '#sf-galaxymap', 'galaxy map');
  await page.keyboard.press('/');
  const search = page.locator('.gm-search-input');
  const searchFocused = await search.evaluate((element) => element === document.activeElement)
    .catch(() => false);
  if (!searchFocused) await search.click();
  await page.keyboard.type('Helios Station');
  await page.locator('.gm-search-item-name', { hasText: 'Helios Station' }).first()
    .waitFor({ state: 'visible' });
  await page.keyboard.press('Enter');
  const waypoint = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  await waypoint.waitFor({ state: 'visible' });
  await waypoint.click();
  const prompt = await waitForPq024DockPrompt(page, { timeoutMs: 120_000 });
  assert.match(await prompt.innerText(), /\bE\b.*\bDOCK\b|\bDOCK\b.*\bE\b/i);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await page.keyboard.down('KeyE');
      await page.waitForTimeout(300);
    } finally {
      await page.keyboard.up('KeyE').catch(() => {});
    }
    const docked = await page.waitForFunction(
      () => window.SF?.state?.ui?.docked === true,
      null,
      { timeout: 1_000 },
    ).then(() => true, () => false);
    if (docked) break;
  }
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === true, null, { timeout: 5_000 });
  await waitVisible(page, '[data-screen="station"]', 'station hub');
}

async function waitForPq024DockPrompt(page, { timeoutMs }) {
  const prompt = page.locator('.sf-alert--dock').first();
  const observation = await observePq024DockPrompt({
    waitForVisible: async () => {
      await prompt.waitFor({ state: 'visible', timeout: timeoutMs });
      return prompt;
    },
    readSnapshot: async () => {
      const snapshot = await readPq024DockApproachSnapshot(page);
      assert.equal(snapshot?.player?.alive, true,
        `player died during the public Helios approach; evidence=${JSON.stringify(snapshot)}`);
      return snapshot;
    },
    waitForSample: (delayMs) => page.waitForTimeout(delayMs),
    timeoutMs,
  });
  if (observation.prompt) return observation.prompt;
  const error = new Error(formatPq024DockApproachTimeout(observation.evidence));
  error.code = 'PQ024_DOCK_PROMPT_TIMEOUT';
  error.dockApproach = observation.evidence.last;
  if (observation.waitError) error.cause = observation.waitError;
  throw error;
}

async function readPq024DockApproachSnapshot(page) {
  return page.evaluate(() => {
    const finite = (value) => Number.isFinite(value) ? Number(value) : null;
    const point = (value) => value ? { x: finite(value.x), z: finite(value.z) } : null;
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    const nav = state?.nav || {};
    const autopilot = nav.autopilot || null;
    const requestedTargetId = autopilot?.targetEntityId;
    const requestedTarget = requestedTargetId != null
      ? state?.entities?.get?.(requestedTargetId)
        || state?.entities?.get?.(Number(requestedTargetId))
      : null;
    const station = requestedTarget?.type === 'station'
      ? requestedTarget
      : [...(state?.entityList || [])].find((entity) => (
        entity?.type === 'station' && entity?.data?.stationId === 'station_helios'
      ));
    const telemetry = state?.input?.autopilot;
    const resolvedTarget = telemetry && typeof telemetry === 'object' ? telemetry.target : null;
    const corridor = state?.dockingCorridor || null;
    const prompt = document.querySelector('.sf-alert--dock');
    const promptStyle = prompt ? getComputedStyle(prompt) : null;
    const promptVisible = !!(prompt && !prompt.hidden && promptStyle?.display !== 'none'
      && promptStyle?.visibility !== 'hidden' && Number(promptStyle?.opacity || 1) > 0.01);
    return {
      tick: finite(state?.tick),
      simTime: finite(state?.simTime),
      mode: state?.mode || null,
      screenStack: Array.isArray(state?.ui?.screenStack) ? [...state.ui.screenStack] : [],
      docked: state?.ui?.docked === true,
      dockedStationId: state?.ui?.dockedStationId || null,
      prompt: {
        visible: promptVisible,
        text: promptVisible ? String(prompt.textContent || '').trim().slice(0, 160) : '',
      },
      player: player ? {
        id: player.id ?? null,
        alive: player.alive !== false && Number(player.hull) > 0,
        hull: finite(player.hull),
        pos: point(player.pos),
        vel: point(player.vel),
        speed: finite(Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0))),
        rot: finite(player.rot),
        radius: finite(player.radius),
        dockedFlag: player.flags?.docked === true,
      } : null,
      station: station ? {
        id: station.id ?? null,
        stationId: station.data?.stationId || null,
        name: station.data?.name || station.name || null,
        pos: point(station.pos),
        rot: finite(station.rot),
        radius: finite(station.radius),
        dockRadius: finite(station.data?.dockRadius),
        collisionProxy: station.data?.collisionProxy || null,
        corridorBearingDeg: finite(station.data?.corridorBearingDeg),
      } : null,
      waypoint: nav.waypoint ? {
        kind: nav.waypoint.kind || null,
        label: nav.waypoint.label || null,
        pos: point(nav.waypoint.pos),
        entityId: nav.waypoint.entityId ?? nav.waypoint.targetEntityId ?? null,
      } : null,
      autopilot: autopilot ? {
        active: autopilot.active === true,
        status: autopilot.status || null,
        label: autopilot.label || null,
        distance: finite(autopilot.distance),
        arrivalRadius: finite(autopilot.arrivalRadius),
        initialDistance: finite(autopilot.initialDistance),
        targetEntityId: autopilot.targetEntityId ?? null,
        target: point(autopilot.target),
      } : null,
      resolvedTarget: resolvedTarget ? {
        x: finite(resolvedTarget.x),
        z: finite(resolvedTarget.z),
        arrivalRadius: finite(resolvedTarget.arrivalRadius),
        dockingProxyId: resolvedTarget.dockingProxyId || null,
        dockingStage: resolvedTarget.dockingStage || null,
        entityId: resolvedTarget.entity?.id ?? null,
      } : null,
      input: {
        moveX: finite(state?.input?.moveX),
        moveZ: finite(state?.input?.moveZ),
        turnIntent: finite(state?.input?.turnIntent),
        boost: state?.input?.boost === true,
        brake: state?.input?.brake === true,
        actionBrake: state?.input?.actions?.brake === true,
        autopilotPublished: !!telemetry,
      },
      dockingCorridor: corridor ? {
        stationId: corridor.stationId || null,
        proxyId: corridor.proxyId || null,
        phase: corridor.phase || null,
        distToBerth: finite(corridor.distToBerth),
        distCenter: finite(corridor.distCenter),
        speed: finite(corridor.speed),
        headingOk: corridor.headingOk === true,
        inCorridor: corridor.inCorridor === true,
        inCapture: corridor.inCapture === true,
        berthed: corridor.berthed === true,
        berth: point(corridor.berth),
        assist: corridor.assist ? {
          ax: finite(corridor.assist.ax),
          az: finite(corridor.assist.az),
        } : null,
      } : null,
      physicsDockStationId: window.SF?.registry?.get?.('physics')?._dockStationId ?? null,
    };
  });
}

async function buyConstructionCargo(page) {
  const purchases = [
    { commodityId: 'cmdty_regocrete', name: 'Regocrete', qty: 7 },
    { commodityId: 'cmdty_control_unit', name: 'Machine Control Unit', qty: 2 },
    { commodityId: 'cmdty_refined_metals', name: 'Refined Metals', qty: 2 },
  ];
  const result = [];
  for (const item of purchases) {
    const search = page.locator('[data-market-search]');
    await search.fill(item.name);
    const row = page.locator(`[data-cmdty="${item.commodityId}"]`).first();
    await row.waitFor({ state: 'visible' });
    await row.click();
    const qtyInput = page.locator('.sx-trade:visible .sx-qty__in').first();
    await qtyInput.fill(String(item.qty));
    const before = await readCargo(page, item.commodityId);
    const buy = page.locator('.sx-trade:visible [data-go]').first();
    await buy.waitFor({ state: 'visible' });
    await buy.click();
    await page.waitForFunction(({ commodityId, owned, qty }) => (
      Number(window.SF?.state?.player?.cargo?.items?.[commodityId] || 0) >= owned + qty
    ), { commodityId: item.commodityId, owned: before.owned, qty: item.qty });
    const after = await readCargo(page, item.commodityId);
    result.push({ ...item, before, after });
  }
  return result;
}

async function openStationMarket(page) {
  const market = page.getByRole('tab', { name: 'Market', exact: true });
  await market.waitFor({ state: 'visible' });
  await market.click();
  await waitVisible(page, '[data-screen="station"] .sx-mkt', 'station Market');
}

async function readCargo(page, commodityId) {
  return page.evaluate((id) => ({
    owned: Number(window.SF?.state?.player?.cargo?.items?.[id] || 0),
    credits: Number(window.SF?.state?.player?.credits || 0),
  }), commodityId);
}

async function publicUndock(page) {
  const undock = page.locator('[data-screen="station"] .sx-dock button[data-act="undock"]');
  await undock.waitFor({ state: 'visible' });
  await undock.click();
  const confirm = page.locator('[data-pop-launch]');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForFunction(() => window.SF?.state?.ui?.docked !== true, null, { timeout: 20_000 });
  await page.waitForFunction(() => window.SF?.state?.mode === 'flight');
}

async function selectAsteroidOnLocalMap(page, options = {}) {
  await page.keyboard.press('KeyM');
  await waitVisible(page, '#sf-galaxymap', 'unified local map');
  await page.waitForFunction((siteId) => {
    const def = window.SF?.ctx?.screenManager?.getActiveScreenDef?.();
    const state = window.SF?.state;
    return def?.id === 'galaxyMap' && (def._clickTargets || []).some((target) => {
      if (target.kind !== 'asteroid') return false;
      const entity = state?.entities?.get(target.entityId);
      return !siteId || entity?.data?.siteId === siteId;
    });
  }, options.siteId || null, { timeout: 20_000 });
  if (options.siteId) await hideWaypointOverlayForReentry(page);
  const target = await page.evaluate((siteId) => {
    const def = window.SF.ctx.screenManager.getActiveScreenDef();
    const state = window.SF.state;
    const candidates = (def._clickTargets || []).filter((row) => {
      if (row.kind !== 'asteroid') return false;
      const entity = state.entities.get(row.entityId);
      if (!entity || entity.alive === false || entity.data?.respawnAt != null) return false;
      return !siteId || entity.data?.siteId === siteId;
    });
    const player = state.entities.get(state.playerId);
    candidates.sort((a, b) => (
      Math.hypot(a.x - player.pos.x, a.z - player.pos.z)
      - Math.hypot(b.x - player.pos.x, b.z - player.pos.z)
    ));
    const row = candidates[0];
    return row ? {
      targetEntityId: row.entityId,
      label: row.name,
      sx: row.sx,
      sy: row.sy,
      siteId: state.entities.get(row.entityId)?.data?.siteId || null,
    } : null;
  }, options.siteId || null);
  assert(target, `unified local map did not expose ${options.siteId ? `site ${options.siteId}` : 'an asteroid'} dot`);
  const canvas = page.locator('#sf-galaxymap canvas');
  const box = await canvas.boundingBox();
  assert(box, 'unified local map canvas has no pointer box');
  await page.mouse.click(box.x + target.sx, box.y + target.sy);
  await page.waitForFunction((id) => {
    const selected = window.SF?.ctx?.screenManager?.getActiveScreenDef?.()?._selectedTarget;
    return String(selected?.entityId ?? selected?.targetEntityId) === String(id);
  }, target.targetEntityId, { timeout: 10_000 });
  const course = page.locator('#gm-set-course-btn');
  await course.waitFor({ state: 'visible' });
  await course.click();
  await page.waitForFunction((id) => window.SF?.state?.nav?.autopilot?.targetEntityId === id,
    target.targetEntityId, { timeout: 10_000 });
  return target;
}

async function hideWaypointOverlayForReentry(page) {
  // After Continue the active waypoint still marks the pre-reload entity identity at the same
  // screen position and intentionally outranks ambient contacts. Use the shipped lens controls to
  // hide Route + Mission overlays, making the rematerialized asteroid contact pointer-reachable.
  for (const layer of ['route', 'mission']) {
    const button = page.locator(`#sf-galaxymap .gm-layer-btn[data-layer="${layer}"]`);
    await button.waitFor({ state: 'visible' });
    if ((await button.getAttribute('aria-pressed')) === 'true') await button.click();
  }
  await page.waitForFunction(() => {
    const def = window.SF?.ctx?.screenManager?.getActiveScreenDef?.();
    return def?.id === 'galaxyMap'
      && !(def._clickTargets || []).some((target) => target.kind === 'waypoint' || target.objective === true);
  }, null, { timeout: 10_000 });
}

async function waitForAutopilotArrival(page, target) {
  const result = await page.waitForFunction((id) => {
    const state = window.SF?.state;
    const nav = state?.nav?.autopilot;
    const player = state?.entities?.get(state.playerId);
    if (!nav || !player || player.alive === false || Number(player.hull) <= 0) return null;
    if (nav.targetEntityId !== id) return null;
    if (nav.active === false) return {
      status: nav.status || null,
      distance: Number(nav.distance),
      speed: Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0),
    };
    return null;
  }, target.targetEntityId, { timeout: 120_000 });
  const row = await result.jsonValue();
  assert.equal(row.status, 'arrived', `asteroid autopilot ended as ${row.status}`);
  return row;
}

async function enterAsteroidOps(page, targetEntityId) {
  let current = await page.evaluate(() => ({
    active: window.SF?.state?.player?.tether?.active === true,
    targetId: window.SF?.state?.player?.tether?.targetId ?? null,
  }));
  if (current.active && String(current.targetId) !== String(targetEntityId)) {
    await releaseMassline(page);
    current = { active: false, targetId: null };
  }
  if (!(current.active && String(current.targetId) === String(targetEntityId))) {
    const samples = [await readPq024MasslineLatchSnapshot(page, 'before-acquisition', targetEntityId)];
    const acquired = await page.waitForFunction((id) => {
      const state = window.SF?.state;
      const receipt = state?.masslineAcquisition;
      const selected = receipt?.selected;
      return String(selected?.targetId) === String(id)
        && selected?.status === 'ready'
        && Number(receipt?.validUntil) >= Number(state?.simTime)
        ? { id: receipt.id, publishedTick: receipt.publishedTick } : null;
    }, targetEntityId, { timeout: 5_000 }).then(() => true, () => false);
    samples.push(await readPq024MasslineLatchSnapshot(
      page,
      acquired ? 'acquisition-ready' : 'acquisition-timeout',
      targetEntityId,
    ));
    if (!acquired) throw await createPq024MasslineLatchError(page, targetEntityId, samples);

    // The ordinary Massline press consumes the exact route-anchor receipt that was just rendered.
    // Keep the key down until the 60 Hz input owner has consumed its edge; a zero-duration press can
    // deliver both DOM edges between fixed ticks and intermittently produce no gameplay command.
    await page.keyboard.down('Space');
    let latched = false;
    let inputError = null;
    try {
      const heldTickHandle = await page.waitForFunction(() => {
        const state = window.SF?.state;
        return state?.input?.actions?.massline?.source === 'keyboard'
          && state.input.actions.massline.latch === true
          ? Number(state.tick) : null;
      }, null, { timeout: 2_000 });
      const heldTick = await heldTickHandle.jsonValue();
      await page.waitForFunction((tick) => Number(window.SF?.state?.tick) > tick,
        heldTick, { timeout: 2_000 });
      latched = await page.waitForFunction((id) => {
        const tether = window.SF?.state?.player?.tether;
        return tether?.active === true && String(tether.targetId) === String(id);
      }, targetEntityId, { timeout: 5_000 }).then(() => true, () => false);
    } catch (error) {
      inputError = error;
    } finally {
      await page.keyboard.up('Space');
    }
    samples.push(await readPq024MasslineLatchSnapshot(
      page,
      latched ? 'latched' : 'latch-timeout',
      targetEntityId,
    ));
    if (!latched) {
      const error = await createPq024MasslineLatchError(page, targetEntityId, samples);
      if (inputError) error.cause = inputError;
      throw error;
    }
  }
  await page.keyboard.press('KeyB');
  await waitVisible(page, '[data-screen="drill"]', 'Asteroid Ops');
  await page.waitForFunction((id) => window.SF?.state?.drill?.active === true
    && window.SF.state.drill.asteroidId === id, targetEntityId);
}

async function createPq024MasslineLatchError(page, targetEntityId, samples) {
  const events = await page.evaluate(() => (
    Array.isArray(window.__PQ024_H1_TRACE__?.massline)
      ? window.__PQ024_H1_TRACE__.massline.slice(-20)
      : []
  ));
  const error = new Error(formatPq024MasslineLatchTimeout({ targetEntityId, samples, events }));
  error.code = 'PQ024_MASSLINE_LATCH_TIMEOUT';
  error.masslineLatch = { targetEntityId, samples, events };
  return error;
}

async function readPq024MasslineLatchSnapshot(page, label, targetEntityId) {
  return page.evaluate(({ sampleLabel, desiredId }) => {
    const state = window.SF?.state;
    const playerEntity = state?.entities?.get?.(state.playerId);
    const desired = state?.entities?.get?.(desiredId);
    const acquisition = state?.masslineAcquisition;
    const tetherOwner = window.SF?.registry?.get?.('tetherGameplay');
    const clone = (value) => {
      if (!value || typeof value !== 'object') return value ?? null;
      try { return JSON.parse(JSON.stringify(value)); } catch (_) { return { uncloneable: true }; }
    };
    const centerDistance = playerEntity && desired
      ? Math.hypot(desired.pos.x - playerEntity.pos.x, desired.pos.z - playerEntity.pos.z)
      : null;
    return {
      label: sampleLabel,
      tick: Number(state?.tick) || 0,
      simTime: Number(state?.simTime) || 0,
      desired: desired ? {
        id: desired.id,
        type: desired.type || null,
        alive: desired.alive !== false,
        pos: clone(desired.pos),
        radius: Number(desired.radius) || 0,
        centerDistance,
        surfaceDistance: centerDistance == null
          ? null : Math.max(0, centerDistance - Math.max(0, Number(desired.radius) || 0)),
      } : null,
      player: playerEntity ? { pos: clone(playerEntity.pos), targetId: state?.player?.targetId ?? null } : null,
      waypoint: clone(state?.nav?.waypoint),
      autopilot: clone(state?.nav?.autopilot),
      acquisition: clone(acquisition),
      input: {
        tetherMode: state?.input?.tetherMode || null,
        command: clone(state?.input?.actions?.massline),
      },
      tether: clone(state?.player?.tether),
      owner: tetherOwner ? {
        active: clone(tetherOwner._active),
        lastLatchDenial: clone(tetherOwner._lastLatchDenial),
      } : null,
    };
  }, { sampleLabel: label, desiredId: targetEntityId });
}

async function pulseSurveyReveal(page) {
  const button = page.locator('.ao-survey');
  await button.waitFor({ state: 'visible' });
  await button.click();
  await page.waitForFunction(() => {
    const chips = [...document.querySelectorAll('[data-screen="drill"] .ao-chip')];
    return chips.some((chip) => /^Assay\s+\d+\/\d+$/i.test((chip.textContent || '').trim()));
  }, null, { timeout: 10_000 });
  const text = await page.locator('[data-screen="drill"] .ao-chip')
    .filter({ hasText: /^Assay / }).first().innerText();
  const match = text.match(/Assay\s+(\d+)\/(\d+)/i);
  assert(match && Number(match[1]) > 0 && Number(match[2]) >= Number(match[1]),
    `visible survey chip did not reveal geology: ${text}`);
  return { visibleText: text.trim(), revealed: Number(match[1]), cells: Number(match[2]) };
}

async function carveCoreBuildCorridor(page) {
  // Core commitment adopts the current assayed formation atomically. Bore the two-cell dogleg
  // first, then pulse Survey, so the public route leaves one hollow adjacent Core cell and one
  // geology-contacting extractor cell without invalidating the survey after it is recorded.
  await driveOneCell(page, 'ArrowDown', { dc: 0, dr: 1 });
  await driveOneCell(page, 'ArrowRight', { dc: 1, dr: 0 });
}

async function driveOneCell(page, key, delta) {
  const before = await page.evaluate(() => ({ ...window.SF.state.drill.avatar }));
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({ col, row }) => {
      const avatar = window.SF?.state?.drill?.avatar;
      return avatar?.col === col && avatar?.row === row
        && avatar.isDrilling !== true && !avatar.drillTarget;
    }, { col: before.col + delta.dc, row: before.row + delta.dr }, { timeout: 20_000 });
  } finally {
    await page.keyboard.up(key);
  }
}

async function planCorePlacement(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    const owner = window.SF.registry.get('asteroidSites');
    const d = state.drill;
    const offsets = [[0, -1], [-1, 0], [1, 0], [0, 1]];
    for (const [dc, dr] of offsets) {
      const col = d.avatar.col + dc;
      const row = d.avatar.row + dr;
      const check = owner.canInstall({
        asteroidId: d.asteroidId,
        defId: 'sm_massline_core',
        col,
        row,
      });
      if (check.ok) return { from: { ...d.avatar }, to: { col, row } };
    }
    return null;
  }).then((plan) => {
    assert(plan, 'no public cursor-reachable Massline Core placement exists beside the rover');
    return plan;
  });
}

async function planExtractorPlacement(page, core, { fromAvatar = false } = {}) {
  return page.evaluate(({ coreCell, siteId, useAvatar }) => {
    const state = window.SF.state;
    const owner = window.SF.registry.get('asteroidSites');
    const d = state.drill;
    const offsets = [[0, -1], [-1, 0], [1, 0], [0, 1]];
    for (const [dc, dr] of offsets) {
      const col = coreCell.col + dc;
      const row = coreCell.row + dr;
      const check = owner.canInstall({
        asteroidId: d.asteroidId,
        defId: 'sm_extractor',
        col,
        row,
      });
      if (check.ok && Number(check.profile?.solid) > 0) {
        return { from: useAvatar ? { ...d.avatar } : { ...coreCell }, to: { col, row }, siteId };
      }
    }
    return null;
  }, { coreCell: core.cell, siteId: core.siteId, useAvatar: fromAvatar }).then((plan) => {
    assert(plan, 'no powered, geology-contacting extractor placement exists beside the Core');
    return plan;
  });
}

async function placeSiteMachine(page, defId, plan) {
  const palette = page.locator(`[data-item-id="${defId}"]`);
  await palette.waitFor({ state: 'visible' });
  await palette.click();
  await moveBuildCursor(page, plan.from, plan.to);
  const before = await page.evaluate(() => {
    const owner = window.SF.registry.get('asteroidSites');
    const site = owner.siteForAsteroid(window.SF.state.drill.asteroidId);
    return site?.machines?.length || 0;
  });
  await page.keyboard.press('Enter');
  const handle = await page.waitForFunction(({ id, count }) => {
    const state = window.SF?.state;
    const owner = window.SF?.registry?.get('asteroidSites');
    const site = owner?.siteForAsteroid(state?.drill?.asteroidId);
    const machine = site?.machines?.find((row) => row.defId === id);
    return site && site.machines.length > count && machine ? {
      siteId: site.id,
      asteroidId: site.asteroidId ?? state?.drill?.asteroidId ?? null,
      anchored: site.anchored === true,
      lifecycle: site.survey?.lifecycle || null,
      machineId: machine.id,
      cell: { col: machine.col, row: machine.row },
    } : null;
  }, { id: defId, count: before }, { timeout: 10_000 });
  const installed = await handle.jsonValue();
  if (defId === 'sm_massline_core') {
    assert.equal(installed.anchored, true, 'Core DOM placement must anchor the site');
    assert.equal(installed.lifecycle, 'committed', 'Core DOM placement must commit the survey');
  }
  return installed;
}

async function waitForCommittedPresentation(page, core) {
  assert(core?.siteId, 'committed presentation requires the installed Core site id');

  // Enter leaves the public actor in Build mode with the installed Core under the placement cursor.
  // Escape is the shipped Build -> Drive control, which removes the placement ghost without exiting
  // Asteroid Ops and lets the durable site overview own the screenshot.
  await page.keyboard.press('Escape');
  const handle = await page.waitForFunction((siteId) => {
    const normalize = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    const screen = document.querySelector('[data-screen="drill"]');
    const owner = window.SF?.registry?.get?.('asteroidSites');
    const site = owner?.getSite?.(siteId);
    const claimText = normalize(screen?.querySelector('.ao-top-id .ao-chip')?.textContent);
    const assayText = normalize(screen?.querySelector('.ao-bay-command .ao-chip')?.textContent);
    const inspector = screen?.querySelector('.ast-inspector');
    const snapshot = {
      owner: {
        siteId: site?.id ?? null,
        anchored: site?.anchored === true,
        lifecycle: site?.survey?.lifecycle ?? null,
        cells: Array.isArray(site?.survey?.cells) ? site.survey.cells.length : null,
      },
      claimText,
      assayText,
      inspector: {
        kicker: normalize(inspector?.querySelector('.ast-insp-kicker')?.textContent),
        title: normalize(inspector?.querySelector('.ast-insp-title')?.textContent),
        text: normalize(inspector?.textContent),
      },
    };
    const expectedAssay = Number.isInteger(snapshot.owner.cells) && snapshot.owner.cells > 0
      ? `Assay ${snapshot.owner.cells} cells`
      : null;
    return snapshot.owner.siteId === siteId
      && snapshot.owner.anchored
      && snapshot.owner.lifecycle === 'committed'
      && claimText === 'Anchored'
      && assayText === expectedAssay
      && snapshot.inspector.kicker === 'Site overview'
      && snapshot.inspector.title === 'Anchored claim'
      && /Survey record:/i.test(snapshot.inspector.text)
      && /Awaiting first real output/i.test(snapshot.inspector.text)
      && !/A machine already occupies this cell/i.test(snapshot.inspector.text)
      ? snapshot
      : null;
  }, core.siteId, { timeout: 5_000 });
  const snapshot = await handle.jsonValue();
  const assessment = assessPq024CommittedPresentation(snapshot, { expectedSiteId: core.siteId });
  assert.equal(assessment.pass, true,
    `committed presentation did not settle: ${assessment.failures.join('; ')}`);
  return { ...snapshot, assessment };
}

async function moveBuildCursor(page, from, to) {
  const horizontal = to.col - from.col;
  const vertical = to.row - from.row;
  const hKey = horizontal < 0 ? 'ArrowLeft' : 'ArrowRight';
  const vKey = vertical < 0 ? 'ArrowUp' : 'ArrowDown';
  for (let i = 0; i < Math.abs(horizontal); i += 1) await page.keyboard.press(hKey);
  for (let i = 0; i < Math.abs(vertical); i += 1) await page.keyboard.press(vKey);
}

async function exitAsteroidOps(page) {
  const drive = page.getByRole('button', { name: 'Drive', exact: true });
  await drive.click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.SF?.state?.drill == null, null, { timeout: 10_000 });
  await page.waitForFunction(() => window.SF?.state?.mode === 'flight');
}

async function waitForPositiveProduction(page, siteId) {
  const handle = await page.waitForFunction((id) => {
    const events = window.__PQ024_H1_TRACE__?.production || [];
    const event = events.find((row) => row.siteId === id && Number(row.receipt?.positiveQuantity) > 0);
    const owner = window.SF?.registry?.get('asteroidSites');
    const site = owner?.getSite(id);
    if (!event || site?.survey?.lifecycle !== 'producing') return null;
    return {
      siteId: id,
      lifecycle: site.survey.lifecycle,
      receipt: event.receipt,
      eventCount: events.filter((row) => row.siteId === id).length,
    };
  }, siteId, { timeout: 240_000 });
  const row = await handle.jsonValue();
  assert.equal(row.lifecycle, 'producing');
  assert.ok(Number(row.receipt.positiveQuantity) > 0, 'production receipt must contain positive output');
  return row;
}

async function assertExactlyOneExteriorRelay(page, siteId) {
  const handle = await page.waitForFunction((id) => {
    const entities = [...(window.SF?.state?.entities?.values?.() || [])];
    const relays = entities.filter((entity) => (
      entity?.alive !== false
      && entity.data?.siteBeacon === id
      && entity.data?.placeId === 'place_claim_outpost_relay'
    ));
    return relays.length === 1 ? {
      count: relays.length,
      entityId: relays[0].id,
      placeId: relays[0].data.placeId,
      siteId: relays[0].data.siteBeacon,
    } : null;
  }, siteId, { timeout: 20_000 });
  const row = await handle.jsonValue();
  assert.equal(row.count, 1, 'producing site must project exactly one exterior relay');
  return row;
}

async function releaseMassline(page) {
  const active = await page.evaluate(() => window.SF?.state?.player?.tether?.active === true);
  if (!active) return;
  await page.evaluate(() => {
    const events = [];
    const unsubs = [];
    const bus = window.SF?.bus;
    for (const name of ['tether:cut', 'tether:released', 'tether:broke', 'tether:releaseRated']) {
      if (typeof bus?.on === 'function') {
        unsubs.push(bus.on(name, (payload) => events.push({
          name,
          tick: Number(window.SF?.state?.tick) || 0,
          payload: payload && typeof payload === 'object' ? JSON.parse(JSON.stringify(payload)) : payload,
        })));
      }
    }
    window.__PQ024_MASSLINE_RELEASE__ = {
      events,
      cleanup() {
        for (const unsub of unsubs) unsub();
        unsubs.length = 0;
      },
    };
  });
  const samples = [await readPq024MasslineReleaseSnapshot(page, 'before-keydown')];
  await page.keyboard.down('Space');
  try {
    const heldTickHandle = await page.waitForFunction(() => {
      const state = window.SF?.state;
      return state?.input?.actions?.massline?.source === 'keyboard'
        ? Number(state.tick) : null;
    }, null, { timeout: 2_000 });
    const heldTick = await heldTickHandle.jsonValue();
    await page.waitForFunction((tick) => Number(window.SF?.state?.tick) > tick,
      heldTick, { timeout: 2_000 });
    samples.push(await readPq024MasslineReleaseSnapshot(page, 'keydown-received'));
  } finally {
    await page.keyboard.up('Space');
  }
  const released = await page.waitForFunction(() => window.SF?.state?.player?.tether?.active !== true,
    null, { timeout: 5_000 }).then(() => true, () => false);
  samples.push(await readPq024MasslineReleaseSnapshot(page, released ? 'released' : 'release-timeout'));
  const events = await page.evaluate(() => {
    const trace = window.__PQ024_MASSLINE_RELEASE__;
    const rows = Array.isArray(trace?.events) ? trace.events : [];
    trace?.cleanup?.();
    delete window.__PQ024_MASSLINE_RELEASE__;
    return rows;
  });
  if (!released) {
    const error = new Error(formatPq024MasslineReleaseTimeout({ samples, events }));
    error.code = 'PQ024_MASSLINE_RELEASE_TIMEOUT';
    error.masslineRelease = { samples, events };
    throw error;
  }
}

async function readPq024MasslineReleaseSnapshot(page, label) {
  return page.evaluate((sampleLabel) => {
    const state = window.SF?.state;
    const inputOwner = window.SF?.registry?.get?.('input');
    const tetherOwner = window.SF?.registry?.get?.('tetherGameplay');
    const command = state?.input?.actions?.massline;
    const tether = state?.player?.tether;
    const clone = (value) => {
      if (!value || typeof value !== 'object') return value ?? null;
      try { return JSON.parse(JSON.stringify(value)); } catch (_) { return { uncloneable: true }; }
    };
    return {
      label: sampleLabel,
      tick: Number(state?.tick) || 0,
      simTime: Number(state?.simTime) || 0,
      mode: state?.mode || null,
      screenStack: Array.isArray(state?.ui?.screenStack) ? [...state.ui.screenStack] : [],
      spaceHeld: inputOwner?._keys?.Space === true,
      command: command ? {
        phase: command.phase || null,
        latch: command.latch === true,
        cut: command.cut === true,
        lineControl: command.lineControl === true,
        lineLength: Number(command.lineLength) || 0,
        source: command.source || null,
      } : null,
      grammar: clone(inputOwner?._masslineGrammar?.snapshot?.()),
      tether: tether ? {
        active: tether.active === true,
        targetId: tether.targetId ?? null,
        attachmentId: tether.attachmentId ?? null,
        phase: tether.phase || null,
      } : null,
      owner: tetherOwner ? {
        active: clone(tetherOwner._active),
        pendingCut: clone(tetherOwner._pendingCut),
        ignoreReleaseCutUntilReelIdle: tetherOwner._ignoreReleaseCutUntilReelIdle === true,
        latchGraceUntil: Number(tetherOwner._latchGraceUntil) || 0,
        noRelatchUntil: Number(tetherOwner._noRelatchUntil) || 0,
      } : null,
    };
  }, label);
}

async function quickSave(page) {
  const before = await page.evaluate(() => window.__PQ024_H1_TRACE__?.saves?.length || 0);
  await page.keyboard.press('F5');
  const handle = await page.waitForFunction((count) => {
    const saves = window.__PQ024_H1_TRACE__?.saves || [];
    return saves.length > count ? saves.at(-1) : null;
  }, before, { timeout: 30_000 });
  return handle.jsonValue();
}

async function coldContinue(page, rootUrl, siteId, productionReceipt, pageIssueTracker) {
  const navigationToken = pageIssueTracker?.beginExpectedNavigation?.('pq024-cold-continue');
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
  } finally {
    pageIssueTracker?.endExpectedNavigation?.(navigationToken);
  }
  assert.equal(new URL(page.url()).href, new URL(rootUrl).href, 'Continue reload stays on canonical root');
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry),
    null, { timeout: 60_000 });
  await waitVisible(page, '[data-screen="mainMenu"]', 'main menu after reload');
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await button.waitFor({ state: 'visible' });
  await button.click();
  const handle = await page.waitForFunction(({ id, outputId, positiveQuantity }) => {
    const state = window.SF?.state;
    const owner = window.SF?.registry?.get('asteroidSites');
    const site = owner?.getSite(id);
    const entities = [...(state?.entities?.values?.() || [])];
    const relays = entities.filter((entity) => entity?.alive !== false && entity.data?.siteBeacon === id);
    if (state?.mode !== 'flight' || site?.survey?.lifecycle !== 'producing' || relays.length !== 1) return null;
    const receipt = site.survey.receipt;
    return {
      siteId: site.id,
      lifecycle: site.survey.lifecycle,
      outputId: receipt?.outputId || null,
      positiveQuantity: Number(receipt?.positiveQuantity) || 0,
      receiptMatches: receipt?.outputId === outputId
        && Number(receipt?.positiveQuantity) === Number(positiveQuantity),
      relayCount: relays.length,
    };
  }, {
    id: siteId,
    outputId: productionReceipt.outputId,
    positiveQuantity: productionReceipt.positiveQuantity,
  }, { timeout: 120_000 });
  const row = await handle.jsonValue();
  assert.equal(row.receiptMatches, true, 'Continue must restore the same positive production receipt');
  return row;
}

async function reenterAsteroidOps(page, targetEntityId, siteId) {
  await enterAsteroidOps(page, targetEntityId);
  const handle = await page.waitForFunction((id) => {
    const chips = [...document.querySelectorAll('[data-screen="drill"] .ao-chip')]
      .map((chip) => (chip.textContent || '').trim()).filter(Boolean);
    const owner = window.SF?.registry?.get('asteroidSites');
    const site = owner?.getSite(id);
    return site && site.survey && site.survey.lifecycle === 'producing'
      && chips.some((text) => text === 'Producing')
      ? { siteId: id, lifecycle: site.survey.lifecycle, chips } : null;
  }, siteId, { timeout: 20_000 });
  return handle.jsonValue();
}

async function waitVisible(page, selector, label, timeout = 30_000) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout });
  assert.equal(await locator.isVisible(), true, `${label} must be visible`);
  return locator;
}

async function readGpuContract(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas') || document.querySelector('canvas');
    const gl = canvas?.getContext?.('webgl2') || canvas?.getContext?.('webgl');
    if (!gl) return { available: false, vendor: null, renderer: null };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      available: true,
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  });
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
