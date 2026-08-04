#!/usr/bin/env node
// PQ-022 Phase H1 — broker-authorized headed presentation of the required corridor asset leaves.
//
// The visible New Game route is ordinary and fixed-seed. Long travel is compressed through the
// registered world owner because this row judges asset identity, not route completion. The relay is
// created by asteroidSites._ensureBeacon on a live rock. The three civilian hulls use controlled
// traffic-owner fixtures: the harness chooses the role so the one-use cell cannot depend on a random
// ambient mix, while makeShipEntitySpec, traffic durable identity/cargo ownership, partsLibrary whole-
// ship selection, renderer composition, and authored admission remain the shipped production paths.
// No claim about ambient role frequency follows from those fixtures.
//
// H1 is functional/perceptual evidence only. This file records no frame timing, percentile, hitch
// count, renderer.info sample, or performance conclusion. Matched performance remains Phase H3.

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
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  assertCurrentPq022RelayBrowserReceipt,
  normalizePq022RelayReauthorReceipt,
} from './lib/pq022RelayReauthorParity.mjs';
import {
  computeGateDigestsFromManifest,
  readConsumedClaimLedgerEntry,
  requireBrokerClaimOrDiagnostic,
} from './lib/validationBroker.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import corridorManifest, {
  PQ022_CORRIDOR_ASSET_LEAVES_FIXED_SEED,
} from './validation-manifests/pq022-corridor-asset-leaves.mjs';
import relayBrowserManifest from './validation-manifests/pq022-relay-reauthor-browser.mjs';
import relayElectronManifest from './validation-manifests/pq022-relay-reauthor-electron.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ONLY = readEncodedOption('--only');
const RUNTIME = readEncodedOption('--runtime') || 'browser';
assert(ONLY == null || ONLY === 'relay-collar', `unsupported PQ-022 --only selector: ${ONLY}`);
assert(RUNTIME === 'browser' || RUNTIME === 'electron', `unsupported PQ-022 runtime: ${RUNTIME}`);
assert(ONLY === 'relay-collar' || RUNTIME === 'browser', 'Electron is available only for --only=relay-collar');
const RELAY_ONLY = ONLY === 'relay-collar';
const ELECTRON_RUNTIME = RUNTIME === 'electron';
const manifest = RELAY_ONLY
  ? (ELECTRON_RUNTIME ? relayElectronManifest : relayBrowserManifest)
  : corridorManifest;
const ARTIFACT_ROOT = path.resolve(ROOT, manifest.artifactRoot);
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const DIAGNOSTIC = process.argv.includes('--diagnostic');
const FIXED_SEED = Number(process.env.SF_PROBE_SEED) > 0
  ? Number(process.env.SF_PROBE_SEED)
  : manifest.fixedSeed;
assert.equal(PQ022_CORRIDOR_ASSET_LEAVES_FIXED_SEED, 47);
const ADMISSION_TIMEOUT_MS = 180_000;

const ASSETS = Object.freeze([
  Object.freeze({
    key: 'relay-collar', assetId: 'place_claim_outpost_relay', manifestId: 'place_claim_outpost_relay',
    family: 'relay-collar', slot: 'place', releaseFile: 'places/place_claim_outpost_relay.glb',
  }),
  Object.freeze({
    key: 'station-trade-hub', assetId: 'place_station_trade_hub', manifestId: 'place_station_trade_hub',
    family: 'corridor-station-identity', slot: 'place', releaseFile: 'places/place_station_trade_hub.glb',
  }),
  Object.freeze({
    key: 'station-refinery', assetId: 'place_station_refinery', manifestId: 'place_station_refinery',
    family: 'corridor-station-identity', slot: 'place', releaseFile: 'places/place_station_refinery.glb',
  }),
  Object.freeze({
    key: 'station-military', assetId: 'place_station_military', manifestId: 'place_station_military',
    family: 'corridor-station-identity', slot: 'place', releaseFile: 'places/place_station_military.glb',
  }),
  Object.freeze({
    key: 'station-mining', assetId: 'place_station_mining', manifestId: 'place_station_mining',
    family: 'corridor-station-identity', slot: 'place', releaseFile: 'places/place_station_mining.glb',
  }),
  Object.freeze({
    key: 'gate-jump-ring', assetId: 'place_gate_jump_ring', manifestId: 'place_gate_jump_ring',
    family: 'corridor-lane-furniture', slot: 'place', releaseFile: 'places/place_gate_jump_ring.glb',
  }),
  Object.freeze({
    key: 'station-billboard', assetId: 'place_station_billboard', manifestId: 'place_station_billboard',
    family: 'corridor-lane-furniture', slot: 'place', releaseFile: 'places/place_station_billboard.glb',
  }),
  Object.freeze({
    key: 'nav-buoy', assetId: 'place_nav_buoy', manifestId: 'place_nav_buoy',
    family: 'corridor-lane-furniture', slot: 'place', releaseFile: 'places/place_nav_buoy.glb',
  }),
  Object.freeze({
    key: 'traffic-lark', assetId: 'helios_lark', manifestId: 'wholeship_helios_lark',
    family: 'corridor-traffic-bodies', slot: 'hull', releaseFile: 'wholeships/helios_lark.glb', role: 'courier',
  }),
  Object.freeze({
    key: 'traffic-span', assetId: 'helios_span', manifestId: 'wholeship_helios_span',
    family: 'corridor-traffic-bodies', slot: 'hull', releaseFile: 'wholeships/helios_span.glb', role: 'hauler',
  }),
  Object.freeze({
    key: 'traffic-cradle', assetId: 'helios_cradle', manifestId: 'wholeship_helios_cradle',
    family: 'corridor-traffic-bodies', slot: 'hull', releaseFile: 'wholeships/helios_cradle.glb', role: 'miner',
  }),
]);

const SHOT_PLAN = Object.freeze([
  Object.freeze({
    key: 'relay-collar', name: '01-relay-close.png', framing: 'close', lod: 'lod0',
    cameraDistance: 34, cameraHeight: 12,
  }),
  Object.freeze({
    key: 'relay-collar', name: '02-relay-default.png', framing: 'default', lod: 'lod1',
    cameraDistance: 105, cameraHeight: 38,
  }),
  Object.freeze({
    key: 'relay-collar', name: '03-relay-far.png', framing: 'far', lod: 'lod2',
    cameraDistance: 340, cameraHeight: 120,
  }),
  Object.freeze({ key: 'station-trade-hub', name: '04-station-trade-hub.png', framing: 'default', lod: 'lod1' }),
  Object.freeze({ key: 'station-military', name: '05-station-military.png', framing: 'default', lod: 'lod1' }),
  Object.freeze({ key: 'station-refinery', name: '06-station-refinery.png', framing: 'default', lod: 'lod1' }),
  Object.freeze({ key: 'station-mining', name: '07-station-mining.png', framing: 'default', lod: 'lod1' }),
  Object.freeze({ key: 'gate-jump-ring', name: '08-gate-jump-ring.png', framing: 'default', lod: 'lod1' }),
  Object.freeze({ key: 'station-billboard', name: '09-station-billboard.png', framing: 'default', lod: 'lod1' }),
  Object.freeze({ key: 'nav-buoy', name: '10-nav-buoy.png', framing: 'default', lod: 'lod1' }),
  Object.freeze({ key: 'traffic-lark', name: '11-helios-lark-courier.png', framing: 'default', lod: 'lod1' }),
  Object.freeze({ key: 'traffic-span', name: '12-helios-span-hauler.png', framing: 'default', lod: 'lod1' }),
  Object.freeze({ key: 'traffic-cradle', name: '13-helios-cradle-miner.png', framing: 'default', lod: 'lod1' }),
]);

const ACTIVE_ASSETS = RELAY_ONLY ? ASSETS.filter((row) => row.key === 'relay-collar') : ASSETS;
const ACTIVE_SHOT_PLAN = RELAY_ONLY ? SHOT_PLAN.filter((row) => row.key === 'relay-collar') : SHOT_PLAN;
const ASSET_BY_KEY = new Map(ASSETS.map((row) => [row.key, row]));
const FRAME_DISTANCE = Object.freeze({ close: 2.35, default: 3.7, far: 7.4 });

const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest,
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[${manifest.id}] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error(`[${manifest.id}] invoke via: node scripts/validation-broker-cli.mjs --manifest ${manifest.id}`);
  console.error(`[${manifest.id}] or pass --diagnostic for non-promoting local inspection`);
  process.exit(2);
}

await mkdir(ARTIFACT_ROOT, { recursive: true });
const manifestIdentity = await readManifestIdentity();

let server = null;
let browser = null;
let context = null;
let electronApp = null;
let electronChildProcess = null;
let electronLaunch = null;
let electronUrlTracker = null;
let electronProcessMonitor = null;
let page = null;
let issueTracker = null;
let rootUrl = null;
let browserReport = null;
let phase = 'boot';
let report = null;
const captures = [];
const runtimeSubjects = new Map();
const compressions = [];
let relayPlacement = null;
let trafficFixtures = null;
let gpu = null;
let recordedSeed = null;

try {
  if (ELECTRON_RUNTIME) {
    phase = 'browser-receipt-prerequisite';
    const browserReportPath = path.resolve(ROOT, relayBrowserManifest.artifactRoot, 'report.json');
    browserReport = JSON.parse(await readFile(browserReportPath, 'utf8'));
    const browserDigests = await computeGateDigestsFromManifest({
      root: ROOT,
      manifest: relayBrowserManifest,
    });
    const browserClaimId = browserReport?.broker?.claimId;
    const consumedBrowserClaim = typeof browserClaimId === 'string' && browserClaimId.length > 0
      ? await readConsumedClaimLedgerEntry(
        path.resolve(ROOT, relayBrowserManifest.artifactRoot),
        browserClaimId,
      )
      : null;
    assertCurrentPq022RelayBrowserReceipt({
      receipt: browserReport,
      digests: browserDigests,
      consumedClaim: consumedBrowserClaim,
    });

    const { _electron: electron } = await loadPlaywright();
    electronLaunch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'pq022-relay-reauthor' });
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
    assert(executablePath, 'headed Chrome or Edge is required for PQ-022 acceptance');
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
    context = await browser.newContext({
      viewport: VIEWPORT,
      screen: VIEWPORT,
      deviceScaleFactor: 1,
      locale: 'en-US',
      colorScheme: 'dark',
      reducedMotion: 'no-preference',
    });
    page = await context.newPage();
  }
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  issueTracker = collectPageIssues(page, { includeWarnings: false });

  phase = 'seeded-new-game';
  recordedSeed = await bootSeededFlight(page, rootUrl, { navigateInitialRoot: !ELECTRON_RUNTIME });
  assert.equal(recordedSeed, FIXED_SEED, 'New Game must consume the broker seed');

  phase = 'gpu-contract';
  gpu = await readGpuContract(page);
  assert.equal(gpu.available, true, 'PQ-022 acceptance requires WebGL');
  assert.doesNotMatch(gpu.renderer || '', /SwiftShader|llvmpipe|software/i,
    `PQ-022 acceptance requires a real GPU path, got ${gpu.renderer}`);

  phase = 'helios-live-subjects';
  await enterSector(page, 'sector_helios_prime');
  if (!RELAY_ONLY) {
    runtimeSubjects.set('station-trade-hub', await locateSubject(page, {
      type: 'station', stationId: 'station_helios', archetypeGlb: 'place_station_trade_hub',
    }));
    runtimeSubjects.set('station-military', await locateSubject(page, {
      type: 'station', stationId: 'station_coalition', archetypeGlb: 'place_station_military',
    }));
    runtimeSubjects.set('gate-jump-ring', await locateSubject(page, {
      type: 'station', isGate: true, archetypeGlb: 'place_gate_jump_ring',
    }));
    runtimeSubjects.set('station-billboard', await locateSubject(page, {
      type: 'fx', poiId: 'poi_memorial', placeId: 'place_station_billboard',
    }));
  }

  phase = 'relay-owner-placement';
  relayPlacement = await createRelayOnLiveRock(page);
  assert.ok(!relayPlacement.error, `relay placement failed: ${relayPlacement.error}`);
  assert.equal(relayPlacement.placeId, 'place_claim_outpost_relay');
  runtimeSubjects.set('relay-collar', relayPlacement.relayId);
  compressions.push({
    kind: 'owner-fixture',
    subject: 'relay-collar',
    detail: 'asteroidSites._ensureBeacon placed the shipped relay on a live Helios asteroid; no fixture renderer or entity shape',
  });

  if (!RELAY_ONLY) {
    phase = 'traffic-owner-fixtures';
    trafficFixtures = await createTrafficOwnerFixtures(page);
    for (const row of ASSETS.filter((asset) => asset.role)) {
      const fixture = trafficFixtures[row.role];
      assert.ok(fixture, `missing controlled traffic fixture for ${row.role}`);
      assert.equal(fixture.visual.file, row.releaseFile, `${row.role} whole-ship file`);
      runtimeSubjects.set(row.key, fixture.entityId);
    }
    compressions.push({
      kind: 'owner-fixture',
      subject: 'corridor-traffic-bodies',
      detail: 'the harness selected courier/hauler/miner roles deterministically; makeShipEntitySpec, traffic durable identity and cargo manifest, partsLibrary whole-ship selection, renderer composition, and authored admission stayed production-owned',
      distributionClaim: false,
    });
  }

  phase = 'helios-captures';
  for (const shot of ACTIVE_SHOT_PLAN.filter((row) => [
    'relay-collar', 'station-trade-hub', 'station-military', 'gate-jump-ring',
    'station-billboard', 'traffic-lark', 'traffic-span', 'traffic-cradle',
  ].includes(row.key))) {
    captures.push(await captureSubject(page, shot, runtimeSubjects.get(shot.key)));
  }

  if (!RELAY_ONLY) {
    phase = 'ceres-live-subjects';
    await enterSector(page, 'sector_ceres_belt');
    compressions.push({
      kind: 'travel',
      subject: 'corridor-station-identity',
      detail: 'called the registered world.enterSector(sector_ceres_belt) owner instead of flying the route; this row is presentation evidence, not route-completion evidence',
    });
    runtimeSubjects.set('station-refinery', await locateSubject(page, {
      type: 'station', stationId: 'station_ceres', archetypeGlb: 'place_station_refinery',
    }));
    runtimeSubjects.set('station-mining', await locateSubject(page, {
      type: 'station', stationId: 'station_beltout', archetypeGlb: 'place_station_mining',
    }));
    for (const key of ['station-refinery', 'station-mining']) {
      const shot = SHOT_PLAN.find((row) => row.key === key);
      captures.push(await captureSubject(page, shot, runtimeSubjects.get(key)));
    }

    phase = 'tethys-live-subject';
    await enterSector(page, 'sector_tethys_junction');
    compressions.push({
      kind: 'travel',
      subject: 'corridor-lane-furniture',
      detail: 'called the registered world.enterSector(sector_tethys_junction) owner instead of flying the route; the nav buoy remains the live poi_blackmkt place entity',
    });
    runtimeSubjects.set('nav-buoy', await locateSubject(page, {
      type: 'fx', poiId: 'poi_blackmkt', placeId: 'place_nav_buoy',
    }));
    captures.push(await captureSubject(
      page,
      SHOT_PLAN.find((row) => row.key === 'nav-buoy'),
      runtimeSubjects.get('nav-buoy'),
    ));
  }

  phase = 'receipt-validation';
  const shotOrder = new Map(ACTIVE_SHOT_PLAN.map((row, index) => [row.name, index]));
  captures.sort((a, b) => shotOrder.get(path.basename(a.file)) - shotOrder.get(path.basename(b.file)));
  const capturedKeys = new Set(captures.map((row) => row.subjectKey));
  assert.deepEqual([...capturedKeys].sort(), ACTIVE_ASSETS.map((row) => row.key).sort(),
    RELAY_ONLY ? 'the relay-only cell must evidence exactly the relay identity'
      : 'the one Browser cell must evidence all eleven exact identities');
  assert.equal(captures.length, ACTIVE_SHOT_PLAN.length,
    RELAY_ONLY ? 'the relay-only cell must write exactly three prescribed stills'
      : 'the row must write the declared thirteen stills');
  const pageIssues = summarizeIssues(issueTracker.errorIssues());
  assert.deepEqual(pageIssues, [], 'the PQ-022 headed route must not emit Browser runtime errors');

  report = {
    schema: RELAY_ONLY
      ? 'spaceface.pq022-relay-reauthor-h1.v1'
      : 'spaceface.pq022-corridor-asset-leaves-h1.v1',
    row: 7,
    disposition: 'PASS',
    runtime: ELECTRON_RUNTIME ? 'electron' : 'browser-chromium-headed',
    brokerManifestId: manifest.id,
    broker: brokerEvidence(brokerGate),
    selector: ONLY,
    fixedSeed: FIXED_SEED,
    recordedSeed,
    viewport: VIEWPORT,
    gpu,
    routeContract: RELAY_ONLY
      ? 'visible fixed-seed New Game -> asteroidSites relay owner -> close/default/far game-camera stills'
      : 'visible fixed-seed New Game -> production owners -> controlled game-camera stills',
    compressions,
    relayPlacement,
    trafficFixtures,
    manifestIdentity,
    captures,
    uniqueAssetCount: capturedKeys.size,
    screenshotCount: captures.length,
    pageIssues,
    informational_contended: true,
    informational_contended_note:
      'Phase H1 ran contended by design. This receipt contains identity, admission, visibility, and still-image facts only; no time-valued field is performance evidence.',
    noPerformanceEvidence: true,
    noPerformanceEvidenceNote: 'Matched performance remains Phase H3.',
  };
  if (ELECTRON_RUNTIME) {
    const normalizedBrowser = normalizePq022RelayReauthorReceipt(browserReport);
    const normalizedElectron = normalizePq022RelayReauthorReceipt(report);
    assert.deepEqual(normalizedElectron, normalizedBrowser,
      'PQ-022 relay Electron identity/admission/placement must match the accepted Browser cell');
    report.browserComparison = {
      pass: true,
      comparedAgainst: repoRel(path.resolve(ROOT, relayBrowserManifest.artifactRoot, 'report.json')),
      normalizedBrowser,
      normalizedElectron,
    };
  }
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({
      path: path.join(ARTIFACT_ROOT, 'failure-row7.png'),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
  }
  report = {
    schema: RELAY_ONLY
      ? 'spaceface.pq022-relay-reauthor-h1.v1'
      : 'spaceface.pq022-corridor-asset-leaves-h1.v1',
    row: 7,
    disposition: 'FAIL',
    failureClass: 'UNCLASSIFIED_BY_PROBE',
    phase,
    problems: [error?.message || String(error)],
    stack: error?.stack || null,
    runtime: ELECTRON_RUNTIME ? 'electron' : 'browser-chromium-headed',
    brokerManifestId: manifest.id,
    broker: brokerEvidence(brokerGate),
    selector: ONLY,
    fixedSeed: FIXED_SEED,
    recordedSeed,
    viewport: VIEWPORT,
    gpu,
    compressions,
    relayPlacement,
    trafficFixtures,
    manifestIdentity,
    captures,
    pageIssues: issueTracker ? summarizeIssues(issueTracker.errorIssues()) : [],
    failureSnapshot: await readFailureSnapshot(page),
    informational_contended: true,
    informational_contended_note:
      'Phase H1 ran contended by design. Any broker timeout or process duration is a harness control/diagnostic, not performance evidence.',
    noPerformanceEvidence: true,
    noPerformanceEvidenceNote: 'Matched performance remains Phase H3.',
  };
} finally {
  if (ELECTRON_RUNTIME) {
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
    if (cleanup?.pass === true) {
      report.ownedRuntimeClosed = true;
      try { electronLaunch?.cleanup({ runtimeClosed: true }); }
      catch (error) {
        report.disposition = 'FAIL';
        report.problems ||= [];
        report.problems.push(`isolated profile cleanup failed: ${error?.message || String(error)}`);
      }
    } else {
      report.disposition = 'FAIL';
      report.ownedRuntimeClosed = false;
      report.problems ||= [];
      report.problems.push(`owned Electron cleanup failed: ${(cleanup?.failures || []).join('; ')}`);
    }
  } else {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
  }
}

await writeFile(path.join(ARTIFACT_ROOT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (report.disposition !== 'PASS') {
  console.error(`[${manifest.id}] FAIL in ${report.phase || 'route contract'}`);
  for (const problem of report.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(RELAY_ONLY
  ? `[${manifest.id}] PASS — relay identity, admission, placement, and three prescribed stills`
  : '[pq022-corridor-asset-leaves] PASS — eleven exact identities, thirteen headed stills');
console.log(`  receipt: ${repoRel(path.join(ARTIFACT_ROOT, 'report.json'))}`);

async function bootSeededFlight(targetPage, rootUrl, { navigateInitialRoot = true } = {}) {
  if (navigateInitialRoot) {
    await targetPage.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  }
  const url = new URL(targetPage.url());
  assert.equal(url.search, '', 'PQ-022 route must use the canonical root with no query flags');
  assert.equal(url.hash, '', 'PQ-022 route must use the canonical root with no hash flags');
  await targetPage.bringToFront().catch(() => {});
  await targetPage.waitForFunction(() => !!(
    window.SF?.state && window.SF?.bus && window.SF?.registry && window.SF?.helpers
  ), null, { timeout: 60_000 });
  const splash = targetPage.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await targetPage.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }
  await targetPage.locator('[data-screen="mainMenu"]:visible').waitFor({ timeout: 30_000 });
  await targetPage.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 20_000 });
  await targetPage.locator('[data-screen="newGame"]:visible').waitFor({ timeout: 20_000 });
  await targetPage.fill('#sf-ng-seed', String(FIXED_SEED));
  await targetPage.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 20_000 });
  await targetPage.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return !!(state?.mode === 'flight' && player && player.alive !== false && Number(player.hull) > 0);
  }, null, { timeout: 150_000 });
  const begin = targetPage.getByRole('button', { name: /^Begin$/i }).first();
  if (await begin.isVisible().catch(() => false)) await begin.click({ timeout: 10_000 });
  await targetPage.evaluate(() => {
    const sf = window.SF;
    if (sf.state.onboarding) {
      sf.state.onboarding.active = false;
      sf.state.onboarding.finished = true;
    }
    sf.bus.emit('ui:closeAll', {});
    sf.bus.emit('voice:clear', {});
  });
  await targetPage.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight'
      && player?.presentationAdmission === 'ready'
      && String(player?.mesh?.userData?.authoredAssetState || '').startsWith('authored');
  }, null, { timeout: ADMISSION_TIMEOUT_MS });
  return targetPage.evaluate(() => window.SF.state.meta?.seed ?? null);
}

async function readGpuContract(targetPage) {
  return targetPage.evaluate(() => {
    const gl = window.SF?.state?.render?.renderer?.getContext?.();
    if (!gl) return { available: false, vendor: null, renderer: null };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      available: true,
      vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
      renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
    };
  });
}

async function enterSector(targetPage, sectorId) {
  await targetPage.evaluate((wantedSectorId) => {
    const sf = window.SF;
    const state = sf.state;
    const world = sf.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') throw new Error('registered world.enterSector unavailable');
    const fromSectorId = state.world.currentSectorId;
    if (fromSectorId !== wantedSectorId) {
      world.enterSector(wantedSectorId, { placePlayer: true, fromSectorId, via: 'pq022-h1-presentation' });
    }
    sf.bus.emit('ui:closeAll', {});
  }, sectorId);
  await targetPage.waitForFunction((wantedSectorId) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight'
      && state?.world?.currentSectorId === wantedSectorId
      && player && player.alive !== false;
  }, sectorId, { timeout: 60_000 });
}

async function createRelayOnLiveRock(targetPage) {
  return targetPage.evaluate(async () => {
    const { asteroidSites, makeSiteRecord } = await import('/src/systems/asteroidSites.js');
    const state = window.SF.state;
    const sectorId = state.world.currentSectorId;
    const rock = state.entityList.find((entity) => entity?.type === 'asteroid'
      && entity.alive !== false
      && (entity.homeSectorId || entity.data?.homeSectorId || entity.data?.sectorId) === sectorId);
    if (!rock) return { error: `no live asteroid in ${sectorId}` };
    if (!asteroidSites.ctx) return { error: 'asteroidSites is not initialized on the live route' };
    const site = makeSiteRecord({
      id: 'site_pq022_h1_relay_collar',
      asteroidId: rock.id,
      sectorId: state.world.currentSectorId,
      fieldId: rock.data?.fieldId || 'field_1',
      createdT: state.simTime,
    });
    site.anchored = true;
    asteroidSites._ensureBeacon(site);
    const relay = state.entityList.find((entity) => entity?.data?.siteBeacon === site.id);
    if (!relay) return { error: 'asteroidSites._ensureBeacon spawned no relay' };
    return {
      relayId: relay.id,
      rockId: rock.id,
      rockRadius: rock.radius,
      sectorId: state.world.currentSectorId,
      placeId: relay.data?.placeId || null,
      placeScale: relay.data?.placeScale ?? null,
      worldDressing: relay.data?.worldDressing === true,
      collides: relay.collides === true,
      contactRingDistance: Math.hypot(relay.pos.x - rock.pos.x, relay.pos.z - rock.pos.z),
    };
  });
}

async function createTrafficOwnerFixtures(targetPage) {
  return targetPage.evaluate(async () => {
    const { makeShipEntitySpec } = await import('/src/systems/ships.js');
    const { wholeShipVisualForEntity } = await import('/src/render/partsLibrary.js');
    const sf = window.SF;
    const state = sf.state;
    const owner = sf.registry.get('traffic');
    if (!owner || typeof owner._stampTrafficDurableIdentity !== 'function'
      || typeof owner._assignManifest !== 'function') {
      throw new Error('registered traffic owner lacks its production identity/manifest seams');
    }
    const stations = owner._sectorStations();
    const anchor = stations.find((station) => station.data?.stationId === 'station_helios') || stations[0];
    if (!anchor) throw new Error('Helios has no station for controlled traffic owner fixtures');
    const defs = {
      courier: { ship: 'ship_kestrel', team: 2, archetype: 'fleeing_trader', label: 'Courier' },
      hauler: { ship: 'ship_mule', team: 2, archetype: 'fleeing_trader', label: 'Cargo Hauler' },
      miner: { ship: 'ship_pelican', team: 2, archetype: 'fleeing_trader', label: 'Mining Barge' },
    };
    const expected = {
      courier: { file: 'wholeships/helios_lark.glb', assetId: 'SF_WHOLESHIP_HELIOS_LARK' },
      hauler: { file: 'wholeships/helios_span.glb', assetId: 'SF_WHOLESHIP_HELIOS_SPAN' },
      miner: { file: 'wholeships/helios_cradle.glb', assetId: 'SF_WHOLESHIP_HELIOS_CRADLE' },
    };
    const out = {};
    let index = 0;
    for (const role of ['courier', 'hauler', 'miner']) {
      const def = defs[role];
      const angle = -0.72 + index * 0.72;
      const distance = 150 + index * 32;
      const pos = {
        x: anchor.pos.x + Math.cos(angle) * distance,
        z: anchor.pos.z + Math.sin(angle) * distance,
      };
      const spec = makeShipEntitySpec(def.ship, {
        team: def.team,
        factionId: anchor.factionId || 'faction_scn',
        pos,
        ai: { archetype: def.archetype, passive: true, spawnContext: 'convoy_civilian' },
      });
      const entity = sf.helpers.spawnEntity(spec);
      if (!entity) throw new Error(`traffic owner fixture failed to spawn ${role}`);
      owner._stampTrafficDurableIdentity(entity, state.world.currentSectorId, role, def, 900 + index);
      const target = owner._pickStation(stations);
      const cargoManifest = owner._assignManifest(entity, role, target, state.world.currentSectorId);
      owner._active.push(entity.id);
      state.traffic.freighters.push({
        id: entity.id,
        role,
        targetId: target.id,
        waitT: 600,
        nextTradeT: 600,
        orbitPhase: 0,
        dockSeq: 0,
        manifest: cargoManifest,
      });
      const visual = wholeShipVisualForEntity(entity);
      if (!visual || visual.file !== expected[role].file || visual.assetId !== expected[role].assetId) {
        throw new Error(`${role} production whole-ship selection mismatch: ${JSON.stringify(visual)}`);
      }
      out[role] = {
        entityId: entity.id,
        defId: entity.data?.defId || null,
        trafficRole: entity.data?.trafficRole || null,
        trafficLabel: entity.data?.trafficLabel || null,
        worldRecordId: entity.data?.worldRecordId || null,
        cargoManifestId: cargoManifest?.id || cargoManifest?.manifestId || null,
        visual,
        fixtureKind: 'controlled-role-draw-through-traffic-owner',
      };
      index += 1;
    }
    return out;
  });
}

async function locateSubject(targetPage, query) {
  const handle = await targetPage.waitForFunction((wanted) => {
    const state = window.SF?.state;
    const render = window.SF?.registry?.get?.('render');
    render?.reconcileMeshes?.();
    const entity = (state?.entityList || []).find((candidate) => {
      if (!candidate || candidate.alive === false) return false;
      if (wanted.type && candidate.type !== wanted.type) return false;
      const data = candidate.data || {};
      if (wanted.stationId && data.stationId !== wanted.stationId) return false;
      if (wanted.archetypeGlb && data.archetypeGlb !== wanted.archetypeGlb) return false;
      if (wanted.placeId && data.placeId !== wanted.placeId) return false;
      if (wanted.poiId && data.poiId !== wanted.poiId) return false;
      if (wanted.isGate != null && (data.isGate === true) !== wanted.isGate) return false;
      return true;
    });
    return entity?.mesh ? entity.id : false;
  }, query, { timeout: 60_000 });
  return handle.jsonValue();
}

async function captureSubject(targetPage, shot, subjectId) {
  const asset = ASSET_BY_KEY.get(shot.key);
  assert(asset, `unknown capture subject ${shot.key}`);
  assert(subjectId != null, `missing runtime entity id for ${shot.key}`);

  await primeSubjectAdmission(targetPage, subjectId);
  await targetPage.waitForFunction(({ id, releaseFile }) => {
    const entity = window.SF?.state?.entities?.get(id);
    const data = entity?.mesh?.userData || {};
    const urls = Object.values(data.authoredSlots || {}).flat().map(String);
    return entity?.presentationAdmission === 'ready'
      && data.authoredAssetState === 'authored'
      && data.authoredReadableFallbackRetained === false
      && urls.some((url) => url.endsWith(releaseFile));
  }, { id: subjectId, releaseFile: asset.releaseFile }, { timeout: ADMISSION_TIMEOUT_MS });

  const frame = await targetPage.evaluate(({
    id, framing, lod, distanceFactor, explicitDistance, explicitHeight,
  }) => {
    const state = window.SF.state;
    const entity = state.entities.get(id);
    const root = entity?.mesh || entity?.view?.root || null;
    const render = state.render;
    if (!entity || !root || !render?.camera || !render?.renderer || !render?.scene) {
      return { error: 'subject-or-renderer-unavailable' };
    }
    root.traverse((object) => {
      if (object) object.frustumCulled = false;
      if (typeof object?.userData?.updateLod === 'function') object.userData.updateLod(lod);
    });
    root.updateWorldMatrix(true, true);

    const THREE = window.SF.THREE;
    const visibleBox = new THREE.Box3();
    let visibleMeshes = 0;
    const materialNames = new Set();
    const textureRoles = new Set();
    root.traverse((object) => {
      if (!object?.isMesh) return;
      let visible = true;
      for (let cursor = object; cursor; cursor = cursor.parent) {
        if (cursor.visible === false) { visible = false; break; }
        if (cursor === root) break;
      }
      if (!visible) return;
      visibleMeshes += 1;
      visibleBox.expandByObject(object);
      for (const material of [].concat(object.material || [])) {
        if (!material) continue;
        materialNames.add(material.name || material.type || 'unnamed');
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
          if (material[key]) textureRoles.add(key);
        }
      }
    });
    if (visibleBox.isEmpty()) visibleBox.setFromObject(root);
    const size = visibleBox.getSize(new THREE.Vector3());
    const center = visibleBox.getCenter(new THREE.Vector3());
    const radius = Math.max(3, size.length() * 0.5);
    const distance = Number.isFinite(explicitDistance)
      ? explicitDistance
      : Math.max(18, radius * distanceFactor);
    const height = Number.isFinite(explicitHeight)
      ? explicitHeight
      : Math.max(3, radius * 0.42);
    const camera = render.camera;
    camera.position.set(
      center.x + distance * 0.72,
      center.y + height,
      center.z + distance * 0.58,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(center);
    camera.near = 0.1;
    camera.far = Math.max(camera.far || 0, distance * 12, 8000);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    if (typeof render.warmPostProcess === 'function') render.warmPostProcess();
    else render.renderer.render(render.scene, camera);
    const dataUrl = render.renderer.domElement.toDataURL('image/png');
    const ndc = center.clone().project(camera);
    const slots = Object.fromEntries(Object.entries(root.userData?.authoredSlots || {})
      .map(([slot, urls]) => [slot, [].concat(urls || []).map(String)]));
    return {
      dataUrl,
      framing,
      requestedLod: lod,
      mode: state.mode,
      sectorId: state.world?.currentSectorId || null,
      entityId: entity.id,
      entityType: entity.type,
      runtimeIdentity: {
        stationId: entity.data?.stationId || null,
        archetypeGlb: entity.data?.archetypeGlb || null,
        placeId: entity.data?.placeId || null,
        poiId: entity.data?.poiId || null,
        isGate: entity.data?.isGate === true,
        trafficRole: entity.data?.trafficRole || null,
        defId: entity.data?.defId || null,
        worldRecordId: entity.data?.worldRecordId || null,
      },
      presentationAdmission: entity.presentationAdmission ?? null,
      authoredAssetState: root.userData?.authoredAssetState ?? null,
      authoredAssetMode: root.userData?.authoredAssetMode ?? null,
      authoredVisualRoot: root.userData?.authoredVisualRoot ?? null,
      authoredReadableFallbackRetained: root.userData?.authoredReadableFallbackRetained ?? null,
      authoredCompositionId: root.userData?.authoredCompositionId ?? null,
      authoredSlots: slots,
      visibleMeshes,
      materialNames: [...materialNames].sort(),
      textureRoles: [...textureRoles].sort(),
      visibleSizeM: [size.x, size.y, size.z],
      cameraDistance: camera.position.distanceTo(center),
      centerNdc: { x: ndc.x, y: ndc.y, z: ndc.z },
      centerOnScreen: Math.abs(ndc.x) <= 0.94 && Math.abs(ndc.y) <= 0.94 && ndc.z >= -1 && ndc.z <= 1,
    };
  }, {
    id: subjectId,
    framing: shot.framing,
    lod: shot.lod,
    distanceFactor: FRAME_DISTANCE[shot.framing],
    explicitDistance: shot.cameraDistance ?? null,
    explicitHeight: shot.cameraHeight ?? null,
  });

  assert.ok(!frame.error, `${shot.key}/${shot.framing}: ${frame.error}`);
  assert.match(frame.dataUrl, /^data:image\/png;base64,/);
  assert.equal(frame.presentationAdmission, 'ready', `${shot.key} must be admitted`);
  assert.equal(frame.authoredAssetState, 'authored', `${shot.key} must use the authored visual`);
  assert.equal(frame.authoredAssetMode, 'release', `${shot.key} must use release assets`);
  assert.equal(frame.authoredReadableFallbackRetained, false, `${shot.key} must retain no fallback substrate`);
  assert.ok(frame.visibleMeshes > 0, `${shot.key} must present visible authored geometry`);
  assert.equal(frame.centerOnScreen, true, `${shot.key} must be in the controlled game-camera frame`);
  assert.ok((frame.authoredSlots[asset.slot] || []).some((url) => url.endsWith(asset.releaseFile)),
    `${shot.key} must bind ${asset.releaseFile} in authoredSlots.${asset.slot}`);

  const file = path.join(ARTIFACT_ROOT, shot.name);
  const bytes = Buffer.from(frame.dataUrl.slice(frame.dataUrl.indexOf(',') + 1), 'base64');
  await writeFile(file, bytes);
  const info = await stat(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${shot.name} must be a real PNG`);
  delete frame.dataUrl;
  return {
    subjectKey: shot.key,
    assetId: asset.assetId,
    manifestId: asset.manifestId,
    family: asset.family,
    file: repoRel(file),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...frame,
  };
}

async function primeSubjectAdmission(targetPage, subjectId) {
  await targetPage.evaluate((id) => {
    const sf = window.SF;
    const state = sf.state;
    const entity = state.entities.get(id);
    const player = state.entities.get(state.playerId);
    if (!entity || !player) throw new Error(`subject/player unavailable for authored admission: ${id}`);
    const offset = Math.max(28, Number(entity.radius) * 1.5 || 0);
    const x = entity.pos.x + offset;
    const z = entity.pos.z + offset * 0.72;
    if (player.pos?.set) player.pos.set(x, 0, z);
    else { player.pos.x = x; player.pos.z = z; }
    player.prevPos?.copy?.(player.pos);
    player.vel?.set?.(0, 0, 0);
    player.flags = { ...(player.flags || {}), noInterp: true };
    state.player.targetId = entity.id;
    state.render?.cameraCtrl?.snapToPlayer?.();
    const renderSystem = sf.registry.get('render');
    renderSystem?.reconcileMeshes?.();
    const root = entity.mesh || entity.view?.root;
    root?.traverse?.((object) => { if (object) object.frustumCulled = false; });
    const request = root?.userData?.requestAuthoredUpgrade;
    if (typeof request === 'function') request(state.render.renderer, state.render.scene);
    if (typeof state.render?.warmPostProcess === 'function') state.render.warmPostProcess();
    else state.render?.renderer?.render?.(state.render.scene, state.render.camera);
  }, subjectId);
}

async function readManifestIdentity() {
  const [partsRaw, releaseRaw] = await Promise.all([
    readFile(path.join(ROOT, 'assets', 'ships', 'parts', 'parts_manifest.json'), 'utf8'),
    readFile(path.join(ROOT, 'assets', 'ships', 'release', 'release_manifest.json'), 'utf8'),
  ]);
  const parts = JSON.parse(partsRaw);
  const release = JSON.parse(releaseRaw);
  const sourceById = new Map(parts.parts.map((row) => [row.id, row]));
  const releaseById = new Map(release.assets.map((row) => [row.id, row]));
  return ACTIVE_ASSETS.map((asset) => {
    const sourceRow = sourceById.get(asset.manifestId);
    const releaseRow = releaseById.get(asset.manifestId);
    assert(sourceRow, `source manifest row missing: ${asset.manifestId}`);
    assert(releaseRow, `release manifest row missing: ${asset.manifestId}`);
    assert.equal(releaseRow.release.replace(/\\/g, '/').endsWith(asset.releaseFile), true,
      `${asset.manifestId} release path must end in ${asset.releaseFile}`);
    return {
      key: asset.key,
      assetId: asset.assetId,
      manifestId: asset.manifestId,
      family: asset.family,
      source: releaseRow.source,
      release: releaseRow.release,
      sourceSha256: releaseRow.sourceSha256,
      releaseSha256: releaseRow.releaseSha256,
      sourceBytes: releaseRow.sourceBytes,
      releaseBytes: releaseRow.releaseBytes,
      sourceManifestFile: sourceRow.file,
    };
  });
}

async function readFailureSnapshot(targetPage) {
  if (!targetPage || targetPage.isClosed()) return { pageAvailable: false };
  try {
    return await targetPage.evaluate(() => {
      const state = window.SF?.state;
      if (!state) return { pageAvailable: true, stateAvailable: false };
      const wantedPlaces = new Set([
        'place_claim_outpost_relay', 'place_station_trade_hub', 'place_station_refinery',
        'place_station_military', 'place_station_mining', 'place_gate_jump_ring',
        'place_station_billboard', 'place_nav_buoy',
      ]);
      const subjects = (state.entityList || []).filter((entity) => {
        const data = entity?.data || {};
        return wantedPlaces.has(data.placeId) || wantedPlaces.has(data.archetypeGlb)
          || ['courier', 'hauler', 'miner'].includes(data.trafficRole);
      }).map((entity) => ({
        id: entity.id,
        type: entity.type,
        stationId: entity.data?.stationId || null,
        placeId: entity.data?.placeId || null,
        archetypeGlb: entity.data?.archetypeGlb || null,
        trafficRole: entity.data?.trafficRole || null,
        presentationAdmission: entity.presentationAdmission ?? null,
        authoredAssetState: entity.mesh?.userData?.authoredAssetState ?? null,
        authoredSlots: entity.mesh?.userData?.authoredSlots ?? null,
      }));
      return {
        pageAvailable: true,
        stateAvailable: true,
        mode: state.mode || null,
        seed: state.meta?.seed ?? null,
        sectorId: state.world?.currentSectorId || null,
        subjectCount: subjects.length,
        subjects,
      };
    });
  } catch (error) {
    return { pageAvailable: true, stateAvailable: false, readError: error?.message || String(error) };
  }
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

function repoRel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function brokerEvidence(gate) {
  const claim = gate?.claim || null;
  return {
    reason: gate?.reason ?? null,
    diagnostic: gate?.diagnostic === true,
    primaryAcceptance: gate?.primaryAcceptance === true,
    claimId: claim?.claimId ?? null,
    mode: claim?.mode ?? null,
    runtimeKind: claim?.runtimeKind ?? null,
    candidateDigest: claim?.digests?.candidateDigest ?? claim?.receipt?.candidateDigest ?? null,
    manifestDigest: claim?.digests?.manifestDigest ?? null,
    inputDigest: claim?.digests?.inputDigest ?? null,
  };
}

function readEncodedOption(name) {
  const args = process.argv.slice(2);
  assert(!args.includes(name), `${name} must use the encoded ${name}=value form`);
  const matches = args.filter((arg) => arg.startsWith(`${name}=`));
  assert(matches.length <= 1, `${name} may be supplied only once`);
  return matches.length === 1 ? matches[0].slice(name.length + 1) : null;
}
